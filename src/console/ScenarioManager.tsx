// Scenario save / compare.
// Persistence: IndexedDB, database 'citymind', store 'scenarios'.
// "Save run" records the full SimStats history alongside seed + policy.
// Comparison is done offline in the ScenarioComparison dashboard section.

import { useEffect, useState } from 'react';
import type { PolicyState, SimStats, SeedMode } from '../types/sim';

export interface SavedScenario {
  name:      string;
  seed:      number;
  seedMode?: SeedMode;  // optional for backwards compat with legacy saves
  policy:    PolicyState;
  history:   SimStats[];   // full recorded run; [] for legacy config-only saves
  savedAt:   number;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

const DB_NAME    = 'citymind';
const STORE_NAME = 'scenarios';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'name' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export function dbGetAll(): Promise<SavedScenario[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as SavedScenario[]);
    req.onerror   = () => reject(req.error);
  }));
}

function dbPut(scenario: SavedScenario): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(scenario);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

function dbDelete(name: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(name);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

function seedModeLabel(mode: SeedMode | undefined): string {
  return mode === 'flat' ? 'Flat' : 'Morocco';
}

interface Props {
  currentSeed:       number;
  currentSeedMode:   SeedMode;
  currentPolicy:     PolicyState;
  currentHistory:    SimStats[];
  onRunSaved:        () => void;
  onSeedModeChange:  (m: SeedMode) => void;
}

export function ScenarioManager({
  currentSeed, currentSeedMode, currentPolicy, currentHistory, onRunSaved, onSeedModeChange,
}: Props) {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [open,      setOpen]      = useState(false);
  const [saveName,  setSaveName]  = useState('');

  useEffect(() => {
    dbGetAll().then(rows => setScenarios(rows.sort((a, b) => b.savedAt - a.savedAt)));
  }, []);

  function reload() {
    dbGetAll().then(rows => setScenarios(rows.sort((a, b) => b.savedAt - a.savedAt)));
  }

  function handleSave() {
    const name = saveName.trim();
    if (!name) return;
    const scenario: SavedScenario = {
      name,
      seed:     currentSeed,
      seedMode: currentSeedMode,
      policy:   { ...currentPolicy },
      history:  currentHistory,
      savedAt:  Date.now(),
    };
    dbPut(scenario).then(() => {
      setSaveName('');
      reload();
      onRunSaved();
    });
  }

  function handleDelete(name: string) {
    dbDelete(name).then(reload);
  }

  function handleExport(s: SavedScenario) {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${s.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const runCount = scenarios.filter(s => s.history?.length > 0).length;

  return (
    <div style={wrapStyle}>
      <div style={headerStyle} onClick={() => setOpen(o => !o)}>
        <span style={titleStyle}>SCENARIOS</span>
        <span style={metaStyle}>
          {runCount > 0 ? `${runCount} run${runCount > 1 ? 's' : ''} saved` : ''}
        </span>
        <span style={chevStyle}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={bodyStyle}>

          {/* Save current run */}
          <div style={saveRowStyle}>
            <input
              style={inputStyle}
              placeholder="Run name…"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button style={btnStyle} onClick={handleSave}>Save run</button>
          </div>

          {currentHistory.length > 0 && (
            <div style={histInfoStyle}>{currentHistory.length} stat entries recorded</div>
          )}

          {/* Saved list */}
          {scenarios.length === 0 ? (
            <div style={emptyStyle}>No saved runs.</div>
          ) : (
            <table style={tableStyle}>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.name} style={rowStyle}>
                    <td style={nameCellStyle} title={s.name}>{s.name}</td>
                    <td style={dateCellStyle}>
                      {s.history?.length > 0
                        ? `${s.history.length} pts`
                        : <span style={{ color: '#333' }}>no hist</span>
                      }
                    </td>
                    <td style={dateCellStyle}>
                      <span style={seedTagStyle}>{seedModeLabel(s.seedMode)}</span>
                    </td>
                    <td style={actionsCellStyle}>
                      <button style={smallBtn} onClick={() => handleExport(s)} title="Export JSON">↓</button>
                      <button style={smallBtn}
                        onClick={() => onSeedModeChange(s.seedMode ?? 'morocco')}
                        title="Restore seed mode for next Reset">⟳</button>
                      <button style={{ ...smallBtn, color: '#e05555' }}
                        onClick={() => handleDelete(s.name)} title="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {runCount >= 2 && (
            <div style={hintStyle}>Open "Scenario comparison" below to compare runs.</div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  background:  '#111',
  border:      '1px solid #333',
  marginTop:   12,
};

const headerStyle: React.CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  padding:        '8px 12px',
  cursor:         'pointer',
  userSelect:     'none',
};

const titleStyle: React.CSSProperties = {
  fontSize:      11,
  letterSpacing: 3,
  color:         '#555',
};

const metaStyle: React.CSSProperties = {
  fontSize: 9,
  color:    '#3cc8a0',
  flex:     1,
  paddingLeft: 8,
};

const chevStyle: React.CSSProperties = {
  fontSize: 9,
  color:    '#444',
};

const bodyStyle: React.CSSProperties = {
  padding:    '0 12px 12px',
  borderTop:  '1px solid #1e1e1e',
};

const saveRowStyle: React.CSSProperties = {
  display:   'flex',
  gap:       6,
  marginTop: 10,
};

const inputStyle: React.CSSProperties = {
  flex:        1,
  background:  '#0d0d0d',
  border:      '1px solid #333',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    11,
  padding:     '3px 6px',
  outline:     'none',
};

const btnStyle: React.CSSProperties = {
  background:  '#1a1a1a',
  border:      '1px solid #444',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    10,
  padding:     '3px 8px',
  cursor:      'pointer',
  whiteSpace:  'nowrap',
};

const histInfoStyle: React.CSSProperties = {
  fontSize:  9,
  color:     '#3cc8a0',
  marginTop: 4,
};

const tableStyle: React.CSSProperties = {
  width:           '100%',
  borderCollapse:  'collapse',
  marginTop:       8,
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid #1a1a1a',
};

const nameCellStyle: React.CSSProperties = {
  fontSize:      11,
  color:         '#ccc',
  maxWidth:      130,
  overflow:      'hidden',
  textOverflow:  'ellipsis',
  whiteSpace:    'nowrap',
  paddingBottom: 4,
};

const dateCellStyle: React.CSSProperties = {
  fontSize:      9,
  color:         '#555',
  paddingLeft:   6,
  paddingBottom: 4,
  whiteSpace:    'nowrap',
};

const actionsCellStyle: React.CSSProperties = {
  display:       'flex',
  gap:           3,
  paddingBottom: 4,
  justifyContent: 'flex-end',
};

const smallBtn: React.CSSProperties = {
  background:  'none',
  border:      '1px solid #2a2a2a',
  color:       '#555',
  fontFamily:  'monospace',
  fontSize:    9,
  padding:     '1px 4px',
  cursor:      'pointer',
};

const hintStyle: React.CSSProperties = {
  fontSize:    9,
  color:       '#3cc8a0',
  marginTop:   10,
  paddingTop:  8,
  borderTop:   '1px solid #1a1a1a',
};

const emptyStyle: React.CSSProperties = {
  fontSize:  10,
  color:     '#333',
  marginTop: 8,
};

const seedTagStyle: React.CSSProperties = {
  fontSize:      8,
  color:         '#444',
  letterSpacing: 0.5,
};
