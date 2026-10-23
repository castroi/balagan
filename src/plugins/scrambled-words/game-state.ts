/**
 * Scrambled Words uses the shared letter-game engine with no extra letters.
 * These re-exports keep the activity's public API (and its tests) unchanged.
 */
import type { Rng } from '../../core/rng';
import { createRound, placeTile as placeTileShared, type WordRound } from '../shared/letter-game/round';

export { isComplete, nextSlot, type PlaceResult, type Tile, type WordRound } from '../shared/letter-game/round';
export {
  completeWord,
  fingerprint,
  isValidProgress,
  newProgress,
  type RoundProgress,
} from '../shared/letter-game/progress';

export const createWordRound = (word: string, rng: Rng): WordRound => createRound(word, [], rng);

export const placeTile = (round: WordRound, tileId: number) => placeTileShared(round, tileId);
