import { runBuildExperiments, type BuildExperimentResult, type ObjectivePreset } from './experimentOptimizer2';
import type { GameData, JobKey } from './types';

export type SandboxAction = 'travel' | 'fight' | 'loot' | 'level_up' | 'death' | 'equip' | 'summary';

export interface SandboxFrame {
  frame: number;
  virtualMinute: number;
  level: number;
  mapName: string;
  action: SandboxAction;
  monsterName?: string;
  expPercent: number;
  hpPercent: number;
  mpPercent: number;
  meso: number;
  kills: number;
  deaths: number;
  caption: string;
}

export interface SandboxFinding {
  type: 'success' | 'warning' | 'optimization';
  title: string;
  detail: string;
}

export interface SandboxRunResult {
  best: BuildExperimentResult;
  alternatives: BuildExperimentResult[];
  frames: SandboxFrame[];
  findings: SandboxFinding[];
  reportMarkdown: string;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h <= 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

function formatMeso(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)} 万`;
  return `${sign}${Math.round(abs).toLocaleString()}`;
}

function pushFrame(frames: SandboxFrame[], frame: Omit<SandboxFrame, 'frame'>) {
  frames.push({ frame: frames.length + 1, ...frame });
}

function formatHitBreakdown(decision: BuildExperimentResult['decisions'][number]): string {
  if (!decision.hitBreakdown?.length) return '—';
  return decision.hitBreakdown
    .map((item) => `${item.monsterName}: ${(item.hitRate * 100).toFixed(1)}% (Lv.${item.monsterLevel}, avoid ${item.monsterAvoid}${item.avoidEstimated ? ' est.' : ''}, count ${item.count}, weight ${(item.weight * 100).toFixed(0)}%)`)
    .join('<br>');
}

function buildFrames(best: BuildExperimentResult): SandboxFrame[] {
  const frames: SandboxFrame[] = [];
  let virtualMinute = 0;
  let meso = 0;
  let kills = 0;
  let deaths = 0;
  let lastMap = '';

  for (const decision of best.decisions) {
    if (decision.mapName !== lastMap) {
      const travelMinutes = lastMap ? 4.5 : 1.5;
      virtualMinute += travelMinutes;
      pushFrame(frames, {
        virtualMinute: round(virtualMinute),
        level: decision.level,
        mapName: decision.mapName,
        action: 'travel',
        expPercent: 0,
        hpPercent: 100,
        mpPercent: 100,
        meso: Math.round(meso),
        kills,
        deaths,
        caption: `前往 ${decision.mapName}，把跑图时间计入总耗时。`,
      });
      lastMap = decision.mapName;
    }

    const chunks = Math.max(3, Math.min(8, Math.ceil(decision.hours * 2)));
    const minutesPerChunk = (decision.hours * 60) / chunks;
    const killsPerChunk = decision.killsPerHour * decision.hours / chunks;
    const mesoPerChunk = (decision.mesoEarned - decision.potionCost) / chunks;
    const hpDrop = Math.min(70, decision.deathsExpected * 35 + (1 - decision.comfort / 100) * 35);
    const mpDrop = Math.min(65, decision.potionCost / Math.max(1, decision.mesoEarned) * 120);

    for (let i = 1; i <= chunks; i += 1) {
      virtualMinute += minutesPerChunk;
      kills += Math.round(killsPerChunk);
      meso += mesoPerChunk;
      const progress = Math.min(99, Math.round((i / chunks) * 100));
      const hp = Math.max(15, 100 - (hpDrop * i) / chunks);
      const mp = Math.max(10, 100 - (mpDrop * i) / chunks);
      const skillNote = decision.spDecisions?.length ? ` 本级 SP：${decision.spDecisions[0]}` : '';
      pushFrame(frames, {
        virtualMinute: round(virtualMinute),
        level: decision.level,
        mapName: decision.mapName,
        action: 'fight',
        monsterName: decision.monsterNames[0],
        expPercent: progress,
        hpPercent: Math.round(hp),
        mpPercent: Math.round(mp),
        meso: Math.round(meso),
        kills,
        deaths,
        caption: `${decision.mapName} 打 ${decision.monsterNames.slice(0, 2).join(' / ')}，加权命中 ${(decision.hitRate * 100).toFixed(1)}%，舒适度 ${decision.comfort.toFixed(1)}。${skillNote}`,
      });
    }

    const newDeaths = Math.floor(decision.deathsExpected + 0.35) - deaths;
    if (newDeaths > 0) {
      deaths += newDeaths;
      virtualMinute += newDeaths * 8;
      pushFrame(frames, {
        virtualMinute: round(virtualMinute),
        level: decision.level,
        mapName: decision.mapName,
        action: 'death',
        monsterName: decision.monsterNames[0],
        expPercent: 88,
        hpPercent: 0,
        mpPercent: 0,
        meso: Math.round(meso),
        kills,
        deaths,
        caption: `死亡 ${newDeaths} 次：该地图风险偏高，报告会建议降低越级、补命中或调整 SP/AP。`,
      });
    }

    pushFrame(frames, {
      virtualMinute: round(virtualMinute),
      level: decision.level + 1,
      mapName: decision.mapName,
      action: 'level_up',
      monsterName: decision.monsterNames[0],
      expPercent: 0,
      hpPercent: 100,
      mpPercent: 100,
      meso: Math.round(meso),
      kills,
      deaths,
      caption: `升级到 Lv.${decision.level + 1}。本级耗时 ${formatHours(decision.hours)}，药耗/MP压力 ${formatMeso(decision.potionCost)}。`,
    });
  }

  pushFrame(frames, {
    virtualMinute: round(virtualMinute),
    level: best.decisions[best.decisions.length - 1]?.level ?? 0,
    mapName: lastMap || 'Unknown',
    action: 'summary',
    expPercent: 100,
    hpPercent: 100,
    mpPercent: 100,
    meso: Math.round(meso),
    kills,
    deaths,
    caption: `沙盒完成：${best.candidate.label}，总耗时 ${formatHours(best.totalHours)}，最终金币 ${formatMeso(best.endingMeso)}。`,
  });

  return frames;
}

function buildFindings(best: BuildExperimentResult, alternatives: BuildExperimentResult[]): SandboxFinding[] {
  const findings: SandboxFinding[] = [];
  const second = alternatives[1];

  findings.push({
    type: 'success',
    title: '当前最优方案',
    detail: `${best.candidate.label} 排名第一：总耗时 ${formatHours(best.totalHours)}，死亡期望 ${best.expectedDeaths}，舒适度 ${best.comfortScore}。`,
  });

  if (second) {
    findings.push({
      type: 'optimization',
      title: '和第二名的差距',
      detail: `第二名是 ${second.candidate.label}。时间差 ${formatHours(Math.abs(second.totalHours - best.totalHours))}，最终金币差 ${formatMeso(best.endingMeso - second.endingMeso)}。`,
    });
  }

  const skillLines = Object.entries(best.finalSkills ?? {}).filter(([, value]) => value > 0).slice(0, 6);
  if (skillLines.length) {
    findings.push({
      type: 'optimization',
      title: 'AI 小人最终 SP 倾向',
      detail: skillLines.map(([name, value]) => `${name} ${value}`).join(' / '),
    });
  }

  if (best.expectedDeaths > 1) {
    findings.push({
      type: 'warning',
      title: '死亡风险偏高',
      detail: '建议测试更保守路线、更高命中 AP、或更早购买武器/防具。',
    });
  }

  if (best.totalPotionCost > best.totalMesoEarned * 0.25) {
    findings.push({
      type: 'warning',
      title: '药耗/MP 成本吞掉收益',
      detail: '穷鬼开荒目标下应降低越级、换低伤害怪、选择低 MP 技能，或延后高消耗地图。',
    });
  }

  const lowHitLevels = best.decisions.filter((x) => x.hitRate < 0.8 || x.hitBreakdown?.some((mob) => mob.hitRate < 0.65)).slice(0, 3);
  if (lowHitLevels.length) {
    findings.push({
      type: 'optimization',
      title: '命中不足等级段',
      detail: lowHitLevels.map((x) => `Lv.${x.level} ${x.mapName} 加权命中 ${(x.hitRate * 100).toFixed(1)}%`).join('；'),
    });
  }

  return findings;
}

function buildReport(best: BuildExperimentResult, alternatives: BuildExperimentResult[], findings: SandboxFinding[]): string {
  const lines = [
    `# 沙盒模拟报告：${best.candidate.label}`,
    '',
    `- 总耗时：${formatHours(best.totalHours)}`,
    `- 最终金币：${formatMeso(best.endingMeso)}`,
    `- 药水/MP 消耗：${formatMeso(best.totalPotionCost)}`,
    `- 装备消耗：${formatMeso(best.totalGearCost)}`,
    `- 预期死亡：${best.expectedDeaths}`,
    `- 爽玩舒适度：${best.comfortScore}/100`,
    `- 最终属性：STR ${best.finalStats.str} / DEX ${best.finalStats.dex} / INT ${best.finalStats.int} / LUK ${best.finalStats.luk}`,
    `- 最终战斗：WATK ${best.finalStats.weaponAttack} / ACC ${best.finalStats.accuracy} / AVOID ${best.finalStats.avoid}`,
    `- 最终技能：${Object.entries(best.finalSkills ?? {}).filter(([, value]) => value > 0).map(([name, value]) => `${name} ${value}`).join(' / ') || '—'}`,
    '',
    '## 关键结论',
    ...findings.map((x) => `- ${x.title}：${x.detail}`),
    '',
    '## 方案排名',
    '| 排名 | 方案 | 分数 | 时间 | 最终金币 | 药耗/MP | 装备 | 死亡 | 舒适度 |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|',
  ];

  alternatives.slice(0, 8).forEach((item, index) => {
    lines.push(`| ${index + 1} | ${item.candidate.label} | ${item.objectiveScore} | ${formatHours(item.totalHours)} | ${formatMeso(item.endingMeso)} | ${formatMeso(item.totalPotionCost)} | ${formatMeso(item.totalGearCost)} | ${item.expectedDeaths} | ${item.comfortScore} |`);
  });

  lines.push('', '## 最优路线逐级决策', '| 等级 | 地图 | 怪物 | 时间 | EXP/h | 加权命中 | 单怪命中 breakdown | 药耗/MP | 死亡期望 | SP 决策 | 原因 |', '|---:|---|---|---:|---:|---:|---|---:|---:|---|---|');

  for (const decision of best.decisions) {
    lines.push(`| Lv.${decision.level} | ${decision.mapName} | ${decision.monsterNames.join(', ')} | ${formatHours(decision.hours)} | ${Math.round(decision.expPerHour).toLocaleString()} | ${(decision.hitRate * 100).toFixed(1)}% | ${formatHitBreakdown(decision)} | ${formatMeso(decision.potionCost)} | ${decision.deathsExpected.toFixed(2)} | ${(decision.spDecisions ?? []).join('<br>') || '—'} | ${decision.reason} |`);
  }

  return lines.join('\n');
}

export function runSandboxSimulation(data: GameData, jobKey: JobKey, startLevel: number, targetLevel: number, objective: ObjectivePreset): SandboxRunResult {
  const alternatives = runBuildExperiments(data, jobKey, startLevel, targetLevel, objective);
  const best = alternatives[0];
  if (!best) {
    throw new Error('没有可用的沙盒候选方案。');
  }
  const frames = buildFrames(best);
  const findings = buildFindings(best, alternatives);
  const reportMarkdown = buildReport(best, alternatives, findings);
  return { best, alternatives, frames, findings, reportMarkdown };
}
