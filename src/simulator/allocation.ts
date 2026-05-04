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

type SkillEffect = Partial<{
  skillMult: number;
  magicSkillDamage: number;
  mastery: number;
  accuracy: number;
  avoid: number;
  weaponAttack: number;
  magicAttack: number;
  attackInterval: number;
  rangeScore: number;
  aoeScore: number;
  mobilityScore: number;
  survivability: number;
  potionIntensity: number;
  critRate: number;
  critDamage: number;
}>;

interface SkillDefinition {
  name: string;
  stage: 'first_job' | 'second_job';
  maxLevel: number;
  priority: number;
  unlockLevel: number;
  role: 'main_attack' | 'mastery' | 'accuracy' | 'mobility' | 'survival' | 'utility' | 'aoe';
  reason: string;
  effectPerPoint: SkillEffect;
}

interface BuildConfig {
  baseStats: CharacterStats;
  primary: StatKey;
  secondary: StatKey;
  secondaryTarget: (level: number) => number;
  firstJobSkills: SkillDefinition[];
  secondJobSkills: SkillDefinition[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function addStats(target: CharacterStats, delta: Partial<Record<StatKey, number>>) {
  for (const [key, value] of Object.entries(delta) as Array<[StatKey, number]>) {
    target[key] += value;
  }
}

function allocToText(allocation: Partial<Record<StatKey, number>>): string {
  const entries = Object.entries(allocation).filter(([, value]) => value && value > 0);
  return entries.map(([key, value]) => `${key.toUpperCase()} +${value}`).join(' / ');
}

function spForLevel(level: number): number {
  if (level < 10) return 0;
  if (level === 10 || level === 30) return 1;
  return 3;
}

function stageForLevel(level: number): LevelAllocationStep['stage'] {
  if (level < 30) return 'first_job';
  if (level < 70) return 'second_job';
  return 'future';
}

function apForLevel(level: number): number {
  return level <= 10 ? 0 : 5;
}

const FIRST_JOB_COMMON = {
  warrior: [
    skill('Power Strike', 'first_job', 20, 100, 10, 'main_attack', '先把单体主攻技能拉起来，直接提升早期开荒杀怪速度。', { skillMult: 0.025 }),
    skill('Slash Blast', 'first_job', 20, 80, 16, 'aoe', '中期开始补群攻，怪物密度高的图收益更明显。', { skillMult: 0.012, aoeScore: 0.018 }),
    skill('Improving Max HP Increase', 'first_job', 10, 72, 10, 'survival', '提高血量成长，降低越级图和高密度图药耗风险。', { survivability: 0.018, potionIntensity: -0.012 }),
    skill('Iron Body', 'first_job', 20, 40, 24, 'survival', '后补防御向技能，用于安全路线和低药耗路线。', { survivability: 0.006, potionIntensity: -0.006 }),
  ],
  magician: [
    skill('Energy Bolt', 'first_job', 20, 88, 10, 'main_attack', '前期主攻技能，直接提高魔法每击伤害。', { magicSkillDamage: 1.8 }),
    skill('Magic Claw', 'first_job', 20, 100, 15, 'main_attack', '稳定主力输出技能，中后段一转练级更依赖它。', { magicSkillDamage: 2.15, skillMult: 0.008 }),
    skill('Improving Max MP Increase', 'first_job', 10, 82, 10, 'utility', '提高 MP 成长，降低频繁补给成本。', { magicAttack: 0.6, potionIntensity: -0.01 }),
    skill('Magic Guard', 'first_job', 20, 52, 18, 'survival', '高风险图更安全，但会增加 MP 压力；当前模型偏安全加权。', { survivability: 0.014, potionIntensity: 0.004 }),
  ],
  archer: [
    skill('Double Shot', 'first_job', 20, 100, 10, 'main_attack', '前期主攻技能，直接提升单体输出。', { skillMult: 0.022 }),
    skill('The Eye of Amazon', 'first_job', 8, 86, 10, 'accuracy', '优先补射程和命中，减少低命中造成的效率损失。', { accuracy: 2.4, rangeScore: 0.025 }),
    skill('Critical Shot', 'first_job', 20, 78, 18, 'main_attack', '暴击提高平均伤害，适合中后段稳定冲级。', { critRate: 0.006, critDamage: 0.7 }),
    skill('Focus', 'first_job', 20, 48, 24, 'accuracy', '后补命中和回避，改善越级和安全性。', { accuracy: 1.4, avoid: 1.2 }),
  ],
  rogue: [
    skill('Lucky Seven / Double Stab', 'first_job', 20, 100, 10, 'main_attack', '职业核心主攻技能，早加早提高杀怪速度。', { skillMult: 0.024 }),
    skill('Nimble Body', 'first_job', 20, 86, 10, 'accuracy', '命中和回避都非常关键，直接影响越级效率和药耗。', { accuracy: 2.2, avoid: 1.8 }),
    skill('Disorder', 'first_job', 20, 45, 22, 'survival', '后补生存向效果，用于减少被怪打的压力。', { survivability: 0.006 }),
    skill('Dark Sight', 'first_job', 20, 38, 25, 'utility', '偏跑图和容错，当前模型转化为轻微风险下降。', { mobilityScore: 0.006, survivability: 0.004 }),
  ],
  pirate: [
    skill('Somersault Kick / Double Shot', 'first_job', 20, 100, 10, 'main_attack', '海盗预留模型：先加主攻技能保证练级效率。', { skillMult: 0.023 }),
    skill('Dash', 'first_job', 10, 84, 10, 'mobility', '机动提高跑图和刷图循环效率。', { mobilityScore: 0.026, attackInterval: -0.002 }),
    skill('Quick Motion', 'first_job', 20, 76, 15, 'accuracy', '命中和回避改善越级收益。', { accuracy: 1.8, avoid: 1.4 }),
    skill('Bullet Time', 'first_job', 20, 52, 22, 'utility', '后补稳定性，降低风险。', { rangeScore: 0.006, survivability: 0.005 }),
  ],
} satisfies Record<JobProfile['family'], SkillDefinition[]>;

const BUILD_CONFIGS: Record<JobKey, BuildConfig> = {
  fighter: build('warrior', 'str', 'dex', (level) => Math.max(35, level * 2), [
    skill('Sword Mastery', 'second_job', 20, 112, 30, 'mastery', '二转优先补 mastery，让最小伤害稳定，减少打怪波动。', { mastery: 0.032 }),
    skill('Sword Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升会直接提高 KPH，适合刷怪路线。', { attackInterval: -0.01 }),
    skill('Rage', 'second_job', 20, 86, 38, 'utility', '攻击力提升，越早补越能放大后续练级收益。', { weaponAttack: 0.9, attackPower: 0.45 }),
    skill('Power Guard', 'second_job', 30, 58, 45, 'survival', '后补生存，降低高密度地图药耗。', { survivability: 0.008, potionIntensity: -0.005 }),
  ]),
  page: build('warrior', 'str', 'dex', (level) => Math.max(35, level * 2), [
    skill('Sword Mastery', 'second_job', 20, 108, 30, 'mastery', '先补 mastery，保证平砍和技能伤害稳定。', { mastery: 0.032 }),
    skill('Sword Booster', 'second_job', 20, 86, 34, 'utility', '提高攻击频率，改善练级流畅度。', { attackInterval: -0.009 }),
    skill('Threaten', 'second_job', 20, 72, 38, 'survival', '安全路线收益高，减少怪物压力。', { survivability: 0.01, potionIntensity: -0.007 }),
    skill('Power Guard', 'second_job', 30, 64, 43, 'survival', '进一步降低近战药耗。', { survivability: 0.008, potionIntensity: -0.005 }),
  ]),
  spearman: build('warrior', 'str', 'dex', (level) => Math.max(35, level * 2), [
    skill('Spear Mastery', 'second_job', 20, 112, 30, 'mastery', '枪战士先补 mastery，稳定长枪输出。', { mastery: 0.032 }),
    skill('Spear Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升非常直接，改善每小时击杀数。', { attackInterval: -0.01 }),
    skill('Iron Will', 'second_job', 20, 68, 40, 'survival', '降低高密度图药耗，适合开荒容错。', { survivability: 0.008, potionIntensity: -0.006 }),
    skill('Hyper Body', 'second_job', 30, 82, 42, 'survival', '提高 HP/MP 上限，越级和组队路线价值高。', { survivability: 0.012, potionIntensity: -0.006 }),
  ]),
  fire_poison: build('magician', 'int', 'luk', (level) => level + 3, [
    skill('Fire Arrow', 'second_job', 30, 112, 30, 'main_attack', '火毒核心单体技能，直接提升魔法击杀效率。', { magicSkillDamage: 2.8, skillMult: 0.01 }),
    skill('Meditation', 'second_job', 20, 88, 35, 'utility', '魔攻提升会放大所有魔法输出。', { magicAttack: 1.2 }),
    skill('MP Eater', 'second_job', 20, 78, 38, 'utility', '降低 MP 药耗，均衡/赚钱路线收益高。', { potionIntensity: -0.012 }),
    skill('Poison Breath', 'second_job', 30, 60, 44, 'utility', '当前模型用作越级和持续伤害收益。', { aoeScore: 0.009, magicSkillDamage: 1.1 }),
  ]),
  ice_lightning: build('magician', 'int', 'luk', (level) => level + 3, [
    skill('Cold Beam', 'second_job', 30, 104, 30, 'main_attack', '冰雷核心单体技能，兼顾控场安全。', { magicSkillDamage: 2.4, survivability: 0.004 }),
    skill('Thunderbolt', 'second_job', 30, 112, 35, 'aoe', '群攻技能决定密集图效率，中期优先级很高。', { magicSkillDamage: 1.4, aoeScore: 0.018 }),
    skill('Meditation', 'second_job', 20, 88, 38, 'utility', '魔攻提升，稳定增伤。', { magicAttack: 1.15 }),
    skill('MP Eater', 'second_job', 20, 72, 42, 'utility', '降低 MP 药耗，拉高净收益。', { potionIntensity: -0.012 }),
  ]),
  cleric: build('magician', 'int', 'luk', (level) => level + 3, [
    skill('Heal', 'second_job', 30, 114, 30, 'aoe', '牧师核心，兼顾输出和续航；遇不死系后应额外加权。', { magicSkillDamage: 1.8, aoeScore: 0.016, survivability: 0.012, potionIntensity: -0.018 }),
    skill('Bless', 'second_job', 20, 86, 35, 'accuracy', '提高命中/回避/稳定性，开荒收益明显。', { accuracy: 1.6, avoid: 1.4, survivability: 0.006 }),
    skill('Invincible', 'second_job', 20, 78, 40, 'survival', '显著降低药耗和死亡风险。', { survivability: 0.012, potionIntensity: -0.01 }),
    skill('Holy Arrow', 'second_job', 30, 54, 45, 'main_attack', '后补单体输出，当前模型低于 Heal 优先级。', { magicSkillDamage: 1.55 }),
  ]),
  hunter: build('archer', 'dex', 'str', (level) => level + 5, [
    skill('Bow Mastery', 'second_job', 20, 112, 30, 'mastery', '先补 mastery，稳定远程输出。', { mastery: 0.032, accuracy: 0.6 }),
    skill('Bow Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升，直接改善 KPH。', { attackInterval: -0.01 }),
    skill('Soul Arrow', 'second_job', 20, 76, 38, 'utility', '降低补给压力，当前模型转化为轻微净收益。', { potionIntensity: -0.006, rangeScore: 0.004 }),
    skill('Arrow Bomb', 'second_job', 30, 86, 40, 'aoe', '密集地图群攻收益高，中期开始补。', { aoeScore: 0.016, skillMult: 0.01 }),
  ]),
  crossbowman: build('archer', 'dex', 'str', (level) => level + 5, [
    skill('Crossbow Mastery', 'second_job', 20, 112, 30, 'mastery', '先补 mastery，弩输出更稳定。', { mastery: 0.032, accuracy: 0.6 }),
    skill('Crossbow Booster', 'second_job', 20, 92, 34, 'utility', '提升攻击频率。', { attackInterval: -0.01 }),
    skill('Soul Arrow', 'second_job', 20, 74, 38, 'utility', '降低补给压力。', { potionIntensity: -0.006, rangeScore: 0.004 }),
    skill('Iron Arrow', 'second_job', 30, 88, 40, 'aoe', '弩二转核心穿透技能，密集直线地图收益高。', { aoeScore: 0.017, skillMult: 0.01 }),
  ]),
  assassin: build('rogue', 'luk', 'dex', (level) => Math.floor(level * 2.1), [
    skill('Claw Mastery', 'second_job', 20, 110, 30, 'mastery', '先补 mastery，稳定 Lucky Seven 后续输出。', { mastery: 0.03, accuracy: 0.5 }),
    skill('Claw Booster', 'second_job', 20, 92, 34, 'utility', '攻速提高，刺客练级收益很直接。', { attackInterval: -0.01 }),
    skill('Critical Throw', 'second_job', 30, 102, 38, 'main_attack', '暴击是刺客核心收益，中期优先拉高。', { critRate: 0.007, critDamage: 0.9 }),
    skill('Haste', 'second_job', 20, 84, 42, 'mobility', '机动提高刷图循环，也减少跑图成本。', { mobilityScore: 0.018, avoid: 1.0 }),
  ]),
  bandit: build('rogue', 'luk', 'dex', (level) => Math.floor(level * 2.1), [
    skill('Dagger Mastery', 'second_job', 20, 108, 30, 'mastery', '先补 mastery，近战爆发更稳定。', { mastery: 0.03, accuracy: 0.5 }),
    skill('Dagger Booster', 'second_job', 20, 90, 34, 'utility', '提升攻击节奏。', { attackInterval: -0.009 }),
    skill('Savage Blow', 'second_job', 30, 112, 38, 'main_attack', '侠客二转核心爆发，优先拉高。', { skillMult: 0.018 }),
    skill('Haste', 'second_job', 20, 82, 42, 'mobility', '机动改善贴怪效率和跑图成本。', { mobilityScore: 0.018, avoid: 1.0 }),
  ]),
  brawler: build('pirate', 'str', 'dex', (level) => level + 5, [
    skill('Knuckle Mastery', 'second_job', 20, 108, 30, 'mastery', '海盗预留：先补 mastery 稳定拳套输出。', { mastery: 0.03, accuracy: 0.4 }),
    skill('Knuckle Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升，提高刷怪循环。', { attackInterval: -0.01 }),
    skill('Corkscrew Blow', 'second_job', 20, 86, 38, 'main_attack', '位移/攻击结合，提高机动刷怪效率。', { skillMult: 0.014, mobilityScore: 0.01 }),
    skill('Backspin Blow', 'second_job', 20, 78, 42, 'aoe', '密集地图补群攻。', { aoeScore: 0.014, skillMult: 0.008 }),
  ]),
  gunslinger: build('pirate', 'dex', 'str', (level) => level + 5, [
    skill('Gun Mastery', 'second_job', 20, 108, 30, 'mastery', '海盗预留：先补 mastery 稳定火枪输出。', { mastery: 0.03, accuracy: 0.4 }),
    skill('Gun Booster', 'second_job', 20, 92, 34, 'utility', '攻速提升，远程职业收益直接。', { attackInterval: -0.01 }),
    skill('Invisible Shot', 'second_job', 20, 86, 38, 'aoe', '多目标清怪能力，中期优先。', { aoeScore: 0.014, skillMult: 0.008 }),
    skill('Wings', 'second_job', 10, 70, 42, 'mobility', '机动提升，改善地图循环。', { mobilityScore: 0.022 }),
  ]),
};

function skill(
  name: string,
  stage: SkillDefinition['stage'],
  maxLevel: number,
  priority: number,
  unlockLevel: number,
  role: SkillDefinition['role'],
  reason: string,
  effectPerPoint: SkillEffect,
): SkillDefinition {
  return { name, stage, maxLevel, priority, unlockLevel, role, reason, effectPerPoint };
}

function build(
  family: JobProfile['family'],
  primary: StatKey,
  secondary: StatKey,
  secondaryTarget: (level: number) => number,
  secondJobSkills: SkillDefinition[],
): BuildConfig {
  return {
    baseStats: baseStatsForFamily(family),
    primary,
    secondary,
    secondaryTarget,
    firstJobSkills: FIRST_JOB_COMMON[family],
    secondJobSkills,
  };
}

function baseStatsForFamily(family: JobProfile['family']): CharacterStats {
  if (family === 'warrior') return { str: 45, dex: 25, int: 4, luk: 4, hp: 310, mp: 70 };
  if (family === 'magician') return { str: 4, dex: 4, int: 52, luk: 13, hp: 120, mp: 260 };
  if (family === 'archer') return { str: 20, dex: 46, int: 4, luk: 4, hp: 210, mp: 110 };
  if (family === 'pirate') return { str: 28, dex: 34, int: 4, luk: 4, hp: 240, mp: 100 };
  return { str: 4, dex: 30, int: 4, luk: 40, hp: 200, mp: 120 };
}

function adjustSkillPriority(skillDef: SkillDefinition, strategy: Strategy): number {
  let priority = skillDef.priority;
  if (strategy === 'fastest' && (skillDef.role === 'main_attack' || skillDef.role === 'aoe' || skillDef.role === 'mastery')) priority += 16;
  if (strategy === 'safe' && (skillDef.role === 'survival' || skillDef.role === 'accuracy' || skillDef.role === 'mobility')) priority += 18;
  if (strategy === 'profit' && (skillDef.role === 'utility' || skillDef.role === 'survival')) priority += 12;
  if (strategy === 'balanced' && skillDef.role === 'mastery') priority += 8;
  return priority;
}

function allocateAp(level: number, config: BuildConfig, stats: CharacterStats, strategy: Strategy): Partial<Record<StatKey, number>> {
  const points = apForLevel(level);
  const allocation: Partial<Record<StatKey, number>> = {};
  if (points <= 0) return allocation;

  const secondaryNeed = Math.max(0, config.secondaryTarget(level) - stats[config.secondary]);
  const safeExtra = strategy === 'safe' ? 1 : 0;
  const secondaryPoints = clamp(Math.min(points, secondaryNeed + safeExtra), 0, strategy === 'fastest' ? 2 : 3);
  const hpPoint = strategy === 'safe' && level % 8 === 0 && config.primary !== 'int' ? 1 : 0;
  const primaryPoints = Math.max(0, points - secondaryPoints - hpPoint);

  allocation[config.primary] = (allocation[config.primary] ?? 0) + primaryPoints;
  if (secondaryPoints > 0) allocation[config.secondary] = (allocation[config.secondary] ?? 0) + secondaryPoints;
  if (hpPoint > 0) allocation.hp = (allocation.hp ?? 0) + hpPoint * 10;
  return allocation;
}

function allocateSpForLevel(
  level: number,
  config: BuildConfig,
  strategy: Strategy,
  skillLevels: Record<string, number>,
): SkillPointAllocation[] {
  let remaining = spForLevel(level);
  const allocations: SkillPointAllocation[] = [];
  if (remaining <= 0) return allocations;

  const stage = stageForLevel(level);
  const availableSkills = [
    ...(stage === 'first_job' ? config.firstJobSkills : []),
    ...(stage === 'second_job' ? config.secondJobSkills : []),
  ].filter((skillDef) => skillDef.unlockLevel <= level && (skillLevels[skillDef.name] ?? 0) < skillDef.maxLevel);

  while (remaining > 0 && availableSkills.length > 0) {
    availableSkills.sort((a, b) => adjustSkillPriority(b, strategy) - adjustSkillPriority(a, strategy));
    const selected = availableSkills[0];
    const current = skillLevels[selected.name] ?? 0;
    const add = Math.min(remaining, selected.maxLevel - current);
    skillLevels[selected.name] = current + add;
    remaining -= add;
    allocations.push({
      skill: selected.name,
      points: add,
      total: skillLevels[selected.name],
      reason: selected.reason,
    });

    if (skillLevels[selected.name] >= selected.maxLevel) {
      availableSkills.shift();
    }
  }

  return allocations;
}

function applySkillEffects(base: DerivedCombatStats, skillLevels: Record<string, number>, skills: SkillDefinition[]): DerivedCombatStats {
  const derived = { ...base };
  for (const skillDef of skills) {
    const level = skillLevels[skillDef.name] ?? 0;
    if (level <= 0) continue;
    const effect = skillDef.effectPerPoint;
    derived.skillMult += (effect.skillMult ?? 0) * level;
    derived.magicSkillDamage += (effect.magicSkillDamage ?? 0) * level;
    derived.mastery += (effect.mastery ?? 0) * level;
    derived.accuracy += (effect.accuracy ?? 0) * level;
    derived.avoid += (effect.avoid ?? 0) * level;
    derived.weaponAttack += (effect.weaponAttack ?? 0) * level;
    derived.magicAttack += (effect.magicAttack ?? 0) * level;
    derived.attackPower += (effect.attackPower ?? 0) * level;
    derived.attackInterval += (effect.attackInterval ?? 0) * level;
    derived.rangeScore += (effect.rangeScore ?? 0) * level;
    derived.aoeScore += (effect.aoeScore ?? 0) * level;
    derived.mobilityScore += (effect.mobilityScore ?? 0) * level;
    derived.survivability += (effect.survivability ?? 0) * level;
    derived.potionIntensity += (effect.potionIntensity ?? 0) * level;
    derived.critRate += (effect.critRate ?? 0) * level;
    derived.critDamage += (effect.critDamage ?? 0) * level;
  }

  derived.mastery = clamp(derived.mastery, 0, 0.78);
  derived.attackInterval = clamp(derived.attackInterval, 0.48, 1.45);
  derived.rangeScore = clamp(derived.rangeScore, 0.15, 1.25);
  derived.aoeScore = clamp(derived.aoeScore, 0.05, 1.25);
  derived.mobilityScore = clamp(derived.mobilityScore, 0.05, 1.25);
  derived.survivability = clamp(derived.survivability, 0.05, 1.35);
  derived.potionIntensity = clamp(derived.potionIntensity, 0.3, 2.2);
  derived.critRate = clamp(derived.critRate, 0, 0.8);
  derived.critDamage = clamp(derived.critDamage, 0, 180);
  return derived;
}

function deriveCombatStats(level: number, job: JobProfile, config: BuildConfig, stats: CharacterStats, skillLevels: Record<string, number>): DerivedCombatStats {
  const primaryStat = stats[config.primary];
  const secondaryStat = job.family === 'rogue' ? stats.str + stats.dex : stats[config.secondary];
  const baseAttackInterval = job.family === 'magician' ? 0.96 : job.family === 'warrior' ? 0.86 : 0.78;
  const baseMastery = level < 30 ? (job.family === 'magician' ? 0.35 : 0.1) : masteryMultiplier(1);

  const base: DerivedCombatStats = {
    primaryStat,
    secondaryStat,
    accuracy: job.accuracyBase + stats.dex * 0.72 + stats.luk * 0.28 + level * 0.6,
    avoid: 15 + stats.dex * 0.18 + stats.luk * 0.42 + level * 0.7,
    weaponAttack: job.family === 'magician' ? 0 : 12 + level * (job.family === 'warrior' ? 1.0 : job.family === 'rogue' ? 0.92 : 0.88),
    magicAttack: job.family === 'magician' ? 18 + level * 3.45 + stats.int * 0.22 : 0,
    attackPower: 5 + level * 0.42,
    mastery: baseMastery,
    skillMult: 1 + (level >= 30 ? 0.1 : 0),
    magicSkillDamage: job.family === 'magician' ? 38 + level * 1.15 : 0,
    attackInterval: baseAttackInterval + job.attackTaxSeconds - (level >= 30 ? 0.04 : 0),
    critRate: BASE_CRIT_RATE,
    critDamage: BASE_CRIT_DAMAGE,
    rangeScore: job.rangeScore,
    aoeScore: job.aoeScore,
    mobilityScore: job.mobilityScore,
    survivability: job.survivability,
    potionIntensity: job.potionIntensity,
  };

  return applySkillEffects(base, skillLevels, [...config.firstJobSkills, ...config.secondJobSkills]);
}

export function getBuildSnapshot(jobKey: JobKey, level: number, strategy: Strategy): CharacterBuildSnapshot {
  return generateAllocationPlan(jobKey, 10, Math.max(10, level), strategy).snapshots[Math.max(10, level)] ??
    generateAllocationPlan(jobKey, 10, Math.max(10, level), strategy).snapshots[10];
}

export function generateAllocationPlan(jobKey: JobKey, startLevel: number, targetLevel: number, strategy: Strategy): AllocationPlan & { snapshots: Record<number, CharacterBuildSnapshot> } {
  const job = JOB_PROFILES[jobKey];
  const config = BUILD_CONFIGS[jobKey];
  const stats: CharacterStats = { ...config.baseStats };
  const skillLevels: Record<string, number> = {};
  const steps: LevelAllocationStep[] = [];
  const snapshots: Record<number, CharacterBuildSnapshot> = {};

  for (let level = 10; level <= targetLevel; level += 1) {
    const apAllocated = allocateAp(level, config, stats, strategy);
    addStats(stats, apAllocated);

    // Natural HP/MP growth approximation. It matters for survivability/potion model, not exact UI stats.
    stats.hp += job.family === 'warrior' ? 24 : job.family === 'magician' ? 8 : 16;
    stats.mp += job.family === 'magician' ? 22 : 10;

    const spAllocated = allocateSpForLevel(level, config, strategy, skillLevels);
    const derived = deriveCombatStats(level, job, config, stats, skillLevels);
    const step: LevelAllocationStep = {
      level,
      stage: stageForLevel(level),
      apGained: apForLevel(level),
      apAllocated,
      statsAfter: { ...stats },
      spGained: spForLevel(level),
      spAllocated,
      keySkills: Object.entries(skillLevels)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, value]) => `${name} ${value}`),
      note: `${allocToText(apAllocated) || 'No AP'}；${spAllocated.map((s) => `${s.skill} +${s.points}`).join(' / ') || 'No SP'}`,
    };

    snapshots[level] = {
      level,
      jobKey,
      stats: { ...stats },
      skillLevels: { ...skillLevels },
      derived,
      step,
    };
    if (level >= startLevel) steps.push(step);
  }

  const finalSnapshot = snapshots[targetLevel] ?? snapshots[Math.max(10, startLevel)];
  const summary = [
    `AP 目标：先满足 ${config.secondary.toUpperCase()} 装备/命中需求，再把剩余 AP 投入 ${config.primary.toUpperCase()}。`,
    strategy === 'safe'
      ? '安全策略会额外保留少量副属性/HP 倾向，用来降低命中不足和药耗风险。'
      : strategy === 'fastest'
        ? '最快策略会更激进地把 AP 投入主属性，优先提高伤害。'
        : '均衡/收益策略会在主属性、命中需求和补给成本之间折中。',
    'SP 目标：一转先保证主攻和关键命中/生存技能；二转优先 mastery、booster、核心输出或群攻。',
  ];

  return {
    jobKey,
    startLevel,
    targetLevel,
    strategy,
    summary,
    finalStats: finalSnapshot.stats,
    finalDerived: finalSnapshot.derived,
    finalSkills: finalSnapshot.skillLevels,
    steps,
    snapshots,
  };
}
