// The unlock moment's bookkeeping (./unlock.ts): only the player's own edits count, only the almanac's
// buildings, only once per player (across towns and visits), and what the dressing holds only when the
// dressing that follows the player's own edit holds it.

import { describe, expect, test } from 'vitest';
import { key } from '@/core/grid';
import type { Edit } from '@/core/world';
import { createGame, type Game } from '@/app/game';
import { flatTerrain } from '@/scenario';
import type { DressingPlan } from '@/resolve/plan';
import { emptyWorld } from '@/world/world';
import { BUILT_KEY, createCollector, topOf, type Collector, type Unlocked } from './unlock';

const block = (kind: 'house' | 'tower', x: number, y: number, z: number): Edit => ({ type: 'placeBlock', cell: key(x, y, z), kind, color: kind === 'house' ? 5 : 1, from: null });

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

/** A game whose every change reaches the collector, as the interface's sync() does. */
function setup(storage: Storage = memory(), enabled = true): { game: Game; collector: Collector; got: Unlocked[]; storage: Storage } {
  const got: Unlocked[] = [];
  let collector: Collector | null = null;
  const game = createGame({ world: emptyWorld(3), terrain: flatTerrain(3) }, { show() {}, changed: () => collector?.changed(game.shape) });
  collector = createCollector({ storage, shape: game.shape, enabled, unlocked: (m) => void got.push(...m) });
  return { game, collector, got, storage };
}

/** Houses and a tower two tall: one more tower block makes a chapel. */
function nearlyChapel(game: Game, x = 18, z = 20): void {
  for (const dx of [0, 1, 2]) game.edit(block('house', x + dx, 1, z));
  for (const y of [1, 2]) game.edit(block('tower', x + 3, y, z));
}

describe('what counts as an unlock', () => {
  test('a chapel built by hand: unlocked once, with its building, and remembered', () => {
    const { game, collector, got, storage } = setup();
    // A house beside a short tower is a smithy: the first unlock.
    collector.hand(() => nearlyChapel(game));
    expect(got.map((u) => u.entry.id)).toEqual(['smithy']);
    // The tower reaches three: the house is a chapel now, and the tower its steeple.
    collector.hand(() => game.edit(block('tower', 21, 3, 20)));
    expect(got.map((u) => u.entry.id).sort()).toEqual(['chapel', 'smithy', 'steeple']);
    const chapel = got.find((u) => u.entry.id === 'chapel')!;
    expect(chapel.structure).not.toBeNull();
    expect(topOf(game.shape, chapel.structure!)?.at[1]).toBeGreaterThan(0.5);
    expect(collector.built.has('chapel')).toBe(true);
    expect(JSON.parse(storage.getItem(BUILT_KEY)!).built.sort()).toEqual(['chapel', 'smithy', 'steeple']);
    // A second chapel by hand, here or in another town or visit: nothing more.
    collector.hand(() => nearlyChapel(game, 10, 30));
    collector.hand(() => game.edit(block('tower', 13, 3, 30)));
    expect(got).toHaveLength(3);
    const again = setup(storage);
    again.collector.hand(() => nearlyChapel(again.game));
    again.collector.hand(() => again.game.edit(block('tower', 21, 3, 20)));
    expect(again.got).toEqual([]);
  });

  test('what grows, mischief, an undo or a town opened makes is never counted, nor built on later', () => {
    const { game, collector, got } = setup();
    // A town growing (edits outside hand()).
    nearlyChapel(game);
    game.edit(block('tower', 21, 3, 20));
    expect(got).toEqual([]);
    // The player builds onto the grown chapel: it was already a chapel.
    collector.hand(() => game.edit(block('tower', 21, 4, 20)));
    expect(got).toEqual([]);
    // An undo and a redo bring a chapel back: not by hand.
    game.undo();
    game.undo();
    game.redo();
    expect(got).toEqual([]);
    expect(collector.built.size).toBe(0);
  });

  test('plain pieces unlock nothing', () => {
    const { game, collector, got } = setup();
    collector.hand(() => {
      game.edit(block('house', 10, 1, 10));
      game.edit(block('tower', 14, 1, 14));
    });
    expect(got).toEqual([]);
  });

  test('off (a scenario): nothing is counted', () => {
    const { game, collector, got, storage } = setup(memory(), false);
    collector.hand(() => nearlyChapel(game));
    collector.hand(() => game.edit(block('tower', 21, 3, 20)));
    expect(got).toEqual([]);
    expect(storage.getItem(BUILT_KEY)).toBeNull();
  });

  test('a broken record reads as nothing built, and is written over cleanly', () => {
    const storage = memory();
    storage.setItem(BUILT_KEY, '{not json');
    const { game, collector, got } = setup(storage);
    expect(collector.built.size).toBe(0);
    collector.hand(() => nearlyChapel(game));
    collector.hand(() => game.edit(block('tower', 21, 3, 20)));
    expect(got.map((u) => u.entry.id)).toContain('chapel');
    expect(JSON.parse(storage.getItem(BUILT_KEY)!)).toMatchObject({ v: 1, built: expect.arrayContaining(['chapel']) });
  });

  test('reset forgets everything built', () => {
    const { game, collector, got, storage } = setup();
    collector.hand(() => nearlyChapel(game));
    collector.hand(() => game.edit(block('tower', 21, 3, 20)));
    collector.reset();
    expect(collector.built.size).toBe(0);
    expect(storage.getItem(BUILT_KEY)).toBeNull();
    expect(got.length).toBeGreaterThan(0);
  });
});

describe('what the dressing holds', () => {
  const dressing = (facts: { rule: string; type: string }[]): DressingPlan =>
    ({ props: facts.map((f, i) => ({ id: `${f.rule}@${i}`, type: f.type, rule: f.rule, at: { cell: 0 }, hash: 0 })), actors: [], sockets: [], nav: null, claims: new Map(), trace: [], hash: 0 }) as unknown as DressingPlan;
  const ORCHARD = [{ rule: 'U18.orchard', type: 'ladder' }];

  test('counts when the dressing after the player\'s edit holds it and the one before did not', () => {
    const { game, collector, got } = setup();
    collector.dressed(game.shape, dressing([]));
    collector.hand(() => game.edit(block('house', 10, 1, 10)));
    collector.dressed(game.shape, dressing(ORCHARD));
    expect(got.map((u) => [u.entry.id, u.structure])).toEqual([['orchard', null]]);
  });

  test('not when something else changed the town before the dressing came, nor with no dressing to compare with', () => {
    const a = setup();
    a.collector.dressed(a.game.shape, dressing([]));
    a.collector.hand(() => a.game.edit(block('house', 10, 1, 10)));
    a.game.edit(block('house', 30, 1, 30)); // a town growing
    a.collector.dressed(a.game.shape, dressing(ORCHARD));
    expect(a.got).toEqual([]);

    const b = setup();
    b.collector.hand(() => b.game.edit(block('house', 10, 1, 10)));
    b.collector.dressed(b.game.shape, dressing(ORCHARD));
    expect(b.got).toEqual([]);
  });
});
