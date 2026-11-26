// J23-P: the port's deck. A pale concrete apron laid over the dock's boards
// (paving: one slab to a cell), a lip down its open edges so the quay reads
// as concrete on timber piles; two steel crane rails along the seaward rows;
// a yellow lane line where the crane rows meet the yard; white corner marks
// for each container bay.
//
// Frame: the feature's dock cell (level 0), its centre, world axes. The port
// is rebuilt from the feature's params (port-shape.ts); the yard from the
// port and what stands on the deck.

import { CELL_H, DIR4, key, keyX, keyZ, opposite, type Dir4 } from '@/core/grid';
import type { Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { flat } from '@/parts/actors/boats/hull';
import { deckTaken } from '@/rules/roles/dock-shape';
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
    const has = (i: number, r: number): boolean => mine.has(portCell(p, i, r));
    const [sx, sz] = DIR4[p.seaward]!;
    const [ax, az] = DIR4[p.along]!;
    // ── the apron: a slab over every cell, and a lip down the open edges ──
    const ap = top + 0.016;
    const over = DOCK.over + 0.02;
    b.with({ color: PALETTE.stoneShade, pattern: PATTERN.paving, ink: 'apron' }, () => {
      for (let i = 0; i < p.length; i++) {
        for (let r = 0; r < p.depth; r++) {
          if (!has(i, r)) continue;
          const bIn = p.depth - r, bOut = p.depth - r - 1;
          const a0 = i === 0 ? -over : i, a1 = i === p.length - 1 ? p.length + over : i + 1;
          strip(b, p, o, a0, bOut === 0 ? -over : bOut, a1, bIn, ap);
        }
      }
      // The lip: down the seaward face and the two ends (where they stand on the water).
      const drop = 0.11;
      const face = (a0: number, b0: number, a1: number, b1: number, n: Vec3): void => {
        const [x0, z0] = portPoint(p, a0, b0), [x1, z1] = portPoint(p, a1, b1);
        const q: Vec3[] = [[x0 - o[0], ap - drop, z0 - o[2]], [x1 - o[0], ap - drop, z1 - o[2]], [x1 - o[0], ap, z1 - o[2]], [x0 - o[0], ap, z0 - o[2]]];
        const cr = (q[1]![0] - q[0]![0]) * n[2] - (q[1]![2] - q[0]![2]) * n[0];
        flat(b, cr > 0 ? q : [q[1]!, q[0]!, q[3]!, q[2]!], n);
      };
      face(-over, -over, p.length + over, -over, [sx, 0, sz]);
      const firstRow = (i: number): number => (has(i, 0) ? 0 : 1);
      face(-over, p.depth - firstRow(0), -over, -over, [-ax, 0, -az]);
      face(p.length + over, -over, p.length + over, p.depth - firstRow(p.length - 1), [ax, 0, az]);
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
