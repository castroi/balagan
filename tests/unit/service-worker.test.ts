import { describe, it, expect } from 'vitest';
import { buildServiceWorker, hashString, precacheList } from '../../build/service-worker';

const TEMPLATE = "const VERSION = '__CACHE_VERSION__';\nconst PRECACHE = __PRECACHE_LIST__;";
const FILES = ['index.html', 'assets/index-abc123.js', 'assets/index-def456.css', 'icons/icon-192.png', 'manifest.webmanifest'];

describe('service worker build', () => {
  it('caches the page and every built and public file', () => {
    expect(precacheList(FILES)).toEqual([
      '/',
      '/assets/index-abc123.js',
      '/assets/index-def456.css',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
    ]);
  });

  it('never caches the service worker itself or source maps, and removes duplicates', () => {
    const list = precacheList([...FILES, 'sw.js', 'assets/index-abc123.js.map', 'assets/index-abc123.js']);
    expect(list).not.toContain('/sw.js');
    expect(list.some((u) => u.endsWith('.map'))).toBe(false);
    expect(list.filter((u) => u === '/assets/index-abc123.js')).toHaveLength(1);
  });

  it('handles Windows-style paths from the public folder', () => {
    expect(precacheList(['icons\\icon-512.png'])).toEqual(['/', '/icons/icon-512.png']);
  });

  it('fills in the template', () => {
    const sw = buildServiceWorker(TEMPLATE, FILES, '1.0.0');
    expect(sw).not.toContain('__PRECACHE_LIST__');
    expect(sw).not.toContain('__CACHE_VERSION__');
    expect(sw).toContain('"/assets/index-abc123.js"');
    expect(sw).toMatch(/const VERSION = '[0-9a-f]{8}';/);
  });

  it('gives a new cache version when any file changes, and the same version otherwise', () => {
    const a = buildServiceWorker(TEMPLATE, FILES, '1.0.0');
    const same = buildServiceWorker(TEMPLATE, [...FILES].reverse(), '1.0.0');
    const changed = buildServiceWorker(TEMPLATE, FILES.map((f) => f.replace('abc123', 'zzz999')), '1.0.0');
    const newRelease = buildServiceWorker(TEMPLATE, FILES, '1.0.1');
    expect(same).toBe(a);
    expect(changed).not.toBe(a);
    expect(newRelease).not.toBe(a);
  });

  it('refuses a template without placeholders', () => {
    expect(() => buildServiceWorker('const x = 1;', FILES)).toThrow();
  });

  it('hashes deterministically', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toMatch(/^[0-9a-f]{8}$/);
  });
});
