// The cargo ship (L38-F): a steel container feeder, the port's ship. What
// makes it read at a glance, from the overview:
//
//   a dark steel hull     long and straight, a red waterline band, a white
//                         sheer line, a raised forecastle, a flat transom
//   the bridge aft        a white block four decks high with bands of
//                         windows, the wheelhouse on top with its wings out
//                         over the sides, a radar mast, the funnel behind it
//                         in the line's colour with a black top
//   hatch covers          green, three of them, where the containers stand
//                         (the containers are instances: the cranes lift them)
//   an orange lifeboat    on its ramp over the stern
//
// Lights glow at dusk by themselves (PATTERN.glow): a masthead light, the red
// and green sidelights on the bridge wings, the windows.
//
// Frame: afloat, +Z the bow, y = 0 the waterline (freighter-rig.ts).

import { compose, rotationX, translation } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { PATTERN, type ColorInput, type MeshBuilder } from '@/gen/mesh';
import { PALETTE, RAMPS } from '@/style/palette';
import { flat } from '../boats/hull';
import { FREIGHTER } from './freighter-rig';
import { drawShipHull, sidePanel } from './hull';
import { rigOf } from './rig';

export interface FreighterPaint {
  hull: ColorInput;
  /** The funnel's band (the line's colour). */
  band: ColorInput;
}

/** A dark hull (mostly near-black, sometimes deep blue or red), and the line's colour on the funnel. */
export function freighterPaint(look: number): FreighterPaint {
  const l = Math.abs(Math.round(look));
  const hulls: ColorInput[] = [PALETTE.metal, PALETTE.metal, RAMPS.roof[1]!, PALETTE.metal, PALETTE.redDark];
  const bands: ColorInput[] = [PALETTE.yellow, PALETTE.red, RAMPS.roof[1]!, RAMPS.roof[2]!, RAMPS.roof[3]!];
  return { hull: hulls[l % hulls.length]!, band: bands[Math.floor(l / hulls.length) % bands.length]! };
}

/** A window band: a strip of glass along a face of the house. */
function band(b: MeshBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, ink: string): void {
  b.with({ color: PALETTE.glass, pattern: PATTERN.glass, ink }, () => b.box([x0, y0, z0], [x1, y1, z1]));
}

export function drawFreighter(b: MeshBuilder, look: number): void {
  const rig = rigOf('freighter', look);
  const spec = rig.spec;
  const paint = freighterPaint(look);
  const hull = drawShipHull(b, spec, {
    bottom: PALETTE.redDark,
    boot: PALETTE.red,
    hull: paint.hull,
    upper: paint.hull,
    wale: PALETTE.white,
    rail: PALETTE.white,
    deck: PALETTE.redDark,
    bulkhead: PALETTE.white,
  }, { boot: 0.13, wale: [0.5, 0.54], waleOut: 0.012 });
  const sternZ = hull.z(0, spec.rail(0));

  // ── the hatch covers, one under each bay ──
  b.with({ color: RAMPS.roof[3]!, pattern: PATTERN.none, ink: 'hatches' }, () => {
    for (const z of FREIGHTER.bays) b.box([-0.82, FREIGHTER.deck, z - 0.9], [0.82, FREIGHTER.hatchTop, z + 0.9], { skip: ['bottom'] });
  });

  // ── the accommodation block, the wheelhouse and its wings ──
  const z0 = sternZ + 0.1, z1 = hull.z(FREIGHTER.houseTo, 1);
  const hx = 0.72;
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'house' }, () => b.box([-hx, FREIGHTER.deck, z0], [hx, FREIGHTER.bridgeDeck, z1], { skip: ['bottom'] }));
  // A band of windows round each deck of it.
  for (let k = 0; k < 4; k++) {
    const y = FREIGHTER.deck + 0.12 + k * 0.33;
    band(b, -hx - 0.012, hx + 0.012, y, y + 0.1, z1 - 0.004, z1 + 0.012, `house-windows${k}`);
    for (const s of [1, -1]) band(b, s > 0 ? hx : -hx - 0.012, s > 0 ? hx + 0.012 : -hx, y, y + 0.1, z0 + 0.12, z1 - 0.1, `house-windows${k}`);
  }
  // The wheelhouse: a deck higher, wings reaching out over both sides, windows all along its front.
  const wy0 = FREIGHTER.bridgeDeck, wy1 = FREIGHTER.bridgeDeck + 0.3;
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'bridge' }, () => {
    b.box([-0.62, wy0, z1 - 0.55], [0.62, wy1, z1 + 0.04], { skip: ['bottom'] });
    b.box([-1.0, wy0 - 0.06, z1 - 0.4], [1.0, wy0 + 0.02, z1 + 0.02]);
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'bridge-roof' }, () => b.box([-0.66, wy1, z1 - 0.58], [0.66, wy1 + 0.04, z1 + 0.07]));
  band(b, -0.58, 0.58, wy0 + 0.12, wy0 + 0.25, z1 + 0.04, z1 + 0.055, 'bridge-windows');
  // Sidelights on the wings: red to port (−X), green to starboard.
  b.with({ color: PALETTE.red, pattern: PATTERN.glow, ink: 'port-light' }, () => b.box([-1.0, wy0 + 0.02, z1 - 0.12], [-0.92, wy0 + 0.1, z1 - 0.04]));
  b.with({ color: PALETTE.leafDark, pattern: PATTERN.glow, ink: 'starboard-light' }, () => b.box([0.92, wy0 + 0.02, z1 - 0.12], [1.0, wy0 + 0.1, z1 - 0.04]));

  // ── the funnel, the radar mast, the foremast ──
  const [, fy, fz] = rig.funnel!;
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'funnel' }, () => b.box([-0.24, FREIGHTER.bridgeDeck - 0.2, fz - 0.26], [0.24, fy - 0.42, fz + 0.24], { skip: ['bottom', 'top'] }));
  b.with({ color: paint.band, pattern: PATTERN.none, ink: 'funnel-band' }, () => b.box([-0.25, fy - 0.42, fz - 0.27], [0.25, fy - 0.18, fz + 0.25], { skip: ['bottom', 'top'] }));
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'funnel-top' }, () => b.box([-0.25, fy - 0.18, fz - 0.27], [0.25, fy, fz + 0.25]));
  for (const m of rig.masts) {
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: `mast${m.z}` }, () => b.at(translation(0, 0, m.z), () => b.lathe([[m.r0, m.foot], [m.r1, m.head]], { segments: 6, capTop: true })));
  }
  const radar = rig.masts[1]!;
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'radar' }, () => b.box([-0.28, radar.head - 0.28, radar.z - 0.03], [0.28, radar.head - 0.24, radar.z + 0.03]));
  b.with({ color: PALETTE.white, pattern: PATTERN.glow, ink: 'masthead' }, () => b.boxAt([0, rig.masts[0]!.head, rig.masts[0]!.z], [0.06, 0.06, 0.06]));
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'radar-foot' }, () => b.box([-0.2, wy1 + 0.04, radar.z - 0.12], [0.2, radar.foot, radar.z + 0.12]));

  // ── the lifeboat on its ramp over the stern ──
  b.with({ color: RAMPS.roof[2]!, pattern: PATTERN.none, ink: 'lifeboat' }, () => {
    b.at(compose(translation(0, FREIGHTER.deck + 0.62, sternZ + 0.02), rotationX(0.35)), () => {
      b.box([-0.14, 0, -0.08], [0.14, 0.16, 0.42]);
      b.box([-0.1, 0.16, 0.02], [0.1, 0.24, 0.3]);
    });
  });

  // ── anchors in their pockets either side of the bow, and the forecastle's front ──
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'anchors' }, () => {
    for (const s of [1, -1]) sidePanel(b, hull, 0.955, 0.6, 0.14, 0.12, s, 0.02);
  });
  // The ship's name board on the stern: a pale panel (no lettering at this size).
  b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'name' }, () => {
    const y = 0.42, z = hull.z(0, y) - 0.012;
    flat(b, [[-0.3, y, z], [0.3, y, z], [0.3, y + 0.07, z], [-0.3, y + 0.07, z]], [0, 0, -1]);
  });
}

export default definePart({
  actor: 'freighter',
  build(item, ctx) {
    const b = ctx.mesh();
    drawFreighter(b, Math.abs(Math.round(item.params?.look ?? 0)));
    return { mesh: b.build(), animated: true };
  },
});
