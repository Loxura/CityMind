// Employment rate (1 - unemploymentRate) over time — plain SVG.

import type { SimStats } from '../../types/sim';

interface Props {
  history: SimStats[];
}

const W = 320, H = 80, ML = 40, MR = 8, MT = 4, MB = 20;

export function EmploymentChart({ history }: Props) {
  if (history.length < 2) return null;
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  const minTick = history[0].tick;
  const maxTick = history[history.length - 1].tick;
  const tickRange = maxTick - minTick || 1;

  const points = history.map(d => {
    const x = ML + ((d.tick - minTick) / tickRange) * iW;
    const rate = Math.min(1, Math.max(0, 1 - d.unemploymentRate));
    const y = MT + iH - rate * iH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>EMPLOYMENT RATE</div>
      <svg width={W} height={H} style={svgStyle}>
        <line x1={ML} y1={MT} x2={ML} y2={MT + iH} stroke="#333" />
        <line x1={ML} y1={MT + iH} x2={ML + iW} y2={MT + iH} stroke="#333" />
        <text x={ML - 4} y={MT + 4} textAnchor="end" fill="#555" fontSize={9}>100%</text>
        <text x={ML - 4} y={MT + iH} textAnchor="end" fill="#555" fontSize={9}>0%</text>
        <text x={ML} y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{minTick}</text>
        <text x={ML + iW} y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{maxTick}</text>
        <polyline points={points} fill="none" stroke="#f0a040" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 2 };
const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };
