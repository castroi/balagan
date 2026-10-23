import { h } from '../../ui/dom';
import { splitTiles } from '../../core/unicode';
import { MAX_LINE_TILES, type ConfusingLettersData } from './parse';

/** "מה הילד יראה": each word's letters, then its confusing letters (dashed), and the count. */
export function previewConfusing(data: ConfusingLettersData): HTMLElement {
  return h(
    'div',
    { class: 'preview' },
    h('span', { class: 'preview-title' }, 'מה הילד יראה:'),
    ...data.items.map((item) => {
      const split = splitTiles(item.word);
      const tiles = split.ok ? split.tiles : [];
      return h(
        'div',
        { class: 'preview-row' },
        h(
          'span',
          { class: 'preview-tiles' },
          ...tiles.map((t) => h('span', { class: 'mini-tile' }, t)),
          ...item.extras.map((t) => h('span', { class: 'mini-tile extra', title: 'אות מבלבלת' }, t)),
        ),
        h('span', { class: 'preview-count', dir: 'ltr' }, `${tiles.length + item.extras.length}/${MAX_LINE_TILES}`),
      );
    }),
  );
}
