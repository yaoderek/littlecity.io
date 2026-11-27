// The keeper: the town on screen saved where it reopens next visit, and every
// town the player has made kept in My towns (library.ts). Owner: Interface.
//
// Two places, one rule: nothing the player built is ever written over.
//
//   localStorage SAVE_KEY   the town that opens next visit (as before, unchanged)
//   localStorage ID_KEY     which kept town that is ('' for a fresh island not yet built on)
//   the library             every kept town, by id, with a picture
//
// When the keeper starts it copies the saved town into the library before
// anything can write over it, readable or not: a town this version cannot
// read is kept as it is, for a later version (or a town file) to open. And
// whenever the saved town is about to be replaced by a different town, it is
// first copied to PREVIOUS_KEY, synchronously, so even a library that is slow
// or broken cannot lose it; the next start files it into the library.
//
// A town is kept from its first save with something of the player's in it
// (`worth`): an island with only its starting trees is not a town yet.

import type { World } from '@/core/world';
import { say, t } from '@/i18n';
import { decodeTown, encodeTown, SAVE_KEY, type TownStorage } from '@/world/save';
import type { TownEntry, TownLibrary } from './library';

export const ID_KEY = 'little-city.town.id';
export const PREVIOUS_KEY = 'little-city.town.previous';

export type KeeperStorage = TownStorage & { removeItem(key: string): void };

export interface KeeperOptions {
  storage: KeeperStorage | null;
  library: TownLibrary | Promise<TownLibrary>;
  /** The town holds something of the player's (more than its starting trees). */
  worth(world: World): boolean;
  /** Called once, the first time the library cannot be written. */
  onTrouble?(): void;
  now?(): number;
  newId?(): string;
}

export type OpenResult = { ok: true; world: World } | { ok: false; reason: string };

export interface Keeper {
  /** Resolves once the library is read and the saved town is filed in it. */
  readonly ready: Promise<void>;
  /** The kept town on screen; null for one not kept (yet): a bare island, a scenario, a town being visited. */
  current: string | null;
  /** The id of the town in SAVE_KEY when the page opened, if it is one worth keeping. */
  readonly savedId: string | null;
  /** SAVE_KEY held a town this version cannot read. It is kept in the library regardless. */
  readonly savedUnreadable: boolean;
  /** Saves the town on screen (autosave calls this). Returns whether SAVE_KEY was written. */
  save(world: World): boolean;
  /** The town on screen is a different town from now on: its next save starts a new entry. */
  detach(): void;
  /** A name for the town on screen (a grown town's kind), unless the player has named it. */
  suggestName(name: string): void;
  /** The town on screen is a copy of a Global Village post: its name, and the post it came from (kept on its entry). Call after detach(). */
  adopt(name: string, from: string): void;
  /** The post the town on screen was copied from, if it was. */
  readonly from: string | null;
  /** A picture of the town on screen. */
  thumb(dataUrl: string): void;
  /** Every kept town, the most recently changed first. */
  list(): Promise<TownEntry[]>;
  /** Makes a kept town the one on screen; the caller opens the world it returns. */
  open(id: string): OpenResult;
  rename(id: string, name: string): void;
  /** Deletes a kept town for good. The town on screen cannot be deleted. */
  remove(id: string): Promise<boolean>;
}

const randomId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

/** The player's language's "Town {n}" as a pattern that reads the number back. */
function townNumbered(): RegExp {
  const [before, after] = t('Town {n}', { n: '\u0000' }).split('\u0000');
  const esc = (x = ''): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(before)}(\\d+)${esc(after)}$`);
}

export function createKeeper(opts: KeeperOptions): Keeper {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? randomId;
  const storage = opts.storage;
  const get = (k: string): string | null => {
    try {
      return storage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const set = (k: string, v: string): boolean => {
    try {
      if (!storage) return false;
      storage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  };

  const cache = new Map<string, TownEntry>();
  let pendingName: string | null = null;
  /** The post a town not yet kept was copied from (Global Village): written on its entry when it is. */
  let pendingFrom: string | null = null;
  let troubled = false;
  const trouble = (): void => {
    if (troubled) return;
    troubled = true;
    try {
      opts.onTrouble?.();
    } catch {
      // a failing listener must not break the game
    }
  };

  /** "Town 4" (in the player's language): one past the highest such number, in English or theirs, and past the count. */
  const nextName = (): string => {
    let n = cache.size;
    const named = [/^Town (\d+)$/, townNumbered()];
    for (const e of cache.values()) {
      for (const re of named) {
        const m = re.exec(e.name);
        if (m) n = Math.max(n, Number(m[1]));
      }
    }
    return t('Town {n}', { n: String(n + 1) });
  };

  // ── what was saved last visit: filed before anything can write over it ──
  const raw = get(SAVE_KEY);
  const decoded = raw ? decodeTown(raw) : null;
  const savedUnreadable = decoded !== null && !decoded.ok;
  let keepRaw = false;
  if (raw && decoded) {
    try {
      keepRaw = !decoded.ok || opts.worth(decoded.world);
    } catch {
      keepRaw = true;
    }
  }
  let rawId = get(ID_KEY) || '';
  if (keepRaw && !rawId) {
    // A town saved before My towns existed: it gets its id now, and keeps it.
    rawId = newId();
    set(ID_KEY, rawId);
  }
  const savedId = keepRaw ? rawId : null;

  let library: TownLibrary | null = null;
  const ready = (async () => {
    try {
      library = await opts.library;
      for (const e of await library.all()) if (e && typeof e.id === 'string' && typeof e.code === 'string') cache.set(e.id, e);
      if (keepRaw && raw) {
        const known = cache.get(rawId);
        if (!known) await putEntry({ id: rawId, code: raw, name: nextName(), created: now(), updated: now() });
        else if (known.code !== raw) await putEntry({ ...known, code: raw, updated: now() });
      }
      const prevText = get(PREVIOUS_KEY);
      if (prevText) {
        const prev = parsePrevious(prevText);
        if (prev && !cache.has(prev.id)) await putEntry({ id: prev.id, code: prev.code, name: nextName(), created: now(), updated: now() });
        // Filed (or already there): clear it, unless a save has put a newer one there meanwhile.
        if (get(PREVIOUS_KEY) === prevText) {
          try {
            storage?.removeItem(PREVIOUS_KEY);
          } catch {
            // it is harmless to leave
          }
        }
      }
    } catch {
      trouble();
    }
  })();

  async function putEntry(e: TownEntry): Promise<void> {
    cache.set(e.id, e);
    if (!library) throw new Error('no library');
    await library.put(e);
  }

  /** Library writes, in order, after the start-up filing. */
  let chain: Promise<void> = ready;
  const queue = (fn: () => Promise<void> | void): void => {
    chain = chain.then(fn).catch(() => trouble());
  };

  /** Writes the town that opens next visit, keeping the one it replaces if it is a different kept town. */
  const writeSaved = (code: string, id: string | null): boolean => {
    const oldId = get(ID_KEY) || '';
    const oldCode = get(SAVE_KEY);
    if (oldCode && oldId && oldId !== (id ?? '') && oldCode !== code) set(PREVIOUS_KEY, JSON.stringify({ id: oldId, code: oldCode }));
    const ok = set(SAVE_KEY, code);
    if (ok) set(ID_KEY, id ?? '');
    return ok;
  };

  const api: Keeper = {
    ready,
    current: null,
    savedId,
    savedUnreadable,
    save(world) {
      let code: string;
      try {
        code = encodeTown(world);
      } catch {
        return false;
      }
      let worth: boolean;
      try {
        worth = opts.worth(world);
      } catch {
        worth = true;
      }
      if (api.current === null && worth) api.current = newId();
      const id = api.current;
      const ok = writeSaved(code, id);
      if (id !== null) {
        const name = pendingName;
        const from = pendingFrom;
        const at = now();
        queue(() => {
          const known = cache.get(id);
          return putEntry(known ? { ...known, code, updated: at } : { id, code, name: name ?? nextName(), created: at, updated: at, ...(from ? { from } : {}) });
        });
      }
      return ok;
    },
    detach() {
      api.current = null;
      pendingName = null;
      pendingFrom = null;
    },
    adopt(name, from) {
      pendingName = name;
      pendingFrom = from;
    },
    get from() {
      const id = api.current;
      return (id !== null ? cache.get(id)?.from : undefined) ?? pendingFrom;
    },
    suggestName(name) {
      pendingName = name;
      const id = api.current;
      if (id === null) return;
      queue(() => {
        const known = cache.get(id);
        if (known && !known.named && known.name !== name) return putEntry({ ...known, name });
      });
    },
    thumb(dataUrl) {
      const id = api.current;
      if (id === null) return;
      queue(() => {
        const known = cache.get(id);
        if (known) return putEntry({ ...known, thumb: dataUrl });
      });
    },
    async list() {
      await chain;
      return [...cache.values()].sort((a, b) => b.updated - a.updated);
    },
    open(id) {
      const entry = cache.get(id);
      if (!entry) return { ok: false, reason: t('That town is not here any more.') };
      const result = decodeTown(entry.code);
      if (!result.ok) return { ok: false, reason: t('{reason} It is kept here; a newer Little City may open it.', { reason: say(result.reason) }) };
      api.current = id;
      pendingName = null;
      pendingFrom = null;
      writeSaved(entry.code, id);
      return { ok: true, world: result.world };
    },
    rename(id, name) {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      queue(() => {
        const known = cache.get(id);
        if (known) return putEntry({ ...known, name: clean, named: true });
      });
    },
    async remove(id) {
      if (id === api.current) return false;
      await chain;
      if (!cache.has(id)) return false;
      cache.delete(id);
      try {
        await library?.remove(id);
        return true;
      } catch {
        trouble();
        return false;
      }
    },
  };
  return api;
}

function parsePrevious(text: string): { id: string; code: string } | null {
  try {
    const p = JSON.parse(text) as { id?: unknown; code?: unknown };
    return typeof p.id === 'string' && p.id && typeof p.code === 'string' && p.code ? { id: p.id, code: p.code } : null;
  } catch {
    return null;
  }
}
