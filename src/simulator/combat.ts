import type { JobProfile, SpotEstimate, Strategy, TrainingSpot } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function weightedAverage(spot: TrainingSpot, selector: (mobIndex: number) => number): number {
  const total = Math.max(1, spot.totalMobCount);
  return spot.mobs.reduce((sum, mob, index) => sum + selector(index) * mob.count, 0) / total;
}

function levelFitScore(level: number, spot: TrainingSpot, job: JobProfile): number {
  const delta = spot.avgLevel - level;
  const [minDelta, maxDelta] = job.preferredLevelDelta;
  if (delta >= minDelta && delta <= maxDelta) return 1;
  const distance = delta < minDelta ? minDelta - delta : delta - maxDelta;
  return clamp(1 - distance * 0.11, 0.25, 1);
}

function accuracyScore(level: number, spot: TrainingSpot, job: JobProfile): number {
  const avgEva = weightedAverage(spot, (i) => spot.mobs[i].monster.eva ?? 0);
  const levelDelta = Math.max(0, spot.avgLevel - level);
  const characterAcc = job.accuracyBase + level * job.accuracyPerLevel;
  const monsterDemand = 35 + avgEva * 4 + levelDelta * 12;
  return clamp(characterAcc / monsterDemand, 0.38, 1);
}

function estimateRawDps(level: number, job: JobProfile): number {
  const levelGrowth = Math.pow(1 + job.dpsGrowthPerLevel, Math.max(0, level - 10));
  const utilityBonus = 0.88 + job.rangeScore * 0.07 + job.aoeScore * 0.08 + job.mobilityScore * 0.05;
  return job.baseDpsAtLevel10 * levelGrowth * utilityBonus;
}

function estimateMesoPerKill(exp: number, level: number, job: JobProfile): number {
  // Placeholder until true drop tables are integrated: higher level mobs yield more sell value/mesos.
  return (exp * 1.25 + level * 2.8) * job.mesoFind;
}

export function estimateSpot(
  spot: TrainingSpot,
  level: number,
  job: JobProfile,
  strategy: Strategy,
  potionPenalty = 1,
  materialValueWeight = 0,
): SpotEstimate {
  const levelFit = levelFitScore(level, spot, job);
  const accuracy = accuracyScore(level, spot, job);
  const dps = estimateRawDps(level, job) * levelFit * accuracy;

  const avgKillSeconds = weightedAverage(spot, (i) => {
    const mob = spot.mobs[i];
    const hp = Math.max(1, mob.monster.hp);
    const kill = hp / Math.max(1, dps) + job.attackTaxSeconds;
    return Math.max(job.minKillSeconds, kill);
  });

  const spawnLimitedKills = spot.mobs.reduce((sum, mob) => {
    const spawnPerHour = (3600 / Math.max(4, mob.respawnSeconds)) * mob.count;
    return sum + spawnPerHour;
  }, 0);

  const density = clamp(0.45 + Math.log1p(spot.totalMobCount) / Math.log1p(32), 0.55, 1.55);
  const aoeDensityBonus = 1 + job.aoeScore * clamp((spot.totalMobCount - 8) / 26, 0, 0.42);
  const movementPenalty = clamp(0.72 + job.mobilityScore * 0.2 + job.rangeScore * 0.12, 0.68, 1.08);
  const theoreticalKills = (3600 / avgKillSeconds) * density * aoeDensityBonus * movementPenalty;
  const killsPerHour = Math.max(1, Math.min(theoreticalKills, spawnLimitedKills));

  const expPerKill = spot.avgExp;
  const expPerHour = killsPerHour * expPerKill;
  const mesoPerHour = killsPerHour * estimateMesoPerKill(expPerKill, spot.avgLevel, job);

  const incomingDamage = weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    return Math.max(monster.PADamage ?? 0, monster.MADamage ?? 0, 0);
  });
  const levelRisk = clamp((spot.avgLevel - level + 4) / 12, 0, 1.2);
  const contactRisk = clamp(1.1 - job.rangeScore * 0.35 - job.survivability * 0.38, 0.18, 1.05);
  const densityRisk = clamp(spot.totalMobCount / 24, 0.35, 1.2);
  const risk = clamp((incomingDamage / 160) * contactRisk * densityRisk + levelRisk * 0.45, 0, 1.5);

  const potionCostPerHour = Math.max(0, risk * killsPerHour * (2.2 + level * 0.18) * job.potionIntensity * potionPenalty);
  const dropUtility = materialValueWeight * killsPerHour * Math.sqrt(Math.max(1, spot.avgLevel));
  const netMesoPerHour = mesoPerHour + dropUtility - potionCostPerHour;

  const reason: string[] = [];
  if (spot.totalMobCount >= 14) reason.push('怪物密度高');
  if (Math.abs(spot.avgLevel - level) <= 3) reason.push('等级贴合');
  if (job.rangeScore >= 0.7) reason.push('远程职业适配');
  if (job.aoeScore >= 0.55 && spot.totalMobCount >= 10) reason.push('群攻收益好');
  if (risk < 0.35) reason.push('药耗/死亡风险低');
  if (netMesoPerHour > 0) reason.push('预计净收益为正');
  if (!reason.length) reason.push('综合分数较高');

  let score = expPerHour / 1000;
  if (strategy === 'balanced') score += netMesoPerHour / 9000 - risk * 1.8;
  if (strategy === 'safe') score += netMesoPerHour / 12000 - risk * 4.2;
  if (strategy === 'profit') score += netMesoPerHour / 2600 - risk * 1.2;
  if (strategy === 'fastest') score -= risk * 0.8;

  return {
    spot,
    expPerHour,
    killsPerHour,
    mesoPerHour,
    potionCostPerHour,
    netMesoPerHour,
    risk,
    score,
    avgKillSeconds,
    levelFit,
    accuracy,
    reason,
  };
}
