import { decodeShare } from './share-codec';
import { getPlugin } from '../plugins/registry';
import type { AnyPlugin } from '../plugins/types';

export type ImportResult =
  | { error: string }
  | { entries: { plugin: AnyPlugin; data: unknown }[]; skipped: number };

const MESSAGES = {
  empty: 'לא הודבק קישור',
  invalid: 'הקישור לא תקין או שנחתך. נסו להעתיק אותו שוב.',
  newer: 'הקישור נוצר בגרסה חדשה יותר של האתר. רעננו את האתר ונסו שוב.',
} as const;

/**
 * Checks a pasted share link or code. Each activity re-validates its own data;
 * activities this version doesn't know, or invalid data, are skipped and counted.
 */
export function readImport(input: string, findPlugin: (id: string) => AnyPlugin | undefined = getPlugin): ImportResult {
  const result = decodeShare(input);
  if (!result.ok) return { error: MESSAGES[result.reason] };

  const entries: { plugin: AnyPlugin; data: unknown }[] = [];
  let skipped = 0;
  for (const [id, entry] of Object.entries(result.payload.assignments)) {
    const plugin = findPlugin(id);
    const data = plugin?.deserialize(entry.d, entry.v) ?? null;
    if (plugin && data !== null) entries.push({ plugin, data });
    else skipped++;
  }
  if (entries.length === 0) return { error: 'לא נמצאו בקישור משימות שאפשר לפתוח' };
  return { entries, skipped };
}

/**
 * Names of the activities a link will replace, e.g. "מילים מבולגנות, אותיות מבלבלות".
 * A link replaces only the activities it contains; the others stay as they are.
 */
export const importedTitles = (entries: readonly { plugin: AnyPlugin }[]): string =>
  entries.map((e) => e.plugin.title).join(', ');
