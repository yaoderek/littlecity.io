// Feedback (catalogue part F): what the town does in answer to a click.
// Every edit triggers it, so it is the most felt thing in the game.
//
//   F01 landing    the piece drops, squashes, overshoots and settles in
//                  280 ms, and knocks a ring of dust out of the ground
//   F02 wobble     neighbours whose shape changed rock and settle
//   F03 morph      an Auto block that resolves to another kind squashes,
//                  pops and throws sparkles
//   F04 removal    the piece shrinks away in a burst of puffs; props that
//                  lose their slot pop
//   F05 pop-in     newly derived props appear one after another, nearest
//                  the click first, each with a small bounce
//   unlock         the first time the player builds one of the almanac's
//                  buildings by hand (celebrate.ts): it pops up out of its
//                  foot instead of landing, in a burst of stars
//
// How: `sync` reads what changed off the two towns (diff.ts). A structure
// is moved with the stage's lift (it is re-pointed at a slot, no geometry is
// rebuilt) and baked back when its bounce ends. Everything here runs every
// frame, not on twos: it answers the player's hand (MOTION.md).
//
// Props fixed to a bouncing structure move with it (carry.ts).

import { cellFloorCenter, CELL_H, SEA_Y, type CellKey } from '@/core/grid';
import { identity, positionOf, type Mat4 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { registriesFor } from '@/render/registries';
import { EDGE_ID_BASE, type DressingPlan, type ShapePlan, type Structure, type StructureId } from '@/resolve/plan';
import { FEEDBACK } from '@/style/animation';
import { defineSystem, type InstanceHandle, type LifeStage, type SpawnSpec, type SystemContext } from '../api';
import { fxOf } from '../fx/fx';
import { arc, easeIn, easeInOut, easeOut, lerp, pop, settle } from '../motion/ease';
import { mulInto, place, squash } from '../motion/pose';
import { carryTable } from './carry';
import { takeCelebrations, type Celebration } from './celebrate';
import { cellCentre, changedStructures, diffTowns, edgeCentre, footOf, isFloorStructure, type EditDiff } from './diff';

type ActKind = 'land' | 'wobble' | 'morph' | 'vanish' | 'ride' | 'unlock';

interface Act {
  kind: ActKind;
  structure: StructureId;
  handle: InstanceHandle;
  age: number;
  time: number;
  /** The point it squashes and rocks about. */
  px: number;
  py: number;
  pz: number;
  /** 1 for a single cell, less for a big merged mass. */
  amp: number;
  /** Wobble: the way its top leans first (unit vector on the ground). */
  dx: number;
  dz: number;
  /** Ride (shaping the land): the column rose (1) or sank (-1) under it. */
  dy?: number;
  /** Land: the dust has been thrown. */
  dusted: boolean;
  /** Its matrix now (published through carry.ts). */
  m: Mat4;
  /** Props fixed to it. */
  carried: InstanceHandle[];
}

interface Pop {
  id: string;
  handle: InstanceHandle | null;
  age: number;
}

interface State {
  acts: Act[];
  byStructure: Map<StructureId, Act>;
  pops: Pop[];
  /** The dressing last seen, and where each of its props was drawn. */
  dressing: DressingPlan | null;
  /** The town last seen (an unlock moment finds its building in it). */
  shape: ShapePlan | null;
  where: Map<string, [number, number, number]>;
  /** The middle of the last edit, until its dressing has arrived. */
  editAt: [number, number, number] | null;
  /** Counts effects, so each gets its own seeded scatter. */
  n: number;
  scratch: Mat4;
  /** Seconds since the system started, and when the last landing threw its dust (a quick run of edits throws less). */
  clock: number;
  lastDust: number;
}

const RING: SpawnSpec = { actor: 'dust-ring' };
const DUST: SpawnSpec[] = [0, 1, 2, 3].map((look) => ({ actor: 'puff', variant: 'dust', params: { look } }));
const POPS: SpawnSpec[] = [0, 1, 2, 3].map((look) => ({ actor: 'puff', variant: 'pop', params: { look } }));
const SPARKLES: SpawnSpec[] = [0, 1].map((look) => ({ actor: 'sparkle', params: { look } }));
const TAU = Math.PI * 2;
const REST: Mat4 = identity();

// ─────────────────────────────────────────────────────── the curves ──

/**
 * F01. The landing at time t (0..1 of FEEDBACK.landTime): how far above its place the piece is
 * (in cells) and how tall it is drawn (1 = at rest). Falls, touches down at `impact`, squashes,
 * overshoots, settles. Exactly at rest at t = 1.
 */
export function landingAt(t: number): { drop: number; tall: number } {
  const impact = FEEDBACK.landImpact;
  if (t < impact) {
    const f = t / impact;
    // Falling: faster and faster, stretched a touch along the fall.
    return { drop: FEEDBACK.landDrop * (1 - f * f), tall: 1 + 0.05 * f };
  }
  const u = (t - impact) / (1 - impact);
  const a = 0.26, b = 0.62;
  let tall: number;
  if (u < a) tall = lerp(1.05, FEEDBACK.landSquash, easeOut(u / a));
  else if (u < b) tall = lerp(FEEDBACK.landSquash, FEEDBACK.landStretch, easeInOut((u - a) / (b - a)));
  else tall = lerp(FEEDBACK.landStretch, 1, easeInOut((u - b) / (1 - b)));
  return { drop: 0, tall: t >= 1 ? 1 : tall };
}

/** F02. The lean of a rocking neighbour at t (0..1), in radians: out, back past upright, and still. */
export function wobbleAt(t: number): number {
  return ((FEEDBACK.wobbleDegrees * Math.PI) / 180) * settle(t, FEEDBACK.wobbleCycles);
}

/** F03. How tall a morphing piece is drawn at t (0..1): squashed at first, popping up into its new shape. */
export function morphAt(t: number): number {
  return t >= 1 ? 1 : lerp(FEEDBACK.morphSquash, 1, pop(t));
}

/**
 * Shaping the land: how far (in levels) a thing riding a raised column is drawn from its new place at
 * t (0..1). It starts a level down, is carried up past its place and settles.
 */
export function riseAt(t: number): number {
  if (t >= 1) return 0;
  if (t < 0.4) return -1 + 1.16 * easeOut(t / 0.4);
  const u = (t - 0.4) / 0.6;
  return 0.16 * Math.cos(u * Math.PI * 1.5) * (1 - u);
}
/** A thing riding a dug column: it starts a level up and comes down with the ground, landing softly. */
export function sinkAt(t: number): { drop: number; tall: number } {
  if (t >= 1) return { drop: 0, tall: 1 };
  if (t < 0.5) return { drop: 1 - easeInOut(t / 0.5), tall: 1 };
  const u = (t - 0.5) / 0.5;
  return { drop: 0, tall: 1 - 0.06 * Math.sin(u * Math.PI) * (1 - u) };
}

/** Sideways scale that keeps a squashed thing's bulk about the same. */
const bulge = (tall: number): number => 1 + (1 - tall) * 0.55;

/** A merged mass of many cells moves less than a single block. */
const ampOf = (cells: number): number => Math.max(FEEDBACK.landMin, 1 / (1 + FEEDBACK.landHeavy * Math.max(0, cells - 1)));

// ─────────────────────────────────────────────────────────── acts ──

function poseAct(a: Act): void {
  const t = Math.min(1, a.age / a.time);
  if (a.kind === 'land') {
    const { drop, tall } = landingAt(t);
    const h = 1 + (tall - 1) * a.amp;
    const w = bulge(h);
    squash(a.px, a.py, a.pz, w, h, w, drop * CELL_H * Math.max(a.amp, 0.22), 0, 0, a.m);
  } else if (a.kind === 'wobble') {
    const lean = wobbleAt(t) * a.amp;
    squash(a.px, a.py, a.pz, 1, 1, 1, 0, lean * a.dz, -lean * a.dx, a.m);
  } else if (a.kind === 'ride') {
    if ((a.dy ?? 1) > 0) squash(a.px, a.py, a.pz, 1, 1, 1, riseAt(t) * CELL_H, 0, 0, a.m);
    else {
      const { drop, tall } = sinkAt(t);
      const w = bulge(tall);
      squash(a.px, a.py, a.pz, w, tall, w, drop * CELL_H, 0, 0, a.m);
    }
  } else if (a.kind === 'unlock') {
    // Up out of its own foot, past its height and back: from nothing, not from a drop.
    const s = t >= 1 ? 1 : Math.max(0.02, pop(t));
    squash(a.px, a.py, a.pz, s, s, s, 0, 0, 0, a.m);
  } else if (a.kind === 'morph') {
    const h = 1 + (morphAt(t) - 1) * Math.max(a.amp, 0.4);
    const w = bulge(h);
    squash(a.px, a.py, a.pz, w, h, w, 0, 0, 0, a.m);
  } else {
    // Vanish: shrink into its own foot with a last little hop.
    const s = Math.max(0.001, 1 - easeIn(t));
    squash(a.px, a.py, a.pz, s, s, s, arc(t) * 0.07, 0, 0, a.m);
  }
  a.handle.setMatrix(a.m);
}

function finish(state: State, stage: LifeStage, a: Act): void {
  // Back exactly at rest before it is let go: someone else may still hold the lift (dusk/windows).
  if (a.kind !== 'vanish') a.handle.setMatrix(REST);
  a.handle.release();
  if (state.byStructure.get(a.structure) === a) {
    state.byStructure.delete(a.structure);
    carryTable(stage).delete(a.structure);
  }
  for (const h of a.carried) h.setMatrix(h.base);
}

/** Props of the dressing now drawn that are fixed to a structure: anchored to a socket one of its features owns. */
function propsOn(state: State, stage: LifeStage, shape: ShapePlan, id: StructureId): InstanceHandle[] {
  const dressing = state.dressing;
  const features = shape.featuresByStructure.get(id);
  if (!dressing || !features || features.length === 0) return [];
  const owners = new Set<string>();
  for (const f of features) owners.add(f.id);
  const out: InstanceHandle[] = [];
  for (const p of dressing.props) {
    const at = p.at;
    if (!('socket' in at)) continue;
    const cut = at.socket.lastIndexOf('/');
    if (cut <= 0 || !owners.has(at.socket.slice(0, cut))) continue;
    const h = stage.instance(p.id);
    if (h) out.push(h);
  }
  return out;
}

function start(state: State, ctx: SystemContext, shape: ShapePlan, kind: ActKind, s: Structure, pivot: readonly [number, number, number], time: number, lean?: readonly [number, number]): Act | null {
  const old = state.byStructure.get(s.id);
  // A mass already landing that is landed on again (a run of edits, Grow a town) carries on with its bounce
  // rather than jumping back to the top of it every few frames.
  if (old && old.kind === 'land' && kind !== 'vanish' && kind !== 'unlock' && old.age < old.time * 0.7) return old;
  if (old) {
    finish(state, ctx.stage, old);
    state.acts = state.acts.filter((a) => a !== old);
  }
  const handle = ctx.stage.liftStructure(s.id);
  if (!handle) return null;
  const size = s.cells.length + s.edges.length;
  const act: Act = {
    kind,
    structure: s.id,
    handle,
    age: 0,
    time,
    px: pivot[0],
    py: pivot[1],
    pz: pivot[2],
    amp: kind === 'wobble' ? Math.min(1, Math.max(0.35, 1.3 - 0.05 * size)) : ampOf(size),
    dx: lean?.[0] ?? 0,
    dz: lean?.[1] ?? 0,
    dusted: false,
    m: identity(),
    carried: propsOn(state, ctx.stage, shape, s.id),
  };
  state.acts.push(act);
  state.byStructure.set(s.id, act);
  carryTable(ctx.stage).set(s.id, act.m);
  // Posed at once: the piece must never be seen at rest before it drops.
  poseAct(act);
  for (const h of act.carried) h.setMatrix(mulInto(state.scratch, act.m, h.base));
  return act;
}

// ──────────────────────────────────────────────────────── effects ──

/** F01: the ring of dust a landing knocks out. `size` 1 for a block, less for a floor tile. */
function dust(state: State, ctx: SystemContext, x: number, y: number, z: number, size: number): void {
  const fx = fxOf(ctx.stage);
  const k = state.n++;
  // In a quick run of landings (a held-length run, Grow a town) each throws a smaller puff and no ring, so
  // the dust reads as one busy patch of work, not a field of rings.
  const busy = state.clock - state.lastDust < FEEDBACK.dustTime * 0.5;
  state.lastDust = state.clock;
  if (busy) size *= 0.65;
  const turn = rand(ctx.seed, 'dust', k) * TAU;
  const reach = FEEDBACK.dustReach * size;
  if (!busy) {
    fx.play(RING, FEEDBACK.dustTime * 0.62, (t, m) => {
      const r = lerp(0.5 * size, reach * 1.08, easeOut(t));
      place(x, y, z, turn, r, 1, r, m);
    }, { smooth: true });
  }
  const count = Math.round(FEEDBACK.dustPuffs * (size < 1 ? 0.6 : 1) * (busy ? 0.5 : 1));
  for (let i = 0; i < count; i++) {
    const a = turn + ((i + rand(ctx.seed, 'dust', k, i, 'a') * 0.7) / count) * TAU;
    const far = reach * (0.8 + 0.4 * rand(ctx.seed, 'dust', k, i, 'r'));
    const big = FEEDBACK.dustSize * size * (0.75 + 0.6 * rand(ctx.seed, 'dust', k, i, 's'));
    const cos = Math.cos(a), sin = Math.sin(a);
    fx.play(DUST[i % DUST.length]!, FEEDBACK.dustTime * (0.75 + 0.5 * rand(ctx.seed, 'dust', k, i, 't')), (t, m) => {
      const d = lerp(0.46 * size, far, easeOut(t));
      const s = big * (t < 0.2 ? lerp(0.5, 1, t / 0.2) : 1 - easeIn((t - 0.2) / 0.8));
      place(x + cos * d, y + s * 0.3 + arc(t) * 0.07 * size, z + sin * d, a, s, s, s, m);
    }, { smooth: true });
  }
}

/** F04: a burst of white puffs where something went. */
function burst(state: State, ctx: SystemContext, x: number, y: number, z: number, count: number, size: number): void {
  const fx = fxOf(ctx.stage);
  const k = state.n++;
  for (let i = 0; i < count; i++) {
    const a = ((i + rand(ctx.seed, 'burst', k, i, 'a')) / count) * TAU;
    const up = 0.15 + 0.5 * rand(ctx.seed, 'burst', k, i, 'u');
    const far = size * (0.35 + 0.3 * rand(ctx.seed, 'burst', k, i, 'r'));
    const big = size * (0.2 + 0.14 * rand(ctx.seed, 'burst', k, i, 's'));
    const cos = Math.cos(a), sin = Math.sin(a);
    fx.play(POPS[i % POPS.length]!, FEEDBACK.removeTime * (1.2 + 0.8 * rand(ctx.seed, 'burst', k, i, 't')), (t, m) => {
      const d = far * easeOut(t);
      const s = big * (t < 0.25 ? lerp(0.4, 1, easeOut(t / 0.25)) : 1 - easeIn((t - 0.25) / 0.75));
      place(x + cos * d, y + up * size * easeOut(t), z + sin * d, a, s, s, s, m);
    }, { smooth: true });
  }
}

/** F03: sparkles thrown out of a morphing Auto block. */
function sparkle(state: State, ctx: SystemContext, x: number, y: number, z: number): void {
  const fx = fxOf(ctx.stage);
  const k = state.n++;
  const count = Math.round(FEEDBACK.sparkles);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5 * rand(ctx.seed, 'spark', k, i, 'a')) / count) * TAU;
    const up = 0.25 + 0.6 * rand(ctx.seed, 'spark', k, i, 'u');
    const far = FEEDBACK.sparkleReach * (0.7 + 0.5 * rand(ctx.seed, 'spark', k, i, 'r'));
    const big = 0.2 + 0.12 * rand(ctx.seed, 'spark', k, i, 's');
    const spin = (rand(ctx.seed, 'spark', k, i, 'w') - 0.5) * 9;
    const cos = Math.cos(a), sin = Math.sin(a);
    fx.play(SPARKLES[i % SPARKLES.length]!, FEEDBACK.sparkleTime * (0.8 + 0.4 * rand(ctx.seed, 'spark', k, i, 't')), (t, m) => {
      const d = far * easeOut(t);
      const s = big * (t < 0.3 ? pop(t / 0.3) : 1 - easeIn((t - 0.3) / 0.7));
      place(x + cos * d, y + up * easeOut(t), z + sin * d, a + spin * t, s, s, s, m);
    }, { smooth: true, delay: i * 0.012 });
  }
}

/** The unlock moment's stars: a ring of them thrown out and up round the building, spinning, falling back a little. */
function stars(state: State, ctx: SystemContext, x: number, y: number, z: number, size: number, scale: number): void {
  const fx = fxOf(ctx.stage);
  const k = state.n++;
  const count = Math.round(FEEDBACK.unlockStars);
  const reach = FEEDBACK.unlockReach * Math.min(2, Math.max(1, Math.sqrt(size))) * scale;
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.6 * rand(ctx.seed, 'unlock', k, i, 'a')) / count) * TAU;
    // Every third a higher, smaller one, so the burst has depth and not one flat ring.
    const high = i % 3 === 0;
    const up = ((high ? 1.0 : 0.45) + 0.5 * rand(ctx.seed, 'unlock', k, i, 'u')) * scale;
    const far = reach * (high ? 0.55 : 0.85 + 0.35 * rand(ctx.seed, 'unlock', k, i, 'r'));
    const big = FEEDBACK.unlockStarSize * scale * (high ? 0.7 : 0.85 + 0.35 * rand(ctx.seed, 'unlock', k, i, 's'));
    const spin = (rand(ctx.seed, 'unlock', k, i, 'w') - 0.5) * 7;
    const cos = Math.cos(a), sin = Math.sin(a);
    const life = FEEDBACK.unlockStarTime * (0.8 + 0.35 * rand(ctx.seed, 'unlock', k, i, 't'));
    fx.play(SPARKLES[i % SPARKLES.length]!, life, (t, m) => {
      const d = far * easeOut(t);
      // Up fast, then a slow fall back: thrown, not floating.
      const lift = up * (easeOut(Math.min(1, t * 1.6)) - 0.35 * t * t);
      const s = big * (t < 0.18 ? pop(t / 0.18) : t > 0.7 ? 1 - easeIn((t - 0.7) / 0.3) : 1);
      place(x + cos * d, y + 0.15 + lift, z + sin * d, a + spin * t, s, s, s, m);
    }, { smooth: true, delay: 0.04 + (i % 7) * 0.018 });
  }
}

function unlock(state: State, ctx: SystemContext, c: Celebration): void {
  const shape = state.shape;
  const s = c.structure === undefined || !shape ? undefined : shape.structures.get(c.structure);
  if (s && shape) {
    const act = start(state, ctx, shape, 'unlock', s, footOf(s), FEEDBACK.unlockTime);
    if (act) act.dusted = true;
  }
  stars(state, ctx, c.at[0], c.at[1], c.at[2], c.size ?? 1, Math.min(4, Math.max(1, c.scale ?? 1)));
}

// ─────────────────────────────────────────────────── a town changed ──

function shapeChanged(state: State, ctx: SystemContext, prev: ShapePlan, next: ShapePlan): void {
  const d: EditDiff = diffTowns(prev, next);
  state.editAt = null;
  if (d.count === 0 || !d.centre) return;
  if (d.count > FEEDBACK.quietAbove) return; // a different town, not an edit
  state.editAt = d.centre;
  const busy = new Set<StructureId>();
  if (d.ground.size > 0) groundMoved(state, ctx, prev, next, d, busy);

  // F01: what was placed lands.
  const land = (cell: CellKey, time: number): void => {
    const id = next.structureAt.get(cell);
    const s = id === undefined ? undefined : next.structures.get(id);
    if (!s || busy.has(s.id)) return;
    busy.add(s.id);
    start(state, ctx, next, 'land', s, cellFloorCenter(cell), time);
  };
  for (const c of d.placed) land(c, FEEDBACK.landTime);
  // F03: an Auto block that became something else.
  for (const c of d.morphed) {
    const id = next.structureAt.get(c);
    const s = id === undefined ? undefined : next.structures.get(id);
    const p = cellCentre(c);
    sparkle(state, ctx, p[0], p[1], p[2]);
    if (!s || busy.has(s.id)) continue;
    busy.add(s.id);
    start(state, ctx, next, 'morph', s, cellFloorCenter(c), FEEDBACK.morphTime);
  }
  // The Change tool and paint: the piece changed where it stands.
  for (const c of d.altered) {
    const id = next.structureAt.get(c);
    const s = id === undefined ? undefined : next.structures.get(id);
    if (!s || busy.has(s.id)) continue;
    busy.add(s.id);
    start(state, ctx, next, 'morph', s, cellFloorCenter(c), FEEDBACK.morphTime);
  }
  // Floors and edge pieces: a small region drops in like a tile; a big one (a street) only raises dust.
  for (const c of d.floorsLaid) {
    const id = next.floorAt.get(c);
    const s = id === undefined ? undefined : next.structures.get(id);
    const p = cellFloorCenter(c);
    if (s && !busy.has(s.id) && s.cells.length <= 2) {
      busy.add(s.id);
      const act = start(state, ctx, next, 'land', s, p, FEEDBACK.landTime);
      if (act) act.dusted = true;
    }
    dust(state, ctx, p[0], p[1], p[2], 0.62);
  }
  for (const e of d.edgesPlaced) {
    const id = next.edgeAt.get(e);
    const s = id === undefined ? undefined : next.structures.get(id);
    const p = edgeCentre(e);
    if (s && !busy.has(s.id) && s.cells.length + s.edges.length <= 3) {
      busy.add(s.id);
      const act = start(state, ctx, next, 'land', s, p, FEEDBACK.landTime);
      if (act) act.dusted = true;
    }
    dust(state, ctx, p[0], p[1], p[2], 0.5);
  }

  // F04: what was erased puffs away. A small structure that is gone altogether is drawn once more, shrinking.
  const ghosts = new Set<StructureId>();
  for (const c of d.erased.slice(0, 6)) {
    const p = cellCentre(c);
    burst(state, ctx, p[0], p[1], p[2], Math.round(FEEDBACK.removePuffs), 1);
    const id = prev.structureAt.get(c);
    const s = id === undefined ? undefined : prev.structures.get(id);
    if (!s || ghosts.has(s.id) || next.structures.has(s.id) || s.cells.length + s.edges.length > FEEDBACK.removeCells) continue;
    // Only if none of it is left: what survives is already drawn (and rocks, F02).
    if (s.cells.some((cell) => next.world.blocks.has(cell)) || s.edges.some((e) => next.world.edges.has(e))) continue;
    ghosts.add(s.id);
    vanish(state, ctx, prev, s, cellFloorCenter(c));
  }
  for (const c of d.floorsLifted.slice(0, 6)) {
    const p = cellFloorCenter(c);
    burst(state, ctx, p[0], p[1] + 0.05, p[2], 3, 0.55);
  }
  for (const e of d.edgesErased.slice(0, 6)) {
    const p = edgeCentre(e);
    burst(state, ctx, p[0], p[1] + 0.2, p[2], 3, 0.55);
  }

  // F02: everything else whose shape changed rocks, nearest first.
  const [ex, , ez] = d.centre;
  const near: { s: Structure; foot: [number, number, number]; dist: number }[] = [];
  for (const s of changedStructures(prev, next)) {
    if (busy.has(s.id) || isFloorStructure(s.id)) continue;
    const size = s.cells.length + s.edges.length;
    if (size > FEEDBACK.wobbleCells || (s.id >= EDGE_ID_BASE && size > 6)) continue;
    const foot = footOf(s);
    near.push({ s, foot, dist: Math.hypot(foot[0] - ex, foot[2] - ez) });
  }
  near.sort((a, b) => a.dist - b.dist || a.s.id - b.s.id);
  for (const { s, foot, dist } of near.slice(0, FEEDBACK.wobbleMax)) {
    // It leans away from the edit first, as if nudged.
    const away: [number, number] = dist > 1e-3 ? [(foot[0] - ex) / dist, (foot[2] - ez) / dist] : [1, 0];
    start(state, ctx, next, 'wobble', s, foot, FEEDBACK.wobbleTime, away);
  }
}

/**
 * Shaping the land: what rode a raised or dug column is carried with it (up past its place and back, or
 * down to a soft landing); the ground throws a little dust where it rose or sank, and water splashes
 * where land went under or came up out of it.
 */
function groundMoved(state: State, ctx: SystemContext, prev: ShapePlan, next: ShapePlan, d: EditDiff, busy: Set<StructureId>): void {
  for (const c of d.carried) {
    const id = next.structureAt.get(c);
    const s = id === undefined ? undefined : next.structures.get(id);
    if (!s || busy.has(s.id)) continue;
    busy.add(s.id);
    const act = start(state, ctx, next, 'ride', s, footOf(s), FEEDBACK.landTime * 1.25);
    if (act) {
      act.dy = d.ground.get((c & 63) + ((c >> 6) & 63) * 48) ?? 1;
      act.dusted = true;
      poseAct(act);
    }
  }
  // The ground itself: a puff per column, fewer in a big stroke.
  let n = 0;
  const most = d.ground.size > 9 ? 0.45 : 1;
  for (const [i, dy] of d.ground) {
    if (n++ > 24) break;
    if (most < 1 && rand(ctx.seed, 'ground', state.n, i) > most) continue;
    const x = (i % 48) + 0.5, z = Math.floor(i / 48) + 0.5;
    const was = prev.terrain.height[i]!, now = next.terrain.height[i]!;
    if (now === 0 && was > 0) {
      // Water rushes in from the side where it already was (a dug channel fills from its open end).
      const from = waterSide(prev, next, i);
      if (from) rush(state, ctx, x, z, from[0], from[1], from[2]);
      else burst(state, ctx, x, SEA_Y + 0.05, z, 4, 0.8);
    } else if (was === 0) burst(state, ctx, x, SEA_Y + 0.05, z, 4, 0.8); // a splash
    else dust(state, ctx, x, Math.max(was, now) * CELL_H, z, dy > 0 ? 0.85 : 0.6);
  }
}

/**
 * The way water comes into a newly dug column: from a side whose water was there before this edit, or
 * failing that from a side dug in the same edit (then later, by how far that is from old water).
 * [dx, dz, delay in seconds] pointing into the column, or null for a pool with no water beside it.
 */
function waterSide(prev: ShapePlan, next: ShapePlan, i: number): [number, number, number] | null {
  // Breadth first over the newly wet columns, back to the old water; `first` is the step out of column i.
  const first = new Map<number, number>([[i, -1]]);
  const depth = new Map<number, number>([[i, 0]]);
  const queue = [i];
  for (let k = 0; k < queue.length && k < 64; k++) {
    const c = queue[k]!;
    const cx = c % 48, cz = Math.floor(c / 48);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= 48 || nz >= 48) continue;
      const j = nx + nz * 48;
      if (first.has(j) || next.terrain.height[j] !== 0) continue;
      const step = c === i ? j : first.get(c)!;
      if (prev.terrain.height[j] === 0) {
        const sx = (step % 48) - (i % 48), sz = Math.floor(step / 48) - Math.floor(i / 48);
        return [-sx, -sz, depth.get(c)! * 0.045];
      }
      first.set(j, step);
      depth.set(j, depth.get(c)! + 1);
      queue.push(j);
    }
  }
  return null;
}

/** Foam rushing across a dug column from the side the water comes in by. */
function rush(state: State, ctx: SystemContext, x: number, z: number, dx: number, dz: number, delay: number): void {
  const fx = fxOf(ctx.stage);
  const k = state.n++;
  const along = Math.atan2(dz, dx);
  for (let n = 0; n < 4; n++) {
    const side = (rand(ctx.seed, 'rush', k, n) - 0.5) * 0.7;
    const big = 0.16 + 0.1 * rand(ctx.seed, 'rush', k, n, 's');
    fx.play(POPS[n % POPS.length]!, FEEDBACK.dustTime * 1.1, (t, m) => {
      const d = -0.55 + 1.1 * easeOut(t);
      const s = big * (t < 0.2 ? lerp(0.4, 1, t / 0.2) : 1 - easeIn((t - 0.2) / 0.8));
      place(x + dx * d - dz * side, SEA_Y + 0.04 + arc(t) * 0.05, z + dz * d + dx * side, along, s, s * 0.6, s, m);
    }, { smooth: true, delay: delay + n * 0.03 });
  }
}

/** F04: draws a structure that no longer exists once more, from the town it was in, and shrinks it away. */
function vanish(state: State, ctx: SystemContext, prev: ShapePlan, s: Structure, pivot: readonly [number, number, number]): void {
  let handle: InstanceHandle;
  try {
    const reg = registriesFor(prev);
    handle = ctx.stage.spawnMesh(reg.generators.build(s, prev, reg.parts).mesh, identity());
  } catch {
    return; // the old plan can no longer be drawn: the puffs are enough
  }
  const act: Act = { kind: 'vanish', structure: -1 - state.n++, handle, age: 0, time: FEEDBACK.removeTime, px: pivot[0], py: pivot[1], pz: pivot[2], amp: 1, dx: 0, dz: 0, dusted: true, m: identity(), carried: [] };
  state.acts.push(act);
  poseAct(act);
}

function dressingChanged(state: State, ctx: SystemContext, next: DressingPlan): void {
  const prev = state.dressing;
  state.dressing = next;
  const stage = ctx.stage;
  const at = state.editAt;
  const fresh: { id: string; dist: number }[] = [];
  const seen = new Set<string>();
  for (const p of next.props) {
    seen.add(p.id);
    const h = stage.instance(p.id);
    if (!h) continue;
    const pos = positionOf(h.base);
    // Seasonal things (the festival's lights) are shown by their own system, never popped in here.
    if (prev && at && !state.where.has(p.id) && !SEASONAL.has(p.type)) fresh.push({ id: p.id, dist: Math.hypot(pos[0] - at[0], pos[2] - at[2]) });
    state.where.set(p.id, pos);
  }
  // F04: props that lost their slot pop, nearest the edit first.
  if (prev && at) {
    const gone: { pos: [number, number, number]; dist: number }[] = [];
    for (const [id, pos] of state.where) {
      if (!seen.has(id)) gone.push({ pos, dist: Math.hypot(pos[0] - at[0], pos[2] - at[2]) });
    }
    gone.sort((a, b) => a.dist - b.dist);
    for (const g of gone.slice(0, FEEDBACK.popOutMax)) burst(state, ctx, g.pos[0], g.pos[1] + 0.12, g.pos[2], 3, 0.45);
  }
  for (const id of state.where.keys()) if (!seen.has(id)) state.where.delete(id);

  // Pop-ins still waiting from an earlier edit: the renderer has just shown every prop again.
  state.pops = state.pops.filter((p) => seen.has(p.id));
  for (const p of state.pops) {
    p.handle = stage.instance(p.id);
    if (p.age < 0) p.handle?.setVisible(false);
  }
  // F05: new props appear one after another, nearest the click first.
  if (fresh.length > 0 && fresh.length <= 80) {
    fresh.sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
    const gap = FEEDBACK.popGap * Math.min(1, FEEDBACK.popMany / fresh.length);
    const waiting = new Set(state.pops.map((p) => p.id));
    fresh.forEach((f, i) => {
      if (waiting.has(f.id)) return;
      const handle = stage.instance(f.id);
      handle?.setVisible(false);
      state.pops.push({ id: f.id, handle, age: -(0.06 + i * gap) });
    });
  }
  state.editAt = null;
  // Props fixed to a structure in mid-bounce: the renderer has just put them back at rest.
  for (const a of state.acts) {
    if (a.kind === 'vanish' || a.structure < 0) continue;
    for (const h of a.carried) h.setMatrix(mulInto(state.scratch, a.m, h.base));
  }
}

/** Props whose showing belongs to the seasons (src/life/seasons/festival.system.ts). */
const SEASONAL: ReadonlySet<string> = new Set(['festival-lights', 'wreath', 'festival-tree', 'snowman']);

export default defineSystem<State>({
  id: 'feedback',
  order: 10,
  create: () => ({ acts: [], byStructure: new Map(), pops: [], dressing: null, shape: null, where: new Map(), editAt: null, n: 0, scratch: identity(), clock: 0, lastDust: -1 }),

  sync(state, next, prev, ctx) {
    state.shape = next.shape;
    if (prev && next.shape !== prev.shape) shapeChanged(state, ctx, prev.shape, next.shape);
    if (next.dressing && next.dressing !== state.dressing) dressingChanged(state, ctx, next.dressing);
  },

  update(state, dt, _signals, ctx) {
    state.clock += dt;
    for (const c of takeCelebrations(ctx.stage)) unlock(state, ctx, c);
    if (state.acts.length > 0) {
      let kept = 0;
      for (const a of state.acts) {
        a.age += dt;
        if (a.age >= a.time) {
          if (a.kind === 'land' && !a.dusted) dust(state, ctx, a.px, a.py, a.pz, 1);
          finish(state, ctx.stage, a);
          continue;
        }
        poseAct(a);
        for (const h of a.carried) h.setMatrix(mulInto(state.scratch, a.m, h.base));
        if (a.kind === 'land' && !a.dusted && a.age >= a.time * FEEDBACK.landImpact) {
          a.dusted = true;
          dust(state, ctx, a.px, a.py, a.pz, 1);
        }
        state.acts[kept++] = a;
      }
      state.acts.length = kept;
    }
    if (state.pops.length > 0) {
      let kept = 0;
      for (const p of state.pops) {
        const before = p.age;
        p.age += dt;
        if (p.age < 0) {
          state.pops[kept++] = p;
          continue;
        }
        const h = p.handle;
        if (!h) continue;
        if (before < 0) h.setVisible(true);
        if (p.age >= FEEDBACK.popTime) {
          h.setMatrix(h.base);
          continue;
        }
        // It grows out of its own foot, a touch taller than wide on the way up.
        const s = Math.max(0.001, pop(p.age / FEEDBACK.popTime));
        const b = h.base;
        const m = state.scratch;
        for (let i = 0; i < 12; i++) m[i] = b[i]! * s;
        m[3] = m[7] = m[11] = 0;
        m[12] = b[12]!; m[13] = b[13]!; m[14] = b[14]!; m[15] = 1;
        h.setMatrix(m);
        state.pops[kept++] = p;
      }
      state.pops.length = kept;
    }
  },

  dispose(state, ctx) {
    for (const a of state.acts) finish(state, ctx.stage, a);
    state.acts = [];
    for (const p of state.pops) {
      p.handle?.setVisible(true);
      if (p.handle) p.handle.setMatrix(p.handle.base);
    }
    state.pops = [];
  },
});

export type { State as FeedbackState };
