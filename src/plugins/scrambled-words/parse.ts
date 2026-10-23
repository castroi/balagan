import { normalizeText } from '../../core/unicode';
import type { ParseResult } from '../types';
import { checkWord, MAX_TILES } from '../shared/letter-game/word';

/** Any number of words from 1 to MAX_WORDS. */
export const MAX_WORDS = 20;
export { MAX_TILES };

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
    const checked = checkWord(word, strictMarks);
    if ('error' in checked) {
      errors.push(`שורה ${line}: ${checked.error}`);
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
