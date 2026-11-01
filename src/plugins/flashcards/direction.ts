/**
 * The two directions of "איך אומרים?" and how both rounds are saved: pure logic, no DOM.
 *
 * - 'to-foreign' (default, the original game): Hebrew on the front, the foreign word on the back.
 * - 'to-hebrew': the foreign word on the front, the Hebrew on the back.
 *
 * Saved progress keeps the 'to-foreign' round at the top level, exactly as app 1.7 saved it,
 * so 1.7 still reads it. The other fields are extras: `dir` (the last direction played, so it
 * comes back next time), `rev` (the 'to-hebrew' round) and `finished` (directions with a
 * finished round, for the ✓ on the switch). 1.7 keeps them while it continues a round, and
 * drops them when it starts a new one (a known limit: no points are lost, only those extras).
 */
import { fingerprint } from '../shared/letter-game/progress';
import type { Rng } from '../../core/rng';
import { isValidCardsProgress, newCardsProgress, type CardsProgress } from './round';

export type Direction = 'to-foreign' | 'to-hebrew';
export const DIRECTIONS: readonly Direction[] = ['to-foreign', 'to-hebrew'];
export const DEFAULT_DIRECTION: Direction = 'to-foreign';

export interface FlashState {
  dir: Direction;
  /** Round of each direction; null when there's none (or it doesn't fit the current cards). */
  rounds: Record<Direction, CardsProgress | null>;
  /** Directions with a finished round for these cards. */
  finished: Direction[];
}

/** What is saved: the 'to-foreign' round at the top level, plus the extras. */
export type SavedFlash = CardsProgress & { dir?: Direction; rev?: CardsProgress; finished?: Direction[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDirection = (v: unknown): v is Direction => v === 'to-foreign' || v === 'to-hebrew';

/** Only the round's own fields (the saved object carries the extras too). */
const roundOnly = (p: CardsProgress): CardsProgress => ({
  fp: p.fp,
  order: p.order,
  again: p.again,
  index: p.index,
  roundPoints: p.roundPoints,
  done: p.done,
});

/** Reads saved progress for these cards. Anything odd falls back to no round; the direction is kept even then. */
export function readFlash(saved: unknown, keys: readonly string[]): FlashState {
  const raw = isRecord(saved) ? saved : {};
  const fwd = isValidCardsProgress(raw, keys) ? roundOnly(raw) : null;
  const rev = isValidCardsProgress(raw.rev, keys) ? roundOnly(raw.rev) : null;
  // ✓ marks belong to these cards: a changed list starts without them.
  const sameCards = raw.fp === fingerprint(keys);
  const finished = sameCards && Array.isArray(raw.finished) ? DIRECTIONS.filter((d) => (raw.finished as unknown[]).includes(d)) : [];
  return { dir: isDirection(raw.dir) ? raw.dir : DEFAULT_DIRECTION, rounds: { 'to-foreign': fwd, 'to-hebrew': rev }, finished };
}

/** The saved form. The top level always holds a 'to-foreign' round (a fresh one if there's none yet). */
export function writeFlash(state: FlashState, keys: readonly string[], rng: Rng): SavedFlash {
  // Callers keep a 'to-foreign' round in the state (see `withRound`), so this fallback is only for safety.
  const fwd = state.rounds['to-foreign'] ?? newCardsProgress(keys, rng);
  const rev = state.rounds['to-hebrew'];
  return {
    ...fwd,
    ...(state.dir !== DEFAULT_DIRECTION ? { dir: state.dir } : {}),
    ...(rev ? { rev } : {}),
    ...(state.finished.length ? { finished: state.finished } : {}),
  };
}

/** The round to play in the current direction: the saved one if it's still going, else a fresh one. */
export function activeRound(state: FlashState, keys: readonly string[], rng: Rng): CardsProgress {
  const round = state.rounds[state.dir];
  return round && !round.done ? round : newCardsProgress(keys, rng);
}

/** The state with the current direction's round replaced; a finished round marks its direction ✓. */
export function withRound(state: FlashState, round: CardsProgress, keys: readonly string[], rng: Rng): FlashState {
  const finished = round.done && !state.finished.includes(state.dir) ? [...state.finished, state.dir] : state.finished;
  const rounds = { ...state.rounds, [state.dir]: round };
  // The top-level ('to-foreign') round always exists, so saving twice writes the same thing.
  if (!rounds['to-foreign']) rounds['to-foreign'] = newCardsProgress(keys, rng);
  return { ...state, rounds, finished };
}
