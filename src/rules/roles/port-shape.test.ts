// The port (R-D00): which docks are ports, which way they lie, their cranes
// and their yard. Runs the real role rules, so "first match wins" against the
// quay, pier, boardwalk and jetty is tested too.

import { describe, expect, test } from 'vitest';
import { key, keyX, keyZ } from '@/core/grid';
import { resolveShape } from '@/resolve/index';
import type { ShapePlan } from '@/resolve/plan';
import { TerrainBuilder, TownBuilder } from '@/scenario';
import { emptyWorld } from '@/world/world';
import { aisleAt, craneKinds, cranesOf, portCell, portOf, yardOf } from './port-shape';

/** Land north of z = 20, the sea south of it (z ≥ 20), and a bank of cliff at x 40–43. */
function town(build: (b: TownBuilder) => void): ShapePlan {
  const t = new TerrainBuilder(9);
  t.flat(1).water(4, 20, 43, 43).rect(40, 14, 43, 19, 2);
  const terrain = t.build();
  const b = new TownBuilder(emptyWorld(9), terrain);
  build(b);
  return resolveShape(b.world, terrain);
}
const fill = (b: TownBuilder, x0: number, z0: number, x1: number, z1: number): void => {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) b.block('dock', x, 0, z);
};
const roleAt = (plan: ShapePlan, x: number, z: number): string | undefined => plan.roles.get(plan.structureAt.get(key(x, 0, z))!)?.role;
const RULES = { minLength: 6, minDepth: 3, water: 2 };

describe('R-D00: when a dock is a port', () => {
  test('a block 3 deep and 6 long against the shore is a port; 2 deep or 5 long is a quay', () => {
    const plan = town((b) => {
      fill(b, 6, 20, 11, 22); // 6 × 3: the smallest port
      fill(b, 14, 20, 18, 22); // 5 long: too short
      fill(b, 22, 20, 29, 21); // 2 deep: too shallow
    });
    expect(roleAt(plan, 6, 20)).toBe('port');
    expect(roleAt(plan, 14, 20)).toBe('quay');
    expect(roleAt(plan, 22, 20)).toBe('quay');
    expect(plan.roles.get(plan.structureAt.get(key(6, 0, 20))!)!.rule).toBe('R-D00.port');
  });

  test('the way it lies: the length along the shore, the depth out to sea', () => {
    const plan = town((b) => fill(b, 6, 20, 17, 23));
    const s = plan.structures.get(plan.structureAt.get(key(6, 0, 20))!)!;
    const p = portOf(plan, s.cells, RULES)!;
    expect(p).toMatchObject({ landward: 0, seaward: 2, along: 1, length: 12, depth: 4, x0: 6, z0: 20 });
    expect(keyX(portCell(p, 11, 3))).toBe(17);
    expect(keyZ(portCell(p, 11, 3))).toBe(23);
  });

  test('an L-shape is not a port; nor is a rectangle with a gap out on the water', () => {
    const plan = town((b) => {
      fill(b, 6, 20, 11, 22);
      fill(b, 12, 20, 13, 20); // a tail along the shore: no longer a rectangle
      fill(b, 20, 20, 27, 22);
      b.erase(23, 0, 21); // a hole in the middle row
    });
    expect(roleAt(plan, 6, 20)).toBe('quay');
    expect(roleAt(plan, 20, 20)).not.toBe('port');
  });

  test('a gap in the inner row is allowed only where the land itself comes out', () => {
    const t = new TerrainBuilder(9);
    t.flat(1).water(4, 20, 43, 43).rect(8, 20, 8, 20, 1); // a nose of land at (8, 20)
    const terrain = t.build();
    const b = new TownBuilder(emptyWorld(9), terrain);
    fill(b, 6, 20, 7, 22);
    fill(b, 9, 20, 13, 22);
    fill(b, 8, 21, 8, 22);
    const plan = resolveShape(b.world, terrain);
    expect(roleAt(plan, 6, 20)).toBe('port');
    // The same gap over water is a hole: not a port.
    const plan2 = town((b2) => {
      fill(b2, 6, 20, 7, 22);
      fill(b2, 9, 20, 13, 22);
      fill(b2, 8, 21, 8, 22);
    });
    expect(roleAt(plan2, 6, 20)).not.toBe('port');
  });

  test('it must face open water: a block in a narrow channel is not a port', () => {
    const t = new TerrainBuilder(9);
    t.flat(1).water(4, 20, 43, 23);
    const terrain = t.build();
    const b = new TownBuilder(emptyWorld(9), terrain);
    fill(b, 6, 20, 13, 22); // one row of water left beyond it, then land
    const plan = resolveShape(b.world, terrain);
    expect(roleAt(plan, 6, 20)).not.toBe('port');
  });
});

describe('the port’s cranes and yard', () => {
  test('crane count by length', () => {
    expect(craneKinds(6)).toEqual(['medium']);
    expect(craneKinds(9)).toEqual(['medium']);
    expect(craneKinds(10)).toEqual(['large', 'medium']);
    expect(craneKinds(13)).toEqual(['large', 'medium']);
    expect(craneKinds(14)).toEqual(['large', 'medium', 'large']);
    expect(craneKinds(30)).toEqual(['large', 'medium', 'large', 'medium']);
    expect(craneKinds(5)).toEqual([]);
  });

  test('cranes stand inside the port, in order, and a large crane’s rails keep clear of its neighbours', () => {
    for (const len of [6, 9, 10, 12, 13, 14, 18, 24, 30]) {
      const cranes = cranesOf(len);
      for (let k = 0; k < cranes.length; k++) {
        const c = cranes[k]!;
        expect(c.lo).toBeGreaterThanOrEqual(0.9);
        expect(c.hi).toBeLessThanOrEqual(len - 0.9);
        expect(c.lo).toBeLessThanOrEqual(c.at);
        expect(c.hi).toBeGreaterThanOrEqual(c.at);
        if (k > 0) expect(c.lo).toBeGreaterThan(cranes[k - 1]!.hi);
      }
    }
  });

  test('the yard: stacks two cells long, an aisle across every few cells, the office and its unpacking bay', () => {
    const plan = town((b) => fill(b, 6, 20, 17, 23));
    const s = plan.structures.get(plan.structureAt.get(key(6, 0, 20))!)!;
    const p = portOf(plan, s.cells, RULES)!;
    const y = yardOf(p);
    expect(y.rows).toEqual([1, 0]);
    expect(y.office).toEqual({ i: 0, r: 0 });
    expect(y.pile).toEqual({ i: 3, r: 0 });
    expect(y.stacks.find((k) => k.unpack)).toMatchObject({ i: 1, r: 0, max: 1 });
    // No stack covers an aisle, the office or another stack; never more than four cells without an aisle.
    const used = new Set<string>();
    for (const k of y.stacks) {
      for (const i of [k.i, k.i + 1]) {
        expect(aisleAt(i)).toBe(false);
        expect(used.has(`${i},${k.r}`)).toBe(false);
        used.add(`${i},${k.r}`);
        expect(i).toBeLessThan(p.length);
      }
      expect(k.r).toBeLessThanOrEqual(p.depth - 3);
    }
    expect(used.has('0,0')).toBe(false);
    let run = 0;
    for (let i = 0; i < p.length; i++) {
      run = aisleAt(i) ? 0 : run + 1;
      expect(run).toBeLessThanOrEqual(i < 3 ? 3 : 4);
    }
    expect(y.masts.length).toBe(2);
  });
});
