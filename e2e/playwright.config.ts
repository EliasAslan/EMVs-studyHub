import { defineConfig } from '@playwright/test';

// Windows dev machines usually have Edge but not Chromium; CI installs Chromium.
const defaultChannel = process.platform === 'win32' ? 'msedge' : undefined;
const channel = process.env.PLAYWRIGHT_CHANNEL ?? defaultChannel;

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-CH',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});