// Phase 3 — Build the [n, 40] input matrix from SAB for batched net inference.
// Input vector spec: see CLAUDE.md § Neural net — exact specification.

import { AGENT_FIELDS, AGENT_STRIDE, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField } from '../sim/agent';
import { tileAt } from '../sim/map';
import type { TileMap } from '../sim/map';
import type { SpatialGrid } from '../sim/grid';
import type { PolicyState } from '../types/sim';

export const INPUT_SIZE = 40;

// Clamp to [0, 1].
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Sigmoid
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Compute per-agent wealth percentile (0=poorest, 1=richest).
// Returns Float32Array[n] where value is rank / (n-1).
export function computeWealthRanks(sab: Float32Array, n: number): Float32Array {
  // Build (wealth, originalIdx) pairs, sort, assign rank
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    pairs.push([getField(sab, i, AGENT_FIELDS.WEALTH), i]);
  }
  pairs.sort((a, b) => a[0] - b[0]);

  const ranks = new Float32Array(n);
  const denom = n > 1 ? n - 1 : 1;
  for (let rank = 0; rank < n; rank++) {
    ranks[pairs[rank][1]] = rank / denom;
  }
  return ranks;
}

// Build input matrix [n * INPUT_SIZE] for all n active agents.
// Caller should pass the grid populated from the PREVIOUS tick (pre-harvest positions).
export function buildInputMatrix(
  sab: Float32Array,
  n: number,
  tiles: TileMap,
  foodPrice: number,
  woodPrice: number,
  policy: PolicyState,
  wealthRanks: Float32Array,
  grid: SpatialGrid,
): Float32Array {
  const out = new Float32Array(n * INPUT_SIZE);

  for (let i = 0; i < n; i++) {
    const base = i * INPUT_SIZE;
    const stride = i * AGENT_STRIDE; // direct stride offset for hot path

    const food    = sab[stride + AGENT_FIELDS.FOOD];
    const wood    = sab[stride + AGENT_FIELDS.WOOD];
    const energy  = sab[stride + AGENT_FIELDS.ENERGY];
    const wealth  = sab[stride + AGENT_FIELDS.WEALTH];
    const debt    = sab[stride + AGENT_FIELDS.DEBT];
    const cash    = sab[stride + AGENT_FIELDS.CASH];
    const x       = sab[stride + AGENT_FIELDS.X];
    const y       = sab[stride + AGENT_FIELDS.Y];

    // dims 0-9: own inventory and state
    out[base + 0]  = clamp01(food   / 200);
    out[base + 1]  = clamp01(wood   / 200);
    out[base + 2]  = clamp01(sab[stride + AGENT_FIELDS.TOOLS]    / 50);
    out[base + 3]  = clamp01(sab[stride + AGENT_FIELDS.CLOTHING] / 100);
    out[base + 4]  = clamp01(sab[stride + AGENT_FIELDS.FISH]     / 100);
    out[base + 5]  = clamp01(sab[stride + AGENT_FIELDS.HOUSES]   / 20);
    out[base + 6]  = clamp01(sab[stride + AGENT_FIELDS.LAND]     / 50);
    out[base + 7]  = clamp01(cash  / 10000);                                  // 0 before Phase 7
    out[base + 8]  = clamp01(debt  / Math.max(wealth, 1));                    // debt-to-wealth
    out[base + 9]  = clamp01(energy / 100);

    // dim 10: wealth percentile
    out[base + 10] = wealthRanks[i];

    // dims 11-14: labour (0 before Phase 4 labour market)
    out[base + 11] = sab[stride + AGENT_FIELDS.LABOUR_SOLD];                  // 0 or 1
    out[base + 12] = clamp01(sab[stride + AGENT_FIELDS.WAGE_RESERVATION] / 50);
    out[base + 13] = 0;                                                        // unemployment — Phase 4+
    out[base + 14] = clamp01(sab[stride + AGENT_FIELDS.LABOUR_HIRED]     / 20);

    // dims 15-23: local food tile values (3×3 around agent)
    // dims 24-32: local wood tile values (3×3 around agent)
    let k = 0;
    const xi = Math.max(0, Math.min(MAP_WIDTH  - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(y)));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tile = tileAt(tiles,
          Math.max(0, Math.min(MAP_WIDTH  - 1, xi + dx)),
          Math.max(0, Math.min(MAP_HEIGHT - 1, yi + dy)),
        );
        out[base + 15 + k] = clamp01(tile.food / 10);   // foodMax = 10
        out[base + 24 + k] = clamp01(tile.wood / 18);   // woodMax = 18
        k++;
      }
    }

    // dim 33: nearby agent count
    out[base + 33] = clamp01(grid.getNeighbours(x, y).length / 30);

    // dim 34-35: market prices
    out[base + 34] = clamp01(foodPrice / 100);
    out[base + 35] = clamp01(woodPrice / 100);

    // dims 36-39: Phase 4/7/9+ features — zero until those phases activate
    out[base + 36] = 0;                                  // land rent index
    out[base + 37] = sigmoid(policy.centralBankRate);    // 0 before Phase 7
    out[base + 38] = policy.taxRate;                     // already 0-0.5
    out[base + 39] = 0;                                  // stock index
  }

  return out;
}
