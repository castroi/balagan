import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WRONG_LETTER_SECONDS,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  WRONG_LETTER_SECONDS,
} from '../../src/platform/settings';
import { loadData, migrate, saveData, STORAGE_KEY, type KeyValueStore } from '../../src/platform/storage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { map: Record<string, string> } => {
  const map = { ...initial };
  return { map, getItem: (k) => map[k] ?? null, setItem: (k, v) => void (map[k] = v) };
};

describe('device settings', () => {
  it('defaults to 1.5 seconds when nothing is saved, or without storage', () => {
    expect(DEFAULT_WRONG_LETTER_SECONDS).toBe(1.5);
    expect(loadSettings(memoryStore())).toEqual({ wrongLetterSeconds: 1.5 });
    expect(loadSettings(null)).toEqual({ wrongLetterSeconds: 1.5 });
  });

  it('offers 0.5 to 3 seconds', () => {
    expect([...WRONG_LETTER_SECONDS]).toEqual([0.5, 1, 1.5, 2, 3]);
  });

  it('saves and loads every offered value', () => {
    for (const seconds of WRONG_LETTER_SECONDS) {
      const store = memoryStore();
      expect(saveSettings(store, { wrongLetterSeconds: seconds })).toBe(true);
      expect(loadSettings(store)).toEqual({ wrongLetterSeconds: seconds });
    }
  });

  it('falls back to the default for invalid or unreadable values', () => {
    for (const bad of ['{"wrongLetterSeconds":7}', '{"wrongLetterSeconds":"2"}', '{}', 'null', '[]', '{not json']) {
      expect(loadSettings(memoryStore({ [SETTINGS_KEY]: bad }))).toEqual({ wrongLetterSeconds: 1.5 });
    }
  });

  it('reports a device that refuses to save', () => {
    const refusing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(saveSettings(refusing, { wrongLetterSeconds: 2 })).toBe(false);
    expect(saveSettings(null, { wrongLetterSeconds: 2 })).toBe(false);
  });

  it('lives under its own key, so saving the main data (also by an older version) never drops it', () => {
    const store = memoryStore();
    saveSettings(store, { wrongLetterSeconds: 3 });
    // An older app version rewrites the main data from its own shape.
    saveData(store, migrate({ schema: 1, assignments: {}, progress: {}, points: 5 }));
    expect(loadSettings(store)).toEqual({ wrongLetterSeconds: 3 });
    expect(Object.keys(store.map).sort()).toEqual([STORAGE_KEY, SETTINGS_KEY].sort());
    expect(loadData(store).points).toBe(5);
  });
});

describe('settings saved by a newer version', () => {
  it('keeps fields this version does not know when saving', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ wrongLetterSeconds: 2, voiceRate: 0.8 }) });
    saveSettings(store, { wrongLetterSeconds: 3 });
    expect(JSON.parse(store.map[SETTINGS_KEY])).toEqual({ wrongLetterSeconds: 3, voiceRate: 0.8 });
  });

  it('replaces unreadable saved settings', () => {
    const store = memoryStore({ [SETTINGS_KEY]: '{broken' });
    expect(saveSettings(store, { wrongLetterSeconds: 1 })).toBe(true);
    expect(JSON.parse(store.map[SETTINGS_KEY])).toEqual({ wrongLetterSeconds: 1 });
  });
});
