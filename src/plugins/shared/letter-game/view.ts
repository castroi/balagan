/**
 * The letter-tile game screen shared by "מילים מבולגנות" and "אותיות מבלבלות":
 * hear a word, tap (or drag) its letters into the slots in order.
 */
import { h, icon, delay, prefersReducedMotion } from '../../../ui/dom';
import { ICONS } from '../../../ui/icons';
import { announce } from '../../../ui/dialog';
import { defaultRng } from '../../../core/rng';
import { pointsForMistakes } from '../../../core/scoring';
import type { GameContext } from '../../types';
import { wordCountLabel } from './text';
import { completeWord, isValidProgress, newProgress, type RoundProgress } from './progress';
import { createRound, nextSlot, placeTile, type WordRound } from './round';

/** One word to play, with any extra (confusing) letters mixed into its tray. */
export interface GameItem {
  word: string;
  extras: readonly string[];
}

export interface LetterGameOptions {
  /** Dim a wrong tile until the current slot is solved. */
  dimWrong?: boolean;
  /** After the word, show each confusing letter that was tried next to the right one. */
  showConfusions?: boolean;
  /** Smaller tiles and speaker button, so up to 15 tiles fit on a small phone. */
  compact?: boolean;
}

type Phase = 'intro' | 'play' | 'celebrate' | 'end';

interface Highlight {
  wrongSlot?: number;
  wrongText?: string;
  wrongTileId?: number;
  popSlot?: number;
  returningTileId?: number;
}

const DRAG_THRESHOLD = 10;
/** How long the popup after a word stays (at least until the word is said again). */
export const CELEBRATION_MS = 1600;
/** Above this many words the progress dots become a "4 / 20" counter. */
export const MAX_DOTS = 10;

const removeDragGhosts = () => document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());

/**
 * `keys` identify the content for saved progress (one per item); progress
 * resets when they change.
 */
export function mountLetterGame(
  container: HTMLElement,
  items: readonly GameItem[],
  keys: readonly string[],
  ctx: GameContext,
  options: LetterGameOptions = {},
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
  let suppressClick: { btn: HTMLElement; until: number } | null = null;

  const saved = ctx.loadProgress();
  let progress: RoundProgress =
    isValidProgress(saved, keys) && !saved.done ? saved : newProgress(keys, defaultRng);
  if (progress !== saved) ctx.commit(progress);

  const roundFor = (p: RoundProgress): WordRound => {
    const item = items[p.order[p.index]];
    return createRound(item.word, item.extras, defaultRng);
  };
  let round: WordRound = roundFor(progress);
  /** The popup after this word shows a letter pair (Confusing Letters, after a confusing letter was tried). */
  const showsPair = () => Boolean(options.showConfusions) && round.confusions.length > 0;
  let phase: Phase = 'intro';
  const resuming = progress.index > 0;

  const root = h('div', { class: `screen game${options.compact ? ' compact' : ''}` });
  container.appendChild(root);

  // ---------- actions ----------

  const speakCurrent = () => void ctx.speaker.speak(round.word);

  function start() {
    ctx.sounds.unlock();
    phase = 'play';
    render();
    speakCurrent();
  }

  async function onPlace(tileId: number) {
    if (busy || phase !== 'play') return;
    const { round: next, result } = placeTile(round, tileId, { dimWrong: options.dimWrong });
    if (result.kind === 'ignored') return;

    if (result.kind === 'wrong') {
      const text = round.tray.find((t) => t?.id === tileId)?.text ?? '';
      round = next;
      busy = true;
      message = 'כמעט! נסו שוב';
      announce(message);
      ctx.sounds.play('wrong');
      render({ wrongSlot: result.slot, wrongText: text, wrongTileId: tileId });
      await delay(prefersReducedMotion() ? 300 : 550);
      if (destroyed) return;
      busy = false;
      render({ returningTileId: tileId });
      return;
    }

    round = next;
    message = '';
    ctx.sounds.play('correct');
    render({ popSlot: result.slot });
    if (result.complete) await celebrate();
  }

  async function celebrate() {
    busy = true;
    lastPoints = pointsForMistakes(round.mistakes);
    progress = completeWord(progress, lastPoints);
    ctx.commit(progress, lastPoints);
    phase = 'celebrate';
    await delay(250);
    if (destroyed) return;
    render();
    ctx.sounds.play('success');

    // Say the finished word again after a short pause — unless the kid skips
    // ahead or leaves first, so an old word never plays over the next one.
    const word = round.word;
    const repeated = new Promise<void>((resolve) => {
      repeatTimer = window.setTimeout(() => {
        repeatTimer = null;
        if (destroyed || phase !== 'celebrate') return resolve();
        void ctx.speaker.speak(word).then(resolve);
      }, 500);
    });
    const skipped = new Promise<void>((resolve) => (skipCelebration = resolve));
    // A letter pair (Confusing Letters) stays the time set on the edit screen; every other popup 1.6 s.
    await Promise.race([skipped, Promise.all([delay(showsPair() ? ctx.pairMs : CELEBRATION_MS), repeated])]);
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

  // ---------- drag & tap ----------

  const isDimmed = (tileId: number) => round.dimmed.includes(round.tray.find((t) => t?.id === tileId)?.text ?? '');

  function wireTile(btn: HTMLButtonElement, tileId: number, tray: HTMLElement) {
    btn.addEventListener('click', () => {
      if (suppressClick?.btn === btn && performance.now() < suppressClick.until) return;
      void onPlace(tileId);
    });

    btn.addEventListener('pointerdown', (e) => {
      if (busy || phase !== 'play' || e.button !== 0 || isDimmed(tileId)) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let ghost: HTMLElement | null = null;
      const rect = btn.getBoundingClientRect();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* not supported — dragging still works within the button */
      }

      const move = (ev: PointerEvent) => {
        if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
          ghost = btn.cloneNode(true) as HTMLElement;
          ghost.classList.add('drag-ghost');
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          ghost.style.fontSize = getComputedStyle(btn).fontSize;
          document.body.appendChild(ghost);
          btn.classList.add('dragging');
        }
        if (ghost) {
          ghost.style.transform = `translate(${ev.clientX - rect.width / 2}px, ${ev.clientY - rect.height / 2}px)`;
        }
      };
      const finish = (ev: PointerEvent, cancelled: boolean) => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', cancel);
        btn.removeEventListener('lostpointercapture', cancel);
        if (!ghost) return;
        ghost.remove();
        btn.classList.remove('dragging');
        // The browser may send a click after the drag ends — ignore it for this tile only.
        suppressClick = { btn, until: performance.now() + 400 };
        if (cancelled) return;
        // Dropping anywhere outside the tray places the tile, same as a tap.
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!target || !tray.contains(target)) void onPlace(tileId);
      };
      const up = (ev: PointerEvent) => finish(ev, false);
      const cancel = (ev: PointerEvent) => finish(ev, true);
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', cancel);
      // If the browser takes the pointer away mid-drag, treat it as a cancelled drag.
      // (A tile removed by a re-render gets no event; render() removes its ghost instead.)
      btn.addEventListener('lostpointercapture', cancel);
    });
  }

  // ---------- rendering ----------

  function progressIndicator() {
    // While celebrating, the finished word is still the one shown ("1 / 20", not "2 / 20").
    const current = phase === 'celebrate' ? progress.index : Math.min(progress.index + 1, items.length);
    const label = `מילה ${current} מתוך ${items.length}`;
    // Many words don't fit as dots next to the buttons — show a counter instead.
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

  function slotsRow(hl: Highlight) {
    const row = h('div', { class: 'slots', style: `--n: ${round.expected.length}` });
    const next = nextSlot(round);
    round.slots.forEach((tile, i) => {
      if (tile) {
        row.appendChild(
          h(
            'div',
            { class: `slot locked${hl.popSlot === i ? ' pop' : ''}` },
            h('span', { class: 'tile-text' }, tile.text),
            h('span', { class: 'check-badge' }, icon(ICONS.check)),
          ),
        );
      } else if (hl.wrongSlot === i) {
        row.appendChild(h('div', { class: 'slot wrong' }, h('span', { class: 'tile-text' }, hl.wrongText ?? '')));
      } else {
        row.appendChild(h('div', { class: `slot empty${i === next && phase === 'play' ? ' next' : ''}` }));
      }
    });
    return row;
  }

  function trayEl(hl: Highlight) {
    const tray = h('div', { class: 'tray' });
    for (const tile of round.tray) {
      if (!tile) {
        tray.appendChild(h('span', { class: 'tile-ghost', 'aria-hidden': 'true' }));
        continue;
      }
      // During a wrong-answer shake the tile is shown in the slot, so its tray spot is empty.
      const hidden = hl.wrongTileId === tile.id;
      // A dimmed tile was already tried at this slot; it comes back for the next one.
      const dimmed = round.dimmed.includes(tile.text);
      const btn = h(
        'button',
        {
          class: `tile${hl.returningTileId === tile.id ? ' returning' : ''}${hidden ? ' away' : ''}${dimmed ? ' dimmed' : ''}`,
          type: 'button',
          'aria-label': `האות ${tile.text}`,
          'data-tile': tile.id,
          ...(dimmed ? { 'aria-disabled': 'true' } : {}),
        },
        h('span', { class: 'tile-text' }, tile.text),
      );
      wireTile(btn, tile.id, tray);
      tray.appendChild(btn);
    }
    return tray;
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
    // The contrast card is inside a button, so screen readers hear it here instead.
    const pairs =
      showsPair()
        ? ` ${round.confusions.map((c) => `${c.right} ולא ${c.wrong}`).join(', ')}`
        : '';
    announce(`כל הכבוד! ${lastPoints} נקודות.${pairs}`);
    return h(
      'button',
      {
        class: 'celebration',
        type: 'button',
        'aria-label': 'למילה הבאה',
        onclick: () => skipCelebration?.(),
      },
      icon(ICONS.star, 'icon burst b1'),
      icon(ICONS.star, 'icon burst b2'),
      icon(ICONS.star, 'icon burst b3'),
      h('span', { class: 'celebrate-points', dir: 'ltr' }, `+${lastPoints}`),
      h('span', { class: 'celebrate-text' }, 'כל הכבוד!'),
      showsPair() ? contrastCard() : null,
    );
  }

  /** The right letter (✓) next to the confusing one it was mixed up with (crossed out). No text. */
  function contrastCard() {
    return h(
      'span',
      { class: 'contrast' },
      ...round.confusions.map((c) =>
        h(
          'span',
          { class: 'contrast-pair', role: 'img', 'aria-label': `${c.right} ולא ${c.wrong}` },
          h(
            'span',
            { class: 'contrast-tile right' },
            h('span', { class: 'tile-text' }, c.right),
            h('span', { class: 'check-badge' }, icon(ICONS.check)),
          ),
          h('span', { class: 'contrast-tile crossed' }, h('span', { class: 'tile-text' }, c.wrong)),
        ),
      ),
    );
  }

  function render(hl: Highlight = {}) {
    if (destroyed) return;
    removeDragGhosts();
    // Re-rendering replaces the tiles; keep keyboard focus in the tray.
    const focusedTile = root.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.tile
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
    const stage = h(
      'div',
      { class: 'stage' },
      phase === 'celebrate' ? celebration() : speakerButton(),
      slotsRow(hl),
      h('p', { class: 'message' }, phase === 'play' ? message : ''),
    );
    root.appendChild(stage);
    const tray = trayEl(hl);
    root.appendChild(tray);
    if (focusedTile !== undefined) {
      const same = tray.querySelector<HTMLElement>(`.tile[data-tile="${focusedTile}"]:not(.away)`);
      (same ?? tray.querySelector<HTMLElement>('.tile:not(.away)'))?.focus();
    }
  }

  render();

  return () => {
    destroyed = true;
    cancelRepeat();
    skipCelebration?.();
    ctx.speaker.cancel();
    removeDragGhosts();
    root.remove();
  };
}
