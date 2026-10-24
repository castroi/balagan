import { describe, it, expect } from 'vitest';
import { isResuming } from '../../src/plugins/shared/start-screen';
import { completeWord, isValidProgress, newProgress } from '../../src/plugins/shared/letter-game/progress';
import { seededRng } from '../../src/core/rng';

describe('start screen', () => {
  it('offers continue and restart only once a round is in progress', () => {
    expect(isResuming(0)).toBe(false);
    expect(isResuming(1)).toBe(true);
    expect(isResuming(9)).toBe(true);
  });

  it('a restarted round is a valid new round: word 1, round points 0, same content', () => {
    const keys = ['כעס', 'צער', 'פגע'];
    const midway = completeWord(completeWord(newProgress(keys, seededRng(1)), 10), 7);
    expect(isResuming(midway.index)).toBe(true);
    const restarted = newProgress(keys, seededRng(2));
    expect(isValidProgress(restarted, keys)).toBe(true);
    expect(restarted).toMatchObject({ index: 0, roundPoints: 0, done: false });
    expect(isResuming(restarted.index)).toBe(false);
  });
});
