// Phase 4 — Labour market matching.
// Bilateral: employers (HIRE_LABOUR action, land > 0) bid; workers (SELL_LABOUR action) accept
// if wage >= reservation wage AND wage >= policy.minWage.
// Tax collected on each wage payment. Runs before goods market each tick.

import { AGENT_FIELDS, WOOD_SURVIVAL_BUFFER } from '../types/constants';
import { getField, setField } from './agent';
import type { SpatialGrid } from './grid';
import type { PolicyState } from '../types/sim';

// Net output dim 1 action codes
const SELL_LABOUR = 2;
const HIRE_LABOUR = 3;

const MAX_WORKERS_PER_EMPLOYER = 5;
const WAGE_HISTORY_SIZE = 100;

const wageRingBuf = new Float32Array(WAGE_HISTORY_SIZE);
let wageRingHead  = 0;
let wageRingCount = 0;
let lastWageRate  = 0;

let _unemployedCount    = 0;
let _labourSeekerCount  = 0;
let _totalWagesThisTick = 0;
let _wageTxCount        = 0;

export function getLabourStats(): {
  wageRate: number;
  unemploymentRate: number;
  totalWages: number;
  wageTxCount: number;
} {
  return {
    wageRate:         lastWageRate,
    unemploymentRate: _labourSeekerCount > 0 ? _unemployedCount / _labourSeekerCount : 0,
    totalWages:       _totalWagesThisTick,
    wageTxCount:      _wageTxCount,
  };
}

export function resetLabour(): void {
  wageRingBuf.fill(0);
  wageRingHead        = 0;
  wageRingCount       = 0;
  lastWageRate        = 0;
  _unemployedCount    = 0;
  _labourSeekerCount  = 0;
  _totalWagesThisTick = 0;
  _wageTxCount        = 0;
}

function pushWage(wage: number): void {
  wageRingBuf[wageRingHead] = wage;
  wageRingHead = (wageRingHead + 1) % WAGE_HISTORY_SIZE;
  if (wageRingCount < WAGE_HISTORY_SIZE) wageRingCount++;
  let sum = 0;
  const len = Math.min(wageRingCount, WAGE_HISTORY_SIZE);
  for (let i = 0; i < len; i++) sum += wageRingBuf[i];
  lastWageRate = sum / len;
}

// Run labour market for one tick. Returns treasury delta (wage taxes collected).
// Must be called AFTER grid is populated (post-harvest) and BEFORE runMarket.
export function runLabourMarket(
  sab: Float32Array,
  _eligibleCount: number,
  grid: SpatialGrid,
  policy: PolicyState,
  eligibleOrder: number[],
  primaryActions: Uint8Array,
  reservationWages: Float32Array,
  foodValuePrice: number,
): number {
  _totalWagesThisTick = 0;
  _wageTxCount        = 0;

  // Reset per-tick labour fields for eligible survivors only. Dead agents are
  // compacted away later and must not re-enter labour accounting.
  for (const idx of eligibleOrder) {
    setField(sab, idx, AGENT_FIELDS.LABOUR_SOLD,  0);
    setField(sab, idx, AGENT_FIELDS.LABOUR_HIRED, 0);
  }

  // Count labour seekers for unemployment rate
  _labourSeekerCount = 0;
  for (const idx of eligibleOrder) {
    if (primaryActions[idx] === SELL_LABOUR) _labourSeekerCount++;
  }

  let treasuryDelta = 0;

  for (const eIdx of eligibleOrder) {
    if (primaryActions[eIdx] !== HIRE_LABOUR) continue;
    if (getField(sab, eIdx, AGENT_FIELDS.LAND) <= 0) continue;
    if (getField(sab, eIdx, AGENT_FIELDS.LABOUR_HIRED) >= MAX_WORKERS_PER_EMPLOYER) continue;

    const xE = getField(sab, eIdx, AGENT_FIELDS.X);
    const yE = getField(sab, eIdx, AGENT_FIELDS.Y);
    const neighbours = grid.getNeighbours(xE, yE);

    // MRP: marginal revenue product of labour = foodValuePrice * A * α * Land^γ.
    // foodValuePrice is wood/food in barter and cash/food once currency is active.
    // The minimum wage is an eligibility floor, not permission to bid above MRP.
    const land = Math.max(1, getField(sab, eIdx, AGENT_FIELDS.LAND));
    const wageOffer = foodValuePrice * 1.0 * 0.6 * Math.pow(land, 0.4);
    if (wageOffer < policy.minWage) continue;

    // Currency-off wages settle in wood; currency-on wages settle in cash.
    // Employers must fund the full gross wage. Barter employers retain the wood
    // survival buffer, matching the goods market's protected inventory floor.
    const settlementField = policy.isCurrencyActive ? AGENT_FIELDS.CASH : AGENT_FIELDS.WOOD;
    const settlementBalance = getField(sab, eIdx, settlementField);
    const availableFunds = policy.isCurrencyActive
      ? settlementBalance
      : Math.max(0, settlementBalance - WOOD_SURVIVAL_BUFFER);
    if (availableFunds < wageOffer) continue;

    for (const wIdx of neighbours) {
      if (wIdx === eIdx) continue;
      if (primaryActions[wIdx] !== SELL_LABOUR) continue;
      if (getField(sab, wIdx, AGENT_FIELDS.LABOUR_SOLD) !== 0) continue;

      const reservation = reservationWages[wIdx];
      if (wageOffer < reservation) continue;

      const tax = wageOffer * policy.taxRate;
      const netWage = wageOffer - tax;

      setField(sab, eIdx, settlementField, settlementBalance - wageOffer);
      setField(sab, wIdx, settlementField,
        getField(sab, wIdx, settlementField) + netWage);
      setField(sab, wIdx, AGENT_FIELDS.LABOUR_SOLD, 1);
      setField(sab, eIdx, AGENT_FIELDS.LABOUR_HIRED,
        getField(sab, eIdx, AGENT_FIELDS.LABOUR_HIRED) + 1);

      treasuryDelta       += tax;
      _totalWagesThisTick += wageOffer;
      _wageTxCount++;
      pushWage(wageOffer);
      break; // employer hired one worker this pass; move to next employer
    }
  }

  // Count unemployed: labour seekers who didn't get hired
  _unemployedCount = 0;
  for (const idx of eligibleOrder) {
    if (primaryActions[idx] === SELL_LABOUR && getField(sab, idx, AGENT_FIELDS.LABOUR_SOLD) === 0) {
      _unemployedCount++;
    }
  }

  return treasuryDelta;
}
