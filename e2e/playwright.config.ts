import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  workers: 4,
  reporter: ['list', ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-CH',
  },
});