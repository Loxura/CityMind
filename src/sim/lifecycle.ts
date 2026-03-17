// Phase 1 — aging, death, and basic reproduction.

import { AGENT_FIELDS, INITIAL_ENERGY, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField, setField, initAgent } from './agent';

// Returns true if the agent should be removed from the active set.
export function isDead(sab: Float32Array, idx: number): boolean {
  const energy = getField(sab, idx, AGENT_FIELDS.ENERGY);
  const food   = getField(sab, idx, AGENT_FIELDS.FOOD);
  return energy <= 0 && food <= 0;
}

// Age the agent by one tick.
export function ageAgent(sab: Float32Array, idx: number): void {
  const age = getField(sab, idx, AGENT_FIELDS.AGE);
  setField(sab, idx, AGENT_FIELDS.AGE, age + 1);
}

// Update the WEALTH field (Phase 1: food + wood proxy).
export function updateWealth(sab: Float32Array, idx: number): void {
  const food = getField(sab, idx, AGENT_FIELDS.FOOD);
  const wood = getField(sab, idx, AGENT_FIELDS.WOOD);
  setField(sab, idx, AGENT_FIELDS.WEALTH, food + wood);
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
  const food = getField(sab, idx, AGENT_FIELDS.FOOD);
  const age  = getField(sab, idx, AGENT_FIELDS.AGE);

  if (food <= 30 || age <= 10) return -1;
  if (activeCount >= maxAgents)  return -1;

  const x = getField(sab, idx, AGENT_FIELDS.X);
  const y = getField(sab, idx, AGENT_FIELDS.Y);

  // Parent keeps half food
  const half = food / 2;
  setField(sab, idx, AGENT_FIELDS.FOOD, half);

  // Child placed in adjacent tile (random offset, clamped)
  const cx = Math.max(0, Math.min(MAP_WIDTH  - 1, Math.round(x + (rand() * 2 - 1))));
  const cy = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.round(y + (rand() * 2 - 1))));

  const childSlot = activeCount; // placed at the end of the active list
  initAgent(sab, childSlot, nextId.value++, cx, cy, half, 0, INITIAL_ENERGY);

  return childSlot;
}
