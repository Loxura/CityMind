// Phase 2 stub — tax rate is 0, treasury accumulates but is never redistributed.
// Full implementation (5 redistribution models) is Phase 4.

// Treasury is tracked in market.ts for Phase 2.
// This module exists so tick.ts can import a no-op redistribute() without change in Phase 4.

import type { PolicyState } from '../types/sim';

export function redistribute(
  _treasury: number,
  _policy: PolicyState,
): number {
  // Phase 4+: implement redistribution models here.
  // For now, treasury accumulates untouched and is returned unchanged.
  return _treasury;
}
