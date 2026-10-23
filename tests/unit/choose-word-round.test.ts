import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/rng';
import { normalizeText } from '../../src/core/unicode';
import { pointsForMistakes } from '../../src/core/scoring';
import {
  choose,
  columnsFor,
  createChoiceRound,
  TWO_COLUMN_MAX_LETTERS,
  type ChoiceRound,
} from '../../src/plugins/choose-word/round';

const n = normalizeText;
const word = n('כַּעַס');
const wrong = [n('קַעַס'), n('כַּאַס'), n('קַאַס')];

describe('choose word round', () => {
  it('shows the correct word and every wrong word once', () => {
    const r = createChoiceRound(word, wrong, seededRng(1));
    expect([...r.options].sort()).toEqual([word, ...wrong].sort());
    expect(r).toMatchObject({ word, tried: [], mistakes: 0, solved: false });
  });

  it('puts the correct word in every position over many rounds (random order)', () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 100; seed++) positions.add(createChoiceRound(word, wrong, seededRng(seed)).options.indexOf(word));
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('works with a single wrong word (2 options)', () => {
    const r = createChoiceRound('כעס', ['קעס'], seededRng(2));
    expect([...r.options].sort()).toEqual(['כעס', 'קעס'].sort());
  });

  it('a wrong tap counts a mistake and dims that word', () => {
    const r0 = createChoiceRound(word, wrong, seededRng(3));
    const { round: r1, result } = choose(r0, wrong[1]);
    expect(result).toBe('wrong');
    expect(r1.tried).toEqual([wrong[1]]);
    expect(r1.mistakes).toBe(1);
    expect(r1.solved).toBe(false);
    // The options keep their places after a mistake.
    expect(r1.options).toEqual(r0.options);
    // The round before the tap is unchanged.
    expect(r0.tried).toEqual([]);
  });

  it('tapping a dimmed word again is ignored, not a second mistake', () => {
    const r1 = choose(createChoiceRound(word, wrong, seededRng(4)), wrong[0]).round;
    const { round: r2, result } = choose(r1, wrong[0]);
    expect(result).toBe('ignored');
    expect(r2).toBe(r1);
  });

  it('keeps the tried words in the order they were tapped', () => {
    let r: ChoiceRound = createChoiceRound(word, wrong, seededRng(5));
    r = choose(r, wrong[2]).round;
    r = choose(r, wrong[0]).round;
    expect(r.tried).toEqual([wrong[2], wrong[0]]);
    expect(r.mistakes).toBe(2);
  });

  it('the correct word solves the round; later taps are ignored', () => {
    let r: ChoiceRound = createChoiceRound(word, wrong, seededRng(6));
    r = choose(r, wrong[0]).round;
    const { round: solved, result } = choose(r, word);
    expect(result).toBe('correct');
    expect(solved.solved).toBe(true);
    expect(solved.mistakes).toBe(1);
    expect(choose(solved, wrong[1]).result).toBe('ignored');
    expect(choose(solved, word).result).toBe('ignored');
  });

  it('ignores a word that is not an option', () => {
    const r = createChoiceRound(word, wrong, seededRng(7));
    expect(choose(r, 'שלום').result).toBe('ignored');
  });

  it('scores 10 / 7 / 5 like the other games; 3 mistakes need 4 options', () => {
    let r: ChoiceRound = createChoiceRound(word, wrong, seededRng(8));
    expect(pointsForMistakes(r.mistakes)).toBe(10);
    for (const w of wrong) r = choose(r, w).round;
    expect(r.mistakes).toBe(3);
    expect(pointsForMistakes(r.mistakes)).toBe(5);
    expect(choose(r, word).result).toBe('correct');
  });
});

describe('choose word layout', () => {
  it(`uses two columns for words up to ${TWO_COLUMN_MAX_LETTERS} letters, niqqud not counted`, () => {
    expect(TWO_COLUMN_MAX_LETTERS).toBe(7);
    expect(columnsFor([word, ...wrong])).toBe(2);
    expect(columnsFor(['אבגדהוז', 'אבגדהוח'])).toBe(2);
    expect(columnsFor([n('מִתְעַצְבֶּנֶת'), n('מִתְאַצְבֶּנֶת')])).toBe(2);
  });

  it('uses one column when any option is longer than 7 letters', () => {
    expect(columnsFor(['אבגדהוזח', 'כעס'])).toBe(1);
    expect(columnsFor(['כעס', n('הַמִּתְעַצְבְּנִים')])).toBe(1);
  });

  it('counts characters for text that is not a Hebrew word (never stored, but never crashes)', () => {
    expect(columnsFor(['abcdefgh'])).toBe(1);
    expect(columnsFor(['abc'])).toBe(2);
  });
});
