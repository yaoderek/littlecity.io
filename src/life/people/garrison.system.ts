// Castle life (L36 garrison, L37 rider): runs each castle's troop (troop.ts)
// and rider (rider.ts) and draws them, piece by piece like the residents
// (people.system.ts): soldiers are people in the castle's tabard and helmet
// with pikes; the rider sits a horse (src/parts/people/horse.ts).
//
// Drawn "on twos" at PERSON.drawRate, like the crowd; a figure whose drawing
// did not change is not touched. Residents give way to the column and the
// horse (crowd.ts reads obstaclesOf).
//
// A change in the town (every mend step of a wrecked street is one) keeps a
// castle's troop and rider marching where they are, as long as their beat is
// the same: only a castle whose patrol or ride really changed starts afresh.
// (Rebuilding them all on every change put every soldier and the rider back
// at the start of their round, drawn anew, every few seconds while the town
// mended.)
//
// Sallying out (the raid, src/life/raid/sally.ts): while a garrison's `out` is set, its troop and rider stay
// where they are in their round (not stepped) and are drawn where `out` says instead; when it is cleared they
// carry on from there. The raid walks them back to those places first.

import { defineSystem, type InstanceHandle, type LifeStage } from '@/life/api';
import type { MeshData } from '@/gen/mesh';
import { clothColors } from '@/parts/props/kit';
import { TOOL_PIECE, toolMesh, type Tool } from '@/parts/people/extras';
import { buildHorse, HORSE_PIECES, horseMatrices, horsePose, SADDLE } from '@/parts/people/horse';
import { buildPerson, PIECES, rigOf, soldierLook, type Look, type Rig } from '@/parts/people/person';
import { applyHold, aimArm, handReach } from '@/parts/people/hands';
import { poseOf, rigMatrices, sitDrop, type Pose } from '@/parts/people/pose';
import { MeshBuilder, PATTERN } from '@/gen/mesh';
import { findCastles, type Castle } from '@/rules/life/castle.lib';
import type { ShapePlan, DressingPlan } from '@/resolve/plan';
import { PERSON } from '@/style/people';
import type { Mat4Like } from '@/core/mat4';
import { critterPose, crittersOf } from '../mischief/critters';
import { crowdOf, setObstacles, type Obstacle } from '../doors/table';
import { createRide, rideOf, tetherOf, type Ride } from './rider';
import { createRouter } from './route';
import type { Track } from './track';
import { createTroop, patrolOf, type Troop } from './troop';

interface Figure {
  handles: InstanceHandle[];
  tool: { kind: Tool; handle: InstanceHandle } | null;
  last: Float32Array;
  /** Hidden (in a brawl's dust cloud while out). */
  hidden?: boolean;
}

/** A soldier or the rider out of the castle (the raid's sally): where, how, and whether hidden in a dust cloud. */
export interface OutFigure {
  x: number;
  y: number;
  z: number;
  heading: number;
  pose: 'walk' | 'run' | 'stand' | 'cheer' | 'sit';
  /** Stride phase (walking, running), or seconds. */
  stride: number;
  hidden: boolean;
}

/** What the raid sees of a castle's garrison: its troop and rider in their round, and `out` to sally. */
export interface GarrisonView {
  readonly key: string;
  readonly castle: Castle;
  readonly troop: Troop | null;
  readonly ride: Ride | null;
  /** The castle's colour (tabards, the banner). */
  readonly colour: string;
  out: { soldiers: OutFigure[]; rider: OutFigure | null } | null;
}

const views = new WeakMap<LifeStage, () => readonly GarrisonView[]>();
/** The castles' garrisons on this stage now (none without a castle). */
export function garrisonsOf(stage: LifeStage): readonly GarrisonView[] {
  return views.get(stage)?.() ?? [];
}

interface Garrison {
  key: string;
  castle: Castle;
  /** The beat they were made for (compared on a change in the town: the same beat keeps them going). */
  patrol: Track | null;
  route: Track | null;
  troop: Troop | null;
  ride: Ride | null;
  colour: string;
  soldiers: { look: Look; rig: Rig; fig: Figure | null }[];
  horse: { pieces: InstanceHandle[]; last: Float32Array } | null;
  rider: { look: Look; rig: Rig; fig: Figure | null; reins: InstanceHandle | null } | null;
  horseLook: number;
  out: GarrisonView['out'];
}

interface State {
  list: Garrison[];
  tick: number;
  fresh: boolean;
  obstacles: Obstacle[];
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const local = new Float32Array(96);
const local2 = new Float32Array(96);
const world = new Float32Array(96);
const toolMeshes = new Map<string, MeshData>();

function release(g: Garrison): void {
  for (const s of g.soldiers) dropFigure(s.fig);
  if (g.horse) for (const h of g.horse.pieces) h.release();
  if (g.rider) {
    dropFigure(g.rider.fig);
    g.rider.reins?.release();
  }
}
function dropFigure(f: Figure | null): void {
  if (!f) return;
  for (const h of f.handles) h.release();
  f.tool?.handle.release();
}

/** world = T(x, y, z) · Ry(heading) · S(scale) · local, for `n` pieces. */
function place(n: number, x: number, y: number, z: number, heading: number, scale: number, from: Float32Array, into: Float32Array): void {
  const c = Math.cos(heading) * scale, s = Math.sin(heading) * scale;
  for (let i = 0; i < n; i++) {
    const k = i * 16;
    for (let col = 0; col < 4; col++) {
      const o = k + col * 4;
      const lx = from[o]!, ly = from[o + 1]!, lz = from[o + 2]!;
      into[o] = c * lx + s * lz + (col === 3 ? x : 0);
      into[o + 1] = scale * ly + (col === 3 ? y : 0);
      into[o + 2] = -s * lx + c * lz + (col === 3 ? z : 0);
      into[o + 3] = col === 3 ? 1 : 0;
    }
  }
}

/** into = m · from, for n matrices (a figure thrown as a whole: mischief). */
function by(n: number, m: Mat4Like, from: Float32Array, into: Float32Array): void {
  for (let i = 0; i < n; i++) {
    const k = i * 16;
    for (let col = 0; col < 4; col++) {
      const o = k + col * 4;
      const lx = from[o]!, ly = from[o + 1]!, lz = from[o + 2]!, lw = from[o + 3]!;
      for (let r = 0; r < 4; r++) into[o + r] = m[r]! * lx + m[4 + r]! * ly + m[8 + r]! * lz + m[12 + r]! * lw;
    }
  }
}

/**
 * A rider's legs astride the horse: each leg (pieces 1 and 2) turned out about its hip by `angle`, so the
 * legs come down the horse's flanks instead of into its barrel (a person's legs otherwise only swing fore
 * and aft). The leg's translation is its hip, which stays put.
 */
export function straddle(mats: Float32Array, angle: number): void {
  for (const [i, a] of [[1, -angle], [2, angle]] as const) {
    const c = Math.cos(a), s = Math.sin(a), k = i * 16;
    // Rz(a) · R for each of the three axis columns.
    for (let col = 0; col < 3; col++) {
      const x = mats[k + col * 4]!, y = mats[k + col * 4 + 1]!;
      mats[k + col * 4] = c * x - s * y;
      mats[k + col * 4 + 1] = s * x + c * y;
    }
  }
}

/** Sends a person's five pieces (and their tool) to the stage, if the drawing changed. */
function drawFigure(stage: LifeStage, f: Figure, mats: Float32Array, tool: Tool | null, colour: string): void {
  if (f.tool && f.tool.kind !== tool) {
    f.tool.handle.release();
    f.tool = null;
  }
  let fresh = false;
  if (tool && !f.tool) {
    const k = `${tool}:${colour}`;
    let mesh = toolMeshes.get(k);
    if (!mesh) toolMeshes.set(k, (mesh = toolMesh(tool, colour)));
    f.tool = { kind: tool, handle: stage.spawnMesh(mesh, IDENTITY) };
    fresh = true;
  }
  let same = !fresh;
  for (let i = 0; same && i < 80; i++) same = f.last[i] === mats[i];
  if (same) return;
  f.last.set(mats.subarray(0, 80));
  for (let i = 0; i < 5; i++) f.handles[i]!.setMatrix(mats.subarray(i * 16, i * 16 + 16));
  if (f.tool) f.tool.handle.setMatrix(mats.subarray(TOOL_PIECE[f.tool.kind] * 16, TOOL_PIECE[f.tool.kind] * 16 + 16));
}

function newFigure(stage: LifeStage, look: Look, ink: string): Figure {
  const meshes = buildPerson(look, ink);
  return { handles: PIECES.map((p) => stage.spawnMesh(meshes[p], IDENTITY)), tool: null, last: new Float32Array(80) };
}

function build(shape: ShapePlan, dressing: DressingPlan, seed: number, time: Parameters<typeof createTroop>[3]): Garrison[] {
  const nav = dressing.nav;
  const castles = findCastles(shape, nav);
  const router = createRouter(nav);
  const squares = dressing.sockets.filter((s) => s.type === 'haunt-square').map((s) => nav.nodeAt.get(s.cell)).filter((n): n is number => n !== undefined);
  const out: Garrison[] = [];
  for (const a of dressing.actors) {
    if (a.type !== 'garrison' && a.type !== 'rider') continue;
    const castle = castles.find((c) => c.id === a.home);
    if (!castle?.gate) continue;
    let g = out.find((x) => x.castle.id === castle.id);
    const colours = clothColors();
    const colour = colours[(((Number((a.params as { color?: number } | undefined)?.color ?? 0)) % colours.length) + colours.length) % colours.length]!;
    if (!g) {
      g = { key: `castle${castle.id}`, castle, patrol: null, route: null, troop: null, ride: null, colour, soldiers: [], horse: null, rider: null, horseLook: 0, out: null };
      out.push(g);
    }
    if (a.type === 'garrison') {
      const track = patrolOf(nav, castle);
      if (!track) continue;
      g.patrol = track;
      g.troop = createTroop(nav, castle, track, time);
      g.soldiers = g.troop.soldiers.map((s) => {
        const look = soldierLook(seed * 31 + castle.id * 7 + s.index, colour);
        return { look, rig: rigOf(look), fig: null };
      });
    } else {
      const track = rideOf(nav, router, castle, squares);
      // Nowhere to ride (no street from the gate): the horse still stands tethered by it.
      const tether = tetherOf(nav, castle);
      if (!track && !tether) continue;
      g.route = track;
      g.ride = createRide(castle, track, seed ^ castle.id, time, tether);
      const look = soldierLook(seed * 37 + castle.id, colour);
      g.rider = { look, rig: rigOf(look), fig: null, reins: null };
      g.horseLook = Number((a.params as { look?: number } | undefined)?.look ?? 0);
    }
  }
  return out;
}

/** The same line on the ground (samples within a hair of each other), or both none. */
function sameTrack(a: Track | null, b: Track | null): boolean {
  if (!a || !b) return a === b;
  if (a.loop !== b.loop || a.x.length !== b.x.length || Math.abs(a.length - b.length) > 1e-6) return false;
  for (let i = 0; i < a.x.length; i++) {
    if (Math.abs(a.x[i]! - b.x[i]!) > 1e-6 || Math.abs(a.y[i]! - b.y[i]!) > 1e-6 || Math.abs(a.z[i]! - b.z[i]!) > 1e-6) return false;
  }
  return true;
}

/** Same castle, same colours, same numbers, same beat: the old garrison carries on. */
function sameGarrison(a: Garrison, b: Garrison): boolean {
  return a.key === b.key && a.colour === b.colour && a.soldiers.length === b.soldiers.length && (a.ride === null) === (b.ride === null) && a.horseLook === b.horseLook && sameTrack(a.patrol, b.patrol) && sameTrack(a.route, b.route);
}

/** Where the rider's left hand holds the reins, body frame: low and forward over the withers. */
export const REINS_HAND: [number, number, number] = [-0.035, 0.2, 0.07];

let reinsMesh: ReturnType<MeshBuilder['build']> | null = null;
/** Two reins from one hand (the origin) to the two sides of the bit: unit lengths along +Z, the bit ±X apart (reinsMatrix scales it). */
function buildReins(): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder({ ink: 'reins' });
  b.setInk('reins').setColor('#4a3424').setPattern(PATTERN.none);
  // (X is scaled by the bit's width, about 0.05, so a strap's width across it is drawn about twenty times over.)
  const w = 0.004, wx = 0.085;
  for (const x of [-1, 1]) {
    // A thin strap from the hand (0, 0, 0) to the bit (x / 2, 0, 1); both faces, flat and edge on.
    b.quad([-wx, 0, 0], [wx, 0, 0], [x * 0.5 + wx, 0, 1], [x * 0.5 - wx, 0, 1]);
    b.quad([wx, 0, 0], [-wx, 0, 0], [x * 0.5 - wx, 0, 1], [x * 0.5 + wx, 0, 1]);
    b.quad([0, -w, 0], [0, w, 0], [x * 0.5, w, 1], [x * 0.5, -w, 1]);
    b.quad([0, w, 0], [0, -w, 0], [x * 0.5, -w, 1], [x * 0.5, w, 1]);
  }
  return b.build();
}
/** The reins' matrix: from the hand to the middle of the bit along +Z, the bit's two sides at ±0.5 X. */
function reinsMatrix(hand: [number, number, number], l: [number, number, number], r: [number, number, number]): number[] {
  const mid = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  const z = [mid[0]! - hand[0], mid[1]! - hand[1], mid[2]! - hand[2]];
  const x = [r[0] - l[0], r[1] - l[1], r[2] - l[2]];
  // y: perpendicular to both (its length only scales the strap's thickness: keep it unit).
  const y = [z[1]! * x[2]! - z[2]! * x[1]!, z[2]! * x[0]! - z[0]! * x[2]!, z[0]! * x[1]! - z[1]! * x[0]!];
  const n = Math.hypot(y[0]!, y[1]!, y[2]!) || 1;
  return [x[0]!, x[1]!, x[2]!, 0, y[0]! / n, y[1]! / n, y[2]! / n, 0, z[0]!, z[1]!, z[2]!, 0, hand[0], hand[1], hand[2], 1];
}

const RIDE_POSE: Pose = { legL: 0.4, legR: 0.4, armL: 0.75, armR: 0.3, outL: 0.05, outR: 0.12, lean: 0.04, lift: 0, twist: 0 };

export default defineSystem<State>({
  id: 'garrison',
  order: 21,
  create(ctx) {
    const state: State = { list: [], tick: -1, fresh: true, obstacles: [] };
    setObstacles(ctx.stage, () => state.obstacles);
    // The debug handle for watching (like window.__lcPeople).
    (globalThis as { __lcGarrison?: State }).__lcGarrison = state;
    views.set(ctx.stage, () => state.list);
    return state;
  },
  sync(state, next, prev, ctx) {
    if (!next.dressing) return;
    // Keep a troop that is still there (same castle and same actors) going across unrelated edits.
    const keep = prev?.dressing && next.dressing.nav === prev.dressing.nav;
    if (keep && state.list.length > 0) return;
    // The town changed: each castle whose beat is the same keeps its troop and rider where they are.
    const made = build(next.shape, next.dressing, ctx.seed, ctx.signals.time);
    const kept = new Set<Garrison>();
    const before = state.list;
    state.list = made.map((g) => {
      const old = before.find((o) => !kept.has(o) && sameGarrison(o, g));
      if (!old) return g;
      kept.add(old);
      old.castle = g.castle;
      return old;
    });
    for (const o of before) if (!kept.has(o)) release(o);
    state.fresh = true;
  },
  update(state, dt, signals, ctx) {
    const crowd = crowdOf(ctx.stage);
    const crowded = (x: number, z: number, dx: number, dz: number): boolean => {
      if (!crowd) return false;
      for (const p of crowd.people) {
        if (!p.visible) continue;
        const ox = p.x - x, oz = p.z - z;
        const ahead = ox * dx + oz * dz;
        if (ahead > -0.2 && ahead < 1.1 && Math.abs(ox * dz - oz * dx) < 0.5) return true;
      }
      return false;
    };
    state.obstacles.length = 0;
    for (const g of state.list) {
      // Out (the raid's sally): their round waits for them where they left it.
      if (!g.out) {
        g.troop?.step(dt, signals.time);
        g.ride?.step(dt, signals.time, crowded);
      }
      for (const s of g.out?.soldiers ?? g.troop?.soldiers ?? []) state.obstacles.push({ x: s.x, z: s.z, y: s.y });
      if (g.out?.rider) state.obstacles.push({ x: g.out.rider.x, z: g.out.rider.z, y: g.out.rider.y });
      else if (g.ride) {
        // The horse is long: its middle and both ends.
        const hx = Math.sin(g.ride.heading) * 0.2, hz = Math.cos(g.ride.heading) * 0.2;
        state.obstacles.push({ x: g.ride.x, z: g.ride.z, y: g.ride.y }, { x: g.ride.x + hx, z: g.ride.z + hz, y: g.ride.y }, { x: g.ride.x - hx, z: g.ride.z - hz, y: g.ride.y });
      }
    }
    const tick = Math.floor(signals.time.seconds * PERSON.drawRate);
    // (Every frame while a soldier is in the air: mischief.)
    if (tick === state.tick && !state.fresh && !state.list.some((g) => g.troop?.soldiers.some((_, i) => crittersOf(ctx.stage).get(`${g.key}-soldier${i}`)?.body) || crittersOf(ctx.stage).get(`${g.key}-horse`)?.body || crittersOf(ctx.stage).get(`${g.key}-rider`)?.body)) return;
    state.tick = tick;
    state.fresh = false;
    for (const g of state.list) {
      if (g.troop) {
        g.troop.soldiers.forEach((s0, i) => {
          const d = g.soldiers[i]!;
          d.fig ??= newFigure(ctx.stage, d.look, `${g.key}-soldier${i}`);
          // Out on a sally: drawn where the raid has them (hidden while in a brawl's dust cloud).
          const o = g.out?.soldiers[i];
          const s = o ?? s0;
          // Mischief: blown about or in the Hand (src/life/mischief/critters.ts): thrown as a whole, arms and legs out.
          const held = critterPose(ctx.stage, `${g.key}-soldier${i}`, 'soldier', s.x, s.y, s.z, s.heading, 0.46, d.look.scale);
          const hide = !held && (o?.hidden ?? false);
          if (hide !== (d.fig.hidden ?? false)) {
            d.fig.hidden = hide;
            for (const h of d.fig.handles) h.setVisible(!hide);
            d.fig.tool?.handle.setVisible(!hide);
          }
          if (hide) return;
          const still = { legL: 0, legR: 0, armL: 0, armR: 0, outL: 0.08, outR: 0.08, lean: 0, lift: 0, twist: 0 };
          const pose = held
            ? poseOf('dive', 0)
            : o
              ? o.pose === 'walk' || o.pose === 'run'
                ? poseOf(o.pose, o.stride, 0)
                : o.pose === 'cheer' || o.pose === 'sit'
                  ? poseOf(o.pose, o.stride, i)
                  : still
              : s0.pose === 'walk'
                ? poseOf('walk', s0.stride, 0)
                : still;
          const torch = !o && s0.torch;
          // The pike (or the sentry's torch) in the right hand: the hand closes on its shaft (hands.ts).
          applyHold(pose, d.rig, { tool: torch ? 'torch' : 'pike', load: null, hold: null, anchor: null });
          rigMatrices(d.look, pose, local, o?.pose === 'sit' ? sitDrop(d.rig, 0) : 0, d.rig);
          if (held) by(6, held, local, world);
          else place(5, s.x, s.y, s.z, s.heading, d.look.scale, local, world);
          drawFigure(ctx.stage, d.fig, world, torch ? 'torch' : 'pike', g.colour);
        });
      }
      if (g.ride && g.rider) {
        // Out on a sally: in the saddle where the raid has him, trotting or standing.
        const o = g.out?.rider;
        const r: Pick<Ride, 'x' | 'y' | 'z' | 'heading' | 'gait' | 'phase' | 'riding'> = o
          ? { x: o.x, y: o.y, z: o.z, heading: o.heading, gait: o.pose === 'stand' || o.pose === 'cheer' ? 'stand' : 'trot', phase: o.stride, riding: true }
          : g.ride;
        const meshes = g.horse ? null : buildHorse(g.horseLook, g.colour);
        g.horse ??= { pieces: HORSE_PIECES.map((p) => ctx.stage.spawnMesh(meshes![p], IDENTITY)), last: new Float32Array(96) };
        // Mischief (src/life/mischief/critters.ts): the horse, and its rider apart from it, can be blown about
        // or picked up; a rider in the saddle goes with the horse, clinging on.
        const horseHeld = critterPose(ctx.stage, `${g.key}-horse`, 'horse', r.x, r.y, r.z, r.heading, 0.55, 1);
        const hp = horsePose(horseHeld ? 'trot' : r.gait, horseHeld ? signals.time.seconds * 3 : r.phase, (g.castle.id % 7) / 7);
        horseMatrices(hp, local);
        if (horseHeld) by(6, horseHeld, local, world);
        else place(6, r.x, r.y, r.z, r.heading, 1, local, world);
        // The bit, either side of the horse's mouth (its body frame), for the reins.
        const bit = [-0.024, 0.024].map((bx): [number, number, number] => [world[0]! * bx + world[4]! * 0.38 + world[8]! * 0.31 + world[12]!, world[1]! * bx + world[5]! * 0.38 + world[9]! * 0.31 + world[13]!, world[2]! * bx + world[6]! * 0.38 + world[10]! * 0.31 + world[14]!]);
        let same = true;
        for (let i = 0; same && i < 96; i++) same = g.horse.last[i] === world[i];
        if (!same) {
          g.horse.last.set(world);
          for (let i = 0; i < 6; i++) g.horse.pieces[i]!.setMatrix(world.subarray(i * 16, i * 16 + 16));
        }
        // The rider: in the saddle while riding; standing at the horse's head while it is tethered.
        g.rider.fig ??= newFigure(ctx.stage, g.rider.look, `${g.key}-rider`);
        // Where he would be by himself: in the saddle, or at the horse's head.
        const riderAt = r.riding
          ? { x: r.x + Math.sin(r.heading) * SADDLE.z, y: r.y + SADDLE.y, z: r.z + Math.cos(r.heading) * SADDLE.z, h: r.heading }
          : { x: r.x + Math.sin(r.heading) * 0.2 + Math.cos(r.heading) * 0.16, y: r.y, z: r.z + Math.cos(r.heading) * 0.2 - Math.sin(r.heading) * 0.16, h: r.heading - Math.PI / 2 };
        const riderHeld = critterPose(ctx.stage, `${g.key}-rider`, 'rider', riderAt.x, riderAt.y, riderAt.z, riderAt.h, 0.46, g.rider.look.scale);
        if (riderHeld) {
          // Off his horse: thrown as a whole, arms and legs out.
          const pose = poseOf('dive', 0);
          applyHold(pose, g.rider.rig, { tool: 'lance', load: null, hold: null, anchor: null });
          rigMatrices(g.rider.look, pose, local, 0, g.rider.rig);
          by(6, riderHeld, local, world);
        } else if (r.riding && horseHeld) {
          // In the saddle of a flying horse, hanging on.
          const pose = { ...RIDE_POSE, lean: 0.35, armR: 2.6, outR: 0.6 };
          applyHold(pose, g.rider.rig, { tool: 'lance', load: null, hold: null, anchor: null });
          rigMatrices(g.rider.look, pose, local, sitDrop(g.rider.rig, 0), g.rider.rig);
          straddle(local, 0.55);
          place(6, 0, SADDLE.y + hp.lift, SADDLE.z, 0, g.rider.look.scale, local, local2);
          by(6, horseHeld, local2, world);
        } else if (r.riding) {
          const drop = sitDrop(g.rider.rig, 0);
          const pose = { ...RIDE_POSE, lean: r.gait === 'trot' ? 0.1 : 0.04 };
          // The lance in the right hand, the reins gathered in the left over the horse's withers.
          applyHold(pose, g.rider.rig, { tool: 'lance', load: null, hold: null, anchor: null });
          aimArm(pose, g.rider.rig, -1, REINS_HAND);
          rigMatrices(g.rider.look, pose, local, drop, g.rider.rig);
          straddle(local, 0.55);
          // Origin on the saddle: the seat moves with the horse's spring.
          const sx = r.x + Math.sin(r.heading) * SADDLE.z, sz = r.z + Math.cos(r.heading) * SADDLE.z;
          place(5, sx, r.y + SADDLE.y + hp.lift, sz, r.heading, g.rider.look.scale, local, world);
        } else {
          // Beside the horse's head, holding the bridle, looking about.
          const side = 0.16, fwd = 0.2;
          const cx = r.x + Math.sin(r.heading) * fwd + Math.cos(r.heading) * side, cz = r.z + Math.cos(r.heading) * fwd - Math.sin(r.heading) * side;
          const pose = poseOf('stand', signals.time.seconds, 0.3);
          applyHold(pose, g.rider.rig, { tool: 'lance', load: null, hold: null, anchor: null });
          rigMatrices(g.rider.look, pose, local, 0, g.rider.rig);
          place(5, cx, r.y, cz, r.heading - Math.PI / 2, g.rider.look.scale, local, world);
        }
        drawFigure(ctx.stage, g.rider.fig, world, 'lance', g.colour);
        // The reins from the left hand to the bit, while riding (not while either of them is in the air).
        g.rider.reins ??= ctx.stage.spawnMesh((reinsMesh ??= buildReins()), IDENTITY);
        const reined = r.riding && !riderHeld && !horseHeld;
        g.rider.reins.setVisible(reined);
        if (reined) {
          const y = -handReach(g.rider.rig), k = 3 * 16;
          const hand: [number, number, number] = [world[k + 4]! * y + world[k + 12]!, world[k + 5]! * y + world[k + 13]!, world[k + 6]! * y + world[k + 14]!];
          g.rider.reins.setMatrix(reinsMatrix(hand, bit[0]!, bit[1]!));
        }
      }
    }
  },
  dispose(state, ctx) {
    for (const g of state.list) release(g);
    state.list = [];
    setObstacles(ctx.stage, null);
  },
});
