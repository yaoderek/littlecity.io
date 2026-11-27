// The plants (R-P01). Each function draws one plant standing on the local
// origin, from a seeded `r`, into ink groups 'trunk' and 'crown' (plus a few
// of its own). Not a generator file: tree.gen.ts picks the species from the
// structure's role and places it; gardens borrow the bushes.
//
// How a crown is drawn (docs/swarm/ART.md and src/parts/ground/kit.ts):
// a crown is a few lumps, each ONE flat tone. The lumps facing the sun share
// the lit tone, so they melt into one light mass with a scalloped outline;
// the lumps underneath and on the far side share the shade tone, which the
// renderer hatches. So a tree reads as a pen outline, a light mass and a
// scribbled shadow, the way the reference illustrations draw them, and not
// as a pile of shaded balls. All lumps must be emitted in world axes
// (translation and uniform scale only): the tones are world directions.
//
// Seasons: every leafy part carries a FOLIAGE code in `edge` (src/gen/foliage.ts), and a broadleaf
// has a few branches drawn inside its crown, hidden until its leaves fall in autumn.

import type { Vec3 } from '@/core/mat4';
import { FOLIAGE } from '@/gen/foliage';
import { PATTERN, type MeshBuilder, type SwayInput } from '@/gen/mesh';
import { dab, lump, mixColor, mound, SHADE_SIDE, SUN, TONE, toneAt, tube, tuft, vary, type Rgb, type Rng } from '@/parts/ground/kit';
import { TREE } from '@/style/ground';
import { PALETTE } from '@/style/palette';

/** Wind weight rising from 0 at the foot to TREE.sway at `top` (the trunk bends, the crown rides it). */
function swayTo(top: number): SwayInput {
  return (_x, y) => {
    const t = Math.max(0, Math.min(1, y / top));
    return t * t * TREE.sway;
  };
}

function trunk(b: MeshBuilder, r: Rng, points: readonly Vec3[], radius: number, sway: SwayInput, color: Rgb = vary(PALETTE.trunk, r('trunk'), 0.6)): void {
  const radii = points.map((_p, i) => radius * (1 - (i / (points.length - 1)) * 0.3));
  // A leaning trunk's foot ring is tilted: sink it a little so no edge of it lifts off the ground.
  const rooted = points.map((p, i): Vec3 => (i === 0 ? [p[0], p[1] - 0.025, p[2]] : p));
  b.with({ color, pattern: PATTERN.bark, ink: 'trunk', sway }, () => tube(b, rooted, radii, { seg: 6 }));
}

interface CloudOptions {
  x: number;
  y: number;
  z: number;
  /** Radius of the core, and its height as a share of it. */
  R: number;
  squash: number;
  color: Rgb;
  sway: SwayInput;
  /** Small lumps round the rim (the scalloped outline). */
  lumps?: number;
  /** Larger lumps on top (the cloud shape). Default one or two, by seed. */
  tops?: number;
  ink?: string;
  /** The FOLIAGE code (default: a broadleaf's crown). */
  foliage?: number;
}

/**
 * A crown, drawn in exactly two tones. The light mass is a round core with
 * one or two bigger lumps on top and five to seven small ones round its rim,
 * which give it a scalloped outline; it is left plain. The shade is a belly
 * under the core and the rim lumps on the far side, darker and marked with
 * leaves. Everything is finely enough divided that outlines are curves, and
 * light meets shade where two round surfaces cross, so that line is a curve
 * too and wanders with the lumps.
 */
function cloud(b: MeshBuilder, r: Rng, o: CloudOptions): void {
  const { x, y, z, R } = o;
  const ry = R * o.squash;
  const ink = o.ink ?? 'crown';
  const edge = o.foliage ?? FOLIAGE.crown;
  const lit = { color: o.color, pattern: PATTERN.none, ink, sway: o.sway, edge };
  const dark = { color: mixColor(o.color, PALETTE.leafDark, TREE.shadeMix), pattern: PATTERN.leaves, ink, sway: o.sway, edge };
  b.with(lit, () => lump(b, x, y, z, R, ry, R, { seg: 16, rings: 6, normal: TONE.lit, twist: r('tw') * 6 }));
  b.with(dark, () =>
    lump(b, x + SHADE_SIDE[0] * R * 0.2, y - ry * 0.36, z + SHADE_SIDE[1] * R * 0.2, R * 0.93, ry * 0.74, R * 0.93, { seg: 12, rings: 5, normal: TONE.shade, twist: 0.3, facing: [0, -1, 0], cut: -0.35 }),
  );
  // On top: the cloud shape.
  const tops = o.tops ?? 1 + (r('tops') < 0.55 ? 1 : 0);
  const t0 = r('t0') * 6.28;
  b.with(lit, () => {
    for (let j = 0; j < tops; j++) {
      const a = t0 + j * 2.6 + (r('ta', j) - 0.5) * 0.8;
      const d = R * (0.36 + r('td', j) * 0.14), rr = R * (0.46 + r('tr', j) * 0.1), cy = y + ry * (0.42 + r('ty', j) * 0.12);
      const len = Math.hypot(d, cy - y);
      lump(b, x + Math.cos(a) * d, cy, z + Math.sin(a) * d, rr, rr * 0.9, rr, { seg: 10, rings: 4, normal: TONE.lit, twist: a, facing: [(Math.cos(a) * d) / len, (cy - y) / len, (Math.sin(a) * d) / len], cut: -0.1 });
    }
  });
  // Round the rim: the scalloped outline. Those on the far side are in shade.
  const n = Math.max(3, Math.round(o.lumps ?? TREE.lumps + (r('n') < 0.5 ? 0 : 1)));
  const a0 = r('a0') * 6.28;
  for (let j = 0; j < n; j++) {
    const a = a0 + (j * 6.28) / n + (r('ja', j) - 0.5) * 0.5;
    const dx = Math.cos(a), dz = Math.sin(a);
    const shady = dx * SHADE_SIDE[0] + dz * SHADE_SIDE[1] > 0.3;
    const cy = y + ry * (shady ? -0.35 + r('jy', j) * 0.3 : -0.28 + r('jy', j) * 0.36);
    const d = R * (0.78 + r('jd', j) * 0.1), rr = R * (0.3 + r('jr', j) * 0.12);
    const len = Math.hypot(d, cy - y);
    b.with(shady ? dark : lit, () =>
      lump(b, x + dx * d, cy, z + dz * d, rr, rr * 0.9, rr, { seg: 8, rings: 4, normal: shady ? TONE.shade : TONE.lit, twist: a, facing: [(dx * d) / len, (cy - y) / len, (dz * d) / len], cut: -0.2 }),
    );
  }
}

/** Fruit, blossom or flowers scattered on the sunny side of a crown: dabs of colour with no outline. */
function speckle(b: MeshBuilder, r: Rng, x: number, y: number, z: number, R: number, ry: number, color: Rgb | string, count: number, size: number, sway: SwayInput, ink = 'crown'): void {
  b.with({ color, pattern: PATTERN.none, ink, sway, edge: FOLIAGE.fruit }, () => {
    for (let i = 0; i < count; i++) {
      // A point on the crown's lit half, pushed just proud of the surface.
      const a = Math.atan2(SUN[1], SUN[0]) + (r('fa', i) - 0.5) * 3.4;
      const up = -0.25 + r('fu', i) * 1.05;
      const s = Math.sqrt(Math.max(0, 1 - up * up));
      // Round (six sides, three rings), not a five-sided diamond: an apple reads as an apple.
      lump(b, x + Math.cos(a) * s * R * 1.02, y + up * ry * 1.02, z + Math.sin(a) * s * R * 1.02, size, size, size, { seg: 6, rings: 3, normal: TONE.lit });
    }
  });
}

/**
 * A broadleaf's branches: a few limbs from the top of the trunk out into the crown, each forking into
 * two twigs, all well inside the crown's core so that in leaf they cannot be seen (nor do they reach
 * the ground's shade picture). When the leaves fall (src/render/shaders/season.ts) they are the tree.
 * `R` and `ry` are the crown core's radius and half-height round (cx, cy, cz).
 */
function branches(b: MeshBuilder, r: Rng, from: Vec3, cx: number, cy: number, cz: number, R: number, ry: number, sway: SwayInput, color: Rgb): void {
  const n = 4 + (r('limbs') < 0.5 ? 1 : 0);
  const a0 = r('limb0') * 6.28;
  b.with({ color, pattern: PATTERN.bark, ink: 'trunk', sway, edge: FOLIAGE.branch }, () => {
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * 6.28) / n + (r('la', i) - 0.5) * 0.7;
      const dx = Math.cos(a), dz = Math.sin(a);
      const reach = R * (0.48 + r('lr', i) * 0.12), rise = ry * (-0.1 + r('ly', i) * 0.4);
      const end: Vec3 = [cx + dx * reach, cy + rise, cz + dz * reach];
      const mid: Vec3 = [from[0] + (end[0] - from[0]) * 0.45, from[1] + (end[1] - from[1]) * 0.7, from[2] + (end[2] - from[2]) * 0.45];
      tube(b, [from, mid, end], [0.022, 0.014, 0.008], { seg: 4 });
      for (let j = 0; j < 2; j++) {
        const t = a + (j === 0 ? -0.55 : 0.5) + (r('ta', i, j) - 0.5) * 0.3;
        const len = R * (0.18 + r('tl', i, j) * 0.08);
        const tip: Vec3 = [end[0] + Math.cos(t) * len, end[1] + len * (0.5 + r('tu', i, j) * 0.6) * (ry / R), end[2] + Math.sin(t) * len];
        tube(b, [end, tip], [0.008, 0.003], { seg: 3 });
      }
    }
  });
}

export interface RoundOptions {
  /** Trunk height multiplier. */
  tall?: number;
  /** Crown size multiplier. */
  size?: number;
  color?: Rgb;
  /** Colour of fruit or blossom dabs, and how many. */
  fruit?: Rgb | string;
  fruitCount?: number;
}

/** The measures of a broadleaf (`roundTree`) from its seed: trunk height, crown radius and squash, the trunk's top, its radius at the foot. */
function roundShape(r: Rng, o: RoundOptions): { th: number; R: number; squash: number; tx: number; tz: number; cy: number; top: number; radius: number } {
  const th = (0.3 + r('th') * 0.14) * (o.tall ?? 1);
  const R = (0.27 + r('R') * 0.06) * (o.size ?? 1);
  const squash = 0.8 + r('sq') * 0.14;
  const lean = (r('lean') - 0.5) * 2 * TREE.lean;
  const tx = lean * th * 1.6, tz = (r('lz') - 0.5) * 0.05;
  const cy = th + R * squash * 0.72;
  return { th, R, squash, tx, tz, cy, top: cy + R * squash, radius: 0.05 + r('tr') * 0.016 };
}

/**
 * Where a broadleaf's limbs leave its trunk (the fork the branches are drawn from), on the plant's own
 * origin, and the trunk's radius there: what a ladder can rest on in every season (U18's orchard).
 */
export function roundFork(r: Rng, o: RoundOptions = {}): { at: Vec3; radius: number } {
  const { th, R, tx, tz, radius } = roundShape(r, o);
  return { at: [tx, th + R * 0.2, tz], radius: radius * 0.75 };
}

/** The fruit tree's options (its fruit is rolled from the same seed). */
const FRUIT_TREE: RoundOptions = { tall: 0.85, size: 0.95 };

/** `roundFork` of a fruit tree. */
export const fruitFork = (r: Rng): { at: Vec3; radius: number } => roundFork(r, FRUIT_TREE);

/** The plain broadleaf: a leaning trunk and a cloud of a crown. Returns its height. */
export function roundTree(b: MeshBuilder, r: Rng, o: RoundOptions = {}): number {
  const { th, R, squash, tx, tz, cy, top, radius } = roundShape(r, o);
  const sway = swayTo(top);
  const bark = vary(PALETTE.trunk, r('trunk'), 0.6);
  trunk(b, r, [[0, 0, 0], [tx * 0.35, th * 0.55, tz * 0.5], [tx, th + R * 0.25, tz]], radius, sway, bark);
  const color = o.color ?? vary(PALETTE.leaf, r('leaf'));
  branches(b, (...p) => r('branch', ...p), [tx, th + R * 0.2, tz], tx, cy, tz, R, R * squash, sway, bark);
  cloud(b, r, { x: tx, y: cy, z: tz, R, squash, color, sway });
  if (o.fruit) speckle(b, r, tx, cy, tz, R, R * squash, o.fruit, o.fruitCount ?? 6, 0.04, sway);
  return top;
}

/** A cypress: a tall dark flame with a crescent of shade down its far side. */
export function cypress(b: MeshBuilder, r: Rng): number {
  const h = 1.0 + r('h') * 0.4, rad = 0.15 + r('rad') * 0.04;
  const y0 = 0.13;
  const top = y0 + h;
  const sway = swayTo(top);
  trunk(b, r, [[0, 0, 0], [0, 0.22, 0]], 0.045, sway);
  const color = vary(PALETTE.leafDark, r('leaf'));
  const twist = r('tw') * 6;
  b.with({ color, pattern: PATTERN.none, ink: 'crown', sway, edge: FOLIAGE.evergreen }, () => {
    lump(b, 0, y0 + h * 0.46, 0, rad, h * 0.46, rad, { seg: 12, rings: 7, normal: TONE.lit, twist });
    // The tip, a little off the axis, and a shoulder or two so the outline is not an ellipse.
    lump(b, (r('tx') - 0.5) * 0.05, y0 + h * 0.82, (r('tz') - 0.5) * 0.05, rad * 0.6, h * 0.2, rad * 0.6, { seg: 8, rings: 5, normal: TONE.lit, facing: [0, 1, 0], cut: -0.2 });
    for (let j = 0; j < 2; j++) {
      const a = r('ba', j) * 6.28;
      lump(b, Math.cos(a) * rad * 0.42, y0 + h * (0.22 + r('by', j) * 0.3), Math.sin(a) * rad * 0.42, rad * 0.78, h * 0.2, rad * 0.78, { seg: 8, rings: 5, normal: TONE.lit, facing: [Math.cos(a), 0, Math.sin(a)], cut: -0.2 });
    }
  });
  b.with({ color: mixColor(color, PALETTE.leafDark, TREE.shadeMix), pattern: PATTERN.leaves, ink: 'crown', sway, edge: FOLIAGE.evergreen }, () =>
    lump(b, SHADE_SIDE[0] * rad * 0.4, y0 + h * 0.42, SHADE_SIDE[1] * rad * 0.4, rad * 0.96, h * 0.42, rad * 0.96, { seg: 12, rings: 7, normal: TONE.shade, twist, facing: [SHADE_SIDE[0], 0, SHADE_SIDE[1]], cut: -0.1 }),
  );
  return top;
}

const FLOWERS = [PALETTE.red, PALETTE.pink, PALETTE.yellow, PALETTE.white] as const;

/** A shrub: a low round heap of leaf, plain where the light falls and marked in the shade under it, sometimes in flower. `size` 1 is about 0.4 across. */
export function bush(b: MeshBuilder, r: Rng, size = 1, x = 0, z = 0, ink = 'bush', flowers: boolean | string = r('flower') < 0.5): void {
  const color = vary(PALETTE.bush, r('bc'), 0.8);
  const R = 0.15 * size;
  const fine = size > 1.2;
  // A bush is rooted along its whole foot: it only stirs toward the top.
  const sway: SwayInput = (_x, y) => Math.max(0, Math.min(1, y / (R * 1.8))) * TREE.sway * 0.3;
  b.with({ color: mixColor(color, PALETTE.leafDark, TREE.shadeMix), pattern: PATTERN.leaves, ink, sway, edge: FOLIAGE.shrub }, () =>
    mound(b, x + SHADE_SIDE[0] * R * 0.3, 0, z + SHADE_SIDE[1] * R * 0.3, R * 1.25, R * 0.95, R * 1.25, { seg: fine ? 12 : 8, rings: fine ? 3 : 2, normal: TONE.shade }),
  );
  b.with({ color, pattern: PATTERN.none, ink, sway, edge: FOLIAGE.shrub }, () => {
    lump(b, x, R * 0.75, z, R, R * 0.85, R, { seg: fine ? 12 : 9, rings: fine ? 5 : 4, normal: TONE.lit, twist: r('bt') * 6, facing: [0, 1, 0], cut: -0.7 });
    const n = fine ? 2 + Math.floor(r('bn') * 2) : 2;
    const a0 = r('ba') * 6.28;
    for (let j = 0; j < n; j++) {
      const a = a0 + j * (6.28 / n) + (r('bj', j) - 0.5) * 0.6, d = R * (0.62 + r('bd', j) * 0.2), rr = R * (0.45 + r('br', j) * 0.18);
      lump(b, x + Math.cos(a) * d, rr * 0.85, z + Math.sin(a) * d, rr, rr * 0.9, rr, { seg: fine ? 8 : 7, rings: fine ? 4 : 3, normal: TONE.lit, twist: a, facing: [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], cut: -0.3 });
    }
  });
  if (flowers) {
    const fc = typeof flowers === 'string' ? flowers : FLOWERS[Math.floor(r('fc') * FLOWERS.length)]!;
    b.with({ color: fc, pattern: PATTERN.none, ink, sway, edge: FOLIAGE.shrub }, () => {
      for (let i = 0; i < 4; i++) {
        const a = Math.atan2(SUN[1], SUN[0]) + (r('fa', i) - 0.5) * 3.6, up = 0.15 + r('fu', i) * 0.7;
        const s = Math.sqrt(1 - up * up);
        lump(b, x + Math.cos(a) * s * R, R * 0.75 + up * R * 0.85, z + Math.sin(a) * s * R, 0.036 * size, 0.036 * size, 0.036 * size, { seg: 5, rings: 2, normal: TONE.lit });
      }
    });
  }
}

/** The 'bush' species as a whole tree block: a big flowering shrub with a smaller one against it. */
export function shrubbery(b: MeshBuilder, r: Rng): number {
  const a = r('a') * 6.28;
  bush(b, (...p) => r('big', ...p), 1.55, 0, 0, 'crown', true);
  bush(b, (...p) => r('small', ...p), 0.95, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 'crown2');
  return 0.5;
}

/** A palm: a curved, ringed trunk and a head of drooping fronds, with coconuts. */
export function palm(b: MeshBuilder, r: Rng): number {
  const h = 0.95 + r('h') * 0.3;
  const a = r('lean') * 6.28, reach = 0.08 + r('reach') * 0.12;
  const lx = Math.cos(a) * reach, lz = Math.sin(a) * reach;
  const top = h + 0.22;
  const sway = swayTo(top);
  // The trunk bows: it leaves the ground leaning and straightens toward the head.
  const pts: Vec3[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const bow = 1 - (1 - t) * (1 - t);
    pts.push([lx * bow, h * t, lz * bow]);
  }
  trunk(b, r, pts, 0.062, sway, mixColor(PALETTE.trunk, PALETTE.dirt, 0.4));
  const hx = lx, hz = lz;
  const color = vary(PALETTE.leafDark, r('leaf'), 0.7);
  const fronds = 7;
  const a0 = r('fa') * 6.28;
  b.with({ color, pattern: PATTERN.none, ink: 'crown', sway, edge: FOLIAGE.evergreen }, () => {
    for (let f = 0; f < fronds; f++) {
      const fa = a0 + (f / fronds) * 6.28 + (r('fj', f) - 0.5) * 0.35;
      const len = 0.4 + r('fl', f) * 0.12, rise = 0.1 + r('fr', f) * 0.1, droop = 0.34 + r('fd', f) * 0.14;
      const dx = Math.cos(fa), dz = Math.sin(fa);
      const spine: Vec3[] = [], widths = [0.03, 0.085, 0.09, 0.065, 0.012];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        spine.push([hx + dx * len * t, h + rise * Math.sin(t * 2.2) - droop * t * t, hz + dz * len * t]);
      }
      // Two halves folded along the midrib: one in the light tone, one in the half tone, so the fold reads.
      for (let i = 0; i < 4; i++) {
        const p = spine[i]!, q = spine[i + 1]!, w0 = widths[i]!, w1 = widths[i + 1]!;
        const sx = -dz, sz = dx;
        const fold = 0.03;
        const pl: Vec3 = [p[0] - sx * w0, p[1] - fold * (w0 / 0.09), p[2] - sz * w0], pr: Vec3 = [p[0] + sx * w0, p[1] - fold * (w0 / 0.09), p[2] + sz * w0];
        const ql: Vec3 = [q[0] - sx * w1, q[1] - fold * (w1 / 0.09), q[2] - sz * w1], qr: Vec3 = [q[0] + sx * w1, q[1] - fold * (w1 / 0.09), q[2] + sz * w1];
        const lit = [TONE.lit, TONE.lit, TONE.lit, TONE.lit] as const, mid = [TONE.mid, TONE.mid, TONE.mid, TONE.mid] as const, under = [TONE.shade, TONE.shade, TONE.shade, TONE.shade] as const;
        b.quad(pl, p, q, ql, { normals: lit });
        b.quad(p, pr, qr, q, { normals: mid });
        const d = 0.012;
        b.quad([ql[0], ql[1] - d, ql[2]], [qr[0], qr[1] - d, qr[2]], [pr[0], pr[1] - d, pr[2]], [pl[0], pl[1] - d, pl[2]], { normals: under });
      }
    }
    // The heart of the head, so the fronds spring from something.
    lump(b, hx, h + 0.02, hz, 0.075, 0.06, 0.075, { seg: 6, rings: 3, normal: TONE.lit });
  });
  b.with({ color: mixColor(PALETTE.trunk, PALETTE.brick, 0.3), ink: 'nuts', sway }, () => {
    const n = 2 + Math.floor(r('nuts') * 2);
    for (let i = 0; i < n; i++) {
      const na = a0 + i * 2.2;
      lump(b, hx + Math.cos(na) * 0.07, h - 0.07, hz + Math.sin(na) * 0.07, 0.045, 0.045, 0.045, { seg: 5, rings: 3 });
    }
  });
  return top;
}

/**
 * A willow: a low round crown on a leaning trunk, and ten or so separate
 * strands of leaf hanging from its rim, each its own length, with air
 * between them. The strands swing freely; their tips move most.
 */
export function willow(b: MeshBuilder, r: Rng): number {
  const th = 0.6 + r('th') * 0.1;
  const R = 0.3 + r('R') * 0.03;
  const squash = 0.68;
  const la = r('la') * 6.28, lean = 0.1 + r('lean') * 0.08;
  const cx = Math.cos(la) * lean, cz = Math.sin(la) * lean;
  const cy = th + R * squash * 0.55, top = cy + R * squash * 1.3;
  const sway = swayTo(top);
  const bark = vary(PALETTE.trunk, r('trunk'), 0.6);
  trunk(b, r, [[0, 0, 0], [cx * 0.25, th * 0.5, cz * 0.25], [cx, cy, cz]], 0.07, sway, bark);
  branches(b, (...p) => r('branch', ...p), [cx, cy - R * squash * 0.4, cz], cx, cy, cz, R, R * squash, sway, bark);
  const color = vary(mixColor(PALETTE.leaf, PALETTE.yellow, 0.14), r('leaf'), 0.7);
  const shade = mixColor(color, PALETTE.leafDark, TREE.shadeMix + 0.08);
  b.with({ color, pattern: PATTERN.none, ink: 'crown', sway, edge: FOLIAGE.crown }, () => {
    lump(b, cx, cy, cz, R, R * squash, R, { seg: 16, rings: 6, normal: TONE.lit, twist: r('tw') * 6 });
    const a = r('ta') * 6.28;
    lump(b, cx + Math.cos(a) * R * 0.3, cy + R * squash * 0.45, cz + Math.sin(a) * R * 0.3, R * 0.5, R * 0.4, R * 0.5, { seg: 10, rings: 5, normal: TONE.lit, facing: [0, 1, 0], cut: -0.1 });
  });
  b.with({ color: shade, pattern: PATTERN.leaves, ink: 'crown', sway, edge: FOLIAGE.crown }, () =>
    lump(b, cx + SHADE_SIDE[0] * R * 0.16, cy - R * squash * 0.3, cz + SHADE_SIDE[1] * R * 0.16, R * 0.92, R * squash * 0.8, R * 0.92, { seg: 12, rings: 5, normal: TONE.shade, facing: [0, -1, 0], cut: -0.3 }),
  );
  const strands = 9 + Math.floor(r('strands') * 4);
  const a0 = r('a0') * 6.28;
  for (let k = 0; k < strands; k++) {
    const a = a0 + (k / strands) * 6.28 + (r('sa', k) - 0.5) * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const shady = dx * SHADE_SIDE[0] + dz * SHADE_SIDE[1] > 0.3;
    const y0 = cy - R * squash * 0.1;
    const len = Math.min(y0 - 0.07, 0.3 + r('sl', k) * 0.36);
    const out = R * (0.9 + r('so', k) * 0.12);
    const w = 0.058 + r('sw', k) * 0.018;
    const pts: Vec3[] = [
      [cx + dx * R * 0.7, y0 + 0.04, cz + dz * R * 0.7],
      [cx + dx * out, y0 - len * 0.45, cz + dz * out],
      [cx + dx * (out - 0.015), y0 - len, cz + dz * (out - 0.015)],
    ];
    const hang: SwayInput = (_x, y) => Math.min(1, TREE.sway * (0.35 + 0.75 * Math.max(0, Math.min(1, (y0 - y) / len))));
    // One flat tone to a strand, so each reads as a single stroke of leaf.
    b.with({ color: shady ? shade : color, pattern: PATTERN.none, ink: 'crown', sway: hang, edge: FOLIAGE.strand }, () => tube(b, pts, [w * 0.85, w, 0.008], { seg: 4, normal: shady ? TONE.shade : k % 3 === 1 ? TONE.mid : TONE.lit }));
  }
  return top;
}

/**
 * A pine: three or four drooping skirts of needles on a straight trunk, each
 * a smooth bell with a scalloped lower edge that hangs over the one below
 * by a third, and a tip that bends a little. Darker and bluer than the
 * broadleaves. Each skirt is one smooth surface: its far side falls into
 * shade along a soft line, with no folds.
 */
export function pine(b: MeshBuilder, r: Rng): number {
  const tiers = 3 + (r('tiers') < 0.45 ? 1 : 0);
  const h = 0.95 + r('h') * 0.3;
  const y0 = 0.25 + r('y0') * 0.05;
  const top = y0 + h;
  const sway = swayTo(top);
  trunk(b, r, [[0, 0, 0], [0, y0 + 0.14, 0]], 0.055, sway);
  const color = vary(mixColor(mixColor(PALETTE.leafDark, PALETTE.glass, 0.24), PALETTE.metal, 0.1), r('leaf'), 0.5);
  const under = mixColor(color, PALETTE.metal, 0.22);
  const bx = (r('bx') - 0.5) * 0.12, bz = (r('bz') - 0.5) * 0.12;
  // The axis bends toward the tip.
  const axis = (y: number): [number, number] => {
    const t = Math.max(0, (y - y0) / h);
    return [bx * t * t, bz * t * t];
  };
  // Skirt heights shrink upward; each begins two thirds of the way up the one below.
  const shrink = 0.86;
  let unit = 0;
  for (let k = 0; k < tiers; k++) unit += Math.pow(shrink, k) * (k === tiers - 1 ? 1 : 2 / 3);
  const H0 = h / unit;
  let yb = y0;
  for (let k = 0; k < tiers; k++) {
    const H = H0 * Math.pow(shrink, k);
    const Rk = (0.37 - (k / tiers) * 0.25) * (0.95 + r('R', k) * 0.1);
    const lobes = 7 + Math.floor(r('lobes', k) * 3);
    const N = lobes * 3;
    const tw = r('tw', k) * 6.28;
    const rim: Vec3[] = [], mid: Vec3[] = [], nor: Vec3[] = [];
    for (let i = 0; i < N; i++) {
      const a = tw + (i / N) * 6.28;
      const lobe = Math.floor(i / 3), notch = i % 3 === 0;
      const reach = notch ? 0.83 : 0.96 + r('lr', k, lobe) * 0.08;
      const y = notch ? yb + 0.04 : yb - 0.015 - r('ld', k, lobe) * 0.04;
      const [ax, az] = axis(y), [mx, mz] = axis(yb + H * 0.5);
      rim.push([ax + Math.cos(a) * Rk * reach, y, az + Math.sin(a) * Rk * reach]);
      mid.push([mx + Math.cos(a) * Rk * 0.6, yb + H * 0.5, mz + Math.sin(a) * Rk * 0.6]);
      const g = Math.cos(a) * SHADE_SIDE[0] + Math.sin(a) * SHADE_SIDE[1];
      const t = Math.max(0, Math.min(1, (g - 0.05) / 0.5));
      nor.push(toneAt(t * t * (3 - 2 * t)));
    }
    const [tx, tz] = axis(yb + H);
    const apex: Vec3 = [tx, yb + H, tz];
    b.with({ color, pattern: PATTERN.leaves, ink: `skirt${k}`, sway, edge: FOLIAGE.evergreen }, () => {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        b.tri(apex, mid[j]!, mid[i]!, { normals: [nor[i]!, nor[j]!, nor[i]!] });
        b.quad(mid[i]!, mid[j]!, rim[j]!, rim[i]!, { normals: [nor[i]!, nor[j]!, nor[j]!, nor[i]!] });
      }
    });
    // Underneath: in shade, and closed, so no skirt is hollow from a low view.
    const [ux, uz] = axis(yb + 0.1);
    const hub: Vec3 = [ux, yb + 0.1, uz];
    b.with({ color: under, pattern: PATTERN.none, ink: `skirt${k}`, sway, edge: FOLIAGE.evergreen }, () => {
      for (let i = 0; i < N; i++) b.tri(hub, rim[i]!, rim[(i + 1) % N]!, { normals: [TONE.shade, TONE.shade, TONE.shade] });
    });
    yb += (H * 2) / 3;
  }
  return top;
}

/** A clipped tree in a planter (beside a plaza): a stone box of earth, a straight stem, a neat ball or two. */
export function planterTree(b: MeshBuilder, r: Rng): number {
  const box = 0.5, bh = 0.2;
  b.with({ color: PALETTE.stoneShade, pattern: PATTERN.stone, ink: 'planter' }, () => {
    b.boxAt([0, 0, 0], [box, bh, box], { skip: ['bottom', 'top'] });
    // The rim, proud of the box, with the earth sunk inside it.
    b.boxAt([0, bh, 0], [box + 0.06, 0.05, box + 0.06], { skip: ['bottom'] });
  });
  b.with({ color: PALETTE.dirtDark, pattern: PATTERN.dirt, ink: 'earth' }, () => b.quad([-0.19, bh + 0.052, 0.19], [0.19, bh + 0.052, 0.19], [0.19, bh + 0.052, -0.19], [-0.19, bh + 0.052, -0.19]));
  const th = 0.4 + r('th') * 0.1;
  const R = 0.31 + r('R') * 0.04;
  const double = r('double') < 0.3;
  const cy = bh + th + R * 0.8;
  const top = double ? cy + R * 1.55 : cy + R;
  const sway = swayTo(top);
  trunk(b, r, [[0, bh, 0], [0, cy, 0]], 0.04, sway);
  const color = vary(PALETTE.leafDark, r('leaf'), 0.6);
  const ball = (y: number, rad: number): void => {
    b.with({ color, pattern: PATTERN.none, ink: 'crown', sway, edge: FOLIAGE.evergreen }, () => lump(b, 0, y, 0, rad, rad * 0.94, rad, { seg: rad > 0.2 ? 16 : 12, rings: rad > 0.2 ? 8 : 6, normal: TONE.lit, facing: [0, 1, 0], cut: -0.8 }));
    b.with({ color: mixColor(color, PALETTE.leafDark, TREE.shadeMix), pattern: PATTERN.leaves, ink: 'crown', sway, edge: FOLIAGE.evergreen }, () =>
      lump(b, SHADE_SIDE[0] * rad * 0.14, y - rad * 0.48, SHADE_SIDE[1] * rad * 0.14, rad * 0.88, rad * 0.64, rad * 0.88, { seg: 14, rings: 6, normal: TONE.shade, facing: [0, -1, 0], cut: -0.25 }),
    );
  };
  ball(cy, R);
  if (double) ball(cy + R * 1.12, R * 0.52);
  return top;
}

const FRUIT = [PALETTE.red, PALETTE.yellow, PALETTE.pink, PALETTE.brick] as const;

/** A fruit tree (on a garden): a small round tree hung with fruit or in blossom. */
export function fruitTree(b: MeshBuilder, r: Rng): number {
  const kind = Math.floor(r('fruit') * FRUIT.length);
  return roundTree(b, r, { ...FRUIT_TREE, fruit: FRUIT[kind], fruitCount: kind === 2 ? 9 : 7 });
}

/** A grove tree (five or more together): taller and darker, with ferns and a toadstool at its foot. */
export function groveTree(b: MeshBuilder, r: Rng): number {
  const top = roundTree(b, r, { tall: 1.35, size: 1.08, color: vary(mixColor(PALETTE.leaf, PALETTE.leafDark, 0.45), r('leaf')) });
  // Undergrowth: a couple of low ferny mounds and a tuft, all in shade.
  const n = 2 + Math.floor(r('under') * 2);
  for (let i = 0; i < n; i++) {
    const a = r('ua', i) * 6.28, d = 0.2 + r('ud', i) * 0.16;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.09 + r('us', i) * 0.05;
    b.with({ color: vary(PALETTE.leafDark, r('uc', i), 0.8), pattern: PATTERN.leaves, ink: 'under' }, () =>
      mound(b, x, 0, z, s * 1.3, s, s * 1.3, { seg: 6, rings: 2, normal: i % 2 ? TONE.mid : TONE.shade, twist: a }),
    );
  }
  if (r('toadstool') < 0.6) {
    const a = r('ma') * 6.28;
    const x = Math.cos(a) * 0.17, z = Math.sin(a) * 0.17;
    b.with({ color: PALETTE.white, ink: 'toadstool' }, () => tube(b, [[x, 0, z], [x, 0.06, z]], 0.018, { seg: 4 }));
    b.with({ color: PALETTE.red, ink: 'toadstool' }, () => mound(b, x, 0.055, z, 0.05, 0.04, 0.05, { seg: 6, rings: 2 }));
  }
  b.with({ color: PALETTE.leafDark, ink: 'under' }, () => tuft(b, -0.2, 0, 0.14, 0.14, (...p) => r('tuft', ...p)));
  return top;
}

/** What stands at the foot of a plain tree: a small bush, or flowers in the grass. */
export function companion(b: MeshBuilder, r: Rng, x: number, z: number): void {
  if (r('what') < 0.6) {
    bush(b, (...p) => r('bush', ...p), 0.8 + r('size') * 0.3, x, z, 'companion');
    return;
  }
  b.with({ color: PALETTE.leafDark, ink: 'companion' }, () => tuft(b, x, 0, z, 0.13, (...p) => r('tuft', ...p), 4));
  b.with({ color: FLOWERS[Math.floor(r('fc') * FLOWERS.length)]!, ink: 'companion' }, () => {
    for (let i = 0; i < 3; i++) dab(b, x + (r('fx', i) - 0.5) * 0.2, 0.012, z + (r('fz', i) - 0.5) * 0.2, 0.03);
  });
}
