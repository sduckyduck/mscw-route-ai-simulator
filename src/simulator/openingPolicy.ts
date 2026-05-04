import type { Strategy } from './types';
import type { GearSourceMode } from './equipmentModel';
import type { ObjectivePreset } from './experimentOptimizer2';

export type ApPolicy = 'low_dex' | 'standard_dex' | 'high_accuracy' | 'weapon_req';
export type RiskPolicy = 'conservative' | 'normal' | 'greedy';
export type SkillPolicy = 'balanced' | 'accuracy_first' | 'damage_first' | 'mp_efficient';

export interface OpeningPolicyAction {
  id: string;
  label: string;
  apPolicy: ApPolicy;
  gearSource: GearSourceMode;
  potionPolicy: 'cheap' | 'normal' | 'safe';
  riskPolicy: RiskPolicy;
  skillPolicy: SkillPolicy;
  strategy: Strategy;
}

export const OPENING_POLICY_ACTIONS: OpeningPolicyAction[] = [
  {
    id: 'lowdex_no_buy_safe',
    label: '低DEX不买装备保守刷',
    apPolicy: 'low_dex',
    gearSource: 'none',
    potionPolicy: 'cheap',
    riskPolicy: 'conservative',
    skillPolicy: 'mp_efficient',
    strategy: 'safe',
  },
  {
    id: 'standard_drop_normal',
    label: '标准DEX靠掉落普通刷',
    apPolicy: 'standard_dex',
    gearSource: 'drop',
    potionPolicy: 'cheap',
    riskPolicy: 'normal',
    skillPolicy: 'balanced',
    strategy: 'profit',
  },
  {
    id: 'standard_shop_normal',
    label: '标准DEX商店装备普通刷',
    apPolicy: 'standard_dex',
    gearSource: 'shop',
    potionPolicy: 'normal',
    riskPolicy: 'normal',
    skillPolicy: 'balanced',
    strategy: 'balanced',
  },
  {
    id: 'highacc_shop_greedy',
    label: '高命中商店装备越级刷',
    apPolicy: 'high_accuracy',
    gearSource: 'shop',
    potionPolicy: 'normal',
    riskPolicy: 'greedy',
    skillPolicy: 'accuracy_first',
    strategy: 'fastest',
  },
  {
    id: 'weaponreq_hybrid_fast',
    label: '装备需求混合装备快刷',
    apPolicy: 'weapon_req',
    gearSource: 'hybrid',
    potionPolicy: 'normal',
    riskPolicy: 'greedy',
    skillPolicy: 'damage_first',
    strategy: 'fastest',
  },
  {
    id: 'standard_craft_stable',
    label: '标准DEX锻造稳定刷',
    apPolicy: 'standard_dex',
    gearSource: 'craft',
    potionPolicy: 'normal',
    riskPolicy: 'normal',
    skillPolicy: 'balanced',
    strategy: 'balanced',
  },
  {
    id: 'highacc_safe_lowdeath',
    label: '高命中低死亡保守刷',
    apPolicy: 'high_accuracy',
    gearSource: 'shop',
    potionPolicy: 'safe',
    riskPolicy: 'conservative',
    skillPolicy: 'accuracy_first',
    strategy: 'safe',
  },
  {
    id: 'lowdex_damage_greedy',
    label: '低DEX高输出贪经验刷',
    apPolicy: 'low_dex',
    gearSource: 'hybrid',
    potionPolicy: 'normal',
    riskPolicy: 'greedy',
    skillPolicy: 'damage_first',
    strategy: 'fastest',
  },
];

export function openingPolicyToObjective(action: OpeningPolicyAction): ObjectivePreset {
  if (action.gearSource === 'none' || action.potionPolicy === 'cheap') return 'poor_start';
  if (action.riskPolicy === 'conservative' || action.potionPolicy === 'safe') return 'low_death';
  if (action.gearSource === 'shop') return 'shop_gear';
  if (action.gearSource === 'craft') return 'craft_only';
  if (action.gearSource === 'drop') return 'drop_only';
  if (action.strategy === 'fastest') return 'fastest';
  return 'comfort';
}
