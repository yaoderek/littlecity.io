// The town's work (L51 and up): the chains that send residents on errands,
// and the things they carry and set down.
//
// A CHAIN is one kind of visible work (bread, water, the catch…). It reads
// the `errand` sockets its rule put in the plan, picks its hands from the
// crowd, and offers PLANS: a list of steps (walk there carrying this, then
// stand or go in), each with what happens on arrival. The board keeps one
// plan per person at most, answers the crowd's ErrandHost, and owns the
// STORES: places where things lie once set down (sacks by the bakery door,
// loaves on a stall's counter), each a few spots with a thing or nothing.
//
// What is never allowed (checked by the tests): a thing that is neither in
// somebody's hands nor lying in a store; a store whose place is gone still
// showing things (they go with a puff of the store, never float); a plan
// that waits forever (every step has a way to fail, and a failed plan's
// load goes home with its carrier).
//
// Pure of the clock: time comes from `step`, chance from rand(seed, …).

import { DIR4, keyX, keyY, keyZ, CELL_H, type CellKey, type Dir4 } from '@/core/grid';
import type { InstanceHandle, LifeStage, TimeSignal } from '@/life/api';
import { usableDoors } from '@/resolve/nav';
import type { DressingPlan, NavGraph, ShapePlan, Socket, StructureId } from '@/resolve/plan';
import { place } from '../motion/pose';
import { fxOf } from '../fx/fx';
import { CLEAR, SUMMER, type SeasonSignal, type WeatherSignal } from '../season';
import type { Crowd, Person } from '../people/crowd';
import type { ErrandHost, ErrandStep, Load } from '../people/errand';
import type { PoseName } from '@/parts/people/pose';
import type { MeshData } from '@/gen/mesh';
import { stepTalks } from './talk';

/** Heading that faces each way (0 faces +z). N E S W. */
export const DIR_HEADING = [Math.PI, Math.PI / 2, 0, -Math.PI / 2] as const;

/** One errand socket of the plan, read: `<chain>|<role>|<ref>`. */
export interface Post {
  id: string;
  chain: string;
  role: string;
  ref: string;
  cell: CellKey;
  dir?: Dir4;
  structure?: StructureId;
}

export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** A place where things lie. */
export interface Store {
  readonly key: string;
  spots: Spot[];
  items: (Load | null)[];
  handles: (InstanceHandle | null)[];
  /** False once its place is gone (its things were taken away with a puff). */
  live: boolean;
}

/** One step of a plan and what happens when it is reached. */
export interface PlanStep extends ErrandStep {
  /** On arrival. Return false if it could not be done (the plan then ends: see `fail`). */
  done?(p: Person): boolean | void;
}

export interface Plan {
  chain: Chain;
  steps: PlanStep[];
  at: number;
  /** The plan ended early: its step failed or its place went. Default: nothing more (the load goes home). */
  fail?(p: Person): void;
}

export interface Chain {
  readonly id: string;
  /** The town changed: read your posts again. */
  sync(board: Board): void;
  /** A plan for this person now, or null. Only asked of people with no plan. */
  offer(p: Person, time: TimeSignal, board: Board): Plan | null;
  /** Every frame. */
  step?(dt: number, time: TimeSignal, board: Board): void;
  /** Its own hands may be offered more work while holding this (a farmhand's scythe); anything else goes home first. */
  keeps?(load: Load): boolean;
  dispose?(board: Board): void;
}

/** What the board draws through: the stage, or nothing in tests. */
export type GoodsStage = LifeStage | null;

export interface Board {
  readonly host: ErrandHost;
  readonly seed: number;
  readonly crowd: Crowd;
  readonly shape: ShapePlan | null;
  readonly dressing: DressingPlan | null;
  readonly nav: NavGraph | null;
  readonly chains: readonly Chain[];
  /** Where to draw (null in tests). */
  readonly stage: GoodsStage;
  readonly plans: ReadonlyMap<Person, Plan>;
  /** Life time, seconds. */
  readonly now: number;
  /** The season and the weather now (summer and a clear sky where nobody says: tests). */
  readonly season: SeasonSignal;
  readonly weather: WeatherSignal;
  /** The people system tells the board the season and weather each frame. */
  setSky(season: SeasonSignal, weather: WeatherSignal): void;
  posts(chain: string): readonly Post[];
  /** A store at a place (made the first time, kept across changes of the town by its key). */
  store(key: string, spots: Spot[]): Store;
  readonly stores: ReadonlyMap<string, Store>;
  /** How many of each kind have been laid in any store since the board was made (successful puts only). */
  readonly delivered: ReadonlyMap<Load, number>;
  /** Lays a thing in a store's first free spot; false if full. */
  /** Lays one in the store; `delivery` also counts it in `delivered` (a real delivery, not raid loot or stocking). */
  put(store: Store, kind: Load, delivery?: boolean): boolean;
  /** Takes the thing from a store's last filled spot (of this kind, if given); null if none. */
  take(store: Store, kind?: Load): Load | null;
  count(store: Store, kind?: Load): number;
  /** People on the board's plans, and people a chain holds as its hands. */
  busy(p: Person): boolean;
  claim(p: Person, chain: Chain): void;
  /** Ends a person's plan now (as a failure: its `fail` runs). */
  drop(p: Person): void;
  /** Gives somebody a plan now, in place of whatever they were doing (they set off as soon as they can). */
  assign(p: Person, plan: Plan): void;
  unclaim(p: Person): void;
  claimedBy(p: Person): Chain | null;
  /** A step at a cell: standing at `spot` facing `face`, or going in at a door. */
  stepAt(cell: CellKey, opts: Partial<Omit<PlanStep, 'cell'>> & { tag: string }): PlanStep;
  /** A step in at a structure's door (the one whose doorstep is `cell`, else its first usable one). Null if none. */
  stepIn(structure: StructureId, opts: Partial<Omit<PlanStep, 'cell' | 'door'>> & { tag: string; cell?: CellKey }): PlanStep | null;
  /** The middle of a cell's floor, in the world. */
  centre(cell: CellKey): { x: number; y: number; z: number };
  /** A person's home door step (going home), or null. */
  homeStep(p: Person, opts: Partial<PlanStep> & { tag: string }): PlanStep | null;
  /** Grid steps between two cells on the ground plan. */
  dist(a: CellKey, b: CellKey): number;
  /** What walking from one cell to another costs (about the steps, more for stairs and grass); Infinity if it cannot be walked. */
  walk(a: CellKey, b: CellKey): number;
  /** The town changed. With no dressing yet (just after an edit) only the shape is taken. */
  sync(shape: ShapePlan, dressing: DressingPlan | null): void;
  step(dt: number, time: TimeSignal): void;
  dispose(): void;
}

export interface BoardOptions {
  crowd: Crowd;
  seed: number;
  chains: Chain[];
  stage: GoodsStage;
  /** Meshes for things set down (world units, standing at the origin). */
  restingMesh?(kind: Load): MeshData;
}

export function createBoard(opts: BoardOptions): Board {
  const plans = new Map<Person, Plan>();
  const claimed = new Map<Person, Chain>();
  const stores = new Map<string, Store>();
  const delivered = new Map<Load, number>();
  let posts = new Map<string, Post[]>();
  let shape: ShapePlan | null = null;
  let dressing: DressingPlan | null = null;
  let now = 0;
  let time: TimeSignal | null = null;
  let season: SeasonSignal = SUMMER;
  let weather: WeatherSignal = CLEAR;

  const draw = (s: Store, i: number): void => {
    const kind = s.items[i];
    s.handles[i]?.release();
    s.handles[i] = null;
    if (!kind || !opts.stage || !opts.restingMesh) return;
    const sp = s.spots[i]!;
    s.handles[i] = opts.stage.spawnMesh(opts.restingMesh(kind), place(sp.x, sp.y, sp.z, sp.yaw));
  };

  const end = (p: Person, failed: boolean): void => {
    const plan = plans.get(p);
    if (!plan) return;
    plans.delete(p);
    if (failed) plan.fail?.(p);
  };

  const host: ErrandHost = {
    next(p, t) {
      time = t;
      const plan = plans.get(p);
      if (plan) {
        const s = plan.steps[plan.at];
        if (s) return s;
        plans.delete(p);
      }
      // (Children too: the school and the maypole are theirs; each chain says who it wants.)
      if (p.shutIn || p.leaving || p.scuffle) return null;
      // Something still in the hands from an errand that ended: home with it first (a chain's own hands go on with it).
      if (p.load && !claimed.get(p)?.keeps?.(p.load)) return null;
      for (const chain of opts.chains) {
        const c = claimed.get(p);
        if (c && c !== chain) continue;
        const offer = chain.offer(p, t, board);
        if (offer && offer.steps.length > 0) {
          plans.set(p, offer);
          return offer.steps[0]!;
        }
      }
      return null;
    },
    arrived(p, step) {
      const plan = plans.get(p);
      if (!plan || plan.steps[plan.at] !== step) return;
      const ok = (step as PlanStep).done?.(p);
      if (ok === false) {
        end(p, true);
        return;
      }
      plan.at++;
      if (plan.at >= plan.steps.length) plans.delete(p);
    },
    failed(p, step) {
      const plan = plans.get(p);
      if (!plan || plan.steps[plan.at] !== step) return;
      end(p, true);
    },
  };

  const board: Board = {
    host,
    seed: opts.seed,
    crowd: opts.crowd,
    get shape() {
      return shape;
    },
    get dressing() {
      return dressing;
    },
    get nav() {
      return dressing?.nav ?? null;
    },
    chains: opts.chains,
    stage: opts.stage,
    plans,
    get now() {
      return now;
    },
    get season() {
      return season;
    },
    get weather() {
      return weather;
    },
    setSky(s, w) {
      season = s;
      weather = w;
    },
    posts: (chain) => posts.get(chain) ?? [],
    stores,
    delivered,
    store(key, spots) {
      let s = stores.get(key);
      if (!s) {
        s = { key, spots, items: spots.map(() => null), handles: spots.map(() => null), live: true };
        stores.set(key, s);
        return s;
      }
      s.live = true;
      // The same place: keep what lies there (in as many spots as there now are; any extra is cleared away).
      const moved = spots.some((sp, i) => !s!.spots[i] || Math.abs(sp.x - s!.spots[i]!.x) > 1e-6 || Math.abs(sp.y - s!.spots[i]!.y) > 1e-6 || Math.abs(sp.z - s!.spots[i]!.z) > 1e-6);
      if (moved || spots.length !== s.spots.length) {
        const items = s.items.filter((x): x is Load => x !== null);
        for (const h of s.handles) h?.release();
        s.spots = spots;
        s.items = spots.map((_, i) => items[i] ?? null);
        s.handles = spots.map(() => null);
        s.items.forEach((_, i) => draw(s!, i));
      }
      return s;
    },
    put(s, kind, delivery = false) {
      const i = s.items.findIndex((x) => x === null);
      if (i < 0 || !s.live) return false;
      s.items[i] = kind;
      if (delivery) delivered.set(kind, (delivered.get(kind) ?? 0) + 1);
      draw(s, i);
      // A small puff where it lands: the eye goes to it.
      if (opts.stage) {
        const sp = s.spots[i]!;
        fxOf(opts.stage).play({ actor: 'puff', variant: 'dust' }, 0.45, (t, m) => place(sp.x, sp.y + 0.04 + t * 0.12, sp.z, 0, 0.35 + t * 0.5, 0.35 + t * 0.5, 0.35 + t * 0.5, m));
      }
      return true;
    },
    take(s, kind) {
      for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i];
        if (!it || (kind && it !== kind)) continue;
        s.items[i] = null;
        draw(s, i);
        return it;
      }
      return null;
    },
    count: (s, kind) => s.items.filter((x) => x !== null && (!kind || x === kind)).length,
    busy: (p) => plans.has(p) || claimed.has(p),
    claim(p, chain) {
      claimed.set(p, chain);
    },
    drop(p) {
      end(p, true);
    },
    assign(p, plan) {
      // A raider (src/life/raid) is sent only by the raid: the town's chains never take one (a fire's
      // clear-out, a bomb's drill).
      if (p.raider && plan.chain.id !== 'raid') return;
      end(p, true);
      plans.set(p, plan);
      opts.crowd.rethink(p);
    },
    unclaim(p) {
      claimed.delete(p);
    },
    claimedBy: (p) => claimed.get(p) ?? null,
    centre(cell) {
      return { x: keyX(cell) + 0.5, y: keyY(cell) * CELL_H, z: keyZ(cell) + 0.5 };
    },
    stepAt(cell, o) {
      return { cell, spot: o.spot ?? null, face: o.face ?? NaN, door: o.door ?? null, pose: o.pose ?? 'stand', linger: o.linger ?? 1, load: o.load ?? null, tag: o.tag, ...(o.brisk ? { brisk: true } : {}), ...(o.done ? { done: o.done } : {}) };
    },
    stepIn(structure, o) {
      const nav = board.nav;
      if (!nav) return null;
      const doors = usableDoors(nav, structure);
      const door = (o.cell !== undefined ? doors.find((d) => nav.nodes[d.node]!.cell === o.cell) : undefined) ?? doors[0];
      if (!door) return null;
      return board.stepAt(nav.nodes[door.node]!.cell, { ...o, door: { feature: door.feature, structure } });
    },
    homeStep(p, o) {
      const s = board.stepIn(p.home, { pose: 'stand', linger: 0, ...o });
      return s;
    },
    dist: (a, b) => Math.abs(keyX(a) - keyX(b)) + Math.abs(keyZ(a) - keyZ(b)),
    walk(a, b) {
      const nav = board.nav, router = opts.crowd.router;
      const na = nav?.nodeAt.get(a), nb = nav?.nodeAt.get(b);
      if (!nav || !router || na === undefined || nb === undefined) return Infinity;
      if (na === nb) return 0;
      return router.find(na, nb)?.cost ?? Infinity;
    },
    sync(nextShape, nextDressing) {
      shape = nextShape;
      if (!nextDressing) return;
      dressing = nextDressing;
      posts = new Map();
      for (const s of nextDressing.sockets) {
        // The chains' own posts, and the places other builders mark for activities (disc1-fill:
        // `activity` sockets named dance, fetch-water, vend, browse, hang-washing, basket, pick, ford…),
        // read as posts of the chain 'activity' with the socket's name as the role and its owner prop as ref.
        if (s.type !== 'errand' && s.type !== 'activity') continue;
        const post = s.type === 'activity' ? { id: s.id, chain: 'activity', role: s.name ?? '', ref: s.owner ?? '', cell: s.cell, ...(s.dir !== undefined ? { dir: s.dir } : {}), ...(s.structure !== undefined ? { structure: s.structure } : {}) } : readPost(s);
        if (!post) continue;
        const list = posts.get(post.chain);
        if (list) list.push(post);
        else posts.set(post.chain, [post]);
      }
      // Stores are claimed again by the chains as they sync; those not claimed are gone.
      for (const s of stores.values()) s.live = false;
      for (const chain of opts.chains) chain.sync(board);
      for (const [key, s] of stores) {
        if (s.live) continue;
        for (const h of s.handles) h?.release();
        stores.delete(key);
      }
      // Hands that are gone, and plans whose people are gone.
      for (const p of [...claimed.keys()]) if (p.mode === 'gone' || p.leaving) claimed.delete(p);
      for (const p of [...plans.keys()]) if (p.mode === 'gone' || p.leaving) end(p, true);
    },
    step(dt, t) {
      now += dt;
      time = t;
      for (const p of [...plans.keys()]) if (p.mode === 'gone') end(p, true);
      for (const p of [...claimed.keys()]) if (p.mode === 'gone') claimed.delete(p);
      for (const chain of opts.chains) chain.step?.(dt, t, board);
      // Market talk: coins and goods change hands on time (talk.ts).
      stepTalks(board);
    },
    dispose() {
      for (const chain of opts.chains) chain.dispose?.(board);
      for (const s of stores.values()) for (const h of s.handles) h?.release();
      stores.clear();
      plans.clear();
      claimed.clear();
    },
  };
  void time;
  return board;
}

function readPost(s: Socket): Post | null {
  const [chain, role = '', ref = ''] = (s.name ?? '').split('|');
  if (!chain) return null;
  return { id: s.id, chain, role, ref, cell: s.cell, ...(s.dir !== undefined ? { dir: s.dir } : {}), ...(s.structure !== undefined ? { structure: s.structure } : {}) };
}

/** Spots against a building's wall beside its door: `dir` points out of the door, the wall is behind. */
export function wallSpots(cell: CellKey, dir: Dir4, n: number, y: number): Spot[] {
  const [dx, dz] = DIR4[dir]!;
  const cx = keyX(cell) + 0.5, cz = keyZ(cell) + 0.5;
  const out: Spot[] = [];
  // On the side of the doorway, then the other, close to the wall, stacked outward.
  const sides = [0.3, -0.3];
  for (let i = 0; i < n; i++) {
    const side = sides[i % 2]! + (i >= 2 ? Math.sign(sides[i % 2]!) * 0.1 : 0);
    const out_ = -0.36 + Math.floor(i / 4) * 0.13;
    out.push({ x: cx - dz * side + dx * out_, y, z: cz + dx * side + dz * out_, yaw: DIR_HEADING[dir] + (i % 3) * 0.4 });
  }
  return out;
}

/**
 * A heap beside a door, against the wall, on one side of it: a bottom row of three, two on them, one on
 * top (sacks lying on their sides). `dir` points out of the door; `side` is +1 or −1.
 */
export function heapSpots(cell: CellKey, dir: Dir4, y: number, side = 1, size = 0.2): Spot[] {
  const [dx, dz] = DIR4[dir]!;
  const cx = keyX(cell) + 0.5, cz = keyZ(cell) + 0.5;
  const out: Spot[] = [];
  const rows: [number, number][] = [[3, 0], [2, 1], [1, 2]];
  for (const [n, row] of rows) {
    for (let i = 0; i < n; i++) {
      // Along the wall, from beside the doorway outward; the rows above sit in the hollows of the one below.
      const along = side * (0.2 + (i + row * 0.5) * size * 0.95);
      out.push({ x: cx - dz * along - dx * 0.36, y: y + row * size * 0.8, z: cz + dx * along - dz * 0.36, yaw: DIR_HEADING[dir] + Math.PI / 2 });
    }
  }
  return out;
}

/** The pose for standing at work on a thing (setting down, picking up). */
export const WORK_POSE: PoseName = 'tend';
