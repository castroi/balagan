/**
 * Settings of this device, kept under their own localStorage key so older app
 * versions (which rewrite the main saved data) never drop them. Not part of
 * the share link: they belong to the device, not to the week's content.
 */
import type { KeyValueStore } from './storage';

export const SETTINGS_KEY = 'hebrew-practice:settings';

/** How long a wrong letter stays in the slot before going back to the tray. */
export const WRONG_LETTER_SECONDS = [0.5, 1, 1.5, 2, 3] as const;
export const DEFAULT_WRONG_LETTER_SECONDS = 1.5;

export interface Settings {
  wrongLetterSeconds: number;
}

export const defaultSettings = (): Settings => ({ wrongLetterSeconds: DEFAULT_WRONG_LETTER_SECONDS });

const isOption = (v: unknown): v is number => WRONG_LETTER_SECONDS.some((s) => s === v);

/** Saved settings; anything missing or invalid falls back to its default. */
export function loadSettings(store: KeyValueStore | null): Settings {
  const settings = defaultSettings();
  if (!store) return settings;
  try {
    const raw: unknown = JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null) {
      const seconds = (raw as Partial<Settings>).wrongLetterSeconds;
      if (isOption(seconds)) settings.wrongLetterSeconds = seconds;
    }
  } catch {
    /* unreadable: defaults */
  }
  return settings;
}

/** False when the device refused to save (private mode, storage full). */
export function saveSettings(store: KeyValueStore | null, settings: Settings): boolean {
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
