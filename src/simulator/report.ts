import type { SimulationResult } from './types';

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

export function routeToMarkdown(result: SimulationResult): string {
  const lines = [
    `# ${result.job.label} 开荒模拟路线`,
    '',
    `- 等级：Lv.${result.input.startLevel} → Lv.${result.input.targetLevel}`,
    `- 策略：${result.input.strategy}`,
    `- 预计总耗时：${formatHours(result.totalHours)}`,
    `- 预计净金币：${formatMeso(result.totalNetMeso)}`,
    `- 预计药耗：${formatMeso(result.totalPotionCost)}`,
    '',
    '| 等级段 | 地图 | 主要怪物 | 时间 | EXP/h | 风险 | 原因 |',
    '|---|---|---|---:|---:|---:|---|',
  ];

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
