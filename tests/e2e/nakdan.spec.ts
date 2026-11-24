import { test, expect, type Page } from '@playwright/test';

type ClipWindow = Window & { __copied: string[] };

const token = (w: string, options: { w: string; levelChoice: number; fTanakh?: boolean }[]) => ({
  str: w,
  sep: false,
  nakdan: { word: w, options },
});
// Playwright can't fake requests that pass through the service worker (WebKit).
test.use({ serviceWorkers: 'block' });

// The real Dicta answers a plain POST with this header; without it the browser hides the answer.
const CORS = { 'Access-Control-Allow-Origin': '*' };

const lineBreak = { str: '\n', sep: true, nakdan: { word: '\n', options: [] } };

/** A fake Dicta answer for "עד / עכשיו / בלגנון"; returns the request bodies it received. */
async function fakeDicta(page: Page, status = 200) {
  const asked: { type: string; data: string }[] = [];
  await page.route(/dicta\.org\.il\/api$/, async (route) => {
    const request = route.request();
    asked.push({ type: request.headers()['content-type'], data: JSON.parse(request.postData() ?? '{}').data });
    if (status !== 200) return route.fulfill({ status, headers: CORS, body: 'busy' });
    const data = [
      token('עד', [
        { w: 'עַד', levelChoice: 1 },
        { w: 'עֵד', levelChoice: 2 },
        { w: 'עֹד', levelChoice: 3, fTanakh: true },
      ]),
      lineBreak,
      token('עכשיו', [{ w: 'עַכְשָׁיֽו', levelChoice: 1 }]),
      lineBreak,
      token('בלגנון', []),
    ];
    await route.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ data }) });
  });
  return asked;
}

/** Records what was copied (or refuses, like a browser without clipboard access). */
async function recordClipboard(page: Page, refuse = false) {
  await page.addInitScript((refuse) => {
    const w = window as unknown as ClipWindow;
    w.__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          if (refuse) return Promise.reject(new Error('denied'));
          w.__copied.push(text);
          return Promise.resolve();
        },
      },
    });
  }, refuse);
}
const copied = (page: Page) => page.evaluate(() => (window as unknown as ClipWindow).__copied.slice());

async function openEdit(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
}

const panel = (page: Page) => page.locator('[data-section="nakdan"]');
const nakdanButton = (page: Page) => panel(page).getByRole('button', { name: 'ניקוד', exact: true });

test('the parent picks niqqud for each word and copies the result', async ({ page }) => {
  const asked = await fakeDicta(page);
  await recordClipboard(page);
  await openEdit(page);

  await page.getByLabel('הוספת ניקוד').fill('עד\nעכשיו\nבלגנון');
  await nakdanButton(page).click();

  const sheet = page.getByRole('dialog', { name: 'בחירת ניקוד' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'בחירת ניקוד' })).toBeFocused();
  expect(asked).toEqual([{ type: 'text/plain;charset=UTF-8', data: 'עד\nעכשיו\nבלגנון' }]);

  // Dicta's pick is chosen; the Tanakh-only form is left out.
  const group = sheet.getByRole('radiogroup', { name: 'מילה 1: עד' });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(group.getByRole('radio', { name: 'אפשרות 1: עַד' })).toBeChecked();
  await expect(sheet.getByText('לא נמצא ניקוד — יועתק כמו שנכתב')).toBeVisible();

  await group.getByRole('radio', { name: 'אפשרות 2: עֵד' }).check();
  await sheet.getByRole('button', { name: 'העתקה' }).click();

  await expect(sheet).toBeHidden();
  await expect(page.locator('.toast')).toContainText('הניקוד הועתק');
  expect(await copied(page)).toEqual(['עֵד\nעַכְשָׁיו\nבלגנון'.normalize('NFC')]);
  await expect(nakdanButton(page)).toBeFocused();
});

test('closing keeps the answer and the choices; changed words ask again', async ({ page }) => {
  const asked = await fakeDicta(page);
  await openEdit(page);
  const input = page.getByLabel('הוספת ניקוד');
  await input.fill('עד\nעכשיו\nבלגנון');
  await nakdanButton(page).click();
  await page.getByRole('radio', { name: 'אפשרות 2: עֵד' }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await nakdanButton(page).click();
  await expect(page.getByRole('radio', { name: 'אפשרות 2: עֵד' })).toBeChecked();
  expect(asked).toHaveLength(1);
  await page.getByRole('button', { name: 'סגירה' }).click();

  await input.fill('עד\nעכשיו\nבלגנון\n');
  await nakdanButton(page).click();
  expect(asked).toHaveLength(1);
  await page.keyboard.press('Escape');
  await input.fill('עד\nעכשיו');
  await nakdanButton(page).click();
  await expect.poll(() => asked.length).toBe(2);
});

test('input errors block the button; a failure offers a retry', async ({ page }) => {
  await fakeDicta(page, 503);
  await openEdit(page);
  const input = page.getByLabel('הוספת ניקוד');
  await expect(nakdanButton(page)).toBeDisabled();
  await input.fill('עד עכשיו');
  await expect(panel(page).getByText('שורה 1: מילה אחת בכל שורה')).toBeVisible();
  await expect(nakdanButton(page)).toBeDisabled();

  await input.fill('עד');
  await nakdanButton(page).click();
  await expect(panel(page).getByText('הניקוד לא הצליח כרגע')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'לנסות שוב' })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('without clipboard access the words are shown to copy by hand', async ({ page }) => {
  await fakeDicta(page);
  await recordClipboard(page, true);
  await openEdit(page);
  await page.getByLabel('הוספת ניקוד').fill('עד\nעכשיו\nבלגנון');
  await nakdanButton(page).click();
  await page.getByRole('button', { name: 'העתקה' }).click();
  const box = page.getByRole('textbox', { name: 'המילים המנוקדות' });
  await expect(box).toHaveValue('עַד\nעַכְשָׁיו\nבלגנון'.normalize('NFC'));
  await expect(page.getByRole('dialog')).toBeVisible();
});
