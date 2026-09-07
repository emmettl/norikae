import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4184/norikae/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4184 --strictPort',
    url: 'http://127.0.0.1:4184/norikae/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
