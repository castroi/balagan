import { baseLetter, describeChar, GERESH, hasValidMarks, isMark, normalizeText, splitTiles } from '../../core/unicode';
import type { ParseResult } from '../types';
import { checkWord, MAX_TILES } from '../shared/letter-game/word';

/** Any number of words from 1 to MAX_WORDS. */
export const MAX_WORDS = 20;
/** Word letters + confusing letters on one line; 15 tiles fit on a small phone (3 rows of 5). */
export const MAX_LINE_TILES = 15;
export { MAX_TILES };

export interface ConfusingItem {
  word: string;
  /** Extra letters shown with the word's own letters, exactly as typed. */
  extras: string[];
}

export interface ConfusingLettersData {
  items: ConfusingItem[];
}

// Separators between the word and its letters: spaces, commas, periods, |, ;, /, -,
// the Hebrew maqaf and the Arabic comma.
const SEPARATORS = /[\s,.|;/\-\u05BE\u060C]+/;

/**
 * Same letter on a tile, for dropping a confusing letter that's already in the
 * word: niqqud ignored, final = regular, and a plain ש counts as שׁ and שׂ
 * (without its dot it looks the same).
 */
function sameLetter(a: string, b: string): boolean {
  const x = baseLetter(a);
  const y = baseLetter(b);
  return x === y || (x[0] === 'ש' && y[0] === 'ש' && (x.length === 1 || y.length === 1));
}

interface LineResult {
  item: ConfusingItem | null;
  errors: string[];
  warnings: string[];
}

/** Checks one word and its confusing letters (`line` is for messages). */
function checkItem(word: string, tokens: readonly string[], line: number, strictMarks: boolean): LineResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checked = checkWord(word, strictMarks);
  if ('error' in checked) return { item: null, errors: [`שורה ${line}: ${checked.error}`], warnings };

  const extras: string[] = [];
  for (const token of tokens) {
    const split = splitTiles(token);
    if (!split.ok) {
      const bad = split.badChar;
      errors.push(
        bad === GERESH
          ? `שורה ${line}: גרש ${describeChar(bad)} בלי אות`
          : isMark(bad)
            ? `שורה ${line}: סימן ניקוד ${describeChar(bad)} בלי אות`
            : `שורה ${line}: התו ${describeChar(bad)} אינו אות עברית`,
      );
    } else if (split.tiles.length !== 1) {
      errors.push(`שורה ${line}: "${token}" — כתבו אות אחת בכל פעם`);
    } else if (strictMarks && !hasValidMarks(token)) {
      errors.push(`שורה ${line}: יותר מדי סימני ניקוד על האות "${token[0]}"`);
    } else if (checked.tiles.some((t) => sameLetter(t, token))) {
      warnings.push(`שורה ${line}: "${token}" כבר נמצאת במילה — לא תוצג`);
    } else if (extras.some((e) => sameLetter(e, token))) {
      warnings.push(`שורה ${line}: "${token}" מופיעה פעמיים — תוצג פעם אחת`);
    } else {
      extras.push(token);
    }
  }
  if (errors.length) return { item: null, errors, warnings };

  const total = checked.tiles.length + extras.length;
  if (total > MAX_LINE_TILES) {
    const over = total - MAX_LINE_TILES;
    const fix = over === 1 ? 'מחקו אות אחת' : `מחקו ${over} אותיות`;
    return { item: null, errors: [`שורה ${line}: ${total} אותיות (המילה + המבלבלות) — ${fix}`], warnings };
  }
  if (tokens.length === 0) warnings.push(`שורה ${line}: אין אותיות מבלבלות ל"${word}"`);
  return { item: { word, extras }, errors, warnings };
}

/** Checks the whole list; `entries` are [word, letters] pairs, one per line. */
function checkList(
  entries: readonly (readonly [string | undefined, readonly string[]])[],
  strictMarks: boolean,
): ParseResult<ConfusingLettersData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: ConfusingItem[] = [];
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

/** One line per word: the word, then its confusing letters (e.g. "כַּעַס ק צ ה א"). */
export function parseConfusing(text: string, { strictMarks = true } = {}): ParseResult<ConfusingLettersData> {
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
export const itemLine = (item: ConfusingItem): string => [item.word, ...item.extras].join(' ');

export const toText = (data: ConfusingLettersData): string => data.items.map(itemLine).join('\n');

/** Validates stored or shared data by re-parsing it with the same rules (without editor-only rules). */
export function deserializeConfusing(raw: unknown, version: number): ConfusingLettersData | null {
  if (version !== 1) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const valid = items.every(
    (it) =>
      typeof it === 'object' &&
      it !== null &&
      typeof (it as ConfusingItem).word === 'string' &&
      Array.isArray((it as ConfusingItem).extras) &&
      (it as ConfusingItem).extras.every((e) => typeof e === 'string'),
  );
  if (!valid) return null;
  // Each stored field is checked as it is (not re-split), without editor-only rules.
  const entries = (items as ConfusingItem[]).map(
    (it) => [normalizeText(it.word), it.extras.map((e) => normalizeText(e))] as const,
  );
  return checkList(entries, false).data;
}
