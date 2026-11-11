import { createTnyLv } from './shorteners/tny-lv';

/**
 * A link-shortening service. The app talks only to this interface, so the
 * service can be replaced by writing another provider and changing `SHORTENER`.
 */
export interface ShortenerProvider {
  /** The service's name, shown to the parent (e.g. "tny.lv"). */
  readonly name: string;
  /** Returns the short link, or throws. The link must stop working at `expiresAt`. */
  shorten(longUrl: string, expiresAt: Date, signal: AbortSignal): Promise<string>;
  /** True when pasted text is one of this service's short links. */
  isShortLink(text: string): boolean;
}

export interface ShortLink {
  url: string;
  expiresAt: Date;
}

/** The provider the app uses. Change this line to switch services. */
export const SHORTENER: ShortenerProvider = createTnyLv();

/** A short link stops working this many days after it is made. */
export const SHORT_LINK_DAYS = 7;
/** Give up on the service after this long; the full link still works. */
export const SHORTEN_TIMEOUT_MS = 8000;

export function expiryFrom(now: Date, days = SHORT_LINK_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Shortens a link, expiring `SHORT_LINK_DAYS` from `now`; throws on failure or timeout. */
export async function createShortLink(
  longUrl: string,
  provider: ShortenerProvider = SHORTENER,
  now: Date = new Date(),
  timeoutMs: number = SHORTEN_TIMEOUT_MS,
): Promise<ShortLink> {
  const expiresAt = expiryFrom(now);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = await Promise.race([
      provider.shorten(longUrl, expiresAt, controller.signal),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
      ),
    ]);
    return { url, expiresAt };
  } finally {
    clearTimeout(timer);
  }
}
