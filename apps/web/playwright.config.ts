import { defineConfig, devices } from '@playwright/test';

const port = process.env['E2E_PORT'] ?? '8475';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: 'test-results',
  // One server and one database are shared, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /setup\.e2e\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'firefox',
      testIgnore: /setup\.e2e\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: 'e2e/.auth/admin.json' },
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
