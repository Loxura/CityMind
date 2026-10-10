// Phase 1 — aging, death, and basic reproduction.

import { AGENT_FIELDS, INITIAL_ENERGY, MAP_WIDTH, MAP_HEIGHT, MAX_STABLE_POPULATION, HOUSE_ASSET_VALUE } from '../types/constants';
import { getField, setField, initAgent } from './agent';

// Returns true if the agent should be removed from the active set.
export function isDead(sab: Float32Array, idx: number): boolean {
  const energy = getField(sab, idx, AGENT_FIELDS.ENERGY);
  const food = getField(sab, idx, AGENT_FIELDS.FOOD);
  return energy <= 0 && food <= 0;
}

// Age the agent by one tick.
export function ageAgent(sab: Float32Array, idx: number): void {
  const age = getField(sab, idx, AGENT_FIELDS.AGE);
  setField(sab, idx, AGENT_FIELDS.AGE, age + 1);
}

// WEALTH is a marked-to-market balance-sheet measure, not a sum of unlike units.
// The inactive economy uses wood as its resource numeraire because foodPrice is
// quoted in wood per food. Once currency is active, every included asset and
// liability is valued in cash. Unpriced assets are deliberately excluded.
export interface WealthValuation {
  // This means the monetary valuation regime is established, which remains
  // true if monetary transactions are later paused while balances persist.
  isCurrencyActive: boolean;
  foodBarterPrice: number;
  foodMoneyPrice: number;
  woodMoneyPrice: number;
}

export function computeNetWorth(
  sab: Float32Array,
  idx: number,
  valuation: WealthValuation,
): number {
  const requiredPrices = valuation.isCurrencyActive
    ? [valuation.foodMoneyPrice, valuation.woodMoneyPrice]
    : [valuation.foodBarterPrice];
  if (requiredPrices.some((price) => !Number.isFinite(price) || price < 0)) {
    throw new Error(`Agent ${idx} net-worth valuation has an invalid price`);
  }

  const food   = getField(sab, idx, AGENT_FIELDS.FOOD);
  const wood   = getField(sab, idx, AGENT_FIELDS.WOOD);
  const houses = getField(sab, idx, AGENT_FIELDS.HOUSES);

  const rawNetWorth = valuation.isCurrencyActive
    ? getField(sab, idx, AGENT_FIELDS.CASH)
      + food * valuation.foodMoneyPrice
      + wood * valuation.woodMoneyPrice
      + houses * HOUSE_ASSET_VALUE
      - getField(sab, idx, AGENT_FIELDS.DEBT)
    : food * valuation.foodBarterPrice
      + wood
      + houses * HOUSE_ASSET_VALUE;

  if (!Number.isFinite(rawNetWorth)) {
    throw new Error(`Agent ${idx} net worth is not finite`);
  }

  // The canonical Gini implementation and WEALTH invariant require a
  // nonnegative observation. Raw negative net worth is not currently exposed.
  return Math.max(0, rawNetWorth);
}

export function updateWealth(
  sab: Float32Array,
  idx: number,
  valuation: WealthValuation,
): void {
  setField(sab, idx, AGENT_FIELDS.WEALTH, computeNetWorth(sab, idx, valuation));
}

// Attempt reproduction; returns the new agent index (slotIdx) if spawned,
// or -1 if conditions are not met or no free slot is available.
export function tryReproduce(
  sab: Float32Array,
  idx: number,
  activeCount: number,
  maxAgents: number,
  nextId: { value: number },
  rand: () => number,
): number {
  // Hard cap at inference-safe population limit (separate from SAB allocation limit).
  // Prevents GPU VRAM exhaustion: weight tensors grow linearly with n.
  if (activeCount >= MAX_STABLE_POPULATION) return -1;

  const food = getField(sab, idx, AGENT_FIELDS.FOOD);
  const age = getField(sab, idx, AGENT_FIELDS.AGE);

  if (food <= 60 || age <= 10 || age % 20 !== 0) return -1;
  if (activeCount >= maxAgents) return -1;

  const x = getField(sab, idx, AGENT_FIELDS.X);
  const y = getField(sab, idx, AGENT_FIELDS.Y);

  // Parent keeps half food
  const half = food / 2;
  setField(sab, idx, AGENT_FIELDS.FOOD, half);

  // Child placed in adjacent tile (random offset, clamped)
  const cx = Math.max(0, Math.min(MAP_WIDTH - 1, Math.round(x + (rand() * 2 - 1))));
  const cy = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(y + (rand() * 2 - 1))));

  const childSlot = activeCount; // placed at the end of the active list
  initAgent(sab, childSlot, nextId.value++, cx, cy, half, 3, INITIAL_ENERGY);

  return childSlot;
}
