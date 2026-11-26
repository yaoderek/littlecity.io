// J23-P: the port's deck. A pale concrete apron laid over the dock's boards,
// every cell of it, extensions and all (paving: one slab to a cell), a lip
// down its open edges so the quay reads
// as concrete on timber piles; two steel crane rails along the seaward rows;
// a yellow lane line where the crane rows meet the yard; white corner marks
// for each container bay.
//
// Frame: the feature's dock cell (level 0), its centre, world axes. The port
// is rebuilt from the feature's params (port-shape.ts); the yard from the
// port and what stands on the deck.

import { CELL_H, DIR4, key, keyX, keyY, keyZ, opposite, type Dir4 } from '@/core/grid';
import type { Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { flat } from '@/parts/actors/boats/hull';
import { deckTaken, DIRS, dockSide } from '@/rules/roles/dock-shape';
import { portCell, portPoint, yardOf, type Port } from '@/rules/roles/port-shape';
import { DOCK } from '@/style/dock';
import { PALETTE } from '@/style/palette';
import { PORT } from '@/style/port';
import { RAIL } from './crane.part';

/** The port a port-deck feature describes. */
export function portOfDeck(cell: number, p: { landward?: number; length?: number; depth?: number; dx?: number; dz?: number }): Port {
  const landward = ((p.landward ?? 0) & 3) as Dir4;
  return {
    landward,
    seaward: opposite(landward),
    along: landward === 0 || landward === 2 ? 1 : 2,
    x0: keyX(cell) + (p.dx ?? 0),
    z0: keyZ(cell) + (p.dz ?? 0),
    length: p.length ?? 1,
    depth: p.depth ?? 1,
  };
}

/** A flat strip on the deck in port coordinates (a along, b in from the water), `lift` above the apron. */
function strip(b: MeshBuilder, p: Port, o: Vec3, a0: number, b0: number, a1: number, b1: number, y: number): void {
  const pts = [portPoint(p, a0, b0), portPoint(p, a1, b0), portPoint(p, a1, b1), portPoint(p, a0, b1)].map(([x, z]): Vec3 => [x - o[0], y, z - o[2]]);
  // Counter-clockwise seen from above.
  const [a, c] = [pts[0]!, pts[2]!];
  const cross = (pts[1]![0] - a[0]) * (c[2] - a[2]) - (pts[1]![2] - a[2]) * (c[0] - a[0]);
  flat(b, cross < 0 ? pts : [...pts].reverse(), [0, 1, 0]);
}

export default definePart({
  feature: 'port-deck',
  build(item, ctx) {
    const b = ctx.mesh();
    const cell = item.cell!;
    const p = portOfDeck(cell, item.params ?? {});
    const o: Vec3 = [keyX(cell) + 0.5, 0, keyZ(cell) + 0.5];
    const top = CELL_H + 0.004;
    const mine = new Set(ctx.structure?.cells ?? []);
    const [ax, az] = DIR4[p.along]!;
    // ── the apron: a slab over every cell of the dock (extensions too), and a lip down its open edges ──
    const ap = top + 0.016;
    const over = DOCK.over + 0.02;
    const drop = 0.11;
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.paving, ink: 'apron' }, () => {
      for (const c of ctx.structure?.cells ?? []) {
        if (keyY(c) !== 0) continue;
        const open = DIRS.map((d) => dockSide(ctx.plan, c, d) === 'open');
        const x0 = keyX(c) - (open[3] ? over : 0) - o[0], x1 = keyX(c) + 1 + (open[1] ? over : 0) - o[0];
        const z0 = keyZ(c) - (open[0] ? over : 0) - o[2], z1 = keyZ(c) + 1 + (open[2] ? over : 0) - o[2];
        flat(b, [[x0, ap, z0], [x1, ap, z0], [x1, ap, z1], [x0, ap, z1]], [0, 1, 0]);
        // The lip down each open side.
        const lip = (p0: Vec3, p1: Vec3, n: Vec3): void => flat(b, [p0, p1, [p1[0], ap, p1[2]], [p0[0], ap, p0[2]]], n);
        if (open[0]) lip([x0, ap - drop, z0], [x1, ap - drop, z0], [0, 0, -1]);
        if (open[2]) lip([x0, ap - drop, z1], [x1, ap - drop, z1], [0, 0, 1]);
        if (open[3]) lip([x0, ap - drop, z0], [x0, ap - drop, z1], [-1, 0, 0]);
        if (open[1]) lip([x1, ap - drop, z0], [x1, ap - drop, z1], [1, 0, 0]);
      }
    });
    // ── the crane rails ──
    const y = ap;
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'rails' }, () => {
      for (const bb of [1 - RAIL, 1 + RAIL]) {
        const [x0, z0] = portPoint(p, 0.04, bb), [x1, z1] = portPoint(p, p.length - 0.04, bb);
        const w = 0.05;
        const lo: Vec3 = [Math.min(x0, x1) - o[0] - (ax === 0 ? w / 2 : 0), y, Math.min(z0, z1) - o[2] - (az === 0 ? w / 2 : 0)];
        const hi: Vec3 = [Math.max(x0, x1) - o[0] + (ax === 0 ? w / 2 : 0), y + 0.024, Math.max(z0, z1) - o[2] + (az === 0 ? w / 2 : 0)];
        b.box(lo, hi, { skip: ['bottom'] });
      }
    });
    // ── the lane line along the yard's edge, and the bays' corner marks ──
    if (p.depth >= 3) b.with({ color: PALETTE.yellow, pattern: PATTERN.none, ink: 'lane' }, () => strip(b, p, o, 0.12, 2 - 0.04, p.length - 0.12, 2 + 0.04, y + 0.003));
    const yard = yardOf(p, (i, r) => deckTaken(ctx.plan, portCell(p, i, r)) || !mine.has(portCell(p, i, r)));
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'bays' }, () => {
      const L = 0.26, w = 0.06;
      for (const s of yard.stacks) {
        const a0 = s.i + 0.06, a1 = s.i + 1.94, b0 = p.depth - s.r - 0.94, b1 = p.depth - s.r - 0.06;
        for (const [ca, cb, da, db] of [[a0, b0, 1, 1], [a1, b0, -1, 1], [a0, b1, 1, -1], [a1, b1, -1, -1]] as const) {
          strip(b, p, o, Math.min(ca, ca + da * L), Math.min(cb, cb + db * w), Math.max(ca, ca + da * L), Math.max(cb, cb + db * w), y + 0.003);
          strip(b, p, o, Math.min(ca, ca + da * w), Math.min(cb, cb + db * L), Math.max(ca, ca + da * w), Math.max(cb, cb + db * L), y + 0.003);
        }
      }
    });
    void key;
    void PORT;
    return { mesh: b.build() };
  },
});
