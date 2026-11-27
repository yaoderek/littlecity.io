// Hands on what they hold: for every tool and load and every pose it is used
// in, sampled through the pose's drawings, the hand is on its grip, and the
// hand the pose math says is where the drawn arm puts it.

import { describe, expect, test } from 'vitest';
import type { Vec3 } from '@/core/mat4';
import { aimArm, applyHold, bodyToFigure, CHEST_TOOLS, handOf, handReach, holdLong, JUGGLE, loadGrips, longToolLine, SHAFTS } from './hands';
import { HOLD_OF, holdAnchor, type Load } from './loads';
import { lookOf, rigOf } from './person';
import { castLine, castLineMesh, FLOAT_TOP, floatMesh, ROD_TIP, toolMesh } from './extras';
import { findDuplicateFaces, validateMesh } from '@/gen/checks';
import { CELL_H, SEA_Y } from '@/core/grid';
import { PEOPLE } from '@/style/people';
import { POSES, poseOf, rigMatrices, type PoseName } from './pose';
import { CARGO_AT, CARGO_GRIP } from '@/life/ships/crew';
import { REINS_HAND } from '@/life/people/garrison.system';

const look = lookOf(1234);
const rig = rigOf(look);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The middle of a hand as the drawn arm piece puts it (figure frame). */
function drawnHand(m: Float32Array, side: 1 | -1): Vec3 {
  const k = (side > 0 ? 4 : 3) * 16, y = -handReach(rig);
  return [m[k + 4]! * y + m[k + 12]!, m[k + 5]! * y + m[k + 13]!, m[k + 6]! * y + m[k + 14]!];
}
/** Seconds into a pose at which its drawings change (held poses change a few times a second). */
const SAMPLES = Array.from({ length: 24 }, (_, i) => i * 0.11);
/** Hands within this of their grip (figure units: a person is 0.42 tall, a hand 0.03 across). */
const NEAR = 0.012;

describe('hands on what they hold', () => {
  test('the pose math for a hand is where the drawn arm puts it', () => {
    for (const name of ['walk', 'sweep', 'tend', 'wave', 'fish'] as PoseName[]) {
      for (const t of SAMPLES) {
        const pose = poseOf(name, t);
        const m = rigMatrices(look, pose, new Float32Array(80), 0, rig);
        for (const side of [1, -1] as const) expect(dist(drawnHand(m, side), bodyToFigure(handOf(pose, rig, side), pose, rig)), `${name} ${side}`).toBeLessThan(1e-4);
      }
    }
  });

  test('long tools: the broom sweeping, the scythe mowing, the rod fishing: both hands on the shaft, the broom on the floor', () => {
    const uses: ['broom' | 'scythe' | 'rod', PoseName][] = [['broom', 'sweep'], ['scythe', 'mow'], ['rod', 'fish']];
    for (const [tool, name] of uses) {
      for (const t of SAMPLES) {
        const pose = poseOf(name, t);
        const [from, to] = longToolLine(tool, pose);
        const held = holdLong(pose, rig, from, to);
        const m = rigMatrices(look, pose, new Float32Array(80), 0, rig);
        expect(dist(drawnHand(m, 1), held.gripR), `${tool} right hand at ${t}`).toBeLessThan(NEAR);
        expect(dist(drawnHand(m, -1), held.gripL), `${tool} left hand at ${t}`).toBeLessThan(NEAR);
        // The two hands apart along the shaft, the right the higher.
        expect(dist(held.gripR, held.gripL), tool).toBeGreaterThan(0.03);
        expect(held.gripR[1]).toBeGreaterThan(held.gripL[1] - 1e-6);
        if (tool === 'broom') expect(from[1]).toBeLessThan(0.02);
      }
    }
  });

  test('loads: every way of carrying, walking and standing, has its hands where it holds it', () => {
    const loads = Object.keys(HOLD_OF) as Load[];
    for (const load of loads) {
      for (const name of ['walk', 'stand', 'tend', 'chat'] as PoseName[]) {
        for (const t of SAMPLES) {
          const pose = poseOf(name, t);
          applyHold(pose, rig, { tool: null, load, hold: HOLD_OF[load], anchor: holdAnchor(load) });
          const g = loadGrips(HOLD_OF[load], holdAnchor(load));
          if (g.R) expect(dist(handOf(pose, rig, 1), g.R), `${load} right hand, ${name}`).toBeLessThan(NEAR * 1.5);
          if (g.L) expect(dist(handOf(pose, rig, -1), g.L), `${load} left hand, ${name}`).toBeLessThan(NEAR * 1.5);
        }
      }
    }
  });

  test('the L23 miller’s sack and baker’s tray at the chest', () => {
    for (const tool of Object.keys(CHEST_TOOLS)) {
      const pose = poseOf('walk', 0.3);
      applyHold(pose, rig, { tool, load: null, hold: null, anchor: null });
      expect(dist(handOf(pose, rig, 1), CHEST_TOOLS[tool]![0])).toBeLessThan(NEAR * 1.5);
      expect(dist(handOf(pose, rig, -1), CHEST_TOOLS[tool]![1])).toBeLessThan(NEAR * 1.5);
    }
  });

  test('a load stays in the hands whatever the pose (a cheer, a look round, a flinch), from every way of carrying', () => {
    for (const load of Object.keys(HOLD_OF) as Load[]) {
      for (const name of POSES.filter((n) => n !== 'mow')) {
        for (const t of [0, 0.37, 0.81]) {
          const pose = poseOf(name, t);
          applyHold(pose, rig, { tool: null, load, hold: HOLD_OF[load], anchor: holdAnchor(load) });
          const g = loadGrips(HOLD_OF[load], holdAnchor(load));
          if (g.R) expect(dist(handOf(pose, rig, 1), g.R), `${load} right hand, ${name}`).toBeLessThan(NEAR * 1.5);
          if (g.L) expect(dist(handOf(pose, rig, -1), g.L), `${load} left hand, ${name}`).toBeLessThan(NEAR * 1.5);
        }
      }
    }
  });

  test('L36 pike and torch, L37 lance: the right hand closed on the shaft, walking and standing', () => {
    // A slim soldier and a stout one: the shaft is in reach of both.
    for (const r of [rigOf({ ...look, girth: 0.9 }), rigOf({ ...look, girth: 1.15 })]) {
      for (const tool of Object.keys(SHAFTS)) {
        const [a, b] = SHAFTS[tool]!;
        for (const name of ['walk', 'stand'] as PoseName[]) {
          for (const t of SAMPLES) {
            const pose = poseOf(name, t);
            applyHold(pose, r, { tool, load: null, hold: null, anchor: null });
            const h = handOf(pose, r, 1);
            // Distance from the hand to the shaft's segment.
            const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const k = Math.max(0, Math.min(1, ((h[0] - a[0]) * d[0] + (h[1] - a[1]) * d[1] + (h[2] - a[2]) * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)));
            expect(dist(h, [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k]), `${tool} ${name} ${t}`).toBeLessThan(NEAR);
          }
        }
      }
    }
  });

  test('L56 juggling: each hand under its ball, in both drawings', () => {
    for (const tool of Object.keys(JUGGLE)) {
      const pose = poseOf('juggle', 0.2);
      applyHold(pose, rig, { tool, load: null, hold: null, anchor: null });
      for (const side of [1, -1] as const) {
        const h = handOf(pose, rig, side), want = JUGGLE[tool]![side > 0 ? 0 : 1];
        expect(dist(h, want), `${tool} ${side}`).toBeLessThan(NEAR);
      }
    }
  });

  test('a sailor carrying cargo has a hand at either side of it; the rider’s left hand is on the reins', () => {
    const pose = poseOf('walk', 0.4);
    for (const side of [1, -1] as const) aimArm(pose, rig, side, [side * CARGO_GRIP[0], CARGO_GRIP[1], CARGO_GRIP[2]]);
    const s = look.scale;
    for (const side of [1, -1] as const) {
      const f = bodyToFigure(handOf(pose, rig, side), pose, rig);
      const h: Vec3 = [f[0] * s, f[1] * s, f[2] * s];
      // The cargo (crates, barrels and sacks 0.2 to 0.25 across) sits CARGO_AT forward with its bottom CARGO_AT up.
      expect(Math.abs(h[0]), 'at its side').toBeGreaterThan(0.085);
      expect(Math.abs(h[0])).toBeLessThan(0.13);
      expect(h[2], 'along its side').toBeGreaterThan(CARGO_AT[0] - 0.1);
      expect(h[1], 'up its side').toBeGreaterThan(CARGO_AT[1]);
      expect(h[1]).toBeLessThan(CARGO_AT[1] + 0.22);
    }
    const ride = poseOf('stand', 0);
    aimArm(ride, rig, -1, REINS_HAND);
    expect(dist(handOf(ride, rig, -1), REINS_HAND)).toBeLessThan(NEAR);
  });
});

describe('the fishing line reaches the sea', () => {
  /** The rod's world matrix as the people system makes it: T(x, y, z) · Ry(heading) · S(scale) (the rod is in the figure's frame). */
  const rodAt = (x: number, y: number, z: number, heading: number, scale: number): number[] => {
    const c = Math.cos(heading) * scale, s = Math.sin(heading) * scale;
    return [c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, x, y, z, 1];
  };
  const scales = [lookOf(1).scale, lookOf(77).scale, lookOf(5, true).scale];

  test('from any height above the water, the line runs from the rod’s tip down to the float sitting on the surface', () => {
    for (const deck of [CELL_H, 2 * CELL_H, 3 * CELL_H, SEA_Y + 0.2]) {
      for (const heading of [0, 1.1, Math.PI, -2.4]) {
        for (const scale of scales) {
          for (const dip of [0, 0.012]) {
            const rod = rodAt(10.3, deck, 20.7, heading, scale);
            const line: number[] = [], float: number[] = [];
            expect(castLine(rod, SEA_Y, dip, line, float), `deck ${deck}`).not.toBeNull();
            const [x, y, z] = ROD_TIP;
            const tx = rod[0]! * x + rod[8]! * z + rod[12]!, ty = rod[5]! * y + rod[13]!, tz = rod[2]! * x + rod[10]! * z + rod[14]!;
            // The float on the water (a little under while a fish tugs), straight under the tip.
            expect(float[13]).toBeCloseTo(SEA_Y - dip, 6);
            expect(float[12]).toBeCloseTo(tx, 6);
            expect(float[14]).toBeCloseTo(tz, 6);
            // The line (one unit up +Y, stretched): from the top of the float's stalk to the tip, short of neither.
            expect(line[13]).toBeCloseTo(SEA_Y - dip + FLOAT_TOP, 6);
            expect(line[13]! + line[5]!).toBeCloseTo(ty, 6);
            expect(line[12]).toBeCloseTo(tx, 6);
            expect(line[14]).toBeCloseTo(tz, 6);
            expect([line[0], line[10]]).toEqual([1, 1]);
          }
        }
      }
    }
  });

  test('the rod, the line and the float are sound meshes', () => {
    for (const mesh of [toolMesh('rod'), castLineMesh(), floatMesh()]) {
      expect(validateMesh(mesh)).toEqual([]);
      expect(findDuplicateFaces(mesh)).toBe(0);
    }
  });

  test('nothing hangs from a rod held below the water or just over it', () => {
    const line: number[] = [], float: number[] = [];
    expect(castLine(rodAt(0, SEA_Y - 0.8, 0, 0, scales[0]!), SEA_Y, 0, line, float)).toBeNull();
  });

  test('standing where people fish, the rod’s tip is well out past the end of the dock, and they stand clear of a pier head’s seat and bucket', () => {
    for (const scale of scales) {
      // From the middle of the cell, PEOPLE.fishReach out toward the water; the cell's edge is 0.5 out.
      expect(PEOPLE.fishReach + ROD_TIP[2] * scale, `scale ${scale}`).toBeGreaterThan(0.5 + 0.25);
    }
    // The seat's and the bucket's fronts are about 0.4 out (pier-head.part.ts); the edge is 0.5.
    expect(PEOPLE.fishReach).toBeGreaterThan(0.4);
    expect(PEOPLE.fishReach).toBeLessThan(0.46);
  });
});
