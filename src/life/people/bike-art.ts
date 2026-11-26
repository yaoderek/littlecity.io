// Drawing the bikes (bikes.ts) for the people system: the bike at home is its
// prop (D11's door-bike), shown or hidden; anywhere else it is drawn here,
// under its rider (wheels and pedals turning), wheeled beside them, leaning
// by a door or against a wall, on its stand, or lying on its side. And the
// rider's pose: seated, leaning forward a little, hands on the grips, legs
// on the pedals, the whole leaning a touch into a turn. No wobble, no bell.
//
// A bike that changes place (taken from its wall, leaned at a door, laid
// down) slides and turns there over BLEND seconds: nothing pops.
//
// At the quality governor's lowest level a ridden bike is one mesh whose
// wheels do not turn (bike.ts wholeBike), and there are fewer riders
// (BIKE.capLow).

import { DIR4 } from '@/core/grid';
import type { Mat4Like } from '@/core/mat4';
import type { InstanceHandle, LifeStage } from '@/life/api';
import { BIKE_AT, LEAN, riddenBike, wholeBike } from '@/parts/people/bike';
import { aimArm, figureToBody } from '@/parts/people/hands';
import type { Rig } from '@/parts/people/person';
import { poseOf, type Pose } from '@/parts/people/pose';
import { doorBikeSpot } from '@/parts/props/bike.part';
import { BIKE } from '@/style/people';
import type { Bike, Bikes } from './bikes';
import type { Person } from './crowd';
import { nodeCentre, nodeHeight } from './walk';
import type { NavGraph } from '@/resolve/plan';
import { restingMesh, type Load } from '@/parts/people/loads';
import { inBasket } from './bikes';

/** Seconds a bike takes to slide to a new place. */
const BLEND = 0.4;
/** Wheeled: the bike this far to the walker's right, and this far ahead of them (world units). */
const BESIDE = 0.14;
const AHEAD = 0.06;
/** A load in the basket, at this share of its size set down. */
const BASKET_SCALE = 0.55;
const HIDE: Mat4Like = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -50, 0, 1];

interface BikePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  /** Drawn this much longer and bolder (not taller), so a ridden bike reads from far off; 1 close in. */
  grow?: number;
}

/**
 * How much longer to draw a bike in hand from how far off the camera is: 1 close in (zoom 6 and more), up
 * to BIKE.far from the whole-island view (as carried loads are drawn bigger). Read from the app's view
 * (window.__lc); 1 where there is none (tests, shots without the app).
 */
function farGrow(): number {
  const view = (globalThis as { __lc?: { view?: { getCamera?(): { zoom: number }; getEyeCamera?(): unknown } } }).__lc?.view;
  if (!view?.getCamera || view.getEyeCamera?.()) return 1;
  return 1 + (BIKE.far - 1) * Math.max(0, Math.min(1, (6 - view.getCamera().zoom) / (6 - 1.6)));
}

interface Drawn {
  /** The ridden bike's pieces (frame, rear wheel, front wheel, pedals), or one still mesh. */
  parts: InstanceHandle[] | null;
  whole: InstanceHandle | null;
  wholeCheap: boolean;
  /** The pose last drawn, and a blend from an earlier one. */
  last: BikePose | null;
  from: BikePose | null;
  blend: number;
  /** Where it was last seen (as it was then): to notice a change of place. */
  was: string;
  wheel: number;
  crank: number;
  roll: number;
  heading: number;
  /** The prop at home was hidden by us. */
  propHidden: boolean;
  /** What rides in the basket, drawn there. */
  load: { kind: Load; handle: InstanceHandle } | null;
}

/** The rider's state for their pose: crank angle and lean, per person (written by the art each drawing). */
const riding = new WeakMap<Person, { crank: number; roll: number; grow: number }>();

/** The world matrix of a bike pose: T(x, y, z) · Ry(yaw) · Rz(roll). */
function matrixOf(p: BikePose, out: number[]): number[] {
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cr = Math.cos(p.roll), sr = Math.sin(p.roll);
  // Ry · Rz: columns Ry·(cr, sr, 0), Ry·(−sr, cr, 0), Ry·(0, 0, 1).
  // · S(g, 1, g): longer and bolder, never taller (the rider stays on the saddle).
  const g = p.grow ?? 1;
  out[0] = cy * cr * g; out[1] = sr * g; out[2] = -sy * cr * g; out[3] = 0;
  out[4] = -cy * sr; out[5] = cr; out[6] = sy * sr; out[7] = 0;
  out[8] = sy * g; out[9] = 0; out[10] = cy * g; out[11] = 0;
  out[12] = p.x; out[13] = p.y; out[14] = p.z; out[15] = 1;
  return out;
}

/** m · T(0, y, z) · Rx(a), into out. */
function axle(m: readonly number[], y: number, z: number, a: number, out: number[]): number[] {
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 3; r++) {
    out[r] = m[r]!;
    out[4 + r] = m[4 + r]! * c + m[8 + r]! * s;
    out[8 + r] = -m[4 + r]! * s + m[8 + r]! * c;
    out[12 + r] = m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!;
  }
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
  return out;
}

const lerpAngle = (a: number, b: number, k: number): number => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * k;
};

export interface BikeArt {
  /** Draws every bike (call each drawing, before the people: it sets the riders' crank and lean). */
  draw(bikes: Bikes, nav: NavGraph | null, seconds: number, low: boolean, fresh: boolean): void;
  dispose(): void;
}

export function createBikeArt(stage: LifeStage): BikeArt {
  const drawn = new Map<string, Drawn>();
  const m: number[] = new Array(16).fill(0);
  const w: number[] = new Array(16).fill(0);
  let lastSeconds = -1;
  const release = (d: Drawn): void => {
    if (d.parts) for (const h of d.parts) h.release();
    d.parts = null;
    d.whole?.release();
    d.whole = null;
    d.load?.handle.release();
    d.load = null;
  };
  /** The bike leaning on the wall beside a door, as D11 draws it at home (door frame from its socket). */
  const byDoor = (socket: string | undefined, side: 1 | -1, steps: number): BikePose | null => {
    const f = socket !== undefined ? stage.socket(socket) : null;
    if (!f || (f[12] === 0 && f[13] === 0 && f[14] === 0)) return null;
    const at = doorBikeSpot(steps);
    const x = at.x * side;
    const yaw = Math.atan2(f[8]!, f[10]!);
    return { x: f[0]! * x + f[8]! * at.z + f[12]!, y: f[13]!, z: f[2]! * x + f[10]! * at.z + f[14]!, yaw: yaw + Math.PI / 2, roll: -LEAN };
  };
  /** Where a bike at rest is drawn. */
  const restPose = (b: Bike, nav: NavGraph | null): BikePose | null => {
    const r = b.rest;
    if (!r || !nav || b.node < 0 || b.node >= nav.nodes.length) return r && (r.kind === 'stand' || r.kind === 'lying') ? { x: r.x, y: b.y, z: r.z, yaw: r.heading, roll: 0 } : null;
    const y = nodeHeight(nav, b.node);
    if (r.kind === 'door') return byDoor(r.door.socket, r.side, r.steps) ?? { x: b.x, y, z: b.z, yaw: 0, roll: -LEAN };
    if (r.kind === 'stand') return { x: r.x, y, z: r.z, yaw: r.heading, roll: 0.05 };
    if (r.kind === 'lying') return { x: r.x, y: y + 0.05, z: r.z, yaw: r.heading, roll: -Math.PI / 2 + 0.06 };
    // Against a wall: along it, top leaning back on it.
    const c = nodeCentre(nav, b.node);
    const [dx, dz] = DIR4[r.dir]!;
    const out = Math.atan2(-dx, -dz); // the way out from the wall
    return { x: c.x + dx * 0.425 - dz * r.along, y, z: c.z + dz * 0.425 + dx * r.along, yaw: out + Math.PI / 2, roll: -LEAN };
  };
  /** Where a bike in its owner's hands is drawn: under them riding, beside them otherwise. */
  const handPose = (b: Bike, p: Person, d: Drawn, grow: number): BikePose => {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    if (b.mounted) {
      // The saddle under them however long the bike is drawn.
      const ahead = -BIKE_AT.saddleZ * grow;
      return { x: p.x + fx * ahead, y: p.y, z: p.z + fz * ahead, yaw: p.heading, roll: d.roll, grow };
    }
    // To their right ((−fz, fx) is right of the way they face), a little ahead.
    return { x: p.x - fz * BESIDE + fx * AHEAD * grow, y: p.y, z: p.z + fx * BESIDE + fz * AHEAD * grow, yaw: p.heading, roll: 0, grow };
  };

  return {
    draw(bikes, nav, seconds, low, fresh) {
      const dt = lastSeconds < 0 ? 0 : Math.max(0, Math.min(0.25, seconds - lastSeconds));
      lastSeconds = seconds;
      const live = new Set<string>();
      const grow = farGrow();
      for (const b of bikes.all) {
        live.add(b.id);
        let d = drawn.get(b.id);
        if (!d) {
          d = { parts: null, whole: null, wholeCheap: false, last: null, from: null, blend: 0, was: '', wheel: 0, crank: 0, roll: 0, heading: 0, propHidden: false, load: null };
          drawn.set(b.id, d);
        }
        const p = b.owner;
        // Where it should be drawn now, and whether its prop at home shows.
        let pose: BikePose | null = null;
        let atHome = b.at === 'home';
        let inHand = false;
        if (b.at === 'ridden' && p) {
          const piece = p.walk?.[p.at];
          // Still coming out of the door (or going in at home): it is on its wall.
          if (piece && piece.kind !== 'move' && b.prop !== null && piece.door?.feature === b.door?.feature) atHome = true;
          else if (p.visible && !p.inCloud) {
            inHand = true;
            pose = handPose(b, p, d, grow);
          }
        } else if (b.at === 'parked' || b.at === 'lying') pose = restPose(b, nav);
        const where = atHome ? 'home' : inHand ? 'hand' : pose ? `${b.at}:${b.node}:${b.rest?.kind}` : 'none';
        if (where !== d.was) {
          // A new place: slide there from where it was drawn (from its wall, if it was at home).
          const homePose = b.door ? byDoor(b.door.socket, 1, stepsOf(b)) : null;
          d.from = d.was === 'home' ? homePose : d.was === 'none' ? null : d.last;
          d.blend = d.from && d.was !== '' ? BLEND : 0;
          // Going home: it slides back onto its wall first, then the prop shows.
          if (atHome && d.was !== '' && d.was !== 'none' && d.last && homePose) {
            d.from = d.last;
            d.blend = BLEND;
          }
          d.was = where;
        }
        if (atHome && d.blend > 0 && b.door) {
          // Sliding back onto the wall.
          pose = byDoor(b.door.socket, 1, stepsOf(b));
        }
        // The prop at home: shown only when the bike is there and done sliding.
        const showProp = atHome && d.blend <= 0;
        if (b.prop) {
          const h = stage.instance(b.prop);
          if (h && (fresh || showProp === d.propHidden)) {
            h.setVisible(showProp);
            d.propHidden = !showProp;
          }
        }
        if (!pose || showProp) {
          release(d);
          d.last = null;
          continue;
        }
        // Turning wheels and pedals, and a lean into a turn, from how it moved since the last drawing.
        if (inHand && p && d.last && dt > 0) {
          const moved = Math.hypot(pose.x - d.last.x, pose.z - d.last.z);
          const fwd = (pose.x - d.last.x) * Math.sin(p.heading) + (pose.z - d.last.z) * Math.cos(p.heading) >= 0 ? 1 : -1;
          d.wheel += (fwd * moved) / BIKE_AT.wheel;
          if (b.mounted) d.crank += fwd * moved * BIKE.pedal * Math.PI * 2;
          let turn = p.heading - d.heading;
          turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
          const want = b.mounted ? Math.max(-BIKE.leanMax, Math.min(BIKE.leanMax, (-BIKE.lean * turn) / dt)) : 0;
          d.roll += (want - d.roll) * Math.min(1, dt * 4);
        }
        if (p) d.heading = p.heading;
        if (inHand && p) {
          pose.roll = b.mounted ? d.roll : 0;
          riding.set(p, { crank: d.crank, roll: b.mounted ? d.roll : 0, grow });
        }
        // The slide from where it was.
        if (d.blend > 0 && d.from) {
          const k = 1 - d.blend / BLEND;
          const e = k * k * (3 - 2 * k);
          pose = {
            x: d.from.x + (pose.x - d.from.x) * e,
            y: d.from.y + (pose.y - d.from.y) * e,
            z: d.from.z + (pose.z - d.from.z) * e,
            yaw: lerpAngle(d.from.yaw, pose.yaw, e),
            roll: d.from.roll + (pose.roll - d.from.roll) * e,
            grow: (d.from.grow ?? 1) + ((pose.grow ?? 1) - (d.from.grow ?? 1)) * e,
          };
          d.blend = Math.max(0, d.blend - dt);
        }
        d.last = pose;
        matrixOf(pose, m);
        // In hand and not on the lowest level: in pieces, wheels and pedals turning. Else one still mesh.
        if (inHand && !low) {
          if (d.whole) {
            d.whole.release();
            d.whole = null;
          }
          if (!d.parts) {
            const r = riddenBike(b.paint);
            d.parts = [stage.spawnMesh(r.frame, HIDE), stage.spawnMesh(r.wheel, HIDE), stage.spawnMesh(r.wheel, HIDE), stage.spawnMesh(r.crank, HIDE)];
          }
          d.parts[0]!.setMatrix(m);
          d.parts[1]!.setMatrix(axle(m, BIKE_AT.axle, BIKE_AT.rear, d.wheel, w));
          d.parts[2]!.setMatrix(axle(m, BIKE_AT.axle, BIKE_AT.front, d.wheel, w));
          d.parts[3]!.setMatrix(axle(m, BIKE_AT.crankY, BIKE_AT.crankZ, d.crank, w));
        } else {
          if (d.parts) {
            for (const h of d.parts) h.release();
            d.parts = null;
          }
          if (d.whole && d.wholeCheap !== low) {
            d.whole.release();
            d.whole = null;
          }
          d.whole ??= stage.spawnMesh(wholeBike(b.paint, low), HIDE);
          d.wholeCheap = low;
          d.whole.setMatrix(m);
        }
        // A loaf, a fish or two, apples or flowers ride in the basket.
        const load = inHand && p && p.load !== null && inBasket(p.load) ? p.load : null;
        if (d.load && d.load.kind !== load) {
          d.load.handle.release();
          d.load = null;
        }
        if (load) {
          d.load ??= { kind: load, handle: stage.spawnMesh(restingMesh(load), HIDE) };
          // m · T(basket) · S(BASKET_SCALE)
          const bx = 0, by = BIKE_AT.barY - 0.055, bz = BIKE_AT.barZ + 0.062, k = BASKET_SCALE;
          for (let i = 0; i < 12; i++) w[i] = m[i]! * (i % 4 === 3 ? 0 : k);
          w[3] = w[7] = w[11] = 0;
          for (let r = 0; r < 3; r++) w[12 + r] = m[r]! * bx + m[4 + r]! * by + m[8 + r]! * bz + m[12 + r]!;
          w[15] = 1;
          d.load.handle.setMatrix(w);
        }
      }
      for (const [id, d] of drawn) {
        if (live.has(id)) continue;
        release(d);
        drawn.delete(id);
      }
    },
    dispose() {
      for (const d of drawn.values()) release(d);
      drawn.clear();
    },
  };
}

function stepsOf(b: Bike): number {
  return b.rest?.kind === 'door' ? b.rest.steps : b.steps;
}

/**
 * The pose of somebody with a bike in hand (null for anybody else): seated and pedalling when riding (and
 * `roll`, the lean into a turn, to turn the whole figure by), walking or standing with a hand on the grip
 * when wheeling it. `scale` is the figure's size (world units per figure unit).
 */
export function bikePose(p: Person, bikes: Bikes, rig: Rig, walking: boolean, scale: number): { pose: Pose; roll: number } | null {
  const b = bikes.inHand(p);
  if (!b || !p.visible) return null;
  const k = 1 / scale;
  const r = riding.get(p) ?? { crank: 0, roll: 0, grow: 1 };
  const g = r.grow;
  if (b.mounted) {
    const pose: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, outL: 0.1, outR: 0.1, lean: 0.38, lift: BIKE_AT.saddleY * k - rig.hipY, twist: 0 };
    // Feet on the pedals, half a turn apart: each leg points from its hip to its pedal.
    const hipY = rig.hipY + pose.lift;
    for (const [side, a] of [[1, r.crank], [-1, r.crank + Math.PI]] as const) {
      const py = (BIKE_AT.crankY - BIKE_AT.crank * Math.cos(a)) * k;
      const pz = (BIKE_AT.crankZ - BIKE_AT.saddleZ + BIKE_AT.crank * Math.sin(a)) * g * k;
      const swing = Math.atan2(pz, hipY - py);
      if (side > 0) pose.legR = swing;
      else pose.legL = swing;
    }
    // Hands on the grips.
    for (const side of [1, -1] as const) {
      const grip = figureToBody([side * BIKE_AT.grip * g * k, BIKE_AT.barY * k, ((BIKE_AT.barZ - BIKE_AT.saddleZ) * g - 0.02) * k], pose, rig);
      aimArm(pose, rig, side, grip);
    }
    return { pose, roll: r.roll };
  }
  // Wheeling it: a walk (or standing), the hand on that side on the near grip.
  const pose = poseOf(walking ? 'walk' : 'stand', walking ? p.stride : p.poseTime, p.rank);
  const grip = figureToBody([(-BESIDE + BIKE_AT.grip * g) * k, BIKE_AT.barY * k, ((AHEAD + BIKE_AT.barZ) * g - 0.02) * k], pose, rig);
  aimArm(pose, rig, -1, grip);
  return { pose, roll: 0 };
}

/** Turns a figure's local matrices (5 or 6 of them, figure units) by a lean about the bike's line (the z axis). */
export function rollFigure(local: Float32Array, roll: number, n: number): void {
  if (roll === 0) return;
  const c = Math.cos(roll), s = Math.sin(roll);
  for (let i = 0; i < n; i++) {
    const k = i * 16;
    for (let col = 0; col < 4; col++) {
      const o = k + col * 4;
      const x = local[o]!, y = local[o + 1]!;
      local[o] = c * x - s * y;
      local[o + 1] = s * x + c * y;
    }
  }
}
