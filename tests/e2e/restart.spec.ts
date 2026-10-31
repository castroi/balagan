import { test, expect, type Page } from '@playwright/test';
import { splitTiles } from '../../src/core/unicode';
import { recordSpeech, spoken, tapTile } from './helpers';

const KEY = 'hebrew-practice';

interface SavedRound {
  points: number;
  progress: { order: number[]; index: number; roundPoints: number; done: boolean };
  item: unknown;
}

/** Saved total points, this game's round, and its current item (word or line). */
const savedRound = (page: Page, id: string) =>
  page.evaluate(
    ([key, id]) => {
      const s = JSON.parse(localStorage.getItem(key)!);
      const p = s.progress[id];
      const d = s.assignments[id].data;
      const list = d.words ?? d.items ?? d.cards;
      return { points: s.points, progress: p, item: p ? list[p.order[p.index]] : undefined };
    },
    [KEY, id] as const,
  ) as Promise<SavedRound>;

/** The word that is spoken for the current item. */
const currentWord = async (page: Page, id: string) => {
  const { item } = await savedRound(page, id);
  if (typeof item === 'string') return item;
  // A flashcard ([Hebrew, foreign, reading?]): its Hebrew side is spoken first.
  return Array.isArray(item) ? (item[0] as string) : (item as { word: string }).word;
};

async function placeLetters(page: Page, id: string) {
  const split = splitTiles(await currentWord(page, id));
  if (!split.ok) throw new Error('stored word is invalid');
  for (const t of split.tiles) await tapTile(page, t);
}

async function tapRightWord(page: Page, id: string) {
  const word = await currentWord(page, id);
  const options = page.locator('.choices .choice');
  const i = (await options.allTextContents()).indexOf(word);
  expect(i, `option ${word}`).toBeGreaterThanOrEqual(0);
  await options.nth(i).click();
}

/** Solves the current item without mistakes and skips the celebration (the letter games and Choose Word). */
const solveAndSkip = (solve: (page: Page, id: string) => Promise<void>) => async (page: Page, id: string) => {
  await solve(page, id);
  await expect(page.locator('.celebrate-points')).toHaveText('+10');
  await page.locator('.celebration').click();
};

/** Turns the current flashcard over and answers "ידעתי". */
async function knowCard(page: Page) {
  await page.locator('.flash-card').click();
  await page.getByRole('button', { name: 'ידעתי' }).click();
}

/** Each game, with content of 3 items, a way to finish the current item, and the points it gives. */
const GAMES = [
  { id: 'scrambled-words', text: 'כַּעַס\nעָצוּב\nפָּגַע', finish: solveAndSkip(placeLetters), points: 10 },
  { id: 'confusing-letters', text: 'סַבָּא צ\nכַּעַס ק\nעָצוּב א', finish: solveAndSkip(placeLetters), points: 10 },
  { id: 'choose-word', text: 'כעס קעס\nצער סער\nפגע פגא', finish: solveAndSkip(tapRightWord), points: 10 },
  { id: 'flashcards', text: 'דוד | خال\nילד | child\nאבא | أب', finish: knowCard, points: 5 },
];

const card = (page: Page, id: string) => page.locator(`.card[data-plugin="${id}"]`);
const restartButton = (page: Page) => page.getByRole('button', { name: 'מתחילים מהתחלה' });

async function save(page: Page, id: string, text: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator(`#input-${id}`).fill(text);
  await page.locator(`section[data-plugin="${id}"]`).getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

for (const game of GAMES) {
  test.describe(game.id, () => {
    test('a first visit shows only the Start button', async ({ page }) => {
      await save(page, game.id, game.text);
      await card(page, game.id).click();
      await expect(page.locator('.start-btn')).toContainText('התחלה');
      await expect(restartButton(page)).toHaveCount(0);
    });

    test('in the middle of a round: continue, or restart from word 1 keeping the points', async ({ page }) => {
      await recordSpeech(page);
      await save(page, game.id, game.text);
      await card(page, game.id).click();
      await page.locator('.start-btn').click();
      await game.finish(page, game.id);
      await expect(page.locator('.dots .dot.done')).toHaveCount(1);
      await page.getByRole('button', { name: 'חזרה לבית' }).click();

      await card(page, game.id).click();
      await expect(page.locator('.start-btn')).toContainText('ממשיכים');
      await expect(page.locator('.stage.center')).toContainText('מילה 2 מתוך 3');
      const restart = restartButton(page);
      await expect(restart).toBeVisible();
      // Smaller than the round Start button, and well below it (the "מילה N מתוך M" line sits between them).
      const start = (await page.locator('.start-btn').boundingBox())!;
      const box = (await restart.boundingBox())!;
      expect(box.height).toBeLessThan(start.height);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(220);
      expect(box.y - (start.y + start.height)).toBeGreaterThanOrEqual(24);

      await restart.click();
      // Straight into word 1 of a new round; the total is kept.
      await expect(page.locator('.start-btn')).toHaveCount(0);
      await expect(page.locator('.speaker-btn')).toBeVisible();
      await expect(page.locator('.dots .dot.done')).toHaveCount(0);
      await expect(page.locator('.points-chip')).toHaveText(String(game.points));
      const saved = await savedRound(page, game.id);
      expect(saved.points).toBe(game.points);
      expect(saved.progress).toMatchObject({ index: 0, roundPoints: 0, done: false });
      expect([...saved.progress.order].sort()).toEqual([0, 1, 2]);
      await expect.poll(async () => (await spoken(page)).at(-1)).toBe(await currentWord(page, game.id));

      // Leaving now resumes the new round (word 1), so no restart button yet.
      await page.getByRole('button', { name: 'חזרה לבית' }).click();
      await card(page, game.id).click();
      await expect(page.locator('.start-btn')).toContainText('התחלה');
      await expect(restartButton(page)).toHaveCount(0);
    });
  });
}

test('a finished round starts fresh: Start only, no restart button', async ({ page }) => {
  // A recorded voice, so the end screen doesn't wait on the device's speech.
  await recordSpeech(page);
  await save(page, 'choose-word', 'כעס קעס');
  await card(page, 'choose-word').click();
  await page.locator('.start-btn').click();
  await tapRightWord(page, 'choose-word');
  await expect(page.locator('.end')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'חזרה לבית' }).last().click();
  await card(page, 'choose-word').click();
  await expect(page.locator('.start-btn')).toContainText('התחלה');
  await expect(restartButton(page)).toHaveCount(0);
});

test.describe('small phone (360×640)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('the start screen with restart fits without scrolling', async ({ page }) => {
    await save(page, 'choose-word', GAMES[2].text);
    await card(page, 'choose-word').click();
    await page.locator('.start-btn').click();
    await tapRightWord(page, 'choose-word');
    await page.locator('.celebration').click();
    await page.getByRole('button', { name: 'חזרה לבית' }).click();
    await card(page, 'choose-word').click();
    await expect(restartButton(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(false);
  });
});
