interface Props {
  value: 'state' | 'auctioned' | 'free';
  onChange: (v: 'state' | 'auctioned' | 'free') => void;
}

const OPTIONS: { value: 'state' | 'auctioned' | 'free'; label: string }[] = [
  { value: 'free',      label: 'Free (all agents have land)' },
  { value: 'state',     label: 'State (land=0, no employers)' },
  { value: 'auctioned', label: 'Auctioned (Phase 5+)' },
];

export function LandPolicySelect({ value, onChange }: Props) {
  return (
    <div style={rowStyle}>
      <label style={labelStyle}>Land Policy</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as 'state' | 'auctioned' | 'free')}
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
