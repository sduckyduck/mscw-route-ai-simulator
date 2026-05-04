import type { EquipmentItem, GameData, MapInfo, Monster, PortalRef, TrainingSpot } from './types';

const DATA_ROOT = '/data/app_metadata';

interface MonsterPayload {
  monsters: Monster[];
  total?: number;
}

interface MapRegionPayload {
  region: string;
  maps: MapInfo[];
}

interface MapPayload {
  regions: MapRegionPayload[];
  total?: number;
}

interface ItemPayload {
  items: EquipmentItem[];
  total?: number;
}

function assertArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

async function fetchOptionalJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function loadGameData(): Promise<GameData> {
  const [monsterPayload, mapPayload, portals, itemPayload] = await Promise.all([
    fetch(`${DATA_ROOT}/monsters.json`).then((r) => r.json()) as Promise<MonsterPayload>,
    fetch(`${DATA_ROOT}/maps.json`).then((r) => r.json()) as Promise<MapPayload>,
    fetch(`${DATA_ROOT}/portals.json`).then((r) => r.json()) as Promise<Record<string, PortalRef[]>>,
    fetchOptionalJson<ItemPayload>(`${DATA_ROOT}/items.json`, { items: [] }),
  ]);

  const regions = assertArray<MapRegionPayload>(mapPayload.regions);
  const maps = regions.flatMap((region) =>
    assertArray<MapInfo>(region.maps).map((map) => ({ ...map, region: map.region ?? region.region })),
  );

  return {
    monsters: assertArray(monsterPayload.monsters),
    maps,
    portals: portals ?? {},
    equipmentItems: assertArray(itemPayload.items),
  };
}

function parseRespawnSeconds(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 8;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 8;
  return Math.max(4, parsed);
}

export function buildTrainingSpots(data: GameData): TrainingSpot[] {
  const mapById = new Map(data.maps.map((m) => [Number(m.id), m]));
  const spotMap = new Map<number, TrainingSpot>();

  for (const monster of data.monsters) {
    if (monster.is_boss) continue;
    for (const ref of monster.maps ?? []) {
      const mapId = Number(ref.id);
      if (!Number.isFinite(mapId)) continue;
      const map = mapById.get(mapId);
      if (!map || map.is_town) continue;

      const existing = spotMap.get(mapId) ?? {
        mapId,
        mapName: map.name ?? ref.name ?? `Map ${mapId}`,
        streetName: map.street_name,
        region: map.region,
        mobs: [],
        totalMobCount: 0,
        avgLevel: 0,
        avgHp: 0,
        avgExp: 0,
        maxLevel: 0,
        minLevel: 999,
      };

      const count = Math.max(1, Number(ref.count) || 1);
      existing.mobs.push({ monster, count, respawnSeconds: parseRespawnSeconds(ref.mob_time) });
      existing.totalMobCount += count;
      existing.maxLevel = Math.max(existing.maxLevel, monster.level);
      existing.minLevel = Math.min(existing.minLevel, monster.level);
      spotMap.set(mapId, existing);
    }
  }

  return Array.from(spotMap.values())
    .map((spot) => {
      const total = Math.max(1, spot.totalMobCount);
      const weighted = spot.mobs.reduce(
        (acc, mob) => {
          acc.level += mob.monster.level * mob.count;
          acc.hp += mob.monster.hp * mob.count;
          acc.exp += mob.monster.exp * mob.count;
          return acc;
        },
        { level: 0, hp: 0, exp: 0 },
      );
      return {
        ...spot,
        avgLevel: weighted.level / total,
        avgHp: weighted.hp / total,
        avgExp: weighted.exp / total,
      };
    })
    .filter((spot) => spot.mobs.length > 0 && spot.avgExp > 0)
    .sort((a, b) => a.avgLevel - b.avgLevel || b.totalMobCount - a.totalMobCount);
}
