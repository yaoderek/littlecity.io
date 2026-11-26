// Bikes (bikes.ts): who rides, where, and that a bike is always in exactly
// one place. Towns built in code; the bikes put at their doors by hand (as
// D11's door-bike prop would), so every test has exactly the bikes it means.

import { describe, expect, test } from 'vitest';
import { key, keyX, keyZ } from '@/core/grid';
import type { DressingPlan, Prop } from '@/resolve/plan';
import { BIKE } from '@/style/people';
import scn from '../../../scenarios/life/bikes.scenario';
import peopleTown from '../../../scenarios/people/people-town.scenario';
import { createCrowd, type Crowd, type CrowdOptions, type Person } from './crowd';
import type { ErrandHost, ErrandStep } from './errand';
import { clock, scenarioTown, townOf, watch, type TestTown } from './testing';
import { nodeHeight } from './walk';

const STEP = 1 / 30;

/** The town with a bike leaning by every house door that opens onto the graph (or by those of `only`). */
function withBikes(town: TestTown, only?: (door: { structure: number }) => boolean): TestTown {
  const props: Prop[] = town.dressing.props.filter((p) => p.type !== 'door-bike');
  const seen = new Set<string>();
  for (const d of town.nav.doors) {
    if (d.node < 0 || d.socket === undefined || d.hatch || seen.has(d.socket) || town.shape.kinds.get(d.cell) !== 'house' || (only && !only(d))) continue;
    seen.add(d.socket);
    props.push({ id: `test-bike@${d.socket}`, type: 'door-bike', at: { socket: d.socket }, params: { paint: props.length % 2 }, rule: 'test', hash: 0 } as Prop);
  }
  const dressing: DressingPlan = { ...town.dressing, props };
  return { ...town, dressing };
}

/** Errands that send chosen people to a cell, once each, and nobody else anywhere. */
function sendTo(targets: Map<string, number>): ErrandHost & { done: Set<string> } {
  const done = new Set<string>();
  const sent = new Set<string>();
  return {
    done,
    next(p) {
      const cell = targets.get(p.id);
      if (cell === undefined || sent.has(p.id)) return null;
      sent.add(p.id);
      const step: ErrandStep = { cell, spot: null, face: Number.NaN, door: null, pose: 'stand', linger: 600, load: null, tag: 'test:go' };
      return step;
    },
    arrived(p) {
      done.add(p.id);
    },
    failed() {},
  };
}

/** A crowd on the town at night (everybody at home), then the day breaks. */
function morning(town: TestTown, opts: CrowdOptions): { crowd: Crowd; tick(seconds: number, each?: () => void): void } {
  const c = clock(town.world.seed, 'night');
  const crowd = createCrowd(opts);
  crowd.sync(town.shape, town.dressing, c.time);
  c.hold('day');
  return {
    crowd,
    tick(seconds, each) {
      for (let i = 0; i < seconds * 30; i++) {
        crowd.step(c.tick(STEP), c.time);
        each?.();
      }
    },
  };
}

/** A long street of cottages along z = 20, a spur path from each door. */
const street = (b: Parameters<Parameters<typeof townOf>[0]>[0], houses = 2): void => {
  b.path(5, 20, 42, 20);
  for (let i = 0; i < houses; i++) {
    b.house(6 + i * 4, 17, { floors: 1, w: 2, d: 2, color: i });
    b.path(7 + i * 4, 19, 7 + i * 4, 19);
  }
};

describe('who rides', () => {
  const town = withBikes(townOf((b) => street(b, 1)));
  const owner = (crowd: Crowd): Person => crowd.bikes.all[0]!.owner!;

  test('a resident with a bike and a 20-cell trip rides it; with a 6-cell trip, walks', () => {
    for (const [cell, rides] of [[key(30, 1, 20), true], [key(10, 1, 20), false]] as const) {
      const probe = morning(town, {});
      const who = owner(probe.crowd);
      expect(who, 'the bike has an owner').toBeTruthy();
      const errands = sendTo(new Map([[who.id, cell]]));
      const { crowd, tick } = morning(town, { errands });
      const p = crowd.people.find((q) => q.id === who.id)!;
      let mounted = 0, inHand = 0;
      tick(60, () => {
        const b = crowd.bikes.inHand(p);
        if (b) inHand++;
        if (b?.mounted) mounted++;
      });
      expect(errands.done.has(p.id), 'they got there').toBe(true);
      if (rides) {
        expect(mounted).toBeGreaterThan(30);
        // Leaned where they stopped.
        expect(crowd.bikes.all[0]!.at).toBe('parked');
      } else {
        expect(inHand).toBe(0);
        expect(crowd.bikes.all[0]!.at).toBe('home');
      }
    }
  });

  test('riding is faster than walking, by about BIKE.speed', () => {
    const who = owner(morning(town, {}).crowd);
    const times: number[] = [];
    for (const speed of [BIKE.speed, 1]) {
      const keep = BIKE.speed;
      BIKE.speed = speed;
      const errands = sendTo(new Map([[who.id, key(38, 1, 20)]]));
      const { crowd, tick } = morning(town, { errands });
      let t = 0;
      tick(120, () => {
        if (!errands.done.has(who.id)) t += STEP;
      });
      BIKE.speed = keep;
      expect(crowd.people.some((q) => q.id === who.id)).toBe(true);
      times.push(t);
    }
    expect(times[0]! / times[1]!).toBeLessThan(0.65);
  });

  test('nobody rides in heavy rain, at night or with a crate', () => {
    const who = owner(morning(town, {}).crowd);
    const rain = morning(town, { errands: sendTo(new Map([[who.id, key(30, 1, 20)]])), bikes: { weather: () => ({ rain: 0.6, snow: 0, cover: 0 }) } });
    rain.tick(20);
    expect(rain.crowd.bikes.all[0]!.at).toBe('home');
    const crate: ErrandHost = {
      next: (p) => (p.id === who.id ? { cell: key(30, 1, 20), spot: null, face: Number.NaN, door: null, pose: 'stand', linger: 600, load: 'crate', tag: 'test:crate' } : null),
      arrived() {},
      failed() {},
    };
    const laden = morning(town, { errands: crate });
    laden.tick(20);
    expect(laden.crowd.bikes.all[0]!.at).toBe('home');
  });
});

describe('the bike is in one place at a time', () => {
  /** Holds every bike to: exactly one of home, in its owner's hands, or at rest on a node of the graph. */
  const checkPlaces = (crowd: Crowd, problems: string[]): void => {
    const held = new Map<Person, number>();
    for (const b of crowd.bikes.all) {
      const say = (what: string): void => void (problems.length < 10 && problems.push(`${b.id} (${b.at}): ${what}`));
      if (b.at === 'home') {
        if (b.prop === null) say('at home with no prop to draw it');
        if (b.owner && crowd.bikes.inHand(b.owner) === b) say('at home and in hand');
      } else if (b.at === 'ridden') {
        if (!b.owner || !crowd.people.includes(b.owner)) say('in the hands of nobody in the town');
        else held.set(b.owner, (held.get(b.owner) ?? 0) + 1);
        if (b.rest) say('in hand and at rest');
      } else {
        if (!b.rest || b.node < 0 || !crowd.nav || b.node >= crowd.nav.nodes.length) say('at rest nowhere');
        else if (crowd.nav.nodeAt.get(b.cell) !== b.node) say('at rest on a node that is not its cell');
        else if (Math.abs(b.y - nodeHeight(crowd.nav, b.node)) > 1e-6) say(`floating at ${b.y.toFixed(2)}`);
      }
    }
    for (const [p, n] of held) if (n > 1) problems.push(`${p.id} holds ${n} bikes`);
  };

  test('a long day in the bikes town and in the people town (stairs, steps, a pier)', { timeout: 60_000 }, () => {
    for (const t of [scenarioTown(scn), withBikes(scenarioTown(peopleTown))]) {
      const c = clock(t.world.seed, 'day');
      const crowd = createCrowd();
      crowd.sync(t.shape, t.dressing, c.time);
      const w = watch(crowd);
      const problems: string[] = [];
      let mounted = 0;
      let wheeledUp = 0;
      for (let i = 0; i < 240 * 30; i++) {
        crowd.step(c.tick(STEP), c.time);
        w.check();
        checkPlaces(crowd, problems);
        for (const p of crowd.people) {
          const b = crowd.bikes.inHand(p);
          if (!b || p.mode !== 'walk' || !p.walk) continue;
          const piece = p.walk[p.at]!;
          const node = crowd.nav!.nodes[piece.node]!;
          const climbing = node.rot !== undefined || piece.ramp !== null;
          // No route crosses stairs, steps or a stoop mounted: they get off and wheel it.
          if (b.mounted && climbing) problems.push(`${p.id} rides up or down at ${keyX(node.cell)},${keyZ(node.cell)}`);
          if (b.mounted) mounted++;
          if (!b.mounted && climbing && piece.kind === 'move') wheeledUp++;
        }
      }
      expect(problems).toEqual([]);
      expect(w.problems).toEqual([]);
      expect(mounted).toBeGreaterThan(1000);
      // In the people town somebody wheeled their bike over a flight or carved steps.
      if (t.dressing.props.some((p) => p.id.startsWith('test-bike'))) expect(wheeledUp).toBeGreaterThan(0);
    }
  });

  test('the house erased mid-ride: no error, nothing left floating, the bike walked off and left', () => {
    const build = (house: boolean) => townOf((b) => {
      b.path(5, 20, 42, 20).path(42, 21, 42, 30);
      if (house) b.house(6, 17, { floors: 1, w: 2, d: 2 }).path(7, 19, 7, 19);
    });
    const town = withBikes(build(true));
    const after = build(false);
    const who = morning(town, {}).crowd.bikes.all[0]!.owner!;
    const { crowd, tick } = morning(town, { errands: sendTo(new Map([[who.id, key(36, 1, 20)]])) });
    const p = crowd.people.find((q) => q.id === who.id)!;
    for (let i = 0; i < 40 * 30 && !crowd.bikes.inHand(p)?.mounted; i++) tick(STEP);
    expect(crowd.bikes.inHand(p)?.mounted).toBe(true);
    // The house goes (as if nuked): the same town without it.
    expect(() => crowd.sync(after.shape, after.dressing, clock(7, 'day').time)).not.toThrow();
    const problems: string[] = [];
    expect(() => tick(90, () => checkPlaces(crowd, problems))).not.toThrow();
    expect(problems).toEqual([]);
    const bike = crowd.bikes.all[0]!;
    expect(bike.prop).toBeNull();
    // Its rider has left town (or is on the way), and the bike is in their hands or left on the ground.
    if (crowd.people.includes(p) && crowd.bikes.inHand(p)) expect(p.leaving).toBe(true);
    else expect(['parked', 'lying']).toContain(bike.at);
  });
});

describe('the cap', () => {
  // Three streets of little houses, one door each onto the street: 40 owners and more.
  const town = withBikes(
    townOf((b) => {
      for (const z of [8, 20, 32]) {
        b.path(4, z, 42, z);
        for (let x = 5; x < 43; x += 3) b.house(x, z - 2, { floors: 1, w: 2, d: 1 }).path(x, z - 1, x, z - 1);
        if (z === 20) for (let x = 5; x < 43; x += 3) b.house(x, z + 2, { floors: 1, w: 2, d: 1 }).path(x, z + 1, x, z + 1);
      }
      b.path(43, 8, 43, 32);
    }),
  );

  test.each([[undefined, BIKE.cap], [() => BIKE.capPhone, BIKE.capPhone], [() => BIKE.capLow, BIKE.capLow]])('holds with 40 eligible residents (%s)', (cap, most) => {
    const probe = morning(town, {}).crowd;
    const owners = probe.bikes.all.map((b) => b.owner).filter((o): o is Person => o !== null);
    expect(owners.length).toBeGreaterThanOrEqual(40);
    // Everybody with a bike is sent to the far end of another street.
    const targets = new Map(owners.map((o) => [o.id, key(40, 1, o.z < 14 ? 32 : 8)] as const));
    const { crowd, tick } = morning(town, { errands: sendTo(targets), ...(cap ? { bikes: { cap } } : {}) });
    let most_ = 0;
    tick(40, () => (most_ = Math.max(most_, crowd.bikes.riders())));
    expect(most_).toBe(most);
  });
});
