// Wealth histogram — two views toggled by the user:
//   "Agents"     — agent count per decile bin (default)
//   "Net worth held" — measured net worth held per decile bin
// Toggle state is local; no prop needed.

import { useState } from 'react';
import type { SimStats } from '../../types/sim';

interface Props {
  stats: SimStats;
}

const W = 220, H = 100, ML = 28, MR = 8, MT = 8, MB = 30;
const BARS = 10;

type View = 'agents' | 'wealth';

export function WealthHistogram({ stats }: Props) {
  const [view, setView] = useState<View>('agents');
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  const data = view === 'agents' ? stats.wealthBrackets : stats.wealthByBracket;
  const maxVal = Math.max(...data, 1);
  const barCount = data.length || BARS;
  const barW = iW / barCount;

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>MEASURED NET WORTH</span>
        <span style={toggleStyle}>
          <button
            onClick={() => setView('agents')}
            style={view === 'agents' ? activeBtn : inactiveBtn}
          >
            Agents
          </button>
          <button
            onClick={() => setView('wealth')}
            style={view === 'wealth' ? activeBtn : inactiveBtn}
          >
            Net worth held
          </button>
        </span>
      </div>
      <svg width={W} height={H} style={svgStyle}>
        <line x1={ML} y1={MT} x2={ML} y2={MT + iH} stroke="#333" />
        <line x1={ML} y1={MT + iH} x2={ML + iW} y2={MT + iH} stroke="#333" />
        <text x={ML - 4} y={MT + 4} textAnchor="end" fill="#555" fontSize={9}>
          {view === 'agents' ? maxVal : abbreviate(maxVal)}
        </text>
        {/* Percentile boundary labels: P10…P90 and the wealth value at each threshold */}
        {(stats.wealthBoundaries ?? []).map((boundaryVal, i) => {
          const x = ML + (i + 1) * barW;
          return (
            <g key={i}>
              <line x1={x} y1={MT + iH} x2={x} y2={MT + iH + 3} stroke="#333" />
              <text x={x} y={MT + iH + 10} textAnchor="middle" fill="#444" fontSize={7}>
                P{(i + 1) * 10}
              </text>
              <text x={x} y={MT + iH + 20} textAnchor="middle" fill="#333" fontSize={6}>
                {abbreviate(boundaryVal)}
              </text>
            </g>
          );
        })}

        {data.map((val, i) => {
          const barH = (val / maxVal) * iH;
          const x = ML + i * barW + 1;
          const y = MT + iH - barH;
          const t = i / Math.max(1, barCount - 1);
          const r = Math.round(124 * (1 - t) + 60 * t);
          const g = Math.round(92  * (1 - t) + 200 * t);
          const b = Math.round(252 * (1 - t) + 160 * t);
          return (
            <rect
              key={i}
              x={x} y={y}
              width={Math.max(1, barW - 2)} height={Math.max(1, barH)}
              fill={`rgb(${r},${g},${b})`}
              opacity={0.8}
            />
          );
        })}
      </svg>
    </div>
  );
}

function abbreviate(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

const wrapStyle: React.CSSProperties = { marginBottom: 0 };

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 2,
};

const titleStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  letterSpacing: 2,
};

const toggleStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
};

const baseBtn: React.CSSProperties = {
  background: 'none',
  border: '1px solid #333',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: 9,
  padding: '1px 5px',
  letterSpacing: 0.5,
};

const activeBtn: React.CSSProperties  = { ...baseBtn, color: '#e0e0e0', borderColor: '#555' };
const inactiveBtn: React.CSSProperties = { ...baseBtn, color: '#444',   borderColor: '#222' };

const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };
