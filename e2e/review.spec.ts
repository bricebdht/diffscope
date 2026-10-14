import { expect, test } from '@playwright/test';
import { DEMO_TOTAL, DEMO_ZIP, cards, loadDemo, modal } from './helpers';

test.beforeEach(async ({ page }) => {
  await loadDemo(page);
});

test('loads the sample report with every diff pending', async ({ page }) => {
  await expect(cards(page)).toHaveCount(DEMO_TOTAL);
  await expect(page.getByText(`${DEMO_TOTAL} pending`)).toBeVisible();
  await expect(page.getByText("Claude's summary:")).toBeVisible();
});

test('reviews diffs with the keyboard', async ({ page }) => {
  await cards(page).first().click();
  const dialog = modal(page);
  await expect(dialog.getByText(`${DEMO_TOTAL} left to review`)).toBeVisible();

  await page.keyboard.press('a');
  await expect(page.getByText(`1/${DEMO_TOTAL} reviewed`)).toBeVisible();
  await expect(dialog.getByText(`${DEMO_TOTAL - 1} left to review`)).toBeVisible();

  await page.keyboard.press('x');
  await expect(page.getByText(`2/${DEMO_TOTAL} reviewed`)).toBeVisible();
  await expect(dialog.getByText(`${DEMO_TOTAL - 2} left to review`)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('1 approved')).toBeVisible();
  await expect(page.getByText('1 changes')).toBeVisible();
  await expect(cards(page)).toHaveCount(DEMO_TOTAL - 1); // Approved section starts collapsed
});

test('navigates between diffs with the arrow keys', async ({ page }) => {
  const names = await cards(page).locator('img').evaluateAll(imgs => imgs.map(i => i.getAttribute('alt')));
  await cards(page).first().click();
  const title = modal(page).locator('span.truncate');

  await expect(title).toHaveText(names[0]!);
  await page.keyboard.press('ArrowRight');
  await expect(title).toHaveText(names[1]!);
  await page.keyboard.press('ArrowLeft');
  await expect(title).toHaveText(names[0]!);
});

test('saves the comment with the review', async ({ page }) => {
  await cards(page).first().click();
  const comment = modal(page).getByPlaceholder('Comment (optional)...');
  await comment.fill('Font looks off');
  await modal(page).getByRole('button', { name: 'Needs Changes' }).click();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Needs Changes/ }).filter({ hasText: 'item' }).waitFor();
  // The rejected card sits in the "Needs Changes" section, listed after the pending ones.
  await cards(page).last().click();
  await expect(comment).toHaveValue('Font looks off');
});

test('does not carry an unsaved comment over to a re-imported report', async ({ page }) => {
  await cards(page).first().click();
  await modal(page).getByPlaceholder('Comment (optional)...').fill('Unsaved draft');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Import report' }).click();
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(DEMO_ZIP);
  await expect(page.getByText(`0/${DEMO_TOTAL} reviewed`)).toBeVisible();

  await cards(page).first().click();
  await expect(modal(page).getByPlaceholder('Comment (optional)...')).toHaveValue('');
});

test('filters by search text', async ({ page }) => {
  await page.getByPlaceholder(/search/i).fill('chart');
  await expect(cards(page)).not.toHaveCount(DEMO_TOTAL);
  for (const alt of await cards(page).locator('img').evaluateAll(imgs => imgs.map(i => i.getAttribute('alt')))) {
    expect(alt).toContain('chart');
  }

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(cards(page)).toHaveCount(DEMO_TOTAL);
});
