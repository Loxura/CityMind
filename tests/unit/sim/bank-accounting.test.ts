import { beforeEach, describe, expect, it } from 'vitest';
import {
  AGENT_FIELDS,
  AGENT_STRIDE,
  INITIAL_ENERGY,
} from '../../../src/types/constants';
import { getField, initAgent, setField } from '../../../src/sim/agent';
import { closeDeceasedBorrowerDebt, runLending } from '../../../src/sim/bank';
import { getMarketStats, resetMarket } from '../../../src/sim/market';
import { defaultPolicy, getBankState, resetBankState } from '../../../src/sim/policy';
import type { PolicyState } from '../../../src/types/sim';

const BORROWER = 0;
const FOOD_PRICE = 5;
const WOOD_PRICE = 5;

function createBorrower(): Float32Array {
  const sab = new Float32Array(AGENT_STRIDE);
  initAgent(sab, BORROWER, BORROWER, 10, 10, 20, 5, INITIAL_ENERGY, 1);
  return sab;
}

function policy(patch: Partial<PolicyState> = {}): PolicyState {
  return {
    ...defaultPolicy(),
    isCurrencyActive: true,
    ...patch,
  };
}

function runForBorrower(
  sab: Float32Array,
  policyState: PolicyState,
  investSignal = 0,
): void {
  runLending(
    sab,
    1,
    [BORROWER],
    policyState,
    new Float32Array([investSignal]),
    FOOD_PRICE,
    WOOD_PRICE,
  );
}

function removeCollateral(sab: Float32Array): void {
  setField(sab, BORROWER, AGENT_FIELDS.HOUSES, 0);
  setField(sab, BORROWER, AGENT_FIELDS.FOOD, 0);
  setField(sab, BORROWER, AGENT_FIELDS.WOOD, 0);
}

beforeEach(() => {
  resetMarket();
  resetBankState();
});

describe('scheduled debt service accounting', () => {
  it('taxes only interest and treats principal repayment as a balance-sheet reduction', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.DEBT, 100);
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 20);
    const bank = getBankState();
    bank.loansOutstanding = 100;

    // Interest = 100 * (3% base + 2% spread) = 5.
    // Principal amortization = 100 * 2% = 2.
    runForBorrower(sab, policy({ centralBankRate: 0.03, taxRate: 0.25 }));

    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBeCloseTo(13);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBeCloseTo(98);
    expect(bank.loansOutstanding).toBeCloseTo(98);
    expect(bank.capitalBuffer).toBeCloseTo(2003.75);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.retainedInterestIncome).toBeCloseTo(3.75);
    expect(getMarketStats().treasury).toBeCloseTo(1.25);
  });

  it('uses available cash interest-first, then defaults only residual principal', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.DEBT, 100);
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 6);
    removeCollateral(sab);
    const bank = getBankState();
    bank.loansOutstanding = 100;

    // The first 5 cash pays interest; the final 1 pays principal. The unpaid
    // scheduled principal triggers closure of the remaining 99 principal.
    runForBorrower(sab, policy({ centralBankRate: 0.03, taxRate: 0.25 }));

    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBeCloseTo(99);
    expect(bank.retainedInterestIncome).toBeCloseTo(3.75);
    expect(bank.capitalBuffer).toBeCloseTo(1904.75);
    expect(getMarketStats().treasury).toBeCloseTo(1.25);
  });
});

describe('default recovery accounting', () => {
  it('recovers zero-cash principal from collateral without booking income or a writeoff', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.DEBT, 100);
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 0);
    setField(sab, BORROWER, AGENT_FIELDS.HOUSES, 1);
    setField(sab, BORROWER, AGENT_FIELDS.FOOD, 6);
    setField(sab, BORROWER, AGENT_FIELDS.WOOD, 10);
    const bank = getBankState();
    bank.loansOutstanding = 100;

    runForBorrower(sab, policy());

    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.HOUSES)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.FOOD)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.WOOD)).toBe(0);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.capitalBuffer).toBe(2000);
    expect(getMarketStats().treasury).toBe(0);
  });

  it('caps recovery at principal and leaves excess collateral with the borrower', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.DEBT, 10);
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 0);
    setField(sab, BORROWER, AGENT_FIELDS.HOUSES, 1);
    setField(sab, BORROWER, AGENT_FIELDS.FOOD, 0);
    setField(sab, BORROWER, AGENT_FIELDS.WOOD, 0);
    const bank = getBankState();
    bank.loansOutstanding = 10;

    runForBorrower(sab, policy());

    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.HOUSES)).toBeCloseTo(0.5);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.capitalBuffer).toBe(2000);
  });

  it('uses deceased cash against principal before seizing only needed collateral', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.DEBT, 12);
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 5);
    setField(sab, BORROWER, AGENT_FIELDS.HOUSES, 0.5);
    setField(sab, BORROWER, AGENT_FIELDS.FOOD, 0);
    setField(sab, BORROWER, AGENT_FIELDS.WOOD, 0);
    const bank = getBankState();
    bank.loansOutstanding = 12;

    closeDeceasedBorrowerDebt(sab, BORROWER, 0.1, FOOD_PRICE, WOOD_PRICE);

    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.HOUSES)).toBeCloseTo(0.15);
    expect(bank.loansOutstanding).toBe(0);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(bank.capitalBuffer).toBe(2000);
    expect(getMarketStats().treasury).toBe(0);
  });
});

describe('loan origination and current-policy solvency', () => {
  it('originates equal borrower cash and principal without recognizing income', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.CASH, 4);
    setField(sab, BORROWER, AGENT_FIELDS.WEALTH, 100);
    const bank = getBankState();

    runForBorrower(sab, policy(), 0.8);

    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBeCloseTo(14);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBeCloseTo(10);
    expect(bank.loansOutstanding).toBeCloseTo(10);
    expect(bank.capitalBuffer).toBe(2000);
    expect(bank.cumulativeWriteOffs).toBe(0);
    expect(getMarketStats().treasury).toBe(0);
  });

  it('refuses lending when cached solvency is stale under a stricter current threshold', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.WEALTH, 100);
    const bank = getBankState();
    bank.loansOutstanding = 100;
    bank.capitalBuffer = 15;
    bank.isSolvent = true;

    runForBorrower(sab, policy({ reserveRequirement: 0.2 }), 0.8);

    expect(bank.isSolvent).toBe(false);
    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(bank.loansOutstanding).toBe(100);
  });

  it('allows lending when cached insolvency is stale under a looser current threshold', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.WEALTH, 100);
    const bank = getBankState();
    bank.loansOutstanding = 100;
    bank.capitalBuffer = 15;
    bank.isSolvent = false;

    runForBorrower(sab, policy({ reserveRequirement: 0.1 }), 0.8);

    expect(bank.isSolvent).toBe(true);
    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBeCloseTo(10);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBeCloseTo(10);
    expect(bank.loansOutstanding).toBeCloseTo(110);
  });

  it('does not originate a loan that would breach the post-loan capital threshold', () => {
    const sab = createBorrower();
    setField(sab, BORROWER, AGENT_FIELDS.WEALTH, 100);
    const bank = getBankState();
    bank.loansOutstanding = 100;
    bank.capitalBuffer = 10.5;
    bank.isSolvent = true;

    runForBorrower(sab, policy({ reserveRequirement: 0.1 }), 0.8);

    expect(bank.isSolvent).toBe(true);
    expect(getField(sab, BORROWER, AGENT_FIELDS.CASH)).toBe(0);
    expect(getField(sab, BORROWER, AGENT_FIELDS.DEBT)).toBe(0);
    expect(bank.loansOutstanding).toBe(100);
  });
});
