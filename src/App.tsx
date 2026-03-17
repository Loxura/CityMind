// Main thread only: connects to Sim Worker, displays raw SimStats as text.
// No simulation logic here — all sim runs in the worker.

import { useEffect, useRef, useState } from 'react';
import { useSimStats } from './dashboard/useSimStats';
import { defaultPolicy } from './sim/policy';
import { INITIAL_AGENT_COUNT } from './types/constants';
import type { MainToSim } from './types/messages';

// Vite worker import — bundled as a separate chunk
import SimWorkerUrl from './sim/worker.ts?worker';

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [paused, setPaused] = useState(false);
  const { stats, error } = useSimStats(worker);

  // Boot the Sim Worker on mount
  useEffect(() => {
    const worker = new SimWorkerUrl();
    workerRef.current = worker;
    setWorker(worker);

    const init: MainToSim = {
      type: 'INIT',
      agentCount: INITIAL_AGENT_COUNT,
      seed: 42,
      policy: defaultPolicy(),
    };
    console.log('[App] Sending INIT to SimWorker');
    worker.postMessage(init);

    worker.addEventListener('error', (e) => console.error('[App] Worker uncaught error:', e));

    return () => worker.terminate();
  }, []);

  function handlePauseResume() {
    const worker = workerRef.current;
    if (!worker) return;
    const msg: MainToSim = paused ? { type: 'RESUME' } : { type: 'PAUSE' };
    worker.postMessage(msg);
    setPaused(p => !p);
  }

  function handleReset() {
    const worker = workerRef.current;
    if (!worker) return;
    const msg: MainToSim = { type: 'RESET', seed: Math.floor(Math.random() * 0xffffffff) };
    worker.postMessage(msg);
    setPaused(false);
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 18, marginBottom: 16, letterSpacing: 2 }}>
        CITYMIND — Phase 1
      </h1>

      {error && (
        <div style={{ color: '#ff4444', marginBottom: 12, padding: 8, border: '1px solid #ff4444' }}>
          Worker error: {error}
          <button onClick={handleReset} style={btnStyle}>Reset</button>
        </div>
      )}

      <div style={panelStyle}>
        {stats ? (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <Row label="Tick" value={stats.tick} />
              <Row label="Population" value={stats.population} />
              <Row label="Avg Food" value={stats.avgFood.toFixed(2)} />
              <Row label="Avg Wood" value={stats.avgWood.toFixed(2)} />
            </tbody>
          </table>
        ) : (
          <span style={{ color: '#888' }}>Initialising simulation…</span>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={handlePauseResume} style={btnStyle}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={handleReset} style={btnStyle}>Reset</button>
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

const panelStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  padding: 16,
  minHeight: 96,
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
