import { describe, it, expect } from 'vitest';
import { isResuming } from '../../src/plugins/shared/start-screen';

describe('start screen', () => {
  it('offers continue and restart only once a round is in progress', () => {
    expect(isResuming(0)).toBe(false);
    expect(isResuming(1)).toBe(true);
    expect(isResuming(9)).toBe(true);
  });
});
