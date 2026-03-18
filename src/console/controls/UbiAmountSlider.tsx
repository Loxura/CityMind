interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function UbiAmountSlider({ value, onChange }: Props) {
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>UBI Fraction</label>
      <input
        type="range" min={0} max={1} step={0.05}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={sliderStyle}
      />
      <span style={valueStyle}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const labelStyle: React.CSSProperties = { width: 140, color: '#aaa', fontSize: 13 };
const sliderStyle: React.CSSProperties = { flex: 1 };
const valueStyle: React.CSSProperties = { width: 40, textAlign: 'right', color: '#e0e0e0', fontSize: 13 };
