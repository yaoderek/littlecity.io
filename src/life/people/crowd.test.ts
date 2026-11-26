// The crowd, stepped with fixed time steps and watched (testing.ts): people
// stay on the walking graph, go where they set out for, go home at dusk, and
// cope with the town changing under them.

import { describe, expect, test } from 'vitest';
import { E, key, keyX, keyY, keyZ, N } from '@/core/grid';
import { usableDoors } from '@/resolve/nav';
import { flatTerrain, TerrainBuilder, TownBuilder } from '@/scenario';
import { PEOPLE } from '@/style/people';
import { emptyWorld } from '@/world/world';
import bench from '../../../scenarios/bench/bench-2000.scenario';
import peopleTown from '../../../scenarios/people/people-town.scenario';
import jobsTown from '../../../scenarios/rules/L23.jobs.scenario';
import childrenTown from '../../../scenarios/rules/L28.children.scenario';
import { createCrowd } from './crowd';
import { clock, resolved, run, scenarioTown, townOf, watch } from './testing';
import { FULL } from '../../../tests/helpers/tier';

describe('a day in the town', () => {
  const town = scenarioTown(peopleTown);

  test('three minutes of a day: nobody leaves the graph, walks backwards or gets stuck', () => {
    const { crowd, watch: w } = run(town, 180);
    expect(w.problems).toEqual([]);
    expect(crowd.people.length).toBeGreaterThan(20);
    expect(w.arrivals).toBeGreaterThan(60);
    expect(w.mostOut).toBeGreaterThan(crowd.people.length * 0.4);
    // They face the way they walk, but for the moment of turning a corner.
    expect(w.facing / w.moving).toBeGreaterThan(0.97);
  });

  test('they go to what the town has: the square, the shops, the pier, the gardens, the viewpoint, each other', () => {
    const { watch: w } = run(town, 420);
    expect(w.problems).toEqual([]);
    for (const type of ['home', 'haunt-square', 'haunt-shop', 'haunt-pier', 'haunt-garden', 'haunt-fountain', 'haunt-viewpoint', 'haunt-visit']) {
      expect(w.byHaunt.get(type) ?? 0, type).toBeGreaterThan(0);
    }
  });

  test('the same town and the same steps give the same walks', () => {
    const a = run(town, 40).crowd, b = run(town, 40).crowd;
    expect(b.people.map((p) => [p.id, p.mode, p.x, p.y, p.z, p.heading])).toEqual(a.people.map((p) => [p.id, p.mode, p.x, p.y, p.z, p.heading]));
  });

  test('the town is already about its day when first seen, and everybody is accounted for', () => {
    const c = clock(1);
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const out = crowd.people.filter((p) => p.visible).length;
    expect(out).toBeGreaterThan(crowd.people.length * 0.3);
    const home = crowd.people.filter((p) => p.mode === 'home').length;
    expect([...crowd.atHome.values()].reduce((a, b) => a + b, 0)).toBe(home);
    for (const p of crowd.people) if (p.mode === 'home') expect(crowd.atHome.get(p.home)).toBeGreaterThan(0);
  });

  test('at dusk everyone walks home; at night at most a tenth are out (L25)', () => {
    const c = clock(town.world.seed, 'day');
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd);
    const step = (seconds: number): void => {
      for (let i = 0; i < seconds * 30; i++) {
        crowd.step(c.tick(1 / 30), c.time);
        w.check();
      }
    };
    step(30);
    const outByDay = crowd.people.filter((p) => p.mode !== 'home').length;
    expect(outByDay).toBeGreaterThan(crowd.people.length * 0.3);
    c.hold('dusk');
    step(100);
    const owls = Math.floor(crowd.people.length * PEOPLE.nightOut);
    // Those whose work is the evening itself (the lamplighter on the round) are not idlers.
    const idle = (p: (typeof crowd.people)[number]): boolean => p.mode !== 'home' && p.work?.job !== 'lamplighter' && p.work?.job !== 'keeper';
    expect(crowd.people.filter(idle).length).toBeLessThanOrEqual(owls);
    c.hold('night');
    step(120);
    // By now the round is done too, and its walker indoors.
    expect(crowd.people.filter((p) => p.mode !== 'home' && p.work?.job !== 'keeper').length).toBeLessThanOrEqual(owls);
    for (const j of crowd.jobs) if (j.job === 'lamplighter' && j.worker) expect(j.worker.round).toBe(j.stations.length);
    expect(w.problems).toEqual([]);
    // The census the window lights read agrees.
    const home = crowd.people.filter((p) => p.mode === 'home').length;
    expect([...crowd.atHome.values()].reduce((a, b) => a + b, 0)).toBe(home);
    // By day they come out again.
    c.hold('day');
    step(60);
    expect(crowd.people.filter((p) => p.mode !== 'home').length).toBeGreaterThan(crowd.people.length * 0.3);
    expect(w.problems).toEqual([]);
  });

  test('the cap: a phone-sized town walks the first thirty, in seq order (L21)', () => {
    const big = townOf((b) => {
      for (let i = 0; i < 14; i++) b.house(6 + (i % 7) * 4, 10 + Math.floor(i / 7) * 6, { floors: 3, w: 2 });
      b.path(5, 13, 34, 13);
      b.path(5, 19, 34, 19);
    });
    const residents = big.dressing.actors.filter((a) => a.type === 'resident');
    expect(residents).toHaveLength(42);
    const phone = createCrowd({ cap: 30 });
    phone.sync(big.shape, big.dressing, clock().time);
    expect(phone.people.map((p) => p.id)).toEqual(residents.slice(0, 30).map((a) => a.id));
  });
});

describe('the big town', () => {
  test('sixty people on the 2,000-block town: nobody leaves the graph, and a step costs a fraction of a millisecond', () => {
    const town = scenarioTown(bench);
    // The first houses of this town stand at the water's edge with their doors over the sea: their people
    // are indoors for good and do not count toward the cap.
    const residents = town.dressing.actors.filter((a) => a.type === 'resident');
    expect(residents.filter((a) => a.variant !== 'indoors')).toHaveLength(PEOPLE.cap);
    // (Fewer since FX-12 made the two-storey 2 × 2 houses there homes rather than boathouses: 10 now.)
    expect(residents.filter((a) => a.variant === 'indoors').length).toBeGreaterThan(5);
    const c = clock(town.world.seed);
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd);
    for (let i = 0; i < 300; i++) crowd.step(c.tick(1 / 30), c.time); // warm up
    let worst = 0;
    const t0 = performance.now();
    const steps = 30 * 120;
    for (let i = 0; i < steps; i++) {
      const a = performance.now();
      crowd.step(c.tick(1 / 30), c.time);
      worst = Math.max(worst, performance.now() - a);
      w.check();
    }
    const mean = (performance.now() - t0) / steps; // includes the watcher
    expect(w.problems).toEqual([]);
    expect(w.arrivals).toBeGreaterThan(100);
    expect(w.mostOut).toBeGreaterThan(30);
    expect(crowd.people.filter((p) => p.shutIn).every((p) => p.mode === 'home' && !p.visible)).toBe(true);
    // About 0.03 ms a step (0.5 ms at worst) on the machine this was written on. Only the mean is
    // asserted, loosely: under a busy test run a single step can be held up by anything. A frame is 16.7 ms.
    // A wall-clock budget, so only in the full run (LC_FULL=1): in the gate a busy machine failed it with
    // nothing wrong (docs/swarm/test-diet.md).
    if (FULL) expect(mean).toBeLessThan(1.5);
    console.info(`crowd on bench-2000: ${crowd.people.length} people, mean ${mean.toFixed(3)} ms a step, worst ${worst.toFixed(2)} ms, ${crowd.router!.stats.searches} searches, ${crowd.router!.stats.hits} cache hits`);
  });
});

describe('routes people take', () => {
  test('a house on a marble terrace: its people use the stairs, one way at a time', () => {
    const town = townOf((b) => {
      b.fill('marble', 10, 10, 13, 12);
      b.block('house', 11, 2, 10, { color: 1 }).block('house', 12, 2, 10, { color: 1 }).block('house', 11, 3, 10, { color: 1 }).block('house', 12, 3, 10, { color: 1 });
      b.block('stairs', 11, 1, 13, { rot: N });
      b.plaza(9, 15, 14, 18);
      b.path(11, 14, 11, 14);
      b.house(16, 15, { floors: 2, w: 2, color: 2 });
    });
    const { crowd, watch: w } = run(town, 0);
    const stair = town.nav.nodeAt.get(key(11, 1, 13))!;
    let onStairs = 0;
    const c = clock();
    for (let i = 0; i < 30 * 400; i++) {
      crowd.step(c.tick(1 / 30), c.time);
      w.check();
      const there = crowd.people.filter((p) => p.visible && p.mode === 'walk' && p.node === stair);
      if (there.length > 0) onStairs++;
      // On the flight together only if going the same way.
      if (there.length > 1) {
        const up = there.map((p) => Math.cos(p.heading) < 0);
        expect(new Set(up).size).toBe(1);
      }
    }
    expect(w.problems).toEqual([]);
    expect(onStairs).toBeGreaterThan(30);
  });

  test('a sky bridge and a roof garden: reached through the houses, hidden on the way', () => {
    const town = townOf((b) => {
      b.house(10, 11, { floors: 3, d: 2, color: 1 });
      b.house(14, 11, { floors: 3, d: 2, color: 2 });
      for (let x = 11; x <= 13; x++) b.block('arch', x, 2, 12);
      b.house(18, 11, { w: 2, d: 2, color: 3 });
      b.garden(18, 11, 19, 12);
      b.plaza(10, 14, 19, 16);
    });
    expect(town.dressing.sockets.some((s) => s.type === 'haunt-garden' && keyY(s.cell) === 2)).toBe(true);
    const { crowd, watch: w } = run(town, 600);
    expect(w.problems).toEqual([]);
    expect(w.byHaunt.get('haunt-garden') ?? 0).toBeGreaterThan(0);
    void crowd;
  });

  test('a fenced garden: nobody ever stands in it without a gate; with a gate they come and go through it', () => {
    const fenced = (gate: boolean) =>
      townOf((b) => {
        b.garden(10, 10, 12, 12);
        b.fenceAround(10, 10, 12, 12);
        b.house(15, 10, { floors: 2, w: 2 });
        b.house(15, 14, { floors: 2, w: 2 });
        b.plaza(13, 12, 14, 13);
        if (gate) b.path(12, 11, 13, 11);
      });
    const inGarden = (x: number, z: number): boolean => x > 10 && x < 13 && z > 10 && z < 13;
    for (const gate of [false, true]) {
      const town = fenced(gate);
      const c = clock();
      const crowd = createCrowd();
      crowd.sync(town.shape, town.dressing, c.time);
      const w = watch(crowd);
      let inside = 0;
      const gateCell = [town.nav.nodeAt.get(key(12, 1, 11))!, town.nav.nodeAt.get(key(13, 1, 11))!];
      for (let i = 0; i < 30 * 300; i++) {
        crowd.step(c.tick(1 / 30), c.time);
        w.check();
        for (const p of crowd.people) {
          if (!p.visible || !inGarden(p.x, p.z)) continue;
          inside++;
          // Whoever is inside came in by the gate: they are in a garden cell of the graph, which only the gate links.
          expect(gate).toBe(true);
        }
      }
      expect(w.problems).toEqual([]);
      if (gate) expect(inside).toBeGreaterThan(0);
      else expect(inside).toBe(0);
      void gateCell;
    }
  });

  test('a town with no route out: the household stays within two cells of its door (L32)', () => {
    const t = new TerrainBuilder(7);
    t.flat(1);
    t.rect(20, 20, 24, 24, 3); // a mesa with no way down
    const b = new TownBuilder(emptyWorld(7), t.build());
    b.house(22, 22, { floors: 2 });
    b.plaza(8, 8, 12, 12);
    b.house(9, 13, { floors: 2 });
    const town = resolved(b.world, b.terrain);
    const mesa = town.shape.structureAt.get(key(22, 3, 22))!;
    const door = usableDoors(town.nav, mesa)[0]!;
    expect(town.dressing.sockets.filter((s) => s.type === 'haunt-stoop' && s.structure === mesa).length).toBeGreaterThan(1);
    const { crowd, watch: w } = run(town, 300);
    expect(w.problems).toEqual([]);
    const cell = town.nav.nodes[door.node]!.cell;
    const stranded = crowd.people.filter((p) => p.home === mesa);
    expect(stranded.length).toBeGreaterThan(0);
    expect(w.byHaunt.get('haunt-stoop') ?? 0).toBeGreaterThan(0);
    for (const p of stranded) {
      if (p.mode === 'home') continue;
      expect(Math.abs(keyX(p.cell) - keyX(cell)) + Math.abs(keyZ(p.cell) - keyZ(cell))).toBeLessThanOrEqual(PEOPLE.strandedReach);
    }
  });

  test('a house whose door opens onto nothing keeps its people in', () => {
    const t = new TerrainBuilder(7);
    t.flat(1);
    t.rect(20, 20, 20, 20, 3);
    const b = new TownBuilder(emptyWorld(7), t.build());
    b.block('house', 20, 3, 20);
    const town = resolved(b.world, b.terrain);
    const { crowd, watch: w } = run(town, 60);
    expect(crowd.people).toHaveLength(1);
    expect(town.dressing.actors.find((a) => a.type === 'resident')!.variant).toBe('indoors');
    expect(crowd.people[0]!.shutIn).toBe(true);
    expect(crowd.atHome.get(crowd.people[0]!.home)).toBe(1);
    expect(crowd.people[0]!.mode).toBe('home');
    expect(crowd.people[0]!.visible).toBe(false);
    expect(w.mostOut).toBe(0);
  });
});

describe('jobs (L23) and the lamplighter (L08)', () => {
  const town = scenarioTown(jobsTown);
  const start = (part: 'day' | 'dusk' = 'day') => {
    const c = clock(town.world.seed, part);
    const lamps: string[] = [];
    const bells: number[] = [];
    const crowd = createCrowd({ events: { lamp: (id) => void lamps.push(id), bell: (s) => void bells.push(s) } });
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd);
    const step = (seconds: number): void => {
      for (let i = 0; i < seconds * 30; i++) {
        crowd.step(c.tick(1 / 30), c.time);
        w.check();
      }
    };
    return { c, crowd, w, step, lamps, bells };
  };

  test('every job goes to one grown-up resident, and nobody has two', () => {
    const { crowd } = start();
    const kinds = ['baker', 'bell-ringer', 'fisher', 'gardener', 'guard', 'keeper', 'lamplighter', 'miller', 'shopkeeper', 'vendor'];
    expect([...new Set(crowd.jobs.map((j) => j.job))].sort()).toEqual(kinds);
    for (const kind of kinds) expect(crowd.jobs.some((j) => j.job === kind && j.worker !== null), kind).toBe(true);
    const workers = crowd.jobs.map((j) => j.worker).filter((p) => p !== null);
    expect(workers.length).toBeGreaterThanOrEqual(12);
    expect(workers.every((p) => !p.child && !p.shutIn)).toBe(true);
    expect(new Set(workers).size).toBe(workers.length);
    // A shopkeeper lives over the shop.
    for (const j of crowd.jobs) if ((j.job === 'shopkeeper' || j.job === 'baker') && j.worker) expect(j.worker.home).toBe(j.structure);
  });

  test('a working day: people are at their stations, the guard is up on the keep, the miller goes to and fro', () => {
    const { crowd, w, step } = start();
    const guard = crowd.jobs.find((j) => j.job === 'guard')!.worker!;
    const miller = crowd.jobs.find((j) => j.job === 'miller')!.worker!;
    let onKeep = 0, carrying = 0;
    for (let i = 0; i < 300; i++) {
      step(1);
      if (guard.visible && keyY(guard.cell) === 4) onKeep++;
      if (miller.carrying && miller.visible) carrying++;
    }
    expect(w.problems).toEqual([]);
    expect(w.byHaunt.get('workplace') ?? 0).toBeGreaterThan(30);
    expect(onKeep).toBeGreaterThan(60);
    expect(carrying).toBeGreaterThan(10);
  });

  test('at dusk the lamplighter walks to every lamp in order, the bell is rung, and the keeper goes up for the night', () => {
    const { c, crowd, w, step, lamps, bells } = start();
    step(20);
    expect(lamps).toEqual([]);
    c.hold('dusk');
    step(150);
    const round = crowd.jobs.find((j) => j.job === 'lamplighter')!;
    expect(lamps).toEqual(round.refs);
    expect(lamps.length).toBeGreaterThan(3);
    expect(lamps.length).toBeLessThanOrEqual(PEOPLE.lampRound);
    expect(bells).toEqual([crowd.jobs.find((j) => j.job === 'bell-ringer')!.structure]);
    c.hold('night');
    step(60);
    const keeper = crowd.jobs.find((j) => j.job === 'keeper')!;
    expect(keeper.worker!.mode).toBe('visit');
    expect(keeper.worker!.inside!.structure).toBe(keeper.structure);
    // Everybody else is in (this town has no night owls: a tenth of 19 is one, and they have nowhere to go but the pier).
    expect(crowd.people.filter((p) => p.visible).length).toBeLessThanOrEqual(1);
    expect(w.problems).toEqual([]);
    // Day again: the keeper comes down, and tomorrow's round starts afresh.
    c.hold('day');
    step(30);
    expect(keeper.worker!.mode).not.toBe('visit');
    expect(round.worker!.round).toBe(0);
  });
});

describe('reactions (L26)', () => {
  const town = scenarioTown(peopleTown);

  test('a block lands on the square: those within four cells stop and look, some of them hop, the rest of the town carries on', () => {
    const { crowd, clock: c } = run(town, 25);
    // Where the most people are.
    const out = crowd.people.filter((p) => p.visible && (p.mode === 'walk' || p.mode === 'linger'));
    const around = (x: number, z: number) => out.filter((p) => Math.abs(p.x - x) + Math.abs(p.z - z) <= PEOPLE.lookReach - 0.5);
    const centre = [...out].sort((a, b) => around(b.x, b.z).length - around(a.x, a.z).length)[0]!;
    const cx = Math.floor(centre.x) + 0.5, cz = Math.floor(centre.z) + 0.5;
    const at = key(Math.floor(centre.x), 1, Math.floor(centre.z));
    // (Somebody riding a bike rides on: bikes.ts.)
    const near = around(cx, cz).filter((p) => (p.mode !== 'walk' || p.walk![p.at]!.kind === 'move') && !crowd.bikes.mounted(p));
    const far = crowd.people.filter((p) => p.visible && p.mode === 'walk' && Math.abs(p.x - cx) + Math.abs(p.z - cz) > PEOPLE.lookReach + 1);
    expect(near.length).toBeGreaterThan(4);
    expect(far.length).toBeGreaterThan(3);
    crowd.blockLanded(at);
    expect(near.every((p) => p.startled > 0)).toBe(true);
    expect(far.every((p) => p.startled === 0)).toBe(true);
    const hopped = new Set<string>();
    let highest = 0;
    for (let i = 0; i < 30 * 4; i++) {
      crowd.step(c.tick(1 / 30), c.time);
      for (const p of near) {
        if (p.lift > 0) hopped.add(p.id);
        highest = Math.max(highest, p.lift);
        if (p.jump > 0) expect(p.react).toBe('hop');
      }
    }
    // A seeded third of them, more or less.
    expect(hopped.size).toBeGreaterThan(0);
    expect(hopped.size).toBeLessThan(near.length);
    expect(highest).toBeGreaterThan(0.08);
    expect(near.every((p) => p.lift === 0 && p.startled <= 0)).toBe(true);
  });

  test('two people meeting sometimes stop for a chat: both stand, face each other and take turns under the bubble', () => {
    const c = clock(town.world.seed);
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd, { maxStuck: 8 });
    let chats = 0, bubbles = 0;
    const talkers = new Set<string>();
    for (let i = 0; i < 30 * 400; i++) {
      crowd.step(c.tick(1 / 30), c.time);
      w.check();
      for (const p of crowd.people) {
        if (p.chat <= 0) continue;
        chats++;
        const q = p.chatWith!;
        expect(p.react).toBe('chat');
        // One bubble between the two of them at a time.
        if (q.chat > 0) expect(p.bubble).toBe(!q.bubble);
        if (p.bubble) {
          bubbles++;
          talkers.add(p.id);
        }
      }
    }
    expect(w.problems).toEqual([]);
    expect(chats).toBeGreaterThan(100);
    expect(bubbles).toBeGreaterThan(50);
    expect(talkers.size).toBeGreaterThan(1);
  });
});

describe('children (L28)', () => {
  const town = scenarioTown(childrenTown);
  const play = (strength: number) => {
    const c = clock(town.world.seed);
    const crowd = createCrowd({ wind: () => ({ dirX: 1, dirZ: 0, strength }) });
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd);
    let flying = 0, facing = 0;
    const fliers = new Set<string>();
    for (let i = 0; i < 30 * 300; i++) {
      crowd.step(c.tick(1 / 30), c.time);
      w.check();
      for (const p of crowd.people) {
        if (!p.flying) continue;
        flying++;
        fliers.add(p.id);
        expect(p.child && p.mode === 'linger' && p.goal?.haunt?.name === 'kite').toBe(true);
        if (Math.sin(p.heading) > 0.9) facing++; // downwind is east
      }
    }
    return { crowd, w, flying, facing, fliers };
  };

  test('children run, play where the grown-ups do not, and fly kites when the wind is up', () => {
    const { crowd, w, flying, facing, fliers } = play(0.6);
    expect(w.problems).toEqual([]);
    const children = crowd.people.filter((p) => p.child);
    expect(children.length).toBeGreaterThan(1);
    expect(children.every((p) => p.speed > PEOPLE.speed * 1.2)).toBe(true);
    // Two children, five minutes (fewer than before people were solid: they wait for each other now).
    expect(w.byHaunt.get('haunt-play') ?? 0).toBeGreaterThanOrEqual(4);
    expect(crowd.haunts.filter((h) => h.type === 'haunt-play' && h.user).every((h) => h.user!.child)).toBe(true);
    expect(flying).toBeGreaterThan(300);
    expect(fliers.size).toBeGreaterThan(0);
    // Once turned, they watch the kite.
    expect(facing / flying).toBeGreaterThan(0.8);
  });

  test('with no wind they still play, but no kite goes up', () => {
    const { w, flying } = play(0.1);
    expect(w.problems).toEqual([]);
    expect(flying).toBe(0);
    expect(w.byHaunt.get('haunt-play') ?? 0).toBeGreaterThanOrEqual(2); // two children, five minutes, mostly after the pigeons (fewer now people wait for each other)
  });
});

describe('the town changes (L27)', () => {
  const base = (b: TownBuilder): void => {
    b.plaza(10, 10, 15, 14);
    b.path(8, 15, 20, 15);
    b.house(9, 16, { floors: 2, w: 2, color: 1 });
    b.house(13, 16, { floors: 2, w: 2, color: 2 });
    b.house(17, 16, { floors: 2, w: 2, color: 3 });
    for (let x = 3; x >= 1; x--) b.block('dock', x, 0, 15);
    b.path(4, 15, 7, 15);
  };
  const start = () => {
    const b = new TownBuilder(emptyWorld(7), flatTerrain(7));
    base(b);
    const town = resolved(b.world, b.terrain);
    const c = clock();
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    const w = watch(crowd);
    const step = (seconds: number): void => {
      for (let i = 0; i < seconds * 30; i++) {
        crowd.step(c.tick(1 / 30), c.time);
        w.check();
      }
    };
    const edit = (fn: (b: TownBuilder) => void) => {
      fn(b);
      const next = resolved(b.world, b.terrain);
      crowd.sync(next.shape, next.dressing, c.time);
      return next;
    };
    return { b, crowd, w, step, edit, c };
  };

  test('somebody built over hops to the nearest walkable cell and carries on', () => {
    const { crowd, w, step, edit } = start();
    const lingering = () => crowd.people.find((p) => p.visible && p.mode === 'linger' && p.goal?.haunt?.type === 'haunt-square');
    for (let i = 0; i < 200 && !lingering(); i++) step(1);
    const victim = lingering()!;
    expect(victim).toBeDefined();
    const x = keyX(victim.cell), z = keyZ(victim.cell);
    const next = edit((b) => b.put('marble', x, z));
    expect(victim.mode).toBe('hop');
    expect(next.nav.nodeAt.has(victim.cell)).toBe(true);
    expect(victim.cell).not.toBe(key(x, 1, z));
    step(2);
    expect(victim.mode).not.toBe('hop');
    step(60);
    expect(w.problems).toEqual([]);
  });

  test('an unrelated edit does not stop anybody', () => {
    const { crowd, w, step, edit } = start();
    step(15);
    const walking = crowd.people.filter((p) => p.mode === 'walk' && p.visible);
    expect(walking.length).toBeGreaterThan(0);
    const before = walking.map((p) => [p.x, p.z]);
    edit((b) => b.put('tree', 30, 30));
    expect(walking.every((p) => p.mode === 'walk')).toBe(true);
    expect(walking.map((p) => [p.x, p.z])).toEqual(before);
    step(30);
    expect(w.problems).toEqual([]);
  });

  test('a new home fills with people arriving on foot from the dock', () => {
    const { crowd, w, step, edit } = start();
    step(5);
    const before = crowd.people.length;
    const next = edit((b) => b.house(6, 11, { floors: 2, w: 2, color: 5 }));
    const home = next.shape.structureAt.get(key(6, 1, 11))!;
    const landing = next.dressing.sockets.find((s) => s.type === 'arrival' && s.structure === home)!;
    expect(landing).toBeDefined();
    expect(next.nav.nodes[next.nav.nodeAt.get(landing.cell)!]!.surface).toBe('deck');
    const newcomers = crowd.people.filter((p) => p.home === home);
    expect(crowd.people.length).toBe(before + newcomers.length);
    expect(newcomers.length).toBe(2);
    for (const p of newcomers) expect(p.cell).toBe(landing.cell);
    expect(crowd.atHome.get(home) ?? 0).toBe(0);
    // They climb up out of the water at the dock's end first, then walk (design 13: no fading in).
    for (const p of newcomers) expect(Math.hypot(p.edgeX, p.edgeZ)).toBeGreaterThan(0.3);
    const first = newcomers[0]!;
    const at = [first.x, first.z];
    let rose = false;
    for (let i = 0; i < 30 * 6 && first.mode === 'wait'; i++) {
      step(1 / 30);
      if (first.fade > 0 && first.fade < 1) {
        rose = true;
        expect(first.visible).toBe(true);
        expect([first.x, first.z]).toEqual(at);
      }
    }
    expect(rose).toBe(true);
    step(60);
    // They walked home (the first trip of each ends at the door).
    expect(newcomers.every((p) => p.trips >= 1)).toBe(true);
    expect(w.problems).toEqual([]);
  });

  test('an erased home: its people walk off and are gone', () => {
    const { b, crowd, w, step, edit } = start();
    step(10);
    const gone = b.world.blocks.get(key(13, 1, 16))!;
    const home = [...crowd.people].filter((p) => p.home === gone.seq);
    expect(home.length).toBeGreaterThan(0);
    edit((bb) => {
      for (const y of [2, 1]) for (const x of [13, 14]) bb.erase(x, y, 16);
    });
    expect(home.every((p) => p.leaving)).toBe(true);
    // They leave down the dock and step off its end out of view (design 13: no fading out).
    const stepping = new Set<string>();
    for (let i = 0; i < 90 * 30; i++) {
      step(1 / 30);
      for (const p of home) if (p.goal?.kind === 'leave' && p.mode === 'linger' && (p.edgeX !== 0 || p.edgeZ !== 0)) stepping.add(p.id);
    }
    expect(stepping.size).toBe(home.length);
    expect(crowd.people.some((p) => home.includes(p))).toBe(false);
    expect(crowd.atHome.get(gone.seq) ?? 0).toBe(0);
    expect(w.problems).toEqual([]);
  });

  test('a block landing nearby: people stop and look at it (L26)', () => {
    const { crowd, step } = start();
    step(20);
    const p = crowd.people.find((q) => q.visible && q.mode === 'walk' && q.walk![q.at]!.kind === 'move')!;
    const at = [p.x, p.z];
    crowd.blockLanded(key(Math.floor(p.x) + 2, 1, Math.floor(p.z)));
    step(1);
    expect([p.x, p.z]).toEqual(at);
    expect(Math.sin(p.heading)).toBeGreaterThan(0.8); // turned to the east, where it landed
    step(5);
    expect([p.x, p.z]).not.toEqual(at);
  });

  test('directions used above', () => {
    expect([N, E]).toEqual([0, 1]);
  });
});

describe('mischief: somebody climbs out of the water', () => {
  test('they stand a moment, then walk into town and in at a door; never shrinking, never jumping', () => {
    const town = scenarioTown(peopleTown);
    const c = clock(town.world.seed, 'day');
    const crowd = createCrowd();
    crowd.sync(town.shape, town.dressing, c.time);
    // A walkable place on the ground.
    const nav = crowd.nav!;
    const n = nav.nodes.findIndex((_, i) => nav.part[i] === nav.part[usableDoors(nav, crowd.people[0]!.home)[0]!.node]);
    const cell = nav.nodes[n]!.cell;
    const p = crowd.ashore(keyX(cell) + 0.5, keyY(cell) * 0.8, keyZ(cell) + 0.5, 0, 7)!;
    expect(p).not.toBeNull();
    let shrank = 0, jump = 0;
    let lx = p.x, lz = p.z;
    for (let i = 0; i < 30 * 120 && p.mode !== 'gone'; i++) {
      crowd.step(c.tick(1 / 30), c.time);
      if (p.visible && p.fade < 1) shrank++;
      if (p.visible && Math.hypot(p.x - lx, p.z - lz) > 0.3) jump++;
      lx = p.x;
      lz = p.z;
    }
    expect(p.mode).toBe('gone');
    expect(p.goal?.door ?? null).not.toBeNull();
    expect(shrank).toBe(0);
    expect(jump).toBe(0);
  });
});
