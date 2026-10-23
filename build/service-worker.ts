/**
 * Builds dist/sw.js from the template: fills in the files to cache for offline
 * use, the font stylesheet, and versions that change whenever any file's
 * content changes. Pure (no file access) so it can be unit-tested; the Vite
 * plugin in vite.config.ts does the reading.
 */

export interface BuildFile {
  /** Path relative to the site root, e.g. "assets/index-abc.js". */
  path: string;
  content: string | Uint8Array;
}

/** Short, stable hash (FNV-1a, 32-bit) of text or bytes. */
export function hash(input: string | Uint8Array): string {
  let h = 0x811c9dc5;
  const length = input.length;
  for (let i = 0; i < length; i++) {
    h ^= typeof input === 'string' ? input.charCodeAt(i) : input[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');

/** Hidden files (e.g. .DS_Store), source maps and the worker itself are never cached. */
const isCacheable = (path: string) =>
  path !== '' && path !== 'sw.js' && path !== 'index.html' && !path.endsWith('.map') && !path.split('/').some((part) => part.startsWith('.'));

/** Root-relative URLs to cache on install: the page itself ("/") plus every cacheable file. */
export function precacheList(paths: readonly string[]): string[] {
  const urls = paths.map(normalizePath).filter(isCacheable).map((p) => `/${p}`);
  return ['/', ...[...new Set(urls)].sort()];
}

/** The Google Fonts stylesheet linked from index.html, if any. */
export function findFontStylesheet(indexHtml: string): string | null {
  const match = indexHtml.match(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/);
  return match ? match[1].replace(/&amp;/g, '&') : null;
}

export function buildServiceWorker(
  template: string,
  files: readonly BuildFile[],
  options: { appVersion: string; fontCss: string | null },
): string {
  const placeholders = ['__PRECACHE_LIST__', '__CACHE_VERSION__', '__FONT_CSS_URL__', '__FONT_VERSION__'];
  for (const p of placeholders) {
    if (!template.includes(p)) throw new Error(`Service worker template is missing ${p}`);
  }
  const precache = precacheList(files.map((f) => f.path));
  // Every file's content counts — also files without hashed names (icons, manifest).
  const fingerprint = files
    .map((f) => ({ path: normalizePath(f.path), content: f.content }))
    .filter((f) => isCacheable(f.path) || f.path === 'index.html')
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}:${hash(f.content)}`)
    .join('\n');
  const version = hash(`${options.appVersion}\n${fingerprint}`);

  return template
    .replace('__PRECACHE_LIST__', JSON.stringify(precache))
    .replace('__CACHE_VERSION__', version)
    .replace('__FONT_CSS_URL__', JSON.stringify(options.fontCss))
    .replace('__FONT_VERSION__', hash(options.fontCss ?? ''));
}
