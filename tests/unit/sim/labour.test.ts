import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_FIELDS,
  AGENT_STRIDE,
  INITIAL_ENERGY,
  WOOD_SURVIVAL_BUFFER,
} from '../../../src/types/constants';
import { getField, initAgent, setField } from '../../../src/sim/agent';
import { SpatialGrid } from '../../../src/sim/grid';
import { getLabourStats, resetLabour, runLabourMarket } from '../../../src/sim/labour';
import { defaultPolicy } from '../../../src/sim/policy';
import type { PolicyState } from '../../../src/types/sim';

const EMPLOYER = 0;
const WORKER = 1;
const HIRE_LABOUR = 3;
const SELL_LABOUR = 2;
const FOOD_VALUE_PRICE = 5;
const EXPECTED_MRP = 3;

function setupMarket(policyPatch: Partial<PolicyState> = {}) {
  const sab = new Float32Array(2 * AGENT_STRIDE);
  initAgent(sab, EMPLOYER, 0, 10, 10, 20, 20, INITIAL_ENERGY, 1);
  initAgent(sab, WORKER, 1, 10, 10, 20, 5, INITIAL_ENERGY, 0);

  const grid = new SpatialGrid();
  grid.register(EMPLOYER, 10, 10);
  grid.register(WORKER, 10, 10);

  const primaryActions = new Uint8Array([HIRE_LABOUR, SELL_LABOUR]);
  const reservationWages = new Float32Array([0, 0]);
  const policy = { ...defaultPolicy(), ...policyPatch };

  return { sab, grid, primaryActions, reservationWages, policy };
}

function run(setup: ReturnType<typeof setupMarket>): number {
  return runLabourMarket(
    setup.sab,
    2,
    setup.grid,
    setup.policy,
    [EMPLOYER, WORKER],
    setup.primaryActions,
    setup.reservationWages,
    FOOD_VALUE_PRICE,
  );
}

beforeEach(() => resetLabour());

describe('runLabourMarket wage settlement', () => {
  it('settles pre-currency wages in wood and conserves gross value', () => {
    const setup = setupMarket({ taxRate: 0.2, isCurrencyActive: false });
    const employerCash = getField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH);
    const workerCash = getField(setup.sab, WORKER, AGENT_FIELDS.CASH);

    const treasury = run(setup);

    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.WOOD)).toBeCloseTo(17);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.WOOD)).toBeCloseTo(7.4);
    expect(treasury).toBeCloseTo(0.6);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH)).toBe(employerCash);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.CASH)).toBe(workerCash);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(1);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.LABOUR_HIRED)).toBe(1);
  });

  it('settles currency wages in cash and leaves wood unchanged', () => {
    const setup = setupMarket({ taxRate: 0.25, isCurrencyActive: true });
    setField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH, 10);
    setField(setup.sab, WORKER, AGENT_FIELDS.CASH, 1);
    const employerWood = getField(setup.sab, EMPLOYER, AGENT_FIELDS.WOOD);
    const workerWood = getField(setup.sab, WORKER, AGENT_FIELDS.WOOD);

    const treasury = run(setup);

    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH)).toBeCloseTo(7);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.CASH)).toBeCloseTo(3.25);
    expect(treasury).toBeCloseTo(0.75);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.WOOD)).toBe(employerWood);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.WOOD)).toBe(workerWood);
  });

  it('treats minimum wage as an eligibility floor instead of inflating the MRP bid', () => {
    const setup = setupMarket({ minWage: EXPECTED_MRP + 0.5 });

    expect(run(setup)).toBe(0);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.LABOUR_HIRED)).toBe(0);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
    expect(getLabourStats().unemploymentRate).toBe(1);
  });

  it('rejects a wage when the employer cannot fund the gross amount', () => {
    const setup = setupMarket();
    setField(
      setup.sab,
      EMPLOYER,
      AGENT_FIELDS.WOOD,
      WOOD_SURVIVAL_BUFFER + EXPECTED_MRP - 0.01,
    );

    expect(run(setup)).toBe(0);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.LABOUR_HIRED)).toBe(0);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
  });

  it('rejects a currency wage when employer cash is below the gross amount', () => {
    const setup = setupMarket({ isCurrencyActive: true });
    setField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH, EXPECTED_MRP - 0.01);

    expect(run(setup)).toBe(0);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.CASH)).toBeCloseTo(EXPECTED_MRP - 0.01);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
  });

  it('rejects a worker reservation wage above MRP', () => {
    const setup = setupMarket();
    setup.reservationWages[WORKER] = EXPECTED_MRP + 0.01;

    expect(run(setup)).toBe(0);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.LABOUR_HIRED)).toBe(0);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(0);
  });

  it('accepts exact minimum, reservation, and affordability boundaries', () => {
    const setup = setupMarket({ minWage: EXPECTED_MRP, taxRate: 0.5 });
    setup.reservationWages[WORKER] = EXPECTED_MRP;
    setField(
      setup.sab,
      EMPLOYER,
      AGENT_FIELDS.WOOD,
      WOOD_SURVIVAL_BUFFER + EXPECTED_MRP,
    );

    expect(run(setup)).toBeCloseTo(1.5);
    expect(getField(setup.sab, EMPLOYER, AGENT_FIELDS.WOOD)).toBeCloseTo(WOOD_SURVIVAL_BUFFER);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.WOOD)).toBeCloseTo(6.5);
    expect(getField(setup.sab, WORKER, AGENT_FIELDS.LABOUR_SOLD)).toBe(1);
  });
});
