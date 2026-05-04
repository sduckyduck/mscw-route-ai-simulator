// MapleStory Classic World CBT EXP table.
// Reverse engineered by @wolffy on Discord from the supplied notes.
// expToNextLevel(level) returns the EXP needed to go from that level to the next level.

export interface ExpRow {
  level: number;
  expToLevelUp: number;
  accumulatedExp: number;
}

export const EXP_ROWS: ExpRow[] = [
  { level: 1, expToLevelUp: 15, accumulatedExp: 0 },
  { level: 2, expToLevelUp: 34, accumulatedExp: 15 },
  { level: 3, expToLevelUp: 57, accumulatedExp: 49 },
  { level: 4, expToLevelUp: 92, accumulatedExp: 106 },
  { level: 5, expToLevelUp: 135, accumulatedExp: 198 },
  { level: 6, expToLevelUp: 372, accumulatedExp: 333 },
  { level: 7, expToLevelUp: 560, accumulatedExp: 705 },
  { level: 8, expToLevelUp: 840, accumulatedExp: 1265 },
  { level: 9, expToLevelUp: 1242, accumulatedExp: 2105 },
  { level: 10, expToLevelUp: 1716, accumulatedExp: 3347 },
  { level: 11, expToLevelUp: 2360, accumulatedExp: 5063 },
  { level: 12, expToLevelUp: 3216, accumulatedExp: 7423 },
  { level: 13, expToLevelUp: 4200, accumulatedExp: 10639 },
  { level: 14, expToLevelUp: 5460, accumulatedExp: 14839 },
  { level: 15, expToLevelUp: 7050, accumulatedExp: 20299 },
  { level: 16, expToLevelUp: 8840, accumulatedExp: 27349 },
  { level: 17, expToLevelUp: 11040, accumulatedExp: 36189 },
  { level: 18, expToLevelUp: 13716, accumulatedExp: 47229 },
  { level: 19, expToLevelUp: 16680, accumulatedExp: 60945 },
  { level: 20, expToLevelUp: 20216, accumulatedExp: 77625 },
  { level: 21, expToLevelUp: 24402, accumulatedExp: 97841 },
  { level: 22, expToLevelUp: 28980, accumulatedExp: 122243 },
  { level: 23, expToLevelUp: 34320, accumulatedExp: 151223 },
  { level: 24, expToLevelUp: 40512, accumulatedExp: 185543 },
  { level: 25, expToLevelUp: 47216, accumulatedExp: 226055 },
  { level: 26, expToLevelUp: 54900, accumulatedExp: 273271 },
  { level: 27, expToLevelUp: 63666, accumulatedExp: 328171 },
  { level: 28, expToLevelUp: 73080, accumulatedExp: 391837 },
  { level: 29, expToLevelUp: 83720, accumulatedExp: 464917 },
  { level: 30, expToLevelUp: 95700, accumulatedExp: 548637 },
  { level: 31, expToLevelUp: 108480, accumulatedExp: 644337 },
  { level: 32, expToLevelUp: 122760, accumulatedExp: 752817 },
  { level: 33, expToLevelUp: 138666, accumulatedExp: 875577 },
  { level: 34, expToLevelUp: 155540, accumulatedExp: 1014243 },
  { level: 35, expToLevelUp: 174216, accumulatedExp: 1169783 },
  { level: 36, expToLevelUp: 194832, accumulatedExp: 1343999 },
  { level: 37, expToLevelUp: 216600, accumulatedExp: 1538831 },
  { level: 38, expToLevelUp: 240500, accumulatedExp: 1755431 },
  { level: 39, expToLevelUp: 266682, accumulatedExp: 1995931 },
  { level: 40, expToLevelUp: 294216, accumulatedExp: 2262613 },
  { level: 41, expToLevelUp: 324240, accumulatedExp: 2556829 },
  { level: 42, expToLevelUp: 356916, accumulatedExp: 2881069 },
  { level: 43, expToLevelUp: 391160, accumulatedExp: 3237985 },
  { level: 44, expToLevelUp: 428280, accumulatedExp: 3629145 },
  { level: 45, expToLevelUp: 468450, accumulatedExp: 4057425 },
  { level: 46, expToLevelUp: 510420, accumulatedExp: 4525875 },
  { level: 47, expToLevelUp: 555680, accumulatedExp: 5036295 },
  { level: 48, expToLevelUp: 604416, accumulatedExp: 5591975 },
  { level: 49, expToLevelUp: 655200, accumulatedExp: 6196391 },
  { level: 50, expToLevelUp: 709716, accumulatedExp: 6851591 },
  { level: 51, expToLevelUp: 748608, accumulatedExp: 7561307 },
];

export const EXP_TABLE: Record<number, number> = Object.fromEntries(
  EXP_ROWS.map((row) => [row.level, row.expToLevelUp]),
);

export const ACCUMULATED_EXP_TABLE: Record<number, number> = Object.fromEntries(
  EXP_ROWS.map((row) => [row.level, row.accumulatedExp]),
);

export const MAX_EXACT_EXP_LEVEL = EXP_ROWS[EXP_ROWS.length - 1].level;

export function expToNextLevel(level: number): number {
  if (EXP_TABLE[level]) return EXP_TABLE[level];

  // Keep the simulator usable above the exact table while warning the user elsewhere.
  const lastKnown = EXP_TABLE[MAX_EXACT_EXP_LEVEL];
  const extra = Math.max(0, level - MAX_EXACT_EXP_LEVEL);
  return Math.round(lastKnown * Math.pow(1.12, extra));
}

export function accumulatedExpAtLevel(level: number): number {
  if (ACCUMULATED_EXP_TABLE[level] !== undefined) return ACCUMULATED_EXP_TABLE[level];

  let total = ACCUMULATED_EXP_TABLE[MAX_EXACT_EXP_LEVEL];
  for (let current = MAX_EXACT_EXP_LEVEL; current < level; current += 1) {
    total += expToNextLevel(current);
  }
  return total;
}
