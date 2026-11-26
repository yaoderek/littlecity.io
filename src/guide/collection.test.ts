// The collection (the Almanac's "built N / M" and the unlock moment): what is collectable, what an edit
// made, what a dressing holds that the one before did not, and the record read back defensively.

import { describe, expect, test } from 'vitest';
import { key } from '@/core/grid';
import type { Edit } from '@/core/world';
import { createGame } from '@/app/game';
import { flatTerrain } from '@/scenario';
import { emptyWorld } from '@/world/world';
import { BUILDING_GROUPS, COLLECTION, collectable, madeByEdit, madeInDressing, progress, readRecord, writeRecord } from './collection';
import { ENTRIES, NOT_SPECIAL } from './entries';

const block = (kind: 'house' | 'tower' | 'tree', x: number, y: number, z: number): Edit => ({ type: 'placeBlock', cell: key(x, y, z), kind, color: kind === 'house' ? 5 : 1, from: null });

function town() {
  return createGame({ world: emptyWorld(3), terrain: flatTerrain(3) }, { show() {} });
}

describe('what can be collected', () => {
  test('the buildings of the almanac, in its order: not the Auto note, not the happenings', () => {
    expect(COLLECTION.length).toBeGreaterThan(60);
    expect(COLLECTION.every((e) => BUILDING_GROUPS.has(e.group))).toBe(true);
    expect(COLLECTION.map((e) => e.id)).toEqual(ENTRIES.filter((e) => BUILDING_GROUPS.has(e.group)).map((e) => e.id));
    for (const id of ['chapel', 'lighthouse', 'greenhouse', 'keep', 'orchard', 'street-lamps']) expect(collectable(id), id).toBe(true);
    for (const id of ['auto', 'wedding', 'market-day', 'smith-at-work', 'fire-brigade']) expect(collectable(id), id).toBe(false);
  });

  test('plain pieces are never in it: the default house, tower, dock, the trees, fences and the Mill', () => {
    const roles = new Set(COLLECTION.flatMap((e) => ('role' in e.proof ? [e.proof.role] : [])));
    for (const role of Object.keys(NOT_SPECIAL)) expect(roles.has(role as never), role).toBe(false);
  });

  test('progress counts only what is in the collection', () => {
    expect(progress(new Set())).toEqual({ got: 0, all: COLLECTION.length });
    expect(progress(new Set(['chapel', 'inn', 'wedding', 'not-a-thing']))).toEqual({ got: 2, all: COLLECTION.length });
  });
});

describe('what an edit made', () => {
  test('a house beside a tower that reaches three makes a chapel, once: building on it later makes nothing new', () => {
    const game = town();
    for (const x of [18, 19, 20]) game.edit(block('house', x, 1, 20));
    game.edit(block('tower', 21, 1, 20));
    let before = game.shape;
    game.edit(block('tower', 21, 2, 20));
    expect(madeByEdit(before, game.shape).map((m) => m.entry.id)).not.toContain('chapel');
    before = game.shape;
    game.edit(block('tower', 21, 3, 20));
    const made = madeByEdit(before, game.shape);
    // The house turns from a smithy (a house beside a short tower) into a chapel, and the tower into its steeple.
    expect(made.map((m) => m.entry.id).sort()).toEqual(['chapel', 'steeple']);
    const chapel = made.find((m) => m.entry.id === 'chapel')!;
    expect(game.shape.roles.get(chapel.structure)?.role).toBe('chapel');
    // The same chapel, a storey taller: not made again.
    before = game.shape;
    game.edit(block('tower', 21, 4, 20));
    expect(madeByEdit(before, game.shape).map((m) => m.entry.id)).not.toContain('chapel');
  });

  test('a plain house or a tree makes nothing collectable', () => {
    const game = town();
    const before = game.shape;
    game.edit(block('house', 10, 1, 10));
    game.edit(block('tree', 14, 1, 14));
    expect(madeByEdit(before, game.shape)).toEqual([]);
  });

  test('a second chapel elsewhere is made by its own edit, though the town had one', () => {
    const game = town();
    for (const x of [18, 19, 20]) game.edit(block('house', x, 1, 20));
    for (const y of [1, 2, 3]) game.edit(block('tower', 21, y, 20));
    for (const x of [10, 11]) game.edit(block('house', x, 1, 30));
    for (const y of [1, 2]) game.edit(block('tower', 12, y, 30));
    const before = game.shape;
    game.edit(block('tower', 12, 3, 30));
    expect(madeByEdit(before, game.shape).map((m) => m.entry.id)).toContain('chapel');
  });
});

describe('what the dressing holds', () => {
  test('an entry proven by a prop counts when the new dressing has it and the old did not', () => {
    const orchard = 'U18.orchard|ladder';
    expect(madeInDressing(new Set(), new Set([orchard, 'U18.orchard'])).map((e) => e.id)).toEqual(['orchard']);
    expect(madeInDressing(new Set([orchard]), new Set([orchard]))).toEqual([]);
    // A happening's proof (a socket) is never collected.
    expect(madeInDressing(new Set(), new Set(['socket:L57.wedding']))).toEqual([]);
  });
});

describe('the record', () => {
  test('reads back what it wrote', () => {
    expect(readRecord(writeRecord(['chapel', 'inn']))).toEqual(['chapel', 'inn']);
  });
  test('anything it cannot read is nothing built, never an error', () => {
    for (const raw of [null, undefined, '', 'chapel,inn', '{', 'null', '[]', '{"built":"chapel"}', '{"built":[1,null,"<b>"]}']) expect(readRecord(raw), String(raw)).toEqual([]);
    expect(readRecord('{"v":2,"built":["chapel","chapel","some-later-entry"]}')).toEqual(['chapel', 'some-later-entry']);
  });
});
