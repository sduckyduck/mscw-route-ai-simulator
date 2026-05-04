// MapleStory-like EXP curve. Replace with exact table when you extract it from the client metadata.
// The optimizer uses this only to estimate total hours between levels.
export const EXP_TABLE: Record<number, number> = {
  1: 15, 2: 34, 3: 57, 4: 92, 5: 135, 6: 372, 7: 560, 8: 840, 9: 1242,
  10: 1242, 11: 1242, 12: 1242, 13: 1242, 14: 1490, 15: 1788, 16: 2146, 17: 2575,
  18: 3090, 19: 3708, 20: 4450, 21: 5340, 22: 6408, 23: 7690, 24: 9228, 25: 11074,
  26: 13289, 27: 15947, 28: 19136, 29: 22963, 30: 27556, 31: 33067, 32: 39680, 33: 47616,
  34: 57139, 35: 68567, 36: 82280, 37: 98736, 38: 118483, 39: 142180, 40: 170616,
  41: 204739, 42: 245687, 43: 294824, 44: 353789, 45: 424547, 46: 509456, 47: 611347,
  48: 733616, 49: 880339, 50: 1056407, 51: 1267688, 52: 1521226, 53: 1825471, 54: 2190565,
  55: 2628678, 56: 3154414, 57: 3785297, 58: 4542356, 59: 5450827, 60: 6540992,
};

export function expToNextLevel(level: number): number {
  if (EXP_TABLE[level]) return EXP_TABLE[level];
  const lastKnown = EXP_TABLE[60];
  const extra = Math.max(0, level - 60);
  return Math.round(lastKnown * Math.pow(1.18, extra));
}
