import { test, expect } from '@playwright/test';

const GENERATE_DIFFS = !!process.env.GENERATE_DIFFS;

/**
 * Inject subtle CSS changes to produce visual diffs against baselines.
 * Each test injects different modifications so that diffs are varied and interesting.
 */
async function injectDiffs(page: import('@playwright/test').Page, variant: string) {
  if (!GENERATE_DIFFS) return;

  const variants: Record<string, string> = {
    colors: `
      :root {
        --primary: #8b5cf6 !important;
        --green: #10b981 !important;
        --red: #f43f5e !important;
      }
    `,
    spacing: `
      .stat-card { padding: 24px 20px !important; }
      .stats { gap: 20px !important; }
      .header { padding: 16px 24px !important; }
      .feature-card { padding: 24px !important; }
    `,
    typography: `
      .header h1 { font-size: 18px !important; letter-spacing: 0.5px; }
      .stat-card .value { font-size: 32px !important; }
      .stat-card .label { font-size: 11px !important; text-transform: uppercase; letter-spacing: 1px; }
      th { font-size: 12px !important; text-transform: uppercase; letter-spacing: 0.5px; }
    `,
    borders: `
      .stat-card { border-radius: 8px !important; border-width: 2px !important; }
      .chart-card { border-radius: 8px !important; }
      .table-card { border-radius: 8px !important; }
      .feature-card { border-radius: 8px !important; border-width: 2px !important; }
      .btn { border-radius: 4px !important; }
    `,
    layout: `
      .stats { grid-template-columns: repeat(2, 1fr) !important; }
      .cards-grid { grid-template-columns: repeat(2, 1fr) !important; }
      .chart-bars { height: 200px !important; }
    `,
    chart: `
      .chart-bar:nth-child(1) { height: 40% !important; }
      .chart-bar:nth-child(2) { height: 55% !important; }
      .chart-bar:nth-child(3) { height: 85% !important; }
      .chart-bar:nth-child(4) { height: 60% !important; }
      .chart-bar:nth-child(5) { height: 95% !important; }
      .chart-bar:nth-child(6) { height: 70% !important; }
      .chart-bar:nth-child(7) { height: 30% !important; }
    `,
  };

  await page.addStyleTag({ content: variants[variant] || '' });
  // Let repaint settle
  await page.waitForTimeout(100);
}

// ---------------------------------------------------------------------------
// Full page snapshots
// ---------------------------------------------------------------------------

test.describe('full-pages', () => {
  test('full dashboard', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'colors');
    await expect(page).toHaveScreenshot('dashboard-full.png', { fullPage: true });
  });

  test('dashboard with layout changes', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'layout');
    await expect(page).toHaveScreenshot('dashboard-layout.png', { fullPage: true });
  });
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

test.describe('header', () => {
  test('header bar', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'typography');
    await expect(page.locator('.header')).toHaveScreenshot('header.png');
  });

  test('navigation links', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'colors');
    await expect(page.locator('.nav')).toHaveScreenshot('nav-links.png');
  });
});

// ---------------------------------------------------------------------------
// Stats cards
// ---------------------------------------------------------------------------

test.describe('stats', () => {
  test('stats row', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'spacing');
    await expect(page.locator('.stats')).toHaveScreenshot('stats-row.png');
  });

  test('stat card - users', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'borders');
    await expect(page.locator('.stat-card').first()).toHaveScreenshot('stat-users.png');
  });

  test('stat card - revenue', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'typography');
    await expect(page.locator('.stat-card').nth(1)).toHaveScreenshot('stat-revenue.png');
  });
});

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

test.describe('chart', () => {
  test('weekly activity chart', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'chart');
    await expect(page.locator('.chart-card')).toHaveScreenshot('chart-weekly.png');
  });

  test('chart bars only', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'chart');
    await expect(page.locator('.chart-bars')).toHaveScreenshot('chart-bars.png');
  });
});

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

test.describe('table', () => {
  test('orders table', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'typography');
    await expect(page.locator('.table-card')).toHaveScreenshot('table-orders.png');
  });

  test('table header row', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'spacing');
    await expect(page.locator('thead')).toHaveScreenshot('table-header.png');
  });

  test('status badges', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'colors');
    await expect(page.locator('tbody')).toHaveScreenshot('table-body.png');
  });
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

test.describe('buttons', () => {
  test('action buttons row', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'borders');
    await expect(page.locator('.actions')).toHaveScreenshot('buttons-row.png');
  });
});

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

test.describe('features', () => {
  test('feature cards grid', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'spacing');
    await expect(page.locator('.cards-grid')).toHaveScreenshot('features-grid.png');
  });

  test('feature card - analytics', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'borders');
    await expect(page.locator('.feature-card').first()).toHaveScreenshot('feature-analytics.png');
  });

  test('feature card - security', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'colors');
    await expect(page.locator('.feature-card').nth(1)).toHaveScreenshot('feature-security.png');
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

test.describe('footer', () => {
  test('footer bar', async ({ page }) => {
    await page.goto('/');
    await injectDiffs(page, 'typography');
    await expect(page.locator('.footer')).toHaveScreenshot('footer.png');
  });
});
