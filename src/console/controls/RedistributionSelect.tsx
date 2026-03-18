import type { RedistributionModel } from '../../types/sim';

interface Props {
  value: RedistributionModel;
  onChange: (v: RedistributionModel) => void;
}

const OPTIONS: { value: RedistributionModel; label: string }[] = [
  { value: 'none',             label: 'None (accumulate)' },
  { value: 'ubi',              label: 'UBI (equal cash to all)' },
  { value: 'targeted_welfare', label: 'Targeted Welfare (poorest 20%)' },
  { value: 'public_goods',     label: 'Public Goods (add to tiles)' },
  { value: 'infrastructure',   label: 'Infrastructure (raise tile ceilings)' },
];

export function RedistributionSelect({ value, onChange }: Props) {
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>Redistribution</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as RedistributionModel)}
        style={selectStyle}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const labelStyle: React.CSSProperties = { width: 140, color: '#aaa', fontSize: 13 };
const selectStyle: React.CSSProperties = {
  flex: 1,
  background: '#222',
  color: '#e0e0e0',
  border: '1px solid #555',
  padding: '4px 8px',
  fontSize: 13,
};
