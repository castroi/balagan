import { describe, it, expect } from 'vitest';
import { normalizeText } from '../../src/core/unicode';
import {
  deserializeChooseWord,
  itemLine,
  MAX_LETTERS,
  MAX_WORDS,
  MAX_WRONG,
  parseChooseWord,
  toText,
} from '../../src/plugins/choose-word/parse';
import { chooseWord } from '../../src/plugins/choose-word';
import { newProgress, completeWord } from '../../src/plugins/shared/letter-game/progress';
import { seededRng } from '../../src/core/rng';
import { getPlugin, PLUGINS } from '../../src/plugins/registry';

const n = normalizeText;

describe('choose word editor', () => {
  it('reads the correct word first, then its wrong words', () => {
    const r = parseChooseWord('כַּעַס קַעַס כַּאַס קַאַס');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data?.items).toEqual([{ word: n('כַּעַס'), wrong: [n('קַעַס'), n('כַּאַס'), n('קַאַס')] }]);
  });

  it('accepts the same separators as Confusing Letters', () => {
    for (const text of ['כעס קעס,כאס', 'כעס, קעס, כאס', 'כעס. קעס. כאס', 'כעס | קעס | כאס', 'כעס;קעס;כאס', 'כעס  קעס\tכאס', 'כעס קעס/כאס', 'כעס קעס-כאס', 'כעס קעס־כאס']) {
      expect(parseChooseWord(text).data?.items[0]).toEqual({ word: 'כעס', wrong: ['קעס', 'כאס'] });
    }
  });

  it('keeps words exactly as typed, niqqud and final letters included', () => {
    const r = parseChooseWord('עָצוּב אָצוּב עָסוּב\nשָׁלוֹם סָלוֹם');
    expect(r.data?.items[0]).toEqual({ word: n('עָצוּב'), wrong: [n('אָצוּב'), n('עָסוּב')] });
    expect(r.data?.items[1].word).toBe(n('שָׁלוֹם'));
  });

  it('reads several lines and skips empty ones', () => {
    const r = parseChooseWord('\nכעס קעס\n\n  צער סער  \n');
    expect(r.data?.items).toEqual([
      { word: 'כעס', wrong: ['קעס'] },
      { word: 'צער', wrong: ['סער'] },
    ]);
  });

  it('blocks a line with no wrong word', () => {
    const r = parseChooseWord('כעס קעס\nצער');
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 2: אין מילים שגויות ל"צער" — כתבו לפחות אחת']);
  });

  it(`allows up to ${MAX_WRONG} wrong words and blocks more, saying how many to delete`, () => {
    expect(MAX_WRONG).toBe(3);
    expect(parseChooseWord('כעס קעס כאס קאס').errors).toEqual([]);
    expect(parseChooseWord('כעס קעס כאס קאס חעס').errors).toEqual([
      'שורה 1: 4 מילים שגויות, אפשר עד 3 — מחקו מילה אחת',
    ]);
    expect(parseChooseWord('כעס קעס כאס קאס חעס חאס').errors).toEqual([
      'שורה 1: 5 מילים שגויות, אפשר עד 3 — מחקו 2 מילים',
    ]);
  });

  it('allows one wrong word (2 options) with a warning', () => {
    const r = parseChooseWord('כעס קעס');
    expect(r.errors).toEqual([]);
    expect(r.data?.items[0].wrong).toEqual(['קעס']);
    expect(r.warnings).toEqual(['שורה 1: רק מילה שגויה אחת — הילד יבחר בין 2 מילים']);
  });

  it('drops a wrong word identical to the correct one, also when typed with marks in another order', () => {
    // Dagesh then patah vs patah then dagesh: normalizeText puts the marks in one order, so it's the same word.
    const dageshFirst = '\u05DB\u05BC\u05B7\u05E2\u05B7\u05E1';
    const patahFirst = '\u05DB\u05B7\u05BC\u05E2\u05B7\u05E1';
    expect(dageshFirst).not.toBe(patahFirst);
    const r = parseChooseWord(`${dageshFirst} ${patahFirst} קעס\nבת בת כאס`);
    expect(r.data?.items[0].wrong).toEqual(['קעס']);
    expect(r.warnings).toContain(`שורה 1: "${n(patahFirst)}" זהה למילה הנכונה — לא תוצג`);
    expect(r.warnings).toContain('שורה 2: "בת" זהה למילה הנכונה — לא תוצג');
  });

  it('blocks a line whose only wrong word is the correct word itself', () => {
    const r = parseChooseWord('כעס כעס');
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 1: אין מילים שגויות ל"כעס" — כתבו לפחות אחת']);
    expect(r.warnings).toEqual(['שורה 1: "כעס" זהה למילה הנכונה — לא תוצג']);
  });

  it('drops a repeated wrong word with a warning', () => {
    const r = parseChooseWord('כעס קעס קעס כאס');
    expect(r.data?.items[0].wrong).toEqual(['קעס', 'כאס']);
    expect(r.warnings).toEqual(['שורה 1: "קעס" מופיעה פעמיים — תוצג פעם אחת']);
  });

  it('allows wrong words that differ only by niqqud (vowel practice)', () => {
    const r = parseChooseWord('כַּעַס כָּעַס כֶּעֶס');
    expect(r.errors).toEqual([]);
    expect(r.data?.items[0].wrong).toEqual([n('כָּעַס'), n('כֶּעֶס')]);
  });

  it('warns when only some words of a line have niqqud (the answer gives itself away)', () => {
    const mixed = parseChooseWord('עָצוּב אצוב עסוב');
    expect(mixed.errors).toEqual([]);
    expect(mixed.warnings).toEqual(['שורה 1: רק לחלק מהמילים יש ניקוד — כך קל לזהות את התשובה']);
    expect(parseChooseWord('עצוב אָצוּב עסוב').warnings).toHaveLength(1);
    expect(parseChooseWord('עָצוּב אָצוּב עָסוּב').warnings).toEqual([]);
    expect(parseChooseWord('עצוב אצוב עסוב').warnings).toEqual([]);
  });

  it('counts a shin dot or a dagesh alone as niqqud', () => {
    const mixed = 'שורה 1: רק לחלק מהמילים יש ניקוד — כך קל לזהות את התשובה';
    expect(parseChooseWord('\u05E9\u05C1\u05DE\u05E9 סמש צמש').warnings).toEqual([mixed]);
    expect(parseChooseWord('\u05D1\u05BC\u05D9\u05EA בית וית').warnings).toEqual([mixed]);
  });

  it('explains characters that are not Hebrew letters, in the correct or a wrong word', () => {
    expect(parseChooseWord('כעס x').errors).toEqual(['שורה 1: התו "x" אינו אות עברית']);
    expect(parseChooseWord('כעסa קעס').errors).toEqual(['שורה 1: התו "a" אינו אות עברית']);
    expect(parseChooseWord('כעס ַקעס').errors).toEqual(['שורה 1: סימן ניקוד U+05B7 בלי אות']);
    expect(parseChooseWord("כעס 'קעס").errors).toEqual(['שורה 1: גרש "׳" בלי אות']);
    expect(parseChooseWord('כעס קע͏ס').errors).toEqual(['שורה 1: התו U+034F אינו אות עברית']);
  });

  it('accepts a geresh on a letter (apostrophes become ׳)', () => {
    const r = parseChooseWord("ג'ירפה גירפה");
    expect(r.errors).toEqual([]);
    expect(r.data?.items[0].word).toBe('ג׳ירפה');
  });

  it('blocks a letter with too many or repeated marks (a pasting mistake)', () => {
    expect(parseChooseWord('כַַעס קעס').errors).toEqual(['שורה 1: יותר מדי סימני ניקוד על האות "כ"']);
  });

  it(`allows up to ${MAX_LETTERS} letters per word, niqqud not counted`, () => {
    expect(MAX_LETTERS).toBe(10);
    expect(parseChooseWord('אבגדהוזחטי אבגדהוזחטכ').errors).toEqual([]);
    expect(parseChooseWord(n('הַמִּתְעַצְבְּנִים הַמִּתְאַצְבְּנִים')).errors).toEqual([]);
    expect(parseChooseWord('אבגדהוזחטיכ קעס').errors).toEqual(['שורה 1: "אבגדהוזחטיכ" ארוכה מ-10 אותיות']);
    expect(parseChooseWord('כעס אבגדהוזחטיכ').errors).toEqual(['שורה 1: "אבגדהוזחטיכ" ארוכה מ-10 אותיות']);
  });

  it('accepts one-letter words (unlike the scrambling games)', () => {
    expect(parseChooseWord('ע א').errors).toEqual([]);
  });

  it('explains a line with only separators', () => {
    const r = parseChooseWord('כעס קעס\n, ;');
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 2: לא נמצאה מילה']);
  });

  it('reports every bad line', () => {
    const r = parseChooseWord('כעס\nצער x\nתוק טוק');
    expect(r.data).toBeNull();
    expect(r.errors).toEqual(['שורה 1: אין מילים שגויות ל"כעס" — כתבו לפחות אחת', 'שורה 2: התו "x" אינו אות עברית']);
  });

  it(`needs 1 to ${MAX_WORDS} lines`, () => {
    expect(parseChooseWord('   \n ').errors).toEqual(['לא הוזנו מילים']);
    const line = 'כעס קעס';
    expect(parseChooseWord(Array(MAX_WORDS).fill(line).join('\n')).errors).toEqual([]);
    expect(parseChooseWord(Array(MAX_WORDS + 1).fill(line).join('\n')).errors).toEqual(['אפשר עד 20 שורות (הוזנו 21)']);
  });

  it('warns about a correct word that appears twice', () => {
    const r = parseChooseWord('כעס קעס\nצער סער\nכעס כאס');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain('מילים שמופיעות פעמיים: כעס');
  });

  it('turns data back into editor text, one line per word', () => {
    const data = parseChooseWord('כעס, קעס, כאס\nצער | סער').data!;
    expect(toText(data)).toBe('כעס קעס כאס\nצער סער');
    expect(itemLine(data.items[0])).toBe('כעס קעס כאס');
    expect(parseChooseWord(toText(data)).data).toEqual(data);
  });
});

describe('choose word saved and shared data', () => {
  const good = { items: [{ word: n('כַּעַס'), wrong: [n('קַעַס')] }] };

  it('reads valid data', () => {
    expect(deserializeChooseWord(good, 1)).toEqual(good);
    expect(chooseWord.deserialize(good, 1)).toEqual(good);
  });

  it('rejects an unknown version', () => {
    expect(deserializeChooseWord(good, 2)).toBeNull();
    expect(deserializeChooseWord(good, 0)).toBeNull();
  });

  it('rejects data of the wrong shape', () => {
    for (const raw of [
      null,
      'כעס',
      42,
      {},
      { items: 'כעס' },
      { items: [null] },
      { items: [{ word: 1, wrong: [] }] },
      { items: [{ word: 'כעס' }] },
      { items: [{ word: 'כעס', wrong: 'קעס' }] },
      { items: [{ word: 'כעס', wrong: [1] }] },
    ]) {
      expect(deserializeChooseWord(raw, 1)).toBeNull();
    }
  });

  it('rejects content that would break the game', () => {
    expect(deserializeChooseWord({ items: [] }, 1)).toBeNull();
    expect(deserializeChooseWord({ items: [{ word: 'כעס', wrong: [] }] }, 1)).toBeNull();
    expect(deserializeChooseWord({ items: [{ word: 'כעס', wrong: ['a'] }] }, 1)).toBeNull();
    expect(deserializeChooseWord({ items: [{ word: 'כעס', wrong: ['א', 'ב', 'ג', 'ד'] }] }, 1)).toBeNull();
  });

  it('cleans stored text and does not apply editor-only rules (marks per letter)', () => {
    const r = deserializeChooseWord({ items: [{ word: 'כ​עס', wrong: ['קַַעס'] }] }, 1);
    expect(r).toEqual({ items: [{ word: 'כעס', wrong: ['קַַעס'] }] });
  });

  it('keeps each stored word whole (no re-splitting on separators)', () => {
    expect(deserializeChooseWord({ items: [{ word: 'כעס', wrong: ['קעס כאס'] }] }, 1)).toBeNull();
  });
});

describe('choose word plugin', () => {
  const data = parseChooseWord('כעס קעס כאס\nצער סער').data!;

  it('is registered after the other activities, with a stable id', () => {
    expect(PLUGINS.map((p) => p.id)).toEqual(['scrambled-words', 'confusing-letters', 'choose-word']);
    expect(getPlugin('choose-word')).toBe(chooseWord);
    expect(chooseWord.dataVersion).toBe(1);
    expect(chooseWord.title).toBe('בחרו את המילה');
  });

  it('describes the editor format in its hint', () => {
    expect(chooseWord.editor.hint).toContain('המילה הנכונה ראשונה');
    expect(chooseWord.editor.hint).toContain('1–3');
    expect(chooseWord.parse(chooseWord.editor.placeholder.replace('…', '')).errors).toEqual([]);
  });

  it('speaks only the correct words in the voice test', () => {
    expect(chooseWord.speakItems(data)).toEqual(['כעס', 'צער']);
  });

  it('round-trips editor text', () => {
    expect(chooseWord.toText(data)).toBe('כעס קעס כאס\nצער סער');
  });

  it('summarises saved progress, keyed by the full lines', () => {
    expect(chooseWord.summary(data, undefined)).toEqual({ line: '2 מילים · 0 הושלמו', fraction: 0 });
    const keys = data.items.map(itemLine);
    const p = completeWord(newProgress(keys, seededRng(1)), 10);
    expect(chooseWord.summary(data, p)).toEqual({ line: '2 מילים · 1 הושלמה', fraction: 0.5 });
    // Changing a line's options starts a fresh round.
    const changed = parseChooseWord('כעס קעס\nצער סער').data!;
    expect(chooseWord.summary(changed, p).fraction).toBe(0);
  });
});
