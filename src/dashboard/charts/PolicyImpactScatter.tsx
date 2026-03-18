// Policy impact scatter — Gini (X) × Population (Y) trail.
// Shows where the sim has been in policy-outcome space.
// Older points fade out. Newest point is full-opacity and larger.

import type { SimStats } from '../../types/sim';

interface Props {
  history: SimStats[];
}

const W = 220, H = 200, ML = 36, MR = 12, MT = 8, MB = 24;
const MAX_POP = 500;  // MAX_STABLE_POPULATION — axis ceiling

export function PolicyImpactScatter({ history }: Props) {
  if (history.length < 1) return null;
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  function toXY(d: SimStats): [number, number] {
    const x = ML + Math.min(1, Math.max(0, d.gini)) * iW;
    const y = MT + iH - Math.min(1, d.population / MAX_POP) * iH;
    return [x, y];
  }

  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>POLICY IMPACT — Gini × Pop</div>
      <svg width={W} height={H} style={svgStyle}>
        <line x1={ML} y1={MT} x2={ML} y2={MT + iH} stroke="#333" />
        <line x1={ML} y1={MT + iH} x2={ML + iW} y2={MT + iH} stroke="#333" />

        <text x={ML} y={H - 6} textAnchor="middle" fill="#555" fontSize={8}>0</text>
        <text x={ML + iW / 2} y={H - 6} textAnchor="middle" fill="#555" fontSize={8}>Gini 0.5</text>
        <text x={ML + iW} y={H - 6} textAnchor="middle" fill="#555" fontSize={8}>1</text>

        <text x={ML - 4} y={MT + 4} textAnchor="end" fill="#555" fontSize={8}>{MAX_POP}</text>
        <text x={ML - 4} y={MT + iH} textAnchor="end" fill="#555" fontSize={8}>0</text>

        <line x1={ML + iW / 2} y1={MT} x2={ML + iW / 2} y2={MT + iH} stroke="#1e1e1e" />
        <line x1={ML} y1={MT + iH / 2} x2={ML + iW} y2={MT + iH / 2} stroke="#1e1e1e" />

        {history.map((d, i) => {
          const [x, y] = toXY(d);
          const age = (history.length - 1 - i) / Math.max(1, history.length - 1);
          const opacity = 0.15 + (1 - age) * 0.65;
          const r = i === history.length - 1 ? 4 : 2;
          return (
            <circle key={i} cx={x} cy={y} r={r} fill="#7c5cfc" opacity={opacity} />
          );
        })}
      </svg>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { marginBottom: 0 };
const titleStyle: React.CSSProperties = { fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 2 };
const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };
