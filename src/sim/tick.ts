// Master tick loop — Phase 9.
// Order: net inference → harvest (Cobb-Douglas + wood harvest) → construction (builders) →
//        house decay → food decay → grid register → emergency food market →
//        labour market → goods market → housing rent → shelter drain →
//        redistribution → lending (Phase 9) → lifecycle → compact → tile regen.

import {
  AGENT_FIELDS, AGENT_STRIDE, MAX_AGENTS, INITIAL_ENERGY,
  MAP_WIDTH, MAP_HEIGHT,
} from '../types/constants';
import { getField, setField, initAgent } from './agent';
import type { AgentSeed } from './seeds/moroccoUrbanSeed';
import { applyNetHarvest, applyFoodDecay, resetHarvestTick } from './harvest';
import { isDead, ageAgent, updateWealth, tryReproduce } from './lifecycle';
import { regenerateTiles } from './map';
import { runMarket, runEmergencyMarket, getMarketStats, addToTreasury, setTreasury } from './market';
import { runLabourMarket } from './labour';
import { redistribute } from './tax';
import {
  applyHouseDecay, applyShelterDrain, applyConstruction,
  runHousingRent, resetHousingTick,
} from './housing';
import { SpatialGrid } from './grid';
import { buildInputMatrix, computeWealthRanks } from '../net/inputs';
import { runInference, decodeMoveDir, decodePrimaryAction, decodePrice, decodeReservationWage, decodeInvestSignal } from '../net/inference';
import { runLending } from './bank';
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

// Phase 8: initAgents assigns builder role and land ownership based on seed decile
// and landPolicy, replacing the old boolean landFree parameter.
//
// Role assignment:
//   Morocco seed: decile >= 9 → ROLE=1 (builder) — top 2 deciles, ~20% of agents
//   Flat seed:    every 7th agent → ROLE=1 (~14% builders)
//
// Land assignment:
//   'free':      land=1 for all agents (unchanged from Phase 4)
//   'auctioned': decile >= 7 → land=1 (Morocco); top 30% → land=1 (flat)
//   'state':     land=0 for all
export function initAgents(
  sab: Float32Array,
  count: number,
  seed: number,
  landPolicy: PolicyState['landPolicy'],
  agentSeeds?: AgentSeed[],
): number {
  seedRng(seed);
  _nextId = 0;
  _grid   = new SpatialGrid();

  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * MAP_WIDTH);
    const y = Math.floor(rng() * MAP_HEIGHT);
    const s = agentSeeds ? agentSeeds[i % agentSeeds.length] : null;
    const food = s ? s.initialFood : 20;
    const wood = s ? s.initialWood : 5;

    // Determine land ownership for this agent
    let land = 0;
    if (landPolicy === 'free') {
      land = 1;
    } else if (landPolicy === 'auctioned') {
      const decile = s ? s.decile : 10; // flat seed: treat all as high decile initially
      land = (s ? decile >= 7 : (i % 10) >= 7) ? 1 : 0;
    }
    // 'state': land=0 (default)

    initAgent(sab, i, _nextId++, x, y, food, wood, INITIAL_ENERGY, land);
    initWeights(sab, i, rng);

    // Assign builder role: Morocco seed top 2 deciles; flat seed every 7th agent
    const isBuilder = s ? s.decile >= 9 : (i % 7 === 0);
    if (isBuilder) setField(sab, i, AGENT_FIELDS.ROLE, 1);
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

// _foodDecayRate: runtime-adjustable food decay rate (crash guard in worker.ts can soften it).
// Default FOOD_DECAY_RATE is applied in harvest loop; this exists for the Phase 7 crash guard.
let _foodDecayRate = 0.992; // default HIGH tier; see applyFoodDecay for tier logic
export function setFoodDecayRate(rate: number): void { _foodDecayRate = rate; }
void _foodDecayRate; // accessed via applyFoodDecay tiers, not directly

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

  // sheltered[i]: 1 if agent owns a house (HOUSES>=1) or has paid rent this tick.
  // Initialised here; runHousingRent updates it; applyShelterDrain reads it.
  const sheltered = new Uint8Array(activeCount);
  for (let i = 0; i < activeCount; i++) {
    sheltered[i] = getField(sab, i, AGENT_FIELDS.HOUSES) >= 1 ? 1 : 0;
  }

  let childCount = 0;

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
  const investSignals    = new Float32Array(activeCount);

  for (let i = 0; i < activeCount; i++) {
    const b = i * 7;
    moveDir[i]          = decodeMoveDir(rawOutputs[b]);
    primaryAction[i]    = decodePrimaryAction(rawOutputs[b + 1]);
    offerPrices[i]      = decodePrice(rawOutputs[b + 2]);
    acceptThresholds[i] = decodePrice(rawOutputs[b + 3]);
    reservationWages[i] = decodeReservationWage(rawOutputs[b + 4]);
    investSignals[i]    = decodeInvestSignal(rawOutputs[b + 5]);
    // dim 6 (risk appetite) reserved for Phase 10
  }

  // ── Harvest loop ─────────────────────────────────────────────────────────────
  resetHarvestTick();
  resetHousingTick();

  for (const idx of order) {
    ageAgent(sab, idx);

    // All agents: move + harvest food AND wood from tile (Phase 8 adds wood harvesting)
    applyNetHarvest(sab, idx, tiles, moveDir[idx]);

    // Phase 8: ROLE=1 (builder) additionally converts surplus wood → houses
    const role = Math.round(getField(sab, idx, AGENT_FIELDS.ROLE));
    if (role === 1) {
      applyConstruction(sab, idx);
    }

    // Phase 8: house decay (all agents with houses)
    applyHouseDecay(sab, idx);

    // Phase 7: progressive food decay (when currency is active)
    if (policy.isCurrencyActive) {
      applyFoodDecay(sab, idx);
    }

    // Phase 8: shelter drain deferred — runHousingRent must run first to mark renters.
    // Drain applied in shelter drain loop below (after housing rent step).

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

  // ── Emergency food market (Step 3.5 — Phase 7+) ─────────────────────────────
  if (policy.isCurrencyActive) {
    runEmergencyMarket(sab, activeCount, _grid, policy, order, rng);
  }

  // ── Labour market (Step 4) ───────────────────────────────────────────────────
  const labourTreasuryDelta = runLabourMarket(
    sab, activeCount, _grid, policy, order,
    primaryAction, reservationWages, foodPrice,
  );
  addToTreasury(labourTreasuryDelta);

  // ── Goods market (Step 5) ────────────────────────────────────────────────────
  runMarket(sab, activeCount, _grid, policy, order, rng, offerPrices, acceptThresholds);

  // ── Housing rent (Step 6 — Phase 8+) ─────────────────────────────────────────
  // runHousingRent marks renters as sheltered (updates sheltered array).
  // Must run before applyShelterDrain so renters are not penalised.
  const housingTreasuryDelta = runHousingRent(
    sab, activeCount, _grid, policy, order, sheltered,
  );
  addToTreasury(housingTreasuryDelta);

  // ── Shelter drain (after rent market has resolved shelter status) ─────────────
  for (const idx of order) {
    if (!alive[idx]) continue;
    applyShelterDrain(sab, idx, sheltered);
  }

  // ── Redistribution (Step 8) ──────────────────────────────────────────────────
  const { treasury, foodPrice: fp, woodPrice: wp } = getMarketStats();
  const remaining = redistribute(treasury, policy, sab, activeCount, tiles, fp, wp);
  setTreasury(remaining);

  // ── Invest-signal diagnostic (ticks 500, 1000, 2000) ─────────────────────────
  if (tickNumber === 500 || tickNumber === 1000 || tickNumber === 2000) {
    let below05 = 0, between0507 = 0, above07 = 0;
    for (let i = 0; i < activeCount; i++) {
      const s = investSignals[i];
      if (s > 0.7) above07++;
      else if (s >= 0.5) between0507++;
      else below05++;
    }
    console.log(
      `[tick ${tickNumber}] invest_signal dist: <0.5=${below05} 0.5-0.7=${between0507} >0.7=${above07}` +
      ` (n=${activeCount}, pct_above_threshold=${(above07/activeCount*100).toFixed(1)}%)`
    );
  }

  // ── Lending (Step 8.5 — Phase 9+) ────────────────────────────────────────────
  runLending(sab, activeCount, order, policy, investSignals, fp, wp);

  // ── Lifecycle: reproduction only (Step 9) ────────────────────────────────────
  for (const idx of order) {
    if (!alive[idx]) continue;

    const nextIdRef = { value: _nextId };
    const totalNow  = activeCount + childCount;
    if (totalNow < MAX_AGENTS) {
      const childSlot = tryReproduce(sab, idx, totalNow, MAX_AGENTS, nextIdRef, rng);
      if (childSlot !== -1) {
        _nextId = nextIdRef.value;
        initWeights(sab, childSlot, rng);
        // Children inherit parent's role — preserves builder lineage across generations.
        // Without this, every child is born ROLE=0 (farmer) and builder population
        // dwindles to zero, eliminating the construction sink and causing wood to
        // accumulate without bound.
        setField(sab, childSlot, AGENT_FIELDS.ROLE, getField(sab, idx, AGENT_FIELDS.ROLE));
        // Children inherit land when policy allows it
        if (policy.landPolicy === 'free') setField(sab, childSlot, AGENT_FIELDS.LAND, 1);
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

