import type { PolicyState } from '../types/sim';

// All fields zeroed / default for Phase 1.
// Policy changes from the main thread are applied here on the next tick.
export function defaultPolicy(): PolicyState {
  return {
    taxRate:             0,
    redistribution:      'none',
    ubiAmount:           0,
    minWage:             0,
    landPolicy:          'free',
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
