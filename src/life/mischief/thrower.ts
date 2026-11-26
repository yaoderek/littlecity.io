// Who is blown off their feet, and what becomes of them (design section 13b,
// "blown about"; the owner: "they don't die, but they get blasted in every
// direction, just like the trees do ... the little dizzy stars when they
// fall down, but eventually they get back up and it's okay"). Owner:
// Mischief. No drawing here (thrown.system.ts draws), no clock of its own.
//
// A nuke's shockwave throws everyone out in the town as its ring reaches
// them (in step with the ring the director hits the buildings with); a
// bomb, those near it at the bang; lightning, anybody right beside where it
// strikes. Each is taken off the walking graph (crowd.upend: out of their
// walk and their errand, as if called away), thrown on a body (thrown.ts)
// away from the blast, faster and higher the nearer the middle, tumbling
// with arms and legs flung out; bounces, rolls onto their back, lies dizzy
// a few seconds (staggered: the town does not get up in unison), sits up
// shaking their head, stands, dusts off, looks about, picks up a straw hat
// that was knocked off, walks to the nearest walkable spot and is set down
// there (crowd.settle) to carry on. Into the sea: they swim to the shore
// and climb out. On a roof: dizzy there, then slide off the eaves. A body
// flying fast bowls over whoever it hits.
//
// Undo and a new town: everyone thrown is set back on their feet at once.

import { key, keyX, keyZ, SEA_Y } from '@/core/grid';
import { rand } from '@/core/rand';
import { lookOf } from '@/parts/people/person';
import { poseOf, type Pose } from '@/parts/people/pose';
import type { NavGraph, ShapePlan } from '@/resolve/plan';
import type { Crowd, Person, Tumble } from '../people/crowd';
import { nodeCentre, nodeHeight } from '../people/walk';
import { createGround, type Ground } from './ground';
import { NUKE_TIME, waveRadius } from './nuke-timing';
import { hold, launch, makeBody, quatToMat3, stepBody, THROWN, type Body, type BodyEvent } from './thrown';
import type { Critter } from './critters';
import type { Load } from '../people/errand';
import { hashString } from '@/core/rand';

/** The numbers of being blown about. */
export const BLOWN = {
  /**
   * A nuke: how far its ring throws people (cells), and the launch speed (units a second) at the rim and at the
   * middle before each person's own share (`share`). Each is thrown at their own angle and their own speed: an
   * explosion throwing people, each on their own arc, not a carpet lifting.
   */
  nukeReach: NUKE_TIME.waveReach,
  nukeSpeed: [3.2, 9],
  /** Nobody is thrown faster than this (the few at the very middle with a big share). */
  fastest: 12.5,
  /** Nobody leaves the ground before this (seconds after the bang): the first white frames show nothing. */
  nukeHold: 0.3,
  /** A bomb: its reach and launch speeds; lightning: its reach and speed. */
  bombReach: 3.6,
  bombSpeed: [2.2, 4.8],
  boltReach: 1.3,
  boltSpeed: 3.2,
  /** Each person's share of the blast's speed: from `share[0]` (barely lifted) to `share[1]` (sent far). */
  share: [0.4, 1.65],
  /** Each person's angle of flight above the ground (degrees): from low and skidding to steep. */
  elevation: [22, 80],
  /** How far off the line away from the blast each is thrown (radians either way). */
  scatter: 0.6,
  /** Spin (radians a second) for each unit a second of launch speed, and its limits. */
  spinPerSpeed: 1.05,
  spin: [1.5, 13],
  /** Seconds dizzy: at least, plus up to `dizzySpread` (by the person), plus up to `dizzyNear` for those thrown hardest. */
  dizzy: 2.4,
  dizzySpread: 3,
  dizzyNear: 2,
  /** Seconds getting up (sit, shake the head, stand, dust off, look about), and on the way, picking up a hat. */
  rise: 3.4,
  /** A straw hat is knocked off by a throw faster than this, for most. */
  hatAt: 3,
  /** A body flying faster than this bowls over whoever it hits (within `bowlReach`), at most `bowlMost` each. */
  bowlAt: 2.4,
  bowlReach: 0.28,
  bowlMost: 3,
} as const;

/** Where a person's middle is, above their feet (world units), and how far their outline reaches when they land. */
const PIVOT = 0.17;
const RADIUS = 0.09;
/** The figure's hips in its own units (person.ts rigOf), and how far they come down to sit on the ground. */
const PIVOT_FIG = 0.2;
const SIT_DROP = 0.098;

export interface Thrown {
  person: Person;
  body: Body;
  /** A straw hat knocked off, flying or lying on its own; null when on the head. */
  hat: Body | null;
  /** The hat's colour (it is drawn in it). */
  hatColor: string;
  /** People this one has bowled over. */
  bowled: number;
  /** The node it walks to, once up. */
  node: number;
  /** Pace on the way (for the walking drawing). */
  stride: number;
  /** What it last did that the drawing shows once (a splash, a puff of dust): taken by the drawing. */
  events: BodyEvent[];
  /** Going for the hat: walking to it, bending for it; or it is coming back to them by itself (`return`, seconds). */
  fetch: 'walk' | 'pick' | null;
  hatBack: number;
  /** When what flew off is not a hat but what they carried (`hat` is then that thing's body): its kind. */
  loose: Load | null;
}

export interface Thrower {
  readonly thrown: ReadonlyMap<Person, Thrown>;
  /** The town changed: the solid map is made again when next wanted. */
  sync(shape: ShapePlan, nav: NavGraph | null): void;
  /** A blast at (x, y, z): a nuke's ring travels out over `NUKE_TIME.waveTime`; a bomb or a bolt is at once. */
  blast(x: number, y: number, z: number, kind: 'nuke' | 'bomb' | 'bolt'): void;
  /** Throws one person with this velocity (the Hand letting go, a body hitting them). False if they cannot be. */
  fling(p: Person, vx: number, vy: number, vz: number, opts?: { dizzy?: number; spin?: number }): boolean;
  /** Somebody taken off their feet (the UFO's beam): a straw hat or what they carry drops back to the ground. */
  knockLoose(p: Person): void;
  /** People held who are not in the Hand (the UFO's beam): no Hand's shadow under them. */
  readonly beamed: Set<Person>;
  /** The Hand picks somebody up: they hang where `carry` puts them until `fling`. False if they cannot be. */
  grab(p: Person): boolean;
  carry(p: Person, x: number, y: number, z: number): void;
  /** Somebody held is set down where the town's people do not go (the UFO's sailor, back on his ship's deck): no longer thrown, and gone from the crowd. */
  letGo(p: Person): void;
  step(dt: number): void;
  /** Everyone back on their feet now, where the walking graph has room for them (undo, a new town). */
  reset(): void;
  /** Animals and the like (critters.ts): the same, for one of those. */
  flingCritter(c: Critter, vx: number, vy: number, vz: number, opts?: { dizzy?: number; spin?: number }): boolean;
  grabCritter(c: Critter): boolean;
  carryCritter(c: Critter, x: number, y: number, z: number): void;
  /** The Hand is over something it could pick up (drawn as a ring on the ground round it), or null. */
  hover: (() => { x: number; y: number; z: number; r: number } | null) | null;
  /**
   * The Hand has hold of a building (its structure id): it lifts a little and wobbles on its foundations,
   * shaking loose a few roof tiles, until `let` (then it settles back where it was). Drawn by thrown.system.
   * Nothing saved changes.
   */
  shake: { sid: number; let: boolean } | null;
  /** A boat thrown down hard into the sea goes over (set by the drawing system, which can reach the wrecks). */
  capsize: ((c: Critter, x: number, z: number, yaw: number) => void) | null;
  /** The critters thrown now, with what they did since the last frame (taken by the drawing). */
  readonly critterEvents: Map<Critter, BodyEvent[]>;
  readonly ground: Ground | null;
}

/**
 * How a blast at (x, y, z) throws something standing at (px, py, pz): velocity and spin, or null if out of its
 * reach. The speed falls with the distance; each body takes its own share of it, its own angle above the ground
 * and its own bearing about the line away from the blast (by its seed), so a crowd scatters on many arcs.
 */
export function blastVelocity(x: number, y: number, z: number, px: number, py: number, pz: number, seed: number, kind: 'nuke' | 'bomb' | 'bolt'): [number, number, number, number] | null {
  const dx = px - x, dz = pz - z, dy = (py - y) * 1.5;
  const d = Math.hypot(dx, dz, kind === 'nuke' ? 0 : dy);
  const reach = kind === 'nuke' ? BLOWN.nukeReach : kind === 'bomb' ? BLOWN.bombReach : BLOWN.boltReach;
  if (d > reach) return null;
  const k = Math.max(0, 1 - d / reach);
  const r = (what: string): number => rand(seed, 'blast', what, Math.round(x * 7 + z * 13));
  const [lo, hi] = kind === 'nuke' ? BLOWN.nukeSpeed : kind === 'bomb' ? BLOWN.bombSpeed : [BLOWN.boltSpeed, BLOWN.boltSpeed];
  const base = lo + (hi - lo) * k;
  // Their share: skewed low (most are thrown middling, a few are sent far, a few barely leave the ground).
  const u = r('share');
  const share = BLOWN.share[0] + (BLOWN.share[1] - BLOWN.share[0]) * (u < 0.5 ? 0.9 * u : 0.45 + 1.1 * (u - 0.5));
  const speed = Math.min(BLOWN.fastest, base * share);
  const elev = ((BLOWN.elevation[0] + (BLOWN.elevation[1] - BLOWN.elevation[0]) * r('elevation')) * Math.PI) / 180;
  const a = (d > 0.05 ? Math.atan2(dx, dz) : r('dir') * Math.PI * 2) + (r('veer') * 2 - 1) * BLOWN.scatter;
  const along = speed * Math.cos(elev), up = speed * Math.sin(elev);
  const spin = Math.max(BLOWN.spin[0], Math.min(BLOWN.spin[1], speed * BLOWN.spinPerSpeed * (0.7 + 0.6 * r('spin'))));
  return [Math.sin(a) * along, up, Math.cos(a) * along, spin];
}

/** How big to draw things in the air from how far off the camera is: 1 close in (zoom 6 and more), up to FLIGHT.far from the whole island. */
export const FLIGHT = { far: 2.9, air: 0.9 };
export function farScale(): number {
  const view = (globalThis as { __lc?: { view?: { getCamera?(): { zoom: number }; getEyeCamera?(): unknown } } }).__lc?.view;
  if (!view?.getCamera || view.getEyeCamera?.()) return 1;
  const z = view.getCamera().zoom;
  return 1 + (FLIGHT.far - 1) * Math.max(0, Math.min(1, (6 - z) / (6 - 1.6)));
}
/** The drawing's scale for a body this far up (0 on the ground, 1 well up): grows with height, back to 1 as it lands. */
export function flightGrow(_air: number): number {
  // A body keeps its own size in the air, at every zoom (Derek, 2026-11-21: "they just expand in size too
  // greatly, everyone uniformly becomes large… clearly does not follow physics"). It used to grow up to
  // FLIGHT.far with height from afar; do not bring that back. Stars and puffs may still use farScale.
  return 1;
}
/** 0 on the ground, 1 a good way up (FLIGHT.air), for a body flying or held. */
let airGround: Ground | null = null;
const airSurf = { h: 0, water: false, roof: false };
export function airOf(b: Body): number {
  if (b.upright || !airGround) return 0;
  airGround.surface(b.x, b.z, b.y, airSurf);
  return Math.max(0, (b.y - b.radius - airSurf.h) / FLIGHT.air);
}

/** Can a person who has got up walk to their hat (on the ground, near, about their level)? */
function hatInReach(b: Body, hat: Body, g: Ground): boolean {
  if (hat.phase !== 'lie' && hat.phase !== 'roll') return false;
  if (Math.hypot(hat.x - b.x, hat.z - b.z) > 2.5 || Math.abs(hat.y - b.y) > 0.4 || hat.y <= SEA_Y) return false;
  // Nothing in the way along the ground.
  const n = 8;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    if (g.blocked(b.x + (hat.x - b.x) * u, b.y + 0.15, b.z + (hat.z - b.z) * u)) return false;
  }
  return true;
}

export function createThrower(crowd: Crowd, critters: Map<string, Critter> = new Map()): Thrower {
  const thrown = new Map<Person, Thrown>();
  let shape: ShapePlan | null = null;
  let nav: NavGraph | null = null;
  let ground: Ground | null = null;
  const groundNow = (): Ground | null => {
    if (!ground && shape) ground = createGround(shape, nav);
    airGround = ground;
    return ground;
  };
  /** Shockwaves on their way out: where from, how long since, who they have thrown. */
  const waves: { x: number; y: number; z: number; t: number; hit: Set<Person | Critter> }[] = [];
  const critterEvents = new Map<Critter, BodyEvent[]>();
  let lookUp = 0;

  // ── critters ────────────────────────────────────────────────────────────────
  const takeCritter = (c: Critter): Body => {
    if (c.body) return c.body;
    c.home = { x: c.x, y: c.y, z: c.z, heading: c.heading };
    const b = makeBody(hashString(c.id), c.x, c.y, c.z, c.heading, c.height * 0.5, c.height * 0.4);
    b.pace = 1.4;
    c.body = b;
    critterEvents.set(c, []);
    return b;
  };
  const flingCritter = (c: Critter, vx: number, vy: number, vz: number, opts: { dizzy?: number; spin?: number } = {}): boolean => {
    const b = takeCritter(c);
    const sp = Math.hypot(vx, vy, vz);
    launch(b, vx, vy, vz, opts.spin ?? Math.min(BLOWN.spin[1], BLOWN.spin[0] + sp * 1.4));
    b.dizzy = opts.dizzy ?? 1.6 + rand(b.seed, 'dizzy', b.age) * 2;
    b.rise = 0.9;
    // Its drawing is ready this frame (never an empty matrix in between).
    poseCritter(c);
    return true;
  };
  const blastCritter = (x: number, y: number, z: number, c: Critter, kind: 'nuke' | 'bomb' | 'bolt'): void => {
    // Boats and ships have their own wrecks in a blast (boatwreck.ts, the harbour); only the Hand throws them.
    if (c.id.startsWith('boat:') || c.id.startsWith('ship:')) return;
    const v = blastVelocity(x, y, z, c.x, c.y, c.z, hashString(c.id), kind);
    // Small and light: they go a little further.
    if (v) flingCritter(c, v[0] * 1.15, v[1] * 1.1, v[2] * 1.15, { spin: v[3] * 1.2 });
  };
  const doneCritter = (c: Critter): void => {
    c.body = null;
    c.home = null;
    critterEvents.delete(c);
  };
  const cm = new Float32Array(9);
  /** The matrix a critter is drawn with now: T · R · T(0, −pivot, 0) · S. */
  const poseCritter = (c: Critter): void => {
    const b = c.body!, m = c.m;
    const px = b.x, pz = b.z, pivot = b.pivot;
    let py = b.y;
    if (!b.upright) {
      quatToMat3(b.q, cm);
      if (b.phase === 'held') {
        // Wriggling: a kick from side to side, on twos.
        const k = Math.floor(b.age * 8) % 2 ? 0.3 : -0.3;
        rotZ(cm, k);
      }
    } else {
      let roll = 0;
      if (b.phase === 'lie' || b.phase === 'roof' || b.phase === 'slide') roll = Math.PI; // on its back, legs in the air
      else if (b.phase === 'up') roll = b.t < 0.3 ? Math.PI * (1 - b.t / 0.3) : (Math.floor(b.t * 10) % 2 ? 0.12 : -0.12) * (b.t < 0.7 ? 1 : 0);
      setYaw(cm, b.heading);
      rotZ(cm, roll);
      py = b.y + pivot;
      if (b.phase === 'walk') py += Math.abs(Math.sin(b.t * 14)) * 0.03;
      if (b.phase === 'swim') py = SEA_Y - c.height * 0.25 + pivot;
    }
    // (Only small things are drawn bigger in the air: a ship is big enough.)
    const grow = b.upright || c.height > 0.6 ? 1 : flightGrow(airOf(b));
    const sc = c.scale * grow;
    const ox = -cm[3]! * pivot * grow, oy = -cm[4]! * pivot * grow, oz = -cm[5]! * pivot * grow;
    m[0] = cm[0]! * sc; m[1] = cm[1]! * sc; m[2] = cm[2]! * sc; m[3] = 0;
    m[4] = cm[3]! * sc; m[5] = cm[4]! * sc; m[6] = cm[5]! * sc; m[7] = 0;
    m[8] = cm[6]! * sc; m[9] = cm[7]! * sc; m[10] = cm[8]! * sc; m[11] = 0;
    m[12] = px + ox; m[13] = py + oy; m[14] = pz + oz; m[15] = 1;
  };
  // ── the Hand's grip: what it holds hangs below the pointer on a short arm and swings ─────────────
  /** Per held body: where the hand is (and was), how far below it hangs, and its swing (two angles and their rates). */
  const grips = new Map<Body, { hx: number; hy: number; hz: number; lx: number; lz: number; vx: number; vz: number; len: number; ax: number; az: number; wx: number; wz: number; fresh: boolean; still: boolean }>();
  /** `still`: no swing (held in a beam: it rises straight, under the grip). */
  const grip = (b: Body, x: number, y: number, z: number, len: number, still = false): void => {
    const g = grips.get(b);
    if (!g) {
      grips.set(b, { hx: x, hy: y, hz: z, lx: x, lz: z, vx: 0, vz: 0, len, ax: 0, az: 0, wx: 0, wz: 0, fresh: true, still });
      // Hanging straight down from the first grip.
      b.x = x;
      b.y = y - len;
      b.z = z;
      return;
    }
    g.hx = x;
    g.hy = y;
    g.hz = z;
    g.len = len;
    g.still = still;
  };
  const swingQ = new Float64Array(4);
  /** One step of a pendulum for every held body: swung by the hand's movement, damped, hanging under gravity. */
  const stepGrips = (dt: number): void => {
    for (const [b, g] of grips) {
      if (b.phase !== 'held') {
        grips.delete(b);
        continue;
      }
      if (dt <= 0) continue;
      if (g.still) {
        // In a beam: straight under the grip, upright, no swing (it only turns, by its heading).
        const nx = g.hx, ny = g.hy - g.len, nz = g.hz;
        b.vx = (nx - b.x) / dt;
        b.vy = (ny - b.y) / dt;
        b.vz = (nz - b.z) / dt;
        b.x = nx;
        b.y = ny;
        b.z = nz;
        b.q[0] = 0;
        b.q[1] = Math.sin(b.heading / 2);
        b.q[2] = 0;
        b.q[3] = Math.cos(b.heading / 2);
        g.ax = g.az = g.wx = g.wz = 0;
        continue;
      }
      // The hand's velocity and acceleration (from where it was last step).
      const nvx = g.fresh ? 0 : (g.hx - g.lx) / dt;
      const nvz = g.fresh ? 0 : (g.hz - g.lz) / dt;
      const accx = (nvx - g.vx) / dt, accz = (nvz - g.vz) / dt;
      g.lx = g.hx;
      g.lz = g.hz;
      g.vx = nvx;
      g.vz = nvz;
      g.fresh = false;
      // θ'' = −(g/L) sin θ − (a_hand / L) cos θ − c θ' (az swings it along x, ax along z).
      const G = THROWN.gravity, L = g.len, c = 2.2;
      g.wz += (-(G / L) * Math.sin(g.az) - (Math.max(-60, Math.min(60, accx)) / L) * Math.cos(g.az) - c * g.wz) * dt;
      g.wx += (-(G / L) * Math.sin(g.ax) - (Math.max(-60, Math.min(60, accz)) / L) * Math.cos(g.ax) - c * g.wx) * dt;
      g.az = Math.max(-1.3, Math.min(1.3, g.az + g.wz * dt));
      g.ax = Math.max(-1.3, Math.min(1.3, g.ax + g.wx * dt));
      const nx = g.hx + L * Math.sin(g.az), nz = g.hz + L * Math.sin(g.ax), ny = g.hy - L * Math.cos(g.az) * Math.cos(g.ax);
      b.vx = (nx - b.x) / dt;
      b.vy = (ny - b.y) / dt;
      b.vz = (nz - b.z) / dt;
      b.x = nx;
      b.y = ny;
      b.z = nz;
      // Its head toward the hand: the body's up along the arm, turned to the way it faced.
      const ux = g.hx - nx, uy = g.hy - ny, uz = g.hz - nz, ul = Math.hypot(ux, uy, uz) || 1;
      // The turn taking +y to u: about (y × u), by the angle between.
      const ax = uz / ul, az = -ux / ul, cosA = uy / ul;
      const al = Math.hypot(ax, az);
      const half = Math.acos(Math.max(-1, Math.min(1, cosA))) / 2;
      const sh = al > 1e-6 ? Math.sin(half) / al : 0;
      // swing (axis-angle) ⊗ yaw(heading)
      const yh = b.heading / 2, cy = Math.cos(yh), sy = Math.sin(yh);
      const qx = ax * sh, qz = az * sh, qw = Math.cos(half);
      // (x, 0, z, w) ⊗ (0, sy, 0, cy) written out:
      swingQ[0] = qx * cy - qz * sy;
      swingQ[1] = qw * sy;
      swingQ[2] = qz * cy + qx * sy;
      swingQ[3] = qw * cy;
      b.q.set(swingQ);
    }
  };

  /** A body flying fast knocks over whoever and whatever it hits (a thrown sheep into a wedding party): how many. */
  const bowl = (b: Body, self: Person | Critter, most: number): number => {
    if (Math.hypot(b.vx, b.vy, b.vz) < BLOWN.bowlAt) return 0;
    let n = 0;
    const vx = b.vx * 0.55, vy = 2.4 + Math.abs(b.vy) * 0.2, vz = b.vz * 0.55;
    for (const q of crowd.people) {
      if (n >= most) return n;
      if (q === self || thrown.has(q) || !canThrow(q)) continue;
      if (Math.abs(q.x - b.x) > BLOWN.bowlReach || Math.abs(q.z - b.z) > BLOWN.bowlReach || Math.abs(q.y + PIVOT - b.y) > 0.3) continue;
      if (fling(q, vx, vy, vz)) n++;
    }
    for (const c of critters.values()) {
      if (n >= most) return n;
      if (c === self || c.body || c.id.startsWith('boat:') || c.id.startsWith('ship:')) continue;
      if (Math.abs(c.x - b.x) > BLOWN.bowlReach || Math.abs(c.z - b.z) > BLOWN.bowlReach || Math.abs(c.y + c.height * 0.5 - b.y) > 0.3) continue;
      if (flingCritter(c, vx * 1.1, vy, vz * 1.1)) n++;
    }
    return n;
  };
  const bowled = new Map<Critter, number>();

  const stepCritters = (dt: number, g: Ground): void => {
    for (const [id, c] of critters) {
      c.quiet++;
      // Its behaviour has gone (the town changed under it): forgotten.
      if (c.quiet > 20) {
        critters.delete(id);
        critterEvents.delete(c);
        continue;
      }
      const b = c.body;
      if (!b) continue;
      // Where it says it is now (it may have moved on: a soldier's place in the column).
      const home = { x: c.x, y: c.y, z: c.z, heading: c.heading };
      const before = b.phase;
      const fall = b.vy;
      const ev = stepBody(b, dt, g);
      if (ev) critterEvents.get(c)?.push(ev);
      if (ev === 'splash') b.goal = { x: home.x, y: home.y, z: home.z };
      // A boat thrown down hard: over it goes, there (its wreck takes it from here).
      if (ev === 'splash' && c.id.startsWith('boat:') && fall < -6 && thrower.capsize) {
        thrower.capsize(c, b.x, b.z, b.heading);
        doneCritter(c);
        continue;
      }
      if (b.phase === 'walk' && before !== 'walk') {
        // Home: on foot if the way is clear, else in one great bound.
        const clear = Array.from({ length: 12 }, (_, i) => (i + 1) / 12).every((u) => !g.blocked(b.x + (home.x - b.x) * u, Math.max(b.y, home.y) + 0.08, b.z + (home.z - b.z) * u));
        if (clear && Math.hypot(home.x - b.x, home.z - b.z) < 4) b.goal = { x: home.x, y: home.y, z: home.z };
        else {
          b.from = { x: b.x, y: b.y, z: b.z };
          b.goal = { x: home.x, y: home.y, z: home.z };
          b.phase = 'climb';
          b.t = 0;
        }
      }
      if (b.phase === 'walk' && b.goal) {
        b.goal.x = home.x;
        b.goal.y = home.y;
        b.goal.z = home.z;
      }
      if (b.phase === 'fly') {
        const had = bowled.get(c) ?? 0;
        if (had < BLOWN.bowlMost) bowled.set(c, had + bowl(b, c, BLOWN.bowlMost - had));
      } else if (b.phase !== 'held') bowled.delete(c);
      if (b.phase === 'done') {
        b.heading = home.heading;
        doneCritter(c);
        continue;
      }
      poseCritter(c);
    }
  };

  const canThrow = (p: Person): boolean => p.visible && p.mode !== 'home' && p.mode !== 'visit' && p.mode !== 'gone' && !p.shutIn;

  const take = (p: Person): Thrown | null => {
    const had = thrown.get(p);
    if (had) return had;
    if (!canThrow(p) || !crowd.upend(p)) return null;
    // Half in at a doorway (or on a step the solid map counts as the cell beside): out into their own cell.
    const g = groundNow();
    if (g && p.cell >= 0 && g.blocked(p.x, p.y + 0.1, p.z)) {
      const x0 = keyX(p.cell), z0 = keyZ(p.cell);
      p.x = Math.max(x0 + 0.12, Math.min(x0 + 0.88, p.x));
      p.z = Math.max(z0 + 0.12, Math.min(z0 + 0.88, p.z));
    }
    const body = makeBody(p.seed, p.x, p.y, p.z, p.heading, PIVOT, RADIUS);
    const look = lookOf(p.look, p.child);
    const t: Thrown = { person: p, body, hat: null, hatColor: look.hatColor, bowled: 0, node: -1, stride: 0, events: [], fetch: null, hatBack: -1, loose: null };
    // Only a hat that stands off the head comes off (a straw hat); not over wedding finery or beachwear.
    if (look.hat !== 'straw' || p.costume !== null) t.hatColor = '';
    thrown.set(p, t);
    p.tumble = { pose: null, rot: quatToMat3(body.q, new Float32Array(9)), pivot: PIVOT_FIG, hatless: false, drop: 0 };
    return t;
  };

  const fling = (p: Person, vx: number, vy: number, vz: number, opts: { dizzy?: number; spin?: number } = {}): boolean => {
    const t = take(p);
    if (!t) return false;
    const b = t.body;
    const sp = Math.hypot(vx, vy, vz);
    launch(b, vx, vy, vz, opts.spin ?? Math.min(BLOWN.spin[1], BLOWN.spin[0] + sp * 1.2));
    // A small pale puff where they leave the ground (thrown off their feet, not dropped from the Hand).
    if (sp > 2 && b.y - b.radius < p.y + 0.3) t.events.push('bounce');
    b.dizzy = opts.dizzy ?? BLOWN.dizzy + rand(p.seed, 'dizzy', b.age) * BLOWN.dizzySpread + Math.min(1, sp / 9) * BLOWN.dizzyNear;
    b.rise = BLOWN.rise;
    // Not the whole town on its back in one pose: some face down, some sit up dazed.
    const k = rand(p.seed, 'rest', Math.round(b.age * 10));
    b.rest = k < 0.5 ? 'back' : k < 0.75 ? 'front' : 'sit';
    t.node = -1;
    if (sp > BLOWN.hatAt) loosen(t, vx, vy, vz, 0.8, 0.85);
    return true;
  };
  /**
   * The hat comes off (up and away a little faster than its owner, spinning on its own), or else what they carry
   * is knocked out of their hands: one thing flies, the hat first. `hatChance`, `loadChance`: how likely each.
   */
  const loosen = (t: Thrown, vx: number, vy: number, vz: number, hatChance: number, loadChance: number): void => {
    const p = t.person, b = t.body;
    if (t.hat) return;
    if (t.hatColor && rand(p.seed, 'hat', b.age) < hatChance) {
      const hat = makeBody(p.seed ^ 0x9e37, b.x, b.y + 0.2, b.z, p.heading, 0, 0.02);
      hat.upright = false;
      launch(hat, vx * 0.75 + (rand(p.seed, 'hx', b.age) - 0.5) * 1.2, vy * 0.9 + 1.2, vz * 0.75 + (rand(p.seed, 'hz', b.age) - 0.5) * 1.2, 9);
      hat.dizzy = Infinity;
      t.hat = hat;
      p.tumble!.hatless = true;
    } else if (p.load && rand(p.seed, 'load', b.age) < loadChance) {
      const thing = makeBody(p.seed ^ 0x51ed, b.x, b.y, b.z, p.heading, 0, 0.04);
      thing.upright = false;
      launch(thing, vx * 0.7 + (rand(p.seed, 'lx', b.age) - 0.5) * 1.4, vy * 0.8 + 0.8, vz * 0.7 + (rand(p.seed, 'lz', b.age) - 0.5) * 1.4, 6);
      thing.dizzy = Infinity;
      t.hat = thing;
      t.loose = p.load;
      p.load = null;
    }
  };
  /** The hat back on the head, or the load back in the hands. */
  const pickedUp = (t: Thrown): void => {
    t.hat = null;
    t.person.tumble!.hatless = false;
    if (t.loose) t.person.load = t.loose;
    t.loose = null;
  };

  const blastAt = (x: number, y: number, z: number, p: Person, kind: 'nuke' | 'bomb' | 'bolt'): void => {
    const v = blastVelocity(x, y, z, p.x, p.y, p.z, p.seed, kind);
    if (v) fling(p, v[0], v[1], v[2], { spin: v[3] });
  };

  /** The walkable spot nearest a body that has got up, in the node's cell: where they walk to. */
  const goalFor = (t: Thrown): boolean => {
    const b = t.body;
    const nv = crowd.nav;
    const g = groundNow();
    if (!nv || !g) return false;
    const inset = 0.18;
    const spotIn = (node: number): { x: number; y: number; z: number } => {
      const c = nv.nodes[node]!.cell;
      const x0 = keyX(c), z0 = keyZ(c);
      return { x: Math.max(x0 + inset, Math.min(x0 + 1 - inset, b.x)), y: nodeHeight(nv, node), z: Math.max(z0 + inset, Math.min(z0 + 1 - inset, b.z)) };
    };
    /** Can they walk straight there along the ground, through nothing? */
    const clear = (to: { x: number; y: number; z: number }): boolean => {
      const d = Math.hypot(to.x - b.x, to.z - b.z);
      const n = Math.max(1, Math.ceil(d / 0.1));
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const y = Math.max(b.y, to.y) + 0.12;
        if (g.blocked(b.x + (to.x - b.x) * u, y, b.z + (to.z - b.z) * u)) return false;
      }
      return true;
    };
    // The nearest walkable cell they can walk straight to (within a few cells); else simply the nearest.
    const cx = Math.floor(b.x), cz = Math.floor(b.z), cy = Math.round(b.y / 0.8);
    let best = -1, bestD = Infinity, bestSpot: { x: number; y: number; z: number } | null = null;
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (cx + dx < 0 || cz + dz < 0 || cx + dx > 47 || cz + dz > 47 || cy + dy < 0) continue;
          const node = nv.nodeAt.get(key(cx + dx, cy + dy, cz + dz));
          if (node === undefined || nv.nodes[node]!.rot !== undefined || nv.nodes[node]!.passage !== undefined) continue;
          const s = spotIn(node);
          const d = Math.hypot(s.x - b.x, s.z - b.z) + Math.abs(s.y - b.y) * 1.5;
          if (d >= bestD || !clear(s)) continue;
          best = node;
          bestD = d;
          bestSpot = s;
        }
      }
    }
    if (best < 0) {
      best = crowd.nearestNode(b.x, b.y, b.z);
      if (best < 0) return false;
      bestSpot = spotIn(best);
    }
    t.node = best;
    b.goal = bestSpot;
    return true;
  };

  /** A swimmer's way out: the nearest walkable spot to the water there (a beach, a quay). */
  const shoreFor = (t: Thrown): void => {
    const b = t.body;
    const node = crowd.nearestNode(b.x, 0.4, b.z);
    if (node < 0 || !crowd.nav) return;
    const c = nodeCentre(crowd.nav, node);
    b.goal = { x: c.x, y: nodeHeight(crowd.nav, node), z: c.z };
  };

  /** Back on the walking graph, on their feet. */
  const finish = (t: Thrown): void => {
    const p = t.person;
    let node = t.node;
    const nv = crowd.nav;
    if (nv && (node < 0 || node >= nv.nodes.length || keyX(nv.nodes[node]!.cell) !== Math.floor(p.x) || keyZ(nv.nodes[node]!.cell) !== Math.floor(p.z))) {
      node = crowd.nearestNode(p.x, p.y, p.z);
      if (node >= 0) {
        // Snapped into the cell (it has moved under them: a mend, an undo).
        const c = nv.nodes[node]!.cell;
        p.x = Math.max(keyX(c) + 0.05, Math.min(keyX(c) + 0.95, p.x));
        p.z = Math.max(keyZ(c) + 0.05, Math.min(keyZ(c) + 0.95, p.z));
      }
    }
    // Whatever flew off comes back with them (nothing is left lying about for good).
    if (t.hat) pickedUp(t);
    p.tumble = null;
    thrown.delete(p);
    crowd.settle(p, node);
  };

  // ── the drawing each body asks for ─────────────────────────────────────────
  const m3 = new Float32Array(9);
  /**
   * Arms and legs trailing the way the body goes (flung back along its velocity, in the body's own frame), with
   * a flutter that grows with speed: drawn afresh every frame, so nothing strobes.
   */
  const trail = (b: Body, out: Pose, kick: number): void => {
    quatToMat3(b.q, m3);
    // The velocity in the body's frame (R transposed times v); the limbs go the other way.
    const vx = b.vx, vy = b.vy, vz = b.vz;
    const lx = m3[0]! * vx + m3[1]! * vy + m3[2]! * vz;
    const ly = m3[3]! * vx + m3[4]! * vy + m3[5]! * vz;
    const lz = m3[6]! * vx + m3[7]! * vy + m3[8]! * vz;
    const sp = Math.hypot(lx, ly, lz);
    const k = Math.min(1, sp / 5);
    // A limb hanging down (−y) swings forward toward +z by its angle: point it along −v.
    const swing = sp > 0.2 ? Math.atan2(-lz, ly) : 0.4;
    const f = b.age * 13 + (b.seed % 31);
    const flutter = (0.15 + 0.3 * k) * kick;
    out.armL = swing * k + 0.6 * (1 - k) + Math.sin(f) * flutter;
    out.armR = swing * k + 0.6 * (1 - k) + Math.sin(f + 2.1) * flutter;
    out.outL = 0.45 + 0.7 * k + Math.abs(lx / (sp || 1)) * 0.5 + Math.sin(f * 0.7) * 0.15;
    out.outR = 0.45 + 0.7 * k + Math.abs(lx / (sp || 1)) * 0.5 + Math.cos(f * 0.8) * 0.15;
    const leg = Math.max(-1.3, Math.min(1.3, swing * k));
    out.legL = leg + 0.3 + Math.sin(f * 1.3) * flutter;
    out.legR = leg - 0.3 + Math.sin(f * 1.3 + 3) * flutter;
    out.lean = Math.max(-0.4, Math.min(0.4, -lz * 0.04));
    out.lift = 0;
    out.twist = 0;
  };
  const flail = (b: Body, out: Pose): void => trail(b, out, 1);
  const wriggle = (b: Body, out: Pose): void => {
    // Hanging from the Hand: the legs trail the swing and kick, the arms flap.
    trail(b, out, 1.6);
    out.legL += Math.sin(b.age * 11) * 0.35;
    out.legR -= Math.sin(b.age * 11) * 0.35;
  };
  /** The steps of getting up, by the seconds since they began. */
  const rising = (t: Thrown, u: number): { pose: Pose; drop: number } => {
    const p = t.person;
    if (u < 0.9) {
      // Sitting up, shaking the head.
      const pose = poseOf('sit', u, p.rank);
      pose.twist = u < 0.65 ? (Math.floor(u * 7) % 2 ? 0.4 : -0.4) : 0;
      pose.armL = pose.armR = 0.35;
      return { pose, drop: SIT_DROP };
    }
    if (u < 1.2) return { pose: poseOf('ready', u, p.rank), drop: 0 };
    if (u < 2.1) return { pose: poseOf('dust', u, p.rank), drop: 0 };
    if (u < 2.9) return { pose: poseOf('look', u, p.rank), drop: 0 };
    return { pose: poseOf('stand', u, p.rank), drop: 0 };
  };

  const draw = (t: Thrown): void => {
    const p = t.person, b = t.body, tm = p.tumble as Tumble;
    p.x = b.x;
    p.y = b.y;
    p.z = b.z;
    tm.drop = 0;
    tm.pose ??= poseOf('stand', 0);
    tm.grow = 1;
    if (!b.upright) {
      // Drawn bigger the higher it is off the ground, from far off (so it reads from the whole island).
      tm.grow = flightGrow(airOf(b));
      quatToMat3(b.q, (tm.rot ??= new Float32Array(9)));
      if (b.phase === 'held') wriggle(b, tm.pose);
      else if (b.splat > 0 || b.phase === 'roll') Object.assign(tm.pose, poseOf('dive', 0));
      else flail(b, tm.pose);
      return;
    }
    tm.rot = null;
    p.heading = b.heading;
    switch (b.phase) {
      case 'lie':
      case 'roof':
      case 'slide': {
        if (b.rest === 'sit' && b.phase === 'lie') {
          // Sat where they came down, legs out, swaying a little.
          const pose = poseOf('sit', b.t, p.rank);
          pose.lean = Math.floor(b.t * 3) % 2 ? 0.12 : -0.08;
          pose.armL = pose.armR = 0.25;
          Object.assign(tm.pose, pose);
          tm.drop = SIT_DROP;
          break;
        }
        const pose = poseOf('lie', b.t, p.rank);
        if (b.rest === 'front' && b.phase === 'lie') {
          // Face down: the body forward flat, the legs out behind, the arms flung up past the head.
          pose.lean = 1.52;
          pose.legL = pose.legR = -1.52;
          pose.armL = pose.armR = 2.8;
          pose.outL = pose.outR = 0.35;
          if (Math.floor(b.t * 1.5) % 3 === 1) pose.legR = -1.2; // a foot twitches
        }
        Object.assign(tm.pose, pose);
        break;
      }
      case 'swim': {
        const pose = poseOf('splash', b.t, p.rank);
        pose.armL = pose.armR = 1.9 + (Math.floor(b.t * 4) % 2) * 0.5;
        Object.assign(tm.pose, pose);
        break;
      }
      case 'climb':
        Object.assign(tm.pose, poseOf('hop', 0));
        break;
      case 'up': {
        if (t.fetch === 'pick') {
          Object.assign(tm.pose, poseOf('tend', b.t, p.rank));
          break;
        }
        const r = rising(t, b.t);
        Object.assign(tm.pose, r.pose);
        tm.drop = r.drop;
        break;
      }
      case 'walk':
      case 'done':
        Object.assign(tm.pose, poseOf('walk', t.stride));
        break;
    }
  };

  const thrower: Thrower = {
    thrown,
    get ground() {
      return groundNow();
    },
    sync(s, n) {
      shape = s;
      nav = n;
      ground = null;
    },
    blast(x, y, z, kind) {
      if (kind === 'nuke') {
        waves.push({ x, y, z, t: 0, hit: new Set() });
        return;
      }
      for (const p of crowd.people) if (canThrow(p)) blastAt(x, y, z, p, kind);
      for (const c of critters.values()) blastCritter(x, y, z, c, kind);
    },
    fling,
    grab(p) {
      const t = take(p);
      if (!t) return false;
      hold(t.body);
      return true;
    },
    letGo(p) {
      const t = thrown.get(p);
      if (t?.hat) pickedUp(t);
      if (t) grips.delete(t.body);
      thrown.delete(p);
      thrower.beamed.delete(p);
      p.tumble = null;
      p.visible = false;
      p.mode = 'gone';
    },
    carry(p, x, y, z) {
      const b = thrown.get(p)?.body;
      if (!b || b.phase !== 'held') return;
      grip(b, x, y, z, 0.3, thrower.beamed.has(p));
    },
    step(dt) {
      // The nuke's ring: everyone it has reached since the last frame.
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]!;
        w.t += dt;
        // The ring lifts them as it passes, but not into the flash: those it reaches first wait for it to clear.
        const r = w.t < BLOWN.nukeHold ? -1 : w.t >= NUKE_TIME.waveTime ? BLOWN.nukeReach : waveRadius(w.t);
        for (const p of crowd.people) {
          if (w.hit.has(p) || !canThrow(p)) continue;
          if (Math.hypot(p.x - w.x, p.z - w.z) > r) continue;
          w.hit.add(p);
          blastAt(w.x, w.y, w.z, p, 'nuke');
        }
        for (const c of critters.values()) {
          if (w.hit.has(c) || Math.hypot(c.x - w.x, c.z - w.z) > r) continue;
          w.hit.add(c);
          blastCritter(w.x, w.y, w.z, c, 'nuke');
        }
        if (w.t >= Math.max(NUKE_TIME.waveTime, BLOWN.nukeHold)) waves.splice(i, 1);
      }
      const g = groundNow();
      if (!g) return;
      stepGrips(dt);
      stepCritters(dt, g);
      // Somebody (or something) carried overhead by the Hand: those near stop, look up and point.
      lookUp += dt;
      if (lookUp >= 0.5) {
        lookUp = 0;
        const up: Body[] = [];
        for (const t of thrown.values()) if (t.body.phase === 'held') up.push(t.body);
        for (const c of critters.values()) if (c.body?.phase === 'held') up.push(c.body);
        for (const b of up) {
          for (const p of crowd.people) {
            if (!p.visible || thrown.has(p) || (p.mode !== 'walk' && p.mode !== 'linger') || p.seat >= 0) continue;
            const dx = b.x - p.x, dz = b.z - p.z;
            if (dx * dx + dz * dz > 9) continue;
            p.startled = Math.max(p.startled, 1.2);
            p.startledFace = Math.atan2(dx, dz);
            p.admire = (p.seed & 1) === 0 ? 'look' : 'wave';
          }
        }
      }
      for (const t of [...thrown.values()]) {
        const b = t.body;
        const before = b.phase;
        const ev = stepBody(b, dt, g);
        if (ev) t.events.push(ev);
        if (t.events.length > 8) t.events.splice(0, t.events.length - 8);
        if (ev === 'splash') shoreFor(t);
        if (b.phase === 'walk' && before !== 'walk') {
          if (t.fetch === 'pick') {
            // Hat back on (or the load back in the hands).
            t.fetch = null;
            pickedUp(t);
          }
          const hat = t.hat;
          if (hat && t.fetch === null && t.hatBack < 0 && hatInReach(b, hat, g)) {
            t.fetch = 'walk';
            b.goal = { x: hat.x - Math.sin(b.heading) * 0.0, y: hat.y, z: hat.z };
          } else if (!goalFor(t)) b.goal = { x: b.x, y: b.y, z: b.z };
        }
        if (ev === 'arrived' && t.fetch === 'walk') {
          // At the hat: bend for it.
          t.fetch = 'pick';
          b.phase = 'up';
          b.t = 0;
          b.rise = 0.6;
        }
        if (b.phase === 'walk') t.stride += (THROWN.walk * dt * 6) / 2;
        const hat = t.hat;
        if (hat) {
          if (t.hatBack >= 0) {
            // Out of reach (in the water, on a roof, far off): it bounces back to them by itself.
            t.hatBack += dt;
            const u = Math.min(1, t.hatBack / 0.5);
            hat.x += (b.x - hat.x) * u;
            hat.z += (b.z - hat.z) * u;
            hat.y += (b.y + 0.42 - hat.y) * u + Math.sin(u * Math.PI) * 0.04;
            if (u >= 1) {
              pickedUp(t);
              t.hatBack = -1;
            }
          } else {
            stepBody(hat, dt, g);
            if (b.phase === 'up' && t.fetch === null && b.t >= 2.4 && !hatInReach(b, hat, g)) {
              hold(hat);
              t.hatBack = 0;
            }
          }
        }
        // Flying fast: whoever it hits goes over too.
        if (b.phase === 'fly' && t.bowled < BLOWN.bowlMost) t.bowled += bowl(b, t.person, BLOWN.bowlMost - t.bowled);
        if (b.phase === 'done') finish(t);
        else draw(t);
      }
    },
    flingCritter,
    grabCritter(c) {
      hold(takeCritter(c));
      poseCritter(c);
      return true;
    },
    carryCritter(c, x, y, z) {
      const b = c.body;
      if (!b || b.phase !== 'held') return;
      grip(b, x, y, z, Math.max(0.2, c.height * 0.55));
    },
    critterEvents,
    beamed: new Set<Person>(),
    knockLoose(p) {
      const t = thrown.get(p);
      if (t) loosen(t, 0, 0.6, 0, 1, 1);
    },
    hover: null,
    shake: null,
    capsize: null,
    reset() {
      waves.length = 0;
      if (thrower.shake) thrower.shake.let = true;
      for (const c of critters.values()) if (c.body) doneCritter(c);
      for (const t of [...thrown.values()]) {
        const p = t.person;
        const node = crowd.nearestNode(p.x, p.y, p.z);
        if (node >= 0 && crowd.nav) {
          const c = nodeCentre(crowd.nav, node);
          p.x = c.x;
          p.z = c.z;
          p.y = nodeHeight(crowd.nav, node);
        }
        t.node = node;
        if (t.hat) pickedUp(t);
        t.fetch = null;
        finish(t);
      }
    },
  };
  return thrower;
}

function setYaw(m: Float32Array, yaw: number): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  m[0] = c; m[1] = 0; m[2] = -s;
  m[3] = 0; m[4] = 1; m[5] = 0;
  m[6] = s; m[7] = 0; m[8] = c;
}

/** m = m · Rz(a) (a roll about the thing's own forward axis... its own z). */
function rotZ(m: Float32Array, a: number): void {
  if (a === 0) return;
  const c = Math.cos(a), s = Math.sin(a);
  for (let r = 0; r < 3; r++) {
    const x = m[r]!, y = m[3 + r]!;
    m[r] = x * c + y * s;
    m[3 + r] = -x * s + y * c;
  }
}
