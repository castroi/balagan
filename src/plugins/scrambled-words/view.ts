import { h, icon, delay, prefersReducedMotion } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { announce } from '../../ui/dialog';
import { defaultRng } from '../../core/rng';
import { pointsForMistakes } from '../../core/scoring';
import type { GameContext } from '../types';
import type { ScrambledWordsData } from './parse';
import {
  completeWord,
  createWordRound,
  isValidProgress,
  newProgress,
  nextSlot,
  placeTile,
  type RoundProgress,
  type WordRound,
} from './game-state';

type Phase = 'intro' | 'play' | 'celebrate' | 'end';

interface Highlight {
  wrongSlot?: number;
  wrongText?: string;
  wrongTileId?: number;
  popSlot?: number;
  returningTileId?: number;
}

const DRAG_THRESHOLD = 10;

export function mountScrambledWords(container: HTMLElement, data: ScrambledWordsData, ctx: GameContext): () => void {
  const words = data.words;
  let destroyed = false;
  let busy = false;
  let message = '';
  let lastPoints = 0;
  let skipCelebration: (() => void) | null = null;
  let suppressClick: { btn: HTMLElement; until: number } | null = null;

  const saved = ctx.loadProgress();
  let progress: RoundProgress =
    isValidProgress(saved, words) && !saved.done ? saved : newProgress(words, defaultRng);
  if (progress !== saved) ctx.commit(progress);

  let round: WordRound = createWordRound(words[progress.order[progress.index]], defaultRng);
  let phase: Phase = 'intro';
  const resuming = progress.index > 0;

  const root = h('div', { class: 'screen game' });
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
    const { round: next, result } = placeTile(round, tileId);
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

    const skipped = new Promise<void>((resolve) => (skipCelebration = resolve));
    const finished = Promise.all([delay(1600), delay(500).then(() => ctx.speaker.speak(round.word))]);
    await Promise.race([skipped, finished]);
    skipCelebration = null;
    if (destroyed) return;

    if (progress.done) {
      phase = 'end';
    } else {
      round = createWordRound(words[progress.order[progress.index]], defaultRng);
      phase = 'play';
      speakCurrent();
    }
    busy = false;
    render();
  }

  function playAgain() {
    ctx.sounds.unlock();
    progress = newProgress(words, defaultRng);
    ctx.commit(progress);
    round = createWordRound(words[progress.order[progress.index]], defaultRng);
    phase = 'play';
    message = '';
    render();
    speakCurrent();
  }

  // ---------- drag & tap ----------

  function wireTile(btn: HTMLButtonElement, tileId: number, tray: HTMLElement) {
    btn.addEventListener('click', () => {
      if (suppressClick?.btn === btn && performance.now() < suppressClick.until) return;
      void onPlace(tileId);
    });

    btn.addEventListener('pointerdown', (e) => {
      if (busy || phase !== 'play' || e.button !== 0) return;
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
    });
  }

  // ---------- rendering ----------

  function topBar() {
    const dots = h('div', {
      class: 'dots',
      role: 'img',
      'aria-label': `מילה ${Math.min(progress.index + 1, words.length)} מתוך ${words.length}`,
    });
    progress.order.forEach((_, i) => {
      const cls = i < progress.index ? 'dot done' : i === progress.index && phase !== 'end' ? 'dot current' : 'dot';
      dots.appendChild(h('span', { class: cls }));
    });
    return h(
      'header',
      { class: 'topbar' },
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'חזרה לבית', onclick: () => ctx.exit() },
        icon(ICONS.home),
      ),
      dots,
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
    const tray = h('div', { class: 'tray', style: `--count: ${round.tray.length}` });
    for (const tile of round.tray) {
      if (!tile) {
        tray.appendChild(h('span', { class: 'tile-ghost', 'aria-hidden': 'true' }));
        continue;
      }
      // During a wrong-answer shake the tile is shown in the slot, so its tray spot is empty.
      const hidden = hl.wrongTileId === tile.id;
      const btn = h(
        'button',
        {
          class: `tile${hl.returningTileId === tile.id ? ' returning' : ''}${hidden ? ' away' : ''}`,
          type: 'button',
          'aria-label': `האות ${tile.text}`,
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
        resuming ? `מילה ${progress.index + 1} מתוך ${words.length}` : `${words.length} מילים`,
      ),
    );
  }

  function endView() {
    return h(
      'div',
      { class: 'stage center end' },
      icon(ICONS.star, 'icon end-star'),
      h('h1', { class: 'title' }, 'כל הכבוד!'),
      h('p', { class: 'muted big' }, `השלמת את כל ${words.length} המילים`),
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
    announce(`כל הכבוד! ${lastPoints} נקודות`);
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
    );
  }

  function render(hl: Highlight = {}) {
    if (destroyed) return;
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
    root.appendChild(trayEl(hl));
  }

  render();

  return () => {
    destroyed = true;
    skipCelebration?.();
    ctx.speaker.cancel();
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
    root.remove();
  };
}
