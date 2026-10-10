import { beforeEach, describe, expect, it } from 'vitest';
import { computeGini, computeStats, resetStats } from '../../../src/sim/stats';
import { resetBankState } from '../../../src/sim/policy';
import { resetHarvestTick } from '../../../src/sim/harvest';
import { resetHousingTick } from '../../../src/sim/housing';
import { createSimFixture } from '../../helpers/simFixture';

describe('simulation statistics', () => {
  beforeEach(() => {
    resetStats();
    resetBankState();
    resetHarvestTick();
    resetHousingTick();
  });

  it('computes the specified Gini coefficient for equal and concentrated wealth', () => {
    expect(computeGini(new Float32Array([10, 10, 10, 10]), 4)).toBe(0);
    expect(computeGini(new Float32Array([0, 0, 0, 100]), 4)).toBe(0.75);
  });

  it('only includes the active portion of the wealth buffer', () => {
    const wealths = new Float32Array([0, 10, 1_000_000]);

    expect(computeGini(wealths, 2)).toBe(0.5);
  });

  it('aggregates agent fields and rank-based wealth buckets into SimStats', () => {
    const { sab, activeCount } = createSimFixture([
      { FOOD: 10, WOOD: 2, CASH: 4, HOUSES: 1, WEALTH: 16, ROLE: 0 },
      { FOOD: 30, WOOD: 8, CASH: 6, HOUSES: 3, WEALTH: 44, ROLE: 5 },
    ]);

    const stats = computeStats(sab, activeCount, 60);

    expect(stats).toMatchObject({
      tick: 60,
      population: 2,
      avgFood: 20,
      avgWood: 5,
      avgCash: 5,
      avgHouses: 2,
      foodPrice: 5,
      woodPrice: 5,
      tradeCount: 0,
      tickTradeCount: 0,
      roleCounts: {
        farmer: 1,
        builder: 0,
        merchant: 0,
        banker: 0,
        capitalist: 0,
        worker: 1,
      },
    });
    expect(stats.gini).toBeCloseTo(0.233333, 5);
    expect(stats.wealthBrackets).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(stats.wealthByBracket).toEqual([16, 0, 0, 0, 0, 44, 0, 0, 0, 0]);
    expect(stats.wealthBoundaries).toEqual([16, 16, 16, 16, 44, 44, 44, 44, 44]);
  });
});
