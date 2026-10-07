import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } },
    {
      name: 'small-360x640',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
