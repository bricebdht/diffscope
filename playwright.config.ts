import { defineConfig, devices } from '@playwright/test';

// The app under test is a static build served by `vite preview`. E2E_APP_DIR points it at
// another build (scripts/e2e.mjs uses it to capture the reference screenshots from main's build).
const appDir = process.env.E2E_APP_DIR || 'dist';
const port = 4173;

export default defineConfig({
  testDir: './e2e',
  // References are generated from the base branch on every run, never committed.
  snapshotPathTemplate: process.env.E2E_SNAPSHOT_DIR
    ? `${process.env.E2E_SNAPSHOT_DIR}/{testFilePath}/{arg}{ext}`
    : '{testDir}/../e2e-snapshots/{testFilePath}/{arg}{ext}',
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT_DIR || 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT_DIR || 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx vite preview --outDir "${appDir}" --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
