import { generateAllocationPlan } from './allocation4';
import { estimateSpot } from './combat';
import { buildTrainingSpots } from './data';
import { MAX_EXACT_EXP_LEVEL, expToNextLevel } from './expTable';
import { JOB_PROFILES } from './jobs';
import { buildTravelGraph, estimateTravelMinutes, shortestHopDistance } from './travel';
import type { GameData, RouteSegment, SimulationInput, SimulationResult, SpotEstimate } from './types';

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function chooseBestSpot(
  estimates: SpotEstimate[],
  previousMapId: number | undefined,
  input: SimulationInput,
  travelGraph: Map<number, number[]>,
): { estimate: SpotEstimate; travelMinutes: number } | null {
  let best: { estimate: SpotEstimate; adjustedScore: number; travelMinutes: number } | null = null;

  for (const estimate of estimates) {
    if (!input.allowHighRisk && estimate.risk > 1.05) continue;
    const hops = shortestHopDistance(travelGraph, previousMapId, estimate.spot.mapId);
    const travelMinutes = estimateTravelMinutes(hops);
    const adjustedScore = estimate.score - travelMinutes * input.travelPenalty;
    if (!best || adjustedScore > best.adjustedScore) {
      best = { estimate, adjustedScore, travelMinutes };
    }
  }

  return best ? { estimate: best.estimate, travelMinutes: best.travelMinutes } : null;
}

function shouldMerge(last: RouteSegment | undefined, next: RouteSegment): boolean {
  return Boolean(last && last.mapId === next.mapId && last.toLevel === next.fromLevel);
}

export function simulateRoute(data: GameData, input: SimulationInput): SimulationResult {
  const job = JOB_PROFILES[input.jobKey];
  const allocationPlan = generateAllocationPlan(input.jobKey, input.startLevel, input.targetLevel, input.strategy);
  const warnings: string[] = [];
  const spots = buildTrainingSpots(data);
  const travelGraph = buildTravelGraph(data);

  if (input.startLevel >= input.targetLevel) {
    warnings.push('目标等级必须高于起始等级。');
  }
  if (!spots.length) {
    warnings.push('没有从 monsters.json 和 maps.json 里构建出可训练地图。');
  }

  let currentMapId = input.currentMapId;
  let totalHours = 0;
  let totalPotionCost = 0;
  let totalNetMeso = 0;
  let totalTravelMinutes = 0;
  const segments: RouteSegment[] = [];

  for (let level = input.startLevel; level < input.targetLevel; level += 1) {
    const candidates = spots
      .filter((spot) => spot.maxLevel >= level - 8 && spot.minLevel <= level + 9)
      .map((spot) => estimateSpot(spot, level, job, input.strategy, input.potionPenalty, input.materialValueWeight))
      .filter((estimate) => estimate.expPerHour > 0 && Number.isFinite(estimate.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    const selected = chooseBestSpot(candidates, currentMapId, input, travelGraph);
    if (!selected) {
      warnings.push(`Lv.${level} 没有找到低风险候选点，已停止模拟。`);
      break;
    }

    const { estimate, travelMinutes } = selected;
    const expNeeded = expToNextLevel(level);
    const hours = expNeeded / Math.max(1, estimate.expPerHour);
    const potionCost = estimate.potionCostPerHour * hours;
    const netMeso = estimate.netMesoPerHour * hours;

    const segment: RouteSegment = {
      fromLevel: level,
      toLevel: level + 1,
      mapId: estimate.spot.mapId,
      mapName: estimate.spot.mapName,
      region: estimate.spot.region,
      mainMobs: estimate.spot.mobs
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((mob) => mob.monster.name),
      hours: round(hours),
      expPerHour: Math.round(estimate.expPerHour),
      netMeso: Math.round(netMeso),
      potionCost: Math.round(potionCost),
      risk: round(estimate.risk, 3),
      reason: estimate.reason,
    };

    const last = segments[segments.length - 1];
    if (shouldMerge(last, segment)) {
      last.toLevel = segment.toLevel;
      last.hours = round(last.hours + segment.hours);
      last.netMeso += segment.netMeso;
      last.potionCost += segment.potionCost;
      last.risk = round((last.risk + segment.risk) / 2, 3);
      last.expPerHour = Math.round((last.expPerHour + segment.expPerHour) / 2);
      last.reason = Array.from(new Set([...last.reason, ...segment.reason])).slice(0, 5);
      last.mainMobs = Array.from(new Set([...last.mainMobs, ...segment.mainMobs])).slice(0, 4);
    } else {
      segments.push(segment);
    }

    totalHours += hours;
    totalPotionCost += potionCost;
    totalNetMeso += netMeso;
    totalTravelMinutes += travelMinutes;
    currentMapId = estimate.spot.mapId;
  }

  if (job.family === 'pirate') {
    warnings.push('海盗职业为国服/后续数据预留模型；当前 zip 技能数据里没有 pirate 分组，结果属于参数模拟。');
  }
  if (input.targetLevel > MAX_EXACT_EXP_LEVEL) {
    warnings.push(`Lv.${MAX_EXACT_EXP_LEVEL} 之后使用外推 EXP 曲线；建议后续接入更高等级准确经验表。`);
  }
  warnings.push('AP/SP 分配目前是 heuristic optimizer，不是实测训练模型；后续可以用玩家实测击杀时间和药耗校准权重。');

  return {
    input,
    job,
    allocationPlan,
    totalHours: round(totalHours),
    totalPotionCost: Math.round(totalPotionCost),
    totalNetMeso: Math.round(totalNetMeso),
    totalTravelMinutes: round(totalTravelMinutes),
    segments,
    candidateCount: spots.length,
    dataCoverage: {
      monsters: data.monsters.length,
      maps: data.maps.length,
      trainingSpots: spots.length,
    },
    warnings,
  };
}
