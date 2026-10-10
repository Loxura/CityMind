import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimFixture } from '../../helpers/simFixture';

const sources = vi.hoisted(() => ({ foodPrice: 5 }));

vi.mock('../../../src/sim/market', () => ({
  getMarketStats: () => ({
    foodPrice: sources.foodPrice,
    woodPrice: 5,
    tradeCount: 0,
    tickTradeCount: 0,
  }),
}));

vi.mock('../../../src/sim/labour', () => ({
  getLabourStats: () => ({ wageRate: 0, unemploymentRate: 0, totalWages: 0 }),
}));

vi.mock('../../../src/sim/harvest', () => ({
  getHarvestStats: () => ({ foodHarvested: 0 }),
}));

vi.mock('../../../src/sim/housing', () => ({
  getHousingStats: () => ({ rentCollected: 0 }),
}));

import { computeStats, resetStats } from '../../../src/sim/stats';
import { getBankState, resetBankState } from '../../../src/sim/policy';

describe('simulation module state resets', () => {
  beforeEach(() => {
    sources.foodPrice = 5;
    resetStats();
    resetBankState();
  });

  it('clears the previous price used by the inflation tracker', () => {
    const { sab, activeCount } = createSimFixture([{ WEALTH: 25 }]);

    expect(computeStats(sab, activeCount, 60).inflationRate).toBe(0);
    sources.foodPrice = 6;
    expect(computeStats(sab, activeCount, 120).inflationRate).toBeCloseTo(0.2);

    resetStats();

    expect(computeStats(sab, activeCount, 60).inflationRate).toBe(0);
  });

  it('restores aggregate bank state to a fresh-run baseline', () => {
    const bank = getBankState();
    bank.retainedInterestIncome = 100;
    bank.loansOutstanding = 250;
    bank.capitalBuffer = -10;
    bank.cumulativeWriteOffs = 50;
    bank.isSolvent = false;

    resetBankState();

    expect(getBankState()).toEqual({
      retainedInterestIncome: 0,
      loansOutstanding: 0,
      capitalBuffer: 2000,
      cumulativeWriteOffs: 0,
      isSolvent: true,
    });
    expect(getBankState()).not.toBe(bank);
  });
});
