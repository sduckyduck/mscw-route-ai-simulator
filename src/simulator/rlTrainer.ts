import { runBuildExperiments, type BuildExperimentResult, type ObjectivePreset } from './experimentOptimizer2';
import type { GameData, SimulationInput } from './types';

export type RlAlgorithm = 'dqn_lite' | 'ppo_stub' | 'dreamer_stub';

export interface RlEpisodeLog {
  episode: number;
  epsilon: number;
  action: ObjectivePreset;
  reward: number;
  qValue: number;
  totalHours: number;
  endingMeso: number;
  expectedDeaths: number;
  comfort: number;
}

export interface RlTrainingReport {
  algorithm: RlAlgorithm;
  targetObjective: ObjectivePreset;
  episodes: number;
  stateKey: string;
  bestObjective: ObjectivePreset;
  bestReward: number;
  bestResult: BuildExperimentResult;
  qValues: Record<ObjectivePreset, number>;
  history: RlEpisodeLog[];
  note: string;
}

const ACTIONS: ObjectivePreset[] = ['fastest', 'poor_start', 'low_death', 'low_potion', 'shop_gear', 'craft_only', 'drop_only', 'comfort'];

function stateKey(input: SimulationInput): string {
  return `${input.jobKey}|${input.startLevel}-${input.targetLevel}`;
}

function rng(seed: number): () => number {
  let x = seed || 1234567;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function reward(result: BuildExperimentResult, target: ObjectivePreset): number {
  const time = -result.totalHours * 12;
  const meso = result.endingMeso / 2200;
  const potion = -result.totalPotionCost / 1400;
  const gear = -result.totalGearCost / 2800;
  const risk = -result.expectedDeaths * 85;
  const comfort = result.comfortScore * 0.9;
  if (target === 'fastest') return time * 1.5 + risk * 0.25 + comfort * 0.2;
  if (target === 'poor_start') return meso * 1.4 + potion * 1.7 + gear * 1.2 + risk * 0.45 + time * 0.35;
  if (target === 'low_death') return risk * 2.2 + comfort * 0.9 + time * 0.25;
  if (target === 'low_potion') return potion * 2 + meso * 0.7 + risk * 0.6 + time * 0.35;
  return time * 0.55 + meso * 0.55 + potion * 0.75 + risk * 0.85 + comfort;
}

function evaluate(data: GameData, input: SimulationInput, action: ObjectivePreset): BuildExperimentResult {
  const result = runBuildExperiments(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), action)[0];
  if (!result) throw new Error(`No result for RL action ${action}`);
  return result;
}

function choose(q: Record<ObjectivePreset, number>, epsilon: number, random: () => number): ObjectivePreset {
  if (random() < epsilon) return ACTIONS[Math.floor(random() * ACTIONS.length)] ?? 'comfort';
  return ACTIONS.slice().sort((a, b) => q[b] - q[a])[0] ?? 'comfort';
}

export function runRlTraining(data: GameData, input: SimulationInput, algorithm: RlAlgorithm, targetObjective: ObjectivePreset, episodeCount: number): RlTrainingReport {
  const episodes = Math.max(1, Math.min(300, Math.round(episodeCount)));
  const random = rng(input.startLevel * 1009 + input.targetLevel * 917 + input.jobKey.length * 37);
  const q = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<ObjectivePreset, number>;
  const history: RlEpisodeLog[] = [];
  let alpha = algorithm === 'dqn_lite' ? 0.26 : 0.18;
  let gamma = algorithm === 'dqn_lite' ? 0.92 : 0.88;
  let bestObjective = targetObjective;
  let bestResult = evaluate(data, input, targetObjective);
  let bestReward = reward(bestResult, targetObjective);

  for (let episode = 1; episode <= episodes; episode += 1) {
    const epsilon = Math.max(0.05, 0.75 * Math.exp(-episode / Math.max(8, episodes * 0.45)));
    const action = choose(q, epsilon, random);
    const result = evaluate(data, input, action);
    const r = reward(result, targetObjective);
    const old = q[action];
    const next = Math.max(...Object.values(q));
    const updated = old + alpha * (r + gamma * next - old);
    q[action] = updated;
    if (r > bestReward) {
      bestReward = r;
      bestObjective = action;
      bestResult = result;
    }
    history.push({
      episode,
      epsilon: Math.round(epsilon * 1000) / 1000,
      action,
      reward: Math.round(r * 100) / 100,
      qValue: Math.round(updated * 100) / 100,
      totalHours: result.totalHours,
      endingMeso: result.endingMeso,
      expectedDeaths: result.expectedDeaths,
      comfort: result.comfortScore,
    });
    alpha *= 0.997;
    gamma = Math.max(0.82, gamma * 0.9995);
  }

  const learned = ACTIONS.slice().sort((a, b) => q[b] - q[a])[0] ?? bestObjective;
  const learnedResult = evaluate(data, input, learned);
  const learnedReward = reward(learnedResult, targetObjective);
  if (learnedReward >= bestReward) {
    bestObjective = learned;
    bestResult = learnedResult;
    bestReward = learnedReward;
  }

  const note = algorithm === 'dqn_lite'
    ? '当前使用浏览器内 DQN-lite：用 epsilon-greedy 试跑、奖励函数和 Q 值更新，让 AI 小人从多轮尝试中学习哪个策略更好。'
    : 'PPO/Dreamer 接口已接入 UI；当前先复用轻量训练循环。后续可接 TensorFlow.js 或 Python 后端做真正神经网络训练。';

  return {
    algorithm,
    targetObjective,
    episodes,
    stateKey: stateKey(input),
    bestObjective,
    bestReward: Math.round(bestReward * 100) / 100,
    bestResult,
    qValues: Object.fromEntries(ACTIONS.map((a) => [a, Math.round(q[a] * 100) / 100])) as Record<ObjectivePreset, number>,
    history,
    note,
  };
}
