import type { PolicyState } from '../types/sim';

// Phase 9: aggregate bank state. One bank per simulation, not per-agent.
// Lives here alongside PolicyState so worker.ts can reset both together.
export interface BankState {
  retainedInterestIncome: number;  // cumulative after-tax interest retained this run
  loansOutstanding:       number;  // total principal currently lent out
  capitalBuffer:          number;  // bank equity; absorbs unrecovered principal
  cumulativeWriteOffs:    number;  // cumulative unrecovered principal this run
  isSolvent:              boolean; // legacy name: meets the configured capital threshold
}

let _bank: BankState = {
  retainedInterestIncome: 0,
  loansOutstanding:       0,
  capitalBuffer:          2000,
  cumulativeWriteOffs:    0,
  isSolvent:              true,
};

export function getBankState(): BankState { return _bank; }

// PolicyState.reserveRequirement is retained as the public field name for
// compatibility, but it is used as a capital-adequacy threshold: equity divided
// by outstanding principal. A bank with negative equity remains insolvent even
// when it has no loans on its books.
export function recomputeBankSolvency(capitalAdequacyThreshold: number): void {
  const threshold = Math.max(0, capitalAdequacyThreshold);
  _bank.isSolvent =
    _bank.capitalBuffer >= 0 &&
    (_bank.loansOutstanding === 0 ||
      _bank.capitalBuffer / _bank.loansOutstanding >= threshold);
}

export function resetBankState(): void {
  _bank = {
    retainedInterestIncome: 0,
    loansOutstanding:       0,
    capitalBuffer:          2000,
    cumulativeWriteOffs:    0,
    isSolvent:              true,
  };
}

// All fields zeroed / default for Phase 1.
// Policy changes from the main thread are applied here on the next tick.
export function defaultPolicy(): PolicyState {
  return {
    taxRate:             0,
    redistribution:      'none',
    ubiAmount:           0,
    minWage:             0,
    landPolicy:          'free',
    isCurrencyActive:    false,
    centralBankRate:     0,
    moneySupplyGrowth:   0,
    reserveRequirement:  0.10,
    capitalGainsTax:     0,
    marginLendingLimit:  0,
  };
}

export function applyPolicyPatch(
  current: PolicyState,
  patch: Partial<PolicyState>,
): PolicyState {
  const next = { ...current, ...patch };
  recomputeBankSolvency(next.reserveRequirement);
  return next;
}
