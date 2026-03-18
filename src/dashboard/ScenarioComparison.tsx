// Scenario comparison — side-by-side offline comparison of two saved runs.
// Reads full SimStats histories from IndexedDB.
// Both columns use the same x-axis range (min of both run lengths) and
// the same y-axis scales so the comparison is visually honest.

import { useEffect, useState } from 'react';
import { dbGetAll } from '../console/ScenarioManager';
import type { SavedScenario } from '../console/ScenarioManager';
import type { SimStats, SeedMode, PolicyState } from '../types/sim';

function seedModeLabel(mode: SeedMode | undefined): string {
  return mode === 'flat' ? 'Flat (equal)' : 'Morocco urban 2022';
}

interface Props {
  savedRunCount: number;  // increments on each save → triggers reload
}

// ── Mini chart helpers ─────────────────────────────────────────────────────────

const CW = 240, CH = 80, CML = 36, CMR = 8, CMT = 6, CMB = 18;

function fmtV(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

interface LineProps {
  data:     SimStats[];
  accessor: (d: SimStats) => number;
  maxVal:   number;
  color:    string;
}

function MiniLine({ data, accessor, maxVal, color }: LineProps) {
  if (data.length < 2) return null;
  const iW = CW - CML - CMR;
  const iH = CH - CMT - CMB;
  const minTick  = data[0].tick;
  const tickRange = data[data.length - 1].tick - minTick || 1;

  const pts = data.map(d => {
    const x = CML + ((d.tick - minTick) / tickRange) * iW;
    const y = CMT + iH - (Math.max(0, accessor(d)) / maxVal) * iH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={CW} height={CH} style={svgStyle}>
      <line x1={CML} y1={CMT} x2={CML} y2={CMT + iH} stroke="#333" />
      <line x1={CML} y1={CMT + iH} x2={CML + iW} y2={CMT + iH} stroke="#333" />
      <text x={CML - 3} y={CMT + 4}    textAnchor="end"    fill="#444" fontSize={8}>{fmtV(maxVal)}</text>
      <text x={CML - 3} y={CMT + iH}   textAnchor="end"    fill="#444" fontSize={8}>0</text>
      <text x={CML}     y={CH - 2}      textAnchor="middle" fill="#444" fontSize={7}>{data[0].tick}</text>
      <text x={CML + iW} y={CH - 2}     textAnchor="middle" fill="#444" fontSize={7}>{data[data.length - 1].tick}</text>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// Generalised two-line chart — replaces the old MiniPriceChart.
// Used for prices (food/wood), labour (unemployment/labourShare), etc.
interface DualLineProps {
  data:      SimStats[];
  accessor1: (d: SimStats) => number;
  color1:    string;
  accessor2: (d: SimStats) => number;
  color2:    string;
  maxVal:    number;
}

function MiniDualLine({ data, accessor1, color1, accessor2, color2, maxVal }: DualLineProps) {
  if (data.length < 2) return null;
  const iW = CW - CML - CMR;
  const iH = CH - CMT - CMB;
  const minTick   = data[0].tick;
  const tickRange = data[data.length - 1].tick - minTick || 1;

  function pts(accessor: (d: SimStats) => number): string {
    return data.map(d => {
      const x = CML + ((d.tick - minTick) / tickRange) * iW;
      const y = CMT + iH - (Math.max(0, accessor(d)) / maxVal) * iH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  return (
    <svg width={CW} height={CH} style={svgStyle}>
      <line x1={CML} y1={CMT} x2={CML} y2={CMT + iH} stroke="#333" />
      <line x1={CML} y1={CMT + iH} x2={CML + iW} y2={CMT + iH} stroke="#333" />
      <text x={CML - 3} y={CMT + 4}  textAnchor="end"    fill="#444" fontSize={8}>{fmtV(maxVal)}</text>
      <text x={CML - 3} y={CMT + iH} textAnchor="end"    fill="#444" fontSize={8}>0</text>
      <text x={CML}      y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>{data[0].tick}</text>
      <text x={CML + iW} y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>{data[data.length - 1].tick}</text>
      <polyline points={pts(accessor1)} fill="none" stroke={color1} strokeWidth={1.5} />
      <polyline points={pts(accessor2)} fill="none" stroke={color2} strokeWidth={1.5} />
    </svg>
  );
}

interface HistProps {
  brackets: number[];
  maxVal:   number;
  color:    string;
}

function MiniHistogram({ brackets, maxVal, color }: HistProps) {
  const BARS = brackets.length;
  const iW   = CW - CML - CMR;
  const iH   = CH - CMT - CMB;
  const barW = iW / BARS;

  return (
    <svg width={CW} height={CH} style={svgStyle}>
      <line x1={CML} y1={CMT} x2={CML} y2={CMT + iH} stroke="#333" />
      <line x1={CML} y1={CMT + iH} x2={CML + iW} y2={CMT + iH} stroke="#333" />
      <text x={CML - 3} y={CMT + 4}  textAnchor="end"    fill="#444" fontSize={8}>{fmtV(maxVal)}</text>
      <text x={CML}      y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>poor</text>
      <text x={CML + iW} y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>rich</text>
      {brackets.map((val, i) => {
        const barH = maxVal > 0 ? (val / maxVal) * iH : 0;
        const x = CML + i * barW + 1;
        const y = CMT + iH - barH;
        return (
          <rect key={i} x={x} y={y}
            width={Math.max(1, barW - 2)} height={Math.max(1, barH)}
            fill={color} opacity={0.75} />
        );
      })}
    </svg>
  );
}

interface ScatterProps {
  data:  SimStats[];
  color: string;
}

const MAX_POP = 500;

function MiniScatter({ data, color }: ScatterProps) {
  const iW = CW - CML - CMR;
  const iH = CH - CMT - CMB;

  return (
    <svg width={CW} height={CH} style={svgStyle}>
      <line x1={CML} y1={CMT} x2={CML} y2={CMT + iH} stroke="#333" />
      <line x1={CML} y1={CMT + iH} x2={CML + iW} y2={CMT + iH} stroke="#333" />
      <text x={CML - 3} y={CMT + 4}  textAnchor="end"    fill="#444" fontSize={7}>{MAX_POP}</text>
      <text x={CML}      y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>0</text>
      <text x={CML + iW} y={CH - 2}   textAnchor="middle" fill="#444" fontSize={7}>Gini 1</text>
      {data.map((d, i) => {
        const x = CML + Math.min(1, Math.max(0, d.gini)) * iW;
        const y = CMT + iH - Math.min(1, d.population / MAX_POP) * iH;
        const age = (data.length - 1 - i) / Math.max(1, data.length - 1);
        const opacity = 0.1 + (1 - age) * 0.7;
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 4 : 2}
          fill={color} opacity={opacity} />;
      })}
    </svg>
  );
}

// ── Summary computation ────────────────────────────────────────────────────────

interface Summary {
  finalGini:        number;
  finalPop:         number;
  avgGdp:           number;
  peakTradeTick:    number;
  totalTrades:      number;
  runLength:        number;
  finalUnemployment: number;
  avgWage:          number;
  avgLabourShare:   number;
  finalAvgHouses:   number;
  finalAvgCash:     number;
  finalRentIndex:   number;
}

function computeSummary(hist: SimStats[]): Summary {
  if (hist.length === 0) return {
    finalGini: 0, finalPop: 0, avgGdp: 0, peakTradeTick: 0, totalTrades: 0,
    runLength: 0, finalUnemployment: 0, avgWage: 0, avgLabourShare: 0,
    finalAvgHouses: 0, finalAvgCash: 0, finalRentIndex: 0,
  };
  const last = hist[hist.length - 1];
  const n    = hist.length;
  return {
    finalGini:         last.gini,
    finalPop:          last.population,
    avgGdp:            hist.reduce((s, d) => s + d.gdp,            0) / n,
    peakTradeTick:     Math.max(...hist.map(d => d.tickTradeCount)),
    totalTrades:       last.tradeCount,
    runLength:         last.tick,
    finalUnemployment: last.unemploymentRate,
    avgWage:           hist.reduce((s, d) => s + d.wageRate,        0) / n,
    avgLabourShare:    hist.reduce((s, d) => s + d.labourShareOfGdp, 0) / n,
    finalAvgHouses:    last.avgHouses,
    finalAvgCash:      last.avgCash,
    finalRentIndex:    last.landRentIndex,
  };
}

// Build a compact one-line policy summary string for the diff rows.
function policyLabel(p: PolicyState | undefined): string {
  if (!p) return '—';
  return `${(p.taxRate * 100).toFixed(0)}%`;
}

function redistributionLabel(p: PolicyState | undefined): string {
  if (!p) return '—';
  const r = p.redistribution;
  if (r === 'ubi')             return `UBI (×${p.ubiAmount.toFixed(2)})`;
  if (r === 'targeted_welfare') return 'Targeted welfare';
  if (r === 'public_goods')     return 'Public goods';
  if (r === 'infrastructure')   return 'Infrastructure';
  return 'None';
}

function currencyLabel(p: PolicyState | undefined): string {
  if (!p) return '—';
  return p.isCurrencyActive
    ? `ON  rate ${(p.centralBankRate * 100).toFixed(1)}%`
    : 'OFF';
}

function landLabel(p: PolicyState | undefined): string {
  if (!p) return '—';
  const minW = p.minWage > 0 ? `  minwage ${p.minWage.toFixed(1)}` : '';
  return `${p.landPolicy}${minW}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ScenarioComparison({ savedRunCount }: Props) {
  const [runs,  setRuns]  = useState<SavedScenario[]>([]);
  const [nameA, setNameA] = useState('');
  const [nameB, setNameB] = useState('');

  useEffect(() => {
    dbGetAll().then(all => {
      const withHistory = all
        .filter(s => s.history?.length > 0)
        .sort((a, b) => b.savedAt - a.savedAt);
      setRuns(withHistory);
    });
  }, [savedRunCount]);

  if (runs.length < 2) {
    return (
      <div style={emptyStyle}>
        Save two or more runs to compare them.
      </div>
    );
  }

  const runA = runs.find(r => r.name === nameA);
  const runB = runs.find(r => r.name === nameB);

  function alignedHistory(hist: SimStats[], sharedTicks: number): SimStats[] {
    return hist.slice(0, sharedTicks);
  }

  let histA: SimStats[] = [];
  let histB: SimStats[] = [];
  let sharedTicks = 0;

  if (runA && runB) {
    sharedTicks = Math.min(runA.history.length, runB.history.length);
    histA = alignedHistory(runA.history, sharedTicks);
    histB = alignedHistory(runB.history, sharedTicks);
  }

  function sharedMax(accessor: (d: SimStats) => number): number {
    if (!histA.length || !histB.length) return 1;
    return Math.max(
      Math.max(...histA.map(accessor)),
      Math.max(...histB.map(accessor)),
      0.001,
    );
  }

  const maxGini       = 1;
  const maxPop        = sharedMax(d => d.population);
  const maxGdp        = sharedMax(d => d.gdp);
  const maxPrice      = sharedMax(d => Math.max(d.foodPrice, d.woodPrice));
  const maxHouses     = sharedMax(d => d.avgHouses);
  const maxCash       = sharedMax(d => d.avgCash);
  // Labour chart: unemployment and labourShare are both 0–1 fractions — fixed axis.
  const maxLabour     = 1;

  const maxWealthHeld = runA && runB
    ? Math.max(
        Math.max(...(runA.history.at(-1)?.wealthByBracket ?? [1])),
        Math.max(...(runB.history.at(-1)?.wealthByBracket ?? [1])),
        1,
      )
    : 1;

  const sumA = runA ? computeSummary(histA) : null;
  const sumB = runB ? computeSummary(histB) : null;

  function handleExport() {
    if (!runA || !runB || !sumA || !sumB) return;
    const payload = {
      scenarioA:  { name: runA.name, seed: runA.seed, policy: runA.policy, summary: sumA },
      scenarioB:  { name: runB.name, seed: runB.seed, policy: runB.policy, summary: sumB },
      historyA:   histA,
      historyB:   histB,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `comparison_${runA.name}_vs_${runB.name}.json`.replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  }

  // For policy diff rows: highlight if A ≠ B
  const policyDiffers = (a: string, b: string) => a !== b;

  return (
    <div style={wrapStyle}>

      {/* Selectors */}
      <div style={selectorRowStyle}>
        <div style={selectorGroupStyle}>
          <span style={seriesLabelA}>A</span>
          <select style={selectStyle} value={nameA} onChange={e => setNameA(e.target.value)}>
            <option value="">— select run —</option>
            {runs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        <div style={selectorGroupStyle}>
          <span style={seriesLabelB}>B</span>
          <select style={selectStyle} value={nameB} onChange={e => setNameB(e.target.value)}>
            <option value="">— select run —</option>
            {runs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        {runA && runB && runA.name !== runB.name && (
          <button style={exportBtn} onClick={handleExport}>Export JSON</button>
        )}
      </div>

      {(!runA || !runB || runA.name === runB.name) ? (
        <div style={hintStyle}>Select two different runs to compare.</div>
      ) : (
        <>
          {/* Summary table */}
          <table style={summaryTableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Metric</th>
                <th style={{ ...thStyle, color: '#7c5cfc' }}>{runA.name}</th>
                <th style={{ ...thStyle, color: '#3cc8a0' }}>{runB.name}</th>
              </tr>
            </thead>
            <tbody>
              {/* ── Starting conditions ── */}
              <SectionDivider label="STARTING CONDITIONS" />
              <SummaryRow
                label="Seed"
                a={seedModeLabel(runA.seedMode)}
                b={seedModeLabel(runB.seedMode)}
                highlight={runA.seedMode !== runB.seedMode}
                highlightMsg="⚠ not comparable"
              />

              {/* ── Policy settings ── */}
              <SectionDivider label="POLICY" />
              {(() => {
                const tA = policyLabel(runA.policy);
                const tB = policyLabel(runB.policy);
                const rA = redistributionLabel(runA.policy);
                const rB = redistributionLabel(runB.policy);
                const cA = currencyLabel(runA.policy);
                const cB = currencyLabel(runB.policy);
                const lA = landLabel(runA.policy);
                const lB = landLabel(runB.policy);
                return (
                  <>
                    <SummaryRow label="Tax rate"       a={tA} b={tB} highlight={policyDiffers(tA, tB)} />
                    <SummaryRow label="Redistribution" a={rA} b={rB} highlight={policyDiffers(rA, rB)} />
                    <SummaryRow label="Currency"       a={cA} b={cB} highlight={policyDiffers(cA, cB)} />
                    <SummaryRow label="Land / min wage" a={lA} b={lB} highlight={policyDiffers(lA, lB)} />
                  </>
                );
              })()}

              {/* ── Outcome metrics ── */}
              <SectionDivider label="OUTCOMES" />
              <SummaryRow label="Final Gini"          a={sumA!.finalGini.toFixed(3)}                 b={sumB!.finalGini.toFixed(3)} />
              <SummaryRow label="Final Pop"           a={sumA!.finalPop.toString()}                  b={sumB!.finalPop.toString()} />
              <SummaryRow label="Avg GDP"             a={sumA!.avgGdp.toFixed(1)}                    b={sumB!.avgGdp.toFixed(1)} />
              <SummaryRow label="Final Unemployment"  a={fmtPct(sumA!.finalUnemployment)}            b={fmtPct(sumB!.finalUnemployment)} />
              <SummaryRow label="Avg Wage"            a={sumA!.avgWage.toFixed(2)}                   b={sumB!.avgWage.toFixed(2)} />
              <SummaryRow label="Avg Labour Share"    a={fmtPct(sumA!.avgLabourShare)}               b={fmtPct(sumB!.avgLabourShare)} />
              <SummaryRow label="Final Avg Houses"    a={sumA!.finalAvgHouses.toFixed(2)}            b={sumB!.finalAvgHouses.toFixed(2)} />
              <SummaryRow label="Final Avg Cash"      a={sumA!.finalAvgCash.toFixed(2)}              b={sumB!.finalAvgCash.toFixed(2)} />
              <SummaryRow label="Final Rent Index"    a={sumA!.finalRentIndex.toFixed(3)}            b={sumB!.finalRentIndex.toFixed(3)} />
              <SummaryRow label="Peak trade/tick"     a={sumA!.peakTradeTick.toString()}             b={sumB!.peakTradeTick.toString()} />
              <SummaryRow label="Total trades"        a={sumA!.totalTrades.toLocaleString()}         b={sumB!.totalTrades.toLocaleString()} />
              <SummaryRow label="Run length"          a={`${sumA!.runLength} ticks`}                b={`${sumB!.runLength} ticks`} />
            </tbody>
          </table>

          {/* Chart grid */}
          <div style={gridStyle}>

            <ChartPair label="GINI">
              <MiniLine data={histA} accessor={d => d.gini}       maxVal={maxGini} color="#e05555" />
              <MiniLine data={histB} accessor={d => d.gini}       maxVal={maxGini} color="#e05555" />
            </ChartPair>

            <ChartPair label="POPULATION">
              <MiniLine data={histA} accessor={d => d.population} maxVal={maxPop}  color="#7c5cfc" />
              <MiniLine data={histB} accessor={d => d.population} maxVal={maxPop}  color="#3cc8a0" />
            </ChartPair>

            <ChartPair label="GDP">
              <MiniLine data={histA} accessor={d => d.gdp}        maxVal={maxGdp}  color="#7c5cfc" />
              <MiniLine data={histB} accessor={d => d.gdp}        maxVal={maxGdp}  color="#3cc8a0" />
            </ChartPair>

            <ChartPair label="HOUSING (avg houses)">
              <MiniLine data={histA} accessor={d => d.avgHouses}  maxVal={maxHouses} color="#7c5cfc" />
              <MiniLine data={histB} accessor={d => d.avgHouses}  maxVal={maxHouses} color="#3cc8a0" />
            </ChartPair>

            <ChartPair label="CASH / LIQUIDITY (avg cash)">
              <MiniLine data={histA} accessor={d => d.avgCash}    maxVal={maxCash}   color="#7c5cfc" />
              <MiniLine data={histB} accessor={d => d.avgCash}    maxVal={maxCash}   color="#3cc8a0" />
            </ChartPair>

            <ChartPair label="PRICES (food amber / wood cyan)">
              <MiniDualLine data={histA}
                accessor1={d => d.foodPrice} color1="#e0a040"
                accessor2={d => d.woodPrice} color2="#60c0e0"
                maxVal={maxPrice} />
              <MiniDualLine data={histB}
                accessor1={d => d.foodPrice} color1="#e0a040"
                accessor2={d => d.woodPrice} color2="#60c0e0"
                maxVal={maxPrice} />
            </ChartPair>

            <ChartPair label="LABOUR (unemployment orange / labour share teal)">
              <MiniDualLine data={histA}
                accessor1={d => d.unemploymentRate}  color1="#f0a040"
                accessor2={d => d.labourShareOfGdp}  color2="#3cc8a0"
                maxVal={maxLabour} />
              <MiniDualLine data={histB}
                accessor1={d => d.unemploymentRate}  color1="#f0a040"
                accessor2={d => d.labourShareOfGdp}  color2="#3cc8a0"
                maxVal={maxLabour} />
            </ChartPair>

            <ChartPair label="WEALTH HELD BY DECILE — final (Piketty view)">
              <MiniHistogram brackets={runA.history.at(-1)?.wealthByBracket ?? []} maxVal={maxWealthHeld} color="#7c5cfc" />
              <MiniHistogram brackets={runB.history.at(-1)?.wealthByBracket ?? []} maxVal={maxWealthHeld} color="#3cc8a0" />
            </ChartPair>

            <ChartPair label="POLICY IMPACT (Gini × Pop trail)">
              <MiniScatter data={histA} color="#7c5cfc" />
              <MiniScatter data={histB} color="#3cc8a0" />
            </ChartPair>

          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChartPair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={pairWrapStyle}>
      <div style={pairLabelStyle}>{label}</div>
      <div style={pairRowStyle}>{children}</div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={3} style={sectionDividerStyle}>{label}</td>
    </tr>
  );
}

function SummaryRow({
  label, a, b, highlight = false, highlightMsg = '⚠ differs',
}: {
  label: string; a: string; b: string; highlight?: boolean; highlightMsg?: string;
}) {
  const warningStyle: React.CSSProperties = highlight
    ? { color: '#e05555', fontSize: 9, letterSpacing: 0.5, paddingLeft: 4 }
    : {};
  return (
    <tr style={summaryRowStyle}>
      <td style={summaryLabelCellStyle}>
        {label}
        {highlight && <span style={warningStyle}> {highlightMsg}</span>}
      </td>
      <td style={{ ...summaryValCellStyle, color: '#7c5cfc' }}>{a}</td>
      <td style={{ ...summaryValCellStyle, color: '#3cc8a0' }}>{b}</td>
    </tr>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const svgStyle: React.CSSProperties = { display: 'block', background: '#0d0d0d' };

const wrapStyle: React.CSSProperties = { width: '100%' };

const emptyStyle: React.CSSProperties = {
  fontSize:    11,
  color:       '#333',
  padding:     '8px 0',
  letterSpacing: 0.5,
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color:    '#333',
  padding:  '8px 0',
};

const selectorRowStyle: React.CSSProperties = {
  display:    'flex',
  gap:        12,
  alignItems: 'center',
  marginBottom: 12,
  flexWrap:   'wrap',
};

const selectorGroupStyle: React.CSSProperties = {
  display:    'flex',
  alignItems: 'center',
  gap:        6,
};

const seriesLabelA: React.CSSProperties = {
  fontSize:      11,
  fontWeight:    'bold',
  color:         '#7c5cfc',
  letterSpacing: 1,
};

const seriesLabelB: React.CSSProperties = {
  ...seriesLabelA,
  color: '#3cc8a0',
};

const selectStyle: React.CSSProperties = {
  background:  '#0d0d0d',
  border:      '1px solid #333',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    10,
  padding:     '3px 6px',
  outline:     'none',
  maxWidth:    180,
};

const exportBtn: React.CSSProperties = {
  background:  '#1a1a1a',
  border:      '1px solid #444',
  color:       '#e0e0e0',
  fontFamily:  'monospace',
  fontSize:    10,
  padding:     '3px 10px',
  cursor:      'pointer',
  marginLeft:  'auto',
};

const summaryTableStyle: React.CSSProperties = {
  width:           '100%',
  borderCollapse:  'collapse',
  marginBottom:    16,
  fontSize:        11,
};

const thStyle: React.CSSProperties = {
  textAlign:     'left',
  color:         '#555',
  paddingBottom: 4,
  borderBottom:  '1px solid #222',
  fontWeight:    'normal',
  letterSpacing: 1,
  fontSize:      10,
};

const sectionDividerStyle: React.CSSProperties = {
  color:         '#333',
  fontSize:      9,
  letterSpacing: 2,
  paddingTop:    10,
  paddingBottom: 3,
  borderBottom:  '1px solid #1a1a1a',
};

const summaryRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #111',
};

const summaryLabelCellStyle: React.CSSProperties = {
  color:        '#555',
  padding:      '3px 16px 3px 0',
  fontSize:     10,
  letterSpacing: 0.5,
};

const summaryValCellStyle: React.CSSProperties = {
  fontWeight: 'bold',
  padding:    '3px 16px 3px 0',
  fontSize:   11,
};

const gridStyle: React.CSSProperties = {
  display:   'flex',
  flexWrap:  'wrap',
  gap:       16,
};

const pairWrapStyle: React.CSSProperties = {};

const pairLabelStyle: React.CSSProperties = {
  fontSize:      9,
  color:         '#444',
  letterSpacing: 1.5,
  marginBottom:  4,
};

const pairRowStyle: React.CSSProperties = {
  display: 'flex',
  gap:     4,
};
