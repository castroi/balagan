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
  return toGeresh(cleanText(input));
}

/**
 * The same cleaning as `normalizeText`, but apostrophes are left alone — for
 * text that isn't all Hebrew (e.g. "don't" in English), where a geresh is wrong.
 */
export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(INVISIBLE, '')
    // Arabic Letter Mark: an invisible direction mark, like the ones above.
    .replace(/؜/g, '')
    .replace(CANTILLATION, '')
    .normalize('NFC');
}

/** Every apostrophe (ASCII or curly) becomes the Hebrew geresh ׳. */
export const toGeresh = (text: string): string => text.replace(APOSTROPHES, GERESH);

/** Runs of Hebrew letters with their marks and gereshes (the words inside a longer text). */
export const hebrewRuns = (text: string): string[] =>
  text.match(new RegExp(`[${LETTER}${MARK_CLASS}${GERESH}]+`, 'g')) ?? [];

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

/** False when a tile has too many marks, the same mark twice, or two gereshes (pasting mistakes). */
export function hasValidMarks(tile: string): boolean {
  const marks = tile.match(MARK) ?? [];
  const gereshes = tile.split(GERESH).length - 1;
  return marks.length <= MAX_MARKS_PER_LETTER && new Set(marks).size === marks.length && gereshes <= 1;
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

// Final forms and their regular letters: ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ.
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
// Niqqud and dagesh. Not the shin/sin dots or the geresh: שׁ/שׂ and ג/ג׳ are different letters.
const NIQQUD = /[\u05B0-\u05BD\u05BF\u05C4\u05C5\u05C7]/g;

/**
 * The letter a tile shows, ignoring niqqud and dagesh, with final forms
 * equal to their regular forms. Used to spot an extra letter that's already in
 * the word (e.g. "ץ" and "צָ" are both "צ").
 */
export function baseLetter(tile: string): string {
  const letter = tile.replace(NIQQUD, '');
  return (FINALS[letter[0]] ?? letter[0]) + letter.slice(1);
}

/** True for a niqqud mark (or geresh) — a character that needs a letter before it. */
export const isMark = (char: string): boolean => new RegExp(`^[${MARK_CLASS}${GERESH}]$`).test(char);
