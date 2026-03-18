// Main thread only: connects to Sim Worker, displays raw SimStats as text.
// No simulation logic here — all sim runs in the worker.

import { useEffect, useRef, useState } from 'react';
import { useSimStats } from './dashboard/useSimStats';
import { defaultPolicy } from './sim/policy';
import { INITIAL_AGENT_COUNT } from './types/constants';
import { PolicyConsole } from './console/PolicyConsole';
import { WageChart } from './dashboard/charts/WageChart';
import { LabourShareChart } from './dashboard/charts/LabourShareChart';
import { EmploymentChart } from './dashboard/charts/EmploymentChart';
import type { MainToSim } from './types/messages';

// Vite worker import — bundled as a separate chunk
import SimWorkerUrl from './sim/worker.ts?worker';

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [paused, setPaused] = useState(false);
  const { stats, history, error } = useSimStats(worker);

  // Boot the Sim Worker on mount
  useEffect(() => {
    const w = new SimWorkerUrl();
    workerRef.current = w;
    setWorker(w);

    const init: MainToSim = {
      type: 'INIT',
      agentCount: INITIAL_AGENT_COUNT,
      seed: 42,
      policy: defaultPolicy(),
    };
    console.log('[App] Sending INIT to SimWorker');
    w.postMessage(init);

    w.addEventListener('error', (e) => console.error('[App] Worker uncaught error:', e));

    return () => w.terminate();
  }, []);

  function handlePauseResume() {
    const w = workerRef.current;
    if (!w) return;
    const msg: MainToSim = paused ? { type: 'RESUME' } : { type: 'PAUSE' };
    w.postMessage(msg);
    setPaused(p => !p);
  }

  function handleReset() {
    const w = workerRef.current;
    if (!w) return;
    const msg: MainToSim = { type: 'RESET', seed: Math.floor(Math.random() * 0xffffffff) };
    w.postMessage(msg);
    setPaused(false);
  }

  return (
    <div style={layoutStyle}>
      {/* Left: Policy Console */}
      <div style={leftColStyle}>
        <h1 style={titleStyle}>CITYMIND — Phase 4</h1>
        <PolicyConsole worker={worker} />
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={handlePauseResume} style={btnStyle}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={handleReset} style={btnStyle}>Reset</button>
        </div>
      </div>

      {/* Right: Dashboard */}
      <div style={rightColStyle}>
        {error && (
          <div style={errorStyle}>
            Worker error: {error}
            <button onClick={handleReset} style={btnStyle}>Reset</button>
          </div>
        )}

        {/* Stats panel */}
        <div style={panelStyle}>
          {stats ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <Row label="Tick"              value={stats.tick} />
                <Row label="Population"        value={stats.population} />
                <Row label="Avg Food"          value={stats.avgFood.toFixed(2)} />
                <Row label="Avg Wood"          value={stats.avgWood.toFixed(2)} />
                <Row label="Gini"              value={stats.gini.toFixed(4)} />
                <Row label="GDP"               value={stats.gdp.toFixed(2)} />
                <Row label="Food Price"        value={stats.foodPrice.toFixed(3)} />
                <Row label="Wood Price"        value={stats.woodPrice.toFixed(3)} />
                <Row label="Wage Rate"         value={stats.wageRate.toFixed(3)} />
                <Row label="Unemployment"      value={(stats.unemploymentRate * 100).toFixed(1) + '%'} />
                <Row label="Labour Share"      value={(stats.labourShareOfGdp * 100).toFixed(1) + '%'} />
                <Row label="Trades (total)"    value={stats.tradeCount} />
                <Row label="Trades (this tick)" value={stats.tickTradeCount} />
              </tbody>
            </table>
          ) : (
            <span style={{ color: '#888' }}>Initialising simulation…</span>
          )}
        </div>

        {/* Phase 4 charts */}
        {history.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <WageChart history={history} />
            <LabourShareChart history={history} />
            <EmploymentChart history={history} />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td style={{ color: '#888', paddingRight: 24, paddingBottom: 6 }}>{label}</td>
      <td style={{ color: '#e0e0e0', fontWeight: 'bold' }}>{value}</td>
    </tr>
  );
}

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  gap: 24,
  padding: 16,
  minHeight: '100vh',
  background: '#0a0a0a',
  color: '#e0e0e0',
  fontFamily: 'monospace',
};

const leftColStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 400,
};

const rightColStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  marginBottom: 16,
  letterSpacing: 2,
};

const panelStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  padding: 16,
  minHeight: 96,
};

const errorStyle: React.CSSProperties = {
  color: '#ff4444',
  marginBottom: 12,
  padding: 8,
  border: '1px solid #ff4444',
};

const btnStyle: React.CSSProperties = {
  background: '#222',
  color: '#e0e0e0',
  border: '1px solid #555',
  padding: '6px 16px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
};
