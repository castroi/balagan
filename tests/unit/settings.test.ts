import { describe, it, expect } from 'vitest';
import { DEFAULT_PAIR_SECONDS, loadSettings, PAIR_SECONDS, saveSettings, SETTINGS_KEY } from '../../src/platform/settings';
import { loadData, migrate, saveData, STORAGE_KEY, type KeyValueStore } from '../../src/platform/storage';

const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { map: Record<string, string> } => {
  const map = { ...initial };
  return { map, getItem: (k) => map[k] ?? null, setItem: (k, v) => void (map[k] = v) };
};

describe('device settings: how long the popup with a letter pair stays', () => {
  it('defaults to 3 seconds when nothing is saved, or without storage', () => {
    expect(DEFAULT_PAIR_SECONDS).toBe(3);
    expect(loadSettings(memoryStore())).toEqual({ pairSeconds: 3 });
    expect(loadSettings(null)).toEqual({ pairSeconds: 3 });
  });

  it('offers 1.5, 3, 5 and 8 seconds', () => {
    expect([...PAIR_SECONDS]).toEqual([1.5, 3, 5, 8]);
  });

  it('saves and loads every offered value', () => {
    for (const seconds of PAIR_SECONDS) {
      const store = memoryStore();
      expect(saveSettings(store, { pairSeconds: seconds })).toBe(true);
      expect(loadSettings(store)).toEqual({ pairSeconds: seconds });
    }
  });

  it('falls back to the default for invalid or unreadable values', () => {
    for (const bad of ['{"pairSeconds":7}', '{"pairSeconds":"5"}', '{}', 'null', '[]', '{not json']) {
      expect(loadSettings(memoryStore({ [SETTINGS_KEY]: bad }))).toEqual({ pairSeconds: 3 });
    }
  });

  it('reports a device that refuses to save', () => {
    const refusing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(saveSettings(refusing, { pairSeconds: 5 })).toBe(false);
    expect(saveSettings(null, { pairSeconds: 5 })).toBe(false);
  });

  it('lives under its own key, so saving the main data (also by an older version) never drops it', () => {
    const store = memoryStore();
    saveSettings(store, { pairSeconds: 8 });
    saveData(store, migrate({ schema: 1, assignments: {}, progress: {}, points: 5 }));
    expect(loadSettings(store)).toEqual({ pairSeconds: 8 });
    expect(Object.keys(store.map).sort()).toEqual([STORAGE_KEY, SETTINGS_KEY].sort());
    expect(loadData(store).points).toBe(5);
  });

  it('keeps fields written by a newer version when saving', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ pairSeconds: 5, voiceRate: 0.8 }) });
    saveSettings(store, { pairSeconds: 8 });
    expect(JSON.parse(store.map[SETTINGS_KEY])).toEqual({ pairSeconds: 8, voiceRate: 0.8 });
  });

  it('ignores the wrong-letter time saved by 1.2.0 and removes it on the next save', () => {
    const store = memoryStore({ [SETTINGS_KEY]: JSON.stringify({ wrongLetterSeconds: 3 }) });
    expect(loadSettings(store)).toEqual({ pairSeconds: 3 });
    saveSettings(store, { pairSeconds: 5 });
    expect(JSON.parse(store.map[SETTINGS_KEY])).toEqual({ pairSeconds: 5 });
  });
});

describe('unreadable saved settings', () => {
  it('are replaced on save', () => {
    const store = memoryStore({ [SETTINGS_KEY]: '{broken' });
    expect(saveSettings(store, { pairSeconds: 1.5 })).toBe(true);
    expect(JSON.parse(store.map[SETTINGS_KEY])).toEqual({ pairSeconds: 1.5 });
  });
});
