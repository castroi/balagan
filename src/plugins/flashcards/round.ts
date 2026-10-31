/**
 * A round of "איך אומרים?": pure logic, no DOM.
 *
 * The cards come in random order. After turning a card the kid says whether they
 * knew it; "עוד לא" cards come back once at the end of the round. The kid judges
 * themselves, so both answers give the same points (only on the first pass) —
 * points never reward saying "ידעתי".
 */
import { fingerprint, newProgress } from '../shared/letter-game/progress';
import type { Rng } from '../../core/rng';

/** Points for each card on the first pass, whatever the answer. */
export const CARD_POINTS = 5;

export interface CardsProgress {
  /** Fingerprint of the content. */
  fp: string;
  /** Random order of the first pass (indices into the cards). */
  order: number[];
  /** Cards answered "עוד לא" on the first pass, in that order: shown again after it. */
  again: number[];
  /** Position in the first pass, then in `again`. */
  index: number;
  roundPoints: number;
  done: boolean;
}

export function newCardsProgress(keys: readonly string[], rng: Rng): CardsProgress {
  const { fp, order } = newProgress(keys, rng);
  return { fp, order, again: [], index: 0, roundPoints: 0, done: false };
}

/** Cards in this round so far: the first pass plus the ones coming back. */
export const roundLength = (p: CardsProgress): number => p.order.length + p.again.length;

/** True once the first pass is over and the "עוד לא" cards are coming back. */
export const isRepeat = (p: CardsProgress): boolean => p.index >= p.order.length;

/** Index (into the cards) of the card being shown. */
export const currentCard = (p: CardsProgress): number =>
  isRepeat(p) ? p.again[p.index - p.order.length] : p.order[p.index];

/**
 * The kid's answer for the current card. On the first pass it gives CARD_POINTS
 * and "עוד לא" puts the card at the end; on the repeat it just moves on.
 */
export function answer(p: CardsProgress, knew: boolean): { progress: CardsProgress; points: number } {
  if (p.done) return { progress: p, points: 0 };
  const firstPass = !isRepeat(p);
  const again = firstPass && !knew ? [...p.again, currentCard(p)] : p.again;
  const points = firstPass ? CARD_POINTS : 0;
  const index = p.index + 1;
  return {
    progress: {
      ...p,
      again,
      index,
      roundPoints: p.roundPoints + points,
      done: index >= p.order.length + again.length,
    },
    points,
  };
}

const isIndexList = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));

/** Checks saved progress against the current cards; anything odd means a fresh round. */
export function isValidCardsProgress(p: unknown, keys: readonly string[]): p is CardsProgress {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Partial<CardsProgress>;
  if (r.fp !== fingerprint(keys)) return false;
  if (!isIndexList(r.order) || r.order.length !== keys.length) return false;
  const sorted = r.order.slice().sort((a, b) => a - b);
  if (!sorted.every((v, i) => v === i)) return false;
  if (typeof r.index !== 'number' || !Number.isInteger(r.index) || r.index < 0) return false;
  if (!isIndexList(r.again) || new Set(r.again).size !== r.again.length) return false;
  // Only cards already seen on the first pass can come back.
  const seen = new Set(r.order.slice(0, Math.min(r.index, r.order.length)));
  if (!r.again.every((i) => seen.has(i))) return false;
  const length = r.order.length + r.again.length;
  return (
    r.index <= length &&
    typeof r.roundPoints === 'number' &&
    typeof r.done === 'boolean' &&
    // A finished round must be marked done, and only a finished round.
    r.done === r.index >= length
  );
}
