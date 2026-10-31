import { expect, type Page } from '@playwright/test';
import { splitTiles } from '../../src/core/unicode';

export interface Stored {
  points: number;
  assignments: Record<string, { data: { words: string[] } }>;
  progress: Record<string, { order: number[]; index: number; done: boolean }>;
}

type SpeechWindow = Window & { __spoken: string[]; __spokenLangs: string[] };

/**
 * Replaces the device voice with a recorder, so tests can check what was spoken
 * (headless browsers have no Hebrew voice).
 */
export async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as SpeechWindow;
    w.__spoken = [];
    w.__spokenLangs = [];
    class FakeUtterance {
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(u: FakeUtterance) {
          w.__spoken.push(u.text);
          w.__spokenLangs.push(u.lang);
          setTimeout(() => u.onend?.(), 50);
        },
        cancel() {},
        getVoices: () => [],
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

export const spoken = (page: Page) => page.evaluate(() => (window as unknown as SpeechWindow).__spoken.slice());

/** The language tag of each spoken text, in order (e.g. "he-IL", "ar"). */
export const spokenLangs = (page: Page) =>
  page.evaluate(() => (window as unknown as SpeechWindow).__spokenLangs.slice());

export const stored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('hebrew-practice') ?? 'null') as unknown) as Promise<Stored>;

export async function saveWords(page: Page, words: string[]) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-scrambled-words').fill(words.join('\n'));
  await page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
}

/** The word currently being played, read from saved progress. */
export async function currentWord(page: Page): Promise<string> {
  const s = await stored(page);
  const p = s.progress['scrambled-words'];
  return s.assignments['scrambled-words'].data.words[p.order[p.index]];
}

/** Tiles of the current word, split exactly as the app does. */
export async function currentTiles(page: Page): Promise<string[]> {
  const split = splitTiles(await currentWord(page));
  if (!split.ok) throw new Error('stored word is invalid');
  return split.tiles;
}

export async function tapTile(page: Page, text: string) {
  const tiles = page.locator('.tray .tile');
  const texts = await tiles.allTextContents();
  const i = texts.indexOf(text);
  expect(i, `tile ${text} in tray`).toBeGreaterThanOrEqual(0);
  await tiles.nth(i).click();
}

export async function startGame(page: Page) {
  await page.locator('.card[data-plugin="scrambled-words"]').click();
  await page.locator('.start-btn').click();
  await expect(page.locator('.tray .tile').first()).toBeVisible();
}

/** Places every tile of the current word correctly. */
export async function solveWord(page: Page) {
  for (const t of await currentTiles(page)) await tapTile(page, t);
}
