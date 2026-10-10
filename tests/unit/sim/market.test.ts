import { beforeEach, describe, expect, it } from 'vitest';
import { AGENT_FIELDS, AGENT_STRIDE } from '../../../src/types/constants';
import { getField, initAgent } from '../../../src/sim/agent';
import { SpatialGrid } from '../../../src/sim/grid';
import { getMarketStats, resetMarket, runMarket } from '../../../src/sim/market';
import { defaultPolicy } from '../../../src/sim/policy';

const OFFER_PRICE = 4;

function setupAgents(
  sellerFood: number,
  sellerWood: number,
  buyerFood: number,
  buyerWood: number,
): { sab: Float32Array; grid: SpatialGrid } {
  const sab = new Float32Array(2 * AGENT_STRIDE);
  initAgent(sab, 0, 0, 10, 10, sellerFood, sellerWood, 100);
  initAgent(sab, 1, 1, 10, 10, buyerFood, buyerWood, 100);

  const grid = new SpatialGrid(50, 50, 5);
  grid.register(0, 10, 10);
  grid.register(1, 10, 10);
  return { sab, grid };
}

function runSingleSeller(
  sab: Float32Array,
  grid: SpatialGrid,
  sellerThreshold: number,
  buyerThreshold: number,
): void {
  runMarket(
    sab,
    2,
    grid,
    defaultPolicy(),
    [0],
    () => 0,
    new Float32Array([OFFER_PRICE, OFFER_PRICE]),
    new Float32Array([sellerThreshold, buyerThreshold]),
  );
}

describe('runMarket acceptance thresholds', () => {
  beforeEach(resetMarket);

  it('executes a food sale when the buyer accepts even if the seller threshold would reject', () => {
    const { sab, grid } = setupAgents(15, 2, 10, 3);

    runSingleSeller(sab, grid, 6, 3);

    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBeCloseTo(14.75);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBeCloseTo(3);
    expect(getField(sab, 1, AGENT_FIELDS.FOOD)).toBeCloseTo(10.25);
    expect(getField(sab, 1, AGENT_FIELDS.WOOD)).toBeCloseTo(2);
    expect(getMarketStats()).toMatchObject({
      foodPrice: OFFER_PRICE,
      woodPrice: 5,
      tickTradeCount: 1,
    });
  });

  it('rejects a food sale when the buyer rejects even if the seller threshold would accept', () => {
    const { sab, grid } = setupAgents(15, 2, 10, 3);

    runSingleSeller(sab, grid, 3, 6);

    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBeCloseTo(15);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBeCloseTo(2);
    expect(getField(sab, 1, AGENT_FIELDS.FOOD)).toBeCloseTo(10);
    expect(getField(sab, 1, AGENT_FIELDS.WOOD)).toBeCloseTo(3);
    expect(getMarketStats()).toMatchObject({
      foodPrice: 5,
      woodPrice: 5,
      tickTradeCount: 0,
    });
  });

  it('executes a wood sale when the buyer accepts even if the seller threshold would reject', () => {
    const { sab, grid } = setupAgents(10, 6, 15, 2);

    runSingleSeller(sab, grid, 6, 3);

    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBeCloseTo(15);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBeCloseTo(4.75);
    expect(getField(sab, 1, AGENT_FIELDS.FOOD)).toBeCloseTo(10);
    expect(getField(sab, 1, AGENT_FIELDS.WOOD)).toBeCloseTo(3.25);
    expect(getMarketStats()).toMatchObject({
      foodPrice: 5,
      woodPrice: OFFER_PRICE,
      tickTradeCount: 1,
    });
  });

  it('rejects a wood sale when the buyer rejects even if the seller threshold would accept', () => {
    const { sab, grid } = setupAgents(10, 6, 15, 2);

    runSingleSeller(sab, grid, 3, 6);

    expect(getField(sab, 0, AGENT_FIELDS.FOOD)).toBeCloseTo(10);
    expect(getField(sab, 0, AGENT_FIELDS.WOOD)).toBeCloseTo(6);
    expect(getField(sab, 1, AGENT_FIELDS.FOOD)).toBeCloseTo(15);
    expect(getField(sab, 1, AGENT_FIELDS.WOOD)).toBeCloseTo(2);
    expect(getMarketStats()).toMatchObject({
      foodPrice: 5,
      woodPrice: 5,
      tickTradeCount: 0,
    });
  });
});
