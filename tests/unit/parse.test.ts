import { describe, it, expect } from 'vitest';
import { deserializeWords, parseWords } from '../../src/plugins/scrambled-words/parse';
import { TEN_WORDS, TWENTY_ONE_WORDS, TWENTY_WORDS } from '../fixtures/words';

const TEN = TEN_WORDS.join('\n');

describe('parseWords', () => {
  it('accepts 10 words with niqqud', () => {
    const r = parseWords(TEN);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data?.words).toHaveLength(10);
  });

  it('ignores blank lines, spaces around words and Windows line endings', () => {
    const r = parseWords(`\n  ${TEN.replace(/\n/g, '\r\n\r\n')}  \n`);
    expect(r.data?.words).toHaveLength(10);
  });

  it.each([1, 5, 12, 13, 20])('accepts %i words with no warning', (n: number) => {
    const r = parseWords(TWENTY_WORDS.slice(0, n).join('\n'));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data?.words).toHaveLength(n);
  });

  it('blocks 21 words with a clear message', () => {
    const r = parseWords(TWENTY_ONE_WORDS.join('\n'));
    expect(r.data).toBeNull();
    expect(r.errors).toContain('אפשר עד 20 מילים (הוזנו 21)');
  });

  it('rejects two words on one line', () => {
    expect(parseWords('בַּיִת יָפֶה').data).toBeNull();
  });

  it('rejects words longer than 10 letters', () => {
    expect(parseWords('אבגדהוזחטיכ').data).toBeNull();
    expect(parseWords('אבגדהוזחטי').data).not.toBeNull();
  });

  it('rejects non-Hebrew characters', () => {
    expect(parseWords('abc').data).toBeNull();
    expect(parseWords('שָׁלוֹם!').data).toBeNull();
  });

  it('rejects a word that cannot be scrambled', () => {
    expect(parseWords('א').data).toBeNull();
    expect(parseWords('אא').data).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parseWords('  \n ').data).toBeNull();
  });

  it('warns about duplicate words', () => {
    const r = parseWords('כַּעַס\nכַּעַס');
    expect(r.data).not.toBeNull();
    expect(r.warnings.some((w) => w.includes('פעמיים'))).toBe(true);
  });

  it('stores words cleaned of invisible characters', () => {
    const r = parseWords('‏כַּעַס‏');
    expect(r.data?.words[0]).toBe('כַּעַס'.normalize('NFC'));
  });
});

describe('deserializeWords', () => {
  it('accepts valid stored data', () => {
    expect(deserializeWords({ words: ['כַּעַס'] }, 1)).not.toBeNull();
    expect(deserializeWords({ words: TWENTY_WORDS }, 1)?.words).toHaveLength(20);
  });

  it('rejects shared data with too many words or a word with a space', () => {
    expect(deserializeWords({ words: TWENTY_ONE_WORDS }, 1)).toBeNull();
    expect(deserializeWords({ words: ['בַּיִת יָפֶה'] }, 1)).toBeNull();
  });

  it('rejects unknown versions and bad shapes', () => {
    expect(deserializeWords({ words: ['כַּעַס'] }, 2)).toBeNull();
    expect(deserializeWords({ words: 'כַּעַס' }, 1)).toBeNull();
    expect(deserializeWords(null, 1)).toBeNull();
    expect(deserializeWords({ words: ['abc'] }, 1)).toBeNull();
  });
});
