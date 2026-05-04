import {
  BASE_CRIT_DAMAGE,
  BASE_CRIT_RATE,
  BASE_ELEMENTAL_DAMAGE_BONUS,
  WEAPON_MULTIPLIERS,
  estimateHitChance,
  magicDamageRange,
  masteryMultiplier,
  physicalDamageRange,
  type WeaponType,
} from './damageFormula';
import type { JobProfile, Monster, SpotEstimate, Strategy, TrainingSpot } from './types';

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

function estimatePrimaryStat(level: number, job: JobProfile): number {
  if (job.family === 'magician') return 16 + level * 4.8;
  if (job.family === 'warrior') return 28 + level * 4.5;
  if (job.family === 'archer') return 24 + level * 4.4;
  if (job.family === 'pirate' && job.key === 'brawler') return 24 + level * 4.3;
  if (job.family === 'pirate' && job.key === 'gunslinger') return 24 + level * 4.25;
  return 24 + level * 4.2;
}

function estimateSecondaryStat(level: number, job: JobProfile): number {
  if (job.family === 'magician') return 4 + level * 0.35;
  if (job.family === 'warrior') return 16 + level * 1.05;
  if (job.family === 'archer') return 14 + level * 1.05;
  if (job.family === 'pirate') return 14 + level * 1.05;
  // Thief secondary stat is STR + DEX in the supplied formula notes.
  return 16 + level * 1.25;
}

function estimateWeaponAttack(level: number, job: JobProfile): number {
  const familyBase: Record<JobProfile['family'], number> = {
    warrior: 12,
    magician: 0,
    archer: 11,
    rogue: 12,
    pirate: 11,
  };
  const growth = job.family === 'warrior' ? 1.0 : job.family === 'rogue' ? 0.92 : 0.88;
  return familyBase[job.family] + level * growth;
}

function estimateAttackPower(level: number, job: JobProfile): number {
  const base = job.family === 'warrior' ? 8 : job.family === 'rogue' ? 7 : job.family === 'archer' ? 6 : 5;
  return base + level * 0.42;
}

function estimateMagicAttack(level: number): number {
  return 18 + level * 3.45;
}

function estimateSkillMult(level: number, job: JobProfile): number {
  const secondJobBonus = level >= 30 ? 0.25 : 0;
  if (job.key === 'bandit') return 1.05 + secondJobBonus;
  if (job.key === 'assassin') return 1.0 + secondJobBonus;
  if (job.family === 'warrior') return 1.05 + secondJobBonus;
  if (job.family === 'archer') return 1.0 + secondJobBonus * 0.9;
  if (job.family === 'pirate') return 1.0 + secondJobBonus;
  return 1;
}

function estimateMagicSkillDamage(level: number, job: JobProfile): number {
  const secondJobBonus = level >= 30 ? 26 : 0;
  if (job.key === 'cleric') return 36 + level * 1.15 + secondJobBonus * 0.75;
  if (job.key === 'ice_lightning') return 42 + level * 1.25 + secondJobBonus;
  return 45 + level * 1.35 + secondJobBonus;
}

function estimateAttackIntervalSeconds(level: number, job: JobProfile): number {
  const base = job.family === 'magician' ? 0.96 : job.family === 'warrior' ? 0.86 : 0.78;
  const secondJobSpeedup = level >= 30 ? 0.05 : 0;
  return clamp(base + job.attackTaxSeconds - secondJobSpeedup, 0.48, 1.45);
}

function estimateMastery(level: number, job: JobProfile): number {
  if (level < 30) return job.family === 'magician' ? 0.35 : 0.1;
  const masteryLevel = clamp(Math.floor((level - 30) / 2) + 1, 1, 20);
  if (job.family === 'magician') return clamp(0.35 + masteryLevel * 0.025, 0.35, 0.75);
  return masteryMultiplier(masteryLevel);
}

function estimateElementalMultiplier(job: JobProfile, _monster: Monster): number {
  // The supplied notes confirm elemental damage was reduced from 50% to 25%.
  // Monster weakness/resistance fields are not present in the imported Monster type yet, so this
  // stays neutral by default and applies only a small class bias for elemental mages.
  if (job.key === 'fire_poison' || job.key === 'ice_lightning') {
    return 1 + BASE_ELEMENTAL_DAMAGE_BONUS * 0.18;
  }
  return 1;
}

function estimateDamagePerHit(level: number, job: JobProfile, monster: Monster): number {
  const levelDiff = monster.level - level;
  const elementalMult = estimateElementalMultiplier(job, monster);

  if (job.family === 'magician') {
    return magicDamageRange({
      skillDamage: estimateMagicSkillDamage(level, job),
      magicAttack: estimateMagicAttack(level),
      int: estimatePrimaryStat(level, job),
      mastery: estimateMastery(level, job),
      magicDefense: monster.MDDamage ?? 0,
      elementalMult,
      levelDiff,
      critRate: BASE_CRIT_RATE,
      critDamage: BASE_CRIT_DAMAGE,
    }).expectedWithCrit;
  }

  const weaponType = getWeaponType(job);
  const multipliers = WEAPON_MULTIPLIERS[weaponType];
  const chosenMultiplier = weaponType === 'Spear' || weaponType === 'Dagger' ? multipliers.stab : Math.max(multipliers.swing, multipliers.stab);

  return physicalDamageRange({
    skillMult: estimateSkillMult(level, job),
    primaryStat: estimatePrimaryStat(level, job),
    secondaryStat: estimateSecondaryStat(level, job),
    attackPower: estimateAttackPower(level, job),
    weaponAttack: estimateWeaponAttack(level, job),
    minMult: chosenMultiplier,
    maxMult: chosenMultiplier,
    masteryMult: estimateMastery(level, job),
    weaponDefense: monster.PDDamage ?? 0,
    elementalMult,
    levelDiff,
    critRate: BASE_CRIT_RATE,
    critDamage: BASE_CRIT_DAMAGE,
  }).expectedWithCrit;
}

function estimateCharacterAccuracy(level: number, job: JobProfile): number {
  return job.accuracyBase + level * job.accuracyPerLevel;
}

function accuracyScore(level: number, spot: TrainingSpot, job: JobProfile): number {
  return weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    return estimateHitChance({
      playerLevel: level,
      monsterLevel: monster.level,
      accuracy: estimateCharacterAccuracy(level, job),
      avoid: monster.eva ?? 0,
    });
  });
}

function estimateFormulaDps(level: number, spot: TrainingSpot, job: JobProfile): number {
  const attackInterval = estimateAttackIntervalSeconds(level, job);
  const attacksPerSecond = 1 / attackInterval;
  const avgDamagePerHit = weightedAverage(spot, (i) => estimateDamagePerHit(level, job, spot.mobs[i].monster));
  const hitChance = accuracyScore(level, spot, job);
  const utilityBonus = 0.88 + job.rangeScore * 0.07 + job.aoeScore * 0.08 + job.mobilityScore * 0.05;

  return Math.max(1, avgDamagePerHit * attacksPerSecond * hitChance * utilityBonus);
}

function estimateMesoPerKill(exp: number, level: number, job: JobProfile): number {
  // Placeholder until true drop tables are integrated: higher level mobs yield more sell value/mesos.
  return (exp * 1.25 + level * 2.8) * job.mesoFind;
}

function estimateIncomingHitChance(level: number, spot: TrainingSpot, job: JobProfile): number {
  const playerAvoid = 18 + level * (job.family === 'rogue' ? 2.1 : job.family === 'archer' ? 1.65 : 1.1);
  return weightedAverage(spot, (i) => {
    const monster = spot.mobs[i].monster;
    const monsterAcc = monster.acc ?? 0;
    const levelPressure = Math.max(0, monster.level - level) * 0.035;
    return clamp(monsterAcc / Math.max(1, 35 + playerAvoid * 2.5) + levelPressure, 0.08, 0.95);
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
  const levelFit = levelFitScore(level, spot, job);
  const accuracy = accuracyScore(level, spot, job);
  const dps = estimateFormulaDps(level, spot, job) * levelFit;

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
  const incomingHitChance = estimateIncomingHitChance(level, spot, job);
  const levelRisk = clamp((spot.avgLevel - level + 4) / 12, 0, 1.2);
  const contactRisk = clamp(1.1 - job.rangeScore * 0.35 - job.survivability * 0.38, 0.18, 1.05);
  const densityRisk = clamp(spot.totalMobCount / 24, 0.35, 1.2);
  const risk = clamp((incomingDamage / 160) * incomingHitChance * contactRisk * densityRisk + levelRisk * 0.45, 0, 1.5);

  const potionCostPerHour = Math.max(0, risk * killsPerHour * (2.2 + level * 0.18) * job.potionIntensity * potionPenalty);
  const dropUtility = materialValueWeight * killsPerHour * Math.sqrt(Math.max(1, spot.avgLevel));
  const netMesoPerHour = mesoPerHour + dropUtility - potionCostPerHour;

  const reason: string[] = [];
  if (spot.totalMobCount >= 14) reason.push('怪物密度高');
  if (Math.abs(spot.avgLevel - level) <= 3) reason.push('等级贴合');
  if (accuracy < 0.75) reason.push('命中率偏低，效率被压');
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
