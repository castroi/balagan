import type { AssignmentPlugin } from '../types';
import { isValidProgress } from '../shared/letter-game/progress';
import { doneLabel, wordCountLabel } from '../shared/letter-game/text';
import {
  deserializeChooseWord,
  itemLine,
  MAX_LETTERS,
  MAX_WORDS,
  MAX_WRONG,
  parseChooseWord,
  toText,
  type ChooseWordData,
} from './parse';
import { previewChooseWord } from './preview';
import { mountChooseGame } from './view';

/** Saved progress is keyed by each full line, so changing a word's options starts a new round. */
const keys = (data: ChooseWordData) => data.items.map(itemLine);

export const chooseWord: AssignmentPlugin<ChooseWordData> = {
  id: 'choose-word',
  dataVersion: 1,
  title: 'בחרו את המילה',
  cardTiles: ['כַּעַס', '/', 'קַעַס'],
  editor: {
    label: 'בחרו את המילה',
    hint:
      `בכל שורה: המילה הנכונה ראשונה (מימין), ואחריה 1–${MAX_WRONG} מילים שגויות, מופרדות ברווח או בפסיק. ` +
      `עד ${MAX_WORDS} שורות, עד ${MAX_LETTERS} אותיות במילה.`,
    placeholder: 'כַּעַס קַעַס כַּאַס קַאַס\nצַעַר סַעַר צַאַר\n…',
  },
  parse: parseChooseWord,
  toText,
  deserialize: deserializeChooseWord,
  speakItems: (data) => data.items.map((it) => it.word),
  summary(data, progress) {
    const total = data.items.length;
    const done = isValidProgress(progress, keys(data)) ? Math.min(progress.index, total) : 0;
    return { line: `${wordCountLabel(total)} · ${doneLabel(done)}`, fraction: total ? done / total : 0 };
  },
  preview: previewChooseWord,
  mount: (container, data, ctx) => mountChooseGame(container, data.items, keys(data), ctx),
};
