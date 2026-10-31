import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/rng';
import {
  answer,
  CARD_POINTS,
  currentCard,
  isRepeat,
  isValidCardsProgress,
  knownCount,
  newCardsProgress,
  roundLength,
  type CardsProgress,
} from '../../src/plugins/flashcards/round';

const keys = ['דוד | خال', 'ילד | child', 'אבא | أب'];

/** Answers every card of a round in order with the given answers; returns the progress after each. */
function play(p: CardsProgress, answers: boolean[]) {
  const seen: number[] = [];
  let points = 0;
  for (const knew of answers) {
    seen.push(currentCard(p));
    const r = answer(p, knew);
    p = r.progress;
    points += r.points;
  }
  return { p, seen, points };
}

describe('flashcards round', () => {
  it('shows every card once, in random order', () => {
    const p = newCardsProgress(keys, seededRng(3));
    expect([...p.order].sort()).toEqual([0, 1, 2]);
    expect(p).toMatchObject({ again: [], index: 0, roundPoints: 0, done: false });
    const firsts = new Set<number>();
    for (let seed = 0; seed < 50; seed++) firsts.add(currentCard(newCardsProgress(keys, seededRng(seed))));
    expect([...firsts].sort()).toEqual([0, 1, 2]);
  });

  it('gives the same points for "ידעתי" and "עוד לא" (the kid judges themselves)', () => {
    const p = newCardsProgress(keys, seededRng(1));
    expect(answer(p, true).points).toBe(CARD_POINTS);
    expect(answer(p, false).points).toBe(CARD_POINTS);
  });

  it('all known: the round ends after one pass', () => {
    const { p, seen, points } = play(newCardsProgress(keys, seededRng(1)), [true, true, true]);
    expect(p.done).toBe(true);
    expect(seen).toEqual(newCardsProgress(keys, seededRng(1)).order);
    expect(points).toBe(3 * CARD_POINTS);
    expect(p.roundPoints).toBe(3 * CARD_POINTS);
    expect(knownCount(p)).toBe(3);
  });

  it('"עוד לא" cards come back once at the end, for 0 points', () => {
    const start = newCardsProgress(keys, seededRng(1));
    const { p, seen, points } = play(start, [false, true, false]);
    expect(p.done).toBe(false);
    expect(isRepeat(p)).toBe(true);
    expect(roundLength(p)).toBe(5);
    expect(p.again).toEqual([start.order[0], start.order[2]]);
    expect(points).toBe(3 * CARD_POINTS);

    // On the repeat, "עוד לא" again doesn't bring the card back a third time.
    const repeat = play(p, [false, true]);
    expect(repeat.seen).toEqual([start.order[0], start.order[2]]);
    expect(repeat.points).toBe(0);
    expect(repeat.p.done).toBe(true);
    expect(repeat.p.roundPoints).toBe(3 * CARD_POINTS);
    expect(knownCount(repeat.p)).toBe(1);
    expect([...seen, ...repeat.seen]).toHaveLength(roundLength(repeat.p));
  });

  it('ignores answers after the round is done', () => {
    const { p } = play(newCardsProgress(keys, seededRng(1)), [true, true, true]);
    expect(answer(p, true)).toEqual({ progress: p, points: 0 });
  });

  it('accepts its own saved progress at every step', () => {
    let p = newCardsProgress(keys, seededRng(2));
    expect(isValidCardsProgress(p, keys)).toBe(true);
    for (const knew of [false, true, false, true, false]) {
      p = answer(p, knew).progress;
      expect(isValidCardsProgress(JSON.parse(JSON.stringify(p)), keys)).toBe(true);
    }
    expect(p.done).toBe(true);
  });

  it('rejects progress for other cards or in an impossible state', () => {
    const p = answer(newCardsProgress(keys, seededRng(2)), false).progress;
    expect(isValidCardsProgress(p, ['דוד | خال', 'ילד | child'])).toBe(false);
    expect(isValidCardsProgress(null, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, order: [0, 0, 1] }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, index: 1.5 }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, index: -1 }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, again: [p.order[0], p.order[0]] }, keys)).toBe(false);
    // A card can't come back before it was shown.
    expect(isValidCardsProgress({ ...p, again: [p.order[2]] }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, again: undefined }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, done: true }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, index: 5 }, keys)).toBe(false);
    expect(isValidCardsProgress({ ...p, roundPoints: '5' }, keys)).toBe(false);
  });
});
