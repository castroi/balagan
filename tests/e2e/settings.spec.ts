import { test, expect, type Page } from '@playwright/test';
import { decodeShare } from '../../src/platform/share-codec';
import { TEN_WORDS } from '../fixtures/words';
import { currentTiles, saveWords, startGame } from './helpers';

const radio = (page: Page, seconds: string) => page.getByRole('radio', { name: seconds, exact: true });

async function chooseSeconds(page: Page, seconds: string) {
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await radio(page, seconds).check();
  await expect(page.locator('.toast')).toContainText('נשמר');
  await page.getByRole('button', { name: 'חזרה' }).click();
}

/**
 * Places a wrong letter at the first slot on a fake clock, then checks the
 * letter is still in the slot just before `ms` and back in the tray just after.
 */
async function expectWrongLetterFor(page: Page, ms: number) {
  const tiles = await currentTiles(page);
  const wrong = tiles.find((t) => t !== tiles[0])!;
  await page.clock.install();
  // Click at once: animations don't advance on a fake clock, so no waiting for them.
  await page.evaluate((txt) => {
    [...document.querySelectorAll<HTMLElement>('.tray .tile')].find((e) => e.textContent === txt)!.click();
  }, wrong);
  await expect(page.locator('.slot.wrong')).toHaveText(wrong);
  await page.clock.runFor(ms - 150);
  await expect(page.locator('.slot.wrong')).toHaveCount(1);
  await page.clock.runFor(300);
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
}

test('by default a wrong letter stays 1.5 seconds', async ({ page }) => {
  await saveWords(page, TEN_WORDS);
  await startGame(page);
  await expectWrongLetterFor(page, 1500);
});

test('the parent sets how long a wrong letter stays; it is kept after a reload', async ({ page }) => {
  await saveWords(page, TEN_WORDS);
  await chooseSeconds(page, '3');

  await page.reload();
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await expect(radio(page, '3')).toBeChecked();
  await expect(radio(page, '1.5')).not.toBeChecked();
  await page.getByRole('button', { name: 'חזרה' }).click();

  await startGame(page);
  await expectWrongLetterFor(page, 3000);
});

test('a short time works too (0.5 seconds), also in Confusing Letters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-confusing-letters').fill('סַבָּא צ');
  await page.locator('section[data-plugin="confusing-letters"]').getByRole('button', { name: 'שמירה' }).click();
  await radio(page, '0.5').check();
  await page.getByRole('button', { name: 'חזרה' }).click();
  await page.locator('.card[data-plugin="confusing-letters"]').click();
  await page.locator('.start-btn').click();

  await page.clock.install();
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLElement>('.tray .tile')].find((e) => e.textContent === 'צ')!.click();
  });
  await expect(page.locator('.slot.wrong')).toHaveText('צ');
  await page.clock.runFor(350);
  await expect(page.locator('.slot.wrong')).toHaveCount(1);
  await page.clock.runFor(300);
  await expect(page.locator('.slot.wrong')).toHaveCount(0);
});

test('the setting is not part of the share link', async ({ page }) => {
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
  await chooseSeconds(page, '2');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.getByRole('button', { name: 'שיתוף קישור' }).click();
  const link = await page.evaluate(() => (window as unknown as { __shared: string }).__shared);
  const decoded = decodeShare(link);
  expect(decoded.ok && Object.keys(decoded.payload)).toEqual(['assignments']);
  expect(JSON.stringify(decoded)).not.toContain('wrongLetter');
});

test('the setting can’t be changed when the data is from a newer version', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('hebrew-practice', JSON.stringify({ schema: 99 })));
  await page.reload();
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  for (const s of ['0.5', '1', '1.5', '2', '3']) await expect(radio(page, s)).toBeDisabled();
});
