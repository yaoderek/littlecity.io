// A shipping container (the port, src/life/port): two cells long, a cell
// wide, half a storey tall, in one of six palette colours. Its long sides are
// corrugated: a row of grooves whose creases the pen draws as lines. Its
// doors are at one end, two leaves with their locking bars; the 'open'
// variant has none (an open dark mouth: the leaves are instances of their
// own, swung open by the dock workers).
//
// Frame: the middle of its floor, +Z along its length, the doors at −Z.
// It is spawned (the yard's stacks, a cargo ship's deck, a crane's load),
// never part of the plan.

import type { Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type ColorInput, type MeshBuilder } from '@/gen/mesh';
import { flat } from '@/parts/actors/boats/hull';
import { PALETTE } from '@/style/palette';
import { PORT } from '@/style/port';
import { containerColor } from './kit';

const GROOVES = 6;

/** One long side at x = side · W/2: flat panels between V-grooves, from the floor to the roof. */
function corrugatedSide(b: MeshBuilder, side: 1 | -1, L: number, W: number, H: number): void {
  const x = (side * W) / 2;
  const depth = 0.032 * side;
  const gw = 0.07;
  const n: Vec3 = [side, 0, 0];
  const panel = (z0: number, z1: number): void => {
    const pts: Vec3[] = [[x, 0, z0], [x, 0, z1], [x, H, z1], [x, H, z0]];
    flat(b, side > 0 ? pts : [pts[1]!, pts[0]!, pts[3]!, pts[2]!], n);
  };
  const step = L / (GROOVES + 1);
  let z = -L / 2;
  for (let g = 1; g <= GROOVES; g++) {
    const zc = -L / 2 + step * g;
    panel(z, zc - gw / 2);
    // The groove: in and out again, each face turned well past the pen's crease angle.
    const a: Vec3 = [x, 0, zc - gw / 2], m: Vec3 = [x - depth, 0, zc], c: Vec3 = [x, 0, zc + gw / 2];
    const up = (p: Vec3): Vec3 => [p[0], H, p[2]];
    const n1: Vec3 = [side * 0.6, 0, 0.8], n2: Vec3 = [side * 0.6, 0, -0.8];
    const q1: Vec3[] = [a, m, up(m), up(a)], q2: Vec3[] = [m, c, up(c), up(m)];
    flat(b, side > 0 ? q1 : [q1[1]!, q1[0]!, q1[3]!, q1[2]!], n1);
    flat(b, side > 0 ? q2 : [q2[1]!, q2[0]!, q2[3]!, q2[2]!], n2);
    z = zc + gw / 2;
  }
  panel(z, L / 2);
}

/** The box: corrugated long sides, a flat roof and floor, the far end, and the door end unless open. */
export function drawContainer(b: MeshBuilder, color: ColorInput, open: boolean): void {
  const L = PORT.boxL, W = PORT.boxW, H = PORT.boxH;
  b.with({ color, pattern: PATTERN.none, ink: 'box' }, () => {
    corrugatedSide(b, 1, L, W, H);
    corrugatedSide(b, -1, L, W, H);
    flat(b, [[-W / 2, H, -L / 2], [W / 2, H, -L / 2], [W / 2, H, L / 2], [-W / 2, H, L / 2]], [0, 1, 0]);
    flat(b, [[-W / 2, 0, L / 2], [W / 2, 0, L / 2], [W / 2, 0, -L / 2], [-W / 2, 0, -L / 2]], [0, -1, 0]);
    // The far end.
    flat(b, [[W / 2, 0, L / 2], [-W / 2, 0, L / 2], [-W / 2, H, L / 2], [W / 2, H, L / 2]], [0, 0, 1]);
    if (!open) flat(b, [[-W / 2, 0, -L / 2], [W / 2, 0, -L / 2], [W / 2, H, -L / 2], [-W / 2, H, -L / 2]], [0, 0, -1]);
  });
  if (open) {
    // The open mouth: the dark inside, a little way in.
    b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'inside' }, () => {
      const z = -L / 2 + 0.12, i = 0.03;
      flat(b, [[-W / 2 + i, i, z], [W / 2 - i, i, z], [W / 2 - i, H - i, z], [-W / 2 + i, H - i, z]], [0, 0, -1]);
      flat(b, [[-W / 2 + i, i, -L / 2], [W / 2 - i, i, -L / 2], [W / 2 - i, i, z], [-W / 2 + i, i, z]], [0, 1, 0]);
      flat(b, [[-W / 2 + i, H - i, z], [W / 2 - i, H - i, z], [W / 2 - i, H - i, -L / 2], [-W / 2 + i, H - i, -L / 2]], [0, -1, 0]);
      flat(b, [[W / 2 - i, i, -L / 2], [W / 2 - i, H - i, -L / 2], [W / 2 - i, H - i, z], [W / 2 - i, i, z]], [-1, 0, 0]);
      flat(b, [[-W / 2 + i, i, z], [-W / 2 + i, H - i, z], [-W / 2 + i, H - i, -L / 2], [-W / 2 + i, i, -L / 2]], [1, 0, 0]);
    });
    return;
  }
  // The two door leaves, standing a little proud, with their locking bars.
  for (const s of [1, -1] as const) drawDoorLeaf(b, color, s, [(s * W) / 2, 0, -L / 2]);
}

/**
 * One door leaf, shut, hung on its hinge line whose foot is `hinge` (the box's corner at the door end), on
 * the `side` (+1 the leaf hinged at +X, −1 at −X): it reaches across toward the middle and faces −Z.
 */
export function drawDoorLeaf(b: MeshBuilder, color: ColorInput, side: 1 | -1, hinge: Vec3): void {
  const H = PORT.boxH;
  const leaf = PORT.boxW / 2 - 0.012;
  const t = 0.014;
  const x0 = hinge[0], x1 = hinge[0] - side * leaf, z = hinge[2] - t;
  b.with({ color, pattern: PATTERN.none, ink: `door${side}` }, () => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    b.box([lo, hinge[1] + 0.015, z - 0.012], [hi, hinge[1] + H - 0.015, z + 0.012], { skip: ['s'] });
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: `bars${side}` }, () => {
    for (const u of [leaf * 0.3, leaf * 0.74]) b.boxAt([x0 - side * u, hinge[1] + 0.03, z - 0.02], [0.024, H - 0.06, 0.016]);
  });
}

export default definePart({
  actor: 'container',
  build(item, ctx) {
    const b = ctx.mesh();
    drawContainer(b, containerColor(item.params?.look ?? 0), item.variant === 'open');
    return { mesh: b.build(), animated: true };
  },
});

/** A door leaf on its own (swung by the dock workers). Frame: the foot of its hinge line. */
export const doorLeaf = definePart({
  actor: 'container-door',
  build(item, ctx) {
    const b = ctx.mesh();
    drawDoorLeaf(b, containerColor(item.params?.look ?? 0), (item.params?.side ?? 1) < 0 ? -1 : 1, [0, 0, 0]);
    return { mesh: b.build(), animated: true };
  },
});
