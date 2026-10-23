import { baseLetter, describeChar, hasValidMarks, isMark, normalizeText, splitTiles } from '../../core/unicode';
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

// Separators between the word and its letters: spaces, commas, periods, |, ; and the Arabic comma.
const SEPARATORS = /[\s,.|;،]+/;

/** One line per word: the word, then its confusing letters (e.g. "כַּעַס ק צ ה א"). */
export function parseConfusing(text: string, { strictMarks = true } = {}): ParseResult<ConfusingLettersData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: ConfusingItem[] = [];

  const lines = normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((raw, i) => {
    const line = i + 1;
    const [word, ...tokens] = raw.split(SEPARATORS).filter((t) => t.length > 0);
    if (word === undefined) {
      errors.push(`שורה ${line}: לא נמצאה מילה`);
      return;
    }
    const checked = checkWord(word, strictMarks);
    if ('error' in checked) {
      errors.push(`שורה ${line}: ${checked.error}`);
      return;
    }

    const inWord = new Set(checked.tiles.map(baseLetter));
    const kept = new Set<string>();
    const extras: string[] = [];
    let lineOk = true;
    for (const token of tokens) {
      const split = splitTiles(token);
      if (!split.ok) {
        errors.push(
          isMark(split.badChar)
            ? `שורה ${line}: סימן ניקוד ${describeChar(split.badChar)} בלי אות`
            : `שורה ${line}: התו ${describeChar(split.badChar)} אינו אות עברית`,
        );
        lineOk = false;
        continue;
      }
      if (split.tiles.length > 1) {
        errors.push(`שורה ${line}: "${token}" — כתבו אות אחת בכל פעם`);
        lineOk = false;
        continue;
      }
      if (strictMarks && !hasValidMarks(token)) {
        errors.push(`שורה ${line}: יותר מדי סימני ניקוד על האות "${token[0]}"`);
        lineOk = false;
        continue;
      }
      const base = baseLetter(token);
      if (inWord.has(base)) {
        warnings.push(`שורה ${line}: "${token}" כבר נמצאת במילה — לא תוצג`);
      } else if (kept.has(base)) {
        warnings.push(`שורה ${line}: "${token}" מופיעה פעמיים — תוצג פעם אחת`);
      } else {
        kept.add(base);
        extras.push(token);
      }
    }
    if (!lineOk) return;

    const total = checked.tiles.length + extras.length;
    if (total > MAX_LINE_TILES) {
      const over = total - MAX_LINE_TILES;
      errors.push(
        `שורה ${line}: ${total} אותיות (המילה + המבלבלות) — ${over === 1 ? 'מחקו אות אחת' : `מחקו ${over} אותיות`}`,
      );
      return;
    }
    if (extras.length === 0 && tokens.length === 0) {
      warnings.push(`שורה ${line}: אין אותיות מבלבלות ל"${word}"`);
    }
    items.push({ word, extras });
  });

  if (lines.length === 0) errors.push('לא הוזנו מילים');
  if (lines.length > MAX_WORDS) errors.push(`אפשר עד ${MAX_WORDS} מילים (הוזנו ${lines.length})`);
  const words = items.map((it) => it.word);
  const dupes = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
  if (dupes.length) warnings.push(`מילים שמופיעות פעמיים: ${dupes.join(', ')}`);

  return { data: errors.length ? null : { items }, errors, warnings };
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
  return parseConfusing(toText({ items: items as ConfusingItem[] }), { strictMarks: false }).data;
}
