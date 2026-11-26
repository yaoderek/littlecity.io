// The people system (People, Stage 3): runs the crowd (crowd.ts) and draws
// it. One system for the whole town, because who walks where is a town-wide
// matter (routes, queues, who is home), not one actor's.
//
// Drawing: each person is five rigid pieces (src/parts/people/person.ts)
// spawned on the stage, posed every frame with matrices (pose.ts). Nothing
// is re-meshed while they walk. The `resident` actors the plan places at
// each front door are the same people standing still; this system hides
// those instances and draws its own, so a town shown without life still has
// its residents at their doors.

import { shipInFor } from '../ships/news';
import { CELL_H, columnIndex, DIR4, inColumnBounds, key, keyX, keyZ, SEA_Y, type CellKey } from '@/core/grid';
import type { Mat4Like } from '@/core/mat4';
import { defineSystem, type InstanceHandle, type LifeStage, type Signals, type SignalsDriver } from '@/life/api';
import type { MeshData } from '@/gen/mesh';
import { bubbleMesh, castLine, castLineMesh, floatMesh, kiteMesh, lineMesh, TOOL_PIECE, toolMesh, UMBRELLAS, type Tool } from '@/parts/people/extras';
import { wakeRing } from '../boats/afloat';
import { buildPerson, DESIGN_HEIGHT, lookOf, PIECES, rigOf, type Look, type Rig } from '@/parts/people/person';
import { poseOf, rigMatrices, sitDrop } from '@/parts/people/pose';
import type { DressingPlan, NavDoor } from '@/resolve/plan';
import { PEOPLE, PERSON } from '@/style/people';
import { obstaclesOf, setCrowd, setDoorTable } from '../doors/table';
import { deferLamp, lightLamp } from '../dusk/lamps.system';
import { easeIn } from '../motion/ease';
import { setOccupied } from '../dusk/occupancy';
import { type Crowd, type Person } from './crowd';
import { createLivingTown, type LivingTown } from '../town';
import { seasonOf, weatherOf } from '../season';
import { restingMesh } from '@/parts/people/loads';
import { place } from '../motion/pose';
import { fxOf } from '../fx/fx';
import { raiderScale } from '../raid/far';
import { markCensusReady, recordHome } from './home';
import { carriedMesh, HEAVY, HOLD_OF, holdAnchor, NOT_GROWN } from '@/parts/people/loads';
import { fineryLook, fineryMesh, isFinery } from '@/parts/people/finery';
import { beachLook, beachMesh, isBeachWear } from '@/parts/people/beachwear';
import { applyHold } from '@/parts/people/hands';
import { barbarianLook, barbarianMesh, isBarbarian, raiderGear } from '@/parts/people/barbarian';
import type { Load } from './errand';
import { scaresOf } from '../birds/scare';
import { cloudMesh, dazeStarMesh, popMesh, POPS, swearMesh, type PopKind } from '@/parts/people/scuffle-art';
import { rand } from '@/core/rand';
import { LOADS, SCUFFLE } from '@/style/town-life';
import type { Scuffle } from './scuffle';

declare module '@/life/api' {
  interface SignalEvents {
    /** L50: a scuffle started or ended at (x, z). */
    scuffle: { x: number; z: number; what: 'start' | 'end' };
  }
}

/** L50: what is drawn for the scuffle going on (one at a time). */
interface ScuffleArt {
  n: number;
  clouds: InstanceHandle[];
  pops: { kind: PopKind; h: InstanceHandle }[];
  swears: InstanceHandle[];
  stars: InstanceHandle[];
  /** What the two set down before it started, lying beside where they stood. */
  setDown: InstanceHandle[];
  tick: number;
}
const artMeshes: { clouds?: MeshData[]; pops?: Map<PopKind, MeshData>; swears?: MeshData[]; star?: MeshData } = {};
const HIDE: Mat4Like = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -50, 0, 1];

function releaseArt(a: ScuffleArt): void {
  for (const h of a.clouds) h.release();
  for (const p of a.pops) p.h.release();
  for (const h of a.swears) h.release();
  for (const h of a.stars) h.release();
  for (const h of a.setDown) h.release();
}

function spawnArt(stage: LifeStage, n: number, s: Scuffle): ScuffleArt {
  artMeshes.clouds ??= [0, 1, 2].map((v) => cloudMesh(v, SCUFFLE.cloudR, SCUFFLE.cloudH));
  artMeshes.swears ??= [0, 1, 2, 3].map((v) => swearMesh(v));
  artMeshes.star ??= dazeStarMesh();
  if (!artMeshes.pops) {
    artMeshes.pops = new Map();
    for (const k of new Set(POPS)) artMeshes.pops.set(k, popMesh(k));
  }
  const hidden = (m: MeshData): InstanceHandle => {
    const h = stage.spawnMesh(m, HIDE);
    h.setVisible(false);
    return h;
  };
  return {
    n,
    clouds: artMeshes.clouds.map(hidden),
    pops: POPS.map((kind) => ({ kind, h: hidden(artMeshes.pops!.get(kind)!) })),
    swears: artMeshes.swears.map(hidden),
    stars: [0, 1, 2, 3, 4, 5].map(() => hidden(artMeshes.star!)),
    // Set down on the ground a step to the side, away from the cloud.
    setDown: [...s.setDown].map(([p, kind]) => {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 1;
      return stage.spawnMesh(restingMesh(kind), place(p.x + (dx / d) * 0.25 - (dz / d) * 0.15, p.y, p.z + (dz / d) * 0.25 + (dx / d) * 0.15, p.heading));
    }),
    tick: -1,
  };
}

/**
 * Which way the camera looks, to turn the swearing bubble to it: read from the app's debug handle
 * (window.__lc.view), the one place it is known; the default view where there is none (tests, shots).
 */
function cameraAngles(): { yaw: number; pitch: number } {
  type Angles = { yaw: number; pitch: number };
  const view = (globalThis as { __lc?: { view?: { getCamera?(): Angles; getEyeCamera?(): Angles | null } } }).__lc?.view;
  const deg = Math.PI / 180;
  // Fly mode's eye, while someone flies (its pitch is above the horizon, the orbit camera's below).
  const e = view?.getEyeCamera?.();
  if (e) return { yaw: e.yaw * deg, pitch: -e.pitch * deg };
  const c = view?.getCamera?.();
  return c ? { yaw: c.yaw * deg, pitch: c.pitch * deg } : { yaw: 45 * deg, pitch: 35 * deg };
}

/** How much bigger to draw a balloon from far off: 1 close in (zoom 6 and more, and fly mode), up to 1.8 from the whole island. */
function balloonScale(): number {
  const view = (globalThis as { __lc?: { view?: { getCamera?(): { zoom: number }; getEyeCamera?(): unknown } } }).__lc?.view;
  if (!view?.getCamera || view.getEyeCamera?.()) return 1;
  const z = view.getCamera().zoom;
  return 1 + 0.8 * Math.max(0, Math.min(1, (6 - z) / (6 - 1.6)));
}

/** A flat drawing (a balloon) at (x, y, z) turned square to the camera, scaled by `sc`: Ry(yaw) · Rx(-pitch) · S. */
function facing(x: number, y: number, z: number, cam: { yaw: number; pitch: number }, sc: number): Mat4Like {
  const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), ct = Math.cos(cam.pitch), st = Math.sin(cam.pitch);
  return [c * sc, 0, -sn * sc, 0, -sn * st * sc, ct * sc, -c * st * sc, 0, sn * ct * sc, st * sc, c * ct * sc, 0, x, y, z, 1];
}

/** Poses the scuffle's drawings, on twos (SCUFFLE.drawRate). */
function drawArt(a: ScuffleArt, s: Scuffle, seconds: number): void {
  const tick = Math.floor(seconds * SCUFFLE.drawRate);
  if (tick === a.tick) return;
  a.tick = tick;
  const m = (x: number, y: number, z: number, yaw: number, sc: number, tilt = 0): Mat4Like => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    // Ry(yaw) · Rx(−tilt) · S: tilt > 0 turns +Z up toward the sky
    return [c * sc, 0, -sn * sc, 0, -sn * st * sc, ct * sc, -c * st * sc, 0, sn * ct * sc, st * sc, c * ct * sc, 0, x, y, z, 1];
  };
  const fight = s.phase === 'fight';
  // The cloud: one of three heaps at a time, turning; it pops up at the start and bursts at the end.
  const puff = s.phase === 'dazed' && s.t < 0.3;
  const show = fight || puff;
  const k = tick % 3;
  a.clouds.forEach((h, i) => {
    const on = show && i === k;
    h.setVisible(on);
    if (!on) return;
    const grow = Math.min(1, s.age / 0.18);
    let sc = grow < 1 ? 0.4 + grow * 0.75 : 1 + 0.06 * Math.sin(tick * 2.1);
    if (puff) sc = 1.15 + s.t * 1.2;
    const wob = Math.sin(tick * 1.7) * 0.04;
    h.setMatrix(m(s.cx, s.y + (puff ? 0.04 : Math.abs(wob)), s.cz, tick * 0.9 + (s.seed % 10), puff ? sc * 0.7 : sc));
  });
  // Pop-outs: a few at a time round the cloud, a new place every drawing.
  a.pops.forEach((p, i) => {
    const r = (what: string): number => rand(s.seed, 'pop', what, i, tick);
    const on = fight && s.age > 0.25 && s.t < s.fight - 0.2 && r('on') < 0.6;
    p.h.setVisible(on);
    if (!on) return;
    const ang = r('a') * Math.PI * 2;
    const out = SCUFFLE.cloudR * (0.85 + r('o') * 0.35);
    const y = s.y + 0.08 + r('y') * SCUFFLE.cloudH * 0.8;
    const yaw = Math.atan2(Math.cos(ang), Math.sin(ang));
    const tilt = p.kind === 'hat' ? 0.5 + r('t') : p.kind === 'star' ? 0 : (r('t') - 0.5) * 0.8;
    p.h.setMatrix(m(s.cx + Math.cos(ang) * out, y, s.cz + Math.sin(ang) * out, p.kind === 'star' ? tick * 0.7 : yaw, p.kind === 'star' ? 1.8 : 1.7, tilt));
  });
  // The swearing: a new row every SCUFFLE.swear seconds, turned to face the camera.
  const cam = cameraAngles();
  const which = Math.floor(s.age / SCUFFLE.swear) % a.swears.length;
  a.swears.forEach((h, i) => {
    const on = fight && s.age > 0.2 && i === which;
    h.setVisible(on);
    // Drawn bigger from farther off (as carried loads are), so its symbols still read in the builder's view.
    if (on) h.setMatrix(m(s.cx, s.y + SCUFFLE.cloudH + 0.1 + (tick % 2) * 0.015, s.cz, cam.yaw, 1.35 * balloonScale(), cam.pitch));
  });
  // Stars round the dazed heads.
  const dazed = s.phase === 'dazed' || (s.phase === 'up' && s.t < 0.4);
  a.stars.forEach((h, i) => {
    const who = i < 3 ? s.a : s.b;
    h.setVisible(dazed);
    if (!dazed) return;
    const head = who.y + (s.phase === 'dazed' ? 0.34 : 0.5);
    const ang = tick * 0.55 + (i % 3) * ((Math.PI * 2) / 3) + (i < 3 ? 0 : 1);
    h.setMatrix(m(who.x + Math.cos(ang) * 0.1, head + Math.sin(ang * 2) * 0.012, who.z + Math.sin(ang) * 0.1, -ang, 1));
  });
}

interface Drawn {
  look: Look;
  rig: Rig;
  handles: InstanceHandle[] | null;
  shown: boolean;
  /** What was last sent to the stage, to leave a still figure alone. */
  last: Float32Array;
  /** The chat bubble over their head while they talk. */
  bubble: InstanceHandle | null;
  /** A child's kite and its line (L28). */
  kite: { kite: InstanceHandle; line: InstanceHandle } | null;
  /** What they hold for their work: a broom, a rod, a sack… */
  tool: { kind: Tool; handle: InstanceHandle } | null;
  /** What they carry on an errand (L51 and up). */
  load: { kind: Load; handle: InstanceHandle } | null;
  /** Their everyday look, and the costume the drawing is in now (L57). */
  base: Look;
  costume: Person['costume'];
  /** L50: the hat knocked askew in a scuffle, drawn on its own. */
  askew: InstanceHandle | null;
  /** L57: wedding finery over the figure (a top hat, a veil and train…), placed with the body. */
  finery?: InstanceHandle | null;
  /** Seasons: wrapped up for the cold (a coat and a woolly hat). */
  wrapped?: boolean;
  /** Mischief: drawn without the hat (knocked off). */
  hatless?: boolean;
  /** The broom's stroke last drawn (a puff of dust at each). */
  stroke: number;
  /** Fishing: the line from the rod's tip to the float on the water, and whether a fish was tugging at the last drawing. */
  cast?: { line: InstanceHandle; float: InstanceHandle; tugged: boolean; ring: number } | null;
  /** The fishing pose's tug on the line is on (the float dips). */
  tug?: boolean;
  /** Fishing: how far the figure is drawn from its place in the crowd, stepped up to the dock's edge; which foot leads. */
  edgeX?: number;
  edgeZ?: number;
  edgeStride?: boolean;
}

/**
 * Fishing: the crowd keeps a fisher on the fishing spot (on the walking graph, 0.3 out from the middle of the cell);
 * the figure steps from there up to PEOPLE.fishReach out, toward where it faces, so it stands at the dock's edge in
 * front of a pier head's seat and bucket with its rod well out over the water, and steps back when it stops. Moves
 * `d.edgeX`, `d.edgeZ` toward that (or back to nothing) at PEOPLE.fishStep; true while it is stepping.
 */
function stepToEdge(p: Person, d: Drawn, fishing: boolean): boolean {
  let tx = 0, tz = 0;
  if (fishing) {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    // How far out it stands now, from the middle of its cell toward where it faces.
    const out = (p.x - (Math.floor(p.x) + 0.5)) * fx + (p.z - (Math.floor(p.z) + 0.5)) * fz;
    const step = Math.max(0, Math.min(PEOPLE.fishReach - 0.3, PEOPLE.fishReach - out));
    tx = fx * step;
    tz = fz * step;
  }
  const dx = tx - (d.edgeX ?? 0), dz = tz - (d.edgeZ ?? 0);
  const gap = Math.hypot(dx, dz);
  if (gap < 1e-6) return false;
  const k = Math.min(1, PEOPLE.fishStep / PERSON.drawRate / gap);
  d.edgeX = (d.edgeX ?? 0) + dx * k;
  d.edgeZ = (d.edgeZ ?? 0) + dz * k;
  d.edgeStride = !d.edgeStride;
  return true;
}

/**
 * Mischief: people in the air are drawn this many times a second, place and pose together (the rest of the crowd
 * PERSON.drawRate). Every frame: a body on a fast arc stepped at a lower rate, or its limbs held while it moved,
 * read as a strobe (Derek: "very obviously wrong").
 */
const FLY_RATE = 60;
let flyTick = -1;

/** Seasons: what the sky is doing, read once a frame in update (draw() has no signals). */
const sky = { rain: 0, cold: 0 };

/** Seasons: wrapped up for the cold: most put on a woolly hat, many a long coat. Each by their own seed. */
export function wrapLook(look: Look, id: string): Look {
  const r = (k: string): number => rand(0, id, 'wrap', k);
  const warm = ['#c8524a', '#e3b04b', '#5f8f6a', '#4f6fa8', '#8a5a8f'];
  const hat = look.hat === 'helmet' || look.hat === 'cap' ? look.hat : r('hat') < 0.78 ? 'bobble' : look.hat === 'straw' ? 'none' : look.hat;
  return { ...look, hat, hatColor: hat === 'bobble' ? warm[Math.floor(r('colour') * warm.length)]! : look.hatColor, dress: look.dress || (!look.child && r('coat') < 0.5) };
}

const loadM = new Float32Array(16);
/**
 * How much bigger to draw what people carry, from how far off the camera is: 1 close in (zoom 6 and
 * more), up to LOADS.far from the whole-island view. Read from the app's view (window.__lc), as the
 * scuffle's bubble does; 1 where there is none (tests, shots without the app).
 */
function loadScale(): number {
  const z = (globalThis as { __lc?: { view?: { getCamera?(): { zoom: number } } } }).__lc?.view?.getCamera?.().zoom;
  if (z === undefined) return 1;
  return 1 + (LOADS.far - 1) * Math.max(0, Math.min(1, (6 - z) / (6 - 1.6)));
}

/** L57: dressed for a wedding (finery.ts: the bride in white, the groom in black, …). */
export function costumeLook(base: Look, costume: Person['costume'], id = ''): Look {
  if (isFinery(costume)) return fineryLook(base, costume, id);
  // L63: dressed for the beach.
  if (isBeachWear(costume)) return beachLook(base, costume, id);
  // L50: after a scuffle the hat sits askew (drawn on its own, tipped; see draw()).
  if (costume === 'askew') return { ...base, hat: 'none' };
  // The raid: a raider (barbarian.ts).
  if (isBarbarian(costume)) return barbarianLook(base, costume);
  return base;
}

/** The tool in a person's hands now, from their pose and their job, or null. */
export function toolOf(p: Person, pose: string): Tool | null {
  if (pose === 'mow') return 'scythe';
  // The playing field: a racket or a mallet for the whole game (src/life/field).
  const tag = p.mode === 'linger' ? p.goal?.errand?.tag : undefined;
  if (tag === 'field:racket') return 'racket';
  if (tag === 'field:mallet') return 'mallet';
  // L63: a book in a deckchair, a spade at a sandcastle.
  if (pose === 'read') return 'book';
  if (pose === 'dig') return 'spade';
  // An errand's load fills their hands (loads.ts draws it): no other tool while it does.
  if (p.load) return null;
  // The raid: a townsperson taking on a raider, with a broom or a frying pan held up.
  const chase = p.goal?.errand?.tag;
  if (chase === 'chase:brawl' && !p.load) return rand(0, p.id, 'pan') < 0.5 ? 'pan' : 'broom';
  // The raid: a raider's brand, axe or club held up, the chief's standard (barbarian.ts).
  if (isBarbarian(p.costume) && pose !== 'sit' && pose !== 'lie' && pose !== 'dust') return raiderGear(p.costume);
  if (pose === 'hammer') return 'hammer';
  if (pose === 'juggle') return Math.floor(p.poseTime * 5) % 2 === 0 ? 'balls-a' : 'balls-b';
  const job = p.work?.job;
  const atWork = p.mode === 'linger' && p.goal?.haunt?.type === 'workplace';
  if (pose === 'sweep') return 'broom';
  if (pose === 'fish') return 'rod';
  if (pose === 'tend') return 'can';
  if (job === 'lamplighter' && (p.brisk || atWork)) return pose === 'wave' ? 'reach' : 'pole';
  if (pose === 'walk' && p.carrying) return job === 'baker' ? 'tray' : 'sack';
  if (pose === 'carry') return job === 'miller' ? 'sack' : 'tray';
  return null;
}

const toolMeshes = new Map<Tool, MeshData>();

interface State {
  crowd: Crowd;
  /** The crowd with the town's chains on it (L51 and up). */
  town: LivingTown;
  drawn: Map<Person, Drawn>;
  bubbleMesh: MeshData | null;
  lineMesh: MeshData | null;
  /** The plan's own resident instances, kept hidden. */
  standIns: InstanceHandle[];
  /** The drawing last shown (see update), and whether the town changed since, which draws at once. */
  tick: number;
  fresh: boolean;
  unsubscribe: () => void;
  /** L50: the scuffle's drawings, while one is on. */
  art: ScuffleArt | null;
  /** The ground under the town, for where a fishing line can reach the water. */
  sea: Sea | null;
}

interface Sea {
  height: Uint8Array;
  kinds: ReadonlyMap<CellKey, unknown>;
  /** Boats lying at their moorings and berths: (x, z) and how far round it the water is taken up. Read at sync. */
  boats: readonly (readonly [x: number, z: number, r: number])[];
}

/** Room taken on the water round a rowboat's mooring (it lies 0.44 out and swings, 0.62 long) and a fishing boat's berth. */
const ROWBOAT_ROOM = 0.85;
const BERTH_ROOM = 0.75;

/** The boats at rest in a dressing plan, from their moorings (rowboats) and berths (the fishing boat). */
function boatsOf(dressing: DressingPlan | null, stage: LifeStage): Sea['boats'] {
  const out: [number, number, number][] = [];
  for (const a of dressing?.actors ?? []) {
    if (a.type === 'rowboat' && a.at && 'socket' in a.at) {
      const m = stage.socket(a.at.socket);
      if (m) out.push([m[12]!, m[14]!, ROWBOAT_ROOM]);
    } else if (a.type === 'fishing-boat') {
      const at = a.params as { berthX?: unknown; berthZ?: unknown } | undefined;
      const x = Number(at?.berthX), z = Number(at?.berthZ);
      if (Number.isFinite(x) && Number.isFinite(z)) out.push([x, z, BERTH_ROOM]);
    }
  }
  return out;
}

/**
 * Open sea straight under (x, z): no land within half a cell (the drawn shore spills a little sand over the water
 * cells next to it), nothing built in its column from the water up to `top` (a deck, a boat house), and no boat
 * lying there at its mooring or berth (a sailboat under way, or a boat rowed off, is not looked for).
 */
function openWater(sea: Sea | null, x: number, z: number, top: number): boolean {
  if (!sea) return false;
  for (const [dx, dz] of SHORE_SAMPLES) {
    const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
    if (!inColumnBounds(cx, cz) || sea.height[columnIndex(cx, cz)] !== 0) return false;
  }
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let y = 0; y * CELL_H < top; y++) if (sea.kinds.has(key(cx, y, cz))) return false;
  for (const [bx, bz, r] of sea.boats) if ((x - bx) ** 2 + (z - bz) ** 2 < r * r) return false;
  return true;
}
const SHORE_SAMPLES: readonly (readonly [number, number])[] = [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.35, 0.35], [0.35, -0.35], [-0.35, 0.35], [-0.35, -0.35]];

/** How far the float goes under while a fish tugs, and a ring on the water every this many seconds while it sits. */
const FLOAT_DIP = 0.012;
const FLOAT_RING = 4.5;
const castM = { line: [] as number[], float: [] as number[] };
let castMeshes: { line: MeshData; float: MeshData } | null = null;

function releaseCast(d: Drawn): void {
  d.cast?.line.release();
  d.cast?.float.release();
  d.cast = null;
}

/**
 * Fishing: the line hangs from the rod's tip to a float on the sea, whatever the height of the deck (only where the
 * tip is out over open water: a rod held over planks or land has no line). Placed from the rod as last drawn; the
 * float dips and leaves a ring when a fish tugs, and a small ring now and then while it sits.
 */
function drawCast(p: Person, d: Drawn, stage: LifeStage, sea: Sea | null, seconds: number): void {
  const rod = d.tool?.kind === 'rod' && d.shown;
  const at = rod ? castLine(d.last.subarray(80, 96), SEA_Y, d.tug ? FLOAT_DIP : 0, castM.line, castM.float) : null;
  if (!at || !openWater(sea, at.x, at.z, at.tipY)) {
    if (d.cast) releaseCast(d);
    return;
  }
  if (!d.cast) {
    castMeshes ??= { line: castLineMesh(), float: floatMesh() };
    d.cast = { line: stage.spawnMesh(castMeshes.line, castM.line), float: stage.spawnMesh(castMeshes.float, castM.float), tugged: false, ring: Math.floor(seconds / FLOAT_RING + p.rank) };
  } else {
    d.cast.line.setMatrix(castM.line);
    d.cast.float.setMatrix(castM.float);
  }
  const ring = Math.floor(seconds / FLOAT_RING + p.rank);
  if ((d.tug && !d.cast.tugged) || ring !== d.cast.ring) wakeRing(stage, at.x, at.z, d.tug ? 0.03 : 0.022, d.tug ? 3 : 2.4, d.tug ? 1.4 : 1.8);
  d.cast.tugged = d.tug === true;
  d.cast.ring = ring;
}

/** The five pieces' matrices, then (slot 5) a long tool's, in the figure's frame and in the world. */
const local = new Float32Array(96);
const world = new Float32Array(96);
const IDENTITY: Mat4Like = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The resident cap for this device (L21): 60, or 30 on a phone-sized viewport. */
export function residentCap(): number {
  const w = (globalThis as { innerWidth?: number }).innerWidth;
  const h = (globalThis as { innerHeight?: number }).innerHeight;
  if (typeof w === 'number' && typeof h === 'number' && Math.min(w, h) < PEOPLE.phoneSide) return PEOPLE.capPhone;
  return PEOPLE.cap;
}

function emit<E extends 'personPassed' | 'residentHome' | 'lampReached' | 'bellRung' | 'scuffle'>(signals: Signals, event: E, payload: Parameters<SignalsDriver['emit']>[1]): void {
  (signals as Partial<SignalsDriver>).emit?.(event, payload as never);
}

/**
 * Mischief: a thrown figure, the whole of it turned about a point up its middle (`Person.tumble`):
 * world = T(x, y, z) · R · S(scale) · T(0, −pivot, 0) · local, into `world`.
 */
function tumbled(t: NonNullable<Person['tumble']>, scale: number, x: number, y: number, z: number, n: number): void {
  const R = t.rot!;
  for (let i = 0; i < n; i++) {
    const k = i * 16;
    for (let col = 0; col < 4; col++) {
      const o = k + col * 4;
      const lx = local[o]! * scale, ly = (local[o + 1]! - (col === 3 ? t.pivot : 0)) * scale, lz = local[o + 2]! * scale;
      world[o] = R[0]! * lx + R[3]! * ly + R[6]! * lz + (col === 3 ? x : 0);
      world[o + 1] = R[1]! * lx + R[4]! * ly + R[7]! * lz + (col === 3 ? y : 0);
      world[o + 2] = R[2]! * lx + R[5]! * ly + R[8]! * lz + (col === 3 ? z : 0);
      world[o + 3] = col === 3 ? 1 : 0;
    }
  }
}

function draw(p: Person, d: Drawn, stage: LifeStage, gust: boolean): void {
  // At the water or the map's edge people climb up into view or step down out of it; elsewhere they fade.
  const edge = p.edgeX !== 0 || p.edgeZ !== 0;
  const visible = p.visible && !p.inCloud && p.fade > (edge ? 0.001 : 0.02);
  if (!visible) {
    if (d.shown && d.handles) for (const h of d.handles) h.setVisible(false);
    d.shown = false;
    d.tool?.handle.release();
    d.tool = null;
    d.load?.handle.release();
    d.load = null;
    d.askew?.release();
    d.askew = null;
    d.finery?.setVisible(false);
    d.edgeX = d.edgeZ = 0;
    return;
  }
  // Seasons: each puts on (or takes off) their winter things at their own point as it turns cold.
  const wrapped = sky.cold > 0.4 + 0.3 * rand(0, p.id, 'wrap-at') && p.costume === null;
  // Mischief: thrown, and the hat knocked off (it lies on the ground until they pick it up).
  const hatless = p.tumble?.hatless === true;
  if (d.costume !== p.costume || (d.wrapped ?? false) !== wrapped || (d.hatless ?? false) !== hatless) {
    // L57: dressed for the wedding (or back in everyday clothes): drawn afresh.
    d.costume = p.costume;
    d.wrapped = wrapped;
    d.hatless = hatless;
    d.look = wrapped ? wrapLook(d.base, p.id) : costumeLook(d.base, p.costume, p.id);
    if (hatless) d.look = { ...d.look, hat: 'none' };
    d.rig = rigOf(d.look);
    if (d.handles) for (const h of d.handles) h.release();
    d.handles = null;
    d.finery?.release();
    d.finery = null;
  }
  if (!d.handles) {
    // Built the first time they are seen, so a town of sixty does not mesh sixty people in one frame.
    const meshes = buildPerson(d.look, p.id);
    d.handles = PIECES.map((piece) => stage.spawnMesh(meshes[piece], IDENTITY));
    // L57: their wedding finery, over the figure.
    const extra = isFinery(p.costume) ? fineryMesh(d.look, d.rig, p.costume, p.id) : isBeachWear(p.costume) ? beachMesh(d.look, d.rig, p.costume, p.id) : isBarbarian(p.costume) ? barbarianMesh(d.look, d.rig, p.costume, p.id) : null;
    d.finery = extra ? stage.spawnMesh(extra, IDENTITY) : null;
    d.shown = false;
  }
  const tumble = p.tumble ?? null;
  const name = p.react ?? p.pose;
  const walking = !tumble?.pose && (name === 'walk' || name === 'run' || name === 'panic');
  const pose = tumble?.pose ? { ...tumble.pose } : poseOf(name, walking ? p.stride : p.poseTime, p.rank);
  // Fishing: the pose's tug on the line (it leans back), which dips the float (drawCast).
  d.tug = name === 'fish' && pose.lean < 0;
  // L26: a strong gust, and a hand goes to the hat.
  if (gust && d.look.hat !== 'none' && (walking || name === 'stand')) {
    pose.armR = 2.95;
    pose.outR = -0.2;
  }
  // Hands on what they hold (hands.ts): the thing is placed, then the arms are posed onto it.
  // Seasons: in the rain, an umbrella for anyone walking or standing about with their hands free.
  const tool = tumble ? null :
    toolOf(p, name) ??
    (sky.rain > 0.25 && !p.load && rand(0, p.id, 'umbrella') < 0.75 && (walking || name === 'stand' || name === 'look' || name === 'chat')
      ? UMBRELLAS[Math.floor(rand(0, p.id, 'umbrella-colour') * UMBRELLAS.length)]!
      : null);
  // Fishing: a short step up to the dock's edge as they start, and back as they stop (only the figure moves).
  if (stepToEdge(p, d, tool === 'rod' && name === 'fish' && p.mode === 'linger' && !p.goal?.errand?.tag?.startsWith('fire:'))) {
    const s = d.edgeStride ? 0.35 : -0.35;
    pose.legL = s;
    pose.legR = -s;
  }
  // A load is in the hands whatever the pose (a cheer, a turn to look, a flinch): only the scythe leaves them, to mow.
  const holding = p.load !== null && name !== 'mow';
  const longTool = applyHold(pose, d.rig, {
    tool: tool ?? (walking && !tumble && p.carrying && !p.load ? (p.work?.job === 'baker' ? 'tray' : 'sack') : null),
    load: holding ? p.load : null,
    hold: holding ? HOLD_OF[p.load!] : null,
    anchor: holding ? holdAnchor(p.load!) : null,
  });
  if (holding && walking && HEAVY.has(p.load!)) pose.lean += 0.14;
  const sitting = name === 'sit' && p.seat >= 0;
  const scale = d.look.scale * (edge ? 1 : 0.35 + 0.65 * p.fade) * (tumble?.grow ?? 1) * (p.raider ? raiderScale() : 1);
  const away = edge ? 1 - p.fade : 0;
  // Down below the water (SEA_Y) by the end, head and all: a step out, then the drop.
  const depth = Math.max(0.5, p.y - SEA_Y + DESIGN_HEIGHT * scale + 0.05);
  const px = p.x + p.edgeX * away + (p.drawX ?? 0) + (d.edgeX ?? 0), pz = p.z + p.edgeZ * away + (p.drawZ ?? 0) + (d.edgeZ ?? 0);
  // The drop comes over the last part of the way: off a dock's end at once, down a beach into the shallows.
  const len = Math.hypot(p.edgeX, p.edgeZ);
  const from = len > 1 ? 0.62 : 0.15;
  const py = p.y + p.lift - depth * easeIn(Math.max(0, Math.min(1, (away - from) / (0.92 - from))));
  rigMatrices(d.look, pose, local, tumble ? tumble.drop : sitting ? sitDrop(d.rig, p.seat / scale) : 0, d.rig);
  if (longTool) local.set(longTool, 80);
  if (tumble?.rot) tumbled(tumble, scale, p.x, p.y, p.z, longTool ? 6 : 5);
  else {
    // world = T(x, y, z) · Ry(heading) · S(scale) · local
    const c = Math.cos(p.heading) * scale, s = Math.sin(p.heading) * scale;
    for (let i = 0; i < (longTool ? 6 : 5); i++) {
      const k = i * 16;
      for (let col = 0; col < 4; col++) {
        const o = k + col * 4;
        const lx = local[o]!, ly = local[o + 1]!, lz = local[o + 2]!;
        world[o] = c * lx + s * lz + (col === 3 ? px : 0);
        world[o + 1] = scale * ly + (col === 3 ? py : 0);
        world[o + 2] = -s * lx + c * lz + (col === 3 ? pz : 0);
        world[o + 3] = col === 3 ? 1 : 0;
      }
    }
  }
  // The tool of their trade, in the hand that holds it.
  if (d.tool && d.tool.kind !== tool) {
    d.tool.handle.release();
    d.tool = null;
  }
  if (tool && !d.tool) {
    let mesh = toolMeshes.get(tool);
    if (!mesh) toolMeshes.set(tool, (mesh = toolMesh(tool)));
    d.tool = { kind: tool, handle: stage.spawnMesh(mesh, world.subarray(TOOL_PIECE[tool] * 16, TOOL_PIECE[tool] * 16 + 16)) };
    d.shown = false; // place it now
  }
  // An errand's load: in the hands, at the body's frame (a scythe off the shoulder and in the hands while mowing).
  const load = name === 'mow' ? null : p.load;
  if (d.load && d.load.kind !== load) {
    d.load.handle.release();
    d.load = null;
  }
  if (load && !d.load) {
    d.load = { kind: load, handle: stage.spawnMesh(carriedMesh(load), world.subarray(0, 16)) };
    d.shown = false;
  }
  // A still figure is left alone: nothing moved, so the page need not redraw its shade.
  let same = d.shown;
  for (let i = 0; same && i < 96; i++) same = d.last[i] === world[i];
  if (!d.shown) {
    for (const h of d.handles) h.setVisible(true);
    d.finery?.setVisible(true);
    d.shown = true;
  }
  if (same) return;
  d.last.set(world);
  for (let i = 0; i < 5; i++) d.handles[i]!.setMatrix(world.subarray(i * 16, i * 16 + 16));
  d.finery?.setMatrix(world.subarray(0, 16));
  if (d.tool) d.tool.handle.setMatrix(world.subarray(TOOL_PIECE[d.tool.kind] * 16, TOOL_PIECE[d.tool.kind] * 16 + 16));
  // A little dust off the broom at the end of each stroke.
  if (name === 'sweep' && d.tool?.kind === 'broom') {
    const stroke = Math.floor((p.poseTime + p.rank * 7) * 3);
    if (stroke !== d.stroke && stroke % 2 === 0 && stroke % 8 !== 6) {
      const bx = world[92]!, by = world[93]!, bz = world[94]!;
      fxOf(stage).play({ actor: 'puff', variant: 'dust' }, 0.4, (t, m) => place(bx + t * 0.04, by + 0.01 + t * 0.05, bz, 0, 0.07 + t * 0.12, 0.07 + t * 0.12, 0.07 + t * 0.12, m));
    }
    d.stroke = stroke;
  }
  // L50: a hat tipped over one ear after a scuffle.
  const askew = p.costume === 'askew' && d.base.hat !== 'none';
  if (askew && !d.askew) d.askew = stage.spawnMesh(popMesh('hat'), IDENTITY);
  if (!askew && d.askew) {
    d.askew.release();
    d.askew = null;
  }
  if (d.askew) {
    // On the head (the body frame's top, figure units), tipped sideways and a little back.
    const t = 0.55, ct = Math.cos(t), st = Math.sin(t);
    const k = 0.95;
    // body · T(0.03, 0.385, -0.01) · Rz(t) · S(k / scale): the hat is in world units, the body frame in figure units.
    const sc = k / d.look.scale;
    const lx = [ct * sc, st * sc, 0], ly = [-st * sc, ct * sc, 0], lz = [0, 0, sc];
    const m = new Array<number>(16).fill(0);
    for (let c = 0; c < 3; c++) {
      const v = [lx, ly, lz][c]!;
      for (let r = 0; r < 3; r++) m[c * 4 + r] = world[r]! * v[0]! + world[4 + r]! * v[1]! + world[8 + r]! * v[2]!;
    }
    for (let r = 0; r < 3; r++) m[12 + r] = world[r]! * 0.03 + world[4 + r]! * 0.385 + world[8 + r]! * -0.01 + world[12 + r]!;
    m[15] = 1;
    d.askew.setMatrix(m);
  }
  if (d.load) {
    // About its hold anchor, and bigger when the camera is far off (so a sack still reads on a shoulder
    // from the whole-island view; close up it is its own size).
    const [ax, ay, az] = holdAnchor(d.load.kind);
    const k = NOT_GROWN.has(d.load.kind) ? 1 : loadScale();
    for (let i = 0; i < 12; i++) loadM[i] = world[i]! * (i % 4 === 3 ? 1 : k);
    loadM[12] = world[0]! * ax + world[4]! * ay + world[8]! * az + world[12]!;
    loadM[13] = world[1]! * ax + world[5]! * ay + world[9]! * az + world[13]!;
    loadM[14] = world[2]! * ax + world[6]! * ay + world[10]! * az + world[14]!;
    loadM[15] = 1;
    d.load.handle.setMatrix(loadM);
  }
}

export default defineSystem<State>({
  id: 'people',
  order: 20,
  create(ctx) {
    const drawn = new Map<Person, Drawn>();
    const doorAt = (door: NavDoor): { x: number; z: number } | null => {
      if (door.socket === undefined || door.dir === undefined) return null;
      const m = ctx.stage.socket(door.socket);
      if (!m) return null;
      // Only a frame that really is at this door's face (a stage with no layout answers with the origin).
      const [dx, dz] = DIR4[door.dir]!;
      const fx = keyX(door.cell) + 0.5 + dx * 0.5, fz = keyZ(door.cell) + 0.5 + dz * 0.5;
      const x = m[12]!, z = m[14]!;
      return Math.abs(x - fx) < 0.8 && Math.abs(z - fz) < 0.8 ? { x, z } : null;
    };
    const town = createLivingTown({
      seed: ctx.seed,
      stage: ctx.stage,
      restingMesh,
      cap: residentCap(),
      doorAt,
      wind: (x, z) => ctx.signals.wind(x, z),
      obstacles: () => obstaclesOf(ctx.stage),
      // L38–L40: the quay draws a crowd while a big ship is in.
      favour: (h) => (shipInFor(ctx.stage, h.id.split('/')[0]!) ? 6 : 0),
      seatAt(socket) {
        const m = ctx.stage.socket(socket);
        if (!m || (m[12] === 0 && m[13] === 0 && m[14] === 0)) return null;
        return { x: m[12]!, y: m[13]!, z: m[14]!, face: Math.atan2(m[8]!, m[10]!) };
      },
      events: {
        home(home, count) {
          recordHome(ctx.signals, home, count);
          emit(ctx.signals, 'residentHome', { home, count });
          // L07, L25: a house's windows light only while somebody is in.
          setOccupied(ctx.stage, home, count > 0);
        },
        passed(cell) {
          emit(ctx.signals, 'personPassed', cell);
        },
        lamp(lamp) {
          emit(ctx.signals, 'lampReached', { lamp });
          lightLamp(ctx.stage, lamp); // L08: it lights as they reach it
        },
        bell(structure) {
          emit(ctx.signals, 'bellRung', structure);
        },
        scuffle(s, what) {
          emit(ctx.signals, 'scuffle', { x: s.x, z: s.z, what });
          // The pigeons round it scatter.
          if (what === 'start') scaresOf(ctx.stage).add(s.cell, 3, false, ctx.signals.time.seconds);
        },
        added(p) {
          const look = lookOf(p.look, p.child);
          drawn.set(p, { look, rig: rigOf(look), handles: null, shown: false, last: new Float32Array(96), bubble: null, kite: null, tool: null, load: null, base: look, costume: null, askew: null, stroke: 0 });
        },
        removed(p) {
          const d = drawn.get(p);
          if (d?.handles) for (const h of d.handles) h.release();
          d?.bubble?.release();
          d?.kite?.kite.release();
          d?.kite?.line.release();
          if (d) releaseCast(d);
          d?.tool?.handle.release();
          d?.load?.handle.release();
          d?.askew?.release();
          d?.finery?.release();
          drawn.delete(p);
        },
      },
    });
    const crowd = town.crowd;
    const offs = [
      ctx.signals.on('blockLanded', (cell) => {
        crowd.blockLanded(cell);
        town.landed(cell); // L54: builders come
      }),
      // Something taken away: those near turn and look too.
      ctx.signals.on('blockRemoved', (cell) => crowd.blockLanded(cell)),
    ];
    const unsubscribe = (): void => offs.forEach((off) => off());
    // L29: the door leaves swing as the crowd's door table says.
    setDoorTable(ctx.stage, crowd.doors);
    setCrowd(ctx.stage, crowd);
    // The debug handle for browser tests and for watching (like the app's window.__lc): the newest crowd.
    (globalThis as { __lcPeople?: Crowd }).__lcPeople = crowd;
    (globalThis as { __lcTown?: LivingTown }).__lcTown = town;
    return { crowd, town, drawn, bubbleMesh: null, lineMesh: null, standIns: [], tick: -1, fresh: true, unsubscribe, art: null, sea: null };
  },
  sync(state, next, _prev, ctx) {
    state.sea = { height: next.shape.facts.terrain.height, kinds: next.shape.facts.kinds, boats: next.dressing ? boatsOf(next.dressing, ctx.stage) : (state.sea?.boats ?? []) };
    if (!next.dressing) {
      // Just after an edit: the town's chains take the new shape now (L54 reads what landed).
      state.town.sync(next.shape, null, ctx.signals.time);
      return;
    }
    state.standIns = [];
    for (const a of next.dressing.actors) {
      if (a.type !== 'resident') continue;
      const h = ctx.stage.instance(a.id);
      if (h) state.standIns.push(h);
    }
    for (const h of state.standIns) h.setVisible(false);
    state.town.sync(next.shape, next.dressing, ctx.signals.time);
    state.fresh = true;
    // The lamps on the lamplighter's round wait for them: each a little longer than the walk to it
    // should take, so a lamp they never reach still lights, in round order.
    const round = state.crowd.jobs.find((j) => j.job === 'lamplighter' && j.worker !== null);
    if (round) round.refs.forEach((lamp, k) => deferLamp(ctx.stage, lamp, PEOPLE.lampWait + k * PEOPLE.lampStep));
    markCensusReady(ctx.signals);
  },
  update(state, dt, signals, ctx) {
    // Whatever else touches the plan's instances (pop-in, a re-sync), the stand-ins stay hidden.
    for (const h of state.standIns) h.setVisible(false);
    state.town.board.setSky(seasonOf(signals), weatherOf(signals));
    sky.rain = weatherOf(signals).rain;
    sky.cold = seasonOf(signals).cold;
    state.town.step(dt, signals.time);
    // L50: the scuffle's cloud, its pop-outs, its swearing and the dazed stars.
    const sc = state.crowd.scuffles.now;
    if (state.art && (!sc || sc.n !== state.art.n)) {
      releaseArt(state.art);
      state.art = null;
    }
    if (sc) {
      state.art ??= spawnArt(ctx.stage, sc.n, sc);
      drawArt(state.art, sc, signals.time.seconds);
    }
    // Drawn "on twos": the crowd steps every frame, but the picture of it changes PERSON.drawRate times
    // a second. That is the hand of the thing, and it also spares the page: every frame in which
    // something moved costs the renderer a second pass for the shade on the ground.
    const tick = Math.floor(signals.time.seconds * PERSON.drawRate);
    if (tick === state.tick && !state.fresh) {
      // Except anybody flying through the air (mischief): their place is drawn FLY_RATE times a second (their
      // pose is still held at the crowd's rate), smooth enough for a fast arc and half the cost of every frame.
      const fly = Math.floor(signals.time.seconds * ((globalThis as { __lcFlyRate?: number }).__lcFlyRate ?? FLY_RATE));
      if (fly === flyTick) return;
      flyTick = fly;
      for (const p of state.crowd.people) {
        if (!p.tumble?.rot) continue;
        const d = state.drawn.get(p);
        if (d) draw(p, d, ctx.stage, false);
      }
      return;
    }
    state.tick = tick;
    state.fresh = false;
    for (const p of state.crowd.people) {
      const d = state.drawn.get(p);
      if (!d) continue;
      const gust = p.visible && d.look.hat !== 'none' && signals.wind(p.x, p.z).strength > PEOPLE.gust;
      draw(p, d, ctx.stage, gust);
      drawCast(p, d, ctx.stage, state.sea, signals.time.seconds);
      // The chat bubble over whoever is talking (L26).
      const talking = p.bubble && p.visible;
      if (talking) {
        d.bubble ??= ctx.stage.spawnMesh((state.bubbleMesh ??= bubbleMesh()), IDENTITY);
        // A flat balloon, turned to the camera as the scuffle's swearing is.
        d.bubble.setMatrix(facing(p.x, p.y + (DESIGN_HEIGHT + 0.2) * d.look.scale, p.z, cameraAngles(), balloonScale()));
      } else if (d.bubble) {
        d.bubble.release();
        d.bubble = null;
      }
      // A kite (L28): downwind and up, weaving a little; its line from the raised hand.
      if (p.flying && p.visible) {
        if (!d.kite) {
          state.lineMesh ??= lineMesh();
          d.kite = { kite: ctx.stage.spawnMesh(kiteMesh(p.look % 10), IDENTITY), line: ctx.stage.spawnMesh(state.lineMesh, IDENTITY) };
        }
        const wind = signals.wind(p.x, p.z);
        const t = signals.time.seconds;
        const weave = Math.sin(t * 1.3 + p.rank * 20) * 0.2, bob = Math.sin(t * 0.9 + p.rank * 11) * 0.1;
        const pull = Math.min(1.3, 0.7 + wind.strength);
        const kx = p.x + wind.dirX * PEOPLE.kiteOut * pull - wind.dirZ * weave;
        const ky = p.y + PEOPLE.kiteUp + bob;
        const kz = p.z + wind.dirZ * PEOPLE.kiteOut * pull + wind.dirX * weave;
        const hx = p.x + Math.sin(p.heading) * 0.05, hy = p.y + 0.44 * d.look.scale, hz = p.z + Math.cos(p.heading) * 0.05;
        // The kite faces back toward the child, tipped up into the wind.
        const zx = -wind.dirX * 0.8, zy = 0.6, zz = -wind.dirZ * 0.8;
        const xl = Math.hypot(zz, zx) || 1;
        const xx = zz / xl, xz = -zx / xl;
        d.kite.kite.setMatrix([xx, 0, xz, 0, zy * xz, zz * xx - zx * xz, -zy * xx, 0, zx, zy, zz, 0, kx, ky, kz, 1]);
        // The line: its mesh runs one unit along +X, so the X column is the whole span.
        const lx = kx - hx, ly = ky - hy, lz = kz - hz;
        const ll = Math.hypot(lx, ly, lz) || 1;
        const sx = lz / (Math.hypot(lx, lz) || 1), sz = -lx / (Math.hypot(lx, lz) || 1);
        const ux = (-ly * sz) / ll, uy = (sz * lx - sx * lz) / ll, uz = (ly * sx) / ll; // S × L: right-handed
        d.kite.line.setMatrix([lx, ly, lz, 0, ux, uy, uz, 0, sx, 0, sz, 0, hx, hy, hz, 1]);
      } else if (d.kite) {
        d.kite.kite.release();
        d.kite.line.release();
        d.kite = null;
      }
    }
  },
  dispose(state, ctx) {
    state.unsubscribe();
    state.town.dispose();
    if (state.art) releaseArt(state.art);
    state.art = null;
    setDoorTable(ctx.stage, null);
    setCrowd(ctx.stage, null);
    for (const d of state.drawn.values()) {
      if (d.handles) for (const h of d.handles) h.release();
      d.bubble?.release();
      d.kite?.kite.release();
      d.kite?.line.release();
      releaseCast(d);
      d.tool?.handle.release();
      d.load?.handle.release();
      d.askew?.release();
      d.finery?.release();
    }
    state.drawn.clear();
  },
});

