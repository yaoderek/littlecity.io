// R-D05 · the shipyard, stepped with fixed time steps: the build's stages come
// in order and take their time; the keel is carried by two; a crowd gathers
// for the launch; the ship slides in and sails out over the edge of the map
// (or lies off the slip if it cannot get out); and a yard erased mid-build
// takes its hull apart and leaves nothing standing in the air.
//
// The stage times are shortened here (setStyle) so a whole ship is a minute and
// a half of simulated time; their sum is pinned against the style.

import { afterEach, describe, expect, test } from 'vitest';
import { setStyle, resetStyles } from '@/core/style';
import { mapEdge, pathAt } from '@/rules/life/ship-routes';
import type { DressingPlan } from '@/resolve/plan';
import { SHIPYARD } from '@/style/shipyard';
import { scenario } from '@/scenario';
import { recordingStage } from '../testing/stage';
import yardTown from '../../../scenarios/life/L75.shipyard.scenario';
import { clock, scenarioTown, watch, type TestTown } from '../people/testing';
import { BUILD_PHASES, phaseSeconds, type ShipyardChain, type YardPhase } from './chains/shipyard';
import { createLivingTown, type LivingTown } from './index';

const town = scenarioTown(yardTown);

const FAST: Record<string, number> = { keel: 30, frames: 10, planks: 10, paint: 8, gather: 30, pause: 6, first: 2 };

function fast(): void {
  for (const [k, v] of Object.entries(FAST)) setStyle('shipyard', k, v);
}
afterEach(() => resetStyles());

interface Run {
  t: LivingTown;
  yard: ShipyardChain;
  problems: string[];
}

function run(where: TestTown, seconds: number, each?: (t: LivingTown, yard: ShipyardChain, second: number) => void, opts: { stage?: ReturnType<typeof recordingStage>; dressing?: DressingPlan } = {}): Run {
  const c = clock(where.world.seed, 'day');
  const t = createLivingTown({ seed: where.world.seed, ...(opts.stage ? { stage: opts.stage.stage } : {}) });
  t.sync(where.shape, opts.dressing ?? where.dressing, c.time);
  const w = watch(t.crowd, { maxStuck: 14 });
  const yard = t.board.chains.find((x) => x.id === 'shipyard') as ShipyardChain;
  for (let i = 0; i < seconds * 20; i++) {
    t.step(c.tick(1 / 20), c.time);
    w.check();
    each?.(t, yard, i / 20);
  }
  return { t, yard, problems: w.problems.filter((x) => !x.includes('walking backwards')) };
}

describe('R-D05: the shipyard', () => {
  test('the stages of a build are keel, frames, planks, paint, and with the launch they make about five minutes', () => {
    expect(BUILD_PHASES).toEqual(['keel', 'frames', 'planks', 'paint']);
    const build = BUILD_PHASES.reduce((n, p) => n + phaseSeconds(p), 0);
    expect(build).toBe(SHIPYARD.keel + SHIPYARD.frames + SHIPYARD.planks + SHIPYARD.paint);
    // The spec's table: 30 + 60 + 90 + 45 seconds of building, then the launch.
    expect([SHIPYARD.keel, SHIPYARD.frames, SHIPYARD.planks, SHIPYARD.paint]).toEqual([30, 60, 90, 45]);
    expect(build + SHIPYARD.gather).toBeGreaterThanOrEqual(4 * 60);
    expect(build + SHIPYARD.gather).toBeLessThanOrEqual(6 * 60);
  });

  test('a whole ship: built in order, each stage its time, the keel carried by two, a crowd, a launch, out over the edge', () => {
    fast();
    const phases: { p: YardPhase; at: number }[] = [];
    let carried = 0;
    let crowd = 0;
    let sponsorDressed = false;
    let steps = 0;
    let lastStep = -1;
    let backwards = 0;
    let route: { end: number } | null = null;
    let sailed = false;
    const r = run(town, 200, (_t, yard, s) => {
      const y = yard.yards[0];
      if (!y) return;
      if (phases[phases.length - 1]?.p !== y.phase) phases.push({ p: y.phase, at: s });
      if (y.beam?.track && y.beam.carriers.length === 2 && y.beam.carriers.every((p) => p.load === 'beam')) carried++;
      crowd = Math.max(crowd, y.watchers.filter((p) => p.mode === 'linger' && p.goal?.errand?.tag === 'shipyard:watch').length);
      if (y.sponsor?.costume === 'guest' && y.sponsor.goal?.errand?.tag === 'shipyard:bow') sponsorDressed = true;
      if (y.step !== lastStep) {
        if (y.step < lastStep && y.step >= 0) backwards++;
        if (y.step > lastStep) steps++;
        lastStep = y.step;
      }
      const l = yard.fleet[0];
      if (l?.voyage && !route) {
        const p = pathAt(l.voyage.path, l.voyage.path.length);
        route = { end: mapEdge(p.x, p.z) };
      }
      if (l?.phase === 'sail') sailed = true;
    });
    expect(r.problems).toEqual([]);
    const order = phases.map((p) => p.p);
    expect(order.slice(0, 9)).toEqual(['idle', 'keel', 'frames', 'planks', 'paint', 'ready', 'gather', 'launched', 'idle']);
    // Each building stage takes its time (to a step).
    for (const name of BUILD_PHASES) {
      const i = order.indexOf(name);
      const took = phases[i + 1]!.at - phases[i]!.at;
      expect(took, name).toBeGreaterThanOrEqual(FAST[name]! - 0.1);
      // (The keel waits a little for its carriers if they are on their way with it.)
      expect(took, name).toBeLessThanOrEqual(FAST[name]! * (name === 'keel' ? 1.8 : 1) + 0.2);
    }
    expect(carried, 'two carried the keel timber').toBeGreaterThan(20);
    expect(backwards).toBe(0);
    expect(steps).toBeGreaterThanOrEqual(20);
    expect(crowd, 'a crowd lines the slip').toBeGreaterThanOrEqual(15);
    expect(sponsorDressed, 'the bottle is broken by somebody in their finery').toBe(true);
    expect(r.yard.launched).toBe(1);
    // The route out ends past the edge of the map, and the ship sailed it.
    expect(route).not.toBeNull();
    expect(route!.end).toBeGreaterThan(0);
    expect(sailed).toBe(true);
    // Everybody let go after: nobody still held for the launch.
    for (const p of r.t.crowd.people) expect(p.party && r.t.board.claimedBy(p)?.id === 'shipyard' && r.yard.yards[0]!.phase === 'idle').toBe(false);
  });

  test('shut in by land: the ship lies off the end of the slip, and no new keel is laid while it is there', () => {
    fast();
    const lagoon = scenarioTown(
      scenario({
        ...yardTown,
        name: 'L75.shipyard-lagoon',
        terrain(t) {
          t.flat(1);
          t.water(12, 24, 32, 38);
        },
      }),
    );
    let keels = 0;
    let was: YardPhase = 'idle';
    const r = run(lagoon, 200, (_t, yard) => {
      const y = yard.yards[0];
      if (y && y.phase === 'keel' && was !== 'keel') keels++;
      if (y) was = y.phase;
    });
    expect(r.yard.yards.length).toBe(1);
    expect(r.yard.launched).toBe(1);
    expect(r.yard.fleet[0]?.phase).toBe('moored');
    expect(keels).toBe(1);
  });

  test('erased mid-build: the hull comes down a piece at a time, planks carried off, nothing left in the air', () => {
    fast();
    const rec = recordingStage(town);
    // Which meshes are the yard's (other chains draw too: a dog, a beach day).
    const mine = new Set<number>();
    const spawnMesh = rec.stage.spawnMesh.bind(rec.stage);
    rec.stage.spawnMesh = (m, at) => {
      if (/chains\/shipyard\.ts/.test(new Error().stack ?? '')) mine.add(rec.spawned.length);
      return spawnMesh(m, at);
    };
    const gone: DressingPlan = { ...town.dressing, sockets: town.dressing.sockets.filter((s) => !(s.type === 'errand' && (s.name ?? '').startsWith('shipyard|'))) };
    let cut = -1;
    let carryingOff = 0;
    let shownAtCut = -1;
    const r = run(
      town,
      90,
      (t, yard, s) => {
        const y = yard.yards[0];
        if (cut < 0 && y?.phase === 'planks') {
          cut = s;
          shownAtCut = y.step;
          t.sync(town.shape, gone, clock(town.world.seed, 'day').time);
        }
        if (cut > 0) carryingOff = Math.max(carryingOff, t.crowd.people.filter((p) => p.load === 'plank' && p.goal?.errand?.tag === 'shipyard:home').length);
      },
      { stage: rec },
    );
    expect(cut).toBeGreaterThan(0);
    expect(shownAtCut).toBeGreaterThan(5);
    expect(r.problems).toEqual([]);
    expect(r.yard.yards.length).toBe(0);
    expect(carryingOff).toBeGreaterThan(0);
    // Every mesh the yard drew is gone (released) or hidden (an effect in the pool): nothing floats.
    expect(mine.size).toBeGreaterThan(5);
    const left = [...mine].map((i) => rec.spawned[i]!).filter((x) => !x.released && x.visible);
    expect(left.map((x) => x.id)).toEqual([]);
  });
});
