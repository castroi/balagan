import { test, expect } from '@playwright/test';

const KEY = 'hebrew-practice';

async function save(page: import('@playwright/test').Page, id: string, text: string) {
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator(`#input-${id}`).fill(text);
  await page.locator(`section[data-plugin="${id}"]`).getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

test('no content yet: no cards, a line for the parents and one button to the edit screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title')).toHaveText('שלום!');
  await expect(page.locator('.title')).toBeFocused();
  await expect(page.locator('.greeting')).toContainText('עוד אין משימות השבוע');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.home-empty')).toContainText('הורים: הוסיפו מילים או הדביקו קישור במסך העריכה');
  const toEdit = page.locator('.home-empty').getByRole('button', { name: 'למסך העריכה' });
  expect((await toEdit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toEdit.click();
  await expect(page.locator('.edit-title')).toHaveText('עריכת משימות');
});

test('only activities with content are shown, in their usual order', async ({ page }) => {
  await page.goto('/');
  await save(page, 'flashcards', 'דוד | خال');
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.locator('.card[data-plugin="flashcards"]')).toBeVisible();
  await expect(page.locator('.greeting')).toContainText('המשימות של השבוע');
  await expect(page.locator('.home-empty')).toHaveCount(0);

  await save(page, 'scrambled-words', 'כַּעַס\nעָצוּב');
  await expect(page.locator('.card')).toHaveCount(2);
  const order = await page.locator('.card').evaluateAll((els) => els.map((e) => e.getAttribute('data-plugin')));
  expect(order).toEqual(['scrambled-words', 'flashcards']);
});

test('clearing the last activity brings back the empty home', async ({ page }) => {
  await page.goto('/');
  await save(page, 'scrambled-words', 'כַּעַס');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'ניקוי' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.greeting')).toContainText('עוד אין משימות השבוע');
});

test('data from a newer version: a message to refresh that stays, no cards, no points, no add-words line', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ schema: 99 })), KEY);
  await page.reload();
  await expect(page.locator('.home-newer')).toHaveText('יש גרסה חדשה של האפליקציה. רעננו את הדף');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.home-empty')).toHaveCount(0);
  await expect(page.locator('.points-chip')).toHaveCount(0);
  await expect(page.locator('.greeting')).not.toContainText('עוד אין משימות השבוע');
  // A screen reader hears it with the focused title.
  await expect(page.locator('.title')).toHaveAttribute('aria-describedby', 'home-newer');
  // The pencil stays: the edit screen shows the read-only banner (and the version).
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await expect(page.locator('.banner').filter({ hasText: 'גרסה חדשה יותר' })).toBeVisible();
  // The message stays after the toast and after leaving and coming back.
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page.locator('.home-newer')).toBeVisible();
});

test('coming back to an empty home puts focus on the title', async ({ page }) => {
  await page.goto('/');
  await page.locator('.home-empty').getByRole('button', { name: 'למסך העריכה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page.locator('.title')).toBeFocused();
});

test.describe('small phone (360×640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('the empty home fits without scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home-empty')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
  });
});
