// The Almanac's clips (steps.ts): every building's taps, played from the clip's first frame, end in
// exactly the recipe's world (so the clip ends on its still), and the building comes at the tap where
// the stars burst, not before.

import { describe, expect, test } from 'vitest';
import type { World } from '@/core/world';
import { buildScenario } from '@/scenario';
import { COLLECTION } from './collection';
import { ENTRIES, guideScenario } from './entries';
import { clipPlan, HAND_ORDERED, MAX_TAPS, play, proven, readingOrder, type Piece } from './steps';

/** Everything a world holds, in a fixed order, so two worlds compare as text. */
function dump(w: World): string {
  const sorted = <K extends number, V>(m: ReadonlyMap<K, V>): [K, V][] => [...m].sort((a, b) => a[0] - b[0]);
  return JSON.stringify({
    seq: w.nextSeq,
    blocks: sorted(w.blocks),
    floors: sorted(w.floors),
    edges: sorted(w.edges),
    land: w.terrainEdits ? sorted(w.terrainEdits) : [],
  });
}

describe('every building\'s clip', () => {
  test.each(COLLECTION.map((e) => [e.id, e] as const))('%s', (_id, entry) => {
    const plan = clipPlan(entry);
    const recipe = buildScenario(guideScenario(entry)).world;
    expect(dump(plan.final)).toBe(dump(recipe));

    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.length).toBeLessThanOrEqual(MAX_TAPS);
    let w = plan.setting;
    const worlds: World[] = [];
    for (const s of plan.steps) {
      expect(s.edits.length).toBeGreaterThan(0);
      w = play(w, plan.terrain, s.edits, plan.final);
      worlds.push(w);
    }
    // The taps end on the recipe's own world: the still's picture.
    expect(dump(w)).toBe(dump(recipe));
    // Not there before the tap that makes it; there from it on.
    const before = plan.formed === 0 ? plan.setting : worlds[plan.formed - 1]!;
    expect(proven(entry, before, plan.terrain), 'built before its tap').toBe(false);
    for (const later of worlds.slice(plan.formed)) expect(proven(entry, later, plan.terrain)).toBe(true);
  });

  test('the entries ordered by hand are buildings', () => {
    const ids = new Set(COLLECTION.map((e) => e.id));
    for (const id of HAND_ORDERED) expect(ids.has(id), id).toBe(true);
    // The happenings stay pictures.
    expect(COLLECTION.length).toBeLessThan(ENTRIES.length);
  });
});

describe('the reading order', () => {
  const piece = (over: Partial<Piece> & { index: number }): Piece => ({
    edit: { type: 'placeFloor', cell: 0, floor: 'path' },
    group: 1,
    level: 0,
    cover: 1,
    col: [0, 0],
    at: [0, 0, 0],
    ...over,
  });

  test('the land first, then level by level, ground cover before blocks, call by call', () => {
    const order = readingOrder([
      piece({ index: 0, group: 1, level: 1 }),
      piece({ index: 1, group: 1, level: 0 }),
      piece({ index: 2, group: 2, level: 0, cover: 0 }),
      piece({ index: 3, group: 3, level: -1, cover: 0 }),
      piece({ index: 4, group: 0, level: 0 }),
    ]);
    expect(order.map((p) => p.index)).toEqual([3, 2, 4, 1, 0]);
  });

  test('within a call, from each piece to the nearest one left (a row of a plaza snakes, a fence goes round)', () => {
    // A 3 × 2 patch laid row by row by the builder.
    const cells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] as const;
    const order = readingOrder(cells.map(([x, z], index) => piece({ index, at: [x, 0, z], col: [x, z] })));
    expect(order.map((p) => p.at[0] + ',' + p.at[2])).toEqual(['0,0', '1,0', '2,0', '2,1', '1,1', '0,1']);
  });
});
