import { test, expect, type Page } from '@playwright/test';
import { decodeShare } from '../../src/platform/share-codec';

type ShareWindow = Window & { __shared: string[] };

/** Records what the share sheet received. */
async function recordShares(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as ShareWindow;
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (d: { url: string }) => {
        w.__shared.push(d.url);
        return Promise.resolve();
      },
    });
  });
}
const shared = (page: Page) => page.evaluate(() => (window as unknown as ShareWindow).__shared.slice());

/** A fake /api/shorten (the server function); returns the long links it was asked to shorten. */
async function fakeServer(page: Page) {
  const asked: string[] = [];
  await page.route('**/api/shorten', async (route) => {
    const body = route.request().postDataJSON() as { url: string; expiresAt: number };
    asked.push(body.url);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ shorturl: `https://tny.lv/t${asked.length}` }) });
  });
  return asked;
}

async function saveWords(page: Page, words: string) {
  await page.locator('#input-scrambled-words').fill(words);
  await page.locator('section[data-plugin="scrambled-words"]').getByRole('button', { name: 'שמירה' }).click();
}

async function openEdit(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
}

test.describe('short link', () => {
  // The built app's service worker must not stand between the page and the fake server.
  test.use({ serviceWorkers: 'block' });

  test('first tap makes the short link, second tap shares it', async ({ page }) => {
    await recordShares(page);
    const asked = await fakeServer(page);
    await openEdit(page);
    await saveWords(page, 'כַּעַס\nעָצוּב');

    await page.getByRole('button', { name: 'יצירת קישור קצר' }).click();
    await expect(page.getByText('https://tny.lv/t1')).toBeVisible();
    await expect(page.getByText(/^בתוקף עד /)).toBeVisible();
    expect(await shared(page)).toEqual([]);

    await page.getByRole('button', { name: 'שיתוף הקישור הקצר' }).click();
    expect(await shared(page)).toEqual(['https://tny.lv/t1']);

    // What was shortened is the full link the regular button shares, plus the ignored ?s= marker.
    expect(decodeShare(asked[0]).ok).toBe(true);
    const sent = new URL(asked[0]);
    expect(sent.searchParams.get('s')).toBeTruthy();
    sent.searchParams.delete('s');
    await page.getByRole('button', { name: 'שיתוף קישור' }).click();
    expect((await shared(page))[1]).toBe(sent.href);
  });

  test('when the service fails, it says so and the regular link still works', async ({ page }) => {
    await recordShares(page);
    await page.route('**/api/shorten', (route) => route.fulfill({ status: 502, body: '{"error":"service"}' }));
    await openEdit(page);
    await saveWords(page, 'כַּעַס');

    await page.getByRole('button', { name: 'יצירת קישור קצר' }).click();
    await expect(page.locator('.msg.warning')).toContainText('לא הצלחנו ליצור קישור קצר');
    await expect(page.getByRole('button', { name: 'לנסות שוב' })).toBeVisible();

    await page.getByRole('button', { name: 'שיתוף קישור' }).click();
    const [link] = await shared(page);
    expect(decodeShare(link).ok).toBe(true);
  });

  test('a short link made before the content changed is not shared', async ({ page }) => {
    await recordShares(page);
    await fakeServer(page);
    await openEdit(page);
    await saveWords(page, 'כַּעַס');
    await page.getByRole('button', { name: 'יצירת קישור קצר' }).click();
    await expect(page.getByRole('button', { name: 'שיתוף הקישור הקצר' })).toBeVisible();

    await saveWords(page, 'כַּעַס\nעָצוּב');
    await page.getByRole('button', { name: 'שיתוף הקישור הקצר' }).click();
    await expect(page.locator('.msg.warning')).toHaveText('התוכן השתנה — צרו קישור קצר חדש.');
    expect(await shared(page)).toEqual([]);
    await expect(page.getByRole('button', { name: 'יצירת קישור קצר' })).toBeVisible();
  });

  test('pasting a short link into the Import box explains what to do', async ({ page }) => {
    await openEdit(page);
    await page.locator('#import-input').fill('https://tny.lv/eJLj4');
    await page.getByRole('button', { name: 'טעינה מהקישור' }).click();
    await expect(page.getByText('זה קישור מקוצר', { exact: false })).toBeVisible();
  });
});
