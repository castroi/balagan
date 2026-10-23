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

  test('skipping the celebration speaks the next word once, with no late repeat over it', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    const oldWord = await currentWord(page);
    await solveWord(page);
    await page.locator('.celebration').waitFor();
    const beforeSkip = (await spoken(page)).length;
    // Skip at once — before the 500 ms repeat would fire (a normal click waits for the pop animation).
    await page.evaluate(() => (document.querySelector('.celebration') as HTMLElement).click());

    await expect(page.locator('.speaker-btn')).toBeVisible();
    const newWord = await currentWord(page);
    expect(newWord).not.toBe(oldWord);
    await page.waitForTimeout(1200); // longer than the 500 ms repeat delay

    // After the skip: exactly one utterance — the new word. A late repeat would
    // interrupt it (and could even be the previous word).
    expect((await spoken(page)).slice(beforeSkip)).toEqual([newWord]);
  });

  test('leaving during the celebration stops all speech', async ({ page }) => {
    await saveWords(page, TEN_WORDS);
    await startGame(page);
    await solveWord(page);
    await expect(page.locator('.celebration')).toBeVisible();
    await page.getByRole('button', { name: 'חזרה לבית' }).click();
    const afterLeaving = (await spoken(page)).length;
    await page.waitForTimeout(1200);
    expect((await spoken(page)).length).toBe(afterLeaving);
  });
});

test('a short list of 5 words plays to the end, and "play again" adds no extra points', async ({ page }) => {
  await saveWords(page, TEN_WORDS.slice(0, 5));
  await expect(page.locator('.card')).toContainText('5 מילים');
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
    await expect(page.locator('.card')).toContainText('20 מילים');
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
});
