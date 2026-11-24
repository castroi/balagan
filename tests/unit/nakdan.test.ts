import { describe, it, expect } from 'vitest';
import {
  fetchNakdan,
  nakdanRequestBody,
  nakdanText,
  NAKDAN_MAX_OPTIONS,
  NAKDAN_URL,
  parseNakdanInput,
  readNakdan,
  wordOptions,
} from '../../src/platform/nakdan';

/** Dicta's real answer for "עד עכשיו" (Nov 2026), trimmed to the fields the app reads. */
const REAL_ANSWER = {
  data: [
    {
      nakdan: {
        word: 'עד',
        options: [
          { w: 'עַד', levelChoice: 1 },
          { w: 'עַד', levelChoice: 3 },
          { w: 'עַד', levelChoice: 3 },
          { w: 'עַד', levelChoice: 3, fTanakh: true },
          { w: 'עֵד', levelChoice: 2 },
          { w: 'עֵד', levelChoice: 2 },
          { w: 'עֵד', levelChoice: 3, fTanakh: true },
          { w: 'עד', levelChoice: 2 },
          { w: 'עָד', levelChoice: 2, fPoetry: true },
          { w: 'עֶד', levelChoice: 3, fTanakh: true },
          { w: 'עֹד', levelChoice: 3, fTanakh: true },
        ],
      },
      str: 'עד',
      sep: false,
    },
    { nakdan: { word: ' ', options: [] }, str: ' ', sep: true },
    {
      nakdan: { word: 'עכשיו', options: [{ w: 'עַכְשָׁיֽו', levelChoice: 1 }] },
      str: 'עכשיו',
      sep: false,
    },
  ],
};

/** Expected texts in canonical (NFC) mark order, as the app stores them. */
const nfc = <T>(value: T): T => JSON.parse(JSON.stringify(value).normalize('NFC')) as T;

const token = (word: string, options: unknown[]) => ({ str: word, sep: false, nakdan: { word, options } });

describe('parseNakdanInput', () => {
  it('takes one word per line, skipping empty lines and spaces around words', () => {
    expect(parseNakdanInput(' עד \n\nעכשיו\n')).toEqual({ words: ['עד', 'עכשיו'], errors: [] });
  });

  it('removes niqqud typed anyway, so Dicta offers all its options', () => {
    expect(parseNakdanInput('עַכְשָׁיו')).toEqual({ words: ['עכשיו'], errors: [] });
  });

  it('keeps a geresh (also from an apostrophe)', () => {
    expect(parseNakdanInput("ג'ירפה").words).toEqual(['ג׳ירפה']);
  });

  it('rejects two words on a line and non-Hebrew characters, naming the line', () => {
    const result = parseNakdanInput('עד עכשיו\nabc\nשעה');
    expect(result.words).toBeNull();
    expect(result.errors).toEqual(['שורה 1: מילה אחת בכל שורה', 'שורה 2: התו "a" אינו אות עברית']);
  });

  it('rejects more than 20 words', () => {
    const result = parseNakdanInput(Array(21).fill('שעה').join('\n'));
    expect(result.words).toBeNull();
    expect(result.errors).toEqual(['אפשר עד 20 מילים (יש 21)']);
  });
});

describe('wordOptions', () => {
  it('real answer: Dicta’s pick first, each spelling once, no Tanakh/poetry forms, no bare word', () => {
    expect(wordOptions('עד', REAL_ANSWER.data[0])).toEqual(nfc(['עַד', 'עֵד']));
  });

  it('removes the meteg and "|" prefix markers', () => {
    expect(wordOptions('עכשיו', REAL_ANSWER.data[2])).toEqual(nfc(['עַכְשָׁיו']));
    expect(wordOptions('ובבית', token('ובבית', [{ w: 'וּ|בַּ|בַּיִת', levelChoice: 1 }]))).toEqual(nfc(['וּבַּבַּיִת']));
  });

  it('keeps at most 4 options, ordered by level then by Dicta’s order', () => {
    const options = ['שָׁעָה', 'שֵׁעָה', 'שִׁעָה', 'שֻׁעָה', 'שֹׁעָה'].map((w, i) => ({ w, levelChoice: i === 0 ? 2 : 1 }));
    expect(wordOptions('שעה', token('שעה', options))).toEqual(nfc(['שֵׁעָה', 'שִׁעָה', 'שֻׁעָה', 'שֹׁעָה']));
    expect(NAKDAN_MAX_OPTIONS).toBe(4);
  });

  it('never offers a spelling with other letters than typed, even when nothing else is left', () => {
    const both = token('עדיין', [
      { w: 'עֲדַיִן', levelChoice: 1 },
      { w: 'עֲדַיִין', levelChoice: 2 },
    ]);
    expect(wordOptions('עדיין', both)).toEqual(nfc(['עֲדַיִין']));
    expect(wordOptions('עדיין', token('עדיין', [{ w: 'עֲדַיִן', levelChoice: 1 }]))).toEqual([]);
    // A broken or hostile answer: other letters, Latin text or markup with one mark.
    const hostile = token('עדיין', [{ w: 'אָדַיִין', levelChoice: 1 }, { w: '<img src=x>ַ', levelChoice: 1 }]);
    expect(wordOptions('עדיין', hostile)).toEqual([]);
  });

  it('keeps Tanakh-only forms when they are all there is', () => {
    expect(wordOptions('עד', token('עד', [{ w: 'עֹד', levelChoice: 3, fTanakh: true }]))).toEqual(nfc(['עֹד']));
  });

  it('does not count the maqaf as niqqud', () => {
    expect(wordOptions('עד', token('עד', [{ w: 'עד־', levelChoice: 1 }]))).toEqual([]);
  });

  it('gives no options for an unknown word or a broken answer', () => {
    expect(wordOptions('בלגנון', token('בלגנון', []))).toEqual([]);
    expect(wordOptions('בלגנון', { str: 'בלגנון' })).toEqual([]);
    expect(wordOptions('עד', token('עד', [null, { w: 5 }, { w: 'עד' }]))).toEqual([]);
  });
});

describe('readNakdan', () => {
  it('matches the real answer to the typed words', () => {
    expect(readNakdan(['עד', 'עכשיו'], REAL_ANSWER)).toEqual(nfc([
      { word: 'עד', options: ['עַד', 'עֵד'] },
      { word: 'עכשיו', options: ['עַכְשָׁיו'] },
    ]));
  });

  it('ignores how line breaks come back', () => {
    const answer = {
      data: [
        token('עד', [{ w: 'עַד', levelChoice: 1 }]),
        { str: '\n', sep: true, nakdan: { word: '\n', options: [] } },
        { str: '\n' },
        token('שעה', [{ w: 'שָׁעָה', levelChoice: 1 }]),
      ],
    };
    expect(readNakdan(['עד', 'שעה'], answer).map((r) => r.options)).toEqual(nfc([['עַד'], ['שָׁעָה']]));
  });

  it('joins a word Dicta split in parts into one option', () => {
    const answer = { data: [token('ג׳', []), token('ירפה', [{ w: 'ירָפָה', levelChoice: 1 }])] };
    expect(readNakdan(['ג׳ירפה'], answer)).toEqual(nfc([{ word: 'ג׳ירפה', options: ['ג׳ירָפָה'] }]));
  });

  it('throws when the answer has no data or does not match the words', () => {
    expect(() => readNakdan(['עד'], null)).toThrow();
    expect(() => readNakdan(['עד'], { data: 'x' })).toThrow();
    expect(() => readNakdan(['עד', 'שעה'], REAL_ANSWER)).toThrow();
  });
});

describe('nakdanText', () => {
  it('uses the chosen option, else the first, else the word as typed', () => {
    const results = nfc([
      { word: 'עד', options: ['עַד', 'עֵד'] },
      { word: 'עכשיו', options: ['עַכְשָׁיו'] },
      { word: 'בלגנון', options: [] as string[] },
    ]);
    expect(nakdanText(results, [1, 0, 0])).toBe(nfc('עֵד\nעַכְשָׁיו\nבלגנון'));
    expect(nakdanText(results, [])).toBe(nfc('עַד\nעַכְשָׁיו\nבלגנון'));
  });
});

describe('fetchNakdan', () => {
  it('posts the words as text/plain, one per line', async () => {
    const calls: [string, RequestInit][] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(REAL_ANSWER));
    }) as unknown as typeof fetch;
    const results = await fetchNakdan(['עד', 'עכשיו'], fetcher);
    expect(results[0].options).toEqual(nfc(['עַד', 'עֵד']));
    expect(calls[0][0]).toBe(NAKDAN_URL);
    expect(calls[0][1].headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });
    expect(calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(JSON.parse(calls[0][1].body as string)).toMatchObject({ task: 'nakdan', genre: 'modern', data: 'עד\nעכשיו' });
    expect(calls[0][1].body).toBe(nakdanRequestBody(['עד', 'עכשיו']));
  });

  it('throws on an HTTP error', async () => {
    const fetcher = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchNakdan(['עד'], fetcher)).rejects.toThrow('HTTP 503');
  });

  it('gives up after the timeout', async () => {
    const fetcher = ((_: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as unknown as typeof fetch;
    await expect(fetchNakdan(['עד'], fetcher, 10)).rejects.toThrow('aborted');
  });
});
