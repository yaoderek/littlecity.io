// My towns: where every town the player has made is kept (design section 15,
// added 2026-11-20). Owner: Interface.
//
// One record per town, keyed by an id that never changes. The records live in
// IndexedDB (a browser's allowance there is hundreds of megabytes, not the
// few megabytes of localStorage); if IndexedDB cannot be opened they live in
// localStorage instead, and in memory for tests. Nothing here throws: a store
// that fails says so by rejecting, and the keeper (towns.ts) carries on.

/** One kept town. `code` is its share code (world/save.ts), which every later version can read. */
export interface TownEntry {
  id: string;
  code: string;
  /** What the player sees on the card. */
  name: string;
  /** The player chose the name: growing a town over it does not rename it. */
  named?: boolean;
  created: number;
  updated: number;
  /** A small picture of the town (a JPEG data URL), taken when the player last left it. */
  thumb?: string;
  /** Made as a copy of a Global Village post: that post's id (posting this town says it was built on it). Old records lack it. */
  from?: string;
}

export interface TownLibrary {
  all(): Promise<TownEntry[]>;
  put(entry: TownEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

/** A library in memory (tests, and the last resort when the browser keeps nothing). */
export function memoryLibrary(initial: TownEntry[] = []): TownLibrary {
  const rows = new Map(initial.map((e) => [e.id, { ...e }]));
  return {
    all: async () => [...rows.values()].map((e) => ({ ...e })),
    put: async (e) => void rows.set(e.id, { ...e }),
    remove: async (id) => void rows.delete(id),
  };
}

const DB_NAME = 'little-city';
const DB_STORE = 'towns';
/** The localStorage key of the fallback library (one JSON array). */
export const FALLBACK_KEY = 'little-city.towns.v1';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
}

function indexedDbLibrary(db: IDBDatabase): TownLibrary {
  const store = (mode: IDBTransactionMode): IDBObjectStore => db.transaction(DB_STORE, mode).objectStore(DB_STORE);
  const done = (s: IDBObjectStore): Promise<void> =>
    new Promise((resolve, reject) => {
      s.transaction.oncomplete = () => resolve();
      s.transaction.onerror = () => reject(s.transaction.error);
      s.transaction.onabort = () => reject(s.transaction.error);
    });
  return {
    all: () => request(store('readonly').getAll() as IDBRequest<TownEntry[]>),
    put(e) {
      const s = store('readwrite');
      s.put(e);
      return done(s);
    },
    remove(id) {
      const s = store('readwrite');
      s.delete(id);
      return done(s);
    },
  };
}

/** The fallback: every record in one localStorage value. */
export function storageLibrary(storage: Pick<Storage, 'getItem' | 'setItem'>): TownLibrary {
  const read = (): TownEntry[] => {
    const parsed: unknown = JSON.parse(storage.getItem(FALLBACK_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as TownEntry[]) : [];
  };
  const write = (rows: TownEntry[]): void => storage.setItem(FALLBACK_KEY, JSON.stringify(rows));
  return {
    all: async () => read(),
    async put(e) {
      write([...read().filter((r) => r.id !== e.id), e]);
    },
    async remove(id) {
      write(read().filter((r) => r.id !== id));
    },
  };
}

/** The browser's library: IndexedDB, else localStorage, else memory. Never rejects. */
export async function browserLibrary(storage: Storage | null): Promise<{ library: TownLibrary; lasting: boolean }> {
  try {
    if (typeof indexedDB !== 'undefined') return { library: indexedDbLibrary(await openDb()), lasting: true };
  } catch {
    // private browsing in some browsers, or storage turned off: try the next
  }
  if (storage) {
    try {
      const library = storageLibrary(storage);
      await library.all();
      return { library, lasting: true };
    } catch {
      // as above
    }
  }
  return { library: memoryLibrary(), lasting: false };
}
