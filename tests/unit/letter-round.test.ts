import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/rng';
import { normalizeText } from '../../src/core/unicode';
import { createRound, placeTile, type WordRound } from '../../src/plugins/shared/letter-game/round';
import { fingerprint, isValidProgress, newProgress } from '../../src/plugins/shared/letter-game/progress';

const word = normalizeText('כַּעַס');
const idOf = (round: WordRound, text: string) => round.tray.find((t) => t?.text === text)!.id;

/** Places the next correct tile. */
const solveNext = (round: WordRound, options = { dimWrong: true }) => {
  const slot = round.slots.indexOf(null);
  return placeTile(round, idOf(round, round.expected[slot]), options).round;
};

describe('round with confusing letters', () => {
  it('mixes the extras into the tray, marked as extra, with ids after the word tiles', () => {
    const r = createRound(word, ['ק', 'צ'], seededRng(3));
    expect(r.tray).toHaveLength(5);
    const extras = r.tray.filter((t) => t?.extra);
    expect(extras.map((t) => t!.text).sort()).toEqual(['צ', 'ק'].sort());
    expect(extras.map((t) => t!.id).sort()).toEqual([3, 4]);
    expect(r.slots).toHaveLength(3);
  });

  it('never shows the word letters in the correct order, for many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const r = createRound(word, ['ק', 'צ', 'ה'], seededRng(seed));
      const wordOrder = r.tray.filter((t) => !t!.extra).map((t) => t!.text);
      expect(wordOrder.join('')).not.toBe(r.expected.join(''));
    }
  });

  it('places extras at varying positions', () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      positions.add(createRound(word, ['ק'], seededRng(seed)).tray.findIndex((t) => t!.extra));
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it('a confusing letter is wrong: counted, dimmed for this slot, and remembered for the contrast card', () => {
    const r = createRound(word, ['ק'], seededRng(1));
    const q = idOf(r, 'ק');
    const { round, result } = placeTile(r, q, { dimWrong: true });
    expect(result).toEqual({ kind: 'wrong', slot: 0, extra: true });
    expect(round.mistakes).toBe(1);
    expect(round.dimmed).toEqual([q]);
    expect(round.confusions).toEqual([{ right: round.expected[0], wrong: 'ק' }]);
  });

  it('ignores a tap on a dimmed tile at the same slot', () => {
    const r = createRound(word, ['ק'], seededRng(1));
    const q = idOf(r, 'ק');
    const once = placeTile(r, q, { dimWrong: true }).round;
    const twice = placeTile(once, q, { dimWrong: true });
    expect(twice.result).toEqual({ kind: 'ignored' });
    expect(twice.round.mistakes).toBe(1);
  });

  it('brings dimmed tiles back when the slot is solved', () => {
    const r = createRound(word, ['ק'], seededRng(1));
    const dimmed = placeTile(r, idOf(r, 'ק'), { dimWrong: true }).round;
    const solved = solveNext(dimmed);
    expect(solved.dimmed).toEqual([]);
    expect(placeTile(solved, idOf(solved, 'ק'), { dimWrong: true }).result).toEqual({
      kind: 'wrong',
      slot: 1,
      extra: true,
    });
  });

  it('dims a wrong word letter too, but does not list it as a confusion', () => {
    const r = createRound(word, ['ק'], seededRng(1));
    const wrongWordLetter = r.expected[2];
    const { round, result } = placeTile(r, idOf(r, wrongWordLetter), { dimWrong: true });
    expect(result).toEqual({ kind: 'wrong', slot: 0 });
    expect(round.dimmed).toHaveLength(1);
    expect(round.confusions).toEqual([]);
  });

  it('records each confusion once', () => {
    let r = createRound(word, ['ק', 'צ'], seededRng(1));
    r = placeTile(r, idOf(r, 'ק'), { dimWrong: true }).round;
    r = placeTile(r, idOf(r, 'צ'), { dimWrong: true }).round;
    r = solveNext(r);
    r = placeTile(r, idOf(r, 'ק'), { dimWrong: true }).round;
    expect(r.confusions).toEqual([
      { right: r.expected[0], wrong: 'ק' },
      { right: r.expected[0], wrong: 'צ' },
      { right: r.expected[1], wrong: 'ק' },
    ]);
  });

  it('completes the word with the extras left in the tray', () => {
    let r = createRound(word, ['ק', 'צ'], seededRng(2));
    r = solveNext(r);
    r = solveNext(r);
    const slot = r.slots.indexOf(null);
    const last = placeTile(r, idOf(r, r.expected[slot]), { dimWrong: true });
    expect(last.result).toEqual({ kind: 'correct', slot: 2, complete: true });
    expect(last.round.tray.filter((t) => t !== null).every((t) => t!.extra)).toBe(true);
  });

  it('without dimWrong (Scrambled Words) a wrong tile can be tried again', () => {
    const r = createRound(word, [], seededRng(1));
    const id = idOf(r, r.expected[2]);
    const once = placeTile(r, id).round;
    expect(once.dimmed).toEqual([]);
    expect(placeTile(once, id).result.kind).toBe('wrong');
  });
});

describe('progress keyed by content', () => {
  it('fingerprint joins the keys, so Scrambled Words progress saved before stays valid', () => {
    const words = ['כַּעַס', 'עָצוּב'];
    expect(fingerprint(words)).toBe('כַּעַס\nעָצוּב');
    const p = newProgress(words, seededRng(1));
    expect(isValidProgress(p, words)).toBe(true);
    expect(isValidProgress(p, ['כַּעַס ק', 'עָצוּב'])).toBe(false);
  });
});
