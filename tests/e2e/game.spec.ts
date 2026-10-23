import { test, expect, type Page } from '@playwright/test';
import { TEN_WORDS, TWENTY_WORDS } from '../fixtures/words';
import {
  currentTiles,
  currentWord,
  recordSpeech,
  saveWords,
  solveWord,
  spoken,
  startGame,
  stored,
  tapTile,
} from './helpers';

test.describe('speech around the celebration', () => {
  test.beforeEach(async ({ page }) => recordSpeech(page));

  /**
   * Places all tiles of the current word; the last one after taking control of
   * the page's clock, so the celebration's timers (250 / 500 / 1600 ms) run
   * only when the test says so.
   */
  async function finishWordOnFakeClock(page: Page) {
    const tiles = await currentTiles(page);
    for (const t of tiles.slice(0, -1)) await tapTile(page, t);
    await page.clock.install();
    await clickNow(page, '.tray .tile', tiles[tiles.length - 1]);
    await page.clock.runFor(300); // the celebration appears after 250 ms
    await expect(page.locator('.celebration')).toBeAttached();
  }

  /** Clicks at once, without waiting for animations (they don't advance on a fake clock). */
  async function clickNow(page: Page, selector: string, text?: string) {
    await page.evaluate(
      ([sel, txt]) => {
        const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => txt === null || e.textContent === txt);
        el!.click();
      },
      [selector, text ?? null] as const,
    );
  }

  test('skipping before the repeat: only the next word is spoken afterwards', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const oldWord = await currentWord(page);
    await finishWordOnFakeClock(page);

    const before = (await spoken(page)).length;
    await clickNow(page, '.celebration');
    await page.clock.runFor(3000); // well past the 500 ms repeat
    const newWord = await currentWord(page);
    expect(newWord).not.toBe(oldWord);
    expect((await spoken(page)).slice(before)).toEqual([newWord]);
  });

  test('skipping while the repeat is speaking: only the next word is spoken afterwards', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const oldWord = await currentWord(page);
    await finishWordOnFakeClock(page);
    await page.clock.runFor(600); // the repeat has started
    expect((await spoken(page)).at(-1)).toBe(oldWord);

    const before = (await spoken(page)).length;
    await clickNow(page, '.celebration');
    await page.clock.runFor(3000);
    expect((await spoken(page)).slice(before)).toEqual([await currentWord(page)]);
  });

  test('leaving during the celebration stops all speech', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    await finishWordOnFakeClock(page);
    const before = (await spoken(page)).length;
    await clickNow(page, '[aria-label="חזרה לבית"]');
    await page.clock.runFor(3000);
    expect((await spoken(page)).length).toBe(before);
    await expect(page.locator('.card[data-plugin="scrambled-words"]')).toBeVisible();
  });
});

test('a single word uses the singular wording from home to the end screen', async ({ page }) => {
  await saveWords(page, ['כַּעַס']);
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('מילה אחת · 0 הושלמו');
  await startGame(page);
  await solveWord(page);
  await page.locator('.celebration').click();
  await expect(page.locator('.end')).toContainText('השלמת את המילה');
  await page.getByRole('button', { name: 'חזרה לבית' }).last().click();
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('מילה אחת · 1 הושלמה');
});

test('a short list of 5 words plays to the end, and "play again" adds no extra points', async ({ page }) => {
  await saveWords(page, TEN_WORDS.slice(0, 5));
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('5 מילים');
  await startGame(page);
  for (let i = 0; i < 5; i++) {
    await solveWord(page);
    await page.locator('.celebration').click();
  }
  await expect(page.locator('.end')).toContainText('השלמת את כל 5 המילים');
  await expect(page.locator('.end')).toContainText('50 נקודות');
  expect((await stored(page)).points).toBe(50);

  await page.getByRole('button', { name: 'לשחק שוב' }).click();
  await expect(page.locator('.tray .tile').first()).toBeVisible();
  const s = await stored(page);
  expect(s.points).toBe(50);
  expect(s.progress['scrambled-words']).toMatchObject({ index: 0, done: false });
});

async function topBarFits(page: Page) {
  const overflow = await page.evaluate(() => {
    const bar = document.querySelector('.topbar') as HTMLElement;
    return {
      bar: bar.scrollWidth - bar.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(overflow.bar).toBeLessThanOrEqual(0);
  expect(overflow.page).toBeLessThanOrEqual(0);
}

/** Saves words, then gives the kid a 4-digit score (the widest points chip). */
async function setupWithManyPoints(page: Page, words: string[]) {
  await saveWords(page, words);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hebrew-practice')!);
    s.points = 9999;
    localStorage.setItem('hebrew-practice', JSON.stringify(s));
  });
  await page.reload();
}

test.describe('small phone (360 px wide)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('20 words show a counter and the top bar fits', async ({ page }) => {
    await setupWithManyPoints(page, TWENTY_WORDS);
    await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('20 מילים');
    await startGame(page);
    await expect(page.locator('.counter')).toHaveText('1 / 20');
    await expect(page.locator('.dots')).toHaveCount(0);
    await topBarFits(page);
  });

  test('10 words show dots and the top bar fits', async ({ page }) => {
    await setupWithManyPoints(page, TEN_WORDS);
    await startGame(page);
    await expect(page.locator('.dot')).toHaveCount(10);
    await expect(page.locator('.counter')).toHaveCount(0);
    await topBarFits(page);
  });
});

test.describe('dragging a tile', () => {
  async function dragTile(page: Page, text: string, to: { x: number; y: number }) {
    const tiles = page.locator('.tray .tile');
    const i = (await tiles.allTextContents()).indexOf(text);
    const box = (await tiles.nth(i).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 6 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  }

  test('dropping outside the tray places the tile, like a tap', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const tiles = await currentTiles(page);
    const slots = (await page.locator('.slots').boundingBox())!;
    await dragTile(page, tiles[0], { x: slots.x + slots.width / 2, y: slots.y + slots.height / 2 });
    await expect(page.locator('.slot.locked')).toHaveCount(1);
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
  });

  test('dropping back on the tray cancels the drag', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const tiles = await currentTiles(page);
    const tray = (await page.locator('.tray').boundingBox())!;
    await dragTile(page, tiles[0], { x: tray.x + 20, y: tray.y + tray.height / 2 });
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
    await expect(page.locator('.slot.locked')).toHaveCount(0);
    await expect(page.locator('.slot.wrong')).toHaveCount(0);
    // The tile can still be tapped normally afterwards (a click right after a
    // drag is ignored for a moment, because browsers send one when a drag ends).
    await page.waitForTimeout(500);
    await tapTile(page, tiles[0]);
    await expect(page.locator('.slot.locked')).toHaveCount(1);
  });

  test('a drag ghost never stays on screen when the tiles change mid-drag', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const tiles = await currentTiles(page);
    const trayTexts = await page.locator('.tray .tile').allTextContents();
    const other = trayTexts.findIndex((t) => t !== tiles[0]);
    const box = (await page.locator('.tray .tile').nth(other).boundingBox())!;

    // Start dragging one tile…
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 6 });
    await expect(page.locator('.drag-ghost')).toHaveCount(1);

    // …while another finger places a different tile (the tray re-renders).
    await page.evaluate((text) => {
      [...document.querySelectorAll<HTMLElement>('.tray .tile')].find((e) => e.textContent === text)!.click();
    }, tiles[0]);
    await expect(page.locator('.slot.locked')).toHaveCount(1);
    await expect(page.locator('.drag-ghost')).toHaveCount(0);

    await page.mouse.move(195, 300, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('.drag-ghost')).toHaveCount(0);
  });
});
