import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = Boolean(process.env.CI);

/** Browser smoke tests on phone-sized screens (Android = Chromium, iPhone = WebKit). */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // On a retry, record a trace so a failure in CI can be replayed (uploaded as an artifact).
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'on-first-retry' },
  webServer: {
    command: `npm run build:app && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
