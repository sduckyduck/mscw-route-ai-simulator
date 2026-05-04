import type { CharacterStats, SimulationResult } from './types';

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '未知';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h <= 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

export function formatMeso(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)} 万`;
  return `${sign}${Math.round(abs).toLocaleString()}`;
}

function formatStage(stage: string): string {
  if (stage === 'first_job') return '一转';
  if (stage === 'second_job') return '二转';
  return '后续';
}

function formatStatAllocation(allocation: Partial<Record<keyof CharacterStats, number>>): string {
  const entries = Object.entries(allocation).filter(([, value]) => value && Number(value) > 0);
  if (!entries.length) return '—';
  return entries.map(([key, value]) => `${key.toUpperCase()} +${value}`).join(' / ');
}

function formatStats(stats: CharacterStats): string {
  return `STR ${Math.round(stats.str)} / DEX ${Math.round(stats.dex)} / INT ${Math.round(stats.int)} / LUK ${Math.round(stats.luk)} / HP ${Math.round(stats.hp)} / MP ${Math.round(stats.mp)}`;
}

export function routeToMarkdown(result: SimulationResult): string {
  const finalStats = result.allocationPlan.finalStats;
  const derived = result.allocationPlan.finalDerived;
  const topSkills = Object.entries(result.allocationPlan.finalSkills)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => `${name} ${value}`);

  const lines = [
    `# ${result.job.label} 开荒模拟路线`,
    '',
    `- 等级：Lv.${result.input.startLevel} → Lv.${result.input.targetLevel}`,
    `- 策略：${result.input.strategy}`,
    `- 预计总耗时：${formatHours(result.totalHours)}`,
    `- 预计净金币：${formatMeso(result.totalNetMeso)}`,
    `- 预计药耗：${formatMeso(result.totalPotionCost)}`,
    '',
    '## AP / SP 分配策略',
    ...result.allocationPlan.summary.map((line) => `- ${line}`),
    `- 最终属性：${formatStats(finalStats)}`,
    `- 最终命中/回避：${Math.round(derived.accuracy)} / ${Math.round(derived.avoid)}`,
    `- 输出系数：SkillMult ${derived.skillMult.toFixed(2)} / Mastery ${derived.mastery.toFixed(2)} / Crit ${(derived.critRate * 100).toFixed(1)}%`,
    `- 主要技能：${topSkills.join(' / ') || '—'}`,
    '',
    '| 等级 | 阶段 | AP 分配 | SP 分配 | 核心技能 | 说明 |',
    '|---:|---|---|---|---|---|',
  ];

  for (const step of result.allocationPlan.steps) {
    const spText = step.spAllocated.length
      ? step.spAllocated.map((item) => `${item.skill} +${item.points}=${item.total}`).join('<br>')
      : '—';
    lines.push(
      `| Lv.${step.level} | ${formatStage(step.stage)} | ${formatStatAllocation(step.apAllocated)} | ${spText} | ${step.keySkills.join(' / ') || '—'} | ${step.spAllocated[0]?.reason ?? step.note} |`,
    );
  }

  lines.push(
    '',
    '## 练级路线',
    '',
    '| 等级段 | 地图 | 主要怪物 | 时间 | EXP/h | 风险 | 原因 |',
    '|---|---|---|---:|---:|---:|---|',
  );

  for (const segment of result.segments) {
    lines.push(
      `| Lv.${segment.fromLevel}-${segment.toLevel} | ${segment.mapName} | ${segment.mainMobs.join(', ')} | ${formatHours(segment.hours)} | ${segment.expPerHour.toLocaleString()} | ${segment.risk} | ${segment.reason.join('、')} |`,
    );
  }

  if (result.warnings.length) {
    lines.push('', '## 注意', ...result.warnings.map((warning) => `- ${warning}`));
  }

  return lines.join('\n');
}
