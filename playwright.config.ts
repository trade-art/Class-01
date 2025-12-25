import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, 'e2e/.env.test') });

/**
 * Playwright configuration for MT5 Platform E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directories - includes specs and tests
  testDir: './e2e',

  // Test file pattern
  testMatch: '**/*.spec.ts',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 2 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'e2e/reports/html', open: 'never' }],
    ['json', { outputFile: 'e2e/reports/results.json' }],
    ['junit', { outputFile: 'e2e/reports/junit.xml' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for the application
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8181',

    // API base URL
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'on-first-retry',

    // Default timeout for actions
    actionTimeout: 15000,

    // Default timeout for navigation
    navigationTimeout: 30000,
  },

  // Global timeout for each test
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  // Output folder for test artifacts
  outputDir: 'e2e/test-results',

  // Configure projects for multi-browser testing
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  // Global setup and teardown
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',

  // Web server configuration for local development
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8181',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
