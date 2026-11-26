// The UFO (design section 13b; Derek: "a UFO flies in and then sucks up a
// random person with a ray beam, and the person flies around and says
// 'help!' as he gets abducted. If there's no people to abduct it should just
// fly in and then fly away"). Owner: Mischief.
//
// Called by a click of the Mischief drawer's UFO (`ufosOf(stage).call`), as
// many at once as are called. Each, beat by beat:
//
//   in     from beyond the map's edge, high, fast, straight down over the click
//          to hover clear of everything (never under two storeys over ground or sea)
//   glide  level to straight over whoever it takes: the nearest to the click of
//          those on screen at the click (a sailor on a ship's deck too)
//   beam   held still where they stand at once; the beam comes straight down (0.5 s)
//   lift   straight up the beam into the hatch, turning, "HELP!"; a straw hat or
//          what they carried drops
//   away   it tilts and shoots off over the edge; gone 20–40 s
//   back   in again over somewhere else in the town (a sailor: his place on deck,
//          if his ship is still about), beams them down and leaves
//   seek   (nobody on screen) it sweeps its beam about the click, and leaves.
//
// A nuke going off under a hovering saucer drops its catch and sends it off
// spinning. Undo, a called-off act, a new or opened town: gone at once, the
// person on their feet (the thrower's reset). Nothing saved changes. Every
// handle goes through the owned stage.

import { CELL_H, keyX, keyY, keyZ, SEA_Y } from '@/core/grid';
import { rand } from '@/core/rand';
import { defineSystem, type InstanceHandle, type LifeStage } from '../api';
import type { ShapePlan } from '@/resolve/plan';
import { crowdOf } from '../doors/table';
import type { Crowd, Person } from '../people/crowd';
import { nodeCentre, nodeHeight } from '../people/walk';
import { mischiefOf, type Director } from './director';
import { ownStage, type Owned } from './owned';
import { throwerOf } from './thrown.system';
import type { Thrower } from './thrower';
import { harbourOf, type Ship } from '../ships/visit';
import type { DeckHand } from '../ships/crew';
import { rigOf } from '@/parts/actors/ships/rig';
import { mapEdge } from '@/rules/life/ship-routes';
import { alienMesh, coneMesh, domeMesh, helpMesh, lightsMesh, poolMesh, SAUCER, saucerMesh, ufoShadowMesh } from './ufo-art';

export const UFO = {
  /** How far apart (centre to centre) two saucers' hover points must be not to be stacked one over the other, and the step between them. */
  apart: 2.4,
  stack: 0.95,
  /** How high its underside always is over the ground or sea right under it (two storeys and more: room for a beam and somebody rising in it). */
  minHover: 2.2,
  /** How fast it glides across, at its hover height, to above whoever it takes (units a second), and rises to clear what is in its way. */
  glide: 3.5,
  climb: 2.4,
  /** Seconds: flying in, the beam coming on, the lift's longest, flying off, away, beaming back down, the empty search. */
  arrive: 3,
  beamOn: 0.5,
  lift: 4,
  leave: 1.6,
  awayMin: 20,
  awayMax: 40,
  lower: 2.4,
  seek: 3.2,
  /** How far its underside hovers above the highest thing round the spot (roofs, trees, towers), and how far above the island's tallest thing it cruises. */
  clear: 0.6,
  margin: 1.2,
  /** Seconds it spins up and tilts before it zips off. */
  prep: 0.55,
  /** How far from where it took them it brings them back (cells, at least). */
  elsewhere: 6,
} as const;

/** A sailor at his place on a ship's deck it may take, with his ship. */
export interface Sailor {
  hand: DeckHand;
  ship: Ship;
}
/** Whoever it may take: somebody of the town out of doors, or a sailor on deck. */
export type Catch = Person | Sailor;
const isSailor = (c: Catch): c is Sailor => 'hand' in c;

export type UfoPhase = 'in' | 'glide' | 'beam' | 'lift' | 'seek' | 'away' | 'gone' | 'back' | 'drop' | 'leave' | 'done';

export interface Saucer {
  readonly n: number;
  phase: UfoPhase;
  t: number;
  x: number;
  y: number;
  z: number;
  /** Where it flies from and to in this phase. */
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  /** The ground under its hover point. */
  ground: number;
  /** The ground under the beam's foot while it leans (searching). */
  foot: number;
  /** Where it was called. */
  click: { x: number; z: number };
  /** Who it may take: the people out of doors, and sailors on deck, in the camera's view when it was called (all of them in tests, with no view). */
  pool: Catch[];
  /** The sailor it is going for, or has taken (then `person` is him, off the ship); null for one of the town's people. */
  sailor: Sailor | null;
  /** Bringing the sailor back to his place on his ship's deck (else to the shore). */
  toShip: boolean;
  /** Where it holds whoever is in its beam (straight under its hatch). */
  gx: number;
  gz: number;
  /** Whoever it took (in the beam, aboard, coming back down), or null. */
  person: Person | null;
  aboard: boolean;
  /** Seconds it stays away with them. */
  away: number;
  spin: number;
  /** The beam: how far on (0–1), and its lean while it searches. */
  beam: number;
  lean: number;
  leanYaw: number;
  /** The grip in the beam (where the person is held). */
  gy: number;
  /** Where it hovers (or hovered) over the spot (other saucers stack above it there). */
  hover: { x: number; y: number; z: number };
  /** Seconds it has waited to go for a saucer hovering over it; seconds it has given way to others in its flights. */
  wait: number;
  yielded: number;
  /** Its own height over the cruising height, a step each (two saucers about never fly level at one height). */
  lane: number;
  /** Its velocity on the ground plan (for its tilt), and the way it last came in (for the wobble as it stops). */
  vx: number;
  vz: number;
  ax: number;
  az: number;
  /** Handles: hull, dome, pilot, lights (two halves), beam, pool, shadow, balloon. */
  h: InstanceHandle[];
}

export interface Ufos {
  readonly saucers: readonly Saucer[];
  /**
   * A click with the UFO at (x, y, z): one comes, for the nearest person out of doors to that point among those
   * `inView` says the camera sees now (all of them, with none given). As many at once as are called. True.
   */
  call(x: number, y: number, z: number, inView?: (x: number, y: number, z: number) => boolean): boolean;
  /** Handles it has out now (0 when none is about: everything it drew has been given back). */
  readonly live: number;
}

/** What a saucer is drawn with, built ahead (one a frame, after the town is shown), so a click builds nothing. */
const MESHES = [saucerMesh, domeMesh, alienMesh, () => lightsMesh(0), () => lightsMesh(1), coneMesh, poolMesh, ufoShadowMesh, helpMesh];

const registry = new WeakMap<LifeStage, Ufos>();
export function ufosOf(stage: LifeStage): Ufos | null {
  return registry.get(stage) ?? null;
}

/** The pool of light's radius on the ground (the beam's foot, a little wider). */
const BEAM_POOL = SAUCER.r * 1.0;
const HIDE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -50, 0, 1];
const easeOut = (u: number): number => 1 - (1 - u) ** 3;
const easeInOut = (u: number): number => u * u * (3 - 2 * u);

interface State {
  d: Director;
  own: Owned;
  list: Saucer[];
  n: number;
  time: number;
  night: boolean;
  /** A click waiting for the next update (the stage's town and crowd are read there). */
  calls: { x: number; y: number; z: number; pool: Catch[] }[];
  off: () => void;
  ufos: Ufos;
  m: number[];
  /** The town, for the trees (the solid map leaves them out), and the height it cruises at over it (worked out once a town). */
  shape: ShapePlan | null;
  cruise: number;
  /** How many of its meshes are built ahead so far. */
  warm: number;
}

/** Can the UFO take this person (anybody the Hand could pick up, out of doors)? */
function takeable(p: Person, list: readonly Saucer[]): boolean {
  if (!p.visible || p.mode === 'home' || p.mode === 'visit' || p.mode === 'gone' || p.mode === 'thrown' || p.shutIn || p.inCloud || p.fade < 1) return false;
  return !list.some((s) => s.person === p);
}

/** Where a sailor stands on deck now, if he is still standing at his place there and no saucer has him. */
function sailorNow(c: Sailor, list: readonly Saucer[]): DeckHand | null {
  if (list.some((s) => s.sailor && s.sailor.hand.crew === c.hand.crew && s.sailor.hand.i === c.hand.i)) return null;
  if (c.ship.crew !== c.hand.crew || c.ship.phase === 'sinking') return null;
  return c.hand.crew.deckHands().find((d) => d.i === c.hand.i) ?? null;
}

/** Where one it may take is now, or null if it may not take them now (indoors, taken, gone). */
function catchAt(c: Catch, list: readonly Saucer[]): { x: number; y: number; z: number; heading: number } | null {
  if (isSailor(c)) return sailorNow(c, list);
  return takeable(c, list) ? c : null;
}

/** The nearest to (x, z) of those it may take (out of doors or on deck, and nobody another saucer has), or null. */
export function pickPerson(pool: readonly Catch[], list: readonly Saucer[], x: number, z: number): Catch | null {
  let best: Catch | null = null, bestD = Infinity;
  for (const c of pool) {
    const at = catchAt(c, list);
    if (!at) continue;
    const d = Math.hypot(at.x - x, at.z - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Sets whom a saucer goes for (one of the town's people, a sailor, or nobody). */
function aim(s: Saucer, c: Catch | null): void {
  s.person = c && !isSailor(c) ? c : null;
  s.sailor = c && isSailor(c) ? c : null;
}

/** The top of a ship's masts now (world y): it hovers clear above them over a deck. */
function shipTop(ship: Ship): number {
  const rig = rigOf(ship.kind, ship.look);
  let head = 1;
  for (const m of rig.masts) head = Math.max(head, m.head);
  return ship.m[5]! * (head + 0.45) + ship.m[13]!;
}

/** How tall a tree stands over its cell's floor (trunk and crown), world units. */
const TREE = 2 * CELL_H + 0.3;

/**
 * The top of the highest thing within `r` of (x, z): the ground, buildings and their roofs, towers (the solid
 * map) and trees (which the solid map flies through); and the ground right under (x, z). It hovers clear above it.
 */
export function skyTop(t: Thrower | null, shape: ShapePlan | null, x: number, z: number, r: number): { top: number; ground: number } {
  const g = t?.ground;
  if (!g) return { top: 1, ground: 0.8 };
  let top = 0;
  for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      // The nearest point of this cell to (x, z) within reach.
      const nx = Math.max(cx, Math.min(cx + 1, x)), nz = Math.max(cz, Math.min(cz + 1, z));
      if (Math.hypot(nx - x, nz - z) > r) continue;
      // Its highest point (a pitched roof peaks in the middle).
      top = Math.max(top, g.surface(cx + 0.5, cz + 0.5, 99).h, g.surface(nx, nz, 99).h);
    }
  }
  for (const [cx, cz, tt] of treesOf(shape)) {
    if (Math.abs(cx - x) > r + 1 || Math.abs(cz - z) > r + 1 || Math.hypot(cx - x, cz - z) > r + 0.7) continue;
    top = Math.max(top, tt);
  }
  const s = g.surface(x, z, 99);
  return { top, ground: s.water ? SEA_Y : s.h };
}

const treeCache = new WeakMap<ShapePlan, [number, number, number][]>();
/** The town's trees as (x, z, top), worked out once a town. */
function treesOf(shape: ShapePlan | null): [number, number, number][] {
  if (!shape) return [];
  let l = treeCache.get(shape);
  if (!l) {
    l = [];
    for (const [c, k] of shape.kinds) if (k === 'tree') l.push([keyX(c) + 0.5, keyZ(c) + 0.5, keyY(c) * CELL_H + TREE]);
    treeCache.set(shape, l);
  }
  return l;
}

/** The height its underside hovers at over (x, z): clear above everything round there, and never less than UFO.minHover over the ground or sea right under it. */
function hoverAt(t: Thrower | null, shape: ShapePlan | null, x: number, z: number): { y: number; ground: number } {
  const { top, ground } = skyTop(t, shape, x, z, SAUCER.r + 0.4);
  return { y: Math.max(top + UFO.clear, ground + UFO.minHover), ground };
}

/** The height it cruises at: clear above the tallest thing on the island (worked out once a town). */
function cruiseOf(st: State, t: Thrower | null): number {
  if (st.cruise > 0) return st.cruise;
  const { top } = skyTop(t, st.shape, 24, 24, 36);
  st.cruise = top + UFO.margin;
  return st.cruise;
}

/** A point beyond the map's edge, at cruising height `y`, on a side chosen by the saucer's number. */
function edgePoint(y: number, n: number, what: string): { x: number; y: number; z: number } {
  const side = Math.floor(rand(n, what) * 4);
  const along = 6 + rand(n, what, 'along') * 36;
  const out = -9;
  const p = side === 0 ? { x: along, z: out } : side === 1 ? { x: 48 - out, z: along } : side === 2 ? { x: along, z: 48 - out } : { x: out, z: along };
  return { x: p.x, y, z: p.z };
}

function phase(s: Saucer, p: UfoPhase): void {
  s.phase = p;
  s.t = 0;
  s.wait = 0;
}

/**
 * Flies from `from` to `to` over `dur` seconds, never through anything: coming in, level at its cruising height
 * (above the island's tallest thing) until it is over the spot, then straight down to hover; going, straight up
 * to its cruising height, then level away. `wait`: seconds held first (spinning up before it goes).
 */
function fly(s: Saucer, dur: number, arriving: boolean, wait = 0): number {
  const u = Math.max(0, Math.min(1, (s.t - wait) / dur));
  if (arriving) {
    // Level and fast, slowing over the spot (the first 70 %), then down (the rest), settling.
    const h = easeOut(Math.min(1, u / 0.7)), v = easeInOut(Math.max(0, (u - 0.7) / 0.3));
    s.x = s.from.x + (s.to.x - s.from.x) * h;
    s.z = s.from.z + (s.to.z - s.from.z) * h;
    s.y = s.from.y + (s.to.y - s.from.y) * v;
  } else {
    // Up (the first 35 %), then away level, faster and faster.
    const v = easeInOut(Math.min(1, u / 0.35)), h = Math.max(0, (u - 0.35) / 0.65) ** 2;
    s.y = s.from.y + (s.to.y - s.from.y) * v;
    s.x = s.from.x + (s.to.x - s.from.x) * h;
    s.z = s.from.z + (s.to.z - s.from.z) * h;
  }
  return u;
}

/**
 * Over its spot and about to come down: held up there (up to 6 s) while another saucer is in the column under it
 * (flying across it, or still going up or coming down), so it never comes down through one.
 */
function holdOver(st: State, s: Saucer, dt: number): void {
  const u = s.t / UFO.arrive;
  if (u > 0.71) {
    // Coming down: it settles above any saucer that has come in under it since (never down onto one).
    for (const o of st.list) {
      if (o === s || o.phase === 'gone' || o.phase === 'done' || o.y > s.y - 0.05 || Math.hypot(o.x - s.to.x, o.z - s.to.z) >= SAUCER.r * 2 + 0.3) continue;
      if (o.y + UFO.stack > s.to.y) s.to.y = o.y + UFO.stack;
    }
    s.hover = { ...s.to };
    return;
  }
  if (u < 0.69 || s.wait >= 30) return;
  // Its place again, above any saucer that has since come to hover near there (one gliding over to its catch).
  s.to.y = stacked(st, s.to.x, s.to.z, s.to.y, s);
  s.hover = { ...s.to };
  // Held while any other saucer is in the column under it down to its place.
  const busy = st.list.some((o) => o !== s && o.phase !== 'gone' && o.phase !== 'done' && o.y < s.y + 0.4 && o.y > s.to.y - (SAUCER.under + SAUCER.over + 0.2) && Math.hypot(o.x - s.x, o.z - s.z) < SAUCER.r * 2 + 0.3);
  if (!busy) return;
  s.t -= dt;
  s.wait += dt;
}

/** The lowest cruising lane no other saucer about is using. */
function freeLane(st: State, self?: Saucer): number {
  for (let k = 0; ; k++) if (!st.list.some((o) => o !== self && o.phase !== 'done' && o.lane === k)) return k;
}

/** A hover height at (x, z) no lower than `y` and clear above every other saucer hovering (or coming to hover) near there. */
function stacked(st: State, x: number, z: number, y: number, self?: Saucer): number {
  // Above the highest of those near (so it never comes down through one on its way to its place).
  let h = y;
  for (const o of st.list) {
    if (o === self || o.phase === 'gone' || o.phase === 'done' || Math.hypot(o.hover.x - x, o.hover.z - z) >= UFO.apart) continue;
    h = Math.max(h, o.hover.y + UFO.stack);
  }
  return h;
}

function create(st: State, stage: LifeStage, x: number, y: number, z: number, pool: Catch[]): boolean {
  const t = throwerOf(stage);
  const n = ++st.n;
  // To where it was called: it hovers clear of everything round there (its beam leans to whoever it takes),
  // and above any other saucer hovering near (never through one).
  const { y: hy, ground } = hoverAt(t, st.shape, x, z);
  const lane = freeLane(st);
  const cruise = cruiseOf(st, t) + lane * UFO.stack;
  const from = edgePoint(cruise, n, 'in');
  const own = st.own.stage;
  const s: Saucer = {
    n, phase: 'in', t: 0, x: from.x, y: from.y, z: from.z, from, to: { x, y: stacked(st, x, z, hy), z }, ground, foot: ground, click: { x, z }, pool, sailor: null, toShip: false, gx: x, gz: z,
    person: null, aboard: false, away: UFO.awayMin + rand(n, 'away') * (UFO.awayMax - UFO.awayMin), spin: 0, beam: 0, lean: 0, leanYaw: 0, gy: 0, wait: 0, yielded: 0, lane, hover: { x: 0, y: 0, z: 0 },
    vx: 0, vz: 0, ax: 1, az: 0,
    h: MESHES.map((mesh) => {
      const h = own.spawnMesh(mesh(), HIDE);
      h.setVisible(false);
      return h;
    }),
  };
  void y;
  s.hover = { ...s.to };
  // Who it comes for is settled at the click: the nearest it may take (nobody another saucer has).
  aim(s, pickPerson(pool, st.list, x, z));
  st.list.push(s);
  return true;
}

/** The whole of one saucer's step. */
function step(st: State, stage: LifeStage, s: Saucer, dt: number): void {
  s.t += dt;
  const x0 = s.x, y0 = s.y, z0 = s.z;
  // Spinning gently while it hovers; spinning up before it zips off.
  const going = s.phase === 'away' || s.phase === 'leave';
  s.spin += dt * (going ? 1.2 + Math.min(1, s.t / UFO.prep) * 9 : 1.2);
  const t = throwerOf(stage);
  const crowd = crowdOf(stage);
  const p = s.person;
  switch (s.phase) {
    case 'in': {
      holdOver(st, s, dt);
      if (fly(s, UFO.arrive, true) < 1) break;
      // Over where it was called, it looks: the nearest person it may take (whoever the camera saw at the click);
      // over to them, or with nobody, it searches the spot and goes.
      {
        const others = st.list.filter((o) => o !== s);
        const c: Catch | null = s.sailor ?? p;
        if (!c || !catchAt(c, others)) aim(s, pickPerson(s.pool, others, s.click.x, s.click.z));
      }
      phase(s, s.person || s.sailor ? 'glide' : 'seek');
      break;
    }
    case 'glide': {
      // Across at its hover height to straight over them (following them as they walk): up first wherever
      // something in its way, or another saucer, needs it higher; never down through anything.
      const others = st.list.filter((o) => o !== s);
      const c: Catch | null = s.sailor ?? p;
      const at = c ? catchAt(c, others) : null;
      if (!c || !at) {
        aim(s, pickPerson(s.pool, others, s.x, s.z));
        if (!s.person && !s.sailor) phase(s, 'seek');
        break;
      }
      const dx = at.x - s.x, dz = at.z - s.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, UFO.glide * dt);
      const nx = s.x + (d > 0 ? (dx / d) * step : 0), nz = s.z + (d > 0 ? (dz / d) * step : 0);
      // Above any saucer already hovering over a catch close by (two people side by side: one saucer over the
      // other); others on the move it gives way to, below.
      let need = hoverAt(t, st.shape, nx, nz).y;
      // Over a ship: clear above its masts.
      if (s.sailor) need = Math.max(need, shipTop(s.sailor.ship) + UFO.clear);
      for (const o of st.list) {
        // (Of two gliding, the later one goes over the earlier.)
        if (o === s || (o.phase !== 'beam' && o.phase !== 'lift' && o.phase !== 'seek' && o.phase !== 'drop' && !(o.phase === 'glide' && o.n < s.n))) continue;
        if (Math.hypot(o.x - nx, o.z - nz) < SAUCER.r * 2 + 0.3) need = Math.max(need, o.y + UFO.stack);
      }
      if (need > s.y + 0.01) {
        s.y = Math.min(need, s.y + UFO.climb * dt);
        break;
      }
      // Never under one coming down to hover at its own height there: it waits for that one to settle first.
      if (st.list.some((o) => o !== s && (o.phase === 'in' || o.phase === 'back') && o.t / UFO.arrive > 0.715 && Math.hypot(o.to.x - nx, o.to.z - nz) < SAUCER.r * 2 + 0.3 && Math.abs(o.to.y - s.y) < SAUCER.under + SAUCER.over + 0.3)) break;
      s.x = nx;
      s.z = nz;
      s.to = { x: nx, y: s.y, z: nz };
      s.hover = { x: nx, y: s.y, z: nz };
      s.ground = hoverAt(t, st.shape, nx, nz).ground;
      if (d > 0.04) break;
      // A sailor: off his ship's deck (it sails on short a hand), one of the town's people's ways from now.
      let q = p;
      if (s.sailor) {
        const hand = s.sailor.hand;
        q = crowd && t && hand.crew.take(hand.i) ? crowd.stray(at.x, at.y, at.z, at.heading, hand.look) : null;
        if (!q) {
          aim(s, null);
          phase(s, 'seek');
          break;
        }
        s.person = q;
      }
      // Over them: they are held where they stand at once (no more walking), and the beam comes down.
      if (!q || !t || !t.grab(q)) {
        if (q && s.sailor) giveBack(s, t);
        aim(s, null);
        phase(s, 'seek');
        break;
      }
      t.beamed.add(q);
      s.gx = q.x;
      s.gz = q.z;
      s.gy = q.y + 0.3;
      t.carry(q, s.gx, s.gy, s.gz);
      s.x = s.gx;
      s.z = s.gz;
      phase(s, 'beam');
      break;
    }
    case 'beam': {
      s.beam = Math.min(1, s.t / UFO.beamOn);
      s.lean = 0;
      if (!p || !t || !t.thrown.has(p)) {
        s.person = null;
        phase(s, 'seek');
        break;
      }
      // Held still where they stood while the beam comes down on them.
      t.carry(p, s.gx, s.gy, s.gz);
      if (s.t < UFO.beamOn) break;
      // Off their feet: what they carry (or a straw hat) drops back to the ground.
      t.knockLoose(p);
      phase(s, 'lift');
      break;
    }
    case 'lift': {
      if (!p || !t || !t.thrown.has(p)) {
        s.person = null;
        phase(s, 'leave');
        break;
      }
      // Slowly at first, then faster, up toward the hatch; turning as they go.
      s.gy += (0.25 + s.t * 0.8) * dt;
      const hatch = s.y - 0.02;
      const b = t.thrown.get(p)!.body;
      // Straight up the beam, turning gently, into the hatch right above.
      b.heading += dt * 1.2;
      t.carry(p, s.gx, Math.min(s.gy, hatch + 0.3), s.gz);
      if (s.gy >= hatch + 0.3 || s.t > UFO.lift + 4) {
        // In through the hatch: out of sight inside it.
        s.lean = 0;
        s.aboard = true;
        p.visible = false;
        phase(s, 'away');
        s.from = { x: s.x, y: s.y, z: s.z };
        s.to = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'out');
      }
      break;
    }
    case 'seek': {
      // The beam sweeps round the empty street, as if looking.
      s.beam = Math.min(1, s.t / UFO.beamOn) * (s.t > UFO.seek - 0.4 ? Math.max(0, (UFO.seek - s.t) / 0.4) : 1);
      s.lean = 0.32 * Math.min(1, s.t / 0.8);
      s.leanYaw = s.t * 2.2;
      {
        const reach = Math.tan(s.lean) * Math.max(0.2, s.y - s.ground);
        s.foot = skyTop(t, st.shape, s.x + Math.sin(s.leanYaw) * reach, s.z + Math.cos(s.leanYaw) * reach, 0).ground;
      }
      if (s.t < UFO.seek) break;
      s.lean = 0;
      s.beam = 0;
      s.from = { x: s.x, y: s.y, z: s.z };
      s.to = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'out');
      phase(s, 'leave');
      break;
    }
    case 'away':
    case 'leave': {
      s.beam = Math.max(0, s.beam - dt * 3);
      // A moment to spin up and tilt, then off, straight up: while another saucer is still in the column over it
      // (up to its cruising height), it slides out from under, level, towards where it is going, then goes up.
      if (s.t > UFO.prep && s.wait < 20) {
        let bx = 0, bz = 0, blocked = false;
        for (const o of st.list) {
          if (o === s || o.phase === 'gone' || o.phase === 'done' || ((o.phase === 'in' || o.phase === 'back') && o.t / UFO.arrive <= 0.715)) continue;
          if (o.y < s.y - 0.05 || o.y > s.to.y + SAUCER.under + SAUCER.over + 0.15) continue;
          const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz);
          if (od >= SAUCER.r * 2 + 0.3) continue;
          blocked = true;
          bx += od > 0.01 ? ox / od : 0;
          bz += od > 0.01 ? oz / od : 0;
        }
        if (blocked) {
          const tx = s.to.x - s.x, tz = s.to.z - s.z, td = Math.hypot(tx, tz) || 1;
          bx += (0.5 * tx) / td;
          bz += (0.5 * tz) / td;
          const bd = Math.hypot(bx, bz) || 1;
          const nx = s.x + (bx / bd) * UFO.glide * dt, nz = s.z + (bz / bd) * UFO.glide * dt;
          if (!st.list.some((o) => o !== s && o.phase !== 'gone' && o.phase !== 'done' && Math.hypot(o.x - nx, o.z - nz) < SAUCER.r * 2 + 0.25 && Math.abs(o.y - s.y) < SAUCER.under + SAUCER.over + 0.15)) s.from = { x: nx, y: s.y, z: nz };
          s.t = UFO.prep;
          s.wait += dt;
        }
      }
      const u = fly(s, UFO.leave, false, UFO.prep);
      if (p && s.aboard && t) t.carry(p, s.x, s.y + 0.1, s.z);
      if (u < 1) break;
      if (s.phase === 'leave' || !p) {
        phase(s, 'done');
        break;
      }
      phase(s, 'gone');
      break;
    }
    case 'gone': {
      if (p && t) t.carry(p, s.x, s.y + 0.1, s.z);
      if (s.t < s.away) break;
      // A sailor whose ship is still about (moored, or under way and not yet off the map): back to his place on its deck.
      const deck = s.sailor ? deckOf(s.sailor) : null;
      if (deck && p) {
        s.toShip = true;
        s.lane = freeLane(st, s);
        s.wait = 0;
        s.from = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'back');
        s.x = s.from.x;
        s.y = s.from.y;
        s.z = s.from.z;
        s.to = { x: deck[0], y: stacked(st, deck[0], deck[2], Math.max(hoverAt(t, st.shape, deck[0], deck[2]).y, shipTop(s.sailor!.ship) + UFO.clear)), z: deck[2] };
        s.hover = { ...s.to };
        s.ground = deck[1];
        phase(s, 'back');
        break;
      }
      // Somewhere else in the town: a walkable spot away from where it took them (a sailor whose ship has gone: ashore).
      const spot = crowd ? dropSpot(crowd, s) : null;
      if (!spot || !p) {
        if (p && t) {
          p.visible = true;
          t.beamed.delete(p);
          t.fling(p, 0, 0, 0, { dizzy: 2 });
        }
        s.person = null;
        phase(s, 'done');
        break;
      }
      const { y: hy } = hoverAt(t, st.shape, spot.x, spot.z);
      s.lane = freeLane(st, s);
      s.wait = 0;
      s.from = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'back');
      s.x = s.from.x;
      s.y = s.from.y;
      s.z = s.from.z;
      s.to = { x: spot.x, y: stacked(st, spot.x, spot.z, hy), z: spot.z };
      s.hover = { ...s.to };
      s.ground = spot.y;
      s.toShip = false;
      phase(s, 'back');
      break;
    }
    case 'back': {
      // Over a ship under way: it keeps over his place as the ship moves (or, the ship gone after all, to the shore).
      if (s.toShip) followDeck(st, s, t, crowd);
      holdOver(st, s, dt);
      const u = fly(s, UFO.arrive, true);
      if (p && t) t.carry(p, s.x, s.y + 0.1, s.z);
      if (u < 1) break;
      phase(s, 'drop');
      break;
    }
    case 'drop': {
      s.beam = Math.min(1, s.t / UFO.beamOn);
      if (!p || !t || !t.thrown.has(p)) {
        s.person = null;
        phase(s, 'leave');
        break;
      }
      const b = t.thrown.get(p)!.body;
      if (s.toShip) {
        followDeck(st, s, t, crowd);
        if (s.toShip) {
          s.x = s.to.x;
          s.z = s.to.z;
        }
      }
      if (s.t < UFO.beamOn) {
        t.carry(p, s.x, s.y + 0.1, s.z);
        break;
      }
      // Out of the hatch, down the beam, turning; let go a little above the ground.
      if (s.aboard) {
        s.aboard = false;
        p.visible = true;
      }
      s.lean = 0;
      const u = Math.min(1, (s.t - UFO.beamOn) / UFO.lower);
      b.heading += dt * 1.2;
      // Onto his ship's deck, on his feet, at his place; else let go a little above the ground.
      const floor = s.toShip ? s.ground + 0.3 : s.ground + 0.75;
      t.carry(p, s.x, s.y - 0.02 + (floor - s.y) * easeInOut(u), s.z);
      if (u < 1) break;
      if (s.toShip) {
        giveBack(s, t);
        s.from = { x: s.x, y: s.y, z: s.z };
        s.to = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'gone');
        phase(s, 'leave');
        break;
      }
      t.fling(p, 0, -0.4, 0, { dizzy: 3.5, spin: 1.5 });
      t.beamed.delete(p);
      s.person = null;
      s.from = { x: s.x, y: s.y, z: s.z };
      s.to = edgePoint(cruiseOf(st, t) + s.lane * UFO.stack, s.n, 'gone');
      phase(s, 'leave');
      break;
    }
    case 'done':
      break;
  }
  // Flying, it gives way: if this step would take it into another saucer, it holds
  // where it was this step and goes on when the way is clear (each in turn: never more than 40 s in all).
  if ((s.phase === 'in' || s.phase === 'glide' || s.phase === 'back' || s.phase === 'away' || s.phase === 'leave') && s.yielded < 90) {
    const moved = s.x !== x0 || s.y !== y0 || s.z !== z0;
    const clash = moved && st.list.some((o) => o !== s && o.phase !== 'gone' && o.phase !== 'done' && Math.hypot(o.x - s.x, o.z - s.z) < SAUCER.r * 2 + 0.25 && Math.abs(o.y - s.y) < SAUCER.under + SAUCER.over + 0.15);
    if (clash) {
      s.x = x0;
      s.y = y0;
      s.z = z0;
      s.t = Math.max(0, s.t - dt);
      s.yielded += dt;
    }
  }
  if (dt > 0) {
    s.vx = (s.x - x0) / dt;
    s.vz = (s.z - z0) / dt;
    if (s.phase === 'in' || s.phase === 'back') {
      const l = Math.hypot(s.vx, s.vz);
      if (l > 0.5) {
        s.ax = s.vx / l;
        s.az = s.vz / l;
      }
    }
  }
}

/** Where a taken sailor's place on his ship's deck is now, if the ship is still about (not gone, sinking or off the map). */
function deckOf(c: Sailor): [number, number, number] | null {
  const ship = c.ship;
  if (ship.crew !== c.hand.crew || ship.phase === 'sinking' || ship.phase === 'idle') return null;
  const at = c.hand.crew.placeOf(c.hand.i);
  if (!at || mapEdge(at[0], at[2]) > -2) return null;
  return [at[0], at[1], at[2]];
}

/** Bringing a sailor back: over his place on deck as the ship moves; if the ship has gone after all, to the shore. */
function followDeck(st: State, s: Saucer, t: Thrower | null, crowd: Crowd | null): void {
  const deck = s.sailor ? deckOf(s.sailor) : null;
  if (deck) {
    const dx = deck[0] - s.to.x, dz = deck[2] - s.to.z;
    s.to.x = deck[0];
    s.to.z = deck[2];
    s.hover.x = deck[0];
    s.hover.z = deck[2];
    s.ground = deck[1];
    // Late in the flight in, it is over the spot already: it moves with it.
    if (s.phase === 'back' && s.t / UFO.arrive > 0.7) {
      s.from.x += dx;
      s.from.z += dz;
    }
    return;
  }
  s.toShip = false;
  const spot = crowd ? dropSpot(crowd, s) : null;
  if (!spot) return;
  s.from = { x: s.x, y: Math.max(s.y, cruiseOf(st, t) + s.lane * UFO.stack), z: s.z };
  s.to = { x: spot.x, y: stacked(st, spot.x, spot.z, hoverAt(t, st.shape, spot.x, spot.z).y, s), z: spot.z };
  s.hover = { ...s.to };
  s.ground = spot.y;
  s.t = 0;
  phase(s, 'back');
}

/** A sailor back on his ship's deck: gone from the town's people, at his place among the crew again. */
function giveBack(s: Saucer, t: Thrower | null): void {
  const p = s.person, c = s.sailor;
  if (p && t) t.letGo(p);
  else if (p) {
    p.mode = 'gone';
    p.visible = false;
  }
  if (c) c.hand.crew.giveBack(c.hand.i);
  s.person = null;
  s.sailor = null;
  s.toShip = false;
}

/** Where it brings them back: a walkable spot (a street, a square, the beach) away from where it took them. */
function dropSpot(crowd: Crowd, s: Saucer): { x: number; y: number; z: number } | null {
  const nav = crowd.nav;
  if (!nav || nav.nodes.length === 0) return null;
  const took = s.from;
  for (let k = 0; k < 40; k++) {
    const i = Math.floor(rand(s.n, 'drop', k) * nav.nodes.length);
    const node = nav.nodes[i]!;
    if (node.rot !== undefined || node.passage !== undefined) continue;
    const c = nodeCentre(nav, i);
    if (k < 30 && Math.hypot(c.x - took.x, c.z - took.z) < UFO.elsewhere) continue;
    return { x: c.x, y: nodeHeight(nav, i), z: c.z };
  }
  return null;
}

const tilted = new Array<number>(16).fill(0);
const sub = new Array<number>(16).fill(0);
/** out = a · b (column-major 4×4). */
function mul(a: number[], b: number[], out: number[]): number[] {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = v;
    }
  }
  return out;
}
/** A turn by `ang` about the level axis (ax, 0, az), after a turn about y by `yaw`, at (x, y, z): into `m`. */
function placeTilted(m: number[], x: number, y: number, z: number, ax: number, az: number, ang: number, yaw: number): void {
  const c = Math.cos(ang), sn = Math.sin(ang), cs = Math.cos(yaw), ss = Math.sin(yaw);
  const r00 = c + ax * ax * (1 - c), r01 = az * sn, r02 = ax * az * (1 - c);
  const r10 = -az * sn, r11 = c, r12 = ax * sn;
  const r20 = ax * az * (1 - c), r21 = -ax * sn, r22 = c + az * az * (1 - c);
  // Tilt · Ry(yaw): the y-turn's columns (cs, 0, −ss) and (ss, 0, cs) taken through the tilt.
  m[0] = r00 * cs - r20 * ss; m[1] = r01 * cs - r21 * ss; m[2] = r02 * cs - r22 * ss; m[3] = 0;
  m[4] = r10; m[5] = r11; m[6] = r12; m[7] = 0;
  m[8] = r00 * ss + r20 * cs; m[9] = r01 * ss + r21 * cs; m[10] = r02 * ss + r22 * cs; m[11] = 0;
  m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
}

/** Where things are drawn now. */
function draw(st: State, s: Saucer): void {
  const [hull, dome, alien, la, lb, cone, pool, shadow, help] = s.h as [InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle, InstanceHandle];
  const m = st.m;
  const shown = s.phase !== 'gone' && s.phase !== 'done';
  hull.setVisible(shown);
  dome.setVisible(shown);
  alien.setVisible(shown);
  // Its tilt: into its flight (banking with its speed); a wobble as it stops; a lean before it zips off.
  const sp = Math.hypot(s.vx, s.vz);
  let ax = 1, az = 0, ang = 0;
  if (sp > 0.3) {
    ax = s.vz / sp;
    az = -s.vx / sp;
    ang = Math.min(0.42, sp * 0.035);
  }
  if ((s.phase === 'beam' || s.phase === 'seek' || s.phase === 'drop') && s.t < 1.4) {
    ax = s.az;
    az = -s.ax;
    ang = 0.2 * Math.exp(-3 * s.t) * Math.sin(s.t * 13);
  }
  const going = s.phase === 'away' || s.phase === 'leave';
  if (going && s.t < UFO.prep) {
    const ox = s.to.x - s.from.x, oz = s.to.z - s.from.z, ol = Math.hypot(ox, oz) || 1;
    ax = oz / ol;
    az = -ox / ol;
    ang = -0.3 * (s.t / UFO.prep);
  }
  // A gentle bob while it hovers.
  const bob = sp < 0.3 ? Math.sin(st.time * 2.4 + s.n) * 0.05 : 0;
  const y = s.y + bob;
  placeTilted(m, s.x, y, s.z, ax, az, ang, s.spin);
  if (shown) {
    hull.setMatrix(m);
    dome.setMatrix(m);
    // The glass: a light tint, so the pilot shows through it.
    dome.setParams(0.3);
    // The pilot: sat in the dome, turning to look about; leaning over the dome's edge to peer down while it searches.
    const peer = s.phase === 'seek' ? Math.min(1, s.t / 0.6) * (s.t > UFO.seek - 0.5 ? Math.max(0, (UFO.seek - s.t) / 0.5) : 1) : 0;
    const look = s.phase === 'seek' ? s.leanYaw - s.spin : Math.sin(st.time * 0.9 + s.n) * 0.9;
    const cl = Math.cos(look), sl = Math.sin(look), lean = 0.55 * peer, cle = Math.cos(lean), sle = Math.sin(lean);
    const out = 0.12 * peer, h0 = SAUCER.under + SAUCER.over + 0.01;
    // T(out along its look, seat height) · Ry(look) · Rx(lean), on the saucer.
    sub[0] = cl; sub[1] = 0; sub[2] = -sl; sub[3] = 0;
    sub[4] = sl * sle; sub[5] = cle; sub[6] = cl * sle; sub[7] = 0;
    sub[8] = sl * cle; sub[9] = -sle; sub[10] = cl * cle; sub[11] = 0;
    sub[12] = sl * out; sub[13] = h0 + 0.02 * peer; sub[14] = cl * out; sub[15] = 1;
    alien.setMatrix(mul(m, sub, tilted));
  }
  // The rim's lights chase: the two halves in turn (and the antenna's tip blinks with the first).
  const half = Math.floor(st.time * 8) % 2;
  la.setVisible(shown && half === 0);
  lb.setVisible(shown && half === 1);
  if (shown) (half === 0 ? la : lb).setMatrix(m);
  // The beam (bands travelling along it and sparkles rising in it are painted in it) and its pool of light.
  const on = shown && s.beam > 0.01;
  cone.setVisible(on);
  pool.setVisible(on);
  if (on) {
    const floor = s.lean > 0.001 ? s.foot : s.ground;
    const len = Math.max(0.2, y - floor);
    const lean = s.lean, ly = s.leanYaw;
    const ox = Math.sin(ly) * Math.tan(lean) * len, oz = Math.cos(ly) * Math.tan(lean) * len;
    // One flat shape from the hatch to the foot (leaning while it searches), turned square to the camera
    // about its length, so it is the cone's outline seen from wherever you look.
    const yaw = camera().yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    cone.setMatrix([rx, 0, rz, 0, -ox, len, -oz, 0, -rz, 0, rx, 0, s.x, y, s.z, 1]);
    // The bands: up the beam while it lifts somebody, down it while it sets them down.
    const dir = s.phase === 'drop' ? -1 : 1;
    const phaseB = (((st.time * 2 * dir) % 1) + 1) % 1;
    // A weak device (a phone, or the governor has given up the full ink): no sparkles.
    cone.setParams(s.beam, phaseB, weakDevice() ? 0.25 : 0, -1);
    const r = BEAM_POOL;
    pool.setMatrix([r, 0, 0, 0, 0, 1, 0, 0, 0, 0, r, 0, s.x + ox, floor + 0.03, s.z + oz, 1]);
    pool.setParams(s.beam, 0, 1, -1);
  }
  // A ring of shadow under it, growing as it comes down.
  // (Not while the beam is on: its pool of light is there.)
  shadow.setVisible(shown && !on);
  if (shown) {
    const above = Math.max(0.5, s.y - s.ground);
    const r = SAUCER.r * (0.45 + 0.5 * Math.min(1, 2.2 / above));
    shadow.setMatrix([r, 0, 0, 0, 0, 1, 0, 0, 0, 0, r, 0, s.x, s.ground + 0.012, s.z, 1]);
  }
  // "HELP!" over whoever is in the beam, turned to the camera.
  const p = s.person;
  const shouting = !!p && p.visible && (s.phase === 'lift' || (s.phase === 'drop' && s.t > UFO.beamOn));
  help.setVisible(shouting);
  if (shouting) help.setMatrix(facing(p!.x, p!.y + 0.32, p!.z, 1.5, Math.floor(st.time * 8) % 2 ? 0.012 : 0));
}

/** A flat card at (x, y, z) turned square to the camera (the app's view), at scale `sc`. */
/**
 * Whether this is a weak device for drawing: a phone-sized screen, or one where the quality governor
 * (src/render/quality.ts) has had to give up the full ink (half-resolution ink, or fewer pixels than the
 * screen). Read off the app's view and the window; false with neither (tests).
 */
function weakDevice(): boolean {
  const view = (globalThis as { __lc?: { view?: { quality?(): { level: number; levels: { halfInk: boolean; rough?: true }[] } } } }).__lc?.view;
  const q = view?.quality?.();
  const l = q?.levels[q.level];
  if (l && (l.halfInk || l.rough === true)) return true;
  // A phone (a small screen): its graphics are the weakest the game meets, at three device pixels to one.
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  return typeof g.innerWidth === 'number' && typeof g.innerHeight === 'number' && Math.min(g.innerWidth, g.innerHeight) < 600;
}

/** The app's camera, turned and tilted (radians); a default with no app (tests). */
function camera(): { yaw: number; pitch: number } {
  const view = (globalThis as { __lc?: { view?: { getCamera?(): { yaw: number; pitch: number }; getEyeCamera?(): { yaw: number; pitch: number } | null } } }).__lc?.view;
  const deg = Math.PI / 180;
  const e = view?.getEyeCamera?.();
  return e ? { yaw: e.yaw * deg, pitch: -e.pitch * deg } : view?.getCamera ? { yaw: view.getCamera().yaw * deg, pitch: view.getCamera().pitch * deg } : { yaw: 45 * deg, pitch: 35 * deg };
}

const card = new Array<number>(16).fill(0);
function facing(x: number, y: number, z: number, sc: number, jig: number): number[] {
  const cam = camera();
  const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), ct = Math.cos(cam.pitch), st = Math.sin(cam.pitch);
  const v = [c * sc, 0, -sn * sc, 0, -sn * st * sc, ct * sc, -c * st * sc, 0, sn * ct * sc, st * sc, c * ct * sc, 0, x, y + jig, z, 1] as const;
  for (let i = 0; i < 16; i++) card[i] = v[i]!;
  return card;
}

function clear(st: State, stage: LifeStage): void {
  const t = throwerOf(stage);
  for (const s of st.list) {
    for (const h of s.h) h.release();
    if (s.person && s.sailor && s.person.mode !== 'gone' && deckOf(s.sailor)) {
      // A sailor whose ship is still about: back on its deck.
      giveBack(s, t);
    } else if (s.person) {
      s.person.visible = true;
      t?.beamed.delete(s.person);
    }
  }
  st.list = [];
  st.calls = [];
}

export default defineSystem<State>({
  id: 'mischief.ufo',
  // After the thrower (15): a person it holds is moved after the thrower's own step has run.
  order: 16,
  create(ctx) {
    const st: State = {
      d: mischiefOf(ctx.stage),
      own: ownStage(ctx.stage),
      list: [],
      n: 0,
      time: 0,
      night: false,
      calls: [],
      off: () => {},
      ufos: null as unknown as Ufos,
      m: new Array<number>(16).fill(0),
      shape: null,
      cruise: 0,
      warm: 0,
    };
    st.ufos = {
      get saucers() {
        return st.list;
      },
      get live() {
        return st.own.live;
      },
      call(x, y, z, inView) {
        // Who it may take is settled now, from what the camera sees at the click.
        const crowd = crowdOf(ctx.stage);
        const pool: Catch[] = (crowd?.people ?? []).filter((p) => takeable(p, []) && (!inView || inView(p.x, p.y + 0.2, p.z)));
        // And the sailors standing on the decks of the ships about.
        for (const ship of harbourOf(ctx.stage)?.ships ?? []) {
          if (!ship.crew || ship.phase === 'sinking') continue;
          for (const hand of ship.crew.deckHands()) if (!inView || inView(hand.x, hand.y + 0.2, hand.z)) pool.push({ hand, ship });
        }
        st.calls.push({ x, y, z, pool });
        return true;
      },
    };
    registry.set(ctx.stage, st.ufos);
    // The debug handle (sequences, browser tests).
    (globalThis as { __lcUfo?: Ufos }).__lcUfo = st.ufos;
    st.off = st.d.on((e) => {
      if (e.type === 'reset' || e.type === 'undo') clear(st, ctx.stage);
      else if (e.type === 'blast' && e.nuke) {
        // A nuke going off under a hovering saucer: it lets go of its catch and goes off spinning.
        const [bx, , bz] = e.blast.point;
        for (const s of st.list) {
          if (Math.hypot(s.x - bx, s.z - bz) > 12 || (s.phase !== 'beam' && s.phase !== 'lift' && s.phase !== 'seek' && s.phase !== 'drop')) continue;
          const p = s.person, t = throwerOf(ctx.stage);
          if (p && t?.thrown.has(p)) {
            p.visible = true;
            t.beamed.delete(p);
            const dx = p.x - bx, dz = p.z - bz, d = Math.hypot(dx, dz) || 1;
            t.fling(p, (dx / d) * 3, 1.5, (dz / d) * 3);
          }
          s.person = null;
          s.aboard = false;
          s.beam = 0;
          s.lean = 0;
          s.from = { x: s.x, y: s.y, z: s.z };
          s.to = edgePoint(cruiseOf(st, throwerOf(ctx.stage)) + s.lane * UFO.stack, s.n, 'blown');
          phase(s, 'leave');
        }
      }
    });
    return st;
  },
  sync(st, next) {
    st.shape = next.shape;
    st.cruise = 0;
  },
  update(st, dt, signals, ctx) {
    st.time += dt;
    // Its meshes built ahead, one a frame (cached for good): the click that calls one builds nothing.
    if (st.warm < MESHES.length && st.shape) MESHES[st.warm++]!();
    st.night = !signals.time.isDay;
    for (const c of st.calls) create(st, ctx.stage, c.x, c.y, c.z, c.pool);
    st.calls = [];
    for (let i = st.list.length - 1; i >= 0; i--) {
      const s = st.list[i]!;
      step(st, ctx.stage, s, dt);
      if (s.phase === 'done') {
        for (const h of s.h) h.release();
        st.list.splice(i, 1);
        continue;
      }
      draw(st, s);
    }
  },
  dispose(st, ctx) {
    st.off();
    clear(st, ctx.stage);
    registry.delete(ctx.stage);
    st.own.releaseAll();
  },
});
