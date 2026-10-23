import type { AnyPlugin } from './types';
import { scrambledWords } from './scrambled-words';
import { confusingLetters } from './confusing-letters';
import { chooseWord } from './choose-word';

/**
 * All assignment types, in the order shown on the home and edit screens.
 * To add a new type: create its folder under plugins/ and add it here.
 */
export const PLUGINS: AnyPlugin[] = [scrambledWords, confusingLetters, chooseWord];

export const getPlugin = (id: string): AnyPlugin | undefined => PLUGINS.find((p) => p.id === id);
