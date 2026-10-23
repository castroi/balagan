import { describe, it, expect } from 'vitest';
import {
  emptyData,
  loadData,
  migrate,
  saveData,
  STORAGE_KEY,
  type KeyValueStore,
} from '../../src/platform/storage';

const memoryStore = (): KeyValueStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('storage', () => {
  it('saves and loads the same data', () => {
    const store = memoryStore();
    const data = emptyData();
    data.points = 42;
    data.assignments['scrambled-words'] = { v: 1, data: { words: ['כַּעַס'] } };
    expect(saveData(store, data)).toBe(true);
    expect(loadData(store)).toEqual(data);
  });

  it('starts empty when nothing is saved', () => {
    expect(loadData(memoryStore())).toEqual(emptyData());
    expect(loadData(null)).toEqual(emptyData());
  });

  it('survives corrupted saved data', () => {
    const store = memoryStore();
    store.map.set(STORAGE_KEY, '{not json');
    expect(loadData(store)).toEqual(emptyData());
  });

  it('survives a device that refuses to read or write', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadData(broken)).toEqual(emptyData());
    expect(saveData(broken, emptyData())).toBe(false);
  });

  it('drops malformed parts but keeps valid ones', () => {
    const data = migrate({
      schema: 1,
      points: -5,
      assignments: { good: { v: 1, data: {} }, bad: 'x' },
      progress: [],
    });
    expect(Object.keys(data.assignments)).toEqual(['good']);
    expect(data.points).toBe(0);
    expect(data.progress).toEqual({});
  });

  it('resets data written by a newer version of the app', () => {
    expect(migrate({ schema: 99, points: 5 })).toEqual(emptyData());
  });
});
