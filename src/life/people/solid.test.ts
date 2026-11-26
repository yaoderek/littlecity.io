// People are solid (the owner's request, 2026-11-19): walkers step round each
// other and nobody steps into anybody. Stepped at 30 Hz, deterministic.
//
// An OVERLAP is two people's centres closer than BODY (0.15: a person is
// about 0.13 across the shoulders) on the same floor, both out in the open
// (not in a doorway, not hopping, not fading in or out). A brief touch while
// two pass, under BRIEF (0.25 s), is allowed; one that lasts longer is
// SUSTAINED. Where a single-file stretch knots up past undoing (somebody
// waits, thinks again, and is still held up), the last resort is to squeeze
// past: that is counted as a sustained overlap too, and the bounds below are
// honest about how many remain.

import { describe, expect, test } from 'vitest';
import { key, keyX, keyZ } from '@/core/grid';
import { flatTerrain } from '@/scenario';
import everything from '../../../scenarios/core/everything.scenario';
import peopleTown from '../../../scenarios/people/people-town.scenario';
import { createCrowd, type Crowd, type Goal, type Person } from './crowd';
import { BODY, watchOverlaps } from './overlap';
import { clock, scenarioTown, townOf, watch, type TestTown } from './testing';
import { nodeCentre, nodeHeight } from './walk';

const STEP = 1 / 30;

/** A day and an evening in a town: overlaps counted, the graph and progress watched. */
function day(town: TestTown, seconds: number, dusk: number) {
  const c = clock(town.world.seed, 'day');
  const crowd = createCrowd();
  crowd.sync(town.shape, town.dressing, c.time);
  const o = watchOverlaps(crowd);
  const w = watch(crowd);
  for (let i = 0; i < seconds * 30; i++) {
    crowd.step(c.tick(STEP), c.time);
    o.check(STEP);
    w.check();
  }
  c.hold('dusk');
  for (let i = 0; i < dusk * 30; i++) {
    crowd.step(c.tick(STEP), c.time);
    o.check(STEP);
    w.check();
  }
  return { crowd, o, w };
}

/** Everybody home and out of the way but the given walkers, each sent from one cell to another. */
function meet(town: TestTown, walks: [from: [number, number], to: [number, number], speed?: number][], seconds: number) {
  const c = clock(town.world.seed, 'day');
  const crowd = createCrowd();
  crowd.sync(town.shape, town.dressing, c.time);
  const nav = crowd.nav!;
  const people = crowd.people as Person[];
  for (const p of people) {
    p.mode = 'home';
    p.visible = false;
    p.timer = 1e9;
    p.want = null;
  }
  const node = (x: number, z: number): number => nav.nodeAt.get(key(x, 1, z))!;
  const goal = (n: number): Goal => ({ kind: 'haunt', node: n, haunt: null, door: null, spot: null, face: NaN, pose: 'stand', linger: 1e9, seat: -1 });
  const walkers = walks.map(([from, to, speed], i) => {
    const p = people[i]!;
    const n = node(from[0], from[1]);
    const ctr = nodeCentre(nav, n);
    Object.assign(p, { mode: 'wait', timer: 0, visible: true, node: n, cell: nav.nodes[n]!.cell, x: ctr.x, z: ctr.z, y: nodeHeight(nav, n), want: goal(node(to[0], to[1])) });
    if (speed !== undefined) (p as { speed: number }).speed = speed;
    return p;
  });
  const o = watchOverlaps(crowd);
  const w = watch(crowd);
  let closest = Infinity;
  for (let i = 0; i < seconds * 30; i++) {
    crowd.step(c.tick(STEP), c.time);
    o.check(STEP);
    w.check();
    for (let a = 0; a < walkers.length; a++) {
      for (let b = a + 1; b < walkers.length; b++) {
        const p = walkers[a]!, q = walkers[b]!;
        if (p.mode === 'walk' && q.mode === 'walk') closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
      }
    }
  }
  const arrived = walkers.map((p) => p.mode === 'linger');
  return { crowd, o, w, closest, arrived, walkers };
}

/** A street, a corridor or a square of path on flat ground, with a few houses to have people. */
function ground(build: (b: Parameters<Parameters<typeof townOf>[0]>[0]) => void): TestTown {
  return townOf((b) => {
    for (let i = 0; i < 4; i++) b.house(6 + i * 3, 6, { color: i });
    build(b);
  }, flatTerrain(7));
}

describe('people are solid', () => {
  test('two walkers meeting head on in a corridor one cell wide pass each other, each keeping right', () => {
    const town = ground((b) => {
      b.path(10, 20, 30, 20);
      for (let x = 10; x <= 30; x++) b.put('wall', x, 19).put('wall', x, 21);
    });
    const r = meet(town, [[[10, 20], [30, 20]], [[30, 20], [10, 20]]], 60);
    expect(r.arrived).toEqual([true, true]);
    expect(r.closest).toBeGreaterThanOrEqual(BODY);
    expect(r.o.sustained).toBe(0);
    expect(r.w.problems).toEqual([]);
  });

  test('… and on a street two cells wide, and across an open square', () => {
    const street = ground((b) => b.path(10, 20, 30, 20).path(10, 21, 30, 21));
    const s = meet(street, [[[10, 20], [30, 20]], [[30, 20], [10, 20]]], 60);
    expect(s.arrived).toEqual([true, true]);
    expect(s.closest).toBeGreaterThanOrEqual(BODY);
    const square = ground((b) => b.plaza(12, 16, 26, 26));
    const q = meet(square, [[[12, 21], [26, 21]], [[26, 21], [12, 21]], [[19, 16], [19, 26]], [[19, 26], [19, 16]]], 60);
    expect(q.arrived).toEqual([true, true, true, true]);
    expect(q.o.sustained).toBe(0);
    expect(q.w.problems).toEqual([]);
  });

  test('a faster walker overtakes a slower one on the outside, without walking through them', () => {
    const town = ground((b) => b.path(8, 20, 36, 20).path(8, 21, 36, 21));
    const r = meet(town, [[[11, 20], [36, 20], 0.4], [[8, 20], [35, 20], 0.9]], 90);
    expect(r.arrived).toEqual([true, true]);
    expect(r.closest).toBeGreaterThanOrEqual(BODY - 0.005);
    expect(r.o.sustained).toBe(0);
    // It got there first.
    const [slow, fast] = r.walkers;
    expect(Math.abs(fast!.x - 35.5)).toBeLessThan(0.6);
    expect(slow!.mode).toBe('linger');
  });

  test('somebody standing in the way is walked round, not through', () => {
    const town = ground((b) => b.path(8, 20, 30, 20).path(8, 21, 30, 21));
    const r = meet(town, [[[19, 20], [19, 20]], [[8, 20], [30, 20]]], 60);
    expect(r.arrived[1]).toBe(true);
    expect(r.o.sustained).toBe(0);
  });

  test('a doorway with people going in and coming out: they take turns, nobody overlaps on the doorstep', () => {
    const town = scenarioTown(peopleTown);
    const { o, w, crowd } = day(town, 120, 20);
    // Somebody went through a door both ways in that time, and nobody stood in the doorway in anybody.
    expect(crowd.doors.states.size).toBeGreaterThan(5);
    expect(o.kinds.get('walk/walk opposite') ?? 0).toBeLessThan(6);
    expect(w.problems).toEqual([]);
  });

  test('a day and an evening in the people town: overlaps a fraction of what they were, nobody stuck or off the graph', { timeout: 120_000 }, () => {
    // Seven and a half minutes. Before people were solid: 121 sustained overlaps. Now about 20 to 40, mostly
    // knots at single-file approaches squeezed through as the last resort. The count is chaotic: a
    // nudge to any dial (homeMin + 0.1, speedVary + 0.001, chat × 1.01, measured 2026-11-25 with the
    // bikes, bikes.ts) moves it anywhere from 26 to 40 with or without bikes; 34 as the town is now.
    const { o, w } = day(scenarioTown(peopleTown), 360, 90);
    expect(w.problems).toEqual([]);
    expect(o.sustained).toBeLessThan(45);
  });

  test('… and in the everything town (busier, with knots at its arch passage and carved steps)', { timeout: 120_000 }, () => {
    // Before: 162. Now about 80, mostly squeezes where an arch passage and carved steps (three
    // single-file stretches) meet beside the temple.
    const { o, w } = day(scenarioTown(everything), 360, 90);
    expect(w.problems).toEqual([]);
    expect(o.sustained).toBeLessThan(100);
  });

  test('a dense square: thirty people and more at the market, nobody standing inside anybody', { timeout: 120_000 }, () => {
    const town = townOf((b) => {
      b.plaza(14, 14, 28, 26);
      for (let i = 0; i < 7; i++) {
        b.house(14 + i * 2, 12, { floors: 3, color: i % 6 });
        b.house(14 + i * 2, 27, { floors: 3, color: (i + 2) % 6 });
      }
      for (let i = 0; i < 6; i++) {
        b.house(12, 14 + i * 2, { floors: 3, color: (i + 1) % 6 });
        b.house(29, 14 + i * 2, { floors: 3, color: (i + 3) % 6 });
      }
    }, flatTerrain(9), 9);
    const c = clock(town.world.seed, 'day');
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const o = watchOverlaps(crowd);
    let mostOut = 0;
    let inSquare = 0;
    let standingTogether = 0;
    for (let i = 0; i < 180 * 30; i++) {
      crowd.step(c.tick(STEP), c.time);
      o.check(STEP);
      mostOut = Math.max(mostOut, crowd.people.filter((p) => p.visible).length);
      inSquare = Math.max(inSquare, crowd.people.filter((p) => p.visible && p.x >= 14 && p.x < 29 && p.z >= 14 && p.z < 27).length);
      // Nobody lingering is placed inside anybody else lingering.
      const still = crowd.people.filter((p) => p.mode === 'linger' && p.visible);
      for (let a = 0; a < still.length; a++) for (let b = a + 1; b < still.length; b++) if (Math.hypot(still[a]!.x - still[b]!.x, still[a]!.z - still[b]!.z) < BODY && Math.abs(still[a]!.y - still[b]!.y) < 0.3) standingTogether++;
    }
    expect(inSquare).toBeGreaterThanOrEqual(25);
    expect(standingTogether).toBe(0);
    // Three minutes, 47 in the square at once: before people were solid, 131 sustained overlaps; now ~27.
    expect(o.sustained).toBeLessThan(40);
  });

  test('the same town and the same steps give the same crowd, avoidance and all', () => {
    const town = scenarioTown(peopleTown);
    const a = day(town, 40, 0), b = day(town, 40, 0);
    const pos = (c: Crowd): string => c.people.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`).join(';');
    expect(pos(b.crowd)).toEqual(pos(a.crowd));
    expect(b.o.sustained).toBe(a.o.sustained);
  });

  test('nobody steps off the walkable region: every walker is in a cell of the graph', () => {
    const town = scenarioTown(everything);
    const { crowd } = day(town, 60, 0);
    for (const p of crowd.people) {
      if (!p.visible || p.mode !== 'walk') continue;
      // Stepping through a doorway is crossing the wall between two cells: not a cell of the graph.
      if (p.walk![p.at]!.kind !== 'move') continue;
      expect(crowd.nav!.nodeAt.has(key(Math.floor(p.x), Math.round(p.y / 0.8), Math.floor(p.z))) || crowd.nav!.nodes[p.node] !== undefined).toBe(true);
      expect(Math.floor(p.x)).toBe(keyX(crowd.nav!.nodes[p.node]!.cell));
      expect(Math.floor(p.z)).toBe(keyZ(crowd.nav!.nodes[p.node]!.cell));
    }
  });
});
