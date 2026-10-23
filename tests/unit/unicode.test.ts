import { describe, it, expect } from 'vitest';
import { normalizeText, splitTiles } from '../../src/core/unicode';

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

  it('keeps a geresh with its letter', () => {
    expect(tiles("ג'ירפה")[0]).toBe("ג'");
    expect(tiles('ג׳ירפה')[0]).toBe('ג׳');
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
