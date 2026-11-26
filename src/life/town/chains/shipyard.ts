// R-D05 · The shipyard (posts from L75.shipyard.rule.ts): a ship built on
// the slipway from the keel up, then launched with the town looking on. The
// big clip moment of the waterfront.
//
//   idle      the slip lies empty a while (SHIPYARD.pause)
//   keel      two shipwrights fetch the keel timber from the shed and carry it
//             between them, one at each end on the shoulder, down the side
//             deck; they lay it on the cradle on the slip
//   frames    the ribs rise one by one along the keel, a bare skeleton; the
//             shipwrights carry timber from the shed and hammer
//   planks    staging goes up round it; the planking climbs strake by strake
//             from the keel to the rail, planks carried up from the shed
//   paint     the deck and the castles go on in bare timber, then the livery
//             one band at a time from the waterline up, then the masts are
//             stepped (sails furled: they are bent on afloat)
//   ready     finished: it waits for daylight and for the town to be free of
//             another big gathering
//   gather    bunting goes up along the slip; the town comes and lines the side
//             decks and the shore; a resident in their finery stands at the
//             bow and breaks a bottle on it (a glint, a splash of glass); the
//             staging comes down and the wedges are knocked out
//   launched  the ship slides down the ways, slowly and then faster, its stern
//             into the sea with a great splash and a wave; it rights itself,
//             everybody cheers (hats in the air, confetti over their heads);
//             it is towed clear and turned, its sails drop, and it sails out
//             over the edge of the map (ship-routes.ts) while the crowd waves.
//             No way out (shut in by land): it stays afloat off the slip's end
//             and the yard lays no new keel until it has gone
//
// About five minutes of building (SHIPYARD.keel + frames + planks + paint);
// building stops at night and the hands go home. One yard builds at a time on
// a phone, two on a desktop.
//
// NOTHING VANISHES. Erased mid-build (or turned into something else), the
// half-built hull is taken apart a piece at a time with a puff each, and the
// shipwrights carry planks off home. A blast near it (a bomb, the nuke, a
// lightning strike on the dock) brings it down the same way in a few seconds,
// in smoke; when the town has its shipyard again it starts from the keel.
// A ship already launched is the sea's: it sails on whatever happens to the
// yard.
//
// Pure of the clock: time is the board's, chance rand(board.seed, …).

import { phrase } from '@/core/phrase';
import { CELL_H, DIR4, key, keyX, keyY, keyZ, SEA_Y, turn, type CellKey, type Dir4 } from '@/core/grid';
import type { Mat4 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { buildSteps, cradleFoot, stageMesh, type YardKind } from '@/parts/actors/ships/build-stages';
import { hatMesh } from '@/parts/people/beach';
import { slipTop } from '@/parts/ground/slipway.part';
import { rigOf } from '@/parts/actors/ships/rig';
import { hullSize, SEA_MARGIN } from '@/rules/life/berths.fact';
import { hullClear, obstacleColumns, pathAt, pivot, planDeparture, seaField, mapEdge, type HullSize, type Pose, type Voyage } from '@/rules/life/ship-routes';
import { PERSON } from '@/style/people';
import { SHIPS } from '@/style/ships';
import { SHIPYARD } from '@/style/shipyard';
import type { InstanceHandle, TimeSignal } from '../../api';
import { hullRing, swellAt, wakeRing, type Swell } from '../../boats/afloat';
import { fxOf } from '../../fx/fx';
import { spoutMesh } from '../../mischief/meshes';
import { mischiefOf } from '../../mischief/director';
import { fly, place } from '../../motion/pose';
import type { Person } from '../../people/crowd';
import { trackAt, trackOf, type Track, type TrackPoint } from '../../people/track';
import { ShipBody } from '../../ships/body';
import type { Board, Chain, Plan, PlanStep, Post } from '../board';
import { canWork, homeCell, reaches, unbusy } from '../hands';
import { scenesOf, type Scene } from '../scenes';
import { createPetals, type Petals } from './petals';
import { beamMesh, bottleMesh, buntingMesh, chipMesh, stagingMesh } from './shipyard-art';

export type YardPhase = 'idle' | 'keel' | 'frames' | 'planks' | 'paint' | 'ready' | 'gather' | 'launched';
export type FloatPhase = 'slide' | 'afloat' | 'tow' | 'swing' | 'sail' | 'moored' | 'gone';

/** The order the building phases come in, and how long each takes. */
export const BUILD_PHASES = ['keel', 'frames', 'planks', 'paint'] as const;
export function phaseSeconds(p: (typeof BUILD_PHASES)[number]): number {
  return p === 'keel' ? SHIPYARD.keel : p === 'frames' ? SHIPYARD.frames : p === 'planks' ? SHIPYARD.planks : SHIPYARD.paint;
}

/** Where a yard is: its slip in the world. */
export interface YardGeo {
  /** The middle of the slip's land end (world x, z), the way out to sea, and the place() heading of that way. */
  ox: number;
  oz: number;
  sx: number;
  sz: number;
  yaw: number;
  /** The slip's length in cells, and the deck cells (level 1) of the slip and of the side decks, from the land end. */
  n: number;
  slip: CellKey[];
  left: CellKey[];
  right: CellKey[];
  /** The land cell in front of the slip's head. */
  head: CellKey;
}

export interface Yard {
  readonly key: number;
  readonly dock: number;
  readonly kind: YardKind;
  readonly geo: YardGeo;
  shed: Post | null;
  phase: YardPhase;
  /** Seconds in this phase (building phases count only while work goes on). */
  t: number;
  /** Ships launched from it so far. */
  built: number;
  look: number;
  /** The build step shown (buildSteps index), −1 for nothing. */
  step: number;
  hull: InstanceHandle | null;
  staging: InstanceHandle | null;
  bunting: InstanceHandle | null;
  hands: Person[];
  watchers: Person[];
  sponsor: Person | null;
  /** The keel timber on its way: its carriers, its track, how far along; laid: seconds into laying it (−1 not yet). */
  beam: { h: InstanceHandle | null; carriers: Person[]; track: Track | null; s: number; laid: number; from: Mat4 | null } | null;
  /** Coming down: erased (planks carried off) or knocked down (smoke). Seconds to the next piece. */
  tear: { next: number; smoke: boolean } | null;
  /** The yard's post is gone: it is only finishing its teardown. */
  dead: boolean;
  scene: Scene | null;
  bottle: { h: InstanceHandle | null; t: number } | null;
  hats: { h: InstanceHandle; x: number; y: number; z: number; t: number; spin: number }[];
  chips: { h: InstanceHandle; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }[];
  /** Seconds to the next chip, the next look for trouble, the next handful of confetti. */
  chipAt: number;
  checkAt: number;
  confettiAt: number;
  /** Seconds waited for a free town in `ready`; seconds into the launch's countdown (−1 before it). */
  waited: number;
  go: number;
}

/** A ship launched: the sea's now, whatever happens to its yard. */
export interface Launched {
  readonly yard: number;
  readonly kind: YardKind;
  readonly look: number;
  phase: FloatPhase;
  t: number;
  geo: YardGeo;
  /** On the slip: the drawing it was built in (with its cradle); afloat: the ship itself. */
  hull: InstanceHandle | null;
  body: ShipBody | null;
  /** Slid so far down the ways, and how fast. */
  s: number;
  v: number;
  /** Afloat: where, and the voyage out. */
  pose: Pose;
  from: Pose;
  /** The way out: towed stern first `tow` out to sea, turned by `turn` about a point `about` along it, then the path. */
  voyage: { path: Voyage['path']; tow: number; turn: number; about: number } | null;
  size: HullSize;
  speed: number;
  swell: Swell;
  m: Mat4;
  splashed: number;
  wake: number;
  retry: number;
  /** Where it was as it came off the ways (origin's height, pitch, distance along the slip). */
  tip?: { y: number; th: number; u: number };
}

export interface ShipyardChain extends Chain {
  readonly yards: readonly Yard[];
  readonly fleet: readonly Launched[];
  /** Ships launched in this town so far. */
  readonly launched: number;
  /** Starts the next phase of every yard now (fixtures, the guide's picture). */
  hurry(board: Board, phase: YardPhase): void;
}

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
/** The light, steady air the launch's confetti and a new ship's first sails go on. */
const AIR = { dirX: 0.55, dirZ: 0.83, strength: 0.45 };
const SPOUT_KEEP = 0.95;

/** True on a phone-sized viewport (the crowd's test, src/life/people/people.system.ts). */
function phone(): boolean {
  const w = typeof window !== 'undefined' ? window.innerWidth : undefined;
  const h = typeof window !== 'undefined' ? window.innerHeight : undefined;
  return typeof w === 'number' && typeof h === 'number' && Math.min(w, h) < 600;
}

/** The ships launched on each stage, for the small boats to give way to (shipyard-news.system.ts). */
const fleets = new WeakMap<object, Launched[]>();
export function launchedOn(stage: object): readonly Launched[] {
  return fleets.get(stage) ?? [];
}

/** The slip's geometry from its post. */
export function geoOf(post: Post, n: number): YardGeo {
  const sea = (post.dir ?? 2) as Dir4;
  const [sx, sz] = DIR4[sea]!;
  const [lx, lz] = DIR4[turn(sea, 3)]!;
  const x0 = keyX(post.cell), z0 = keyZ(post.cell);
  const at = (i: number, side: number): CellKey => key(x0 + sx * i + lx * side, 1, z0 + sz * i + lz * side);
  const slip: CellKey[] = [], left: CellKey[] = [], right: CellKey[] = [];
  for (let i = 0; i < n; i++) {
    slip.push(at(i, 0));
    left.push(at(i, 1));
    right.push(at(i, -1));
  }
  return { ox: x0 + 0.5 - sx * 0.5, oz: z0 + 0.5 - sz * 0.5, sx, sz, yaw: Math.atan2(sx, sz), n, slip, left, right, head: at(-1, 0) };
}

/** A point in the slip's frame (x across: + to the left looking out to sea; u along it from its land end) in the world. */
export function onSlip(g: YardGeo, x: number, u: number): { x: number; z: number } {
  const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
  return { x: g.ox + x * c + u * s, z: g.oz - x * s + u * c };
}

/** Where a hull of this kind sits on the slip at rest: its origin's distance along the slip, and its ends' extents (from the origin). */
export function hullOnSlip(kind: YardKind): { u0: number; fwd: number; aft: number } {
  const h = rigOf(kind, 0).hull;
  const fwd = h.z(1, -h.keel(1));
  const aft = -h.z(0, -h.keel(0));
  return { u0: 0.34 + fwd, fwd, aft };
}

/** The pose of a hull whose origin is `u` along the slip, sitting on the ways. */
export function slipPose(g: YardGeo, kind: YardKind, u: number, out: Mat4): Mat4 {
  const th = Math.atan((SHIPYARD.wayHead - SHIPYARD.wayFoot) / g.n);
  const y = slipTop(Math.min(u, g.n), g.n) - cradleFoot(kind) * Math.cos(th);
  const p = onSlip(g, 0, u);
  return fly(p.x, y, p.z, g.yaw + Math.PI, th, 0, 1, out);
}

/** Seconds a launched ship spends getting from the slip to afloat, at most (tests). */
export const SLIDE_MOST = 30;

export function shipyardChain(): ShipyardChain {
  const yards: Yard[] = [];
  let fleet: Launched[] = [];
  let launched = 0;
  let petals: Petals | null = null;
  const spouts: { h: InstanceHandle; age: number; w: number; m: Mat4 }[] = [];
  const pt: TrackPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, node: 0 };
  const pt2: TrackPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, node: 0 };
  /** Set while this chain itself hands somebody a new plan (their old plan's `fail` then does nothing). */
  let reassigning = false;

  const petalsOf = (board: Board): Petals => (petals ??= createPetals(board.stage));

  const puff = (board: Board, x: number, y: number, z: number, size = 1, smoke = false): void => {
    if (!board.stage) return;
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + x;
      fxOf(board.stage).play(smoke ? SMOKE : DUST, smoke ? 1.1 : 0.55, (k, m) => place(x + Math.cos(a) * 0.22 * size, y + 0.05 + k * 0.2 * size, z + Math.sin(a) * 0.22 * size, 0, (0.35 + k * 0.55) * size, (0.35 + k * 0.55) * size, (0.35 + k * 0.55) * size, m), { delay: i * 0.06 });
    }
  };

  const splash = (board: Board, x: number, z: number, w: number): void => {
    if (!board.stage) return;
    const m: Mat4 = [w, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, w, 0, x, SEA_Y - 0.02, z, 1];
    spouts.push({ h: board.stage.spawnMesh(spoutMesh(), m), age: 0, w, m: [...m] });
  };

  const show = (board: Board, y: Yard, step: number): void => {
    if (step === y.step) return;
    y.step = step;
    y.hull?.release();
    y.hull = null;
    if (!board.stage || step < 0) return;
    const m: Mat4 = new Array<number>(16).fill(0);
    slipPose(y.geo, y.kind, hullOnSlip(y.kind).u0, m);
    y.hull = board.stage.spawnMesh(stageMesh(y.kind, y.look, step), m);
  };

  /** Where on the hull to puff, in the world: along it at `k` (0 bow, 1 stern), at deck height. */
  const onHull = (y: Yard, k: number, up = 0.5): { x: number; y: number; z: number } => {
    const h = hullOnSlip(y.kind);
    const u = h.u0 - h.fwd + (h.fwd + h.aft) * k;
    const p = onSlip(y.geo, 0, u);
    return { x: p.x, y: slipTop(u, y.geo.n) + up, z: p.z };
  };

  // ── steps per phase ─────────────────────────────────────────────────────
  const steps = (y: Yard): { from: number; count: number } => {
    const all = buildSteps(y.kind);
    const first = (name: string): number => all.findIndex((s) => s.name === name);
    switch (y.phase) {
      case 'frames':
        return { from: first('ribs'), count: all.filter((s) => s.name === 'ribs').length };
      case 'planks':
        return { from: first('planks'), count: all.filter((s) => s.name === 'planks').length };
      case 'paint':
        return { from: first('deck'), count: all.length - first('deck') };
      default:
        return { from: 0, count: 0 };
    }
  };

  const setPhase = (board: Board, y: Yard, p: YardPhase): void => {
    y.phase = p;
    y.t = 0;
    y.go = -1;
    if (p === 'keel') {
      y.look = Math.floor(rand(board.seed, 'yard-look', y.key, y.built) * 1000);
      show(board, y, 0);
      const c = onHull(y, 0.5, 0);
      puff(board, c.x, c.y, c.z, 1.2);
    }
    if (p === 'planks' && board.stage && !y.staging) {
      const h = hullOnSlip(y.kind);
      const rig = rigOf(y.kind, 0);
      const top = slipTop(h.u0, y.geo.n) + rig.spec.draft + rig.spec.rail(0.5) * 0.85;
      y.staging = board.stage.spawnMesh(stagingMesh({ u0: h.u0 - h.fwd + 0.2, u1: h.u0 + h.aft - 0.2, half: rig.halfBeam, walk: top - 0.42, top }), place(y.geo.ox, 0, y.geo.oz, y.geo.yaw));
      for (const k of [0.2, 0.5, 0.8]) {
        const c = onHull(y, k, 0);
        puff(board, c.x, c.y, c.z, 0.9);
      }
    }
  };

  // ── who ─────────────────────────────────────────────────────────────────
  const building = (y: Yard): boolean => y.phase === 'keel' || y.phase === 'frames' || y.phase === 'planks' || y.phase === 'paint';

  const pickHands = (board: Board, y: Yard): void => {
    const want = phone() ? Math.round(SHIPYARD.handsPhone) : Math.round(SHIPYARD.hands);
    y.hands = y.hands.filter((p) => canWork(p) && board.claimedBy(p) === chain && p.mode !== 'gone');
    if (y.hands.length >= want) return;
    const near = y.geo.left[0]!;
    const free = board.crowd.people
      .filter((p) => canWork(p) && unbusy(board, p) && !p.load && homeCell(board, p) !== null && reaches(board, p, near))
      .sort((a, b) => board.dist(homeCell(board, a)!, near) - board.dist(homeCell(board, b)!, near) || (a.id < b.id ? -1 : 1));
    for (const p of free) {
      if (y.hands.length >= want) break;
      if (board.dist(homeCell(board, p)!, near) > 40) break;
      board.claim(p, chain);
      y.hands.push(p);
    }
  };

  /** Lets people go from where they stand: on home (the rest of their plan) or, `drop`ping it, on with their day. */
  const letGo = (board: Board, people: Person[], drop = false): void => {
    for (const p of people) {
      if (board.plans.get(p)?.chain === chain) {
        p.timer = Math.min(p.timer, 0.4 + rand(p.seed, 'yard-go', Math.floor(board.now)) * 1.5);
        const plan = board.plans.get(p)!;
        if (drop) plan.steps.length = plan.at;
      }
      if (board.claimedBy(p) === chain) board.unclaim(p);
      p.party = false;
    }
  };

  /** A deck cell beside the hull to work at: on side `side` (1 left, −1 right), `i` cells out from the land end. */
  const workSpot = (board: Board, y: Yard, i: number, side: number, out: number): { cell: CellKey; spot: { x: number; z: number }; face: number } | null => {
    const col = side > 0 ? y.geo.left : y.geo.right;
    const cell = col[Math.max(0, Math.min(col.length - 1, i))]!;
    if (!board.nav?.nodeAt.has(cell)) return null;
    const p = onSlip(y.geo, side * out, i + 0.5);
    const c = onSlip(y.geo, 0, i + 0.5);
    return { cell, spot: p, face: Math.atan2(c.x - p.x, c.z - p.z) };
  };

  /** The cells along the hull, nearest its middle first. */
  const alongHull = (y: Yard): number[] => {
    const h = hullOnSlip(y.kind);
    const a = Math.max(0, Math.floor(h.u0 - h.fwd)), b = Math.min(y.geo.n - 1, Math.floor(h.u0 + h.aft));
    const mid = (a + b) / 2;
    const out: number[] = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
  };

  const workPlan = (board: Board, y: Yard, p: Person): Plan | null => {
    const idx = y.hands.indexOf(p);
    const n = board.plans.size + Math.floor(board.now);
    const load = y.phase === 'paint' ? 'bucket' : 'plank';
    const cells = alongHull(y);
    const i = cells[(idx * 2 + Math.floor(rand(p.seed, 'yard-at', n) * 3)) % cells.length]!;
    const side = idx % 2 === 0 ? 1 : -1;
    const at = workSpot(board, y, i, side, 0.82) ?? workSpot(board, y, i, -side, 0.82);
    if (!at) return null;
    const out: PlanStep[] = [];
    const fetch = fetchStep(board, y, idx, 1.2 + rand(p.seed, 'yard-in', n), 'shipyard:fetch');
    if (fetch) out.push(fetch);
    out.push(
      board.stepAt(at.cell, { spot: at.spot, face: at.face, pose: 'tend', linger: 0.7, load, tag: 'shipyard:set', done: (q) => void (q.load = null) }),
      board.stepAt(at.cell, { spot: at.spot, face: at.face, pose: y.phase === 'paint' ? 'sweep' : 'hammer', linger: 4 + rand(p.seed, 'yard-work', n) * 4, tag: 'shipyard:work' }),
    );
    return { chain, at: 0, steps: out, fail: (q) => void (q.load = null) };
  };

  // ── the keel timber, carried by two ────────────────────────────────────
  const beamLen = (y: Yard): number => {
    const h = hullOnSlip(y.kind);
    return Math.min(h.fwd + h.aft - 0.3, 3.4);
  };

  /**
   * Taking timber from the shed: at its door, a little to one side, facing it (the timber is handed out at
   * the door, so nobody queues in a doorway). With no shed, at the head of the slip.
   */
  const fetchStep = (board: Board, y: Yard, i: number, linger: number, tag: string, load: 'beam' | null = null): PlanStep | null => {
    const shed = y.shed;
    const side = (i % 2 === 0 ? 1 : -1) * 0.22;
    if (shed && shed.dir !== undefined && board.nav?.nodeAt.has(shed.cell)) {
      const [dx, dz] = DIR4[shed.dir]!;
      const c = board.centre(shed.cell);
      return board.stepAt(shed.cell, { spot: { x: c.x + dx * 0.18 - dz * side, z: c.z + dz * 0.18 + dx * side }, face: Math.atan2(dx, dz), pose: load ? 'stand' : 'tend', linger, load, tag });
    }
    if (!board.nav?.nodeAt.has(y.geo.head)) return null;
    const c = board.centre(y.geo.head);
    return board.stepAt(y.geo.head, { spot: { x: c.x - y.geo.sz * side, z: c.z + y.geo.sx * side }, face: NaN, pose: load ? 'stand' : 'tend', linger, load, tag });
  };

  const beamPlan = (board: Board, y: Yard, p: Person): Plan | null => {
    const i = y.beam?.carriers.indexOf(p) ?? 0;
    const fetch = fetchStep(board, y, i, 1.4, 'shipyard:fetch-beam');
    const wait = fetchStep(board, y, i, 1e6, 'shipyard:beam', 'beam');
    if (!fetch || !wait) return null;
    // (A last step after the wait keeps the plan alive while they wait and carry: it is dropped once the keel is down.)
    return { chain, at: 0, steps: [fetch, wait, after(board, wait.cell)], fail: (q) => void (!reassigning && q.load === 'beam' && (q.load = null)) };
  };

  /** A short step to end a plan with, where it ends: what follows a long wait, so the plan lives through it. */
  const after = (board: Board, cell: CellKey): PlanStep => board.stepAt(cell, { pose: 'stand', linger: 0.3, tag: 'shipyard:after' });

  const beamReady = (board: Board, p: Person): boolean => board.plans.get(p)?.chain === chain && p.mode === 'linger' && (p.goal?.errand?.tag === 'shipyard:beam' || p.goal?.errand?.tag === 'shipyard:beam-end');

  /** The way to carry it: from the shed's door down the side deck nearest it, to beside the keel's sea end. */
  const beamTrack = (board: Board, y: Yard, from: CellKey): Track | null => {
    const nav = board.nav, router = board.crowd.router;
    if (!nav || !router) return null;
    const h = hullOnSlip(y.kind);
    const end = Math.min(y.geo.n - 1, Math.floor(h.u0 + h.aft - 0.4));
    const a = nav.nodeAt.get(from);
    if (a === undefined) return null;
    let best: Track | null = null;
    for (const col of [y.geo.left, y.geo.right]) {
      const b = nav.nodeAt.get(col[end]!);
      if (b === undefined) continue;
      const r = router.find(a, b);
      const t = r ? trackOf(nav, [r], false) : null;
      if (t && (!best || t.length < best.length)) best = t;
    }
    return best;
  };

  /** Puts a carrier at arc length s of the track (held in their linger: this chain moves them). */
  const carry = (board: Board, p: Person, tr: Track, s: number, walked: number): void => {
    trackAt(tr, s, pt);
    const nav = board.nav!;
    // The node of the cell they are in (the track's sample may still name the last one at a cell's edge).
    let node = pt.node;
    const there = nav.nodeAt.get(key(Math.floor(pt.x), keyY(nav.nodes[node]!.cell), Math.floor(pt.z)));
    if (there !== undefined) node = there;
    const cell = nav.nodes[node]!.cell;
    p.node = node;
    p.cell = cell;
    p.x = Math.max(keyX(cell) + 0.005, Math.min(keyX(cell) + 0.995, pt.x));
    p.y = pt.y;
    p.z = Math.max(keyZ(cell) + 0.005, Math.min(keyZ(cell) + 0.995, pt.z));
    p.heading = Math.atan2(pt.dx, pt.dz);
    p.react = null;
    p.lift = 0;
    if (walked > 1e-5) {
      p.pose = 'walk';
      p.stride += walked * PERSON.stepsPerCell * 0.5;
    } else if (p.pose === 'walk') p.pose = 'stand';
  };

  const keelMatrix = (y: Yard, out: Mat4): Mat4 => {
    const h = hullOnSlip(y.kind);
    const u = h.u0 + (h.aft - h.fwd) / 2;
    const th = Math.atan((SHIPYARD.wayHead - SHIPYARD.wayFoot) / y.geo.n);
    const p = onSlip(y.geo, 0, u);
    const top = slipTop(u, y.geo.n) + SHIPYARD.cradle * 0.4;
    return fly(p.x, top, p.z, y.geo.yaw + Math.PI, th, 0, 1, out);
  };

  const stepBeam = (dt: number, board: Board, y: Yard): void => {
    const bm = y.beam;
    if (!bm || y.step >= 1) return;
    const [a, b] = bm.carriers;
    if (bm.laid >= 0) {
      // Laying it: from the shoulders across onto the cradle.
      bm.laid += dt;
      const k = Math.min(1, bm.laid / 1.3);
      const e = k * k * (3 - 2 * k);
      const to = keelMatrix(y, new Array<number>(16).fill(0));
      const from = bm.from ?? to;
      const m = from.map((v, i) => v + (to[i]! - v) * e);
      // An arc: up a little and over.
      m[13] = m[13]! + Math.sin(k * Math.PI) * 0.18;
      bm.h?.setMatrix(m);
      if (k >= 1) {
        bm.h?.release();
        bm.h = null;
        show(board, y, 1);
        const c = onHull(y, 0.5, 0);
        puff(board, c.x, c.y, c.z, 1.3);
        for (const p of bm.carriers) {
          if (p.load === 'beam') p.load = null;
          if (board.plans.get(p)?.chain === chain) {
            const plan = board.plans.get(p)!;
            plan.steps.length = plan.at;
            p.timer = Math.min(p.timer, 0.6);
          }
        }
        y.beam = null;
      }
      return;
    }
    if (!a || !b) return;
    const gap = beamLen(y) - 0.3;
    const sh = PERSON.height * 0.66;
    const m: Mat4 = new Array<number>(16).fill(0);
    if (!bm.track) {
      // Both at the shed with an end each: the front one walks out to the far end of the timber.
      if (!beamReady(board, a) || !beamReady(board, b)) return;
      bm.track = beamTrack(board, y, b.cell);
      if (!bm.track) return;
      bm.s = -1;
      trackAt(bm.track, gap, pt2);
      const plan = board.plans.get(a)!;
      const end = board.stepAt(board.nav!.nodes[pt2.node]!.cell, { spot: { x: pt2.x, z: pt2.z }, face: Math.atan2(pt2.dx, pt2.dz), pose: 'stand', linger: 1e6, load: 'beam', tag: 'shipyard:beam-end' });
      plan.steps.splice(plan.at, 0, end);
      a.timer = Math.min(a.timer, 0.2);
      if (board.stage) bm.h = board.stage.spawnMesh(beamMesh(beamLen(y)), HIDDEN);
    }
    const tr = bm.track;
    if (bm.s < 0) {
      // Spreading out along it: the timber lies from the rear one's shoulder toward the front one.
      const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
      const ux = d > 0.05 ? dx / d : Math.sin(b.heading), uz = d > 0.05 ? dz / d : Math.cos(b.heading);
      const L = beamLen(y);
      fly(b.x + ux * (L / 2 - 0.15), b.y + sh, b.z + uz * (L / 2 - 0.15), Math.atan2(ux, uz), 0, 0, 1, m);
      bm.h?.setMatrix(m);
      if (a.mode === 'linger' && a.goal?.errand?.tag === 'shipyard:beam-end') bm.s = gap;
      return;
    }
    const was = bm.s;
    bm.s = Math.min(tr.length, bm.s + 0.42 * dt);
    const walked = bm.s - was;
    carry(board, a, tr, bm.s, walked);
    carry(board, b, tr, Math.max(0, bm.s - gap), walked);
    // The beam on their shoulders, end to end between them.
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2 + sh;
    const yaw = Math.atan2(a.x - b.x, a.z - b.z);
    const pitch = Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, a.z - b.z));
    fly(mx, my, mz, yaw, pitch, 0, 1, m);
    bm.h?.setMatrix(m);
    if (bm.s >= tr.length - 1e-6) {
      bm.from = m;
      bm.laid = 0;
      for (const p of [a, b]) {
        p.pose = 'tend';
        const c = onSlip(y.geo, 0, Math.max(0, Math.min(y.geo.n, hullOnSlip(y.kind).u0)));
        p.heading = Math.atan2(c.x - p.x, c.z - p.z);
      }
    }
  };

  // ── the launch: the crowd ───────────────────────────────────────────────
  /** Places to watch from: down both side decks (their outer halves) and along the shore at the land end, nearest first. */
  const watchSpots = (board: Board, y: Yard): { cell: CellKey; spot: { x: number; z: number }; face: number }[] => {
    const nav = board.nav;
    if (!nav) return [];
    const out: { cell: CellKey; spot: { x: number; z: number }; face: number; rank: number }[] = [];
    const g = y.geo;
    const usable = (c: CellKey): boolean => nav.nodeAt.has(c) && !nav.nodes[nav.nodeAt.get(c)!]!.clutter;
    for (let i = 0; i < g.n; i++) {
      for (const [col, side] of [[g.left, 1], [g.right, -1]] as const) {
        if (!usable(col[i]!)) continue;
        for (const [du, dx] of [[0.28, 1.22], [0.72, 1.3]] as const) {
          const p = onSlip(g, side * dx, i + du);
          const c = onSlip(g, 0, i + du + 0.6);
          out.push({ cell: col[i]!, spot: p, face: Math.atan2(c.x - p.x, c.z - p.z), rank: i * 0.45 + du * 0.3 + (side > 0 ? 0 : 0.1) });
        }
      }
    }
    // The shore: the row at the land end and the one behind it, out to three either side.
    for (const back of [1, 2]) {
      for (const across of [0, 1, -1, 2, -2, 3, -3]) {
        const p0 = onSlip(g, across, -back + 0.5);
        const cell = key(Math.floor(p0.x), 1, Math.floor(p0.z));
        if (!usable(cell)) continue;
        for (const dx of [-0.22, 0.22]) {
          const p = onSlip(g, across + dx, -back + 0.5 + (back === 1 ? 0.2 : 0));
          const c = onSlip(g, across * 0.4, 2.5);
          out.push({ cell, spot: p, face: Math.atan2(c.x - p.x, c.z - p.z), rank: 0.8 + back * 1.6 + Math.abs(across) * 0.7 + (dx > 0 ? 0.05 : 0) });
        }
      }
    }
    return out.sort((a, b) => a.rank - b.rank);
  };

  const gather = (board: Board, y: Yard): void => {
    const spots = watchSpots(board, y);
    const people = board.crowd.people.filter((p) => !p.shutIn && !p.leaving && p.mode !== 'gone' && !p.raider).length;
    const most = phone() ? SHIPYARD.crowdPhone : SHIPYARD.crowd;
    const want = Math.min(spots.length, Math.max(Math.min(15, people), Math.min(Math.round(most), Math.round(people * SHIPYARD.crowdShare))));
    const near = y.geo.slip[0]!;
    // The yard's own hands first (they are there), then whoever is nearest and free.
    const pool = [
      ...y.hands.filter((p) => p.mode !== 'gone'),
      ...board.crowd.people
        .filter((p) => !y.hands.includes(p) && !p.shutIn && !p.leaving && p.mode !== 'gone' && !p.raider && unbusy(board, p) && !p.scuffle && !p.load && reaches(board, p, spots[0]?.cell ?? near))
        .sort((a, b) => board.dist(a.cell, near) - board.dist(b.cell, near) || (a.id < b.id ? -1 : 1)),
    ];
    y.watchers = [];
    // The one who names the ship: a grown-up in their finery, at the bow.
    const sponsorAt = board.nav?.nodeAt.has(y.geo.head) ? y.geo.head : y.geo.left[0]!;
    const sp = pool.find((p) => canWork(p) && !y.hands.includes(p) && homeCell(board, p) !== null) ?? null;
    if (sp) {
      const dress = board.homeStep(sp, { tag: 'shipyard:dress', linger: 1.2, done: (q) => void ((q.costume = 'guest'), (q.party = true)) });
      const bow = onSlip(y.geo, 0.18, -0.32);
      const c = onSlip(y.geo, 0, 1);
      const at = board.stepAt(sponsorAt, { spot: sponsorAt === y.geo.head ? bow : null, face: Math.atan2(c.x - bow.x, c.z - bow.z), pose: 'stand', linger: 1e6, tag: 'shipyard:bow' });
      const home = board.homeStep(sp, { tag: 'shipyard:home', linger: 0.4, done: (q) => void ((q.costume = q.costume === 'guest' ? null : q.costume), (q.party = false)) });
      if (dress && home) {
        reassigning = true;
        board.claim(sp, chain);
        board.assign(sp, { chain, at: 0, steps: [dress, at, home], fail: (q) => void (q.costume === 'guest' && (q.costume = null)) });
        reassigning = false;
        y.sponsor = sp;
      }
    }
    let k = 0;
    for (const p of pool) {
      if (y.watchers.length >= want) break;
      if (p === y.sponsor) continue;
      const s = spots[k++];
      if (!s) break;
      const step = board.stepAt(s.cell, { spot: s.spot, face: s.face, pose: p.child ? 'hop' : 'look', linger: 1e6, tag: 'shipyard:watch' });
      const home = board.homeStep(p, { tag: 'shipyard:home', linger: 0.4 }) ?? after(board, s.cell);
      reassigning = true;
      board.claim(p, chain);
      board.assign(p, { chain, at: 0, steps: [step, home] });
      reassigning = false;
      p.party = true;
      // In ones and twos, not all at once.
      p.timer = Math.min(p.timer, (k % 7) * 0.35);
      y.watchers.push(p);
    }
  };

  const watching = (board: Board, p: Person): boolean => board.plans.get(p)?.chain === chain && p.mode === 'linger' && p.goal?.errand?.tag === 'shipyard:watch';

  /** Everybody watching does this now: cheer, wave, clap; a few throw their hats. */
  const react = (board: Board, y: Yard, pose: 'cheer' | 'wave' | 'clap' | 'look', hats = 0): void => {
    let thrown = 0;
    for (const p of y.watchers) {
      if (!watching(board, p)) continue;
      p.pose = pose === 'cheer' && p.child ? 'hop' : pose === 'clap' && rand(p.seed, 'yard-clap', y.built) < 0.4 ? 'cheer' : pose;
      p.poseTime = rand(p.seed, 'yard-pt', y.built);
      if (thrown < hats && !p.child && board.stage && rand(p.seed, 'yard-hat', y.built) < 0.5) {
        thrown++;
        const colors = PERSON.hats;
        y.hats.push({ h: board.stage.spawnMesh(hatMesh(colors[(p.look + thrown) % colors.length]!, '#4b4a55'), place(p.x, p.y + PERSON.height, p.z)), x: p.x, y: p.y + PERSON.height, z: p.z, t: 0, spin: rand(p.seed, 'yard-spin', y.built) * 8 - 4 });
      }
    }
  };

  const stepHats = (dt: number, y: Yard): void => {
    for (let i = y.hats.length - 1; i >= 0; i--) {
      const h = y.hats[i]!;
      h.t += dt;
      const k = Math.min(1, h.t / 1.5);
      // Up and back down into the hand that threw it.
      const up = 4 * 1.1 * k * (1 - k);
      h.h.setMatrix(place(h.x, h.y + up, h.z, h.spin * h.t, 1.6, 1.6, 1.6));
      if (k >= 1) {
        h.h.release();
        y.hats.splice(i, 1);
      }
    }
  };

  const confetti = (board: Board, y: Yard): void => {
    if (board.now < y.confettiAt || !board.stage) return;
    y.confettiAt = board.now + (phone() ? 0.55 : 0.32);
    const live = y.watchers.filter((p) => watching(board, p));
    if (!live.length) return;
    const p = live[Math.floor(rand(board.seed, 'yard-conf', Math.floor(board.now * 5)) * live.length)]!;
    const c = onHull(y, 0.5, 0);
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1;
    petalsOf(board).toss(p.x, p.y + PERSON.height + 0.1, p.z, phone() ? 8 : 14, { up: 1.3, spread: 0.45, floor: p.y, dirX: dx / d, dirZ: dz / d, reach: Math.min(d, 1.2), seed: board.now * 991 + p.index });
  };

  // ── the launch: the ship ────────────────────────────────────────────────
  const launch = (board: Board, y: Yard): void => {
    const g = y.geo;
    const l: Launched = {
      yard: y.key,
      kind: y.kind,
      look: y.look,
      phase: 'slide',
      t: 0,
      geo: g,
      hull: y.hull,
      body: null,
      s: 0,
      v: 0,
      pose: { x: 0, z: 0, yaw: 0 },
      from: { x: 0, z: 0, yaw: 0 },
      voyage: null,
      size: hullSize(y.kind),
      speed: 0,
      swell: { heave: 0, roll: 0, pitch: 0 },
      m: new Array<number>(16).fill(0),
      splashed: 0,
      wake: 0,
      retry: 0,
    };
    y.hull = null;
    y.step = -1;
    fleet.push(l);
    if (board.stage) fleets.set(board.stage, fleet);
    launched++;
    y.built++;
  };

  /** The slide: s along the ways from where it was built; returns the hull's pose (and whether it is afloat). */
  const slide = (l: Launched): { sA: number; sB: number; rest: number } => {
    const h = hullOnSlip(l.kind);
    // The stern reaches the lip of the slip; the hull comes off the ways (its bow nearly at the lip).
    const sA = Math.max(0.2, l.geo.n - (h.u0 + h.aft));
    const sB = sA + h.aft + h.fwd * 0.85;
    // At rest its bow (bowsprit and all) lies well clear of the end of the ways: room to turn.
    const rest = l.geo.n + SHIPYARD.wayRun + 0.8 + Math.max(rigOf(l.kind, 0).bow, l.size.bow) - h.u0;
    return { sA, sB, rest: Math.max(rest, sB + 1) };
  };

  const settledPose = (l: Launched): Pose => {
    const h = hullOnSlip(l.kind);
    const p = onSlip(l.geo, 0, h.u0 + l.s);
    return { x: p.x, z: p.z, yaw: l.geo.yaw + Math.PI };
  };

  const fieldOf = (board: Board): ReturnType<typeof seaField> | null => {
    const shape = board.shape;
    if (!shape) return null;
    return seaField(obstacleColumns(shape.terrain, shape.kinds));
  };

  /**
   * The way out from where it lies, stern to the open sea: the harbour's own planner first (it may tow it
   * clear and turn it); if that finds none (a slip near the edge of the map, too little sea to turn in
   * before it), turned where it lies, a quarter turn either way first, then further, wherever the turn is
   * clear, and out from there.
   */
  const plan = (board: Board, l: Launched): void => {
    const field = fieldOf(board);
    l.voyage = null;
    if (!field) return;
    const m = { x: l.pose.x, z: l.pose.z, yaw: l.pose.yaw, wx: l.pose.x, wz: l.pose.z, ox: l.geo.sx, oz: l.geo.sz };
    const pick = rand(board.seed, 'yard-exit', l.yard, l.look);
    const v = planDeparture(field, l.size, m, SHIPS.edgeIn, SEA_MARGIN, pick) ?? planDeparture(field, l.size, m, SHIPS.edgeIn, 0.05, pick);
    if (v) {
      l.voyage = { path: v.path, tow: v.tow, turn: v.swing, about: v.tow > 0 ? (l.size.stern + l.size.bow) / 2 : l.size.stern };
      return;
    }
    const mid = (l.size.stern + l.size.bow) / 2;
    const q: Pose = { x: 0, z: 0, yaw: 0 };
    for (const turnBy of [Math.PI / 2, -Math.PI / 2, (Math.PI * 3) / 4, (-Math.PI * 3) / 4, Math.PI, -Math.PI]) {
      let ok = true;
      for (let i = 1; i <= 16 && ok; i++) {
        pivot(l.pose, mid, (turnBy * i) / 16, q);
        ok = hullClear(field, l.size, q.x, q.z, q.yaw, 0.08);
      }
      if (!ok) continue;
      const turned = pivot(l.pose, mid, turnBy);
      const w = planDeparture(field, l.size, m, SHIPS.edgeIn, SEA_MARGIN, pick, -1, turned) ?? planDeparture(field, l.size, m, SHIPS.edgeIn, 0.05, pick, -1, turned);
      if (w) {
        l.voyage = { path: w.path, tow: 0, turn: turnBy, about: mid };
        return;
      }
    }
  };

  const stepLaunched = (dt: number, board: Board, l: Launched, time: TimeSignal): void => {
    l.t += dt;
    const stage = board.stage;
    const { sA, sB, rest } = slide(l);
    const h = hullOnSlip(l.kind);
    if (l.phase === 'slide') {
      // Down the ways (slowly, then faster); past their end it tips about the lip of the slip, stern down
      // into the sea (as deep as the water lets it: it floats), and comes off the end afloat.
      const n = l.geo.n;
      const th0 = Math.atan((SHIPYARD.wayHead - SHIPYARD.wayFoot) / n);
      const a = SHIPYARD.slideAccel * (l.s < sA ? 1 : 2.6);
      l.v += a * dt;
      l.s += l.v * dt;
      const u = h.u0 + l.s;
      if (l.s <= sA) slipPose(l.geo, l.kind, u, l.m);
      else {
        // zc: where the lip is along the keel (hull frame, + toward the bow).
        const zc = u - n;
        const yk = cradleFoot(l.kind);
        const lip = slipTop(n, n);
        const tip = th0 + (0.3 - th0) * smoothstep(zc / h.fwd);
        const buoy = Math.asin(Math.min(1, Math.max(0, (lip - (SEA_Y - 0.2)) / Math.max(0.1, zc + h.aft))));
        const th = Math.max(0, Math.min(tip, Math.max(th0, buoy)));
        const u0 = n + zc * Math.cos(th) - yk * Math.sin(th);
        const y0 = lip - zc * Math.sin(th) - yk * Math.cos(th);
        const p = onSlip(l.geo, 0, u0);
        fly(p.x, y0, p.z, l.geo.yaw + Math.PI, th, 0, 1, l.m);
        l.tip = { y: y0, th, u: u0 };
        // The stern hits the water: a great splash, and spray along the hull as it goes in.
        const sternY = lip - (zc + h.aft) * Math.sin(th);
        if (l.splashed === 0 && sternY < SEA_Y + 0.05) {
          l.splashed = 1;
          const st = onSlip(l.geo, 0, n + (zc + h.aft) * Math.cos(th) - 0.2);
          splash(board, st.x, st.z, l.kind === 'galleon' ? 2.1 : 1.6);
          for (const side of [-1, 1]) {
            const sp = onSlip(l.geo, side * 0.85, n + (zc + h.aft) * 0.6);
            splash(board, sp.x, sp.z, 0.8);
          }
          if (stage) {
            wakeRing(stage, st.x, st.z, 1.1, 3.4, 3.2);
            hullRing(stage, st.x, st.z, l.geo.yaw, 2.2, 2.6, 2.6, 3.4);
          }
        }
      }
      l.hull?.setMatrix(l.m);
      if (l.s >= sB) {
        // Afloat: the ship itself takes over from the drawing it was built in (behind the splash).
        l.phase = 'afloat';
        l.t = 0;
        if (l.tip) l.s = l.tip.u - h.u0;
        l.pose = settledPose(l);
        l.hull?.release();
        l.hull = null;
        if (stage) {
          l.body = new ShipBody(stage, l.kind, l.look, l.m, 0);
          l.body.setAll(0);
          const p = onSlip(l.geo, 0, h.u0 + l.s - h.fwd * 0.3);
          splash(board, p.x, p.z, l.kind === 'galleon' ? 1.8 : 1.3);
          hullRing(stage, p.x, p.z, l.geo.yaw, 2.4, 3, 3, 3.6);
        }
      }
      if (l.t > SLIDE_MOST) l.s = sB;
      return;
    }
    if (l.phase === 'afloat') {
      // Running on, slowed by the water; at the last it drifts (and its boats warp it) the rest of the way.
      // It drops level onto the water from where it came off the ways, dips, and rights itself in a few rolls.
      const left = Math.max(0, rest - l.s);
      l.v = Math.max(0.3 * Math.min(1, left * 2), Math.min(l.v, left * SHIPYARD.drag * 2.2) * Math.exp(-SHIPYARD.drag * dt));
      l.s = Math.min(rest, l.s + l.v * dt);
      l.pose = settledPose(l);
      const tf = l.t;
      const y1 = l.tip?.y ?? SEA_Y, th1 = l.tip?.th ?? 0.2;
      const y = SEA_Y + (y1 - SEA_Y) * Math.exp(-3.2 * tf) - 0.11 * Math.sin(Math.min(Math.PI, tf * 2.2)) * Math.exp(-0.6 * tf);
      const pitch = th1 * Math.exp(-1.3 * tf) * Math.cos(2.4 * tf);
      const roll = 0.06 * Math.exp(-0.7 * tf) * Math.sin(2.1 * tf);
      fly(l.pose.x, y, l.pose.z, l.pose.yaw, pitch, roll, 1, l.m);
      l.body?.trim(dt, { lee: 0, along: 0, strength: AIR.strength }, SHIPS.sailTime);
      l.body?.pose(l.m, Math.atan2(AIR.dirX, AIR.dirZ));
      if (l.t > 7 && rest - l.s < 0.02) {
        plan(board, l);
        l.from = { ...l.pose };
        l.t = 0;
        l.phase = l.voyage ? (l.voyage.tow > 0 ? 'tow' : l.voyage.turn !== 0 ? 'swing' : 'sail') : 'moored';
      }
      return;
    }
    // Under way or lying off: the swell, the sails, the flags.
    const v = l.voyage;
    const before = { ...l.pose };
    switch (l.phase) {
      case 'tow': {
        // Warped out stern first by its boats, slowly.
        const k = Math.min(1, l.t / Math.max(1, v!.tow / 0.32));
        const e = k * k * (3 - 2 * k);
        l.pose.x = l.from.x + l.geo.sx * v!.tow * e;
        l.pose.z = l.from.z + l.geo.sz * v!.tow * e;
        if (k >= 1) {
          l.from = { ...l.pose };
          l.t = 0;
          l.phase = v!.turn !== 0 ? 'swing' : 'sail';
        }
        break;
      }
      case 'swing': {
        const dur = Math.max(2, Math.abs(v!.turn) / 0.12);
        const k = Math.min(1, l.t / dur);
        const e = k * k * (3 - 2 * k);
        pivot(l.from, v!.about, v!.turn * e, l.pose);
        if (k >= 1) {
          l.t = 0;
          l.phase = 'sail';
        }
        break;
      }
      case 'sail': {
        // Sails drop, one after another; it gathers way and goes out over the edge of the map.
        l.body?.sails.forEach((sp, i) => (sp.want = l.t > 0.5 + (l.body!.rig.sails[i]!.order ?? 0) * SHIPS.sailEvery * 0.6 ? 1 : 0));
        const len = l.size.bow - l.size.stern;
        const want = SHIPS.sailSpeed * Math.min(1, 0.2 + l.speed / 0.6) * (0.35 + 0.65 * (l.body?.canvas ?? 1)) * Math.min(1, 0.25 + l.s / (len * 1.5));
        l.speed += (want - l.speed) * Math.min(1, dt * 0.7);
        if (l.t < 0.1) l.s = 0;
        l.s = Math.min(v!.path.length, l.s + l.speed * dt);
        const p = pathAt(v!.path, l.s);
        l.pose.x = p.x;
        l.pose.z = p.z;
        l.pose.yaw = p.yaw;
        if (v!.path.length - l.s <= 1e-6) {
          l.phase = 'gone';
          l.body?.release();
          l.body = null;
          return;
        }
        break;
      }
      case 'moored': {
        // No way out: it lies off the slip's end, sails furled, until the town opens one.
        l.body?.setAll(0);
        l.retry -= dt;
        if (l.retry <= 0) {
          l.retry = 15;
          plan(board, l);
          if (l.voyage) {
            l.from = { ...l.pose };
            l.t = 0;
            l.s = 0;
            l.phase = l.voyage.tow > 0 ? 'tow' : l.voyage.turn !== 0 ? 'swing' : 'sail';
          }
        }
        break;
      }
      default:
    }
    if (!l.body) return;
    const sin = Math.sin(l.pose.yaw), cos = Math.cos(l.pose.yaw);
    swellAt(time.seconds, (l.look * 0.137) % 1, (l.size.bow - l.size.stern) * 0.35, AIR.strength, l.swell);
    const wind = { lee: AIR.dirX * cos - AIR.dirZ * sin, along: AIR.dirX * sin + AIR.dirZ * cos, strength: AIR.strength };
    l.body.trim(dt, wind, SHIPS.sailTime);
    const calm = l.phase === 'moored' ? 0.35 : 0.6;
    fly(l.pose.x, SEA_Y + l.swell.heave * calm, l.pose.z, l.pose.yaw, l.swell.pitch * calm * 0.6, l.swell.roll * calm * 0.6, 1, l.m);
    const reach = Math.max(mapEdge(l.pose.x + sin * (l.size.bow + 1.5), l.pose.z + cos * (l.size.bow + 1.5)), mapEdge(l.pose.x + sin * l.size.stern, l.pose.z + cos * l.size.stern));
    l.body.setCut(reach > -2.5);
    l.body.pose(l.m, Math.atan2(AIR.dirX, AIR.dirZ));
    const moved = Math.hypot(l.pose.x - before.x, l.pose.z - before.z);
    l.wake += moved;
    if (stage && l.wake > 1.1) {
      l.wake = 0;
      wakeRing(stage, l.pose.x + sin * l.size.stern, l.pose.z + cos * l.size.stern, l.size.halfBeam * 0.55, 2.8, 2.6);
    }
  };

  // ── trouble ─────────────────────────────────────────────────────────────
  /** A blast or a fire at the dock, or a nuke anywhere: the half-built hull comes down. */
  const trouble = (board: Board, y: Yard): boolean => {
    if (!board.stage || y.step < 0) return false;
    const d = mischiefOf(board.stage);
    const c = onSlip(y.geo, 0, y.geo.n / 2);
    for (const b of d.bombs) if (b.age >= b.fall && (b.nuke || Math.hypot(b.point[0] - c.x, b.point[2] - c.z) < 5)) return true;
    for (const b of d.engine.burning()) if (b.structure === y.dock) return true;
    for (const cell of y.geo.slip) if (d.engine.sinceHit(cell - (1 << 12)) < 1.5) return true;
    return false;
  };

  /** Takes the hull down a piece at a time (erased: the hands carry planks off; knocked down: in smoke). */
  const tearDown = (board: Board, y: Yard, smoke: boolean): void => {
    if (y.tear) {
      y.tear.smoke ||= smoke;
      return;
    }
    y.tear = { next: 0, smoke };
    foldAway(board, y, 'staging');
    foldAway(board, y, 'bunting');
    y.beam?.h?.release();
    if (y.beam) for (const p of y.beam.carriers) if (p.load === 'beam') p.load = null;
    y.beam = null;
    if (y.scene) scenesOf(board).end(y.scene);
    y.scene = null;
    letGo(board, y.watchers.filter((p) => !y.hands.includes(p)));
    y.watchers = [];
    if (y.sponsor) letGo(board, [y.sponsor]);
    y.sponsor = null;
    // The hands carry planks off home (a knock-down sends them home empty-handed).
    for (const p of y.hands) {
      const home = board.homeStep(p, { tag: 'shipyard:home', linger: 0.4, load: smoke ? null : 'plank', done: (q) => void (q.load = null) });
      reassigning = true;
      if (home && !smoke && board.nav?.nodeAt.has(y.geo.head)) board.assign(p, { chain, at: 0, steps: [board.stepAt(y.geo.head, { pose: 'tend', linger: 0.8, tag: 'shipyard:strip' }), home], fail: (q) => void (q.load === 'plank' && (q.load = null)) });
      else if (home) board.assign(p, { chain, at: 0, steps: [home] });
      reassigning = false;
      if (board.claimedBy(p) === chain) board.unclaim(p);
    }
    y.hands = [];
  };

  const foldAway = (board: Board, y: Yard, what: 'staging' | 'bunting'): void => {
    const h = y[what];
    if (!h) return;
    h.release();
    y[what] = null;
    const hl = hullOnSlip(y.kind);
    for (const side of [-1, 1]) {
      for (const k of [0.15, 0.5, 0.85]) {
        const p = onSlip(y.geo, side * (what === 'bunting' ? 1.4 : rigOf(y.kind, 0).halfBeam + 0.16), what === 'bunting' ? y.geo.n * k : hl.u0 - hl.fwd + (hl.fwd + hl.aft) * k);
        puff(board, p.x, CELL_H + 0.3, p.z, 1);
      }
    }
  };

  const stepTear = (dt: number, board: Board, y: Yard): boolean => {
    const t = y.tear!;
    t.next -= dt;
    if (t.next > 0) return false;
    t.next = t.smoke ? 0.14 : 0.32;
    const k = y.step >= 0 ? Math.max(0, Math.min(1, y.step / Math.max(1, buildSteps(y.kind).length - 1))) : 0;
    const at = onHull(y, rand(board.seed, 'yard-tear', y.step, y.key), 0.2 + k * 0.6);
    puff(board, at.x, at.y, at.z, t.smoke ? 1.2 : 0.9, t.smoke);
    if (y.step <= 0) {
      show(board, y, -1);
      y.tear = null;
      return true;
    }
    // Down a stage at a time; a big hull comes down in bigger pieces.
    show(board, y, Math.max(0, y.step - (y.step > 12 ? 2 : 1)));
    return false;
  };

  // ── the yard's day ──────────────────────────────────────────────────────
  const stepYard = (dt: number, time: TimeSignal, board: Board, y: Yard): void => {
    if (y.tear) {
      if (stepTear(dt, board, y)) {
        y.phase = 'idle';
        y.t = 0;
      }
      return;
    }
    if (y.dead) return;
    if (board.now >= y.checkAt) {
      y.checkAt = board.now + 0.5;
      if (trouble(board, y)) {
        tearDown(board, y, true);
        return;
      }
    }
    const night = time.isNight;
    switch (y.phase) {
      case 'idle': {
        y.t += dt;
        const delay = y.built === 0 && y.step < 0 ? SHIPYARD.first : SHIPYARD.pause;
        const busy = yards.filter((o) => o !== y && !o.dead && (building(o) || o.phase === 'ready' || o.phase === 'gather')).length;
        const cap = phone() ? SHIPYARD.yardsPhone : SHIPYARD.yards;
        const lying = fleet.some((l) => l.yard === y.key && (l.phase === 'slide' || l.phase === 'afloat' || l.phase === 'moored' || l.phase === 'tow' || l.phase === 'swing'));
        if (y.t >= delay && busy < cap && !lying && !night) {
          pickHands(board, y);
          setPhase(board, y, 'keel');
          // Two of them fetch the keel timber.
          y.beam = { h: null, carriers: y.hands.slice(0, 2), track: null, s: 0, laid: -1, from: null };
          for (const p of y.beam.carriers) {
            const bp = beamPlan(board, y, p);
            reassigning = true;
            if (bp) board.assign(p, bp);
            reassigning = false;
          }
        }
        break;
      }
      case 'keel':
      case 'frames':
      case 'planks':
      case 'paint': {
        if (night) {
          // Building stops at night: the hands go home (the board's next offer of work waits for morning).
          if (y.hands.length && !y.beam?.track) {
            letGo(board, y.hands, true);
            y.hands = [];
            if (y.beam && y.beam.laid < 0) {
              y.beam.h?.release();
              y.beam = { h: null, carriers: [], track: null, s: 0, laid: -1, from: null };
            }
          }
          break;
        }
        if (!y.hands.length) pickHands(board, y);
        y.t += dt;
        if (y.phase === 'keel') {
          stepBeam(dt, board, y);
          // Nobody brought it in time: it is laid anyway (a puff), so the town never waits on two people.
          const coming = !!y.beam && y.beam.carriers.length === 2 && y.beam.carriers.every((p) => board.plans.get(p)?.chain === chain);
          if (y.step < 1 && ((y.t >= SHIPYARD.keel && !coming) || y.t >= SHIPYARD.keel * 1.8)) {
            y.beam?.h?.release();
            for (const p of y.beam?.carriers ?? []) {
              if (p.load === 'beam') p.load = null;
              const plan = board.plans.get(p);
              if (plan?.chain !== chain) continue;
              plan.steps.length = plan.at;
              p.timer = Math.min(p.timer, 0.5);
            }
            y.beam = null;
            show(board, y, 1);
            const c = onHull(y, 0.5, 0);
            puff(board, c.x, c.y, c.z, 1.3);
          }
          if (y.t >= SHIPYARD.keel && y.step >= 1) setPhase(board, y, 'frames');
          break;
        }
        const { from, count } = steps(y);
        const total = phaseSeconds(y.phase);
        // The first piece of a stage at once, the last a share before its end.
        const k = Math.min(count, Math.floor((y.t / total) * count) + 1);
        const target = from + k - 1;
        if (target > y.step) {
          show(board, y, target);
          const c = onHull(y, rand(board.seed, 'yard-puff', target, y.key), y.phase === 'frames' ? 0.3 : 0.5);
          puff(board, c.x, c.y, c.z, 0.7);
        }
        if (y.t >= total) {
          const i = BUILD_PHASES.indexOf(y.phase as (typeof BUILD_PHASES)[number]);
          const nextP = BUILD_PHASES[i + 1];
          if (nextP) setPhase(board, y, nextP);
          else {
            show(board, y, buildSteps(y.kind).length - 1);
            setPhase(board, y, 'ready');
            letGo(board, y.hands, true);
            y.hands = [];
          }
        }
        stepChips(board, y);
        break;
      }
      case 'ready': {
        y.waited += dt;
        const scenes = scenesOf(board);
        // A crowd to see it off: fifteen at least (most of a small town), else it waits a while for one.
        const town = board.crowd.people.filter((p) => !p.shutIn && !p.leaving && p.mode !== 'gone' && !p.raider);
        const free = town.filter((p) => unbusy(board, p) && !p.scuffle && !p.load).length;
        const enough = free >= Math.min(15, Math.ceil(town.length * SHIPYARD.crowdShare)) || y.waited > 120;
        if (time.isDay && enough && (scenes.may('launch') || y.waited > 90)) {
          y.waited = 0;
          setPhase(board, y, 'gather');
          if (board.stage) y.bunting = board.stage.spawnMesh(buntingMesh(y.geo.n, 1.42, y.key + y.built), place(y.geo.ox, 0, y.geo.oz, y.geo.yaw));
          for (const k of [0.1, 0.5, 0.9]) for (const side of [-1, 1]) {
            const p = onSlip(y.geo, side * 1.42, y.geo.n * k);
            puff(board, p.x, CELL_H + 0.6, p.z, 0.9);
          }
          gather(board, y);
          y.scene = scenes.begin({
            kind: 'launch',
            title: phrase('A ship is launched at the shipyard'),
            big: true,
            focus: () => {
              const l = fleet.find((f) => f.yard === y.key && f.phase !== 'gone');
              if (l && l.phase !== 'slide') return { x: l.pose.x, y: SEA_Y + 0.6, z: l.pose.z };
              const c = onHull(y, 0.6, 0.4);
              return { x: c.x, y: c.y, z: c.z };
            },
            noteworthy: () => y.phase === 'gather' || y.phase === 'launched',
            gathering: () => y.phase === 'gather' && y.t < SHIPYARD.gather * 0.5,
          });
        }
        break;
      }
      case 'gather': {
        y.t += dt;
        const G = SHIPYARD.gather;
        // Once most of the crowd is in its places (or it has waited long enough), the countdown: the bottle, the
        // staging down and the wedges out, and away she goes.
        const here = y.watchers.filter((p) => watching(board, p)).length;
        if (y.go < 0 && ((y.t >= G * 0.5 && here >= Math.ceil(y.watchers.length * 0.75)) || y.t >= G * 1.75)) y.go = 0;
        if (y.go < 0) break;
        y.go += dt;
        // The bottle: swung from the sponsor's hand on its ribbon against the bow; a glint, glass flying.
        const atBow = y.sponsor?.mode === 'linger' && y.sponsor.goal?.errand?.tag === 'shipyard:bow';
        if (y.go >= 0.5 && y.go < 3 && !y.bottle && atBow && board.stage) y.bottle = { h: board.stage.spawnMesh(bottleMesh(), HIDDEN), t: 0 };
        if (y.bottle) stepBottle(dt, board, y);
        if (y.go >= 6 && y.staging) {
          foldAway(board, y, 'staging');
          // The wedges are knocked out: the hands hammer at the cradle.
          for (const p of y.watchers.slice(0, 4)) if (watching(board, p)) p.pose = 'hammer';
        }
        if (y.go >= 10) {
          launch(board, y);
          setPhase(board, y, 'launched');
          react(board, y, 'look');
        }
        break;
      }
      case 'launched': {
        y.t += dt;
        const l = fleet.find((f) => f.yard === y.key);
        // Cheering from the splash on, hats in the air; then they wave it off.
        if (l && l.splashed && y.t < 12 && (y.watchers.length === 0 || !y.watchers.some((p) => p.pose === 'cheer' || p.pose === 'hop'))) react(board, y, 'cheer', phone() ? 3 : 6);
        if (l && l.splashed && y.t < 14) confetti(board, y);
        if (y.t > 14 && y.t < 14 + dt * 1.5) react(board, y, 'clap');
        if (l && l.phase === 'sail' && !y.watchers.some((p) => p.pose === 'wave')) react(board, y, 'wave');
        const done = !l || l.phase === 'gone' || l.phase === 'moored' || (l.phase === 'sail' && l.t > 14) || y.t > 75;
        if (done) {
          letGo(board, y.watchers);
          if (y.sponsor) letGo(board, [y.sponsor]);
          y.sponsor = null;
          y.watchers = [];
          foldAway(board, y, 'bunting');
          if (y.scene) scenesOf(board).end(y.scene);
          y.scene = null;
          petals?.blow();
          setPhase(board, y, 'idle');
        }
        break;
      }
    }
    stepHats(dt, y);
  };

  const stepBottle = (dt: number, board: Board, y: Yard): void => {
    const b = y.bottle!;
    const sp = y.sponsor;
    b.t += dt;
    if (!sp || b.t > 7) {
      b.h?.release();
      y.bottle = null;
      return;
    }
    // Held up (2 s), swung (0.5 s) against the stem, broken.
    const stem = onSlip(y.geo, 0, hullOnSlip(y.kind).u0 - hullOnSlip(y.kind).fwd + 0.15);
    const stemY = slipTop(0.3, y.geo.n) + 0.55;
    const hand = { x: sp.x, y: sp.y + PERSON.height * 0.95, z: sp.z };
    if (b.t < 2) {
      sp.pose = 'wave';
      b.h?.setMatrix(place(hand.x, hand.y, hand.z, 0, 1.5, 1.5, 1.5));
    } else if (b.t < 2.5) {
      const k = (b.t - 2) / 0.5;
      sp.pose = 'cheer';
      b.h?.setMatrix(place(hand.x + (stem.x - hand.x) * k, hand.y + (stemY - hand.y) * k + Math.sin(k * Math.PI) * 0.2, hand.z + (stem.z - hand.z) * k, k * 6, 1.5, 1.5, 1.5));
    } else if (b.h) {
      b.h.release();
      b.h = null;
      // The glint and the glass.
      if (board.stage) {
        const fx = fxOf(board.stage);
        fx.play(SPARKLE, 0.5, (k, m) => place(stem.x, stemY + 0.05, stem.z, 0, 0.9 * (1 - k) + 0.2, 0.9 * (1 - k) + 0.2, 0.9 * (1 - k) + 0.2, m), { smooth: true });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          fx.play(SPARKLE, 0.55, (k, m) => place(stem.x + Math.cos(a) * 0.45 * k, stemY + 0.3 * Math.sin(k * Math.PI) - 0.25 * k, stem.z + Math.sin(a) * 0.45 * k, 0, 0.35 * (1 - k) + 0.08, 0.35 * (1 - k) + 0.08, 0.35 * (1 - k) + 0.08, m), { delay: i * 0.02, smooth: true });
        }
        fx.play(POP, 0.45, (k, m) => place(stem.x, stemY, stem.z, 0, 0.3 + k * 0.5, 0.3 + k * 0.5, 0.3 + k * 0.5, m));
      }
      react(board, y, 'clap');
    }
  };

  const stepChips = (board: Board, y: Yard): void => {
    if (!board.stage || board.now < y.chipAt) return;
    y.chipAt = board.now + 0.35;
    const most = phone() ? 4 : 10;
    for (const p of y.hands) {
      if (y.chips.length >= most) break;
      if (p.mode !== 'linger' || p.goal?.errand?.tag !== 'shipyard:work' || p.pose !== 'hammer') continue;
      if (rand(p.seed, 'yard-chip', Math.floor(board.now * 3)) < 0.5) continue;
      const hx = p.x + Math.sin(p.heading) * 0.18, hz = p.z + Math.cos(p.heading) * 0.18;
      const r = (s: string): number => rand(p.seed, s, Math.floor(board.now * 7));
      y.chips.push({ h: board.stage.spawnMesh(chipMesh(), HIDDEN), x: hx, y: p.y + PERSON.height * 0.7, z: hz, vx: (r('cx') - 0.5) * 0.8, vy: 0.9 + r('cy') * 0.5, vz: (r('cz') - 0.5) * 0.8, t: 0 });
    }
  };

  const stepAllChips = (dt: number, y: Yard): void => {
    for (let i = y.chips.length - 1; i >= 0; i--) {
      const c = y.chips[i]!;
      c.t += dt;
      c.vy -= 3.2 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.h.setMatrix(place(c.x, c.y, c.z, c.t * 9, 1.4, 1.4, 1.4));
      if (c.t > 0.6) {
        c.h.release();
        y.chips.splice(i, 1);
      }
    }
  };

  const newYard = (board: Board, post: Post): Yard | null => {
    const [nStr, kind] = post.ref.split(':');
    const n = Number(nStr);
    if (!Number.isFinite(n) || n < 2 || (kind !== 'cog' && kind !== 'galleon')) return null;
    return {
      key: post.cell,
      dock: post.structure ?? -1,
      kind,
      geo: geoOf(post, n),
      shed: null,
      phase: 'idle',
      t: 0,
      built: 0,
      look: 0,
      step: -1,
      hull: null,
      staging: null,
      bunting: null,
      hands: [],
      watchers: [],
      sponsor: null,
      beam: null,
      tear: null,
      dead: false,
      scene: null,
      bottle: null,
      hats: [],
      chips: [],
      chipAt: 0,
      checkAt: 0,
      confettiAt: 0,
      waited: 0,
      go: -1,
    };
    void board;
  };

  const chain: ShipyardChain = {
    id: 'shipyard',
    get yards() {
      return yards;
    },
    get fleet() {
      return fleet;
    },
    get launched() {
      return launched;
    },
    sync(board) {
      const posts = board.posts('shipyard');
      const slips = posts.filter((p) => p.role === 'slip');
      const seen = new Set<Yard>();
      for (const post of slips) {
        let y = yards.find((o) => !o.dead && o.key === post.cell && `${o.geo.n}:${o.kind}` === post.ref && (post.dir ?? 2) === dirOf(o.geo));
        if (!y) {
          const made = newYard(board, post);
          if (!made) continue;
          y = made;
          yards.push(y);
        }
        seen.add(y);
        y.shed = posts.find((p) => p.role === 'shed' && p.ref === String(post.cell)) ?? null;
      }
      for (const y of yards) {
        if (seen.has(y) || y.dead) continue;
        // Its slip is gone (erased, or no longer a shipyard): the hull comes down, nothing vanishes.
        y.dead = true;
        tearDown(board, y, false);
        if (y.step < 0) y.tear = null;
      }
    },
    offer(p, time, board) {
      const y = yards.find((o) => o.hands.includes(p));
      if (!y || y.dead || y.tear || time.isNight) return null;
      if (board.claimedBy(p) !== chain) return null;
      if (!building(y)) return null;
      if (y.beam?.carriers.includes(p) && y.step < 1) return y.beam.track ? null : beamPlan(board, y, p);
      if (y.phase === 'keel') {
        // The others stand by at the head of the slip while the keel comes.
        const at = workSpot(board, y, 0, y.hands.indexOf(p) % 2 === 0 ? 1 : -1, 1.1);
        return at ? { chain, at: 0, steps: [board.stepAt(at.cell, { spot: at.spot, face: at.face, pose: 'look', linger: 3, tag: 'shipyard:wait' })] } : null;
      }
      return workPlan(board, y, p);
    },
    keeps: (load) => load === 'plank' || load === 'bucket',
    step(dt, time, board) {
      for (const y of yards) {
        stepYard(dt, time, board, y);
        stepAllChips(dt, y);
      }
      for (let i = yards.length - 1; i >= 0; i--) {
        const y = yards[i]!;
        if (y.dead && !y.tear && y.chips.length === 0 && y.hats.length === 0) {
          y.hull?.release();
          y.bottle?.h?.release();
          yards.splice(i, 1);
        }
      }
      for (const l of fleet) stepLaunched(dt, board, l, time);
      if (fleet.some((l) => l.phase === 'gone')) {
        fleet = fleet.filter((l) => l.phase !== 'gone');
        if (board.stage) fleets.set(board.stage, fleet);
      }
      // Splashes: up and back down into the water.
      for (let i = spouts.length - 1; i >= 0; i--) {
        const s = spouts[i]!;
        s.age += dt;
        const k = Math.min(1, s.age / SPOUT_KEEP);
        s.m[5] = Math.sin(k * Math.PI) * 1.5 * s.w + 0.001;
        s.h.setMatrix(s.m);
        if (k >= 1) {
          s.h.release();
          spouts.splice(i, 1);
        }
      }
      petals?.step(dt, board.now, AIR);
    },
    hurry(board, phase) {
      for (const y of yards) {
        if (y.dead) continue;
        if (phase === 'keel' && y.phase === 'idle') y.t = 1e6;
        else if (phase === 'ready') {
          y.beam?.h?.release();
          y.beam = null;
          show(board, y, buildSteps(y.kind).length - 1);
          setPhase(board, y, 'ready');
        } else if (phase === 'gather' && (y.phase === 'ready' || building(y))) {
          show(board, y, buildSteps(y.kind).length - 1);
          setPhase(board, y, 'ready');
          y.waited = 1e6;
        }
      }
    },
    dispose() {
      for (const y of yards) {
        y.hull?.release();
        y.staging?.release();
        y.bunting?.release();
        y.beam?.h?.release();
        y.bottle?.h?.release();
        for (const h of y.hats) h.h.release();
        for (const c of y.chips) c.h.release();
      }
      yards.length = 0;
      for (const l of fleet) {
        l.hull?.release();
        l.body?.release();
      }
      fleet = [];
      for (const s of spouts) s.h.release();
      spouts.length = 0;
      petals?.dispose();
      petals = null;
    },
  };
  return chain;
}

const smoothstep = (v: number): number => {
  const x = v < 0 ? 0 : v > 1 ? 1 : v;
  return x * x * (3 - 2 * x);
};

function dirOf(g: YardGeo): number {
  return g.sx === 0 ? (g.sz > 0 ? 2 : 0) : g.sx > 0 ? 1 : 3;
}

const DUST = { actor: 'puff', variant: 'dust' } as const;
const SMOKE = { actor: 'puff', variant: 'smoke' } as const;
const POP = { actor: 'puff', variant: 'pop' } as const;
const SPARKLE = { actor: 'sparkle' } as const;
