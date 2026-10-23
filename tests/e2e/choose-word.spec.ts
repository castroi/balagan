import { test, expect, type Page } from '@playwright/test';
import { buildShareLink, decodeShare } from '../../src/platform/share-codec';
import { normalizeText } from '../../src/core/unicode';
import { recordSpeech, spoken } from './helpers';

const KEY = 'hebrew-practice';
const ID = 'choose-word';
const section = (page: Page) => page.locator(`section[data-plugin="${ID}"]`);
const card = (page: Page) => page.locator(`.card[data-plugin="${ID}"]`);
const choices = (page: Page) => page.locator('.choices .choice');
const n = normalizeText;

async function saveChooseWord(page: Page, text: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator(`#input-${ID}`).fill(text);
  await section(page).getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

async function start(page: Page) {
  await card(page).click();
  await page.locator('.start-btn').click();
  await expect(choices(page).first()).toBeVisible();
}

/** Taps the option showing exactly this word. */
async function tap(page: Page, word: string) {
  const texts = await choices(page).allTextContents();
  const i = texts.indexOf(word);
  expect(i, `option ${word}`).toBeGreaterThanOrEqual(0);
  await choices(page).nth(i).click();
}

const boxes = (page: Page) =>
  choices(page).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), right: r.right };
    }),
  );

test.describe('editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
  });

  test('shows the correct word (✓) and the wrong words, warns, and saves', async ({ page }) => {
    await page.locator(`#input-${ID}`).fill('כַּעַס, קַעַס, כַּאַס\nפָּגַע פָּגַא\nעָצוּב אצוב');
    const warnings = section(page).locator('.msg.warning');
    await expect(warnings).toContainText(['שורה 2: רק מילה שגויה אחת — הילד יבחר בין 2 מילים']);
    await expect(warnings).toContainText(['שורה 3: רק לחלק מהמילים יש ניקוד — כך קל לזהות את התשובה']);
    await expect(section(page).locator('.preview .mini-word.right')).toHaveText([n('כַּעַס'), n('פָּגַע'), n('עָצוּב')]);
    await expect(section(page).locator('.preview .preview-row').first().locator('.mini-word.extra')).toHaveText([
      n('קַעַס'),
      n('כַּאַס'),
    ]);
    await expect(section(page).locator('.preview-count')).toHaveText(['3 מילים', '2 מילים', '2 מילים']);

    await section(page).getByRole('button', { name: 'שמירה' }).click();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).assignments['choose-word'].data, KEY);
    expect(saved.items[0]).toEqual({ word: n('כַּעַס'), wrong: [n('קַעַס'), n('כַּאַס')] });
    await expect(page.locator(`#input-${ID}`)).toHaveValue(
      `${n('כַּעַס')} ${n('קַעַס')} ${n('כַּאַס')}\n${n('פָּגַע')} ${n('פָּגַא')}\n${n('עָצוּב')} אצוב`,
    );
    // Only the correct words are offered for the voice test.
    await expect(section(page).locator('.chip')).toHaveText([n('כַּעַס'), n('פָּגַע'), n('עָצוּב')]);
  });

  test('blocks a line without a wrong word, or with more than 3', async ({ page }) => {
    const save = section(page).getByRole('button', { name: 'שמירה' });
    await page.locator(`#input-${ID}`).fill('כעס');
    await expect(section(page).locator('.msg.error')).toHaveText('שורה 1: אין מילים שגויות ל"כעס" — כתבו לפחות אחת');
    await expect(save).toBeDisabled();
    await page.locator(`#input-${ID}`).fill('כעס קעס כאס קאס חעס');
    await expect(section(page).locator('.msg.error')).toHaveText('שורה 1: 4 מילים שגויות, אפשר עד 3 — מחקו מילה אחת');
    await expect(save).toBeDisabled();
  });

  test('the settings time covers this activity too', async ({ page }) => {
    await expect(page.locator('[data-section="settings"]')).toContainText('באותיות מבלבלות ובבחרו את המילה');
  });
});

test('home card shows the activity with word tiles', async ({ page }) => {
  await saveChooseWord(page, 'כעס קעס\nצער סער');
  await expect(card(page)).toContainText('בחרו את המילה');
  await expect(card(page)).toContainText('2 מילים · 0 הושלמו');
  // Two word tiles with a separator, like ס / צ on Confusing Letters.
  await expect(card(page).locator('.mini-tile')).toHaveCount(2);
  await expect(card(page).locator('.mini-sep')).toHaveText('/');
});

test('a wrong word: orange shake, then dimmed; after the right word, the contrast card', async ({ page }) => {
  await recordSpeech(page);
  await saveChooseWord(page, 'כַּעַס קַעַס כַּאַס קַאַס');
  await start(page);
  await expect(choices(page)).toHaveCount(4);
  await expect.poll(() => spoken(page)).toEqual([n('כַּעַס')]);

  await tap(page, n('קַעַס'));
  await expect(page.locator('.choice.wrong')).toHaveText(n('קַעַס'));
  await expect(page.locator('.message')).toHaveText('כמעט! נסו שוב');
  const dimmed = page.locator('.choice.dimmed');
  await expect(dimmed).toHaveText(n('קַעַס'));
  await expect(dimmed).toHaveAttribute('aria-disabled', 'true');
  await expect(dimmed).toHaveAttribute('aria-label', /נוסתה$/);

  // Tapping the dimmed word again isn't another mistake (2 mistakes still give 7 points; 3 would give 5).
  // dispatchEvent: Playwright won't click an aria-disabled element, but a kid's finger can.
  await dimmed.dispatchEvent('click');
  await page.waitForTimeout(100);
  await expect(page.locator('.choice.wrong')).toHaveCount(0);
  await tap(page, n('כַּאַס'));
  await expect(page.locator('.choice.dimmed')).toHaveCount(2);

  await tap(page, n('כַּעַס'));
  await expect(page.locator('.choice.right')).toHaveText(n('כַּעַס'));
  await expect(page.locator('.celebrate-points')).toHaveText('+7');
  await expect(page.locator('.word-contrast .word-tile.right')).toHaveText(n('כַּעַס'));
  await expect(page.locator('.word-contrast .word-tile.crossed')).toHaveText([n('קַעַס'), n('כַּאַס')]);
  await expect(page.locator('.end')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.end')).toContainText('7 נקודות');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(7);
  // The word is said again after it's found.
  expect(await spoken(page)).toEqual([n('כַּעַס'), n('כַּעַס')]);
});

test('no contrast card when the first tap is right', async ({ page }) => {
  await saveChooseWord(page, 'כעס קעס כאס');
  await start(page);
  await tap(page, 'כעס');
  await expect(page.locator('.celebrate-points')).toHaveText('+10');
  await expect(page.locator('.celebration')).toContainText('כל הכבוד!');
  await expect(page.locator('.word-contrast')).toHaveCount(0);
});

test('progress survives closing the app, without extra points', async ({ page }) => {
  await saveChooseWord(page, 'כעס קעס\nצער סער');
  await start(page);
  const texts = await choices(page).allTextContents();
  await tap(page, texts.includes('כעס') ? 'כעס' : 'צער');
  await page.locator('.celebration').click();
  await page.reload();
  await expect(card(page)).toContainText('1 הושלמה');
  await card(page).click();
  await expect(page.locator('.start-btn')).toContainText('ממשיכים');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(10);
});

test.describe('small phone (360×640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('4 options: 2 columns, 2 rows, no scrolling', async ({ page }) => {
    await saveChooseWord(page, 'כַּעַס קַעַס כַּאַס קַאַס');
    await start(page);
    const b = await boxes(page);
    expect(new Set(b.map((x) => x.top)).size).toBe(2);
    expect(new Set(b.map((x) => x.left)).size).toBe(2);
    for (const x of b) expect(x.width).toBeGreaterThanOrEqual(130);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
  });

  test('3 options: the third is centred, the same width as the others', async ({ page }) => {
    await saveChooseWord(page, 'צַעַר סַעַר צַאַר');
    await start(page);
    const b = await boxes(page);
    expect(b).toHaveLength(3);
    expect(b[2].top).toBeGreaterThan(b[0].top);
    expect(Math.abs(b[2].width - b[0].width)).toBeLessThanOrEqual(1);
    const centre = (x: { left: number; width: number }) => x.left + x.width / 2;
    expect(Math.abs(centre(b[2]) - (centre(b[0]) + centre(b[1])) / 2)).toBeLessThanOrEqual(2);
  });

  test('words longer than 7 letters: one full-width column, still no scrolling, nothing cut off', async ({ page }) => {
    await saveChooseWord(page, 'הַמִּתְעַצְבְּנִים הַמִּתְאַצְבְּנִים הַמִּתְעַסְבְּנִים הַמִּטְעַצְבְּנִים');
    await start(page);
    await expect(page.locator('.choices.one')).toBeVisible();
    const b = await boxes(page);
    expect(new Set(b.map((x) => x.left)).size).toBe(1);
    expect(new Set(b.map((x) => x.top)).size).toBe(4);
    const clipped = await choices(page).evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth));
    expect(clipped).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
  });

  test('after 3 wrong taps the contrast card still fits without scrolling', async ({ page }) => {
    await saveChooseWord(page, 'כַּעַס קַעַס כַּאַס קַאַס');
    await start(page);
    for (const w of [n('קַעַס'), n('כַּאַס'), n('קַאַס')]) {
      await tap(page, w);
      await expect(page.locator('.choice.wrong')).toHaveCount(0);
    }
    await tap(page, n('כַּעַס'));
    await expect(page.locator('.word-contrast .word-tile.crossed')).toHaveCount(3);
    await expect(page.locator('.celebrate-points')).toHaveText('+5');
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
  });
});

test.describe('share link', () => {
  test('the share button includes this activity', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: { url: string }) => {
          (window as unknown as { __shared: string }).__shared = d.url;
          return Promise.resolve();
        },
      });
    });
    await saveChooseWord(page, 'כעס קעס כאס');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
    await page.getByRole('button', { name: 'שיתוף קישור' }).click();
    const link = await page.evaluate(() => (window as unknown as { __shared: string }).__shared);
    const decoded = decodeShare(link);
    expect(decoded.ok && decoded.payload.assignments['choose-word']).toEqual({
      v: 1,
      d: { items: [{ word: 'כעס', wrong: ['קעס', 'כאס'] }] },
    });
  });

  test('opening a link on a new device loads it', async ({ page, baseURL }) => {
    const link = buildShareLink(`${baseURL}/`, {
      assignments: { 'choose-word': { v: 1, d: { items: [{ word: 'כעס', wrong: ['קעס'] }, { word: 'צער', wrong: ['סער', 'צאר'] }] } } },
    });
    await page.goto('/');
    await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
    await expect(card(page)).toContainText('2 מילים');
  });
});
