import { describe, it, expect } from 'vitest';
import {
  buildServiceWorker,
  findFontStylesheet,
  hash,
  precacheList,
  type BuildFile,
} from '../../build/service-worker';

const TEMPLATE = [
  "const VERSION = '__CACHE_VERSION__';",
  'const PRECACHE = __PRECACHE_LIST__;',
  'const FONT_CSS = __FONT_CSS_URL__;',
  "const FONT_VERSION = '__FONT_VERSION__';",
].join('\n');

const FILES: BuildFile[] = [
  { path: 'index.html', content: '<html></html>' },
  { path: 'assets/index-abc123.js', content: 'console.log(1)' },
  { path: 'assets/index-def456.css', content: 'body{}' },
  { path: 'icons/icon-192.png', content: new Uint8Array([1, 2, 3]) },
  { path: 'manifest.webmanifest', content: '{"name":"בלגן"}' },
];
const OPTIONS = { appVersion: '1.0.0', fontCss: 'https://fonts.googleapis.com/css2?family=Rubik' };

const version = (sw: string) => sw.match(/const VERSION = '([0-9a-f]{8})'/)?.[1];

describe('service worker build', () => {
  it('caches the page and every built and public file', () => {
    expect(precacheList(FILES.map((f) => f.path))).toEqual([
      '/',
      '/assets/index-abc123.js',
      '/assets/index-def456.css',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
    ]);
  });

  it('never caches the worker itself, source maps or hidden files, and removes duplicates', () => {
    const list = precacheList(['sw.js', 'assets/a.js.map', 'assets/a.js', 'assets/a.js', '.DS_Store', 'icons/.keep']);
    expect(list).toEqual(['/', '/assets/a.js']);
  });

  it('handles Windows-style paths from the public folder', () => {
    expect(precacheList(['icons\\icon-512.png'])).toEqual(['/', '/icons/icon-512.png']);
  });

  it('fills in every placeholder', () => {
    const sw = buildServiceWorker(TEMPLATE, FILES, OPTIONS);
    expect(sw).not.toMatch(/__[A-Z_]+__/);
    expect(sw).toContain('"/assets/index-abc123.js"');
    expect(sw).toContain(`const FONT_CSS = "${OPTIONS.fontCss}"`);
    expect(version(sw)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('writes null when there is no font stylesheet', () => {
    expect(buildServiceWorker(TEMPLATE, FILES, { ...OPTIONS, fontCss: null })).toContain('const FONT_CSS = null');
  });

  it('keeps the version when nothing changed, whatever the file order', () => {
    const a = buildServiceWorker(TEMPLATE, FILES, OPTIONS);
    expect(version(buildServiceWorker(TEMPLATE, [...FILES].reverse(), OPTIONS))).toBe(version(a));
  });

  it('changes the version when a file without a hashed name changes (icon, manifest, page)', () => {
    const base = version(buildServiceWorker(TEMPLATE, FILES, OPTIONS));
    const edit = (path: string, content: string | Uint8Array) =>
      version(buildServiceWorker(TEMPLATE, FILES.map((f) => (f.path === path ? { path, content } : f)), OPTIONS));
    expect(edit('icons/icon-192.png', new Uint8Array([1, 2, 4]))).not.toBe(base);
    expect(edit('manifest.webmanifest', '{"name":"other"}')).not.toBe(base);
    expect(edit('index.html', '<html lang="he"></html>')).not.toBe(base);
  });

  it('changes the version when only the worker’s own code changes', () => {
    const a = version(buildServiceWorker(TEMPLATE, FILES, OPTIONS));
    expect(version(buildServiceWorker(`${TEMPLATE}\n// changed`, FILES, OPTIONS))).not.toBe(a);
  });

  it('changes the version for a new app version', () => {
    const a = version(buildServiceWorker(TEMPLATE, FILES, OPTIONS));
    expect(version(buildServiceWorker(TEMPLATE, FILES, { ...OPTIONS, appVersion: '1.0.1' }))).not.toBe(a);
  });

  it('refuses a template with a missing placeholder', () => {
    expect(() => buildServiceWorker('const x = 1;', FILES, OPTIONS)).toThrow();
    expect(() => buildServiceWorker(TEMPLATE.replace('__FONT_VERSION__', 'x'), FILES, OPTIONS)).toThrow();
  });

  it('finds the Google Fonts stylesheet in index.html', () => {
    const html =
      '<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=A&amp;family=B&amp;display=swap" />';
    expect(findFontStylesheet(html)).toBe('https://fonts.googleapis.com/css2?family=A&family=B&display=swap');
    expect(findFontStylesheet('<html></html>')).toBeNull();
  });

  it('hashes text and bytes deterministically', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
    expect(hash(new Uint8Array([1, 2]))).not.toBe(hash(new Uint8Array([1, 3])));
    expect(hash('')).toMatch(/^[0-9a-f]{8}$/);
  });
});
