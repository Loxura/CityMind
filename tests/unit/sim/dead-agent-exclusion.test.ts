import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_FIELDS,
  AGENT_STRIDE,
  INITIAL_ENERGY,
  MAP_HEIGHT,
  MAP_WIDTH,
} from '../../../src/types/constants';
import { getField, initAgent, setField } from '../../../src/sim/agent';
import {
  activateCurrency,
  addToTreasury,
  getMarketStats,
  resetMarket,
  runEmergencyMarket,
  runMarket,
} from '../../../src/sim/market';
import { SpatialGrid } from '../../../src/sim/grid';
import { defaultPolicy, getBankState, resetBankState } from '../../../src/sim/policy';
import { getLabourStats, resetLabour, runLabourMarket } from '../../../src/sim/labour';
import { applyShelterDrain, resetHousingTick, runHousingRent } from '../../../src/sim/housing';
import { redistribute } from '../../../src/sim/tax';
import { closeDeceasedBorrowerDebt, runLending } from '../../../src/sim/bank';
import { seedRng, tick } from '../../../src/sim/tick';
import type { TileMap } from '../../../src/sim/map';

function createAgents(count: number): Float32Array {
  const sab = new Float32Array(count * AGENT_STRIDE);
  for (let idx = 0; idx < count; idx++) {
    initAgent(sab, idx, idx, 10, 10, 20, 5, INITIAL_ENERGY, 1);
  }
  return sab;
}

function registerEligible(
  sab: Float32Array,
  eligibleOrder: readonly number[],
): SpatialGrid {
  const grid = new SpatialGrid();
  for (const idx of eligibleOrder) {
    grid.register(
      idx,
      getField(sab, idx, AGENT_FIELDS.X),
      getField(sab, idx, AGENT_FIELDS.Y),
    );
  }
  return grid;
}

function oneTileMap(): TileMap {
  return [{ food: 0, wood: 0, foodMax: 10, woodMax: 18 }];
}

beforeEach(() => {
  resetMarket();
  resetLabour();
  resetHousingTick();
  resetBankState();
});

describe('post-harvest survivor eligibility', () => {
  it('excludes dead emergency buyers and sellers through the alive order and grid', () => {
    const sab = createAgents(4);
    const deadBuyer = 0;
    const aliveBuyer = 1;
    const deadSeller = 2;
    const aliveSeller = 3;
    setField(sab, deadBuyer, AGENT_FIELDS.FOOD, 5);
    setField(sab, aliveBuyer, AGENT_FIELDS.FOOD, 5);
    setField(sab, deadSeller, AGENT_FIELDS.FOOD, 20);
    setField(sab, aliveSeller, AGENT_FIELDS.FOOD, 20);
    activateCurrency(sab, 4);

    const aliveOrder = [aliveSeller, aliveBuyer];
    runEmergencyMarket(
      sab,
      aliveOrder.length,
      registerEligible(sab, aliveOrder),
      { ...defaultPolicy(), isCurrencyActive: true },
      aliveOrder,
      () => 0,
    );

    expect(getField(sab, deadBuyer, AGENT_FIELDS.FOOD)).toBe(5);
    expect(getField(sab, deadBuyer, AGENT_FIELDS.CASH)).toBe(25);
    expect(getField(sab, deadSeller, AGENT_FIELDS.FOOD)).toBe(20);
    expect(getField(sab, deadSeller, AGENT_FIELDS.CASH)).toBe(100);
    expect(getField(sab, aliveBuyer, AGENT_FIELDS.FOOD)).toBe(6);
    expect(getField(sab, aliveBuyer, AGENT_FIELDS.CASH)).toBe(20);
    expect(getField(sab, aliveSeller, AGENT_FIELDS.FOOD)).toBe(19);
    expect(getField(sab, aliveSeller, AGENT_FIELDS.CASH)).toBe(105);
    expect(getMarketStats().emergencyTradeCount).toBe(1);
  });

  it('excludes dead labour participants from matching, resets, and unemployment', () => {
    const sab = createAgents(3);
    const deadWorker = 0;
    const aliveWorker = 1;
    const employer = 2;
    const sellLabour = 2;
    const hireLabour = 3;
    setField(sab, deadWorker, AGENT_FIELDS.WOOD, 5);
    setField(sab, aliveWorker, AGENT_FIELDS.WOOD, 5);
    setField(sab, employer, AGENT_FIELDS.WOOD, 20);
    const primaryActions = new Uint8Array([sellLabour, sellLabour, hireLabour]);
    const reservationWages = new Float32Array(3);
    const aliveOrder = [employer, aliveWorker];

    runLabourMarket(
      sab,
      aliveOrder.length,
      registerEligible(sab, aliveOrder),
      defaultPolicy(),
      aliveOrder,
      primaryActions,
      reservationWages,
      5,
    );

    expect(getField(sab, deadWorker, AGENT_FIELDS.WOOD)).toBe(5);
    expect(getField(sab, deadWorker, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
    expect(getField(sab, aliveWorker, AGENT_FIELDS.WOOD)).toBe(8);
    expect(getField(sab, aliveWorker, AGENT_FIELDS.LABOUR_SOLD)).toBe(1);
    expect(getLabourStats()).toMatchObject({
      unemploymentRate: 0,
      wageTxCount: 1,
    });
  });

  it('excludes dead goods-market counterparties', () => {
    const sab = createAgents(4);
    const deadSeller = 0;
    const aliveSeller = 1;
    const deadBuyer = 2;
    const aliveBuyer = 3;
    for (const idx of [deadSeller, aliveSeller]) {
      setField(sab, idx, AGENT_FIELDS.FOOD, 15);
      setField(sab, idx, AGENT_FIELDS.WOOD, 2);
    }
    for (const idx of [deadBuyer, aliveBuyer]) {
      setField(sab, idx, AGENT_FIELDS.FOOD, 10);
      setField(sab, idx, AGENT_FIELDS.WOOD, 3);
    }
    const aliveOrder = [aliveSeller, aliveBuyer];
    const offerPrices = new Float32Array([4, 4, 4, 4]);
    const acceptThresholds = new Float32Array([3, 3, 3, 3]);

    runMarket(
      sab,
      aliveOrder.length,
      registerEligible(sab, aliveOrder),
      defaultPolicy(),
      aliveOrder,
      () => 0,
      offerPrices,
      acceptThresholds,
    );

    expect(getField(sab, deadSeller, AGENT_FIELDS.FOOD)).toBe(15);
    expect(getField(sab, deadSeller, AGENT_FIELDS.WOOD)).toBe(2);
    expect(getField(sab, deadBuyer, AGENT_FIELDS.FOOD)).toBe(10);
    expect(getField(sab, deadBuyer, AGENT_FIELDS.WOOD)).toBe(3);
    expect(getField(sab, aliveSeller, AGENT_FIELDS.FOOD)).toBeCloseTo(14.75);
    expect(getField(sab, aliveBuyer, AGENT_FIELDS.FOOD)).toBeCloseTo(10.25);
    expect(getMarketStats().tickTradeCount).toBe(1);
  });

  it('excludes dead landlords and renters from housing and shelter processing', () => {
    const sab = createAgents(4);
    const deadLandlord = 0;
    const aliveLandlord = 1;
    const deadRenter = 2;
    const aliveRenter = 3;
    setField(sab, deadLandlord, AGENT_FIELDS.HOUSES, 3);
    setField(sab, aliveLandlord, AGENT_FIELDS.HOUSES, 3);
    setField(sab, deadRenter, AGENT_FIELDS.CASH, 5);
    setField(sab, aliveRenter, AGENT_FIELDS.CASH, 5);
    const aliveOrder = [aliveLandlord, aliveRenter];
    const sheltered = new Uint8Array(4);

    runHousingRent(
      sab,
      aliveOrder.length,
      registerEligible(sab, aliveOrder),
      defaultPolicy(),
      aliveOrder,
      sheltered,
    );
    for (const idx of aliveOrder) applyShelterDrain(sab, idx, sheltered);

    expect(getField(sab, deadLandlord, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, deadRenter, AGENT_FIELDS.CASH)).toBe(5);
    expect(getField(sab, deadRenter, AGENT_FIELDS.ENERGY)).toBe(INITIAL_ENERGY);
    expect(getField(sab, aliveLandlord, AGENT_FIELDS.CASH)).toBe(1);
    expect(getField(sab, aliveRenter, AGENT_FIELDS.CASH)).toBe(4);
    expect(getField(sab, aliveRenter, AGENT_FIELDS.ENERGY)).toBe(INITIAL_ENERGY);
  });

  it('allocates UBI only across survivors', () => {
    const sab = createAgents(3);
    const dead = 0;
    const aliveOrder = [2, 1];
    const remaining = redistribute(
      12,
      { ...defaultPolicy(), redistribution: 'ubi', ubiAmount: 1 },
      sab,
      aliveOrder,
      oneTileMap(),
      5,
      5,
    );

    expect(remaining).toBe(0);
    expect(getField(sab, dead, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, 1, AGENT_FIELDS.CASH)).toBe(6);
    expect(getField(sab, 2, AGENT_FIELDS.CASH)).toBe(6);
  });

  it('computes targeted welfare thresholds and payouts from survivors only', () => {
    const sab = createAgents(6);
    const dead = 0;
    const survivorWealth = [10, 20, 30, 40, 50];
    survivorWealth.forEach((wealth, offset) => {
      setField(sab, offset + 1, AGENT_FIELDS.WEALTH, wealth);
    });
    setField(sab, dead, AGENT_FIELDS.WEALTH, 0);
    const aliveOrder = [5, 1, 4, 2, 3];

    const remaining = redistribute(
      100,
      { ...defaultPolicy(), redistribution: 'targeted_welfare' },
      sab,
      aliveOrder,
      oneTileMap(),
      5,
      5,
    );

    expect(remaining).toBe(0);
    expect(getField(sab, dead, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, 1, AGENT_FIELDS.CASH)).toBe(50);
    expect(getField(sab, 2, AGENT_FIELDS.CASH)).toBe(50);
    expect(getField(sab, 3, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, 4, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, 5, AGENT_FIELDS.CASH)).toBe(0);
  });

  it('excludes dead agents from lending debt service and new-credit passes', () => {
    const sab = createAgents(3);
    const deadDebtor = 0;
    const aliveDebtor = 1;
    const deadApplicant = 2;
    setField(sab, deadDebtor, AGENT_FIELDS.DEBT, 10);
    setField(sab, deadDebtor, AGENT_FIELDS.CASH, 100);
    setField(sab, aliveDebtor, AGENT_FIELDS.DEBT, 10);
    setField(sab, aliveDebtor, AGENT_FIELDS.CASH, 100);
    setField(sab, deadApplicant, AGENT_FIELDS.WEALTH, 100);
    const bank = getBankState();
    bank.loansOutstanding = 20;

    runLending(
      sab,
      1,
      [aliveDebtor],
      { ...defaultPolicy(), isCurrencyActive: true },
      new Float32Array([0.8, 0.5, 0.8]),
      5,
      5,
    );

    expect(getField(sab, deadDebtor, AGENT_FIELDS.DEBT)).toBe(10);
    expect(getField(sab, deadDebtor, AGENT_FIELDS.CASH)).toBe(100);
    expect(getField(sab, deadApplicant, AGENT_FIELDS.DEBT)).toBe(0);
    expect(getField(sab, deadApplicant, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, aliveDebtor, AGENT_FIELDS.DEBT)).toBeCloseTo(9.8);
    expect(getField(sab, aliveDebtor, AGENT_FIELDS.CASH)).toBeCloseTo(99.6);
    expect(bank.loansOutstanding).toBeCloseTo(19.8);
  });
});

describe('deceased borrower cleanup', () => {
  it('closes full debt from existing cash before collateral and without tax', () => {
    const sab = createAgents(1);
    setField(sab, 0, AGENT_FIELDS.DEBT, 12);
    setField(sab, 0, AGENT_FIELDS.CASH, 100);
    setField(sab, 0, AGENT_FIELDS.HOUSES, 0.5);
    setField(sab, 0, AGENT_FIELDS.FOOD, 1);
    setField(sab, 0, AGENT_FIELDS.WOOD, 5);
    const bank = getBankState();
    bank.loansOutstanding = 12;

    closeDeceasedBorrowerDebt(sab, 0, 0.1, 5, 5);

    expect(getField(sab, 0, AGENT_FIELDS.DEBT)).toBe(0);
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBe(88);
    expect(getField(sab, 0, AGENT_FIELDS.HOUSES)).toBe(0.5);
    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBe(1);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBe(5);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.capitalBuffer).toBe(2000);
    expect(bank.retainedInterestIncome).toBe(0);
    expect(bank.isSolvent).toBe(true);
    expect(getMarketStats().treasury).toBe(0);
  });

  it('values collateral with currency prices rather than current barter inputs', () => {
    const sab = createAgents(1);
    setField(sab, 0, AGENT_FIELDS.FOOD, 0);
    setField(sab, 0, AGENT_FIELDS.WOOD, 20);
    setField(sab, 0, AGENT_FIELDS.ENERGY, 0);
    setField(sab, 0, AGENT_FIELDS.DEBT, 50);
    activateCurrency(sab, 1); // bootstraps both cash prices at 5
    const bank = getBankState();
    bank.loansOutstanding = 50;
    const tiles: TileMap = Array.from(
      { length: MAP_WIDTH * MAP_HEIGHT },
      () => ({ food: 0, wood: 0, foodMax: 10, woodMax: 18 }),
    );

    const newCount = tick(
      sab,
      1,
      tiles,
      { ...defaultPolicy(), isCurrencyActive: true },
      1,
      97, // deliberately different barter inputs
      99,
      5,
    );

    expect(newCount).toBe(0);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBeCloseTo(10);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.capitalBuffer).toBe(2000);
  });
});

describe('birth-tick eligibility', () => {
  it('does not include a newborn in redistribution, shelter drain, or other subsystems', () => {
    const sab = new Float32Array(2 * AGENT_STRIDE);
    initAgent(sab, 0, 7, 10, 10, 70, 5, INITIAL_ENERGY, 1);
    setField(sab, 0, AGENT_FIELDS.AGE, 19);
    const tiles: TileMap = Array.from(
      { length: MAP_WIDTH * MAP_HEIGHT },
      () => ({ food: 0, wood: 0, foodMax: 10, woodMax: 18 }),
    );
    seedRng(123);
    addToTreasury(10);

    const newCount = tick(
      sab,
      1,
      tiles,
      { ...defaultPolicy(), redistribution: 'ubi', ubiAmount: 1 },
      1,
      5,
      5,
      0,
    );

    expect(newCount).toBe(2);
    expect(getField(sab, 0, AGENT_FIELDS.CASH)).toBe(10);
    expect(getField(sab, 1, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, 1, AGENT_FIELDS.ENERGY)).toBe(INITIAL_ENERGY);
    expect(getField(sab, 1, AGENT_FIELDS.AGE)).toBe(0);
    expect(getField(sab, 1, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
    expect(getField(sab, 1, AGENT_FIELDS.LABOUR_HIRED)).toBe(0);
  });
});
