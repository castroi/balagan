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
    await expect.poll(() => savedWords(page)).toEqual(WORDS);
  });

  test('Undo after Clear restores the words and the voice-test list', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'ניקוי' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה' }).click();
    await expect.poll(() => savedWords(page)).toBeNull();
    await expect(page.locator('#input-scrambled-words')).toHaveValue('');
    await expect(page.locator('.chip')).toHaveCount(0);

    await page.getByRole('button', { name: 'ביטול' }).click(); // the Undo button in the message
    await expect.poll(() => savedWords(page)).toEqual(WORDS);
    await expect(page.locator('#input-scrambled-words')).toHaveValue(WORDS.join('\n'));
    await expect(page.locator('.chip')).toHaveCount(3);
  });

  test('tapping the dimmed background keeps keyboard focus inside the dialog', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'ניקוי' }).click();
    await page.mouse.click(5, 5); // the dimmed background
    await page.keyboard.press('Tab');
    const focusedInDialog = await page.evaluate(() => !!document.activeElement?.closest('.dialog'));
    expect(focusedInDialog).toBe(true);
    // The page behind can't be reached while the dialog is open.
    expect(await page.evaluate(() => (document.getElementById('app') as HTMLElement).inert)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (document.getElementById('app') as HTMLElement).inert)).toBe(false);
  });

  test('leaving with unsaved edits asks first, then focus moves to the home title', async ({ page }) => {
    await saveWords(page, WORDS);
    await page.locator('#input-scrambled-words').fill('שָׁלוֹם');
    await page.getByRole('button', { name: 'חזרה' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'לצאת' }).click();
    await expect(page.getByRole('heading', { name: 'שלום!' })).toBeFocused();
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
    await expect.poll(() => savedWords(page)).toEqual(WORDS);
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('importing over existing words asks first; cancel keeps them, confirm replaces them', async ({ page, baseURL }) => {
    await saveWords(page, WORDS);
    const box = page.getByLabel('קיבלתם קישור?');
    await box.fill(linkFor(baseURL!, OTHER_WORDS));

    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'ביטול' }).click();
    await expect.poll(() => savedWords(page)).toEqual(WORDS);

    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'להחליף' }).click();
    await expect.poll(() => savedWords(page)).toEqual(OTHER_WORDS);
    await expect(page.locator('#input-scrambled-words')).toHaveValue(OTHER_WORDS.join('\n'));
  });

  test('a link arriving while there are unsaved edits asks first', async ({ page, baseURL }) => {
    await saveWords(page, WORDS);
    await page.locator('#input-scrambled-words').fill('שָׁלוֹם');
    await page.evaluate((hash) => (location.hash = hash), new URL(linkFor(baseURL!, OTHER_WORDS)).hash);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('שינויים שלא נשמרו');
    await dialog.getByRole('button', { name: 'ביטול' }).click();
    await expect.poll(() => savedWords(page)).toEqual(WORDS);
    await expect(page.locator('#input-scrambled-words')).toHaveValue('שָׁלוֹם');
  });

  test('a second link while a question is open does not stack another question', async ({ page, baseURL }) => {
    await saveWords(page, WORDS);
    await page.getByRole('button', { name: 'חזרה' }).click();
    const hash = new URL(linkFor(baseURL!, OTHER_WORDS)).hash;
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    // Change the hash so the second link is a new navigation.
    await page.evaluate((h) => (location.hash = h + 'x'), hash);
    await expect(page.locator('.toast')).toContainText('קודם עונים על השאלה');
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
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

test.describe('data saved by a newer version of the app', () => {
  const newer = JSON.stringify({ schema: 99, assignments: {}, futureField: 'keep me' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [KEY, newer]);
    await page.reload();
    await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');
  });

  const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

  test('saving words is refused and nothing changes', async ({ page }) => {
    await openEdit(page);
    await expect(page.locator('.banner').filter({ hasText: 'גרסה חדשה יותר' })).toBeVisible();
    await page.locator('#input-scrambled-words').fill(WORDS.join('\n'));
    await page.getByRole('button', { name: 'שמירה' }).click();
    await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');
    expect(await stored(page)).toBe(newer);
    // Not even in memory: home still has nothing to play.
    await page.getByRole('button', { name: 'חזרה' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'לצאת' }).click();
    await expect(page.locator('.card')).toContainText('עדיין אין תוכן');
  });

  test('a share link is refused and nothing changes', async ({ page, baseURL }) => {
    await page.evaluate((hash) => (location.hash = hash), new URL(linkFor(baseURL!, WORDS)).hash);
    await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');
    await expect(page.locator('.card')).toContainText('עדיין אין תוכן');
    expect(await stored(page)).toBe(newer);
  });

  test('the import box is refused and nothing changes', async ({ page, baseURL }) => {
    await openEdit(page);
    await page.getByLabel('קיבלתם קישור?').fill(linkFor(baseURL!, WORDS));
    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('גרסה חדשה יותר');
    expect(await stored(page)).toBe(newer);
  });
});

test('empty answer slots have enough contrast (at least 3:1)', async ({ page }) => {
  await saveWords(page, WORDS);
  await page.getByRole('button', { name: 'חזרה' }).click();
  await page.locator('.card').click();
  await page.locator('.start-btn').click();
  const ratios = await page.evaluate(() => {
    const parse = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (c1: string, c2: string) => {
      const [a, b] = [lum(parse(c1)), lum(parse(c2))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    };
    const border = getComputedStyle(document.querySelector('.slot.empty')!).borderTopColor;
    const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    // Against the slot itself (white), the letter tray and the page.
    return [border, background('.slot.empty'), background('.tray'), getComputedStyle(document.body).backgroundColor].slice(1).map((bg) => contrast(border, bg));
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(3);
});

test('game messages are read aloud to screen readers through one live region', async ({ page }) => {
  await saveWords(page, WORDS);
  await page.getByRole('button', { name: 'חזרה' }).click();
  await page.locator('.card').click();
  await page.locator('.start-btn').click();

  const firstTile = await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    const p = s.progress['scrambled-words'];
    const word: string = s.assignments['scrambled-words'].data.words[p.order[p.index]];
    return word.match(/^[\u05D0-\u05EA][\u05B0-\u05C7\u05F3]*/)![0];
  }, KEY);
  const tiles = page.locator('.tray .tile');
  const texts = await tiles.allTextContents();
  await tiles.nth(texts.findIndex((t) => t !== firstTile)).click();

  const live = page.locator('.visually-hidden[aria-live]');
  await expect(live).toHaveCount(1);
  await expect(live).toHaveText('כמעט! נסו שוב');
  // The visible message itself is not a second live region.
  await expect(page.locator('.message[aria-live]')).toHaveCount(0);
});
