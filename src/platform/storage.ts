/**
 * Everything the app keeps on the device, stored as one JSON value.
 * `schema` is the version of this stored shape; bump it and add a migration
 * step in `migrate` whenever the shape changes.
 */
export const STORAGE_KEY = 'hebrew-practice';
export const SCHEMA_VERSION = 1;

export interface StoredAssignment {
  /** Version of this assignment type's data shape. */
  v: number;
  data: unknown;
}

export interface AppData {
  schema: number;
  assignments: Record<string, StoredAssignment>;
  progress: Record<string, unknown>;
  points: number;
}

/** The subset of localStorage the app uses (so tests can pass a fake). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyData(): AppData {
  return { schema: SCHEMA_VERSION, assignments: {}, progress: {}, points: 0 };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Converts any older stored shape to the current one. Unknown shapes reset. */
export function migrate(raw: unknown): AppData {
  if (!isRecord(raw) || typeof raw.schema !== 'number') return emptyData();
  if (raw.schema > SCHEMA_VERSION) return emptyData();

  // schema 1 — current
  const assignments: Record<string, StoredAssignment> = {};
  if (isRecord(raw.assignments)) {
    for (const [id, value] of Object.entries(raw.assignments)) {
      if (isRecord(value) && typeof value.v === 'number' && 'data' in value) {
        assignments[id] = { v: value.v, data: value.data };
      }
    }
  }
  return {
    schema: SCHEMA_VERSION,
    assignments,
    progress: isRecord(raw.progress) ? { ...raw.progress } : {},
    points: typeof raw.points === 'number' && raw.points >= 0 ? Math.floor(raw.points) : 0,
  };
}

export function loadData(store: KeyValueStore | null): AppData {
  if (!store) return emptyData();
  try {
    const text = store.getItem(STORAGE_KEY);
    return text ? migrate(JSON.parse(text)) : emptyData();
  } catch {
    return emptyData();
  }
}

/** Schema of what's currently saved, or null when nothing readable is saved. */
function storedSchema(store: KeyValueStore): number | null {
  try {
    const text = store.getItem(STORAGE_KEY);
    const raw: unknown = text ? JSON.parse(text) : null;
    return isRecord(raw) && typeof raw.schema === 'number' ? raw.schema : null;
  } catch {
    return null;
  }
}

/**
 * True when the saved data was written by a newer version of the app (e.g. an
 * old cached version opened offline). That data must not be overwritten.
 */
export function isSavedByNewerVersion(store: KeyValueStore | null): boolean {
  if (!store) return false;
  const schema = storedSchema(store);
  return schema !== null && schema > SCHEMA_VERSION;
}

/** Shown when saved data is from a newer version and therefore must not be changed. */
export const NEWER_VERSION_MESSAGE = 'התוכן נשמר בגרסה חדשה יותר של האתר. התחברו לאינטרנט ורעננו כדי לעדכן.';

export type SaveResult = 'saved' | 'failed' | 'newer-version';

/**
 * 'failed' when the device refused (private mode, storage full);
 * 'newer-version' when saving would overwrite data from a newer app version.
 */
export function saveData(store: KeyValueStore | null, data: AppData): SaveResult {
  if (!store) return 'failed';
  if (isSavedByNewerVersion(store)) return 'newer-version';
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** localStorage, or null when the browser blocks it. */
export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = `${STORAGE_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
