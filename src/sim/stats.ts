import { AGENT_FIELDS } from '../types/constants';
import { getField } from './agent';
import { getMarketStats } from './market';
import { getLabourStats } from './labour';
import { getHarvestStats } from './harvest';
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

// Compute total wealth held per decile bin from a sorted wealth array.
// Same bin boundaries as computeWealthBrackets — sums wealth instead of counting agents.
function computeWealthByBracket(sorted: number[]): number[] {
  const n = sorted.length;
  const brackets = new Array<number>(10).fill(0);
  if (n === 0) return brackets;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  if (range === 0) {
    brackets[0] = sorted.reduce((s, w) => s + w, 0);
    return brackets;
  }
  for (const w of sorted) {
    const bucket = Math.min(9, Math.floor(((w - min) / range) * 10));
    brackets[bucket] += w;
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
  const sortedWealths   = Array.from(wealths).sort((a, b) => a - b);
  const wealthBrackets  = computeWealthBrackets(sortedWealths);
  const wealthByBracket = computeWealthByBracket(sortedWealths);

  const { foodPrice, woodPrice, tradeCount, tickTradeCount } = getMarketStats();
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
    foodPrice,
    woodPrice,
    gdp,
    wageRate,
    unemploymentRate,
    labourShareOfGdp,
    landRentIndex:    0,
    avgIncome,
    inflationRate:    0,
    creditToGdp:      0,
    roleCounts,
    techsUnlocked: [],
    stockIndex:    0,
    bankSolvency:  1,
    tradeCount,
    tickTradeCount,
  };
}
