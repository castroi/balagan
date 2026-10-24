/**
 * The screen before a round, shared by every game: a big Start button, and —
 * when a round is in progress — "ממשיכים" plus a smaller "מתחילים מהתחלה".
 * Restarting lives only here, never on the game screen (see CLAUDE.md).
 */
import { h, icon } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import { wordCountLabel } from './letter-game/text';

export interface StartScreenOptions {
  /** Index of the next item in the saved round; above 0 means a round is in progress. */
  index: number;
  total: number;
  onStart: () => void;
  onRestart: () => void;
}

/** True when the saved round can be continued — and so also restarted. */
export const isResuming = (index: number): boolean => index > 0;

export function startScreen({ index, total, onStart, onRestart }: StartScreenOptions): HTMLElement {
  const resuming = isResuming(index);
  return h(
    'div',
    { class: 'stage center' },
    h(
      'button',
      { class: 'start-btn', type: 'button', onclick: onStart },
      icon(ICONS.play, 'icon start-icon'),
      h('span', {}, resuming ? 'ממשיכים' : 'התחלה'),
    ),
    h('p', { class: 'muted big' }, resuming ? `מילה ${index + 1} מתוך ${total}` : wordCountLabel(total)),
    resuming
      ? h(
          'button',
          { class: 'btn restart-btn', type: 'button', onclick: onRestart },
          icon(ICONS.again),
          h('span', {}, 'מתחילים מהתחלה'),
        )
      : null,
  );
}
