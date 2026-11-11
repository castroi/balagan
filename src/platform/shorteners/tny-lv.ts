import type { ShortenerProvider } from '../shortener';

/**
 * tny.lv (adminForge, built on YOURLS). It has no public API, so this uses the
 * request its own web form sends: the home page holds a nonce (the same for
 * every visitor for several hours), then `POST /?ajax=1` returns JSON with
 * `shorturl`. `af_expiry_ts` is the expiry as Unix seconds (checked by hand:
 * the link stops working at that moment). Undocumented, so it can change.
 */
const ORIGIN = 'https://tny.lv';

/** Finds the form's nonce (10 hex characters) in the home page HTML. */
export function findNonce(html: string): string | null {
  // Only the form field or a script value named exactly "nonce" — never a
  // <script nonce="…"> attribute or a hex-looking file name nearby.
  const patterns = [
    /name=["']nonce["'][^>]*?value=["']([0-9a-f]{10})["']/,
    /value=["']([0-9a-f]{10})["'][^>]*?name=["']nonce["']/,
    /["']?\bnonce["']?\s*:\s*["']([0-9a-f]{10})["']/,
    /\bnonce\s+=\s*["']([0-9a-f]{10})["']/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
}

/** The short link from the response, only when it is an https tny.lv link. */
export function readShortUrl(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  // YOURLS answers "fail" (with the old short link) for a link it already has:
  // that old link has another expiry, so it is not used.
  if ((body as { status?: unknown }).status === 'fail') return null;
  const value = (body as { shorturl?: unknown }).shorturl;
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'tny.lv' && url.pathname.length > 1 ? url.href : null;
  } catch {
    return null;
  }
}

export function createTnyLv(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): ShortenerProvider {
  let cachedNonce: string | null = null;

  async function loadNonce(signal: AbortSignal): Promise<string> {
    const response = await fetchImpl(`${ORIGIN}/`, { credentials: 'omit', signal });
    if (!response.ok) throw new Error(`tny.lv page: HTTP ${response.status}`);
    const nonce = findNonce(await response.text());
    if (!nonce) throw new Error('tny.lv page: no nonce');
    return nonce;
  }

  async function post(longUrl: string, expiresAt: Date, nonce: string, signal: AbortSignal): Promise<string | null> {
    const body = new URLSearchParams({
      nonce,
      url: longUrl,
      keyword: '',
      af_expiry_ts: String(Math.floor(expiresAt.getTime() / 1000)),
      af_password: '',
    });
    const response = await fetchImpl(`${ORIGIN}/?ajax=1`, { method: 'POST', body, credentials: 'omit', signal });
    if (!response.ok) return null;
    try {
      return readShortUrl(await response.json());
    } catch {
      return null;
    }
  }

  return {
    name: 'tny.lv',

    async shorten(longUrl, expiresAt, signal) {
      const hadNonce = cachedNonce !== null;
      cachedNonce ??= await loadNonce(signal);
      const url = await post(longUrl, expiresAt, cachedNonce, signal);
      if (url) return url;
      // A cached nonce may have expired: get a fresh one and try once more.
      cachedNonce = null;
      if (!hadNonce) throw new Error('tny.lv: no short link');
      cachedNonce = await loadNonce(signal);
      const retry = await post(longUrl, expiresAt, cachedNonce, signal);
      if (retry) return retry;
      cachedNonce = null;
      throw new Error('tny.lv: no short link');
    },

    isShortLink(text) {
      return /^(https?:\/\/)?(www\.)?tny\.lv\/[\w-]+\/?$/i.test(text.trim());
    },
  };
}
