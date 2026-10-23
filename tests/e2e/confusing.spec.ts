import { test, expect, type Page } from '@playwright/test';
import { buildShareLink, decodeShare } from '../../src/platform/share-codec';
import { normalizeText } from '../../src/core/unicode';

const KEY = 'hebrew-practice';
const section = (page: Page) => page.locator('section[data-plugin="confusing-letters"]');
const card = (page: Page) => page.locator('.card[data-plugin="confusing-letters"]');

async function saveConfusing(page: Page, text: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-confusing-letters').fill(text);
  await section(page).getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

async function start(page: Page) {
  await card(page).click();
  await page.locator('.start-btn').click();
  await expect(page.locator('.tray .tile').first()).toBeVisible();
}

async function tap(page: Page, text: string) {
  const tiles = page.locator('.tray .tile');
  const texts = await tiles.allTextContents();
  const i = texts.indexOf(text);
  expect(i, `tile ${text} in tray`).toBeGreaterThanOrEqual(0);
  await tiles.nth(i).click();
}

const n = normalizeText;

test.describe('editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
  });

  test('shows what the kid will see, warns about a letter already in the word, and saves', async ({ page }) => {
    await page.locator('#input-confusing-letters').fill('כַּעַס ק, צ, ע');
    await expect(section(page).locator('.msg.warning')).toContainText('"ע" כבר נמצאת במילה — לא תוצג');
    await expect(section(page).locator('.preview .mini-tile')).toHaveCount(5);
    await expect(section(page).locator('.preview .mini-tile.extra')).toHaveText(['ק', 'צ']);
    await expect(section(page).locator('.preview-count')).toHaveText('5/15');

    await section(page).getByRole('button', { name: 'שמירה' }).click();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).assignments['confusing-letters'].data, KEY);
    expect(saved).toEqual({ items: [{ word: n('כַּעַס'), extras: ['ק', 'צ'] }] });
    await expect(page.locator('#input-confusing-letters')).toHaveValue(`${n('כַּעַס')} ק צ`);
  });

  test('blocks a line with more than 15 letters', async ({ page }) => {
    await page.locator('#input-confusing-letters').fill('כַּעַס ב ג ד ה ו ז ח ט י ל מ נ פ');
    await expect(section(page).locator('.msg.error')).toHaveText('שורה 1: 16 אותיות (המילה + המבלבלות) — מחקו אות אחת');
    await expect(section(page).getByRole('button', { name: 'שמירה' })).toBeDisabled();
  });

  test('sections collapse with a summary, but never while they show an error', async ({ page }) => {
    const toggle = section(page).locator('.panel-toggle');
    await page.locator('#input-confusing-letters').fill('כַּעַס ק\nסַבָּא צ');
    await section(page).getByRole('button', { name: 'שמירה' }).click();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#input-confusing-letters')).toBeHidden();
    await expect(toggle).toContainText('· 2 מילים שמורות');
    // The other activity is unaffected.
    await expect(page.locator('#input-scrambled-words')).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#input-confusing-letters').fill('כַּעַס קצ');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#input-confusing-letters')).toBeVisible();
  });
});

test('a confusing letter: orange shake, then dimmed for this slot; after the word, the contrast card', async ({ page }) => {
  await saveConfusing(page, 'סַבָּא צ');
  await expect(card(page)).toContainText('מילה אחת · 0 הושלמו');
  await start(page);
  await expect(page.locator('.tray .tile')).toHaveCount(4);

  await tap(page, 'צ');
  await expect(page.locator('.slot.wrong')).toHaveText('צ');
  await expect(page.locator('.message')).toHaveText('כמעט! נסו שוב');
  const dimmed = page.locator('.tray .tile.dimmed');
  await expect(dimmed).toHaveText('צ');
  await expect(dimmed).toHaveAttribute('aria-disabled', 'true');

  // Tapping the dimmed tile again does nothing (after the shake, once it is back in the tray).
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
  await expect(dimmed).not.toHaveClass(/away/);
  await dimmed.dispatchEvent('click');
  await page.waitForTimeout(100);
  await expect(page.locator('.slot.wrong')).toHaveCount(0);

  // A second, different mistake: 2 mistakes still give 7 points (a counted dimmed tap would make it 3 → 5).
  await tap(page, 'א');
  await expect(page.locator('.slot.wrong')).toHaveText('א');
  await expect(page.locator('.slot.wrong')).toHaveCount(0);

  // Solving the slot brings it back.
  await tap(page, n('סַ'));
  await expect(page.locator('.tray .tile.dimmed')).toHaveCount(0);
  await tap(page, n('בָּ'));
  await tap(page, 'א');

  const pair = page.locator('.celebration .contrast-pair');
  await expect(pair).toHaveCount(1);
  await expect(pair.locator('.contrast-tile.right')).toHaveText(n('סַ'));
  await expect(pair.locator('.contrast-tile.crossed')).toHaveText('צ');
  await expect(page.locator('.celebrate-points')).toHaveText('+7');
  await expect(page.locator('.end')).toBeVisible({ timeout: 5000 });
});

test('no contrast card when no confusing letter was tried', async ({ page }) => {
  await saveConfusing(page, 'סַבָּא צ');
  await start(page);
  for (const t of [n('סַ'), n('בָּ'), 'א']) await tap(page, t);
  await expect(page.locator('.celebrate-points')).toHaveText('+10');
  await expect(page.locator('.contrast')).toHaveCount(0);
});

test.describe('small phone (360×640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('15 tiles fit in 3 rows of 5 without scrolling', async ({ page }) => {
    await saveConfusing(page, 'כַּעַס ב ג ד ה ו ז ח ט י ל מ נ');
    await start(page);
    const boxes = await page.locator('.tray .tile').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: r.bottom, left: r.left, right: r.right, width: r.width };
      }),
    );
    expect(boxes).toHaveLength(15);
    expect(new Set(boxes.map((b) => b.top)).size).toBe(3);
    for (const b of boxes) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.bottom).toBeLessThanOrEqual(640);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(360);
    }
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrolls).toBe(false);
  });

  test('the celebration with the contrast card still fits without scrolling', async ({ page }) => {
    await saveConfusing(page, 'כַּעַס ב ג ד ה ו ז ח ט י ל מ צ');
    await start(page);
    // Three confusing letters at the first slot, then the word.
    for (const t of ['צ', 'ה', 'ב']) {
      await tap(page, t);
      await expect(page.locator('.slot.wrong')).toHaveCount(0);
    }
    const stageBefore = await page.locator('.slots').boundingBox();
    for (const t of [n('כַּ'), n('עַ'), 'ס']) await tap(page, t);
    await expect(page.locator('.celebration .contrast-pair')).toHaveCount(3);
    const stageAfter = await page.locator('.slots').boundingBox();
    // The slots don't jump when the celebration replaces the speaker.
    expect(Math.abs(stageAfter!.y - stageBefore!.y)).toBeLessThanOrEqual(2);
    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    expect(scrolls).toBe(false);
  });
});

test.describe('share link', () => {
  test('the share button includes Confusing Letters together with Scrambled Words', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: { url: string }) => {
          (window as unknown as { __shared: string }).__shared = d.url;
          return Promise.resolve();
        },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
    await page.locator('#input-scrambled-words').fill('כַּעַס\nעָצוּב');
    await page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'שמירה' }).click();
    await page.locator('#input-confusing-letters').fill('סַבָּא צ ע');
    await section(page).getByRole('button', { name: 'שמירה' }).click();
    await page.getByRole('button', { name: 'שיתוף קישור' }).click();

    const link = await page.evaluate(() => (window as unknown as { __shared: string }).__shared);
    const decoded = decodeShare(link);
    expect(decoded.ok && decoded.payload.assignments['confusing-letters']).toEqual({
      v: 1,
      d: { items: [{ word: n('סַבָּא'), extras: ['צ', 'ע'] }] },
    });
    expect(decoded.ok && decoded.payload.assignments['scrambled-words']).toBeTruthy();
  });

  test('opening a link on a new device loads both activities', async ({ page, baseURL }) => {
    const link = buildShareLink(`${baseURL}/`, {
      assignments: {
        'scrambled-words': { v: 1, d: { words: ['כַּעַס', 'עָצוּב', 'פָּגַע'] } },
        'confusing-letters': { v: 1, d: { items: [{ word: 'סַבָּא', extras: ['צ'] }, { word: 'כַּעַס', extras: ['ק'] }] } },
      },
    });
    await page.goto('/');
    await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
    await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('3 מילים');
    await expect(card(page)).toContainText('2 מילים');
  });

  test('a link with one activity names it and leaves the other one as it is', async ({ page, baseURL }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
    await page.locator('#input-scrambled-words').fill('כַּעַס');
    await page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'שמירה' }).click();
    await page.getByRole('button', { name: 'חזרה' }).click();

    const link = buildShareLink(`${baseURL}/`, { assignments: { 'scrambled-words': { v: 1, d: { words: ['עָצוּב', 'פָּגַע'] } } } });
    await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('להחליף את התוכן של: מילים מבולגנות?');
    await dialog.getByRole('button', { name: 'להחליף' }).click();
    await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('2 מילים');
    await expect(card(page)).toContainText('מילה אחת');
  });
});
