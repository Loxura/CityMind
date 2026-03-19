// Phase 9 — Commercial bank and credit cycles.
//
// One aggregate bank per simulation. BankState lives in policy.ts.
// runLending is called at tick step 8.5: after redistribution, before lifecycle.
//
// Two passes per tick:
//   Pass 1 (all agents): debt service — collect payments, detect defaults.
//   Pass 2 (shuffled order): new lending — issue loans to eligible agents.

import { AGENT_FIELDS, HOUSE_ASSET_VALUE } from '../types/constants';
import { getField, setField } from './agent';
import { getBankState } from './policy';
import { addToTreasury } from './market';
import type { BankState } from './policy';
import type { PolicyState } from '../types/sim';

// No activation delay — lending starts as soon as currency is active.
// Early loan cap (WEALTH*0.1, max 10) limits initial credit explosion without
// training neuroevolution to suppress invest_signal.
export function resetLendingActiveTick(): void {
  // kept for call-site compatibility; no-op now that the delay is removed
}

function checkSolvency(bank: BankState, reserveRequirement: number): void {
  bank.isSolvent =
    bank.loansOutstanding === 0 ||
    bank.capitalBuffer / bank.loansOutstanding >= reserveRequirement;
}

function handleDefault(
  sab: Float32Array,
  idx: number,
  bank: BankState,
  outstandingDebt: number,
  foodPrice: number,
  woodPrice: number,
  reserveRequirement: number,
): void {
  // Step 1: seize house collateral — value credited to bank before loan writeoff.
  const housesVal = getField(sab, idx, AGENT_FIELDS.HOUSES) * HOUSE_ASSET_VALUE;
  setField(sab, idx, AGENT_FIELDS.HOUSES, 0);
  bank.capitalBuffer += housesVal;

  // Steps 2–3: forfeit agent assets to cover the uncovered portion.
  // outstandingDebt and housesVal are independent of each other in the bank ledger;
  // uncovered is used only to determine how much food/wood to seize from the agent.
  let uncovered = Math.max(0, outstandingDebt - housesVal);

  if (uncovered > 0 && foodPrice > 0) {
    const foodToSeize = uncovered / foodPrice;
    const currentFood = getField(sab, idx, AGENT_FIELDS.FOOD);
    const actualFoodSeized = Math.min(currentFood, foodToSeize);
    setField(sab, idx, AGENT_FIELDS.FOOD, currentFood - actualFoodSeized);
    uncovered -= actualFoodSeized * foodPrice;
  }

  if (uncovered > 0) {
    const woodPrice_ = foodPrice > 0 ? foodPrice : 1; // safe fallback
    void woodPrice_; // woodPrice passed separately
    const woodToSeize = uncovered / (woodPrice > 0 ? woodPrice : 1);
    const currentWood = getField(sab, idx, AGENT_FIELDS.WOOD);
    setField(sab, idx, AGENT_FIELDS.WOOD, Math.max(0, currentWood - woodToSeize));
  }

  // Steps 4–7: close the loan on the bank's books.
  // capitalBuffer: +housesVal already applied above; -outstandingDebt here.
  // Net effect: capitalBuffer += housesVal - outstandingDebt (correct loss accounting).
  setField(sab, idx, AGENT_FIELDS.DEBT, 0);
  setField(sab, idx, AGENT_FIELDS.CASH, 0);
  bank.nonPerformingLoans += outstandingDebt;
  bank.capitalBuffer      -= outstandingDebt;
  bank.loansOutstanding   -= outstandingDebt;

  checkSolvency(bank, reserveRequirement);
}

export function runLending(
  sab: Float32Array,
  n: number,
  order: number[],
  policy: PolicyState,
  investSignals: Float32Array,
  foodPrice: number,
  woodPrice: number,
): void {
  // Fix A: banking without currency has no price anchor — skip entirely.
  if (!policy.isCurrencyActive) return;

  const bank = getBankState();
  let treasuryDelta = 0;

  // ── Pass 1: debt service (all agents with outstanding loans) ─────────────────
  for (let i = 0; i < n; i++) {
    const debt = getField(sab, i, AGENT_FIELDS.DEBT);
    if (debt < 0.001) continue;

    // Per-tick repayment: base rate + 2% spread. Floor at 0.001 so debt always clears.
    const rate    = policy.centralBankRate + 0.02;
    const payment = Math.max(Math.min(debt * rate, debt), 0.001);

    let newDebt = debt - payment;
    if (newDebt < 0.01) newDebt = 0;
    setField(sab, i, AGENT_FIELDS.DEBT, newDebt);

    // Reduce outstanding by the amount repaid this tick (debt - newDebt).
    bank.loansOutstanding -= (debt - newDebt);

    const newCash = getField(sab, i, AGENT_FIELDS.CASH) - payment;

    if (newCash < 0) {
      // Default: agent cannot service debt. Run collateral cascade.
      // outstandingDebt = newDebt (remaining principal after this tick's reduction).
      handleDefault(sab, i, bank, newDebt, foodPrice, woodPrice, policy.reserveRequirement);
      // CASH already zeroed inside handleDefault.
    } else {
      setField(sab, i, AGENT_FIELDS.CASH, newCash);
      treasuryDelta           += payment * policy.taxRate;
      bank.deposits           += payment * (1 - policy.taxRate);
    }
  }

  if (treasuryDelta > 0) addToTreasury(treasuryDelta);

  // ── Pass 2: new lending (eligible agents in shuffled order) ──────────────────
  for (const idx of order) {
    if (investSignals[idx] <= 0.7)                      continue; // net not signalling
    if (getField(sab, idx, AGENT_FIELDS.DEBT) !== 0)    continue; // one loan at a time
    if (getField(sab, idx, AGENT_FIELDS.WEALTH) <= 10)   continue; // Fix D: exclude bottom-decile subsistence agents
    if (!bank.isSolvent)                                 continue; // bank frozen

    const loanAmount = Math.min(getField(sab, idx, AGENT_FIELDS.WEALTH) * 0.1, 10);
    setField(sab, idx, AGENT_FIELDS.CASH, getField(sab, idx, AGENT_FIELDS.CASH) + loanAmount);
    setField(sab, idx, AGENT_FIELDS.DEBT, loanAmount);
    bank.loansOutstanding += loanAmount;

    // Re-check solvency after each issuance — bank may hit limit mid-pass.
    checkSolvency(bank, policy.reserveRequirement);
  }
}

// Called from stats.ts every STATS_INTERVAL ticks.
export function getBankStats(gdp: number): {
  creditToGdp:          number;
  bankSolvency:         number;
  bankLoansOutstanding: number;
  bankCapitalBuffer:    number;
} {
  const bank = getBankState();
  const creditToGdp  = gdp > 0 ? Math.min(bank.loansOutstanding / gdp, 5.0) : 0;
  const bankSolvency = Math.min(bank.capitalBuffer / Math.max(bank.loansOutstanding, 1), 1.0);
  return {
    creditToGdp,
    bankSolvency,
    bankLoansOutstanding: bank.loansOutstanding,
    bankCapitalBuffer:    bank.capitalBuffer,
  };
}
