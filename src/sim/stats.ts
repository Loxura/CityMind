import { AGENT_FIELDS } from '../types/constants';
import { getField } from './agent';
import type { SimStats } from '../types/sim';

// Copy this function exactly — do not reimplement.
export function computeGini(wealths: Float32Array, n: number): number {
  const sorted = Array.from(wealths.subarray(0, n)).sort((a, b) => a - b);
  const mean = sorted.reduce((s, w) => s + w, 0) / n;
  if (mean === 0) return 0;
  return sorted.reduce((s, w, i) => s + (2 * i - n + 1) * w, 0) / (n * n * mean);
}

export function computeStats(
  sab: Float32Array,
  n: number,
  tick: number,
): SimStats {
  let totalFood = 0;
  let totalWood = 0;

  for (let i = 0; i < n; i++) {
    totalFood += getField(sab, i, AGENT_FIELDS.FOOD);
    totalWood += getField(sab, i, AGENT_FIELDS.WOOD);
  }

  const avgFood = n > 0 ? totalFood / n : 0;
  const avgWood = n > 0 ? totalWood / n : 0;

  return {
    tick,
    population:       n,
    avgFood,
    avgWood,
    // Phase 2+ fields — stub zeros
    gdp:              0,
    gini:             0,
    wealthBrackets:   new Array(10).fill(0),
    foodPrice:        0,
    woodPrice:        0,
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
  };
}
