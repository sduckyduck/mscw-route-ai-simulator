import { meowDbPhysicalHitChance, statDerivedAccuracy } from './damageFormula';
import { buildTrainingSpots } from './data';
import { expToNextLevel } from './expTable';
import { JOB_PROFILES } from './jobs';
import { createSkillState, investSkillPoints, type SkillState } from './skillEconomics';
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
  apDecision: string;
  gearDecision: string;
  spDecisions: string[];
  skillSnapshot: Record<string, number>;
  statSnapshot: { str: number; dex: number; int: number; luk: number; weaponAttack: number; accuracy: number; avoid: number; meso: number };
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

function allocateAp(stats: Stats, jobKey: JobKey, level: number, candidate: BuildCandidate): string {
  if (level <= 10) return '转职起点：本级不分配 AP';
  const before = { ...stats };
  const job = JOB_PROFILES[jobKey];
  let remaining = 5;
  const secondaryKey: keyof Stats = job.family === 'magician' ? 'luk' : job.family === 'archer' ? 'str' : job.family === 'rogue' ? 'dex' : job.key === 'gunslinger' ? 'str' : 'dex';
  const primaryKey: keyof Stats = job.family === 'magician' ? 'int' : job.family === 'archer' ? 'dex' : job.family === 'rogue' ? 'luk' : job.key === 'gunslinger' ? 'dex' : 'str';
  const need = Math.max(0, targetSecondary(jobKey, level, candidate.dexPolicy) - Number(stats[secondaryKey]));
  const addSecondary = Math.min(remaining, need);
  stats[secondaryKey] = Number(stats[secondaryKey]) + addSecondary;
  remaining -= addSecondary;
  stats[primaryKey] = Number(stats[primaryKey]) + remaining;

  const parts: string[] = [];
  if (Number(stats[primaryKey]) > Number(before[primaryKey])) parts.push(`${String(primaryKey).toUpperCase()} +${Number(stats[primaryKey]) - Number(before[primaryKey])}`);
  if (Number(stats[secondaryKey]) > Number(before[secondaryKey])) parts.push(`${String(secondaryKey).toUpperCase()} +${Number(stats[secondaryKey]) - Number(before[secondaryKey])}`);
  return parts.length ? parts.join(' / ') : '本级未改变属性';
}

function accuracy(stats: Stats, jobKey: JobKey, skillAcc = 0): number {
  const job = JOB_PROFILES[jobKey];
  if (job.family === 'magician') return 9999;
  return statDerivedAccuracy(stats.dex, stats.luk) + skillAcc;
}

function avoid(stats: Stats, level: number, skillAvoid = 0): number {
  return 15 + stats.dex * 0.18 + stats.luk * 0.42 + level * 0.7 + skillAvoid;
}

function upgradeWeapon(stats: Stats, level: number, candidate: BuildCandidate): { cost: number; text: string } {
  if (candidate.gearSource === 'none') return { cost: 0, text: '装备策略：不主动购买装备' };
  const table = [
    { level: 10, watk: 27, cost: 1500 }, { level: 15, watk: 32, cost: 2500 }, { level: 20, watk: 37, cost: 3500 },
    { level: 25, watk: 42, cost: 4500 }, { level: 30, watk: 50, cost: 5500 }, { level: 35, watk: 55, cost: 7500 },
    { level: 40, watk: 60, cost: 9500 }, { level: 50, watk: 70, cost: 13500 },
  ];
  const target = last(table.filter((x) => x.level <= level && x.watk > stats.weaponAttack));
  if (!target) return { cost: 0, text: '当前武器足够或无可升级武器' };
  let cost = target.cost;
  if (candidate.gearSource === 'craft') cost *= 0.65;
  if (candidate.gearSource === 'drop') cost = 0;
  if (candidate.gearSource === 'hybrid') cost *= 0.8;
  if (stats.meso < cost) return { cost: 0, text: `金币不足，暂不升级到 WATK ${target.watk}` };
  stats.meso -= cost;
  stats.weaponAttack = target.watk;
  return { cost, text: cost > 0 ? `花费 ${Math.round(cost).toLocaleString()} 升级到 WATK ${target.watk}` : `通过 ${candidate.gearSource} 获得 WATK ${target.watk}` };
}

function mapSuitability(spot: TrainingSpot, jobKey: JobKey): number {
  const job = JOB_PROFILES[jobKey];
  let score = 1;
  if (spot.totalMobCount >= 14) score += job.aoeScore * 0.18;
  if (job.rangeScore > 0.7 && spot.totalMobCount <= 10) score += 0.08;
  if (job.mobilityScore < 0.45 && spot.totalMobCount < 8) score -= 0.08;
  return clamp(score, 0.65, 1.35);
}

const spForLevel = (level: number) => (level < 10 ? 0 : level === 10 || level === 30 ? 1 : 3);
const mesoPerKill = (level: number, exp: number, candidate: BuildCandidate) => level * 2.2 + exp * 0.45 + (candidate.gearSource === 'drop' ? level * 1.2 : candidate.gearSource === 'craft' ? level * 0.8 : 0);

function estimateSpot(
  spot: TrainingSpot,
  level: number,
  jobKey: JobKey,
  stats: Stats,
  candidate: BuildCandidate,
  skill: SkillState,
  objective: ObjectivePreset,
  apDecision: string,
  gearDecision: string,
  gearCost: number,
  spDecisions: string[],
): LevelDecision {
  const acc = accuracy(stats, jobKey, skill.accuracyBonus);
  const avd = avoid(stats, level, skill.avoidBonus);
  const mobAvoid = spot.mobs.reduce((sum, item) => sum + (item.monster.eva ?? 0) * item.count, 0) / Math.max(1, spot.totalMobCount);
  const hitRate = JOB_PROFILES[jobKey].family === 'magician' ? 1 : meowDbPhysicalHitChance({ playerLevel: level, monsterLevel: spot.avgLevel, accuracy: acc, avoid: mobAvoid });
  const levelPenalty = spot.avgLevel > level ? 1 / (1 + (spot.avgLevel - level) * 0.08) : 1;
  const damage = (stats.weaponAttack * 2.6 + stats.str * 1.35 + stats.dex * 0.35 + stats.luk * 0.45 + stats.int * 0.25) * hitRate * levelPenalty * skill.damageMultiplier;
  const killSeconds = clamp(spot.avgHp / Math.max(1, damage) + 0.75, 0.65, 18) / skill.speedMultiplier;
  const killsPerHour = Math.min((3600 / killSeconds) * mapSuitability(spot, jobKey), spot.totalMobCount * 900);
  const expPerHour = killsPerHour * spot.avgExp;
  const hours = expToNextLevel(level) / Math.max(1, expPerHour);
  const incoming = spot.mobs.reduce((sum, item) => sum + Math.max(item.monster.PADamage ?? 0, item.monster.MADamage ?? 0) * item.count, 0) / Math.max(1, spot.totalMobCount);
  const risk = candidate.routeRisk === 'greedy' ? 1.15 : candidate.routeRisk === 'conservative' ? 0.82 : 1;
  const deathRisk = clamp(((spot.avgLevel - level + 5) / 18) * risk + incoming / 900 - avd / 650 - skill.survivalBonus, 0, 0.35);
  const deathsExpected = deathRisk * hours;
  const mpPressure = Math.max(0, skill.mpCostPerKill - skill.mpSavePerKill) * killsPerHour * hours * (objective === 'poor_start' || objective === 'low_potion' ? 2.2 : 1);
  const potionBase = candidate.potionPolicy === 'cheap' ? 0.55 : candidate.potionPolicy === 'safe' ? 1.35 : 1;
  const potionCost = Math.max(0, hours * killsPerHour * deathRisk * potionBase * (1.8 + level * 0.15) + mpPressure);
  const mesoEarned = hours * killsPerHour * mesoPerKill(spot.avgLevel, spot.avgExp, candidate);
  const comfort = clamp(100 - deathRisk * 140 - Math.max(0, 0.95 - hitRate) * 55 - killSeconds * 2.2 - mpPressure / 2500, 0, 100);

  return {
    level,
    mapName: spot.mapName,
    monsterNames: spot.mobs.slice(0, 3).map((item) => item.monster.name),
    hours,
    expPerHour,
    killsPerHour,
    mesoEarned,
    potionCost,
    gearCost,
    deathsExpected,
    hitRate,
    comfort,
    reason: hitRate < 0.75 ? 'MeowDB 命中公式判定命中不足，效率下降' : deathsExpected > 0.2 ? '风险较高但收益可观' : '综合效率较好',
    apDecision,
    gearDecision,
    spDecisions,
    skillSnapshot: { ...skill.levels },
    statSnapshot: {
      str: Math.round(stats.str),
      dex: Math.round(stats.dex),
      int: Math.round(stats.int),
      luk: Math.round(stats.luk),
      weaponAttack: Math.round(stats.weaponAttack),
      accuracy: Math.round(acc),
      avoid: Math.round(avd),
      meso: Math.round(stats.meso),
    },
  };
}

function decisionScore(decision: LevelDecision): number {
  return decision.expPerHour - decision.potionCost * 0.8 - decision.deathsExpected * 8000 + decision.comfort * 40;
}

function scoreResult(result: Omit<BuildExperimentResult, 'objectiveScore'>, objective: ObjectivePreset): number {
  const time = -result.totalHours * 10;
  const meso = result.endingMeso / 1800;
  const potion = -result.totalPotionCost / 1200;
  const gear = -result.totalGearCost / 2500;
  const death = -result.expectedDeaths * 60;
  const comfort = result.comfortScore;
  if (objective === 'fastest') return time + death * 0.25 + comfort * 0.2;
  if (objective === 'poor_start') return time * 0.35 + meso + potion * 1.6 + gear * 1.4 + death * 0.45;
  if (objective === 'low_death') return death * 2 + comfort + time * 0.25;
  if (objective === 'low_potion') return potion * 2 + meso + death * 0.6 + time * 0.35;
  return time * 0.55 + meso * 0.55 + potion * 0.75 + death * 0.85 + comfort;
}

export function runBuildExperiments(data: GameData, jobKey: JobKey, startLevel: number, targetLevel: number, objective: ObjectivePreset): BuildExperimentResult[] {
  const spots = buildTrainingSpots(data);
  const results: BuildExperimentResult[] = [];

  for (const candidate of candidatesFor(objective)) {
    const stats = baseStats(jobKey);
    const skill = createSkillState();
    const decisions: LevelDecision[] = [];
    let totalGearCost = 0;
    const warnings: string[] = [];

    for (let level = Math.max(10, startLevel); level < targetLevel; level += 1) {
      const apDecision = allocateAp(stats, jobKey, level, candidate);
      const gear = upgradeWeapon(stats, level, candidate);
      totalGearCost += gear.cost;

      const eligible = spots.filter((spot) => {
        if (candidate.routeRisk === 'conservative') return spot.avgLevel <= level + 3 && spot.avgLevel >= level - 8;
        if (candidate.routeRisk === 'greedy') return spot.avgLevel <= level + 9 && spot.avgLevel >= level - 10;
        return spot.avgLevel <= level + 6 && spot.avgLevel >= level - 9;
      });

      const preliminary = eligible
        .map((spot) => estimateSpot(spot, level, jobKey, stats, candidate, skill, objective, apDecision, gear.text, gear.cost, []))
        .sort((a, b) => decisionScore(b) - decisionScore(a))[0];

      if (!preliminary) {
        warnings.push(`Lv.${level} 没有候选地图。`);
        break;
      }

      const spDecisions = investSkillPoints(
        skill,
        {
          jobKey,
          level,
          objective,
          hitRate: preliminary.hitRate,
          deathRisk: preliminary.deathsExpected / Math.max(0.01, preliminary.hours),
          mesoPressure: preliminary.potionCost / Math.max(1, preliminary.mesoEarned),
        },
        spForLevel(level),
      );

      const best = eligible
        .map((spot) => estimateSpot(spot, level, jobKey, stats, candidate, skill, objective, apDecision, gear.text, gear.cost, spDecisions))
        .sort((a, b) => decisionScore(b) - decisionScore(a))[0];

      if (!best) {
        warnings.push(`Lv.${level} 没有候选地图。`);
        break;
      }

      stats.meso += best.mesoEarned - best.potionCost;
      decisions.push(best);
    }

    const totalHours = decisions.reduce((sum, item) => sum + item.hours, 0);
    const totalMesoEarned = decisions.reduce((sum, item) => sum + item.mesoEarned, 0);
    const totalPotionCost = decisions.reduce((sum, item) => sum + item.potionCost, 0);
    const expectedDeaths = decisions.reduce((sum, item) => sum + item.deathsExpected, 0);
    const comfortScore = decisions.length ? decisions.reduce((sum, item) => sum + item.comfort, 0) / decisions.length : 0;
    const shell: Omit<BuildExperimentResult, 'objectiveScore'> = {
      candidate,
      totalHours: round(totalHours),
      totalMesoEarned: Math.round(totalMesoEarned),
      totalPotionCost: Math.round(totalPotionCost),
      totalGearCost: Math.round(totalGearCost),
      endingMeso: Math.round(stats.meso),
      expectedDeaths: round(expectedDeaths, 2),
      comfortScore: round(comfortScore, 1),
      finalStats: {
        str: Math.round(stats.str),
        dex: Math.round(stats.dex),
        int: Math.round(stats.int),
        luk: Math.round(stats.luk),
        weaponAttack: Math.round(stats.weaponAttack),
        accuracy: Math.round(accuracy(stats, jobKey, skill.accuracyBonus)),
        avoid: Math.round(avoid(stats, targetLevel, skill.avoidBonus)),
      },
      finalSkills: { ...skill.levels },
      decisions,
      warnings,
    };
    results.push({ ...shell, objectiveScore: round(scoreResult(shell, objective), 2) });
  }

  return results.sort((a, b) => b.objectiveScore - a.objectiveScore);
}
