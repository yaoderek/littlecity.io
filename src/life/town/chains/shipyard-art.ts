// The shipyard's things that come and go (R-D05; shipyard.ts places them):
// the keel timber two shipwrights carry, the staging round a hull being
// planked, the bunting for a launch day, the bottle on its ribbon. Built in
// the SLIP'S FRAME: origin at the middle of the slip's land end on the dock's
// bottom (y = 0 is the sea floor's level 0, the deck at CELL_H), +Z out to
// sea along the slip, +X to the left looking out to sea (place() turns it).
// Pure.

import { CELL_H } from '@/core/grid';
import { compose, rotationY, translation, type Vec3 } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { tube } from '@/parts/ground/kit';
import { clothColors } from '@/parts/props/kit';
import { PALETTE, RAMPS } from '@/style/palette';

const DECK = CELL_H + 0.004;

const beams = new Map<number, MeshData>();
/** The keel timber: a long squared beam `len` long along Z, centred on the origin, its underside at y = 0. */
export function beamMesh(len: number): MeshData {
  const k = Math.round(len * 20);
  let m = beams.get(k);
  if (m) return m;
  const b = new MeshBuilder({ ink: 'yard-beam' });
  b.with({ color: RAMPS.wood[3]!, pattern: PATTERN.none, ink: 'beam' }, () => b.box([-0.05, 0, -len / 2], [0.05, 0.09, len / 2]));
  // Adze marks: a paler face on top.
  b.with({ color: RAMPS.wood[2]!, pattern: PATTERN.none, ink: 'beam-top' }, () => b.box([-0.04, 0.09, -len / 2 + 0.03], [0.04, 0.096, len / 2 - 0.03]));
  m = b.build();
  beams.set(k, m);
  return m;
}

export interface StagingSpec {
  /** Along the slip (u, from its land end): where the hull's ends are. */
  u0: number;
  u1: number;
  /** Half the hull's beam: the staging stands just outside it. */
  half: number;
  /** Height (world) of the staging's walkway, and of the poles' tops. */
  walk: number;
  top: number;
}

/**
 * Staging round a hull on the slip: a row of poles down each side deck with a plank walkway lashed to
 * them, ladders up to it, and raking shores from the deck to the hull's bilge, holding it upright.
 */
export function stagingMesh(s: StagingSpec): MeshData {
  const b = new MeshBuilder({ ink: 'yard-staging' });
  const pole = RAMPS.wood[1]!, plank = RAMPS.wood[2]!, shore = RAMPS.wood[7]!;
  const x = s.half + 0.16;
  const count = Math.max(2, Math.round((s.u1 - s.u0) / 0.9));
  for (const side of [-1, 1]) {
    const px = side * x;
    b.with({ color: pole, pattern: PATTERN.none, ink: `poles${side}` }, () => {
      for (let i = 0; i <= count; i++) {
        const u = s.u0 + ((s.u1 - s.u0) * i) / count;
        tube(b, [[px, DECK, u], [px, s.top, u]], 0.022, { seg: 4, capEnd: true });
      }
    });
    b.with({ color: plank, pattern: PATTERN.none, ink: `walk${side}` }, () => {
      b.box([px - 0.09, s.walk, s.u0 - 0.08], [px + 0.09, s.walk + 0.025, s.u1 + 0.08]);
      // A hand rail on the outer side.
      b.box([px + side * 0.08 - 0.012, s.top - 0.06, s.u0], [px + side * 0.08 + 0.012, s.top - 0.035, s.u1]);
    });
    // A ladder up to the walkway near each end.
    b.with({ color: pole, pattern: PATTERN.none, ink: `ladder${side}` }, () => {
      for (const u of [s.u0 + 0.5, s.u1 - 0.5]) {
        const lx = px + side * 0.17;
        for (const dz of [-0.07, 0.07]) tube(b, [[lx + side * 0.12, DECK, u + dz], [lx, s.walk + 0.12, u + dz]], 0.012, { seg: 4 });
        for (let r = 1; r <= 4; r++) {
          const k = r / 5;
          const y = DECK + (s.walk + 0.12 - DECK) * k, xx = lx + side * 0.12 * (1 - k);
          b.box([xx - 0.01, y - 0.008, u - 0.07], [xx + 0.01, y + 0.008, u + 0.07]);
        }
      }
    });
    // Shores: raking from the deck in to the bilge.
    b.with({ color: shore, pattern: PATTERN.none, ink: `shores${side}` }, () => {
      for (let i = 1; i < count; i += 1) {
        const u = s.u0 + ((s.u1 - s.u0) * (i + 0.5)) / (count + 1);
        tube(b, [[side * (s.half + 0.32), DECK, u], [side * (s.half - 0.05), DECK + 0.32, u]], 0.025, { seg: 4 });
      }
    });
  }
  return b.build();
}

/**
 * Launch-day bunting: a pole at each end of each side deck's outer edge and one between every two cells,
 * strung with little flags in the town's colours (D04's), a tall flagpole either side of the slip's head.
 */
export function buntingMesh(len: number, half: number, seed: number): MeshData {
  const b = new MeshBuilder({ ink: 'yard-bunting' });
  const colors = clothColors();
  const first = seed % colors.length;
  const palette = [colors[first]!, PALETTE.white, colors[(first + 2) % colors.length]!, PALETTE.yellow];
  const top = DECK + 1.25;
  for (const side of [-1, 1]) {
    const x = side * half;
    const posts: number[] = [];
    for (let u = 0.1; u <= len - 0.1 + 1e-6; u += Math.max(1.4, (len - 0.2) / Math.round((len - 0.2) / 2))) posts.push(u);
    if (posts[posts.length - 1]! < len - 0.3) posts.push(len - 0.1);
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: `bpoles${side}` }, () => {
      for (const u of posts) tube(b, [[x, DECK, u], [x, top + 0.08, u]], 0.02, { seg: 4, capEnd: true });
    });
    for (let i = 0; i + 1 < posts.length; i++) {
      const u0 = posts[i]!, u1 = posts[i + 1]!;
      const span = u1 - u0;
      const sag = 0.045 * span + 0.03;
      const rope = (t: number): Vec3 => [x, top - sag * 4 * t * (1 - t), u0 + span * t];
      b.with({ color: PALETTE.ink, pattern: PATTERN.none, ink: `brope${side}` }, () => {
        const pts: Vec3[] = [];
        for (let k = 0; k <= 8; k++) pts.push(rope(k / 8));
        tube(b, pts, 0.008, { seg: 3 });
      });
      const n = Math.max(3, Math.round(span / 0.19));
      const w = 0.07, deep = 0.15;
      b.setPattern(PATTERN.cloth).setInk(`flags${side}`);
      for (let k = 0; k < n; k++) {
        const [px, py, pz] = rope((k + 0.5) / n);
        b.with({ color: palette[(k + i) % palette.length]! }, () => {
          b.setSway((_x, y) => Math.min(1, Math.max(0, (py - y) / deep)) * 0.8);
          b.tri([px + 0.004, py, pz - w], [px + 0.004, py - deep, pz], [px + 0.004, py, pz + w]);
          b.tri([px - 0.004, py, pz + w], [px - 0.004, py - deep, pz], [px - 0.004, py, pz - w]);
          b.setSway(0);
        });
      }
    }
  }
  // Two tall flagpoles at the head with long pennants.
  for (const side of [-1, 1]) {
    const x = side * (half - 0.15);
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: `mast${side}` }, () => tube(b, [[x, DECK, 0.12], [x, DECK + 2.1, 0.12]], 0.026, { seg: 5, capEnd: true }));
    b.with({ color: palette[side > 0 ? 0 : 2]!, pattern: PATTERN.cloth, ink: `pennant${side}` }, () => {
      b.setSway((_x, y) => Math.min(1, Math.max(0, (DECK + 2.1 - y) * 3)) * 0.9 + 0.1);
      const y0 = DECK + 2.05;
      b.tri([x, y0, 0.12], [x, y0 - 0.32, 0.12], [x, y0 - 0.12, 0.12 + 0.75]);
      b.tri([x, y0 - 0.32, 0.12], [x, y0, 0.12], [x, y0 - 0.12, 0.12 + 0.75]);
      b.setSway(0);
    });
  }
  return b.build();
}

let bottle: MeshData | null = null;
/** A bottle of wine with a ribbon bow round its neck, standing on its base at the origin (world units). */
export function bottleMesh(): MeshData {
  if (bottle) return bottle;
  const b = new MeshBuilder({ ink: 'yard-bottle' });
  b.with({ color: '#3f7a4e', pattern: PATTERN.none, ink: 'glass' }, () => b.lathe([[0, 0], [0.032, 0], [0.034, 0.1], [0.012, 0.14], [0.011, 0.18], [0, 0.185]], { segments: 7 }));
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'ribbon' }, () => {
    b.at(compose(translation(0, 0.13, 0), rotationY(0.4)), () => {
      b.box([-0.05, -0.008, -0.004], [0.05, 0.008, 0.004]);
    });
  });
  bottle = b.build();
  return bottle;
}

let chip: MeshData | null = null;
/** A wood chip flying off the adze: a small pale sliver (world units). */
export function chipMesh(): MeshData {
  if (chip) return chip;
  const b = new MeshBuilder({ ink: 'yard-chip' });
  b.with({ color: RAMPS.wood[5]!, pattern: PATTERN.none, ink: 'chip' }, () => b.box([-0.02, 0, -0.008], [0.02, 0.008, 0.008]));
  chip = b.build();
  return chip;
}
