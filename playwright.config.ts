import { defineConfig, devices } from '@playwright/test';

const artifactRoot = '/tmp/citymind-playwright';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  outputDir: `${artifactRoot}/test-results`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${artifactRoot}/report`, open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
