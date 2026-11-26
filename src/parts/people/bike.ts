// The bicycle (the bikes by front doors, D11; ridden by their owners,
// src/life/people/bikes.ts). One drawing in the parked bike's pen and
// palette: dark metal wheels, a red or blue frame, a brown saddle, and a
// small wicker basket over the front wheel.
//
// Bike frame: origin on the ground half-way between the wheels, +Z forward
// (toward the front wheel), +Y up, the bike in the plane x = 0. World units.
// For riding it comes in pieces (the frame, each wheel, the pedals) so the
// wheels and pedals can turn; parked it is one mesh.

import { compose, rotationX, rotationY, rotationZ, translation, type Mat4 } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { tube } from '@/parts/ground/kit';
import { PALETTE } from '@/style/palette';

/** Where the bike's parts are (bike frame, world units). */
export const BIKE_AT = {
  /** Wheel radius, the axles' height, and where the axles are along the bike. */
  wheel: 0.082,
  axle: 0.085,
  rear: -0.11,
  front: 0.11,
  /** The pedals' axle: along the bike, and its height; the crank's length. */
  crankZ: 0.01,
  crankY: 0.08,
  crank: 0.032,
  /** The top of the saddle (where the rider sits), and the handlebar's grips (± x). */
  saddleZ: -0.045,
  saddleY: 0.222,
  barZ: 0.07,
  barY: 0.262,
  grip: 0.046,
} as const;

/** The two frame colours (the parked bike's, from D11): red, or blue. */
export const BIKE_PAINT = [PALETTE.red, PALETTE.glass] as const;
const WICKER = '#b07a3e';

const { axle: cy, rear, front } = BIKE_AT;

/** The frame, fork, saddle, handlebars and basket: everything but the wheels and the pedals. */
function drawFrame(b: MeshBuilder, paint: string): void {
  const sy = BIKE_AT.saddleY, by = BIKE_AT.barY, bz = BIKE_AT.barZ;
  b.with({ color: paint, pattern: PATTERN.none, ink: 'bike' }, () => {
    // Rear axle to the seat, seat to the head, head down the fork to the front axle.
    tube(b, [[0, cy, rear], [0, cy + 0.1, -0.03], [0, cy + 0.11, 0.08], [0, cy, front]], 0.009, { seg: 3 });
    // The seat tube to the pedals and back to the rear axle.
    tube(b, [[0, cy + 0.1, -0.03], [0, BIKE_AT.crankY, BIKE_AT.crankZ], [0, cy, rear]], 0.009, { seg: 3 });
    // The seat post and the stem.
    tube(b, [[0, cy + 0.1, -0.03], [0, sy - 0.012, BIKE_AT.saddleZ + 0.005]], 0.008, { seg: 3 });
    tube(b, [[0, cy + 0.11, 0.08], [0, by, bz]], 0.008, { seg: 3 });
  });
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'bike' }, () => {
    // The handlebar across, its ends a little back toward the rider.
    tube(b, [[-BIKE_AT.grip, by + 0.004, bz - 0.022], [-0.02, by, bz], [0.02, by, bz], [BIKE_AT.grip, by + 0.004, bz - 0.022]], 0.007, { seg: 3 });
  });
  b.with({ color: PALETTE.trunk, pattern: PATTERN.none, ink: 'bike' }, () => b.box([-0.014, sy - 0.014, BIKE_AT.saddleZ - 0.032], [0.014, sy, BIKE_AT.saddleZ + 0.028]));
  // The basket: a little wicker box in front of the handlebar, over the front wheel.
  b.with({ color: WICKER, pattern: PATTERN.thatch, ink: 'bike-basket' }, () => b.box([-0.034, by - 0.06, bz + 0.035], [0.034, by + 0.002, bz + 0.09], { skip: ['top'] }));
  b.with({ color: mix(WICKER, PALETTE.ink, 0.35), pattern: PATTERN.none, ink: 'bike-basket' }, () => b.box([-0.03, by - 0.056, bz + 0.039], [0.03, by - 0.05, bz + 0.086]));
}

function mix(a: string, c: string, k: number): string {
  const p = (s: string, i: number): number => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const h = (v: number): string => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(p(a, 0) * (1 - k) + p(c, 0) * k)}${h(p(a, 1) * (1 - k) + p(c, 1) * k)}${h(p(a, 2) * (1 - k) + p(c, 2) * k)}`;
}

/** A wheel about its own axle (the x axis) at the origin: the tyre and two crossed spokes, so it is seen to turn. */
function drawWheel(b: MeshBuilder, segments: number): void {
  const r = BIKE_AT.wheel;
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'bike' }, () => {
    b.at(rotationZ(Math.PI / 2), () =>
      b.lathe([[r - 0.014, -0.006], [r, -0.006], [r, 0.006], [r - 0.014, 0.006], [r - 0.014, -0.006]], { segments }),
    );
    b.box([-0.003, -r + 0.01, -0.003], [0.003, r - 0.01, 0.003]);
    b.box([-0.003, -0.003, -r + 0.01], [0.003, 0.003, r - 0.01]);
  });
}

/** The pedals about their axle (the x axis) at the origin: a crank each side, half a turn apart, a pedal on each. */
function drawCrank(b: MeshBuilder): void {
  const c = BIKE_AT.crank;
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: 'bike' }, () => {
    b.box([0.012, -0.004, -0.004], [0.018, 0.004, c]);
    b.box([-0.018, -0.004, -c], [-0.012, 0.004, 0.004]);
    b.box([0.018, -0.004, c - 0.012], [0.04, 0.004, c + 0.012]);
    b.box([-0.04, -0.004, -c - 0.012], [-0.018, 0.004, -c + 0.012]);
  });
}

/** The whole bike, still: frame, both wheels and the pedals (the parked bike, at home or anywhere). */
export function drawBike(b: MeshBuilder, paint: string, segments = 8): void {
  drawFrame(b, paint);
  for (const z of [rear, front]) b.at(translation(0, cy, z), () => drawWheel(b, segments));
  b.at(translation(0, BIKE_AT.crankY, BIKE_AT.crankZ), () => drawCrank(b));
}

export interface RiddenBike {
  frame: MeshData;
  wheel: MeshData;
  crank: MeshData;
}

const cache = new Map<string, MeshData | RiddenBike>();

/** The ridden bike in pieces: the frame (bike frame), a wheel and the pedals (each about its own axle at the origin). */
export function riddenBike(paint: number): RiddenBike {
  const k = `ridden:${paint}`;
  let m = cache.get(k) as RiddenBike | undefined;
  if (!m) {
    const colour = BIKE_PAINT[paint % BIKE_PAINT.length]!;
    const frame = new MeshBuilder({ ink: `bike-${paint}` });
    drawFrame(frame, colour);
    const wheel = new MeshBuilder({ ink: 'bike-wheel' });
    drawWheel(wheel, 8);
    const crank = new MeshBuilder({ ink: 'bike-crank' });
    drawCrank(crank);
    m = { frame: frame.build(), wheel: wheel.build(), crank: crank.build() };
    cache.set(k, m);
  }
  return m;
}

/**
 * The bike as one still mesh (bike frame): parked, lying, or (at the quality governor's lowest level) ridden
 * with wheels that do not turn. `cheap` draws the wheels with fewer sides.
 */
export function wholeBike(paint: number, cheap = false): MeshData {
  const k = `whole:${paint}:${cheap ? 1 : 0}`;
  let m = cache.get(k) as MeshData | undefined;
  if (!m) {
    const b = new MeshBuilder({ ink: `bike-${paint}` });
    drawBike(b, BIKE_PAINT[paint % BIKE_PAINT.length]!, cheap ? 6 : 8);
    m = b.build();
    cache.set(k, m);
  }
  return m;
}

/** The bike leaning on a wall (the doorstep's bike, D11): along the wall, its top against it. Door frame: +Z out of the wall. */
export const LEAN = 0.12;
export function leaningAt(x: number, z: number): Mat4 {
  // Along the wall (its front toward +X), leaning back toward it (−Z).
  return compose(translation(x, 0, z), rotationX(-LEAN), rotationY(Math.PI / 2));
}
