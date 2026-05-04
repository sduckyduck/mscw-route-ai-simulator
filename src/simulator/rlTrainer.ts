import { runBuildExperiments, type BuildExperimentResult, type ObjectivePreset } from './experimentOptimizer2';
import { OPENING_POLICY_ACTIONS, openingPolicyToObjective, type OpeningPolicyAction } from './openingPolicy';
import type { GameData, SimulationInput } from './types';

export type RlAlgorithm = 'dqn_lite' | 'ppo_stub' | 'dreamer_stub';

export interface RlEpisodeLog {
  episode: number;
  epsilon: number;
  action: string;
  reward: number;
  qValue: number;
  totalHours: number;
  endingMeso: number;
  totalPotionCost: number;
  totalGearCost: number;
  expectedDeaths: number;
  comfort: number;
}

export interface RlTrainingReport {
  algorithm: RlAlgorithm;
  episodes: number;
  stateKey: string;
  bestAction: OpeningPolicyAction;
  bestObjective: ObjectivePreset;
  bestReward: number;
  bestResult: BuildExperimentResult;
  qValues: Record<string, number>;
  history: RlEpisodeLog[];
  note: string;
}

function stateKey(input: SimulationInput): string {
  return `${input.jobKey}|Lv${input.startLevel}-${input.targetLevel}|new-server-opening`;
}

function rng(seed: number): () => number {
  let x = seed || 1234567;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function openingReward(result: BuildExperimentResult): number {
  const timePenalty = result.totalHours * 18;
  const deathPenalty = result.expectedDeaths * 180;
  const potionPenalty = result.totalPotionCost / 850;
  const gearPenalty = result.totalGearCost / 1200;
  const bankruptcyPenalty = result.endingMeso < 0 ? Math.abs(result.endingMeso) / 250 : 0;
  const mesoReserveBonus = Math.min(900, Math.max(0, result.endingMeso) / 1800);
  const comfortBonus = result.comfortScore * 5;
  const completionBonus = result.decisions.length * 55;
  const lowHitPenalty = result.decisions.filter((d) => d.hitRate < 0.75).length * 140;
  const veryLowHitPenalty = result.decisions.filter((d) => d.hitRate < 0.55).length * 300;

  return completionBonus + mesoReserveBonus + comfortBonus - timePenalty - deathPenalty - potionPenalty - gearPenalty - bankruptcyPenalty - lowHitPenalty - veryLowHitPenalty;
}

function evaluate(data: GameData, input: SimulationInput, action: OpeningPolicyAction): BuildExperimentResult {
  const objective = openingPolicyToObjective(action);
  const result = runBuildExperiments(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), objective)[0];
  if (!result) throw new Error(`No result for opening policy ${action.id}`);
  return result;
}

function choose(q: Record<string, number>, epsilon: number, random: () => number): OpeningPolicyAction {
  if (random() < epsilon) return OPENING_POLICY_ACTIONS[Math.floor(random() * OPENING_POLICY_ACTIONS.length)] ?? OPENING_POLICY_ACTIONS[0];
  return OPENING_POLICY_ACTIONS.slice().sort((a, b) => q[b.id] - q[a.id])[0] ?? OPENING_POLICY_ACTIONS[0];
}

export function runRlTraining(data: GameData, input: SimulationInput, algorithm: RlAlgorithm, episodeCount: number): RlTrainingReport {
  const episodes = Math.max(1, Math.min(300, Math.round(episodeCount)));
  const random = rng(input.startLevel * 1009 + input.targetLevel * 917 + input.jobKey.length * 37);
  const q = Object.fromEntries(OPENING_POLICY_ACTIONS.map((a) => [a.id, 0])) as Record<string, number>;
  const history: RlEpisodeLog[] = [];
  let alpha = algorithm === 'dqn_lite' ? 0.22 : 0.16;
  let gamma = algorithm === 'dqn_lite' ? 0.9 : 0.86;
  let bestAction = OPENING_POLICY_ACTIONS[0];
  let bestResult = evaluate(data, input, bestAction);
  let bestReward = openingReward(bestResult);

  for (let episode = 1; episode <= episodes; episode += 1) {
    const epsilon = Math.max(0.05, 0.78 * Math.exp(-episode / Math.max(8, episodes * 0.42)));
    const action = choose(q, epsilon, random);
    const result = evaluate(data, input, action);
    const reward = openingReward(result);
    const old = q[action.id];
    const next = Math.max(...Object.values(q));
    const updated = old + alpha * (reward + gamma * next - old);
    q[action.id] = updated;

    if (reward > bestReward) {
      bestReward = reward;
      bestAction = action;
      bestResult = result;
    }

    history.push({
      episode,
      epsilon: Math.round(epsilon * 1000) / 1000,
      action: action.label,
      reward: Math.round(reward * 100) / 100,
      qValue: Math.round(updated * 100) / 100,
      totalHours: result.totalHours,
      endingMeso: result.endingMeso,
      totalPotionCost: result.totalPotionCost,
      totalGearCost: result.totalGearCost,
      expectedDeaths: result.expectedDeaths,
      comfort: result.comfortScore,
    });

    alpha *= 0.997;
    gamma = Math.max(0.8, gamma * 0.9995);
  }

  const learned = OPENING_POLICY_ACTIONS.slice().sort((a, b) => q[b.id] - q[a.id])[0] ?? bestAction;
  const learnedResult = evaluate(data, input, learned);
  const learnedReward = openingReward(learnedResult);
  if (learnedReward >= bestReward) {
    bestAction = learned;
    bestResult = learnedResult;
    bestReward = learnedReward;
  }

  const note = algorithm === 'dqn_lite'
    ? '当前是单目标新服开荒 DQN-lite：动作不是“爽玩/穷鬼”目标，而是 AP、装备来源、风险、技能倾向组成的开荒 policy。奖励固定为更快升级、更少死亡、更少药耗/装备成本、金币不破产、命中稳定。'
    : 'PPO/Dreamer 接口保留；当前仍使用同一个单目标开荒训练循环。后续可把 policy/value/world model 换成 TensorFlow.js 或 Python 后端。';

  return {
    algorithm,
    episodes,
    stateKey: stateKey(input),
    bestAction,
    bestObjective: openingPolicyToObjective(bestAction),
    bestReward: Math.round(bestReward * 100) / 100,
    bestResult,
    qValues: Object.fromEntries(OPENING_POLICY_ACTIONS.map((a) => [a.label, Math.round(q[a.id] * 100) / 100])),
    history,
    note,
  };
}
