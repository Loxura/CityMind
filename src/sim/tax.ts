// Phase 4 — Tax collection and redistribution.
// Treasury accumulated via trade tax (market.ts) and wage tax (labour.ts).
// redistribute() is called once per tick after all markets have run.

import { AGENT_FIELDS } from '../types/constants';
import { getField, setField } from './agent';
import type { TileMap } from './map';
import type { PolicyState } from '../types/sim';

// Return the wealth value at a given fractional percentile (0-1) across all agents.
function wealthPercentile(sab: Float32Array, n: number, fraction: number): number {
  const w: number[] = [];
  for (let i = 0; i < n; i++) w.push(getField(sab, i, AGENT_FIELDS.WEALTH));
  w.sort((a, b) => a - b);
  return w[Math.min(Math.floor(fraction * n), n - 1)];
}

// Apply redistribution policy to the current treasury.
// Returns the remaining treasury after redistribution (0 for most models; >0 for 'none').
export function redistribute(
  treasury: number,
  policy: PolicyState,
  sab: Float32Array,
  n: number,
  tiles: TileMap,
  foodPrice: number,
  woodPrice: number,
): number {
  if (treasury <= 0 || n === 0) return treasury;

  switch (policy.redistribution) {

    case 'ubi': {
      // Split ubiAmount fraction of treasury equally among all agents as cash.
      const fraction = Math.max(0, Math.min(1, policy.ubiAmount));
      if (fraction <= 0) return treasury;
      const payout = (treasury * fraction) / n;
      for (let i = 0; i < n; i++) {
        setField(sab, i, AGENT_FIELDS.CASH,
          getField(sab, i, AGENT_FIELDS.CASH) + payout);
      }
      return treasury * (1 - fraction);
    }

    case 'targeted_welfare': {
      // Pay entire treasury equally to the poorest 20% only.
      const threshold = wealthPercentile(sab, n, 0.2);
      let eligible = 0;
      for (let i = 0; i < n; i++) {
        if (getField(sab, i, AGENT_FIELDS.WEALTH) <= threshold) eligible++;
      }
      if (eligible === 0) return treasury;
      const payout = treasury / eligible;
      for (let i = 0; i < n; i++) {
        if (getField(sab, i, AGENT_FIELDS.WEALTH) <= threshold) {
          setField(sab, i, AGENT_FIELDS.CASH,
            getField(sab, i, AGENT_FIELDS.CASH) + payout);
        }
      }
      return 0;
    }

    case 'public_goods': {
      // 60% food tiles, 40% wood tiles — add supply proportional to current prices.
      const foodUnits = foodPrice > 0 ? (treasury * 0.6) / foodPrice : 0;
      const woodUnits = woodPrice > 0 ? (treasury * 0.4) / woodPrice : 0;
      const foodPerTile = foodUnits / tiles.length;
      const woodPerTile = woodUnits / tiles.length;
      for (let i = 0; i < tiles.length; i++) {
        tiles[i].food = Math.min(tiles[i].foodMax, tiles[i].food + foodPerTile);
        tiles[i].wood = Math.min(tiles[i].woodMax, tiles[i].wood + woodPerTile);
      }
      return 0;
    }

    case 'infrastructure': {
      // Raise foodMax/woodMax ceilings on the lowest-yield 20% of tiles.
      const boostCount = Math.max(1, Math.floor(tiles.length * 0.2));
      const sorted = tiles
        .map((t, i) => ({ i, yield: t.food / t.foodMax + t.wood / t.woodMax }))
        .sort((a, b) => a.yield - b.yield);
      const boostPerTile = treasury / boostCount;
      for (let k = 0; k < boostCount; k++) {
        const t = tiles[sorted[k].i];
        t.foodMax = Math.min(20,  t.foodMax + boostPerTile * 0.01);
        t.woodMax = Math.min(36,  t.woodMax + boostPerTile * 0.01);
      }
      void foodPrice; void woodPrice;
      return 0;
    }

    case 'none':
    default:
      return treasury; // accumulates indefinitely
  }
}
