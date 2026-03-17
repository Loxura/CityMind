// Master tick loop — Phase 3.
// Order: net inference → harvest (net-driven move) → grid register → market → lifecycle → tile regen → compact.

import { AGENT_FIELDS, AGENT_STRIDE, MAX_AGENTS, INITIAL_ENERGY, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField, initAgent } from './agent';
import { applyNetHarvest } from './harvest';
import { isDead, ageAgent, updateWealth, tryReproduce } from './lifecycle';
import { regenerateTiles } from './map';
import { runMarket } from './market';
import { SpatialGrid } from './grid';
import { buildInputMatrix, computeWealthRanks } from '../net/inputs';
import { runInference, decodeMoveDir, decodePrimaryAction, decodePrice } from '../net/inference';
import { copyWeightsFromSAB, initWeights } from '../net/weights';
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

// Persistent spatial grid — recreated on reset, reused each tick
let _grid = new SpatialGrid();

export function initAgents(sab: Float32Array, count: number, seed: number): number {
  seedRng(seed);
  _nextId = 0;
  _grid = new SpatialGrid();
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * MAP_WIDTH);
    const y = Math.floor(rng() * MAP_HEIGHT);
    initAgent(sab, i, _nextId++, x, y, 20, 5, INITIAL_ENERGY);
    initWeights(sab, i, rng);
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
  policy: PolicyState,
  tickNumber: number,
  foodPrice: number,
  woodPrice: number,
): number {
  // Build shuffled order — shared by market and harvest steps
  const order: number[] = [];
  for (let i = 0; i < activeCount; i++) order.push(i);
  shuffleIndices(order);

  // alive[i] = 1 means agent slot i survives this tick
  const alive = new Uint8Array(activeCount + 1);
  for (let i = 0; i < activeCount; i++) alive[i] = 1;

  let childCount = 0;

  // ── Net inference (once per tick, all agents in one batch) ──────────────────
  // Build inputs using last tick's grid state (pre-harvest positions from prev tick).
  const wealthRanks = computeWealthRanks(sab, activeCount);
  const inputMatrix = buildInputMatrix(sab, activeCount, tiles, foodPrice, woodPrice, policy, wealthRanks, _grid);
  const { w1flat, w2flat, w3flat } = copyWeightsFromSAB(sab, activeCount);
  const rawOutputs = runInference(inputMatrix, w1flat, w2flat, w3flat, activeCount);

  // Decode net outputs into per-agent action arrays
  const moveDir          = new Uint8Array(activeCount);
  const primaryAction    = new Uint8Array(activeCount);
  const offerPrices      = new Float32Array(activeCount);
  const acceptThresholds = new Float32Array(activeCount);

  const outStride = 7;
  for (let i = 0; i < activeCount; i++) {
    const base = i * outStride;
    moveDir[i]          = decodeMoveDir(rawOutputs[base + 0]);
    primaryAction[i]    = decodePrimaryAction(rawOutputs[base + 1]);
    offerPrices[i]      = decodePrice(rawOutputs[base + 2]);
    acceptThresholds[i] = decodePrice(rawOutputs[base + 3]);
    // dims 4-6 (reservation wage, invest, risk) stored for Phase 4+; not used yet
  }

  // ── Harvest: net-driven move + resource collection + death check ────────────
  for (const idx of order) {
    ageAgent(sab, idx);
    applyNetHarvest(sab, idx, tiles, moveDir[idx]);

    if (isDead(sab, idx)) {
      alive[idx] = 0;
      continue;
    }

    updateWealth(sab, idx);
  }

  // Grid register (post-harvest positions, dead excluded)
  _grid.clear();
  for (let i = 0; i < activeCount; i++) {
    if (alive[i]) _grid.register(i, getField(sab, i, AGENT_FIELDS.X), getField(sab, i, AGENT_FIELDS.Y));
  }

  // ── Market: trades using net-derived prices ─────────────────────────────────
  runMarket(sab, activeCount, _grid, policy, order, rng, offerPrices, acceptThresholds);

  // ── Lifecycle: reproduction (death already marked above) ────────────────────
  for (const idx of order) {
    if (!alive[idx]) continue;

    const nextIdRef = { value: _nextId };
    const totalNow  = activeCount + childCount;
    if (totalNow < MAX_AGENTS) {
      const childSlot = tryReproduce(sab, idx, totalNow, MAX_AGENTS, nextIdRef, rng);
      if (childSlot !== -1) {
        _nextId = nextIdRef.value;
        // Give child Xavier-initialised weights
        initWeights(sab, childSlot, rng);
        childCount++;
      }
    }
  }

  // Compact: move live agents to contiguous slots 0..survivors-1
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

  // Move children to slots survivors..survivors+childCount-1
  for (let ci = 0; ci < childCount; ci++) {
    const srcSlot = activeCount + ci;
    const dstSlot = survivors + ci;
    if (srcSlot !== dstSlot) {
      sab.copyWithin(dstSlot * AGENT_STRIDE, srcSlot * AGENT_STRIDE, (srcSlot + 1) * AGENT_STRIDE);
    }
  }

  const newCount = survivors + childCount;

  regenerateTiles(tiles);

  if (tickNumber % 60 === 0) assertInvariants(sab, newCount);

  return newCount;
}
