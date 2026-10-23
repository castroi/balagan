/**
 * Builds dist/sw.js from the template: fills in the list of files to cache for
 * offline use and a version that changes whenever any built file changes.
 * Pure (no file access) so it can be unit-tested; vite.config.ts does the I/O.
 */

/** Short, stable hash of a string (FNV-1a, 32-bit). */
export function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Root-relative URLs to cache on install: the page itself ("/") plus every
 * built and public file, except the service worker and source maps.
 */
export function precacheList(files: readonly string[]): string[] {
  const urls = files
    .map((f) => f.replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter((f) => f && f !== 'sw.js' && f !== 'index.html' && !f.endsWith('.map'))
    .map((f) => `/${f}`);
  return ['/', ...[...new Set(urls)].sort()];
}

export function buildServiceWorker(template: string, files: readonly string[], extra = ''): string {
  const precache = precacheList(files);
  // Hashed file names change with their content, so this version changes with every real change.
  const version = hashString(JSON.stringify(precache) + extra);
  if (!template.includes('__PRECACHE_LIST__') || !template.includes('__CACHE_VERSION__')) {
    throw new Error('Service worker template is missing its placeholders');
  }
  return template
    .replace('__PRECACHE_LIST__', JSON.stringify(precache))
    .replace('__CACHE_VERSION__', version);
}
