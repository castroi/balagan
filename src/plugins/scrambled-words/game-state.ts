/**
 * Pure game logic for Scrambled Words — no DOM, fully unit-tested.
 */
import { splitTiles } from '../../core/unicode';
import { scrambleOrder, shuffle } from '../../core/shuffle';
import type { Rng } from '../../core/rng';

export interface Tile {
  id: number;
  text: string;
}

export interface WordRound {
  word: string;
  /** Correct tile text for each slot, in reading order (first = rightmost). */
  expected: string[];
  /** Tiles in the tray, in display order. null = already placed (keeps positions stable). */
  tray: (Tile | null)[];
  /** Placed tiles per slot. */
  slots: (Tile | null)[];
  mistakes: number;
}

export type PlaceResult =
  | { kind: 'correct'; slot: number; complete: boolean }
  | { kind: 'wrong'; slot: number }
  | { kind: 'ignored' };

export function createWordRound(word: string, rng: Rng): WordRound {
  const split = splitTiles(word);
  // Words are validated when saved or imported, so this only guards against a bug.
  if (!split.ok) throw new Error(`Invalid word reached the game: ${word}`);
  const expected = split.tiles;
  const order = scrambleOrder(expected, rng);
  return {
    word,
    expected,
    tray: order.map((i) => ({ id: i, text: expected[i] })),
    slots: expected.map(() => null),
    mistakes: 0,
  };
}

export const nextSlot = (round: WordRound): number => round.slots.indexOf(null);

export const isComplete = (round: WordRound): boolean => nextSlot(round) === -1;

/**
 * Places a tile in the next empty slot. Identical-looking tiles are
 * interchangeable because the check compares text, not tile identity.
 */
export function placeTile(round: WordRound, tileId: number): { round: WordRound; result: PlaceResult } {
  const slot = nextSlot(round);
  const trayIndex = round.tray.findIndex((t) => t?.id === tileId);
  if (slot === -1 || trayIndex === -1) return { round, result: { kind: 'ignored' } };

  const tile = round.tray[trayIndex] as Tile;
  if (tile.text !== round.expected[slot]) {
    return { round: { ...round, mistakes: round.mistakes + 1 }, result: { kind: 'wrong', slot } };
  }

  const tray = round.tray.slice();
  tray[trayIndex] = null;
  const slots = round.slots.slice();
  slots[slot] = tile;
  const next = { ...round, tray, slots };
  return { round: next, result: { kind: 'correct', slot, complete: isComplete(next) } };
}

/** Progress through the week's words, saved so a closed app can resume. */
export interface RoundProgress {
  /** Fingerprint of the words — progress resets when the words change. */
  fp: string;
  /** Random word order for this round (indices into the word list). */
  order: number[];
  /** Index into `order` of the current word. */
  index: number;
  roundPoints: number;
  done: boolean;
}

export const fingerprint = (words: readonly string[]): string => words.join('\n');

export function newProgress(words: readonly string[], rng: Rng): RoundProgress {
  return {
    fp: fingerprint(words),
    order: shuffle(
      words.map((_, i) => i),
      rng,
    ),
    index: 0,
    roundPoints: 0,
    done: false,
  };
}

export function isValidProgress(p: unknown, words: readonly string[]): p is RoundProgress {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Partial<RoundProgress>;
  if (r.fp !== fingerprint(words)) return false;
  if (!Array.isArray(r.order) || r.order.length !== words.length) return false;
  const sorted = r.order.slice().sort((a, b) => a - b);
  if (!sorted.every((v, i) => v === i)) return false;
  return (
    typeof r.index === 'number' &&
    Number.isInteger(r.index) &&
    r.index >= 0 &&
    r.index <= words.length &&
    typeof r.roundPoints === 'number' &&
    typeof r.done === 'boolean' &&
    // A finished round must be marked done, and only a finished round.
    r.done === r.index >= words.length
  );
}

export function completeWord(p: RoundProgress, points: number): RoundProgress {
  const index = p.index + 1;
  return { ...p, index, roundPoints: p.roundPoints + points, done: index >= p.order.length };
}
