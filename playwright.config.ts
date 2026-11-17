import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  outputDir: '.context/playwright',
  reporter: [['list']],
  workers: 1,
  use: {
    baseURL: process.env.AIRPORT_TEST_URL ?? 'http://127.0.0.1:4317',
    browserName: 'chromium',
    ...(process.env.AIRPORT_BROWSER_PATH
      ? { launchOptions: { executablePath: process.env.AIRPORT_BROWSER_PATH } }
      : {}),
    reducedMotion: 'reduce',
  },
});
