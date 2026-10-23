import { describe, it, expect } from 'vitest';
import { describeChar, GERESH, hasValidMarks, normalizeText, splitTiles } from '../../src/core/unicode';

const tiles = (word: string) => {
  const r = splitTiles(normalizeText(word));
  if (!r.ok) throw new Error(`unexpected bad char ${r.badChar}`);
  return r.tiles;
};

describe('normalizeText', () => {
  it('removes direction marks and zero-width characters', () => {
    expect(normalizeText('‏כַּעַס‎﻿')).toBe(normalizeText('כַּעַס'));
  });

  it('gives the same result whatever order the niqqud marks were typed in', () => {
    // bet + dagesh + patah, typed in two different orders
    const a = 'בַּ';
    const b = 'בַּ';
    expect(normalizeText(a)).toBe(normalizeText(b));
  });

  it('splits presentation forms into letter + mark (שׁ U+FB2A)', () => {
    expect(normalizeText('שׁ')).toBe(normalizeText('שׁ'));
  });

  it('removes cantillation marks and unifies line endings', () => {
    expect(normalizeText('א֑ב\r\nג')).toBe('אב\nג');
  });
});

describe('splitTiles', () => {
  it('keeps each letter with its niqqud', () => {
    expect(tiles('מִצְטַעֵר')).toEqual(['מִ', 'צְ', 'טַ', 'עֵ', 'ר']);
  });

  it('keeps dagesh and shin dot with the letter', () => {
    const result = tiles('עַקְשָׁן');
    expect(result).toHaveLength(4);
    expect(result[2]).toBe(normalizeText('שָׁ'));
  });

  it('keeps final letters as typed', () => {
    expect(tiles('עֶלְבּוֹן').at(-1)).toBe('ן');
  });

  it('keeps a geresh with its letter, whichever apostrophe was typed', () => {
    // ASCII ', iPhone's curly ’ and ‘, and the Hebrew geresh ׳ all give the same tiles.
    const expected = tiles('ג׳ירפה');
    expect(expected[0]).toBe(`ג${GERESH}`);
    expect(tiles("ג'ירפה")).toEqual(expected);
    expect(tiles('ג\u2019ירפה')).toEqual(expected);
    expect(tiles('ג\u2018ירפה')).toEqual(expected);
  });

  it('rejects non-Hebrew characters', () => {
    const r = splitTiles(normalizeText('אבc'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.badChar).toBe('c');
  });

  it('rejects a mark with no letter before it', () => {
    expect(splitTiles(normalizeText('ָא')).ok).toBe(false);
  });
});

describe('hasValidMarks', () => {
  it('accepts normal niqqud, including shin dot + dagesh + vowel', () => {
    expect(hasValidMarks(normalizeText('שָּׁ'))).toBe(true);
    expect(hasValidMarks('א')).toBe(true);
  });

  it('rejects a repeated mark or too many marks on one letter', () => {
    expect(hasValidMarks('ב\u05BC\u05BC')).toBe(false);
    expect(hasValidMarks('ב' + '\u05BC'.repeat(500))).toBe(false);
    expect(hasValidMarks('ב\u05B0\u05B1\u05B2\u05B3\u05B4')).toBe(false);
  });
});

describe('describeChar', () => {
  it('quotes visible characters and shows invisible ones as a code point', () => {
    expect(describeChar('c')).toBe('"c"');
    expect(describeChar('!')).toBe('"!"');
    expect(describeChar('\u034F')).toBe('U+034F');
    expect(describeChar('\u05B8')).toBe('U+05B8');
  });
});
