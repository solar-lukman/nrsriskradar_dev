import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// package.json sets "type": "module", so __dirname is not defined here.
const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright config for RiskRadar UAT / RBAC e2e suite.
 *
 * Test user credentials are supplied via environment (see e2e/.env.example).
 * Base URL defaults to the local Vite dev server (bun run dev on :8080).
 */
export default defineConfig({
  testDir: path.join(dirname, 'tests'),
  testMatch: /.*\.(spec|setup)\.ts$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/report/html', open: 'never' }],
    ['json', { outputFile: 'e2e/report/results.json' }],
    [path.join(dirname, 'reporters/uat-report.ts')],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    // Data seeding — provisions per-case fixtures. Opt-in via --project=seed.
    {
      name: 'seed',
      testMatch: /seed\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Default project — runs the full suite (auth, negative RBAC, landing, sidebar)
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Fast role-permutation smoke matrix (routes / sidebar / CTAs per role).
    // Opt-in: --project=role-smoke (npm run test:e2e:smoke).
    {
      name: 'role-smoke',
      testMatch: /role-smoke\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },


    // Cross-browser coverage for role-landing + sidebar-access only
    // (auth + negative-rbac stay on chromium to keep runtime reasonable)
    {
      name: 'firefox-rbac',
      use: { ...devices['Desktop Firefox'] },
      grep: /UAT-AUTH-(01|05|06)/,
    },
    {
      name: 'webkit-rbac',
      use: { ...devices['Desktop Safari'] },
      grep: /UAT-AUTH-(01|05|06)/,
    },

    // Responsive viewport coverage for role-landing + sidebar-access
    {
      name: 'tablet-rbac',
      use: { ...devices['iPad (gen 7)'] },
      grep: /UAT-AUTH-(01|05|06)/,
    },
    {
      name: 'mobile-rbac',
      use: { ...devices['Pixel 5'] },
      grep: /UAT-AUTH-(01|05|06)/,
    },
  ],
});
