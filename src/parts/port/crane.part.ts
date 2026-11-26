// The port's container cranes (D15-P): the frames that stand on the rails,
// and their moving pieces (spawned by the port system, src/life/port).
//
//   medium  a slewing jib crane: a four-legged portal you can walk under,
//           a slewing house on top (machinery, the cab with its windows, an
//           A-frame, a counterweight) and a lattice jib that luffs. Red or
//           orange with white.
//   large   a ship-to-shore gantry, the A-frame kind: two pairs of tall legs
//           on the rails, the boom girders high over them reaching back over
//           the yard, an A-frame on top with the backstays, the machinery
//           house on the back reach. The outreach boom is its own piece: it
//           hinges up to near-upright when idle, the signature look from far
//           off, and lies out over the water to work. A trolley with the
//           driver's cab runs along it; a spreader hangs on four ropes. Blue
//           or teal with white.
//
// Both have a red light on top and floodlights (PATTERN.glow: they light up
// by themselves at dusk).
//
// The frame (an actor on its home deck cell, +Z toward the water): its own
// middle is drawn at (off, 0, 0.5), the boundary between the two crane rows,
// so that +X runs along the rails, +Z out to sea, y = 0 the deck. The rails
// are at z = ±RAIL from that middle; the quay's edge on the water is 1 out.
// Socket name 'perch' (the top of the frame: gulls).

import { compose, rotationY, translation, type Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { PALETTE } from '@/style/palette';
import { PORT } from '@/style/port';
import { cranePaint, floodlight, lamp, member, type CranePaint } from './kit';

/** Half the gauge of the crane rails. */
export const RAIL = 0.72;
/** The large crane: legs this far either side of its middle along the rails; the boom girders this far apart (half). */
export const LEG_X = 0.62;
export const GIRDER_X = 0.3;
/** Where the outreach boom hinges (z from the crane's middle), and the apex of the A-frame (height, z). */
export const HINGE_Z = 0.95;
export const APEX_Y = 4.05;
export const APEX_Z = 0.05;
/** The medium crane: the jib's hinge on the slewing house (y above the ring, z forward), the A-frame's apex. */
export const JIB_HINGE: Vec3 = [0, 0.4, 0.22];
export const MEDIUM_APEX: Vec3 = [0, 1.32, -0.28];
/** The slewing ring's top above the deck. */
export const ringTop = (): number => PORT.mediumPortal + 0.08;

/** A bogie on the rail under a foot: a dark box with its wheels. */
function bogie(b: MeshBuilder, x: number, z: number, len: number, ink: string): void {
  b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink }, () => {
    b.boxAt([x, 0, z], [len, 0.13, 0.16], { skip: ['bottom'] });
    // The wheels' hubs on the outer side.
    for (const dx of [-len * 0.3, len * 0.3]) b.boxAt([x + dx, 0.015, z + 0.09], [0.11, 0.1, 0.02]);
  });
}

/** The medium crane's portal: four legs splayed out to the rails, ties along each rail, a ring girder on top. */
function drawPortal(b: MeshBuilder, paint: CranePaint): void {
  const P = PORT.mediumPortal;
  const feet: Vec3[] = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) feet.push([sx * 0.46, 0.13, sz * RAIL]);
  const top = (f: Vec3): Vec3 => [Math.sign(f[0]) * 0.3, P - 0.12, Math.sign(f[2]) * 0.38];
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'portal' }, () => {
    for (const f of feet) member(b, f, top(f), 0.11);
    // The ring girder: four box beams round the top.
    for (const sz of [1, -1]) member(b, [-0.36, P - 0.06, sz * 0.38], [0.36, P - 0.06, sz * 0.38], 0.12, 0.13);
    for (const sx of [1, -1]) member(b, [sx * 0.3, P - 0.06, -0.44], [sx * 0.3, P - 0.06, 0.44], 0.12, 0.13);
    // Along each rail: a tie between the two legs, and a brace (you walk along between them).
    for (const sz of [1, -1]) {
      const zz = sz * (RAIL - (RAIL - 0.38) * (0.95 / P));
      member(b, [-0.4, 0.95, zz], [0.4, 0.95, zz], 0.07);
      member(b, [-0.43, 0.3, sz * (RAIL - 0.05)], [0.38, 0.92, zz], 0.055);
    }
  });
  for (const f of feet) bogie(b, f[0], f[2], 0.36, 'bogies');
  // The slewing ring and a white band round the top.
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'trim' }, () => {
    for (const sz of [1, -1]) b.boxAt([0, P, sz * 0.38], [0.84, 0.035, 0.14]);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'ring' }, () => b.lathe([[0.34, P], [0.34, P + 0.08], [0, P + 0.08]], { segments: 14 }));
}

/** The large crane's frame: legs, sills, portal beams, the boom girders' back reach, the A-frame, the machinery house. */
function drawGantry(b: MeshBuilder, paint: CranePaint): Vec3 {
  const B = PORT.largeBoomY;
  const T = B - 0.3;
  const back = -PORT.largeBack;
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'legs' }, () => {
    for (const sx of [1, -1]) for (const sz of [1, -1]) member(b, [sx * LEG_X, 0.28, sz * RAIL], [sx * LEG_X, T + 0.1, sz * RAIL], 0.15);
    // Sills along each rail, portal beams across, and ties along at the top.
    for (const sz of [1, -1]) member(b, [-0.86, 0.21, sz * RAIL], [0.86, 0.21, sz * RAIL], 0.16, 0.16);
    for (const sx of [1, -1]) member(b, [sx * LEG_X, T + 0.06, -0.9], [sx * LEG_X, T + 0.06, 0.9], 0.15, 0.2);
    for (const sz of [1, -1]) member(b, [-LEG_X, T + 0.06, sz * RAIL], [LEG_X, T + 0.06, sz * RAIL], 0.12, 0.16);
    // The landward legs braced (the seaward pair stands open over the way along).
    member(b, [-LEG_X, 0.3, -RAIL], [LEG_X, 1.7, -RAIL], 0.07);
    member(b, [LEG_X, 0.3, -RAIL], [-LEG_X, 1.7, -RAIL], 0.07);
    member(b, [-LEG_X, 1.7, -RAIL], [LEG_X, 1.7, -RAIL], 0.08);
  });
  for (const sx of [1, -1]) for (const sz of [1, -1]) bogie(b, sx * LEG_X, sz * RAIL, 0.42, 'bogies');
  // The boom girders' fixed part: from the back reach over the yard to the hinge, on posts over the portal.
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'girders' }, () => {
    for (const sx of [1, -1]) {
      member(b, [sx * GIRDER_X, B, back], [sx * GIRDER_X, B, HINGE_Z], 0.12, 0.2);
      for (const sz of [1, -1]) member(b, [sx * GIRDER_X, T + 0.14, sz * RAIL], [sx * GIRDER_X, B - 0.08, sz * RAIL], 0.08);
    }
    member(b, [-GIRDER_X, B, back + 0.06], [GIRDER_X, B, back + 0.06], 0.12, 0.2);
  });
  // The A-frame: an A on each side over the legs, joined at the apex; backstays down to the back reach.
  const apex = (sx: number): Vec3 => [sx * 0.24, APEX_Y, APEX_Z];
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'aframe' }, () => {
    for (const sx of [1, -1]) {
      member(b, [sx * GIRDER_X, B + 0.08, RAIL], apex(sx), 0.11);
      member(b, [sx * GIRDER_X, B + 0.08, -RAIL], apex(sx), 0.11);
      member(b, [sx * GIRDER_X, B + 0.6, -0.45], [sx * GIRDER_X, B + 0.6, 0.48], 0.06);
      member(b, apex(sx), [sx * GIRDER_X, B + 0.1, back + 0.15], 0.06);
    }
    member(b, [-0.3, APEX_Y, APEX_Z], [0.3, APEX_Y, APEX_Z], 0.16, 0.16);
  });
  // The machinery house on the back reach, white, a band of windows, its roof in the crane's colour.
  const hz0 = back + 0.25, hz1 = back + 1.45;
  b.with({ color: paint.house, pattern: PATTERN.none, ink: 'house' }, () => b.box([-0.44, B + 0.1, hz0], [0.44, B + 0.62, hz1], { skip: ['bottom'] }));
  b.with({ color: paint.roof, pattern: PATTERN.none, ink: 'house-roof' }, () => b.box([-0.48, B + 0.62, hz0 - 0.04], [0.48, B + 0.68, hz1 + 0.04]));
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'house-windows' }, () => {
    for (const sx of [1, -1]) b.box([sx > 0 ? 0.44 : -0.455, B + 0.36, hz0 + 0.15], [sx > 0 ? 0.455 : -0.44, B + 0.5, hz1 - 0.15]);
  });
  // White handrails along the girders' tops, from the house to the hinge.
  b.with({ color: paint.trim, pattern: PATTERN.none, ink: 'rails' }, () => {
    for (const sx of [1, -1]) member(b, [sx * (GIRDER_X + 0.05), B + 0.26, hz1 + 0.05], [sx * (GIRDER_X + 0.05), B + 0.26, HINGE_Z - 0.05], 0.035);
  });
  // Lights: red on top, floods under the hinge and under the back reach.
  lamp(b, [0, APEX_Y + 0.16, APEX_Z], 0.085, PALETTE.red, 'top-light');
  b.at(translation(0, B - 0.2, HINGE_Z - 0.1), () => floodlight(b, [0, 0, 0], 0.18, 'flood-front'));
  b.at(compose(translation(0, B - 0.2, back + 0.35), rotationY(Math.PI)), () => floodlight(b, [0, 0, 0], 0.18, 'flood-back'));
  return [0, APEX_Y + 0.25, APEX_Z];
}

export default definePart({
  actor: 'port-crane',
  build(item, ctx) {
    const b = ctx.mesh();
    const kind = item.variant === 'large' ? 'large' : 'medium';
    const paint = cranePaint(kind, item.params?.look ?? 0);
    const off = item.params?.off ?? 0;
    let perch: Vec3 = [0, 0, 0];
    b.at(translation(off, 0, 0.5), () => {
      if (kind === 'medium') {
        drawPortal(b, paint);
        perch = [0.3, PORT.mediumPortal + 0.02, -0.38];
      } else perch = drawGantry(b, paint);
    });
    return { mesh: b.build(), animated: true, anchors: { perch: translation(perch[0] + off, perch[1], perch[2] + 0.5) } };
  },
});

// ── the moving pieces ───────────────────────────────────────────────────

/** The medium crane's slewing house. Frame: the slewing ring's top centre, +Z toward the jib. */
function drawMediumTop(b: MeshBuilder, paint: CranePaint): void {
  b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'table' }, () => b.box([-0.36, 0, -0.86], [0.36, 0.06, 0.3], { skip: ['bottom'] }));
  // Machinery house with a white roof; a counterweight hung on its back.
  b.with({ color: paint.house, pattern: PATTERN.none, ink: 'house' }, () => b.box([-0.32, 0.06, -0.66], [0.32, 0.6, 0.1], { skip: ['bottom'] }));
  b.with({ color: paint.roof, pattern: PATTERN.none, ink: 'roof' }, () => b.box([-0.35, 0.6, -0.69], [0.35, 0.65, 0.13]));
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'louvres' }, () => {
    for (const sx of [1, -1]) b.box([sx > 0 ? 0.32 : -0.335, 0.34, -0.5], [sx > 0 ? 0.335 : -0.32, 0.46, -0.2]);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'counterweight' }, () => b.box([-0.3, 0.08, -0.9], [0.3, 0.46, -0.66], { skip: ['bottom'] }));
  // The cab, out front to one side of the jib: white, glazed on the front and the outer side.
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'cab' }, () => b.box([0.16, 0.06, 0.1], [0.44, 0.48, 0.44], { skip: ['bottom'] }));
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'cab-roof' }, () => b.box([0.14, 0.48, 0.08], [0.46, 0.52, 0.46]));
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'cab-glass' }, () => {
    b.box([0.19, 0.22, 0.44], [0.41, 0.44, 0.455]);
    b.box([0.44, 0.22, 0.14], [0.455, 0.44, 0.4]);
  });
  // The A-frame that carries the luffing ropes, and the jib's hinge brackets.
  const [, ay, az] = MEDIUM_APEX;
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'aframe' }, () => {
    for (const sx of [1, -1]) {
      member(b, [sx * 0.24, 0.64, -0.6], [sx * 0.1, ay, az], 0.07);
      member(b, [sx * 0.24, 0.64, 0.04], [sx * 0.1, ay, az], 0.07);
      b.boxAt([sx * 0.15, 0.06, JIB_HINGE[2]], [0.07, JIB_HINGE[1] + 0.04, 0.16]);
    }
    member(b, [-0.14, ay, az], [0.14, ay, az], 0.09);
  });
  lamp(b, [0, ay + 0.11, az], 0.075, PALETTE.red, 'top-light');
  for (const sx of [1, -1]) b.at(translation(sx * 0.2, 0.62, 0.14), () => floodlight(b, [0, 0, 0], 0.12, `flood${sx}`));
}

/** The medium crane's lattice jib. Frame: its hinge, the jib along +Z. Its head at z = mediumJib. */
function drawMediumJib(b: MeshBuilder, paint: CranePaint): void {
  const L = PORT.mediumJib;
  const lo = (t: number, sx: number): Vec3 => [sx * (0.12 - 0.07 * t), -0.04 * t, t * L];
  const hi = (t: number): Vec3 => [0, 0.17 - 0.1 * t, t * L];
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'jib' }, () => {
    for (const sx of [1, -1]) member(b, lo(0, sx), lo(1, sx), 0.05);
    member(b, hi(0), hi(1), 0.05);
    // The lattice: zig-zags down each side and across the bottom.
    const n = 9;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      for (const sx of [1, -1]) member(b, lo(t0, sx), hi(t1), 0.026);
      member(b, lo(t0, 1), lo(t1, -1), 0.024);
    }
  });
  // The head: a white nose and the sheaves.
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'head' }, () => b.boxAt([0, -0.08, L - 0.02], [0.12, 0.22, 0.14]));
  b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'sheave' }, () => b.at(compose(translation(0, -0.02, L + 0.04), rotationY(Math.PI / 2)), () => b.lathe([[0.06, -0.025], [0.07, 0], [0.06, 0.025]], { segments: 10 })));
}

/** The large crane's outreach boom. Frame: its hinge (between the girders), the boom along +Z. */
function drawLargeBoom(b: MeshBuilder, paint: CranePaint): void {
  const L = PORT.largeOut + 1.0 - HINGE_Z;
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'boom' }, () => {
    for (const sx of [1, -1]) member(b, [sx * GIRDER_X, 0, 0.02], [sx * GIRDER_X, 0, L], 0.12, 0.2);
    member(b, [-GIRDER_X, 0, L - 0.06], [GIRDER_X, 0, L - 0.06], 0.12, 0.2);
    // Cross ties underneath, every so often.
    for (let z = 0.8; z < L - 0.3; z += 1.1) member(b, [-GIRDER_X, -0.07, z], [GIRDER_X, -0.07, z], 0.05);
  });
  b.with({ color: paint.trim, pattern: PATTERN.none, ink: 'boom-rails' }, () => {
    for (const sx of [1, -1]) member(b, [sx * (GIRDER_X + 0.05), 0.26, 0.1], [sx * (GIRDER_X + 0.05), 0.26, L - 0.1], 0.035);
  });
  // Where the forestays take hold: two lugs on the girders' tops.
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'lugs' }, () => {
    for (const sx of [1, -1]) b.boxAt([sx * GIRDER_X, 0.1, L * 0.68], [0.08, 0.12, 0.16]);
  });
  lamp(b, [0, 0.2, L - 0.05], 0.05, PALETTE.red, 'tip-light');
}

/** The trolley and its cab. Frame: on the boom's centre line at the girders' middle height, +Z toward the water. */
function drawTrolley(b: MeshBuilder, paint: CranePaint): void {
  b.with({ color: paint.trim, pattern: PATTERN.none, ink: 'trolley' }, () => {
    b.box([-0.42, 0.1, -0.26], [0.42, 0.24, 0.26]);
    for (const sx of [1, -1]) b.box([sx > 0 ? 0.36 : -0.44, -0.12, -0.22], [sx > 0 ? 0.44 : -0.36, 0.1, 0.22]);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'hangers' }, () => {
    for (const sx of [1, -1]) member(b, [sx * 0.12, 0.1, 0.32], [sx * 0.12, -0.36, 0.32], 0.04);
  });
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'cab' }, () => b.box([-0.17, -0.66, 0.2], [0.17, -0.34, 0.5]));
  b.with({ color: paint.steel, pattern: PATTERN.none, ink: 'cab-roof' }, () => b.box([-0.19, -0.36, 0.18], [0.19, -0.32, 0.52]));
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'cab-glass' }, () => {
    b.box([-0.14, -0.6, 0.5], [0.14, -0.4, 0.515]);
    for (const sx of [1, -1]) b.box([sx > 0 ? 0.17 : -0.185, -0.58, 0.26], [sx > 0 ? 0.185 : -0.17, -0.42, 0.46]);
  });
}

/** The spreader: a yellow frame the size of a container's roof, its head block on top. Frame: the head block's top, +Z along it. */
function drawSpreader(b: MeshBuilder): void {
  const L = PORT.boxL, W = PORT.boxW;
  b.with({ color: PALETTE.yellow, pattern: PATTERN.none, ink: 'spreader' }, () => {
    for (const sx of [1, -1]) member(b, [sx * (W / 2 - 0.04), -0.15, -L / 2], [sx * (W / 2 - 0.04), -0.15, L / 2], 0.07, 0.08);
    for (const sz of [1, -1]) member(b, [-W / 2, -0.15, sz * (L / 2 - 0.04)], [W / 2, -0.15, sz * (L / 2 - 0.04)], 0.08, 0.08);
    member(b, [0, -0.13, -L / 2 + 0.05], [0, -0.13, L / 2 - 0.05], 0.1, 0.1);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'headblock' }, () => b.box([-0.18, -0.1, -0.16], [0.18, 0, 0.16], { skip: [] }));
}

/** The medium crane's hook block with a lifting beam and its slings. Frame: where the rope ends, +Z along the beam. */
function drawHook(b: MeshBuilder): void {
  const L = PORT.boxL;
  b.with({ color: PALETTE.yellow, pattern: PATTERN.none, ink: 'block' }, () => b.box([-0.07, -0.18, -0.06], [0.07, 0, 0.06]));
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'slings' }, () => {
    for (const sz of [1, -1]) member(b, [0, -0.18, 0], [0, -0.32, sz * (L / 2 - 0.08)], 0.018);
  });
  b.with({ color: PALETTE.yellow, pattern: PATTERN.none, ink: 'beam' }, () => member(b, [0, -0.35, -L / 2 + 0.02], [0, -0.35, L / 2 - 0.02], 0.09, 0.07));
}

/** Hoist ropes a unit long, hanging from the origin down −Y: `n` = 2 (a hook) or 4 (a spreader). */
function drawCables(b: MeshBuilder, n: 2 | 4): void {
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'ropes' }, () => {
    const at: [number, number][] = n === 2 ? [[-0.03, 0], [0.03, 0]] : [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]];
    for (const [x, z] of at) b.box([x - 0.011, -1, z - 0.011], [x + 0.011, 0, z + 0.011], { skip: ['top', 'bottom'] });
  });
}

/** The hook block, spreader and ropes are drawn about their own origin; the houses and booms likewise. */
export const cranePiece = definePart({
  actor: 'crane-piece',
  build(item, ctx) {
    const b = ctx.mesh();
    const look = item.params?.look ?? 0;
    switch (item.variant) {
      case 'medium-top':
        drawMediumTop(b, cranePaint('medium', look));
        break;
      case 'medium-jib':
        drawMediumJib(b, cranePaint('medium', look));
        break;
      case 'large-boom':
        drawLargeBoom(b, cranePaint('large', look));
        break;
      case 'trolley':
        drawTrolley(b, cranePaint('large', look));
        break;
      case 'spreader':
        drawSpreader(b);
        break;
      case 'hook':
        drawHook(b);
        break;
      case 'cables4':
        drawCables(b, 4);
        break;
      default:
        drawCables(b, 2);
    }
    return { mesh: b.build(), animated: true };
  },
});
