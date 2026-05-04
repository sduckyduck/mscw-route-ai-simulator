import * as tf from '@tensorflow/tfjs';
import { runBuildExperiments, type BuildExperimentResult, type ObjectivePreset } from './experimentOptimizer2';
import type { GameData, JobKey, SimulationInput } from './types';

export type TfAction = 'poor_start' | 'low_potion' | 'drop_only' | 'comfort';

export interface TfTrainingStep {
  episode: number;
  epsilon: number;
  action: TfAction;
  reward: number;
  loss: number;
  predictedQ: number;
  totalHours: number;
  endingMeso: number;
  potionCost: number;
  gearCost: number;
  deaths: number;
  comfort: number;
}

export interface TfTrainingReport {
  modelType: 'tensorflow-js-dqn';
  stateKey: string;
  actions: TfAction[];
  bestAction: TfAction;
  bestReward: number;
  bestResult: BuildExperimentResult;
  qValues: Record<TfAction, number>;
  history: TfTrainingStep[];
  explanation: string;
}

const ACTIONS: TfAction[] = ['poor_start', 'low_potion', 'drop_only', 'comfort'];
const ACTION_TO_OBJECTIVE: Record<TfAction, ObjectivePreset> = {
  poor_start: 'poor_start',
  low_potion: 'low_potion',
  drop_only: 'drop_only',
  comfort: 'comfort',
};

function familyIndex(jobKey: JobKey): number {
  if (['fighter', 'page', 'spearman'].includes(jobKey)) return 0;
  if (['fire_poison', 'ice_lightning', 'cleric'].includes(jobKey)) return 1;
  if (['hunter', 'crossbowman'].includes(jobKey)) return 2;
  if (['assassin', 'bandit'].includes(jobKey)) return 3;
  return 4;
}

function stateVector(input: SimulationInput): number[] {
  const target = Math.max(input.startLevel + 1, input.targetLevel);
  return [
    familyIndex(input.jobKey) / 4,
    input.startLevel / 70,
    target / 70,
    (target - input.startLevel) / 70,
    input.travelPenalty,
    input.potionPenalty / 3,
    input.materialValueWeight / 3,
    input.allowHighRisk ? 1 : 0,
  ];
}

function stateKey(input: SimulationInput): string {
  return `tf-dqn|${input.jobKey}|${input.startLevel}-${input.targetLevel}|poor-server`;
}

function rng(seed: number): () => number {
  let x = seed || 123456789;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function evaluate(data: GameData, input: SimulationInput, action: TfAction): BuildExperimentResult {
  const objective = ACTION_TO_OBJECTIVE[action];
  const result = runBuildExperiments(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), objective)[0];
  if (!result) throw new Error(`TensorFlow trainer could not evaluate action ${action}`);
  return result;
}

function reward(result: BuildExperimentResult): number {
  const keepCash = result.endingMeso / 1300;
  const noGearBonus = result.totalGearCost <= 0 ? 180 : 0;
  const potionPenalty = result.totalPotionCost / 900;
  const gearPenalty = result.totalGearCost / 650;
  const deathPenalty = result.expectedDeaths * 135;
  const timePenalty = result.totalHours * 4.8;
  const comfortBonus = result.comfortScore * 0.5;
  const accPenalty = result.finalStats.accuracy < 35 ? (35 - result.finalStats.accuracy) * 3 : 0;
  return keepCash + noGearBonus + comfortBonus - potionPenalty - gearPenalty - deathPenalty - timePenalty - accPenalty;
}

function createModel(): tf.Sequential {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [8], units: 24, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
  model.add(tf.layers.dense({ units: ACTIONS.length, activation: 'linear' }));
  model.compile({ optimizer: tf.train.adam(0.015), loss: 'meanSquaredError' });
  return model;
}

function argMax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? Number.NEGATIVE_INFINITY) > (values[best] ?? Number.NEGATIVE_INFINITY)) best = i;
  }
  return best;
}

async function predictQ(model: tf.Sequential, state: number[]): Promise<number[]> {
  const q = tf.tidy(() => {
    const xs = tf.tensor2d([state]);
    return model.predict(xs) as tf.Tensor;
  });
  const rawValues = await q.data();
  const values = Array.from(rawValues, (value) => Number(value));
  q.dispose();
  return values;
}

export async function trainTensorFlowDqn(data: GameData, input: SimulationInput, episodes: number): Promise<TfTrainingReport> {
  await tf.ready();
  const episodeCount = Math.max(4, Math.min(120, Math.round(episodes)));
  const model = createModel();
  const random = rng(input.startLevel * 1009 + input.targetLevel * 917 + input.jobKey.length * 53);
  const state = stateVector(input);
  const history: TfTrainingStep[] = [];
  let bestAction: TfAction = 'poor_start';
  let bestResult = evaluate(data, input, bestAction);
  let bestReward = reward(bestResult);

  for (let episode = 1; episode <= episodeCount; episode += 1) {
    const epsilon = Math.max(0.05, 0.65 * Math.exp(-episode / Math.max(8, episodeCount * 0.38)));
    const currentQ = await predictQ(model, state);
    const actionIndex = random() < epsilon ? Math.floor(random() * ACTIONS.length) : argMax(currentQ);
    const action = ACTIONS[actionIndex] ?? 'poor_start';
    const result = evaluate(data, input, action);
    const r = reward(result);
    const targetQ = currentQ.slice();
    targetQ[actionIndex] = r;

    const xs = tf.tensor2d([state]);
    const ys = tf.tensor2d([targetQ]);
    const trainResult = await model.trainOnBatch(xs, ys) as number | number[];
    xs.dispose();
    ys.dispose();
    const lossValue = Array.isArray(trainResult) ? Number(trainResult[0] ?? 0) : Number(trainResult);

    if (r > bestReward) {
      bestReward = r;
      bestAction = action;
      bestResult = result;
    }

    history.push({
      episode,
      epsilon: Math.round(epsilon * 1000) / 1000,
      action,
      reward: Math.round(r * 100) / 100,
      loss: Math.round(lossValue * 10000) / 10000,
      predictedQ: Math.round((currentQ[actionIndex] ?? 0) * 100) / 100,
      totalHours: result.totalHours,
      endingMeso: result.endingMeso,
      potionCost: result.totalPotionCost,
      gearCost: result.totalGearCost,
      deaths: result.expectedDeaths,
      comfort: result.comfortScore,
    });
  }

  const finalQArray = await predictQ(model, state);
  const bestIndex = argMax(finalQArray);
  const modelBestAction = ACTIONS[bestIndex] ?? bestAction;
  const modelBestResult = evaluate(data, input, modelBestAction);
  const modelBestReward = reward(modelBestResult);
  if (modelBestReward >= bestReward) {
    bestAction = modelBestAction;
    bestResult = modelBestResult;
    bestReward = modelBestReward;
  }

  const qValues = Object.fromEntries(ACTIONS.map((action, index) => [action, Math.round((finalQArray[index] ?? 0) * 100) / 100])) as Record<TfAction, number>;
  model.dispose();

  return {
    modelType: 'tensorflow-js-dqn',
    stateKey: stateKey(input),
    actions: ACTIONS,
    bestAction,
    bestReward: Math.round(bestReward * 100) / 100,
    bestResult,
    qValues,
    history,
    explanation: 'TensorFlow.js DQN：浏览器内创建神经网络，输入职业/等级/参数状态，输出穷鬼相关策略动作的 Q 值，用奖励函数训练模型，而不是只用 Q-table。',
  };
}
