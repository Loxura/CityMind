// Phase 9 — Banking controls: reserve requirement slider + bank status display.

interface BankDisplay {
  isSolvent:        boolean;
  loansOutstanding: number;
  capitalBuffer:    number;
}

interface Props {
  isCurrencyActive:   boolean;
  reserveRequirement: number;          // 0–0.30
  bankDisplay:        BankDisplay | null;
  onReserveChange:    (v: number) => void;
}

export function BankingControls({
  isCurrencyActive,
  reserveRequirement,
  bankDisplay,
  onReserveChange,
}: Props) {
  return (
    <div>
      <div style={sliderRowStyle}>
        <span style={sliderLabelStyle}>Reserve req.</span>
        <input
          type="range"
          min={0}
          max={0.30}
          step={0.01}
          value={reserveRequirement}
          onChange={e => onReserveChange(Number(e.target.value))}
          style={rangeStyle}
          disabled={!isCurrencyActive}
        />
        <span style={valueStyle}>{(reserveRequirement * 100).toFixed(0)}%</span>
      </div>

      {bankDisplay && (
        <div style={statusRowStyle}>
          <span style={bankDisplay.isSolvent ? solventStyle : insolventStyle}>
            {bankDisplay.isSolvent ? 'Solvent' : 'Insolvent — no new loans'}
          </span>
          <span style={metaStyle}>
            {' '}| Loans: {bankDisplay.loansOutstanding.toFixed(1)}
            {' '}| Capital: {bankDisplay.capitalBuffer.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

const sliderRowStyle: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        6,
  marginTop:  6,
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize:   10,
  color:      '#666',
  width:      62,
  flexShrink: 0,
};

const rangeStyle: React.CSSProperties = {
  flex:        1,
  accentColor: '#c060e0',
};

const valueStyle: React.CSSProperties = {
  fontSize:  10,
  color:     '#ccc',
  width:     36,
  textAlign: 'right',
};

const statusRowStyle: React.CSSProperties = {
  fontSize:   10,
  marginTop:  6,
  display:    'flex',
  flexWrap:   'wrap',
  alignItems: 'center',
  gap:        2,
};

const solventStyle: React.CSSProperties = { color: '#3cc8a0' };
const insolventStyle: React.CSSProperties = { color: '#e05555' };
const metaStyle: React.CSSProperties = { color: '#555' };
