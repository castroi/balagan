import type { Rng } from './rng';

/** Returns a shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A word can be scrambled only if its tiles are not all identical. */
export function isScramblable(tiles: readonly string[]): boolean {
  return new Set(tiles).size > 1;
}

const sameText = (tiles: readonly string[], order: readonly number[], target: readonly string[]) =>
  order.every((idx, pos) => tiles[idx] === target[pos]);

const MAX_RANDOM_TRIES = 60;

/**
 * Returns an order of tile indices whose visible text differs from the correct
 * spelling, and — when another arrangement exists — also differs from the word
 * reversed (an easy giveaway in a right-to-left layout).
 * Tiles are compared by text, so swapping two identical letters does not count.
 * For a word that cannot be scrambled the original order is returned.
 */
export function scrambleOrder(tiles: readonly string[], rng: Rng): number[] {
  const identity = tiles.map((_, i) => i);
  if (!isScramblable(tiles)) return identity;

  const reversed = tiles.slice().reverse();
  const isGood = (order: number[], avoidReversed: boolean) =>
    !sameText(tiles, order, tiles) && !(avoidReversed && sameText(tiles, order, reversed));

  for (let i = 0; i < MAX_RANDOM_TRIES; i++) {
    const order = shuffle(identity, rng);
    if (isGood(order, true)) return order;
  }

  // Deterministic fallback: rotations, then single swaps.
  const candidates: number[][] = [];
  for (let k = 1; k < tiles.length; k++) {
    candidates.push(identity.map((_, i) => identity[(i + k) % tiles.length]));
  }
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) {
      const swapped = identity.slice();
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      candidates.push(swapped);
    }
  }
  const strict = candidates.find((c) => isGood(c, true));
  if (strict) return strict;
  // Only the reversed word is possible (e.g. two different letters).
  return candidates.find((c) => isGood(c, false)) ?? identity;
}
