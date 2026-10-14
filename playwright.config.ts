import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:4173/electrification-modelling/',
    headless: true,
    launchOptions: process.env.CI
      ? {}
      : {
          executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
          args: ['--no-sandbox'],
        },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    env: { PAGES_BASE: '/electrification-modelling/' },
    url: 'http://127.0.0.1:4173/electrification-modelling/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
