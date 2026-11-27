// My towns: the keeper never writes over a town the player built.

import { describe, expect, test } from 'vitest';
import { key } from '@/core/grid';
import type { World } from '@/core/world';
import { decodeTown, encodeTown, SAVE_KEY } from '@/world/save';
import { memoryLibrary, type TownEntry, type TownLibrary } from './library';
import { createKeeper, ID_KEY, PREVIOUS_KEY, type KeeperStorage } from './towns';

function store(init: Record<string, string> = {}): KeeperStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** A town with `n` houses in a row (seed picks the island). */
function town(seed: number, n: number): World {
  const blocks = new Map();
  for (let i = 0; i < n; i++) blocks.set(key(10 + i, 2, 10), { kind: 'house', color: 1, rot: 0, seq: i + 1 });
  return { version: 1, seed, nextSeq: n + 1, blocks, floors: new Map(), edges: new Map() };
}
const worth = (w: World): boolean => w.blocks.size > 0;
let ids = 0;
const opts = (storage: KeeperStorage, library: TownLibrary) => ({ storage, library, worth, newId: () => `id${++ids}` });

describe('the keeper', () => {
  test('a town saved before My towns existed is filed with an id, before anything is saved over it', async () => {
    const old = encodeTown(town(7, 3));
    const s = store({ [SAVE_KEY]: old });
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    expect(k.savedId).not.toBeNull();
    expect(s.data.get(ID_KEY)).toBe(k.savedId);
    await k.ready;
    const all = await lib.all();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: k.savedId, code: old, name: 'Town 1' });
  });

  test('a fresh island only becomes a kept town once something of the player is on it', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    k.save(town(1, 0));
    expect(k.current).toBeNull();
    expect(await k.list()).toHaveLength(0);
    k.save(town(1, 2));
    expect(k.current).not.toBeNull();
    const list = await k.list();
    expect(list.map((e) => e.name)).toEqual(['Town 1']);
    expect(decodeTown(list[0]!.code)).toMatchObject({ ok: true });
  });

  test('a new island is a second town; the first is still there, unchanged', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    k.save(town(1, 4));
    const first = k.current!;
    const firstCode = s.data.get(SAVE_KEY);
    k.detach();
    k.save(town(2, 1));
    expect(k.current).not.toBe(first);
    // The saved town it replaced was copied aside first, synchronously.
    expect(JSON.parse(s.data.get(PREVIOUS_KEY)!)).toEqual({ id: first, code: firstCode });
    const list = await k.list();
    expect(list).toHaveLength(2);
    expect(list.find((e) => e.id === first)!.code).toBe(firstCode);
  });

  test('opening a kept town makes it the saved town, and its edits go to its own entry', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    k.save(town(1, 4));
    const a = k.current!;
    k.detach();
    k.save(town(2, 1));
    await k.list();
    const opened = k.open(a);
    expect(opened.ok).toBe(true);
    expect(k.current).toBe(a);
    expect(s.data.get(ID_KEY)).toBe(a);
    k.save(town(1, 6));
    const list = await k.list();
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe(a);
    expect((decodeTown(list[0]!.code) as { world: World }).world.blocks.size).toBe(6);
  });

  test('a saved town this version cannot read is kept, never written over', async () => {
    const garbage = 'LCzzzzzzzzzzzzzzzzzzzzzz';
    const s = store({ [SAVE_KEY]: garbage, [ID_KEY]: 'old' });
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    expect(k.savedUnreadable).toBe(true);
    expect(k.savedId).toBe('old');
    // The player builds on a fresh island straight away: the unreadable town goes aside synchronously.
    k.save(town(3, 1));
    expect(JSON.parse(s.data.get(PREVIOUS_KEY)!)).toEqual({ id: 'old', code: garbage });
    const list = await k.list();
    expect(list.find((e) => e.id === 'old')!.code).toBe(garbage);
    const opened = k.open('old');
    expect(opened.ok).toBe(false);
    expect(k.current).not.toBe('old');
  });

  test('when the library cannot be written, the replaced town waits in PREVIOUS_KEY and is filed next visit', async () => {
    const s = store();
    const broken: TownLibrary = { all: async () => [], put: async () => Promise.reject(new Error('full')), remove: async () => {} };
    let told = 0;
    const k = createKeeper({ ...opts(s, broken), onTrouble: () => told++ });
    k.save(town(1, 2));
    const first = k.current!;
    k.detach();
    k.save(town(2, 2));
    await k.list();
    expect(told).toBe(1);
    // Next visit, with a working library: both towns are filed.
    const lib = memoryLibrary();
    const k2 = createKeeper(opts(s, lib));
    await k2.ready;
    const ids2 = (await lib.all()).map((e) => e.id).sort();
    expect(ids2).toContain(first);
    expect(ids2).toHaveLength(2);
    expect(s.data.has(PREVIOUS_KEY)).toBe(false);
  });

  test('a grown town is named for its kind unless the player named it; the town on screen cannot be deleted', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    k.suggestName('A harbour town');
    k.save(town(1, 2));
    expect((await k.list())[0]!.name).toBe('A harbour town');
    k.rename(k.current!, '  Seaside  ');
    k.suggestName('A castle town');
    expect((await k.list())[0]).toMatchObject({ name: 'Seaside', named: true });
    expect(await k.remove(k.current!)).toBe(false);
    const a = k.current!;
    k.detach();
    k.save(town(2, 1));
    expect(await k.remove(a)).toBe(true);
    expect((await lib.all()).map((e: TownEntry) => e.id)).not.toContain(a);
  });

  test('a copy of a Global Village post is a new town, named for its poster, remembering the post; the town it left is untouched', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    const own = town(1, 3);
    k.save(own);
    const mine = k.current!;
    expect(k.from).toBeNull();
    k.detach();
    k.adopt("mira's town", 'post42');
    expect(k.from).toBe('post42');
    k.save(town(5, 4));
    const copy = k.current!;
    expect(copy).not.toBe(mine);
    const all = await k.list();
    expect(all.find((e) => e.id === copy)).toMatchObject({ name: "mira's town", from: 'post42' });
    expect(all.find((e) => e.id === mine)).toMatchObject({ code: encodeTown(own) });
    expect(all.find((e) => e.id === mine)!.from).toBeUndefined();
    expect(k.from).toBe('post42');
    // Kept across visits, and gone with the next town.
    const again = createKeeper(opts(s, lib));
    await again.list();
    again.open(copy);
    expect(again.from).toBe('post42');
    again.open(mine);
    expect(again.from).toBeNull();
    k.detach();
    expect(k.from).toBeNull();
  });

  test('the library is read on start: a returning player sees every town, and the saved one is current-ready', async () => {
    const s = store();
    const lib = memoryLibrary();
    const k = createKeeper(opts(s, lib));
    k.save(town(1, 2));
    k.detach();
    k.save(town(2, 3));
    const last = k.current;
    await k.list();
    const again = createKeeper(opts(s, lib));
    expect(again.savedId).toBe(last);
    expect(await again.list()).toHaveLength(2);
  });
});
