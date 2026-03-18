import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export function MinWageSlider({ value, onChange }: Props) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  return (
    <div style={rowStyle}>
      <label style={labelStyle}>Min Wage</label>
      <input
        type="range" min={0} max={30} step={0.5}
        value={localValue}
        onChange={e => setLocalValue(parseFloat(e.target.value))}
        onMouseUp={e => onChange(parseFloat((e.target as HTMLInputElement).value))}
        onTouchEnd={e => onChange(parseFloat((e.target as HTMLInputElement).value))}
        style={sliderStyle}
      />
      <span style={valueStyle}>{localValue.toFixed(1)}</span>
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const labelStyle: React.CSSProperties = { width: 140, color: '#aaa', fontSize: 13 };
const sliderStyle: React.CSSProperties = { flex: 1 };
const valueStyle: React.CSSProperties = { width: 40, textAlign: 'right', color: '#e0e0e0', fontSize: 13 };
