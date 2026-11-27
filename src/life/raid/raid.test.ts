// The raid (design section 13b): grown towns raided from the first sight of
// the sail to the last of it, with the app's own wiring and no renderer
// (tests/helpers/turmoil.ts). Waits on the raid's state, never on the clock.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { encodeTown } from '@/world/save';
import { setStyle } from '@/core/style';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { RAID } from '@/style/raid';
import { createTurmoil, type Turmoil } from '../../../tests/helpers/turmoil';
import { FULL } from '../../../tests/helpers/tier';
import { crowdOf } from '../doors/table';
import { raidsOf } from './raids';
import { KINDS } from '@/core/kinds';
import { throwerOf } from '../mischief/thrown.system';
import { crittersOf } from '../mischief/critters';
import type { Raid } from './raid';
import { mapEdge } from '@/rules/life/ship-routes';

// Generous: the gate runs files side by side on a loaded machine (timed out at 200 s with nothing wrong).
const LONG = FULL ? 600_000 : 400_000;

function town(name: string): Turmoil {
  const built = buildScenario(findScenario(name)!);
  const t = createTurmoil({ world: built.world, terrain: built.terrain });
  t.run(3);
  return t;
}

/** Runs until `done` or `most` life seconds, a second at a time. */
function until(t: Turmoil, done: () => boolean, most: number): void {
  for (let s = 0; s < most && !done(); s++) t.run(1);
}

/** Nothing of the raid is left: no raider in the crowd, nobody on its plans, nothing it drew. */
function putAway(t: Turmoil): void {
  const raids = raidsOf(t.stage);
  expect(raids.current).toBeNull();
  const crowd = crowdOf(t.stage)!;
  expect(crowd.people.filter((p) => p.raider && p.mode !== 'gone').map((p) => p.id)).toEqual([]);
  const board = raids.board!;
  expect([...board.plans.values()].filter((p) => p.chain.id === 'raid').length).toBe(0);
  expect(t.mischief.threats.length).toBe(0);
}

/** Every raider ashore stands on the walking graph (never in a solid cell or off it). */
function onGraph(t: Turmoil, raid: Raid): string[] {
  const bad: string[] = [];
  const nav = crowdOf(t.stage)!.nav!;
  for (const r of raid.raiders) {
    const p = r.person;
    if (!p || p.mode === 'gone' || (p.mode as string) === 'thrown' || p.mode === 'visit') continue;
    if (!nav.nodeAt.has(p.cell)) bad.push(`${r.i} at ${p.cell}`);
  }
  return bad;
}

describe('the raid', () => {
  // A shorter stay ashore than a raid's own 95 s (the horn sooner): every beat is still gone through, in less
  // time (this file was over five minutes on its own).
  const ashore = RAID.ashore;
  beforeAll(() => {
    setStyle('raid', 'ashore', 50);
    // The raid itself: the harbour town's castle garrison kept in (sally.test.ts has it turn out).
    setStyle('raid', 'sally', 0);
  });
  afterAll(() => {
    setStyle('raid', 'ashore', ashore);
    setStyle('raid', 'sally', 1);
  });

  test('a landing raid on the harbour town: sighted, ashore, fires and loot, away, everything put away; undo puts the town back', () => {
    const t = town('grown-harbour');
    const before = encodeTown(t.game.world);
    const raids = raidsOf(t.stage);
    expect(raids.summon({ at: null, kind: 'landing' })).toBeNull();
    const raid = raids.current!;
    expect(raid.kind).toBe('landing');
    const beats: string[] = [];
    let ashore = 0, pile = 0, offGraph: string[] = [];
    t.onFrame = () => {
      if (!raids.current) return;
      if (beats[beats.length - 1] !== raid.beat) beats.push(raid.beat);
      ashore = Math.max(ashore, raid.raiders.filter((x) => x.person !== null).length);
      const s = raids.board?.stores.get(raid.piles[0]!.key);
      if (s) pile = Math.max(pile, s.items.filter((x) => x).length);
      if (offGraph.length === 0) offGraph = onGraph(t, raid);
    };
    until(t, () => raids.current === null, 400);
    t.onFrame = null;
    expect(beats).toEqual(['sighted', 'landing', 'ashore', 'recall', 'away', 'done']);
    expect(ashore).toBeGreaterThanOrEqual(8);
    expect(raid.burnt).toBeGreaterThanOrEqual(4);
    // The town fought back: a brawl or more, and a raider or more sent packing.
    console.log('brawls', raid.brawls, 'beaten', raid.beatenCount, 'burnt', raid.burnt, 'quarters', raid.quarters.length);
    expect(raid.brawls).toBeGreaterThan(0);
    expect(pile).toBeGreaterThan(0);
    expect(raid.ship!.heap).toBeGreaterThan(0);
    expect(offGraph).toEqual([]);
    putAway(t);
    // Its damage is ordinary damage, and nothing was added to the saved town: one undo, and it is as before.
    expect([...t.game.world.blocks.values()].some((b) => b.ruin)).toBe(true);
    until(t, () => !t.mischief.active, 200);
    t.game.undo();
    expect(encodeTown(t.game.world)).toBe(before);
    // The villagers come home: nobody is still running from raiders.
    const running = (): number => crowdOf(t.stage)!.people.filter((p) => (p.mode === 'walk' || p.mode === 'linger') && (p.goal?.errand?.tag ?? '').startsWith('flee:')).length;
    until(t, () => running() === 0, 120);
    const still = crowdOf(t.stage)!.people.filter((p) => (p.mode === 'walk' || p.mode === 'linger') && (p.goal?.errand?.tag ?? '').startsWith('flee:'));
    expect(still.length).toBe(0);
  }, LONG);

  test('a raid on a town already wrecked and mending (the owner\'s town): the band keeps moving, never a clump, and the raid ends', () => {
    const t = town('grown-harbour');
    for (const s of t.game.shape.structures.values()) if (KINDS[s.kind as keyof typeof KINDS]?.building) t.mischief.knock(s.cells[0]!);
    until(t, () => !t.mischief.active, 60);
    t.run(15);
    expect([...t.game.world.blocks.values()].filter((b) => b.ruin).length, 'the town is in scaffolding').toBeGreaterThan(20);
    const raids = raidsOf(t.stage);
    expect(raids.summon({ at: null, kind: 'landing' })).toBeNull();
    const raid = raids.current!;
    // Each raider ashore: where he was and since when he has not moved.
    const still = new Map<number, { x: number; z: number; since: number }>();
    let worst = 0, worstAt = '';
    t.onFrame = () => {
      if (!raids.current || raid.beat !== 'ashore') return;
      let n = 0;
      for (const r of raid.raiders) {
        const p = r.person;
        if (!p || r.role === 'chief' || p.scuffle || (p.mode as string) === 'thrown' || p.mode === 'visit' || (p.goal?.errand?.tag ?? '') === 'raid:board') {
          still.delete(r.i);
          continue;
        }
        const s = still.get(r.i);
        if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 0.08) still.set(r.i, { x: p.x, z: p.z, since: t.t });
        else if (t.t - s.since > 4) n++;
      }
      if (n > worst) {
        worst = n;
        worstAt = `${Math.round(raid.age)} s`;
      }
    };
    until(t, () => raids.current === null, 400);
    t.onFrame = null;
    expect(raids.current, 'the raid ended').toBeNull();
    expect(worst, `raiders standing still more than 4 s at once (worst at ${worstAt})`).toBeLessThanOrEqual(3);
    expect(raid.burnt + raid.raiders.reduce((a, r) => a + r.trips, 0), 'they found things to burn and carry off').toBeGreaterThan(5);
    putAway(t);
  }, LONG);

  test('at sea, whoever is aboard moves rigidly with the vessel every frame (no judder against the hull)', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'boats' });
    const raid = raids.current!;
    // In each vessel's own frame, how far each seated raider's feet move from one frame to the next.
    const last = new Map<number, [number, number, number]>();
    let worst = 0, frames = 0;
    t.onFrame = () => {
      for (const r of raid.raiders) {
        if (r.where !== 'aboard' || !r.fig) continue;
        const v = raid.vesselOf(r), m = v.m;
        const dx = r.fig.at[0] - m[12]!, dy = r.fig.at[1] - m[13]!, dz = r.fig.at[2] - m[14]!;
        // Into the hull's frame (its axes are orthonormal: the transpose undoes them).
        const local: [number, number, number] = [m[0]! * dx + m[1]! * dy + m[2]! * dz, m[4]! * dx + m[5]! * dy + m[6]! * dz, m[8]! * dx + m[9]! * dy + m[10]! * dz];
        const was = last.get(r.i);
        // (The first frame of all has no drawing before it.)
        if (was && frames > 1) worst = Math.max(worst, Math.hypot(local[0] - was[0], local[1] - was[1], local[2] - was[2]));
        last.set(r.i, local);
      }
      frames++;
    };
    until(t, () => raid.beat !== 'sighted', 60);
    t.onFrame = null;
    expect(frames).toBeGreaterThan(100);
    expect(worst, 'a rower slid against the hull in one frame (world units)').toBeLessThan(0.005);
    t.mischief.cancel();
  }, LONG);

  test('a boats raid: no ship, only rowing boats in from beyond the edge, each to its own landing, and away over the edge with the band and the loot', () => {
    const t = town('grown-market');
    const raids = raidsOf(t.stage);
    expect(raids.summon({ at: null, kind: 'boats' })).toBeNull();
    const raid = raids.current!;
    expect(raid.kind).toBe('boats');
    expect(raid.ship, 'no longship in a boats raid').toBeNull();
    expect(raid.boats.length).toBeGreaterThanOrEqual(2);
    expect(raid.boats.length).toBeLessThanOrEqual(4);
    expect(new Set(raid.site.landings.map((l) => l.cell)).size).toBe(raid.boats.length);
    // Every boat starts beyond the edge of the map, out of sight.
    for (const b of raid.boats) expect(mapEdge(b.x, b.z), 'starts beyond the edge').toBeGreaterThan(0);
    const beats: string[] = [];
    const states = raid.boats.map(() => new Set<string>());
    let ashore = 0, heap = 0;
    const waited = raid.boats.map(() => ({ x: NaN, z: NaN }));
    t.onFrame = () => {
      if (!raids.current) return;
      if (beats[beats.length - 1] !== raid.beat) beats.push(raid.beat);
      ashore = Math.max(ashore, raid.raiders.filter((x) => x.person !== null).length);
      heap = Math.max(heap, raid.boats.reduce((a, b) => a + b.heap, 0));
      raid.boats.forEach((b, i) => {
        states[i]!.add(raid.boatState[i]!);
        if (raid.boatState[i] === 'wait') waited[i] = { x: b.x, z: b.z };
      });
    };
    until(t, () => raids.current === null, 420);
    t.onFrame = null;
    expect(beats).toEqual(['sighted', 'landing', 'ashore', 'recall', 'away', 'done']);
    expect(ashore).toBeGreaterThanOrEqual(6);
    expect(heap, 'loot carried off in the boats').toBeGreaterThan(0);
    raid.boats.forEach((b, i) => {
      // Each in, waiting at its own landing (beside it, in the shallows), out and over the edge.
      expect([...states[i]!]).toEqual(['row-in', 'wait', 'row-out', 'gone']);
      const l = raid.site.landings[i]!;
      expect(Math.hypot(waited[i]!.x - l.x, waited[i]!.z - l.z), `boat ${i} waits at its landing`).toBeLessThan(1.6);
      expect(mapEdge(b.x, b.z), `boat ${i} left over the edge`).toBeGreaterThan(0);
    });
    expect(raid.raiders.every((r) => r.where === 'home' || r.where === 'lost')).toBe(true);
    putAway(t);
  }, LONG);

  test('a boats raid: a boat sunk while its crew are ashore, they go home in another; the last sunk, the band is stranded and swims for it', () => {
    const t = town('grown-market');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'boats' });
    const raid = raids.current!;
    until(t, () => raid.beat === 'ashore' && raid.t > 12 && raid.boatState.every((s) => s === 'wait'), 150);
    expect(raid.boatState.every((s) => s === 'wait')).toBe(true);
    const first = raid.boats[0]!;
    raid.hit(first.x, first.z, 0.5, 1, 1.5);
    t.run(1);
    expect(raid.boatState[0]).toBe('sunk');
    expect(raid.stranded, 'other boats still there').toBe(false);
    // Nobody ashore still belongs to the sunk boat: they will go home in another.
    expect(raid.raiders.filter((r) => r.vessel === 1 && (r.where === 'ashore' || r.where === 'wade-in' || r.where === 'jump')).length).toBe(0);
    // Now all the rest.
    raid.boats.forEach((b, i) => {
      if (i > 0) raid.hit(b.x, b.z, 0.5, 1, 1.5);
    });
    t.run(1);
    expect(raid.boatState.every((s) => s === 'sunk')).toBe(true);
    expect(raid.stranded).toBe(true);
    until(t, () => raids.current === null, 300);
    expect(raids.current).toBeNull();
    expect(raid.raiders.every((r) => r.where === 'lost')).toBe(true);
    putAway(t);
  }, LONG);

  test('a boats raid: every boat sunk before it lands, nobody comes ashore', () => {
    const t = town('grown-market');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'boats' });
    const raid = raids.current!;
    // Each one hit as soon as it is in from beyond the edge.
    t.onFrame = () => {
      raid.boats.forEach((b, i) => {
        if (raid.boatState[i] === 'row-in' && mapEdge(b.x, b.z) < -1) raid.hit(b.x, b.z, 0.5, 1, 1.5);
      });
    };
    until(t, () => raid.stranded, 120);
    t.onFrame = null;
    expect(raid.stranded).toBe(true);
    expect(raid.beat === 'sighted' || raid.beat === 'landing' || raid.beat === 'away').toBe(true);
    until(t, () => raids.current === null, 200);
    expect(raid.raiders.every((r) => r.person === null && r.where === 'lost')).toBe(true);
    putAway(t);
  }, LONG);

  test('the Hand: a rowing boat lifted with its crew and dropped on the land is out of the raid; its crew sit in it', () => {
    const t = town('grown-market');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'boats' });
    const raid = raids.current!;
    const boat = raid.boats[0]!;
    until(t, () => raid.boatState[0] === 'row-in' && mapEdge(boat.x, boat.z) < -1.5, 90);
    const c = crittersOf(t.stage).get(`ship:raid${raid.n}-1`)!;
    expect(c, 'a rowing boat can be picked up').toBeDefined();
    const thrower = throwerOf(t.stage)!;
    expect(thrower.grabCritter(c)).toBe(true);
    const h = raid.site.heart;
    const x0 = boat.x, z0 = boat.z;
    for (let i = 0; i < 30; i++) {
      thrower.carryCritter(c, x0 + (h.x - x0) * (i / 30), 3, z0 + (h.z - z0) * (i / 30));
      t.run(1 / 30);
    }
    expect(boat.held, 'held up out of the water').not.toBeNull();
    expect(raid.raiders.filter((r) => r.vessel === 1 && r.where === 'aboard').length, 'the crew hang on').toBeGreaterThan(1);
    thrower.flingCritter(c, 0, 0, 0);
    for (let i = 0; i < 20 && boat.aground === null; i++) t.run(1);
    expect(boat.aground).not.toBeNull();
    expect(raid.boatState[0]).toBe('sunk');
    until(t, () => raids.current === null, 400);
    putAway(t);
  }, LONG);

  test('the ship sunk before it lands: the raid never happens; nobody comes ashore', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    const raid = raids.current!;
    until(t, () => !raid.ship!.edgeCut && raid.shipState === 'arrive', 60);
    t.run(2);
    t.mischief.dropBomb([raid.ship!.x, 0.5, raid.ship!.z]);
    until(t, () => raids.current === null, 200);
    expect(raid.raiders.every((r) => r.person === null)).toBe(true);
    expect(raid.raiders.every((r) => r.where === 'lost')).toBe(true);
    putAway(t);
  }, LONG);

  test('the ship sunk while the band is ashore: stranded, they run into the sea and swim away', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    const raid = raids.current!;
    until(t, () => raid.beat === 'ashore' && raid.t > 15, 120);
    t.mischief.dropBomb([raid.ship!.x, 0.5, raid.ship!.z]);
    until(t, () => raid.stranded, 10);
    expect(raid.stranded).toBe(true);
    until(t, () => raids.current === null, 300);
    expect(raid.raiders.every((r) => r.where === 'lost')).toBe(true);
    putAway(t);
  }, LONG);

  test('the Hand: the longship lifted out of the water with its crew aboard and dropped on the town: stranded, the raid ends', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    const raid = raids.current!;
    until(t, () => raid.shipState === 'spin' || raid.shipState === 'in', 90);
    const thrower = throwerOf(t.stage)!;
    const c = crittersOf(t.stage).get(`ship:raid${raid.n}-0`)!;
    expect(c, 'the longship can be picked up').toBeDefined();
    expect(thrower.grabCritter(c)).toBe(true);
    const h = raid.site.heart;
    const ship = raid.ship!;
    for (let i = 0; i < 30; i++) {
      thrower.carryCritter(c, ship.x + (h.x - ship.x) * (i / 30), 3, ship.z + (h.z - ship.z) * (i / 30));
      t.run(1 / 30);
    }
    expect(ship.held, 'held up out of the water').not.toBeNull();
    expect(raid.raiders.filter((r) => r.where === 'aboard').length, 'the crew hang on').toBeGreaterThan(4);
    thrower.flingCritter(c, 0, 0, 0);
    for (let i = 0; i < 20 && ship.aground === null; i++) {
      t.run(1);
    }
    expect(raid.stranded).toBe(true);
    until(t, () => raids.current === null, 200);
    putAway(t);
  }, LONG);

  test('undo in the middle of a raid ends it at once, and the town is as it was', () => {
    const t = town('grown-harbour');
    const before = encodeTown(t.game.world);
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    const raid = raids.current!;
    until(t, () => raid.burnt >= 1, 150);
    expect(t.mischief.active).toBe(true);
    t.mischief.cancel();
    t.run(1);
    putAway(t);
    expect(encodeTown(t.game.world)).toBe(before);
  }, LONG);

  test('raids on their own: none with the switch off; one, in time, with it on', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    const first = RAID.first;
    setStyle('raid', 'first', 5);
    try {
      raids.auto = false;
      t.run(30);
      expect(raids.count).toBe(0);
      raids.auto = true;
      until(t, () => raids.count > 0, 120);
      expect(raids.count).toBe(1);
      raids.auto = false;
      t.mischief.cancel();
      t.run(1);
      putAway(t);
    } finally {
      setStyle('raid', 'first', first);
    }
  }, LONG);
});
