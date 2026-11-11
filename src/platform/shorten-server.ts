import type { ShortenerProvider } from './shortener';
import { SHARE_FORMAT_VERSION } from './share-codec.js';

/** How long the function waits for the service (the app waits 8 s in all). */
export const SERVICE_TIMEOUT_MS = 6000;

/** Longest expiry the server accepts (the app asks for 7 days; a day of clock difference is allowed). */
export const MAX_EXPIRY_DAYS = 8;
/** A full week at every activity's limits is about 22k characters. */
export const MAX_LINK_LENGTH = 64_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * `POST /api/shorten` with `{ url, expiresAt }` (expiresAt in Unix seconds) →
 * `{ shorturl }`. Only this site's own share links are shortened, so the
 * function can't be used to hide other links behind the service.
 */
export async function handleShorten(request: Request, service: ShortenerProvider, now = new Date()): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'body' });
  }
  const { url, expiresAt } = (typeof body === 'object' && body !== null ? body : {}) as {
    url?: unknown;
    expiresAt?: unknown;
  };

  if (typeof url !== 'string' || url.length > MAX_LINK_LENGTH) return json(400, { error: 'url' });
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return json(400, { error: 'url' });
  }
  // Only this site's own share link: its host, its home page, the current link format.
  const host = new URL(request.url).host;
  if (
    link.host !== host ||
    link.protocol !== 'https:' ||
    link.pathname !== '/' ||
    !link.hash.startsWith(`#import=${SHARE_FORMAT_VERSION}.`)
  ) {
    return json(400, { error: 'url' });
  }
  // Browsers send Origin with every POST: a request from another site's page is refused.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== `https://${host}`) return json(403, { error: 'origin' });

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    typeof expiresAt !== 'number' ||
    !Number.isInteger(expiresAt) ||
    expiresAt <= nowSeconds ||
    expiresAt > nowSeconds + MAX_EXPIRY_DAYS * 24 * 60 * 60
  ) {
    return json(400, { error: 'expiresAt' });
  }

  // Under the app's 8 s, leaving time for a cold start. (Not tied to request.signal:
  // some Node adapters fire it as soon as the body is read, which would abort every call.)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
  try {
    const shorturl = await service.shorten(url, new Date(expiresAt * 1000), controller.signal);
    return json(200, { shorturl });
  } catch {
    return json(502, { error: 'service' });
  } finally {
    clearTimeout(timer);
  }
}
