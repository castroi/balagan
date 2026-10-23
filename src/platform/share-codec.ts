/**
 * Share links carry all assignments in the URL hash: `#import=1.<base64url JSON>`.
 * The part after `#` is never sent to the server.
 * "1" is the link-format version; each assignment also carries its own data version.
 */
export const SHARE_FORMAT_VERSION = 1;
const PARAM = 'import=';

export interface SharePayload {
  assignments: Record<string, { v: number; d: unknown }>;
}

export type DecodeResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; reason: 'empty' | 'invalid' | 'newer' };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeShareCode(payload: SharePayload): string {
  const json = JSON.stringify({ a: payload.assignments });
  return `${SHARE_FORMAT_VERSION}.${toBase64Url(new TextEncoder().encode(json))}`;
}

/** Full link for the current page, e.g. https://example.app/#import=1.xxxx */
export function buildShareLink(baseUrl: string, payload: SharePayload): string {
  const base = baseUrl.split('#')[0];
  return `${base}#${PARAM}${encodeShareCode(payload)}`;
}

/** True when a URL hash is a share link. */
export function isImportHash(hash: string): boolean {
  return hash.replace(/^#/, '').startsWith(PARAM);
}

/**
 * Accepts a full link, just the hash, or just the code — whatever the parent pasted.
 */
export function decodeShare(input: string): DecodeResult {
  let text = input.trim();
  if (!text) return { ok: false, reason: 'empty' };

  const at = text.indexOf(PARAM);
  if (at >= 0) text = text.slice(at + PARAM.length);
  text = text.split(/[\s&]/)[0];

  const dot = text.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'invalid' };
  const version = Number(text.slice(0, dot));
  if (!Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  if (version > SHARE_FORMAT_VERSION) return { ok: false, reason: 'newer' };

  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(text.slice(dot + 1)));
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'invalid' };
    const a = (parsed as { a?: unknown }).a;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return { ok: false, reason: 'invalid' };

    const assignments: SharePayload['assignments'] = {};
    for (const [id, entry] of Object.entries(a as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { v, d } = entry as { v?: unknown; d?: unknown };
      if (typeof v === 'number' && d !== undefined) assignments[id] = { v, d };
    }
    if (Object.keys(assignments).length === 0) return { ok: false, reason: 'invalid' };
    return { ok: true, payload: { assignments } };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
