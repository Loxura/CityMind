// Phase 4 — Labour market matching.
// Bilateral: employers (HIRE_LABOUR action, land > 0) bid; workers (SELL_LABOUR action) accept
// if wage >= reservation wage AND wage >= policy.minWage.
// Tax collected on each wage payment. Runs before goods market each tick.

import { AGENT_FIELDS } from '../types/constants';
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
  n: number,
  grid: SpatialGrid,
  policy: PolicyState,
  shuffledOrder: number[],
  primaryActions: Uint8Array,
  reservationWages: Float32Array,
  lastFoodPrice: number,
): number {
  _totalWagesThisTick = 0;
  _wageTxCount        = 0;

  // Reset per-tick labour fields for all agents
  for (let i = 0; i < n; i++) {
    setField(sab, i, AGENT_FIELDS.LABOUR_SOLD,  0);
    setField(sab, i, AGENT_FIELDS.LABOUR_HIRED, 0);
  }

  // Count labour seekers for unemployment rate
  _labourSeekerCount = 0;
  for (let i = 0; i < n; i++) {
    if (primaryActions[i] === SELL_LABOUR) _labourSeekerCount++;
  }

  let treasuryDelta = 0;

  for (const eIdx of shuffledOrder) {
    if (primaryActions[eIdx] !== HIRE_LABOUR) continue;
    if (getField(sab, eIdx, AGENT_FIELDS.LAND) <= 0) continue;
    if (getField(sab, eIdx, AGENT_FIELDS.LABOUR_HIRED) >= MAX_WORKERS_PER_EMPLOYER) continue;

    const xE = getField(sab, eIdx, AGENT_FIELDS.X);
    const yE = getField(sab, eIdx, AGENT_FIELDS.Y);
    const neighbours = grid.getNeighbours(xE, yE);

    // MRP: marginal revenue product of labour = foodPrice * A * α * Land^γ
    // Cobb-Douglas partial: dOutput/dL ≈ A * α * Land^γ  (at L≈1)
    const land = Math.max(1, getField(sab, eIdx, AGENT_FIELDS.LAND));
    const mrp  = lastFoodPrice * 1.0 * 0.6 * Math.pow(land, 0.4);
    const wageOffer = Math.max(mrp, policy.minWage);

    for (const wIdx of neighbours) {
      if (wIdx === eIdx) continue;
      if (primaryActions[wIdx] !== SELL_LABOUR) continue;
      if (getField(sab, wIdx, AGENT_FIELDS.LABOUR_SOLD) !== 0) continue;

      const reservation = reservationWages[wIdx];
      if (wageOffer < reservation) continue;
      if (wageOffer < policy.minWage) continue;

      const tax = wageOffer * policy.taxRate;
      setField(sab, wIdx, AGENT_FIELDS.LABOUR_SOLD, 1);
      setField(sab, wIdx, AGENT_FIELDS.CASH,
        getField(sab, wIdx, AGENT_FIELDS.CASH) + wageOffer * (1 - policy.taxRate));
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
  for (let i = 0; i < n; i++) {
    if (primaryActions[i] === SELL_LABOUR && getField(sab, i, AGENT_FIELDS.LABOUR_SOLD) === 0) {
      _unemployedCount++;
    }
  }

  return treasuryDelta;
}
