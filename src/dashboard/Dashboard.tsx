// Three-tier collapsible dashboard + scenario comparison section.
// Tier 1: always visible. Tier 2/3: collapse state persisted in localStorage.
// Tier 4: scenario comparison — collapsed by default, loaded from IndexedDB.

import { DashboardTier } from './DashboardTier';
import { GiniChart } from './charts/GiniChart';
import { PopulationChart } from './charts/PopulationChart';
import { PriceChart } from './charts/PriceChart';
import { GdpChart } from './charts/GdpChart';
import { PolicyEventLog } from './charts/PolicyEventLog';
import { WealthHistogram } from './charts/WealthHistogram';
import { WageChart } from './charts/WageChart';
import { LabourShareChart } from './charts/LabourShareChart';
import { EmploymentChart } from './charts/EmploymentChart';
import { TradeVolumeChart } from './charts/TradeVolumeChart';
import { AvgResourceChart } from './charts/AvgResourceChart';
import { PolicyImpactScatter } from './charts/PolicyImpactScatter';
import { RentIncomeChart } from './charts/RentIncomeChart';
import { CreditGdpChart } from './charts/CreditGdpChart';
import { TechAdoptionChart } from './charts/TechAdoptionChart';
import { StockIndexChart } from './charts/StockIndexChart';
import { InflationChart } from './charts/InflationChart';
import { ScenarioComparison } from './ScenarioComparison';
import type { SimStats } from '../types/sim';
import type { PolicyEvent } from '../types/events';

interface Props {
  stats:         SimStats | null;
  history:       SimStats[];
  events:        PolicyEvent[];
  savedRunCount: number;
}

export function Dashboard({ stats, history, events, savedRunCount }: Props) {
  const hasHistory = history.length > 1;

  return (
    <div style={dashStyle}>

      {/* ── Tier 1: always visible ─────────────────────────────────────────── */}
      <div style={tier1Style}>
        {hasHistory && (
          <>
            <GiniChart       history={history} events={events} />
            <PopulationChart history={history} events={events} />
            <PriceChart      history={history} events={events} />
            <GdpChart        history={history} events={events} />
          </>
        )}
        <PolicyEventLog events={events} />
      </div>

      {/* ── Tier 2: Market detail (open by default) ────────────────────────── */}
      <DashboardTier
        label="Market detail"
        storageKey="citymind_tier2_open"
        defaultOpen={true}
      >
        {hasHistory && stats && (
          <>
            <WealthHistogram  stats={stats} />
            <WageChart        history={history} events={events} />
            <LabourShareChart history={history} events={events} />
            <EmploymentChart  history={history} events={events} />
            <TradeVolumeChart history={history} events={events} />
            <AvgResourceChart history={history} events={events} />
            <CreditGdpChart   history={history} events={events} />
            <PolicyImpactScatter history={history} />
          </>
        )}
      </DashboardTier>

      {/* ── Tier 3: Advanced metrics (collapsed by default) ────────────────── */}
      <DashboardTier
        label="Advanced metrics"
        storageKey="citymind_tier3_open"
        defaultOpen={false}
      >
        {hasHistory && (
          <>
            <InflationChart    history={history} events={events} />
            <RentIncomeChart   history={history} events={events} />
            <TechAdoptionChart history={history} events={events} />
            <StockIndexChart   history={history} events={events} />
          </>
        )}
      </DashboardTier>

      {/* ── Tier 4: Scenario comparison (collapsed by default) ─────────────── */}
      <DashboardTier
        label="Scenario comparison"
        storageKey="citymind_tier4_open"
        defaultOpen={false}
      >
        <ScenarioComparison savedRunCount={savedRunCount} />
      </DashboardTier>

    </div>
  );
}

const dashStyle: React.CSSProperties = {
  flex:     1,
  minWidth: 0,
};

const tier1Style: React.CSSProperties = {
  display:      'flex',
  flexWrap:     'wrap',
  gap:          12,
  marginBottom: 16,
  padding:      '0 0 12px 0',
  borderBottom: '1px solid #1e1e1e',
};
