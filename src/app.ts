import {
  browserStore,
  loadData,
  saveData,
  type AppData,
  type KeyValueStore,
  type SaveResult,
} from './platform/storage';
import { createSpeaker, type Speaker } from './platform/tts';
import { createSounds, type Sounds } from './platform/sounds';
import { decodeShare, type SharePayload } from './platform/share-codec';
import { getPlugin, PLUGINS } from './plugins/registry';
import type { AnyPlugin } from './plugins/types';
import { renderHome } from './ui/home';
import { renderEdit } from './ui/edit';
import { clearToast, toast } from './ui/dialog';

export const NEWER_VERSION_MESSAGE = 'התוכן נשמר בגרסה חדשה יותר של האתר. התחברו לאינטרנט ורעננו כדי לעדכן.';

export class App {
  readonly store: KeyValueStore | null = browserStore();
  data: AppData = loadData(this.store);
  readonly speaker: Speaker = createSpeaker();
  readonly sounds: Sounds = createSounds();
  private cleanup: (() => void) | null = null;

  constructor(readonly root: HTMLElement) {}

  save(): SaveResult {
    const result = saveData(this.store, this.data);
    if (result === 'failed') toast('לא ניתן לשמור במכשיר הזה (אולי גלישה בסתר?)');
    if (result === 'newer-version') toast(NEWER_VERSION_MESSAGE, undefined, 7000);
    return result;
  }

  getAssignment(plugin: AnyPlugin): unknown | null {
    const stored = this.data.assignments[plugin.id];
    return stored ? plugin.deserialize(stored.data, stored.v) : null;
  }

  setAssignment(plugin: AnyPlugin, data: unknown | null): SaveResult {
    if (data === null) {
      delete this.data.assignments[plugin.id];
      delete this.data.progress[plugin.id];
    } else {
      this.data.assignments[plugin.id] = { v: plugin.dataVersion, data };
    }
    return this.save();
  }

  sharePayload(): SharePayload | null {
    const assignments: SharePayload['assignments'] = {};
    for (const plugin of PLUGINS) {
      const data = this.getAssignment(plugin);
      if (data !== null) assignments[plugin.id] = { v: plugin.dataVersion, d: data };
    }
    return Object.keys(assignments).length ? { assignments } : null;
  }

  /** Checks a pasted link/code. Returns an error message, or the usable entries. */
  readImport(input: string): { error: string } | { entries: { plugin: AnyPlugin; data: unknown }[]; skipped: number } {
    const result = decodeShare(input);
    if (!result.ok) {
      const messages = {
        empty: 'לא הודבק קישור',
        invalid: 'הקישור לא תקין או שנחתך. נסו להעתיק אותו שוב.',
        newer: 'הקישור נוצר בגרסה חדשה יותר של האתר. רעננו את האתר ונסו שוב.',
      } as const;
      return { error: messages[result.reason] };
    }
    const entries: { plugin: AnyPlugin; data: unknown }[] = [];
    let skipped = 0;
    for (const [id, entry] of Object.entries(result.payload.assignments)) {
      const plugin = getPlugin(id);
      const data = plugin?.deserialize(entry.d, entry.v) ?? null;
      if (plugin && data !== null) entries.push({ plugin, data });
      else skipped++;
    }
    if (entries.length === 0) return { error: 'לא נמצאו בקישור משימות שאפשר לפתוח' };
    return { entries, skipped };
  }

  applyImport(entries: { plugin: AnyPlugin; data: unknown }[]): void {
    for (const { plugin, data } of entries) this.setAssignment(plugin, data);
  }

  /** Shows a screen. Messages (toasts) belong to the screen they were shown on. */
  private mount(fn: (container: HTMLElement) => (() => void) | void): void {
    clearToast();
    this.cleanup?.();
    this.cleanup = null;
    this.root.replaceChildren();
    window.scrollTo(0, 0);
    this.cleanup = fn(this.root) ?? null;
  }

  showHome(): void {
    this.mount((c) => renderHome(c, this));
  }

  showEdit(): void {
    this.mount((c) => renderEdit(c, this));
  }

  showGame(plugin: AnyPlugin): void {
    const data = this.getAssignment(plugin);
    if (data === null) {
      this.showEdit();
      return;
    }
    this.mount((c) =>
      plugin.mount(c, data, {
        speaker: this.speaker,
        sounds: this.sounds,
        totalPoints: () => this.data.points,
        loadProgress: () => this.data.progress[plugin.id],
        commit: (progress, pointsToAdd = 0) => {
          this.data.progress[plugin.id] = progress;
          this.data.points += pointsToAdd;
          this.save();
        },
        exit: () => this.showHome(),
      }),
    );
  }
}
