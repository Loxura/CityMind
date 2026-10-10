import { expect, test } from '@playwright/test';

const runPerformanceTest = process.env.CITYMIND_RUN_PERF === '1';
// Allow 10% timing variance around the documented 60 TPS target while keeping
// the local regression gate materially aligned with that target.
const minimumTicksPerSecond = Number(process.env.CITYMIND_MIN_TPS ?? 54);

test.describe('simulation tick rate', () => {
  test.skip(!runPerformanceTest, 'set CITYMIND_RUN_PERF=1 or run npm run test:perf');

  test('sustains the configured performance floor', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');

    const tickValue = page
      .locator('tr')
      .filter({ has: page.getByText('Tick', { exact: true }) })
      .locator('td')
      .nth(1);

    await expect.poll(
      async () => Number(await tickValue.textContent()),
      { message: 'waiting for the performance sample to start', timeout: 120_000 },
    ).toBeGreaterThanOrEqual(60);

    const startTick = Number(await tickValue.textContent());
    const startTime = Date.now();
    const sampleTicks = 300;

    await expect.poll(
      async () => Number(await tickValue.textContent()),
      { message: `waiting for ${sampleTicks} sampled ticks`, timeout: 120_000 },
    ).toBeGreaterThanOrEqual(startTick + sampleTicks);

    const endTick = Number(await tickValue.textContent());
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const measuredTicksPerSecond = (endTick - startTick) / elapsedSeconds;

    expect(
      measuredTicksPerSecond,
      `measured ${measuredTicksPerSecond.toFixed(1)} ticks/sec over ${endTick - startTick} ticks`,
    ).toBeGreaterThanOrEqual(minimumTicksPerSecond);
  });
});
