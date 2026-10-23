import {
  browserStore,
  isSavedByNewerVersion,
  loadData,
  NEWER_VERSION_MESSAGE,
  saveData,
  type AppData,
  type KeyValueStore,
  type SaveResult,
} from './platform/storage';
import { createSpeaker, type Speaker } from './platform/tts';
import { loadSettings, saveSettings, type Settings } from './platform/settings';
import { createSounds, type Sounds } from './platform/sounds';
import { type SharePayload } from './platform/share-codec';
import { readImport, type ImportResult } from './platform/import';
import { PLUGINS } from './plugins/registry';
import type { AnyPlugin } from './plugins/types';
import { renderHome } from './ui/home';
import { renderEdit } from './ui/edit';
import { clearToast, toast } from './ui/dialog';

export class App {
  readonly store: KeyValueStore | null = browserStore();
  data: AppData = loadData(this.store);
  settings: Settings = loadSettings(this.store);
  readonly speaker: Speaker = createSpeaker();
  readonly sounds: Sounds = createSounds();
  /**
   * True when the saved data comes from a newer app version: nothing may be
   * changed then (not even in memory), so the app never shows or plays
   * something that isn't saved.
   */
  readonly readOnly: boolean = isSavedByNewerVersion(this.store);
  private cleanup: (() => void) | null = null;
  private unsavedCheck: (() => boolean) | null = null;

  constructor(readonly root: HTMLElement) {}

  save(): SaveResult {
    const result = saveData(this.store, this.data);
    if (result === 'failed') toast('לא ניתן לשמור במכשיר הזה (אולי גלישה בסתר?)');
    if (result === 'newer-version') toast(NEWER_VERSION_MESSAGE, undefined, 7000);
    return result;
  }

  /** Saves device settings; refused when the app is read-only, like every other change. */
  setSettings(settings: Settings): boolean {
    if (this.refuseIfReadOnly()) return false;
    if (!saveSettings(this.store, settings)) {
      toast('לא ניתן לשמור במכשיר הזה (אולי גלישה בסתר?)');
      return false;
    }
    this.settings = settings;
    return true;
  }

  getAssignment(plugin: AnyPlugin): unknown | null {
    const stored = this.data.assignments[plugin.id];
    return stored ? plugin.deserialize(stored.data, stored.v) : null;
  }

  setAssignment(plugin: AnyPlugin, data: unknown | null): SaveResult {
    if (this.refuseIfReadOnly()) return 'newer-version';
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

  /** Checks a pasted link/code (see `readImport`). */
  readImport(input: string): ImportResult {
    return readImport(input);
  }

  /** Saves imported activities; 'saved' only when all of them were saved. */
  applyImport(entries: { plugin: AnyPlugin; data: unknown }[]): SaveResult {
    if (this.refuseIfReadOnly()) return 'newer-version';
    for (const { plugin, data } of entries) {
      const result = this.setAssignment(plugin, data);
      if (result !== 'saved') return result;
    }
    return 'saved';
  }

  /** Shows the "newer version" message and returns true when changes aren't allowed. */
  refuseIfReadOnly(): boolean {
    if (this.readOnly) toast(NEWER_VERSION_MESSAGE, undefined, 7000);
    return this.readOnly;
  }

  /** The current screen tells the app whether it has unsaved edits (e.g. typed words). */
  setUnsavedCheck(check: (() => boolean) | null): void {
    this.unsavedCheck = check;
  }

  hasUnsavedChanges(): boolean {
    return this.unsavedCheck?.() ?? false;
  }

  /** Shows a screen. Messages (toasts) belong to the screen they were shown on. */
  private mount(fn: (container: HTMLElement) => (() => void) | void): void {
    clearToast();
    this.cleanup?.();
    this.cleanup = null;
    this.unsavedCheck = null;
    this.root.replaceChildren();
    window.scrollTo(0, 0);
    this.cleanup = fn(this.root) ?? null;
    // The element that had focus is gone; move focus to the new screen's title
    // so keyboard and screen-reader users aren't left on an empty page.
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) {
      // The screen's title, or (game screens have none) its first button.
      const target = this.root.querySelector<HTMLElement>('h1') ?? this.root.querySelector<HTMLElement>('button');
      if (target) {
        if (target.tagName === 'H1') target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
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
        wrongLetterMs: this.settings.wrongLetterSeconds * 1000,
        loadProgress: () => this.data.progress[plugin.id],
        commit: (progress, pointsToAdd = 0) => {
          if (this.readOnly) return;
          this.data.progress[plugin.id] = progress;
          this.data.points += pointsToAdd;
          this.save();
        },
        exit: () => this.showHome(),
      }),
    );
  }
}
