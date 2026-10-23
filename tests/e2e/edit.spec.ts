import { test, expect, type Page } from '@playwright/test';
import { buildShareLink } from '../../src/platform/share-codec';

const WORDS = ['כַּעַס', 'עַקְשָׁן', 'מִצְטַעֵר'];
const OTHER_WORDS = ['שָׁלוֹם', 'בַּיִת'];
const KEY = 'hebrew-practice';

const savedWords = (page: Page) =>
  page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null');
    return (s?.assignments?.['scrambled-words']?.data?.words ?? null) as string[] | null;
  }, KEY);

async function openEdit(page: Page) {
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
}

async function saveWords(page: Page, words: string[]) {
  await page.goto('/');
  await openEdit(page);
  await page.locator('#input-scrambled-words').fill(words.join('\n'));
  await page.getByRole('button', { name: 'שמירה' }).click();
}

const linkFor = (baseURL: string, words: string[]) =>
  buildShareLink(`${baseURL}/`, { assignments: { 'scrambled-words': { v: 1, d: { words } } } });

test.describe('Clear and Undo', () => {
  test('the dialog starts on "ביטול" and Escape cancels without deleting', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'ניקוי' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'מחיקה' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'ביטול' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await savedWords(page)).toEqual(WORDS);
  });

  test('Undo after Clear restores the words and the voice-test list', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'ניקוי' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
    expect(await savedWords(page)).toBeNull();
    await expect(page.locator('#input-scrambled-words')).toHaveValue('');
    await expect(page.locator('.chip')).toHaveCount(0);

    await page.getByRole('button', { name: 'ביטול' }).click(); // the Undo button in the message
    expect(await savedWords(page)).toEqual(WORDS);
    await expect(page.locator('#input-scrambled-words')).toHaveValue(WORDS.join('\n'));
    await expect(page.locator('.chip')).toHaveCount(3);
  });

  test('the Undo message disappears when leaving the edit screen', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'ניקוי' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
    await expect(page.locator('.toast')).toBeVisible();
    await page.getByRole('button', { name: 'חזרה' }).click();
    await expect(page.locator('.toast')).toHaveCount(0);
  });
});

test.describe('loading from a link', () => {
  test('a link opened while the app is already open loads the words', async ({ page, baseURL }) => {
    await page.goto('/');
    await expect(page.locator('.card')).toContainText('עדיין אין תוכן');
    // Only the hash changes — the page is not reloaded.
    await page.evaluate((hash) => (location.hash = hash), new URL(linkFor(baseURL!, WORDS)).hash);
    await expect(page.locator('.card')).toContainText('3 מילים');
    expect(await savedWords(page)).toEqual(WORDS);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('importing over existing words asks first; cancel keeps them, confirm replaces them', async ({ page, baseURL }) => {
    await saveWords(page, WORDS);
    const box = page.getByLabel('קיבלתם קישור?');
    await box.fill(linkFor(baseURL!, OTHER_WORDS));

    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ביטול' }).click();
    expect(await savedWords(page)).toEqual(WORDS);

    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'להחליף' }).click();
    expect(await savedWords(page)).toEqual(OTHER_WORDS);
    await expect(page.locator('#input-scrambled-words')).toHaveValue(OTHER_WORDS.join('\n'));
  });

  test('a broken or cut-off link shows a clear message', async ({ page, baseURL }) => {
    await page.goto('/');
    await openEdit(page);
    const link = linkFor(baseURL!, WORDS);
    await page.getByLabel('קיבלתם קישור?').fill(link.slice(0, link.length - 30));
    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await expect(page.locator('.msg.error')).toContainText('הקישור לא תקין');
  });
});

test('data saved by a newer version of the app is never overwritten', async ({ page }) => {
  const newer = JSON.stringify({ schema: 99, assignments: {}, futureField: 'keep me' });
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, newer]);
  await page.reload();
  await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');

  await openEdit(page);
  await page.locator('#input-scrambled-words').fill(WORDS.join('\n'));
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(newer);
});

test('empty answer slots have enough contrast (at least 3:1)', async ({ page }) => {
  await saveWords(page, WORDS);
  await page.getByRole('button', { name: 'חזרה' }).click();
  await page.locator('.card').click();
  await page.locator('.start-btn').click();
  const ratio = await page.evaluate(() => {
    const parse = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const slot = getComputedStyle(document.querySelector('.slot.empty')!);
    const [a, b] = [lum(parse(slot.borderTopColor)), lum(parse(slot.backgroundColor))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(3);
});
