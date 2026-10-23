/**
 * Progress through a list of items (words), saved so a closed app can resume.
 * `keys` identify the content: progress resets when they change.
 */
import { shuffle } from '../../../core/shuffle';
import type { Rng } from '../../../core/rng';

export interface RoundProgress {
  /** Fingerprint of the content. */
  fp: string;
  /** Random item order for this round (indices into the list). */
  order: number[];
  /** Index into `order` of the current item. */
  index: number;
  roundPoints: number;
  done: boolean;
}

export const fingerprint = (keys: readonly string[]): string => keys.join('\n');

export function newProgress(keys: readonly string[], rng: Rng): RoundProgress {
  return {
    fp: fingerprint(keys),
    order: shuffle(
      keys.map((_, i) => i),
      rng,
    ),
    index: 0,
    roundPoints: 0,
    done: false,
  };
}

export function isValidProgress(p: unknown, keys: readonly string[]): p is RoundProgress {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Partial<RoundProgress>;
  if (r.fp !== fingerprint(keys)) return false;
  if (!Array.isArray(r.order) || r.order.length !== keys.length) return false;
  const sorted = r.order.slice().sort((a, b) => a - b);
  if (!sorted.every((v, i) => v === i)) return false;
  return (
    typeof r.index === 'number' &&
    Number.isInteger(r.index) &&
    r.index >= 0 &&
    r.index <= keys.length &&
    typeof r.roundPoints === 'number' &&
    typeof r.done === 'boolean' &&
    // A finished round must be marked done, and only a finished round.
    r.done === r.index >= keys.length
  );
}

export function completeWord(p: RoundProgress, points: number): RoundProgress {
  const index = p.index + 1;
  return { ...p, index, roundPoints: p.roundPoints + points, done: index >= p.order.length };
}
