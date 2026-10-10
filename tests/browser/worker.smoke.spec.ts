import { expect, test } from '@playwright/test';

test('boots the simulation worker and renders emitted stats', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'CITYMIND — Phase 9' })).toBeVisible();
  expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');

  const tickValue = page
    .locator('tr')
    .filter({ has: page.getByText('Tick', { exact: true }) })
    .locator('td')
    .nth(1);

  await expect.poll(
    async () => Number(await tickValue.textContent()),
    { message: 'waiting for the Sim Worker to emit stats', timeout: 120_000 },
  ).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();

  // A stats message may already be in flight when PAUSE is posted. Let it settle,
  // then require the displayed tick to remain stable across another sample.
  await page.waitForTimeout(1_000);
  const pausedTick = Number(await tickValue.textContent());
  await page.waitForTimeout(1_000);
  expect(Number(await tickValue.textContent())).toBe(pausedTick);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(
    async () => Number(await tickValue.textContent()),
    { message: 'waiting for the resumed worker to advance', timeout: 120_000 },
  ).toBeGreaterThan(pausedTick);

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('Initialising simulation…')).toBeVisible();
  await expect.poll(
    async () => Number(await tickValue.textContent()),
    { message: 'waiting for the reset worker to emit fresh stats', timeout: 120_000 },
  ).toBeGreaterThan(0);

  await expect(page.getByText('Worker error:', { exact: false })).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
