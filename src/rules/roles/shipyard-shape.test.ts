// R-D05: which docks are shipyards. The scenario (scenarios/rules/R-D05.shipyard.scenario.ts) shows the
// common cases side by side; these pin the edges one town at a time.

import { describe, expect, test } from 'vitest';
import { keyX, keyZ } from '@/core/grid';
import { resolveTown } from '@/resolve/index';
import { TerrainBuilder, TownBuilder } from '@/scenario';
import { emptyWorld } from '@/world/world';
import { yardShape } from './shipyard-shape';

/** Sea from z = 30 south; a dock x0..x1 from the shore out to z1; a warehouse by its land end if `shed`. */
function town(x0: number, x1: number, z1: number, opts: { shed?: boolean; extra?: (b: TownBuilder) => void } = {}) {
  const t = new TerrainBuilder(5);
  t.flat(1);
  t.water(4, 30, 43, 43);
  const ground = t.build();
  const b = new TownBuilder(emptyWorld(5), ground);
  for (let x = x0; x <= x1; x++) for (let z = 30; z <= z1; z++) b.block('dock', x, 0, z);
  if (opts.shed !== false) b.house(x0, 26, { w: 3, d: 2, floors: 2, color: 7 });
  b.path(x0 - 2, 28, x1 + 4, 28);
  opts.extra?.(b);
  const { shape } = resolveTown(b.world, ground);
  const dock = [...shape.structures.values()].find((s) => s.kind === 'dock')!;
  return { shape, dock, role: shape.roles.get(dock.id)?.role };
}

describe('R-D05 shipyard', () => {
  test('3 wide and 6 long straight out from the shore, with a warehouse by its land end: a shipyard building cogs', () => {
    const { role, shape, dock } = town(20, 22, 35);
    expect(role).toBe('shipyard');
    const yard = yardShape(shape, dock.cells)!;
    expect(yard.ship).toBe('cog');
    expect(yard.slip.map((c) => [keyX(c), keyZ(c)])).toEqual([[21, 30], [21, 31], [21, 32], [21, 33], [21, 34], [21, 35]]);
    // Looking out to sea (south) the left side is to the east.
    expect(keyX(yard.left[0]!)).toBe(22);
    expect(yard.seaward).toBe(2);
  });

  test('the same dock with no shed near it is a jetty', () => {
    expect(town(20, 22, 35, { shed: false }).role).toBe('jetty');
  });

  test('a shed four cells off is too far', () => {
    expect(town(20, 22, 35, { shed: false, extra: (b) => b.house(24, 25, { w: 3, d: 2, floors: 2, color: 7 }) }).role).not.toBe('shipyard');
  });

  test('2 wide is not a shipyard', () => {
    expect(town(20, 21, 35).role).not.toBe('shipyard');
  });

  test('4 wide is not a shipyard', () => {
    expect(town(20, 23, 35).role).not.toBe('shipyard');
  });

  test('7 long is a shipyard (cogs); 8 long builds galleons; 5 long is too short', () => {
    expect(town(20, 22, 36).role).toBe('shipyard');
    const long = town(20, 22, 37);
    expect(long.role).toBe('shipyard');
    expect(yardShape(long.shape, long.dock.cells)!.ship).toBe('galleon');
    expect(town(20, 22, 34).role).not.toBe('shipyard');
  });

  test('a block standing on the slip, or land in the way of the launch, spoils it', () => {
    expect(town(20, 22, 35, { extra: (b) => b.block('house', 21, 1, 33) }).role).not.toBe('shipyard');
    // A dock across the end of the slip joins it into another shape; a house on stilts just past it blocks the water.
    expect(town(20, 22, 35, { extra: (b) => b.block('house', 21, 0, 37) }).role).not.toBe('shipyard');
  });

  test('not an L or a dock along the shore', () => {
    expect(town(20, 22, 35, { extra: (b) => b.block('dock', 23, 0, 30) }).role).not.toBe('shipyard');
    expect(town(14, 21, 32).role).not.toBe('shipyard');
  });
});
