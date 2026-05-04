export type WeaponType =
  | '1H Sword'
  | '2H Sword'
  | '1H Blunt Weapon'
  | '2H Blunt Weapon'
  | '1H Axe'
  | '2H Axe'
  | 'Spear'
  | 'Polearm'
  | 'Bow'
  | 'Crossbow'
  | 'Claw'
  | 'Dagger'
  | 'Knuckle'
  | 'Gun';

export interface WeaponMultiplier {
  swing: number;
  stab: number;
}

export const WEAPON_MULTIPLIERS: Record<WeaponType, WeaponMultiplier> = {
  '1H Sword': { swing: 1.8, stab: 1.8 },
  '2H Sword': { swing: 2.5, stab: 2.5 },
  '1H Blunt Weapon': { swing: 2.4, stab: 1.2 },
  '2H Blunt Weapon': { swing: 3, stab: 2 },
  '1H Axe': { swing: 2.4, stab: 1.2 },
  '2H Axe': { swing: 3, stab: 2 },
  Spear: { swing: 1.5, stab: 3.5 },
  Polearm: { swing: 3.5, stab: 1.5 },
  Bow: { swing: 2.5, stab: 2.5 },
  Crossbow: { swing: 2.5, stab: 2.5 },
  Claw: { swing: 2.5, stab: 2.5 },
  Dagger: { swing: 1, stab: 2 },
  Knuckle: { swing: 2.5, stab: 2.5 },
  Gun: { swing: 2.5, stab: 2.5 },
};

export interface PhysicalDamageInput {
  skillMult: number;
  primaryStat: number;
  secondaryStat: number;
  attackPower: number;
  weaponAttack: number;
  minMult: number;
  maxMult: number;
  masteryMult: number;
  weaponDefense: number;
  elementalMult: number;
  levelDiff: number;
  critRate: number;
  critDamage: number;
  calibration?: number;
}

export interface MagicDamageInput {
  skillDamage: number;
  magicAttack: number;
  int: number;
  mastery: number;
  magicDefense: number;
  elementalMult: number;
  levelDiff: number;
  critRate: number;
  critDamage: number;
  calibration?: number;
}

export interface DamageRange {
  min: number;
  max: number;
  average: number;
  afterDefenseAverage: number;
  afterElementAverage: number;
  afterLevelPenaltyAverage: number;
  expectedWithCrit: number;
  defenseMultiplier: number;
  levelPenaltyMultiplier: number;
  critMultiplier: number;
}

export interface HitChanceInput {
  playerLevel: number;
  monsterLevel: number;
  accuracy: number;
  avoid: number;
}

export interface AccuracyTargets {
  minToHit: number;
  hit25: number;
  hit50: number;
  hit75: number;
  hit90: number;
  hit95: number;
  hit100: number;
}

export const BASE_CRIT_RATE = 0.05;
export const BASE_CRIT_DAMAGE = 20;
export const BASE_ELEMENTAL_DAMAGE_BONUS = 0.25;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function masteryMultiplier(masteryLevel: number): number {
  if (masteryLevel <= 0) return 0;
  return (0.1 + masteryLevel / 10) * 0.8;
}

export function defenseMultiplier(defense: number, iVar9 = 0, iVar10 = 0): number {
  const defenseMulti = iVar9 * (iVar10 / 100 + 1) + Math.max(0, defense);
  return 100 / (defenseMulti + 100);
}

export function levelPenaltyMultiplier(levelDiff: number): number {
  if (levelDiff <= 0) return 1;
  if (levelDiff < 10) return 1 / (levelDiff * levelDiff * 0.005 + 1);
  return 1 / (levelDiff * 0.05 + 1);
}

export function expectedCritMultiplier(critRate = BASE_CRIT_RATE, critDamage = BASE_CRIT_DAMAGE): number {
  const rate = clamp(critRate, 0, 1);
  return 1 + rate * (critDamage / 100);
}

export function applyDamageClamp(damage: number): number {
  return clamp(damage, 1, 700_000_000_000);
}

export function physicalDamageRange(input: PhysicalDamageInput): DamageRange {
  const rawMin =
    input.skillMult *
    ((80 + input.primaryStat * input.minMult * input.masteryMult + input.secondaryStat + input.attackPower) / 100) *
    input.weaponAttack *
    100;

  const rawMax =
    input.skillMult *
    ((100 + input.primaryStat * input.maxMult + input.secondaryStat + input.attackPower) / 100) *
    input.weaponAttack *
    100;

  return finalizeRange(rawMin, rawMax, {
    defense: input.weaponDefense,
    elementalMult: input.elementalMult,
    levelDiff: input.levelDiff,
    critRate: input.critRate,
    critDamage: input.critDamage,
    calibration: input.calibration ?? 0.012,
  });
}

export function magicDamageRange(input: MagicDamageInput): DamageRange {
  const rawMax =
    (input.skillDamage + input.magicAttack / 7) * ((input.magicAttack * 2 + input.int) / 100 + 1);

  const rawMin =
    (input.skillDamage + input.magicAttack / 7) * ((input.magicAttack * 2 * input.mastery + input.int) / 100 + 1);

  return finalizeRange(rawMin, rawMax, {
    defense: input.magicDefense,
    elementalMult: input.elementalMult,
    levelDiff: input.levelDiff,
    critRate: input.critRate,
    critDamage: input.critDamage,
    calibration: input.calibration ?? 1.35,
  });
}

function finalizeRange(
  rawMin: number,
  rawMax: number,
  options: {
    defense: number;
    elementalMult: number;
    levelDiff: number;
    critRate: number;
    critDamage: number;
    calibration: number;
  },
): DamageRange {
  const min = applyDamageClamp(Math.min(rawMin, rawMax));
  const max = applyDamageClamp(Math.max(rawMin, rawMax));
  const average = (min + max) / 2;
  const defMult = defenseMultiplier(options.defense);
  const lvlMult = levelPenaltyMultiplier(options.levelDiff);
  const critMult = expectedCritMultiplier(options.critRate, options.critDamage);
  const afterDefenseAverage = average * defMult;
  const afterElementAverage = afterDefenseAverage * options.elementalMult;
  const afterLevelPenaltyAverage = afterElementAverage * lvlMult;
  const expectedWithCrit = applyDamageClamp(afterLevelPenaltyAverage * critMult * options.calibration);

  return {
    min,
    max,
    average,
    afterDefenseAverage,
    afterElementAverage,
    afterLevelPenaltyAverage,
    expectedWithCrit,
    defenseMultiplier: defMult,
    levelPenaltyMultiplier: lvlMult,
    critMultiplier: critMult,
  };
}

export function statDerivedAccuracy(dex: number, luk: number): number {
  return Math.floor(Math.max(0, dex) / 3) + Math.floor(Math.max(0, luk) / 6) + 5;
}

export function meowDbPhysicalHitChance(input: HitChanceInput): number {
  const avoid = Math.max(0, input.avoid);
  if (avoid <= 0) return 1;
  const accuracy = Math.max(0, input.accuracy);
  if (accuracy <= 0) return 0;

  const levelGap = Math.max(0, input.monsterLevel - input.playerLevel);
  const a = (accuracy * 100) / ((levelGap + 51) * 5);
  if (a <= 0) return 0;

  const f = 0.3 / (1 + Math.exp((a - avoid) / 12));
  const rollMin = 0.95 - f;
  const rollMax = 1.05 + f;
  const neededRoll = avoid / a;
  return clamp((rollMax - neededRoll) / (rollMax - rollMin), 0, 1);
}

export function accuracyForHitRate(playerLevel: number, monsterLevel: number, avoid: number, targetHitRate: number): number {
  const target = clamp(targetHitRate, 0, 1);
  if (avoid <= 0) return 0;
  let lo = 0;
  let hi = Math.max(20, avoid * 12 + Math.max(0, monsterLevel - playerLevel) * 20);

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const hit = meowDbPhysicalHitChance({ playerLevel, monsterLevel, accuracy: mid, avoid });
    if (hit >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function accuracyTargets(playerLevel: number, monsterLevel: number, avoid: number): AccuracyTargets {
  return {
    minToHit: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.000001),
    hit25: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.25),
    hit50: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.5),
    hit75: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.75),
    hit90: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.9),
    hit95: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.95),
    hit100: accuracyForHitRate(playerLevel, monsterLevel, avoid, 0.999999),
  };
}

export function estimateHitChance(input: HitChanceInput): number {
  return meowDbPhysicalHitChance(input);
}
