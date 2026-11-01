import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/rng';
import { activeRound, readFlash, withRound, writeFlash, type FlashState } from '../../src/plugins/flashcards/direction';
import { answer, isValidCardsProgress, newCardsProgress, type CardsProgress } from '../../src/plugins/flashcards/round';
import { parseFlashcards, cardLine } from '../../src/plugins/flashcards/parse';
import { flashcards } from '../../src/plugins/flashcards';

const keys = ['דוד | خال', 'ילד | child', 'אבא | أب'];
const rng = () => seededRng(7);

/** Plays a whole round answering "ידעתי". */
function finish(p: CardsProgress): CardsProgress {
  while (!p.done) p = answer(p, true).progress;
  return p;
}

describe('flashcards directions: saved state', () => {
  it('nothing saved: Hebrew first, no rounds, no ✓', () => {
    expect(readFlash(undefined, keys)).toEqual({ dir: 'to-foreign', rounds: { 'to-foreign': null, 'to-hebrew': null }, finished: [] });
  });

  it('reads progress saved by app 1.7 (the round at the top level) as the Hebrew-first round', () => {
    const old = answer(newCardsProgress(keys, rng()), true).progress;
    const s = readFlash(JSON.parse(JSON.stringify(old)), keys);
    expect(s.dir).toBe('to-foreign');
    expect(s.rounds['to-foreign']).toEqual(old);
    expect(s.rounds['to-hebrew']).toBeNull();
  });

  it('keeps the Hebrew-first round at the top level, so app 1.7 still reads it', () => {
    const fwd = answer(newCardsProgress(keys, rng()), true).progress;
    const rev = newCardsProgress(keys, seededRng(9));
    const state: FlashState = { dir: 'to-hebrew', rounds: { 'to-foreign': fwd, 'to-hebrew': rev }, finished: ['to-foreign'] };
    const saved = writeFlash(state, keys, rng());
    expect(isValidCardsProgress(saved, keys)).toBe(true);
    expect(saved).toMatchObject({ ...fwd, dir: 'to-hebrew', rev, finished: ['to-foreign'] });
    // And it reads back the same.
    expect(readFlash(JSON.parse(JSON.stringify(saved)), keys)).toEqual(state);
  });

  it('writes only the round fields when nothing else is set (same as before)', () => {
    const fwd = newCardsProgress(keys, rng());
    const saved = writeFlash({ dir: 'to-foreign', rounds: { 'to-foreign': fwd, 'to-hebrew': null }, finished: [] }, keys, rng());
    expect(saved).toEqual(fwd);
  });

  it('a top-level round is created when only the reverse direction was played', () => {
    const rev = newCardsProgress(keys, rng());
    const saved = writeFlash({ dir: 'to-hebrew', rounds: { 'to-foreign': null, 'to-hebrew': rev }, finished: [] }, keys, rng());
    expect(isValidCardsProgress(saved, keys)).toBe(true);
    expect(saved.index).toBe(0);
    expect(saved.rev).toEqual(rev);
  });

  it('a changed list: rounds and ✓ start fresh, the last direction is remembered', () => {
    const saved = writeFlash(
      { dir: 'to-hebrew', rounds: { 'to-foreign': null, 'to-hebrew': newCardsProgress(keys, rng()) }, finished: ['to-hebrew'] },
      keys,
      rng(),
    );
    const s = readFlash(saved, ['דוד | خال']);
    expect(s).toEqual({ dir: 'to-hebrew', rounds: { 'to-foreign': null, 'to-hebrew': null }, finished: [] });
  });

  it('app 1.7 continuing the saved round keeps the extras (its answer() copies the whole object)', () => {
    const state: FlashState = {
      dir: 'to-hebrew',
      rounds: { 'to-foreign': newCardsProgress(keys, rng()), 'to-hebrew': answer(newCardsProgress(keys, rng()), true).progress },
      finished: ['to-hebrew'],
    };
    const saved = writeFlash(state, keys, rng());
    // What 1.7 does on a "ידעתי": answer() on the top-level round, saved as is.
    const after17 = answer(saved, true).progress;
    const back = readFlash(JSON.parse(JSON.stringify(after17)), keys);
    expect(back.dir).toBe('to-hebrew');
    expect(back.rounds['to-hebrew']).toEqual(state.rounds['to-hebrew']);
    expect(back.finished).toEqual(['to-hebrew']);
    expect(back.rounds['to-foreign']?.index).toBe(1);
  });

  it('saving twice with only the reverse direction played writes the same thing', () => {
    let s: FlashState = { ...readFlash(undefined, keys), dir: 'to-hebrew' };
    s = withRound(s, activeRound(s, keys, rng()), keys, seededRng(1));
    expect(writeFlash(s, keys, seededRng(2))).toEqual(writeFlash(s, keys, seededRng(3)));
  });

  it('ignores broken extras', () => {
    const fwd = newCardsProgress(keys, rng());
    const s = readFlash({ ...fwd, dir: 'sideways', rev: { index: 'x' }, finished: ['to-hebrew', 'up', 3] }, keys);
    expect(s).toEqual({ dir: 'to-foreign', rounds: { 'to-foreign': fwd, 'to-hebrew': null }, finished: ['to-hebrew'] });
  });
});

describe('flashcards directions: rounds', () => {
  it('each direction keeps its own round', () => {
    let s = readFlash(undefined, keys);
    const fwd = answer(activeRound(s, keys, rng()), true).progress;
    s = withRound(s, fwd, keys, rng());
    s = { ...s, dir: 'to-hebrew' };
    const rev = activeRound(s, keys, seededRng(3));
    expect(rev.index).toBe(0);
    s = withRound(s, rev, keys, rng());
    // Back to Hebrew first: the round in progress is still there.
    s = { ...s, dir: 'to-foreign' };
    expect(activeRound(s, keys, rng())).toEqual(fwd);
  });

  it('a finished round marks its direction ✓, once; the next round starts fresh', () => {
    let s: FlashState = { ...readFlash(undefined, keys), dir: 'to-hebrew' };
    const done = finish(activeRound(s, keys, rng()));
    s = withRound(s, done, keys, rng());
    expect(s.finished).toEqual(['to-hebrew']);
    expect(withRound(s, done, keys, rng()).finished).toEqual(['to-hebrew']);
    expect(activeRound(s, keys, rng())).toMatchObject({ index: 0, done: false });
    // A new round keeps the ✓.
    s = withRound(s, newCardsProgress(keys, rng()), keys, rng());
    expect(s.finished).toEqual(['to-hebrew']);
  });
});

describe('flashcards home card summary', () => {
  const data = parseFlashcards('דוד | خال\nילד | child').data!;
  const k = data.cards.map(cardLine);

  it('shows the round of the direction played last', () => {
    const fwd = answer(newCardsProgress(k, rng()), true).progress;
    const rev = newCardsProgress(k, rng());
    const saved = (dir: 'to-foreign' | 'to-hebrew') =>
      writeFlash({ dir, rounds: { 'to-foreign': fwd, 'to-hebrew': rev }, finished: [] }, k, rng());
    expect(flashcards.summary(data, saved('to-foreign'))).toEqual({ line: '2 מילים · 1 הושלמה', fraction: 0.5 });
    expect(flashcards.summary(data, saved('to-hebrew'))).toEqual({ line: '2 מילים · 0 הושלמו', fraction: 0 });
  });
});
