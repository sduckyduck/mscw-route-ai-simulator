import type { GameData } from './types';

export function normalizeMapKey(id: number | string): string {
  const raw = String(id).replace(/\D/g, '');
  if (!raw) return '0';
  return raw.padStart(9, '0');
}

export function buildTravelGraph(data: GameData): Map<number, number[]> {
  const graph = new Map<number, Set<number>>();

  const addEdge = (from: number, to: number) => {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return;
    if (!graph.has(from)) graph.set(from, new Set());
    if (!graph.has(to)) graph.set(to, new Set());
    graph.get(from)?.add(to);
    graph.get(to)?.add(from);
  };

  for (const [fromKey, portals] of Object.entries(data.portals)) {
    const from = Number(fromKey);
    for (const portal of portals ?? []) {
      if (portal.intra_map) continue;
      const dest = Number(portal.dest_map);
      addEdge(from, dest);
    }
  }

  for (const map of data.maps) {
    for (const exit of map.exits ?? []) addEdge(Number(map.id), Number(exit));
    if (map.return_map_id != null) addEdge(Number(map.id), Number(map.return_map_id));
  }

  return new Map(Array.from(graph.entries()).map(([k, v]) => [k, Array.from(v)]));
}

export function shortestHopDistance(graph: Map<number, number[]>, from?: number, to?: number): number {
  if (!from || !to || from === to) return 0;
  if (!graph.has(from) || !graph.has(to)) return 8; // unknown route fallback

  const visited = new Set<number>([from]);
  const queue: Array<{ id: number; dist: number }> = [{ id: from, dist: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const next of graph.get(current.id) ?? []) {
      if (next === to) return current.dist + 1;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ id: next, dist: current.dist + 1 });
      }
    }
  }
  return 8;
}

export function estimateTravelMinutes(hops: number): number {
  if (hops <= 0) return 0;
  // Conservative early-game map transition estimate: portal time + repositioning + loading friction.
  return Math.min(24, hops * 1.15 + 0.75);
}
