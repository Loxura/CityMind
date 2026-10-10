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
import { getBankState, recomputeBankSolvency } from './policy';
import { addToTreasury } from './market';
import type { PolicyState } from '../types/sim';

export const PRINCIPAL_AMORTIZATION_RATE = 0.02;
export const MIN_PRINCIPAL_INSTALLMENT = 0.001;
export const INTEREST_RATE_SPREAD = 0.02;
// Fixed cash liquidation mark used until a house sale-price series exists.
export const HOUSE_COLLATERAL_CASH_VALUE = HOUSE_ASSET_VALUE;

const LEDGER_EPSILON = 1e-9;

// No activation delay — lending starts as soon as currency is active.
// Early loan cap (WEALTH*0.1, max 10) limits initial credit explosion without
// training neuroevolution to suppress invest_signal.
export function resetLendingActiveTick(): void {
  // kept for call-site compatibility; no-op now that the delay is removed
}

function handleDefault(
  sab: Float32Array,
  idx: number,
  residualPrincipal: number,
  foodPrice: number,
  woodPrice: number,
  reserveRequirement: number,
): void {
  const bank = getBankState();
  const principalToClose = Math.max(0, residualPrincipal);
  let unrecoveredPrincipal = principalToClose;

  // Collateral replaces the defaulted loan asset; it does not create bank income.
  // Seize only the fractional quantity needed to cover the remaining principal.
  const seizeCollateral = (field: number, unitValue: number): void => {
    if (unrecoveredPrincipal <= LEDGER_EPSILON || unitValue <= 0) return;

    const currentUnits = Math.max(0, getField(sab, idx, field));
    const unitsToSeize = Math.min(currentUnits, unrecoveredPrincipal / unitValue);
    if (unitsToSeize <= 0) return;

    setField(sab, idx, field, currentUnits - unitsToSeize);
    const recovered = Math.min(unrecoveredPrincipal, unitsToSeize * unitValue);
    unrecoveredPrincipal = Math.max(0, unrecoveredPrincipal - recovered);
  };

  seizeCollateral(AGENT_FIELDS.HOUSES, HOUSE_COLLATERAL_CASH_VALUE);
  seizeCollateral(AGENT_FIELDS.FOOD, foodPrice);
  seizeCollateral(AGENT_FIELDS.WOOD, woodPrice);

  const writeoff = Math.min(principalToClose, Math.max(0, unrecoveredPrincipal));
  setField(sab, idx, AGENT_FIELDS.DEBT, 0);
  bank.loansOutstanding = Math.max(0, bank.loansOutstanding - principalToClose);
  bank.cumulativeWriteOffs += writeoff;
  bank.capitalBuffer -= writeoff;

  recomputeBankSolvency(reserveRequirement);
}

// Close a deceased borrower's full remaining principal immediately. This uses
// the normal collateral/default cascade but deliberately performs no scheduled
// payment, tax collection, deposit credit, or new-loan evaluation.
export function closeDeceasedBorrowerDebt(
  sab: Float32Array,
  idx: number,
  reserveRequirement: number,
  foodPrice: number,
  woodPrice: number,
): void {
  const bank = getBankState();
  const openingPrincipal = getField(sab, idx, AGENT_FIELDS.DEBT);
  if (openingPrincipal <= 0) return;

  // A deceased borrower's cash settles principal first. Any estate cash above
  // the debt remains on the agent record for lifecycle/estate handling.
  const openingCash = Math.max(0, getField(sab, idx, AGENT_FIELDS.CASH));
  const principalPaid = Math.min(openingCash, openingPrincipal);
  const residualPrincipal = Math.max(0, openingPrincipal - principalPaid);

  setField(sab, idx, AGENT_FIELDS.CASH, openingCash - principalPaid);
  setField(sab, idx, AGENT_FIELDS.DEBT, residualPrincipal);
  bank.loansOutstanding = Math.max(0, bank.loansOutstanding - principalPaid);
  recomputeBankSolvency(reserveRequirement);

  if (residualPrincipal > LEDGER_EPSILON) {
    handleDefault(sab, idx, residualPrincipal, foodPrice, woodPrice, reserveRequirement);
  } else {
    setField(sab, idx, AGENT_FIELDS.DEBT, 0);
  }
}

export function runLending(
  sab: Float32Array,
  _eligibleCount: number,
  eligibleOrder: number[],
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
  for (const idx of eligibleOrder) {
    const openingPrincipal = getField(sab, idx, AGENT_FIELDS.DEBT);
    if (openingPrincipal <= 0) continue;

    const interestRate = Math.max(0, policy.centralBankRate + INTEREST_RATE_SPREAD);
    const scheduledInterest = openingPrincipal * interestRate;
    const scheduledPrincipal = Math.min(
      openingPrincipal,
      Math.max(openingPrincipal * PRINCIPAL_AMORTIZATION_RATE, MIN_PRINCIPAL_INSTALLMENT),
    );
    const scheduledService = scheduledInterest + scheduledPrincipal;
    const openingCash = Math.max(0, getField(sab, idx, AGENT_FIELDS.CASH));

    // Cash waterfall: interest first, then principal. Only actual payments move
    // through the ledger; an unpaid scheduled amount triggers default below.
    const paidInterest = Math.min(openingCash, scheduledInterest);
    const cashAfterInterest = openingCash - paidInterest;
    const paidPrincipal = Math.min(cashAfterInterest, scheduledPrincipal);
    const totalPaid = paidInterest + paidPrincipal;
    const residualPrincipal = Math.max(0, openingPrincipal - paidPrincipal);

    setField(sab, idx, AGENT_FIELDS.CASH, openingCash - totalPaid);
    setField(sab, idx, AGENT_FIELDS.DEBT, residualPrincipal);
    bank.loansOutstanding = Math.max(0, bank.loansOutstanding - paidPrincipal);

    const interestTax = paidInterest * Math.min(1, Math.max(0, policy.taxRate));
    const retainedInterest = paidInterest - interestTax;
    treasuryDelta += interestTax;
    bank.retainedInterestIncome += retainedInterest;
    bank.capitalBuffer += retainedInterest;
    recomputeBankSolvency(policy.reserveRequirement);

    if (openingCash + LEDGER_EPSILON < scheduledService) {
      handleDefault(
        sab,
        idx,
        residualPrincipal,
        foodPrice,
        woodPrice,
        policy.reserveRequirement,
      );
    } else if (residualPrincipal <= LEDGER_EPSILON) {
      setField(sab, idx, AGENT_FIELDS.DEBT, 0);
    }
  }

  if (treasuryDelta > 0) addToTreasury(treasuryDelta);

  // ── Pass 2: new lending (eligible agents in shuffled order) ──────────────────
  for (const idx of eligibleOrder) {
    // The ratio can change through debt service, defaults, retained interest, or
    // policy updates; refresh it immediately before every credit decision.
    recomputeBankSolvency(policy.reserveRequirement);
    if (investSignals[idx] <= 0.7)                      continue; // net not signalling
    if (getField(sab, idx, AGENT_FIELDS.DEBT) !== 0)    continue; // one loan at a time
    if (getField(sab, idx, AGENT_FIELDS.WEALTH) <= 10)   continue; // Fix D: exclude bottom-decile subsistence agents
    if (!bank.isSolvent)                                 continue; // bank frozen

    const loanAmount = Math.min(getField(sab, idx, AGENT_FIELDS.WEALTH) * 0.1, 10);
    const threshold = Math.max(0, policy.reserveRequirement);
    const projectedLoans = bank.loansOutstanding + loanAmount;
    const meetsProjectedRequirement =
      bank.capitalBuffer >= 0 &&
      (projectedLoans === 0 || threshold === 0 || bank.capitalBuffer / projectedLoans >= threshold);
    if (!meetsProjectedRequirement) continue;

    setField(sab, idx, AGENT_FIELDS.CASH, getField(sab, idx, AGENT_FIELDS.CASH) + loanAmount);
    setField(sab, idx, AGENT_FIELDS.DEBT, loanAmount);
    bank.loansOutstanding += loanAmount;

    // Re-check solvency after each issuance — bank may hit limit mid-pass.
    recomputeBankSolvency(policy.reserveRequirement);
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
