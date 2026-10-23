import type { GameContext } from '../types';
import { mountLetterGame } from '../shared/letter-game/view';
import type { ScrambledWordsData } from './parse';

/** Scrambled Words: the shared letter game with only the word's own letters. */
export const mountScrambledWords = (container: HTMLElement, data: ScrambledWordsData, ctx: GameContext) =>
  mountLetterGame(
    container,
    data.words.map((word) => ({ word, extras: [] })),
    // Progress is keyed by the word list, exactly as before the shared engine.
    data.words,
    ctx,
  );
