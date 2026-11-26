// Mischief at the port (design section 13b): a big dock breaks where it is
// hit and is never thrown whole; cranes bend, go over and are raised again as
// the deck under them is mended; containers thrown off their stacks go back
// onto them, nothing left lying about or afloat.

import { describe, expect, test } from 'vitest';
import { key, type CellKey } from '@/core/grid';
import { invertAffine, multiply } from '@/core/mat4';
import { blastChunks, topplesWhole } from '@/gen/damage/damage';
import { profileOf } from '@/gen/damage/field';
import { allGenerators, allParts } from '@/gen/discover';
import { resolveDressing, resolveShape } from '@/resolve/index';
import type { ShapePlan } from '@/resolve/plan';
import { resolveScenario } from '@/scenario';
import { packRuin, MEND_STEPS } from '@/world/damage';
import { applyEdit } from '@/world/world';
import type { World } from '@/core/world';
import tradeScn from '../../../scenarios/life/L58.trade.scenario';
import scn from '../../../scenarios/port/R-D00.port.scenario';
import { createLife } from '../runtime';
import { createSignals } from '../signals';
import { recordingStage } from '../testing/stage';
import portSystem, { portLifeOf } from './port.system';

const blasted = (world: World, terrain: Parameters<typeof applyEdit>[1], cells: CellKey[], ruin: number): World => {
  let w = world;
  for (const c of cells) w = applyEdit(w, terrain, ruin ? { type: 'setRuin', cell: c, ruin } : { type: 'repair', cell: c });
  return w;
};
const intactOf = (shape: ShapePlan, id: number) => {
  const reg = allGenerators() as ReturnType<typeof allGenerators> & { intact?: ReturnType<typeof allGenerators> };
  return (reg.intact ?? reg).build(shape.structures.get(id)!, shape, allParts()).mesh;
};

describe('a big dock blown up', () => {
  test('a port and a long quay break where they were hit: small pieces, never the whole deck in one', () => {
    for (const [s, cell] of [[scn, key(24, 0, 25)], [tradeScn, key(20, 0, 27)]] as const) {
      const town = resolveScenario(s);
      const ruin = packRuin({ stage: 3, cause: 'blast', settling: true });
      const world = blasted(town.world, town.terrain, [cell], ruin);
      const shape = resolveShape(world, town.terrain);
      const id = shape.structureAt.get(cell)!;
      const st = shape.structures.get(id)!;
      expect(st.cells.length).toBeGreaterThan(8);
      expect(topplesWhole(profileOf(st, shape))).toBe(false);
      const chunks = blastChunks(intactOf(shape, id), st, shape);
      expect(chunks.length).toBeGreaterThan(1);
      for (const ch of chunks) {
        expect(ch.topple).toBeUndefined();
        // Each piece is a small bit of the cell that was hit, not the deck.
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of ch.polys) for (const v of p.v) {
          x0 = Math.min(x0, v[0]!);
          x1 = Math.max(x1, v[0]!);
          z0 = Math.min(z0, v[2]!);
          z1 = Math.max(z1, v[2]!);
        }
        expect(Math.max(x1 - x0, z1 - z0)).toBeLessThan(1.2);
      }
    }
  });
});

/** The port town with only the port's life, damage set by hand. */
function port() {
  const town = resolveScenario(scn);
  const rec = recordingStage(town);
  const signals = createSignals(scn.seed);
  const life = createLife(rec.stage, signals, { behaviours: [], systems: [portSystem] });
  life.sync(town);
  let world = town.world;
  const set = (cells: CellKey[], ruin: number): void => {
    world = blasted(world, town.terrain, cells, ruin);
    const shape = resolveShape(world, town.terrain);
    const next = { shape, dressing: resolveDressing(shape) };
    rec.setTown(next.shape, next.dressing);
    life.sync(next);
  };
  const step = (s: number): void => {
    for (let t = 0; t < s; t += 0.05) life.update(signals.advance(0.05));
  };
  return { town, rec, life, set, step, state: portLifeOf(rec.stage)! };
}

/** All the deck cells of the big port within `r` of (x, z). */
const near = (x: number, z: number, r: number): CellKey[] => {
  const out: CellKey[] = [];
  for (let i = 14; i <= 25; i++) for (let j = 23; j <= 26; j++) if (Math.hypot(i + 0.5 - x, j + 0.5 - z) <= r) out.push(key(i, 0, j));
  return out;
};

describe('the cranes hurt and mended', () => {
  test('the deck under a crane wrecked: it goes over; mended, it is raised again and stands as before', () => {
    const p = port();
    const large = [...p.state.cranes.values()].find((c) => c.large)!;
    const frame = p.town.dressing.actors.find((a) => a.type === 'port-crane' && a.variant === 'large')!;
    const base = p.rec.of(frame.id).base;
    // Its deck: everything round it, half-wrecked by a blast.
    const [x, , z] = [base[12]!, 0, base[14]!];
    const cells = near(x + 0.5, z + 0.5, 2.2);
    p.set(cells, packRuin({ stage: 2, cause: 'blast' }));
    expect(large.harmed).toBe(true);
    p.step(2);
    // Over: its frame's up axis lies near flat.
    const up = (): number => p.rec.of(frame.id).matrix[5]!;
    expect(up()).toBeLessThan(0.3);
    // Being mended: raised bit by bit.
    p.set(cells, packRuin({ stage: 2, cause: 'blast', mending: true, progress: MEND_STEPS * 0.5 }));
    p.step(3);
    expect(up()).toBeGreaterThan(0.4);
    expect(up()).toBeLessThan(0.99);
    // Sound: standing where it stood, as built.
    p.set(cells, 0);
    p.step(2.5);
    expect(large.harmed).toBe(false);
    const m = p.rec.of(frame.id).matrix;
    const d = multiply(invertAffine(base), m);
    expect(Math.abs(d[5]! - 1)).toBeLessThan(1e-3);
    p.life.dispose();
  });

  test('near a blast a crane is bent and burning, not over', () => {
    const p = port();
    const frame = p.town.dressing.actors.find((a) => a.type === 'port-crane' && a.variant === 'medium' && p.rec.of(a.id).base[12]! < 30)!;
    const medium = p.state.cranes.get(frame.id)!;
    const base = p.rec.of(frame.id).base;
    p.set(near(base[12]! + 0.5, base[14]! + 0.5, 2.2), packRuin({ stage: 1, cause: 'blast' }));
    p.step(2);
    expect(medium.harmed).toBe(true);
    expect(p.rec.of(frame.id).matrix[5]!).toBeGreaterThan(0.95);
    expect(p.state.fires.count).toBeGreaterThan(0);
    p.life.dispose();
  });
});

describe('the containers blown about', () => {
  test('thrown off their stacks, some into the water; when the bays are mended every one is back on a stack', () => {
    const p = port();
    const big = [...p.state.ports.values()].find((q) => q.plan.port.x0 < 30)!;
    const yard = big.yard;
    const before = yard.count;
    const onStacks = (): number => yard.stacks.reduce((n, s) => n + s.boxes.length, 0);
    const all = near(19, 24.5, 9);
    p.set(all, packRuin({ stage: 3, cause: 'blast' }));
    p.step(4);
    expect(yard.loose.length).toBeGreaterThan(3);
    expect(onStacks()).toBeLessThan(before);
    // Containers are never more nor fewer than they were (none lost past the cap here).
    expect(yard.count).toBe(before);
    p.set(all, 0);
    p.step(30);
    expect(yard.loose.length).toBe(0);
    expect(onStacks()).toBe(before);
    // Nothing drawn anywhere but on a stack: every live container sits at a stack's place.
    const live = p.rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'container' && !r.released);
    expect(live.length).toBe([...p.state.ports.values()].reduce((n, q) => n + q.yard.count, 0));
    for (const r of live) expect(r.matrix[13]!).toBeGreaterThan(0.8);
    p.life.dispose();
  });
});
