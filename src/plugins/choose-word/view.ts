/**
 * The "בחרו את המילה" game screen: hear a word, tap the correctly spelled one
 * among 2–4 options.
 */
import { h, icon, delay, prefersReducedMotion } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { announce } from '../../ui/dialog';
import { defaultRng } from '../../core/rng';
import { pointsForMistakes } from '../../core/scoring';
import type { GameContext } from '../types';
import { wordCountLabel } from '../shared/letter-game/text';
import { CELEBRATION_MS, MAX_DOTS } from '../shared/letter-game/view';
import { completeWord, isValidProgress, newProgress, type RoundProgress } from '../shared/letter-game/progress';
import { choose, columnsFor, createChoiceRound, type ChoiceRound } from './round';
import type { ChooseItem } from './parse';

type Phase = 'intro' | 'play' | 'celebrate' | 'end';

/** The option shaking orange right after a wrong tap. */
interface Highlight {
  wrong?: string;
}

/** `keys` identify the content for saved progress (one per item); progress resets when they change. */
export function mountChooseGame(
  container: HTMLElement,
  items: readonly ChooseItem[],
  keys: readonly string[],
  ctx: GameContext,
): () => void {
  let destroyed = false;
  let busy = false;
  let message = '';
  let lastPoints = 0;
  let skipCelebration: (() => void) | null = null;
  let repeatTimer: number | null = null;
  const cancelRepeat = () => {
    if (repeatTimer !== null) window.clearTimeout(repeatTimer);
    repeatTimer = null;
  };

  const saved = ctx.loadProgress();
  let progress: RoundProgress =
    isValidProgress(saved, keys) && !saved.done ? saved : newProgress(keys, defaultRng);
  if (progress !== saved) ctx.commit(progress);

  const roundFor = (p: RoundProgress): ChoiceRound => {
    const item = items[p.order[p.index]];
    return createChoiceRound(item.word, item.wrong, defaultRng);
  };
  let round: ChoiceRound = roundFor(progress);
  let phase: Phase = 'intro';
  const resuming = progress.index > 0;

  const root = h('div', { class: 'screen game compact choose' });
  container.appendChild(root);

  // ---------- actions ----------

  const speakCurrent = () => void ctx.speaker.speak(round.word);

  function start() {
    ctx.sounds.unlock();
    phase = 'play';
    render();
    speakCurrent();
  }

  async function onChoose(option: string) {
    if (busy || phase !== 'play') return;
    const { round: next, result } = choose(round, option);
    if (result === 'ignored') return;
    round = next;

    if (result === 'wrong') {
      busy = true;
      message = 'כמעט! נסו שוב';
      announce(message);
      ctx.sounds.play('wrong');
      render({ wrong: option });
      await delay(prefersReducedMotion() ? 300 : 550);
      if (destroyed) return;
      busy = false;
      render();
      return;
    }

    message = '';
    ctx.sounds.play('correct');
    await celebrate();
  }

  async function celebrate() {
    busy = true;
    lastPoints = pointsForMistakes(round.mistakes);
    progress = completeWord(progress, lastPoints);
    ctx.commit(progress, lastPoints);
    phase = 'celebrate';
    render();
    ctx.sounds.play('success');

    // Say the word again after a short pause — unless the kid skips ahead or
    // leaves first, so an old word never plays over the next one.
    const word = round.word;
    const repeated = new Promise<void>((resolve) => {
      repeatTimer = window.setTimeout(() => {
        repeatTimer = null;
        if (destroyed || phase !== 'celebrate') return resolve();
        void ctx.speaker.speak(word).then(resolve);
      }, 500);
    });
    const skipped = new Promise<void>((resolve) => (skipCelebration = resolve));
    // The right word next to the tried ones stays the time set on the edit screen; otherwise 1.6 s.
    const showsPair = round.tried.length > 0;
    await Promise.race([skipped, Promise.all([delay(showsPair ? ctx.pairMs : CELEBRATION_MS), repeated])]);
    cancelRepeat();
    skipCelebration = null;
    if (destroyed) return;

    if (progress.done) {
      phase = 'end';
    } else {
      round = roundFor(progress);
      phase = 'play';
      speakCurrent();
    }
    busy = false;
    render();
  }

  function playAgain() {
    ctx.sounds.unlock();
    progress = newProgress(keys, defaultRng);
    ctx.commit(progress);
    round = roundFor(progress);
    phase = 'play';
    message = '';
    render();
    speakCurrent();
  }

  // ---------- rendering ----------

  function progressIndicator() {
    // While celebrating, the finished word is still the one shown ("1 / 20", not "2 / 20").
    const current = phase === 'celebrate' ? progress.index : Math.min(progress.index + 1, items.length);
    const label = `מילה ${current} מתוך ${items.length}`;
    if (items.length > MAX_DOTS) {
      return h('div', { class: 'counter', role: 'img', 'aria-label': label, dir: 'ltr' }, `${current} / ${items.length}`);
    }
    const dots = h('div', { class: 'dots', role: 'img', 'aria-label': label });
    progress.order.forEach((_, i) => {
      const cls = i < progress.index ? 'dot done' : i === progress.index && phase !== 'end' ? 'dot current' : 'dot';
      dots.appendChild(h('span', { class: cls }));
    });
    return dots;
  }

  function topBar() {
    return h(
      'header',
      { class: 'topbar' },
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה לבית', onclick: () => ctx.exit() },
        icon(ICONS.home),
      ),
      progressIndicator(),
      h('div', { class: 'points-chip' }, icon(ICONS.star, 'icon star'), h('span', {}, String(ctx.totalPoints()))),
    );
  }

  function speakerButton() {
    return h(
      'div',
      { class: 'speaker-wrap' },
      h(
        'button',
        { class: 'speaker-btn', type: 'button', 'aria-label': 'לשמוע את המילה', onclick: speakCurrent },
        icon(ICONS.speaker, 'icon speaker-icon'),
      ),
      h('span', { class: 'speaker-label' }, 'לשמוע שוב'),
    );
  }

  function choicesEl(hl: Highlight) {
    const columns = columnsFor(round.options);
    const grid = h('div', { class: `choices${columns === 1 ? ' one' : ''}` });
    round.options.forEach((option, i) => {
      const right = round.solved && option === round.word;
      const dimmed = round.tried.includes(option) && hl.wrong !== option;
      // An odd last option in two columns sits centred, the same width as the others.
      const centred = columns === 2 && round.options.length % 2 === 1 && i === round.options.length - 1;
      const state = right ? ', נכון' : dimmed ? ', נוסתה' : '';
      const btn = h(
        'button',
        {
          class: `choice${right ? ' right' : ''}${hl.wrong === option ? ' wrong' : ''}${dimmed ? ' dimmed' : ''}${centred ? ' centred' : ''}`,
          type: 'button',
          'aria-label': `אפשרות ${i + 1}: ${option}${state}`,
          'data-option': i,
          ...(dimmed ? { 'aria-disabled': 'true' } : {}),
          onclick: () => void onChoose(option),
        },
        h('span', { class: 'choice-text' }, option),
        right ? h('span', { class: 'check-badge' }, icon(ICONS.check)) : null,
      );
      grid.appendChild(btn);
    });
    return grid;
  }

  function introView() {
    return h(
      'div',
      { class: 'stage center' },
      h(
        'button',
        { class: 'start-btn', type: 'button', onclick: start },
        icon(ICONS.play, 'icon start-icon'),
        h('span', {}, resuming ? 'ממשיכים' : 'התחלה'),
      ),
      h(
        'p',
        { class: 'muted big' },
        resuming ? `מילה ${progress.index + 1} מתוך ${items.length}` : wordCountLabel(items.length),
      ),
    );
  }

  function endView() {
    return h(
      'div',
      { class: 'stage center end' },
      icon(ICONS.star, 'icon end-star'),
      h('h1', { class: 'title' }, 'כל הכבוד!'),
      h('p', { class: 'muted big' }, items.length === 1 ? 'השלמת את המילה' : `השלמת את כל ${items.length} המילים`),
      h(
        'div',
        { class: 'points-chip large' },
        icon(ICONS.star, 'icon star'),
        h('span', {}, `${progress.roundPoints} נקודות`),
      ),
      h(
        'div',
        { class: 'end-actions' },
        h(
          'button',
          { class: 'btn btn-primary btn-big', type: 'button', onclick: playAgain },
          icon(ICONS.again),
          h('span', {}, 'לשחק שוב'),
        ),
        h(
          'button',
          { class: 'btn btn-big', type: 'button', onclick: () => ctx.exit() },
          icon(ICONS.home),
          h('span', {}, 'חזרה לבית'),
        ),
      ),
    );
  }

  function celebration() {
    const tried = round.tried.length > 0;
    // The contrast card is inside a button, so screen readers hear it here instead.
    announce(`כל הכבוד! ${lastPoints} נקודות.${tried ? ` ${round.word}, ולא ${round.tried.join(', ')}` : ''}`);
    return h(
      'button',
      {
        class: 'celebration',
        type: 'button',
        'aria-label': 'למילה הבאה',
        onclick: () => skipCelebration?.(),
      },
      tried ? null : icon(ICONS.star, 'icon burst b1'),
      tried ? null : icon(ICONS.star, 'icon burst b2'),
      tried ? null : icon(ICONS.star, 'icon burst b3'),
      h('span', { class: 'celebrate-points', dir: 'ltr' }, `+${lastPoints}`),
      tried ? contrastCard() : h('span', { class: 'celebrate-text' }, 'כל הכבוד!'),
    );
  }

  /** The right word (✓) above the wrong words that were tried (crossed out). No text. */
  function contrastCard() {
    return h(
      'span',
      { class: 'word-contrast' },
      h(
        'span',
        { class: 'word-tile right' },
        h('span', { class: 'choice-text' }, round.word),
        h('span', { class: 'check-badge' }, icon(ICONS.check)),
      ),
      h(
        'span',
        { class: 'word-contrast-tried' },
        ...round.tried.map((w) => h('span', { class: 'word-tile crossed' }, h('span', { class: 'choice-text' }, w))),
      ),
    );
  }

  function render(hl: Highlight = {}) {
    if (destroyed) return;
    // Re-rendering replaces the options; keep keyboard focus on the same one.
    const focused = root.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.option
      : undefined;
    root.replaceChildren(topBar());
    if (phase === 'intro') {
      root.appendChild(introView());
      return;
    }
    if (phase === 'end') {
      root.appendChild(endView());
      return;
    }
    root.appendChild(
      h(
        'div',
        { class: 'stage' },
        phase === 'celebrate' ? celebration() : speakerButton(),
        h('p', { class: 'message' }, phase === 'play' ? message : ''),
      ),
    );
    const grid = choicesEl(hl);
    root.appendChild(grid);
    if (focused !== undefined) {
      (grid.querySelector<HTMLElement>(`.choice[data-option="${focused}"]`) ?? grid.querySelector<HTMLElement>('.choice'))?.focus();
    }
  }

  render();

  return () => {
    destroyed = true;
    cancelRepeat();
    skipCelebration?.();
    ctx.speaker.cancel();
    root.remove();
  };
}
