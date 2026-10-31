import { test, expect, type Page } from '@playwright/test';
import { buildShareLink, decodeShare } from '../../src/platform/share-codec';
import { normalizeText } from '../../src/core/unicode';
import { recordSpeech, spoken, spokenLangs } from './helpers';

const KEY = 'hebrew-practice';
const ID = 'flashcards';
const section = (page: Page) => page.locator(`section[data-plugin="${ID}"]`);
const card = (page: Page) => page.locator(`.card[data-plugin="${ID}"]`);
const flash = (page: Page) => page.locator('.flash-card');
const knew = (page: Page) => page.getByRole('button', { name: 'ידעתי' });
const notYet = (page: Page) => page.getByRole('button', { name: 'עוד לא' });
const n = normalizeText;

async function saveCards(page: Page, text: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator(`#input-${ID}`).fill(text);
  await section(page).getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

async function start(page: Page) {
  await card(page).click();
  await page.locator('.start-btn').click();
  await expect(flash(page)).toBeVisible();
}

// A recorded voice in every test: real headless voices differ between Chromium and WebKit
// (WebKit may have none, which would show the "no voice" screens).
test.beforeEach(async ({ page }) => {
  await recordSpeech(page);
});

/** A device voice list with only these languages (the rest of the recorder stays). */
async function onlyVoices(page: Page, langs: string[]) {
  await page.addInitScript((tags) => {
    const synth = window.speechSynthesis as unknown as { getVoices: () => unknown[] };
    synth.getVoices = () => tags.map((lang) => ({ lang, name: lang, localService: true }));
  }, langs);
}

test.describe('editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
  });

  test('previews each card and offers the foreign words for the voice test, in their language', async ({ page }) => {
    await page.locator(`#input-${ID}`).fill("דוד | خَال | חַ'אל\nבן (צאצא) | ابن\nילד | child | צַ'יילְד");
    await expect(section(page).locator('.msg.ok')).toHaveText('התוכן תקין');
    const rows = section(page).locator('.preview .preview-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('.mini-word.back')).toHaveText(n('חַ׳אל'));
    await expect(rows.nth(1).locator('.mini-word.back')).toHaveAttribute('lang', 'ar');
    await expect(rows.nth(1).locator('.preview-hint')).toHaveText('צאצא');
    await expect(section(page).locator('.preview-count')).toHaveText(['קול בערבית', 'קול בערבית', 'קול באנגלית']);

    await section(page).getByRole('button', { name: 'שמירה' }).click();
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).assignments.flashcards, KEY);
    expect(saved).toEqual({
      v: 1,
      data: {
        cards: [
          ['דוד', n('خَال'), n('חַ׳אל')],
          ['בן (צאצא)', 'ابن'],
          ['ילד', 'child', n('צַ׳יילְד')],
        ],
      },
    });
    await expect(section(page).locator('.chip')).toHaveText([n('خَال'), 'ابن', 'child']);
    await expect(section(page).locator('.chip span').last()).toHaveAttribute('dir', 'ltr');
  });

  test('blocks a line without | or with Hebrew letters as the foreign word', async ({ page }) => {
    const save = section(page).getByRole('button', { name: 'שמירה' });
    await page.locator(`#input-${ID}`).fill('דוד – خال');
    await expect(section(page).locator('.msg.error')).toHaveText('שורה 1: חסר | בין המילה בעברית למילה בשפה השנייה');
    await expect(save).toBeDisabled();
    await page.locator(`#input-${ID}`).fill('דוד | ח׳אל');
    await expect(section(page).locator('.msg.error')).toContainText('באותיות של השפה');
    await expect(save).toBeDisabled();
  });
});

test('home card: title, word count and the אבא / ? tiles', async ({ page }) => {
  await saveCards(page, 'דוד | خال\nילד | child');
  await expect(card(page)).toContainText('איך אומרים?');
  await expect(card(page)).toContainText('2 מילים · 0 הושלמו');
  await expect(card(page).locator('.mini-tile')).toHaveText(['אבא', '?']);
});

test('a card: Hebrew spoken, turned over to the reading with the Arabic voice, then "ידעתי"', async ({ page }) => {
  await saveCards(page, "בן (צאצא) | ابن | אִבְּן");
  await start(page);
  await expect(flash(page)).toContainText('איך אומרים בערבית?');
  await expect(flash(page).locator('.flash-hint')).toHaveText('צאצא');
  await expect(page.locator('.flash-knew')).toHaveCount(0);
  // The note in parentheses isn't spoken.
  await expect.poll(() => spoken(page)).toEqual(['בן']);

  await flash(page).click();
  await expect(flash(page)).toHaveClass(/back/);
  await expect(flash(page).locator('.flash-main')).toHaveText(n('אִבְּן'));
  await expect(flash(page).locator('.flash-top')).toHaveText('בן');
  // Arabic with a Hebrew-letter reading: the Arabic script isn't shown.
  await expect(flash(page)).not.toContainText('ابن');
  await expect.poll(() => spoken(page)).toEqual(['בן', 'ابن']);
  expect((await spokenLangs(page))[1]).toBe('ar');

  // Tapping the back says it again; it doesn't turn back.
  await flash(page).click();
  await expect(flash(page)).toHaveClass(/back/);
  await expect.poll(() => spoken(page)).toEqual(['בן', 'ابن', 'ابن']);

  await knew(page).click();
  await expect(page.locator('.end')).toBeVisible();
  await expect(page.locator('.end')).toContainText('5 נקודות');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(5);
});

test('two parts: the back shows the foreign word itself, in its direction', async ({ page }) => {
  await saveCards(page, 'ילד | child');
  await start(page);
  await expect(flash(page)).toContainText('איך אומרים באנגלית?');
  await flash(page).click();
  const main = flash(page).locator('.flash-main');
  await expect(main).toHaveText('child');
  await expect(main).toHaveAttribute('dir', 'ltr');
  await expect(main).toHaveAttribute('lang', 'en');
});

test('English with a reading: the reading big, the English spelling small under it', async ({ page }) => {
  await saveCards(page, "ילד | child | צַ'יילְד");
  await start(page);
  await flash(page).click();
  await expect(flash(page).locator('.flash-main')).toHaveText(n('צַ׳יילְד'));
  await expect(flash(page).locator('.flash-sub')).toHaveText('child');
});

test('"עוד לא": the card comes back once at the end, with no extra points', async ({ page }) => {
  await saveCards(page, 'דוד | خال');
  await start(page);
  await flash(page).click();
  await notYet(page).click();
  // Back on the front of the same card, now the second of two.
  await expect(flash(page)).not.toHaveClass(/back/);
  await expect(flash(page).locator('.flash-main')).toHaveText('דוד');
  await expect(page.locator('.dots .dot')).toHaveCount(2);
  await expect(page.locator('.points-chip')).toHaveText('5');

  await flash(page).click();
  await notYet(page).click();
  await expect(page.locator('.end')).toBeVisible();
  await expect(page.locator('.end')).toContainText('5 נקודות');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(5);
});

test('progress survives closing the app, without extra points', async ({ page }) => {
  await saveCards(page, 'דוד | خال\nילד | child');
  await start(page);
  await flash(page).click();
  await knew(page).click();
  await page.reload();
  await expect(card(page)).toContainText('1 הושלמה');
  await card(page).click();
  await expect(page.locator('.start-btn')).toContainText('ממשיכים');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(5);
});

test('closing the app during the repeat: it resumes on the "עוד לא" card, with no extra points', async ({ page }) => {
  await saveCards(page, 'דוד | خال');
  await start(page);
  await flash(page).click();
  await notYet(page).click();
  await page.reload();
  await card(page).click();
  await expect(page.locator('.start-btn')).toContainText('ממשיכים');
  await expect(page.locator('.stage.center')).toContainText('מילה 2 מתוך 2');
  await page.locator('.start-btn').click();
  await expect(flash(page).locator('.flash-main')).toHaveText('דוד');
  await flash(page).click();
  await knew(page).click();
  await expect(page.locator('.end')).toContainText('5 נקודות');
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(s.points).toBe(5);
});

test('keyboard: focus starts on the speaker, then stays on the card after turning it and after an answer', async ({ page }) => {
  await saveCards(page, 'דוד | خال\nילד | child');
  await card(page).click();
  await page.locator('.start-btn').click();
  await expect(page.locator('.speaker-btn')).toBeFocused();
  // (Not Tab: WebKit doesn't move to buttons with Tab by default.)
  await flash(page).focus();
  await page.keyboard.press('Enter');
  await expect(flash(page)).toHaveClass(/back/);
  await expect(flash(page)).toBeFocused();
  await knew(page).click();
  await expect(flash(page)).not.toHaveClass(/back/);
  await expect(flash(page)).toBeFocused();
});

test('after "ידעתי" the next word waits for the short sound', async ({ page }) => {
  await saveCards(page, 'דוד | خال\nילד | child');
  await start(page);
  await flash(page).click();
  await expect.poll(async () => (await spoken(page)).length).toBe(2);
  await knew(page).click();
  // Not at once (the "correct" sound is playing)…
  expect(await spoken(page)).toHaveLength(2);
  // …but right after it.
  await expect.poll(async () => (await spoken(page)).length).toBe(3);
});

test.describe('a phone without an Arabic voice', () => {
  test.beforeEach(async ({ page }) => {
    await onlyVoices(page, ['he-IL', 'en-US']);
  });

  test('the editor warns, the start screen says so, and the card back has no speaker', async ({ page }) => {
    await saveCards(page, 'דוד | خال\nילד | child');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
    await expect(section(page).locator('[data-missing-voice]')).toHaveCount(1);
    await expect(section(page).locator('[data-missing-voice="ar"]')).toContainText('אין קול בערבית במכשיר הזה');
    await page.getByRole('button', { name: 'חזרה' }).click();

    await card(page).click();
    await expect(page.locator('.flash-novoice')).toHaveText('אין קול בערבית במכשיר הזה');
    await page.locator('.start-btn').click();
    // Turn over cards until the Arabic one: silent, and no speaker button.
    for (let i = 0; i < 2; i++) {
      await flash(page).click();
      if ((await flash(page).locator('.flash-main').getAttribute('lang')) === 'ar') {
        await expect(page.locator('.speaker-btn')).toHaveCount(0);
        expect(await spoken(page)).not.toContain('خال');
        return;
      }
      await expect(page.locator('.speaker-btn')).toBeVisible();
      await knew(page).click();
    }
    throw new Error('the Arabic card was not shown');
  });
});

test.describe('reduce motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the card turns over at once and the game goes on', async ({ page }) => {
    await saveCards(page, 'דוד | خال\nילד | child');
    await start(page);
    await flash(page).click();
    await expect(flash(page)).toHaveClass(/back/);
    await knew(page).click();
    await expect(flash(page)).not.toHaveClass(/back/);
  });
});

test.describe('small phone (360×640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('the back with the answer buttons and long text fits without scrolling', async ({ page }) => {
    await saveCards(page, 'בן (צאצא) של הדודה | ابن العمة الكبيرة | אִבְּן אִלְעַמֶּה אִלְכְּבִירֶה');
    await start(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
    await flash(page).click();
    await expect(knew(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
    for (const b of [knew(page), notYet(page)]) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(64);
    }
    const clipped = await flash(page).evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);
  });
});

test.describe('share link', () => {
  test('the share button includes the cards', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: { url: string }) => {
          (window as unknown as { __shared: string }).__shared = d.url;
          return Promise.resolve();
        },
      });
    });
    await saveCards(page, 'דוד | خال | חאל');
    await page.getByRole('button', { name: 'עריכת משימות' }).click();
    await page.getByRole('button', { name: 'שיתוף קישור' }).click();
    const link = await page.evaluate(() => (window as unknown as { __shared: string }).__shared);
    const decoded = decodeShare(link);
    expect(decoded.ok && decoded.payload.assignments.flashcards).toEqual({
      v: 1,
      d: { cards: [['דוד', 'خال', 'חאל']] },
    });
  });

  test('opening a link on a new device loads it', async ({ page, baseURL }) => {
    const link = buildShareLink(`${baseURL}/`, {
      assignments: { flashcards: { v: 1, d: { cards: [['דוד', 'خال'], ['ילד', 'child', 'צַ׳יילְד']] } } },
    });
    await page.goto('/');
    await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
    await expect(card(page)).toContainText('2 מילים');
  });
});
