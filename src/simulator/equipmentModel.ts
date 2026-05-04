import type { EquipmentItem, EquipmentStats, JobKey } from './types';

export type EquipmentSlot = 'Weapon' | 'Shield' | 'Hat' | 'Top' | 'Bottom' | 'Overall' | 'Shoes' | 'Gloves' | 'Cape' | 'Earrings';
export type GearSourceMode = 'shop' | 'craft' | 'drop' | 'none' | 'hybrid';

export interface BaseStatsForGear {
  level: number;
  str: number;
  dex: number;
  int: number;
  luk: number;
  meso: number;
}

export interface DropGearContext {
  cumulativeKills: number;
  farmedHours: number;
  previousLoadout?: GearLoadout;
}

export interface GearBonuses {
  str: number;
  dex: number;
  int: number;
  luk: number;
  hp: number;
  mp: number;
  weaponAttack: number;
  magicAttack: number;
  accuracy: number;
  avoid: number;
  weaponDefense: number;
  magicDefense: number;
  speed: number;
  jump: number;
}

export interface GearLoadout {
  equipped: Partial<Record<EquipmentSlot, EquipmentItem>>;
  bonuses: GearBonuses;
  totalPrice: number;
  summary: string;
}

export interface GearDecisionResult {
  loadout: GearLoadout;
  cost: number;
  text: string;
}

const EMPTY_BONUSES: GearBonuses = {
  str: 0,
  dex: 0,
  int: 0,
  luk: 0,
  hp: 0,
  mp: 0,
  weaponAttack: 0,
  magicAttack: 0,
  accuracy: 0,
  avoid: 0,
  weaponDefense: 0,
  magicDefense: 0,
  speed: 0,
  jump: 0,
};

const BANNED_NAME_PATTERNS = [
  /\bgm\b/i,
  /admin/i,
  /test/i,
  /debug/i,
  /invincible/i,
  /supergm/i,
  /godly/i,
  /developer/i,
  /maplestory invincible/i,
];

export function emptyLoadout(): GearLoadout {
  return { equipped: {}, bonuses: { ...EMPTY_BONUSES }, totalPrice: 0, summary: '未装备可用装备' };
}

function n(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function slotOf(item: EquipmentItem): EquipmentSlot | null {
  const sub = (item.sub_category ?? '').toLowerCase();
  if (sub === 'weapon') return 'Weapon';
  if (sub.includes('shield')) return 'Shield';
  if (sub.includes('hat') || sub.includes('cap') || sub.includes('helmet')) return 'Hat';
  if (sub.includes('overall')) return 'Overall';
  if (sub.includes('top')) return 'Top';
  if (sub.includes('bottom') || sub.includes('pants') || sub.includes('skirt')) return 'Bottom';
  if (sub.includes('shoe') || sub.includes('boot')) return 'Shoes';
  if (sub.includes('glove')) return 'Gloves';
  if (sub.includes('cape')) return 'Cape';
  if (sub.includes('earring')) return 'Earrings';
  return null;
}

function isWeaponSlot(item: EquipmentItem): boolean {
  return slotOf(item) === 'Weapon';
}

function isValidPlayerEquipment(item: EquipmentItem): boolean {
  if (item.category !== 'Equipment') return false;
  if (!slotOf(item)) return false;

  const name = item.name ?? '';
  const description = item.description ?? '';
  if (BANNED_NAME_PATTERNS.some((pattern) => pattern.test(name) || pattern.test(description))) return false;

  const s = item.stats ?? {};
  const reqLevel = n(s.reqLevel);
  if (reqLevel < 0 || reqLevel > 200) return false;

  const statValues = [n(s.incSTR), n(s.incDEX), n(s.incINT), n(s.incLUK)];
  if (statValues.some((value) => Math.abs(value) > 40)) return false;

  const utilityValues = [n(s.incACC), n(s.incEVA), n(s.incSpeed), n(s.incJump)];
  if (utilityValues.some((value) => Math.abs(value) > 60)) return false;

  const hpMpValues = [n(s.incHP), n(s.incMP)];
  if (hpMpValues.some((value) => Math.abs(value) > 500)) return false;

  const defenseValues = [n(s.incPDD), n(s.incMDD)];
  if (defenseValues.some((value) => Math.abs(value) > 350)) return false;

  if (isWeaponSlot(item)) {
    if (n(s.incPAD) > 180 || n(s.incMAD) > 180) return false;
  } else {
    if (n(s.incPAD) > 30 || n(s.incMAD) > 60) return false;
  }

  if (n(s.reqSTR) > 999 || n(s.reqDEX) > 999 || n(s.reqINT) > 999 || n(s.reqLUK) > 999) return false;
  return true;
}

function familyLabel(jobKey: JobKey): string {
  if (['fighter', 'page', 'spearman'].includes(jobKey)) return 'Warrior';
  if (['fire_poison', 'ice_lightning', 'cleric'].includes(jobKey)) return 'Mage';
  if (['hunter', 'crossbowman'].includes(jobKey)) return 'Bowman';
  if (['assassin', 'bandit'].includes(jobKey)) return 'Thief';
  return 'Pirate';
}

function allowedForJob(item: EquipmentItem, jobKey: JobKey): boolean {
  const label = item.req_job_label ?? 'All';
  if (label === 'All') return true;
  const family = familyLabel(jobKey);
  return label.includes(family);
}

function allowedWeapon(item: EquipmentItem, jobKey: JobKey): boolean {
  const type = item.weapon_type ?? '';
  if (!type) return true;
  if (jobKey === 'fighter') return type.includes('Sword') || type.includes('Axe') || type.includes('Blunt');
  if (jobKey === 'page') return type.includes('Sword') || type.includes('Blunt');
  if (jobKey === 'spearman') return type.includes('Spear') || type.includes('Polearm');
  if (jobKey === 'hunter') return type === 'Bow';
  if (jobKey === 'crossbowman') return type === 'Crossbow';
  if (jobKey === 'assassin') return type === 'Claw';
  if (jobKey === 'bandit') return type === 'Dagger';
  if (jobKey === 'brawler') return type === 'Knuckle';
  if (jobKey === 'gunslinger') return type === 'Gun';
  return true;
}

function isTwoHandedWeapon(item: EquipmentItem | undefined): boolean {
  const type = item?.weapon_type ?? '';
  return type.startsWith('2H') || type === 'Spear' || type === 'Polearm' || type === 'Bow' || type === 'Crossbow' || type === 'Claw' || type === 'Gun' || type === 'Knuckle';
}

function meetsRequirements(item: EquipmentItem, base: BaseStatsForGear, jobKey: JobKey): boolean {
  if (!isValidPlayerEquipment(item)) return false;
  const stats = item.stats ?? {};
  if (!allowedForJob(item, jobKey)) return false;
  if (slotOf(item) === 'Weapon' && !allowedWeapon(item, jobKey)) return false;
  if (n(stats.reqLevel) > base.level) return false;
  if (n(stats.reqSTR) > base.str) return false;
  if (n(stats.reqDEX) > base.dex) return false;
  if (n(stats.reqINT) > base.int) return false;
  if (n(stats.reqLUK) > base.luk) return false;
  return true;
}

function slotDropKills(slot: EquipmentSlot): number {
  if (slot === 'Weapon') return 2600;
  if (slot === 'Overall' || slot === 'Top' || slot === 'Bottom') return 1900;
  if (slot === 'Shield') return 2200;
  if (slot === 'Gloves' || slot === 'Shoes' || slot === 'Hat') return 1500;
  return 2400;
}

function dropLevelLag(context: DropGearContext): number {
  const kills = Math.max(0, context.cumulativeKills);
  const hours = Math.max(0, context.farmedHours);
  const progress = Math.floor(Math.log10(kills + 1) * 2 + Math.sqrt(hours) * 0.8);
  return Math.max(4, 12 - progress);
}

function canBeAvailableFromDrops(item: EquipmentItem, slot: EquipmentSlot, base: BaseStatsForGear, context?: DropGearContext): boolean {
  if (!context) return false;
  const reqLevel = n(item.stats?.reqLevel);
  const lag = dropLevelLag(context);
  const maxDropReqLevel = Math.max(0, base.level - lag);
  if (reqLevel > maxDropReqLevel) return false;

  const requiredKills = slotDropKills(slot) + Math.max(0, reqLevel - 10) * (slot === 'Weapon' ? 110 : 65);
  if (context.cumulativeKills < requiredKills) return false;
  return true;
}

function scoreItem(item: EquipmentItem, jobKey: JobKey, mode: GearSourceMode): number {
  const s: EquipmentStats = item.stats ?? {};
  const price = Math.max(0, item.price ?? 0);
  const family = familyLabel(jobKey);
  const primary = family === 'Warrior' ? n(s.incSTR) : family === 'Mage' ? n(s.incINT) : family === 'Thief' ? n(s.incLUK) : n(s.incDEX);
  const secondary = family === 'Warrior' ? n(s.incDEX) : family === 'Mage' ? n(s.incLUK) : family === 'Thief' ? n(s.incDEX) : n(s.incSTR);
  let score = 0;
  score += n(s.incPAD) * (family === 'Mage' ? 0.4 : 10);
  score += n(s.incMAD) * (family === 'Mage' ? 9 : 0.3);
  score += primary * 5;
  score += secondary * 3.2;
  score += n(s.incACC) * 3.8;
  score += n(s.incEVA) * 1.8;
  score += n(s.incPDD) * 0.12;
  score += n(s.incMDD) * 0.08;
  score += n(s.incSpeed) * 0.7;
  score += n(s.incHP) * 0.025;
  score += n(s.incMP) * 0.02;
  if (mode === 'none') score -= price / 900;
  return score;
}

function addBonuses(out: GearBonuses, item: EquipmentItem) {
  const s = item.stats ?? {};
  out.str += n(s.incSTR);
  out.dex += n(s.incDEX);
  out.int += n(s.incINT);
  out.luk += n(s.incLUK);
  out.hp += n(s.incHP);
  out.mp += n(s.incMP);
  out.weaponAttack += n(s.incPAD);
  out.magicAttack += n(s.incMAD);
  out.accuracy += n(s.incACC);
  out.avoid += n(s.incEVA);
  out.weaponDefense += n(s.incPDD);
  out.magicDefense += n(s.incMDD);
  out.speed += n(s.incSpeed);
  out.jump += n(s.incJump);
}

function priceForMode(item: EquipmentItem, mode: GearSourceMode): number {
  const price = Math.max(0, item.price ?? 0);
  if (mode === 'none') return Number.POSITIVE_INFINITY;
  if (mode === 'drop') return 0;
  if (mode === 'craft') return Math.round(price * 0.65);
  if (mode === 'hybrid') return Math.round(price * 0.8);
  return price;
}

function buildLoadout(chosen: Partial<Record<EquipmentSlot, EquipmentItem>>, mode: GearSourceMode): GearLoadout {
  if (chosen.Overall) {
    delete chosen.Top;
    delete chosen.Bottom;
  }
  if (isTwoHandedWeapon(chosen.Weapon)) {
    delete chosen.Shield;
  }

  const bonuses = { ...EMPTY_BONUSES };
  let totalPrice = 0;
  for (const item of Object.values(chosen)) {
    if (!item) continue;
    addBonuses(bonuses, item);
    totalPrice += priceForMode(item, mode);
  }

  const summary = Object.entries(chosen)
    .map(([slot, item]) => `${slot}: ${item?.name}`)
    .join(' / ') || '没有找到可穿装备';

  return { equipped: chosen, bonuses, totalPrice, summary };
}

export function chooseBestGearLoadout(
  items: EquipmentItem[],
  jobKey: JobKey,
  base: BaseStatsForGear,
  mode: GearSourceMode,
  dropContext?: DropGearContext,
): GearLoadout {
  if (mode === 'none') return emptyLoadout();

  const chosen: Partial<Record<EquipmentSlot, EquipmentItem>> = { ...(dropContext?.previousLoadout?.equipped ?? {}) };
  const slots: EquipmentSlot[] = ['Weapon', 'Shield', 'Hat', 'Overall', 'Top', 'Bottom', 'Shoes', 'Gloves', 'Cape', 'Earrings'];
  const validItems = items.filter(isValidPlayerEquipment);

  for (const slot of slots) {
    const candidates = validItems
      .filter((item) => slotOf(item) === slot)
      .filter((item) => meetsRequirements(item, base, jobKey))
      .filter((item) => mode !== 'drop' || canBeAvailableFromDrops(item, slot, base, dropContext))
      .filter((item) => priceForMode(item, mode) <= base.meso)
      .sort((a, b) => scoreItem(b, jobKey, mode) - scoreItem(a, jobKey, mode));
    if (!candidates[0]) continue;

    const current = chosen[slot];
    if (!current || scoreItem(candidates[0], jobKey, mode) > scoreItem(current, jobKey, mode) * 1.08) {
      chosen[slot] = candidates[0];
    }
  }

  return buildLoadout(chosen, mode);
}

export function decideGear(
  items: EquipmentItem[],
  jobKey: JobKey,
  base: BaseStatsForGear,
  mode: GearSourceMode,
  dropContext?: DropGearContext,
): GearDecisionResult {
  const loadout = chooseBestGearLoadout(items, jobKey, base, mode, dropContext);
  if (mode === 'none') return { loadout, cost: 0, text: '装备策略：不主动购买装备' };

  if (mode === 'drop') {
    const lag = dropContext ? dropLevelLag(dropContext) : 12;
    const kills = Math.round(dropContext?.cumulativeKills ?? 0).toLocaleString();
    const hours = Math.round((dropContext?.farmedHours ?? 0) * 10) / 10;
    return {
      loadout,
      cost: 0,
      text: `装备来源 drop：累计击杀 ${kills}，刷怪 ${hours} 小时，掉落装备约落后 ${lag} 级；${loadout.summary}`,
    };
  }

  if (loadout.totalPrice <= 0) return { loadout, cost: 0, text: `装备来源 ${mode}：使用免费/可用装备；${loadout.summary}` };
  if (loadout.totalPrice > base.meso) return { loadout: emptyLoadout(), cost: 0, text: `金币不足，暂不换装` };
  return { loadout, cost: loadout.totalPrice, text: `装备来源 ${mode}：换装成本 ${loadout.totalPrice.toLocaleString()}；${loadout.summary}` };
}
