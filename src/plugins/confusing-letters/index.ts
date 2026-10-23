import type { AssignmentPlugin } from '../types';
import { isValidProgress } from '../shared/letter-game/progress';
import { mountLetterGame } from '../shared/letter-game/view';
import { doneLabel, wordCountLabel } from '../shared/letter-game/text';
import {
  deserializeConfusing,
  itemLine,
  MAX_LINE_TILES,
  MAX_TILES,
  MAX_WORDS,
  parseConfusing,
  toText,
  type ConfusingLettersData,
} from './parse';
import { previewConfusing } from './preview';

/** Saved progress is keyed by each full line, so changing a word's letters starts a new round. */
const keys = (data: ConfusingLettersData) => data.items.map(itemLine);

export const confusingLetters: AssignmentPlugin<ConfusingLettersData> = {
  id: 'confusing-letters',
  dataVersion: 1,
  title: 'אותיות מבלבלות',
  cardTiles: ['ס', '/', 'צ'],
  editor: {
    label: 'אותיות מבלבלות',
    hint:
      `בכל שורה: מילה עם ניקוד, ואחריה האותיות המבלבלות, מופרדות ברווח או בפסיק. ` +
      `עד ${MAX_WORDS} מילים, עד ${MAX_TILES} אותיות במילה, ועד ${MAX_LINE_TILES} אותיות בשורה (המילה + המבלבלות).`,
    placeholder: 'כַּעַס ק צ ה א\nסַבָּא צ ע\n…',
  },
  parse: parseConfusing,
  toText,
  deserialize: deserializeConfusing,
  speakItems: (data) => data.items.map((it) => it.word),
  summary(data, progress) {
    const total = data.items.length;
    const done = isValidProgress(progress, keys(data)) ? Math.min(progress.index, total) : 0;
    return { line: `${wordCountLabel(total)} · ${doneLabel(done)}`, fraction: total ? done / total : 0 };
  },
  preview: previewConfusing,
  mount: (container, data, ctx) =>
    mountLetterGame(container, data.items, keys(data), ctx, { dimWrong: true, showConfusions: true, compact: true }),
};
