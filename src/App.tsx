// Main thread only. No simulation logic — all sim runs in the Sim Worker.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSimStats } from './dashboard/useSimStats';
import { Dashboard } from './dashboard/Dashboard';
import { defaultPolicy } from './sim/policy';
import { INITIAL_AGENT_COUNT } from './types/constants';
import { PolicyConsole } from './console/PolicyConsole';
import { ScenarioManager } from './console/ScenarioManager';
import type { MainToSim } from './types/messages';
import type { PolicyEvent } from './types/events';
import type { PolicyState, SeedMode } from './types/sim';

import SimWorkerUrl from './sim/worker.ts?worker';

const DEFAULT_TICK_LIMIT = 5000;

export default function App() {
  const workerRef = useRef<Worker | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);

  const [paused,        setPaused]        = useState(false);
  const [events,        setEvents]        = useState<PolicyEvent[]>([]);
  const [currentSeed,   setCurrentSeed]   = useState(42);
  const [currentPolicy, setCurrentPolicy] = useState<PolicyState>(defaultPolicy());
  const [seedMode,      setSeedMode]      = useState<SeedMode>('morocco');
  const [tickLimit,     setTickLimit]     = useState(DEFAULT_TICK_LIMIT);
  const [savedRunCount, setSavedRunCount] = useState(0);

  const { stats, history, error, resetHistory } = useSimStats(worker);

  // Boot the Sim Worker on mount
  useEffect(() => {
    const w = new SimWorkerUrl();
    workerRef.current = w;
    setWorker(w);

    const init: MainToSim = {
      type:       'INIT',
      agentCount: INITIAL_AGENT_COUNT,
      seed:       42,
      policy:     defaultPolicy(),
      seedMode:   'morocco',
    };
    console.log('[App] Sending INIT to SimWorker');
    w.postMessage(init);
    w.addEventListener('error', (e) => console.error('[App] Worker uncaught error:', e));
    return () => w.terminate();
  }, []);

  // Auto-pause when tick limit is reached
  useEffect(() => {
    if (!paused && stats && stats.tick >= tickLimit) {
      workerRef.current?.postMessage({ type: 'PAUSE' } as MainToSim);
      setPaused(true);
    }
  }, [stats?.tick, tickLimit, paused]);

  const handleEvent = useCallback((e: PolicyEvent) => {
    setEvents(prev => [...prev, e]);
  }, []);

  function handlePolicyChange(patch: Partial<PolicyState>) {
    setCurrentPolicy(prev => ({ ...prev, ...patch }));
  }

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
    const newSeed = Math.floor(Math.random() * 0xffffffff);
    w.postMessage({ type: 'RESET', seed: newSeed, seedMode } as MainToSim);
    setCurrentSeed(newSeed);
    resetHistory();
    setEvents([]);
    setPaused(false);
  }

  const atTickLimit = !!(stats && stats.tick >= tickLimit && paused);

  return (
    <div style={layoutStyle}>

      {/* Left column */}
      <div style={leftColStyle}>
        <h1 style={titleStyle}>CITYMIND — Phase 9</h1>

        <PolicyConsole
          worker={worker}
          currentTick={stats?.tick ?? 0}
          seedMode={seedMode}
          onSeedChange={setSeedMode}
          onEvent={handleEvent}
          onPolicyChange={handlePolicyChange}
          bankDisplay={stats ? {
            meetsCapitalRequirement: stats.bankSolvency >= currentPolicy.reserveRequirement,
            loansOutstanding:        stats.bankLoansOutstanding,
            capitalBuffer:           stats.bankCapitalBuffer,
          } : null}
        />

        <ScenarioManager
          currentSeed={currentSeed}
          currentSeedMode={seedMode}
          currentPolicy={currentPolicy}
          currentHistory={history}
          onRunSaved={() => setSavedRunCount(n => n + 1)}
          onSeedModeChange={setSeedMode}
        />

        {/* Tick limit + run controls */}
        <div style={controlsRowStyle}>
          <label style={limitLabelStyle}>
            Auto-pause at tick:
            <input
              type="number"
              min={60}
              step={60}
              value={tickLimit}
              onChange={e => setTickLimit(Math.max(60, Number(e.target.value)))}
              style={limitInputStyle}
            />
          </label>
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handlePauseResume} style={btnStyle}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={handleReset} style={btnStyle}>Reset</button>
          {atTickLimit && (
            <span style={limitReachedStyle}>tick limit reached</span>
          )}
        </div>

        {/* Numeric stats table */}
        {error && <div style={errorStyle}>Worker error: {error}</div>}
        <div style={panelStyle}>
          {stats ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                <Row label="Tick"          value={stats.tick} />
                <Row label="Population"    value={stats.population} />
                <Row label="Avg Food"      value={stats.avgFood.toFixed(1)} />
                <Row label="Avg Wood"      value={stats.avgWood.toFixed(1)} />
                <Row label="Avg Houses"    value={stats.avgHouses.toFixed(2)} />
                <Row label="Net-worth Gini" value={stats.gini.toFixed(4)} />
                <Row label="GDP"           value={stats.gdp.toFixed(1)} />
                <Row label="Food Price"    value={stats.foodPrice.toFixed(3)} />
                <Row label="Wood Price"    value={stats.woodPrice.toFixed(3)} />
                <Row label="Wage Rate"     value={stats.wageRate.toFixed(2)} />
                <Row label="Unemployment"  value={(stats.unemploymentRate * 100).toFixed(1) + '%'} />
                <Row label="Labour Share"  value={(stats.labourShareOfGdp * 100).toFixed(1) + '%'} />
                <Row label="Avg Cash"      value={stats.avgCash.toFixed(2)} />
                <Row label="Rent Index"    value={stats.landRentIndex.toFixed(3)} />
                <Row label="Inflation"     value={(stats.inflationRate * 100).toFixed(2) + '%'} />
                <Row label="Credit/GDP"    value={stats.creditToGdp.toFixed(3)} />
                <Row label="Bank capital ratio" value={stats.bankSolvency.toFixed(3)} />
                <Row label="Loans out"     value={stats.bankLoansOutstanding.toFixed(1)} />
                <Row label="Bank capital"  value={stats.bankCapitalBuffer.toFixed(1)} />
                <Row label="Avg income"    value={stats.avgIncome.toFixed(2)} />
                <Row label="Roles" value={
                  `F:${stats.roleCounts.farmer} Bl:${stats.roleCounts.builder} M:${stats.roleCounts.merchant} Bk:${stats.roleCounts.banker} C:${stats.roleCounts.capitalist} W:${stats.roleCounts.worker}`
                } />
                <Row label="Trades (tick)" value={stats.tickTradeCount} />
                <Row label="Trades (all)"  value={stats.tradeCount} />
              </tbody>
            </table>
          ) : (
            <span style={{ color: '#888' }}>Initialising simulation…</span>
          )}
        </div>
      </div>

      {/* Right column: dashboard */}
      <Dashboard
        stats={stats}
        history={history}
        events={events}
        savedRunCount={savedRunCount}
      />

    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td style={{ color: '#888', paddingRight: 20, paddingBottom: 5, fontSize: 12 }}>{label}</td>
      <td style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: 12 }}>{value}</td>
    </tr>
  );
}

const layoutStyle: React.CSSProperties = {
  display:    'flex',
  gap:        24,
  padding:    16,
  minHeight:  '100vh',
  background: '#0a0a0a',
  color:      '#e0e0e0',
  fontFamily: 'monospace',
};

const leftColStyle: React.CSSProperties = {
  flexShrink: 0,
  width:      380,
};

const titleStyle: React.CSSProperties = {
  fontSize:      16,
  marginBottom:  16,
  letterSpacing: 3,
  color:         '#e0e0e0',
};

const controlsRowStyle: React.CSSProperties = {
  marginTop:   12,
  display:     'flex',
  alignItems:  'center',
};

const limitLabelStyle: React.CSSProperties = {
  fontSize:    11,
  color:       '#555',
  display:     'flex',
  alignItems:  'center',
  gap:         6,
  letterSpacing: 0.5,
};

const limitInputStyle: React.CSSProperties = {
  background:  '#0d0d0d',
  border:      '1px solid #333',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    11,
  padding:     '2px 5px',
  width:       64,
  outline:     'none',
};

const limitReachedStyle: React.CSSProperties = {
  fontSize:  10,
  color:     '#3cc8a0',
  letterSpacing: 1,
};

const panelStyle: React.CSSProperties = {
  background: '#111',
  border:     '1px solid #222',
  padding:    12,
  marginTop:  16,
};

const errorStyle: React.CSSProperties = {
  color:     '#ff4444',
  marginTop: 12,
  padding:   8,
  border:    '1px solid #ff4444',
  fontSize:  12,
};

const btnStyle: React.CSSProperties = {
  background:  '#1a1a1a',
  color:       '#e0e0e0',
  border:      '1px solid #444',
  padding:     '6px 16px',
  cursor:      'pointer',
  fontFamily:  'monospace',
  fontSize:    12,
};
