import { describe, it, expect } from 'vitest';
import { buildShareLink, decodeShare, encodeShareCode, isImportHash } from '../../src/platform/share-codec';

const payload = {
  assignments: {
    'scrambled-words': {
      v: 1,
      d: { words: ['כַּעַס', 'עַקְשָׁן', 'מִצְטַעֵר', 'עֶלְבּוֹן', 'הֶעֱלִיב', 'פָּגַע', 'עָיֵף', 'צַעַר', 'רָשָׁע', 'עָצוּב'] },
    },
  },
};

describe('share links', () => {
  it('round-trips Hebrew with niqqud', () => {
    const link = buildShareLink('https://example.app/', payload);
    const result = decodeShare(link);
    expect(result).toEqual({ ok: true, payload });
  });

  it('accepts a full link, the hash alone, or the code alone', () => {
    const code = encodeShareCode(payload);
    expect(decodeShare(`https://example.app/#import=${code}`).ok).toBe(true);
    expect(decodeShare(`#import=${code}`).ok).toBe(true);
    expect(decodeShare(code).ok).toBe(true);
    expect(decodeShare(`  ${code}\n`).ok).toBe(true);
  });

  it('replaces an existing hash instead of adding a second one', () => {
    const link = buildShareLink('https://example.app/#import=old', payload);
    expect(link.split('#')).toHaveLength(2);
  });

  it('uses only URL-safe characters and is shorter than percent-encoding', () => {
    const link = buildShareLink('https://example.app/', payload);
    expect(/^[A-Za-z0-9:/._#=-]+$/.test(link)).toBe(true);
    const percent = encodeURIComponent(JSON.stringify(payload));
    expect(link.length).toBeLessThan(percent.length);
  });

  it('rejects empty, broken and truncated links', () => {
    const code = encodeShareCode(payload);
    expect(decodeShare('')).toEqual({ ok: false, reason: 'empty' });
    expect(decodeShare('hello')).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeShare(code.slice(0, code.length - 25))).toEqual({ ok: false, reason: 'invalid' });
    expect(decodeShare('1.!!!!')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports links from a newer format version', () => {
    const code = encodeShareCode(payload).replace(/^1\./, '2.');
    expect(decodeShare(code)).toEqual({ ok: false, reason: 'newer' });
  });

  it('recognises an import hash', () => {
    expect(isImportHash('#import=1.abc')).toBe(true);
    expect(isImportHash('#other')).toBe(false);
    expect(isImportHash('')).toBe(false);
  });
});
