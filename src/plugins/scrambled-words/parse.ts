import { describeChar, hasValidMarks, normalizeText, splitTiles } from '../../core/unicode';
import { isScramblable } from '../../core/shuffle';
import type { ParseResult } from '../types';

/** Any number of words from 1 to MAX_WORDS. */
export const MAX_WORDS = 20;
export const MAX_TILES = 10;

export interface ScrambledWordsData {
  words: string[];
}

/**
 * One word per line. Words are kept exactly as typed (after cleanup).
 * `strictMarks: false` skips the marks-per-letter check, so words saved or
 * shared before that rule existed keep working; the editor always checks.
 */
export function parseWords(text: string, { strictMarks = true } = {}): ParseResult<ScrambledWordsData> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const words: string[] = [];

  const lines = normalizeText(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((word, i) => {
    const line = i + 1;
    if (/\s/.test(word)) {
      errors.push(`שורה ${line}: יש לכתוב מילה אחת בלבד בכל שורה`);
      return;
    }
    const split = splitTiles(word);
    if (!split.ok) {
      errors.push(`שורה ${line}: התו ${describeChar(split.badChar)} אינו אות עברית`);
      return;
    }
    const overMarked = strictMarks ? split.tiles.find((t) => !hasValidMarks(t)) : undefined;
    if (overMarked) {
      errors.push(`שורה ${line}: יותר מדי סימני ניקוד על האות "${overMarked[0]}"`);
      return;
    }
    if (split.tiles.length > MAX_TILES) {
      errors.push(`שורה ${line}: "${word}" ארוכה מ-${MAX_TILES} אותיות`);
      return;
    }
    if (!isScramblable(split.tiles)) {
      errors.push(`שורה ${line}: אי אפשר לבלגן את "${word}" — צריך לפחות שתי אותיות שונות`);
      return;
    }
    words.push(word);
  });

  if (lines.length === 0) errors.push('לא הוזנו מילים');
  if (lines.length > MAX_WORDS) errors.push(`אפשר עד ${MAX_WORDS} מילים (הוזנו ${lines.length})`);
  const dupes = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
  if (dupes.length) warnings.push(`מילים שמופיעות פעמיים: ${dupes.join(', ')}`);

  return { data: errors.length ? null : { words }, errors, warnings };
}

/** Validates stored or shared data by re-parsing it with the same rules. */
export function deserializeWords(raw: unknown, version: number): ScrambledWordsData | null {
  if (version !== 1) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const words = (raw as { words?: unknown }).words;
  if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) return null;
  return parseWords(words.join('\n'), { strictMarks: false }).data;
}
