// Vertical list of policy events — most recent first.
// Appears as a panel in Tier 1 alongside the time-series charts.

import type { PolicyEvent } from '../../types/events';

interface Props {
  events: PolicyEvent[];
}

const MAX_SHOWN = 20;

export function PolicyEventLog({ events }: Props) {
  const shown = [...events].reverse().slice(0, MAX_SHOWN);

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>POLICY LOG</div>
      {shown.length === 0 ? (
        <div style={emptyStyle}>No changes yet</div>
      ) : (
        <div style={listStyle}>
          {shown.map((ev, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ ...dotStyle, background: ev.color }} />
              <span style={tickStyle}>t{ev.tick}</span>
              <span style={labelStyle}>{ev.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#0d0d0d',
  width: 200,
  height: 90,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const titleStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  letterSpacing: 2,
  marginBottom: 4,
  padding: '0 2px',
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#444',
  padding: '4px 2px',
};

const listStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 3,
};

const dotStyle: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
};

const tickStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#555',
  width: 36,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#aaa',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
