import { defineConfig, devices } from '@playwright/test';

const consolePort = Number(process.env.PLAYWRIGHT_CONSOLE_PORT ?? '4173');

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  retries: 1,
  workers: 1, // serial — infrastructure commands must not race
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://127.0.0.1:${consolePort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${consolePort}`,
    port: consolePort,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
