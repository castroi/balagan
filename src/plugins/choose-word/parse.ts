import { describeChar, GERESH, hasValidMarks, isMark, normalizeText, splitTiles } from '../../core/unicode';
import type { ParseResult } from '../types';

/** Any number of words from 1 to MAX_WORDS. */
export const MAX_WORDS = 20;
/** Wrong words per line: 1 to 3, so the kid chooses between 2 and 4 words. */
export const MAX_WRONG = 3;
/** Letters per word (niqqud doesn't count): fits one full-width button on a small phone. */
export const MAX_LETTERS = 10;

export interface ChooseItem {
  /** The correct word: spoken, and one of the options. */
  word: string;
  /** Wrong spellings shown next to it, exactly as typed. */
  wrong: string[];
}

export interface ChooseWordData {
  items: ChooseItem[];
}

// Same separators as Confusing Letters: spaces, commas, periods, |, ;, /, -,
// the Hebrew maqaf and the Arabic comma.
const SEPARATORS = /[\s,.|;/\-־،]+/;
// Niqqud, dagesh and shin/sin dots — anything that marks a word as "with niqqud".
const MARKS = /[ְ-ׇֽֿׁׂׅׄ]/;

const hasMarks = (word: string) => MARKS.test(word);

/** Checks one already-normalized word; returns an error without the line number, or null. */
function checkWord(word: string, strictMarks: boolean): string | null {
  const split = splitTiles(word);
  if (!split.ok) {
    const bad = split.badChar;
    if (bad === GERESH) return `גרש ${describeChar(bad)} בלי אות`;
    if (isMark(bad)) return `סימן ניקוד ${describeChar(bad)} בלי אות`;
    return `התו ${describeChar(bad)} אינו אות עברית`;
  }
  const overMarked = strictMarks ? split.tiles.find((t) => !hasValidMarks(t)) : undefined;
  if (overMarked) return `יותר מדי סימני ניקוד על האות "${overMarked[0]}"`;
  if (split.tiles.length > MAX_LETTERS) return `"${word}" ארוכה מ-${MAX_LETTERS} אותיות`;
  return null;
}

interface LineResult {
  item: ChooseItem | null;
  errors: string[];
  warnings: string[];
}

/** Checks one line: the correct word and its wrong words (`line` is for messages). */
function checkItem(word: string, tokens: readonly string[], line: number, strictMarks: boolean): LineResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const wordError = checkWord(word, strictMarks);
  if (wordError) errors.push(`שורה ${line}: ${wordError}`);

  const wrong: string[] = [];
  for (const token of tokens) {
    const error = checkWord(token, strictMarks);
    if (error) errors.push(`שורה ${line}: ${error}`);
    else if (token === word) warnings.push(`שורה ${line}: "${token}" זהה למילה הנכונה — לא תוצג`);
    else if (wrong.includes(token)) warnings.push(`שורה ${line}: "${token}" מופיעה פעמיים — תוצג פעם אחת`);
    else wrong.push(token);
  }
  if (errors.length) return { item: null, errors, warnings };

  if (wrong.length === 0) {
    return { item: null, errors: [`שורה ${line}: אין מילים שגויות ל"${word}" — כתבו לפחות אחת`], warnings };
  }
  if (wrong.length > MAX_WRONG) {
    const over = wrong.length - MAX_WRONG;
    const fix = over === 1 ? 'מחקו מילה אחת' : `מחקו ${over} מילים`;
    return { item: null, errors: [`שורה ${line}: ${wrong.length} מילים שגויות, אפשר עד ${MAX_WRONG} — ${fix}`], warnings };
  }
  if (wrong.length === 1) warnings.push(`שורה ${line}: רק מילה שגויה אחת — הילד יבחר בין 2 מילים`);
  const options = [word, ...wrong];
  if (options.some(hasMarks) && !options.every(hasMarks)) {
    warnings.push(`שורה ${line}: רק לחלק מהמילים יש ניקוד — כך קל לזהות את התשובה`);
  }
  return { item: { word, wrong }, errors, warnings };
}

/** Checks the whole list; `entries` are [word, wrong words] pairs, one per line. */
function checkList(
  entries: readonly (readonly [string | undefined, readonly string[]])[],
  strictMarks: boolean,
): ParseResult<ChooseWordData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: ChooseItem[] = [];
  entries.forEach(([word, tokens], i) => {
    if (word === undefined) {
      errors.push(`שורה ${i + 1}: לא נמצאה מילה`);
      return;
    }
    const r = checkItem(word, tokens, i + 1, strictMarks);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.item) items.push(r.item);
  });

  if (entries.length === 0) errors.push('לא הוזנו מילים');
  if (entries.length > MAX_WORDS) errors.push(`אפשר עד ${MAX_WORDS} מילים (הוזנו ${entries.length})`);
  const words = items.map((it) => it.word);
  const dupes = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
  if (dupes.length) warnings.push(`מילים שמופיעות פעמיים: ${dupes.join(', ')}`);

  return { data: errors.length ? null : { items }, errors, warnings };
}

/** One line per word: the correct word, then its wrong words (e.g. "כַּעַס קַעַס כַּאַס"). */
export function parseChooseWord(text: string, { strictMarks = true } = {}): ParseResult<ChooseWordData> {
  const entries = normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const [word, ...tokens] = l.split(SEPARATORS).filter((t) => t.length > 0);
      return [word, tokens] as const;
    });
  return checkList(entries, strictMarks);
}

/** One line of editor text for an item; also its key for saved progress. */
export const itemLine = (item: ChooseItem): string => [item.word, ...item.wrong].join(' ');

export const toText = (data: ChooseWordData): string => data.items.map(itemLine).join('\n');

/** Validates stored or shared data by re-checking it with the same rules (without editor-only rules). */
export function deserializeChooseWord(raw: unknown, version: number): ChooseWordData | null {
  if (version !== 1) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const valid = items.every(
    (it) =>
      typeof it === 'object' &&
      it !== null &&
      typeof (it as ChooseItem).word === 'string' &&
      Array.isArray((it as ChooseItem).wrong) &&
      (it as ChooseItem).wrong.every((w) => typeof w === 'string'),
  );
  if (!valid) return null;
  // Each stored field is checked as it is (not re-split), without editor-only rules.
  const entries = (items as ChooseItem[]).map(
    (it) => [normalizeText(it.word), it.wrong.map((w) => normalizeText(w))] as const,
  );
  return checkList(entries, false).data;
}
