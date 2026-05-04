import { meowDbPhysicalHitChance, statDerivedAccuracy } from './damageFormula';
import { buildTrainingSpots } from './data';
import { expToNextLevel } from './expTable';
import { JOB_PROFILES } from './jobs';
import { createSkillState, investSkillPoints } from './skillEconomics';
import type { GameData, JobKey, Strategy, TrainingSpot } from './types';

export type ObjectivePreset = 'fastest' | 'poor_start' | 'low_death' | 'low_potion' | 'shop_gear' | 'craft_only' | 'drop_only' | 'comfort';
export type GearSourceMode = 'shop' | 'craft' | 'drop' | 'none' | 'hybrid';

export interface BuildCandidate {
  id: string;
  label: string;
  dexPolicy: 'low' | 'standard' | 'high_accuracy' | 'weapon_req';
  gearSource: GearSourceMode;
  potionPolicy: 'cheap' | 'normal' | 'safe';
  routeRisk: 'conservative' | 'normal' | 'greedy';
  strategy: Strategy;
}

export interface LevelDecision {
  level: number;
  mapName: string;
  monsterNames: string[];
  hours: number;
  expPerHour: number;
  killsPerHour: number;
  mesoEarned: number;
  potionCost: number;
  gearCost: number;
  deathsExpected: number;
  hitRate: number;
  comfort: number;
  reason: string;
  spDecisions: string[];
  skillSnapshot: Record<string, number>;
}

export interface BuildExperimentResult {
  candidate: BuildCandidate;
  totalHours: number;
  totalMesoEarned: number;
  totalPotionCost: number;
  totalGearCost: number;
  endingMeso: number;
  expectedDeaths: number;
  comfortScore: number;
  objectiveScore: number;
  finalStats: { str: number; dex: number; int: number; luk: number; weaponAttack: number; accuracy: number; avoid: number };
  finalSkills: Record<string, number>;
  decisions: LevelDecision[];
  warnings: string[];
}

interface Stats { str: number; dex: number; int: number; luk: number; meso: number; weaponAttack: number }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const last = <T,>(a: T[]) => (a.length ? a[a.length - 1] : undefined);

function candidatesFor(objective: ObjectivePreset): BuildCandidate[] {
  const all: BuildCandidate[] = [
    { id: 'fast-low-shop', label: '快冲低 DEX 商店武器', dexPolicy: 'low', gearSource: 'shop', potionPolicy: 'normal', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'fast-std-shop', label: '快冲标准 DEX 商店武器', dexPolicy: 'standard', gearSource: 'shop', potionPolicy: 'normal', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'acc-high-shop', label: '高命中越级商店武器', dexPolicy: 'high_accuracy', gearSource: 'shop', potionPolicy: 'safe', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'poor-low-none', label: '穷鬼低 DEX 不买装备', dexPolicy: 'low', gearSource: 'none', potionPolicy: 'cheap', routeRisk: 'conservative', strategy: 'safe' },
    { id: 'poor-std-drop', label: '穷鬼标准 DEX 靠怪物掉落', dexPolicy: 'standard', gearSource: 'drop', potionPolicy: 'cheap', routeRisk: 'normal', strategy: 'profit' },
    { id: 'safe-high-shop', label: '低死亡高命中商店武器', dexPolicy: 'high_accuracy', gearSource: 'shop', potionPolicy: 'safe', routeRisk: 'conservative', strategy: 'safe' },
    { id: 'craft-std', label: '锻造自给标准 DEX', dexPolicy: 'standard', gearSource: 'craft', potionPolicy: 'normal', routeRisk: 'normal', strategy: 'balanced' },
    { id: 'comfort-hybrid', label: '综合爽玩混合装备', dexPolicy: 'weapon_req', gearSource: 'hybrid', potionPolicy: 'safe', routeRisk: 'normal', strategy: 'balanced' },
  ];
  if (objective === 'fastest') return all.filter((x) => x.strategy === 'fastest' || x.routeRisk === 'greedy');
  if (objective === 'poor_start') return all.filter((x) => x.potionPolicy === 'cheap' || x.gearSource === 'none' || x.gearSource === 'drop');
  if (objective === 'low_death') return all.filter((x) => x.routeRisk === 'conservative' || x.potionPolicy === 'safe');
  if (objective === 'low_potion') return all.filter((x) => x.potionPolicy !== 'safe');
  if (objective === 'shop_gear') return all.filter((x) => x.gearSource === 'shop');
  if (objective === 'craft_only') return all.filter((x) => x.gearSource === 'craft');
  if (objective === 'drop_only') return all.filter((x) => x.gearSource === 'drop');
  return all;
}

function baseStats(jobKey: JobKey): Stats {
  const family = JOB_PROFILES[jobKey].family;
  if (family === 'warrior') return { str: 45, dex: 25, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  if (family === 'magician') return { str: 4, dex: 4, int: 52, luk: 13, meso: 0, weaponAttack: 0 };
  if (family === 'archer') return { str: 20, dex: 46, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  if (family === 'pirate') return { str: 28, dex: 34, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  return { str: 4, dex: 30, int: 4, luk: 40, meso: 0, weaponAttack: 27 };
}

function targetSecondary(jobKey: JobKey, level: number, policy: BuildCandidate['dexPolicy']): number {
  const family = JOB_PROFILES[jobKey].family;
  let target = family === 'warrior' ? level + 5 : family === 'magician' ? level + 3 : family === 'rogue' ? Math.floor(level * 2) : level + 5;
  if (policy === 'low') target -= 8;
  if (policy === 'high_accuracy') target += 12;
  if (policy === 'weapon_req') target += 4;
  return Math.max(4, target);
}

function allocateAp(stats: Stats, jobKey: JobKey, level: number, c: BuildCandidate) {
  if (level <= 10) return;
  const job = JOB_PROFILES[jobKey];
  let remaining = 5;
  const secondaryKey: keyof Stats = job.family === 'magician' ? 'luk' : job.family === 'archer' ? 'str' : job.family === 'rogue' ? 'dex' : job.key === 'gunslinger' ? 'str' : 'dex';
  const primaryKey: keyof Stats = job.family === 'magician' ? 'int' : job.family === 'archer' ? 'dex' : job.family === 'rogue' ? 'luk' : job.key === 'gunslinger' ? 'dex' : 'str';
  const need = Math.max(0, targetSecondary(jobKey, level, c.dexPolicy) - Number(stats[secondaryKey]));
  const addSecondary = Math.min(remaining, need);
  stats[secondaryKey] = Number(stats[secondaryKey]) + addSecondary;
  remaining -= addSecondary;
  stats[primaryKey] = Number(stats[primaryKey]) + remaining;
}

function accuracy(stats: Stats, jobKey: JobKey, skillAcc = 0): number {
  const job = JOB_PROFILES[jobKey];
  if (job.family === 'magician') return 9999;
  return statDerivedAccuracy(stats.dex, stats.luk) + skillAcc;
}

function avoid(stats: Stats, level: number, skillAvoid = 0): number {
  return 15 + stats.dex * 0.18 + stats.luk * 0.42 + level * 0.7 + skillAvoid;
}

function upgradeWeapon(stats: Stats, level: number, c: BuildCandidate): number {
  if (c.gearSource === 'none') return 0;
  const table = [
    { level: 10, watk: 27, cost: 1500 }, { level: 15, watk: 32, cost: 2500 }, { level: 20, watk: 37, cost: 3500 },
    { level: 25, watk: 42, cost: 4500 }, { level: 30, watk: 50, cost: 5500 }, { level: 35, watk: 55, cost: 7500 },
    { level: 40, watk: 60, cost: 9500 }, { level: 50, watk: 70, cost: 13500 },
  ];
  const target = last(table.filter((x) => x.level <= level && x.watk > stats.weaponAttack));
  if (!target) return 0;
  let cost = target.cost;
  if (c.gearSource === 'craft') cost *= 0.65;
  if (c.gearSource === 'drop') cost = 0;
  if (c.gearSource === 'hybrid') cost *= 0.8;
  if (stats.meso < cost) return 0;
  stats.meso -= cost;
  stats.weaponAttack = target.watk;
  return cost;
}

function mapSuitability(spot: TrainingSpot, jobKey: JobKey): number {
  const job = JOB_PROFILES[jobKey];
  let s = 1;
  if (spot.totalMobCount >= 14) s += job.aoeScore * 0.18;
  if (job.rangeScore > 0.7 && spot.totalMobCount <= 10) s += 0.08;
  if (job.mobilityScore < 0.45 && spot.totalMobCount < 8) s -= 0.08;
  return clamp(s, 0.65, 1.35);
}

const spForLevel = (level: number) => (level < 10 ? 0 : level === 10 || level === 30 ? 1 : 3);
const mesoPerKill = (level: number, exp: number, c: BuildCandidate) => level * 2.2 + exp * 0.45 + (c.gearSource === 'drop' ? level * 1.2 : c.gearSource === 'craft' ? level * 0.8 : 0);

function estimateSpot(spot: TrainingSpot, level: number, jobKey: JobKey, stats: Stats, c: BuildCandidate, skill: ReturnType<typeof createSkillState>, objective: ObjectivePreset): LevelDecision {
  const acc = accuracy(stats, jobKey, skill.accuracyBonus);
  const avd = avoid(stats, level, skill.avoidBonus);
  const mobAvoid = spot.mobs.reduce((sum, x) => sum + (x.monster.eva ?? 0) * x.count, 0) / Math.max(1, spot.totalMobCount);
  const hitRate = JOB_PROFILES[jobKey].family === 'magician' ? 1 : meowDbPhysicalHitChance({ playerLevel: level, monsterLevel: spot.avgLevel, accuracy: acc, avoid: mobAvoid });
  const levelPenalty = spot.avgLevel > level ? 1 / (1 + (spot.avgLevel - level) * 0.08) : 1;
  const damage = (stats.weaponAttack * 2.6 + stats.str * 1.35 + stats.dex * 0.35 + stats.luk * 0.45 + stats.int * 0.25) * hitRate * levelPenalty * skill.damageMultiplier;
  const killSeconds = clamp(spot.avgHp / Math.max(1, damage) + 0.75, 0.65, 18) / skill.speedMultiplier;
  const killsPerHour = Math.min((3600 / killSeconds) * mapSuitability(spot, jobKey), spot.totalMobCount * 900);
  const expPerHour = killsPerHour * spot.avgExp;
  const hours = expToNextLevel(level) / Math.max(1, expPerHour);
  const incoming = spot.mobs.reduce((sum, x) => sum + Math.max(x.monster.PADamage ?? 0, x.monster.MADamage ?? 0) * x.count, 0) / Math.max(1, spot.totalMobCount);
  const risk = c.routeRisk === 'greedy' ? 1.15 : c.routeRisk === 'conservative' ? 0.82 : 1;
  const deathRisk = clamp(((spot.avgLevel - level + 5) / 18) * risk + incoming / 900 - avd / 650 - skill.survivalBonus, 0, 0.35);
  const deathsExpected = deathRisk * hours;
  const mpPressure = Math.max(0, skill.mpCostPerKill - skill.mpSavePerKill) * killsPerHour * hours * (objective === 'poor_start' || objective === 'low_potion' ? 2.2 : 1);
  const potionBase = c.potionPolicy === 'cheap' ? 0.55 : c.potionPolicy === 'safe' ? 1.35 : 1;
  const potionCost = Math.max(0, hours * killsPerHour * deathRisk * potionBase * (1.8 + level * 0.15) + mpPressure);
  const mesoEarned = hours * killsPerHour * mesoPerKill(spot.avgLevel, spot.avgExp, c);
  const spDecisions = investSkillPoints(skill, { jobKey, level, objective, hitRate, deathRisk, mesoPressure: potionCost / Math.max(1, mesoEarned) }, spForLevel(level));
  const comfort = clamp(100 - deathRisk * 140 - Math.max(0, 0.95 - hitRate) * 55 - killSeconds * 2.2 - mpPressure / 2500, 0, 100);
  return {
    level,
    mapName: spot.mapName,
    monsterNames: spot.mobs.slice(0, 3).map((x) => x.monster.name),
    hours,
    expPerHour,
    killsPerHour,
    mesoEarned,
    potionCost,
    gearCost: 0,
    deathsExpected,
    hitRate,
    comfort,
    reason: hitRate < 0.75 ? 'MeowDB 命中公式判定命中不足，效率下降' : deathsExpected > 0.2 ? '风险较高但收益可观' : '综合效率较好',
    spDecisions,
    skillSnapshot: { ...skill.levels },
  };
}

function scoreResult(r: Omit<BuildExperimentResult, 'objectiveScore'>, objective: ObjectivePreset): number {
  const time = -r.totalHours * 10;
  const meso = r.endingMeso / 1800;
  const potion = -r.totalPotionCost / 1200;
  const gear = -r.totalGearCost / 2500;
  const death = -r.expectedDeaths * 60;
  const comfort = r.comfortScore;
  if (objective === 'fastest') return time + death * 0.25 + comfort * 0.2;
  if (objective === 'poor_start') return time * 0.35 + meso + potion * 1.6 + gear * 1.4 + death * 0.45;
  if (objective === 'low_death') return death * 2 + comfort + time * 0.25;
  if (objective === 'low_potion') return potion * 2 + meso + death * 0.6 + time * 0.35;
  return time * 0.55 + meso * 0.55 + potion * 0.75 + death * 0.85 + comfort;
}

export function runBuildExperiments(data: GameData, jobKey: JobKey, startLevel: number, targetLevel: number, objective: ObjectivePreset): BuildExperimentResult[] {
  const spots = buildTrainingSpots(data);
  const out: BuildExperimentResult[] = [];
  for (const c of candidatesFor(objective)) {
    const stats = baseStats(jobKey);
    const skill = createSkillState();
    const decisions: LevelDecision[] = [];
    let totalGearCost = 0;
    const warnings: string[] = [];
    for (let level = Math.max(10, startLevel); level < targetLevel; level += 1) {
      allocateAp(stats, jobKey, level, c);
      totalGearCost += upgradeWeapon(stats, level, c);
      const eligible = spots.filter((s) => c.routeRisk === 'conservative' ? s.avgLevel <= level + 3 && s.avgLevel >= level - 8 : c.routeRisk === 'greedy' ? s.avgLevel <= level + 9 && s.avgLevel >= level - 10 : s.avgLevel <= level + 6 && s.avgLevel >= level - 9);
      const best = eligible.map((s) => estimateSpot(s, level, jobKey, stats, c, skill, objective)).sort((a, b) => (b.expPerHour - b.potionCost * 0.8 - b.deathsExpected * 8000 + b.comfort * 40) - (a.expPerHour - a.potionCost * 0.8 - a.deathsExpected * 8000 + a.comfort * 40))[0];
      if (!best) { warnings.push(`Lv.${level} 没有候选地图。`); break; }
      stats.meso += best.mesoEarned - best.potionCost;
      best.gearCost = totalGearCost;
      decisions.push(best);
    }
    const totalHours = decisions.reduce((s, x) => s + x.hours, 0);
    const totalMesoEarned = decisions.reduce((s, x) => s + x.mesoEarned, 0);
    const totalPotionCost = decisions.reduce((s, x) => s + x.potionCost, 0);
    const expectedDeaths = decisions.reduce((s, x) => s + x.deathsExpected, 0);
    const comfortScore = decisions.length ? decisions.reduce((s, x) => s + x.comfort, 0) / decisions.length : 0;
    const shell: Omit<BuildExperimentResult, 'objectiveScore'> = {
      candidate: c,
      totalHours: round(totalHours),
      totalMesoEarned: Math.round(totalMesoEarned),
      totalPotionCost: Math.round(totalPotionCost),
      totalGearCost: Math.round(totalGearCost),
      endingMeso: Math.round(stats.meso),
      expectedDeaths: round(expectedDeaths, 2),
      comfortScore: round(comfortScore, 1),
      finalStats: { str: Math.round(stats.str), dex: Math.round(stats.dex), int: Math.round(stats.int), luk: Math.round(stats.luk), weaponAttack: Math.round(stats.weaponAttack), accuracy: Math.round(accuracy(stats, jobKey, skill.accuracyBonus)), avoid: Math.round(avoid(stats, targetLevel, skill.avoidBonus)) },
      finalSkills: { ...skill.levels },
      decisions,
      warnings,
    };
    out.push({ ...shell, objectiveScore: round(scoreResult(shell, objective), 2) });
  }
  return out.sort((a, b) => b.objectiveScore - a.objectiveScore);
}
