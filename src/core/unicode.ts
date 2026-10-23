/**
 * Hebrew text handling: cleaning pasted text and splitting a word into tiles.
 *
 * A tile is one Hebrew letter together with every mark that belongs to it
 * (niqqud, dagesh, shin/sin dot) and an optional geresh (ג׳).
 */

// Zero-width and direction-control characters that sneak in when copying text.
const INVISIBLE = /[­​-‏‪-‮⁠⁦-⁩﻿]/g;
// Cantillation marks (te'amim) — not used for spelling, removed.
const CANTILLATION = /[֑-֯]/g;
// Apostrophes used for a geresh: ASCII, and the curly ones iPhone "smart punctuation" types.
const APOSTROPHES = /['‘’]/g;
export const GERESH = '׳';

const LETTER = '\\u05D0-\\u05EA';
// Niqqud and points: sheva…qubuts, dagesh, meteg, rafe, shin/sin dots, qamats qatan, etc.
const MARK_CLASS = '\\u05B0-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7';
const MARK = new RegExp(`[${MARK_CLASS}]`, 'g');

const TILE = new RegExp(`[${LETTER}][${MARK_CLASS}${GERESH}]*`, 'y');

/** A real letter carries at most a few marks (e.g. shin dot + dagesh + vowel). */
export const MAX_MARKS_PER_LETTER = 4;

/**
 * Cleans pasted text so the same word always produces the same characters,
 * whatever app it was copied from. NFC also puts niqqud marks in one canonical
 * order and splits presentation forms (e.g. U+FB2A "שׁ") into letter + mark.
 * Every kind of apostrophe becomes the Hebrew geresh (׳).
 */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(INVISIBLE, '')
    .replace(CANTILLATION, '')
    .replace(APOSTROPHES, GERESH)
    .normalize('NFC');
}

export type SplitResult =
  | { ok: true; tiles: string[] }
  | { ok: false; badChar: string };

/** Splits an already-normalized word into tiles. */
export function splitTiles(word: string): SplitResult {
  const tiles: string[] = [];
  let pos = 0;
  while (pos < word.length) {
    TILE.lastIndex = pos;
    const match = TILE.exec(word);
    if (!match) {
      const badChar = String.fromCodePoint(word.codePointAt(pos) ?? 0);
      return { ok: false, badChar };
    }
    tiles.push(match[0]);
    pos = TILE.lastIndex;
  }
  return { ok: true, tiles };
}

/** False when a tile has too many marks or the same mark twice (pasting mistakes). */
export function hasValidMarks(tile: string): boolean {
  const marks = tile.match(MARK) ?? [];
  return marks.length <= MAX_MARKS_PER_LETTER && new Set(marks).size === marks.length;
}

/**
 * How to show a character in an error message: the character itself when it's
 * visible, otherwise its code point (e.g. "U+034F"), so the parent can see it.
 */
export function describeChar(char: string): string {
  const visible = /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(char);
  const code = `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
  return visible ? `"${char}"` : code;
}
