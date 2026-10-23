import { describe, it, expect } from 'vitest';
import { isScramblable, scrambleOrder, shuffle } from '../../src/core/shuffle';
import { seededRng } from '../../src/core/rng';

const show = (tiles: string[], order: number[]) => order.map((i) => tiles[i]).join('');
const isPermutation = (order: number[], n: number) =>
  order.length === n && order.slice().sort((a, b) => a - b).every((v, i) => v === i);

describe('shuffle', () => {
  it('returns a permutation and leaves the input unchanged', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seededRng(1));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(out.slice().sort()).toEqual(input);
  });
});

describe('scrambleOrder', () => {
  const words: string[][] = [
    ['מִ', 'צְ', 'טַ', 'עֵ', 'ר'],
    ['כַּ', 'עַ', 'ס'],
    ['א', 'ב', 'א'], // repeated letter
    ['א', 'א', 'ב', 'ב'],
    ['ש', 'ל', 'ו', 'ם', 'ע', 'ו', 'ל', 'ם', 'ט', 'ו'], // 10 tiles
  ];

  for (const tiles of words) {
    it(`never shows the correct order or the reversed word: ${tiles.join('')}`, () => {
      const correct = tiles.join('');
      const reversed = tiles.slice().reverse().join('');
      for (let seed = 0; seed < 300; seed++) {
        const order = scrambleOrder(tiles, seededRng(seed));
        expect(isPermutation(order, tiles.length)).toBe(true);
        const shown = show(tiles, order);
        expect(shown).not.toBe(correct);
        if (reversed !== correct && tiles.length > 2) expect(shown).not.toBe(reversed);
      }
    });
  }

  it('uses the reversed order for a two-letter word (the only other option)', () => {
    const order = scrambleOrder(['א', 'ב'], seededRng(3));
    expect(order).toEqual([1, 0]);
  });

  it('still finishes when the random generator always returns the same value', () => {
    const stuck = () => 0.999999;
    const tiles = ['א', 'ב', 'ג', 'ד'];
    const order = scrambleOrder(tiles, stuck);
    expect(show(tiles, order)).not.toBe('אבגד');
    expect(show(tiles, order)).not.toBe('דגבא');
  });

  it('returns the original order for a word that cannot be scrambled', () => {
    expect(isScramblable(['א', 'א'])).toBe(false);
    expect(isScramblable(['א'])).toBe(false);
    expect(scrambleOrder(['א', 'א'], seededRng(1))).toEqual([0, 1]);
  });
});
