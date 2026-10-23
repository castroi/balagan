import { describe, it, expect } from 'vitest';
import { pointsForMistakes } from '../../src/core/scoring';

describe('pointsForMistakes', () => {
  it('gives 10 / 7 / 5 points', () => {
    expect(pointsForMistakes(0)).toBe(10);
    expect(pointsForMistakes(1)).toBe(7);
    expect(pointsForMistakes(2)).toBe(7);
    expect(pointsForMistakes(3)).toBe(5);
    expect(pointsForMistakes(20)).toBe(5);
  });
});
