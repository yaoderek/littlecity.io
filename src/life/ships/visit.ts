// The harbour master (L38–L42): every big ship in the town.
//
// WHO CALLS WHERE. The rules name, for each of the longest few berths, every
// big ship that fits there (berths.fact.ts). Each berth has its own turn:
// when it is free and nothing else is at sea, a ship comes for it, chosen
// by weight among those that fit (the biggest most often, the others taking
// turns: a smooth weighted rotation), so a long quay sees galleons, galleys
// and cogs. A phone serves
// fewer berths (SHIPS.shipBerthsPhone).
//
// A VISIT:
//   arriving   in through the edge of the map (a wall it passes through:
//              the renderer cuts it off there, bow first), under full sail
//              along a route a whole hull can sail (ship-routes.ts). Sails
//              come in one by one as it nears; it slows to a glide
//   swing-in   if it came in at an angle, the stern swings in about the bow
//   warp-in    the mooring lines take it the last stretch; a bell
//   moored     gangplank down; the crew carry any goods waiting on the quay
//              aboard and land new ones; residents come to look; gulls wheel
//              round the masts. It stays the night, lanterns lit
//   warp-out   gangplank up, lines cast off (a creak), sails set one by one
//   swing-out  if it must, the bow swings out about the stern
//   leaving    it gathers way and sails out through the edge of the map
//
// One ship is at sea (arriving or leaving) at a time, and a berth takes one
// ship at a time, so ships never meet. A ship alongside is an obstacle to
// the others' routes. Small boats give way (news.ts).
//
// NOTHING EVER VANISHES. A ship never changes size or fades. When the town
// changes under it:
//   - its way ahead is blocked: it finds another way in or out;
//   - its berth (or its call) has gone: it casts off and sails away;
//   - something is built on the water it floats in: it is nudged aside to
//     the nearest free water first, then sails away;
//   - it has no way out (shut into a pool): it stays afloat there, a
//     resident, until a way opens;
//   - it has no water left at all: it goes with the removal puff.
// Goods it landed stay on the quay (a Pile per berth) until a later crew
// carries them aboard; only if the quay under them goes do they puff away.
//
// Pure of the clock: everything comes from `dt`, signals and seeded rand, so
// the same town and clock give the same visits.

import { CELL_H, columnIndex, key, keyY, SEA_Y, SIZE_X, SIZE_Z } from '@/core/grid';
import type { Mat4, Vec3 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { MeshBuilder, type MeshData } from '@/gen/mesh';
import { stick } from '@/parts/actors/boats/hull';
import { rigOf, type ShipKind } from '@/parts/actors/ships/rig';
import type { ActorOf, DressingPlan, ShapePlan } from '@/resolve/plan';
import { findBerths, hullSize, planningField, SEA_MARGIN, type Berth } from '@/rules/life/berths.fact';
import { hullClear, mapEdge, mooringAt, pathAt, pathClear, pivot, planArrival, planDeparture, type HullSize, type Mooring, type Pose, type SeaField, type Voyage } from '@/rules/life/ship-routes';
import { RAMPS } from '@/style/palette';
import { PORT } from '@/style/port';
import { SHIPS } from '@/style/ships';
import type { InstanceHandle, LifeStage, Signals } from '../api';
import { hullRing, swellAt, wakeRing, type Swell } from '../boats/afloat';
import { angleDelta, clamp01, easeInOut, glide } from '../motion/ease';
import { fly } from '../motion/pose';
import { onTwos } from '../motion/twos';
import { Barge } from './barge';
import { ShipBody, type ShipWind } from './body';
import { Crew, type Gangway, type Pile, type Spot } from './crew';
import { Escort } from './escort';
import { clearAhead, floatPoints, newsOf } from './news';
import { removalPuff } from './puff';
import { steamerSmoke, Tug } from './tug';
import { critterPose } from '../mischief/critters';

export interface CallInfo {
  id: string;
  kind: ShipKind;
  call: ActorOf<'ship-call'>;
}

export type Phase = 'idle' | 'arriving' | 'swing-in' | 'warp-in' | 'moored' | 'warp-out' | 'swing-out' | 'leaving' | 'nudging' | 'stranded' | 'sinking';

/**
 * Mischief (design section 13b): how badly a blast hurt a ship. 1 scorched (sails torn); 2 dismasted (a
 * mast gone): either way it gives up its visit and limps off; 3 broken: it goes down where it is, under
 * the water, and its berth is free again when it has gone.
 */
export interface ShipHit {
  /** A ship on a visit (null: a barge, or a tall ship passing out at sea). */
  ship: Ship | null;
  stage: 1 | 2 | 3;
  /** Distance from the blast to the nearest point of the hull's line. */
  d: number;
  /** Where it was and how big, when it was hit (for the drawing of what comes off it). */
  kind: ShipKind;
  x: number;
  z: number;
  yaw: number;
  stern: number;
  bow: number;
  halfBeam: number;
  /** How many go over the side if it goes down. */
  crew: number;
}

export interface Ship {
  id: string;
  kind: ShipKind;
  look: number;
  hull: HullSize;
  berth: Berth;
  dir: 1 | -1;
  mooring: Mooring;
  /** The call has gone from the plan (or its berth changed): finish this visit by leaving, and stop. */
  orphan: boolean;
  phase: Phase;
  /** Seconds in this phase; seconds since it last looked for a clear way out. */
  t: number;
  t2: number;
  visits: number;
  voyage: Voyage | null;
  /** Ready to leave but holding at its berth: the way out it will take (an arrival keeps clear of it). */
  outbound: Voyage | null;
  s: number;
  speed: number;
  pose: Pose;
  /** Nudging: where it moves from and to. */
  from: Pose;
  to: Pose;
  cameFrom: number;
  body: ShipBody | null;
  crew: Crew | null;
  plank: InstanceHandle | null;
  plankLen: number;
  plankK: number;
  lines: InstanceHandle[];
  escort: Escort | null;
  heel: number;
  bank: number;
  swell: Swell;
  phaseSeed: number;
  drawn: number;
  wake: number;
  bowWave: number;
  ring: number;
  m: Mat4;
  /** Mischief: how badly it was hit (0 not at all), and which way it lists going down. */
  hurt?: 0 | 1 | 2 | 3;
  /** L38-F: a cargo ship's tug; the port's cranes holding it alongside until they are done; seconds to its next puff of smoke. */
  tug?: Tug | null;
  held?: boolean;
  smoke?: number;
  list?: number;
  /** Mischief, the Hand (src/life/mischief/critters.ts): it is up in the air, out of traffic; or set down on the land (seconds since). */
  lifted?: boolean;
  aground?: number;
}

/** L42: a tall ship crossing far out, in through one side of the map and out through the other, never calling. */
export interface Passer {
  id: string;
  kind: ShipKind;
  look: number;
  from: [number, number];
  to: [number, number];
  often: boolean;
  orphan: boolean;
  phase: 'idle' | 'crossing' | 'sinking';
  /** Mischief: seconds going down. */
  sinkT?: number;
  due: number;
  s: number;
  body: ShipBody | null;
  swell: Swell;
  phaseSeed: number;
  drawn: number;
  wake: number;
  m: Mat4;
}

export interface Harbour {
  readonly ships: readonly Ship[];
  readonly passers: readonly Passer[];
  readonly barges: readonly Barge[];
  /** Goods lying on each quay, by berth key. */
  readonly piles: ReadonlyMap<string, Pile>;
  /** Goods set down by somebody else (the port's dock workers: key 'port:<id>'), for the carters (L58); null removes it. */
  setPile(key: string, pile: Pile | null): void;
  /**
   * Mischief: a blast at (x, z) reaching `r3` (it breaks a ship and sinks it), `r2` (dismasts it) and `r1`
   * (scorches it). Each ship worse off than it was is marked so and answers (gives up its visit and
   * limps off, or goes down); the hits are returned for the drawing of it.
   */
  strike(x: number, z: number, r3: number, r2: number, r1: number): ShipHit[];
  /** Mischief undone: a ship going down is gone at once (its berth free); the others sail on as they are. */
  clearWrecks(): void;
  sync(shape: ShapePlan, dressing: DressingPlan, calls: readonly CallInfo[]): void;
  update(dt: number, signals: Signals): void;
  dispose(): void;
}

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
/** Margin a ship keeps while close along a quay. */
const NEAR = 0.1;
/** Radians a second a ship swings at the quay. */
const SWING_RATE = 0.085;
/** How often each kind is chosen when it fits (the biggest most often). */
const WEIGHT: Record<ShipKind, () => number> = { galleon: () => 5, galley: () => 3, cog: () => 2, barge: () => 0, freighter: () => PORT.freighterWeight };
const STAY: Record<ShipKind, () => number> = { galleon: () => SHIPS.galleonStay, cog: () => SHIPS.cogStay, galley: () => SHIPS.galleyStay, barge: () => 30, freighter: () => PORT.freighterStay };
const GAP: Record<ShipKind, () => [number, number]> = {
  galleon: () => [SHIPS.galleonGapMin, SHIPS.galleonGapMax],
  cog: () => [SHIPS.cogGapMin, SHIPS.cogGapMax],
  galley: () => [SHIPS.galleyGapMin, SHIPS.galleyGapMax],
  barge: () => [30, 60],
  freighter: () => [SHIPS.galleonGapMin, SHIPS.galleonGapMax],
};
const CREW: Record<ShipKind, number> = { galleon: 3, cog: 2, galley: 2, barge: 1, freighter: 2 };
const SIZE: Record<ShipKind, number> = { galleon: 0, galley: 1, cog: 2, barge: 3, freighter: -1 };

/** The berth a call names (the same numbers berths.fact.ts gives it). */
export function berthOfCall(call: ActorOf<'ship-call'>, berths: readonly Berth[]): Berth | null {
  const p = call.params ?? {};
  const key = `${p.x},${p.z},${p.along},${p.out}`;
  return berths.find((b) => b.key === key) ?? null;
}

/** True on a phone-sized viewport (the crowd's test, src/life/people/people.system.ts). */
function phone(): boolean {
  const w = typeof window !== 'undefined' ? window.innerWidth : undefined;
  const h = typeof window !== 'undefined' ? window.innerHeight : undefined;
  return typeof w === 'number' && typeof h === 'number' && Math.min(w, h) < 600;
}

let LINE: MeshData | null = null;
/** A unit line of rope along +Z, for mooring lines (stretched to length). */
function lineMesh(): MeshData {
  if (!LINE) {
    const b = new MeshBuilder({ ink: 'ship-line' });
    b.setColor(RAMPS.wood[7]!).setInk('rope');
    stick(b, [0, 0, 0], [0, 0, 1], 0.024);
    LINE = b.build();
  }
  return LINE;
}

/** Columns under a hull at a pose (as obstacles for the other ships). */
function hullColumns(h: HullSize, p: Pose): number[] {
  const out = new Set<number>();
  const sx = Math.sin(p.yaw), cz = Math.cos(p.yaw);
  for (let a = h.stern; a <= h.bow; a += 0.3) {
    for (const w of [-h.halfBeam, 0, h.halfBeam]) {
      const x = p.x + sx * a + cz * w, z = p.z + cz * a - sx * w;
      const ix = Math.floor(x), iz = Math.floor(z);
      if (ix >= 0 && iz >= 0 && ix < SIZE_X && iz < SIZE_Z) out.add(columnIndex(ix, iz));
    }
  }
  return [...out];
}

/** The nearest pose (same heading, or a quarter turn either way) where the hull floats clear: nudged aside. */
export function nearestFree(field: SeaField, h: HullSize, p: Pose): Pose | null {
  for (let r = 0.25; r <= 8; r += 0.25) {
    const n = Math.max(8, Math.round(r * 8));
    for (const turn of [0, 0.4, -0.4, Math.PI / 2, -Math.PI / 2]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (mapEdge(x, z) > -1) continue;
        if (hullClear(field, h, x, z, p.yaw + turn, 0.05)) return { x, z, yaw: p.yaw + turn };
      }
    }
  }
  return null;
}

interface Disc {
  x: number;
  z: number;
  r: number;
}
/** The safe gap between two hulls under way. */
const SAFE = 0.5;

/** The water a voyage sweeps from `from` on: its hull as discs at every step along the path. */
function corridor(h: HullSize, v: Voyage, from: number): Disc[] {
  const out: Disc[] = [];
  const q = { x: 0, z: 0, yaw: 0 };
  const len = h.bow - h.stern;
  const n = Math.max(2, Math.ceil(len / 1.2));
  for (let s = Math.max(0, from); s <= v.path.length + 1e-6; s += 1.2) {
    pathAt(v.path, Math.min(s, v.path.length), q);
    // Beyond the edge it is nobody's way.
    if (mapEdge(q.x, q.z) > 2) continue;
    const sx = Math.sin(q.yaw), cz = Math.cos(q.yaw);
    for (let i = 0; i <= n; i++) {
      const a = h.stern + (len * i) / n;
      out.push({ x: q.x + sx * a, z: q.z + cz * a, r: h.halfBeam + 0.3 });
    }
  }
  return out;
}

/** Do two swept corridors come within the safe gap anywhere? */
function corridorsMeet(a: readonly Disc[], b: readonly Disc[]): boolean {
  for (const p of a) {
    for (const q of b) {
      const d = p.r + q.r + SAFE;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx * dx + dz * dz < d * d) return true;
    }
  }
  return false;
}

/** Do two hulls at two poses come within `margin` of each other? */
function hullsNear(ha: HullSize, a: Pose, hb: HullSize, b: Pose, margin: number): boolean {
  const reach = Math.max(-ha.stern, ha.bow) + Math.max(-hb.stern, hb.bow) + ha.halfBeam + hb.halfBeam + margin;
  if (Math.hypot(a.x - b.x, a.z - b.z) > reach) return false;
  const disc = (h: HullSize, p: Pose): Disc[] => {
    const out: Disc[] = [];
    const sx = Math.sin(p.yaw), cz = Math.cos(p.yaw);
    for (let k = h.stern; k <= h.bow + 1e-6; k += 0.6) out.push({ x: p.x + sx * k, z: p.z + cz * k, r: h.halfBeam });
    return out;
  };
  const da = disc(ha, a), db = disc(hb, b);
  for (const p of da) for (const q of db) if (Math.hypot(p.x - q.x, p.z - q.z) < p.r + q.r + margin) return true;
  return false;
}

/** A tall ship's crossing as a corridor. */
function passCorridor(p: Passer): Disc[] {
  const len = Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]);
  const out: Disc[] = [];
  for (let d = 0; d <= len; d += 1.2) {
    const x = p.from[0] + ((p.to[0] - p.from[0]) * d) / len, z = p.from[1] + ((p.to[1] - p.from[1]) * d) / len;
    if (mapEdge(x, z) < 2) out.push({ x, z, r: 3.6 });
  }
  return out;
}

/** Seconds a broken ship takes to go down. */
const SINK_TIME = 9;

const harbours = new WeakMap<LifeStage, Harbour>();
/** The harbour running on a stage (for tests). */
export function harbourOf(stage: LifeStage): Harbour | null {
  return harbours.get(stage) ?? null;
}

export function createHarbour(stage: LifeStage, seed: number): Harbour {
  const ships: Ship[] = [];
  const passers: Passer[] = [];
  const barges: Barge[] = [];
  const piles = new Map<string, Pile>();
  /** Each berth's turn: seconds until its next ship, the berths in order (longest first), and its visits. */
  const turns = new Map<string, { due: number; visits: number }>();
  /** The harbour's weighted rotation of kinds (see update). */
  const credit = new Map<ShipKind, number>();
  let order: string[] = [];
  let shape: ShapePlan | null = null;
  let opened = false;
  const fields = new Map<string, SeaField>();
  const news = newsOf(stage);
  let small: { x: number; z: number }[] = [];
  /** Seconds since the night ended (0 at dusk and night). */
  let daylight = 0;

  /** The field a ship plans in: the town, the small boats' moorings, and the hulls of the other ships alongside. */
  const fieldFor = (ship: Ship): SeaField => {
    const others = ships.filter((o) => o !== ship && o.body && o.phase !== 'arriving' && o.phase !== 'leaving' && o.phase !== 'idle');
    const k = `${ship.id}|${ship.berth.key}|${others.map((o) => `${o.id}:${o.pose.x.toFixed(1)},${o.pose.z.toFixed(1)}`).join(',')}`;
    let f = fields.get(k);
    if (!f) {
      const extra = others.flatMap((o) => hullColumns(o.hull, o.pose));
      f = planningField(shape!.facts, ship.berth, extra);
      fields.set(k, f);
    }
    return f;
  };
  const r = (ship: Ship, what: string): number => rand(seed, 'ship', ship.id, what, ship.visits);
  /** Under way (or about to be): its voyage is a lane others must keep out of. */
  const underWay = (s: Ship): boolean => (s.phase === 'arriving' || s.phase === 'leaving' || s.phase === 'warp-out' || s.phase === 'swing-out') && s.voyage !== null;
  /**
   * Would a voyage (from `from` along its path) bring this ship within a safe gap of any ship under way, or of
   * a tall ship passing, at the same time? Each is moved along its way at its expected pace (a ship that has
   * come in stays at its berth; one casting off sets out a few seconds on), with a margin that grows with
   * time; ships under way also slow for each other (yieldFor), so a guess that is a little out is safe.
   */
  const lanesCross = (ship: Ship, v: Voyage, from: number): boolean => {
    const pace = (k: ShipKind): number => (k === 'galley' ? SHIPS.rowSpeed : SHIPS.sailSpeed) * 0.7;
    const others: { h: HullSize; v: Voyage; s: number; delay: number; pace: number }[] = [];
    for (const o of ships) {
      if (o === ship) continue;
      if (underWay(o)) {
        const moving = o.phase === 'arriving' || o.phase === 'leaving';
        others.push({ h: o.hull, v: o.voyage!, s: moving ? o.s : 0, delay: moving ? 0 : 10, pace: pace(o.kind) });
      } else if (o.phase === 'moored' && o.outbound && ship.phase === 'idle') {
        // A ship waiting to leave has the way: an arrival keeps clear of the way out it will take.
        others.push({ h: o.hull, v: o.outbound, s: 0, delay: 8, pace: pace(o.kind) });
      }
    }
    const crossing = passers.filter((p) => p.phase === 'crossing');
    if (!others.length && !crossing.length) return false;
    const mine = pace(ship.kind);
    const horizon = (v.path.length - from) / mine + 20;
    const a = { x: 0, z: 0, yaw: 0 }, b = { x: 0, z: 0, yaw: 0 };
    for (let t = 0; t <= horizon; t += 1) {
      pathAt(v.path, Math.min(v.path.length, from + mine * t), a);
      if (mapEdge(a.x, a.z) > 1.5) continue;
      const margin = SAFE + 0.04 * t;
      for (const o of others) {
        const so = Math.min(o.v.path.length, o.s + o.pace * Math.max(0, t - o.delay));
        pathAt(o.v.path, so, b);
        if (mapEdge(b.x, b.z) > 1.5) continue;
        if (hullsNear(ship.hull, a, o.h, b, margin)) return true;
      }
      for (const p of crossing) {
        const len = Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]);
        const d = Math.min(len, p.s + SHIPS.passSpeed * t);
        const x = p.from[0] + ((p.to[0] - p.from[0]) * d) / len, z = p.from[1] + ((p.to[1] - p.from[1]) * d) / len;
        if (Math.hypot(a.x - x, a.z - z) < 8 + margin) return true;
      }
    }
    return false;
  };

  const berthBusy = (key: string): boolean => ships.some((s) => s.phase !== 'idle' && s.berth.key === key);
  const setPhase = (ship: Ship, phase: Phase): void => {
    ship.phase = phase;
    ship.t = 0;
    if (phase !== 'moored') ship.outbound = null;
  };
  const yieldFor = (ship: Ship): number => {
    const me = { x: ship.pose.x, z: ship.pose.z, yaw: ship.pose.yaw, stern: ship.hull.stern, bow: ship.hull.bow, halfBeam: ship.hull.halfBeam, speed: ship.speed };
    // Small boats under its bow, and (a safeguard) any other big ship close ahead: points along its hull.
    const big: { x: number; z: number }[] = [];
    for (const o of ships) {
      // Only ships under way: those lying at a berth (or afloat, waiting) were sailed round when its way was planned.
      if (o === ship || !o.body || !(o.phase === 'arriving' || o.phase === 'leaving' || o.phase === 'swing-out' || o.phase === 'swing-in')) continue;
      const sx = Math.sin(o.pose.yaw), cz = Math.cos(o.pose.yaw);
      for (let k = o.hull.stern; k <= o.hull.bow; k += 0.8) big.push({ x: o.pose.x + sx * k, z: o.pose.z + cz * k });
    }
    return Math.min(clearAhead(me, small), clearAhead({ ...me, halfBeam: me.halfBeam + 0.6 }, big));
  };

  /** Where the gangplank comes down, and where goods are piled: on the quay beside the ship's middle. */
  const gangwayOf = (ship: Ship): { way: Gangway; side: number } => {
    const rig = rigOf(ship.kind, ship.look);
    const m = ship.mooring;
    // The quay is on the side opposite the water; the ship's +X points (cos yaw, −sin yaw).
    const side = Math.cos(m.yaw) * -m.ox + -Math.sin(m.yaw) * -m.oz > 0 ? 1 : -1;
    const [gx, gy, gz] = rig.gangway;
    const deck = rig.hull.deck(rig.hull.t(gz));
    const way: Gangway = { hatch: [side * -0.1, deck, gz - 0.55], rail: [side * (gx - 0.22), deck, gz], top: [side * (gx - 0.04), gy + 0.02, gz], foot: [0, 0, 0] };
    const b = ship.berth;
    const wx = m.x + Math.cos(m.yaw) * side * gx + Math.sin(m.yaw) * gz, wz = m.z - Math.sin(m.yaw) * side * gx + Math.cos(m.yaw) * gz;
    const faceDist = (wx - b.face.ax) * b.face.ox + (wz - b.face.az) * b.face.oz;
    way.foot = [wx - b.face.ox * (faceDist + 0.45), b.level * CELL_H + 0.02, wz - b.face.oz * (faceDist + 0.45)];
    return { way, side };
  };
  /** The berth's pile: two rows of spots on the quay beside where the gangplank comes down. */
  const pileOf = (ship: Ship): Pile => {
    let pile = piles.get(ship.berth.key);
    if (pile) return pile;
    const { way } = gangwayOf(ship);
    const b = ship.berth;
    const f = way.foot;
    const yaw = Math.atan2(-b.face.ox, -b.face.oz);
    const spots: Spot[] = [];
    const n = Math.max(0, Math.round(SHIPS.goodsMax));
    for (let i = 0; i < n; i++) {
      const along = (i % 3 === 0 ? 0.55 : i % 3 === 1 ? 0.82 : -0.6) * (i >= 3 ? -1 : 1);
      const depth = 0.18 + (i >= 3 ? 0.04 : 0);
      spots.push({ x: f[0] + b.face.dx * along - b.face.ox * depth, y: f[1], z: f[2] + b.face.dz * along - b.face.oz * depth, yaw: yaw + (rand(seed, 'pile', b.key, i) - 0.5) * 0.5 });
    }
    pile = { spots, items: spots.map(() => null) };
    piles.set(ship.berth.key, pile);
    return pile;
  };

  /** Mischief: see Harbour.strike. */
  const strike = (x: number, z: number, r3: number, r2: number, r1: number): ShipHit[] => {
    const out: ShipHit[] = [];
    for (const ship of ships) {
      if (ship.phase === 'idle' || ship.phase === 'sinking' || !ship.body) continue;
      // The nearest point of the hull's line (stern to bow), less its half beam.
      const sin = Math.sin(ship.pose.yaw), cos = Math.cos(ship.pose.yaw);
      const along = Math.max(ship.hull.stern, Math.min(ship.hull.bow, (x - ship.pose.x) * sin + (z - ship.pose.z) * cos));
      const d = Math.max(0, Math.hypot(x - (ship.pose.x + sin * along), z - (ship.pose.z + cos * along)) - ship.hull.halfBeam);
      const stage: 0 | 1 | 2 | 3 = d <= r3 ? 3 : d <= r2 ? 2 : d <= r1 ? 1 : 0;
      if (stage === 0 || stage <= (ship.hurt ?? 0)) continue;
      ship.hurt = stage;
      out.push({ ship, stage, d, kind: ship.kind, x: ship.pose.x, z: ship.pose.z, yaw: ship.pose.yaw, stern: ship.hull.stern, bow: ship.hull.bow, halfBeam: ship.hull.halfBeam, crew: ship.crew ? ship.crew.hands : CREW[ship.kind] });
      if (stage === 3) {
        // It goes down: nobody stays aboard, nothing is tied to the quay.
        ship.crew?.release();
        ship.crew = null;
        ship.plank?.release();
        ship.plank = null;
        ship.plankK = 0;
        for (const l of ship.lines) l.release();
        ship.lines = [];
        ship.escort?.release();
        ship.escort = null;
        ship.voyage = null;
        ship.speed = 0;
        ship.list = (x - ship.pose.x) * cos - (z - ship.pose.z) * sin > 0 ? -1 : 1;
        setPhase(ship, 'sinking');
      }
    }
    // Barges, and tall ships passing out at sea.
    const reach = (sx: number, sz: number, yaw: number, stern: number, bow: number, halfBeam: number): number => {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const along = Math.max(stern, Math.min(bow, (x - sx) * sin + (z - sz) * cos));
      return Math.max(0, Math.hypot(x - (sx + sin * along), z - (sz + cos * along)) - halfBeam);
    };
    for (const b of barges) {
      if (b.gone) continue;
      const h = Barge.hull;
      const d = reach(b.x, b.z, b.yaw, h.stern, h.bow, h.halfBeam);
      const stage: 0 | 1 | 2 | 3 = d <= r3 ? 3 : d <= r2 ? 2 : d <= r1 ? 1 : 0;
      if (stage === 0 || stage <= b.hurt) continue;
      b.hit(stage);
      out.push({ ship: null, stage, d, kind: 'barge', x: b.x, z: b.z, yaw: b.yaw, stern: h.stern, bow: h.bow, halfBeam: h.halfBeam, crew: 1 });
    }
    for (const p of passers) {
      if (p.phase !== 'crossing' || !p.body) continue;
      const sx = p.m[12]!, sz = p.m[14]!, yaw = Math.atan2(p.to[0] - p.from[0], p.to[1] - p.from[1]);
      const d = reach(sx, sz, yaw, -2.85, 3.55, 0.75);
      const stage: 0 | 1 | 2 | 3 = d <= r3 ? 3 : d <= r2 ? 2 : d <= r1 ? 1 : 0;
      if (stage === 0) continue;
      p.body.damage({ sails: p.body.rig.sails.map((_, i) => i).filter((i) => stage >= 2 || i % 2 === 0) });
      if (stage === 3) {
        p.phase = 'sinking';
        p.sinkT = 0;
      }
      out.push({ ship: null, stage, d, kind: p.kind, x: sx, z: sz, yaw, stern: -2.85, bow: 3.55, halfBeam: 0.75, crew: stage === 3 ? CREW[p.kind] : 0 });
    }
    return out;
  };

  /** Ends a visit (the ship is out beyond the edge, or gone in a puff): its pieces go; goods stay. */
  const finish = (ship: Ship): void => {
    ship.body?.release();
    ship.body = null;
    ship.crew?.release();
    ship.crew = null;
    ship.plank?.release();
    ship.plank = null;
    ship.plankK = 0;
    for (const l of ship.lines) l.release();
    ship.lines = [];
    ship.escort?.release();
    ship.escort = null;
    ship.tug?.release();
    ship.tug = null;
    ship.held = false;
    ship.voyage = null;
    ship.visits++;
    // A new visit is a sound ship.
    ship.hurt = 0;
    ship.lifted = false;
    ship.aground = undefined;
    const turn = turns.get(ship.berth.key);
    if (turn) {
      const [lo, hi] = GAP[ship.kind]();
      turn.due = lo + (hi - lo) * r(ship, 'gap');
    }
    setPhase(ship, 'idle');
  };

  /** Off to sea from where it is (its berth has gone, or its way is blocked); a resident if there is no way. */
  const leaveFromHere = (ship: Ship): void => {
    const field = fieldFor(ship);
    if (!hullClear(field, ship.hull, ship.pose.x, ship.pose.z, ship.pose.yaw, -0.05)) {
      nudge(ship, field);
      return;
    }
    ship.crew?.setPile(null);
    const v = planDeparture(field, ship.hull, ship.mooring, SHIPS.edgeIn, SEA_MARGIN, r(ship, 'exit'), -1, ship.pose) ?? planDeparture(field, ship.hull, ship.mooring, SHIPS.edgeIn, 0.05, r(ship, 'exit'), -1, ship.pose);
    if (v) {
      ship.voyage = v;
      ship.s = 0;
      ship.body?.setAll(1);
      setPhase(ship, 'leaving');
    } else setPhase(ship, 'stranded');
  };

  /** Something stands where it floats: aside to the nearest free water, or (no water left) the removal puff. */
  const nudge = (ship: Ship, field: SeaField): void => {
    const to = nearestFree(field, ship.hull, ship.pose);
    if (!to) {
      const mid = (ship.hull.stern + ship.hull.bow) / 2;
      removalPuff(stage, seed, ship.pose.x + Math.sin(ship.pose.yaw) * mid, SEA_Y + 0.6, ship.pose.z + Math.cos(ship.pose.yaw) * mid, 2.4, ship.visits);
      finish(ship);
      return;
    }
    ship.from = { ...ship.pose };
    ship.to = to;
    ship.crew?.setPile(null);
    setPhase(ship, 'nudging');
  };

  /** Its crew, cargo and gangplank: aboard from the start of the visit to its end, never appearing in view. */
  const aboard = (ship: Ship): void => {
    const rig = rigOf(ship.kind, ship.look);
    const { way } = gangwayOf(ship);
    // A cargo ship's cargo is its containers: the cranes work it, not the crew.
    const goods = ship.kind === 'freighter' ? 0 : Math.round(SHIPS.goodsMax * (ship.kind === 'galleon' ? 1 : 0.67));
    ship.crew = new Crew(stage, (rand(seed, 'crew', ship.id, ship.visits) * 1e9) >>> 0, ship.kind, rig.crew.slice(0, CREW[ship.kind]), way.hatch, goods, goods);
    const m = ship.mooring;
    const top = transform(fly(m.x, SEA_Y, m.z, m.yaw, 0, 0, 1), way.top);
    ship.plankLen = Math.round(Math.max(0.3, Math.hypot(way.foot[0] - top[0], way.foot[1] - top[1], way.foot[2] - top[2])) * 20) / 20;
    ship.plank = stage.spawn({ actor: 'gangplank', params: { length: ship.plankLen } }, HIDDEN);
    ship.plankK = 0;
  };

  /** L38-F: a cargo ship comes loaded with containers (seeded for this visit), and with its tug. */
  const steamer = (ship: Ship): void => {
    if (ship.kind !== 'freighter' || !ship.body) return;
    ship.body.stow((rand(seed, 'cargo', ship.id, ship.visits) * 4294967296) >>> 0);
    ship.tug?.release();
    ship.tug = new Tug(stage, seed, `${ship.id}#${ship.visits}`);
    ship.smoke = 0;
    ship.held = false;
  };

  const begin = (ship: Ship): boolean => {
    const field = fieldFor(ship);
    const v = planArrival(field, ship.hull, ship.mooring, SHIPS.edgeIn, SEA_MARGIN, r(ship, 'entry'));
    // No way in, or another ship is under way across it: it waits offshore, out of sight beyond the edge.
    if (!v || lanesCross(ship, v, 0)) return false;
    ship.voyage = v;
    ship.s = 0;
    ship.speed = SHIPS.sailSpeed * 0.8;
    ship.cameFrom = v.edge.side;
    const p = pathAt(v.path, 0);
    ship.pose = { x: p.x, z: p.z, yaw: p.yaw };
    ship.body = new ShipBody(stage, ship.kind, ship.look, HIDDEN, 1);
    ship.escort = new Escort(stage, seed, ship.id);
    steamer(ship);
    aboard(ship);
    setPhase(ship, 'arriving');
    return true;
  };

  /** Lies at the berth right away (a town opened with a ship in). */
  const moorNow = (ship: Ship, into: number): void => {
    ship.pose = { x: ship.mooring.x, z: ship.mooring.z, yaw: ship.mooring.yaw };
    ship.body = new ShipBody(stage, ship.kind, ship.look, HIDDEN, 0);
    ship.escort = new Escort(stage, seed, ship.id);
    steamer(ship);
    aboard(ship);
    ship.cameFrom = -1;
    setPhase(ship, 'moored');
    ship.t = into;
  };

  /** How long a ship the Hand set down on the land lies there before the town has it refloated (a puff: gone to sea). */
  const AGROUND = 30;
  /**
   * Mischief, the Hand: while it holds the ship, the ship is out of traffic (no voyage, nothing tied to the
   * quay, its berth still its own) and drawn where the Hand says, crew aboard. Let go: in clear water it
   * sails off from there (as a ship whose berth went does); on the land it lies over on its side until it is
   * picked up again or, after a while, refloated (gone in a puff, its berth's turn comes round). True if it
   * took the ship's step.
   */
  const handled = (ship: Ship, dt: number): boolean => {
    const body = ship.body!;
    if (ship.phase === 'sinking') return false;
    const held = critterPose(stage, `ship:${ship.id}`, ship.kind, ship.pose.x, SEA_Y, ship.pose.z, ship.pose.yaw, 1.4, 1);
    if (held) {
      if (!ship.lifted) {
        ship.lifted = true;
        ship.aground = undefined;
        ship.plank?.release();
        ship.plank = null;
        ship.plankK = 0;
        for (const l of ship.lines) l.release();
        ship.lines = [];
        ship.escort?.release();
        ship.escort = null;
        ship.voyage = null;
        ship.outbound = null;
        ship.speed = 0;
        ship.crew?.setPile(null);
        setPhase(ship, 'stranded');
      }
      for (let i = 0; i < 16; i++) ship.m[i] = held[i]!;
      ship.pose = { x: held[12]!, z: held[14]!, yaw: Math.atan2(held[8]!, held[10]!) };
      body.setCut(false);
      body.pose(ship.m, ship.pose.yaw);
      ship.crew?.update(dt, ship.m, null, false);
      return true;
    }
    if (ship.lifted) {
      ship.lifted = false;
      const mid = (ship.hull.stern + ship.hull.bow) / 2;
      const mx = ship.pose.x + Math.sin(ship.pose.yaw) * mid, mz = ship.pose.z + Math.cos(ship.pose.yaw) * mid;
      const cx = Math.floor(mx), cz = Math.floor(mz);
      const onLand = !!shape && cx >= 0 && cz >= 0 && cx < 48 && cz < 48 && shape.terrain.height[columnIndex(cx, cz)]! > 0;
      if (!onLand) {
        // Down in the water with a great splash: it sails on, out to sea from here.
        setPhase(ship, 'stranded');
        leaveFromHere(ship);
        return false;
      }
      ship.aground = 0;
    }
    if (ship.aground === undefined) return false;
    ship.aground += dt;
    // Over on its side on the land, where it came down.
    const mid = (ship.hull.stern + ship.hull.bow) / 2;
    const mx = ship.pose.x + Math.sin(ship.pose.yaw) * mid, mz = ship.pose.z + Math.cos(ship.pose.yaw) * mid;
    const cx = Math.max(0, Math.min(47, Math.floor(mx))), cz = Math.max(0, Math.min(47, Math.floor(mz)));
    const ground = (shape?.terrain.height[columnIndex(cx, cz)] ?? 0) * CELL_H;
    fly(ship.pose.x, ground + ship.hull.halfBeam * 0.6, ship.pose.z, ship.pose.yaw, 0, 1.2, 1, ship.m);
    body.setCut(false);
    body.pose(ship.m, ship.pose.yaw);
    ship.crew?.update(dt, ship.m, null, false);
    if (ship.aground >= AGROUND) {
      ship.aground = undefined;
      removalPuff(stage, seed, mx, ground + 0.6, mz, 2.4, ship.visits);
      finish(ship);
    }
    return true;
  };

  const stepShip = (ship: Ship, dt: number, signals: Signals): void => {
    ship.t += dt;
    const body = ship.body;
    if (!body) return;
    if (handled(ship, dt)) return;
    if (ship.phase === 'sinking') {
      // Down where it was hit: settling by the head, listing, and under (the water hides it); then gone,
      // and its berth's turn comes round again.
      const k = Math.min(1, ship.t / SINK_TIME);
      const depth = 4.2 * k * k;
      const list = (ship.list ?? 1) * Math.min(0.75, ship.t * 0.12);
      fly(ship.pose.x, SEA_Y - depth, ship.pose.z, ship.pose.yaw, 0.08 + Math.min(0.42, ship.t * 0.05), list, 1, ship.m);
      body.pose(ship.m, ship.pose.yaw);
      if (ship.t >= SINK_TIME) finish(ship);
      return;
    }
    const wind = signals.wind(ship.pose.x, ship.pose.z);
    const sin = Math.sin(ship.pose.yaw), cos = Math.cos(ship.pose.yaw);
    const w: ShipWind = { lee: wind.dirX * cos - wind.dirZ * sin, along: wind.dirX * sin + wind.dirZ * cos, strength: wind.strength };
    // A cargo ship goes under its engine, whatever the wind.
    const motor = ship.kind === 'freighter';
    const full = ship.kind === 'galley' ? SHIPS.rowSpeed : motor ? SHIPS.sailSpeed * 0.9 : SHIPS.sailSpeed * (0.85 + 0.15 * w.along);
    const len = ship.hull.bow - ship.hull.stern;
    const before = { ...ship.pose };
    const rowing = ship.kind === 'galley';
    const m = ship.mooring;

    switch (ship.phase) {
      case 'arriving': {
        const v = ship.voyage!;
        const remaining = v.path.length - ship.s;
        const want = full * Math.min(1, Math.max(0.16, Math.sqrt(Math.max(0, remaining) / SHIPS.slowing))) * yieldFor(ship);
        ship.speed += (want - ship.speed) * glide(0.8, dt);
        ship.s = Math.min(v.path.length, ship.s + ship.speed * dt);
        const p = pathAt(v.path, ship.s);
        ship.pose.x = p.x;
        ship.pose.z = p.z;
        ship.pose.yaw = p.yaw; // along the path (its tangent is smoothed), exactly as it was checked clear
        // Sails come in one by one as it nears, the last at the very end.
        const n = body.sails.length;
        body.sails.forEach((sp, i) => {
          const rank = n - 1 - body.rig.sails[i]!.order;
          sp.want = remaining > SHIPS.slowing * (1 - rank / Math.max(1, n)) * 0.95 + 0.6 ? 1 : 0;
          if (rowing) sp.want = w.along > 0.35 && remaining > 4 ? 1 : 0;
        });
        if (rowing) body.rowing = remaining > 2.2 ? Math.min(1, body.rowing + dt) : Math.max(0, body.rowing - dt * 0.8);
        if (ship.s >= v.path.length - 1e-6) setPhase(ship, v.swing !== 0 ? 'swing-in' : 'warp-in');
        break;
      }
      case 'swing-in': {
        const v = ship.voyage!;
        const dur = Math.abs(v.swing) / SWING_RATE;
        const k = easeInOut(clamp01(ship.t / dur));
        pivot({ x: m.wx, z: m.wz, yaw: m.yaw }, ship.hull.bow, v.swing * (1 - k), ship.pose);
        if (rowing) body.rowing = Math.max(0, body.rowing - dt);
        if (ship.t >= dur) setPhase(ship, 'warp-in');
        break;
      }
      case 'warp-in': {
        if (!ship.lines.length) {
          news.sounds.push({ kind: 'bell', x: ship.pose.x, z: ship.pose.z });
          ship.lines = [stage.spawnMesh(lineMesh(), HIDDEN), stage.spawnMesh(lineMesh(), HIDDEN)];
        }
        const k = easeInOut(clamp01(ship.t / SHIPS.warp));
        ship.pose.x = m.wx + (m.x - m.wx) * k;
        ship.pose.z = m.wz + (m.z - m.wz) * k;
        ship.pose.yaw = m.yaw;
        body.setAll(0);
        if (rowing) body.rowing = Math.max(0, body.rowing - dt);
        if (ship.t >= SHIPS.warp) {
          setPhase(ship, 'moored');
          ship.voyage = null;
        }
        break;
      }
      case 'moored': {
        ship.pose.x = m.x;
        ship.pose.z = m.z;
        ship.pose.yaw = m.yaw;
        if (!ship.lines.length) ship.lines = [stage.spawnMesh(lineMesh(), HIDDEN), stage.spawnMesh(lineMesh(), HIDDEN)];
        body.setAll(0);
        if (rowing) body.rowing = 0;
        const stay = STAY[ship.kind]();
        const night = signals.time.isNight || signals.time.isDusk;
        const pile = pileOf(ship);
        if (!ship.crew) aboard(ship);
        ship.crew!.setPile(pile);
        // The plank comes down once it is fast, and up again when the stay is over and the crew are aboard.
        // After a night alongside they do not all go at first light: each waits its own while into the morning.
        // Hit by mischief, it gives up the visit and limps off as soon as its crew are aboard.
        // The port's cranes may hold a cargo ship alongside until they have done (L38-F).
        const done = (ship.t >= stay && !night && daylight >= r(ship, 'dawn') * 75 && !ship.held) || ship.orphan || (ship.hurt ?? 0) > 0;
        const want = done && ship.crew!.aboard ? 0 : ship.t > 0.8 ? 1 : 0;
        ship.plankK = Math.max(0, Math.min(1, ship.plankK + (want > ship.plankK ? dt : -dt) / 2.4));
        if (done && ship.crew!.aboard && ship.plankK <= 0) {
          // Its way out, and only once nobody is under way across it: else it holds at its berth.
          ship.t2 += dt;
          if (ship.t2 >= 1) {
            ship.t2 = 0;
            const field = fieldFor(ship);
            const v = planDeparture(field, ship.hull, m, SHIPS.edgeIn, SEA_MARGIN, r(ship, 'exit'), ship.cameFrom) ?? planDeparture(field, ship.hull, m, SHIPS.edgeIn, SEA_MARGIN, r(ship, 'exit'));
            ship.outbound = v;
            if (v && !lanesCross(ship, v, 0)) {
              ship.voyage = v;
              ship.outbound = null;
              setPhase(ship, 'warp-out');
              news.sounds.push({ kind: 'creak', x: ship.pose.x, z: ship.pose.z });
            } else if (!v && ship.orphan) setPhase(ship, 'stranded');
          }
        }
        break;
      }
      case 'warp-out': {
        if (!ship.voyage) {
          // Its way out was blocked by an edit: back alongside, to plan again when it can.
          setPhase(ship, ship.orphan ? 'stranded' : 'moored');
          ship.t = STAY[ship.kind]();
          return;
        }
        const dur = SHIPS.warp * 0.8;
        const k = easeInOut(clamp01(ship.t / dur));
        // From where it was (alongside, or partway in) out to the warp point.
        ship.pose.x += (m.wx - ship.pose.x) * k * Math.min(1, dt * 4);
        ship.pose.z += (m.wz - ship.pose.z) * k * Math.min(1, dt * 4);
        ship.pose.yaw += angleDelta(ship.pose.yaw, m.yaw) * Math.min(1, dt * 2);
        body.sails.forEach((sp, i) => {
          sp.want = ship.t > body.rig.sails[i]!.order * SHIPS.sailEvery ? 1 : 0;
          if (rowing) sp.want = w.along > 0.35 ? sp.want : 0;
        });
        if (rowing) body.rowing = Math.min(1, ship.t / dur);
        if (ship.t > 0.6 && ship.lines.length) {
          for (const l of ship.lines) l.release();
          ship.lines = [];
        }
        if (ship.t >= dur + 0.5 && ship.voyage) {
          ship.pose.x = m.wx;
          ship.pose.z = m.wz;
          ship.pose.yaw = m.yaw;
          setPhase(ship, ship.voyage.swing !== 0 || ship.voyage.tow > 0 ? 'swing-out' : 'leaving');
          ship.s = 0;
          ship.speed = 0.08;
        }
        break;
      }
      case 'swing-out': {
        const v = ship.voyage!;
        const warp: Pose = { x: m.wx, z: m.wz, yaw: m.yaw };
        // Towed out from the quay first if it must turn round in a closed basin (its boat at the bow line).
        const towDur = v.tow / 0.35;
        const dur = Math.abs(v.swing) / SWING_RATE;
        if (ship.t < towDur) {
          const k = easeInOut(clamp01(ship.t / towDur));
          ship.pose.x = m.wx + m.ox * v.tow * k;
          ship.pose.z = m.wz + m.oz * v.tow * k;
          ship.pose.yaw = m.yaw;
        } else {
          const k = easeInOut(clamp01((ship.t - towDur) / dur));
          if (v.tow > 0) pivot({ x: m.wx + m.ox * v.tow, z: m.wz + m.oz * v.tow, yaw: m.yaw }, (ship.hull.stern + ship.hull.bow) / 2, v.swing * k, ship.pose);
          else pivot(warp, ship.hull.stern, v.swing * k, ship.pose);
        }
        if (!rowing) body.sails.forEach((sp, i) => (sp.want = ship.t + SHIPS.warp * 0.8 > body.rig.sails[i]!.order * SHIPS.sailEvery + towDur ? 1 : 0));
        if (ship.t >= towDur + dur) {
          setPhase(ship, 'leaving');
          ship.s = 0;
          ship.speed = 0.08;
        }
        break;
      }
      case 'leaving': {
        const v = ship.voyage!;
        if (!rowing) body.sails.forEach((sp, i) => (sp.want = ship.t + SHIPS.warp > body.rig.sails[i]!.order * SHIPS.sailEvery * 0.6 ? 1 : 0));
        else body.rowing = Math.min(1, body.rowing + dt);
        const want = full * Math.min(1, 0.18 + ship.s / (len * 1.2)) * (rowing || motor ? 1 : 0.35 + 0.65 * body.canvas) * yieldFor(ship);
        ship.speed += (want - ship.speed) * glide(0.6, dt);
        ship.s = Math.min(v.path.length, ship.s + ship.speed * dt);
        const p = pathAt(v.path, ship.s);
        ship.pose.x = p.x;
        ship.pose.z = p.z;
        ship.pose.yaw = p.yaw; // along the path (its tangent is smoothed), exactly as it was checked clear
        // Out through the edge of the map: once all of it is beyond, the visit is over.
        if (v.path.length - ship.s <= 1e-6) {
          finish(ship);
          return;
        }
        break;
      }
      case 'nudging': {
        const k = easeInOut(clamp01(ship.t / 2.5));
        ship.pose.x = ship.from.x + (ship.to.x - ship.from.x) * k;
        ship.pose.z = ship.from.z + (ship.to.z - ship.from.z) * k;
        ship.pose.yaw = ship.from.yaw + angleDelta(ship.from.yaw, ship.to.yaw) * k;
        for (const l of ship.lines) l.release();
        ship.lines = [];
        if (ship.t >= 2.5) leaveFromHere(ship);
        break;
      }
      case 'stranded': {
        // Afloat where it is, sails furled, a resident until a way opens (sync tries again on every change).
        body.setAll(0);
        if (rowing) body.rowing = 0;
        for (const l of ship.lines) l.release();
        ship.lines = [];
        break;
      }
      default:
    }
    if (!ship.body) return;

    // ── the crew, the gangplank and the lines, while it lies alongside ──
    const alongside = ship.phase === 'moored' || ship.phase === 'warp-out' || ship.phase === 'warp-in';
    const { way, side } = gangwayOf(ship);
    if (ship.crew) ship.crew.update(dt, ship.m, ship.phase === 'moored' ? way : null, ship.phase === 'moored' && ship.t < STAY[ship.kind]() - 6 && !ship.orphan && ship.kind !== 'freighter');
    if (ship.plank) {
      // The gangplank: stowed on deck along the ship (0); swung up on end at the rail (½); down on the quay (1).
      if (ship.phase !== 'moored') ship.plankK = Math.max(0, ship.plankK - dt / 1.2);
      const top = transform(ship.m, way.top);
      const f = way.foot;
      const dx = f[0] - top[0], dy = f[1] - top[1], dz = f[2] - top[2];
      const rest = Math.atan2(-dy, Math.hypot(dx, dz));
      const quayYaw = Math.atan2(dx, dz);
      const k = ship.plankK;
      let x: number, y: number, z: number, yaw: number, pitch: number;
      if (k >= 0.5) {
        const u = easeInOut((k - 0.5) * 2);
        [x, y, z] = top;
        y += 0.02;
        yaw = quayYaw;
        pitch = -1.3 + (rest + 1.3) * u;
      } else {
        // Stowed: lying on deck inboard of the rail, its foot aft, along the ship.
        const u = easeInOut(k * 2);
        const deck = transform(ship.m, [way.rail[0] * 0.35, way.rail[1] + 0.05, way.rail[2] - ship.plankLen * 0.5]);
        x = deck[0] + (top[0] - deck[0]) * u;
        y = deck[1] + (top[1] + 0.02 - deck[1]) * u;
        z = deck[2] + (top[2] - deck[2]) * u;
        yaw = ship.pose.yaw + angleDelta(ship.pose.yaw, quayYaw) * u;
        pitch = -1.3 * u;
      }
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
      ship.plank.setMatrix([cy, 0, -sy, 0, sy * sp, cp, cy * sp, 0, sy * cp, -sp, cy * cp, 0, x, y, z, 1]);
    }
    if (ship.lines.length === 2 && alongside) {
      const rig = rigOf(ship.kind, ship.look);
      const b = ship.berth;
      const ends = [rig.hull.z(0.92, 0.5), rig.hull.z(0.08, 0.5)];
      ends.forEach((zl, i) => {
        const y = rig.hull.rail(rig.hull.t(zl));
        const from = transform(ship.m, [side * rig.hull.outer(rig.hull.t(zl), y), y, zl]);
        const fd = (from[0] - b.face.ax) * b.face.ox + (from[2] - b.face.az) * b.face.oz;
        const ax = Math.sin(ship.pose.yaw) * (i === 0 ? 0.9 : -0.9), az = Math.cos(ship.pose.yaw) * (i === 0 ? 0.9 : -0.9);
        const to: Vec3 = [from[0] - b.face.ox * (fd + 0.25) + ax, b.level * CELL_H + 0.08, from[2] - b.face.oz * (fd + 0.25) + az];
        ship.lines[i]!.setMatrix(lineMatrix(from, to));
      });
    }

    // ── the hull: swell on twos, heel, bank; everything placed every frame ──
    const now = onTwos(signals.time.seconds, ship.phaseSeed);
    if (now !== ship.drawn) {
      const step = Number.isNaN(ship.drawn) ? 1 / 12 : Math.max(0, now - ship.drawn);
      ship.drawn = now;
      swellAt(now, ship.phaseSeed, len * 0.35, wind.strength, ship.swell);
      body.trim(step, w, SHIPS.sailTime);
      if (rowing) body.stroke = (body.stroke + step * (0.35 + 0.45 * Math.min(1, ship.speed / SHIPS.rowSpeed))) % 1;
      const heel = -SHIPS.heel * Math.min(1, wind.strength) * body.canvas * w.lee;
      ship.heel += (heel - ship.heel) * Math.min(1, step * 1.5);
    }
    const turn = dt > 0 ? angleDelta(before.yaw, ship.pose.yaw) / dt : 0;
    ship.bank += (Math.max(-0.05, Math.min(0.05, -turn * 0.2)) - ship.bank) * Math.min(1, dt * 2);
    const sw = ship.swell;
    const calm = alongside ? 0.35 : 0.6;
    fly(ship.pose.x, SEA_Y + sw.heave * calm, ship.pose.z, ship.pose.yaw, sw.pitch * calm * 0.6, sw.roll * calm * 0.6 + ship.heel + ship.bank, 1, ship.m);
    // Near the edge of the map it is cut off at it (and its cut face filled).
    const reach = Math.max(mapEdge(ship.pose.x + sin * (ship.hull.bow + 1.5), ship.pose.z + cos * (ship.hull.bow + 1.5)), mapEdge(ship.pose.x + sin * ship.hull.stern, ship.pose.z + cos * ship.hull.stern));
    body.setCut(reach > -2.5);
    body.pose(ship.m, Math.atan2(wind.dirX, wind.dirZ));
    // L38-F: its tug, and smoke from its funnel.
    if (ship.tug) ship.tug.update(dt, ship, signals);
    const funnel = body.rig.funnel;
    if (funnel && ship.smoke !== undefined) {
      ship.smoke -= dt * (ship.phase === 'moored' ? 0.5 : 1);
      if (ship.smoke <= 0 && mapEdge(ship.pose.x, ship.pose.z) < -2) {
        ship.smoke = PORT.smokeEvery;
        const [fx, fy, fz] = transform(ship.m, funnel);
        steamerSmoke(stage, fx, fy, fz, 0.22, wind, ship.visits + ship.t);
      }
    }

    // ── the water: a wake astern and a bow wave under way, rings alongside ──
    const moved = Math.hypot(ship.pose.x - before.x, ship.pose.z - before.z);
    ship.wake += moved;
    ship.bowWave += moved;
    if (ship.wake > 1.1) {
      ship.wake = 0;
      wakeRing(stage, ship.pose.x + sin * ship.hull.stern, ship.pose.z + cos * ship.hull.stern, ship.hull.halfBeam * 0.55, 2.8, 2.6);
    }
    if (ship.bowWave > 0.55 && ship.speed > 0.25) {
      ship.bowWave = 0;
      const bx = ship.pose.x + sin * (ship.hull.bow - 0.9), bz = ship.pose.z + cos * (ship.hull.bow - 0.9);
      hullRing(stage, bx, bz, ship.pose.yaw, ship.hull.halfBeam * 1.1, 1.1, 1.7, 1.1);
    }
    if (alongside || ship.phase === 'stranded') {
      ship.ring += dt;
      if (ship.ring > 3.4) {
        ship.ring = 0;
        const mid = (ship.hull.stern + ship.hull.bow) / 2;
        hullRing(stage, ship.pose.x + sin * mid, ship.pose.z + cos * mid, ship.pose.yaw, ship.hull.halfBeam * 2, len, 1.15, 2.4);
      }
    }
  };

  const stepPasser = (p: Passer, dt: number, signals: Signals): void => {
    if (p.phase === 'idle') {
      p.due -= dt * (p.often ? SHIPS.passLighthouse : 1);
      return;
    }
    if (p.phase === 'sinking') {
      // Broken out at sea: down where it is, under, and gone; the next comes in its time.
      p.sinkT = (p.sinkT ?? 0) + dt;
      const k = Math.min(1, p.sinkT / SINK_TIME);
      const m = p.m;
      fly(m[12]!, SEA_Y - 4.2 * k * k, m[14]!, Math.atan2(p.to[0] - p.from[0], p.to[1] - p.from[1]), 0.08 + Math.min(0.42, p.sinkT * 0.05), Math.min(0.7, p.sinkT * 0.1), 1, p.m);
      p.body?.pose(p.m, 0);
      if (k >= 1) {
        p.body?.release();
        p.body = null;
        p.phase = 'idle';
        p.sinkT = 0;
        p.due = SHIPS.passGapMin + (SHIPS.passGapMax - SHIPS.passGapMin) * rand(seed, 'pass-gap', p.id, Math.floor(signals.time.seconds));
      }
      return;
    }
    const [x0, z0] = p.from, [x1, z1] = p.to;
    const len = Math.hypot(x1 - x0, z1 - z0);
    // It slows for a small boat under its bow (the boat stands aside: news.ts giveWay).
    const hx = (x1 - x0) / len, hz = (z1 - z0) / len;
    const ahead = clearAhead({ x: x0 + hx * p.s, z: z0 + hz * p.s, yaw: Math.atan2(hx, hz), stern: -2.85, bow: 3.55, halfBeam: 0.75, speed: SHIPS.passSpeed }, small);
    p.s = Math.min(len, p.s + SHIPS.passSpeed * dt * ahead);
    const x = x0 + ((x1 - x0) * p.s) / len, z = z0 + ((z1 - z0) * p.s) / len, yaw = Math.atan2(x1 - x0, z1 - z0);
    if (p.s >= len) {
      // Out through the far side of the map: all of it is beyond the edge now.
      p.body?.release();
      p.body = null;
      p.phase = 'idle';
      p.due = SHIPS.passGapMin + (SHIPS.passGapMax - SHIPS.passGapMin) * rand(seed, 'pass-gap', p.id, Math.floor(signals.time.seconds));
      return;
    }
    const wind = signals.wind(x, z);
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    const w: ShipWind = { lee: wind.dirX * cs - wind.dirZ * sn, along: wind.dirX * sn + wind.dirZ * cs, strength: wind.strength };
    const now = onTwos(signals.time.seconds, p.phaseSeed);
    if (now !== p.drawn) {
      p.drawn = now;
      swellAt(now, p.phaseSeed, 2, wind.strength, p.swell);
      p.body!.trim(1 / 12, w, SHIPS.sailTime);
    }
    const heel = -SHIPS.heel * Math.min(1, wind.strength) * w.lee;
    fly(x, SEA_Y + p.swell.heave * 0.5, z, yaw, p.swell.pitch * 0.3, p.swell.roll * 0.3 + heel, 1, p.m);
    p.body!.setCut(true);
    p.body!.pose(p.m, Math.atan2(wind.dirX, wind.dirZ));
    p.wake += SHIPS.passSpeed * dt;
    if (p.wake > 1.2) {
      p.wake = 0;
      wakeRing(stage, x - sn * 2.4, z - cs * 2.4, 0.4, 2.6, 2.4);
    }
    news.ships.push({ x, z, yaw, stern: -2.85, bow: 3.55, halfBeam: 0.75, speed: SHIPS.passSpeed });
  };

  /** Goods whose quay has gone: the removal puff (the pieces they stood on went the same way). */
  const checkPiles = (s: ShapePlan): void => {
    for (const pile of piles.values()) {
      pile.items.forEach((it, i) => {
        if (!it) return;
        const sp = pile.spots[i]!;
        const below = key(Math.floor(sp.x), Math.max(0, Math.round(sp.y / CELL_H) - 1), Math.floor(sp.z));
        const k = s.kinds.get(below);
        if (k === 'dock' || k === 'marble') return;
        removalPuff(stage, seed, sp.x, sp.y + 0.12, sp.z, 0.5, i + keyY(below));
        it.release();
        pile.items[i] = null;
      });
    }
  };

  const harbour: Harbour = {
    ships,
    passers,
    barges,
    piles,
    setPile(k, pile) {
      if (pile) piles.set(k, pile);
      else piles.delete(k);
    },
    strike,
    clearWrecks() {
      for (const ship of ships) if (ship.phase === 'sinking') finish(ship);
    },
    sync(nextShape, _dressing, calls) {
      const changed = nextShape !== shape;
      shape = nextShape;
      if (changed) fields.clear();
      const berths = findBerths(nextShape.facts);
      const seen = new Set<string>();
      for (const c of calls) {
        const p = c.call.params ?? {};
        if (c.call.variant === 'passing') {
          seen.add(c.id);
          let ps = passers.find((q) => q.id === c.id);
          const look = Math.abs(Math.round(p.look ?? 0));
          if (!ps) {
            ps = { id: c.id, kind: look % 3 === 0 ? 'cog' : 'galleon', look, from: [p.x ?? 0, p.z ?? 0], to: [p.x2 ?? 0, p.z2 ?? 0], often: (p.often ?? 0) > 0, orphan: false, phase: 'idle', due: SHIPS.passGapMin * 0.4, s: 0, body: null, swell: { heave: 0, roll: 0, pitch: 0 }, phaseSeed: rand(seed, 'pass-phase', c.id), drawn: NaN, wake: 0, m: new Array<number>(16).fill(0) };
            passers.push(ps);
          } else if (ps.phase === 'idle') {
            ps.from = [p.x ?? 0, p.z ?? 0];
            ps.to = [p.x2 ?? 0, p.z2 ?? 0];
          }
          ps.often = (p.often ?? 0) > 0;
          ps.orphan = false;
          continue;
        }
        if (c.kind === 'barge') {
          seen.add(c.id);
          const a: [number, number] = [p.x ?? 0, p.z ?? 0], b: [number, number] = [p.x2 ?? 0, p.z2 ?? 0];
          let bg = barges.find((q) => q.id === c.id && !q.leaving);
          if (bg && (bg.a[0] !== a[0] || bg.a[1] !== a[1] || bg.b[0] !== b[0] || bg.b[1] !== b[1])) {
            // A new run: this barge finishes by leaving, and a fresh one comes for the new run.
            bg.leave(nextShape);
            bg = undefined;
          }
          if (!bg) {
            bg = new Barge(stage, seed, c.id, Math.abs(Math.round(p.look ?? 0)), a, b, opened);
            barges.push(bg);
            bg.sync(nextShape);
          } else if (changed) bg.sync(nextShape);
          continue;
        }
        seen.add(c.id);
        const berth = berthOfCall(c.call, berths);
        const dir = (p.dir ?? 1) < 0 ? -1 : 1;
        const hull = hullSize(c.kind as 'galleon');
        let ship = ships.find((s) => s.id === c.id);
        if (!berth) {
          if (ship) ship.orphan = true;
          continue;
        }
        if (!ship) {
          ship = {
            id: c.id, kind: c.kind, look: Math.abs(Math.round(p.look ?? 0)), hull, berth, dir,
            mooring: mooringAt(hull, berth.face, dir, SHIPS.alongside, SHIPS.warpGap),
            orphan: false, phase: 'idle', t: 0, t2: 0, visits: 0, voyage: null, outbound: null, s: 0, speed: 0,
            pose: { x: 0, z: 0, yaw: 0 }, from: { x: 0, z: 0, yaw: 0 }, to: { x: 0, z: 0, yaw: 0 }, cameFrom: -1,
            body: null, crew: null, plank: null, plankLen: 1, plankK: 0, lines: [], escort: null,
            heel: 0, bank: 0, swell: { heave: 0, roll: 0, pitch: 0 }, phaseSeed: rand(seed, 'ship-phase', c.id), drawn: NaN, wake: 0, bowWave: 0, ring: 0,
            m: new Array<number>(16).fill(0),
          };
          ships.push(ship);
        } else if (ship.berth.key !== berth.key || ship.dir !== dir) {
          if (ship.phase === 'idle') {
            ship.berth = berth;
            ship.dir = dir;
            ship.mooring = mooringAt(hull, berth.face, dir, SHIPS.alongside, SHIPS.warpGap);
          } else ship.orphan = true;
        } else ship.orphan = false;
      }
      for (const s of ships) if (!seen.has(s.id)) s.orphan = true;
      for (const p of passers) if (!seen.has(p.id)) p.orphan = true;
      for (const bg of barges) if (!seen.has(bg.id) && !bg.leaving) bg.leave(nextShape);
      // The berths with ships, longest first; each has its turn.
      const live = [...new Set(ships.filter((s) => !s.orphan).sort((a, b) => b.berth.cells - a.berth.cells || (a.berth.key < b.berth.key ? -1 : 1)).map((s) => s.berth.key))];
      // New berths come in turn, staggered: the first within SHIPS.firstCall, the rest every SHIPS.callEvery or so.
      let fresh = 0;
      for (const k of live) {
        if (turns.has(k)) continue;
        turns.set(k, { due: SHIPS.firstCall + fresh * SHIPS.callEvery * (0.75 + 0.5 * rand(seed, 'first', k)), visits: 0 });
        fresh++;
      }
      order = live;
      // A town opened with a port: the biggest ship that fits the longest berth is already in.
      const first = !opened;
      opened = true;
      if (first && live.length) {
        // A town opened with a harbour: every other berth already has a ship in, at staggered points of its stay.
        const n = Math.min(live.length, phone() ? Math.round(SHIPS.shipsPhone) : Math.round(SHIPS.shipsMax));
        for (let i = 0; i < n; i += 2) {
          const fits = ships.filter((s) => s.berth.key === live[i] && !s.orphan);
          const lead = fits[(i / 2) % Math.max(1, fits.length)] ?? fits[0];
          if (!lead || lead.phase !== 'idle') continue;
          moorNow(lead, STAY[lead.kind]() * (0.1 + 0.7 * (i / Math.max(1, n))));
          turns.get(live[i]!)!.due = STAY[lead.kind]() + 30;
        }
      }
      if (!changed) return;
      checkPiles(nextShape);
      // ── the town changed: check every ship under it ──
      for (const ship of ships) {
        if (ship.phase === 'idle' || !ship.body) continue;
        const field = fieldFor(ship);
        if (!hullClear(field, ship.hull, ship.pose.x, ship.pose.z, ship.pose.yaw, -0.05) && ship.phase !== 'nudging') {
          nudge(ship, field);
          continue;
        }
        const v = ship.voyage;
        // In the Hand, or set down on the land by it: left be (handled() puts it back in traffic).
        if (ship.lifted || ship.aground !== undefined) continue;
        switch (ship.phase) {
          case 'arriving':
            if (ship.orphan) leaveFromHere(ship);
            else if (v && !pathClear(field, ship.hull, v.path, NEAR, ship.s, v.path.length)) {
              const again = planArrival(field, ship.hull, ship.mooring, SHIPS.edgeIn, SEA_MARGIN, 0, -1, ship.pose);
              if (again) {
                ship.voyage = again;
                ship.s = 0;
              } else leaveFromHere(ship);
            }
            break;
          case 'leaving':
            if (v && !pathClear(field, ship.hull, v.path, NEAR, ship.s, v.path.length)) leaveFromHere(ship);
            break;
          case 'swing-in':
          case 'warp-in':
            if (ship.orphan) leaveFromHere(ship);
            break;
          case 'swing-out':
            if (v && !pathClear(field, ship.hull, v.path, NEAR, 0, v.path.length)) leaveFromHere(ship);
            break;
          case 'warp-out':
            if (v && !pathClear(field, ship.hull, v.path, NEAR, 0, v.path.length)) ship.voyage = null;
            break;
          case 'stranded':
            if (!ship.orphan && ship.berth && berths.some((b) => b.key === ship.berth.key)) {
              // Its berth is still there: back alongside if it can get there, else away.
              const back = planArrival(field, ship.hull, ship.mooring, SHIPS.edgeIn, 0.05, 0, -1, ship.pose);
              if (back) {
                ship.voyage = back;
                ship.s = 0;
                setPhase(ship, 'arriving');
                break;
              }
            }
            leaveFromHere(ship);
            break;
          default:
        }
      }
    },
    update(dt, signals) {
      news.tick++;
      small = floatPoints(stage);
      daylight = signals.time.isNight || signals.time.isDusk ? 0 : daylight + dt;
      news.ships.length = 0;
      news.zones.length = 0;
      news.inPort.clear();
      // A tall ship far out goes by when no ship is coming in or going out near its line.
      const pass = passers.find((p) => p.phase === 'idle' && !p.orphan && p.due <= 0);
      if (pass && !ships.some((o) => underWay(o) && corridorsMeet(corridor(o.hull, o.voyage!, o.s), passCorridor(pass)))) {
        pass.phase = 'crossing';
        pass.s = 0;
        pass.body = new ShipBody(stage, pass.kind, pass.look, HIDDEN, 1);
      }
      // Each berth's turn. When it is due and free, a ship that fits comes for it, unless a ship ready to leave
      // is waiting (leaving ships go first) or the way in crosses a ship under way (then it waits beyond the edge).
      const served = phone() ? Math.round(SHIPS.shipsPhone) : Math.round(SHIPS.shipsMax);
      let started = 0;
      for (const [k, turn] of turns) {
        turn.due -= dt;
        const i = order.indexOf(k);
        if (i < 0 || i >= served || turn.due > 0 || started > 0 || berthBusy(k) || !shape) continue;
        // L38-F: at most so many cargo ships in town at once (one on a phone).
        const freighters = ships.filter((s) => s.kind === 'freighter' && s.phase !== 'idle').length;
        const fits = ships.filter((s) => s.berth.key === k && !s.orphan && s.phase === 'idle' && (s.kind !== 'freighter' || freighters < Math.round(phone() ? PORT.freightersPhone : PORT.freightersMax)));
        if (!fits.length) continue;
        // A smooth weighted rotation over the whole harbour: each time, every ship that fits gains its weight,
        // the one with the most comes and pays the total back. The biggest comes most often; the others take
        // their turns, so a long quay shows galleons, galleys and cogs together.
        let total = 0;
        for (const s of fits) {
          total += WEIGHT[s.kind]();
          credit.set(s.kind, (credit.get(s.kind) ?? 0) + WEIGHT[s.kind]());
        }
        const chosen = [...fits].sort((a, b) => (credit.get(b.kind) ?? 0) - (credit.get(a.kind) ?? 0) || SIZE[a.kind] - SIZE[b.kind])[0]!;
        if (begin(chosen)) {
          credit.set(chosen.kind, (credit.get(chosen.kind) ?? 0) - total);
          turn.visits++;
          started++;
        } else {
          for (const s of fits) credit.set(s.kind, (credit.get(s.kind) ?? 0) - WEIGHT[s.kind]());
          turn.due = 2 + 3 * rand(seed, 'wait', k, turn.visits, Math.floor(turn.due * 10));
        }
      }
      for (const ship of ships) {
        stepShip(ship, dt, signals);
        if (ship.body && ship.phase !== 'idle') {
          news.ships.push({ x: ship.pose.x, z: ship.pose.z, yaw: ship.pose.yaw, stern: ship.hull.stern, bow: ship.hull.bow, halfBeam: ship.hull.halfBeam, speed: ship.phase === 'arriving' || ship.phase === 'leaving' ? ship.speed : 0 });
          // The stretch of quay it takes: small boats moored there row aside (rowboat.behaviour.ts).
          // From well before it comes in (they have time to row clear) until it has sailed clear of the quay.
          const near = Math.hypot(ship.pose.x - ship.mooring.x, ship.pose.z - ship.mooring.z) < ship.hull.bow - ship.hull.stern + 2;
          if (ship.phase !== 'stranded' && ship.phase !== 'nudging' && !(ship.phase === 'arriving' && ship.voyage!.path.length - ship.s > 30 && !near) && !(ship.phase === 'leaving' && !near)) {
            news.zones.push({ x: ship.mooring.x, z: ship.mooring.z, yaw: ship.mooring.yaw, stern: ship.hull.stern - 0.6, bow: ship.hull.bow + 0.6, halfBeam: ship.hull.halfBeam + SHIPS.warpGap + 0.5, speed: 0 });
          }
        }
        if (ship.phase === 'warp-in' || ship.phase === 'moored' || ship.phase === 'warp-out') news.inPort.add(ship.id);
        if (ship.escort && ship.body) {
          const rig = rigOf(ship.kind, ship.look);
          const top = rig.masts[Math.min(1, rig.masts.length - 1)]!;
          ship.escort.update(dt, signals, true, transform(ship.m, [0, top.head + 0.3, top.z]), ship.phase === 'moored' ? 1.6 : 2.2);
        }
      }
      for (let i = ships.length - 1; i >= 0; i--) {
        const s = ships[i]!;
        if (s.orphan && s.phase === 'idle') ships.splice(i, 1);
      }
      for (const k of [...turns.keys()]) if (!ships.some((s) => s.berth.key === k)) turns.delete(k);
      for (const p of passers) stepPasser(p, dt, signals);
      for (let i = passers.length - 1; i >= 0; i--) {
        const p = passers[i]!;
        if (p.orphan && p.phase === 'idle') passers.splice(i, 1);
      }
      for (let i = barges.length - 1; i >= 0; i--) {
        const bg = barges[i]!;
        const n = bg.update(dt, signals);
        if (n) news.ships.push(n);
        if (bg.gone) {
          bg.release();
          barges.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const s of ships) {
        s.body?.release();
        s.crew?.release();
        s.plank?.release();
        for (const l of s.lines) l.release();
        s.escort?.release();
        s.tug?.release();
      }
      ships.length = 0;
      for (const p of passers) p.body?.release();
      passers.length = 0;
      for (const bg of barges) bg.release();
      barges.length = 0;
      for (const pile of piles.values()) for (const it of pile.items) it?.release();
      piles.clear();
      news.ships.length = 0;
      news.zones.length = 0;
      news.inPort.clear();
    },
  };
  harbours.set(stage, harbour);
  return harbour;
}

function transform(m: Mat4, p: Vec3): Vec3 {
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
}

/** A matrix taking the unit line (0,0,0)–(0,0,1) to run from a to b. */
function lineMatrix(a: Vec3, b: Vec3): Mat4 {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const zx = dx / len, zy = dy / len, zz = dz / len;
  let xx = zz, xz = -zx;
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl;
  xz /= xl;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
  return [xx, 0, xz, 0, yx, yy, yz, 0, zx * len, zy * len, zz * len, 0, a[0], a[1], a[2], 1];
}

