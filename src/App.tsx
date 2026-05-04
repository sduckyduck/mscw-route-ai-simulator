import { useEffect, useMemo, useState } from 'react';
import { SandboxPanel } from './SandboxPanel';
import { loadGameData } from './simulator/data';
import { JOB_OPTIONS } from './simulator/jobs';
import type { GameData, JobKey, SimulationInput } from './simulator/types';

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

function updateNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default function App() {
  const [data, setData] = useState<GameData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);

  useEffect(() => {
    loadGameData()
      .then((loaded) => setData(loaded))
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const selectedJob = useMemo(() => JOB_OPTIONS.find((job) => job.key === input.jobKey), [input.jobKey]);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">MapleStory Classic World</p>
          <h1>开荒路线 AI 沙盒模拟器</h1>
          <p className="subtitle">
            用怪物、地图、装备、AP、SP、命中、药耗、死亡风险和跑图成本做多方案 build search，再回放 AI 小人的逐级决策。
          </p>
        </div>
        <div className="hero-badge">
          <span>AI BOT</span>
          <strong>Sandbox v0.5</strong>
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

          {selectedJob ? <p className="job-note">{selectedJob.notes}</p> : null}

          <div className="job-note">
            运行沙盒后，AI 会逐级记录 AP、SP、装备、地图、怪物、命中率、药耗/MP、死亡期望和最终属性。
          </div>
        </aside>

        <section className="result-panel">
          {!data ? (
            <div className="loading">正在读取 zip 数据快照...</div>
          ) : (
            <SandboxPanel data={data} input={{ ...input, targetLevel: Math.max(input.startLevel + 1, input.targetLevel) }} />
          )}
        </section>
      </section>
    </main>
  );
}
