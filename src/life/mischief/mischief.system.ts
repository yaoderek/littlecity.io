// Mischief, drawn (design section 13b). Owner: Mischief.
//
// Steps the director's engine and draws what it is doing: flames licking
// from windows and roofs on twos, leaning with the wind; sparks; a column of
// smoke that rises, leans and thins into a soft wash against the sky; embers
// that glow in a burnt-out shell and slowly die; the bomb falling, its fuse
// fizzing; the dust of the blast (no drawn burst), every bird in town taking off,
// neighbours shaken; and the building's own chunks flying out on arcs,
// tumbling, and landing where its rubble heap is baked (so they become it).
// A spout in the water. Nothing here is saved; the damage is, by the engine.

import { lifeLow, phoneSized } from '../quality';
import { CELL_H, columnIndex, DIR4, inColumnBounds, key, keyX, keyY, keyZ, SEA_Y, type CellKey } from '@/core/grid';
import { compose, multiply, rotationX, rotationY, rotationZ, scaling, translation, type Mat4 } from '@/core/mat4';
import { hash, rand } from '@/core/rand';
import { blastChunks, roofSampler, type withDamage } from '@/gen/damage/damage';
import { chunkMatrix, type Chunk } from '@/gen/damage/debris';
import { AIRBORNE } from '@/gen/airborne';
import { polysOf, Soup } from '@/gen/damage/poly';
import { allGenerators, allParts } from '@/gen/discover';
import type { MeshData } from '@/gen/mesh';
import type { ShapePlan, StructureId } from '@/resolve/plan';
import { ruinCause, ruinSettling, ruinStage, ruinUninhabitable } from '@/world/damage';
import { defineSystem, type InstanceHandle, type LifeStage, type Signals, type SpawnSpec } from '../api';
import { scaresOf } from '../birds/scare';
import { fxOf } from '../fx/fx';
import { ownStage, type Owned } from './owned';
import { mischiefOf, type Director, type MischiefEvent } from './director';
import { bombMesh, dustMesh, emberMesh, fallenSailsMesh, firelightMesh, flameMesh, FUSE_TIP, smokeMesh, sparkMesh, spoutMesh, windowGlowMesh } from './meshes';

/** Instances of one mesh, reused: a finished flame is hidden and handed to the next. */
class Pool {
  private free: InstanceHandle[] = [];
  constructor(
    private stage: LifeStage,
    private mesh: () => MeshData,
  ) {}
  take(): InstanceHandle {
    const h = this.free.pop() ?? this.stage.spawnMesh(this.mesh(), HIDDEN);
    return h;
  }
  give(h: InstanceHandle): void {
    h.setVisible(false);
    if (this.free.length < 256) this.free.push(h);
    else h.release();
  }
  dispose(): void {
    for (const h of this.free) h.release();
    this.free = [];
  }
}

/** A phone-sized viewport (as the crowd decides): fewer puffs and sparks, one flame at a window instead of two. */
function phone(): boolean {
  const w = (globalThis as { innerWidth?: number }).innerWidth;
  const h = (globalThis as { innerHeight?: number }).innerHeight;
  return typeof w === 'number' && typeof h === 'number' && Math.min(w, h) < 600;
}
const LIGHT = phone();
const PUFF_CAP = LIGHT ? 60 : 160;
const SPARK_CAP = LIGHT ? 50 : 140;

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -50, 0, 1];
const FPS = 12;

interface Spot {
  x: number;
  y: number;
  z: number;
  size: number;
  /** On top of what is there (a ridge, an eave, a broken wall top), so smoke and sparks rise from it. */
  top: boolean;
  /** Out of a window or door: it licks out and up the wall, leaning along (nx, nz). */
  window: boolean;
  nx: number;
  nz: number;
}
interface Flame {
  cell: CellKey;
  spots: Spot[];
  handles: InstanceHandle[];
  looks: number[];
  /** The glow inside each window spot (null for spots that are not at a window). */
  glows: (InstanceHandle | null)[];
  phase: number;
  intensity: number;
  frame: number;
  /** The structure's hash the spots were found for (the ruin changes as it burns, and the flames move down with it). */
  shapeHash: number;
}
interface Puff {
  ink: InstanceHandle;
  /** 0 dark, 1 grey, 2 pale: it pales as it rises. */
  shade: number;
  mist: InstanceHandle;
  look: number;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  size: number;
  misted: boolean;
}
interface Spark {
  h: InstanceHandle;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}
interface Ember {
  h: InstanceHandle;
  age: number;
  life: number;
}
interface BombDraw {
  h: InstanceHandle;
  sparkIn: number;
}
interface Flight {
  chunks: Chunk[];
  handles: InstanceHandle[];
  age: number;
  arcs: { h: number; spin: number; delay: number; dur: number }[];
  /** Pieces that have come down (each lands once, with a thump of dust). */
  landed: boolean[];
}
interface Shake {
  id: StructureId;
  h: InstanceHandle | null;
  age: number;
  amp: number;
}
interface Spout {
  h: InstanceHandle;
  age: number;
  x: number;
  z: number;
}

interface State {
  d: Director;
  /** Everything this draws (so dispose takes back all of it). */
  own: Owned;
  shape: ShapePlan | null;
  flames: Map<CellKey, Flame>;
  puffs: Puff[];
  sparks: Spark[];
  embers: Map<CellKey, Ember>;
  bombs: Map<number, BombDraw>;
  flights: Map<StructureId, Flight>;
  /** Structures whose chunks should fly once the town shows them broken. */
  toFly: Set<StructureId>;
  shakes: Shake[];
  toShake: { id: StructureId; amp: number }[];
  spouts: Spout[];
  pools: Map<string, Pool>;
  smokeAcc: Map<StructureId, number>;
  /** A wrecked windmill's sails, down on the ground beside it (falling there when it happens). */
  sails: Map<StructureId, { h: InstanceHandle; burnt: boolean; age: number; fall: boolean; x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; yaw: number }>;
  dust: Dust[];
  samplers: Map<StructureId, { hash: number; at: number; sample: (x: number, z: number, minY: number) => number | null }>;
  /** Seconds to the next fright for the birds round each fire. */
  scareIn: number;
  /** Firelight round each burning building. */
  lights: Map<StructureId, InstanceHandle>;
  sparkAcc: number;
  /** Roofs built outright this frame (a blast lights many buildings at once: one a frame, the rest wait). */
  built: number;
  time: number;
  off: () => void;
}


function pool(st: State, stage: LifeStage, k: string, mesh: () => MeshData): Pool {
  let p = st.pools.get(k);
  if (!p) st.pools.set(k, (p = new Pool(st.own.stage, mesh)));
  return p;
}

const HOUSELIKE = new Set<string>(['house', 'windmill', 'tower', 'lighthouse']);

/**
 * Where flames grow on a burning block, all rooted on what is really there: out of its windows and door
 * (licking up the wall), and on top of whatever is highest over it (the ridge and the eaves while the roof
 * stands, the broken wall tops and the floor of a shell once it has gone). `sample` is the height of the
 * structure's own top surface at a point.
 */
function spotsOf(shape: ShapePlan, cell: CellKey, sample: ((x: number, z: number, minY: number) => number | null) | null): Spot[] {
  const x = keyX(cell), y = keyY(cell), z = keyZ(cell);
  const floor = y * CELL_H;
  const sid = shape.structureAt.get(cell);
  const kind = shape.kinds.get(cell) ?? '';
  const out: Spot[] = [];
  const top = sid === undefined || shape.structureAt.get(key(x, y + 1, z)) !== sid;
  const seed = hash(shape.world.seed, 'flames', cell);
  if (HOUSELIKE.has(kind)) {
    const feats = (sid === undefined ? [] : shape.featuresByStructure.get(sid) ?? []).filter(
      (f) => f.cell === cell && f.dir !== undefined && (f.type === 'window' || f.type === 'door'),
    );
    feats.sort((a, b) => hash(seed, a.id) - hash(seed, b.id));
    for (const f of feats.slice(0, LIGHT ? 1 : 2)) {
      const [dx, dz] = DIR4[f.dir!]!;
      const door = f.type === 'door';
      out.push({ x: x + 0.5 + dx * 0.5, y: floor + (door ? 0.04 : 0.26), z: z + 0.5 + dz * 0.5, size: door ? 0.6 : 0.5, top: false, window: true, nx: dx, nz: dz });
    }
  }
  if (!top && HOUSELIKE.has(kind)) return out;
  // On top: the highest surface over a few points of the cell (its middle and toward each side).
  const pts: [number, number][] = [[0.5, 0.5], [0.24, 0.5], [0.76, 0.5], [0.5, 0.24], [0.5, 0.76]];
  const cands: { x: number; y: number; z: number }[] = [];
  for (const [px, pz] of pts) {
    const h = sample ? sample(x + px, z + pz, floor - 0.01) : floor + CELL_H;
    if (h === null || h > floor + CELL_H * 2.5) continue;
    cands.push({ x: x + px, y: h, z: z + pz });
  }
  cands.sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z);
  const picked: typeof cands = [];
  for (const c of cands) {
    if (picked.length >= (LIGHT ? 2 : 3)) break;
    if (picked.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 0.2)) continue;
    picked.push(c);
  }
  picked.forEach((c, i) => {
    const tree = kind === 'tree';
    // In a tree the flames are in the crown; elsewhere they stand on the top, their base sunk into it.
    const y0 = tree ? c.y - 0.42 : c.y - 0.05;
    const size = (i === 0 ? 1 : 0.72) * (tree ? 0.95 : kind === 'dock' || kind === 'fence' ? 0.6 : HOUSELIKE.has(kind) ? 1 : 0.8);
    out.push({ x: c.x, y: y0, z: c.z, size, top: true, window: false, nx: 0, nz: 0 });
  });
  return out;
}

function settlingOf(shape: ShapePlan, id: StructureId): boolean {
  const s = shape.structures.get(id);
  if (!s) return false;
  for (const c of s.cells) if (ruinSettling(shape.world.blocks.get(c)?.ruin)) return true;
  return false;
}

function chunkMesh(ch: Chunk): MeshData {
  const soup = new Soup();
  for (const p of ch.polys) soup.add({ ...p, pattern: p.pattern | AIRBORNE });
  return soup.build();
}

/** The middle of a chunk where it was (its polygons' mean). */
function centreOf(ch: Chunk): [number, number, number] {
  let x = 0, y = 0, z = 0, n = 0;
  for (const p of ch.polys) for (const v of p.v) {
    x += v[0]!;
    y += v[1]!;
    z += v[2]!;
    n++;
  }
  return n ? [x / n, y / n, z / n] : ch.from;
}

/** Chunks of one structure in the air at once, at most (desktop; a phone or the roughest levels). */
const FLY_MAX = 48;
const FLY_PHONE = 18;

/** Every k-th chunk, so a big break throws a few pieces from all over it. */
export function capChunks<T>(chunks: readonly T[], max: number): T[] {
  if (chunks.length <= max) return [...chunks];
  const step = chunks.length / max;
  return Array.from({ length: max }, (_, i) => chunks[Math.floor(i * step)]!);
}

function startFlight(st: State, stage: LifeStage, id: StructureId): void {
  const shape = st.shape;
  const s = shape?.structures.get(id);
  if (!shape || !s) return;
  const reg = allGenerators() as ReturnType<typeof allGenerators> & { intact?: ReturnType<typeof allGenerators> };
  const intact = (reg.intact ?? reg).build(s, shape, allParts());
  // A big structure broken in many places (a quay, a port) throws only a share of its pieces; the rest are
  // simply gone from the hole they leave (cheap on phones).
  const chunks = capChunks(blastChunks(intact.mesh, s, shape), phoneSized() || lifeLow() ? FLY_PHONE : FLY_MAX);
  if (chunks.length === 0) return;
  const old = st.flights.get(id);
  if (old) for (const h of old.handles) h.release();
  const flight: Flight = { chunks, handles: [], age: 0, arcs: [], landed: chunks.map(() => false) };
  for (const ch of chunks) {
    const h = st.own.stage.spawnMesh(chunkMesh(ch), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    flight.handles.push(h);
    const r = (n: string): number => rand(ch.key, n);
    flight.arcs.push({
      h: ch.topple ? 0 : 0.6 + r('arc') * 1.6,
      spin: ch.topple ? 0 : (r('spin') < 0.5 ? -1 : 1) * Math.PI * 2 * Math.floor(1 + r('turns') * 2),
      delay: ch.topple ? 0.05 : r('delay') * 0.12,
      dur: ch.topple ? 1.0 : 0.8 + r('dur') * 0.45,
    });
  }
  st.flights.set(id, flight);
}

function endFlight(st: State, id: StructureId): void {
  const f = st.flights.get(id);
  if (!f) return;
  for (const h of f.handles) h.release();
  st.flights.delete(id);
}

function onEvent(st: State, stage: LifeStage, signals: Signals, e: MischiefEvent): void {
  if (e.type === 'reset' || e.type === 'undo') {
    // Called off or undone (undo, a new town grown here, a different town): what is in the air goes
    // at once. (Flames, firelight, embers and fallen sails follow the town and the fires, and go with them.)
    for (const p of st.puffs) for (const h of [p.ink, p.mist]) h.release();
    for (const d of st.dust) for (const h of [d.ink, d.mist]) h.release();
    for (const x of [...st.sparks, ...st.spouts, ...st.bombs.values()]) x.h.release();
    for (const s of st.shakes) s.h?.release();
    for (const id of [...st.flights.keys()]) endFlight(st, id);
    st.puffs = [];
    st.dust = [];
    st.sparks = [];
    st.spouts = [];
    st.shakes = [];
    st.bombs.clear();
    st.toFly.clear();
    st.toShake = [];
    return;
  }
  const fx = fxOf(stage);
  if (e.type === 'drop') {
    // The nuke's casing is drawn by nuke.system.ts.
    if (e.bomb.nuke) return;
    const h = st.own.stage.spawnMesh(bombMesh(), HIDDEN);
    st.bombs.set(e.bomb.id, { h, sparkIn: 0 });
  } else if (e.type === 'blast') {
    const b = st.bombs.get(e.bomb);
    if (b) {
      b.h.release();
      st.bombs.delete(e.bomb);
    }
    const [x, y, z] = e.blast.point;
    // Every bird in town takes off.
    scaresOf(stage).add(key(Math.floor(x), Math.max(0, Math.floor(y / CELL_H)), Math.floor(z)), 99, false, signals.time.seconds);
    if (e.blast.water) {
      st.spouts.push({ h: st.own.stage.spawnMesh(spoutMesh(), HIDDEN), age: 0, x, z });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        fx.play({ actor: 'puff', variant: 'mist' } as SpawnSpec, 1.6, (t, m) => {
          const s = 0.4 + t * 0.6;
          setPlace(m, x + Math.cos(a) * (0.3 + t * 0.7), SEA_Y + 0.9 * Math.sin(t * Math.PI) + 0.2, z + Math.sin(a) * (0.3 + t * 0.7), s);
        }, { glow: (t) => 0.8 * (1 - t) });
      }
      return;
    }
    // The nuke's flash, shockwave, cloud and shudders are drawn by nuke.system.ts.
    if (!e.nuke) {
      // No drawn burst at the blast (removed at Derek's request, 2026-11-20): the dust, smoke and fire say it.
      // By the water (a pier, a house on stilts) the dust is thin, so what goes over into the water is seen.
      const wet = st.shape ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const cx = Math.floor(x) + dx!, cz = Math.floor(z) + dz!;
        return inColumnBounds(cx, cz) && st.shape!.terrain.height[columnIndex(cx, cz)] === 0;
      }) : false;
      addDust(st, stage, x, y, z, wet ? (LIGHT ? 4 : 6) : LIGHT ? 12 : 20, wet ? 1.1 : 1.6, e.bomb);
    }
    const hitStructures = new Map<StructureId, number>();
    for (const h of e.blast.hit) {
      const sid = st.shape?.structureAt.get(h.cell);
      if (sid !== undefined) hitStructures.set(sid, Math.max(hitStructures.get(sid) ?? 0, h.stage));
    }
    // Chunks fly from what broke near the middle; the rest of a big blast's work is done by dust. A few shake.
    let shaken = 0;
    for (const [sid, stg] of hitStructures) {
      if (stg >= 2) st.toFly.add(sid);
      else if (!e.nuke && shaken++ < 30) st.toShake.push({ id: sid, amp: 0.05 });
    }
  } else if (e.type === 'knock') {
    st.toFly.add(e.structure);
    st.toShake.push({ id: e.structure, amp: 0.06 });
    const x = keyX(e.cell) + 0.5, y = keyY(e.cell) * CELL_H, z = keyZ(e.cell) + 0.5;
    addDust(st, stage, x, y, z, 7, 0.6, hash(e.cell, st.time * 1000));
  }
}

interface Dust {
  ink: InstanceHandle;
  mist: InstanceHandle;
  look: number;
  x0: number;
  y0: number;
  z0: number;
  dx: number;
  dz: number;
  far: number;
  rise: number;
  size: number;
  age: number;
  life: number;
  misted: boolean;
}

/** A blast's dust: puffs that burst out together into one cloud, hang, drift off with the wind and thin away. */
function addDust(st: State, stage: LifeStage, x: number, y: number, z: number, n: number, far: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const look = i % 3;
    const a = (i / n) * Math.PI * 2 + rand(seed, 'dust', i) * 0.5;
    st.dust.push({
      ink: pool(st, stage, `dust${look}`, () => dustMesh(look)).take(),
      mist: pool(st, stage, `mist${look}`, () => smokeMesh(true, look)).take(),
      look,
      x0: x,
      y0: y,
      z0: z,
      dx: Math.cos(a),
      dz: Math.sin(a),
      far: far * (0.45 + rand(seed, 'far', i) * 0.75),
      rise: far > 3 ? 0.1 + rand(seed, 'rise', i) * 0.25 : 0.25 + rand(seed, 'rise', i) * (0.4 + far * 0.3),
      size: (0.5 + rand(seed, 'size', i) * 0.4) * Math.min(1.15, 0.6 + far * 0.35),
      age: -rand(seed, 'delay', i) * 0.12,
      life: 3.2 + rand(seed, 'life', i) * 1.8,
      misted: false,
    });
  }
}

function setPlace(m: Mat4, x: number, y: number, z: number, s: number): void {
  m.fill(0);
  m[0] = s;
  m[5] = s;
  m[10] = s;
  m[12] = x;
  m[13] = y;
  m[14] = z;
  m[15] = 1;
}

/**
 * A flame's matrix: rooted at the spot, turned to face the reader (yaw of the camera), leaning downwind and,
 * out of a window, out from the wall; stretched by how fiercely it burns.
 */
function flameMatrix(sp: Spot, sx: number, sy: number, leanX: number, leanZ: number, yaw: number): Mat4 {
  const out = sp.window ? 0.35 : 0;
  const shear: Mat4 = [1, 0, 0, 0, leanX + sp.nx * out, 1, leanZ + sp.nz * out, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  // A window's flame sits a hair out from the wall so the wall never cuts its base.
  const px = sp.x + sp.nx * 0.04, pz = sp.z + sp.nz * 0.04;
  return compose(translation(px, sp.y, pz), shear, rotationY(yaw), scaling(sx, sy, sx));
}

/** The structure's top surface, sampled from its own current drawing (cached by its hash). */
export function samplerOf(st: State, shape: ShapePlan, sid: StructureId | undefined): ((x: number, z: number, minY: number) => number | null) | null {
  if (sid === undefined) return null;
  const s = shape.structures.get(sid);
  if (!s) return null;
  const had = st.samplers.get(sid);
  // Drawing the building again to find its top is dear: at most every second and a half per building.
  if (had && (had.hash === s.hash || st.time - had.at < 1.5)) return had.sample;
  // Never draw it here: read the town's own drawing (the renderer's, kept by withDamage).
  const seen = (allGenerators() as Partial<ReturnType<typeof withDamage>>).peek?.(sid) ?? null;
  // A sampler already held stays until the town has drawn the current hash.
  if (had && seen?.hash !== s.hash) return had.sample;
  // Nothing drawn yet: build it, but one roof a frame; the others have no top until their turn (flames take no roof, then move).
  if (!seen && st.built++ > 0) return null;
  const out = seen?.out ?? allGenerators().build(s, shape, allParts());
  const sample = roofSampler(polysOf(out.mesh), 0.22);
  st.samplers.set(sid, { hash: seen?.hash ?? s.hash, sample, at: st.time });
  return sample;
}

export default defineSystem<State>({
  id: 'mischief',
  order: 10,
  create(ctx) {
    const d = mischiefOf(ctx.stage);
    const st: State = {
      d,
      own: ownStage(ctx.stage),
      shape: null,
      flames: new Map(),
      puffs: [],
      sparks: [],
      embers: new Map(),
      bombs: new Map(),
      flights: new Map(),
      toFly: new Set(),
      shakes: [],
      toShake: [],
      spouts: [],
      pools: new Map(),
      smokeAcc: new Map(),
      sails: new Map(),
      dust: [],
      samplers: new Map(),
      scareIn: 0,
      lights: new Map(),
      sparkAcc: 0,
      built: 0,
      time: 0,
      off: () => {},
    };
    st.off = d.on((e) => onEvent(st, ctx.stage, ctx.signals, e));
    return st;
  },
  sync(st, next, _prev, ctx) {
    st.shape = next.shape;
    st.d.sync(next.shape);
    // Chunks fly once the town shows the building broken (and without its heap); they land as the heap.
    for (const id of st.toFly) {
      if (settlingOf(next.shape, id)) {
        startFlight(st, ctx.stage, id);
        st.toFly.delete(id);
      }
    }
    for (const id of [...st.flights.keys()]) if (!settlingOf(next.shape, id)) endFlight(st, id);
    // Neighbours shaken by a blast wobble once they are redrawn.
    for (const s of st.toShake) {
      if (!next.shape.structures.has(s.id)) continue;
      st.shakes.push({ id: s.id, h: st.own.stage.liftStructure(s.id), age: 0, amp: s.amp });
    }
    st.toShake = [];
    // A wrecked windmill's sails lie beside it; they fall there when the mill is wrecked before our eyes.
    for (const [id, sl] of st.sails) {
      const s = next.shape.structures.get(id);
      if (s && s.kind === 'windmill' && s.cells.some((c) => ruinUninhabitable(next.shape.world.blocks.get(c)?.ruin))) continue;
      sl.h.release();
      st.sails.delete(id);
    }
    for (const s of next.shape.structures.values()) {
      if (s.kind !== 'windmill' || st.sails.has(s.id)) continue;
      const ruins = s.cells.map((c) => next.shape.world.blocks.get(c)?.ruin);
      if (!ruins.some((r) => ruinUninhabitable(r))) continue;
      const burnt = ruins.some((r) => ruinCause(r) === 'fire' && ruinStage(r) >= 2);
      const top = Math.max(...s.cells.map((c) => keyY(c))) + 1;
      const low = Math.min(...s.cells.map((c) => keyY(c)));
      const c0 = s.cells[0]!;
      const a = Math.floor(rand(s.seed, 'sails-fall') * 4);
      const [dx, dz] = DIR4[a as 0]!;
      const yaw = Math.atan2(dx, dz);
      // Seen falling only if the mill was whole a moment ago.
      const was = _prev?.shape.structures.get(s.id);
      const fall = !!was && !was.cells.some((c) => ruinUninhabitable(_prev!.shape.world.blocks.get(c)?.ruin));
      const h = st.own.stage.spawnMesh(fallenSailsMesh(burnt), HIDDEN);
      st.sails.set(s.id, {
        h,
        burnt,
        age: fall ? 0 : 99,
        fall,
        x0: keyX(c0) + 0.5 + dx * 0.45,
        y0: top * CELL_H - 0.25,
        z0: keyZ(c0) + 0.5 + dz * 0.45,
        x1: keyX(c0) + 0.5 + dx * 1.05,
        y1: low * CELL_H + 0.05 + rand(s.seed, 'sails-lift') * 0.02,
        z1: keyZ(c0) + 0.5 + dz * 1.05,
        yaw,
      });
    }

    // A block that is gone (erased, undone) takes its embers with it.
    for (const [cell, e] of st.embers) {
      const r = next.shape.world.blocks.get(cell)?.ruin;
      if (ruinStage(r) !== 3 || ruinCause(r) !== 'fire') {
        st.pools.get('ember')?.give(e.h);
        st.embers.delete(cell);
      }
    }
  },
  update(st, dt, signals, ctx) {
    const stage = ctx.stage;
    st.time += dt;
    st.built = 0;
    const rain = (signals as unknown as { rain?: () => number }).rain?.() ?? 0;
    st.d.update(dt, { wind: (x, z) => signals.wind(x, z), rain });
    const shape = st.shape;
    if (!shape) return;
    const flamePools = [0, 1, 2].map((look) => pool(st, stage, `flame${look}`, () => flameMesh(look)));

    // ── flames ──────────────────────────────────────────────────────────
    const burning = st.d.engine.burning();
    const live = new Set<CellKey>();
    const fierce = new Map<StructureId, { i: number; x: number; y: number; z: number }>();
    const glowPool = pool(st, stage, 'window-glow', windowGlowMesh);
    const yaw = (st.d.camera.yaw * Math.PI) / 180;
    const release = (f: Flame): void => {
      f.handles.forEach((h, i) => flamePools[f.looks[i]!]!.give(h));
      for (const g of f.glows) if (g) glowPool.give(g);
      f.handles = [];
      f.glows = [];
    };
    for (const b of burning) {
      live.add(b.cell);
      const sid = b.structure;
      const sHash = sid === undefined ? 0 : (shape.structures.get(sid)?.hash ?? 0);
      let f = st.flames.get(b.cell);
      // The building's top as last sampled (refreshed now and then while it changes under the fire).
      const sample = samplerOf(st, shape, sid);
      const topHash = sid === undefined ? sHash : (st.samplers.get(sid)?.hash ?? -1);
      if (!f || f.shapeHash !== topHash) {
        // New, or its building changed under it (the roof fell in): find where the flames stand now.
        if (f) release(f);
        const spots = spotsOf(shape, b.cell, sample);
        const seed = hash(shape.world.seed, 'flame', b.cell);
        const looks = spots.map((_, i) => Math.floor(rand(seed, 'look', i) * 3));
        f = { cell: b.cell, spots, handles: [], looks, glows: [], phase: f?.phase ?? rand(seed, 'phase'), intensity: f?.intensity ?? 0, frame: -1, shapeHash: topHash };
        for (let i = 0; i < spots.length; i++) {
          const h = flamePools[looks[i]!]!.take();
          h.setParams(1);
          f.handles.push(h);
          const sp = spots[i]!;
          if (sp.window) {
            // The window itself glows with the fire inside.
            const g = glowPool.take();
            g.setMatrix(compose(translation(sp.x + sp.nx * 0.012, sp.y + 0.14, sp.z + sp.nz * 0.012), rotationY(Math.atan2(sp.nx, sp.nz)), scaling(0.17, 0.26, 1)));
            g.setParams(1);
            g.setVisible(true);
            f.glows.push(g);
          } else f.glows.push(null);
        }
        st.flames.set(b.cell, f);
      }
      f.intensity = b.intensity;
      if (sid !== undefined) {
        const top = f.spots.find((s) => s.top) ?? f.spots[0];
        const cur = fierce.get(sid);
        if (top && (!cur || top.y > cur.y)) fierce.set(sid, { i: (cur?.i ?? 0) + b.intensity, x: top.x, y: top.y, z: top.z });
        else if (cur) cur.i += b.intensity;
      }
    }
    for (const [cell, f] of st.flames) {
      if (live.has(cell)) continue;
      release(f);
      st.flames.delete(cell);
      // A burnt-out block keeps glowing embers in its ash for a while.
      const r = shape.world.blocks.get(cell)?.ruin;
      const kind = shape.kinds.get(cell);
      if (ruinStage(r) >= 2 && ruinCause(r) === 'fire' && (kind === 'house' || kind === 'windmill' || kind === 'stall') && !st.embers.has(cell)) {
        const h = pool(st, stage, 'ember', emberMesh).take();
        const y = keyY(cell) * CELL_H + 0.05;
        h.setMatrix(compose(translation(keyX(cell) + 0.5, y, keyZ(cell) + 0.5), rotationY(rand(cell, 'ember') * 6)));
        h.setParams(1);
        h.setVisible(true);
        st.embers.set(cell, { h, age: 0, life: 35 + rand(cell, 'ember-life') * 20 });
      }
    }
    // Birds keep clear of a fire: every so often, a fright round each burning building.
    st.scareIn -= dt;
    if (st.scareIn <= 0 && fierce.size > 0) {
      st.scareIn = 0.4;
      for (const src of fierce.values()) {
        scaresOf(stage).add(key(Math.floor(src.x), Math.max(0, Math.floor(src.y / CELL_H)), Math.floor(src.z)), 6, false, signals.time.seconds);
      }
    }
    for (const f of st.flames.values()) {
      const frame = Math.floor(st.time * FPS + f.phase * 2);
      if (frame === f.frame) continue;
      f.frame = frame;
      f.spots.forEach((sp, i) => {
        const w = signals.wind(sp.x, sp.z);
        const j = rand(f.cell, 'jit', frame, i);
        const k = rand(f.cell, 'jit2', frame, i);
        const h = f.handles[i]!;
        // A fire inside shows first in the windows; it licks out of them once it has hold.
        const fierceness = Math.min(1, f.intensity * 1.15);
        if (sp.window && fierceness < 0.35) {
          h.setVisible(false);
          return;
        }
        const grow = sp.window ? (fierceness - 0.35) / 0.65 : 0.25 + 0.75 * fierceness;
        const sy = sp.size * (0.3 + 0.7 * grow) * (0.85 + 0.3 * j);
        const sx = sp.size * (0.7 + 0.3 * grow) * (0.92 + 0.16 * k);
        // Sway: a lean with the wind that swings a little drawing to drawing.
        const lean = (0.35 * w.strength + 0.1) * (0.7 + 0.6 * j);
        const m = flameMatrix(sp, sx, sy, w.dirX * lean + (k - 0.5) * 0.12, w.dirZ * lean + (j - 0.5) * 0.12, yaw);
        // A flame swaps its drawing now and then (a new lick), rather than morphing.
        if (k < 0.2) {
          const look = (f.looks[i]! + 1 + (j < 0.5 ? 1 : 0)) % 3;
          flamePools[f.looks[i]!]!.give(h);
          const nh = flamePools[look]!.take();
          nh.setParams(1);
          f.handles[i] = nh;
          f.looks[i] = look;
        }
        f.handles[i]!.setMatrix(m);
        f.handles[i]!.setVisible(true);
      });
    }

    // ── smoke: a column per burning building, leaning with the wind ─────
    const smokeInk = [0, 1, 2].map((l) => [0, 1, 2].map((sh) => pool(st, stage, `smoke${l}-${sh}`, () => smokeMesh(false, l, sh))));
    const smokeMist = [0, 1, 2].map((l) => pool(st, stage, `mist${l}`, () => smokeMesh(true, l)));
    for (const [sid, src] of fierce) {
      const acc = (st.smokeAcc.get(sid) ?? rand(sid, 'smoke')) + dt * (1.2 + 2.2 * Math.min(2.5, src.i)) * (LIGHT ? 0.5 : 1);
      let n = Math.floor(acc);
      st.smokeAcc.set(sid, acc - n);
      while (n-- > 0 && st.puffs.length < PUFF_CAP) {
        const look = Math.floor(rand(sid, 'look', st.time * 100) * 3);
        const p: Puff = {
          ink: smokeInk[look]![0]!.take(),
          shade: 0,
          mist: smokeMist[look]!.take(),
          look,
          x: src.x + (rand(sid, 'px', st.time * 97) - 0.5) * 0.3,
          y: src.y + 0.5,
          z: src.z + (rand(sid, 'pz', st.time * 89) - 0.5) * 0.3,
          age: 0,
          life: 6 + rand(sid, 'pl', st.time * 83) * 2.5,
          size: 0.4 + 0.25 * Math.min(1, src.i),
          misted: false,
        };
        st.puffs.push(p);
      }
    }
    for (const sid of [...st.smokeAcc.keys()]) if (!fierce.has(sid)) st.smokeAcc.delete(sid);
    // Firelight: stronger as the day goes, so a fire at night lights the walls about it.
    const lightPool = pool(st, stage, 'firelight', firelightMesh);
    const dark = 1 - signals.time.light;
    for (const [sid, src] of fierce) {
      let h = st.lights.get(sid);
      if (!h) st.lights.set(sid, (h = lightPool.take()));
      const r = 1.6 + 0.7 * Math.min(2, src.i);
      h.setMatrix([r, 0, 0, 0, 0, r * 0.8, 0, 0, 0, 0, r, 0, src.x, src.y - 0.2, src.z, 1]);
      h.setParams((0.015 + 0.2 * dark * dark) * Math.min(1, src.i) * (0.9 + 0.1 * Math.sin(st.time * 9 + sid)));
      h.setVisible(true);
    }
    for (const [sid, h] of st.lights) {
      if (fierce.has(sid)) continue;
      lightPool.give(h);
      st.lights.delete(sid);
    }
    let kept = 0;
    for (const p of st.puffs) {
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        smokeInk[p.look]![p.shade]!.give(p.ink);
        smokeMist[p.look]!.give(p.mist);
        continue;
      }
      st.puffs[kept++] = p;
      const w = signals.wind(p.x, p.z);
      p.y += dt * (0.75 - 0.35 * t);
      p.x += dt * w.dirX * (0.25 + 0.9 * w.strength) * Math.min(1, t * 3);
      p.z += dt * w.dirZ * (0.25 + 0.9 * w.strength) * Math.min(1, t * 3);
      const s = p.size * (1 + 2.6 * t);
      // Drawn puffs low down; past a third of the way up, a soft wash that thins to nothing.
      const misted = t > 0.4;
      // Paler as it rises: a new drawing of the puff in the next shade.
      const shade = t < 0.13 ? 0 : t < 0.26 ? 1 : 2;
      let swapped = false;
      if (!misted && shade !== p.shade) {
        smokeInk[p.look]![p.shade]!.give(p.ink);
        p.ink = smokeInk[p.look]![shade]!.take();
        p.shade = shade;
        swapped = true;
      }
      if (misted && !p.misted) {
        p.misted = true;
        p.ink.setVisible(false);
        p.mist.setVisible(true);
      } else if (!misted) p.ink.setVisible(true);
      const h = misted ? p.mist : p.ink;
      // Drawn on twos.
      if (swapped || Math.floor(st.time * FPS) !== Math.floor((st.time - dt) * FPS) || p.age === dt) {
        h.setMatrix([s, 0, 0, 0, 0, s * 0.9, 0, 0, 0, 0, s, 0, p.x, p.y, p.z, 1]);
        if (misted) h.setParams(0.75 * (1 - (t - 0.4) / 0.6) ** 1.3);
      }
    }
    st.puffs.length = kept;

    // ── dust clouds ─────────────────────────────────────────────────────
    let keptDust = 0;
    for (const d of st.dust) {
      d.age += dt;
      const t = d.age / d.life;
      if (t >= 1) {
        pool(st, stage, `dust${d.look}`, () => dustMesh(d.look)).give(d.ink);
        pool(st, stage, `mist${d.look}`, () => smokeMesh(true, d.look)).give(d.mist);
        continue;
      }
      st.dust[keptDust++] = d;
      if (d.age < 0) continue;
      // Out fast, then hanging and drifting off downwind.
      const burst = 1 - (1 - Math.min(1, t * 3)) ** 3;
      const w = signals.wind(d.x0, d.z0);
      const drift = Math.max(0, t - 0.3) * (0.4 + w.strength) * 1.2;
      const x = d.x0 + d.dx * d.far * burst + w.dirX * drift;
      const z = d.z0 + d.dz * d.far * burst + w.dirZ * drift;
      const y = d.y0 + 0.15 + d.rise * burst + t * 0.35;
      const sc = d.size * (0.55 + 0.7 * burst + 0.5 * t);
      const misted = t > 0.55;
      if (misted && !d.misted) {
        d.misted = true;
        d.ink.setVisible(false);
        d.mist.setVisible(true);
      } else if (!misted) d.ink.setVisible(true);
      const h = misted ? d.mist : d.ink;
      h.setMatrix([sc, 0, 0, 0, 0, sc * 0.85, 0, 0, 0, 0, sc, 0, x, y, z, 1]);
      if (misted) h.setParams(0.7 * (1 - (t - 0.55) / 0.45) ** 1.2);
    }
    st.dust.length = keptDust;

    // ── sparks ──────────────────────────────────────────────────────────
    const sparkPool = pool(st, stage, 'spark', sparkMesh);
    for (const f of st.flames.values()) {
      for (const sp of f.spots) {
        if (!sp.top) continue;
        if (rand(f.cell, 'spark', Math.floor(st.time * 30)) > dt * 6 * f.intensity) continue;
        if (st.sparks.length >= SPARK_CAP) break;
        const h = sparkPool.take();
        h.setParams(1);
        const a = rand(f.cell, 'sa', st.time) * Math.PI * 2;
        st.sparks.push({ h, x: sp.x, y: sp.y + 0.4, z: sp.z, vx: Math.cos(a) * 0.25, vy: 0.9 + rand(f.cell, 'sv', st.time) * 0.8, vz: Math.sin(a) * 0.25, age: 0, life: 1 + rand(f.cell, 'sl', st.time) * 1.2 });
      }
    }
    kept = 0;
    for (const s of st.sparks) {
      s.age += dt;
      if (s.age >= s.life) {
        sparkPool.give(s.h);
        continue;
      }
      st.sparks[kept++] = s;
      const w = signals.wind(s.x, s.z);
      s.vx += w.dirX * w.strength * dt * 0.8 + Math.sin(st.time * 7 + s.life * 9) * dt * 0.6;
      s.vz += w.dirZ * w.strength * dt * 0.8;
      s.vy -= dt * 0.25;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const k = 0.045 * (1 - (s.age / s.life) * 0.7);
      s.h.setMatrix([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, s.x, s.y, s.z, 1]);
      s.h.setVisible(true);
    }

    // ── embers dying down ───────────────────────────────────────────────
    for (const [cell, e] of st.embers) {
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        pool(st, stage, 'ember', emberMesh).give(e.h);
        st.embers.delete(cell);
        continue;
      }
      // Glow pulses gently and fades; the specks stay (they are ash).
      e.h.setParams((1 - t) * (0.75 + 0.25 * Math.sin(st.time * 3 + cell)));
    }

    // ── bombs: falling, landing, fizzing ────────────────────────────────
    for (const [id, draw] of st.bombs) {
      if (st.d.bombs.some((b) => b.id === id)) continue;
      // Taken back (undo) before it went off.
      draw.h.release();
      st.bombs.delete(id);
    }
    for (const b of st.d.bombs) {
      const draw = st.bombs.get(b.id);
      if (!draw) continue;
      const [x, y, z] = b.point;
      let m: Mat4;
      if (b.age < b.fall) {
        const t = b.age / b.fall;
        m = compose(translation(x, y + 6 * (1 - t * t), z), rotationY(t * 3));
      } else {
        const t = b.age - b.fall;
        // A bounce and a squash on landing, then a nervous wobble that grows as the fuse burns down.
        const bounce = Math.max(0, Math.sin(Math.min(1, t / 0.35) * Math.PI)) * 0.12 * Math.max(0, 1 - t / 0.35);
        const squash = t < 0.12 ? 1 - 0.25 * Math.sin((t / 0.12) * Math.PI) : 1;
        const wob = Math.sin(t * 30) * 0.04 * Math.min(1, t / 1.5);
        m = compose(translation(x, y + bounce, z), rotationY(3), [1, 0, 0, 0, wob, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], scaling(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash)));
        draw.sparkIn -= dt;
        if (draw.sparkIn <= 0 && st.sparks.length < SPARK_CAP + 20) {
          draw.sparkIn = 0.04;
          const tip = multiply(m, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, FUSE_TIP[0], FUSE_TIP[1] * (1 - 0.6 * Math.min(1, t / 1.8)), FUSE_TIP[2], 1]);
          const h = sparkPool.take();
          h.setParams(1);
          const a = rand(b.id, 'fs', st.time) * Math.PI * 2;
          st.sparks.push({ h, x: tip[12]!, y: tip[13]!, z: tip[14]!, vx: Math.cos(a) * 0.6, vy: 0.5 + rand(b.id, 'fv', st.time), vz: Math.sin(a) * 0.6, age: 0, life: 0.35 });
        }
      }
      draw.h.setMatrix(m);
      draw.h.setVisible(true);
    }

    // ── spouts ──────────────────────────────────────────────────────────
    kept = 0;
    for (const s of st.spouts) {
      s.age += dt;
      if (s.age > 1.6) {
        s.h.release();
        continue;
      }
      st.spouts[kept++] = s;
      const t = s.age / 1.6;
      const hgt = 2.2 * Math.sin(Math.min(1, t * 1.4) * Math.PI);
      s.h.setMatrix(compose(translation(s.x, SEA_Y - 0.05, s.z), scaling(0.6 + t * 0.6, Math.max(0.01, hgt), 0.6 + t * 0.6)));
      s.h.setVisible(true);
    }
    st.spouts.length = kept;

    // ── windmill sails coming down ──────────────────────────────────────
    for (const sl of st.sails.values()) {
      sl.age += dt;
      const t = Math.min(1, sl.age / 1.4);
      const e = t * t;
      const bounce = sl.age > 1.4 && sl.age < 1.7 ? Math.sin(((sl.age - 1.4) / 0.3) * Math.PI) * 0.05 : 0;
      const m = compose(
        translation(sl.x0 + (sl.x1 - sl.x0) * e, sl.y0 + (sl.y1 - sl.y0) * e + bounce, sl.z0 + (sl.z1 - sl.z0) * e),
        rotationY(sl.yaw),
        rotationX((-Math.PI / 2) * e),
        rotationZ(t * 2.2),
      );
      sl.h.setMatrix(m);
      sl.h.setVisible(true);
    }

    // ── chunks in the air ───────────────────────────────────────────────
    for (const f of st.flights.values()) {
      f.age += dt;
      f.chunks.forEach((ch, i) => {
        const arc = f.arcs[i]!;
        const t = Math.max(0, Math.min(1, (f.age - arc.delay) / arc.dur));
        // After landing: one heavy bounce, a quarter of a second.
        const after = f.age - arc.delay - arc.dur;
        const bounce = after > 0 && after < 0.28 ? Math.sin((after / 0.28) * Math.PI) * 0.06 : 0;
        if (t >= 1 && !f.landed[i]) {
          f.landed[i] = true;
          // Bigger pieces raise a bigger puff; a few of them, not every one, so the cloud stays one cloud.
          if (ch.topple?.drop) {
            // Over into the water: a splash where it comes down (half way along it, past its foot).
            const m = chunkMatrix(ch, ch.tip, 0, ch.to);
            const [cx, cy, cz] = centreOf(ch);
            const x = m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!, z = m[2]! * cx + m[6]! * cy + m[10]! * cz + m[14]!;
            st.spouts.push({ h: st.own.stage.spawnMesh(spoutMesh(), HIDDEN), age: 0, x, z });
          } else if (i % 2 === 0) addDust(st, stage, ch.to[0], ch.to[1] - 0.1, ch.to[2], 1, 0.15, ch.key);
        }
        let m: Mat4;
        if (ch.topple) {
          // Falling over: slow at first, fast at the end, a little bounce.
          const e = t * t;
          m = chunkMatrix(ch, ch.tip * e - Math.sign(ch.tip) * bounce * 0.6, 0, ch.to);
        } else {
          const at: [number, number, number] = [
            ch.from[0] + (ch.to[0] - ch.from[0]) * t,
            ch.from[1] + (ch.to[1] - ch.from[1]) * t + arc.h * 4 * t * (1 - t),
            ch.from[2] + (ch.to[2] - ch.from[2]) * t,
          ];
          const ease = 1 - (1 - t) ** 2;
          m = chunkMatrix(ch, ch.tip * ease + arc.spin * ease, ch.yaw * ease, at);
          // The rest pose's tip and yaw are reached exactly at t = 1 (spin is whole turns).
          if (t >= 1) m = chunkMatrix(ch, ch.tip, ch.yaw, [ch.to[0], ch.to[1] + bounce, ch.to[2]]);
        }
        f.handles[i]!.setMatrix(m);
        f.handles[i]!.setVisible(true);
      });
    }

    // ── shaken neighbours ───────────────────────────────────────────────
    kept = 0;
    for (const s of st.shakes) {
      s.age += dt;
      if (!s.h || s.age > 0.7) {
        s.h?.release();
        continue;
      }
      st.shakes[kept++] = s;
      const k = s.amp * (1 - s.age / 0.7) * Math.sin(s.age * 45);
      s.h.setMatrix(multiply(translation(k, 0, k * 0.6), s.h.base));
    }
    st.shakes.length = kept;
  },
  dispose(st) {
    st.off();
    st.d.detach();
    for (const f of st.flames.values()) for (const h of f.handles) h.release();
    for (const p of st.puffs) {
      p.ink.release();
      p.mist.release();
    }
    for (const sp of st.sparks) sp.h.release();
    for (const d of st.dust) {
      d.ink.release();
      d.mist.release();
    }
    for (const e of st.embers.values()) e.h.release();
    for (const sl of st.sails.values()) sl.h.release();
    for (const h of st.lights.values()) h.release();
    for (const f of st.flights.values()) for (const h of f.handles) h.release();
    for (const b of st.bombs.values()) b.h.release();
    for (const s of st.spouts) s.h.release();
    for (const s of st.shakes) s.h?.release();
    for (const p of st.pools.values()) p.dispose();
    // And whatever is still out (a window glow, a scorch, a puff in some list): none of it outlives the town.
    st.own.releaseAll();
  },
});
