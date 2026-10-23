import { h, icon } from '../../ui/dom';
import { ICONS } from '../../ui/icons';
import type { ChooseWordData } from './parse';

/** "מה הילד יראה": each line's correct word (green, ✓), then its wrong words (dashed), and the count. */
export function previewChooseWord(data: ChooseWordData): HTMLElement {
  return h(
    'div',
    { class: 'preview' },
    h('span', { class: 'preview-title' }, 'מה הילד יראה:'),
    ...data.items.map((item) =>
      h(
        'div',
        { class: 'preview-row' },
        h(
          'span',
          { class: 'preview-tiles' },
          h('span', { class: 'mini-word right', title: 'המילה הנכונה' }, item.word, icon(ICONS.check, 'icon mini-check')),
          ...item.wrong.map((w) => h('span', { class: 'mini-word extra', title: 'מילה שגויה' }, w)),
        ),
        h('span', { class: 'preview-count' }, `${item.wrong.length + 1} מילים`),
      ),
    ),
  );
}
