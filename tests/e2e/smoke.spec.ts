import { test, expect, type Page } from '@playwright/test';
import { buildShareLink } from '../../src/platform/share-codec';

const WORDS = ['כַּעַס', 'עַקְשָׁן', 'מִצְטַעֵר', 'עֶלְבּוֹן', 'הֶעֱלִיב', 'פָּגַע', 'עָיֵף', 'צַעַר', 'רָשָׁע', 'עָצוּב'];
const TILE = /[א-ת][ְ-ׇ׳']*/g;

interface Stored {
  points: number;
  assignments: Record<string, { data: { words: string[] } }>;
  progress: Record<string, { order: number[]; index: number }>;
}

const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('hebrew-practice') ?? 'null') as unknown) as Promise<Stored>;

async function saveWords(page: Page, words = WORDS) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-scrambled-words').fill(words.join('\n'));
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

/** Tiles of the word currently being played, read from saved progress. */
async function currentTiles(page: Page): Promise<string[]> {
  const s = await stored(page);
  const p = s.progress['scrambled-words'];
  const word = s.assignments['scrambled-words'].data.words[p.order[p.index]];
  return word.match(TILE) ?? [];
}

async function tapTile(page: Page, text: string) {
  const tiles = page.locator('.tray .tile');
  const texts = await tiles.allTextContents();
  const i = texts.indexOf(text);
  expect(i, `tile ${text} in tray`).toBeGreaterThanOrEqual(0);
  await tiles.nth(i).click();
}

async function startGame(page: Page) {
  await page.locator('.card').click();
  await page.locator('.start-btn').click();
  await expect(page.locator('.tray .tile').first()).toBeVisible();
}

test('parent saves words, kid completes a word with one mistake', async ({ page }) => {
  await saveWords(page);
  await expect(page.locator('.card')).toContainText('10 מילים · 0 הושלמו');
  await startGame(page);

  const tiles = await currentTiles(page);
  const wrong = (await page.locator('.tray .tile').allTextContents()).find((t) => t !== tiles[0])!;
  await tapTile(page, wrong);
  await expect(page.locator('.message')).toHaveText('כמעט! נסו שוב');
  await expect(page.locator('.slot.wrong')).toHaveCount(0);

  for (const t of tiles) await tapTile(page, t);
  await expect(page.locator('.celebration')).toContainText('+7');
  expect((await stored(page)).points).toBe(7);
});

test('answer slots fill from right to left', async ({ page }) => {
  await saveWords(page);
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
  await saveWords(page);
  await startGame(page);
  for (const t of await currentTiles(page)) await tapTile(page, t);
  await page.locator('.celebration').click();
  expect((await stored(page)).points).toBe(10);

  await page.reload();
  await expect(page.locator('.card')).toContainText('1 הושלמו');
  await page.locator('.card').click();
  await expect(page.locator('.start-btn')).toContainText('ממשיכים');
  expect((await stored(page)).points).toBe(10);
});

test('share link loads the words on another device', async ({ page, baseURL }) => {
  const link = buildShareLink(`${baseURL}/`, {
    assignments: { 'scrambled-words': { v: 1, d: { words: WORDS } } },
  });
  await page.goto(link);
  await expect(page.locator('.card')).toContainText('10 מילים');
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect((await stored(page)).assignments['scrambled-words'].data.words).toHaveLength(10);
});

test('editor blocks invalid content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-scrambled-words').fill('שָׁלוֹם\nabc');
  await expect(page.locator('.msg.error')).toContainText('אינו אות עברית');
  await expect(page.getByRole('button', { name: 'שמירה' })).toBeDisabled();
});
