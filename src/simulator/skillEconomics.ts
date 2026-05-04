import type { JobKey } from './types';

export type SkillRole = 'attack' | 'accuracy' | 'mastery' | 'speed' | 'survival' | 'mp_save' | 'mobility' | 'aoe';

export interface SkillOption {
  name: string;
  jobKeys: JobKey[];
  minLevel: number;
  maxLevel: number;
  role: SkillRole;
  damageGain: number;
  accuracyGain: number;
  avoidGain: number;
  speedGain: number;
  survivalGain: number;
  mpCostPerUse: number;
  mpSavePerKill: number;
  reason: string;
}

export interface SkillState {
  levels: Record<string, number>;
  damageMultiplier: number;
  accuracyBonus: number;
  avoidBonus: number;
  speedMultiplier: number;
  survivalBonus: number;
  mpCostPerKill: number;
  mpSavePerKill: number;
  decisions: string[];
}

export interface SkillChoiceContext {
  jobKey: JobKey;
  level: number;
  objective: string;
  hitRate: number;
  deathRisk: number;
  mesoPressure: number;
}

export const SKILL_OPTIONS: SkillOption[] = [
  {
    name: 'Precise Strikes',
    jobKeys: ['fighter', 'page', 'spearman'],
    minLevel: 10,
    maxLevel: 15,
    role: 'accuracy',
    damageGain: 0,
    accuracyGain: 1.333,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 0,
    mpSavePerKill: 0,
    reason: '战士命中技能。命中不够时，补它可能比硬加主属性更划算。',
  },
  {
    name: 'Improved HP Recovery',
    jobKeys: ['fighter', 'page', 'spearman'],
    minLevel: 10,
    maxLevel: 15,
    role: 'survival',
    damageGain: 0,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0.008,
    mpCostPerUse: 0,
    mpSavePerKill: 0.35,
    reason: '提高自然回血/补给效率。相比 Max HP，上限不影响每瓶药恢复量，前期收益更看场景。',
  },
  {
    name: 'Power Strike',
    jobKeys: ['fighter', 'page', 'spearman'],
    minLevel: 10,
    maxLevel: 20,
    role: 'attack',
    damageGain: 0.026,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 4.8,
    mpSavePerKill: 0,
    reason: '战士早期单体主攻，直接降低击杀时间，但会增加 MP/药耗压力。',
  },
  {
    name: 'Slash Blast',
    jobKeys: ['fighter', 'page', 'spearman'],
    minLevel: 18,
    maxLevel: 20,
    role: 'aoe',
    damageGain: 0.012,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0.004,
    survivalGain: 0,
    mpCostPerUse: 7.2,
    mpSavePerKill: 0,
    reason: '密集图群攻收益高，但低蓝/穷鬼路线下不一定优先。',
  },
  {
    name: 'Max HP Increase',
    jobKeys: ['fighter', 'page', 'spearman'],
    minLevel: 20,
    maxLevel: 10,
    role: 'survival',
    damageGain: 0,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0.006,
    mpCostPerUse: 0,
    mpSavePerKill: 0,
    reason: '提高 HP 上限主要防止被秒；如果当前药水固定回 50 且不会死，早期收益低。',
  },
  {
    name: 'Double Shot',
    jobKeys: ['hunter', 'crossbowman'],
    minLevel: 10,
    maxLevel: 20,
    role: 'attack',
    damageGain: 0.024,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 7.5,
    mpSavePerKill: 0,
    reason: '弓手高输出早期主攻，但 MP 成本高。',
  },
  {
    name: 'Arrow Blow',
    jobKeys: ['hunter', 'crossbowman'],
    minLevel: 10,
    maxLevel: 20,
    role: 'attack',
    damageGain: 0.015,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 3.2,
    mpSavePerKill: 0,
    reason: '弓手低 MP 成本攻击；穷鬼/少药路线可能比 Double Shot 更划算。',
  },
  {
    name: 'The Eye of Amazon',
    jobKeys: ['hunter', 'crossbowman'],
    minLevel: 10,
    maxLevel: 8,
    role: 'accuracy',
    damageGain: 0,
    accuracyGain: 2.4,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0.002,
    mpCostPerUse: 0,
    mpSavePerKill: 0,
    reason: '命中和射程收益；命中不足时优先级会超过攻击技能。',
  },
  {
    name: 'Nimble Body',
    jobKeys: ['assassin', 'bandit'],
    minLevel: 10,
    maxLevel: 20,
    role: 'accuracy',
    damageGain: 0,
    accuracyGain: 2.1,
    avoidGain: 1.6,
    speedGain: 0,
    survivalGain: 0.004,
    mpCostPerUse: 0,
    mpSavePerKill: 0,
    reason: '飞侠核心命中/回避技能，越级和省药都很重要。',
  },
  {
    name: 'Lucky Seven / Double Stab',
    jobKeys: ['assassin', 'bandit'],
    minLevel: 10,
    maxLevel: 20,
    role: 'attack',
    damageGain: 0.025,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 6.2,
    mpSavePerKill: 0,
    reason: '飞侠主攻技能，输出收益高但会增加 MP 压力。',
  },
  {
    name: 'Magic Claw',
    jobKeys: ['fire_poison', 'ice_lightning', 'cleric'],
    minLevel: 10,
    maxLevel: 20,
    role: 'attack',
    damageGain: 0.03,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 8.5,
    mpSavePerKill: 0,
    reason: '法师一转稳定输出，但 MP 成本需要纳入净收益。',
  },
  {
    name: 'Improving Max MP Increase',
    jobKeys: ['fire_poison', 'ice_lightning', 'cleric'],
    minLevel: 18,
    maxLevel: 10,
    role: 'mp_save',
    damageGain: 0,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0.002,
    mpCostPerUse: 0,
    mpSavePerKill: 0.45,
    reason: '长期降低 MP 压力；如果当前不缺蓝，前期不一定优先。',
  },
  {
    name: 'Weapon Mastery',
    jobKeys: ['fighter', 'page', 'spearman', 'hunter', 'crossbowman', 'assassin', 'bandit'],
    minLevel: 30,
    maxLevel: 20,
    role: 'mastery',
    damageGain: 0.018,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0,
    survivalGain: 0,
    mpCostPerUse: 0,
    mpSavePerKill: 0,
    reason: '二转 mastery 稳定最小伤害，减少打怪波动。',
  },
  {
    name: 'Booster',
    jobKeys: ['fighter', 'page', 'spearman', 'hunter', 'crossbowman', 'assassin', 'bandit'],
    minLevel: 30,
    maxLevel: 20,
    role: 'speed',
    damageGain: 0,
    accuracyGain: 0,
    avoidGain: 0,
    speedGain: 0.012,
    survivalGain: 0,
    mpCostPerUse: 4.5,
    mpSavePerKill: 0,
    reason: '攻速类技能提高 KPH，但有 buff MP 成本。',
  },
];

export function createSkillState(): SkillState {
  return {
    levels: {},
    damageMultiplier: 1,
    accuracyBonus: 0,
    avoidBonus: 0,
    speedMultiplier: 1,
    survivalBonus: 0,
    mpCostPerKill: 0,
    mpSavePerKill: 0,
    decisions: [],
  };
}

function scoreSkill(option: SkillOption, context: SkillChoiceContext): number {
  const hitDeficit = Math.max(0, 0.95 - context.hitRate);
  const risk = context.deathRisk;
  const poor = context.objective === 'poor_start' || context.objective === 'low_potion';
  const fastest = context.objective === 'fastest';

  let score = option.damageGain * (fastest ? 145 : 90);
  score += option.accuracyGain * hitDeficit * 10;
  score += option.avoidGain * risk * 1.6;
  score += option.speedGain * (fastest ? 160 : 100);
  score += option.survivalGain * (context.objective === 'low_death' ? 180 : 55);
  score += option.mpSavePerKill * (poor ? 6 : 1.6);
  score -= option.mpCostPerUse * (poor ? 0.9 : 0.24);

  if (option.name === 'Arrow Blow' && poor) score += 12;
  if (option.name === 'Double Shot' && poor) score -= 10;
  if (option.name === 'Max HP Increase' && context.deathRisk < 0.12) score -= 20;
  if (option.name === 'Precise Strikes' && hitDeficit > 0.05) score += 10;
  if (option.role === 'accuracy' && hitDeficit > 0.2) score += 18;
  return score;
}

export function investSkillPoints(state: SkillState, context: SkillChoiceContext, points: number): string[] {
  const decisions: string[] = [];
  let remaining = points;

  while (remaining > 0) {
    const candidates = SKILL_OPTIONS.filter((option) =>
      option.jobKeys.includes(context.jobKey) &&
      option.minLevel <= context.level &&
      (state.levels[option.name] ?? 0) < option.maxLevel,
    );
    if (!candidates.length) break;

    const best = candidates.slice().sort((a, b) => scoreSkill(b, context) - scoreSkill(a, context))[0];
    state.levels[best.name] = (state.levels[best.name] ?? 0) + 1;
    state.damageMultiplier += best.damageGain;
    state.accuracyBonus += best.accuracyGain;
    state.avoidBonus += best.avoidGain;
    state.speedMultiplier += best.speedGain;
    state.survivalBonus += best.survivalGain;
    state.mpCostPerKill += best.mpCostPerUse * 0.18;
    state.mpSavePerKill += best.mpSavePerKill;
    const decision = `Lv.${context.level} SP +1 ${best.name}: ${best.reason}`;
    decisions.push(decision);
    state.decisions.push(decision);
    remaining -= 1;
  }

  return decisions;
}
