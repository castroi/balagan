import { describeChar, MARK_CLASS, normalizeText } from '../core/unicode';

/**
 * Niqqud suggestions from Dicta's Nakdan (https://nakdan.dicta.org.il), for the
 * parent's "הוספת ניקוד" tool on the edit screen. Dicta has no documented API:
 * this posts what its own site posts. Sent as text/plain, which needs no CORS
 * preflight (Dicta answers none) and whose answer the browser may read.
 */
export const NAKDAN_URL = 'https://nakdan-u1-0.loadbalancer.dicta.org.il/api';
export const NAKDAN_NAME = 'דיקטה (Dicta)';
/** Give up after this long (a weak connection mustn't leave the button busy). */
export const NAKDAN_TIMEOUT_MS = 8000;
/** The same cap as a week's word list. */
export const NAKDAN_MAX_WORDS = 20;
/** At most this many options per word; the first is Dicta's pick. */
export const NAKDAN_MAX_OPTIONS = 4;

/** One typed word and its niqqud options (empty: Dicta has none, the word stays as typed). */
export interface NakdanWord {
  word: string;
  options: string[];
}

export type NakdanInput = { words: string[]; errors: [] } | { words: null; errors: string[] };

// Niqqud and points only (the same set as the editor's rules; not the maqaf).
const MARKS = new RegExp(`[${MARK_CLASS}]`, 'g');
const METEG = /ֽ/g;
const HEBREW_WORD = /^[א-ת][א-ת׳]*$/;

const stripMarks = (text: string) => text.replace(MARKS, '');

/**
 * The parent's list: one word per line, Hebrew letters (and geresh) only.
 * Empty lines are skipped; niqqud typed anyway is removed, so Dicta offers all its options.
 */
export function parseNakdanInput(text: string): NakdanInput {
  const lines = normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const errors: string[] = [];
  const words: string[] = [];
  lines.forEach((line, i) => {
    const word = stripMarks(line);
    if (/\s/.test(word)) {
      errors.push(`שורה ${i + 1}: מילה אחת בכל שורה`);
      return;
    }
    if (!HEBREW_WORD.test(word)) {
      const bad = [...word].find((c) => !/[א-ת׳]/.test(c)) ?? word[0];
      errors.push(`שורה ${i + 1}: התו ${describeChar(bad)} אינו אות עברית`);
      return;
    }
    words.push(word);
  });
  if (lines.length > NAKDAN_MAX_WORDS) errors.push(`אפשר עד ${NAKDAN_MAX_WORDS} מילים (יש ${lines.length})`);
  return errors.length === 0 ? { words, errors: [] } : { words: null, errors };
}

/** What Dicta's request body looks like (the same fields its site sends). */
export function nakdanRequestBody(words: string[]): string {
  return JSON.stringify({
    task: 'nakdan',
    genre: 'modern',
    data: words.join('\n'),
    addmorph: true,
    keepqq: false,
    nodageshdefmem: false,
    patachma: false,
    keepmetagim: true,
    useTokenization: true,
  });
}

/** Asks Dicta for the words' niqqud; throws on a network error, a bad answer or after the timeout. */
export async function fetchNakdan(
  words: string[],
  fetcher: typeof fetch = fetch,
  timeoutMs: number = NAKDAN_TIMEOUT_MS,
): Promise<NakdanWord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(NAKDAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: nakdanRequestBody(words),
      signal: controller.signal,
      // Only the words leave the device: no cookies, no page address, nothing cached.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return readNakdan(words, (await response.json()) as unknown);
  } finally {
    clearTimeout(timer);
  }
}

interface DictaOption {
  w?: unknown;
  levelChoice?: unknown;
  fTanakh?: unknown;
  fPoetry?: unknown;
}

interface DictaToken {
  str?: unknown;
  sep?: unknown;
  nakdan?: { word?: unknown; options?: unknown };
}

/**
 * Matches Dicta's answer to the typed words. The answer is a list of tokens
 * (words and separators); a word's tokens are the non-separator ones whose
 * text adds up to it, so how Dicta splits or marks line breaks doesn't matter.
 */
export function readNakdan(words: string[], answer: unknown): NakdanWord[] {
  const data = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('unexpected answer');
  const tokens = (data as DictaToken[]).filter((t) => t && t.sep !== true && tokenText(t).trim() !== '');
  let next = 0;
  return words.map((word) => {
    const parts: DictaToken[] = [];
    let text = '';
    while (text.length < word.length && next < tokens.length) {
      const token = tokens[next++];
      parts.push(token);
      text += stripMarks(tokenText(token)).trim();
    }
    if (text !== word) throw new Error('answer does not match the words');
    if (parts.length === 1) return { word, options: wordOptions(word, parts[0]) };
    // One typed word that Dicta split in parts: no choice, Dicta's pick for each part.
    const joined = parts.map((p) => wordOptions(stripMarks(tokenText(p)), p)[0] ?? tokenText(p)).join('');
    return { word, options: joined === word ? [] : [joined] };
  });
}

const tokenText = (t: DictaToken): string =>
  typeof t.str === 'string' ? t.str : typeof t.nakdan?.word === 'string' ? t.nakdan.word : '';

/**
 * A word's options, best first, at most `NAKDAN_MAX_OPTIONS`: Dicta's own order
 * by level (1 = its pick), each spelling once (without "|" prefix markers and
 * the meteg), only with niqqud and only with exactly the letters typed — Dicta's
 * answer is untrusted, and a spelling app must never offer another spelling.
 * Forms marked as Tanakh-only or poetry-only are left out unless nothing else is left.
 */
export function wordOptions(word: string, token: DictaToken): string[] {
  const raw = Array.isArray(token.nakdan?.options) ? (token.nakdan.options as DictaOption[]) : [];
  const options = raw
    .map((o, i) => ({
      text: typeof o?.w === 'string' ? normalizeText(o.w.replace(/\|/g, '').replace(METEG, '')) : '',
      level: typeof o?.levelChoice === 'number' ? o.levelChoice : 9,
      rare: o?.fTanakh === true || o?.fPoetry === true,
      i,
    }))
    .filter((o) => o.text !== '' && stripMarks(o.text) !== o.text)
    .sort((a, b) => a.level - b.level || a.i - b.i);

  const sameLetters = options.filter((o) => stripMarks(o.text) === word);
  const common = sameLetters.filter((o) => !o.rare);
  const chosen = common.length > 0 ? common : sameLetters;

  const unique: string[] = [];
  for (const o of chosen) {
    if (!unique.includes(o.text)) unique.push(o.text);
    if (unique.length === NAKDAN_MAX_OPTIONS) break;
  }
  return unique;
}

/** The final text to copy: one word per line, the chosen option or the word as typed. */
export function nakdanText(results: NakdanWord[], chosen: number[]): string {
  return results.map((r, i) => r.options[chosen[i] ?? 0] ?? r.word).join('\n');
}
