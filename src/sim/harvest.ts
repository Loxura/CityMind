// Harvest rules — Phase 1 hand-coded + Phase 3 net-driven move.
// applyNetHarvest replaces harvestAgent in the Phase 3 tick loop.

import { AGENT_FIELDS, MAP_WIDTH, MAP_HEIGHT, INITIAL_ENERGY, FOOD_DECAY_RATE_HIGH, FOOD_DECAY_RATE_MID } from '../types/constants';

// Per-tick harvest totals for GDP computation in stats.ts.
let _tickFoodHarvested = 0;
export function resetHarvestTick(): void { _tickFoodHarvested = 0; }
export function getHarvestStats(): { foodHarvested: number } {
  return { foodHarvested: _tickFoodHarvested };
}
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

// Move direction constants for Phase 3 net output.
// dim 0 of net output decodes to: 0=stay, 1=N(y-1), 2=S(y+1), 3=E(x+1), 4=W(x-1)
const MOVE_DX = [0,  0,  0,  1, -1];
const MOVE_DY = [0, -1,  1,  0,  0];

// Apply Phase 3 net-driven move then harvest from the destination tile.
// moveDir: 0-4 as decoded from net output dim 0.
export function applyNetHarvest(
  sab: Float32Array,
  idx: number,
  tiles: TileMap,
  moveDir: number,
): void {
  const x = Math.max(0, Math.min(MAP_WIDTH  - 1, Math.round(getField(sab, idx, AGENT_FIELDS.X))));
  const y = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(getField(sab, idx, AGENT_FIELDS.Y))));

  const nx = Math.max(0, Math.min(MAP_WIDTH  - 1, x + MOVE_DX[moveDir]));
  const ny = Math.max(0, Math.min(MAP_HEIGHT - 1, y + MOVE_DY[moveDir]));
  setField(sab, idx, AGENT_FIELDS.X, nx);
  setField(sab, idx, AGENT_FIELDS.Y, ny);

  // Harvest from destination tile — Cobb-Douglas: Output = A * (1+L)^α * Land^γ * rawYield
  const tile       = tileAt(tiles, nx, ny);
  const rawHarvest = tile.food * 0.3;
  const land        = Math.max(1, getField(sab, idx, AGENT_FIELDS.LAND));
  const labour      = getField(sab, idx, AGENT_FIELDS.LABOUR_HIRED);
  const cobbDouglas = 1.0 * Math.pow(1 + labour, 0.6) * Math.pow(land, 0.4);
  const harvested   = rawHarvest * cobbDouglas;
  tile.food = Math.max(0, tile.food - rawHarvest); // tile depleted by raw amount
  setField(sab, idx, AGENT_FIELDS.FOOD, getField(sab, idx, AGENT_FIELDS.FOOD) + harvested);
  _tickFoodHarvested += harvested;

  // Consume food; restore energy proportional to food eaten.
  // Well-fed (food > 0.5): net energy +0.25/tick. Starving (food = 0): net energy -1/tick.
  const currentFood   = getField(sab, idx, AGENT_FIELDS.FOOD);
  const foodConsumed  = Math.min(0.5, currentFood);
  setField(sab, idx, AGENT_FIELDS.FOOD, currentFood - foodConsumed);
  const currentEnergy = getField(sab, idx, AGENT_FIELDS.ENERGY);
  setField(sab, idx, AGENT_FIELDS.ENERGY,
    Math.min(INITIAL_ENERGY, currentEnergy - 1 + foodConsumed * 1.5));
}

// ── Phase 7: progressive food decay ─────────────────────────────────────────
// Called from tick.ts harvest loop when policy.isCurrencyActive is true.
// Tiered by current food level so subsistence agents are never penalised.
export function applyFoodDecay(sab: Float32Array, idx: number): void {
  const food = getField(sab, idx, AGENT_FIELDS.FOOD);
  let decayed = food;

  if (food > 100) {
    decayed = food * FOOD_DECAY_RATE_HIGH;
  } else if (food > 20) {
    decayed = food * FOOD_DECAY_RATE_MID;
  }

  setField(sab, idx, AGENT_FIELDS.FOOD, decayed);
}

// Apply Phase 1 hand-coded rules to a single agent (kept for reference; not used in Phase 3+).
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
