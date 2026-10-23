import { describe, it, expect } from 'vitest';
import { normalizeText } from '../../src/core/unicode';
import {
  deserializeConfusing,
  itemLine,
  MAX_LINE_TILES,
  parseConfusing,
  toText,
} from '../../src/plugins/confusing-letters/parse';
import { confusingLetters } from '../../src/plugins/confusing-letters';

const n = normalizeText;

describe('confusing letters editor', () => {
  it('reads the word, then its confusing letters', () => {
    const r = parseConfusing('כַּעַס ק צ ה א');
    expect(r.errors).toEqual([]);
    expect(r.data?.items).toEqual([{ word: n('כַּעַס'), extras: ['ק', 'צ', 'ה', 'א'] }]);
  });

  it('accepts spaces, commas, periods, | and ; as separators', () => {
    for (const text of ['כַּעַס ק,צ', 'כַּעַס, ק, צ', 'כַּעַס. ק. צ', 'כַּעַס | ק | צ', 'כַּעַס;ק;צ', 'כַּעַס  ק\tצ']) {
      expect(parseConfusing(text).data?.items[0].extras).toEqual(['ק', 'צ']);
    }
  });

  it('keeps confusing letters exactly as typed, niqqud only if typed', () => {
    expect(parseConfusing('כַּעַס צָ ק').data?.items[0].extras).toEqual([n('צָ'), 'ק']);
  });

  it('has no limit on how many confusing letters a word gets, only the 15-tile line limit', () => {
    // 3 word letters + 12 extras = 15: allowed.
    const twelve = 'ב ג ד ה ו ז ח ט י ל מ נ';
    const r = parseConfusing(`כַּעַס ${twelve}`);
    expect(r.errors).toEqual([]);
    expect(r.data?.items[0].extras).toHaveLength(12);
    expect(MAX_LINE_TILES).toBe(15);
  });

  it('blocks a line with more than 15 tiles and says how many to delete', () => {
    const r = parseConfusing(`כַּעַס ב ג ד ה ו ז ח ט י ל מ נ פ`);
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 1: 16 אותיות (המילה + המבלבלות) — מחקו אות אחת']);
    const r2 = parseConfusing(`כַּעַס ב ג ד ה ו ז ח ט י ל מ נ פ ר`);
    expect(r2.errors).toEqual(['שורה 1: 17 אותיות (המילה + המבלבלות) — מחקו 2 אותיות']);
  });

  it('drops a letter already in the word (ignoring niqqud, final = regular) with a warning', () => {
    const r = parseConfusing('אב\nגד\nהו\nכַּעַס ע ק\nאָרֹךְ כ צ');
    expect(r.data?.items[3].extras).toEqual(['ק']);
    expect(r.data?.items[4].extras).toEqual(['צ']);
    expect(r.warnings).toContain('שורה 4: "ע" כבר נמצאת במילה — לא תוצג');
    expect(r.warnings).toContain('שורה 5: "כ" כבר נמצאת במילה — לא תוצג');
  });

  it('drops a repeated confusing letter (also with different niqqud) with a warning', () => {
    const r = parseConfusing('כַּעַס צ צָ ץ ק');
    expect(r.data?.items[0].extras).toEqual(['צ', 'ק']);
    expect(r.warnings.filter((w) => w.includes('מופיעה פעמיים'))).toHaveLength(2);
  });

  it('treats shin and sin as different letters', () => {
    const r = parseConfusing(n('שָׁלוֹם שׂ ס'));
    expect(r.data?.items[0].extras).toEqual([n('שׂ'), 'ס']);
  });

  it('asks for one letter at a time', () => {
    const r = parseConfusing('כַּעַס קצ');
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 1: "קצ" — כתבו אות אחת בכל פעם']);
  });

  it('explains a niqqud mark with no letter, and a non-Hebrew character', () => {
    expect(parseConfusing('כַּעַס ַ').errors).toEqual(['שורה 1: סימן ניקוד U+05B7 בלי אות']);
    expect(parseConfusing('כַּעַס x').errors).toEqual(['שורה 1: התו "x" אינו אות עברית']);
  });

  it('checks the word with the same rules as Scrambled Words', () => {
    expect(parseConfusing('אבגדהוזחטיכ ק').errors[0]).toContain('ארוכה מ-10 אותיות');
    expect(parseConfusing('אא ק').errors[0]).toContain('צריך לפחות שתי אותיות שונות');
    expect(parseConfusing('abc ק').errors[0]).toContain('אינו אות עברית');
  });

  it('allows 1 to 20 words', () => {
    expect(parseConfusing('').errors).toEqual(['לא הוזנו מילים']);
    const lines = (k: number) => Array.from({ length: k }, () => 'כַּעַס ק').join('\n');
    expect(parseConfusing(lines(20)).data?.items).toHaveLength(20);
    expect(parseConfusing(lines(21)).errors).toContain('אפשר עד 20 מילים (הוזנו 21)');
  });

  it('warns about a word with no confusing letters but still plays it', () => {
    const r = parseConfusing('כַּעַס');
    expect(r.data?.items).toEqual([{ word: n('כַּעַס'), extras: [] }]);
    expect(r.warnings).toEqual([`שורה 1: אין אותיות מבלבלות ל"${n('כַּעַס')}"`]);
  });

  it('writes the data back as editor text that parses the same', () => {
    const data = parseConfusing('כַּעַס, ק, צ\nסַבָּא | צ').data!;
    expect(toText(data)).toBe(`${n('כַּעַס')} ק צ\n${n('סַבָּא')} צ`);
    expect(parseConfusing(toText(data)).data).toEqual(data);
    expect(itemLine(data.items[1])).toBe(`${n('סַבָּא')} צ`);
  });
});

describe('confusing letters stored and shared data', () => {
  it('accepts valid data', () => {
    const d = { items: [{ word: n('כַּעַס'), extras: ['ק', 'צ'] }] };
    expect(deserializeConfusing(d, 1)).toEqual(d);
    expect(confusingLetters.deserialize(d, 1)).toEqual(d);
  });

  it('rejects other versions and broken shapes', () => {
    expect(deserializeConfusing({ items: [] }, 2)).toBeNull();
    for (const bad of [null, 'x', {}, { items: 'x' }, { items: [{ word: 1, extras: [] }] }, { items: [{ word: 'כעס' }] }, { items: [{ word: 'כעס', extras: [1] }] }, { items: [] }]) {
      expect(deserializeConfusing(bad, 1)).toBeNull();
    }
  });

  it('rejects content the editor would block (multi-letter extra, over 15 tiles)', () => {
    expect(deserializeConfusing({ items: [{ word: 'כעס', extras: ['קצ'] }] }, 1)).toBeNull();
    const many = 'בגדהוזחטילמנפ'.split('');
    expect(deserializeConfusing({ items: [{ word: 'כעס', extras: many }] }, 1)).toBeNull();
  });
});

describe('confusing letters plugin', () => {
  const data = { items: [{ word: n('כַּעַס'), extras: ['ק'] }, { word: n('סַבָּא'), extras: ['צ'] }] };

  it('speaks the words only', () => {
    expect(confusingLetters.speakItems(data)).toEqual([n('כַּעַס'), n('סַבָּא')]);
  });

  it('summarises progress and ignores progress from other content', () => {
    expect(confusingLetters.summary(data, null)).toEqual({ line: '2 מילים · 0 הושלמו', fraction: 0 });
    const progress = { fp: data.items.map(itemLine).join('\n'), order: [1, 0], index: 1, roundPoints: 10, done: false };
    expect(confusingLetters.summary(data, progress)).toEqual({ line: '2 מילים · 1 הושלמה', fraction: 0.5 });
    expect(confusingLetters.summary(data, { ...progress, fp: 'other' }).fraction).toBe(0);
  });

  it('has a stable id and a home card with ס / צ', () => {
    expect(confusingLetters.id).toBe('confusing-letters');
    expect(confusingLetters.dataVersion).toBe(1);
    expect(confusingLetters.cardTiles).toEqual(['ס', '/', 'צ']);
  });
});
