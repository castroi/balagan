import type { AnyPlugin } from './types';
import { scrambledWords } from './scrambled-words';

/**
 * All assignment types, in the order shown on the home and edit screens.
 * To add a new type: create its folder under plugins/ and add it here.
 */
export const PLUGINS: AnyPlugin[] = [scrambledWords];

export const getPlugin = (id: string): AnyPlugin | undefined => PLUGINS.find((p) => p.id === id);
