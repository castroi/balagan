/**
 * Hebrew text handling: cleaning pasted text and splitting a word into tiles.
 *
 * A tile is one Hebrew letter together with every mark that belongs to it
 * (niqqud, dagesh, shin/sin dot) and an optional geresh (ג׳ / ג').
 */

// Zero-width and direction-control characters that sneak in when copying text.
const INVISIBLE = /[­​-‏‪-‮⁠⁦-⁩﻿]/g;
// Cantillation marks (te'amim) — not used for spelling, removed.
const CANTILLATION = /[֑-֯]/g;

const LETTER = '\\u05D0-\\u05EA';
// Niqqud and points: sheva…qubuts, dagesh, meteg, rafe, shin/sin dots, qamats qatan, etc.
const MARKS = '\\u05B0-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7';
const GERESH = "\\u05F3'";

const TILE = new RegExp(`[${LETTER}][${MARKS}${GERESH}]*`, 'y');

/**
 * Cleans pasted text so the same word always produces the same characters,
 * whatever app it was copied from. NFC also puts niqqud marks in one canonical
 * order and splits presentation forms (e.g. U+FB2A "שׁ") into letter + mark.
 */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(INVISIBLE, '')
    .replace(CANTILLATION, '')
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
