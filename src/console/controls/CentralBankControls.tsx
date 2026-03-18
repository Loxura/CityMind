// Phase 7 — Central bank controls: currency toggle, base rate, money supply growth.

interface Props {
  isCurrencyActive:   boolean;
  centralBankRate:    number;
  moneySupplyGrowth:  number;
  onToggleCurrency:   (active: boolean) => void;
  onRateChange:       (rate: number) => void;
  onSupplyChange:     (growth: number) => void;
}

export function CentralBankControls({
  isCurrencyActive,
  centralBankRate,
  moneySupplyGrowth,
  onToggleCurrency,
  onRateChange,
  onSupplyChange,
}: Props) {
  return (
    <div>
      {/* Currency activation toggle */}
      <div style={rowStyle}>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={isCurrencyActive}
            onChange={e => onToggleCurrency(e.target.checked)}
            style={{ marginRight: 6, cursor: 'pointer' }}
          />
          Activate currency
        </label>
        {isCurrencyActive && (
          <span style={activeTagStyle}>LIVE</span>
        )}
      </div>
      {isCurrencyActive && (
        <div style={noteStyle}>
          Cash bootstrapped from barter prices. Food decay active.
        </div>
      )}

      {/* Base rate slider */}
      <div style={sliderRowStyle}>
        <span style={sliderLabelStyle}>Base rate</span>
        <input
          type="range"
          min={0}
          max={0.2}
          step={0.005}
          value={centralBankRate}
          onChange={e => onRateChange(Number(e.target.value))}
          style={rangeStyle}
          disabled={!isCurrencyActive}
        />
        <span style={valueStyle}>{(centralBankRate * 100).toFixed(1)}%</span>
      </div>

      {/* Money supply growth slider */}
      <div style={sliderRowStyle}>
        <span style={sliderLabelStyle}>M supply Δ</span>
        <input
          type="range"
          min={0}
          max={0.1}
          step={0.005}
          value={moneySupplyGrowth}
          onChange={e => onSupplyChange(Number(e.target.value))}
          style={rangeStyle}
          disabled={!isCurrencyActive}
        />
        <span style={valueStyle}>{(moneySupplyGrowth * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        8,
  marginBottom: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize:   11,
  color:      '#ccc',
  cursor:     'pointer',
  userSelect: 'none',
  display:    'flex',
  alignItems: 'center',
};

const activeTagStyle: React.CSSProperties = {
  fontSize:      8,
  color:         '#3cc8a0',
  letterSpacing: 1,
  border:        '1px solid #3cc8a080',
  padding:       '1px 4px',
};

const noteStyle: React.CSSProperties = {
  fontSize:    10,
  color:       '#3cc8a0',
  marginBottom: 8,
};

const sliderRowStyle: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        6,
  marginTop:  6,
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color:    '#666',
  width:    62,
  flexShrink: 0,
};

const rangeStyle: React.CSSProperties = {
  flex:       1,
  accentColor: '#3cc8a0',
};

const valueStyle: React.CSSProperties = {
  fontSize: 10,
  color:    '#ccc',
  width:    36,
  textAlign: 'right',
};
