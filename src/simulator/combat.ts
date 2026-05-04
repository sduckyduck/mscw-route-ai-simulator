import { getBuildSnapshot } from './allocation4';
import {
  BASE_ELEMENTAL_DAMAGE_BONUS,
  WEAPON_MULTIPLIERS,
  estimateHitChance,
  magicDamageRange,
  physicalDamageRange,
  type WeaponType,
} from './damageFormula';
import type { DerivedCombatStats, JobProfile, Monster, SpotEstimate, Strategy, TrainingSpot } from './types';

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

function getWeaponType(job: JobProfile): WeaponType {
  switch (job.key) {
    case 'fighter':
      return '2H Sword';
    case 'page':
      return '1H Sword';
    case 'spearman':
      return 'Spear';
    case 'hunter':
      return 'Bow';
    case 'crossbowman':
      return 'Crossbow';
    case 'assassin':
      return 'Claw';
    case 'bandit':
      return 'Dagger';
    case 'brawler':
      return 'Knuckle';
    case 'gunslinger':
      return 'Gun';
    default:
      return '1H Sword';
  }
}

function estimateElementalMultiplier(job: JobProfile, _monster: Monster): number {
  if (job.key === 'fire_poison' || job.key === 'ice_lightning') {
    return 1 + BASE_ELEMENTAL_DAMAGE_BONUS * 0.18;
  }
  return 1;
}

function estimateDamagePerHit(level: number, job: JobProfile, monster: Monster, derived: DerivedCombatStats): number {
  const levelDiff = monster.level - level;
  const elementalMult = estimateElementalMultiplier(job, monster);

  if (job.family === 'magician') {
    return magicDamageRange({
      skillDamage: derived.magicSkillDamage,
      magicAttack: derived.magicAttack,
      int: derived.primaryStat,
      mastery: derived.mastery,
      magicDefense: monster.MDDamage ?? 0,
      elementalMult,
      levelDiff,
      critRate: derived.critRate,
      critDamage: derived.critDamage,
    }).expectedWithCrit;
  }

  const weaponType = getWeaponType(job);
  const multipliers = WEAPON_MULTIPLIERS[weaponType];
  const chosenMultiplier = weaponType === 'Spear' || weaponType === 'Dagger' ? multipliers.stab : Math.max(multipliers.swing, multipliers.stab);

  return physicalDamageRange({
    skillMult: derived.skillMult,
    primaryStat: derived.primaryStat,
    secondaryStat: derived.secondaryStat,
    attackPower: derived.attackPower,
    weaponAttack: derived.weaponAttack,
    minMult: chosenMultiplier,
    maxMult: chosenMultiplier,
    masteryMult: derived.mastery,
    weaponDefense: monster.PDDamage ?? 0,
    elementalMult,
    levelDiff,
    critRate: derived.critRate,
    critDamage: derived.critDamage,
  }).expectedWithCrit;
}

function accuracyScore(level: number, spot: TrainingSpot, derived: DerivedCombatStats): number {
  return weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    return estimateHitChance({
      playerLevel: level,
      monsterLevel: monster.level,
      accuracy: derived.accuracy,
      avoid: monster.eva ?? 0,
    });
  });
}

function estimateFormulaDps(level: number, spot: TrainingSpot, job: JobProfile, derived: DerivedCombatStats): number {
  const attacksPerSecond = 1 / derived.attackInterval;
  const avgDamagePerHit = weightedAverage(spot, (i) => estimateDamagePerHit(level, job, spot.mobs[i].monster, derived));
  const hitChance = accuracyScore(level, spot, derived);
  const utilityBonus = 0.88 + derived.rangeScore * 0.07 + derived.aoeScore * 0.08 + derived.mobilityScore * 0.05;

  return Math.max(1, avgDamagePerHit * attacksPerSecond * hitChance * utilityBonus);
}

function estimateMesoPerKill(exp: number, level: number, job: JobProfile): number {
  return (exp * 1.25 + level * 2.8) * job.mesoFind;
}

function estimateIncomingHitChance(level: number, spot: TrainingSpot, derived: DerivedCombatStats): number {
  return weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    const monsterAcc = monster.acc ?? 0;
    const levelPressure = Math.max(0, monster.level - level) * 0.035;
    return clamp(monsterAcc / Math.max(1, 35 + derived.avoid * 2.5) + levelPressure, 0.08, 0.95);
  });
}

export function estimateSpot(
  spot: TrainingSpot,
  level: number,
  job: JobProfile,
  strategy: Strategy,
  potionPenalty = 1,
  materialValueWeight = 0,
): SpotEstimate {
  const build = getBuildSnapshot(job.key, level, strategy);
  const derived = build.derived;
  const levelFit = levelFitScore(level, spot, job);
  const accuracy = accuracyScore(level, spot, derived);
  const dps = estimateFormulaDps(level, spot, job, derived) * levelFit;

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
  const aoeDensityBonus = 1 + derived.aoeScore * clamp((spot.totalMobCount - 8) / 26, 0, 0.42);
  const movementPenalty = clamp(0.72 + derived.mobilityScore * 0.2 + derived.rangeScore * 0.12, 0.68, 1.08);
  const theoreticalKills = (3600 / avgKillSeconds) * density * aoeDensityBonus * movementPenalty;
  const killsPerHour = Math.max(1, Math.min(theoreticalKills, spawnLimitedKills));

  const expPerKill = spot.avgExp;
  const expPerHour = killsPerHour * expPerKill;
  const mesoPerHour = killsPerHour * estimateMesoPerKill(expPerKill, spot.avgLevel, job);

  const incomingDamage = weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    return Math.max(monster.PADamage ?? 0, monster.MADamage ?? 0, 0);
  });
  const incomingHitChance = estimateIncomingHitChance(level, spot, derived);
  const levelRisk = clamp((spot.avgLevel - level + 4) / 12, 0, 1.2);
  const contactRisk = clamp(1.1 - derived.rangeScore * 0.35 - derived.survivability * 0.38, 0.18, 1.05);
  const densityRisk = clamp(spot.totalMobCount / 24, 0.35, 1.2);
  const risk = clamp((incomingDamage / 160) * incomingHitChance * contactRisk * densityRisk + levelRisk * 0.45, 0, 1.5);

  const potionCostPerHour = Math.max(0, risk * killsPerHour * (2.2 + level * 0.18) * derived.potionIntensity * potionPenalty);
  const dropUtility = materialValueWeight * killsPerHour * Math.sqrt(Math.max(1, spot.avgLevel));
  const netMesoPerHour = mesoPerHour + dropUtility - potionCostPerHour;

  const reason: string[] = [];
  if (spot.totalMobCount >= 14) reason.push('怪物密度高');
  if (Math.abs(spot.avgLevel - level) <= 3) reason.push('等级贴合');
  if (accuracy < 0.75) reason.push('命中率偏低，效率被压');
  if (derived.rangeScore >= 0.7) reason.push('远程职业适配');
  if (derived.aoeScore >= 0.55 && spot.totalMobCount >= 10) reason.push('群攻收益好');
  if (build.step?.spAllocated.length) reason.push(`本级技能影响：${build.step.spAllocated.map((s) => s.skill).join('/')}`);
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
