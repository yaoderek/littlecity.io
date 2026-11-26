// The crowd (People, Stage 3; catalogue L21, L22, L24, L25, L27, L32).
//
// The whole simulation of the residents, with no drawing in it: who is
// where, where they are going, how they get there. `people.system.ts` runs
// one of these and draws what it says; the tests in crowd.test.ts step one
// with fixed time steps and check that nobody ever leaves the walking graph.
//
// Deterministic: every choice is rand(person seed, a name, a counter), and
// time comes only from the `time` signal handed to `step`. The same town
// stepped the same way gives the same walks.
//
// A PERSON is always in one of these modes:
//   home     inside their house, not drawn. A timer runs down to the next outing.
//   walk     following the pieces of a walk (walk.ts) toward a goal
//   linger   at a haunt, in a pose, for 5–20 seconds
//   visit    inside a shop or another house, not drawn
//   hop      jumping to the nearest walkable cell after being built over (L27)
//   wait     drawn, standing, waiting for a route to be planned
//   gone     walked off or faded; removed at the end of the step
//   thrown   mischief: blown off their feet or carried off by the Hand
//            (src/life/mischief/thrown.ts moves and draws them until it
//            sets them down again with `settle`)
//
// What a town offers comes from the plan: `resident` actors (L21), haunt-*
// sockets (L22, L25, L32), `arrival` and `way-out` sockets (L27),
// `queue-point` sockets (L24).

import { columnIndex, DIR4, key, keyX, keyY, keyZ, SIZE_X, SIZE_Z, type CellKey, type Dir4 } from '@/core/grid';
import { hash, rand } from '@/core/rand';
import type { SocketType } from '@/core/vocab';
import type { TimeSignal } from '@/life/api';
import type { Pose, PoseName } from '@/parts/people/pose';
import { usableDoors } from '@/resolve/nav';
import type { DressingPlan, NavDoor, NavGraph, ShapePlan, StructureId } from '@/resolve/plan';
import { AVOID, PEOPLE, PERSON } from '@/style/people';
import { DOORS } from '@/style/animation';
import { createDoors, type DoorTable } from './doors';
import { BODY } from './overlap';
/** How close anybody lets another come: a body and a hand's breadth (steady following sits just outside an overlap). */
const KEEP = BODY + 0.025;
/** How far a ridden bike reaches ahead of its rider (bikes.ts): the front wheel and basket. */
const BIKE_NOSE = 0.2;
import { createRouter, type Router } from './route';
import { createScuffles, type Scuffle, type Scuffles } from './scuffle';
import { createBikes, type BikeOptions, type Bikes } from './bikes';
import type { ErrandHost, ErrandStep, Load } from './errand';
import { HEAVY } from '@/parts/people/loads';
import type { Finery } from '@/parts/people/finery';
import type { BeachWear } from '@/parts/people/beachwear';
import type { Barbarian } from '@/parts/people/barbarian';
import { buildWalk, doorDirs, nodeCentre, nodeHeight, pieceAt, type DoorPlace, type Piece, type Point } from './walk';

export type Mode = 'home' | 'walk' | 'linger' | 'visit' | 'hop' | 'wait' | 'gone' | 'thrown';

export interface Haunt {
  /** The socket's id. */
  id: string;
  type: SocketType;
  node: number;
  cell: CellKey;
  dir?: Dir4;
  structure?: StructureId;
  /** The socket's `name`: a seat socket's id, 'step' or 'pot' (stoop), 'stars' or 'fisher' (night). */
  name?: string;
  user: Person | null;
}

/** A job (L23, L08): its stations in round order, and the resident who has it. */
export interface Work {
  key: string;
  job: string;
  structure: StructureId | undefined;
  stations: Haunt[];
  /** Per station: the lamp prop's id (lamplighter), else ''. */
  refs: string[];
  worker: Person | null;
}

export interface Goal {
  kind: 'home' | 'haunt' | 'leave' | 'errand';
  node: number;
  haunt: Haunt | null;
  /** Go in at this door at the end. */
  door: NavDoor | null;
  /** Where to stand in the node's cell, and which way to face (radians; NaN = as arrived). */
  spot: Point | null;
  face: number;
  pose: PoseName;
  linger: number;
  /** Sitting: height of the seat above the floor; -1 when not sitting. */
  seat: number;
  /** An errand's step (kind 'errand'). */
  errand?: ErrandStep;
}

export interface Person {
  readonly id: string;
  home: StructureId;
  readonly index: number;
  readonly look: number;
  readonly child: boolean;
  readonly seed: number;
  /** 0–1, fixed per person: orders who goes home first, who is a night owl, who rises early. */
  readonly rank: number;
  readonly speed: number;
  /** Among the few allowed out at night (L25). */
  owl: boolean;
  /** Their house has no door they can use: at home for good (resident/indoors). */
  shutIn: boolean;
  /** Their job, if they have one, the station they were last sent to, and how far through tonight's round they are. */
  work: Work | null;
  station: number;
  round: number;
  /** The part of the day they last saw, to notice dusk falling. */
  part: string;
  /** Walking with their arms full (a miller's sack, a baker's tray). */
  carrying: boolean;
  /** What they carry for an errand now, drawn in their hands (also while standing and inside). */
  load: Load | null;
  /** Walking the lamp round, briskly (L08). */
  brisk: boolean;

  mode: Mode;
  visible: boolean;
  /** 0–1: coming into view at the shore or going out of it at the edge of the map. */
  fade: number;
  /**
   * Which way the water (or the map's edge) lies from where they come ashore or leave: they climb up out of
   * it or step down into it while `fade` runs (drawn by people.system.ts). 0, 0 when there is none: then
   * they fade.
   */
  edgeX: number;
  edgeZ: number;
  /** Seconds the coming into view or going out of it takes. */
  fadeTime: number;
  x: number;
  y: number;
  z: number;
  /** Radians about the vertical; 0 faces +z, π/2 faces +x. */
  heading: number;
  pose: PoseName;
  /** Seconds in the current pose (idle poses), and the stride phase (walk). */
  poseTime: number;
  stride: number;
  /** Seat height when sitting, else -1. */
  seat: number;

  /** The graph node whose cell they are in (the node outside the door when inside), and that cell. */
  node: number;
  cell: CellKey;
  walk: Piece[] | null;
  at: number;
  t: number;
  goal: Goal | null;
  /** A goal waiting for its route. */
  want: Goal | null;
  timer: number;
  /** The single-file run they are in, or -1, and the way they are going through it. */
  held: number;
  /** Outings and choices made so far: the counter behind every seeded choice. */
  trips: number;
  /** Seconds spent held up behind somebody (negative: seconds left of stepping round them), and the speed share that leaves them this step. */
  stuck: number;
  slow: number;
  /** Waiting at the end of a single-file stretch. */
  queued: boolean;
  /** The building they are inside while `visit`. */
  inside: NavDoor | null;
  /** hop: where from, where to, how far along. */
  hop: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number } | null;
  /** Their home is gone: walking off. */
  leaving: boolean;
  /** Come up out of the water (mischief: off a ship or boat that went down): on their way in at a door. */
  ashore?: boolean;
  /** Stop and look (L26): seconds left, and the heading to turn to. */
  startled: number;
  startledFace: number;
  /** L26: a small hop is owed once they have turned to look; seconds left of a hop in the air; its height now. */
  jumpy: boolean;
  jump: number;
  lift: number;
  /** L26: stopped for a chat: seconds left, the heading toward the other, the last person chatted with, whose turn it is to talk. */
  chat: number;
  chatFace: number;
  lastMet: Person | null;
  chatWith: Person | null;
  bubble: boolean;
  /** Seconds until they will stop for another chat. */
  chatRest: number;
  /** A pose that overrides `pose` while a reaction lasts (a look, a hop, a chat), else null. */
  react: PoseName | null;
  /** L28: a child flying a kite right now (at a kite spot, with the wind up). */
  flying: boolean;
  /**
   * Stepping aside (L24, people are solid): how far right (+) or left (−) of their line they walk now, where
   * they mean to be, and how fast the step aside is going (for the facing).
   */
  dodge: number;
  dodgeTo: number;
  dodgeV: number;
  /** The step aside as a world offset from their line. */
  offX: number;
  offZ: number;
  /** Held up, they thought again once; cleared once they get going. */
  rethought: boolean;
  /** L50: the scuffle they are in or watching, and whether they are inside its cloud now (not drawn). */
  scuffle: Scuffle | null;
  inCloud: boolean;
  /** In an event's party (a wedding, a parade): never drawn into a scuffle. */
  party: boolean;
  /** Dressed for an event (L57: the wedding party's finery; L63: for the beach; the raid: a raider), or a hat knocked askew (L50), else null. */
  costume: Finery | BeachWear | Barbarian | 'askew' | null;
  /**
   * The raid (src/life/raid): one of a raiding band, not a resident. Every chain leaves them alone (canWork,
   * the board's `assign`); only the raid's own chain sends them anywhere.
   */
  raider?: boolean;
  /** L26, L57: the pose to show while stopped to look (startled), instead of standing: a wave, a clap. */
  admire?: PoseName | null;
  /**
   * L63: where the figure is drawn, offset from where they stand (world x, z), for somebody out past the
   * edge of the land cell they are in: paddling in the shallows, wading in to swim. Drawing only: their
   * place on the walking graph stays where it is. Undefined or 0 for everybody else.
   */
  drawX?: number;
  drawZ?: number;
  /**
   * Mischief (src/life/mischief/thrown.ts): how a thrown person is drawn, while it says. `pose` is drawn
   * instead of the crowd's; with `rot` (a 3×3 turn, column-major, world axes) the whole figure is turned
   * about the point `pivot` (figure units) up its middle, and (x, y, z) is where that point is in the world.
   * `hatless`: the hat knocked off (it lies on the ground, drawn by the mischief). `drop`: the hips brought
   * down this far (figure units: sitting on the ground).
   */
  tumble?: Tumble | null;
}

/** See `Person.tumble`. */
export interface Tumble {
  pose: Pose | null;
  rot: Float32Array | null;
  pivot: number;
  hatless: boolean;
  drop: number;
  /** Drawn this much bigger than the figure's own size (in the air, seen from far off), 1 when not. */
  grow?: number;
}

export interface CrowdEvents {
  /** A home's count of residents inside changed. */
  home?(home: StructureId, count: number): void;
  /** A walker stepped into a new cell. */
  passed?(cell: CellKey, person: Person): void;
  /** L08: the lamplighter reached a lamp (the lamp prop's id). */
  lamp?(lamp: string, person: Person): void;
  /** L50: a scuffle started or ended. */
  scuffle?(s: Scuffle, what: 'start' | 'end'): void;
  /** L23: the bell ringer went in to ring. */
  bell?(structure: StructureId, person: Person): void;
  /** Somebody was added or removed (the drawing must follow). */
  added?(person: Person): void;
  removed?(person: Person): void;
}

export interface CrowdOptions {
  /** How many residents to run (L21: 60 on a desktop, 30 on a phone). Default PEOPLE.cap. */
  cap?: number;
  /** Where a door's threshold is, if known more exactly than the middle of its face. */
  doorAt?: DoorPlace;
  /** The wind at a column, for kites (L28). Without it nobody flies one. */
  wind?(x: number, z: number): { dirX: number; dirZ: number; strength: number };
  /** The place and facing of a seat socket (world x, y, z and heading), if the stage knows it. */
  seatAt?(socket: string): { x: number; y: number; z: number; face: number } | null;
  events?: CrowdEvents;
  /** L36, L37: bodies walkers wait for (soldiers, a horse), read each step. */
  obstacles?(): readonly { x: number; y: number; z: number }[];
  /** L51 and up: the town's chains, which send people on errands. */
  errands?: ErrandHost;
  /** L50: sends somebody to break up a scuffle (the town's chains know the watchman); returns them, or null. */
  respond?(s: Scuffle): Person | null;
  /** L50: overrides the scuffle dials (a fixture forcing one). */
  scuffle?: { chance?: number; squeeze?: number; rest?: number };
  /** L38–L40: how much a place that is only sometimes worth going to weighs now (a quay with a ship in); 0 = not now. */
  favour?(h: Haunt): number;
  /** The bikes by front doors and their riders (bikes.ts): the cap and the weather; false for none. */
  bikes?: BikeOptions | false;
}

export interface Crowd {
  readonly people: readonly Person[];
  readonly nav: NavGraph | null;
  readonly router: Router | null;
  readonly haunts: readonly Haunt[];
  readonly jobs: readonly Work[];
  /** Residents inside each home right now. */
  readonly atHome: ReadonlyMap<StructureId, number>;
  /** Every door somebody has used, and how far open it is (L29). */
  readonly doors: DoorTable;
  /** The town changed (or is shown for the first time). Does nothing until the dressing has arrived. */
  sync(shape: ShapePlan, dressing: DressingPlan | null, time: TimeSignal): void;
  step(dt: number, time: TimeSignal): void;
  /** A block landed in this cell: people near it stop and look (L26). */
  blockLanded(cell: CellKey): void;
  /** L50: the scuffle going on now, if any, and the means to start one at once (fixtures, sequences). */
  readonly scuffles: Scuffles;
  /** Makes somebody choose what to do now (an errand has come up for them), as soon as they can. */
  rethink(p: Person): void;
  /** Something stands in a cell for a while (L56: a market stall): walkers route round it (0 lifts it). */
  setCrowded(cell: CellKey, extra: number): void;
  /**
   * Mischief: somebody climbing out of the water at (x, y, z), facing `heading`, if there is somewhere to
   * stand within reach (a quay, a beach, a dock): they stand a moment and then walk into town and in at the
   * nearest door. Null if there is nowhere to stand there.
   */
  ashore(x: number, y: number, z: number, heading: number, look: number): Person | null;
  /**
   * Mischief (src/life/mischief/thrown.ts): somebody out in the town is taken off their feet now (blown
   * over, picked up): out of their walk, their haunt and their errand (its chain hears it failed, as if
   * they had been called away), mode 'thrown', left exactly where they are for the caller to move. False
   * (and nothing done) for somebody indoors or gone.
   */
  upend(p: Person): boolean;
  /** The walking graph's node nearest a world point (-1 if none), as a person set down there would stand at. */
  nearestNode(x: number, y: number, z: number): number;
  /** The bikes by front doors, and who has one in hand (bikes.ts). */
  readonly bikes: Bikes;
  /** Mischief: a thrown person back on their feet in this node's cell (they stand where they are): they choose again. */
  settle(p: Person, node: number): void;
}

const KIND_WEIGHT: Partial<Record<SocketType, number>> = {
  'haunt-square': 4,
  'haunt-shop': 3,
  'haunt-cafe': 3,
  'haunt-bench': 2.5,
  'haunt-pier': 2,
  'haunt-garden': 2,
  'haunt-fountain': 2,
  'haunt-viewpoint': 1.5,
  'haunt-visit': 1.5,
};
/** Where a walker waiting for a single-file stretch stops in their cell (0 = where they came in, 1 = the far edge). */
const WAIT_AT = 0.2;
const TURN_RATE = 9;
/** L28: how much a child prefers somewhere to play over anywhere else (a square weighs 4). */
const PLAY_WEIGHT = 5;
/** L26: the small hop after turning to look: how long, how high. */
const JUMP = 0.36;
const JUMP_HEIGHT = 0.12;
/** A keeper's stay in the lighthouse: all night (they come down when it is day). */
const KEEPER_NIGHT = 1e9;
/** A walker more than this far (radians) from the way they are to go turns on the spot before stepping off. */
const FACE_FIRST = 1;
const DIR_HEADING = [Math.PI, Math.PI / 2, 0, -Math.PI / 2] as const; // N E S W as headings (0 faces +z)

const scratch = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

/** Who runs rather than walks: children, raiders, and anybody running from them (src/life/raid). */
const runs = (p: Person): boolean => p.child || p.raider === true || (p.brisk && (p.goal?.errand?.tag ?? '').startsWith('flee:'));
/** The gait now: a walk, a run, or (half of those running from raiders) a panic, arms up. */
const gait = (p: Person): 'walk' | 'run' | 'panic' => (!runs(p) ? 'walk' : !p.raider && !p.child && (p.goal?.errand?.tag ?? '').startsWith('flee:') && p.rank < 0.6 ? 'panic' : 'run');

export function createCrowd(opts: CrowdOptions = {}): Crowd {
  const people: Person[] = [];
  const byId = new Map<string, Person>();
  const atHome = new Map<StructureId, number>();
  const events = opts.events ?? {};
  let nav: NavGraph | null = null;
  let router: Router | null = null;
  let haunts: Haunt[] = [];
  let hauntById = new Map<string, Haunt>();
  let stranded = new Set<StructureId>();
  let jobs: Work[] = [];
  let seed = 0;
  let runCount = new Int16Array(0);
  let runSense = new Int8Array(0);
  /** Seconds since dusk began (0 by day): everyone has set off for home by PEOPLE.duskSpread. */
  let duskClock = 0;
  let planCursor = 0;
  const doors = createDoors();
  /** Cells with something standing in them a while, and how much dearer they are to cross (setCrowded). */
  const crowdedCells = new Map<CellKey, number>();
  /** The bikes by front doors and their riders. */
  const bikes = createBikes({ people, crowded: (cell) => crowdedCells.has(cell) }, opts.bikes || {});
  /** A walker's speed now: a rider's is a share more (or nothing, getting on or off). */
  const speedOf = (p: Person): number => p.speed * (bikes.inHand(p)?.v ?? 1);
  /** Cluttered cells (café tables, benches) where somebody sits now: routes go round them while they do. */
  let seated = new Set<number>();
  const updateSeated = (): void => {
    if (!nav || !router) return;
    const now = new Set<number>();
    for (const p of people) if (p.mode === 'linger' && p.seat >= 0 && p.node >= 0 && nav.nodes[p.node]!.clutter) now.add(p.node);
    for (const n of now) if (!seated.has(n)) router.setExtra(n, Math.max(PEOPLE.seatedExtra, crowdedCells.get(nav.nodes[n]!.cell) ?? 0));
    for (const n of seated) if (!now.has(n)) router.setExtra(n, crowdedCells.get(nav.nodes[n]!.cell) ?? 0);
    seated = now;
  };
  /** Shop doors (they stand open by day). */
  let shopDoors: string[] = [];

  // ── small helpers ─────────────────────────────────────────────────────
  const r = (p: Person, what: string, n = p.trips): number => rand(p.seed, what, n);
  const setHome = (home: StructureId, delta: number): void => {
    const count = Math.max(0, (atHome.get(home) ?? 0) + delta);
    atHome.set(home, count);
    events.home?.(home, count);
  };
  const homeDoor = (p: Person): NavDoor | null => (nav ? (usableDoors(nav, p.home)[0] ?? null) : null);
  const release = (p: Person): void => {
    if (p.held >= 0 && p.held < runCount.length && runCount[p.held]! > 0) runCount[p.held]!--;
    p.held = -1;
    p.queued = false;
  };
  const leaveHaunt = (p: Person): void => {
    if (p.goal?.haunt && p.goal.haunt.user === p) p.goal.haunt.user = null;
  };
  const clearWalk = (p: Person): void => {
    release(p);
    p.walk = null;
    p.at = 0;
    p.t = 0;
  };
  const place = (p: Person, node: number): void => {
    p.node = node;
    p.cell = nav!.nodes[node]!.cell;
  };
  const standAt = (p: Person, node: number): void => {
    const c = nodeCentre(nav!, node);
    place(p, node);
    p.x = c.x;
    p.z = c.z;
    p.y = nodeHeight(nav!, node);
  };

  // ── choosing where to go (L22, L25, L32) ───────────────────────────────
  /** Work that keeps somebody out when the rest go in: the lamplighter's round, the ringer's bell, the keeper's light, the baker's dawn. */
  const onDuty = (p: Person, time: TimeSignal): boolean => {
    const w = p.work;
    if (!w) return false;
    if (w.job === 'lamplighter') return (time.isDusk || time.isNight) && p.round < w.stations.length;
    if (w.job === 'bell-ringer') return time.isDusk && p.round === 0;
    if (w.job === 'keeper') return time.isDusk || time.isNight;
    if (w.job === 'baker') return time.isDawn;
    return false;
  };
  const mustBeHome = (p: Person, time: TimeSignal): boolean => {
    if (p.leaving) return false;
    if (time.isDay) return false;
    if (onDuty(p, time)) return false;
    if (time.isDawn) return p.rank > 0.35; // the early risers are out at dawn
    if (p.owl) return false;
    return duskClock >= p.rank * PEOPLE.duskSpread;
  };
  const homeGoal = (p: Person): Goal | null => {
    const door = homeDoor(p);
    if (!door) return null;
    return { kind: 'home', node: door.node, haunt: null, door, spot: null, face: NaN, pose: 'stand', linger: 0, seat: -1 };
  };
  const hauntGoal = (p: Person, h: Haunt): Goal => {
    const c = nodeCentre(nav!, h.node);
    const linger = PEOPLE.lingerMin + r(p, 'linger') * (PEOPLE.lingerMax - PEOPLE.lingerMin);
    const g: Goal = { kind: 'haunt', node: h.node, haunt: h, door: null, spot: null, face: NaN, pose: 'stand', linger, seat: -1 };
    const facing = (reach: number): void => {
      if (h.dir === undefined) return;
      const [dx, dz] = DIR4[h.dir]!;
      const side = (r(p, 'side') - 0.5) * 0.3;
      g.spot = { x: c.x + dx * reach - dz * side, z: c.z + dz * reach + dx * side };
      g.face = DIR_HEADING[h.dir]!;
    };
    const anywhere = (): void => {
      const a = r(p, 'angle') * Math.PI * 2, d = 0.08 + r(p, 'reach') * 0.14; // clear of whatever stands at the cell's edges
      g.spot = { x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d };
      g.face = r(p, 'face') * Math.PI * 2;
    };
    switch (h.type) {
      case 'haunt-square': {
        anywhere();
        const k = r(p, 'pose');
        g.pose = k < 0.5 ? 'stand' : k < 0.75 ? 'chat' : k < 0.88 ? 'look' : 'wave';
        break;
      }
      case 'haunt-garden':
        anywhere();
        g.pose = r(p, 'pose') < 0.7 ? 'tend' : 'stand';
        break;
      case 'haunt-shop': {
        // Half go in (a shop with a door); the rest stand at the window or the counter.
        const door = h.structure !== undefined ? usableDoors(nav!, h.structure).find((d) => d.node === h.node) : undefined;
        if (door && r(p, 'go-in') < 0.5) g.door = door;
        else {
          // At the window, close to the wall and off to one side of the doorway: the middle of the street is
          // left to whoever walks past (a shop on a lane one cell wide is the common case).
          const side = r(p, 'window') < 0.5 ? -0.27 : 0.27;
          if (h.dir !== undefined) {
            const [dx, dz] = DIR4[h.dir]!;
            g.spot = { x: c.x + dx * 0.3 - dz * side, z: c.z + dz * 0.3 + dx * side };
            g.face = DIR_HEADING[h.dir]!;
          }
          g.pose = r(p, 'pose') < 0.5 ? 'chat' : 'stand';
        }
        break;
      }
      case 'haunt-visit': {
        const door = h.structure !== undefined ? usableDoors(nav!, h.structure).find((d) => d.node === h.node) : undefined;
        if (door) g.door = door;
        else facing(0.2);
        break;
      }
      case 'haunt-cafe':
      case 'haunt-bench': {
        const seat = h.name !== undefined ? opts.seatAt?.(h.name) : null;
        g.pose = 'sit';
        if (seat && Math.abs(seat.x - c.x) <= 0.5 && Math.abs(seat.z - c.z) <= 0.5) {
          g.spot = { x: seat.x, z: seat.z };
          g.face = seat.face;
          g.seat = Math.max(0, seat.y - keyY(h.cell) * 0.8);
        } else if (h.dir !== undefined) {
          facing(0.05);
          g.seat = 0;
        } else {
          // Where the seat is not known (no frame for it), round the table: each seat its own place by its
          // number, facing the middle (two seats of one table never one spot).
          const n = Number((h.name ?? '').match(/(\d+)$/)?.[1] ?? 0);
          const a = n * (Math.PI / 2) + 0.4;
          g.spot = { x: c.x + Math.sin(a) * 0.24, z: c.z + Math.cos(a) * 0.24 };
          g.face = a + Math.PI;
          g.seat = 0;
        }
        break;
      }
      case 'haunt-pier':
        facing(0.3);
        g.pose = 'fish';
        g.linger *= 1.5;
        break;
      case 'haunt-fountain':
        facing(0.27);
        g.pose = r(p, 'pose') < 0.6 ? 'stand' : 'look';
        break;
      case 'haunt-viewpoint':
      case 'haunt-ship':
        facing(0.3);
        g.pose = 'look';
        break;
      case 'haunt-night':
        facing(0.3);
        g.pose = h.name === 'fisher' ? 'fish' : 'look';
        g.linger = 30 + r(p, 'linger') * 30;
        break;
      case 'workplace': {
        const [job, , ref] = (h.name ?? '').split('|');
        // The door they go in at: the workplace's, or for a miller's far station the windmill's.
        const building = job === 'miller' && ref ? Number(ref) : h.structure;
        const door = nav!.doors.find((d) => d.node === h.node && d.structure === building);
        const beside = (pose: PoseName, lo: number, hi: number): void => {
          // Beside the door, back to the wall, looking out.
          if (h.dir !== undefined) {
            const [dx, dz] = DIR4[h.dir]!;
            // Not in front of a shop's door, which stands open by day (L29): by its window.
            const side = door && shopDoors.includes(door.feature) ? -0.3 : r(p, 'side') < 0.5 ? -0.3 : 0.3;
            g.spot = { x: c.x - dx * 0.24 - dz * side, z: c.z - dz * 0.24 + dx * side };
            g.face = DIR_HEADING[h.dir]!;
          } else anywhere();
          g.pose = pose;
          g.linger = lo + r(p, 'linger') * (hi - lo);
        };
        switch (job) {
          case 'shopkeeper':
            beside('sweep', 14, 30);
            break;
          case 'baker':
            beside('carry', 14, 30);
            break;
          case 'miller':
            if (door) g.door = door;
            g.linger = 3 + r(p, 'linger') * 3;
            break;
          case 'keeper':
            if (door) g.door = door;
            g.linger = KEEPER_NIGHT; // until day (the visit case lets them out)
            break;
          case 'bell-ringer':
            if (door) g.door = door;
            g.linger = 8;
            break;
          case 'fisher':
            facing(0.3);
            g.pose = 'fish';
            g.linger = 30 + r(p, 'linger') * 30;
            break;
          case 'gardener':
            anywhere();
            g.pose = 'tend';
            g.linger = 12 + r(p, 'linger') * 14;
            break;
          case 'vendor':
            facing(0.16);
            g.pose = r(p, 'pose') < 0.5 ? 'chat' : 'stand';
            g.linger = 30 + r(p, 'linger') * 30;
            break;
          case 'guard':
            g.spot = { x: c.x, z: c.z };
            g.face = r(p, 'face') * Math.PI * 2;
            g.linger = 2 + r(p, 'linger') * 3;
            break;
          case 'lamplighter':
            g.spot = { x: c.x + (r(p, 'lx') - 0.5) * 0.2, z: c.z + (r(p, 'lz') - 0.5) * 0.2 };
            g.pose = 'wave'; // an arm up to the lamp
            g.linger = 0.6;
            break;
          default:
            anywhere();
        }
        break;
      }
      case 'haunt-play':
        anywhere();
        g.linger = h.name === 'kite' ? 15 + r(p, 'linger') * 15 : 1 + r(p, 'linger') * 1.5;
        break;
      case 'haunt-stoop':
        if (h.name === 'step') {
          facing(-0.3); // back against the house, on the step
          g.pose = 'sit';
          g.seat = 0;
        } else {
          facing(0.25);
          g.pose = 'tend';
        }
        break;
      default:
        anywhere();
    }
    if (g.spot && g.seat < 0) g.spot = freeSpot(p, h.node, g.spot);
    return g;
  };
  /**
   * People are solid: a spot to stand at that nobody else stands at or is on the way to (a busy square
   * shows people near each other, not inside each other). The spot asked for if it is free, else the
   * nearest free one round the cell.
   */
  const freeSpot = (p: Person, node: number, want: Point): Point => {
    const taken: Point[] = [];
    for (const q of people) {
      if (q === p || q.mode === 'gone' || q.mode === 'home' || q.mode === 'visit') continue;
      if (q.mode === 'linger' || q.mode === 'wait') {
        if (q.node === node) taken.push({ x: q.x, z: q.z });
      } else if (q.goal?.node === node && q.goal.spot) taken.push(q.goal.spot);
    }
    const free = (s: Point): boolean => taken.every((t) => Math.hypot(t.x - s.x, t.z - s.z) >= BODY + 0.08);
    if (free(want)) return want;
    const c = nodeCentre(nav!, node);
    let best = want, bestD = Infinity;
    for (let ring = 1; ring <= 2; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + ring * 0.4;
        const r = ring * 0.17;
        const s = { x: Math.max(c.x - 0.36, Math.min(c.x + 0.36, want.x + Math.cos(a) * r)), z: Math.max(c.z - 0.36, Math.min(c.z + 0.36, want.z + Math.sin(a) * r)) };
        // Not out where a door's leaf swings, by its wall.
        if (doorDirs(nav!, node).some((dir) => (s.x - c.x) * -DIR4[dir]![0] + (s.z - c.z) * -DIR4[dir]![1] > -0.05)) continue;
        const d = Math.hypot(s.x - want.x, s.z - want.z);
        if (free(s) && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (bestD < Infinity) break;
    }
    return best;
  };
  const pickHaunt = (p: Person, time: TimeSignal): Haunt | null => {
    if (!nav || p.node < 0) return null;
    const part = nav.part[p.node]!;
    const night = !time.isDay && !time.isDawn;
    const lastId = p.goal?.haunt?.id;
    const open: Haunt[] = [];
    const weights: number[] = [];
    const here = nav.nodes[p.node]!.cell;
    const strandedHome = stranded.has(p.home);
    // When it is windy, a kite is the thing (L28).
    const windy = p.child && opts.wind !== undefined && opts.wind(p.x, p.z).strength > PEOPLE.kiteWind;
    for (const h of haunts) {
      if (h.user !== null || h.id === lastId || nav.part[h.node] !== part) continue;
      let w: number;
      if (strandedHome) w = h.type === 'haunt-stoop' && h.structure === p.home ? 1 : 0;
      else if (night) w = h.type === 'haunt-night' && p.owl ? 1 : 0;
      else if (h.type === 'haunt-ship') w = opts.favour?.(h) ?? 0;
      else if (h.type === 'haunt-play') w = !p.child ? 0 : h.name !== 'kite' ? PLAY_WEIGHT : windy ? PLAY_WEIGHT * 2 : 1;
      else w = h.type === 'haunt-visit' && h.structure === p.home ? 0 : (KIND_WEIGHT[h.type] ?? 0);
      if (w <= 0) continue;
      open.push(h);
      weights.push(w);
    }
    if (open.length === 0) return null;
    // The kind first, by its weight, whatever the number of places of that kind; then a place of that
    // kind, nearer ones more likely. Flying a kite and chasing pigeons are two kinds of play.
    const kindOf = (h: Haunt): string => (h.type === 'haunt-play' ? `play:${h.name ?? ''}` : h.type);
    const kinds = [...new Set(open.map(kindOf))];
    const kind = kinds[Math.min(kinds.length - 1, pickIndex(kinds.map((k) => weights[open.findIndex((h) => kindOf(h) === k)]!), r(p, 'kind')))]!;
    const of = open.filter((h) => kindOf(h) === kind);
    const near = of.map((h) => 1 / (6 + Math.abs(keyX(h.cell) - keyX(here)) + Math.abs(keyZ(h.cell) - keyZ(here))));
    return of[pickIndex(near, r(p, 'place'))]!;
  };
  /** Where their job wants them now, if anywhere. */
  const workGoal = (p: Person, time: TimeSignal): Goal | null => {
    const w = p.work;
    if (!w || !nav || p.node < 0 || w.stations.length === 0) return null;
    const to = (i: number): Goal | null => {
      const h = w.stations[i]!;
      if (nav!.part[h.node] !== nav!.part[p.node]) return null;
      p.station = i;
      return hauntGoal(p, h);
    };
    switch (w.job) {
      case 'lamplighter':
        return onDuty(p, time) ? to(p.round) : null;
      case 'bell-ringer':
      case 'keeper':
        return onDuty(p, time) ? to(0) : null;
      case 'baker':
        if (time.isDawn) return to(0);
        break;
      default:
    }
    if (!time.isDay) return null;
    // By day: mostly at work, sometimes off like anybody else. A guard and a miller keep to their round.
    const keen = w.job === 'guard' || w.job === 'miller' ? 0.92 : 0.7;
    if (r(p, 'work') >= keen) return null;
    return to(w.stations.length > 1 ? (p.station + 1) % w.stations.length : 0);
  };
  /** What a person does next, as a goal waiting for its route. Null: nothing to do, stay. */
  const nextGoal = (p: Person, time: TimeSignal, fromHome: boolean): Goal | null => {
    p.trips++;
    if (p.leaving) return leaveGoal(p);
    // The town's chains first: an errand under way goes on; a new one may be offered.
    const e = opts.errands?.next(p, time);
    if (e) {
      const g = errandGoal(p, e);
      if (g) return g;
      opts.errands!.failed(p, e);
    }
    // Their bike: in hand, it goes home with them; left somewhere, they go for it.
    const bike = bikes.next(p, fromHome && mustBeHome(p, time));
    if (bike === 'home') {
      const g = homeGoal(p);
      if (g) return g;
    } else if (bike && !p.load) return { kind: 'haunt', node: bike.node, haunt: null, door: null, spot: freeSpot(p, bike.node, bike.spot), face: bike.face, pose: 'stand', linger: 0.3, seat: -1 };
    // Something still in their hands that no errand wants: it goes home with them.
    if (p.load) return fromHome ? null : homeGoal(p);
    const work = workGoal(p, time);
    if (work) return work;
    if (mustBeHome(p, time)) return fromHome ? null : homeGoal(p);
    // Out and about: mostly on to another place, sometimes home for a while.
    if (!fromHome && r(p, 'home') < 0.28) return homeGoal(p);
    const h = pickHaunt(p, time);
    if (h) return hauntGoal(p, h);
    return fromHome ? null : homeGoal(p);
  };
  /** The goal for an errand's step, or null if its place is not on the graph (or not where they can walk). */
  const errandGoal = (p: Person, e: ErrandStep): Goal | null => {
    if (!nav) return null;
    const node = nav.nodeAt.get(e.cell);
    if (node === undefined || (p.node >= 0 && nav.part[node] !== nav.part[p.node])) return null;
    let door: NavDoor | null = null;
    if (e.door) {
      door = nav.doors.find((d) => d.feature === e.door!.feature && d.structure === e.door!.structure && d.node === node) ?? null;
      if (!door) return null;
    }
    // A spot is in its own cell (a chain that falls back to another cell may keep its first one's spot: the walk
    // would end in a snap across to it).
    const c = nodeCentre(nav, node);
    const inCell = e.spot ? { x: Math.max(c.x - 0.45, Math.min(c.x + 0.45, e.spot.x)), z: Math.max(c.z - 0.45, Math.min(c.z + 0.45, e.spot.z)) } : null;
    const spot = door ? null : inCell ? freeSpot(p, node, inCell) : null;
    return { kind: 'errand', node, haunt: null, door, spot, face: e.face, pose: e.pose, linger: e.linger, seat: -1, errand: e };
  };
  const leaveGoal = (p: Person): Goal | null => {
    if (!nav || p.node < 0) return null;
    const part = nav.part[p.node]!;
    const here = nav.nodes[p.node]!.cell;
    // Out of the water already: they go in, not back out to sea.
    const inland = p.ashore === true;
    let best: Haunt | null = null;
    let bestD = Infinity;
    for (const h of haunts) {
      if (h.type !== 'way-out' || nav.part[h.node] !== part) continue;
      // Out over the water or off the map's edge, where they can step out of view, before a dead end.
      const d = Math.abs(keyX(h.cell) - keyX(here)) + Math.abs(keyZ(h.cell) - keyZ(here)) + (edgeOf(h.node) ? 0 : 1000);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (!inland && best && edgeOf(best.node)) return { kind: 'leave', node: best.node, haunt: null, door: null, spot: null, face: NaN, pose: 'stand', linger: 0, seat: -1 };
    // No water or map's edge to step out of view at: they go in at the nearest door instead (gone inside, not
    // shrunk away where they stand; nothing in the town shrinks out of existence).
    let door: NavDoor | null = null;
    let doorD = Infinity;
    for (const d of nav.doors) {
      if (d.node < 0 || nav.part[d.node] !== part) continue;
      const c = nav.nodes[d.node]!.cell;
      const dd = Math.abs(keyX(c) - keyX(here)) + Math.abs(keyZ(c) - keyZ(here));
      if (dd < doorD) {
        doorD = dd;
        door = d;
      }
    }
    if (door) return { kind: 'leave', node: door.node, haunt: null, door, spot: null, face: NaN, pose: 'stand', linger: 0, seat: -1 };
    if (!best) return null;
    return { kind: 'leave', node: best.node, haunt: null, door: null, spot: null, face: NaN, pose: 'stand', linger: 0, seat: -1 };
  };

  /** The side of a node's cell that gives onto open water or the map's edge, as a unit (x, z), or null. */
  let terrain: ShapePlan['terrain'] | null = null;
  let blocks: ShapePlan['structureAt'] | null = null;
  const edgeOf = (node: number): [number, number] | null => {
    if (!nav || !terrain || node < 0) return null;
    const c = nav.nodes[node]!.cell;
    const x = keyX(c), y = keyY(c), z = keyZ(c);
    let best: [number, number] | null = null;
    for (const [dx, dz] of DIR4) {
      const nx = x + dx, nz = z + dz;
      const off = nx < 0 || nz < 0 || nx >= SIZE_X || nz >= SIZE_Z;
      if (!off) {
        if (terrain.height[columnIndex(nx, nz)] !== 0) continue;
        const n = key(nx, y, nz);
        if (nav.nodeAt.has(n) || blocks?.has(n)) continue;
      }
      // Water before the map's edge.
      if (!best || !off) best = [dx, dz];
      if (!off) break;
    }
    if (!best) return null;
    // How far out of view: off a dock's end it is a step down into a boat; down a beach, a wade.
    const out = nav.nodes[node]!.surface === 'deck' ? 0.45 : terrain.height[columnIndex(x, z)] !== 0 && nav.nodes[node]!.surface === 'sand' ? 1.6 : 0.7;
    return [best[0] * out, best[1] * out];
  };

  /** Seconds to walk the way out of view at the water or the map's edge, at a stroll. */
  const edgeTime = (p: Person): number => Math.hypot(p.edgeX, p.edgeZ) / (p.speed * 0.8);

  // ── routes ────────────────────────────────────────────────────────────
  /** Plans the walk to `goal` and starts it. False if there is no route. */
  const startWalk = (p: Person, goal: Goal): boolean => {
    if (!nav || !router || p.node < 0 || goal.node < 0) return false;
    const free = [p.home];
    if (goal.haunt?.structure !== undefined) free.push(goal.haunt.structure);
    if (goal.door) free.push(goal.door.structure);
    if (p.inside) free.push(p.inside.structure);
    const route = router.find(p.node, goal.node, free);
    if (!route) return false;
    // A bike: taken from its wall for a long trip, or ridden or wheeled on from here (or laid down to run).
    if (now) bikes.plan(p, route, goal, now);
    const inside = p.mode === 'home' ? homeDoor(p) : p.mode === 'visit' ? p.inside : null;
    const pieces = buildWalk(nav, route, {
      ...(inside ? { startDoor: inside } : { from: { x: p.x, z: p.z } }),
      ...(goal.door ? { endDoor: goal.door } : goal.spot ? { to: goal.spot } : {}),
      // A raider runs his own line across the width of the way (a mob spread over the street, not a file).
      lane: p.raider ? (rand(p.seed, 'lane', p.trips) - 0.5) * 0.56 : PEOPLE.lane * (0.75 + rand(p.seed, 'lane') * 0.5),
      ...(opts.doorAt ? { doorAt: opts.doorAt } : {}),
    });
    if (p.mode === 'home') setHome(p.home, -1);
    leaveHaunt(p);
    clearWalk(p);
    if (goal.haunt && !goal.door) goal.haunt.user = p;
    p.goal = goal;
    p.want = null;
    p.walk = pieces;
    p.inside = null;
    p.mode = 'walk';
    p.dodge = p.dodgeTo = p.dodgeV = p.offX = p.offZ = 0;
    p.visible = true;
    p.pose = gait(p);
    p.seat = -1;
    p.stuck = 0;
    p.flying = false;
    // An errand's load is in their hands on the way; whatever else they hold stays in their hands (nothing
    // vanishes in view) until they are home with it (nextGoal sends them there next).
    p.load = goal.errand ? goal.errand.load : p.load;
    p.carrying = p.load !== null || (goal.haunt?.type === 'workplace' && (p.work?.job === 'miller' || p.work?.job === 'baker'));
    p.brisk = (goal.haunt?.type === 'workplace' && p.work?.job === 'lamplighter') || goal.errand?.brisk === true;
    bikes.started(p, pieces);
    enterPiece(p);
    return true;
  };
  const enterPiece = (p: Person): void => {
    const piece = p.walk![p.at]!;
    // Into the doorway at the end of the walk: the bike is leaned by that door (or put back on its wall) now.
    if (piece.kind === 'door' && piece.enter && p.at === p.walk!.length - 1 && p.goal) bikes.arrive(p, p.goal);
    else bikes.entered(p, p.goal);
    p.visible = piece.kind !== 'hide';
    if (piece.node !== p.node) {
      place(p, piece.node);
      if (piece.kind === 'move') events.passed?.(p.cell, p);
    }
    pieceAt(piece, p.t, scratch);
    p.x = scratch.x;
    p.y = scratch.y;
    p.z = scratch.z;
  };
  const senseOf = (link: number, from: number): number => {
    const l = nav!.links[link]!;
    const to = l.a === from ? l.b : l.a;
    const dh = nodeHeight(nav!, to) - nodeHeight(nav!, from);
    return dh > 0 ? 1 : dh < 0 ? -1 : nav!.nodes[to]!.cell > nav!.nodes[from]!.cell ? 1 : -1;
  };
  /** May this walker go on into the single-file stretch at the end of their piece? Takes it if so. */
  const mayEnter = (p: Person, piece: Piece): boolean => {
    // Raiders shove through a narrow way, never waiting their turn at it (and never holding it from others).
    if (p.raider) return true;
    if (piece.link < 0) return true;
    const run = nav!.runOf[piece.link]!;
    if (run < 0 || p.held === run) return true;
    const sense = senseOf(piece.link, piece.node);
    if (runCount[run]! > 0 && runSense[run] !== sense) return false;
    release(p);
    runCount[run]!++;
    runSense[run] = sense;
    p.held = run;
    return true;
  };
  const arrive = (p: Person): void => {
    const goal = p.goal;
    clearWalk(p);
    p.carrying = false;
    p.brisk = false;
    if (goal?.haunt?.type === 'workplace' && p.work) {
      if (p.work.job === 'lamplighter') {
        events.lamp?.(p.work.refs[p.station] ?? '', p);
        p.round = Math.max(p.round, p.station + 1);
      } else if (p.work.job === 'bell-ringer') {
        p.round = 1;
        if (p.work.structure !== undefined) events.bell?.(p.work.structure, p);
      }
    }
    if (!goal) {
      p.mode = 'linger';
      p.timer = 2;
      return;
    }
    // The chain hears first: it sets down, picks up, fills a stall (and may change what is in their hands).
    if (goal.errand) opts.errands?.arrived(p, goal.errand);
    // A bike in hand is leaned where they stop (or put back on its wall at home).
    bikes.arrive(p, goal);
    if (goal.kind === 'home') {
      p.load = null; // put away inside
      p.mode = 'home';
      p.visible = false;
      p.timer = PEOPLE.homeMin + r(p, 'home-stay') * (PEOPLE.homeMax - PEOPLE.homeMin);
      setHome(p.home, 1);
    } else if (goal.kind === 'leave' && goal.door) {
      // In at a door, and gone.
      remove(p);
    } else if (goal.kind === 'leave') {
      p.mode = 'linger';
      p.pose = 'wave';
      p.poseTime = 0;
      p.timer = PEOPLE.fade;
      // Down into the water, or off the edge, if there is one: they walk on out of view.
      const edge = edgeOf(p.node);
      p.edgeX = edge?.[0] ?? 0;
      p.edgeZ = edge?.[1] ?? 0;
      if (edge) {
        p.pose = 'walk';
        p.timer = p.fadeTime = edgeTime(p);
      }
    } else if (goal.door) {
      p.mode = 'visit';
      p.visible = false;
      p.inside = goal.door;
      p.timer = goal.linger;
    } else {
      p.mode = 'linger';
      p.pose = goal.pose;
      p.poseTime = 0;
      p.seat = goal.seat;
      p.timer = goal.linger;
    }
  };

  // ── doors (L29) ───────────────────────────────────────────────────────
  /** The doors this walker needs open now: the one they are in, about to reach, or just came out of. */
  /** The doors opening onto each node (for whoever stands on a doorstep). */
  let doorsAt = new Map<number, NavDoor[]>();
  let doorsFor: NavGraph | null = null;
  const claimDoors = (p: Person): void => {
    // Nobody is shut in a door's swing: somebody standing on its doorstep holds it open.
    if (nav && p.visible && p.node >= 0 && p.mode !== 'home' && p.mode !== 'visit' && p.mode !== 'gone') {
      if (doorsFor !== nav) {
        doorsFor = nav;
        doorsAt = new Map();
        for (const d of nav.doors) if (d.node >= 0 && d.dir !== undefined) doorsAt.set(d.node, [...(doorsAt.get(d.node) ?? []), d]);
      }
      for (const d of doorsAt.get(p.node) ?? []) {
        const [dx, dz] = DIR4[d.dir!]!;
        const tx = keyX(d.cell) + 0.5 + dx * 0.5, tz = keyZ(d.cell) + 0.5 + dz * 0.5;
        if (doors.open(d.feature) > 0 && Math.abs(p.x - tx) < 0.45 && Math.abs(p.z - tz) < 0.45 && Math.hypot(p.x - tx, p.z - tz) < 0.42) doors.claim(d.feature);
      }
    }
    if (p.mode !== 'walk' || !p.walk) return;
    const walk = p.walk;
    const cur = walk[p.at]!, next = walk[p.at + 1], prev = walk[p.at - 1];
    if (cur.kind === 'door' && cur.door) {
      doors.claim(cur.door.feature);
      doors.passing(cur.door.feature, cur.enter);
    }
    if (next?.kind === 'door' && next.door) {
      if (cur.kind === 'move' && (1 - p.t) * cur.length < DOORS.reach) doors.claim(next.door.feature);
      else if (cur.kind === 'hide' && (1 - p.t) * cur.seconds < DOORS.lead) doors.claim(next.door.feature);
    }
    if (prev?.kind === 'door' && prev.door && !prev.enter && cur.kind === 'move' && p.t * cur.length < DOORS.clear) doors.claim(prev.door.feature);
  };

  // ── moving ────────────────────────────────────────────────────────────
  const turnTo = (p: Person, target: number, dt: number): void => {
    let d = target - p.heading;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    const max = TURN_RATE * dt;
    p.heading += d > max ? max : d < -max ? -max : d;
  };
  /** How far aside a walker may step on this piece now: none in a doorway or a single-file stretch, little by clutter, and less and less toward where the walk ends or narrows. */
  const asideRoom = (p: Person, piece: Piece): number => {
    if (piece.kind !== 'move' || !nav) return 0;
    const node = nav.nodes[piece.node]!;
    const inRun = (link: number): boolean => link >= 0 && nav!.runOf[link]! >= 0;
    const prev = p.walk![p.at - 1];
    // Inside a single-file stretch (both ends of the piece in it): no room at all.
    if (prev && inRun(prev.link) && inRun(piece.link)) return 0;
    // By a door the leaf swings out over the side of the cell: little room there.
    let room = node.clutter ? AVOID.roomCluttered : AVOID.room;
    const next = p.walk![p.at + 1];
    const narrows = !next || next.kind !== 'move' || inRun(piece.link);
    // Queued at the mouth of a single-file stretch, they stand aside to let the others out.
    if (narrows && !p.queued) room *= Math.min(1, ((1 - p.t) * piece.length) / AVOID.settle);
    if ((prev && prev.kind !== 'move') || (prev && inRun(prev.link))) room *= Math.min(1, (p.t * piece.length) / AVOID.settle);
    return room;
  };
  /** Moves a walker aside from their line by `dodge`, eased toward `dodgeTo`, and keeps them in their cell. */
  const stepAside = (p: Person, piece: Piece, dt: number, moved: number, turning: boolean): void => {
    const len = Math.hypot(scratch.dx, scratch.dz);
    if (len < 1e-8) return;
    const rx = -scratch.dz / len, rz = scratch.dx / len; // right of the way it goes
    const room = asideRoom(p, piece);
    const want = Math.max(-room, Math.min(room, p.dodgeTo));
    const was = p.dodge;
    // The step aside is kept as a world offset (offX, offZ), so a change of direction from one piece to
    // the next turns it smoothly instead of swinging the walker across. `dodge` is its part to the right.
    p.dodge = p.offX * rx + p.offZ * rz;
    // Mostly while walking, as part of a stride. Held up, a slower side step out (to get by), and only when
    // facing the way (else it would be a step backwards); never a shuffle back and forth (the target
    // changes only with the one person in the way).
    let off = Math.atan2(scratch.dx, scratch.dz) - p.heading;
    off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
    const facing = Math.abs(off) < 0.5;
    const outward = Math.abs(want) > Math.abs(p.dodge);
    let rate = turning || !facing ? 0 : moved > 1e-6 ? AVOID.rate : p.queued && outward ? AVOID.rate * 0.6 : 0;
    // A side step gathers pace (a third of a second), so the body has turned into it first.
    rate = Math.min(rate, Math.abs(p.dodgeV) + 1.2 * dt);
    // Where the offset should be: `want` to the right, nothing along the way (that part is let go at once
    // as the way turns, at the walker's own pace, never faster than it walks).
    let tx = rx * want, tz = rz * want;
    if (Math.abs(p.dodge) > room + 1e-9) {
      const keep = Math.sign(p.dodge) * room;
      tx = rx * keep;
      tz = rz * keep;
    }
    // By a door, never aside toward its wall: its leaf swings out there.
    for (const d of doorDirs(nav!, piece.node)) {
      const [wx, wz] = DIR4[d]!;
      const toward = -(tx * wx + tz * wz);
      if (toward > 0) {
        tx += wx * toward;
        tz += wz * toward;
      }
    }
    // Across the way: at the side-step rate. Along it (left over from before a turn): let go no faster
    // than half of what it walked this frame, so it never puts a step backwards into the walk.
    const fx = scratch.dx / len, fz = scratch.dz / len;
    const ex = tx - p.offX, ez = tz - p.offZ;
    const eLat = ex * rx + ez * rz, eAlong = ex * fx + ez * fz;
    // (Not while turning on the spot: that would slide them sideways, or backwards, before they face the way.)
    const shrinkRoom = Math.abs(p.dodge) > room + 1e-9 && !turning ? AVOID.rate * 2 : 0;
    const latMost = Math.max(rate, shrinkRoom) * dt;
    const alongMost = moved * 0.5;
    const dLat = Math.max(-latMost, Math.min(latMost, eLat));
    const dAlong = Math.max(-alongMost, Math.min(alongMost, eAlong));
    let nx = p.offX + rx * dLat + fx * dAlong, nz = p.offZ + rz * dLat + fz * dAlong;
    if (nx !== p.offX || nz !== p.offZ) {
      // Never a step aside into somebody beside.
      for (const q of people) {
        if (q === p || !q.visible || q.mode === 'gone' || q.mode === 'hop' || q.mode === 'thrown' || q.mode === 'home' || q.mode === 'visit') continue;
        const dx = q.x - p.x, dz = q.z - p.z;
        if (dx > 0.4 || dx < -0.4 || dz > 0.4 || dz < -0.4 || Math.abs(q.y - p.y) > 0.3) continue;
        // p.x, p.z is the line here (the offset is added below).
        const dNew = Math.hypot(dx - nx, dz - nz), dOld = Math.hypot(dx - p.offX, dz - p.offZ);
        if (dNew < KEEP && dNew < dOld) {
          nx = p.offX;
          nz = p.offZ;
          break;
        }
      }
    }
    p.offX = nx;
    p.offZ = nz;
    p.dodge = nx * rx + nz * rz;
    p.dodgeV = dt > 0 ? (p.dodge - was) / dt : 0;
    if (nx === 0 && nz === 0) return;
    const bx = p.x, bz = p.z;
    p.x += nx;
    p.z += nz;
    // Never out of its cell across the way it goes (a wall, a fence, water or a building may be there);
    // the line itself may run nearer the side, and stays where it is.
    const c = nav!.nodes[piece.node]!.cell;
    const x0 = keyX(c), z0 = keyZ(c);
    if (Math.abs(scratch.dx) < Math.abs(scratch.dz)) p.x = Math.max(Math.min(bx, x0 + AVOID.margin), Math.min(Math.max(bx, x0 + 1 - AVOID.margin), p.x));
    else p.z = Math.max(Math.min(bz, z0 + AVOID.margin), Math.min(Math.max(bz, z0 + 1 - AVOID.margin), p.z));
    // And on a turn, not across its other sides either.
    p.x = Math.max(x0 + 1e-4, Math.min(x0 + 1 - 1e-4, p.x));
    p.z = Math.max(z0 + 1e-4, Math.min(z0 + 1 - 1e-4, p.z));
  };

  /** Somebody stands on the doorstep (or the spot under a hatch): whoever is inside waits to come out. */
  const doorstepTaken = (p: Person, piece: Piece): boolean => {
    for (const q of people) {
      if (q === p || !q.visible || q.mode === 'gone' || q.mode === 'home' || q.mode === 'visit' || q.mode === 'hop' || q.mode === 'thrown') continue;
      if (q.mode === 'walk' && q.walk![q.at]!.kind !== 'move') continue;
      // Somebody waiting on the doorstep to go in through this very door waits for us: no standoff
      // (under a roof hatch the one waiting below stands on the spot the one coming down lands on).
      const theirs = q.mode === 'walk' ? q.walk![q.at + 1] : undefined;
      if (q.queued && theirs?.kind === 'door' && theirs.enter && theirs.door?.feature === piece.door?.feature) continue;
      if (Math.abs(q.y - piece.base) > 0.3) continue;
      if (Math.hypot(q.x - piece.x1, q.z - piece.z1) < BODY + 0.06) return true;
    }
    return false;
  };

  const advance = (p: Person, dt: number): void => {
    const px0 = p.x, pz0 = p.z;
    const walk = p.walk!;
    let left = dt;
    let moved = 0;
    let turning = false;
    p.queued = false;
    // On a bike: a share more than their walk (or still, getting on or off); a rider never turns on the spot.
    const bike = bikes.pace(p, dt);
    const riding = bikes.mounted(p);
    for (let guard = 0; guard < 32 && left > 1e-9; guard++) {
      const piece = walk[p.at]!;
      let rate: number; // share of the piece per second
      let limit = 1;
      if (piece.kind === 'move') {
        // Turn first, then walk: nobody sets off backwards. (A rider turns as they ride, never on the spot:
        // only if something has turned them right round while stopped do they turn before going on.)
        pieceAt(piece, p.t, scratch);
        if (scratch.dx * scratch.dx + scratch.dz * scratch.dz > 1e-8) {
          const want = Math.atan2(scratch.dx, scratch.dz);
          let d = want - p.heading;
          d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
          if ((d > FACE_FIRST || d < -FACE_FIRST) && (!riding || d > 1.5 || d < -1.5)) {
            turnTo(p, want, left);
            turning = true;
            break;
          }
        }
      }
      if (piece.kind === 'hide') rate = 1 / Math.max(0.05, piece.seconds);
      else {
        const speed = p.speed * bike * piece.pace * (piece.kind === 'door' ? 1 : p.slow) * (p.brisk ? PEOPLE.lampPace : 1) * (p.load !== null && HEAVY.has(p.load) ? PEOPLE.laden : 1);
        rate = speed / piece.length;
        if (piece.kind === 'move' && !mayEnter(p, piece)) {
          limit = WAIT_AT;
          p.queued = true;
        }
        // L29: nobody steps into a doorway until its door is open, nor while somebody is coming the other way.
        const next = walk[p.at + 1];
        if (piece.kind === 'move' && next?.kind === 'door' && next.enter && next.door && (!doors.ready(next.door.feature) || doors.comingOut(next.door.feature) > 0)) {
          // Under a roof hatch the one coming down lands where the one waiting would stand: wait a body back.
          const back = next.door.feature.startsWith('hatch@') ? DOORS.wait + 2 * BODY + 0.06 : DOORS.wait;
          limit = Math.min(limit, Math.max(p.t, 1 - back / piece.length));
          p.queued = true;
        } else if (piece.kind === 'door' && piece.door && p.t === 0 && (!doors.ready(piece.door.feature) || (!piece.enter && (doors.goingIn(piece.door.feature) > 0 || doorstepTaken(p, piece))))) {
          limit = 0;
          p.queued = true;
        }
      }
      const room = limit - p.t;
      if (room <= 0) break; // waiting
      const need = rate > 0 ? room / rate : Infinity;
      if (need > left) {
        p.t += left * rate;
        if (piece.kind !== 'hide') moved += left * rate * piece.length;
        break;
      }
      left -= need;
      if (piece.kind !== 'hide') moved += room * piece.length;
      p.t = limit;
      if (limit < 1) break;
      // On to the next piece.
      if (p.at + 1 >= walk.length) {
        pieceAt(piece, 1, scratch);
        p.x = scratch.x;
        p.y = scratch.y;
        p.z = scratch.z;
        arrive(p);
        return;
      }
      const crossed = piece.link;
      p.at++;
      p.t = 0;
      const next = walk[p.at]!;
      if (crossed >= 0 && p.held >= 0 && (next.link < 0 || nav!.runOf[next.link] !== p.held)) release(p);
      enterPiece(p);
    }
    const piece = walk[p.at]!;
    pieceAt(piece, p.t, scratch);
    p.x = scratch.x;
    p.y = scratch.y;
    p.z = scratch.z;
    p.visible = piece.kind !== 'hide';
    const fx = scratch.dx, fz = scratch.dz;
    const lineX = p.x, lineZ = p.z;
    stepAside(p, piece, dt, moved, turning);
    {
      // Never a shuffle backwards: held up nearly still, a step aside and a turn of the way can add up to a
      // few millimetres behind them. Then they stay where they were this frame (the step aside waits).
      const mx = p.x - px0, mz = p.z - pz0, md = Math.hypot(mx, mz);
      if (md > 1e-5 && md < 0.02 && piece.kind === 'move' && (Math.sin(p.heading) * mx + Math.cos(p.heading) * mz) / md < -0.3) {
        p.x = px0;
        p.z = pz0;
        p.offX = px0 - lineX;
        p.offZ = pz0 - lineZ;
      }
    }
    if (!turning && fx * fx + fz * fz > 1e-8 && piece.kind !== 'hide') {
      // The body turns with the way it really goes, a step aside included (nobody strafes), but never
      // more than a little off the way of the walk.
      const way = Math.atan2(fx, fz);
      const mx = p.x - px0, mz = p.z - pz0;
      let want = way;
      if (mx * mx + mz * mz > 1e-7) {
        let d = Math.atan2(mx, mz) - way;
        d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        want = way + Math.max(-0.75, Math.min(0.75, d));
      }
      turnTo(p, want, dt);
    }
    if (moved > 0.02 * dt * 30) p.rethought = false;
    if (moved > 1e-6) {
      p.stride += (moved * PERSON.stepsPerCell * 0.5) / (p.child ? 0.8 : 1);
      p.pose = gait(p);
      p.stuck = p.stuck < 0 ? Math.min(0, p.stuck + dt) : 0;
    } else {
      // Held up: stand, do not march on the spot.
      p.pose = 'stand';
      p.poseTime += dt;
      p.stride = Math.round(p.stride * 2) / 2;
      if (piece.kind !== 'hide' && !p.queued && !turning) p.stuck = p.stuck < 0 ? Math.min(0, p.stuck + dt) : p.stuck + dt;
    }
  };
  /** How much of their speed each walker keeps, from who is just ahead of them (L24: people queue). */
  /** Too busy to stop: on the lamp round, or called home by the dusk. */
  let now: TimeSignal | null = null;
  const onDutyNow = (p: Person): boolean => now !== null && (onDuty(p, now) || mustBeHome(p, now));
  // ── L50: the scuffle ──────────────────────────────────────────────────
  let inns = new Set<StructureId>();
  let shapeNow: ShapePlan | null = null;
  const scuffles = createScuffles({
    people,
    nav: () => nav,
    shape: () => shapeNow,
    busy: (p) => onDutyNow(p) || (p.work !== null && now !== null && onDuty(p, now)),
    seed: () => seed,
    innGoal(p) {
      if (!nav || p.node < 0) return null;
      const part = nav.part[p.node];
      let best: Haunt | null = null, bestD = Infinity;
      for (const h of haunts) {
        if (h.structure === undefined || !inns.has(h.structure) || (h.type !== 'haunt-visit' && h.type !== 'haunt-shop') || nav.part[h.node] !== part) continue;
        const d = Math.abs(keyX(h.cell) - keyX(p.cell)) + Math.abs(keyZ(h.cell) - keyZ(p.cell));
        if (d < bestD || (d === bestD && best !== null && h.id < best.id)) {
          bestD = d;
          best = h;
        }
      }
      if (!best) return null;
      const g = hauntGoal(p, best);
      const door = best.structure !== undefined ? usableDoors(nav, best.structure).find((d) => d.node === best.node) : undefined;
      if (door) {
        g.door = door;
        g.spot = null;
      }
      g.linger = 20 + r(p, 'inn') * 15;
      return g;
    },
    events: {
      scuffle: (s, what) => events.scuffle?.(s, what),
    },
    respond: (s) => opts.respond?.(s) ?? null,
    ...(opts.scuffle ? { dials: opts.scuffle } : {}),
  });
  const follow = (dt: number): void => {
    const bodies = opts.obstacles?.() ?? null;
    for (const p of people) {
      p.slow = 1;
      if (p.mode !== 'walk' || !p.visible) continue;
      // Never a standstill. Held up five seconds (a knot nobody can step out of), think again and go
      // another way, or somewhere else; only if there is nowhere else, squeeze past (stuck < 0 counts that down).
      if (p.stuck > 3 && !p.rethought && !p.want && now && p.walk![p.at]!.kind === 'move' && p.walk![p.at + 1]?.kind !== 'door') {
        p.want = nextGoal(p, now, false);
        p.rethought = true;
        // Thinking again is not being held up: the new walk starts afresh. Held up again before getting
        // anywhere, the count runs on to squeezing past.
        if (p.want) p.stuck = 0;
      }
      if (p.stuck > 4.5) {
        // L50: squeezing past somebody, now and then, is a scuffle.
        const fx0 = Math.sin(p.heading), fz0 = Math.cos(p.heading);
        let in_: Person | null = null;
        for (const q of people) {
          if (q === p || q.mode !== 'walk' || !q.visible) continue;
          const dx = q.x - p.x, dz = q.z - p.z;
          if (dx * fx0 + dz * fz0 > 0 && dx * dx + dz * dz < 0.36 && Math.abs(q.y - p.y) < 0.3) in_ = q;
        }
        if (in_ && !bikes.inHand(p) && !bikes.inHand(in_) && scuffles.bump(p, in_, 0, true)) continue;
        p.stuck = -1.5;
      }
      if (p.stuck < 0) continue;
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      // A rider's bike reaches this far ahead of them: they keep that much farther back, and look farther.
      const nose = bikes.mounted(p) ? BIKE_NOSE : 0;
      for (const q of people) {
        if (q === p || !q.visible || q.mode !== 'walk') continue;
        // A raiding band is a mob: they jostle through one another (src/life/raid), never queue.
        if (p.raider && q.raider) continue;
        const dx = q.x - p.x, dz = q.z - p.z;
        const near = 0.6 + nose * 2;
        if (dx > near || dx < -near || dz > near || dz < -near || Math.abs(q.y - p.y) > 0.3) continue;
        // Two people meeting (L26): going opposite ways, about to pass, on open ground. Once per meeting.
        if (p.id < q.id && p.lastMet !== q && Math.sin(q.heading) * fx + Math.cos(q.heading) * fz < -0.5 && dx * dx + dz * dz < 0.2) {
          p.lastMet = q;
          q.lastMet = p;
          // L50: a head-on bump, now and then, is a scuffle.
          if (!bikes.inHand(p) && !bikes.inHand(q) && scuffles.bump(p, q, Math.abs(dx * fz - dz * fx), false)) continue;
          // (Nobody with a bike in hand stops for a chat: they ride or wheel on.)
          const open = (w: Person): boolean =>
            !bikes.inHand(w) &&
            w.chat <= 0 && w.chatRest <= 0 && w.startled <= 0 && !w.scuffle && w.held < 0 && !w.queued && !w.leaving && !w.carrying && w.fade >= 1 && w.walk![w.at]!.kind === 'move' && !onDutyNow(w);
          if (open(p) && open(q) && rand(p.seed, 'chat', q.seed, p.trips) < PEOPLE.chat) {
            const t = PEOPLE.chatTime * (0.6 + 0.4 * rand(p.seed, 'chat-time', q.seed, p.trips));
            p.chat = q.chat = t;
            p.chatRest = q.chatRest = t + PEOPLE.chatRest;
            p.chatWith = q;
            q.chatWith = p;
            p.chatFace = Math.atan2(dx, dz);
            q.chatFace = Math.atan2(-dx, -dz);
          }
        }
        const ahead = dx * fx + dz * fz;
        if (ahead <= 0.02 || ahead >= PEOPLE.slowAt + nose * 2) continue;
        if (Math.abs(dx * fz - dz * fx) > 0.16) continue;
        // Only somebody going my way holds me up; somebody coming the other way passes on their side.
        if (Math.sin(q.heading) * fx + Math.cos(q.heading) * fz < 0.5) continue;
        const k = (ahead - PEOPLE.gap - nose) / (PEOPLE.slowAt + nose * 2 - PEOPLE.gap - nose);
        const keep = k < 0 ? 0 : k;
        if (keep < p.slow) p.slow = keep;
      }
      // People are solid (the owner's request). Each walker looks at whoever is nearest in its way, from
      // just beside it to AVOID.look ahead, and makes one decision about them:
      //   coming the other way    both keep right: step right
      //   going the same way      slower and room to pass: step out to the left; else fall in behind (the
      //                           slowing above); shoulder to shoulder: ease apart
      //   crossing its way        give way to whoever comes from the right: slow, and wait if close
      //   standing still          go round the side away from them
      // A tie (straight ahead) goes by id, so two people meeting resolve it the same way every time. One
      // decision at a time, the nearest first: no dancing left and right.
      {
        const piece = p.walk![p.at]!;
        const room = piece.kind === 'move' ? asideRoom(p, piece) : 0;
        const rx = -fz, rz = fx;
        let nearest = Infinity, target = 0, blocked = false;
        for (const q of people) {
          if (q === p || !q.visible || q.mode === 'gone' || q.mode === 'hop' || q.mode === 'thrown' || (p.raider && q.raider)) continue;
          if (q.mode === 'walk' && q.walk![q.at]!.kind !== 'move') continue;
          const dx = q.x - p.x, dz = q.z - p.z;
          if (dx > 1.4 || dx < -1.4 || dz > 1.4 || dz < -1.4 || Math.abs(q.y - p.y) > 0.3) continue;
          const ahead = dx * fx + dz * fz;
          const lat = dx * rx + dz * rz;
          if (ahead < -AVOID.clear * 0.7 || ahead > AVOID.look || Math.abs(lat) >= AVOID.clear) continue;
          const d = Math.hypot(dx, dz);
          if (d >= nearest) continue;
          const moving = q.mode === 'walk' && q.slow > 0.05 && !q.queued && q.startled <= 0 && q.chat <= 0 && !q.scuffle;
          const along = Math.sin(q.heading) * fx + Math.cos(q.heading) * fz;
          const right = lat + AVOID.clear, left = -(AVOID.clear - lat);
          const away = (): number => {
            // Already stepping one way round somebody close ahead: keep to it (no dithering left and right as
            // the step aside itself moves them across their line).
            const goRight = Math.abs(lat) < AVOID.clear * 0.5 && Math.abs(p.dodgeTo) > 0.01 ? p.dodgeTo > 0 : Math.abs(lat) < 0.02 ? p.id < q.id : lat < 0;
            let s = goRight ? right : left;
            if (Math.abs(p.dodge + s) > room) s = goRight ? left : right; // no room that side: the other
            return s;
          };
          let shift: number;
          let yieldTo = false;
          if (ahead < 0.02) {
            // Beside: keep the step aside that got me here, or ease apart from a shoulder.
            shift = away();
          } else if (moving && along > 0.5) {
            // The same way: overtake on the outside only if they are slower and there is room.
            if (speedOf(q) * q.slow >= speedOf(p) * 0.92 || p.dodge + left < -room) continue;
            shift = left;
          } else if (moving && along < -0.3) shift = right;
          else if (moving) {
            // Across my way: whoever has the other coming from the right gives way.
            shift = 0;
            yieldTo = lat > 0;
          } else shift = away();
          nearest = d;
          target = p.dodge + shift;
          // Not enough room to get by, or giving way: wait for them (meeting head on, one waits: the tie by id).
          blocked = ahead > 0.02 && ahead < AVOID.wait && (yieldTo || (Math.abs(target) > room + 0.01 && (!moving || along > -0.3 || p.id > q.id)));
          if (yieldTo && ahead < AVOID.look) p.slow = Math.min(p.slow, Math.max(0, (ahead - AVOID.wait) / (AVOID.look - AVOID.wait)));
        }
        p.dodgeTo = nearest < Infinity ? target : 0;
        // Waiting their turn at a single-file stretch: to the right, out of the way of whoever comes out.
        if (p.queued && p.walk![p.at + 1]?.kind !== 'door') p.dodgeTo = room * 0.85;
        if (blocked) p.slow = 0;
        // And whatever was decided, never a step into somebody: no closer than a body to anyone ahead.
        const reach = speedOf(p) * dt * 1.4;
        if (reach > 0) {
          for (const q of people) {
            if (q === p || !q.visible || q.mode === 'gone' || q.mode === 'hop' || q.mode === 'thrown' || q.mode === 'home' || q.mode === 'visit') continue;
            // A raiding band jostles through itself here too (else a band landing on a narrow strip packs solid).
            if (p.raider && q.raider) continue;
            if (q.mode === 'walk' && q.walk![q.at]!.kind !== 'move') continue;
            const dx = q.x - p.x, dz = q.z - p.z;
            if (dx > 0.5 + nose || dx < -0.5 - nose || dz > 0.5 + nose || dz < -0.5 - nose || Math.abs(q.y - p.y) > 0.3) continue;
            const ahead = dx * fx + dz * fz;
            const lat = dx * rx + dz * rz;
            if (ahead <= 0 || Math.abs(lat) >= KEEP) continue;
            const allowed = ahead - nose - Math.sqrt(KEEP * KEEP - lat * lat) - 0.005;
            const keep = Math.max(0, Math.min(1, allowed / reach));
            if (keep < p.slow) p.slow = keep;
          }
        }
      }
      // L36, L37: they wait for the garrison's column or the rider's horse to pass, without counting it as
      // being held up (nobody steps round a soldier).
      // (Raiders barge past soldiers: they are not held up by the garrison's column.)
      if (bodies && !p.raider) {
        for (const o of bodies) {
          const dx = o.x - p.x, dz = o.z - p.z;
          if (dx > 0.6 || dx < -0.6 || dz > 0.6 || dz < -0.6 || Math.abs(o.y - p.y) > 0.3) continue;
          const ahead = dx * fx + dz * fz;
          if (ahead <= 0 || ahead >= PEOPLE.slowAt || Math.abs(dx * fz - dz * fx) > 0.2) continue;
          p.slow = 0;
          p.stuck = 0;
        }
      }
    }
  };

  // ── hopping, leaving, arriving (L27) ───────────────────────────────────
  const nearestNode = (x: number, y: number, z: number): number => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nav!.nodes.length; i++) {
      const n = nav!.nodes[i]!;
      if (n.rot !== undefined || n.passage !== undefined) continue;
      const dx = keyX(n.cell) + 0.5 - x, dz = keyZ(n.cell) + 0.5 - z, dy = (keyY(n.cell) * 0.8 - y) * 1.5;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  /**
   * Shaping the land: a resident on a column that rose or sank rides it, to the same spot a level up or
   * down, if that is still somewhere to stand (else the caller sends them to the nearest place that is).
   */
  const rideOf = (p: Person, was: ShapePlan['terrain'] | null): number => {
    if (!was || !terrain || was === terrain || p.cell < 0) return -1;
    const col = columnIndex(keyX(p.cell), keyZ(p.cell));
    const dy = terrain.height[col]! - was.height[col]!;
    if (dy === 0 || terrain.height[col] === 0) return -1;
    return nav!.nodeAt.get(p.cell + dy * (1 << 12)) ?? -1;
  };
  /** How far a hop may carry somebody (cells): it is a step up, down or across onto ground close by. */
  const HOP_REACH = 2.5;
  const hopTo = (p: Person, node: number): void => {
    const c = nodeCentre(nav!, node);
    if (Math.hypot(p.x - c.x, p.z - c.z) > HOP_REACH) {
      // A hop is a step onto ground close by. From further (somebody indoors since the town opened has
      // never stood anywhere: they flew across the map from its corner) they are simply there.
      p.x = c.x;
      p.z = c.z;
      p.y = nodeHeight(nav!, node);
    }
    clearWalk(p);
    leaveHaunt(p);
    // A bike in hand is laid down on the ground they are put on.
    bikes.drop(p, node);
    p.hop = { x0: p.x, y0: p.y, z0: p.z, x1: c.x, y1: nodeHeight(nav!, node), z1: c.z, t: 0 };
    p.mode = 'hop';
    p.visible = true;
    p.pose = 'hop';
    p.inside = null;
    p.seat = -1;
    place(p, node);
  };
  const remove = (p: Person): void => {
    bikes.gone(p);
    if (p.mode === 'home') setHome(p.home, -1);
    leaveHaunt(p);
    clearWalk(p);
    p.mode = 'gone';
    p.visible = false;
  };

  // ── a new town ────────────────────────────────────────────────────────
  const readHaunts = (dressing: DressingPlan): void => {
    const old = hauntById;
    haunts = [];
    hauntById = new Map();
    stranded = new Set();
    for (const s of dressing.sockets) {
      if (!s.type.startsWith('haunt-') && s.type !== 'arrival' && s.type !== 'way-out' && s.type !== 'workplace') continue;
      const node = nav!.nodeAt.get(s.cell);
      if (node === undefined) continue;
      const user = old.get(s.id)?.user ?? null;
      const h: Haunt = {
        id: s.id,
        type: s.type,
        node,
        cell: s.cell,
        ...(s.dir !== undefined ? { dir: s.dir } : {}),
        ...(s.structure !== undefined ? { structure: s.structure } : {}),
        ...(s.name !== undefined ? { name: s.name } : {}),
        user: user && user.mode !== 'gone' ? user : null,
      };
      haunts.push(h);
      hauntById.set(h.id, h);
      if (h.type === 'haunt-stoop' && h.structure !== undefined) stranded.add(h.structure);
    }
    // Jobs: the workplace sockets grouped by job and workplace (one lamplighter for the whole town).
    const byKey = new Map<string, { h: Haunt; order: number; ref: string }[]>();
    for (const h of haunts) {
      if (h.type !== 'workplace') continue;
      const [job = '', order = '0', ref = ''] = (h.name ?? '').split('|');
      const key = job === 'lamplighter' ? job : `${job}:${h.structure ?? h.cell}`;
      const list = byKey.get(key);
      if (list) list.push({ h, order: Number(order), ref });
      else byKey.set(key, [{ h, order: Number(order), ref }]);
    }
    const before = new Map(jobs.map((j) => [j.key, j.worker] as const));
    jobs = [...byKey]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, list]) => {
        list.sort((a, b) => a.order - b.order);
        const worker = before.get(key) ?? null;
        return { key, job: key.split(':')[0]!, structure: list[0]!.h.structure, stations: list.map((e) => e.h), refs: list.map((e) => e.ref), worker: worker && worker.mode !== 'gone' ? worker : null };
      });
  };
  /** Gives every job to one resident: whoever lives at the workplace, else whoever lives nearest. Those who have one keep it. */
  const assignJobs = (): void => {
    const free = (p: Person): boolean => p.mode !== 'gone' && !p.shutIn && !p.child && !p.leaving;
    for (const p of people) p.work = null;
    for (const j of jobs) {
      if (j.worker && free(j.worker) && !j.worker.work) j.worker.work = j;
      else j.worker = null;
    }
    // Those who live at their workplace first (a shopkeeper over the shop), then whoever lives nearest.
    for (const liveIn of [true, false]) {
      for (const j of jobs) {
        if (j.worker) continue;
        const at = j.stations[0]!;
        let best: Person | null = null;
        let bestD = Infinity;
        for (const p of people) {
          if (!free(p) || p.work || (liveIn && p.home !== j.structure)) continue;
          const door = homeDoor(p);
          if (!door || nav!.part[door.node] !== nav!.part[at.node]) continue;
          const d = Math.abs(keyX(door.cell) - keyX(at.cell)) + Math.abs(keyZ(door.cell) - keyZ(at.cell));
          if (d < bestD || (d === bestD && best !== null && p.id < best.id)) {
            bestD = d;
            best = p;
          }
        }
        if (best) {
          j.worker = best;
          best.work = j;
          best.station = -1;
        }
      }
    }
  };
  /** Points a goal at the new graph's nodes, doors and haunts. False if what it was for is gone. */
  const refreshGoal = (p: Person, g: Goal): boolean => {
    if (g.kind === 'home') {
      const door = homeDoor(p);
      if (!door) return false;
      g.door = door;
      g.node = door.node;
      return true;
    }
    if (g.kind === 'errand' && g.errand) {
      const node = nav!.nodeAt.get(g.errand.cell);
      if (node === undefined) return false;
      if (g.door) {
        const door = nav!.doors.find((d) => d.feature === g.door!.feature && d.structure === g.door!.structure && d.node === node);
        if (!door) return false;
        g.door = door;
      }
      g.node = node;
      return true;
    }
    if (g.kind !== 'haunt' || !g.haunt) return false;
    const h = hauntById.get(g.haunt.id);
    if (!h || (h.user !== null && h.user !== p && !g.door)) return false;
    if (g.door) {
      const door = nav!.doors.find((d) => d.feature === g.door!.feature && d.structure === g.door!.structure && d.node === h.node);
      if (!door) return false;
      g.door = door;
    } else h.user = p;
    g.haunt = h;
    g.node = h.node;
    return true;
  };
  /** Keeps a walk going across a change of graph if every piece of the rest of it is still there. */
  const carryWalk = (p: Person, old: NavGraph): boolean => {
    const walk = p.walk!;
    const moved: Piece[] = [];
    for (let i = p.at; i < walk.length; i++) {
      const piece = walk[i]!;
      const node = nav!.nodeAt.get(old.nodes[piece.node]!.cell);
      if (node === undefined) return false;
      const was = old.nodes[piece.node]!, now = nav!.nodes[node]!;
      if (was.rot !== now.rot || was.passage !== now.passage) return false;
      let link = -1;
      if (piece.link >= 0) {
        const ol = old.links[piece.link]!;
        const other = nav!.nodeAt.get(old.nodes[ol.a === piece.node ? ol.b : ol.a]!.cell);
        if (other === undefined) return false;
        for (let k = nav!.linkStart[node]!; k < nav!.linkStart[node + 1]!; k++) {
          const nl = nav!.links[nav!.linkOf[k]!]!;
          if ((nl.a === other || nl.b === other) && nl.via === ol.via && nl.structure === ol.structure) link = nav!.linkOf[k]!;
        }
        if (link < 0) return false;
      }
      let door: NavDoor | null = null;
      if (piece.door) {
        door = nav!.doors.find((d) => d.feature === piece.door!.feature && d.structure === piece.door!.structure && d.node >= 0) ?? null;
        if (!door || nav!.nodes[door.node]!.cell !== old.nodes[piece.door.node]!.cell) return false;
      }
      moved.push({ ...piece, node, link, door });
    }
    p.walk = moved;
    p.at = 0;
    p.held = -1;
    return true;
  };
  const warmStart = (p: Person, time: TimeSignal): void => {
    // The town is already going about its day when it is first seen.
    const door = homeDoor(p);
    p.mode = 'home';
    p.visible = false;
    setHome(p.home, 1);
    if (!door) return;
    standAt(p, door.node);
    p.timer = PEOPLE.homeMin + rand(p.seed, 'first-stay') * (PEOPLE.homeMax - PEOPLE.homeMin);
    if (mustBeHome(p, time) && !time.isDusk) return;
    const k = rand(p.seed, 'first');
    const share = time.isDusk ? 0.55 : time.isDay ? 0.78 : p.owl ? 1 : 0.3;
    if (k > share) {
      p.timer *= k; // at home, some about to come out
      return;
    }
    const h = pickHaunt(p, time.isDusk ? { ...time, isDay: true, isDusk: false } : time);
    if (!h) return;
    const goal = hauntGoal(p, h);
    if (time.isDusk) {
      // On the way back from wherever they were.
      const back = homeGoal(p);
      if (!back) return;
      standAt(p, h.node);
      p.mode = 'wait';
      if (!startWalk(p, back)) {
        standAt(p, door.node);
        p.mode = 'home';
        p.visible = false;
        return;
      }
      setHome(p.home, -1);
    } else if (!startWalk(p, goal)) return;
    // Somewhere along the way, or already there.
    const walk = p.walk!;
    const along = rand(p.seed, 'first-along');
    if (!time.isDusk && along > 0.55) {
      const last = walk[walk.length - 1]!;
      p.at = walk.length - 1;
      p.t = 1;
      place(p, last.node);
      pieceAt(last, 1, scratch);
      p.x = scratch.x;
      p.y = scratch.y;
      p.z = scratch.z;
      p.heading = Number.isNaN(goal.face) ? rand(p.seed, 'first-face') * 6.28 : goal.face;
      arrive(p);
      p.timer *= rand(p.seed, 'first-linger');
      return;
    }
    // Start on a piece in the open, clear of any single-file stretch.
    const want = Math.floor((along / 0.55) * walk.length * (time.isDusk ? 0.8 : 1));
    let at = -1;
    for (let i = Math.min(walk.length - 1, want); i >= 0; i--) {
      const piece = walk[i]!;
      if (piece.kind !== 'move') continue;
      if (piece.link >= 0 && nav!.runOf[piece.link]! >= 0) continue;
      if (i > 0 && walk[i - 1]!.link >= 0 && nav!.runOf[walk[i - 1]!.link]! >= 0) continue;
      at = i;
      break;
    }
    if (at <= 0) return;
    p.at = at;
    p.t = rand(p.seed, 'first-t') * 0.9;
    place(p, walk[at]!.node);
    pieceAt(walk[at]!, p.t, scratch);
    p.x = scratch.x;
    p.y = scratch.y;
    p.z = scratch.z;
    p.heading = Math.atan2(scratch.dx, scratch.dz);
    p.stride = rand(p.seed, 'first-stride');
  };
  const arriveFromShore = (p: Person, order: number): void => {
    // A newcomer comes ashore at the nearest dock or beach and walks home.
    const landing = haunts.find((h) => h.type === 'arrival' && h.structure === p.home);
    const door = homeDoor(p);
    if (!landing || !door) {
      p.mode = 'home';
      p.visible = false;
      p.timer = PEOPLE.homeMin + rand(p.seed, 'first-stay') * (PEOPLE.homeMax - PEOPLE.homeMin);
      if (door) standAt(p, door.node);
      setHome(p.home, 1);
      return;
    }
    standAt(p, landing.node);
    // Up out of the boat (or the shallows) on the water side of the landing.
    const edge = edgeOf(landing.node);
    p.edgeX = edge?.[0] ?? 0;
    p.edgeZ = edge?.[1] ?? 0;
    p.fadeTime = edge ? edgeTime(p) : PEOPLE.fade;
    if (edge) p.heading = Math.atan2(-p.edgeX, -p.edgeZ);
    const c = nodeCentre(nav!, landing.node);
    p.x = c.x + (rand(p.seed, 'land-x') - 0.5) * 0.4;
    p.z = c.z + (rand(p.seed, 'land-z') - 0.5) * 0.4;
    p.mode = 'wait';
    p.visible = false;
    p.fade = 0;
    p.timer = order * 1.4; // one after another down the gangway
    p.want = homeGoal(p);
  };

  let ashoreCount = 0;
  const makePerson = (id: string, home: StructureId, index: number, look: number, child: boolean): Person => {
    const s = hash(seed, 'person', id);
    return {
      id, home, index, look, child, seed: s,
      rank: rand(s, 'rank'),
      speed: PEOPLE.speed * (1 + (rand(s, 'speed') * 2 - 1) * PEOPLE.speedVary) * (child ? PEOPLE.childSpeed : 1),
      owl: false,
      shutIn: false,
      work: null, station: -1, round: 0, part: '', carrying: false, load: null, brisk: false,
      mode: 'home', visible: false, fade: 1,
      x: 0, y: 0, z: 0, heading: rand(s, 'heading') * 6.28,
      pose: 'stand', poseTime: rand(s, 'pose') * 10, stride: 0, seat: -1,
      node: -1, cell: -1, walk: null, at: 0, t: 0,
      goal: null, want: null, timer: 0, held: -1, trips: 0, stuck: 0, slow: 1, queued: false,
      inside: null, hop: null, leaving: false, startled: 0, startledFace: 0, edgeX: 0, edgeZ: 0, fadeTime: PEOPLE.fade,
      jumpy: false, jump: 0, lift: 0, chat: 0, chatFace: 0, lastMet: null, chatWith: null, bubble: false, chatRest: 0, react: null, flying: false,
      dodge: 0, dodgeTo: 0, dodgeV: 0, offX: 0, offZ: 0, rethought: false,
      scuffle: null, inCloud: false, party: false, costume: null,
    };
  };

  const crowd: Crowd = {
    ashore(x, y, z, heading, look) {
      if (!nav) return null;
      const node = nearestNode(x, y, z);
      if (node < 0) return null;
      const c = nodeCentre(nav, node);
      if (Math.hypot(c.x - x, c.z - z) > 1.3 || Math.abs(nodeHeight(nav, node) - y) > 0.9) return null;
      const id = `ashore:${(ashoreCount = ashoreCount + 1)}`;
      const p = makePerson(id, -1 as StructureId, 0, look, false);
      p.ashore = true;
      p.leaving = true;
      standAt(p, node);
      p.x = x;
      p.z = z;
      p.heading = heading;
      p.mode = 'wait';
      p.visible = true;
      p.fade = 1;
      p.pose = 'stand';
      // A moment to catch their breath on the quay, then off.
      p.timer = 1.2;
      people.push(p);
      byId.set(id, p);
      events.added?.(p);
      return p;
    },
    people,
    get nav() {
      return nav;
    },
    get router() {
      return router;
    },
    get haunts() {
      return haunts;
    },
    get jobs() {
      return jobs;
    },
    atHome,
    doors,

    sync(shape, dressing, time) {
      if (!dressing) return;
      now = time;
      const first = nav === null;
      const old = nav;
      seed = shape.world.seed;
      shapeNow = shape;
      const oldTerrain = terrain;
      terrain = shape.terrain;
      blocks = shape.structureAt;
      // L29: doors new to the town start as they should already be; shops stand open by day.
      doors.settle();
      shopDoors = shape.features.filter((f) => f.type === 'door' && f.variant === 'shop').map((f) => f.id);
      nav = dressing.nav;
      router = createRouter(nav);
      seated = new Set();
      for (const [cell, extra] of crowdedCells) {
        const node = nav.nodeAt.get(cell);
        if (node !== undefined) router.setExtra(node, extra);
      }
      runCount = new Int16Array(nav.runs.length);
      runSense = new Int8Array(nav.runs.length);
      readHaunts(dressing);

      // Who lives here now (L21): the plan's residents in order, up to the cap.
      const cap = opts.cap ?? PEOPLE.cap;
      // Those who can never leave their house (resident/indoors) are kept, at home, and are not counted.
      const wanted = new Map<string, { home: StructureId; index: number; look: number; child: boolean; indoors: boolean }>();
      let walkers = 0;
      for (const a of dressing.actors) {
        if (a.type !== 'resident' || a.home === undefined) continue;
        if (a.variant !== 'indoors' && walkers++ >= cap) continue;
        const params = (a.params ?? {}) as { index?: number; look?: number };
        wanted.set(a.id, { home: a.home, index: params.index ?? 0, look: params.look ?? 0, child: a.variant === 'child', indoors: a.variant === 'indoors' });
      }

      // Those already here: keep them where they are if the ground under them is still ground.
      for (const p of people) {
        if (p.mode === 'gone') continue;
        p.want = null; // it names nodes and doors of the old graph
        const still = wanted.has(p.id);
        if (still && p.leaving) {
          // Their home is back (an undo): they turn round.
          p.leaving = false;
          p.fade = 1;
          p.want = null;
          if (p.goal?.kind === 'leave') p.goal = null;
        }
        // A raider (src/life/raid) is nobody's resident: the raid sends them home, not the town's change.
        if (!still && !p.leaving && !p.raider) {
          if (p.mode === 'home') {
            // The house came down with them in it: they are standing where its door was.
            setHome(p.home, -1);
            p.mode = 'wait';
            p.visible = true;
          }
          p.leaving = true;
          p.want = null;
        }
        if (p.mode === 'home') {
          const door = homeDoor(p);
          if (door) standAt(p, door.node);
          else p.node = -1;
          continue;
        }
        if (p.mode === 'thrown') {
          // In the air or dizzy on the ground (mischief): left alone; their place is kept in the new graph.
          const at = p.cell >= 0 ? nav.nodeAt.get(p.cell) : undefined;
          const n = at ?? nearestNode(p.x, p.y, p.z);
          if (n >= 0) place(p, n);
          continue;
        }
        const node = p.cell >= 0 ? nav.nodeAt.get(p.cell) : undefined;
        if (p.mode === 'visit') {
          const door = p.inside && nav.doors.find((d) => d.feature === p.inside!.feature && d.structure === p.inside!.structure && d.node >= 0);
          if (door) {
            p.inside = door;
            place(p, door.node);
            continue;
          }
          p.inside = null;
        } else if (node !== undefined && p.leaving && p.goal?.kind === 'leave' && old && (p.mode === 'linger' || (p.mode === 'walk' && p.walk))) {
          // On their way off the island (their home is gone or being mended): the town changing round them
          // (a mend step elsewhere, every few seconds while a street is rebuilt) does not stop them. Before,
          // it stood them still and planned again, so one who had begun to fade away at a way-out with no
          // water to step into grew back to full size, set off again and faded again: "shrink and grow,
          // over and over". They carry on: still walking there, or still going.
          const target = old.nodes[p.goal.node]?.cell;
          const to = target === undefined ? undefined : nav.nodeAt.get(target);
          const g = p.goal;
          const door = g.door ? nav.doors.find((d) => d.feature === g.door!.feature && d.structure === g.door!.structure && d.node === to) : null;
          if (to !== undefined && door !== undefined && (p.mode === 'linger' || carryWalk(p, old))) {
            g.node = to;
            g.door = door;
            place(p, node);
            continue;
          }
        } else if (node !== undefined && p.mode === 'walk' && p.walk && old && !p.leaving && p.goal && p.goal.kind !== 'leave' && refreshGoal(p, p.goal) && carryWalk(p, old)) {
          place(p, node);
          continue;
        } else if (node !== undefined && p.mode === 'linger' && !p.leaving && (p.goal?.haunt || p.goal?.errand) && refreshGoal(p, p.goal!)) {
          place(p, node);
          continue;
        }
        // Their walk is broken, their haunt is gone or the ground is: stand, hop clear if need be, plan again.
        const wasGoal = p.goal;
        leaveHaunt(p);
        clearWalk(p);
        p.goal = null;
        const rode = node === undefined ? rideOf(p, oldTerrain) : -1;
        if (node === undefined || p.mode === 'visit') hopTo(p, rode >= 0 ? rode : nearestNode(p.x, p.y, p.z));
        else {
          place(p, node);
          p.mode = 'wait';
          p.visible = true;
          p.pose = 'stand';
          p.seat = -1;
          p.timer = 0;
        }
        // Go on to where they were going, if it is still there.
        if (!p.leaving && wasGoal) {
          if (wasGoal.errand) {
            // The chain is asked again what they do now (the step, or something else if its place is gone).
            p.timer = 0;
            if (p.mode === 'hop') p.want = null;
          } else if (wasGoal.kind === 'home') p.want = homeGoal(p);
          else if (wasGoal.haunt && hauntById.has(wasGoal.haunt.id)) p.want = hauntGoal(p, hauntById.get(wasGoal.haunt.id)!);
        }
      }

      // Newcomers.
      let order = 0;
      const fresh: Person[] = [];
      for (const [id, w] of wanted) {
        const had = byId.get(id);
        if (had && had.mode !== 'gone') {
          had.home = w.home;
          had.shutIn = w.indoors;
          continue;
        }
        const p = makePerson(id, w.home, w.index, w.look, w.child);
        p.shutIn = w.indoors;
        people.push(p);
        byId.set(id, p);
        fresh.push(p);
        events.added?.(p);
      }
      // The night owls (L25): the lowest ranks, never more than a tenth of the town.
      const owls = Math.floor(Math.min(walkers, cap) * PEOPLE.nightOut);
      const ranked = people.filter((p) => p.mode !== 'gone' && !p.leaving && !p.shutIn).sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
      for (const p of people) p.owl = false;
      ranked.forEach((p, i) => (p.owl = i < owls));
      assignJobs();
      inns = new Set([...shape.roles].filter(([, r]) => r.role === 'inn').map(([id]) => id));
      scuffles.sync();
      if (opts.bikes !== false) bikes.sync(shape, dressing, nav);
      for (const p of fresh) {
        p.part = time.part;
        if (first) warmStart(p, time);
        else arriveFromShore(p, order++);
      }
    },

    step(dt, time) {
      if (!nav) return;
      duskClock = time.isDusk || time.isNight ? duskClock + dt : 0;
      now = time;
      for (const key of shopDoors) doors.stand(key, time.isDay, rand(seed, 'shop-door', key) * DOORS.shopSpread);
      for (const p of people) claimDoors(p);
      doors.step(dt);
      follow(dt);
      let plans = Math.max(1, Math.round(PEOPLE.plansPerFrame));
      const n = people.length;
      for (let i = 0; i < n; i++) {
        const p = people[i]!;
        if (p.part !== time.part) {
          const was = p.part;
          p.part = time.part;
          if (time.isDay) p.round = 0;
          // Duty calls: whatever they were doing, they set off (a moment apart, by rank).
          if (was !== '' && onDuty(p, time)) {
            if (p.mode === 'home' || p.mode === 'linger' || p.mode === 'visit') p.timer = Math.min(p.timer, p.rank * 2);
            else if (p.mode === 'walk' && !p.want && p.goal?.kind === 'haunt' && p.walk![p.at]!.kind === 'move') p.want = workGoal(p, time);
          }
        }
        switch (p.mode) {
          case 'home':
            p.timer -= dt;
            if (p.timer <= 0 && p.node >= 0 && !p.want) {
              p.want = nextGoal(p, time, true);
              if (!p.want) p.timer = 3 + r(p, 'retry') * 5;
            }
            break;
          case 'visit':
            p.timer -= dt;
            // The keeper comes down when it is day.
            if (p.goal?.linger === KEEPER_NIGHT) p.timer = time.isDay || time.isDawn ? Math.min(p.timer, 0) : 1;
            if (p.timer <= 0 && !p.want) {
              p.want = nextGoal(p, time, false);
              if (!p.want) p.timer = 4;
            }
            break;
          case 'linger': {
            p.poseTime += dt;
            p.timer -= dt;
            if (p.goal && !Number.isNaN(p.goal.face) && !p.flying) turnTo(p, p.goal.face, dt);
            if (p.goal?.kind === 'leave') {
              p.fade = Math.max(0, p.timer / p.fadeTime);
              if (p.edgeX !== 0 || p.edgeZ !== 0) {
                turnTo(p, Math.atan2(p.edgeX, p.edgeZ), dt);
                p.pose = 'walk';
                p.stride += (dt * p.speed * PERSON.stepsPerCell * 0.5) / (p.child ? 0.8 : 1);
              }
              if (p.timer <= 0) remove(p);
              break;
            }
            if (p.startled > 0) break;
            // Dusk calls everybody in, whatever they were doing.
            if (p.timer > 0 && mustBeHome(p, time) && p.goal?.haunt?.type !== 'haunt-night' && p.goal?.kind !== 'errand') p.timer = 0;
            if (p.timer <= 0 && !p.want) {
              p.want = nextGoal(p, time, false);
              if (!p.want) p.timer = 4 + r(p, 'retry') * 4;
            }
            break;
          }
          case 'walk':
            if (p.startled > 0 || p.chat > 0 || (p.scuffle && (p.scuffle.a === p || p.scuffle.b === p))) {
              p.pose = 'stand';
              p.poseTime += dt;
              break;
            }
            if (p.fade < 1) p.fade = Math.min(1, p.fade + dt / PEOPLE.fade);
            // Dusk turns people round where they are.
            if (!p.want && p.goal?.kind === 'haunt' && p.walk![p.at]!.kind === 'move' && mustBeHome(p, time) && p.goal.haunt?.type !== 'haunt-night') {
              p.want = homeGoal(p);
            }
            advance(p, dt);
            break;
          case 'hop': {
            const h = p.hop!;
            h.t += dt / PEOPLE.hop;
            const t = Math.min(1, h.t);
            p.x = h.x0 + (h.x1 - h.x0) * t;
            p.z = h.z0 + (h.z1 - h.z0) * t;
            p.y = h.y0 + (h.y1 - h.y0) * t + Math.sin(t * Math.PI) * PEOPLE.hopHeight;
            if (t >= 1) {
              p.hop = null;
              p.mode = 'wait';
              p.pose = 'stand';
              p.timer = 0.3;
            }
            break;
          }
          case 'wait':
            // A newcomer climbs up out of the water first (L27), at a walk, then sets off home.
            if (p.timer <= 0 && p.fade < 1 && (p.edgeX !== 0 || p.edgeZ !== 0) && !p.leaving) {
              p.visible = true;
              p.fade = Math.min(1, p.fade + dt / p.fadeTime);
              turnTo(p, Math.atan2(-p.edgeX, -p.edgeZ), dt);
              p.pose = p.child ? 'run' : 'walk';
              p.stride += (dt * p.speed * PERSON.stepsPerCell * 0.5) / (p.child ? 0.8 : 1);
              break;
            }
            p.poseTime += dt;
            p.timer -= dt;
            if (p.timer <= 0 && !p.want) {
              p.want = p.leaving ? leaveGoal(p) : nextGoal(p, time, false);
              if (!p.want) {
                if (p.leaving) {
                  // Nowhere to walk off to: fade where they stand.
                  p.goal = { kind: 'leave', node: p.node, haunt: null, door: null, spot: null, face: NaN, pose: 'wave', linger: 0, seat: -1 };
                  p.edgeX = p.edgeZ = 0;
                  p.mode = 'linger';
                  p.pose = 'wave';
                  p.timer = PEOPLE.fade;
                } else p.timer = 3 + r(p, 'retry') * 4;
              }
            }
            break;
          case 'gone':
          case 'thrown':
            break;
        }
        // Reactions (L26). `react` is the pose shown while one lasts.
        p.react = null;
        p.bubble = false;
        if (p.chatRest > 0) p.chatRest -= dt;
        // A child at a kite spot flies a kite while the wind is up (L28), facing downwind to watch it.
        if (p.child && p.mode === 'linger' && opts.wind && p.goal?.haunt?.type === 'haunt-play' && p.goal.haunt.name === 'kite') {
          const wind = opts.wind(p.x, p.z);
          p.flying = wind.strength > PEOPLE.kiteWind * (p.flying ? 0.75 : 1);
          if (p.flying) {
            turnTo(p, Math.atan2(wind.dirX, wind.dirZ), dt);
            p.react = 'kite';
          }
        } else p.flying = false;
        if (p.startled > 0) {
          p.startled -= dt;
          // (A rider looks without turning the bike.)
          if (p.seat < 0 && !bikes.mounted(p)) {
            turnTo(p, p.startledFace, dt);
            p.react = p.admire ?? 'stand';
          }
          if (p.startled <= 0) p.admire = null;
          // Once they have turned: a small hop, for some.
          let off = p.startledFace - p.heading;
          off -= Math.round(off / (Math.PI * 2)) * Math.PI * 2;
          if (p.jumpy && Math.abs(off) < 0.2) {
            p.jumpy = false;
            p.jump = JUMP;
          }
        } else p.jumpy = false;
        if (p.jump > 0) {
          p.jump -= dt;
          p.lift = Math.sin(Math.PI * (1 - Math.max(0, p.jump) / JUMP)) * JUMP_HEIGHT;
          p.react = 'hop';
        } else p.lift = 0;
        if (p.chat > 0) {
          p.chat -= dt;
          p.poseTime += dt;
          // A block landing interrupts: they both look at that first.
          if (p.startled <= 0) {
            turnTo(p, p.chatFace, dt);
            p.react = 'chat';
            // They take turns: the one with the lower id starts.
            const turn = Math.floor(p.chat * 0.9) % 2 === 0;
            p.bubble = p.chatWith !== null && (p.id < p.chatWith.id ? turn : !turn);
          }
          if (p.mode !== 'walk' || p.chat <= 0) {
            p.chat = 0;
            p.chatWith = null;
          }
        }
      }
      // L50: the scuffle, after everybody's own reactions (it sets the poses of the two and of the ring).
      scuffles.step(dt, time);
      updateSeated();
      // Routes: a few a frame, taking turns, so sixty people asking at once never show in a frame.
      for (let k = 0; k < n && plans > 0; k++) {
        const p = people[(planCursor + k) % n]!;
        if (!p.want || p.mode === 'gone' || p.mode === 'hop' || p.mode === 'thrown') continue;
        if (p.mode === 'wait' && (p.timer > 0 || (p.fade < 1 && (p.edgeX !== 0 || p.edgeZ !== 0) && !p.leaving))) continue;
        if (p.mode === 'walk' && p.walk![p.at]!.kind !== 'move') continue; // not half-way through a door
        plans--;
        const goal = p.want;
        p.want = null;
        if (goal.haunt && goal.haunt.user !== null && goal.haunt.user !== p && !goal.door) continue; // somebody got there first
        const wasWaiting = p.mode === 'wait';
        if (startWalk(p, goal)) {
          if (wasWaiting && p.fade < 1) p.visible = true;
          continue;
        }
        if (goal.errand) opts.errands?.failed(p, goal.errand);
        // No way there. Home, if that can be reached; else stay a while.
        if (goal.kind !== 'home' && p.mode !== 'home') {
          const back = homeGoal(p);
          if (back && startWalk(p, back)) continue;
        }
        if (p.mode === 'walk') {
          clearWalk(p);
          p.mode = 'wait';
          p.pose = 'stand';
        }
        p.timer = 5 + r(p, 'retry') * 5;
      }
      planCursor = n > 0 ? (planCursor + 1) % n : 0;
      // Clear away those who left.
      for (let i = people.length - 1; i >= 0; i--) {
        const p = people[i]!;
        if (p.mode !== 'gone') continue;
        people.splice(i, 1);
        if (byId.get(p.id) === p) byId.delete(p.id);
        events.removed?.(p);
      }
    },

    get scuffles() {
      return scuffles;
    },
    bikes,
    setCrowded(cell, extra) {
      if (extra > 0) crowdedCells.set(cell, extra);
      else crowdedCells.delete(cell);
      const node = nav?.nodeAt.get(cell);
      if (router && node !== undefined) router.setExtra(node, Math.max(extra, seated.has(node) ? PEOPLE.seatedExtra : 0));
    },
    upend(p) {
      if (!nav || p.mode === 'home' || p.mode === 'visit' || p.mode === 'gone' || p.shutIn) return false;
      if (p.mode === 'thrown') return true;
      if (p.scuffle && (p.scuffle.a === p || p.scuffle.b === p)) scuffles.end();
      p.scuffle = null;
      p.inCloud = false;
      // Their errand fell through (its chain carries on without them, as when somebody is called away).
      const g = p.goal, w = p.want;
      p.want = null;
      if (g?.errand) opts.errands?.failed(p, g.errand);
      if (w?.errand && w.errand !== g?.errand) opts.errands?.failed(p, w.errand);
      leaveHaunt(p);
      clearWalk(p);
      // Off the bike, and it falls where they were.
      bikes.drop(p);
      // Drawn where they are drawn (a paddler out in the shallows).
      p.x += p.drawX ?? 0;
      p.z += p.drawZ ?? 0;
      p.drawX = p.drawZ = 0;
      p.goal = null;
      p.hop = null;
      p.inside = null;
      p.seat = -1;
      p.mode = 'thrown';
      p.visible = true;
      p.fade = 1;
      p.edgeX = p.edgeZ = 0;
      p.startled = p.jump = p.lift = p.chat = 0;
      p.jumpy = false;
      p.chatWith = null;
      p.bubble = false;
      p.react = null;
      p.flying = false;
      p.dodge = p.dodgeTo = p.dodgeV = p.offX = p.offZ = 0;
      p.stuck = 0;
      p.slow = 1;
      p.admire = null;
      return true;
    },
    nearestNode(x, y, z) {
      return nav ? nearestNode(x, y, z) : -1;
    },
    settle(p, node) {
      if (p.mode !== 'thrown') return;
      p.tumble = null;
      if (!nav || node < 0 || node >= nav.nodes.length) {
        p.mode = 'wait';
        p.timer = 0.5;
        return;
      }
      place(p, node);
      p.y = nodeHeight(nav, node);
      p.mode = 'wait';
      p.visible = true;
      p.pose = 'stand';
      p.poseTime = 0;
      p.timer = 0.4 + r(p, 'settle') * 0.6;
      p.trips++;
    },
    rethink(p) {
      if (p.mode === 'home' || p.mode === 'linger' || p.mode === 'visit' || p.mode === 'wait') p.timer = Math.min(p.timer, 0);
      else if (p.mode === 'walk' && now && !p.want && p.walk && p.walk[p.at]!.kind === 'move') p.want = nextGoal(p, now, false);
    },
    blockLanded(cell) {
      const x = keyX(cell) + 0.5, z = keyZ(cell) + 0.5;
      for (const p of people) {
        if (!p.visible || (p.mode !== 'walk' && p.mode !== 'linger')) continue;
        if (p.mode === 'walk' && p.walk![p.at]!.kind !== 'move') continue;
        // A rider keeps their eyes on the road.
        if (bikes.mounted(p)) continue;
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) + Math.abs(dz) > PEOPLE.lookReach || (dx === 0 && dz === 0)) continue;
        p.startled = PEOPLE.lookTime * (0.7 + rand(p.seed, 'startle', p.trips) * 0.6);
        p.startledFace = Math.atan2(dx, dz);
        p.jumpy = p.seat < 0 && rand(p.seed, 'hop', p.trips, cell) < PEOPLE.lookHop;
      }
    },
  };
  return crowd;
}

/** The index a roll in [0, 1) picks from a list of weights. */
function pickIndex(weights: readonly number[], roll: number): number {
  let total = 0;
  for (const w of weights) total += w;
  let t = roll * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i]!;
    if (t < 0) return i;
  }
  return weights.length - 1;
}
