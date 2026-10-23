import { test, expect } from '@playwright/test';

test('the app opens and works offline after a single online visit', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.title')).toHaveText('שלום!');

  // The service worker caches every file of the build on install, then takes control.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 15_000 });
  const precached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('balagan-') && !n.includes('fonts'))!);
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(precached).toContain('/');
  expect(precached).toContain('/manifest.webmanifest');
  expect(precached.some((p) => p.endsWith('.js'))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.title')).toHaveText('שלום!');

  // Still usable offline: open the editor and save words.
  await page.getByRole('button', { name: 'עריכת משימות' }).click();
  await page.locator('#input-scrambled-words').fill('כַּעַס\nעָצוּב');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(page.locator('.card')).toBeVisible();
});

test('the service worker is generated with this build’s files', async ({ request }) => {
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).not.toContain('__PRECACHE_LIST__');
  expect(sw).not.toContain('__CACHE_VERSION__');
  expect(sw).toContain('"/manifest.webmanifest"');
});
