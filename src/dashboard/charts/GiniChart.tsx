import type { SimStats } from '../../types/sim';
import type { PolicyEvent } from '../../types/events';

interface Props {
  history: SimStats[];
  events?: PolicyEvent[];
}

const W = 300, H = 90, ML = 36, MR = 8, MT = 8, MB = 20;

export function GiniChart({ history, events }: Props) {
  if (history.length < 2) return null;
  const iW = W - ML - MR;
  const iH = H - MT - MB;

  const minTick = history[0].tick;
  const maxTick = history[history.length - 1].tick;
  const tickRange = maxTick - minTick || 1;

  const points = history.map(d => {
    const x = ML + ((d.tick - minTick) / tickRange) * iW;
    const y = MT + iH - Math.min(1, Math.max(0, d.gini ?? 0)) * iH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastGini = (history[history.length - 1].gini ?? 0).toFixed(3);

  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>NET-WORTH GINI — {lastGini}</div>
      <svg width={W} height={H} style={svgStyle}>
        <line x1={ML} y1={MT} x2={ML} y2={MT + iH} stroke="#333" />
        <line x1={ML} y1={MT + iH} x2={ML + iW} y2={MT + iH} stroke="#333" />
        <text x={ML - 4} y={MT + 4} textAnchor="end" fill="#555" fontSize={9}>1.0</text>
        <text x={ML - 4} y={MT + iH} textAnchor="end" fill="#555" fontSize={9}>0</text>
        <text x={ML} y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{minTick}</text>
        <text x={ML + iW} y={H - 4} textAnchor="middle" fill="#555" fontSize={9}>{maxTick}</text>

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

        <polyline points={points} fill="none" stroke="#e05555" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { marginBottom: 0 };
const titleStyle: React.CSSProperties = { fontSize: 10, color: '#555', letterSpacing: 2, marginBottom: 2 };
const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };
