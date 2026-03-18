// Phase 4 policy console — all levers live-adjustable.
// Changes are sent to Sim Worker via postMessage POLICY message on the next tick.
// Each change also emits a PolicyEvent for chart markers.

import { useState } from 'react';
import { TaxSlider } from './controls/TaxSlider';
import { RedistributionSelect } from './controls/RedistributionSelect';
import { UbiAmountSlider } from './controls/UbiAmountSlider';
import { MinWageSlider } from './controls/MinWageSlider';
import { LandPolicySelect } from './controls/LandPolicySelect';
import { CentralBankControls } from './controls/CentralBankControls';
import { BankingControls } from './controls/BankingControls';
import { defaultPolicy } from '../sim/policy';
import type { PolicyState, RedistributionModel, SeedMode } from '../types/sim';
import type { MainToSim } from '../types/messages';
import type { PolicyEvent } from '../types/events';

// Fixed colours per policy field — used for chart event markers.
const EVENT_COLORS: Partial<Record<keyof PolicyState, string>> = {
  taxRate:            '#7c5cfc',
  redistribution:     '#3cc8a0',
  ubiAmount:          '#3cc8a0',
  minWage:            '#f0a040',
  landPolicy:         '#e05555',
  isCurrencyActive:   '#3cc8a0',
  centralBankRate:    '#3cc8a0',
  reserveRequirement: '#c060e0',
};

function pct(v: unknown): string {
  return `${Math.round((v as number) * 100)}%`;
}

function redistLabel(v: RedistributionModel): string {
  const map: Record<RedistributionModel, string> = {
    none:             'No redistrib',
    ubi:              'UBI on',
    targeted_welfare: 'Welfare',
    public_goods:     'Public goods',
    infrastructure:   'Infrastr.',
  };
  return map[v] ?? v;
}

function makeLabel(key: keyof PolicyState, oldPolicy: PolicyState, newVal: unknown): string {
  switch (key) {
    case 'taxRate':
      return `Tax ${pct(oldPolicy.taxRate)}→${pct(newVal)}`;
    case 'redistribution':
      return redistLabel(newVal as RedistributionModel);
    case 'ubiAmount':
      return `UBI ${pct(newVal)}`;
    case 'minWage':
      return `MinWage ${(newVal as number).toFixed(1)}`;
    case 'landPolicy':
      return `Land: ${newVal}`;
    case 'isCurrencyActive':
      return newVal ? 'Currency ON' : 'Currency OFF';
    case 'centralBankRate':
      return `Rate ${((newVal as number) * 100).toFixed(1)}%`;
    case 'reserveRequirement':
      return `Reserve ${((newVal as number) * 100).toFixed(0)}%`;
    default:
      return String(key);
  }
}

interface BankDisplay {
  isSolvent:        boolean;
  loansOutstanding: number;
  capitalBuffer:    number;
}

interface Props {
  worker:          Worker | null;
  currentTick:     number;
  seedMode:        SeedMode;
  onSeedChange:    (m: SeedMode) => void;
  onEvent:         (e: PolicyEvent) => void;
  onPolicyChange?: (patch: Partial<PolicyState>) => void;
  bankDisplay?:    BankDisplay | null;
}

export function PolicyConsole({ worker, currentTick, seedMode, onSeedChange, onEvent, onPolicyChange, bankDisplay }: Props) {
  const [policy, setPolicy] = useState<PolicyState>(defaultPolicy);

  function update(patch: Partial<PolicyState>) {
    const next = { ...policy, ...patch };
    setPolicy(next);

    if (worker) {
      const msg: MainToSim = { type: 'POLICY', policy: patch };
      worker.postMessage(msg);
    }

    onPolicyChange?.(patch);

    // Emit one event per changed key
    for (const key of Object.keys(patch) as (keyof PolicyState)[]) {
      const color = EVENT_COLORS[key] ?? '#888888';
      const label = makeLabel(key, policy, patch[key]);
      onEvent({ tick: currentTick, label, color });
    }
  }

  return (
    <div style={consoleStyle}>
      <div style={titleStyle}>POLICY CONSOLE</div>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Starting conditions</div>
        <select
          style={seedSelectStyle}
          value={seedMode}
          onChange={e => onSeedChange(e.target.value as SeedMode)}
        >
          <option value="morocco">Morocco urban 2022 (Gini ≈ 0.40)</option>
          <option value="flat">Flat (equal)</option>
        </select>
        <div style={noteStyle}>Applies on next Reset.</div>
      </section>

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

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Monetary</div>
        <CentralBankControls
          isCurrencyActive={policy.isCurrencyActive}
          centralBankRate={policy.centralBankRate}
          moneySupplyGrowth={policy.moneySupplyGrowth}
          onToggleCurrency={v => update({ isCurrencyActive: v })}
          onRateChange={v => update({ centralBankRate: v })}
          onSupplyChange={v => update({ moneySupplyGrowth: v })}
        />
      </section>

      <section style={sectionStyle}>
        <div style={sectionTitleStyle}>Banking</div>
        <BankingControls
          isCurrencyActive={policy.isCurrencyActive}
          reserveRequirement={policy.reserveRequirement}
          bankDisplay={bankDisplay ?? null}
          onReserveChange={v => update({ reserveRequirement: v })}
        />
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

const seedSelectStyle: React.CSSProperties = {
  background:  '#0d0d0d',
  border:      '1px solid #333',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    11,
  padding:     '3px 6px',
  width:       '100%',
  outline:     'none',
};
