// The port's yard (D15-P, src/life/port/yard.ts): the walking graph keeps to
// the aisles, and the stacks are seeded, kept when the port grows, and puffed
// away (never left in the air) when their bays go.

import { describe, expect, test } from 'vitest';
import { above, key, type CellKey } from '@/core/grid';
import { connected } from '@/resolve/nav';
import { portCell } from '@/rules/roles/port-shape';
import { resolveDressing, resolveShape } from '@/resolve/index';
import { resolveScenario } from '@/scenario';
import { applyEdit } from '@/world/world';
import scn from '../../../scenarios/port/R-D00.port.scenario';
import { createLife } from '../runtime';
import { createSignals } from '../signals';
import { recordingStage } from '../testing/stage';
import portSystem, { portsOf } from './port.system';

describe('the yard', () => {
  test('aisles stay walkable: every deck cell beside a stack can be reached from the land', () => {
    const town = resolveScenario(scn);
    const nav = town.dressing.nav;
    const land = nav.nodeAt.get(key(18, 1, 21))!;
    expect(land).toBeGreaterThanOrEqual(0);
    for (const [, pp] of portsOf(town.shape)) {
      const stackCells = new Set<CellKey>();
      for (const s of pp.yard.stacks) for (const i of [s.i, s.i + 1]) stackCells.add(above(portCell(pp.port, i, s.r)));
      let checked = 0;
      for (let i = 0; i < pp.port.length; i++) {
        for (let r = 0; r < pp.port.depth; r++) {
          const c = above(portCell(pp.port, i, r));
          if (stackCells.has(c)) continue;
          const besideStack = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dr]) => stackCells.has(above(portCell(pp.port, i + di!, r + dr!))));
          if (!besideStack) continue;
          const n = nav.nodeAt.get(c);
          // The office stands in its cell; everything else beside a stack is open deck.
          if (pp.yard.office && pp.yard.office.i === i && pp.yard.office.r === r) continue;
          expect(n, `deck cell (${i}, ${r}) is a node`).toBeDefined();
          if (pp.port.x0 > 30) continue; // the small port on the east shore: its own beach
          expect(connected(nav, land, n!), `deck cell (${i}, ${r}) of the port reaches the land`).toBe(true);
          checked++;
        }
      }
      if (pp.port.x0 < 30) expect(checked).toBeGreaterThan(8);
    }
  });

  test('a new port’s yard is part full, the unpacking bay holds one; erasing the port puffs them away', () => {
    const town = resolveScenario(scn);
    const rec = recordingStage(town);
    const signals = createSignals(scn.seed);
    const life = createLife(rec.stage, signals, { behaviours: [], systems: [portSystem] });
    life.sync(town);
    const boxes = () => rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'container' && !r.released);
    const first = boxes().length;
    expect(first).toBeGreaterThan(8);
    // Every container stands on the apron or on another, inside its port.
    for (const b of boxes()) expect(b.matrix[13]).toBeGreaterThan(0.8);
    // Seeded: the same town makes the same yard.
    const rec2 = recordingStage(town);
    const life2 = createLife(rec2.stage, createSignals(scn.seed), { behaviours: [], systems: [portSystem] });
    life2.sync(town);
    expect(rec2.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'container').length).toBe(first);
    // Erase the big port's two seaward rows: two deep, it is a quay now, and its containers go in puffs.
    let world = town.world;
    for (let x = 14; x <= 25; x++) for (const z of [25, 26]) world = applyEdit(world, town.terrain, { type: 'eraseBlock', cell: key(x, 0, z) });
    const shape = resolveShape(world, town.terrain);
    const next = { shape, dressing: resolveDressing(shape) };
    rec.setTown(next.shape, next.dressing);
    const puffsBefore = rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'puff').length;
    life.sync(next);
    life.update(signals.advance(0.05));
    const left = boxes();
    expect(left.length).toBeLessThan(first);
    for (const b of left) expect(b.matrix[12]! > 38, 'only the small port keeps its containers').toBe(true);
    expect(rec.spawned.filter((r) => r.spec && 'actor' in r.spec && r.spec.actor === 'puff').length).toBeGreaterThan(puffsBefore);
    life.dispose();
    life2.dispose();
  });
});
