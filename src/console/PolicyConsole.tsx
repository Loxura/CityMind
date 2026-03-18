// Phase 4 policy console — all levers live-adjustable.
// Changes are sent to Sim Worker via postMessage POLICY message.
// Takes effect on the next tick.

import { useState } from 'react';
import { TaxSlider } from './controls/TaxSlider';
import { RedistributionSelect } from './controls/RedistributionSelect';
import { UbiAmountSlider } from './controls/UbiAmountSlider';
import { MinWageSlider } from './controls/MinWageSlider';
import { LandPolicySelect } from './controls/LandPolicySelect';
import { defaultPolicy } from '../sim/policy';
import type { PolicyState } from '../types/sim';
import type { MainToSim } from '../types/messages';

interface Props {
  worker: Worker | null;
}

export function PolicyConsole({ worker }: Props) {
  const [policy, setPolicy] = useState<PolicyState>(defaultPolicy);

  function update(patch: Partial<PolicyState>) {
    const next = { ...policy, ...patch };
    setPolicy(next);
    if (worker) {
      const msg: MainToSim = { type: 'POLICY', policy: patch };
      worker.postMessage(msg);
    }
  }

  return (
    <div style={consoleStyle}>
      <div style={titleStyle}>POLICY CONSOLE</div>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Fiscal</div>
        <TaxSlider
          value={policy.taxRate}
          onChange={v => update({ taxRate: v })}
        />
        <RedistributionSelect
          value={policy.redistribution}
          onChange={v => update({ redistribution: v })}
        />
        <UbiAmountSlider
          value={policy.ubiAmount}
          onChange={v => update({ ubiAmount: v })}
        />
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Labour</div>
        <MinWageSlider
          value={policy.minWage}
          onChange={v => update({ minWage: v })}
        />
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Land</div>
        <LandPolicySelect
          value={policy.landPolicy}
          onChange={v => update({ landPolicy: v })}
        />
        <div style={noteStyle}>
          Land policy applies to new agents only (respawn / RESET).
        </div>
      </section>

      <section style={{ ...sectionStyle, opacity: 0.4 }}>
        <div style={sectionTitleStyle}>Monetary — Phase 7+</div>
        <div style={noteStyle}>Central bank controls unlock in Phase 7.</div>
      </section>
    </div>
  );
}

const consoleStyle: React.CSSProperties = {
  background: '#111',
  border: '1px solid #333',
  padding: 16,
  minWidth: 320,
  maxWidth: 400,
};

const titleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 3,
  color: '#555',
  marginBottom: 16,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  color: '#666',
  marginBottom: 8,
  borderBottom: '1px solid #222',
  paddingBottom: 4,
};

const noteStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#555',
  marginTop: 4,
};
