import { test, expect, type Page } from '@playwright/test';
import { decodeShare } from '../../src/platform/share-codec';
import { normalizeText as n } from '../../src/core/unicode';
import { TEN_WORDS } from '../fixtures/words';
import { currentTiles, recordSpeech, saveWords, spoken, startGame, tapTile } from './helpers';

/**
 * The popup after a word ("+N כל הכבוד!") stays 1.6 s, or the time set in
 * הגדרות when it shows a letter pair (Confusing Letters only).
 */
const NORMAL_MS = 1600;
/** The popup appears this long after the last letter. */
const POPUP_DELAY_MS = 250;

const radio = (page: Page, seconds: string) => page.getByRole('radio', { name: `${seconds} שניות`, exact: true });
const confusingCard = (page: Page) => page.locator('.card[data-plugin="confusing-letters"]');

async function openEdit(page: Page) {
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
}

async function chooseSeconds(page: Page, seconds: string) {
  await openEdit(page);
  await radio(page, seconds).check();
  await expect(page.locator('.toast')).toContainText('נשמר');
  await page.getByRole('button', { name: 'חזרה' }).click();
}

async function saveConfusing(page: Page, text: string) {
  await page.goto('/');
  await openEdit(page);
  await page.locator('#input-confusing-letters').fill(text);
  await page.locator('section[data-plugin="confusing-letters"]').getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

async function startConfusing(page: Page) {
  await confusingCard(page).click();
  await page.locator('.start-btn').click();
  await expect(page.locator('.tray .tile').first()).toBeVisible();
}

/** Fakes the page clock and stops it, so only `runFor` moves time. */
async function stopClock(page: Page) {
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
}

/** Clicks a tray tile at once (animations don't advance on a fake clock). */
const clickNow = (page: Page, text: string) =>
  page.evaluate((t) => {
    [...document.querySelectorAll<HTMLElement>('.tray .tile:not(.away)')].find((e) => e.textContent === t)!.click();
  }, text);

/** Places the tiles; the last one on a stopped clock, so the popup's timing can be measured. */
async function finishOnStoppedClock(page: Page, tiles: string[]) {
  for (const t of tiles.slice(0, -1)) await tapTile(page, t);
  await stopClock(page);
  await clickNow(page, tiles[tiles.length - 1]);
}

/** The popup is still there just before `ms` and gone just after. */
async function expectPopupFor(page: Page, ms: number) {
  await page.clock.runFor(POPUP_DELAY_MS + 50);
  await expect(page.locator('.celebration')).toBeAttached();
  await page.clock.runFor(ms - 200);
  await expect(page.locator('.celebration')).toBeAttached();
  await page.clock.runFor(300);
  await expect(page.locator('.celebration')).toHaveCount(0);
}

/** Tries the confusing letter צ in סַבָּא, then waits until it is back in the tray. */
async function tryConfusingLetter(page: Page) {
  await tapTile(page, 'צ');
  await expect(page.locator('.slot.wrong')).toHaveCount(1);
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
}

const SABA = [n('סַ'), n('בָּ'), 'א'];

test.beforeEach(async ({ page }) => recordSpeech(page));

test.describe('popup with a letter pair (Confusing Letters)', () => {
  test('stays 3 seconds by default', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await startConfusing(page);
    await tryConfusingLetter(page);
    await finishOnStoppedClock(page, SABA);
    await page.clock.runFor(POPUP_DELAY_MS + 50);
    await expect(page.locator('.celebration .contrast-pair')).toHaveCount(1);
    await page.clock.runFor(3000 - 200);
    await expect(page.locator('.celebration')).toBeAttached();
    await page.clock.runFor(300);
    await expect(page.locator('.celebration')).toHaveCount(0);
  });

  test('stays the chosen time (5 seconds), kept after a reload', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await chooseSeconds(page, '5');
    await page.reload();
    await openEdit(page);
    await expect(radio(page, '5')).toBeChecked();
    await expect(radio(page, '3')).not.toBeChecked();
    await page.getByRole('button', { name: 'חזרה' }).click();

    await startConfusing(page);
    await tryConfusingLetter(page);
    await finishOnStoppedClock(page, SABA);
    await expectPopupFor(page, 5000);
  });

  test('a tap on the popup still skips ahead', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await chooseSeconds(page, '8');
    await startConfusing(page);
    await tryConfusingLetter(page);
    await finishOnStoppedClock(page, SABA);
    await page.clock.runFor(POPUP_DELAY_MS + 50);
    await expect(page.locator('.celebration .contrast-pair')).toHaveCount(1);
    await page.evaluate(() => document.querySelector<HTMLElement>('.celebration')!.click());
    await page.clock.runFor(50);
    await expect(page.locator('.celebration')).toHaveCount(0);
    await expect(page.locator('.end')).toBeVisible();
  });

  test('"reduce motion" does not change the time', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await saveConfusing(page, 'סַבָּא צ');
    await startConfusing(page);
    // The wrong letter shows only 0.3 s with reduce motion: do it all on the stopped clock.
    await stopClock(page);
    await clickNow(page, 'צ');
    await page.clock.runFor(400);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    for (const t of SABA) await clickNow(page, t);
    await expectPopupFor(page, 3000);
  });

  test('never closes before the word has been said again', async ({ page }) => {
    // A slow voice: the repeated word takes 3 seconds to say.
    await page.addInitScript(() => {
      const synth = window.speechSynthesis as unknown as { speak(u: { onend?: () => void }): void };
      const record = synth.speak.bind(synth);
      synth.speak = (u) => {
        const onend = u.onend;
        u.onend = undefined;
        record(u);
        setTimeout(() => onend?.(), 3000);
      };
    });
    await saveConfusing(page, 'סַבָּא צ');
    await chooseSeconds(page, '1.5');
    await startConfusing(page);
    await tryConfusingLetter(page);
    await finishOnStoppedClock(page, SABA);
    // Popup at 250 ms, repeat starts at 750 ms and ends at 3750 ms — well after the 1.5 s.
    await page.clock.runFor(POPUP_DELAY_MS + 50);
    await expect(page.locator('.celebration .contrast-pair')).toHaveCount(1);
    await page.clock.runFor(2700); // 3000 ms after the last letter
    await expect(page.locator('.celebration')).toBeAttached();
    await page.clock.runFor(900); // 3900 ms
    await expect(page.locator('.celebration')).toHaveCount(0);
  });

  test('leaving during a long popup stops everything', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ\nכַּעַס ק');
    await chooseSeconds(page, '8');
    await startConfusing(page);
    // Whichever word comes first, try its confusing letter, then solve it.
    const first = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hebrew-practice')!);
      const p = s.progress['confusing-letters'];
      return s.assignments['confusing-letters'].data.items[p.order[p.index]] as { word: string; extras: string[] };
    });
    const tiles = first.word === n('סַבָּא') ? SABA : [n('כַּ'), n('עַ'), 'ס'];
    await tapTile(page, first.extras[0]);
    await expect(page.locator('.slot.wrong')).toHaveCount(1);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    await finishOnStoppedClock(page, tiles);
    await page.clock.runFor(POPUP_DELAY_MS + 50);
    await expect(page.locator('.celebration .contrast-pair')).toHaveCount(1);

    await page.evaluate(() => document.querySelector<HTMLElement>('[aria-label="חזרה לבית"]')!.click());
    const spokenBefore = (await spoken(page)).length;
    await page.clock.runFor(10_000);
    expect((await spoken(page)).length).toBe(spokenBefore);
    await expect(page.locator('.screen.home')).toBeVisible();
    await expect(page.locator('.screen.game')).toHaveCount(0);
  });
});

test.describe('every other popup keeps the normal 1.6 seconds, whatever is chosen', () => {
  test('Confusing Letters without a pair (no confusing letter tried)', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await chooseSeconds(page, '8');
    await startConfusing(page);
    await finishOnStoppedClock(page, SABA);
    await page.clock.runFor(POPUP_DELAY_MS + 50);
    await expect(page.locator('.celebration .contrast')).toHaveCount(0);
    await page.clock.runFor(NORMAL_MS - 200);
    await expect(page.locator('.celebration')).toBeAttached();
    await page.clock.runFor(300);
    await expect(page.locator('.celebration')).toHaveCount(0);
  });

  test('Confusing Letters with only a wrong letter of the word itself (no pair)', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await chooseSeconds(page, '8');
    await startConfusing(page);
    // א belongs to the word: wrong at the first slot, but it makes no pair.
    await tapTile(page, 'א');
    await expect(page.locator('.slot.wrong')).toHaveCount(1);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    await finishOnStoppedClock(page, SABA);
    await expectPopupFor(page, NORMAL_MS);
  });

  test('Scrambled Words, also after a mistake', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await chooseSeconds(page, '8');
    await startGame(page);
    const tiles = await currentTiles(page);
    await tapTile(page, tiles.find((t) => t !== tiles[0])!);
    await expect(page.locator('.slot.wrong')).toHaveCount(1);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    await finishOnStoppedClock(page, tiles);
    await expectPopupFor(page, NORMAL_MS);
  });
});

test.describe('a wrong letter is back to how it was before 1.2.0', () => {
  /** What 1.2.0 saved when the parent chose 3 seconds for a wrong letter. */
  async function oldWrongLetterSetting(page: Page) {
    await page.evaluate(() =>
      localStorage.setItem('hebrew-practice:settings', JSON.stringify({ wrongLetterSeconds: 3 })),
    );
    await page.reload();
  }

  async function expectWrongLetterFor(page: Page, wrong: string, ms: number) {
    await stopClock(page);
    await clickNow(page, wrong);
    await expect(page.locator('.slot.wrong')).toHaveText(wrong);
    await page.clock.runFor(ms - 150);
    await expect(page.locator('.slot.wrong')).toHaveCount(1);
    await page.clock.runFor(300);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
  }

  test('Scrambled Words: 0.55 seconds, ignoring an old saved wrong-letter time', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await oldWrongLetterSetting(page);
    await startGame(page);
    const tiles = await currentTiles(page);
    await expectWrongLetterFor(page, tiles.find((t) => t !== tiles[0])!, 550);
  });

  test('Confusing Letters: 0.55 seconds too', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await oldWrongLetterSetting(page);
    await startConfusing(page);
    await expectWrongLetterFor(page, 'צ', 550);
  });

  test('taps while the wrong letter is shown are ignored, as before', async ({ page }) => {
    await saveConfusing(page, 'סַבָּא צ');
    await startConfusing(page);
    await stopClock(page);
    await clickNow(page, 'צ');
    await page.clock.runFor(100);
    await page.evaluate((t) => {
      [...document.querySelectorAll<HTMLElement>('.tray .tile')].find((e) => e.textContent === t)!.click();
    }, n('סַ'));
    await expect(page.locator('.slot.locked')).toHaveCount(0);
    await page.clock.runFor(600);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    // The tap was dropped, not saved for later.
    await expect(page.locator('.slot.locked')).toHaveCount(0);
  });

  test('with "reduce motion" the wrong letter shows 0.3 seconds, as before', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await saveConfusing(page, 'סַבָּא צ');
    await startConfusing(page);
    await stopClock(page);
    await clickNow(page, 'צ');
    await page.clock.runFor(200);
    await expect(page.locator('.slot.wrong')).toHaveCount(1);
    await page.clock.runFor(200);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
  });

  test('the edit screen no longer offers a wrong-letter time', async ({ page }) => {
    await page.goto('/');
    await openEdit(page);
    await expect(page.locator('[data-section="settings"]')).toContainText('הנכון מול השגוי');
    await expect(page.locator('[data-section="settings"]')).not.toContainText('האות השגויה');
    await expect(page.locator('[data-section="settings"] input[type="radio"]')).toHaveCount(4);
  });
});

test.describe('the setting itself', () => {
  test('is not part of the share link', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: { url: string }) => {
          (window as unknown as { __shared: string }).__shared = d.url;
          return Promise.resolve();
        },
      });
    });
    await saveWords(page, TEN_WORDS);
    await chooseSeconds(page, '5');
    await openEdit(page);
    await page.getByRole('button', { name: 'שיתוף קישור' }).click();
    const link = await page.evaluate(() => (window as unknown as { __shared: string }).__shared);
    const decoded = decodeShare(link);
    expect(decoded.ok && Object.keys(decoded.payload)).toEqual(['assignments']);
    expect(JSON.stringify(decoded)).not.toContain('pairSeconds');
  });

  test('when the device refuses to save, the choice goes back to the value in use', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'hebrew-practice:settings') throw new DOMException('full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.goto('/');
    await openEdit(page);
    // click, not check(): the app puts the choice back, which is what this test expects.
    await radio(page, '8').click();
    await expect(page.locator('.toast')).toContainText('לא ניתן לשמור');
    await expect(radio(page, '3')).toBeChecked();
    await expect(radio(page, '8')).not.toBeChecked();
  });

  test('can’t be changed when the data is from a newer version', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('hebrew-practice', JSON.stringify({ schema: 99 })));
    await page.reload();
    await openEdit(page);
    for (const s of ['1.5', '3', '5', '8']) await expect(radio(page, s)).toBeDisabled();
  });
});
