import { useEffect, useMemo, useState } from 'react';
import { runSandboxSimulation, type SandboxFrame, type SandboxRunResult } from './simulator/sandboxEngine';
import type { ObjectivePreset } from './simulator/experimentOptimizer2';
import { runRlTraining, type RlAlgorithm, type RlTrainingReport } from './simulator/rlTrainer';
import type { GameData, SimulationInput } from './simulator/types';
import { formatHours, formatMeso } from './simulator/report';
import './sandbox.css';

const rlLabels: Record<RlAlgorithm, string> = {
  dqn_lite: 'DQN-lite / Q-learning',
  ppo_stub: 'PPO 接口',
  dreamer_stub: 'Dreamer 接口',
};

function actionText(action: SandboxFrame['action']): string {
  if (action === 'travel') return '跑图';
  if (action === 'fight') return '打怪';
  if (action === 'loot') return '拾取';
  if (action === 'level_up') return '升级';
  if (action === 'death') return '死亡';
  if (action === 'equip') return '换装';
  return '总结';
}

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function framePosition(frame: SandboxFrame): { left: string; top: string } {
  const seed = (frame.level * 31 + frame.frame * 17) % 100;
  return { left: `${8 + (seed % 78)}%`, top: `${frame.action === 'travel' ? 58 : 48 + ((seed * 7) % 24)}%` };
}

function SandboxStage({ frame }: { frame: SandboxFrame }) {
  const pos = framePosition(frame);
  const monsterLeft = `${Math.max(8, Math.min(86, Number.parseFloat(pos.left) + 10))}%`;
  return (
    <div className={`sandbox-stage action-${frame.action}`}>
      <div className="sandbox-map-title">{frame.mapName}</div>
      <div className="sandbox-ground" />
      <div className="sandbox-portal portal-left">🚪</div>
      <div className="sandbox-portal portal-right">🚪</div>
      {frame.action === 'fight' || frame.action === 'level_up' ? <div className="sandbox-monster" style={{ left: monsterLeft, top: '54%' }}>👾</div> : null}
      <div className="sandbox-character" style={pos}>
        <div className="char-bubble">{frame.action === 'travel' ? '🏃' : frame.action === 'fight' ? '⚔️' : frame.action === 'level_up' ? '✨' : '📋'}</div>
        <div className="char-body">🧍</div>
      </div>
      {frame.action === 'level_up' ? <div className="level-flash">LEVEL UP!</div> : null}
    </div>
  );
}

function Bar({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className="sandbox-bar-row">
      <span>{label}</span>
      <div className="sandbox-bar"><div className={className} style={{ width: pct(value) }} /></div>
      <b>{pct(value)}</b>
    </div>
  );
}

function RlPanel({ report, onRun }: { report: RlTrainingReport; onRun: (objective: ObjectivePreset) => void }) {
  const qRows = Object.entries(report.qValues).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rl-panel">
      <div className="section-title">开荒 RL 训练结果</div>
      <div className="sandbox-findings">
        <div className="finding optimization"><strong>学到的开荒 policy</strong><p>{report.bestAction.label}，奖励 {report.bestReward}</p></div>
        <div className="finding success"><strong>固定训练目标</strong><p>新服开荒最优解：更快升级、更少死亡、更少药耗和装备成本、金币不破产、命中稳定。</p></div>
        <div className="finding warning"><strong>算法说明</strong><p>{report.note}</p></div>
      </div>
      <button className="secondary" onClick={() => onRun(report.bestObjective)}>用学到的开荒 policy 跑沙盒</button>
      <div className="sandbox-table-wrap">
        <table>
          <thead><tr><th>开荒 policy 动作</th><th>Q 值</th></tr></thead>
          <tbody>{qRows.map(([name, value]) => <tr key={name} className={name === report.bestAction.label ? 'best-row' : ''}><td>{name}</td><td>{value}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="sandbox-table-wrap">
        <table>
          <thead><tr><th>Episode</th><th>探索率</th><th>开荒动作</th><th>奖励</th><th>Q值</th><th>耗时</th><th>金币</th><th>药耗</th><th>装备</th><th>死亡</th><th>舒适度</th></tr></thead>
          <tbody>{report.history.slice(-40).map((row) => <tr key={row.episode}><td>{row.episode}</td><td>{row.epsilon}</td><td>{row.action}</td><td>{row.reward}</td><td>{row.qValue}</td><td>{formatHours(row.totalHours)}</td><td>{formatMeso(row.endingMeso)}</td><td>{formatMeso(row.totalPotionCost)}</td><td>{formatMeso(row.totalGearCost)}</td><td>{row.expectedDeaths}</td><td>{row.comfort}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

type LevelDecisionForUi = SandboxRunResult['best']['decisions'][number];

function HitBreakdownCell({ decision }: { decision: LevelDecisionForUi }) {
  if (!decision.hitBreakdown?.length) return <>—</>;
  return <>{decision.hitBreakdown.map((item) => <div key={`${decision.level}-${item.monsterName}`} className={item.hitRate < 0.75 ? 'hit-low' : 'hit-ok'}><strong>{item.monsterName}</strong>: {(item.hitRate * 100).toFixed(1)}%<small> Lv.{item.monsterLevel} / avoid {item.monsterAvoid} / count {item.count}</small></div>)}</>;
}

function DecisionLog({ result }: { result: SandboxRunResult }) {
  return (
    <div className="sandbox-table-wrap decision-log">
      <div className="section-title">AI 小人逐级决策日志</div>
      <table>
        <thead><tr><th>等级</th><th>AP</th><th>SP</th><th>装备</th><th>地图/怪物</th><th>命中</th><th>单怪命中</th><th>耗时</th><th>药耗/MP</th><th>死亡</th><th>属性</th><th>原因</th></tr></thead>
        <tbody>{result.best.decisions.map((d) => <tr key={d.level}><td>Lv.{d.level}</td><td>{d.apDecision}</td><td>{d.spDecisions.length ? d.spDecisions.map((x) => <div key={x}>{x}</div>) : '—'}</td><td>{d.gearDecision}</td><td><strong>{d.mapName}</strong><br />{d.monsterNames.join(' / ')}</td><td>{(d.hitRate * 100).toFixed(1)}%</td><td><HitBreakdownCell decision={d} /></td><td>{formatHours(d.hours)}</td><td>{formatMeso(d.potionCost)}</td><td>{d.deathsExpected.toFixed(2)}</td><td>STR {d.statSnapshot.str} / DEX {d.statSnapshot.dex}<br />WATK {d.statSnapshot.weaponAttack} / ACC {d.statSnapshot.accuracy}</td><td>{d.reason}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function AlternativesTable({ result }: { result: SandboxRunResult }) {
  return (
    <div className="sandbox-table-wrap">
      <table>
        <thead><tr><th>排名</th><th>候选方案</th><th>分数</th><th>耗时</th><th>金币</th><th>药耗</th><th>装备</th><th>死亡</th><th>最终属性</th></tr></thead>
        <tbody>{result.alternatives.slice(0, 8).map((item, index) => <tr key={item.candidate.id} className={index === 0 ? 'best-row' : ''}><td>{index + 1}</td><td>{item.candidate.label}</td><td>{item.objectiveScore}</td><td>{formatHours(item.totalHours)}</td><td>{formatMeso(item.endingMeso)}</td><td>{formatMeso(item.totalPotionCost)}</td><td>{formatMeso(item.totalGearCost)}</td><td>{item.expectedDeaths}</td><td>STR {item.finalStats.str} / DEX {item.finalStats.dex}<br />WATK {item.finalStats.weaponAttack} / ACC {item.finalStats.accuracy}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function SandboxPanel({ data, input }: { data: GameData; input: SimulationInput }) {
  const [result, setResult] = useState<SandboxRunResult | null>(null);
  const [rlAlgorithm, setRlAlgorithm] = useState<RlAlgorithm>('dqn_lite');
  const [episodes, setEpisodes] = useState(24);
  const [rlReport, setRlReport] = useState<RlTrainingReport | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [copied, setCopied] = useState(false);

  const currentFrame = useMemo(() => result?.frames[Math.min(frameIndex, result.frames.length - 1)] ?? null, [result, frameIndex]);

  useEffect(() => {
    if (!playing || !result?.frames.length) return;
    const timer = window.setInterval(() => setFrameIndex((current) => current >= result.frames.length - 1 ? current : current + 1), Math.max(90, 650 / speed));
    return () => window.clearInterval(timer);
  }, [playing, result, speed]);

  const run = (objective: ObjectivePreset = 'poor_start') => {
    const sandbox = runSandboxSimulation(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), objective);
    setResult(sandbox);
    setFrameIndex(0);
    setPlaying(true);
    setCopied(false);
  };

  const train = () => setRlReport(runRlTraining(data, input, rlAlgorithm, episodes));

  const copyReport = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.reportMarkdown);
    setCopied(true);
  };

  return (
    <div className="sandbox-panel">
      <div className="sandbox-header">
        <div><div className="section-title">新服开荒 RL 沙盒</div><p>只有一个目标：开荒最优解。AI 学的是 AP、装备、风险、技能倾向组成的 policy。</p></div>
        <div className="sandbox-controls">
          <label>RL 算法<select value={rlAlgorithm} onChange={(e) => setRlAlgorithm(e.target.value as RlAlgorithm)}>{Object.entries(rlLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Episodes<input type="number" min={1} max={120} value={episodes} onChange={(e) => setEpisodes(Number(e.target.value))} /></label>
          <button onClick={train}>训练开荒 AI</button>
          <button onClick={() => run('poor_start')}>直接运行开荒沙盒</button>
        </div>
      </div>

      {rlReport ? <RlPanel report={rlReport} onRun={(objective) => run(objective)} /> : null}

      {result && currentFrame ? <>
        <div className="sandbox-playbar"><button className="secondary" onClick={() => setPlaying((v) => !v)}>{playing ? '暂停' : '播放'}</button><button className="secondary" onClick={() => setFrameIndex(0)}>回到开头</button><label>速度 {speed}x<input type="range" min={1} max={8} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label><input className="frame-slider" type="range" min={0} max={Math.max(0, result.frames.length - 1)} value={frameIndex} onChange={(e) => setFrameIndex(Number(e.target.value))} /><span>{frameIndex + 1} / {result.frames.length}</span><button className="secondary" onClick={copyReport}>{copied ? '报告已复制' : '复制沙盒报告'}</button></div>
        <div className="sandbox-main-grid"><div><SandboxStage frame={currentFrame} /><div className="sandbox-caption">{currentFrame.caption}</div><Bar label="EXP" value={currentFrame.expPercent} className="exp" /><Bar label="HP" value={currentFrame.hpPercent} className="hp" /><Bar label="MP" value={currentFrame.mpPercent} className="mp" /></div><div><div className="sandbox-stats-grid"><div><span>等级</span><strong>Lv.{currentFrame.level}</strong></div><div><span>动作</span><strong>{actionText(currentFrame.action)}</strong></div><div><span>虚拟时间</span><strong>{Math.round(currentFrame.virtualMinute)} 分钟</strong></div><div><span>金币</span><strong>{formatMeso(currentFrame.meso)}</strong></div><div><span>击杀</span><strong>{currentFrame.kills.toLocaleString()}</strong></div><div><span>死亡</span><strong>{currentFrame.deaths}</strong></div></div><div className="sandbox-findings">{result.findings.map((f) => <div key={f.title} className={`finding ${f.type}`}><strong>{f.title}</strong><p>{f.detail}</p></div>)}</div></div></div>
        <DecisionLog result={result} />
        <AlternativesTable result={result} />
      </> : <div className="sandbox-empty">点击“训练开荒 AI”，让它从多个开荒 policy 中学习；也可以直接运行开荒沙盒。</div>}
    </div>
  );
}
