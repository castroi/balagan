import { cleanText, describeChar, GERESH, hasValidMarks, hebrewRuns, isMark, splitTiles, toGeresh } from '../../core/unicode';
import {
  allowedIn,
  detectLang,
  hasHebrewLetter,
  LANGUAGES,
  normalizeArabic,
  normalizeLatinApostrophes,
  TATWEEL,
  type ForeignLang,
} from '../../core/scripts';
import type { ParseResult } from '../types';

/** Cards per list: the same cap as the other activities (short share links). */
export const MAX_CARDS = 20;
/** Characters per part, spaces included, marks not counted: fits the card on a 360px phone. */
export const MAX_CHARS = 20;
/** The only separator between the parts of a line ("/", "-" and the maqaf appear inside words). */
export const SEPARATOR = '|';

/**
 * One card, stored as the parent typed it: [Hebrew, foreign word, reading in Hebrew letters?].
 * An array keeps the share link short. The foreign word decides the voice's language.
 */
export type Card = [he: string, word: string, read?: string];

export interface FlashcardsData {
  cards: Card[];
}

const PART_NAMES = ['הראשון', 'השני', 'השלישי'] as const;

// Besides Hebrew letters and marks: spaces and light punctuation, plus the maqaf and gershayim.
const HEBREW_PUNCT = /[\s.,!?\-/"־״]/;
const HEBREW_CHAR = /[ְ-ׇֽֿׁׂׅׄא-ת׳]/;

/** Letters only: niqqud, harakat and other combining marks don't count toward the length. */
const visibleLength = (text: string) => [...text.replace(/\p{M}/gu, '')].length;

/** The Hebrew side: the word, and an optional note in parentheses shown smaller ("בן (צאצא)"). */
export function frontParts(he: string): { main: string; hint: string | null } {
  const m = /^(.*?)\s*\(([^()]*)\)\s*(.*)$/.exec(he);
  if (!m) return { main: he, hint: null };
  return { main: `${m[1]} ${m[3]}`.trim(), hint: m[2].trim() || null };
}

/** The language of a card (from its foreign word); English when unknown (never happens for checked data). */
export const cardLang = (card: Card): ForeignLang => {
  const lang = detectLang(card[1]);
  return lang === 'ar' || lang === 'en' ? lang : 'en';
};

/** Checks a Hebrew part (already normalized). Returns an error without the line number, or null. */
function checkHebrew(text: string, part: number, strictMarks: boolean): string | null {
  const where = `בחלק ${PART_NAMES[part]}`;
  const parens = (text.match(/[()]/g) ?? []).join('');
  if (parens && part !== 0) return `${where}: סוגריים אפשר רק בחלק הראשון`;
  if (parens && parens !== '()') {
    if (parens.length > 2) return 'אפשר רק הערה אחת בסוגריים';
    return parens === '(' ? 'סוגריים בלי סגירה' : 'סוגריים בלי פתיחה — כתבו ( לפני ההערה ו-) אחריה';
  }
  for (const char of text) {
    if (!HEBREW_CHAR.test(char) && !HEBREW_PUNCT.test(char) && !(part === 0 && /[()]/.test(char))) {
      return `${where}: התו ${describeChar(char)} אינו אות עברית`;
    }
  }
  for (const run of hebrewRuns(text)) {
    const split = splitTiles(run);
    if (!split.ok) {
      const bad = split.badChar;
      return bad === GERESH
        ? `${where}: גרש ${describeChar(bad)} בלי אות`
        : `${where}: סימן ניקוד ${describeChar(bad)} בלי אות`;
    }
    const overMarked = strictMarks ? split.tiles.find((t) => !hasValidMarks(t)) : undefined;
    if (overMarked) return `${where}: יותר מדי סימני ניקוד על האות "${overMarked[0]}"`;
  }
  const { main, hint } = frontParts(text);
  if (!hasHebrewLetter(main)) return part === 0 && parens ? 'חסרה מילה בעברית מחוץ לסוגריים' : `${where}: אין מילה בעברית`;
  if (parens && hint === null) return 'סוגריים ריקים — כתבו בהם הערה או מחקו אותם';
  if (visibleLength(text) > MAX_CHARS) return `"${text}" ארוך מ-${MAX_CHARS} תווים`;
  return null;
}

/** Checks the foreign word; returns its language, or an error. */
function checkForeign(word: string): { lang: ForeignLang } | { error: string } {
  const lang = detectLang(word);
  if (lang === 'mixed') return { error: 'בחלק השני יש גם ערבית וגם אנגלית — כתבו מילה בשפה אחת' };
  if (lang === null) {
    return { error: 'בחלק השני צריך את המילה בערבית או באנגלית, באותיות של השפה (ממנה הקול)' };
  }
  for (const char of word) {
    if (!allowedIn(lang, char)) {
      const hebrew = isMark(char) || hasHebrewLetter(char) ? ' (עברית)' : '';
      return { error: `בחלק השני: ${describeChar(char)}${hebrew} לא שייך למילה ב${LANGUAGES[lang].name}` };
    }
  }
  if (visibleLength(word) > MAX_CHARS) return { error: `"${word}" ארוך מ-${MAX_CHARS} תווים` };
  return { lang };
}

interface CardResult {
  card: Card | null;
  lang: ForeignLang | null;
  errors: string[];
  warnings: string[];
}

/** Normalizes and checks the parts of one line (`line` is for messages). */
function checkCard(rawParts: readonly string[], line: number, strictMarks: boolean): CardResult {
  const fail = (e: string): CardResult => ({ card: null, lang: null, errors: [`שורה ${line}: ${e}`], warnings: [] });
  if (rawParts.length === 1) return fail(`חסר ${SEPARATOR} בין המילה בעברית למילה בשפה השנייה`);
  if (rawParts.length > 3) {
    return fail(`יותר מ-3 חלקים — כתבו: עברית ${SEPARATOR} המילה בשפה השנייה ${SEPARATOR} קריאה באותיות עבריות (לא חובה)`);
  }
  const parts = rawParts.map((p) => cleanText(p).trim());
  if (parts.some((p) => p === '')) return fail(`חלק ריק בין סימני ה-${SEPARATOR}`);

  const errors: string[] = [];
  const warnings: string[] = [];
  const he = toGeresh(parts[0]);
  const heError = checkHebrew(he, 0, strictMarks);
  if (heError) errors.push(`שורה ${line}: ${heError}`);

  // The foreign word keeps its apostrophes ("don't"): a geresh belongs only to Hebrew letters.
  const word = normalizeLatinApostrophes(normalizeArabic(parts[1]));
  const foreign = checkForeign(word);
  if ('error' in foreign) errors.push(`שורה ${line}: ${foreign.error}`);
  else if (word.includes(TATWEEL)) {
    warnings.push(`שורה ${line}: בחלק השני יש קו מתיחה ${describeChar(TATWEEL)} — עדיף למחוק אותו`);
  }

  const read = parts[2] === undefined ? undefined : toGeresh(parts[2]);
  if (read !== undefined) {
    const readError = checkHebrew(read, 2, strictMarks);
    if (readError) errors.push(`שורה ${line}: ${readError}`);
  }

  if (errors.length || 'error' in foreign) return { card: null, lang: null, errors, warnings };
  const card: Card = read === undefined ? [he, word] : [he, word, read];
  return { card, lang: foreign.lang, errors, warnings };
}

/** Checks the whole list; `lines` are the parts of each line. */
function checkList(lines: readonly (readonly string[])[], strictMarks: boolean): ParseResult<FlashcardsData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cards: Card[] = [];
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  lines.forEach((parts, i) => {
    const r = checkCard(parts, i + 1, strictMarks);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (!r.card || !r.lang) return;
    cards.push(r.card);
    // The same Hebrew word twice is fine in two languages ("דוד" in Arabic and in English).
    const { main } = frontParts(r.card[0]);
    const key = `${main}\n${r.lang}`;
    if (seen.has(key) && !dupes.includes(main)) dupes.push(main);
    seen.set(key, main);
  });

  if (lines.length === 0) errors.push('לא הוזנו מילים');
  if (lines.length > MAX_CARDS) errors.push(`אפשר עד ${MAX_CARDS} שורות (הוזנו ${lines.length})`);
  if (dupes.length) warnings.push(`מילים שמופיעות פעמיים באותה שפה: ${dupes.join(', ')}`);

  return { data: errors.length ? null : { cards }, errors, warnings };
}

/** One card per line: "עברית | המילה בשפה השנייה | קריאה באותיות עבריות", the last part optional. */
export function parseFlashcards(text: string, { strictMarks = true } = {}): ParseResult<FlashcardsData> {
  const lines = cleanText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(SEPARATOR));
  return checkList(lines, strictMarks);
}

/** One line of editor text for a card; also its key for saved progress. */
export const cardLine = (card: Card): string => card.join(` ${SEPARATOR} `);

export const toText = (data: FlashcardsData): string => data.cards.map(cardLine).join('\n');

/** Validates stored or shared data by re-checking it with the same rules (without editor-only rules). */
export function deserializeFlashcards(raw: unknown, version: number): FlashcardsData | null {
  if (version !== 1) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const cards = (raw as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return null;
  const valid = cards.every(
    (c) =>
      Array.isArray(c) &&
      (c.length === 2 || c.length === 3) &&
      c.every((p) => typeof p === 'string' && !p.includes(SEPARATOR)),
  );
  if (!valid) return null;
  return checkList(cards as string[][], false).data;
}
