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

export interface GameData {
  monsters: Monster[];
  maps: MapInfo[];
  portals: Record<string, PortalRef[]>;
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
