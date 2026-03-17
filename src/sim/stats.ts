import { AGENT_FIELDS } from '../types/constants';
import { getField } from './agent';
import { getMarketStats } from './market';
import type { SimStats } from '../types/sim';

// Copy this function exactly — do not reimplement.
export function computeGini(wealths: Float32Array, n: number): number {
  const sorted = Array.from(wealths.subarray(0, n)).sort((a, b) => a - b);
  const mean = sorted.reduce((s, w) => s + w, 0) / n;
  if (mean === 0) return 0;
  return sorted.reduce((s, w, i) => s + (2 * i - n + 1) * w, 0) / (n * n * mean);
}

// Compute 10-decile wealth bracket counts from a sorted wealth array.
function computeWealthBrackets(sorted: number[]): number[] {
  const n = sorted.length;
  const brackets = new Array<number>(10).fill(0);
  if (n === 0) return brackets;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  if (range === 0) {
    brackets[0] = n;
    return brackets;
  }
  for (const w of sorted) {
    const bucket = Math.min(9, Math.floor(((w - min) / range) * 10));
    brackets[bucket]++;
  }
  return brackets;
}

export function computeStats(
  sab: Float32Array,
  n: number,
  tick: number,
): SimStats {
  let totalFood = 0;
  let totalWood = 0;

  // Collect wealth values into a reusable Float32Array for Gini
  const wealths = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    totalFood   += getField(sab, i, AGENT_FIELDS.FOOD);
    totalWood   += getField(sab, i, AGENT_FIELDS.WOOD);
    wealths[i]   = getField(sab, i, AGENT_FIELDS.WEALTH);
  }

  const avgFood = n > 0 ? totalFood / n : 0;
  const avgWood = n > 0 ? totalWood / n : 0;
  const gini    = n > 1 ? computeGini(wealths, n) : 0;

  // wealthBrackets needs sorted order (computeGini already sorts internally,
  // but we sort separately here to avoid coupling)
  const sortedWealths = Array.from(wealths).sort((a, b) => a - b);
  const wealthBrackets = computeWealthBrackets(sortedWealths);

  const { foodPrice, woodPrice, tradeCount, tickTradeCount } = getMarketStats();

  return {
    tick,
    population:       n,
    avgFood,
    avgWood,
    gini,
    wealthBrackets,
    foodPrice,
    woodPrice,
    // Phase 3+ fields — stub zeros
    gdp:              0,
    wageRate:         0,
    unemploymentRate: 0,
    labourShareOfGdp: 0,
    landRentIndex:    0,
    avgIncome:        0,
    inflationRate:    0,
    creditToGdp:      0,
    roleCounts: {
      farmer:     n,
      builder:    0,
      merchant:   0,
      banker:     0,
      capitalist: 0,
      worker:     0,
    },
    techsUnlocked: [],
    stockIndex:    0,
    bankSolvency:  1,
    tradeCount,
    tickTradeCount,
  };
}
