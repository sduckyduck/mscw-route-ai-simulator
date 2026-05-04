import { useEffect, useMemo, useState } from 'react';
import { runSandboxSimulation, type SandboxFrame, type SandboxRunResult } from './simulator/sandboxEngine';
import type { ObjectivePreset } from './simulator/experimentOptimizer';
import type { GameData, SimulationInput } from './simulator/types';
import { formatHours, formatMeso } from './simulator/report';
import './sandbox.css';

const objectiveLabels: Record<ObjectivePreset, string> = {
  fastest: '最快冲级',
  poor_start: '穷鬼开荒',
  low_death: '低死亡',
  low_potion: '少买药',
  shop_gear: '全商店装备',
  craft_only: '全锻造装备',
  drop_only: '全怪物掉落',
  comfort: '爽玩综合',
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

function AlternativesTable({ result }: { result: SandboxRunResult }) {
  return (
    <div className="sandbox-table-wrap">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>方案</th>
            <th>分数</th>
            <th>耗时</th>
            <th>最终金币</th>
            <th>药耗</th>
            <th>装备</th>
            <th>死亡</th>
            <th>舒适度</th>
            <th>最终属性</th>
          </tr>
        </thead>
        <tbody>
          {result.alternatives.slice(0, 8).map((item, index) => (
            <tr key={item.candidate.id} className={index === 0 ? 'best-row' : ''}>
              <td>{index + 1}</td>
              <td>{item.candidate.label}</td>
              <td>{item.objectiveScore}</td>
              <td>{formatHours(item.totalHours)}</td>
              <td>{formatMeso(item.endingMeso)}</td>
              <td>{formatMeso(item.totalPotionCost)}</td>
              <td>{formatMeso(item.totalGearCost)}</td>
              <td>{item.expectedDeaths}</td>
              <td>{item.comfortScore}</td>
              <td>
                STR {item.finalStats.str} / DEX {item.finalStats.dex}<br />
                WATK {item.finalStats.weaponAttack} / ACC {item.finalStats.accuracy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SandboxPanel({ data, input }: { data: GameData; input: SimulationInput }) {
  const [objective, setObjective] = useState<ObjectivePreset>('comfort');
  const [result, setResult] = useState<SandboxRunResult | null>(null);
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

  const run = () => {
    const sandbox = runSandboxSimulation(data, input.jobKey, input.startLevel, Math.max(input.startLevel + 1, input.targetLevel), objective);
    setResult(sandbox);
    setFrameIndex(0);
    setPlaying(true);
    setCopied(false);
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
          <div className="section-title">AI 沙盒模拟器</div>
          <p>用多方案 build search 跑 AP、装备、药耗、死亡、命中和地图选择，再把最优方案回放成小沙盘。</p>
        </div>
        <div className="sandbox-controls">
          <label>
            目标函数
            <select value={objective} onChange={(event) => setObjective(event.target.value as ObjectivePreset)}>
              {Object.entries(objectiveLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <button onClick={run}>运行沙盒</button>
        </div>
      </div>

      {result && currentFrame ? (
        <>
          <div className="sandbox-playbar">
            <button className="secondary" onClick={() => setPlaying((value) => !value)}>{playing ? '暂停' : '播放'}</button>
            <button className="secondary" onClick={() => setFrameIndex(0)}>回到开头</button>
            <label>
              速度 {speed}x
              <input type="range" min={1} max={8} step={1} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
            </label>
            <input
              className="frame-slider"
              type="range"
              min={0}
              max={Math.max(0, result.frames.length - 1)}
              value={frameIndex}
              onChange={(event) => setFrameIndex(Number(event.target.value))}
            />
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
              <div className="sandbox-findings">
                {result.findings.map((finding) => (
                  <div key={finding.title} className={`finding ${finding.type}`}>
                    <strong>{finding.title}</strong>
                    <p>{finding.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <AlternativesTable result={result} />
        </>
      ) : (
        <div className="sandbox-empty">
          先选择目标函数，然后点击“运行沙盒”。它会跑多种 build，自动挑一个最优方案并生成可回放时间线。
        </div>
      )}
    </div>
  );
}
