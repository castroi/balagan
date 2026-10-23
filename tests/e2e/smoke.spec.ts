import { test, expect } from '@playwright/test';
import { buildShareLink } from '../../src/platform/share-codec';
import { TEN_WORDS } from '../fixtures/words';
import { currentTiles, saveWords, startGame, stored, tapTile, solveWord } from './helpers';

test('parent saves words, kid completes a word with one mistake', async ({ page }) => {
  await saveWords(page, TEN_WORDS);
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('10 מילים · 0 הושלמו');
  await startGame(page);

  const tiles = await currentTiles(page);
  const wrong = (await page.locator('.tray .tile').allTextContents()).find((t) => t !== tiles[0])!;
  await tapTile(page, wrong);
  // The wrong tile is shown in orange, then goes back to the tray.
  await expect(page.locator('.slot.wrong')).toBeVisible();
  await expect(page.locator('.message')).toHaveText('כמעט! נסו שוב');
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
  await expect(page.locator('.slot.locked')).toHaveCount(0);

  for (const t of tiles) await tapTile(page, t);
  await expect(page.locator('.celebration')).toContainText('+7');
  expect((await stored(page)).points).toBe(7);
});

test('answer slots fill from right to left', async ({ page }) => {
  await saveWords(page, TEN_WORDS);
  await startGame(page);
  const tiles = await currentTiles(page);
  await tapTile(page, tiles[0]);
  const slots = page.locator('.slot');
  const first = (await slots.first().boundingBox())!;
  const last = (await slots.last().boundingBox())!;
  expect(first.x).toBeGreaterThan(last.x);
  await expect(slots.first()).toHaveClass(/locked/);
});

test('progress survives closing the app, without extra points', async ({ page }) => {
  await saveWords(page, TEN_WORDS);
  await startGame(page);
  await solveWord(page);
  await page.locator('.celebration').click();
  expect((await stored(page)).points).toBe(10);

  await page.reload();
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('1 הושלמה');
  await page.locator('.card[data-plugin="scrambled-words"]').click();
  await expect(page.locator('.start-btn')).toContainText('ממשיכים');
  expect((await stored(page)).points).toBe(10);
});

test('share link loads the words on another device', async ({ page, baseURL }) => {
  const link = buildShareLink(`${baseURL}/`, {
    assignments: { 'scrambled-words': { v: 1, d: { words: TEN_WORDS } } },
  });
  await page.goto(link);
  await expect(page.locator('.card[data-plugin="scrambled-words"]')).toContainText('10 מילים');
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect((await stored(page)).assignments['scrambled-words'].data.words).toHaveLength(10);
});

test('editor blocks invalid content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-scrambled-words').fill('שָׁלוֹם\nabc');
  await expect(page.locator('.msg.error')).toContainText('אינו אות עברית');
  await expect(page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'שמירה' })).toBeDisabled();
});
