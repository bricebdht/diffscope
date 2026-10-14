import { expect, test } from '@playwright/test';
import { cards, loadDemo, modal, waitForVisibleImages } from './helpers';

test('empty state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('No report loaded')).toBeVisible();
  await expect(page).toHaveScreenshot('empty-state.png');
});

test.describe('with the sample report', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('grid', async ({ page }) => {
    await waitForVisibleImages(page);
    await expect(page).toHaveScreenshot('grid.png');
  });

  test('grid with reviewed sections', async ({ page }) => {
    await cards(page).first().click();
    await page.keyboard.press('a');
    await page.keyboard.press('x');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Approved/ }).filter({ hasText: 'item' }).click();
    await page.getByRole('button', { name: /Approved/ }).filter({ hasText: 'item' }).scrollIntoViewIfNeeded();
    await waitForVisibleImages(page);
    await expect(page).toHaveScreenshot('grid-reviewed.png');
  });

  test('comparison modal, 3-panel', async ({ page }) => {
    await cards(page).first().click();
    await expect(modal(page)).toBeVisible();
    await waitForVisibleImages(page);
    await expect(page).toHaveScreenshot('modal-3-panel.png');
  });

  test('comparison modal, slider', async ({ page }) => {
    await cards(page).first().click();
    await modal(page).getByRole('button', { name: 'Slider' }).click();
    await waitForVisibleImages(page);
    await expect(page).toHaveScreenshot('modal-slider.png');
  });
});
