import type { PolicyState } from '../types/sim';

// Phase 9: aggregate bank state. One bank per simulation, not per-agent.
// Lives here alongside PolicyState so worker.ts can reset both together.
export interface BankState {
  deposits:           number;  // cumulative repayments received as bank income
  loansOutstanding:   number;  // total principal currently lent out
  capitalBuffer:      number;  // bank's own equity (absorbs losses on default)
  nonPerformingLoans: number;  // accumulated default principal this run
  isSolvent:          boolean; // capitalBuffer/loansOutstanding >= reserveRequirement
                               // always true when loansOutstanding === 0
}

let _bank: BankState = {
  deposits:           0,
  loansOutstanding:   0,
  capitalBuffer:      500,
  nonPerformingLoans: 0,
  isSolvent:          true,
};

export function getBankState(): BankState { return _bank; }

export function resetBankState(): void {
  _bank = {
    deposits:           0,
    loansOutstanding:   0,
    capitalBuffer:      500,
    nonPerformingLoans: 0,
    isSolvent:          true,
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
    reserveRequirement:  0,
    capitalGainsTax:     0,
    marginLendingLimit:  0,
  };
}

export function applyPolicyPatch(
  current: PolicyState,
  patch: Partial<PolicyState>,
): PolicyState {
  return { ...current, ...patch };
}
