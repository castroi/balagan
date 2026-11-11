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
  // Specific forms first, then a loose one (what found it on the real page).
  // Never a hex-looking file name nearby; a <script nonce> attribute is matched
  // only by the loose pattern, and only if it were exactly 10 hex characters.
  const patterns = [
    /name=["']nonce["'][^>]*?value=["']([0-9a-f]{10})["']/,
    /value=["']([0-9a-f]{10})["'][^>]*?name=["']nonce["']/,
    /data-nonce=["']([0-9a-f]{10})["']/,
    /[?&]nonce=([0-9a-f]{10})(?![0-9a-f])/,
    /["']?\bnonce["']?\s*:\s*["']([0-9a-f]{10})["']/,
    // Loose: "nonce", then only quotes, spaces, = : , ( or \, then the value
    // (e.g. formData.append('nonce', '…') or escaped JSON).
    /nonce["'\s:=,(\\]{1,8}([0-9a-f]{10})(?![0-9a-f])/,
    // Last: the owner's PowerShell regex, the only one proven on the real page.
    /nonce[^0-9a-f]{1,40}([0-9a-f]{10})(?![0-9a-f])/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return null;
}

/** Hides anything that looks like a link (YOURLS messages can quote it: "<url> already exists"). */
function redact(text: string): string {
  return text.replace(/\S*(?:\/\/|import=|[?#]|\w\.\w{2,})\S*/g, '<link>');
}

/** Why an answer had no usable short link, for the server log (never the link itself). */
export function describeAnswer(status: number, body: unknown): string {
  const fields =
    typeof body === 'object' && body !== null
      ? ['status', 'code', 'message', 'statusCode']
          .map((k) => [k, (body as Record<string, unknown>)[k]] as const)
          .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
          .map(([k, v]) => `${k}=${(k === 'message' ? redact(String(v)) : String(v)).slice(0, 80)}`)
          .join(' ')
      : `not JSON`;
  return `HTTP ${status} ${fields}`.trim();
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

/** What the site's own form sends along (it's an AJAX request from its page). */
const FORM_HEADERS = {
  // Honest: says what it is, instead of Node's bare "node" (or pretending to be a browser).
  'user-agent': 'Balagan-shortener/1.0 (+https://github.com/castroi/balagan)',
  'accept-language': 'he,en;q=0.8',
  'x-requested-with': 'XMLHttpRequest',
  origin: ORIGIN,
  referer: `${ORIGIN}/`,
  accept: 'application/json, text/javascript, */*; q=0.01',
};

export function createTnyLv(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): ShortenerProvider {
  // The nonce, and the cookies the page set with it (the form sends them back).
  let session: { nonce: string; cookie: string } | null = null;

  async function loadSession(signal: AbortSignal): Promise<{ nonce: string; cookie: string }> {
    const response = await fetchImpl(`${ORIGIN}/`, {
      headers: { 'user-agent': FORM_HEADERS['user-agent'], 'accept-language': FORM_HEADERS['accept-language'] },
      credentials: 'omit',
      signal,
    });
    if (!response.ok) throw new Error(`tny.lv page: HTTP ${response.status}`);
    const nonce = findNonce(await response.text());
    if (!nonce) throw new Error('tny.lv page: no nonce found');
    const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    return { nonce, cookie };
  }

  async function post(
    longUrl: string,
    expiresAt: Date,
    { nonce, cookie }: { nonce: string; cookie: string },
    signal: AbortSignal,
  ): Promise<{ url: string } | { reason: string }> {
    const body = new URLSearchParams({
      nonce,
      url: longUrl,
      keyword: '',
      af_expiry_ts: String(Math.floor(expiresAt.getTime() / 1000)),
      af_password: '',
    });
    const headers: Record<string, string> = { ...FORM_HEADERS };
    if (cookie) headers.cookie = cookie;
    const response = await fetchImpl(`${ORIGIN}/?ajax=1`, { method: 'POST', body, headers, credentials: 'omit', signal });
    let answer: unknown = null;
    try {
      answer = await response.json();
    } catch {
      // Not JSON: described below.
    }
    const url = response.ok ? readShortUrl(answer) : null;
    return url ? { url } : { reason: describeAnswer(response.status, answer) };
  }

  return {
    name: 'tny.lv',

    async shorten(longUrl, expiresAt, signal) {
      const hadSession = session !== null;
      session ??= await loadSession(signal);
      const first = await post(longUrl, expiresAt, session, signal);
      if ('url' in first) return first.url;
      // A cached nonce may have expired: get a fresh one and try once more.
      session = null;
      if (!hadSession) throw new Error(`tny.lv: ${first.reason}`);
      session = await loadSession(signal);
      const retry = await post(longUrl, expiresAt, session, signal);
      if ('url' in retry) return retry.url;
      session = null;
      throw new Error(`tny.lv: ${retry.reason}`);
    },

    isShortLink(text) {
      return /^(https?:\/\/)?(www\.)?tny\.lv\/[\w-]+\/?$/i.test(text.trim());
    },
  };
}
