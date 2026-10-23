import type { AssignmentPlugin } from '../types';
import { deserializeWords, parseWords, type ScrambledWordsData } from './parse';
import { isValidProgress } from './game-state';
import { mountScrambledWords } from './view';

export const scrambledWords: AssignmentPlugin<ScrambledWordsData> = {
  id: 'scrambled-words',
  dataVersion: 1,
  title: 'מילים מבולגנות',
  cardTiles: ['ס', 'כַּ', 'עַ'],
  editor: {
    label: 'מילים מבולגנות',
    hint: 'מדביקים 10 מילים, מילה אחת בכל שורה, עם ניקוד. עד 10 אותיות במילה.',
    placeholder: 'כַּעַס\nעָצוּב\n…',
  },
  parse: parseWords,
  toText: (data) => data.words.join('\n'),
  deserialize: deserializeWords,
  speakItems: (data) => data.words,
  summary(data, progress) {
    const total = data.words.length;
    const done = isValidProgress(progress, data.words) ? Math.min(progress.index, total) : 0;
    return { line: `${total} מילים · ${done} הושלמו`, fraction: total ? done / total : 0 };
  },
  mount: mountScrambledWords,
};
