// The cargo ship's visit to a port (L38-F, src/life/port), stepped with a
// fixed clock against a recording stage:
//   - a cargo ship fits a port's berth and is never sent to a plain quay;
//   - over a visit the cranes make their moves, and the containers are
//     conserved: ship + yard + what the cranes hold is the same throughout;
//   - the port erased mid-visit: the ship casts off and sails out, and no
//     container is left in the air.

import { describe, expect, test } from 'vitest';
import { key } from '@/core/grid';
import { resolveDressing, resolveShape } from '@/resolve/index';
import { harbour, hullSize } from '@/rules/life/berths.fact';
import { rigOf } from '@/parts/actors/ships/rig';
import { resolveScenario } from '@/scenario';
import { applyEdit } from '@/world/world';
import tradeScn from '../../../scenarios/life/L58.trade.scenario';
import scn from '../../../scenarios/port/R-D00.port.scenario';
import { createLife } from '../runtime';
import { createSignals, partPhases } from '../signals';
import { recordingStage } from '../testing/stage';
import harbourSystem from '../ships/harbour.system';
import { harbourOf, type Ship } from '../ships/visit';
import portSystem, { portLifeOf } from './port.system';

describe('the cargo ship', () => {
  test('its hull as the berths see it is its drawn hull', () => {
    const rig = rigOf('freighter');
    const h = hullSize('freighter');
    expect(h.stern).toBeCloseTo(rig.stern, 1);
    expect(h.bow).toBeCloseTo(rig.bow, 1);
    expect(h.halfBeam).toBeGreaterThanOrEqual(rig.halfBeam);
  });

  test('it fits the 4 × 12 port’s berth, not the small port’s, and never a plain quay', () => {
    const town = resolveScenario(scn);
    const plans = harbour(town.shape.facts).plans.filter((p) => p.ship === 'freighter');
    expect(plans.length).toBe(1);
    expect(plans[0]!.berth.port).toBeDefined();
    expect(plans[0]!.berth.cells).toBeGreaterThanOrEqual(10);
    expect(town.dressing.actors.filter((a) => a.type === 'ship-call' && a.variant === 'freighter').length).toBe(1);
    // A long plain quay: no cargo ship.
    const quay = resolveScenario(tradeScn);
    expect(harbour(quay.shape.facts).plans.some((p) => p.ship === 'freighter')).toBe(false);
    expect(quay.dressing.actors.some((a) => a.type === 'ship-call' && a.variant === 'freighter')).toBe(false);
  });
});

/** Runs the port town with its harbour and port; `onStep` sees the freighter. */
function run(seconds: number, onStep: (t: number, ship: Ship | undefined, ctx: { count(): number; live(): number; erase(): void; holding(): number; yard(): string }) => boolean | void) {
  let town = resolveScenario(scn);
  const rec = recordingStage(town);
  const signals = createSignals(scn.seed);
  signals.setPhase(partPhases().day.start + 0.02);
  signals.hold('day');
  const life = createLife(rec.stage, signals, { behaviours: [], systems: [harbourSystem, portSystem] });
  life.sync(town);
  const port = portLifeOf(rec.stage)!;
  const freighter = (): Ship | undefined => harbourOf(rec.stage)!.ships.find((s) => s.kind === 'freighter' && s.body);
  const holding = (): number => [...port.cranes.values()].filter((c) => c.load).length;
  const count = (): number => {
    let n = 0;
    for (const p of port.ports.values()) n += p.yard.count;
    for (const b of freighter()?.body?.cargo ?? []) if (b) n++;
    return n + holding();
  };
  const live = (): number => rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'container' && !r.released).length;
  const erase = (): void => {
    let world = town.world;
    for (let x = 14; x <= 25; x++) for (const z of [25, 26]) world = applyEdit(world, town.terrain, { type: 'eraseBlock', cell: key(x, 0, z) });
    const shape = resolveShape(world, town.terrain);
    town = { ...town, world, shape, dressing: resolveDressing(shape) };
    rec.setTown(town.shape, town.dressing);
    life.sync(town);
  };
  const dt = 1 / 20;
  for (let t = 0; t < seconds; t += dt) {
    life.update(signals.advance(dt));
    const yard = (): string => [...port.ports.values()].map((p) => p.yard.stacks.map((k) => k.boxes.length).join('')).join('|');
    if (onStep(t, freighter(), { count, live, erase, holding, yard }) === true) break;
  }
  life.dispose();
}

describe('a visit', () => {
  test('the cranes make their moves; ship + yard + cranes is the same count throughout; both change', () => {
    let start = -1;
    let shipStart: string | null = null;
    let yardStart: string | null = null;
    let moved = false;
    let left = false;
    run(260, (_t, ship, c) => {
      if (!ship) return;
      if (start < 0) {
        start = c.count();
        shipStart = (ship.body?.cargo ?? []).map((b) => (b ? 1 : 0)).join('');
        yardStart = c.yard();
      }
      if (ship.phase === 'moored' || ship.phase === 'warp-in') expect(c.count()).toBe(start);
      if (c.holding() > 0) moved = true;
      if (ship.phase === 'leaving' && !left) {
        left = true;
        const nowShip = (ship.body?.cargo ?? []).map((b) => (b ? 1 : 0)).join('');
        expect(nowShip).not.toBe(shipStart);
        expect(c.yard()).not.toBe(yardStart);
        return true;
      }
    });
    expect(start).toBeGreaterThan(0);
    expect(moved).toBe(true);
    expect(left).toBe(true);
  });

  test('the port erased mid-visit: the ship sails out, nothing is left in the air', () => {
    let erased = false;
    let after = 0;
    let sailed = false;
    run(200, (t, ship, c) => {
      if (!erased && ship && c.holding() > 0 && t > 5) {
        c.erase();
        erased = true;
        return;
      }
      if (!erased) return;
      after += 1 / 20;
      if (ship && (ship.phase === 'warp-out' || ship.phase === 'swing-out' || ship.phase === 'leaving')) sailed = true;
      if (after > 25) {
        // Every container still drawn is aboard or on the small port's stacks: none hangs from a crane.
        expect(c.holding()).toBe(0);
        expect(c.live()).toBe(c.count());
        return true;
      }
    });
    expect(erased).toBe(true);
    expect(sailed).toBe(true);
  });
});

describe('into town', () => {
  test('the dock workers open the full container, carry its goods into the aisle, and the carters have somewhere to take them', () => {
    const town = resolveScenario(scn);
    const posts = town.dressing.sockets.filter((s) => s.type === 'errand' && (s.name ?? '').startsWith('trade|to|'));
    expect(posts.length).toBeGreaterThan(0);
    let piled = 0;
    let emptied = false;
    const rec = recordingStage(town);
    const signals = createSignals(scn.seed);
    signals.setPhase(partPhases().day.start + 0.02);
    signals.hold('day');
    const life = createLife(rec.stage, signals, { behaviours: [], systems: [harbourSystem, portSystem] });
    life.sync(town);
    const port = portLifeOf(rec.stage)!;
    for (let t = 0; t < 60; t += 1 / 20) {
      life.update(signals.advance(1 / 20));
      for (const [k, pile] of harbourOf(rec.stage)!.piles) if (k.startsWith('port:')) piled = Math.max(piled, pile.items.filter(Boolean).length);
      for (const p of port.ports.values()) for (const s of p.yard.stacks) if (s.spot.unpack && s.boxes[0] && !s.boxes[0].full) emptied = true;
    }
    life.dispose();
    expect(piled).toBeGreaterThanOrEqual(2);
    expect(emptied).toBe(true);
  });
});

describe('arriving and leaving', () => {
  test('a port made by an edit: cranes rise one after another, containers are set down, all within about two seconds; unmade, cranes shrink away', () => {
    const full = resolveScenario(scn);
    // Start as a quay: the big port's two seaward rows not built yet.
    let world = full.world;
    for (let x = 14; x <= 25; x++) for (const z of [25, 26]) world = applyEdit(world, full.terrain, { type: 'eraseBlock', cell: key(x, 0, z) });
    const resolve = (w: typeof world) => {
      const shape = resolveShape(w, full.terrain);
      return { world: w, terrain: full.terrain, shape, dressing: resolveDressing(shape) };
    };
    const quay = resolve(world);
    const rec = recordingStage(quay);
    const signals = createSignals(scn.seed);
    const life = createLife(rec.stage, signals, { behaviours: [], systems: [portSystem] });
    life.sync(quay);
    life.update(signals.advance(0.05));
    const scale = (m: readonly number[]): number => Math.hypot(m[0]!, m[1]!, m[2]!);
    // The rows go back down: a port.
    const port = resolve(full.world);
    rec.setTown(port.shape, port.dressing);
    life.sync(port);
    const frames = port.dressing.actors.filter((a) => a.type === 'port-crane' && a.at && 'cell' in a.at && (a.at as { cell: number }).cell % 64 < 30);
    expect(frames.length).toBe(2);
    const sizes = (): number[] => frames.map((f) => scale(rec.of(f.id).matrix));
    const boxes = (): number => rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'container' && !r.released && scale(r.matrix) > 0.9).length;
    life.update(signals.advance(0.05));
    expect(Math.max(...sizes())).toBeLessThan(0.2); // not there in one frame
    const early = boxes();
    let t = 0.05;
    const firstUp: number[] = [];
    while (t < 2.4) {
      life.update(signals.advance(0.05));
      t += 0.05;
      sizes().forEach((s, i) => {
        if (s > 0.98 && firstUp[i] === undefined) firstUp[i] = t;
      });
    }
    expect(sizes().every((s) => Math.abs(s - 1) < 0.02)).toBe(true);
    // Staggered: the second crane is up a little after the first.
    expect(Math.abs(firstUp[0]! - firstUp[1]!)).toBeGreaterThan(0.1);
    expect(boxes()).toBeGreaterThan(early + 3);
    // Unmade again: the cranes' frames go from the plan, and drawings of their own shrink into their feet.
    const before = rec.spawned.length;
    rec.setTown(quay.shape, quay.dressing);
    life.sync(quay);
    const stands = rec.spawned.slice(before).filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'port-crane');
    expect(stands.length).toBe(2);
    life.update(signals.advance(0.1));
    expect(stands.every((r) => !r.released && scale(r.matrix) > 0.1 && scale(r.matrix) < 1)).toBe(true);
    for (let k = 0; k < 10; k++) life.update(signals.advance(0.05));
    expect(stands.every((r) => r.released)).toBe(true);
    life.dispose();
  });
});
