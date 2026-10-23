import { describe, it, expect } from 'vitest';
import { doneLabel, wordCountLabel } from '../../src/plugins/scrambled-words/text';

describe('Hebrew number wording', () => {
  it('uses "מילה אחת" for one word', () => {
    expect(wordCountLabel(1)).toBe('מילה אחת');
    expect(wordCountLabel(2)).toBe('2 מילים');
    expect(wordCountLabel(20)).toBe('20 מילים');
  });

  it('uses the singular for one finished word', () => {
    expect(doneLabel(0)).toBe('0 הושלמו');
    expect(doneLabel(1)).toBe('1 הושלמה');
    expect(doneLabel(7)).toBe('7 הושלמו');
  });
});
