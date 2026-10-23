import { describe, it, expect } from 'vitest';
import { readImport } from '../../src/platform/import';
import { encodeShareCode } from '../../src/platform/share-codec';
import { getPlugin } from '../../src/plugins/registry';

const words = (list: string[]) => ({ v: 1, d: { words: list } });
const code = (assignments: Record<string, { v: number; d: unknown }>) => encodeShareCode({ assignments });

describe('readImport', () => {
  it('returns the valid activities from a link', () => {
    const result = readImport(code({ 'scrambled-words': words(['כַּעַס', 'עָצוּב']) }));
    expect('entries' in result && result.entries.map((e) => e.plugin.id)).toEqual(['scrambled-words']);
    expect('entries' in result && result.skipped).toBe(0);
  });

  it('skips an activity this version does not know, and counts it', () => {
    const result = readImport(
      code({ 'scrambled-words': words(['כַּעַס']), 'complete-sentences': { v: 1, d: { sentences: [] } } }),
    );
    expect('entries' in result && result.entries).toHaveLength(1);
    expect('entries' in result && result.skipped).toBe(1);
  });

  it('skips activity data that fails validation (21 words, a space, a newer data version)', () => {
    const twentyOne = Array.from({ length: 21 }, () => 'כַּעַס');
    for (const bad of [words(twentyOne), words(['בַּיִת יָפֶה']), { v: 99, d: { words: ['כַּעַס'] } }]) {
      expect(readImport(code({ 'scrambled-words': bad }))).toEqual({
        error: 'לא נמצאו בקישור משימות שאפשר לפתוח',
      });
    }
  });

  it('explains empty, broken and newer-format links', () => {
    expect(readImport('')).toEqual({ error: 'לא הודבק קישור' });
    expect(readImport('https://x.app/#import=1.@@@')).toEqual({ error: 'הקישור לא תקין או שנחתך. נסו להעתיק אותו שוב.' });
    const newer = code({ 'scrambled-words': words(['כַּעַס']) }).replace(/^1\./, '2.');
    expect(readImport(newer)).toEqual({ error: 'הקישור נוצר בגרסה חדשה יותר של האתר. רעננו את האתר ונסו שוב.' });
  });

  it('uses the plugin lookup it is given', () => {
    const onlyKnown = (id: string) => (id === 'other' ? getPlugin('scrambled-words') : undefined);
    const result = readImport(code({ other: words(['כַּעַס']) }), onlyKnown);
    expect('entries' in result && result.entries).toHaveLength(1);
  });
});
