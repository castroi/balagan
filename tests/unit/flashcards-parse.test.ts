import { describe, it, expect } from 'vitest';
import { normalizeText } from '../../src/core/unicode';
import {
  cardLang,
  cardLine,
  deserializeFlashcards,
  frontParts,
  MAX_CARDS,
  MAX_CHARS,
  parseFlashcards,
  STORED_MAX_CARDS,
  toText,
} from '../../src/plugins/flashcards/parse';
import { flashcards } from '../../src/plugins/flashcards';
import { answer, newCardsProgress } from '../../src/plugins/flashcards/round';
import { seededRng } from '../../src/core/rng';
import { getPlugin } from '../../src/plugins/registry';

const n = normalizeText;

describe('flashcards editor', () => {
  it('reads Hebrew | Arabic | reading in Hebrew letters', () => {
    const r = parseFlashcards("דוד | خَال | חַ'אל");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data?.cards).toEqual([['דוד', n('خَال'), n('חַ׳אל')]]);
    expect(cardLang(r.data!.cards[0])).toBe('ar');
  });

  it('reads two parts: the back shows the foreign word itself', () => {
    const r = parseFlashcards('דוד | خال\nילד | child');
    expect(r.errors).toEqual([]);
    expect(r.data?.cards).toEqual([
      ['דוד', 'خال'],
      ['ילד', 'child'],
    ]);
    expect(r.data!.cards.map(cardLang)).toEqual(['ar', 'en']);
  });

  it('allows Arabic and English lines, with and without a reading, in one list', () => {
    const r = parseFlashcards('דוד | خال | חַאל\nדוד | uncle | אַנְקֶל\nאבא | father');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.data?.cards).toHaveLength(3);
  });

  it('turns apostrophes into a geresh only in the Hebrew parts', () => {
    const r = parseFlashcards("לא | don’t | דוֹנְ'ט");
    expect(r.errors).toEqual([]);
    expect(r.data?.cards[0]).toEqual(['לא', "don't", n('דוֹנְ׳ט')]);
    // An ASCII and a curly apostrophe give the same English word.
    expect(parseFlashcards("לא | don't").data?.cards[0][1]).toBe("don't");
  });

  it('keeps niqqud, harakat and spaces exactly as typed', () => {
    const r = parseFlashcards('דודה מצד אבא | عَمَّة | עַמַּה\nגלידה | ice cream');
    expect(r.data?.cards[0]).toEqual(['דודה מצד אבא', n('عَمَّة'), n('עַמַּה')]);
    expect(r.data?.cards[1][1]).toBe('ice cream');
  });

  it('accepts the parent’s list (slashes, parentheses, dagesh on a final letter)', () => {
    const text = [
      'בן (צאצא) | ابن | אִבְּן',
      'ילד קטן / תינוק | طفل | טִפְל',
      'דוד מצד אבא | عم | עַםּ',
      'דודתי מצד אמא | خالتي | ח׳אלְתִי',
    ].join('\n');
    const r = parseFlashcards(text);
    expect(r.errors).toEqual([]);
    expect(r.data?.cards).toHaveLength(4);
  });

  it('reads several lines, skips empty ones and trims spaces', () => {
    const r = parseFlashcards('\n  דוד|خال  \n\n ילד |child\n');
    expect(r.data?.cards).toEqual([
      ['דוד', 'خال'],
      ['ילד', 'child'],
    ]);
  });

  it('needs a | between the parts, at most 3 parts, none empty', () => {
    expect(parseFlashcards('דוד خال').errors).toEqual(['שורה 1: חסר | בין המילה בעברית למילה בשפה השנייה']);
    expect(parseFlashcards('דוד - uncle').errors[0]).toContain('חסר |');
    expect(parseFlashcards('דוד | خال | חאל | עוד').errors[0]).toMatch(/^שורה 1: יותר מ-3 חלקים/);
    expect(parseFlashcards('דוד | | חאל').errors).toEqual(['שורה 1: חלק ריק בין סימני ה-|']);
    expect(parseFlashcards('דוד | خال |').errors).toEqual(['שורה 1: חלק ריק בין סימני ה-|']);
  });

  it('needs the second part in Arabic or English letters (the voice’s language)', () => {
    const msg = 'שורה 1: בחלק השני צריך את המילה בערבית או באנגלית, באותיות של השפה (ממנה הקול)';
    expect(parseFlashcards('דוד | ח׳אל').errors).toEqual([msg]);
    expect(parseFlashcards('דוד | 123').errors).toEqual([msg]);
    expect(parseFlashcards('דוד | خال uncle').errors).toEqual([
      'שורה 1: בחלק השני יש גם ערבית וגם אנגלית — כתבו מילה בשפה אחת',
    ]);
  });

  it('rejects a Hebrew letter or a stray symbol inside the foreign word', () => {
    expect(parseFlashcards('דוד | unclא').errors).toEqual(['שורה 1: בחלק השני: "א" (עברית) לא שייך למילה באנגלית']);
    expect(parseFlashcards('דוד | uncle#').errors).toEqual(['שורה 1: בחלק השני: "#" לא שייך למילה באנגלית']);
    expect(parseFlashcards('דוד | خال@').errors[0]).toContain('לא שייך למילה בערבית');
  });

  it('accepts Arabic marks (shadda + fatha) that the Hebrew rules would count', () => {
    // عَمَّة: shadda and fatha on the same letter, plus a fatha before it.
    expect(parseFlashcards('דודה | عَمَّة').errors).toEqual([]);
  });

  it('turns Arabic presentation forms (copied from a PDF) into regular letters', () => {
    // ﺧﺎﻝ: the initial, final and isolated shapes of خ ا ل.
    expect(parseFlashcards('דוד | ﺧﺎﻝ').data?.cards[0][1]).toBe('خال');
    // Presentation-form harakat become the bare marks: no space and no tatweel added.
    const r = parseFlashcards('דוד | ﺧﺎﻝﹷ');
    expect(r.warnings).toEqual([]);
    expect(r.data?.cards[0][1]).toBe('خالَ');
  });

  it('removes the invisible Arabic Letter Mark and rejects invisible number signs', () => {
    expect(parseFlashcards('דוד | ؜خال').data?.cards[0][1]).toBe('خال');
    expect(parseFlashcards('דוד | ؀خال').errors).toEqual(['שורה 1: בחלק השני: U+0600 לא שייך למילה בערבית']);
  });

  it('a tatweel alone is not an Arabic word', () => {
    expect(parseFlashcards('דוד | ـ').errors[0]).toContain('צריך את המילה בערבית או באנגלית');
  });

  it('warns about a tatweel stretching an Arabic word', () => {
    const r = parseFlashcards('דוד | خـال');
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(['שורה 1: בחלק השני יש קו מתיחה "ـ" — עדיף למחוק אותו']);
  });

  it('needs Hebrew letters in the first and third parts', () => {
    expect(parseFlashcards('uncle | خال').errors).toEqual(['שורה 1: בחלק הראשון: התו "u" אינו אות עברית']);
    expect(parseFlashcards('דוד | خال | khal').errors).toEqual(['שורה 1: בחלק השלישי: התו "k" אינו אות עברית']);
    expect(parseFlashcards('דוד | uncle | خال').errors[0]).toContain('בחלק השלישי');
  });

  it('applies the Hebrew mark rules to the Hebrew parts', () => {
    expect(parseFlashcards('דוד | خال | ָחאל').errors).toEqual(['שורה 1: בחלק השלישי: סימן ניקוד U+05B8 בלי אות']);
    expect(parseFlashcards('דָָוד | خال').errors[0]).toContain('יותר מדי סימני ניקוד');
  });

  it('allows one note in parentheses, only in the Hebrew word', () => {
    expect(parseFlashcards('בן (צאצא) | ابن').errors).toEqual([]);
    expect(parseFlashcards('בן (צאצא | ابن').errors).toEqual(['שורה 1: סוגריים בלי סגירה']);
    expect(parseFlashcards('בן )צאצא( | ابن').errors).toEqual(['שורה 1: סוגריים בלי פתיחה — כתבו ( לפני ההערה ו-) אחריה']);
    expect(parseFlashcards('בן (א) (ב) | ابن').errors).toEqual(['שורה 1: אפשר רק הערה אחת בסוגריים']);
    expect(parseFlashcards('(צאצא) | ابن').errors).toEqual(['שורה 1: חסרה מילה בעברית מחוץ לסוגריים']);
    expect(parseFlashcards('בן () | ابن').errors).toEqual(['שורה 1: סוגריים ריקים — כתבו בהם הערה או מחקו אותם']);
    expect(parseFlashcards('בן | ابن | אִבְּן (ערבית)').errors).toEqual([
      'שורה 1: בחלק השלישי: סוגריים אפשר רק בחלק הראשון',
    ]);
  });

  it(`limits each part to ${MAX_CHARS} characters (spaces count, marks don't)`, () => {
    const ok = 'א'.repeat(MAX_CHARS);
    expect(parseFlashcards(`${ok} | uncle`).errors).toEqual([]);
    // Niqqud doesn't count toward the length.
    expect(parseFlashcards(`${'אָ'.repeat(MAX_CHARS)} | uncle`).errors).toEqual([]);
    expect(parseFlashcards(`${ok}א | uncle`).errors).toEqual([`שורה 1: "${ok}א" ארוך מ-${MAX_CHARS} תווים`]);
    expect(parseFlashcards(`דוד | ${'a'.repeat(MAX_CHARS + 1)}`).errors[0]).toContain(`ארוך מ-${MAX_CHARS} תווים`);
  });

  it(`allows 1 to ${MAX_CARDS} lines`, () => {
    // 30, more than the other activities: a week's vocabulary list can be 25 words.
    expect(MAX_CARDS).toBe(30);
    const line = (i: number) => `דוד | uncle${'s'.repeat(i)}`;
    expect(parseFlashcards('').errors).toEqual(['לא הוזנו מילים']);
    expect(parseFlashcards(Array.from({ length: MAX_CARDS }, (_, i) => line(i % 15)).join('\n')).errors).toEqual([]);
    expect(parseFlashcards(Array.from({ length: MAX_CARDS + 1 }, (_, i) => line(i % 15)).join('\n')).errors).toEqual([
      `אפשר עד ${MAX_CARDS} שורות (הוזנו ${MAX_CARDS + 1})`,
    ]);
  });

  it('warns about the same Hebrew word twice in the same language (not in two languages)', () => {
    expect(parseFlashcards('דוד | خال\nדוד | عم').warnings).toEqual(['מילים שמופיעות פעמיים באותה שפה: דוד']);
    expect(parseFlashcards('דוד | خال\nדוד | uncle').warnings).toEqual([]);
    // The note in parentheses doesn't make it a different word.
    expect(parseFlashcards('בן | ابن\nבן (צאצא) | ولد').warnings).toEqual(['מילים שמופיעות פעמיים באותה שפה: בן']);
  });

  it('numbers every error by its line', () => {
    const r = parseFlashcards('דוד | خال\nילד\nאבא | 12');
    expect(r.data).toBeNull();
    expect(r.errors.map((e) => e.slice(0, 7))).toEqual(['שורה 2:', 'שורה 3:']);
  });

  it('cleans invisible characters copied from other apps', () => {
    const r = parseFlashcards('‏דוד‎ | ​خال');
    expect(r.data?.cards[0]).toEqual(['דוד', 'خال']);
  });
});

describe('frontParts', () => {
  it('splits the note in parentheses from the word', () => {
    expect(frontParts('בן (צאצא)')).toEqual({ main: 'בן', hint: 'צאצא' });
    expect(frontParts('בן (צאצא) שלי')).toEqual({ main: 'בן שלי', hint: 'צאצא' });
    expect(frontParts('ילד קטן / תינוק')).toEqual({ main: 'ילד קטן / תינוק', hint: null });
  });
});

describe('flashcards data', () => {
  it('round-trips editor text', () => {
    const text = 'דוד | خال | חאל\nילד | child';
    const data = parseFlashcards(text).data!;
    expect(toText(data)).toBe(text);
    expect(parseFlashcards(toText(data)).data).toEqual(data);
  });

  it('reads stored and shared data', () => {
    const data = parseFlashcards('דוד | خال | חַאל\nילד | child').data!;
    expect(deserializeFlashcards(JSON.parse(JSON.stringify(data)), 1)).toEqual(data);
  });

  it('rejects unknown versions and broken shapes', () => {
    expect(deserializeFlashcards({ cards: [['דוד', 'خال']] }, 2)).toBeNull();
    expect(deserializeFlashcards(null, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: 'דוד' }, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: [['דוד']] }, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: [['דוד', 'خال', 'חאל', 'x']] }, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: [['דוד', 5]] }, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: [['דוד', 'خال | עם']] }, 1)).toBeNull();
    // A shared foreign word in Hebrew letters can't be spoken in its language.
    expect(deserializeFlashcards({ cards: [['דוד', 'חאל']] }, 1)).toBeNull();
    expect(deserializeFlashcards({ cards: [] }, 1)).toBeNull();
  });

  it('loads stored and shared lists of any length up to the safety cap (the editor limit is editor-only)', () => {
    const cards = (n: number) => ({ cards: Array.from({ length: n }, (_, i) => ['דוד', `uncle${'s'.repeat(i % 15)}`]) });
    expect(deserializeFlashcards(cards(MAX_CARDS), 1)?.cards).toHaveLength(MAX_CARDS);
    // A list from a later version with a higher editor limit still loads here.
    expect(deserializeFlashcards(cards(MAX_CARDS + 1), 1)?.cards).toHaveLength(MAX_CARDS + 1);
    expect(deserializeFlashcards(cards(STORED_MAX_CARDS), 1)?.cards).toHaveLength(STORED_MAX_CARDS);
    expect(deserializeFlashcards(cards(STORED_MAX_CARDS + 1), 1)).toBeNull();
  });

  it('re-checks leniently: editor-only mark rules are not applied', () => {
    const marked = 'דָָוד';
    expect(parseFlashcards(`${marked} | uncle`).data).toBeNull();
    expect(deserializeFlashcards({ cards: [[marked, 'uncle']] }, 1)?.cards).toHaveLength(1);
  });
});

describe('flashcards plugin', () => {
  const data = parseFlashcards('דוד | خال | חאל\nילד | child').data!;

  it('is registered with a stable id', () => {
    expect(getPlugin('flashcards')).toBe(flashcards);
    expect(flashcards.dataVersion).toBe(1);
    expect(flashcards.title).toBe('איך אומרים?');
    expect(flashcards.cardTiles).toEqual(['אבא', '/', '?']);
  });

  it('has a valid placeholder and explains the format', () => {
    expect(flashcards.editor.hint).toContain('|');
    expect(flashcards.parse(flashcards.editor.placeholder.replace('…', '')).errors).toEqual([]);
  });

  it('offers the foreign words for the voice test, each in its language', () => {
    expect(flashcards.speakItems(data)).toEqual([
      { text: 'خال', lang: 'ar' },
      { text: 'child', lang: 'en' },
    ]);
  });

  it('summarises saved progress, keyed by the full lines', () => {
    expect(flashcards.summary(data, undefined)).toEqual({ line: '2 מילים · 0 הושלמו', fraction: 0 });
    const keys = data.cards.map(cardLine);
    const known = answer(newCardsProgress(keys, seededRng(1)), true).progress;
    expect(flashcards.summary(data, known)).toEqual({ line: '2 מילים · 1 הושלמה', fraction: 0.5 });
    // A card coming back counts in the bar: 1 of 3, and still not full after the first pass.
    const p = answer(newCardsProgress(keys, seededRng(1)), false).progress;
    expect(flashcards.summary(data, p).fraction).toBeCloseTo(1 / 3);
    const firstPassDone = answer(p, true).progress;
    expect(flashcards.summary(data, firstPassDone)).toMatchObject({ line: '2 מילים · 2 הושלמו' });
    expect(flashcards.summary(data, firstPassDone).fraction).toBeLessThan(1);
    const changed = parseFlashcards('דוד | خال\nילד | child').data!;
    expect(flashcards.summary(changed, p).fraction).toBe(0);
  });
});
