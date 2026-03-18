import { AGENT_FIELDS } from '../types/constants';
import { getField } from './agent';
import { getMarketStats } from './market';
import { getLabourStats } from './labour';
import { getHarvestStats } from './harvest';
import type { SimStats } from '../types/sim';

// Phase 7: rolling inflation tracker — compares current foodMoneyPrice to previous sample.
// resetStats() must be called on INIT/RESET.
let _prevFoodMoneyPrice = 0;

export function resetStats(): void {
  _prevFoodMoneyPrice = 0;
}

// Copy this function exactly — do not reimplement.
export function computeGini(wealths: Float32Array, n: number): number {
  const sorted = Array.from(wealths.subarray(0, n)).sort((a, b) => a - b);
  const mean = sorted.reduce((s, w) => s + w, 0) / n;
  if (mean === 0) return 0;
  return sorted.reduce((s, w, i) => s + (2 * i - n + 1) * w, 0) / (n * n * mean);
}

// Percentile bin helpers.
// Bins are constructed by rank, not by value range.
// Agent at sorted index i → bucket = floor(i / n * 10), clamped to [0, 9].
// This guarantees exactly floor(n/10) or ceil(n/10) agents per bin regardless
// of how skewed the wealth distribution is.

function percentileBucket(i: number, n: number): number {
  return Math.min(9, Math.floor((i / n) * 10));
}

// Agent count per percentile bin — always ~n/10 per bin by construction.
function computeWealthBrackets(sorted: number[]): number[] {
  const n = sorted.length;
  const brackets = new Array<number>(10).fill(0);
  for (let i = 0; i < n; i++) brackets[percentileBucket(i, n)]++;
  return brackets;
}

// Total wealth held per percentile bin (Piketty view).
// Same bin assignments as computeWealthBrackets.
function computeWealthByBracket(sorted: number[]): number[] {
  const n = sorted.length;
  const brackets = new Array<number>(10).fill(0);
  for (let i = 0; i < n; i++) brackets[percentileBucket(i, n)] += sorted[i];
  return brackets;
}

// The 9 wealth values at P10, P20, …, P90 — boundaries between adjacent bins.
// Passed through SimStats so the chart can label each bin threshold.
function computeWealthBoundaries(sorted: number[]): number[] {
  const n = sorted.length;
  if (n < 2) return new Array(9).fill(0);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    p => sorted[Math.min(n - 1, Math.floor(p * n / 10))],
  );
}

export function computeStats(
  sab: Float32Array,
  n: number,
  tick: number,
): SimStats {
  let totalFood = 0;
  let totalWood = 0;
  let totalCash = 0;

  // Collect wealth values into a reusable Float32Array for Gini
  const wealths = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    totalFood   += getField(sab, i, AGENT_FIELDS.FOOD);
    totalWood   += getField(sab, i, AGENT_FIELDS.WOOD);
    totalCash   += getField(sab, i, AGENT_FIELDS.CASH);
    wealths[i]   = getField(sab, i, AGENT_FIELDS.WEALTH);
  }

  const avgFood = n > 0 ? totalFood / n : 0;
  const avgWood = n > 0 ? totalWood / n : 0;
  const avgCash = n > 0 ? totalCash / n : 0;
  const gini    = n > 1 ? computeGini(wealths, n) : 0;

  // wealthBrackets needs sorted order (computeGini already sorts internally,
  // but we sort separately here to avoid coupling)
  const sortedWealths    = Array.from(wealths).sort((a, b) => a - b);
  const wealthBrackets   = computeWealthBrackets(sortedWealths);
  const wealthByBracket  = computeWealthByBracket(sortedWealths);
  const wealthBoundaries = computeWealthBoundaries(sortedWealths);

  const { foodPrice, woodPrice, foodMoneyPrice, tradeCount, tickTradeCount } = getMarketStats();

  // Phase 7: inflation = tick-over-tick change in foodMoneyPrice (per stats interval)
  let inflationRate = 0;
  if (foodMoneyPrice > 0 && _prevFoodMoneyPrice > 0) {
    inflationRate = (foodMoneyPrice - _prevFoodMoneyPrice) / _prevFoodMoneyPrice;
  }
  _prevFoodMoneyPrice = foodMoneyPrice;
  const { wageRate, unemploymentRate, totalWages } = getLabourStats();
  const { foodHarvested } = getHarvestStats();

  // GDP = value of food harvested this tick * foodPrice
  const gdp = foodHarvested * foodPrice;
  const labourShareOfGdp = gdp > 0 ? totalWages / gdp : 0;
  const avgIncome = n > 0 ? totalWages / n : 0;

  // Role counts: ROLE field 0=farmer,1=builder,2=merchant,3=banker,4=capitalist,5=worker
  const roleCounts = { farmer: 0, builder: 0, merchant: 0, banker: 0, capitalist: 0, worker: 0 };
  const roleNames = ['farmer', 'builder', 'merchant', 'banker', 'capitalist', 'worker'] as const;
  for (let i = 0; i < n; i++) {
    const role = Math.round(getField(sab, i, AGENT_FIELDS.ROLE));
    const key = roleNames[Math.min(role, 5)];
    roleCounts[key]++;
  }

  return {
    tick,
    population:       n,
    avgFood,
    avgWood,
    gini,
    wealthBrackets,
    wealthByBracket,
    wealthBoundaries,
    foodPrice,
    woodPrice,
    gdp,
    wageRate,
    unemploymentRate,
    labourShareOfGdp,
    landRentIndex:    0,
    avgIncome,
    inflationRate,
    avgCash,
    creditToGdp:      0,
    roleCounts,
    techsUnlocked: [],
    stockIndex:    0,
    bankSolvency:  1,
    tradeCount,
    tickTradeCount,
  };
}
