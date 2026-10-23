/**
 * Settings of this device, kept under their own localStorage key so older app
 * versions (which rewrite the main saved data) never drop them. Not part of
 * the share link: they belong to the device, not to the week's content.
 */
import type { KeyValueStore } from './storage';

export const SETTINGS_KEY = 'hebrew-practice:settings';

/**
 * How long the popup after a word stays when it shows the letter pair (the
 * right letter next to the confusing one). Only Confusing Letters shows it.
 */
export const PAIR_SECONDS = [1.5, 3, 5, 8] as const;
export const DEFAULT_PAIR_SECONDS = 3;

export interface Settings {
  pairSeconds: number;
}

/** Fields of older versions that are no longer used; removed on the next save. */
const RETIRED = ['wrongLetterSeconds'];

export const defaultSettings = (): Settings => ({ pairSeconds: DEFAULT_PAIR_SECONDS });

const isOption = (v: unknown): v is number => PAIR_SECONDS.some((s) => s === v);

const readRaw = (store: KeyValueStore): Record<string, unknown> => {
  try {
    const raw: unknown = JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null');
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** Saved settings; anything missing or invalid falls back to its default. */
export function loadSettings(store: KeyValueStore | null): Settings {
  const settings = defaultSettings();
  if (!store) return settings;
  const seconds = readRaw(store).pairSeconds;
  if (isOption(seconds)) settings.pairSeconds = seconds;
  return settings;
}

/**
 * Saves the settings, keeping any fields this version doesn't know (written
 * by a newer version). False when the device refused (private mode, storage full).
 */
export function saveSettings(store: KeyValueStore | null, settings: Settings): boolean {
  if (!store) return false;
  try {
    const keep = readRaw(store);
    for (const key of RETIRED) delete keep[key];
    store.setItem(SETTINGS_KEY, JSON.stringify({ ...keep, ...settings }));
    return true;
  } catch {
    return false;
  }
}
