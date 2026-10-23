import { describe, it, expect } from 'vitest';
import { buildShareLink, decodeShare, encodeShareCode, isImportHash } from '../../src/platform/share-codec';
import { TWENTY_WORDS } from '../fixtures/words';

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

  it('round-trips the maximum of 20 words and stays reasonably short', () => {
    const big = { assignments: { 'scrambled-words': { v: 1, d: { words: TWENTY_WORDS } } } };
    const link = buildShareLink('https://example.app/', big);
    expect(decodeShare(link)).toEqual({ ok: true, payload: big });
    expect(link.length).toBeLessThan(900);
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

describe('share links with Confusing Letters', () => {
  it('round-trips a full week of both activities and stays short enough for messaging apps', () => {
    const items = TWENTY_WORDS.map((word) => ({ word, extras: ['ק', 'צ', 'ה', 'א'] }));
    const both = {
      assignments: {
        'scrambled-words': { v: 1, d: { words: TWENTY_WORDS } },
        'confusing-letters': { v: 1, d: { items } },
      },
    };
    const link = buildShareLink('https://example.app/', both);
    expect(decodeShare(link)).toEqual({ ok: true, payload: both });
    expect(link.length).toBeLessThan(2500);
  });

  it('measures the worst case: 20 lines of 15 tiles, all with niqqud, plus 20 Scrambled Words', () => {
    // 10-letter word + 5 confusing letters, every tile with a vowel and a dagesh.
    const tile = (letter: string) => `${letter}\u05BC\u05B8`;
    const word = 'אבגדהוזחטי'.split('').map(tile).join('');
    const extras = 'למנסע'.split('').map(tile);
    const worst = {
      assignments: {
        'scrambled-words': { v: 1, d: { words: TWENTY_WORDS } },
        'confusing-letters': { v: 1, d: { items: Array.from({ length: 20 }, () => ({ word, extras })) } },
      },
    };
    const link = buildShareLink('https://example.app/', worst);
    expect(decodeShare(link)).toEqual({ ok: true, payload: worst });
    // Long, but far below the ~64k characters browsers and WhatsApp handle; checked by hand in WhatsApp before release.
    expect(link.length).toBeLessThan(5000);
  });
});
