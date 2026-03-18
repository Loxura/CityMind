// Master tick loop — Phase 4.
// Order: net inference → harvest (Cobb-Douglas) → grid register →
//        labour market → goods market → redistribution → lifecycle → tile regen → compact.

import { AGENT_FIELDS, AGENT_STRIDE, MAX_AGENTS, INITIAL_ENERGY, MAP_WIDTH, MAP_HEIGHT } from '../types/constants';
import { getField, setField, initAgent } from './agent';
import type { AgentSeed } from './seeds/moroccoUrbanSeed';
import { applyNetHarvest, resetHarvestTick } from './harvest';
import { isDead, ageAgent, updateWealth, tryReproduce } from './lifecycle';
import { regenerateTiles } from './map';
import { runMarket, getMarketStats, addToTreasury, setTreasury } from './market';
import { runLabourMarket } from './labour';
import { redistribute } from './tax';
import { SpatialGrid } from './grid';
import { buildInputMatrix, computeWealthRanks } from '../net/inputs';
import { runInference, decodeMoveDir, decodePrimaryAction, decodePrice, decodeReservationWage } from '../net/inference';
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

function shuffleIndices(indices: number[]): void {
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
}

let _nextId = 0;
let _grid   = new SpatialGrid();

// land=1 when landPolicy='free' so the labour market has active employers from tick 1.
// agentSeeds: when provided, each agent's initial food/wood comes from the seed array
// (cycling if count > seed length). Spatial placement always uses the RNG.
export function initAgents(
  sab: Float32Array,
  count: number,
  seed: number,
  landFree: boolean,
  agentSeeds?: AgentSeed[],
): number {
  seedRng(seed);
  _nextId = 0;
  _grid   = new SpatialGrid();
  const land = landFree ? 1 : 0;
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * MAP_WIDTH);
    const y = Math.floor(rng() * MAP_HEIGHT);
    const s = agentSeeds ? agentSeeds[i % agentSeeds.length] : null;
    const food = s ? s.initialFood : 20;
    const wood = s ? s.initialWood : 5;
    initAgent(sab, i, _nextId++, x, y, food, wood, INITIAL_ENERGY, land);
    initWeights(sab, i, rng);
  }
  return count;
}

function assertInvariants(sab: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    console.assert(getField(sab, i, AGENT_FIELDS.FOOD)   >= 0, `Agent ${i} negative food`);
    console.assert(getField(sab, i, AGENT_FIELDS.WEALTH) >= 0, `Agent ${i} negative wealth`);
    console.assert(getField(sab, i, AGENT_FIELDS.ENERGY) >= 0, `Agent ${i} negative energy`);
  }
}

export function tick(
  sab: Float32Array,
  activeCount: number,
  tiles: TileMap,
  policy: PolicyState,
  tickNumber: number,
  foodPrice: number,
  woodPrice: number,
): number {
  const order: number[] = [];
  for (let i = 0; i < activeCount; i++) order.push(i);
  shuffleIndices(order);

  const alive = new Uint8Array(activeCount + 1);
  for (let i = 0; i < activeCount; i++) alive[i] = 1;

  let childCount = 0;
  const landFree = policy.landPolicy === 'free';

  // ── Net inference ────────────────────────────────────────────────────────────
  const wealthRanks  = computeWealthRanks(sab, activeCount);
  const inputMatrix  = buildInputMatrix(sab, activeCount, tiles, foodPrice, woodPrice, policy, wealthRanks, _grid);
  const { w1flat, w2flat, w3flat } = copyWeightsFromSAB(sab, activeCount);
  const rawOutputs   = runInference(inputMatrix, w1flat, w2flat, w3flat, activeCount);

  const moveDir          = new Uint8Array(activeCount);
  const primaryAction    = new Uint8Array(activeCount);
  const offerPrices      = new Float32Array(activeCount);
  const acceptThresholds = new Float32Array(activeCount);
  const reservationWages = new Float32Array(activeCount);

  for (let i = 0; i < activeCount; i++) {
    const b = i * 7;
    moveDir[i]          = decodeMoveDir(rawOutputs[b]);
    primaryAction[i]    = decodePrimaryAction(rawOutputs[b + 1]);
    offerPrices[i]      = decodePrice(rawOutputs[b + 2]);
    acceptThresholds[i] = decodePrice(rawOutputs[b + 3]);
    reservationWages[i] = decodeReservationWage(rawOutputs[b + 4]);
    // dims 5-6 (invest, risk) reserved for Phase 8/9
  }

  // ── Harvest (Cobb-Douglas, net-driven move) ──────────────────────────────────
  resetHarvestTick();
  for (const idx of order) {
    ageAgent(sab, idx);
    applyNetHarvest(sab, idx, tiles, moveDir[idx]);

    if (isDead(sab, idx)) {
      alive[idx] = 0;
      continue;
    }

    updateWealth(sab, idx);
  }

  // Grid register (post-harvest, dead excluded)
  _grid.clear();
  for (let i = 0; i < activeCount; i++) {
    if (alive[i]) _grid.register(i, getField(sab, i, AGENT_FIELDS.X), getField(sab, i, AGENT_FIELDS.Y));
  }

  // ── Labour market (Step 4) ───────────────────────────────────────────────────
  const labourTreasuryDelta = runLabourMarket(
    sab, activeCount, _grid, policy, order,
    primaryAction, reservationWages, foodPrice,
  );
  addToTreasury(labourTreasuryDelta);

  // ── Goods market (Step 5) ────────────────────────────────────────────────────
  runMarket(sab, activeCount, _grid, policy, order, rng, offerPrices, acceptThresholds);

  // ── Redistribution (Step 6) ──────────────────────────────────────────────────
  const { treasury, foodPrice: fp, woodPrice: wp } = getMarketStats();
  const remaining = redistribute(treasury, policy, sab, activeCount, tiles, fp, wp);
  setTreasury(remaining);

  // ── Lifecycle: reproduction only (Step 7) ────────────────────────────────────
  for (const idx of order) {
    if (!alive[idx]) continue;

    const nextIdRef = { value: _nextId };
    const totalNow  = activeCount + childCount;
    if (totalNow < MAX_AGENTS) {
      const childSlot = tryReproduce(sab, idx, totalNow, MAX_AGENTS, nextIdRef, rng);
      if (childSlot !== -1) {
        _nextId = nextIdRef.value;
        initWeights(sab, childSlot, rng);
        if (landFree) setField(sab, childSlot, AGENT_FIELDS.LAND, 1);
        childCount++;
      }
    }
  }

  // Compact dead agents to contiguous slots
  let dst = 0;
  let survivors = 0;
  for (let src = 0; src < activeCount; src++) {
    if (alive[src]) {
      if (src !== dst) sab.copyWithin(dst * AGENT_STRIDE, src * AGENT_STRIDE, (src + 1) * AGENT_STRIDE);
      dst++;
      survivors++;
    }
  }
  for (let ci = 0; ci < childCount; ci++) {
    const srcSlot = activeCount + ci;
    const dstSlot = survivors + ci;
    if (srcSlot !== dstSlot) sab.copyWithin(dstSlot * AGENT_STRIDE, srcSlot * AGENT_STRIDE, (srcSlot + 1) * AGENT_STRIDE);
  }

  const newCount = survivors + childCount;

  regenerateTiles(tiles);

  if (tickNumber % 60 === 0) assertInvariants(sab, newCount);

  return newCount;
}
