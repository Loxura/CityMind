// Credit-to-GDP ratio + bank solvency overlay. Phase 9+.
// Left axis: creditToGdp. Right axis: bankSolvency (fixed 0–1).

import type { SimStats } from '../../types/sim';
import type { PolicyEvent } from '../../types/events';

interface Props {
  history: SimStats[];
  events?: PolicyEvent[];
}

const W = 300, H = 90, ML = 44, MR = 28, MT = 8, MB = 20;

export function CreditGdpChart({ history, events }: Props) {
  if (history.length < 2) return null;
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  const minTick = history[0].tick;
  const maxTick = history[history.length - 1].tick;
  const tickRange = maxTick - minTick || 1;

  const maxCredit = Math.max(...history.map(d => d.creditToGdp ?? 0), 0.001);
  const lastCredit   = history[history.length - 1].creditToGdp ?? 0;
  const lastSolvency = history[history.length - 1].bankSolvency ?? 1;

  const creditPoints = history.map(d => {
    const x = ML + ((d.tick - minTick) / tickRange) * iW;
    const y = MT + iH - ((d.creditToGdp ?? 0) / maxCredit) * iH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const solvencyPoints = history.map(d => {
    const x = ML + ((d.tick - minTick) / tickRange) * iW;
    const y = MT + iH - (d.bankSolvency ?? 1) * iH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>
        CREDIT / GDP — {lastCredit.toFixed(2)}
        <span style={solLabelStyle}> · SOLVENCY {lastSolvency.toFixed(2)}</span>
      </div>
      <svg width={W} height={H} style={svgStyle}>
        {/* axes */}
        <line x1={ML} y1={MT} x2={ML} y2={MT + iH} stroke="#333" />
        <line x1={ML} y1={MT + iH} x2={ML + iW} y2={MT + iH} stroke="#333" />
        <line x1={ML + iW} y1={MT} x2={ML + iW} y2={MT + iH} stroke="#2a2a2a" />

        {/* left axis labels (credit) */}
        <text x={ML - 4} y={MT + 4}      textAnchor="end" fill="#555" fontSize={9}>{maxCredit.toFixed(1)}</text>
        <text x={ML - 4} y={MT + iH}     textAnchor="end" fill="#555" fontSize={9}>0</text>

        {/* right axis labels (solvency) */}
        <text x={ML + iW + 4} y={MT + 4}  textAnchor="start" fill="#6a3a8a" fontSize={9}>1</text>
        <text x={ML + iW + 4} y={MT + iH} textAnchor="start" fill="#6a3a8a" fontSize={9}>0</text>

        {/* tick labels */}
        <text x={ML}      y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{minTick}</text>
        <text x={ML + iW} y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{maxTick}</text>

        {/* policy event markers */}
        {events?.map(ev => {
          if (ev.tick < minTick || ev.tick > maxTick) return null;
          const ex = ML + ((ev.tick - minTick) / tickRange) * iW;
          return (
            <g key={`${ev.tick}-${ev.label}`}>
              <line x1={ex} y1={MT} x2={ex} y2={MT + iH}
                stroke={ev.color} strokeWidth={1} strokeDasharray="3,3" opacity={0.7} />
              <text x={ex + 2} y={MT + 8} fill={ev.color} fontSize={7}>{ev.label}</text>
            </g>
          );
        })}

        {/* solvency line (behind credit line) */}
        <polyline points={solvencyPoints} fill="none" stroke="#c060e0" strokeWidth={1} opacity={0.7} />

        {/* credit/GDP line */}
        <polyline points={creditPoints} fill="none" stroke="#e05555" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { marginBottom: 0 };
const titleStyle: React.CSSProperties = { fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 2 };
const solLabelStyle: React.CSSProperties = { color: '#7a3a9a', letterSpacing: 1 };
const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };
