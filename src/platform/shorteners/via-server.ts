import type { ShortenerProvider } from '../shortener';

/**
 * The app's side: asks this site's own server function (`api/shorten.ts`) to
 * shorten, because browsers block reading the service's answer directly (CORS).
 * Name and link recognition come from the service the server uses.
 */
export function viaServer(
  service: Pick<ShortenerProvider, 'name' | 'isShortLink'>,
  endpoint = '/api/shorten',
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): ShortenerProvider {
  return {
    name: service.name,
    isShortLink: service.isShortLink,
    async shorten(longUrl, expiresAt, signal) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: longUrl, expiresAt: Math.floor(expiresAt.getTime() / 1000) }),
        signal,
      });
      if (!response.ok) throw new Error(`shorten: HTTP ${response.status}`);
      const { shorturl } = (await response.json()) as { shorturl?: unknown };
      // Checked again here: the link goes into the parent's message.
      if (typeof shorturl !== 'string' || !shorturl.startsWith('https://') || !service.isShortLink(shorturl)) {
        throw new Error('shorten: bad answer');
      }
      return shorturl;
    },
  };
}
