// Phase 8 — Housing: construction, degradation, shelter drain, rent collection.
//
// "Nearby" for all spatial queries = grid.getNeighbours() — the same 2-ring radius
// (25×25 tile window) used by all other markets. No separate radius constant.

import {
  AGENT_FIELDS,
  WOOD_SURVIVAL_BUFFER,
  WOOD_BUILD_BUFFER,
  MAX_WOOD_PER_CONSTRUCTION,
  CONSTRUCTION_RATE,
  MAX_HOUSES_PER_AGENT,
  HOUSE_DECAY_RATE_HIGH,
  HOUSE_DECAY_RATE_MID,
  HOUSE_DECAY_RATE_LOW,
  SHELTER_ENERGY_PENALTY,
  HOUSE_RENT_PER_TICK,
  LAND_RENT_PER_TICK,
  MAX_RENT_SLOTS_PER_LANDLORD,
} from '../types/constants';
import { getField, setField } from './agent';
import type { SpatialGrid } from './grid';
import type { PolicyState } from '../types/sim';

// Per-tick housing stats (reset each tick by resetHousingTick).
let _tickRentCollected = 0;
let _tickHousesBuilt   = 0;

export function resetHousingTick(): void {
  _tickRentCollected = 0;
  _tickHousesBuilt   = 0;
}

export function getHousingStats(): { rentCollected: number; housesBuilt: number } {
  return { rentCollected: _tickRentCollected, housesBuilt: _tickHousesBuilt };
}

// ── Progressive house decay ────────────────────────────────────────────────────
// Mirrors the food decay tier pattern. Large portfolios erode faster so builders
// must keep consuming wood to maintain stock.
export function applyHouseDecay(sab: Float32Array, idx: number): void {
  const h = getField(sab, idx, AGENT_FIELDS.HOUSES);
  if (h <= 0) return;

  let decayed: number;
  if (h > 10) {
    decayed = h * HOUSE_DECAY_RATE_HIGH;
  } else if (h > 5) {
    decayed = h * HOUSE_DECAY_RATE_MID;
  } else {
    decayed = h * HOUSE_DECAY_RATE_LOW;
  }
  setField(sab, idx, AGENT_FIELDS.HOUSES, decayed);
}

// ── Shelter drain ─────────────────────────────────────────────────────────────
// Extra energy drain per tick for unsheltered agents (sheltered[idx] === 0).
// Called after runHousingRent has marked renters as sheltered.
export function applyShelterDrain(
  sab: Float32Array,
  idx: number,
  sheltered: Uint8Array,
): void {
  if (sheltered[idx]) return;
  const energy = getField(sab, idx, AGENT_FIELDS.ENERGY);
  setField(sab, idx, AGENT_FIELDS.ENERGY, energy - SHELTER_ENERGY_PENALTY);
}

// ── Builder construction ──────────────────────────────────────────────────────
// Called in the harvest loop for ROLE=1 agents after applyNetHarvest.
// Cobb-Douglas: housesProduced = CONSTRUCTION_RATE × (1+labourHired)^0.7 × woodConsumed^0.3
// Wood consumed = min(surplusWood, MAX_WOOD_PER_CONSTRUCTION).
// Halts when HOUSES >= MAX_HOUSES_PER_AGENT.
export function applyConstruction(sab: Float32Array, idx: number): void {
  if (getField(sab, idx, AGENT_FIELDS.HOUSES) >= MAX_HOUSES_PER_AGENT) return;

  const wood = getField(sab, idx, AGENT_FIELDS.WOOD);
  const minWood = WOOD_SURVIVAL_BUFFER + WOOD_BUILD_BUFFER; // keep at least this much
  const surplusWood = wood - minWood;
  if (surplusWood <= 0) return;

  const woodConsumed = Math.min(surplusWood, MAX_WOOD_PER_CONSTRUCTION);
  const labourHired  = getField(sab, idx, AGENT_FIELDS.LABOUR_HIRED);

  const housesProduced =
    CONSTRUCTION_RATE *
    Math.pow(1 + labourHired, 0.7) *
    Math.pow(woodConsumed, 0.3);

  const currentHouses = getField(sab, idx, AGENT_FIELDS.HOUSES);
  const newHouses = Math.min(MAX_HOUSES_PER_AGENT, currentHouses + housesProduced);

  setField(sab, idx, AGENT_FIELDS.WOOD,   wood - woodConsumed);
  setField(sab, idx, AGENT_FIELDS.HOUSES, newHouses);
  _tickHousesBuilt += housesProduced;
}

// ── Housing rent market ───────────────────────────────────────────────────────
// Two passes, both using grid.getNeighbours() — the same 25×25-tile radius used
// by all other markets in this codebase.
//
// Pass 1 — House rent:
//   Landlord (HOUSES >= 2) rents surplus slots (floor(HOUSES-1)) to nearby houseless
//   agents with enough cash. Max MAX_RENT_SLOTS_PER_LANDLORD renters per landlord.
//   Renter: cash -= HOUSE_RENT_PER_TICK; sheltered[renter] = 1.
//   Landlord: cash += HOUSE_RENT_PER_TICK × (1-taxRate).
//   Treasury: += HOUSE_RENT_PER_TICK × taxRate.
//
// Pass 2 — Land rent (auctioned policy only):
//   Landowner (LAND >= 2) collects LAND_RENT_PER_TICK × (LAND-1) cash from each
//   nearby landless agent with sufficient cash. Same slot cap as house rent.
//
// Returns treasury delta (sum of all taxed rent portions).
export function runHousingRent(
  sab: Float32Array,
  n: number,
  grid: SpatialGrid,
  policy: PolicyState,
  shuffledOrder: number[],
  sheltered: Uint8Array,
): number {
  let treasuryDelta = 0;

  // ── Pass 1: house rent ────────────────────────────────────────────────────
  for (const lIdx of shuffledOrder) {
    const houses = getField(sab, lIdx, AGENT_FIELDS.HOUSES);
    if (houses < 2) continue; // needs at least 2 to have 1 surplus slot

    const rentSlots = Math.min(
      Math.floor(houses - 1),
      MAX_RENT_SLOTS_PER_LANDLORD,
    );

    const xL = getField(sab, lIdx, AGENT_FIELDS.X);
    const yL = getField(sab, lIdx, AGENT_FIELDS.Y);
    const neighbours = grid.getNeighbours(xL, yL);

    let slotsFilled = 0;
    for (const rIdx of neighbours) {
      if (slotsFilled >= rentSlots) break;
      if (rIdx === lIdx) continue;
      if (sheltered[rIdx]) continue; // already sheltered this tick

      const cashR = getField(sab, rIdx, AGENT_FIELDS.CASH);
      if (cashR < HOUSE_RENT_PER_TICK) continue; // can't afford

      const tax       = HOUSE_RENT_PER_TICK * policy.taxRate;
      const netToLord = HOUSE_RENT_PER_TICK - tax;

      setField(sab, rIdx, AGENT_FIELDS.CASH, cashR - HOUSE_RENT_PER_TICK);
      setField(sab, lIdx, AGENT_FIELDS.CASH,
        getField(sab, lIdx, AGENT_FIELDS.CASH) + netToLord);

      sheltered[rIdx]  = 1;
      treasuryDelta   += tax;
      _tickRentCollected += HOUSE_RENT_PER_TICK;
      slotsFilled++;
    }
  }

  // ── Pass 2: land rent (auctioned policy only) ─────────────────────────────
  if (policy.landPolicy !== 'auctioned') return treasuryDelta;

  for (const oIdx of shuffledOrder) {
    const land = getField(sab, oIdx, AGENT_FIELDS.LAND);
    if (land < 2) continue; // needs surplus land to rent out

    const rentSlots = Math.min(
      Math.floor(land - 1),
      MAX_RENT_SLOTS_PER_LANDLORD,
    );
    const rentAmount = LAND_RENT_PER_TICK * (land - 1);

    const xO = getField(sab, oIdx, AGENT_FIELDS.X);
    const yO = getField(sab, oIdx, AGENT_FIELDS.Y);
    const neighbours = grid.getNeighbours(xO, yO);

    let slotsFilled = 0;
    for (const tIdx of neighbours) {
      if (slotsFilled >= rentSlots) break;
      if (tIdx === oIdx) continue;
      if (getField(sab, tIdx, AGENT_FIELDS.LAND) > 0) continue; // landless only

      const cashT = getField(sab, tIdx, AGENT_FIELDS.CASH);
      if (cashT < rentAmount) continue;

      const tax      = rentAmount * policy.taxRate;
      const netToOwner = rentAmount - tax;

      setField(sab, tIdx, AGENT_FIELDS.CASH, cashT - rentAmount);
      setField(sab, oIdx, AGENT_FIELDS.CASH,
        getField(sab, oIdx, AGENT_FIELDS.CASH) + netToOwner);

      treasuryDelta      += tax;
      _tickRentCollected += rentAmount;
      slotsFilled++;
    }
  }

  void n; // n not used directly — iteration is over shuffledOrder
  return treasuryDelta;
}
