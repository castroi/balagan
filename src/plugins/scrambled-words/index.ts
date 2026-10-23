import type { AssignmentPlugin } from '../types';
import { deserializeWords, MAX_TILES, MAX_WORDS, parseWords, type ScrambledWordsData } from './parse';
import { isValidProgress } from './game-state';
import { mountScrambledWords, wordCountLabel } from './view';

export const scrambledWords: AssignmentPlugin<ScrambledWordsData> = {
  id: 'scrambled-words',
  dataVersion: 1,
  title: 'מילים מבולגנות',
  cardTiles: ['ס', 'כַּ', 'עַ'],
  editor: {
    label: 'מילים מבולגנות',
    hint: `מדביקים עד ${MAX_WORDS} מילים, מילה אחת בכל שורה, עם ניקוד. עד ${MAX_TILES} אותיות במילה.`,
    placeholder: 'כַּעַס\nעָצוּב\n…',
  },
  parse: parseWords,
  toText: (data) => data.words.join('\n'),
  deserialize: deserializeWords,
  speakItems: (data) => data.words,
  summary(data, progress) {
    const total = data.words.length;
    const done = isValidProgress(progress, data.words) ? Math.min(progress.index, total) : 0;
    return { line: `${wordCountLabel(total)} · ${done} הושלמו`, fraction: total ? done / total : 0 };
  },
  mount: mountScrambledWords,
};
