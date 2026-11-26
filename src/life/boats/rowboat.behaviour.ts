// L17: a rowboat on its mooring. It lies a little off the dock with its
// line slack, bobbing. The wind pushes it downwind; in a gust it runs out
// until the line comes taut and tugs it back, bow to the bollard. It never
// touches the dock and never strays further than its line.
//
// The boat's middle moves in the mooring's own frame: `u` along the dock,
// `v` out from it, the mooring at (0, 0). A light spring holds it at rest a
// little way out; the wind pushes; the line is a stiff spring that only
// pulls. All of it is a pose: worked out and drawn on twos.
//
// The line is drawn as rope instances stretched between two points each: on
// a dock, a length lying from the bollard to the deck's edge, then two
// lengths down to the bow (they sag when the line is slack).
//
// A rowboat anchored to a cell just floats there (the gallery).

import { boatPose } from '../mischief/boatwreck';
import { CELL_H, DIR4, keyX, keyZ, SEA_Y, type Dir4 } from '@/core/grid';
import { positionOf, transformPoint, type Mat4, type Mat4Like, type Vec3 } from '@/core/mat4';
import { rowboatBow } from '@/parts/actors/boats/rowboat.part';
import type { ActorOf, DressingPlan } from '@/resolve/plan';
import { freeWater } from '@/rules/roles/dock-shape';
import { BOATS } from '@/style/boats';
import { DOCK } from '@/style/dock';
import { defineBehaviour, type InstanceHandle, type LifeContext, type Signals, type SpawnSpec } from '../api';
import { angleDelta } from '../motion/ease';
import { fly } from '../motion/pose';
import { Twos } from '../motion/twos';
import { SHIPS } from '@/style/ships';
import { alongRoute, routeLength, waterMask, type Pt } from '@/rules/life/waterway';
import { entryRoute, notePose, townLive } from '../ships/ferry.system';
import { berthZoneAt, standAside } from '../ships/news';
import { hullRing, rockBy, swellAt, type Swell } from './afloat';
import { floatingAt, poseFloating, refloat, type Floating } from './floating';

const LINE: SpawnSpec = { actor: 'mooring-line' };
/** Where the boat lies at rest: this far out from its mooring. */
const REST = 0.44;
/** How strongly it is drawn back there (per second squared), and how hard the dock and its neighbours push it off. */
const HOME = 0.9;
const FEND = 30;

export interface RowboatState {
  floating: Floating | null;
  /** The mooring: where it is and its two directions on the water (unit vectors). */
  ax: number;
  az: number;
  alongX: number;
  alongZ: number;
  outX: number;
  outZ: number;
  /** Where the dock's face is (in v), and how far the boat may swing each way along it. */
  face: number;
  uMin: number;
  uMax: number;
  /** The fixed end of the line, and (on a dock) the bollard it comes from. */
  fast: Vec3;
  bollard: Vec3 | null;
  line: number;
  /** The boat's middle and its speed, in the mooring's frame; its heading (0 = bow out to sea). */
  u: number;
  v: number;
  du: number;
  dv: number;
  heading: number;
  /** How taut the line is: 0 slack to 1 bar tight (for the rope's sag, and for tests). */
  taut: number;
  ok: boolean;
  socket: string;
  dressing: DressingPlan | null;
  twos: Twos;
  phase: number;
  ring: number;
  swell: Swell;
  ropes: InstanceHandle[];
  m: Mat4;
  rope: Mat4;
  /** L38–L40: rowed aside out of a big ship's way: how far toward its waiting place it has gone (0 at its mooring). */
  aside: number;
  /** On a phone, past the town's phone cap: never shown. */
  spare: boolean;
  /** Not yet updated (a town just opened). */
  first: boolean;
  /** Rowing in from the edge of the map to its mooring (a dock built in a town already shown). */
  coming: { route: Pt[]; len: number; s: number } | null;
}

/** Writes the matrix that stretches the unit rope (along +X) from a to b. */
function span(a: Vec3, b: Vec3, out: Mat4): Mat4 {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  // z = x × up, y = z × x: the rope's section stays square to it.
  let zx = -uz, zz = ux;
  const zl = Math.hypot(zx, zz);
  if (zl < 1e-6) {
    zx = 0;
    zz = 1;
  } else {
    zx /= zl;
    zz /= zl;
  }
  const yx = -zz * uy, yy = zz * ux - zx * uz, yz = zx * uy;
  out[0] = dx; out[1] = dy; out[2] = dz; out[3] = 0;
  out[4] = yx; out[5] = yy; out[6] = yz; out[7] = 0;
  out[8] = zx; out[9] = 0; out[10] = zz; out[11] = 0;
  out[12] = a[0]; out[13] = a[1]; out[14] = a[2]; out[15] = 1;
  return out;
}

/** Reads the mooring off the town: its frame, what it is on, and how much room the boat has. */
function moor(state: RowboatState, ctx: LifeContext<ActorOf<'rowboat'>>): void {
  const at = ctx.item.at;
  state.ok = false;
  if (!at || !('socket' in at)) return;
  state.socket = at.socket;
  const frame: Mat4Like | null = ctx.stage.socket(at.socket);
  if (!frame) return;
  const [ax, ay, az] = positionOf(frame);
  const ol = Math.hypot(frame[8]!, frame[10]!) || 1;
  state.ax = ax;
  state.az = az;
  state.outX = frame[8]! / ol;
  state.outZ = frame[10]! / ol;
  // Along the dock: out turned a quarter to the right (so along × … is a right-handed pair on the water).
  state.alongX = state.outZ;
  state.alongZ = -state.outX;
  state.line = ctx.item.params?.line ?? BOATS.line;
  const socket = ctx.shape.sockets.find((s) => s.id === at.socket);
  const onDock = socket?.structure !== undefined && ctx.shape.structures.get(socket.structure)?.kind === 'dock';
  if (onDock) {
    // The socket floats on the water 0.2 off the deck's face; the bollard stands on the deck behind it.
    state.face = -0.2 + DOCK.over;
    const edge = -0.2 + DOCK.over, top = CELL_H + 0.012;
    state.fast = [ax + state.outX * edge, top, az + state.outZ * edge];
    state.bollard = [ax + state.outX * -0.35, CELL_H + 0.05, az + state.outZ * -0.35];
  } else {
    // A ring on a quay wall: the socket is the ring.
    state.face = -0.06;
    state.fast = [ax, Math.max(ay, SEA_Y + 0.12), az];
    state.bollard = null;
  }
  // Room to swing: the full swing where the next column along the dock is open water, little where it is not.
  state.uMin = -0.1;
  state.uMax = 0.1;
  if (socket && socket.dir !== undefined) {
    const [dx, dz] = DIR4[socket.dir as Dir4]!;
    const wx = keyX(socket.cell) + dx, wz = keyZ(socket.cell) + dz;
    const f = { terrain: ctx.shape.terrain, kinds: ctx.shape.kinds };
    // `along` in grid steps (it is a unit grid direction for a socket on a cell face).
    const sx = Math.round(state.alongX), sz = Math.round(state.alongZ);
    if (freeWater(f, wx + sx, wz + sz)) state.uMax = BOATS.swing;
    if (freeWater(f, wx - sx, wz - sz)) state.uMin = -BOATS.swing;
  }
  state.ok = true;
}

/** The nearest the boat's middle may come to the dock, for the way it is lying. */
function standoff(state: RowboatState): number {
  const half = BOATS.rowBeam / 2;
  return state.face + half + 0.07 + Math.abs(Math.cos(state.heading)) * (BOATS.rowLength / 2 - half - 0.02);
}

/** One step of the boat on its mooring. `wu`, `wv` is the wind's push in the mooring's frame. */
function drift(state: RowboatState, h: number, wu: number, wv: number): void {
  const half = BOATS.rowLength / 2 - 0.02;
  // The bow, and how far it is from the mooring.
  const hu = Math.sin(state.heading), hv = Math.cos(state.heading);
  const bu = state.u + hu * half, bv = state.v + hv * half;
  const d = Math.hypot(bu, bv);
  let fu = wu - HOME * state.u, fv = wv - HOME * (state.v - REST);
  if (d > state.line) {
    const pull = BOATS.lineSpring * (d - state.line);
    fu -= (pull * bu) / d;
    fv -= (pull * bv) / d;
  }
  const off = standoff(state);
  if (state.v < off) fv += FEND * (off - state.v);
  if (state.u > state.uMax) fu -= FEND * (state.u - state.uMax);
  if (state.u < state.uMin) fu += FEND * (state.uMin - state.u);
  state.du += (fu - BOATS.damping * state.du) * h;
  state.dv += (fv - BOATS.damping * state.dv) * h;
  state.u += state.du * h;
  state.v += state.dv * h;
  // The bow swings toward the mooring: quickly when the line is tight, lazily when it hangs.
  state.taut = Math.min(1, Math.max(0, (d - state.line * 0.72) / (state.line * 0.28)));
  const to = Math.atan2(-state.u, -(state.v - state.face));
  state.heading += angleDelta(state.heading, to) * Math.min(1, h * (0.5 + 2.6 * state.taut));
}

/** Whatever the springs did, the line does not stretch and the dock does not give. */
function hold(state: RowboatState): void {
  const half = BOATS.rowLength / 2 - 0.02;
  const hu = Math.sin(state.heading), hv = Math.cos(state.heading);
  const bu = state.u + hu * half, bv = state.v + hv * half;
  const d = Math.hypot(bu, bv);
  const most = state.line * 1.06;
  if (d > most) {
    const k = (d - most) / d;
    state.u -= bu * k;
    state.v -= bv * k;
    // It has run out of line: whatever speed it had outward is gone.
    const out = (state.du * bu + state.dv * bv) / d;
    if (out > 0) {
      state.du -= (out * bu) / d;
      state.dv -= (out * bv) / d;
    }
  }
  const off = state.face + BOATS.rowBeam / 2 + 0.03;
  if (state.v < off) {
    state.v = off;
    if (state.dv < 0) state.dv = 0;
  }
}

function pose(state: RowboatState, ctx: LifeContext<ActorOf<'rowboat'>>, signals: Signals, step: number): void {
  const now = signals.time.seconds;
  const x0 = state.ax + state.alongX * state.u + state.outX * state.v, z0 = state.az + state.alongZ * state.u + state.outZ * state.v;
  const wind = signals.wind(x0, z0);
  if (step > 0) {
    const push = BOATS.drift * wind.strength;
    // A slow wander on top, so two boats in the same wind do not lie alike.
    const wu = push * (wind.dirX * state.alongX + wind.dirZ * state.alongZ) + 0.035 * Math.sin(now * 0.37 + state.phase * 40);
    const wv = push * (wind.dirX * state.outX + wind.dirZ * state.outZ) + 0.03 * Math.cos(now * 0.29 + state.phase * 17);
    const n = Math.max(1, Math.ceil(step / 0.045));
    for (let i = 0; i < n; i++) drift(state, step / n, wu, wv);
    hold(state);
  }
  const x = state.ax + state.alongX * state.u + state.outX * state.v, z = state.az + state.alongZ * state.u + state.outZ * state.v;
  // The boat's heading in the world: `heading` is measured from "out" round toward "along".
  const hx = state.outX * Math.cos(state.heading) + state.alongX * Math.sin(state.heading);
  const hz = state.outZ * Math.cos(state.heading) + state.alongZ * Math.sin(state.heading);
  const yaw = Math.atan2(hx, hz);
  const sw = rockBy(ctx.stage, x, z, signals.time.seconds, swellAt(now, state.phase, BOATS.rowLength, wind.strength, state.swell));
  // A tight line holds the bow down a touch.
  fly(x, SEA_Y + sw.heave, z, yaw, sw.pitch - 0.035 * state.taut, sw.roll, 1, state.m);
  // Mischief: a blast may have swamped or capsized it (src/life/mischief/boatwreck.ts).
  boatPose(ctx.stage, ctx.item.id, 'rowboat', state.m, signals.time.seconds);
  ctx.instance.setMatrix(state.m);
  notePose(ctx.stage, ctx.item.id, state.m, 'rowboat');

  // ── the line ──
  const bow = transformPoint(state.m, rowboatBow());
  const fast = state.fast;
  const dist = Math.hypot(bow[0] - fast[0], bow[1] - fast[1], bow[2] - fast[2]);
  // What the rope measures: the line's reach across the water, taken down from where it is made fast.
  const rope = Math.hypot(state.line, fast[1] - bow[1]) + 0.02;
  const sag = dist < rope ? 0.42 * Math.sqrt(rope * rope - dist * dist) : 0;
  const mid: Vec3 = [(fast[0] + bow[0]) / 2, Math.max(SEA_Y + 0.015, (fast[1] + bow[1]) / 2 - sag), (fast[2] + bow[2]) / 2];
  state.ropes[0]!.setMatrix(span(fast, mid, state.rope));
  state.ropes[1]!.setMatrix(span(mid, bow, state.rope));
  if (state.bollard && state.ropes[2]) state.ropes[2].setMatrix(span(state.bollard, fast, state.rope));

  const beat = Math.floor(now / BOATS.wakeEvery + state.phase);
  if (beat !== state.ring) {
    if (!Number.isNaN(state.ring)) hullRing(ctx.stage, x, z, yaw, BOATS.rowBeam, BOATS.rowLength);
    state.ring = beat;
  }
}

/** Rows in from the edge along its route; at the end it ties up (its line comes out) and lies as moored. */
function rowIn(state: RowboatState, ctx: LifeContext<ActorOf<'rowboat'>>, signals: Signals, dt: number): void {
  const c = state.coming!;
  c.s = Math.min(c.len, c.s + 0.55 * dt);
  const p = alongRoute(c.route, c.s);
  const now = signals.time.seconds;
  const sw = swellAt(now, state.phase, BOATS.rowLength, signals.wind(p.x, p.z).strength, state.swell);
  // Keeping clear of the boats it passes on the way in.
  const a = standAside(ctx.stage, state, p.x, p.z, Math.atan2(p.dx, p.dz), dt, ctx.item.id);
  c.s = Math.max(0, c.s - 0.55 * dt * (1 - a.slow));
  fly(a.x, SEA_Y + sw.heave, a.z, Math.atan2(p.dx, p.dz), sw.pitch, sw.roll, 1, state.m);
  // Mischief: a blast may have swamped or capsized it (src/life/mischief/boatwreck.ts).
  boatPose(ctx.stage, ctx.item.id, 'rowboat', state.m, signals.time.seconds);
  ctx.instance.setMatrix(state.m);
  notePose(ctx.stage, ctx.item.id, state.m, 'rowboat');
  if (c.s >= c.len - 1e-6) {
    state.coming = null;
    state.u = 0;
    state.v = REST;
    state.heading = Math.atan2(p.dx * state.alongX + p.dz * state.alongZ, p.dx * state.outX + p.dz * state.outZ);
    for (const r of state.ropes) r.setVisible(state.ok);
    if (!state.bollard && state.ropes[2]) state.ropes[2].setVisible(false);
  }
}

/** True on a phone-sized viewport (the crowd's test). */
function isPhone(): boolean {
  return typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
}

/**
 * Whether to wait out of a big ship's way: the length of the row from its mooring to its own waiting place
 * (L17 gives it one, open water out of every berth) if a ship's zone covers any of its hull; 0 if its water
 * is clear (or it has no place: then no ship berths over it).
 */
function asideTarget(state: RowboatState, ctx: LifeContext<ActorOf<'rowboat'>>): number {
  const p = ctx.item.params;
  if (p?.asideX === undefined || p.asideZ === undefined) return 0;
  const x = state.ax + state.outX * 0.6, z = state.az + state.outZ * 0.6;
  const covered = [-0.45, 0, 0.45].some((k) => berthZoneAt(ctx.stage, x + state.outX * k, z + state.outZ * k));
  return covered ? Math.hypot(p.asideX - x, p.asideZ - z) || 1e-3 : 0;
}

/** Rows (bow first) straight to its waiting place, `target` along (or home to the mooring when it is 0), its line in. */
function rowAside(state: RowboatState, ctx: LifeContext<ActorOf<'rowboat'>>, signals: Signals, dt: number, target: number): void {
  const pace = 0.6;
  const d = target - state.aside;
  const move = Math.sign(d) * Math.min(Math.abs(d), pace * dt);
  state.aside += move;
  if (Math.abs(state.aside) < 1e-3 && target === 0) {
    state.aside = 0;
    for (const r of state.ropes) r.setVisible(state.ok);
    if (!state.bollard && state.ropes[2]) state.ropes[2].setVisible(false);
    return;
  }
  for (const r of state.ropes) r.setVisible(false);
  const p = ctx.item.params!;
  const rx = state.ax + state.outX * 0.6, rz = state.az + state.outZ * 0.6;
  const len = Math.hypot(p.asideX! - rx, p.asideZ! - rz) || 1e-3;
  const ux = (p.asideX! - rx) / len, uz = (p.asideZ! - rz) / len;
  const t = Math.min(state.aside, len);
  // Heading the way it is going (or lying that way, waiting), keeping clear of other boats.
  const dir = move < 0 ? -1 : 1;
  const yaw = Math.atan2(ux * dir, uz * dir);
  const kept = standAside(ctx.stage, state, rx + ux * t, rz + uz * t, yaw, dt, ctx.item.id);
  // Easing up for a boat in its way (it gets round, pushed aside, or waits).
  state.aside -= move * (1 - kept.slow);
  const x = kept.x, z = kept.z;
  const now = signals.time.seconds;
  const sw = swellAt(now, state.phase, BOATS.rowLength, signals.wind(x, z).strength, state.swell);
  fly(x, SEA_Y + sw.heave, z, yaw, sw.pitch, sw.roll, 1, state.m);
  // Mischief: a blast may have swamped or capsized it (src/life/mischief/boatwreck.ts).
  boatPose(ctx.stage, ctx.item.id, 'rowboat', state.m, signals.time.seconds);
  ctx.instance.setMatrix(state.m);
  notePose(ctx.stage, ctx.item.id, state.m, 'rowboat');
  // Where it is now, in the mooring's frame, for when it comes home.
  state.u = 0;
  state.v = REST;
  state.heading = Math.PI;
}

export default defineBehaviour<'rowboat', RowboatState>({
  actor: 'rowboat',
  create(item, ctx) {
    const phase = ctx.rand('swell');
    const moored = item.at !== null && 'socket' in item.at;
    const state: RowboatState = {
      floating: moored ? null : floatingAt(ctx.instance.base, phase, BOATS.rowLength, BOATS.rowBeam),
      ax: 0, az: 0, alongX: 1, alongZ: 0, outX: 0, outZ: 1,
      face: -0.2, uMin: -0.1, uMax: 0.1,
      fast: [0, 0, 0], bollard: null, line: BOATS.line,
      u: (ctx.rand('u') - 0.5) * 0.1, v: REST, du: 0, dv: 0,
      heading: Math.PI + (ctx.rand('heading') - 0.5) * 0.8,
      taut: 0, ok: false, socket: '', dressing: null,
      twos: new Twos(ctx.rand('twos')), phase, ring: NaN,
      swell: { heave: 0, roll: 0, pitch: 0 },
      ropes: [],
      m: new Array<number>(16).fill(0),
      rope: new Array<number>(16).fill(0),
      aside: 0,
      spare: isPhone() && (item.params?.rank ?? 0) >= Math.round(SHIPS.rowboatsPhone),
      coming: null,
      first: !townLive(ctx.stage),
    };
    if (moored) {
      moor(state, ctx);
      const count = state.bollard ? 3 : 2;
      for (let i = 0; i < count; i++) state.ropes.push(ctx.stage.spawn(LINE, ctx.instance.base));
      if (!state.ok) for (const r of state.ropes) r.setVisible(false);
      // A dock built in a town already shown: the boat is rowed in from the edge (its line is coiled aboard till then).
      if (state.ok && !state.spare && townLive(ctx.stage)) {
        const route = entryRoute(waterMask(ctx.shape.facts), state.ax + state.outX * REST, state.az + state.outZ * REST);
        if (route) {
          state.coming = { route, len: routeLength(route), s: 0 };
          for (const r of state.ropes) r.setVisible(false);
        }
      }
    }
    return state;
  },
  changed(state, ctx) {
    if (state.floating) refloat(state.floating, ctx.instance.base);
  },
  update(state, dt, signals, ctx) {
    if (state.floating) {
      poseFloating(state.floating, signals, ctx.instance, ctx.stage, ctx.dressing, 0, { id: ctx.item.id, type: 'rowboat' });
      return;
    }
    const fresh = ctx.dressing !== state.dressing;
    if (fresh) {
      // The town changed: the mooring may have moved, and the renderer has put the hull back at rest.
      state.dressing = ctx.dressing;
      const was = state.ok;
      moor(state, ctx);
      if (state.ok !== was) for (const r of state.ropes) r.setVisible(state.ok);
      if (!state.bollard && state.ropes[2]) state.ropes[2].setVisible(false);
    }
    if (!state.ok || state.spare) {
      if (fresh) ctx.instance.setVisible(false);
      return;
    }
    if (state.coming) {
      rowIn(state, ctx, signals, dt);
      return;
    }
    // A big ship coming in to this stretch of quay (or lying there): cast off and row aside along the dock
    // until it has gone, then back (src/life/ships/news.ts).
    const away = asideTarget(state, ctx);
    // A town opened with a ship already in: its boats are already out of its way.
    if (state.first && away !== 0) state.aside = away;
    state.first = false;
    if (away !== 0 || state.aside !== 0) {
      rowAside(state, ctx, signals, dt, away);
      return;
    }
    const step = state.twos.tick(dt);
    if (step > 0 || fresh) pose(state, ctx, signals, step);
  },
  dispose(state) {
    for (const r of state.ropes) r.release();
  },
});
