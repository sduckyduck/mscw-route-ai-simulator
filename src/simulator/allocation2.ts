import { BASE_CRIT_DAMAGE, BASE_CRIT_RATE, masteryMultiplier } from './damageFormula';
import { JOB_PROFILES } from './jobs';
import type {
  AllocationPlan,
  CharacterBuildSnapshot,
  CharacterStats,
  DerivedCombatStats,
  JobKey,
  JobProfile,
  LevelAllocationStep,
  SkillPointAllocation,
  Strategy,
} from './types';

type StatKey = keyof CharacterStats;

type Effect = Partial<{
  skillMult: number;
  magicSkillDamage: number;
  mastery: number;
  accuracy: number;
  avoid: number;
  weaponAttack: number;
  magicAttack: number;
  attackPower: number;
  attackInterval: number;
  rangeScore: number;
  aoeScore: number;
  mobilityScore: number;
  survivability: number;
  potionIntensity: number;
  critRate: number;
  critDamage: number;
}>;

interface SkillDef {
  name: string;
  max: number;
  stage: 'first_job' | 'second_job';
  unlock: number;
  priority: number;
  role: 'main_attack' | 'mastery' | 'accuracy' | 'mobility' | 'survival' | 'utility' | 'aoe';
  reason: string;
  effect: Effect;
}

interface BuildConfig {
  baseStats: CharacterStats;
  primary: StatKey;
  secondary: StatKey;
  secondaryTarget: (level: number) => number;
  first: SkillDef[];
  second: SkillDef[];
}

function s(name: string, stage: SkillDef['stage'], max: number, priority: number, unlock: number, role: SkillDef['role'], reason: string, effect: Effect): SkillDef {
  return { name, stage, max, priority, unlock, role, reason, effect };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function spForLevel(level: number): number {
  if (level < 10) return 0;
  if (level === 10 || level === 30) return 1;
  return 3;
}

function apForLevel(level: number): number {
  return level <= 10 ? 0 : 5;
}

function stageForLevel(level: number): LevelAllocationStep['stage'] {
  if (level < 30) return 'first_job';
  if (level < 70) return 'second_job';
  return 'future';
}

function baseStats(family: JobProfile['family']): CharacterStats {
  if (family === 'warrior') return { str: 45, dex: 25, int: 4, luk: 4, hp: 310, mp: 70 };
  if (family === 'magician') return { str: 4, dex: 4, int: 52, luk: 13, hp: 120, mp: 260 };
  if (family === 'archer') return { str: 20, dex: 46, int: 4, luk: 4, hp: 210, mp: 110 };
  if (family === 'pirate') return { str: 28, dex: 34, int: 4, luk: 4, hp: 240, mp: 100 };
  return { str: 4, dex: 30, int: 4, luk: 40, hp: 200, mp: 120 };
}

const FIRST: Record<JobProfile['family'], SkillDef[]> = {
  warrior: [
    s('Power Strike', 'first_job', 20, 100, 10, 'main_attack', '一转先加主攻，提高前期单体击杀速度。', { skillMult: 0.025 }),
    s('Slash Blast', 'first_job', 20, 80, 16, 'aoe', '中期补群攻，密集图收益更高。', { skillMult: 0.012, aoeScore: 0.018 }),
    s('Improving Max HP Increase', 'first_job', 10, 72, 10, 'survival', '提高 HP 成长，降低药耗和越级风险。', { survivability: 0.018, potionIntensity: -0.012 }),
    s('Iron Body', 'first_job', 20, 40, 24, 'survival', '后补防御，适合安全路线。', { survivability: 0.006, potionIntensity: -0.006 }),
  ],
  magician: [
    s('Energy Bolt', 'first_job', 20, 88, 10, 'main_attack', '前期主攻技能。', { magicSkillDamage: 1.8 }),
    s('Magic Claw', 'first_job', 20, 100, 15, 'main_attack', '稳定主力输出技能。', { magicSkillDamage: 2.15, skillMult: 0.008 }),
    s('Improving Max MP Increase', 'first_job', 10, 82, 10, 'utility', '提高 MP 成长，降低补给压力。', { magicAttack: 0.6, potionIntensity: -0.01 }),
    s('Magic Guard', 'first_job', 20, 52, 18, 'survival', '提高容错，安全路线收益高。', { survivability: 0.014, potionIntensity: 0.004 }),
  ],
  archer: [
    s('Double Shot', 'first_job', 20, 100, 10, 'main_attack', '前期主攻技能。', { skillMult: 0.022 }),
    s('The Eye of Amazon', 'first_job', 8, 86, 10, 'accuracy', '优先补射程和命中。', { accuracy: 2.4, rangeScore: 0.025 }),
    s('Critical Shot', 'first_job', 20, 78, 18, 'main_attack', '提高平均伤害。', { critRate: 0.006, critDamage: 0.7 }),
    s('Focus', 'first_job', 20, 48, 24, 'accuracy', '后补命中和回避。', { accuracy: 1.4, avoid: 1.2 }),
  ],
  rogue: [
    s('Lucky Seven / Double Stab', 'first_job', 20, 100, 10, 'main_attack', '职业核心主攻技能。', { skillMult: 0.024 }),
    s('Nimble Body', 'first_job', 20, 86, 10, 'accuracy', '命中和回避直接影响效率与药耗。', { accuracy: 2.2, avoid: 1.8 }),
    s('Disorder', 'first_job', 20, 45, 22, 'survival', '降低近战压力。', { survivability: 0.006 }),
    s('Dark Sight', 'first_job', 20, 38, 25, 'utility', '提高跑图和容错。', { mobilityScore: 0.006, survivability: 0.004 }),
  ],
  pirate: [
    s('Somersault Kick / Double Shot', 'first_job', 20, 100, 10, 'main_attack', '海盗预留主攻技能。', { skillMult: 0.023 }),
    s('Dash', 'first_job', 10, 84, 10, 'mobility', '机动提高刷图循环。', { mobilityScore: 0.026, attackInterval: -0.002 }),
    s('Quick Motion', 'first_job', 20, 76, 15, 'accuracy', '提高命中和回避。', { accuracy: 1.8, avoid: 1.4 }),
    s('Bullet Time', 'first_job', 20, 52, 22, 'utility', '后补稳定性。', { rangeScore: 0.006, survivability: 0.005 }),
  ],
};

function cfg(family: JobProfile['family'], primary: StatKey, secondary: StatKey, target: (level: number) => number, second: SkillDef[]): BuildConfig {
  return { baseStats: baseStats(family), primary, secondary, secondaryTarget: target, first: FIRST[family], second };
}

const CONFIG: Record<JobKey, BuildConfig> = {
  fighter: cfg('warrior', 'str', 'dex', (l) => Math.max(35, l * 2), [
    s('Sword Mastery', 'second_job', 20, 112, 30, 'mastery', '二转优先补 mastery，稳定最小伤害。', { mastery: 0.032 }),
    s('Sword Booster', 'second_job', 20, 92, 34, 'utility', '攻速提高，直接提高 KPH。', { attackInterval: -0.01 }),
    s('Rage', 'second_job', 20, 86, 38, 'utility', '攻击力提升，放大后续练级收益。', { weaponAttack: 0.9, attackPower: 0.45 }),
    s('Power Guard', 'second_job', 30, 58, 45, 'survival', '后补生存，降低药耗。', { survivability: 0.008, potionIntensity: -0.005 }),
  ]),
  page: cfg('warrior', 'str', 'dex', (l) => Math.max(35, l * 2), [
    s('Sword Mastery', 'second_job', 20, 108, 30, 'mastery', '先补 mastery。', { mastery: 0.032 }),
    s('Sword Booster', 'second_job', 20, 86, 34, 'utility', '提高攻击频率。', { attackInterval: -0.009 }),
    s('Threaten', 'second_job', 20, 72, 38, 'survival', '降低怪物压力。', { survivability: 0.01, potionIntensity: -0.007 }),
    s('Power Guard', 'second_job', 30, 64, 43, 'survival', '进一步降低近战药耗。', { survivability: 0.008, potionIntensity: -0.005 }),
  ]),
  spearman: cfg('warrior', 'str', 'dex', (l) => Math.max(35, l * 2), [
    s('Spear Mastery', 'second_job', 20, 112, 30, 'mastery', '枪战士先补 mastery，稳定长枪输出。', { mastery: 0.032 }),
    s('Spear Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升，改善每小时击杀数。', { attackInterval: -0.01 }),
    s('Hyper Body', 'second_job', 30, 82, 40, 'survival', '提高 HP/MP 上限，越级和组队价值高。', { survivability: 0.012, potionIntensity: -0.006 }),
    s('Iron Will', 'second_job', 20, 68, 42, 'survival', '降低高密度图药耗。', { survivability: 0.008, potionIntensity: -0.006 }),
  ]),
  fire_poison: cfg('magician', 'int', 'luk', (l) => l + 3, [
    s('Fire Arrow', 'second_job', 30, 112, 30, 'main_attack', '火毒核心输出。', { magicSkillDamage: 2.8, skillMult: 0.01 }),
    s('Meditation', 'second_job', 20, 88, 35, 'utility', '魔攻提升放大输出。', { magicAttack: 1.2 }),
    s('MP Eater', 'second_job', 20, 78, 38, 'utility', '降低 MP 药耗。', { potionIntensity: -0.012 }),
    s('Poison Breath', 'second_job', 30, 60, 44, 'utility', '持续伤害和越级收益预留。', { aoeScore: 0.009, magicSkillDamage: 1.1 }),
  ]),
  ice_lightning: cfg('magician', 'int', 'luk', (l) => l + 3, [
    s('Thunderbolt', 'second_job', 30, 112, 30, 'aoe', '群攻决定密集图效率。', { magicSkillDamage: 1.4, aoeScore: 0.018 }),
    s('Cold Beam', 'second_job', 30, 104, 34, 'main_attack', '单体输出兼顾控场。', { magicSkillDamage: 2.4, survivability: 0.004 }),
    s('Meditation', 'second_job', 20, 88, 38, 'utility', '魔攻提升。', { magicAttack: 1.15 }),
    s('MP Eater', 'second_job', 20, 72, 42, 'utility', '降低 MP 药耗。', { potionIntensity: -0.012 }),
  ]),
  cleric: cfg('magician', 'int', 'luk', (l) => l + 3, [
    s('Heal', 'second_job', 30, 114, 30, 'aoe', '牧师核心，兼顾输出和续航。', { magicSkillDamage: 1.8, aoeScore: 0.016, survivability: 0.012, potionIntensity: -0.018 }),
    s('Bless', 'second_job', 20, 86, 35, 'accuracy', '提高命中回避和稳定性。', { accuracy: 1.6, avoid: 1.4, survivability: 0.006 }),
    s('Invincible', 'second_job', 20, 78, 40, 'survival', '降低药耗风险。', { survivability: 0.012, potionIntensity: -0.01 }),
    s('Holy Arrow', 'second_job', 30, 54, 45, 'main_attack', '后补单体输出。', { magicSkillDamage: 1.55 }),
  ]),
  hunter: cfg('archer', 'dex', 'str', (l) => l + 5, [
    s('Bow Mastery', 'second_job', 20, 112, 30, 'mastery', '先补 mastery。', { mastery: 0.032, accuracy: 0.6 }),
    s('Bow Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升。', { attackInterval: -0.01 }),
    s('Arrow Bomb', 'second_job', 30, 86, 38, 'aoe', '中期补群攻。', { aoeScore: 0.016, skillMult: 0.01 }),
    s('Soul Arrow', 'second_job', 20, 76, 42, 'utility', '降低补给压力。', { potionIntensity: -0.006, rangeScore: 0.004 }),
  ]),
  crossbowman: cfg('archer', 'dex', 'str', (l) => l + 5, [
    s('Crossbow Mastery', 'second_job', 20, 112, 30, 'mastery', '先补 mastery。', { mastery: 0.032, accuracy: 0.6 }),
    s('Crossbow Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升。', { attackInterval: -0.01 }),
    s('Iron Arrow', 'second_job', 30, 88, 38, 'aoe', '弩二转核心穿透。', { aoeScore: 0.017, skillMult: 0.01 }),
    s('Soul Arrow', 'second_job', 20, 74, 42, 'utility', '降低补给压力。', { potionIntensity: -0.006, rangeScore: 0.004 }),
  ]),
  assassin: cfg('rogue', 'luk', 'dex', (l) => Math.floor(l * 2.1), [
    s('Claw Mastery', 'second_job', 20, 110, 30, 'mastery', '先补 mastery。', { mastery: 0.03, accuracy: 0.5 }),
    s('Claw Booster', 'second_job', 20, 92, 34, 'utility', '攻速提高。', { attackInterval: -0.01 }),
    s('Critical Throw', 'second_job', 30, 102, 38, 'main_attack', '刺客核心暴击收益。', { critRate: 0.007, critDamage: 0.9 }),
    s('Haste', 'second_job', 20, 84, 42, 'mobility', '机动提高刷图循环。', { mobilityScore: 0.018, avoid: 1.0 }),
  ]),
  bandit: cfg('rogue', 'luk', 'dex', (l) => Math.floor(l * 2.1), [
    s('Dagger Mastery', 'second_job', 20, 108, 30, 'mastery', '先补 mastery。', { mastery: 0.03, accuracy: 0.5 }),
    s('Dagger Booster', 'second_job', 20, 90, 34, 'utility', '攻速提升。', { attackInterval: -0.009 }),
    s('Savage Blow', 'second_job', 30, 112, 38, 'main_attack', '侠客二转核心爆发。', { skillMult: 0.018 }),
    s('Haste', 'second_job', 20, 82, 42, 'mobility', '提高机动和回避。', { mobilityScore: 0.018, avoid: 1.0 }),
  ]),
  brawler: cfg('pirate', 'str', 'dex', (l) => l + 5, [
    s('Knuckle Mastery', 'second_job', 20, 108, 30, 'mastery', '海盗预留 mastery。', { mastery: 0.03, accuracy: 0.4 }),
    s('Knuckle Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升。', { attackInterval: -0.01 }),
    s('Corkscrew Blow', 'second_job', 20, 86, 38, 'main_attack', '位移攻击提高效率。', { skillMult: 0.014, mobilityScore: 0.01 }),
    s('Backspin Blow', 'second_job', 20, 78, 42, 'aoe', '补群攻。', { aoeScore: 0.014, skillMult: 0.008 }),
  ]),
  gunslinger: cfg('pirate', 'dex', 'str', (l) => l + 5, [
    s('Gun Mastery', 'second_job', 20, 108, 30, 'mastery', '海盗预留 mastery。', { mastery: 0.03, accuracy: 0.4 }),
    s('Gun Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升。', { attackInterval: -0.01 }),
    s('Invisible Shot', 'second_job', 20, 86, 38, 'aoe', '补多目标清怪。', { aoeScore: 0.014, skillMult: 0.008 }),
    s('Wings', 'second_job', 10, 70, 42, 'mobility', '机动提升。', { mobilityScore: 0.022 }),
  ]),
};

function priority(skill: SkillDef, strategy: Strategy): number {
  let value = skill.priority;
  if (strategy === 'fastest' && ['main_attack', 'aoe', 'mastery'].includes(skill.role)) value += 16;
  if (strategy === 'safe' && ['survival', 'accuracy', 'mobility'].includes(skill.role)) value += 18;
  if (strategy === 'profit' && ['utility', 'survival'].includes(skill.role)) value += 12;
  if (strategy === 'balanced' && skill.role === 'mastery') value += 8;
  return value;
}

function allocText(allocation: Partial<Record<StatKey, number>>): string {
  return Object.entries(allocation)
    .filter(([, value]) => value && value > 0)
    .map(([key, value]) => `${key.toUpperCase()} +${value}`)
    .join(' / ');
}

function addStats(stats: CharacterStats, allocation: Partial<Record<StatKey, number>>) {
  for (const [key, value] of Object.entries(allocation) as Array<[StatKey, number]>) {
    stats[key] += value;
  }
}

function allocateAp(level: number, config: BuildConfig, stats: CharacterStats, strategy: Strategy): Partial<Record<StatKey, number>> {
  const points = apForLevel(level);
  const allocation: Partial<Record<StatKey, number>> = {};
  if (!points) return allocation;

  const secondaryNeed = Math.max(0, config.secondaryTarget(level) - stats[config.secondary]);
  const safeExtra = strategy === 'safe' ? 1 : 0;
  const secondaryPoints = clamp(Math.min(points, secondaryNeed + safeExtra), 0, strategy === 'fastest' ? 2 : 3);
  const hpPoint = strategy === 'safe' && config.primary !== 'int' && level % 8 === 0 ? 1 : 0;
  const primaryPoints = Math.max(0, points - secondaryPoints - hpPoint);

  if (primaryPoints) allocation[config.primary] = primaryPoints;
  if (secondaryPoints) allocation[config.secondary] = secondaryPoints;
  if (hpPoint) allocation.hp = hpPoint * 10;
  return allocation;
}

function allocateSp(level: number, config: BuildConfig, strategy: Strategy, skillLevels: Record<string, number>): SkillPointAllocation[] {
  let remaining = spForLevel(level);
  const stage = stageForLevel(level);
  const pool = [...(stage === 'first_job' ? config.first : []), ...(stage === 'second_job' ? config.second : [])]
    .filter((skill) => skill.unlock <= level && (skillLevels[skill.name] ?? 0) < skill.max);
  const allocations: SkillPointAllocation[] = [];

  while (remaining > 0 && pool.length) {
    pool.sort((a, b) => priority(b, strategy) - priority(a, strategy));
    const selected = pool[0];
    const current = skillLevels[selected.name] ?? 0;
    const add = Math.min(remaining, selected.max - current);
    skillLevels[selected.name] = current + add;
    remaining -= add;
    allocations.push({ skill: selected.name, points: add, total: skillLevels[selected.name], reason: selected.reason });
    if (skillLevels[selected.name] >= selected.max) pool.shift();
  }

  return allocations;
}

function applyEffect(derived: DerivedCombatStats, skillLevels: Record<string, number>, skills: SkillDef[]): DerivedCombatStats {
  const out = { ...derived };
  for (const skill of skills) {
    const level = skillLevels[skill.name] ?? 0;
    if (!level) continue;
    for (const [key, value] of Object.entries(skill.effect) as Array<[keyof Effect, number]>) {
      if (typeof out[key as keyof DerivedCombatStats] === 'number') {
        (out[key as keyof DerivedCombatStats] as number) += value * level;
      }
    }
  }
  out.mastery = clamp(out.mastery, 0, 0.78);
  out.attackInterval = clamp(out.attackInterval, 0.48, 1.45);
  out.rangeScore = clamp(out.rangeScore, 0.15, 1.25);
  out.aoeScore = clamp(out.aoeScore, 0.05, 1.25);
  out.mobilityScore = clamp(out.mobilityScore, 0.05, 1.25);
  out.survivability = clamp(out.survivability, 0.05, 1.35);
  out.potionIntensity = clamp(out.potionIntensity, 0.3, 2.2);
  out.critRate = clamp(out.critRate, 0, 0.8);
  out.critDamage = clamp(out.critDamage, 0, 180);
  return out;
}

function derive(level: number, job: JobProfile, config: BuildConfig, stats: CharacterStats, skillLevels: Record<string, number>): DerivedCombatStats {
  const baseInterval = job.family === 'magician' ? 0.96 : job.family === 'warrior' ? 0.86 : 0.78;
  const base: DerivedCombatStats = {
    primaryStat: stats[config.primary],
    secondaryStat: job.family === 'rogue' ? stats.str + stats.dex : stats[config.secondary],
    accuracy: job.accuracyBase + stats.dex * 0.72 + stats.luk * 0.28 + level * 0.6,
    avoid: 15 + stats.dex * 0.18 + stats.luk * 0.42 + level * 0.7,
    weaponAttack: job.family === 'magician' ? 0 : 12 + level * (job.family === 'warrior' ? 1.0 : job.family === 'rogue' ? 0.92 : 0.88),
    magicAttack: job.family === 'magician' ? 18 + level * 3.45 + stats.int * 0.22 : 0,
    attackPower: 5 + level * 0.42,
    mastery: level < 30 ? (job.family === 'magician' ? 0.35 : 0.1) : masteryMultiplier(1),
    skillMult: 1 + (level >= 30 ? 0.1 : 0),
    magicSkillDamage: job.family === 'magician' ? 38 + level * 1.15 : 0,
    attackInterval: baseInterval + job.attackTaxSeconds - (level >= 30 ? 0.04 : 0),
    critRate: BASE_CRIT_RATE,
    critDamage: BASE_CRIT_DAMAGE,
    rangeScore: job.rangeScore,
    aoeScore: job.aoeScore,
    mobilityScore: job.mobilityScore,
    survivability: job.survivability,
    potionIntensity: job.potionIntensity,
  };
  return applyEffect(base, skillLevels, [...config.first, ...config.second]);
}

export function generateAllocationPlan(jobKey: JobKey, startLevel: number, targetLevel: number, strategy: Strategy): AllocationPlan & { snapshots: Record<number, CharacterBuildSnapshot> } {
  const job = JOB_PROFILES[jobKey];
  const config = CONFIG[jobKey];
  const stats: CharacterStats = { ...config.baseStats };
  const skillLevels: Record<string, number> = {};
  const steps: LevelAllocationStep[] = [];
  const snapshots: Record<number, CharacterBuildSnapshot> = {};
  const end = Math.max(10, targetLevel);

  for (let level = 10; level <= end; level += 1) {
    const apAllocated = allocateAp(level, config, stats, strategy);
    addStats(stats, apAllocated);
    stats.hp += job.family === 'warrior' ? 24 : job.family === 'magician' ? 8 : 16;
    stats.mp += job.family === 'magician' ? 22 : 10;
    const spAllocated = allocateSp(level, config, strategy, skillLevels);
    const derived = derive(level, job, config, stats, skillLevels);
    const step: LevelAllocationStep = {
      level,
      stage: stageForLevel(level),
      apGained: apForLevel(level),
      apAllocated,
      statsAfter: { ...stats },
      spGained: spForLevel(level),
      spAllocated,
      keySkills: Object.entries(skillLevels).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, value]) => `${name} ${value}`),
      note: `${allocText(apAllocated) || 'No AP'}；${spAllocated.map((x) => `${x.skill} +${x.points}`).join(' / ') || 'No SP'}`,
    };
    snapshots[level] = { level, jobKey, stats: { ...stats }, skillLevels: { ...skillLevels }, derived, step };
    if (level >= startLevel) steps.push(step);
  }

  const final = snapshots[end] ?? snapshots[10];
  return {
    jobKey,
    startLevel,
    targetLevel: end,
    strategy,
    summary: [
      `AP：先满足 ${config.secondary.toUpperCase()} 装备/命中需求，再把剩余 AP 投入 ${config.primary.toUpperCase()}。`,
      strategy === 'fastest' ? '最快策略更偏主属性和输出技能。' : strategy === 'safe' ? '安全策略更偏命中、回避、生存和低药耗。' : '当前策略在输出、命中、药耗和收益之间折中。',
      'SP：一转先主攻/关键命中；二转优先 mastery、booster、核心输出或群攻。',
    ],
    finalStats: final.stats,
    finalDerived: final.derived,
    finalSkills: final.skillLevels,
    steps,
    snapshots,
  };
}

export function getBuildSnapshot(jobKey: JobKey, level: number, strategy: Strategy): CharacterBuildSnapshot {
  const plan = generateAllocationPlan(jobKey, 10, Math.max(10, level), strategy);
  return plan.snapshots[Math.max(10, level)] ?? plan.snapshots[10];
}
