export type Strategy = 'fastest' | 'balanced' | 'safe' | 'profit';

export type JobKey =
  | 'fighter'
  | 'page'
  | 'spearman'
  | 'fire_poison'
  | 'ice_lightning'
  | 'cleric'
  | 'hunter'
  | 'crossbowman'
  | 'assassin'
  | 'bandit'
  | 'brawler'
  | 'gunslinger';

export interface JobProfile {
  key: JobKey;
  label: string;
  family: 'warrior' | 'magician' | 'archer' | 'rogue' | 'pirate';
  notes: string;
  baseDpsAtLevel10: number;
  dpsGrowthPerLevel: number;
  minKillSeconds: number;
  attackTaxSeconds: number;
  rangeScore: number;
  aoeScore: number;
  mobilityScore: number;
  accuracyBase: number;
  accuracyPerLevel: number;
  survivability: number;
  potionIntensity: number;
  mesoFind: number;
  preferredLevelDelta: [number, number];
}

export interface CharacterStats {
  str: number;
  dex: number;
  int: number;
  luk: number;
  hp: number;
  mp: number;
}

export interface DerivedCombatStats {
  primaryStat: number;
  secondaryStat: number;
  accuracy: number;
  avoid: number;
  weaponAttack: number;
  magicAttack: number;
  attackPower: number;
  mastery: number;
  skillMult: number;
  magicSkillDamage: number;
  attackInterval: number;
  critRate: number;
  critDamage: number;
  rangeScore: number;
  aoeScore: number;
  mobilityScore: number;
  survivability: number;
  potionIntensity: number;
}

export interface SkillPointAllocation {
  skill: string;
  points: number;
  total: number;
  reason: string;
}

export interface LevelAllocationStep {
  level: number;
  stage: 'first_job' | 'second_job' | 'future';
  apGained: number;
  apAllocated: Partial<Record<keyof CharacterStats, number>>;
  statsAfter: CharacterStats;
  spGained: number;
  spAllocated: SkillPointAllocation[];
  keySkills: string[];
  note: string;
}

export interface CharacterBuildSnapshot {
  level: number;
  jobKey: JobKey;
  stats: CharacterStats;
  skillLevels: Record<string, number>;
  derived: DerivedCombatStats;
  step?: LevelAllocationStep;
}

export interface AllocationPlan {
  jobKey: JobKey;
  startLevel: number;
  targetLevel: number;
  strategy: Strategy;
  summary: string[];
  finalStats: CharacterStats;
  finalDerived: DerivedCombatStats;
  finalSkills: Record<string, number>;
  steps: LevelAllocationStep[];
}

export interface MobMapRef {
  id: number;
  name: string;
  count: number;
  mob_time?: string | number | null;
}

export interface Monster {
  id: number;
  name: string;
  level: number;
  hp: number;
  mp?: number;
  exp: number;
  PADamage?: number;
  PDDamage?: number;
  MADamage?: number;
  MDDamage?: number;
  acc?: number;
  eva?: number;
  speed?: number;
  is_boss?: boolean;
  maps?: MobMapRef[];
}

export interface MapInfo {
  id: number;
  name: string;
  street_name?: string;
  region?: string;
  is_town?: boolean;
  return_map_id?: number | null;
  mob_rate?: number | null;
  exits?: number[];
}

export interface PortalRef {
  id: string;
  type?: number;
  dest_map?: string | number | null;
  name?: string;
  intra_map?: boolean;
  dest_name?: string;
}

export interface EquipmentStats {
  reqLevel?: number;
  reqJob?: number;
  reqSTR?: number;
  reqDEX?: number;
  reqINT?: number;
  reqLUK?: number;
  incSTR?: number;
  incDEX?: number;
  incINT?: number;
  incLUK?: number;
  incHP?: number;
  incMP?: number;
  incPAD?: number;
  incMAD?: number;
  incPDD?: number;
  incMDD?: number;
  incACC?: number;
  incEVA?: number;
  incSpeed?: number;
  incJump?: number;
  attackSpeed?: number;
  [key: string]: string | number | undefined;
}

export interface EquipmentItem {
  id: number;
  name: string;
  category?: string;
  sub_category?: string;
  description?: string;
  stats?: EquipmentStats;
  price?: number;
  req_job_label?: string;
  weapon_type?: string;
  attack_speed_label?: string;
  thumbnail?: string;
}

export interface GameData {
  monsters: Monster[];
  maps: MapInfo[];
  portals: Record<string, PortalRef[]>;
  equipmentItems: EquipmentItem[];
}

export interface SpotMob {
  monster: Monster;
  count: number;
  respawnSeconds: number;
}

export interface TrainingSpot {
  mapId: number;
  mapName: string;
  streetName?: string;
  region?: string;
  mobs: SpotMob[];
  totalMobCount: number;
  avgLevel: number;
  avgHp: number;
  avgExp: number;
  maxLevel: number;
  minLevel: number;
}

export interface SimulationInput {
  jobKey: JobKey;
  startLevel: number;
  targetLevel: number;
  strategy: Strategy;
  currentMapId?: number;
  allowHighRisk: boolean;
  travelPenalty: number;
  potionPenalty: number;
  materialValueWeight: number;
}

export interface SpotEstimate {
  spot: TrainingSpot;
  expPerHour: number;
  killsPerHour: number;
  mesoPerHour: number;
  potionCostPerHour: number;
  netMesoPerHour: number;
  risk: number;
  score: number;
  avgKillSeconds: number;
  levelFit: number;
  accuracy: number;
  reason: string[];
}

export interface RouteSegment {
  fromLevel: number;
  toLevel: number;
  mapId: number;
  mapName: string;
  region?: string;
  mainMobs: string[];
  hours: number;
  expPerHour: number;
  netMeso: number;
  potionCost: number;
  risk: number;
  reason: string[];
}

export interface SimulationResult {
  input: SimulationInput;
  job: JobProfile;
  allocationPlan: AllocationPlan;
  totalHours: number;
  totalPotionCost: number;
  totalNetMeso: number;
  totalTravelMinutes: number;
  segments: RouteSegment[];
  candidateCount: number;
  dataCoverage: {
    monsters: number;
    maps: number;
    trainingSpots: number;
  };
  warnings: string[];
}
