// Landmark props of part D (Stage 4): what stands on roofs, on monuments and
// against their walls. Stork nest and birdhouse (D14), statue (D19), wall
// banner, torch and cannon (D21), brazier (D22), fog bell (D23), ladder
// (D25). Several parts in one file; each is discovered by its own export.
//
// Bold, few shapes; a handful of ink groups each; palette colours; seeded
// irregularity from the item's `look`.

import { CELL_H, keyX, keyY, keyZ, neighbor, NO_CELL, opposite } from '@/core/grid';
import { compose, frame, invertAffine, rotationX, rotationY, rotationZ, scaling, transformPoint, translation, type Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { slotFrame } from '@/gen/frames';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { speciesOf, treeFork } from '@/gen/tree/tree.gen';
import type { PropOf, ShapePlan } from '@/resolve/plan';
import { PALETTE } from '@/style/palette';
import { clothColors, dab, lump, mixColor, mound, rngOf, tube, vary, TONE } from './kit';

/** The house wall stands this far behind a socket on the cell line. */
const WALL_IN = 0.07;

/** A small round head or knob. */
function ball(b: MeshBuilder, x: number, y: number, z: number, r: number): void {
  b.at(compose(translation(x, y, z), scaling(r, r, r)), () => b.lathe([[0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1]], { segments: 6 }));
}

/**
 * Stork nest (D14): a ragged ring of sticks on the chimney top with a white
 * stork standing in it, its red beak and legs. Frame: the 'chimney-top'
 * socket (the centre of the flue opening, +Y up).
 */
export const storkNest = definePart({
  prop: 'stork-nest',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 911));
    // The socket is where smoke leaves, a little above the pots: the nest sits down on the cap.
    b.translate(0, -0.11, 0);
    b.with({ color: vary(PALETTE.trunk, r('c')), pattern: PATTERN.thatch, ink: 'nest' }, () => {
      b.lathe([[0.1, -0.02], [0.17, 0.02], [0.175, 0.07], [0.12, 0.085], [0.09, 0.05]], { segments: 9 });
      // A few sticks poking out.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r('a', i);
        b.at(compose(translation(Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15), rotationY(-a), rotationZ(0.3)), () => b.box([0, -0.006, -0.006], [0.09, 0.006, 0.006]));
      }
    });
    const turn = r('turn') * Math.PI * 2;
    b.at(compose(translation(0, 0.06, 0), rotationY(turn)), () => {
      b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'stork' }, () => {
        lump(b, 0, 0.13, 0, 0.055, 0.05, 0.09, { seg: 7, rings: 4 }); // body
        tube(b, [[0, 0.15, 0.06], [0, 0.22, 0.08], [0, 0.27, 0.09]], [0.022, 0.017, 0.014], { seg: 5 }); // neck
        ball(b, 0, 0.285, 0.095, 0.028);
      });
      b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'stork' }, () => {
        // black wing tips along the back
        b.quad([-0.052, 0.13, -0.05], [-0.052, 0.13, -0.11], [-0.03, 0.17, -0.1], [-0.035, 0.17, -0.03]);
        b.quad([0.035, 0.17, -0.03], [0.03, 0.17, -0.1], [0.052, 0.13, -0.11], [0.052, 0.13, -0.05]);
      });
      b.with({ color: PALETTE.red, pattern: PATTERN.none, ink: 'beak' }, () => {
        b.at(compose(translation(0, 0.28, 0.115), rotationX(Math.PI / 2 + 0.3)), () => b.lathe([[0.012, 0], [0, 0.08]], { segments: 4 }));
        for (const x of [-0.02, 0.02]) b.box([x - 0.006, 0.0, -0.006], [x + 0.006, 0.09, 0.006]);
      });
    });
    return { mesh: b.build(), anchors: { perch: translation(0, 0.25, 0) } };
  },
});

/**
 * Birdhouse (D14): a little painted box with a pitched roof and a round hole,
 * on a bracket against a wall. Frame: a 'wall-mount' socket (on the cell
 * line half-way up the storey; the wall is 0.07 behind it).
 */
export const birdhouse = definePart({
  prop: 'birdhouse',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 467));
    const colors = [PALETTE.red, PALETTE.yellow, PALETTE.glass, PALETTE.leafDark, PALETTE.white];
    const body = colors[Math.floor(r('c') * colors.length)]!;
    const z0 = -WALL_IN, y0 = 0.08 + (r('y') - 0.5) * 0.04;
    b.at(compose(translation(0.3, y0, z0), rotationZ((r('lean') - 0.5) * 0.06)), () => {
      b.with({ color: body, pattern: PATTERN.planks, ink: 'box' }, () => {
        b.box([-0.06, 0, 0], [0.06, 0.13, 0.11], { skip: ['n'] });
        // the gable ends under the roof
        b.tri([-0.06, 0.13, 0.11], [0.06, 0.13, 0.11], [0, 0.19, 0.11]);
      });
      b.with({ color: PALETTE.ink, pattern: PATTERN.none, ink: 'box' }, () => b.polygon([0, 1, 2, 3, 4, 5].map((i): Vec3 => [Math.cos((i / 6) * Math.PI * 2) * 0.022, 0.08 + Math.sin((i / 6) * Math.PI * 2) * 0.022, 0.112])));
      b.with({ color: PALETTE.redDark, pattern: PATTERN.shingles, ink: 'box-roof' }, () => {
        b.quad([0, 0.2, -0.0], [0, 0.2, 0.135], [-0.08, 0.12, 0.135], [-0.08, 0.12, 0]);
        b.quad([0.08, 0.12, 0], [0.08, 0.12, 0.135], [0, 0.2, 0.135], [0, 0.2, 0]);
      });
      b.with({ color: PALETTE.wood, pattern: PATTERN.none, ink: 'perch' }, () => b.box([-0.006, 0.04, 0.11], [0.006, 0.052, 0.15]));
    });
    return { mesh: b.build(), anchors: { perch: translation(0.3, y0 + 0.21, z0 + 0.06) } };
  },
});

/**
 * Statue (D19) on a plinth: a figure on a small base, a sundial, or an urn
 * of flowers. Frame: the 'statue-base' socket (the plinth's top, +Y up).
 */
export const statue = definePart({
  prop: 'statue',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 733));
    const turn = Math.floor(r('turn') * 4) * (Math.PI / 2) + (r('t') - 0.5) * 0.2;
    b.rotateY(turn);
    // A plinth is a whole block: what stands on it is drawn large enough to read from the street.
    const big = 1.55;
    b.scale(big);
    const stone = PALETTE.marble;
    if (item.variant === 'sundial') {
      b.with({ color: stone, pattern: PATTERN.marble, ink: 'dial-post' }, () => b.lathe([[0.09, 0], [0.09, 0.03], [0.05, 0.05], [0.045, 0.24], [0.11, 0.28], [0.11, 0.3]], { segments: 10, capTop: true }));
      b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'gnomon' }, () => {
        b.tri([0.006, 0.3, -0.08], [0.006, 0.3, 0.07], [0.006, 0.4, -0.08]);
        b.tri([-0.006, 0.3, 0.07], [-0.006, 0.3, -0.08], [-0.006, 0.4, -0.08]);
      });
    } else if (item.variant === 'urn') {
      b.with({ color: stone, pattern: PATTERN.marble, ink: 'urn' }, () => b.lathe([[0.1, 0], [0.1, 0.04], [0.04, 0.07], [0.05, 0.12], [0.13, 0.2], [0.14, 0.28], [0.15, 0.3], [0.12, 0.3]], { segments: 10 }));
      b.with({ color: vary(PALETTE.leafDark, r('g')), pattern: PATTERN.leaves, ink: 'urn-green', sway: 0.3 }, () => mound(b, 0, 0.29, 0, 0.13, 0.12, 0.13, { seg: 7, rings: 2 }));
      b.with({ color: [PALETTE.red, PALETTE.pink, PALETTE.yellow][Math.floor(r('f') * 3)]!, pattern: PATTERN.none, ink: 'urn-green' }, () => {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + r('fa', i);
          dab(b, Math.cos(a) * 0.075, 0.385, Math.sin(a) * 0.075, 0.042, TONE.lit, 5, 0.025);
        }
      });
    } else {
      // A figure: a block base, a robed body, a raised arm, a head. One stone, one outline.
      b.with({ color: stone, pattern: PATTERN.marble, ink: 'figure' }, () => {
        b.boxAt([0, 0, 0], [0.2, 0.08, 0.2], { skip: ['bottom'] });
        b.at(translation(0, 0.08, 0), () => b.lathe([[0.08, 0], [0.068, 0.12], [0.05, 0.22], [0.062, 0.27], [0.03, 0.3]], { segments: 8, capTop: true }));
        ball(b, 0, 0.42, 0, 0.045);
        tube(b, [[0.04, 0.34, 0], [0.09, 0.42, 0.02], [0.1, 0.5, 0.04]], [0.018, 0.016, 0.014], { seg: 4 });
        ball(b, 0.1, 0.51, 0.04, 0.02);
      });
    }
    return { mesh: b.build(), anchors: { perch: translation(0, (item.variant === 'figure' || !item.variant ? 0.47 : 0.32) * big, 0) } };
  },
});

/**
 * Wall banner (D21): a long cloth in the town's colours with a pale device,
 * hung from a pole fixed to the top of a castle wall. Frame: a 'wall-mount'
 * socket on the face of the wall, half-way up the storey; `back` is how far
 * behind that the wall's face is.
 */
export const wallBanner = definePart({
  prop: 'wall-banner',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 521));
    const colors = clothColors();
    const color = colors[(((item.params?.color ?? 0) % colors.length) + colors.length) % colors.length]!;
    const z = -(item.params?.back ?? WALL_IN) + 0.025;
    const top = CELL_H / 2 - 0.06, w = 0.17, len = 0.52 + r('len') * 0.06;
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'banner-pole' }, () => {
      b.box([-w - 0.03, top, z - 0.025], [w + 0.03, top + 0.022, z + 0.015]);
    });
    // The cloth: pegged along the pole, its swallow-tailed foot free in the wind.
    const sway = (_x: number, y: number): number => Math.min(1, Math.max(0, (top - y) / len)) * 0.45;
    b.with({ color, pattern: PATTERN.cloth, ink: 'banner', sway }, () => {
      const foot = top - len;
      const pts: [number, number][] = [[-w, top], [-w, foot], [0, foot + 0.07], [w, foot], [w, top]];
      b.polygon(pts.map(([x, y]): Vec3 => [x, y, z + 0.004]));
      b.polygon([...pts].reverse().map(([x, y]): Vec3 => [x, y, z - 0.004]));
    });
    // A pale lozenge device.
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'banner', sway }, () => {
      const cy = top - len * 0.42;
      b.polygon([[0, cy - 0.07, z + 0.007], [0.05, cy, z + 0.007], [0, cy + 0.07, z + 0.007], [-0.05, cy, z + 0.007]]);
    });
    return { mesh: b.build() };
  },
});

/**
 * Torch (D21): a flame in an iron basket on a bracket, either side of a
 * gate. Frame: a 'wall-mount' socket; `back` = how far behind it the wall is.
 * Owns 'lamp-head' (the flame).
 */
export const torch = definePart({
  prop: 'torch',
  build(item, ctx) {
    const b = ctx.mesh();
    const z = -(item.params?.back ?? WALL_IN);
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'torch-iron' }, () => {
      b.box([-0.03, 0.02, z], [0.03, 0.1, z + 0.02], { skip: ['n'] });
      b.at(compose(translation(0, 0.06, z + 0.02), rotationX(-0.55)), () => b.box([-0.012, -0.012, 0], [0.012, 0.012, 0.13]));
      b.at(translation(0, 0.13, z + 0.1), () => b.lathe([[0.02, 0], [0.05, 0.07], [0.055, 0.075]], { segments: 6 }));
    });
    b.with({ color: PALETTE.yellow, pattern: PATTERN.glow, ink: 'flame', sway: 0.4 }, () => {
      b.at(translation(0, 0.19, z + 0.1), () => b.lathe([[0.045, 0], [0.04, 0.04], [0, 0.13]], { segments: 5, capBottom: true }));
    });
    return { mesh: b.build(), anchors: { 'lamp-head': translation(0, 0.25, z + 0.1) } };
  },
});

/**
 * Cannon (D21): a dark barrel on a timber carriage with two wheels, pointing
 * out over the water. Frame: a floor slot, +Z the way it points.
 */
export const cannon = definePart({
  prop: 'cannon',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 199));
    b.rotateY((r('aim') - 0.5) * 0.3);
    b.with({ color: PALETTE.wood, pattern: PATTERN.planks, ink: 'carriage' }, () => {
      b.box([-0.09, 0.03, -0.17], [0.09, 0.12, 0.1], { skip: ['bottom'] });
    });
    b.with({ color: PALETTE.trunk, pattern: PATTERN.none, ink: 'wheels' }, () => {
      for (const x of [-0.11, 0.11]) b.at(compose(translation(x, 0.075, 0.02), rotationZ(Math.PI / 2)), () => b.lathe([[0.075, -0.02], [0.075, 0.02]], { segments: 10, capTop: true, capBottom: true }));
    });
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'barrel' }, () => {
      b.at(compose(translation(0, 0.15, -0.15), rotationX(Math.PI / 2 - 0.12)), () => b.lathe([[0.06, -0.02], [0.065, 0.02], [0.05, 0.1], [0.042, 0.33], [0.05, 0.34], [0.05, 0.37], [0.03, 0.37]], { segments: 10, capBottom: true }));
    });
    return { mesh: b.build() };
  },
});

/**
 * Brazier (D22): an iron bowl of glowing coals on three legs, a low flame
 * over it. Frame: a floor slot. Owns 'lamp-head' (the coals).
 */
export const brazier = definePart({
  prop: 'brazier',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 277));
    b.scale(1.3);
    b.rotateY(r('turn') * Math.PI);
    b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'brazier' }, () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        tube(b, [[Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06]], 0.012, { seg: 4 });
      }
      b.at(translation(0, 0.2, 0), () => b.lathe([[0.03, 0], [0.1, 0.06], [0.12, 0.1], [0.105, 0.1]], { segments: 9 }));
    });
    b.with({ color: PALETTE.red, pattern: PATTERN.glow, ink: 'coals' }, () => b.at(translation(0, 0.29, 0), () => b.lathe([[0.105, 0], [0.05, 0.03], [0, 0.035]], { segments: 9 })));
    b.with({ color: PALETTE.yellow, pattern: PATTERN.glow, ink: 'coals', sway: 0.5 }, () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + r('f', i);
        b.at(translation(Math.cos(a) * 0.035, 0.31, Math.sin(a) * 0.035), () => b.lathe([[0.03, 0], [0, 0.09 + r('h', i) * 0.05]], { segments: 4, capBottom: true }));
      }
    });
    return { mesh: b.build(), anchors: { 'lamp-head': translation(0, 0.36 * 1.3, 0) } };
  },
});

/**
 * Fog bell (D23): a bronze bell hung in a little timber frame with a pitched
 * cap. Frame: a floor slot, +Z the way it faces.
 */
export const fogBell = definePart({
  prop: 'fog-bell',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 613));
    b.rotateZ((r('lean') - 0.5) * 0.03);
    b.with({ color: PALETTE.wood, pattern: PATTERN.none, ink: 'bell-frame' }, () => {
      for (const x of [-0.13, 0.13]) b.boxAt([x, 0, 0], [0.04, 0.5, 0.04], { skip: ['bottom'] });
      b.box([-0.17, 0.5, -0.04], [0.17, 0.54, 0.04]);
    });
    b.with({ color: PALETTE.redDark, pattern: PATTERN.shingles, ink: 'bell-cap' }, () => {
      b.quad([-0.2, 0.54, 0.07], [0.2, 0.54, 0.07], [0.2, 0.62, 0], [-0.2, 0.62, 0]);
      b.quad([0.2, 0.54, -0.07], [-0.2, 0.54, -0.07], [-0.2, 0.62, 0], [0.2, 0.62, 0]);
      b.tri([0.2, 0.54, 0.07], [0.2, 0.54, -0.07], [0.2, 0.62, 0]);
      b.tri([-0.2, 0.54, -0.07], [-0.2, 0.54, 0.07], [-0.2, 0.62, 0]);
    });
    b.with({ color: mixColor(PALETTE.yellow, PALETTE.trunk, 0.45), pattern: PATTERN.metal, ink: 'bell' }, () => {
      b.at(translation(0, 0.27, 0), () => b.lathe([[0.1, 0], [0.095, 0.02], [0.065, 0.08], [0.055, 0.16], [0.03, 0.2], [0, 0.21]], { segments: 10, capBottom: true }));
      b.box([-0.006, 0.47, -0.006], [0.006, 0.5, 0.006]);
    });
    return { mesh: b.build(), anchors: { bell: translation(0, 0.37, 0) } };
  },
});

/**
 * Where the fork of the broadleaf behind a ladder's edge slot is (U18's orchard: where its limbs leave the
 * trunk), in the slot's frame, and the trunk's radius there. Null when there is no such tree right behind
 * the slot on the same ground (a wall, a pine, a palm).
 */
export function forkBehind(item: PropOf<'ladder'>, plan: ShapePlan): { at: Vec3; radius: number } | null {
  const at = item.at;
  if (!('cell' in at) || at.face === undefined) return null;
  const cell = neighbor(at.cell, opposite(at.face));
  const id = cell === NO_CELL ? undefined : plan.structureAt.get(cell);
  const s = id === undefined ? undefined : plan.structures.get(id);
  // `tree` (U18) names it, so that the ladder is drawn again when another tree stands there.
  if (!s || s.kind !== 'tree' || s.cells[0] !== cell || item.params?.tree !== s.id) return null;
  const fork = treeFork(s.seed, speciesOf(s.seed, plan.roles.get(s.id)?.role));
  if (!fork) return null;
  const world: Vec3 = [keyX(cell) + 0.5 + fork.at[0], keyY(cell) * CELL_H + fork.at[1], keyZ(cell) + 0.5 + fork.at[2]];
  const local = transformPoint(invertAffine(slotFrame(at.cell, at.pos, at.face)), world);
  if (local[2] > -0.3 || local[2] < -1.1 || Math.abs(local[0]) > 0.4 || local[1] < 0.2 || local[1] > 1.2) return null;
  return { at: local, radius: fork.radius };
}

/** A fallen ladder's rails lie on the mown grass (U18's sward is 0.011 up): their centre half a rail's thickness above it. */
export const LADDER_FLAT_Y = 0.012 + 0.016;

/** The ladder's rails and rungs, up +Y from its foot: rails `w0` either side at the foot, `w1` at the top. */
function ladderBody(b: MeshBuilder, len: number, w0: number, w1: number, capped: boolean): void {
  b.with({ color: PALETTE.wood, pattern: PATTERN.none, ink: 'ladder' }, () => {
    const rail = Math.hypot(len, w0 - w1), tilt = Math.atan2(w0 - w1, len);
    for (const s of [-1, 1]) {
      b.at(compose(translation(s * w0, 0, 0), rotationZ(s * tilt)), () => b.box([-0.016, 0, -0.016], [0.016, rail, 0.016], capped ? {} : { skip: ['bottom'] }));
    }
    for (let y = 0.12; y < len - 0.07; y += 0.13) {
      const w = w0 + ((w1 - w0) * y) / len;
      b.box([-w, y - 0.011, -0.01], [w, y + 0.011, 0.01], { skip: ['e', 'w'] });
    }
  });
}

/**
 * Ladder (D25, U18): a wooden ladder leaning on a wall or into a tree. Frame: an edge slot, +Z away
 * from what it leans on.
 *
 * On a wall (D25's mill yard) a straight ladder whose top rests on the wall, `back` behind the slot (the
 * wall is behind the slot at the cell line, 0.15 back, and 0.07 further in for a house; a mill's body is
 * round, so a little more).
 *
 * Into a broadleaf (U18's orchard) an orchard ladder, narrowing to its top, which sits in the tree's
 * fork where the limbs leave the trunk: wood that is still there in winter; in leaf it goes up into the
 * crown. `fallen` (its tree is a stump, burnt bare or growing back; src/resolve/ruins.ts): the same
 * ladder lies flat on the grass of its own cell.
 */
export const ladder = definePart({
  prop: 'ladder',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 151));
    const fork = forkBehind(item, ctx.plan);
    if (!fork && !item.params?.fallen) {
      // `back`: how far behind the slot the wall is. The foot stands 0.3 out from it, the top rests on it.
      const back = item.params?.back ?? 0.22;
      const len = 0.95 + r('len') * 0.15, foot = -back + 0.3, lean = Math.asin(0.28 / len);
      b.at(compose(translation((r('x') - 0.5) * 0.15, 0, foot), rotationX(-lean)), () => {
        b.with({ color: PALETTE.wood, pattern: PATTERN.none, ink: 'ladder' }, () => {
          for (const x of [-0.09, 0.09]) b.box([x - 0.016, 0, -0.016], [x + 0.016, len, 0.016], { skip: ['bottom'] });
          for (let y = 0.12; y < len - 0.04; y += 0.13) b.box([-0.09, y - 0.011, -0.01], [0.09, y + 0.011, 0.01], { skip: ['e', 'w'] });
        });
      });
      // Where someone stands at its foot, facing the wall or tree it leans on.
      return { mesh: b.build(), anchors: { pick: compose(translation(0, 0, foot + 0.14), rotationY(Math.PI)) } };
    }
    // Into the tree: its top just over the fork on the near side of the trunk, its foot out in front.
    const top: Vec3 = fork ? [fork.at[0], fork.at[1] - 0.01, fork.at[2] + fork.radius * 0.9] : [0, 0.5, -0.55];
    // Far enough out that in leaf its lower rungs show below the crown.
    const foot: Vec3 = [top[0], 0, top[2] + 0.32 + r('run') * 0.08];
    const reach = Math.hypot(top[0] - foot[0], top[1], top[2] - foot[2]);
    // The rails run on a little past the fork, up between the limbs.
    const len = reach + 0.1 + r('len') * 0.04, w0 = 0.085, w1 = 0.045;
    if (item.params?.fallen) {
      // Flat on the grass of its own cell, clear of the stump: along the cell's edge, a little askew, rails side by side.
      const flat = frame([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
      const at = translation((r('x') - 0.5) * 0.1, LADDER_FLAT_Y, 0.13 + r('z') * 0.04);
      b.at(compose(at, rotationY((r('fall') - 0.5) * 0.3), flat, translation(0, -len / 2, 0)), () => ladderBody(b, len, w0, w1, true));
      return { mesh: b.build(), anchors: { pick: compose(translation(0, 0, 0.3), rotationY(Math.PI)) } };
    }
    // Up +Y from the foot toward the fork, the rails side by side across it, level.
    const up: Vec3 = [(top[0] - foot[0]) / reach, top[1] / reach, (top[2] - foot[2]) / reach];
    const h = Math.hypot(up[0], up[2]) || 1;
    const x: Vec3 = [-up[2] / h, 0, up[0] / h];
    const z: Vec3 = [x[1] * up[2] - x[2] * up[1], x[2] * up[0] - x[0] * up[2], x[0] * up[1] - x[1] * up[0]];
    b.at(frame(foot, x, up, z), () => ladderBody(b, len, w0, w1, false));
    // Where someone stands at its foot, facing the tree (U18 orchard pickers).
    return { mesh: b.build(), anchors: { pick: compose(translation(foot[0], 0, foot[2] + 0.14), rotationY(Math.PI)) } };
  },
});
