import { AGENT_FIELDS } from '../types/constants';
import { getField } from './agent';
import { getMarketStats } from './market';
import { getLabourStats } from './labour';
import { getHarvestStats } from './harvest';
import { getHousingStats } from './housing';
import { getBankStats } from './bank';
import type { SimStats } from '../types/sim';

// Phase 7/8: rolling inflation tracker.
// Phase 7 used foodMoneyPrice (fixed at bootstrap → always 0). Phase 8 fix: track
// the barter foodPrice ring buffer which reflects real supply/demand movements.
// This correctly captures the Phase 7 deflationary trap (food price collapsed to 0.189).
let _prevFoodPrice = 0;

export function resetStats(): void {
  _prevFoodPrice = 0;
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
  let totalFood   = 0;
  let totalWood   = 0;
  let totalCash   = 0;
  let totalHouses = 0;

  // Collect wealth values into a reusable Float32Array for Gini
  const wealths = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    totalFood   += getField(sab, i, AGENT_FIELDS.FOOD);
    totalWood   += getField(sab, i, AGENT_FIELDS.WOOD);
    totalCash   += getField(sab, i, AGENT_FIELDS.CASH);
    totalHouses += getField(sab, i, AGENT_FIELDS.HOUSES);
    wealths[i]   = getField(sab, i, AGENT_FIELDS.WEALTH);
  }

  const avgFood   = n > 0 ? totalFood   / n : 0;
  const avgWood   = n > 0 ? totalWood   / n : 0;
  const avgCash   = n > 0 ? totalCash   / n : 0;
  const avgHouses = n > 0 ? totalHouses / n : 0;
  const gini    = n > 1 ? computeGini(wealths, n) : 0;

  // wealthBrackets needs sorted order (computeGini already sorts internally,
  // but we sort separately here to avoid coupling)
  const sortedWealths    = Array.from(wealths).sort((a, b) => a - b);
  const wealthBrackets   = computeWealthBrackets(sortedWealths);
  const wealthByBracket  = computeWealthByBracket(sortedWealths);
  const wealthBoundaries = computeWealthBoundaries(sortedWealths);

  const { foodPrice, woodPrice, tradeCount, tickTradeCount } = getMarketStats();

  // Phase 8 inflation fix: track the barter foodPrice ring (updated every trade).
  // Phase 7 used foodMoneyPrice which is fixed at bootstrap → always showed 0.00%.
  // The barter ring correctly captured the Phase 7 deflationary trap (food→0.189).
  let inflationRate = 0;
  if (foodPrice > 0 && _prevFoodPrice > 0) {
    inflationRate = (foodPrice - _prevFoodPrice) / _prevFoodPrice;
  }
  _prevFoodPrice = foodPrice;

  const { wageRate, unemploymentRate, totalWages } = getLabourStats();
  const { rentCollected } = getHousingStats();
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

  // Phase 8: landRentIndex = total rent collected this stats interval / population.
  // Covers both house rent and land rent (from getHousingStats).
  // Multiplied by STATS_INTERVAL to convert per-tick to per-interval rate.
  const landRentIndex = n > 0 ? (rentCollected / n) : 0;

  const { creditToGdp, bankSolvency, bankLoansOutstanding, bankCapitalBuffer } = getBankStats(gdp);

  return {
    tick,
    population:       n,
    avgFood,
    avgWood,
    avgHouses,
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
    landRentIndex,
    avgIncome,
    inflationRate,
    avgCash,
    creditToGdp,
    bankSolvency,
    bankLoansOutstanding,
    bankCapitalBuffer,
    roleCounts,
    techsUnlocked: [],
    stockIndex:    0,
    tradeCount,
    tickTradeCount,
  };
}
