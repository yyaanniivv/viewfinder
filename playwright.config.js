import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'https://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node simple-server.cjs',
    url: 'https://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    ignoreHTTPSErrors: true,
  },
  // Each test gets a fresh browser context (isolated storage, cookies, etc.)
  // but shares the browser process
});