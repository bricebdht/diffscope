import { test, expect } from '@playwright/test';

const GENERATE_DIFFS = !!process.env.GENERATE_DIFFS;

/**
 * Report shapes Diffscope must handle beyond one diff per test:
 * - a snapshot name also used in dashboard.spec.ts ("header.png"), which must
 *   stay a separate diff;
 * - a test failing several soft screenshot assertions, which must give one diff each.
 */
async function injectCss(page: import('@playwright/test').Page, css: string) {
  if (!GENERATE_DIFFS) return;
  await page.addStyleTag({ content: css });
  await page.waitForTimeout(100);
}

test('header snapshot with the same name as in dashboard.spec', async ({ page }) => {
  await page.goto('/');
  await injectCss(page, '.header h1 { color: #f59e0b !important; }');
  await expect(page.locator('.header')).toHaveScreenshot('header.png');
});

test('several soft screenshot failures in one test', async ({ page }) => {
  await page.goto('/');
  await injectCss(page, `
    .stat-card .value { color: #f59e0b !important; }
    .chart-card { border-color: #f59e0b !important; }
  `);
  await expect.soft(page.locator('.stats')).toHaveScreenshot('soft-stats.png');
  await expect.soft(page.locator('.chart-card')).toHaveScreenshot('soft-chart.png');
});
