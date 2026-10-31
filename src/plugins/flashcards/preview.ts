import { h } from '../../ui/dom';
import { LANGUAGES } from '../../core/scripts';
import { cardLang, frontParts, type FlashcardsData } from './parse';

/** "מה הילד יראה": each card's front (Hebrew), what its back shows, and the language its voice speaks. */
export function previewFlashcards(data: FlashcardsData): HTMLElement {
  return h(
    'div',
    { class: 'preview' },
    h('span', { class: 'preview-title' }, 'מה הילד יראה:'),
    ...data.cards.map((card) => {
      const [he, word, read] = card;
      const lang = cardLang(card);
      const { main, hint } = frontParts(he);
      const back =
        read === undefined
          ? h('span', { class: 'mini-word back', lang, dir: LANGUAGES[lang].dir }, word)
          : h('span', { class: 'mini-word back', lang: 'he' }, read);
      return h(
        'div',
        { class: 'preview-row' },
        h(
          'span',
          { class: 'preview-tiles' },
          h('span', { class: 'mini-word', title: 'צד ראשון' }, main),
          hint ? h('span', { class: 'preview-hint' }, hint) : null,
          h('span', { class: 'preview-arrow', 'aria-hidden': 'true' }, '←'),
          back,
          lang === 'en' && read !== undefined ? h('span', { class: 'preview-hint', lang: 'en', dir: 'ltr' }, word) : null,
        ),
        h('span', { class: 'preview-count' }, `קול ב${LANGUAGES[lang].name}`),
      );
    }),
  );
}
