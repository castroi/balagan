/**
 * Pure logic for one word of a letter-tile game — no DOM, fully unit-tested.
 * Used by "מילים מבולגנות" (no extra letters) and "אותיות מבלבלות" (with
 * extra, confusing letters mixed into the tray).
 */
import { baseLetter, splitTiles } from '../../../core/unicode';
import { scrambleOrder, shuffle } from '../../../core/shuffle';
import type { Rng } from '../../../core/rng';

export interface Tile {
  id: number;
  text: string;
  /** True for a confusing letter that isn't part of the word. */
  extra: boolean;
}

/** A confusing letter the kid tried where a word letter belongs. */
export interface Confusion {
  right: string;
  wrong: string;
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
  /**
   * Letters (tile text) already tried at the current slot, dimmed until that
   * slot is solved. By text, so every identical-looking tile dims together.
   */
  dimmed: string[];
  /** Confusing letters tried instead of the right one, shown after the word (at most MAX_CONFUSIONS). */
  confusions: Confusion[];
}

export type PlaceResult =
  | { kind: 'correct'; slot: number; complete: boolean }
  | { kind: 'wrong'; slot: number; extra?: true }
  | { kind: 'ignored' };

export interface PlaceOptions {
  /** Dim a wrong tile until the current slot is solved (it can't be tapped again there). */
  dimWrong?: boolean;
}

/** The contrast card after a word shows at most this many pairs (they fit in one row on a small phone). */
export const MAX_CONFUSIONS = 3;

// Letters that sound alike (base letters, final = regular). Used to pair a
// confusing letter with the word letter it was mixed up with.
const SOUND_GROUPS = [['א', 'ע', 'ה'], ['ס', 'שׂ', 'צ'], ['כ', 'ק', 'ח'], ['ת', 'ט'], ['ב', 'ו']];
const soundsAlike = (a: string, b: string): boolean => {
  const x = baseLetter(a);
  const y = baseLetter(b);
  return x === y || SOUND_GROUPS.some((g) => g.includes(x) && g.includes(y));
};

/**
 * The right letter to show next to a confusing one: the word letter it sounds
 * like (e.g. ס for צ in כַּעַס), otherwise the letter that was needed.
 */
function rightLetterFor(round: WordRound, wrong: string, slot: number): string {
  return round.expected.find((t) => soundsAlike(t, wrong)) ?? round.expected[slot];
}

/**
 * Builds the tray: the word's own tiles never in the correct (or, when
 * avoidable, reversed) order — checked on the word tiles alone — with the
 * extra letters mixed in at random positions.
 */
export function createRound(word: string, extras: readonly string[], rng: Rng): WordRound {
  const split = splitTiles(word);
  // Words are validated when saved or imported, so this only guards against a bug.
  if (!split.ok) throw new Error(`Invalid word reached the game: ${word}`);
  const expected = split.tiles;
  const wordTiles = scrambleOrder(expected, rng).map((i): Tile => ({ id: i, text: expected[i], extra: false }));
  const extraTiles = shuffle(
    extras.map((text, j): Tile => ({ id: expected.length + j, text, extra: true })),
    rng,
  );
  const pattern = shuffle([...wordTiles.map(() => 'w'), ...extraTiles.map(() => 'e')], rng);
  let w = 0;
  let e = 0;
  const tray = pattern.map((kind) => (kind === 'w' ? wordTiles[w++] : extraTiles[e++]));
  return { word, expected, tray, slots: expected.map(() => null), mistakes: 0, dimmed: [], confusions: [] };
}

export const nextSlot = (round: WordRound): number => round.slots.indexOf(null);

export const isComplete = (round: WordRound): boolean => nextSlot(round) === -1;

/**
 * Places a tile in the next empty slot. Identical-looking tiles are
 * interchangeable because the check compares text, not tile identity.
 */
export function placeTile(
  round: WordRound,
  tileId: number,
  options: PlaceOptions = {},
): { round: WordRound; result: PlaceResult } {
  const slot = nextSlot(round);
  const trayIndex = round.tray.findIndex((t) => t?.id === tileId);
  const tile = round.tray[trayIndex];
  if (slot === -1 || !tile || round.dimmed.includes(tile.text)) {
    return { round, result: { kind: 'ignored' } };
  }

  if (tile.text !== round.expected[slot]) {
    // Each confusing letter is shown once after the word, and only a few pairs in all.
    const record =
      tile.extra && round.confusions.length < MAX_CONFUSIONS && !round.confusions.some((c) => c.wrong === tile.text);
    return {
      round: {
        ...round,
        mistakes: round.mistakes + 1,
        dimmed: options.dimWrong ? [...round.dimmed, tile.text] : round.dimmed,
        confusions: record
          ? [...round.confusions, { right: rightLetterFor(round, tile.text, slot), wrong: tile.text }]
          : round.confusions,
      },
      result: tile.extra ? { kind: 'wrong', slot, extra: true } : { kind: 'wrong', slot },
    };
  }

  const tray = round.tray.slice();
  tray[trayIndex] = null;
  const slots = round.slots.slice();
  slots[slot] = tile;
  // A solved slot gives every dimmed tile a fresh chance at the next one.
  const next = { ...round, tray, slots, dimmed: [] };
  return { round: next, result: { kind: 'correct', slot, complete: isComplete(next) } };
}
