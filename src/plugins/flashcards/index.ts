import type { AssignmentPlugin } from '../types';
import { doneLabel, wordCountLabel } from '../shared/letter-game/text';
import {
  cardLang,
  cardLine,
  deserializeFlashcards,
  MAX_CARDS,
  parseFlashcards,
  SEPARATOR,
  toText,
  type FlashcardsData,
} from './parse';
import { isValidCardsProgress } from './round';
import { previewFlashcards } from './preview';
import { mountFlashcards } from './view';

/** Saved progress is keyed by each full line, so changing a card starts a new round. */
const keys = (data: FlashcardsData) => data.cards.map(cardLine);

export const flashcards: AssignmentPlugin<FlashcardsData> = {
  id: 'flashcards',
  dataVersion: 1,
  title: 'איך אומרים?',
  // Not a word in a foreign language: the same list may be Arabic one week and English the next.
  cardTiles: ['אבא', '/', '?'],
  editor: {
    label: 'איך אומרים?',
    hint:
      `בכל שורה: מילה בעברית ${SEPARATOR} המילה בערבית או באנגלית, באותיות של השפה (ממנה הקול) ` +
      `${SEPARATOR} איך קוראים אותה באותיות עבריות (לא חובה). ` +
      `בלי החלק השלישי, הילד יראה את המילה עצמה. הערה בסוגריים אחרי המילה בעברית מוצגת קטן. עד ${MAX_CARDS} שורות.`,
    placeholder: 'דוד | خَال | חַ׳אל\nבן (צאצא) | ابْن | אִבְּן\nילד | child\n…',
  },
  parse: parseFlashcards,
  toText,
  deserialize: deserializeFlashcards,
  // The voice test plays the foreign words, each in its own language.
  speakItems: (data) => data.cards.map((card) => ({ text: card[1], lang: cardLang(card) })),
  summary(data, progress) {
    const total = data.cards.length;
    const done = isValidCardsProgress(progress, keys(data)) ? Math.min(progress.index, total) : 0;
    return { line: `${wordCountLabel(total)} · ${doneLabel(done)}`, fraction: total ? done / total : 0 };
  },
  preview: previewFlashcards,
  mount: (container, data, ctx) => mountFlashcards(container, data.cards, keys(data), ctx),
};
