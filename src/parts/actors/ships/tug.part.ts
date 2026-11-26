// The tug (L38-F): it meets a cargo ship at the edge of the map, leads it
// in, pushes it alongside, stands by while it is worked, and leads it out.
// A stout little steel boat: a red hull with a black waterline, a fat ring of
// black fenders round the bow, a white wheelhouse with windows all round, a
// funnel with a black top, a towing post aft.
//
// Frame: afloat, +Z the bow, y = 0 the waterline.

import { translation } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { PALETTE } from '@/style/palette';
import { drawShipHull, type ShipHullSpec } from './hull';
import { smooth } from './hull';

export const TUG = { length: 1.55, beam: 0.66, funnel: [0, 0.98, -0.1] as const };

export function tugSpec(): ShipHullSpec {
  return {
    length: TUG.length,
    beam: TUG.beam,
    draft: 0.16,
    widest: 0.45,
    widestY: 0.14,
    transom: 0.7,
    bowPoint: 0.8,
    stemRake: 0.3,
    transomRake: 0.2,
    round: 0.2,
    vee: 0.5,
    tumble: 0,
    rail: (t) => 0.24 + 0.08 * smooth((t - 0.75) / 0.2),
    decks: [{ t0: 0, t1: 1, y: 0.2 }],
    skin: 0.03,
    stations: [0, 0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.85, 0.93, 1],
  };
}

export function drawTug(b: MeshBuilder): void {
  const spec = tugSpec();
  const hull = drawShipHull(b, spec, {
    bottom: PALETTE.redDark,
    boot: PALETTE.metal,
    hull: PALETTE.red,
    upper: PALETTE.red,
    wale: PALETTE.metal,
    rail: PALETTE.white,
    deck: PALETTE.redDark,
    bulkhead: PALETTE.white,
  }, { boot: 0.06, wale: [0.12, 0.17], waleOut: 0.04 });
  // The fenders: a fat black band round the bow.
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'fender' }, () => {
    const t0 = 0.86;
    const z = hull.z(1, 0.2) - 0.02;
    b.box([-0.12, 0.12, z - 0.02], [0.12, 0.27, z + 0.08]);
    for (const s of [1, -1]) {
      const x = s * hull.outer(t0, 0.2);
      b.box([s > 0 ? x - 0.02 : x - 0.05, 0.12, hull.z(t0, 0.2) - 0.1], [s > 0 ? x + 0.05 : x + 0.02, 0.27, hull.z(t0, 0.2) + 0.1]);
    }
  });
  // The wheelhouse: two decks, the upper one glazed all round.
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'house' }, () => {
    b.box([-0.22, 0.2, -0.32], [0.22, 0.5, 0.22], { skip: ['bottom'] });
    b.box([-0.18, 0.5, -0.08], [0.18, 0.78, 0.22], { skip: ['bottom'] });
  });
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink: 'windows' }, () => {
    b.box([-0.185, 0.6, -0.04], [0.185, 0.72, 0.225]);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'roof' }, () => b.box([-0.21, 0.78, -0.11], [0.21, 0.81, 0.25]));
  // The funnel, red with a black top.
  const [, fy, fz] = TUG.funnel;
  b.with({ color: PALETTE.red, pattern: PATTERN.none, ink: 'funnel' }, () => b.box([-0.08, 0.5, fz - 0.16], [0.08, fy - 0.1, fz - 0.02], { skip: ['bottom'] }));
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'funnel-top' }, () => b.box([-0.085, fy - 0.1, fz - 0.165], [0.085, fy, fz - 0.015]));
  // The towing post aft, and a mast with its light.
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'post' }, () => b.box([-0.05, 0.2, -0.5], [0.05, 0.34, -0.42]));
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'mast' }, () => b.at(translation(0, 0, 0.05), () => b.lathe([[0.016, 0.8], [0.01, 1.08]], { segments: 5, capTop: true })));
  b.with({ color: PALETTE.white, pattern: PATTERN.glow, ink: 'light' }, () => b.boxAt([0, 1.08, 0.05], [0.04, 0.04, 0.04]));
}

export default definePart({
  actor: 'tug',
  build(_item, ctx) {
    const b = ctx.mesh();
    drawTug(b);
    return { mesh: b.build(), animated: true };
  },
});
