// Phase 1 — hand-coded harvest rules.
// No neural nets, no Cobb-Douglas yet (Phase 3/4).

import { AGENT_FIELDS, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField, setField } from './agent';
import type { TileMap } from './map';
import { tileAt } from './map';

// Scan the 3×3 neighbourhood (clamped to map bounds) and return the
// coordinates of the tile with the highest food value.
function bestFoodTile(
  x: number, y: number, tiles: TileMap,
): { bx: number; by: number } {
  let bx = Math.round(x);
  let by = Math.round(y);
  let best = -1;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = Math.max(0, Math.min(MAP_WIDTH  - 1, Math.round(x) + dx));
      const ny = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(y) + dy));
      const f = tileAt(tiles, nx, ny).food;
      if (f > best) { best = f; bx = nx; by = ny; }
    }
  }

  return { bx, by };
}

// Move one step toward (tx, ty), return new position.
function stepToward(
  x: number, y: number, tx: number, ty: number,
): { nx: number; ny: number } {
  let nx = Math.round(x);
  let ny = Math.round(y);
  const dx = tx - nx;
  const dy = ty - ny;

  if (dx !== 0 || dy !== 0) {
    // Move along the axis with the larger distance; break ties by x.
    if (Math.abs(dx) >= Math.abs(dy)) {
      nx += dx > 0 ? 1 : -1;
    } else {
      ny += dy > 0 ? 1 : -1;
    }
  }

  return {
    nx: Math.max(0, Math.min(MAP_WIDTH  - 1, nx)),
    ny: Math.max(0, Math.min(MAP_HEIGHT - 1, ny)),
  };
}

// Apply Phase 1 hand-coded rules to a single agent.
// Returns true if the agent harvested (for caller bookkeeping).
export function harvestAgent(
  sab: Float32Array,
  idx: number,
  tiles: TileMap,
): void {
  const x = getField(sab, idx, AGENT_FIELDS.X);
  const y = getField(sab, idx, AGENT_FIELDS.Y);

  // 1. Scan 3×3 for best food tile
  const { bx, by } = bestFoodTile(x, y, tiles);

  // 2. Move one step toward it
  const { nx, ny } = stepToward(x, y, bx, by);
  setField(sab, idx, AGENT_FIELDS.X, nx);
  setField(sab, idx, AGENT_FIELDS.Y, ny);

  // 3. Harvest from the tile the agent is now standing on
  const tile = tileAt(tiles, nx, ny);
  const harvested = tile.food * 0.3;
  tile.food = Math.max(0, tile.food - harvested);
  const currentFood = getField(sab, idx, AGENT_FIELDS.FOOD);
  setField(sab, idx, AGENT_FIELDS.FOOD, currentFood + harvested);

  // 4. Consume: energy -= 1; food -= 0.5
  const energy = getField(sab, idx, AGENT_FIELDS.ENERGY);
  const food   = getField(sab, idx, AGENT_FIELDS.FOOD);
  setField(sab, idx, AGENT_FIELDS.ENERGY, Math.max(0, energy - 1));
  setField(sab, idx, AGENT_FIELDS.FOOD,   Math.max(0, food - 0.5));
}
