// Town props (D04, D08, D10, D11, D15): bunting, café table, creeper,
// doorstep, rope coil, lobster pots, net rack. Several parts in one file;
// each is discovered by its own export.

import type { Dir4 } from '@/core/grid';
import { compose, rotationX, rotationY, translation, type Mat4, type Vec3 } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { SLOT_INSET } from '@/gen/frames';
import { PATTERN } from '@/gen/mesh';
import { barrel } from '@/parts/ground/dock-goods.part';
import { hingesOf } from '@/parts/openings/door-leaf';
import { FLOOR } from '@/style/ground';
import { PALETTE } from '@/style/palette';
import { clothColors, dab, flowerColors, lantern, localTone, lump, mixColor, posy, pot, rngOf, tube, vary } from './kit';

const LINE = -(0.5 - SLOT_INSET);
/** A house wall stands this far inside its cell line. */
const WALL_IN = 0.07;

/**
 * Bunting: a string of little flags between two sockets, in the town's
 * colours. Each pennon is pegged at the rope and free at its point, so the
 * wind lifts the whole string. Frame: origin at `from`, +X toward `to`.
 * `drop` hangs the rope that far below its two ends (negative raises it);
 * `bulbs` hangs a small glowing bulb between every two flags.
 */
export const bunting = definePart({
  prop: 'bunting',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 239));
    const span = Math.max(0.4, ctx.span);
    const y0 = -(item.params?.drop ?? 0);
    const sag = 0.035 * span + 0.02;
    const rope = (t: number): Vec3 => [span * t, y0 - sag * 4 * t * (1 - t), 0];
    b.with({ color: PALETTE.ink, pattern: PATTERN.none, ink: 'rope' }, () => {
      const pts: Vec3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(rope(i / 8));
      tube(b, pts, 0.007, { seg: 3 });
    });
    const colors = clothColors();
    const first = Math.floor(r('first') * colors.length);
    const palette = [colors[first]!, PALETTE.white, colors[(first + 2) % colors.length]!];
    const n = Math.max(3, Math.round(span / 0.17));
    const w = 0.055, deep = 0.12;
    b.setPattern(PATTERN.cloth).setInk('flags');
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const [x, y] = rope(t);
      b.with({ color: palette[i % palette.length]! }, () => {
        b.setSway((_px, py) => Math.min(1, Math.max(0, (y - py) / deep)) * 0.8);
        b.tri([x - w, y, 0.004], [x, y - deep, 0.004], [x + w, y, 0.004]);
        b.tri([x + w, y, -0.004], [x, y - deep, -0.004], [x - w, y, -0.004]);
        b.setSway(0);
      });
    }
    // L10: on a square, a small bulb between every two flags, hanging just under the rope. Its glass
    // glows (PATTERN.glow): the dusk lamps system lights the string with the square's lamps.
    if (item.params?.bulbs) {
      b.with({ color: PALETTE.yellow, pattern: PATTERN.glow, ink: 'bulbs' }, () => {
        for (let i = 1; i < n; i++) {
          const [x, y] = rope(i / n);
          lump(b, x, y - 0.03, 0, 0.021, 0.026, 0.021, { seg: 5, rings: 3 });
        }
      });
    }
    return { mesh: b.build() };
  },
});

/**
 * Café table: a round table under a striped parasol with two chairs.
 * Frame: a floor slot. Sockets 'seat-0' and 'seat-1' on the chairs, facing
 * the table.
 */
export const cafeTable = definePart({
  prop: 'cafe-table',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 331));
    const colors = [PALETTE.red, PALETTE.glass, PALETTE.leafDark, PALETTE.yellow, PALETTE.pink];
    const color = colors[(((item.params?.color ?? 0) % colors.length) + colors.length) % colors.length]!;
    b.rotateY(r('turn') * Math.PI * 2);
    b.with({ color: PALETTE.white, pattern: PATTERN.none, ink: 'table' }, () => {
      b.lathe([[0.02, 0], [0.02, 0.17], [0.105, 0.17], [0.105, 0.19]], { segments: 8, capTop: true });
    });
    const seats: Mat4[] = [];
    for (const side of [-1, 1]) {
      const m = compose(translation(side * 0.2, 0, 0), rotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2));
      b.at(m, () => {
        b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: `chair${side}` }, () => {
          b.box([-0.05, 0.1, -0.05], [0.05, 0.118, 0.05]);
          for (const [x, z] of [[-0.042, -0.042], [0.042, -0.042], [-0.042, 0.042], [0.042, 0.042]] as const) b.boxAt([x, 0, z], [0.014, 0.1, 0.014], { skip: ['bottom', 'top'] });
          b.box([-0.05, 0.118, -0.058], [0.05, 0.25, -0.044]);
        });
      });
      seats.push(compose(m, translation(0, 0.118, 0)));
    }
    // The parasol: a pole through the table and a shallow cone of cloth, its rim free in the wind.
    b.with({ color: PALETTE.trunk, pattern: PATTERN.none, ink: 'pole' }, () => b.lathe([[0.011, 0.19], [0.011, 0.64]], { segments: 4 }));
    b.with({ color, pattern: PATTERN.stripes, ink: 'parasol' }, () => {
      b.setSway((x, _y, z) => Math.min(1, Math.hypot(x, z) / 0.27) * 0.3);
      b.lathe([[0.27, 0.54], [0, 0.66]], { segments: 8, smooth: false });
      b.lathe([[0, 0.535], [0.27, 0.54]], { segments: 8, smooth: false });
      b.setSway(0);
    });
    return { mesh: b.build(), anchors: { 'seat-0': seats[0]!, 'seat-1': seats[1]! } };
  },
});

/**
 * Creeper: ivy or a climbing rose growing up the corner of a wall bay, one
 * or two storeys high, spreading as it climbs. It keeps to the edge of the
 * cell, clear of the window in the middle of it. Frame: an edge slot of the
 * ground cell outside the wall, +Z away from the wall.
 */
export const creeper = definePart({
  prop: 'creeper',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 587));
    const tone = localTone((item.params?.face ?? 2) as Dir4);
    const storeys = Math.max(1, Math.min(2, item.params?.storeys ?? 1));
    const top = storeys * 0.8 - 0.12 - r('top') * 0.12;
    const zw = LINE - (item.params?.inset ?? WALL_IN);
    const side = r('side') < 0.5 ? -1 : 1;
    const x0 = side * 0.4;
    const leaf = vary(mixColor(PALETTE.bush, PALETTE.leafDark, 0.3), r('leaf'));
    const dark = mixColor(leaf, PALETTE.leafDark, 0.5);
    b.with({ color: PALETTE.trunk, pattern: PATTERN.none, ink: 'vine' }, () => tube(b, [[x0, 0, zw + 0.02], [x0 - side * 0.03, top * 0.5, zw + 0.015], [x0 - side * 0.05, top * 0.85, zw + 0.015]], [0.014, 0.01, 0.006], { seg: 3 }));
    b.with({ pattern: PATTERN.leaves, ink: 'vine', sway: 0.12 }, () => {
      const n = Math.round(top / 0.13);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        // Narrow at the foot, broader toward the top, never past the middle third of the bay.
        const reach = 0.05 + 0.1 * t;
        const x = x0 - side * (reach * (0.4 + r('x', i) * 0.9));
        b.with({ color: i % 3 === 1 ? dark : leaf }, () =>
          lump(b, x, 0.07 + t * (top - 0.07), zw + 0.022, 0.075 + r('w', i) * 0.03, 0.085, 0.024, { seg: 6, rings: 4, normal: i % 3 === 1 ? tone.mid : tone.lit, twist: i }),
        );
      }
    });
    if (r('rose') < 0.4) {
      const colors = flowerColors();
      b.with({ color: colors[Math.floor(r('fc') * colors.length)]!, pattern: PATTERN.none, ink: 'vine' }, () => {
        for (let i = 0; i < 5; i++) dab(b, x0 - side * r('fx', i) * 0.14, 0.15 + r('fy', i) * (top - 0.2), zw + 0.048, 0.024, tone.lit, 5, 0.014);
      });
    }
    return { mesh: b.build() };
  },
});

/**
 * Doorstep: what stands at a front door. A mat where D11 found a flat place
 * for one; by the rule's choice a pair of potted plants, a barrel, the place
 * for a bicycle leaning on the wall (the bike itself is the door-bike prop), a lantern on the wall beside the door (glowing;
 * socket 'lamp-head').
 * Frame: the 'door' socket (the ground line just outside the door, +Z out).
 * The wall is 0.37 behind it, plus 0.1 for every stoop step.
 *
 * The mat is a thin slab (0.008) lying 0.004 over what it lies on (`ground`:
 * bare ground, a path, a plaza, a deck or terrace, a marble top), as wide as
 * the door's leaves and a little more, beyond the stoop and beyond the swing
 * of the leaf (doors open outward: door-leaf.ts).
 */
/** The stoop's width and the leaf kind of each `door` param (door.part.ts). */
const DOORS = [
  { stoop: 0.46, leaf: 'plain', mat: 0.3 },
  { stoop: 0.3, leaf: 'shop', mat: 0.24 },
  { stoop: 0.62, leaf: 'double', mat: 0.46 },
] as const;

/** The height over the ground line of what a doormat lies on (D11's `ground`). */
function groundHeight(code: number): number {
  switch (code) {
    case 1: return FLOOR.pathLift;
    case 2: return FLOOR.plazaLift + 0.002; // over the plaza's motif
    case 3: return 0.004; // a dock deck, an arch's deck, a house's terrace
    case 4: return 0.008; // a marble top
    case 5: return 0.012; // a courtyard's cobbles (commons.part.ts)
    default: return 0;
  }
}
export const doorstep = definePart({
  prop: 'doorstep',
  build(item, ctx) {
    const b = ctx.mesh();
    const p = item.params ?? {};
    const r = rngOf(ctx.seed ^ ((p.look ?? 0) * 743));
    const steps = Math.max(0, p.steps ?? 0);
    const out = 0.17 + steps * 0.1; // the stoop's depth from the wall
    const zw = -(out + 0.2);
    const door = DOORS[Math.min(2, Math.max(0, p.door ?? 0))]!;
    const matColor = r('mat') < 0.5 ? PALETTE.redDark : PALETTE.trunk;
    if (p.mat ?? 1) {
      // Beyond the stoop, and (on the doorstep's level) beyond the reach of the leaf swinging out.
      const reach = Math.max(...hingesOf(door.leaf).map((h) => h.z + h.width));
      const near = steps > 0 ? out + 0.02 : Math.max(out + 0.02, reach + 0.015);
      const y0 = groundHeight(p.ground ?? 0) + 0.004, w = door.mat / 2;
      // On a path, within its body (a shop door stands 0.26 left of the cell's middle).
      const atX = door.leaf === 'shop' ? -0.26 : 0, room = 0.5 - FLOOR.pathMargin - 0.05; // its edges wander
      const cx = p.ground === 1 ? Math.min(Math.max(0, -room + w - atX), room - w - atX) : 0;
      b.with({ color: matColor, pattern: PATTERN.cloth, ink: 'mat' }, () => b.box([cx - w, y0, zw + near], [cx + w, y0 + 0.008, zw + near + 0.14], { skip: ['bottom'] }));
    }
    const flowers = flowerColors();
    const flower = flowers[(((p.flowers ?? 0) % flowers.length) + flowers.length) % flowers.length]!;
    // Which side the big things take; the pots take whatever side is left.
    const barrelSide = r('bs') < 0.5 ? -1 : 1;
    const taken = new Set<number>();
    // The bike leaning on the wall to the right of the door is its own prop (door-bike, bike.part.ts), so
    // that its owner can ride it away: the doorstep only keeps its place.
    if (p.bicycle) taken.add(1);
    // A shop door stands at the left end of its shopfront: nothing on that side but the wall's corner.
    if (door.leaf === 'shop') taken.add(-1);
    // Pots and barrel stand clear of the stoop's sides.
    const half = door.stoop / 2;
    if (p.barrel) {
      const side = taken.has(barrelSide) ? -barrelSide : barrelSide;
      if (!taken.has(side)) {
        taken.add(side);
        b.at(translation(side * Math.max(0.36, half + 0.09), 0, zw + 0.1), () => barrel(b, 0.065, 0.19, vary(PALETTE.wood, r('barrel')), 'barrel'));
      }
    }
    if (p.pots) {
      for (const side of [-1, 1]) {
        if (taken.has(side)) continue;
        b.at(translation(side * Math.max(0.25, half + 0.06), 0, zw + 0.075), () => {
          pot(b, 0.045, 0.075, PALETTE.brick, `pot${side}`);
          b.setInk(`pot${side}`);
          posy(b, 0, 0.07, 0, 0.055, flower, r, side, `pot${side}`, 3);
        });
      }
    }
    let head: Mat4 | undefined;
    if (p.lantern) {
      // Beside the door frame (a chapel's double door is wider, under its porch).
      const y = steps * 0.16 + 0.5, x = door.leaf === 'double' ? -0.42 : -0.215;
      b.with({ color: PALETTE.metal, pattern: PATTERN.metal, ink: 'lantern-cap' }, () => b.box([x - 0.008, y, zw], [x + 0.008, y + 0.016, zw + 0.06], { skip: ['n'] }));
      const size = 0.06;
      b.at(translation(x, y - size * 1.77, zw + 0.045), () => void lantern(b, size, 'lantern'));
      head = translation(x, y - size * 0.9, zw + 0.045);
    }
    return { mesh: b.build(), anchors: head ? { 'lamp-head': head } : undefined };
  },
});

/** Rope coil: a flat coil of mooring rope on the deck. Frame: a floor slot. */
export const ropeCoil = definePart({
  prop: 'rope-coil',
  build(_item, ctx) {
    const b = ctx.mesh();
    const rope = vary(mixColor(PALETTE.sand, PALETTE.wood, 0.4), ctx.rand('c'));
    b.with({ color: rope, pattern: PATTERN.none, ink: 'coil' }, () => {
      b.lathe([[0.045, 0.03], [0.045, 0], [0.11, 0], [0.115, 0.03], [0.1, 0.055], [0.055, 0.055], [0.045, 0.03]], { segments: 6 });
      tube(b, [[0.1, 0.02, 0], [0.16, 0.012, 0.05], [0.2, 0.01, 0.02]], 0.014, { seg: 4, capEnd: true });
    });
    return { mesh: b.build() };
  },
});

/** Lobster pots: one or two slatted pots and a float. Frame: a floor slot. */
export const lobsterPot = definePart({
  prop: 'lobster-pot',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 197));
    const one = (x: number, y: number, z: number, turn: number, k: string): void => {
      b.at(compose(translation(x, y, z), rotationY(turn)), () => {
        b.with({ color: vary(PALETTE.wood, r(k), 1.4), pattern: PATTERN.planks, ink: k }, () => {
          // A half-barrel lying on its flat side.
          b.at(compose(translation(0, 0, -0.09), rotationX(Math.PI / 2)), () => b.lathe([[0.075, 0], [0.075, 0.18]], { segments: 6, start: Math.PI, sweep: Math.PI, capTop: true, capBottom: true }));
        });
        // The skid's top clear of a path's (0.012).
        b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: k }, () => b.box([-0.078, 0, -0.012], [0.078, 0.016, 0.012], { skip: ['bottom'] }));
      });
    };
    one(-0.06, 0, 0, (r('t0') - 0.5) * 0.6, 'a');
    if (r('two') < 0.6) one(0.09, 0, 0.08, 1.2 + (r('t1') - 0.5) * 0.6, 'b');
    b.with({ color: r('float') < 0.5 ? PALETTE.red : PALETTE.yellow, pattern: PATTERN.none, ink: 'float' }, () => lump(b, 0.1, 0.04, -0.1, 0.04, 0.04, 0.04, { seg: 6, rings: 4 }));
    return { mesh: b.build() };
  },
});

/** Net rack: fishing nets hung to dry over a rail between two posts. Frame: a floor slot; the rail runs along X. */
export const netRack = definePart({
  prop: 'net-rack',
  build(item, ctx) {
    const b = ctx.mesh();
    const r = rngOf(ctx.seed ^ ((item.params?.look ?? 0) * 409));
    const half = 0.3, h = 0.42;
    b.with({ color: PALETTE.trunk, pattern: PATTERN.none, ink: 'rack' }, () => {
      for (const x of [-half, half]) b.boxAt([x, 0, 0], [0.035, h, 0.035], { skip: ['bottom'] });
      b.box([-half - 0.04, h - 0.03, -0.014], [half + 0.04, h, 0.014]);
    });
    const net = vary(mixColor(PALETTE.glass, PALETTE.leafDark, 0.5), r('net'));
    b.with({ color: net, pattern: PATTERN.cloth, ink: 'net' }, () => {
      // The net falls from the rail to the ground on both sides, a little out at the foot.
      b.setSway((_x, y) => Math.min(1, Math.max(0, (h - y) / h)) * 0.35);
      for (const side of [-1, 1]) {
        const x0 = -half + 0.05, x1 = half - 0.05 - r('w', side) * 0.1;
        const foot = side * (0.1 + r('f', side) * 0.05);
        const a: Vec3 = [x0, h + 0.004, side * 0.016], c: Vec3 = [x1, h + 0.004, side * 0.016], d: Vec3 = [x1 + 0.03, 0.03, foot], e: Vec3 = [x0 - 0.02, 0.05, foot];
        if (side > 0) b.quad(e, d, c, a);
        else b.quad(a, c, d, e);
      }
      b.setSway(0);
    });
    b.with({ color: PALETTE.yellow, pattern: PATTERN.none, ink: 'net' }, () => {
      for (let i = 0; i < 3; i++) lump(b, -half + 0.12 + i * 0.17, h + 0.012, 0, 0.022, 0.022, 0.022, { seg: 5, rings: 3 });
    });
    return { mesh: b.build() };
  },
});
