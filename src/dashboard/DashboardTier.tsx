// Collapsible dashboard tier.
// Collapse state is persisted in localStorage so it survives page refresh.

import { useState } from 'react';

interface Props {
  label: string;
  storageKey: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}

export function DashboardTier({ label, storageKey, defaultOpen, children }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored !== null ? stored === 'true' : defaultOpen;
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, String(next));
  }

  return (
    <div style={tierStyle}>
      <button onClick={toggle} style={headerStyle}>
        <span style={{ ...chevronStyle, transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ›
        </span>
        <span style={labelStyle}>{label}</span>
      </button>
      {open && <div style={bodyStyle}>{children}</div>}
    </div>
  );
}

const tierStyle: React.CSSProperties = {
  marginBottom: 16,
  border: '1px solid #222',
};

const headerStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#141414',
  border: 'none',
  borderBottom: '1px solid #222',
  padding: '6px 12px',
  cursor: 'pointer',
  color: '#666',
  fontFamily: 'monospace',
  fontSize: 11,
  letterSpacing: 2,
  textAlign: 'left',
};

const chevronStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 14,
  lineHeight: 1,
  transition: 'transform 0.15s',
  color: '#555',
};

const labelStyle: React.CSSProperties = {
  letterSpacing: 2,
  textTransform: 'uppercase' as const,
};

const bodyStyle: React.CSSProperties = {
  padding: 12,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
};
