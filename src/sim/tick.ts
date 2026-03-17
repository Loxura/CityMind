// Phase 1 master tick loop.
// Order: shuffle → harvest → lifecycle → wealth update → tile regen.
// Neural net inference is Phase 3; do not add it here.

import { AGENT_FIELDS, AGENT_STRIDE, MAX_AGENTS, INITIAL_ENERGY, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField, initAgent } from './agent';
import { harvestAgent } from './harvest';
import { isDead, ageAgent, updateWealth, tryReproduce } from './lifecycle';
import { regenerateTiles } from './map';
import type { TileMap } from './map';
import type { PolicyState } from '../types/sim';

// Seeded PRNG (mulberry32)
let _rngState = 0;

export function seedRng(seed: number): void {
  _rngState = seed >>> 0;
}

export function rng(): number {
  _rngState |= 0;
  _rngState = _rngState + 0x6d2b79f5 | 0;
  let t = Math.imul(_rngState ^ _rngState >>> 15, 1 | _rngState);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// Fisher-Yates shuffle of an index array
function shuffleIndices(indices: number[]): void {
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
}

let _nextId = 0;

export function initAgents(sab: Float32Array, count: number, seed: number): number {
  seedRng(seed);
  _nextId = 0;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * MAP_WIDTH);
    const y = Math.floor(rng() * MAP_HEIGHT);
    initAgent(sab, i, _nextId++, x, y, 20, 5, INITIAL_ENERGY);
  }
  return count;
}

// Development invariant checks — run every 60 ticks
function assertInvariants(sab: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    console.assert(getField(sab, i, AGENT_FIELDS.FOOD)   >= 0, `Agent ${i} has negative food`);
    console.assert(getField(sab, i, AGENT_FIELDS.WEALTH) >= 0, `Agent ${i} has negative wealth`);
    console.assert(getField(sab, i, AGENT_FIELDS.ENERGY) >= 0, `Agent ${i} has negative energy`);
  }
}

// Returns the new active agent count after this tick.
export function tick(
  sab: Float32Array,
  activeCount: number,
  tiles: TileMap,
  _policy: PolicyState,   // unused in Phase 1
  tickNumber: number,
): number {
  // Shuffled processing order — avoids systematic bias toward low indices
  const order: number[] = [];
  for (let i = 0; i < activeCount; i++) order.push(i);
  shuffleIndices(order);

  // alive[i] = true means agent slot i survives this tick
  const alive = new Uint8Array(activeCount + 1); // +1 for potential child overflow guard
  for (let i = 0; i < activeCount; i++) alive[i] = 1;

  // Children are appended after the current active range.
  // We track them separately and compact at the end.
  let childCount = 0;

  for (const idx of order) {
    if (!alive[idx]) continue;

    ageAgent(sab, idx);
    harvestAgent(sab, idx, tiles);

    if (isDead(sab, idx)) {
      alive[idx] = 0;
      continue;
    }

    updateWealth(sab, idx);

    // Reproduction: child is written to slot (activeCount + childCount)
    const nextIdRef = { value: _nextId };
    const totalNow  = activeCount + childCount;
    if (totalNow < MAX_AGENTS) {
      const childSlot = tryReproduce(sab, idx, totalNow, MAX_AGENTS, nextIdRef, rng);
      if (childSlot !== -1) {
        _nextId = nextIdRef.value;
        childCount++;
      }
    }
  }

  // Compact live agents into contiguous slots 0..survivors-1
  // Uses a two-pointer approach: dst advances through dead slots, src from top.
  let dst = 0;
  let survivors = 0;
  for (let src = 0; src < activeCount; src++) {
    if (alive[src]) {
      if (src !== dst) {
        sab.copyWithin(dst * AGENT_STRIDE, src * AGENT_STRIDE, (src + 1) * AGENT_STRIDE);
      }
      dst++;
      survivors++;
    }
  }

  // Move children (currently at slots activeCount..activeCount+childCount-1)
  // to slots survivors..survivors+childCount-1
  for (let ci = 0; ci < childCount; ci++) {
    const srcSlot = activeCount + ci;
    const dstSlot = survivors + ci;
    if (srcSlot !== dstSlot) {
      sab.copyWithin(dstSlot * AGENT_STRIDE, srcSlot * AGENT_STRIDE, (srcSlot + 1) * AGENT_STRIDE);
    }
  }

  const newCount = survivors + childCount;

  // Tile regeneration after all agents have acted
  regenerateTiles(tiles);

  // Development invariant checks every 60 ticks
  if (tickNumber % 60 === 0) assertInvariants(sab, newCount);

  return newCount;
}
