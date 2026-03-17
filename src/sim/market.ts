// Phase 2 — Bilateral goods trade engine.
// Implements the trade protocol from CLAUDE.md exactly.

import { AGENT_FIELDS, FOOD_SURVIVAL_BUFFER, WOOD_SURVIVAL_BUFFER } from '../types/constants';
import { getField, setField } from './agent';
import type { SpatialGrid } from './grid';
import type { PolicyState } from '../types/sim';

const PRICE_HISTORY_SIZE = 100;

// Ring buffer for the last 100 completed food trade prices.
const priceRingBuf = new Float32Array(PRICE_HISTORY_SIZE);
let ringHead  = 0;  // next write position
let ringCount = 0;  // entries filled (capped at PRICE_HISTORY_SIZE)

let lastFoodPrice  = 1.0;  // rolling mean; initialised to neutral 1:1 barter ratio
export let treasury   = 0;  // accumulated tax (taxRate = 0 in Phase 2, but wired for Phase 4)
let tradeCount     = 0;    // cumulative completed trades since last resetMarket()
let tickTradeCount = 0;    // trades executed in the current tick only; reset at top of runMarket()

function ringBufMean(): number {
  if (ringCount === 0) return 1.0;
  let sum = 0;
  const len = Math.min(ringCount, PRICE_HISTORY_SIZE);
  for (let i = 0; i < len; i++) sum += priceRingBuf[i];
  return sum / len;
}

function pushPrice(price: number): void {
  priceRingBuf[ringHead] = price;
  ringHead = (ringHead + 1) % PRICE_HISTORY_SIZE;
  if (ringCount < PRICE_HISTORY_SIZE) ringCount++;
  lastFoodPrice = ringBufMean();
}

export function getMarketStats(): {
  foodPrice: number; woodPrice: number; treasury: number;
  tradeCount: number; tickTradeCount: number;
} {
  return {
    foodPrice: lastFoodPrice,
    woodPrice: ringCount > 0 ? 1 / lastFoodPrice : 0,
    treasury,
    tradeCount,
    tickTradeCount,
  };
}

// Must be called on every INIT and RESET before the first tick.
export function resetMarket(): void {
  priceRingBuf.fill(0);
  ringHead       = 0;
  ringCount      = 0;
  lastFoodPrice  = 1.0;
  treasury       = 0;
  tradeCount     = 0;  // ← only place tradeCount is set to 0
  tickTradeCount = 0;
}

// Called once per tick from tick.ts, AFTER the spatial grid has been populated
// with current agent positions.
export function runMarket(
  sab: Float32Array,
  _n: number,
  grid: SpatialGrid,
  policy: PolicyState,
  shuffledOrder: number[],
  rng: () => number,
): void {
  tickTradeCount = 0;  // reset at the start of every tick; tradeCount keeps accumulating

  for (const aIdx of shuffledOrder) {
    const foodA = getField(sab, aIdx, AGENT_FIELDS.FOOD);
    const surplusFood = foodA - FOOD_SURVIVAL_BUFFER;

    if (surplusFood <= 2) continue;

    const xA = getField(sab, aIdx, AGENT_FIELDS.X);
    const yA = getField(sab, aIdx, AGENT_FIELDS.Y);

    // Candidates: neighbours that have wood surplus
    const neighbours = grid.getNeighbours(xA, yA);
    const candidates: number[] = [];
    for (const bIdx of neighbours) {
      if (bIdx !== aIdx && getField(sab, bIdx, AGENT_FIELDS.WOOD) > WOOD_SURVIVAL_BUFFER) {
        candidates.push(bIdx);
      }
    }

    if (candidates.length === 0) continue;

    const bIdx = candidates[Math.floor(rng() * candidates.length)];

    const offerPrice     = lastFoodPrice * (0.8 + rng() * 0.4);   // [0.8×, 1.2×]
    const acceptThreshold = lastFoodPrice * (0.7 + rng() * 0.6);  // [0.7×, 1.3×]

    if (offerPrice < acceptThreshold) continue;

    const woodB = getField(sab, bIdx, AGENT_FIELDS.WOOD);

    // wood_demand = (B.wood - WOOD_SURVIVAL_BUFFER) / offer_price
    // Units B can afford at offer_price given B's surplus wood budget.
    // Dimensionally: [wood] / [wood per food] = [food units]
    const woodDemand = (woodB - WOOD_SURVIVAL_BUFFER) / offerPrice;
    const units = Math.min(surplusFood, woodDemand);

    if (units < 0.001) continue;  // skip dust trades

    const tax = units * offerPrice * policy.taxRate;

    // A sells food, gains wealth
    setField(sab, aIdx, AGENT_FIELDS.FOOD,   foodA - units);
    setField(sab, aIdx, AGENT_FIELDS.WEALTH,
      getField(sab, aIdx, AGENT_FIELDS.WEALTH) + units * offerPrice * (1 - policy.taxRate));

    // B buys food, pays wood
    setField(sab, bIdx, AGENT_FIELDS.WOOD,  woodB - units * offerPrice);
    setField(sab, bIdx, AGENT_FIELDS.FOOD,  getField(sab, bIdx, AGENT_FIELDS.FOOD) + units);

    treasury += tax;
    tradeCount++;
    tickTradeCount++;

    pushPrice(offerPrice);
  }
}
