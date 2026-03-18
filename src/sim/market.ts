// Phase 2/3 — Bilateral goods trade engine with independent price discovery.
// Two separate trade flows and two separate ring buffers.
// woodPrice is NEVER derived from foodPrice — they are independent.

import { AGENT_FIELDS, FOOD_SURVIVAL_BUFFER, WOOD_SURVIVAL_BUFFER } from '../types/constants';
import { getField, setField } from './agent';
import type { SpatialGrid } from './grid';
import type { PolicyState } from '../types/sim';

const PRICE_HISTORY_SIZE = 100;
const PRICE_SEED = 5.0;

// ── Food price ring buffer ───────────────────────────────────────────────────
// Records the executed price (in wood units) of each food trade.
const foodPriceRing = new Float32Array(PRICE_HISTORY_SIZE);
let foodRingHead  = 0;
let foodRingCount = 0;
let lastFoodPrice = PRICE_SEED;

// ── Wood price ring buffer ───────────────────────────────────────────────────
// Records the executed price (in food units) of each wood trade.
const woodPriceRing = new Float32Array(PRICE_HISTORY_SIZE);
let woodRingHead  = 0;
let woodRingCount = 0;
let lastWoodPrice = PRICE_SEED;

export let treasury   = 0;
let tradeCount     = 0;
let tickTradeCount = 0;

function ringMean(buf: Float32Array, count: number, seed: number): number {
  if (count === 0) return seed;
  let sum = 0;
  const len = Math.min(count, PRICE_HISTORY_SIZE);
  for (let i = 0; i < len; i++) sum += buf[i];
  return sum / len;
}

function pushFoodPrice(price: number): void {
  foodPriceRing[foodRingHead] = price;
  foodRingHead = (foodRingHead + 1) % PRICE_HISTORY_SIZE;
  if (foodRingCount < PRICE_HISTORY_SIZE) foodRingCount++;
  lastFoodPrice = ringMean(foodPriceRing, foodRingCount, PRICE_SEED);
}

function pushWoodPrice(price: number): void {
  woodPriceRing[woodRingHead] = price;
  woodRingHead = (woodRingHead + 1) % PRICE_HISTORY_SIZE;
  if (woodRingCount < PRICE_HISTORY_SIZE) woodRingCount++;
  lastWoodPrice = ringMean(woodPriceRing, woodRingCount, PRICE_SEED);
}

export function getMarketStats(): {
  foodPrice: number; woodPrice: number; treasury: number;
  tradeCount: number; tickTradeCount: number;
} {
  return { foodPrice: lastFoodPrice, woodPrice: lastWoodPrice, treasury, tradeCount, tickTradeCount };
}

// Must be called on every INIT and RESET before the first tick.
// Allow labour.ts wage taxes to accumulate into the same treasury.
export function addToTreasury(delta: number): void {
  treasury += delta;
}

// Allow tax.ts to update treasury after redistribution.
export function setTreasury(v: number): void {
  treasury = v;
}

export function resetMarket(): void {
  foodPriceRing.fill(0);
  foodRingHead  = 0;
  foodRingCount = 0;
  lastFoodPrice = PRICE_SEED;

  woodPriceRing.fill(0);
  woodRingHead  = 0;
  woodRingCount = 0;
  lastWoodPrice = PRICE_SEED;

  treasury       = 0;
  tradeCount     = 0;
  tickTradeCount = 0;
}

// Called once per tick from tick.ts.
//
// Two independent trade flows per agent (if surplus exists):
//   Food trade: A has surplus food → finds neighbour B with surplus wood → food sold for wood.
//               Price recorded to foodPriceRing.
//   Wood trade: A has surplus wood → finds neighbour B with surplus food → wood sold for food.
//               Price recorded to woodPriceRing.
//
// Phase 3+: netOfferPrices/netAcceptThresholds override random price selection when provided.
export function runMarket(
  sab: Float32Array,
  _n: number,
  grid: SpatialGrid,
  policy: PolicyState,
  shuffledOrder: number[],
  rng: () => number,
  netOfferPrices?: Float32Array,
  netAcceptThresholds?: Float32Array,
): void {
  tickTradeCount = 0;

  for (const aIdx of shuffledOrder) {
    const xA = getField(sab, aIdx, AGENT_FIELDS.X);
    const yA = getField(sab, aIdx, AGENT_FIELDS.Y);
    const neighbours = grid.getNeighbours(xA, yA);

    // ── Food trade: A sells food, receives wood ──────────────────────────────
    const foodA = getField(sab, aIdx, AGENT_FIELDS.FOOD);
    const surplusFood = foodA - FOOD_SURVIVAL_BUFFER;

    if (surplusFood > 2) {
      // Find a neighbour with surplus wood
      const woodBuyers: number[] = [];
      for (const bIdx of neighbours) {
        if (bIdx !== aIdx && getField(sab, bIdx, AGENT_FIELDS.WOOD) > WOOD_SURVIVAL_BUFFER) {
          woodBuyers.push(bIdx);
        }
      }

      if (woodBuyers.length > 0) {
        const bIdx = woodBuyers[Math.floor(rng() * woodBuyers.length)];

        const offerPrice = netOfferPrices
          ? netOfferPrices[aIdx]
          : lastFoodPrice * (0.8 + rng() * 0.4);
        const acceptThreshold = netAcceptThresholds
          ? netAcceptThresholds[aIdx]
          : lastFoodPrice * (0.7 + rng() * 0.6);

        if (offerPrice >= acceptThreshold) {
          const woodB = getField(sab, bIdx, AGENT_FIELDS.WOOD);
          // How many food units can B afford given surplus wood at offerPrice (wood/food)?
          const woodDemand = (woodB - WOOD_SURVIVAL_BUFFER) / offerPrice;
          const units = Math.min(surplusFood, woodDemand);

          if (units >= 0.001) {
            const tax = units * offerPrice * policy.taxRate;

            setField(sab, aIdx, AGENT_FIELDS.FOOD,   foodA - units);
            setField(sab, aIdx, AGENT_FIELDS.WOOD,
              getField(sab, aIdx, AGENT_FIELDS.WOOD) + units * offerPrice * (1 - policy.taxRate));

            setField(sab, bIdx, AGENT_FIELDS.WOOD,  woodB - units * offerPrice);
            setField(sab, bIdx, AGENT_FIELDS.FOOD,  getField(sab, bIdx, AGENT_FIELDS.FOOD) + units);

            treasury += tax;
            tradeCount++;
            tickTradeCount++;
            pushFoodPrice(offerPrice);
          }
        }
      }
    }

    // ── Wood trade: A sells wood, receives food ──────────────────────────────
    const woodA = getField(sab, aIdx, AGENT_FIELDS.WOOD);
    const surplusWood = woodA - WOOD_SURVIVAL_BUFFER;

    if (surplusWood > 2) {
      // Find a neighbour with surplus food
      const foodBuyers: number[] = [];
      for (const bIdx of neighbours) {
        if (bIdx !== aIdx && getField(sab, bIdx, AGENT_FIELDS.FOOD) > FOOD_SURVIVAL_BUFFER) {
          foodBuyers.push(bIdx);
        }
      }

      if (foodBuyers.length > 0) {
        const bIdx = foodBuyers[Math.floor(rng() * foodBuyers.length)];

        // Wood offer price in food units — uses lastWoodPrice as anchor
        const offerPrice = netOfferPrices
          ? netOfferPrices[aIdx]
          : lastWoodPrice * (0.8 + rng() * 0.4);
        const acceptThreshold = netAcceptThresholds
          ? netAcceptThresholds[aIdx]
          : lastWoodPrice * (0.7 + rng() * 0.6);

        if (offerPrice >= acceptThreshold) {
          const foodB = getField(sab, bIdx, AGENT_FIELDS.FOOD);
          // How many wood units can B afford given surplus food at offerPrice (food/wood)?
          const foodDemand = (foodB - FOOD_SURVIVAL_BUFFER) / offerPrice;
          const units = Math.min(surplusWood, foodDemand);

          if (units >= 0.001) {
            const tax = units * offerPrice * policy.taxRate;

            setField(sab, aIdx, AGENT_FIELDS.WOOD,  woodA - units);
            setField(sab, aIdx, AGENT_FIELDS.FOOD,
              getField(sab, aIdx, AGENT_FIELDS.FOOD) + units * offerPrice * (1 - policy.taxRate));

            setField(sab, bIdx, AGENT_FIELDS.FOOD,  foodB - units * offerPrice);
            setField(sab, bIdx, AGENT_FIELDS.WOOD,  getField(sab, bIdx, AGENT_FIELDS.WOOD) + units);

            treasury += tax;
            tradeCount++;
            tickTradeCount++;
            pushWoodPrice(offerPrice);
          }
        }
      }
    }
  }
}
