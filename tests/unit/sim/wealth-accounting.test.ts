import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_FIELDS,
  AGENT_STRIDE,
  FOOD_DECAY_RATE_MID,
  INITIAL_ENERGY,
  MAP_HEIGHT,
  MAP_WIDTH,
} from '../../../src/types/constants';
import { getField, initAgent } from '../../../src/sim/agent';
import {
  computeNetWorth,
  updateWealth,
  type WealthValuation,
} from '../../../src/sim/lifecycle';
import { runLending } from '../../../src/sim/bank';
import { defaultPolicy, resetBankState } from '../../../src/sim/policy';
import {
  activateCurrency,
  addToTreasury,
  getMarketStats,
  resetMarket,
} from '../../../src/sim/market';
import { resetLabour } from '../../../src/sim/labour';
import { resetHarvestTick } from '../../../src/sim/harvest';
import { resetHousingTick } from '../../../src/sim/housing';
import { computeStats, resetStats } from '../../../src/sim/stats';
import { seedRng, tick } from '../../../src/sim/tick';
import type { PolicyState } from '../../../src/types/sim';
import type { TileMap } from '../../../src/sim/map';
import { createSimFixture } from '../../helpers/simFixture';

const ACTIVE_VALUATION: WealthValuation = {
  isCurrencyActive: true,
  foodBarterPrice: 17,
  foodMoneyPrice: 5,
  woodMoneyPrice: 4,
};

const INACTIVE_VALUATION: WealthValuation = {
  isCurrencyActive: false,
  foodBarterPrice: 5,
  foodMoneyPrice: 101,
  woodMoneyPrice: 103,
};

function activePolicy(patch: Partial<PolicyState> = {}): PolicyState {
  return {
    ...defaultPolicy(),
    isCurrencyActive: true,
    ...patch,
  };
}

function emptyMap(): TileMap {
  return Array.from(
    { length: MAP_WIDTH * MAP_HEIGHT },
    () => ({ food: 0, wood: 0, foodMax: 10, woodMax: 18 }),
  );
}

beforeEach(() => {
  resetMarket();
  resetLabour();
  resetHarvestTick();
  resetHousingTick();
  resetBankState();
  resetStats();
});

describe('physical decay contract', () => {
  it('applies progressive food decay before currency activation', () => {
    const sab = new Float32Array(AGENT_STRIDE);
    initAgent(sab, 0, 0, 10, 10, 30, 5, INITIAL_ENERGY, 1);
    seedRng(456);

    tick(sab, 1, emptyMap(), defaultPolicy(), 1, 5, 5, 0);

    // Empty-map harvest consumes 0.5 food, then the mid-tier spoilage rate applies.
    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBeCloseTo(
      (30 - 0.5) * FOOD_DECAY_RATE_MID,
    );
  });
});

describe('authoritative net-worth valuation', () => {
  it('values active-currency assets at cash prices and subtracts debt', () => {
    const { sab } = createSimFixture([
      { FOOD: 2, WOOD: 3, CASH: 100, DEBT: 50, HOUSES: 1 },
    ]);

    // cash 100 + food 2*5 + wood 3*4 + house 1*20 - debt 50
    expect(computeNetWorth(sab, 0, ACTIVE_VALUATION)).toBeCloseTo(92);

    updateWealth(sab, 0, ACTIVE_VALUATION);
    expect(getField(sab, 0, AGENT_FIELDS.WEALTH)).toBeCloseTo(92);
  });

  it('uses wood as the inactive-regime resource numeraire', () => {
    const { sab } = createSimFixture([
      { FOOD: 2, WOOD: 3, CASH: 100, DEBT: 50, HOUSES: 1 },
    ]);

    // food 2*5 wood/food + wood 3 + house 1*20 = 33 wood-equivalent units.
    // Cash prices and cash-denominated balances are inactive in this regime.
    expect(computeNetWorth(sab, 0, INACTIVE_VALUATION)).toBeCloseTo(33);
  });

  it('floors negative raw net worth at zero for the canonical Gini measure', () => {
    const { sab } = createSimFixture([
      { FOOD: 0, WOOD: 0, CASH: 1, DEBT: 20, HOUSES: 0 },
    ]);

    expect(computeNetWorth(sab, 0, ACTIVE_VALUATION)).toBe(0);
    updateWealth(sab, 0, ACTIVE_VALUATION);
    expect(getField(sab, 0, AGENT_FIELDS.WEALTH)).toBe(0);
  });

  it('rejects negative or non-finite valuation prices', () => {
    const { sab } = createSimFixture([{ FOOD: 2, WOOD: 3 }]);

    expect(() => computeNetWorth(sab, 0, {
      ...ACTIVE_VALUATION,
      foodMoneyPrice: -1,
    })).toThrow(/invalid price/);
    expect(() => computeNetWorth(sab, 0, {
      ...INACTIVE_VALUATION,
      foodBarterPrice: Number.NaN,
    })).toThrow(/invalid price/);
  });
});

describe('net-worth update timing', () => {
  it('does not count equal cash and debt from loan origination as new net worth', () => {
    const { sab } = createSimFixture([
      { FOOD: 20, WOOD: 5, CASH: 4, DEBT: 0, HOUSES: 1 },
    ]);
    updateWealth(sab, 0, ACTIVE_VALUATION);
    const openingNetWorth = getField(sab, 0, AGENT_FIELDS.WEALTH);

    runLending(
      sab,
      1,
      [0],
      activePolicy(),
      new Float32Array([0.8]),
      ACTIVE_VALUATION.foodMoneyPrice,
      ACTIVE_VALUATION.woodMoneyPrice,
    );
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBeCloseTo(14);
    expect(getField(sab, 0, AGENT_FIELDS.DEBT)).toBeCloseTo(10);

    updateWealth(sab, 0, ACTIVE_VALUATION);
    expect(getField(sab, 0, AGENT_FIELDS.WEALTH)).toBeCloseTo(openingNetWorth);
  });

  it('leaves stored wealth and SimStats current after a complete tick', () => {
    const sab = new Float32Array(AGENT_STRIDE);
    initAgent(sab, 0, 0, 10, 10, 20, 5, INITIAL_ENERGY, 1);
    activateCurrency(sab, 1);
    addToTreasury(10);
    seedRng(123);

    const newCount = tick(
      sab,
      1,
      emptyMap(),
      activePolicy({ redistribution: 'ubi', ubiAmount: 1 }),
      1,
      5,
      5,
      5,
    );

    expect(newCount).toBe(1);
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBeCloseTo(110);
    const market = getMarketStats();
    const endOfTickValuation: WealthValuation = {
      isCurrencyActive: true,
      foodBarterPrice: market.foodPrice,
      foodMoneyPrice: market.foodMoneyPrice,
      woodMoneyPrice: market.woodMoneyPrice,
    };
    const currentNetWorth = computeNetWorth(sab, 0, endOfTickValuation);
    const storedWealth = getField(sab, 0, AGENT_FIELDS.WEALTH);

    expect(storedWealth).toBeCloseTo(currentNetWorth);

    const stats = computeStats(sab, newCount, 1);
    expect(stats.wealthByBracket[0]).toBeCloseTo(currentNetWorth);
    expect(stats.wealthBoundaries).toEqual(new Array(9).fill(0));
  });

  it('keeps monetary net worth after transactions are paused post-bootstrap', () => {
    const sab = new Float32Array(AGENT_STRIDE);
    initAgent(sab, 0, 0, 10, 10, 20, 5, INITIAL_ENERGY, 1);
    activateCurrency(sab, 1);
    const cashAfterBootstrap = getField(sab, 0, AGENT_FIELDS.CASH);
    seedRng(321);

    const newCount = tick(
      sab,
      1,
      emptyMap(),
      defaultPolicy(),
      1,
      5,
      5,
      5,
    );

    expect(newCount).toBe(1);
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBeCloseTo(cashAfterBootstrap);
    const market = getMarketStats();
    expect(getField(sab, 0, AGENT_FIELDS.WEALTH)).toBeCloseTo(computeNetWorth(sab, 0, {
      isCurrencyActive: true,
      foodBarterPrice: market.foodPrice,
      foodMoneyPrice: market.foodMoneyPrice,
      woodMoneyPrice: market.woodMoneyPrice,
    }));

    const cashBeforeReactivation = getField(sab, 0, AGENT_FIELDS.CASH);
    activateCurrency(sab, 1);
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBeCloseTo(cashBeforeReactivation);
  });
});
