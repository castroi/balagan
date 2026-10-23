/** The one Node API the unit tests use (to read the service worker template). */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
