import { expect, type Page } from '@playwright/test';

export const DEMO_TOTAL = 23;
export const DEMO_ZIP = 'public/demo/playwright-report.zip';

/** Opens the app and loads the sample report from the empty state. */
export async function loadDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with a sample report' }).click();
  await expect(page.getByText(`0/${DEMO_TOTAL} reviewed`)).toBeVisible();
}

/** Diff cards in the grid (each one shows its screenshot thumbnail). */
export function cards(page: Page) {
  return page.locator('button:has(> div > img)');
}

/** The comparison modal, located by its comment field. */
export function modal(page: Page) {
  return page.locator('.fixed.inset-0').filter({ has: page.getByPlaceholder('Comment (optional)...') });
}

/** Waits until every image visible in the viewport has decoded, so screenshots are stable. */
export async function waitForVisibleImages(page: Page) {
  await page.waitForFunction(() =>
    [...document.images]
      .filter(img => {
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      })
      .every(img => img.complete && img.naturalWidth > 0),
  );
}
