import { buildTrainingSpots } from './data';
import { expToNextLevel } from './expTable';
import { JOB_PROFILES } from './jobs';
import type { GameData, JobKey, Strategy, TrainingSpot } from './types';

export type ObjectivePreset =
  | 'fastest'
  | 'poor_start'
  | 'low_death'
  | 'low_potion'
  | 'shop_gear'
  | 'craft_only'
  | 'drop_only'
  | 'comfort';

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
  finalStats: {
    str: number;
    dex: number;
    int: number;
    luk: number;
    weaponAttack: number;
    accuracy: number;
    avoid: number;
  };
  decisions: LevelDecision[];
  warnings: string[];
}

interface InternalStats {
  str: number;
  dex: number;
  int: number;
  luk: number;
  meso: number;
  weaponAttack: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function lastOrUndefined<T>(values: T[]): T | undefined {
  return values.length ? values[values.length - 1] : undefined;
}

function makeCandidates(objective: ObjectivePreset): BuildCandidate[] {
  const base: BuildCandidate[] = [
    { id: 'fast-low-shop', label: '快冲低 DEX 商店武器', dexPolicy: 'low', gearSource: 'shop', potionPolicy: 'normal', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'fast-std-shop', label: '快冲标准 DEX 商店武器', dexPolicy: 'standard', gearSource: 'shop', potionPolicy: 'normal', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'acc-high-shop', label: '高命中越级商店武器', dexPolicy: 'high_accuracy', gearSource: 'shop', potionPolicy: 'safe', routeRisk: 'greedy', strategy: 'fastest' },
    { id: 'poor-low-none', label: '穷鬼低 DEX 不买装备', dexPolicy: 'low', gearSource: 'none', potionPolicy: 'cheap', routeRisk: 'conservative', strategy: 'safe' },
    { id: 'poor-std-drop', label: '穷鬼标准 DEX 靠怪物掉落', dexPolicy: 'standard', gearSource: 'drop', potionPolicy: 'cheap', routeRisk: 'normal', strategy: 'profit' },
    { id: 'safe-high-shop', label: '低死亡高命中商店武器', dexPolicy: 'high_accuracy', gearSource: 'shop', potionPolicy: 'safe', routeRisk: 'conservative', strategy: 'safe' },
    { id: 'craft-std', label: '锻造自给标准 DEX', dexPolicy: 'standard', gearSource: 'craft', potionPolicy: 'normal', routeRisk: 'normal', strategy: 'balanced' },
    { id: 'comfort-hybrid', label: '综合爽玩混合装备', dexPolicy: 'weapon_req', gearSource: 'hybrid', potionPolicy: 'safe', routeRisk: 'normal', strategy: 'balanced' },
  ];

  if (objective === 'fastest') return base.filter((x) => x.strategy === 'fastest' || x.routeRisk === 'greedy');
  if (objective === 'poor_start') return base.filter((x) => x.potionPolicy === 'cheap' || x.gearSource === 'none' || x.gearSource === 'drop');
  if (objective === 'low_death') return base.filter((x) => x.routeRisk === 'conservative' || x.potionPolicy === 'safe');
  if (objective === 'low_potion') return base.filter((x) => x.potionPolicy !== 'safe');
  if (objective === 'shop_gear') return base.filter((x) => x.gearSource === 'shop');
  if (objective === 'craft_only') return base.filter((x) => x.gearSource === 'craft');
  if (objective === 'drop_only') return base.filter((x) => x.gearSource === 'drop');
  return base;
}

function baseStats(jobKey: JobKey): InternalStats {
  const job = JOB_PROFILES[jobKey];
  if (job.family === 'warrior') return { str: 45, dex: 25, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  if (job.family === 'magician') return { str: 4, dex: 4, int: 52, luk: 13, meso: 0, weaponAttack: 0 };
  if (job.family === 'archer') return { str: 20, dex: 46, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  if (job.family === 'pirate') return { str: 28, dex: 34, int: 4, luk: 4, meso: 0, weaponAttack: 27 };
  return { str: 4, dex: 30, int: 4, luk: 40, meso: 0, weaponAttack: 27 };
}

function targetSecondary(jobKey: JobKey, level: number, dexPolicy: BuildCandidate['dexPolicy']): number {
  const job = JOB_PROFILES[jobKey];
  let target: number;
  if (job.family === 'warrior') target = level + 5;
  else if (job.family === 'magician') target = level + 3;
  else if (job.family === 'rogue') target = Math.floor(level * 2.0);
  else target = level + 5;

  if (dexPolicy === 'low') target -= 8;
  if (dexPolicy === 'high_accuracy') target += 12;
  if (dexPolicy === 'weapon_req') target += 4;
  return Math.max(4, target);
}

function allocateAp(stats: InternalStats, jobKey: JobKey, level: number, candidate: BuildCandidate): void {
  if (level <= 10) return;
  const job = JOB_PROFILES[jobKey];
  let remaining = 5;
  const secondaryTarget = targetSecondary(jobKey, level, candidate.dexPolicy);

  const secondaryKey: keyof InternalStats = job.family === 'magician' ? 'luk' : job.family === 'archer' ? 'str' : job.family === 'rogue' ? 'dex' : job.key === 'gunslinger' ? 'str' : 'dex';
  const primaryKey: keyof InternalStats = job.family === 'magician' ? 'int' : job.family === 'archer' ? 'dex' : job.family === 'rogue' ? 'luk' : job.key === 'gunslinger' ? 'dex' : 'str';
  const need = Math.max(0, secondaryTarget - Number(stats[secondaryKey]));
  const toSecondary = Math.min(remaining, need);
  stats[secondaryKey] = Number(stats[secondaryKey]) + toSecondary;
  remaining -= toSecondary;
  stats[primaryKey] = Number(stats[primaryKey]) + remaining;
}

function estimateAccuracy(stats: InternalStats, jobKey: JobKey, level: number): number {
  const job = JOB_PROFILES[jobKey];
  return job.accuracyBase + stats.dex * 0.75 + stats.luk * 0.25 + level * 0.65;
}

function estimateAvoid(stats: InternalStats, level: number): number {
  return 15 + stats.dex * 0.18 + stats.luk * 0.42 + level * 0.7;
}

function estimateRequiredAccuracy(monsterLevel: number, monsterEva: number, playerLevel: number): number {
  const levelGap = Math.max(0, monsterLevel - playerLevel);
  return 32 + monsterEva * 3.8 + levelGap * 11;
}

function upgradeWeapon(stats: InternalStats, level: number, candidate: BuildCandidate): number {
  if (candidate.gearSource === 'none') return 0;

  const shopProgression = [
    { level: 10, watk: 27, cost: 1500 },
    { level: 15, watk: 32, cost: 2500 },
    { level: 20, watk: 37, cost: 3500 },
    { level: 25, watk: 42, cost: 4500 },
    { level: 30, watk: 50, cost: 5500 },
    { level: 35, watk: 55, cost: 7500 },
    { level: 40, watk: 60, cost: 9500 },
    { level: 50, watk: 70, cost: 13500 },
  ];
  const target = lastOrUndefined(shopProgression.filter((x) => x.level <= level && x.watk > stats.weaponAttack));
  if (!target) return 0;

  let cost = target.cost;
  if (candidate.gearSource === 'craft') cost *= 0.65;
  if (candidate.gearSource === 'drop') cost = 0;
  if (candidate.gearSource === 'hybrid') cost *= 0.8;

  if (stats.meso >= cost) {
    stats.meso -= cost;
    stats.weaponAttack = target.watk;
    return cost;
  }
  return 0;
}

function mesoPerKill(monsterLevel: number, monsterExp: number, candidate: BuildCandidate): number {
  let value = monsterLevel * 2.2 + monsterExp * 0.45;
  if (candidate.gearSource === 'drop') value += monsterLevel * 1.2;
  if (candidate.gearSource === 'craft') value += monsterLevel * 0.8;
  return value;
}

function mapSuitability(spot: TrainingSpot, jobKey: JobKey): number {
  const job = JOB_PROFILES[jobKey];
  let score = 1;
  if (spot.totalMobCount >= 14) score += job.aoeScore * 0.18;
  if (job.rangeScore > 0.7 && spot.totalMobCount <= 10) score += 0.08;
  if (job.mobilityScore < 0.45 && spot.totalMobCount < 8) score -= 0.08;
  return clamp(score, 0.65, 1.35);
}

function estimateSpotForCandidate(spot: TrainingSpot, level: number, jobKey: JobKey, stats: InternalStats, candidate: BuildCandidate): LevelDecision {
  const accuracy = estimateAccuracy(stats, jobKey, level);
  const avoid = estimateAvoid(stats, level);
  const avgEva = spot.mobs.reduce((sum, x) => sum + (x.monster.eva ?? 0) * x.count, 0) / Math.max(1, spot.totalMobCount);
  const requiredAcc = estimateRequiredAccuracy(spot.avgLevel, avgEva, level);
  const hitRate = clamp(accuracy / requiredAcc, 0.05, 1);
  const levelPenalty = spot.avgLevel > level ? 1 / (1 + (spot.avgLevel - level) * 0.08) : 1;
  const damageFactor = (stats.weaponAttack * 2.6 + stats.str * 1.35 + stats.dex * 0.35 + stats.luk * 0.45 + stats.int * 0.25) * hitRate * levelPenalty;
  const suitability = mapSuitability(spot, jobKey);
  const riskMultiplier = candidate.routeRisk === 'greedy' ? 1.15 : candidate.routeRisk === 'conservative' ? 0.82 : 1;
  const killSeconds = clamp(spot.avgHp / Math.max(1, damageFactor) + 0.75, 0.65, 18);
  const killsPerHour = Math.min((3600 / killSeconds) * suitability, spot.totalMobCount * 900);
  const expPerHour = killsPerHour * spot.avgExp;
  const expNeeded = expToNextLevel(level);
  const hours = expNeeded / Math.max(1, expPerHour);
  const incoming = spot.mobs.reduce((sum, x) => sum + Math.max(x.monster.PADamage ?? 0, x.monster.MADamage ?? 0) * x.count, 0) / Math.max(1, spot.totalMobCount);
  const deathRisk = clamp(((spot.avgLevel - level + 5) / 18) * riskMultiplier + incoming / 900 - avoid / 650, 0, 0.35);
  const deathsExpected = deathRisk * hours;
  const potionBase = candidate.potionPolicy === 'cheap' ? 0.55 : candidate.potionPolicy === 'safe' ? 1.35 : 1;
  const potionCost = Math.max(0, hours * killsPerHour * deathRisk * potionBase * (1.8 + level * 0.15));
  const mesoEarned = hours * killsPerHour * mesoPerKill(spot.avgLevel, spot.avgExp, candidate);
  const comfort = clamp(100 - deathRisk * 140 - Math.max(0, requiredAcc - accuracy) * 0.18 - killSeconds * 2.2, 0, 100);

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
    reason: hitRate < 0.75 ? '命中不足，效率下降' : deathRisk > 0.18 ? '风险较高但收益可观' : '综合效率较好',
  };
}

function scoreResult(result: Omit<BuildExperimentResult, 'objectiveScore'>, objective: ObjectivePreset): number {
  const timeScore = -result.totalHours * 10;
  const mesoScore = result.endingMeso / 1800;
  const potionScore = -result.totalPotionCost / 1200;
  const gearScore = -result.totalGearCost / 2500;
  const deathScore = -result.expectedDeaths * 60;
  const comfortScore = result.comfortScore;

  if (objective === 'fastest') return timeScore + deathScore * 0.25 + comfortScore * 0.2;
  if (objective === 'poor_start') return timeScore * 0.35 + mesoScore + potionScore * 1.6 + gearScore * 1.4 + deathScore * 0.45;
  if (objective === 'low_death') return deathScore * 2 + comfortScore + timeScore * 0.25;
  if (objective === 'low_potion') return potionScore * 2 + mesoScore + deathScore * 0.6 + timeScore * 0.35;
  if (objective === 'shop_gear') return timeScore * 0.65 + gearScore * 0.35 + comfortScore * 0.35;
  if (objective === 'craft_only') return mesoScore + timeScore * 0.45 + comfortScore * 0.35;
  if (objective === 'drop_only') return mesoScore * 1.3 + potionScore + timeScore * 0.35;
  return timeScore * 0.55 + mesoScore * 0.55 + potionScore * 0.75 + deathScore * 0.85 + comfortScore;
}

export function runBuildExperiments(data: GameData, jobKey: JobKey, startLevel: number, targetLevel: number, objective: ObjectivePreset): BuildExperimentResult[] {
  const spots = buildTrainingSpots(data);
  const candidates = makeCandidates(objective);
  const results: BuildExperimentResult[] = [];

  for (const candidate of candidates) {
    const stats = baseStats(jobKey);
    const decisions: LevelDecision[] = [];
    let totalGearCost = 0;
    const warnings: string[] = [];

    for (let level = Math.max(10, startLevel); level < targetLevel; level += 1) {
      allocateAp(stats, jobKey, level, candidate);
      totalGearCost += upgradeWeapon(stats, level, candidate);

      const eligibleSpots = spots.filter((spot) => {
        if (candidate.routeRisk === 'conservative') return spot.avgLevel <= level + 3 && spot.avgLevel >= level - 8;
        if (candidate.routeRisk === 'greedy') return spot.avgLevel <= level + 9 && spot.avgLevel >= level - 10;
        return spot.avgLevel <= level + 6 && spot.avgLevel >= level - 9;
      });

      const best = eligibleSpots
        .map((spot) => estimateSpotForCandidate(spot, level, jobKey, stats, candidate))
        .sort((a, b) => {
          const scoreA = a.expPerHour - a.potionCost * 0.8 - a.deathsExpected * 8000 + a.comfort * 40;
          const scoreB = b.expPerHour - b.potionCost * 0.8 - b.deathsExpected * 8000 + b.comfort * 40;
          return scoreB - scoreA;
        })[0];

      if (!best) {
        warnings.push(`Lv.${level} 没有候选地图。`);
        break;
      }
      stats.meso += best.mesoEarned - best.potionCost;
      best.gearCost = totalGearCost;
      decisions.push(best);
    }

    const totalHours = decisions.reduce((sum, x) => sum + x.hours, 0);
    const totalMesoEarned = decisions.reduce((sum, x) => sum + x.mesoEarned, 0);
    const totalPotionCost = decisions.reduce((sum, x) => sum + x.potionCost, 0);
    const expectedDeaths = decisions.reduce((sum, x) => sum + x.deathsExpected, 0);
    const comfortScore = decisions.length ? decisions.reduce((sum, x) => sum + x.comfort, 0) / decisions.length : 0;
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
        accuracy: Math.round(estimateAccuracy(stats, jobKey, targetLevel)),
        avoid: Math.round(estimateAvoid(stats, targetLevel)),
      },
      decisions,
      warnings,
    };
    results.push({ ...shell, objectiveScore: round(scoreResult(shell, objective), 2) });
  }

  return results.sort((a, b) => b.objectiveScore - a.objectiveScore);
}
