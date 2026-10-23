import { describe, it, expect } from 'vitest';
import { deserializeWords, parseWords } from '../../src/plugins/scrambled-words/parse';

const TEN = 'כַּעַס\nעַקְשָׁן\nמִצְטַעֵר\nעֶלְבּוֹן\nהֶעֱלִיב\nפָּגַע\nעָיֵף\nצַעַר\nרָשָׁע\nעָצוּב';

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

  it('warns (but allows) fewer than 10 words', () => {
    const r = parseWords('כַּעַס\nעָצוּב');
    expect(r.data?.words).toHaveLength(2);
    expect(r.warnings.length).toBe(1);
  });

  it('rejects more than 10 words', () => {
    const r = parseWords(`${TEN}\nשָׁלוֹם`);
    expect(r.data).toBeNull();
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
  });

  it('rejects unknown versions and bad shapes', () => {
    expect(deserializeWords({ words: ['כַּעַס'] }, 2)).toBeNull();
    expect(deserializeWords({ words: 'כַּעַס' }, 1)).toBeNull();
    expect(deserializeWords(null, 1)).toBeNull();
    expect(deserializeWords({ words: ['abc'] }, 1)).toBeNull();
  });
});

describe('parseWords — pasted text quirks', () => {
  it('accepts a geresh typed as iPhone\'s curly apostrophe', () => {
    const r = parseWords('ג\u2019ירפה');
    expect(r.errors).toEqual([]);
    expect(r.data?.words[0]).toBe('ג׳ירפה');
  });

  it('rejects a letter with hundreds of repeated marks', () => {
    const r = parseWords('ב' + '\u05BC'.repeat(500) + 'ית');
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain('יותר מדי סימני ניקוד');
  });

  it('keeps words saved before the marks rule readable, while the editor rejects them', () => {
    const doubled = 'ב\u05BC\u05BCית'; // a doubled dagesh from an old paste
    expect(parseWords(doubled).data).toBeNull();
    expect(deserializeWords({ words: [doubled] }, 1)?.words).toHaveLength(1);
  });

  it('names an invisible character by its code point', () => {
    const r = parseWords('א\u034Fב');
    expect(r.data).toBeNull();
    expect(r.errors[0]).toContain('U+034F');
  });
});
