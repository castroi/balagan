/** Validation of one word for a letter-tile game, shared by every such activity. */
import { describeChar, hasValidMarks, splitTiles } from '../../../core/unicode';
import { isScramblable } from '../../../core/shuffle';

export const MAX_TILES = 10;

/**
 * Checks an already-normalized word. Returns its tiles, or an error message
 * without the line number. `strictMarks: false` skips the marks-per-letter
 * check, for data saved before that rule existed.
 */
export function checkWord(word: string, strictMarks: boolean): { tiles: string[] } | { error: string } {
  const split = splitTiles(word);
  if (!split.ok) return { error: `התו ${describeChar(split.badChar)} אינו אות עברית` };
  const overMarked = strictMarks ? split.tiles.find((t) => !hasValidMarks(t)) : undefined;
  if (overMarked) return { error: `יותר מדי סימני ניקוד על האות "${overMarked[0]}"` };
  if (split.tiles.length > MAX_TILES) return { error: `"${word}" ארוכה מ-${MAX_TILES} אותיות` };
  if (!isScramblable(split.tiles)) {
    return { error: `אי אפשר לבלגן את "${word}" — צריך לפחות שתי אותיות שונות` };
  }
  return { tiles: split.tiles };
}
