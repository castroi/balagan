/** One word of "בחרו את המילה": pure logic, no DOM. */
import { shuffle } from '../../core/shuffle';
import { splitTiles } from '../../core/unicode';
import type { Rng } from '../../core/rng';

/** Above this many letters in any option, the options take one full-width column. */
export const TWO_COLUMN_MAX_LETTERS = 7;

export interface ChoiceRound {
  /** The correct word (spoken). */
  word: string;
  /** The correct word and the wrong ones, in random order. Never reshuffled during the word. */
  options: readonly string[];
  /** Wrong options already tapped, in the order they were tried (dimmed). */
  tried: readonly string[];
  mistakes: number;
  solved: boolean;
}

export type ChooseResult = 'ignored' | 'wrong' | 'correct';

export function createChoiceRound(word: string, wrong: readonly string[], rng: Rng): ChoiceRound {
  return { word, options: shuffle([word, ...wrong], rng), tried: [], mistakes: 0, solved: false };
}

/**
 * The kid taps an option. A dimmed (already tried) option, an unknown one, or
 * any tap after the word is solved is ignored — not a mistake.
 */
export function choose(round: ChoiceRound, option: string): { round: ChoiceRound; result: ChooseResult } {
  if (round.solved || !round.options.includes(option) || round.tried.includes(option)) {
    return { round, result: 'ignored' };
  }
  if (option === round.word) return { round: { ...round, solved: true }, result: 'correct' };
  return { round: { ...round, tried: [...round.tried, option], mistakes: round.mistakes + 1 }, result: 'wrong' };
}

/** 2 columns, or 1 when an option is too long to stay big and readable (niqqud included) in half the width. */
export function columnsFor(options: readonly string[]): 1 | 2 {
  const letters = (w: string) => {
    const split = splitTiles(w);
    return split.ok ? split.tiles.length : w.length;
  };
  return options.some((o) => letters(o) > TWO_COLUMN_MAX_LETTERS) ? 1 : 2;
}
