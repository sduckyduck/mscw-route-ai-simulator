import { useEffect, useMemo, useState } from 'react';
import { runSandboxSimulation, type SandboxFrame, type SandboxRunResult } from './simulator/sandboxEngine';
import type { ObjectivePreset } from './simulator/experimentOptimizer2';
import { runRlTraining, type RlAlgorithm, type RlTrainingReport } from './simulator/rlTrainer';
import type { GameData, SimulationInput } from './simulator/types';
import { formatHours, formatMeso } from './simulator/report';
import './sandbox.css';

const objectiveLabels: Record<ObjectivePreset, string> = {
  fastest: '最快冲级',
  poor_start: '新服穷鬼开荒',
  low_death: '低死亡',
  low_potion: '少买药',
  shop_gear: '全商店装备',
  craft_only: '全锻造装备',
  drop_only: '全怪物掉落',
  comfort: '爽玩综合',
};

const newServerObjectiveOptions: ObjectivePreset[] = ['poor_start'];

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

function actionEmoji(action: SandboxFrame['action']): string {
  if (action === 'travel') return '🏃';
  if (action === 'fight') return '⚔️';
  if (action === 'loot') return '💰';
  if (action === 'level_up') return '✨';
  if (action === 'death') return '💀';
  if (action === 'equip') return '🛡️';
  return '📋';
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function framePosition(frame: SandboxFrame): { left: string; top: string } {
  const seed = (frame.level * 31 + frame.frame * 17) % 100;
  const left = 8 + (seed % 78);
  const top = frame.action === 'travel' ? 58 : frame.action === 'death' ? 68 : 48 + ((seed * 7) % 24);
  return { left: `${left}%`, top: `${top}%` };
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
      {frame.action === 'fight' || frame.action === 'death' || frame.action === 'level_up' ? (
        <div className="sandbox-monster" style={{ left: monsterLeft, top: '54%' }} title={frame.monsterName}>👾</div>
      ) : null}
      <div className="sandbox-character" style={pos}>
        <div className="char-bubble">{actionEmoji(frame.action)}</div>
        <div className="char-body">🧍</div>
      </div>
      {frame.action === 'level_up' ? <div className="level-flash">LEVEL UP!</div> : null}
      {frame.action === 'death' ? <div className="death-flash">FAILED ROUTE?</div> : null}
    </div>
  );
}

function SandboxStats({ frame, result }: { frame: SandboxFrame; result: SandboxRunResult }) {
  return (
    <div className="sandbox-stats-grid">
      <div><span>等级</span><strong>Lv.{frame.level}</strong></div>
      <div><span>动作</span><strong>{actionText(frame.action)}</strong></div>
      <div><span>虚拟时间</span><strong>{Math.round(frame.virtualMinute)} 分钟</strong></div>
      <div><span>金币</span><strong>{formatMeso(frame.meso)}</strong></div>
      <div><span>击杀</span><strong>{frame.kills.toLocaleString()}</strong></div>
      <div><span>死亡</span><strong>{frame.deaths}</strong></div>
      <div><span>最优方案</span><strong>{result.best.candidate.label}</strong></div>
      <div><span>目标分</span><strong>{result.best.objectiveScore}</strong></div>
    </div>
  );
}

function Bar({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className="sandbox-bar-row">
      <span>{label}</span>
      <div className="sandbox-bar"><div className={className} style={{ width: percent(value) }} /></div>
      <b>{percent(value)}</b>
    </div>
  );
}

function RlPanel({ report, onUsePolicy }: { report: RlTrainingReport; onUsePolicy: (objective: ObjectivePreset) => void }) {
  const qRows = Object.entries(report.qValues)
    .filter(([action]) => action === 'poor_start')
    .sort((a, b) => b[1] - a[1]) as [ObjectivePreset, number][];
  return (
    <div className="rl-panel">
      <div className="section-title">新服穷鬼开荒训练结果</div>
      <div className="sandbox-findings">
        <div className="finding optimization">
          <strong>固定策略</strong>
          <p>新服默认按“穷鬼开荒”跑：优先不买装备、保留金币、压低药耗和死亡风险。</p>
        </div>
        <div className="finding warning">
          <strong>算法说明</strong>
          <p>{report.note}</p>
        </div>
      </div>
      <button className="secondary" onClick={() => onUsePolicy('poor_start')}>用新服穷鬼开荒跑沙盒</button>
      <div className="sandbox-table-wrap">
        <table>
          <thead><tr><th>策略动作</th><th>Q 值</th></tr></thead>
          <tbody>
            {qRows.map(([action, value]) => (
              <tr key={action}><td>{objectiveLabels[action]}</td><td>{value}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sandbox-table-wrap">
        <table>
          <thead>
            <tr><th>Episode</th><th>探索率</th><th>动作</th><th>奖励</th><th>Q值</th><th>耗时</th><th>金币</th><th>死亡</th><th>舒适度</th></tr>
          </thead>
          <tbody>
            {report.history.filter((row) => row.action === 'poor_start').slice(-30).map((row) => (
              <tr key={row.episode}>
                <td>{row.episode}</td>
                <td>{row.epsilon}</td>
                <td>{objectiveLabels[row.action]}</td>
                <td>{row.reward}</td>
                <td>{row.qValue}</td>
                <td>{formatHours(row.totalHours)}</td>
                <td>{formatMeso(row.endingMeso)}</td>
                <td>{row.expectedDeaths}</td>
                <td>{row.comfort}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LevelDecisionForUi = SandboxRunResult['best']['decisions'][number];

function HitBreakdownCell({ decision }: { decision: LevelDecisionForUi }) {
  if (!decision.hitBreakdown?.length) return <>—</>;
  return (
    <div className="hit-breakdown-list">
      {decision.hitBreakdown.map((item) => (
        <div key={`${decision.level}-${item.monsterName}-${item.monsterLevel}`} className={item.hitRate < 0.75 ? 'hit-low' : 'hit-ok'}>
          <strong>{item.monsterName}</strong>: {(item.hitRate * 100).toFixed(1)}%
          <small>
            Lv.{item.monsterLevel} / avoid {item.monsterAvoid}{item.avoidEstimated ? ' est.' : ''} / count {item.count} / weight {(item.weight * 100).toFixed(0)}%
          </small>
        </div>
      ))}
    </div>
  );
}

function DecisionLog({ result }: { result: SandboxRunResult }) {
  return (
    <div className="sandbox-table-wrap decision-log">
      <div className="section-title">AI 小人逐级决策日志</div>
      <table>
        <thead>
          <tr>
            <th>等级</th><th>AP 决策</th><th>SP 决策</th><th>装备决策</th><th>地图 / 怪物</th><th>加权命中</th><th>单怪命中 breakdown</th><th>本级耗时</th><th>药耗/MP</th><th>死亡期望</th><th>当前属性</th><th>原因</th>
          </tr>
        </thead>
        <tbody>
          {result.best.decisions.map((decision) => (
            <tr key={`decision-${decision.level}`}>
              <td>Lv.{decision.level}</td>
              <td>{decision.apDecision}</td>
              <td>{decision.spDecisions.length ? decision.spDecisions.map((line) => <div key={line}>{line}</div>) : '—'}</td>
              <td>{decision.gearDecision}</td>
              <td><strong>{decision.mapName}</strong><br />{decision.monsterNames.join(' / ')}</td>
              <td>{(decision.hitRate * 100).toFixed(1)}%</td>
              <td><HitBreakdownCell decision={decision} /></td>
              <td>{formatHours(decision.hours)}</td>
              <td>{formatMeso(decision.potionCost)}</td>
              <td>{decision.deathsExpected.toFixed(2)}</td>
              <td>STR {decision.statSnapshot.str} / DEX {decision.statSnapshot.dex}<br />WATK {decision.statSnapshot.weaponAttack} / ACC {decision.statSnapshot.accuracy}<br />AVOID {decision.statSnapshot.avoid}</td>
              <td>{decision.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlternativesTable({ result }: { result: SandboxRunResult }) {
  return (
    <div className="sandbox-table-wrap">
      <table>
        <thead>
          <tr><th>排名</th><th>方案</th><th>分数</th><th>耗时</th><th>最终金币</th><th>药耗</th><th>装备</th><th>死亡</th><th>舒适度</th><th>最终属性</th></tr>
        </thead>
        <tbody>
          {result.alternatives.slice(0, 8).map((item, index) => (
            <tr key={item.candidate.id} className={index === 0 ? 'best-row' : ''}>
              <td>{index + 1}</td><td>{item.candidate.label}</td><td>{item.objectiveScore}</td><td>{formatHours(item.totalHours)}</td><td>{formatMeso(item.endingMeso)}</td><td>{formatMeso(item.totalPotionCost)}</td><td>{formatMeso(item.totalGearCost)}</td><td>{item.expectedDeaths}</td><td>{item.comfortScore}</td>
              <td>STR {item.finalStats.str} / DEX {item.finalStats.dex}<br />WATK {item.finalStats.weaponAttack} / ACC {item.finalStats.accuracy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SandboxPanel({ data, input }: { data: GameData; input: SimulationInput }) {
  const [objective, setObjective] = useState<ObjectivePreset>('poor_start');
  const [result, setResult] = useState<SandboxRunResult | null>(null);
  const [rlAlgorithm, setRlAlgorithm] = useState<RlAlgorithm>('dqn_lite');
  const [episodes, setEpisodes] = useState(24);
  const [rlReport, setRlReport] = useState<RlTrainingReport | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [copied, setCopied] = useState(false);

  const currentFrame = useMemo(() => {
    if (!result?.frames.length) return null;
    return result.frames[Math.min(frameIndex, result.frames.length - 1)];
  }, [result, frameIndex]);

  useEffect(() => {
    if (!playing || !result?.frames.length) return;
    const delay = Math.max(90, 650 / speed);
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        if (current >= result.frames.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [playing, result, speed]);

  const run = (overrideObjective: ObjectivePreset = 'poor_start') => {
    const sandbox = runSandboxSimulation(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), overrideObjective);
    setObjective(overrideObjective);
    setResult(sandbox);
    setFrameIndex(0);
    setPlaying(true);
    setCopied(false);
  };

  const train = () => {
    const report = runRlTraining(data, input, rlAlgorithm, 'poor_start', episodes);
    setRlReport(report);
  };

  const copyReport = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.reportMarkdown);
    setCopied(true);
  };

  return (
    <div className="sandbox-panel">
      <div className="sandbox-header">
        <div>
          <div className="section-title">新服穷鬼开荒沙盒</div>
          <p>新服务器默认没有启动资金，所以这里固定按“穷鬼开荒”目标跑：不乱买装备、优先保留金币、控制药耗和死亡。</p>
        </div>
        <div className="sandbox-controls">
          <label>目标函数<select value={objective} onChange={(event) => setObjective(event.target.value as ObjectivePreset)}>{newServerObjectiveOptions.map((key) => <option key={key} value={key}>{objectiveLabels[key]}</option>)}</select></label>
          <label>RL 算法<select value={rlAlgorithm} onChange={(event) => setRlAlgorithm(event.target.value as RlAlgorithm)}>{Object.entries(rlLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Episodes<input type="number" min={1} max={300} value={episodes} onChange={(event) => setEpisodes(Number(event.target.value))} /></label>
          <button onClick={train}>训练新服穷鬼 AI</button>
          <button onClick={() => run('poor_start')}>运行穷鬼沙盒</button>
        </div>
      </div>

      {rlReport ? <RlPanel report={rlReport} onUsePolicy={() => run('poor_start')} /> : null}

      {result && currentFrame ? (
        <>
          <div className="sandbox-playbar">
            <button className="secondary" onClick={() => setPlaying((value) => !value)}>{playing ? '暂停' : '播放'}</button>
            <button className="secondary" onClick={() => setFrameIndex(0)}>回到开头</button>
            <label>速度 {speed}x<input type="range" min={1} max={8} step={1} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
            <input className="frame-slider" type="range" min={0} max={Math.max(0, result.frames.length - 1)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
            <span>{frameIndex + 1} / {result.frames.length}</span>
            <button className="secondary" onClick={copyReport}>{copied ? '报告已复制' : '复制沙盒报告'}</button>
          </div>

          <div className="sandbox-main-grid">
            <div>
              <SandboxStage frame={currentFrame} />
              <div className="sandbox-caption">{currentFrame.caption}</div>
              <Bar label="EXP" value={currentFrame.expPercent} className="exp" />
              <Bar label="HP" value={currentFrame.hpPercent} className="hp" />
              <Bar label="MP" value={currentFrame.mpPercent} className="mp" />
            </div>
            <div>
              <SandboxStats frame={currentFrame} result={result} />
              <div className="sandbox-findings">{result.findings.map((finding) => <div key={finding.title} className={`finding ${finding.type}`}><strong>{finding.title}</strong><p>{finding.detail}</p></div>)}</div>
            </div>
          </div>

          <DecisionLog result={result} />
          <AlternativesTable result={result} />
        </>
      ) : (
        <div className="sandbox-empty">点击“训练新服穷鬼 AI”或直接点击“运行穷鬼沙盒”。</div>
      )}
    </div>
  );
}
