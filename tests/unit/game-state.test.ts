import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/rng';
import { normalizeText } from '../../src/core/unicode';
import {
  completeWord,
  createWordRound,
  isValidProgress,
  newProgress,
  placeTile,
  type WordRound,
} from '../../src/plugins/scrambled-words/game-state';

const word = normalizeText('כַּעַס');

/** Id of a tray tile showing `text`. */
const idOf = (round: WordRound, text: string) => round.tray.find((t) => t?.text === text)!.id;

describe('word round', () => {
  it('starts scrambled with all slots empty', () => {
    const r = createWordRound(word, seededRng(1));
    expect(r.expected).toHaveLength(3);
    expect(r.slots).toEqual([null, null, null]);
    expect(r.tray.map((t) => t?.text).join('')).not.toBe(r.expected.join(''));
  });

  it('locks a correct tile in the next slot', () => {
    let r = createWordRound(word, seededRng(2));
    const res = placeTile(r, idOf(r, r.expected[0]));
    r = res.round;
    expect(res.result).toEqual({ kind: 'correct', slot: 0, complete: false });
    expect(r.slots[0]?.text).toBe(r.expected[0]);
    expect(r.tray.filter((t) => t === null)).toHaveLength(1);
  });

  it('rejects a wrong tile, counts a mistake and keeps it in the tray', () => {
    const r = createWordRound(word, seededRng(3));
    const res = placeTile(r, idOf(r, r.expected[2]));
    expect(res.result).toEqual({ kind: 'wrong', slot: 0 });
    expect(res.round.mistakes).toBe(1);
    expect(res.round.slots).toEqual([null, null, null]);
    expect(res.round.tray.every((t) => t !== null)).toBe(true);
  });

  it('completes the word when the last tile is placed', () => {
    let r = createWordRound(word, seededRng(4));
    let last = placeTile(r, idOf(r, r.expected[0]));
    for (const text of r.expected.slice(1)) {
      r = last.round;
      last = placeTile(r, idOf(r, text));
    }
    expect(last.result).toEqual({ kind: 'correct', slot: 2, complete: true });
    expect(last.round.mistakes).toBe(0);
  });

  it('treats identical-looking tiles as interchangeable', () => {
    let r = createWordRound('אבא', seededRng(5));
    // the "second" alef can go in slot 0
    const alefs = r.tray.filter((t) => t?.text === 'א').map((t) => t!.id);
    const res = placeTile(r, alefs[1]);
    expect(res.result.kind).toBe('correct');
    r = res.round;
    r = placeTile(r, idOf(r, 'ב')).round;
    const end = placeTile(r, alefs[0]);
    expect(end.result).toEqual({ kind: 'correct', slot: 2, complete: true });
  });

  it('ignores taps on tiles that are already placed', () => {
    const r = createWordRound(word, seededRng(6));
    const id = idOf(r, r.expected[0]);
    const placed = placeTile(r, id).round;
    expect(placeTile(placed, id).result).toEqual({ kind: 'ignored' });
  });
});

describe('round progress', () => {
  const words = ['כַּעַס', 'עָצוּב', 'פָּגַע'].map(normalizeText);

  it('creates a random order covering every word once', () => {
    const p = newProgress(words, seededRng(7));
    expect(p.order.slice().sort()).toEqual([0, 1, 2]);
    expect(isValidProgress(p, words)).toBe(true);
  });

  it('adds points and finishes after the last word', () => {
    let p = newProgress(words, seededRng(8));
    p = completeWord(p, 10);
    p = completeWord(p, 7);
    expect(p.done).toBe(false);
    p = completeWord(p, 5);
    expect(p).toMatchObject({ index: 3, roundPoints: 22, done: true });
  });

  it('is invalid once the words change, so a new round starts', () => {
    const p = newProgress(words, seededRng(9));
    expect(isValidProgress(p, [...words, 'חָדָשׁ'])).toBe(false);
    expect(isValidProgress(null, words)).toBe(false);
    expect(isValidProgress({ ...p, order: [0, 0, 1] }, words)).toBe(false);
  });
});
