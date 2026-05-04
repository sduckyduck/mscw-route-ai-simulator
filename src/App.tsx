import { useEffect, useMemo, useState } from 'react';
import { loadGameData } from './simulator/data';
import { JOB_OPTIONS } from './simulator/jobs';
import { routeToMarkdown, formatHours, formatMeso } from './simulator/report';
import { simulateRoute } from './simulator/optimizer';
import type { CharacterStats, GameData, JobKey, SimulationInput, SimulationResult, Strategy } from './simulator/types';

const DEFAULT_INPUT: SimulationInput = {
  jobKey: 'spearman',
  startLevel: 10,
  targetLevel: 40,
  strategy: 'balanced',
  currentMapId: undefined,
  allowHighRisk: false,
  travelPenalty: 0.18,
  potionPenalty: 1,
  materialValueWeight: 0.2,
};

const strategyLabels: Record<Strategy, string> = {
  fastest: '最快冲级',
  balanced: '均衡开荒',
  safe: '低药耗安全',
  profit: '赚钱/材料优先',
};

function updateNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatStatAllocation(allocation: Partial<Record<keyof CharacterStats, number>>): string {
  const entries = Object.entries(allocation).filter(([, value]) => value && Number(value) > 0);
  if (!entries.length) return '—';
  return entries.map(([key, value]) => `${key.toUpperCase()} +${value}`).join(' / ');
}

function formatStats(stats: CharacterStats): string {
  return `STR ${Math.round(stats.str)} / DEX ${Math.round(stats.dex)} / INT ${Math.round(stats.int)} / LUK ${Math.round(stats.luk)} / HP ${Math.round(stats.hp)} / MP ${Math.round(stats.mp)}`;
}

function formatStage(stage: string): string {
  if (stage === 'first_job') return '一转';
  if (stage === 'second_job') return '二转';
  return '后续';
}

function SummaryCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="summary-card">
      <div className="summary-label">{props.label}</div>
      <div className="summary-value">{props.value}</div>
      {props.hint ? <div className="summary-hint">{props.hint}</div> : null}
    </div>
  );
}

function BotTimeline({ result }: { result: SimulationResult }) {
  const maxHours = Math.max(...result.segments.map((s) => s.hours), 1);
  return (
    <div className="bot-panel">
      <div className="section-title">AI 小人模拟时间线</div>
      <div className="bot-line">
        <span className="bot-avatar">🤖</span>
        <span>职业：{result.job.label}</span>
        <span>策略：{strategyLabels[result.input.strategy]}</span>
      </div>
      <div className="timeline-list">
        {result.segments.map((segment, index) => (
          <div className="timeline-row" key={`${segment.mapId}-${segment.fromLevel}-${index}`}>
            <div className="timeline-level">Lv.{segment.fromLevel}-{segment.toLevel}</div>
            <div className="timeline-track">
              <div className="timeline-fill" style={{ width: `${Math.max(8, (segment.hours / maxHours) * 100)}%` }} />
              <span>{segment.mapName}</span>
            </div>
            <div className="timeline-time">{formatHours(segment.hours)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllocationPanel({ result }: { result: SimulationResult }) {
  const plan = result.allocationPlan;
  const finalStats = plan.finalStats;
  const derived = plan.finalDerived;
  const topSkills = Object.entries(plan.finalSkills)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="allocation-panel">
      <div className="section-title">AP / SP 智能分配策略</div>
      <div className="allocation-summary">
        {plan.summary.map((line) => (
          <div key={line}>• {line}</div>
        ))}
      </div>

      <div className="build-grid">
        <SummaryCard
          label="最终基础属性"
          value={`STR ${Math.round(finalStats.str)} / DEX ${Math.round(finalStats.dex)}`}
          hint={`INT ${Math.round(finalStats.int)} / LUK ${Math.round(finalStats.luk)} / HP ${Math.round(finalStats.hp)} / MP ${Math.round(finalStats.mp)}`}
        />
        <SummaryCard
          label="最终命中 / 回避"
          value={`${Math.round(derived.accuracy)} / ${Math.round(derived.avoid)}`}
          hint="影响命中率、被击中率和越级图效率"
        />
        <SummaryCard
          label="输出系数"
          value={`${derived.skillMult.toFixed(2)}x`}
          hint={`Mastery ${derived.mastery.toFixed(2)} / Crit ${(derived.critRate * 100).toFixed(1)}%`}
        />
        <SummaryCard
          label="核心技能数"
          value={`${topSkills.length}`}
          hint={topSkills.slice(0, 3).map(([name, value]) => `${name} ${value}`).join(' / ') || 'No skills'}
        />
      </div>

      <div className="table-wrap allocation-table">
        <table>
          <thead>
            <tr>
              <th>等级</th>
              <th>阶段</th>
              <th>AP 分配</th>
              <th>当前属性</th>
              <th>SP 分配</th>
              <th>核心技能</th>
              <th>原因 / 说明</th>
            </tr>
          </thead>
          <tbody>
            {plan.steps.map((step) => (
              <tr key={`alloc-${step.level}`}>
                <td>Lv.{step.level}</td>
                <td>{formatStage(step.stage)}</td>
                <td>{formatStatAllocation(step.apAllocated)}</td>
                <td>{formatStats(step.statsAfter)}</td>
                <td>
                  {step.spAllocated.length ? (
                    step.spAllocated.map((item) => (
                      <div key={`${step.level}-${item.skill}`}>
                        {item.skill} +{item.points}
                        <small>总计 {item.total}</small>
                      </div>
                    ))
                  ) : '—'}
                </td>
                <td>{step.keySkills.join(' / ') || '—'}</td>
                <td>{step.spAllocated[0]?.reason ?? step.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RouteTable({ result }: { result: SimulationResult }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>等级段</th>
            <th>推荐地图</th>
            <th>主要怪物</th>
            <th>预计时间</th>
            <th>EXP/h</th>
            <th>净金币</th>
            <th>风险</th>
            <th>推荐理由</th>
          </tr>
        </thead>
        <tbody>
          {result.segments.map((segment, index) => (
            <tr key={`${segment.mapId}-${segment.fromLevel}-${index}`}>
              <td>Lv.{segment.fromLevel} → {segment.toLevel}</td>
              <td>
                <strong>{segment.mapName}</strong>
                {segment.region ? <small>{segment.region}</small> : null}
              </td>
              <td>{segment.mainMobs.join(' / ')}</td>
              <td>{formatHours(segment.hours)}</td>
              <td>{segment.expPerHour.toLocaleString()}</td>
              <td>{formatMeso(segment.netMeso)}</td>
              <td>
                <span className={segment.risk > 0.85 ? 'risk high' : segment.risk > 0.45 ? 'risk mid' : 'risk low'}>
                  {segment.risk}
                </span>
              </td>
              <td>{segment.reason.join('、')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [markdownCopied, setMarkdownCopied] = useState(false);

  useEffect(() => {
    loadGameData()
      .then((loaded) => {
        setData(loaded);
        setResult(simulateRoute(loaded, DEFAULT_INPUT));
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const selectedJob = useMemo(() => JOB_OPTIONS.find((job) => job.key === input.jobKey), [input.jobKey]);

  const run = () => {
    if (!data) return;
    const normalized: SimulationInput = {
      ...input,
      targetLevel: Math.max(input.startLevel + 1, input.targetLevel),
    };
    setInput(normalized);
    setResult(simulateRoute(data, normalized));
    setMarkdownCopied(false);
  };

  const copyMarkdown = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(routeToMarkdown(result));
    setMarkdownCopied(true);
  };

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">MapleStory Classic World</p>
          <h1>开荒路线 AI 模拟训练机器人</h1>
          <p className="subtitle">
            基于 zip 里的怪物、地图、传送门、AP/SP 分配和职业技能，自动估算不同职业从 Lv.X 到 Lv.Y 的刷怪路线、耗时、药耗和收益。
          </p>
        </div>
        <div className="hero-badge">
          <span>AI BOT</span>
          <strong>路线搜索 v0.3</strong>
        </div>
      </header>

      {loadError ? <div className="error">数据读取失败：{loadError}</div> : null}

      <section className="layout">
        <aside className="control-panel">
          <div className="section-title">模拟参数</div>

          <label>
            职业
            <select value={input.jobKey} onChange={(event) => setInput({ ...input, jobKey: event.target.value as JobKey })}>
              {JOB_OPTIONS.map((job) => (
                <option key={job.key} value={job.key}>{job.label}</option>
              ))}
            </select>
          </label>

          <div className="row-two">
            <label>
              起始等级
              <input
                type="number"
                min={1}
                max={199}
                value={input.startLevel}
                onChange={(event) => setInput({ ...input, startLevel: updateNumber(event.target.value, input.startLevel, 1, 199) })}
              />
            </label>
            <label>
              目标等级
              <input
                type="number"
                min={2}
                max={200}
                value={input.targetLevel}
                onChange={(event) => setInput({ ...input, targetLevel: updateNumber(event.target.value, input.targetLevel, 2, 200) })}
              />
            </label>
          </div>

          <label>
            策略
            <select value={input.strategy} onChange={(event) => setInput({ ...input, strategy: event.target.value as Strategy })}>
              {Object.entries(strategyLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={input.allowHighRisk}
              onChange={(event) => setInput({ ...input, allowHighRisk: event.target.checked })}
            />
            允许高风险越级图
          </label>

          <label>
            跑图惩罚：{input.travelPenalty.toFixed(2)}
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={input.travelPenalty}
              onChange={(event) => setInput({ ...input, travelPenalty: Number(event.target.value) })}
            />
          </label>

          <label>
            药耗权重：{input.potionPenalty.toFixed(2)}
            <input
              type="range"
              min={0.4}
              max={2.4}
              step={0.05}
              value={input.potionPenalty}
              onChange={(event) => setInput({ ...input, potionPenalty: Number(event.target.value) })}
            />
          </label>

          <label>
            材料价值权重：{input.materialValueWeight.toFixed(2)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={input.materialValueWeight}
              onChange={(event) => setInput({ ...input, materialValueWeight: Number(event.target.value) })}
            />
          </label>

          <button onClick={run} disabled={!data}>开始模拟</button>

          {selectedJob ? <p className="job-note">{selectedJob.notes}</p> : null}
        </aside>

        <section className="result-panel">
          {!result ? (
            <div className="loading">正在读取 zip 数据快照...</div>
          ) : (
            <>
              <div className="summary-grid">
                <SummaryCard label="预计总耗时" value={formatHours(result.totalHours)} hint={`跑图约 ${result.totalTravelMinutes} 分钟`} />
                <SummaryCard label="预计净金币" value={formatMeso(result.totalNetMeso)} hint="含药耗扣除和材料权重" />
                <SummaryCard label="预计药耗" value={formatMeso(result.totalPotionCost)} hint="用于比较路线，不等于实测值" />
                <SummaryCard label="候选地图" value={`${result.candidateCount}`} hint={`${result.dataCoverage.monsters} 怪物 / ${result.dataCoverage.maps} 地图`} />
              </div>

              {result.warnings.length ? (
                <div className="warning-box">
                  {result.warnings.map((warning) => <div key={warning}>⚠ {warning}</div>)}
                </div>
              ) : null}

              <BotTimeline result={result} />
              <AllocationPanel result={result} />
              <RouteTable result={result} />

              <div className="actions">
                <button className="secondary" onClick={copyMarkdown}>{markdownCopied ? '已复制 Markdown' : '复制攻略 Markdown'}</button>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
