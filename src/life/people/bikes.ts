// Bikes: the bikes leaning by front doors (D11, the 'door-bike' prop) and
// the residents who ride them. Pure: no drawing, no clock of its own. The
// crowd (crowd.ts) asks it at a few moments of a walk; people.system.ts
// draws what it says (bike-art.ts).
//
// Who: the first grown-up resident of the house whose door has the bike.
// One rider per bike, one bike per rider.
//
// When: setting out from home on a trip of BIKE.minWalk cells or more whose
// whole way is out of doors (never through a building), by day or at dusk,
// not in rain heavier than BIKE.rain or in snow, with nothing in their hands
// that will not go in the basket, and while fewer than the cap ride.
//
// A ride, along the walk the crowd plans (walk.ts, so it curves through
// turns exactly as people do and never leaves the graph):
//   - out of the door on foot, the bike taken from the wall, wheeled across
//     the doorstep's cell, a moment to get on;
//   - ridden at BIKE.speed times their walk, slowing into sharp turns (and
//     never turning on the spot);
//   - off, and wheeled at a walk, over stairs, carved steps and stoops, on
//     sand, in a garden, and through any cell that is crowded when they come
//     to it (a market's stalls, a wedding, people standing about);
//   - off for the last cell, and leaned by the door they go in at, else
//     against a wall or fence of the cell they stop in, else on its stand.
// It waits there while they are busy; the next time they choose what to do
// they take it and go home with it (riding if the trip qualifies, else
// wheeling it), and it goes back on its wall.
//
// Mischief: a rider running from trouble (a raid, a fire, a bomb), thrown
// off their feet or built over lays the bike down where they are. Once
// things are back to normal they come for it.
//
// The bike is always in exactly one place: 'home' (drawn by its prop),
// 'ridden' (in its owner's hands, ridden or wheeled), 'parked' (leaning or on
// its stand somewhere else) or 'lying' (on its side).

import { DIR4, edgeOf, key, keyX, keyY, keyZ, type CellKey, type Dir4 } from '@/core/grid';
import type { Kind } from '@/core/kinds';
import type { TimeSignal } from '@/life/api';
import type { DressingPlan, NavDoor, NavGraph, ShapePlan, StructureId } from '@/resolve/plan';
import { BIKE } from '@/style/people';
import type { Goal, Person } from './crowd';
import type { Load } from './errand';
import type { Route } from './route';
import { doorDirs, nodeCentre, nodeHeight, type Piece, type Point } from './walk';

export type BikeAt = 'home' | 'ridden' | 'parked' | 'lying';

/** Where a bike away from home is, and how it stands there. */
export type BikeRest =
  /** Leaning on the wall beside a door, as at home: right of it (side 1) or left (−1). */
  | { kind: 'door'; door: NavDoor; side: 1 | -1; steps: number }
  /** Leaning on the side `dir` of a cell (a house, a wall, a fence), `along` from the side's middle. */
  | { kind: 'wall'; dir: Dir4; along: number }
  /** On its stand, or lying on its side: at (x, z), its front toward `heading`. */
  | { kind: 'stand'; x: number; z: number; heading: number }
  | { kind: 'lying'; x: number; z: number; heading: number };

export interface Bike {
  /** The door-bike prop's id. */
  readonly id: string;
  /** The house it belongs to, its door there, and the prop drawing it at home (null once that is gone). */
  home: StructureId;
  door: NavDoor | null;
  prop: string | null;
  paint: number;
  /** The stoop steps of its door at home (the wall is that much farther back). */
  steps: number;
  owner: Person | null;
  at: BikeAt;
  /** Away from home (parked, lying): how, and the node and cell it is in, and where (world). */
  rest: BikeRest | null;
  node: number;
  cell: CellKey;
  x: number;
  y: number;
  z: number;
  /** In hand: this walk is ridden (else the bike is wheeled all the way). */
  ride: boolean;
  /** Ridden now (else wheeled, or stood beside), and how fast, as a share of the rider's walk. */
  mounted: boolean;
  v: number;
  /** Seconds left of getting on or off (stood still beside it). */
  pause: number;
  /** The ridden stretch of the walk, counted from its end (so it survives the walk being carried to a new graph). */
  fromEnd: number;
  toEnd: number;
  /** Pieces of this walk already judged crowded (false) or clear (true), as they came to them. */
  judged: Map<number, boolean>;
  /** Tries to take it home that came to nothing (no way home): after a few it is left where it is. */
  tries: number;
}

/** What it needs from the crowd. */
export interface BikeHost {
  readonly people: readonly Person[];
  /** Cells with something standing in them a while (L56: a market's stalls; the crowd's setCrowded). */
  crowded(cell: CellKey): boolean;
}

export interface BikeOptions {
  /** Riders allowed at once now (BIKE.cap on a desktop; the people system passes the device's). */
  cap?(): number;
  /** The weather now; clear without it. */
  weather?(): { rain: number; snow: number; cover: number };
}

export interface Bikes {
  readonly all: readonly Bike[];
  /** The bike someone has in hand (ridden or wheeled), or null. */
  inHand(p: Person): Bike | null;
  /** Bikes in hand now (the cap counts these). */
  riders(): number;
  sync(shape: ShapePlan, dressing: DressingPlan, nav: NavGraph): void;
  /**
   * Somebody is choosing what to do. 'home': they have their bike in hand (they took it just now), so home
   * they go with it. A place: their bike is away from home, so they go for it first. Null: nothing to do
   * with bikes. `stayIn`: they are at home and it is time to stay in (they fetch it tomorrow).
   */
  next(p: Person, stayIn: boolean): 'home' | { node: number; spot: Point; face: number } | null;
  /** A walk is about to start along `route` to `goal` (before the person's mode changes): take the bike or not, ride or wheel. */
  plan(p: Person, route: Route, goal: Goal, time: TimeSignal): void;
  /** The walk's pieces are built: where the ridden stretch is. */
  started(p: Person, walk: readonly Piece[]): void;
  /** The share of their walking speed they go at now, eased over `dt` (1 for anybody without a bike in hand). */
  pace(p: Person, dt: number): number;
  /** Mounted now: they turn as a bike turns, never on the spot. */
  mounted(p: Person): boolean;
  /**
   * They stepped onto a new piece of their walk. Into the last cell of a walk to a seat, or to a cell with
   * something standing in it (a bench, café tables): the bike is left standing at the edge of the cell they
   * just left, and they walk the last of the way.
   */
  entered(p: Person, goal: Goal | null): void;
  /** They got where they were going: the bike is leaned there (or put back home). */
  arrive(p: Person, goal: Goal): void;
  /** Whatever they have in hand is laid down where they stand (or at `node`, where they are being put). */
  drop(p: Person, node?: number): void;
  /** They are gone from the town: what they had in hand is left standing where they were, and nobody owns their bike any more. */
  gone(p: Person): void;
}

/** Ridden on these; wheeled across anything else. */
const RIDE_ON = new Set(['path', 'plaza', 'deck', 'trail', 'grass']);
/** A bike leans on the side of a cell where one of these stands (or a fence or wall edge piece runs). */
const LEAN_ON = new Set<Kind>(['house', 'tower', 'lighthouse', 'windmill', 'wall', 'fence', 'marble']);
/** Loads that ride in the front basket (loaves, a fish or two, apples and vegetables, flowers). Anything else: they walk. */
const BASKET = new Set<string>(['loaf', 'fishes', 'basket', 'petals', 'bouquet', 'cone']);
export function inBasket(load: Load | null): boolean {
  return load === null || BASKET.has(load) || load.includes('apple');
}
/** Errands that are trouble (a raid, a fire, a bomb, a mischief): nobody rides to them, and a rider gets off and runs. */
const TROUBLE = ['flee:', 'bomb:', 'fire:', 'chase:', 'raid:', 'mischief:', 'rebuild:'];
const trouble = (g: Goal | null): boolean => {
  const tag = g?.errand?.tag ?? '';
  return TROUBLE.some((t) => tag.startsWith(t));
};

export function createBikes(host: BikeHost, opts: BikeOptions = {}): Bikes {
  let bikes: Bike[] = [];
  const byId = new Map<string, Bike>();
  const ownerOf = new Map<Person, Bike>();
  let nav: NavGraph | null = null;
  let shape: ShapePlan | null = null;
  const cap = (): number => opts.cap?.() ?? BIKE.cap;
  const riders = (): number => {
    let n = 0;
    for (const b of bikes) if (b.at === 'ridden') n++;
    return n;
  };
  const weatherOK = (): boolean => {
    const w = opts.weather?.();
    return !w || (w.rain <= BIKE.rain && w.snow <= BIKE.snow && w.cover <= BIKE.cover);
  };
  const handOf = (p: Person): Bike | null => {
    const b = ownerOf.get(p);
    return b && b.at === 'ridden' ? b : null;
  };
  const setOwner = (b: Bike, p: Person | null): void => {
    if (b.owner && ownerOf.get(b.owner) === b) ownerOf.delete(b.owner);
    b.owner = p;
    if (p) ownerOf.set(p, b);
  };
  const take = (b: Bike, p: Person): void => {
    b.at = 'ridden';
    b.rest = null;
    b.node = -1;
    b.ride = false;
    b.mounted = false;
    b.v = 1;
    b.pause = 0;
    b.judged.clear();
    b.fromEnd = b.toEnd = 0;
  };
  /** Laid somewhere away from home, at a node. */
  const rest = (b: Bike, at: 'parked' | 'lying', r: BikeRest, node: number): void => {
    b.at = at;
    b.rest = r;
    b.node = node;
    b.cell = node >= 0 && nav ? nav.nodes[node]!.cell : -1;
    b.ride = b.mounted = false;
    b.pause = 0;
    b.tries = 0;
    const w = restPoint(b);
    b.x = w.x;
    b.z = w.z;
    b.y = node >= 0 && nav ? nodeHeight(nav, node) : b.y;
  };
  /** Roughly where a bike at rest is (world x, z): beside a door, against a wall, or where it stands. */
  const restPoint = (b: Bike): Point => {
    const r = b.rest;
    if (!r || !nav || b.node < 0) return { x: b.x, z: b.z };
    if (r.kind === 'stand' || r.kind === 'lying') return { x: r.x, z: r.z };
    const c = nodeCentre(nav, b.node);
    if (r.kind === 'wall') {
      const [dx, dz] = DIR4[r.dir]!;
      return { x: c.x + dx * 0.38 - dz * r.along, z: c.z + dz * 0.38 + dx * r.along };
    }
    const d = r.door.dir ?? 0;
    const [dx, dz] = DIR4[d]!;
    // Outside the door, against its wall, to one side (+X of the door's frame is (−dz, dx) out of the wall… seen from outside).
    const fx = keyX(r.door.cell) + 0.5 + dx * 0.55, fz = keyZ(r.door.cell) + 0.5 + dz * 0.55;
    return { x: fx + dz * 0.32 * r.side, z: fz - dx * 0.32 * r.side };
  };
  const stepsOf = (door: NavDoor): number => {
    const f = shape?.features.find((x) => x.id === door.feature);
    return (f?.params as { steps?: number } | undefined)?.steps ?? 0;
  };
  /** A bike set down where somebody stands: on its side, along the way they faced. */
  const lay = (b: Bike, p: Person, node: number): void => {
    const n = node >= 0 ? node : p.node;
    const c = nav && n >= 0 ? nodeCentre(nav, n) : { x: p.x, z: p.z };
    // Within its cell, a little to the side of them.
    const rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
    const x = Math.max(c.x - 0.38, Math.min(c.x + 0.38, (node >= 0 ? c.x : p.x) + rx * 0.16));
    const z = Math.max(c.z - 0.38, Math.min(c.z + 0.38, (node >= 0 ? c.z : p.z) + rz * 0.16));
    rest(b, 'lying', { kind: 'lying', x, z, heading: p.heading }, n);
  };
  /** Where to leave a bike at the end of a walk to `goal`: by its door, else against a wall or fence there, else on its stand. */
  const park = (b: Bike, p: Person, goal: Goal): void => {
    if (!nav) return;
    const node = p.node;
    // By the door they go in at: right of it, or left if a bike is there already.
    const door = goal.door;
    if (door && door.dir !== undefined && door.node === node && door.socket !== undefined) {
      const taken = (side: 1 | -1): boolean =>
        bikes.some((o) => o !== b && ((o.at === 'home' && o.door?.feature === door.feature && side === 1) || (o.rest?.kind === 'door' && o.rest.door.feature === door.feature && o.rest.side === side)));
      const side = !taken(1) ? 1 : !taken(-1) ? -1 : 0;
      if (side !== 0) {
        rest(b, 'parked', { kind: 'door', door, side, steps: stepsOf(door) }, node);
        return;
      }
    }
    // Against a wall or a fence of this cell, on the side nearest them and not where a door opens.
    const cell = nav.nodes[node]!.cell;
    const x = keyX(cell), y = keyY(cell), z = keyZ(cell);
    const c = nodeCentre(nav, node);
    const doors = doorDirs(nav, node);
    let best: { dir: Dir4; d: number } | null = null;
    for (let dir = 0 as Dir4; dir < 4; dir = (dir + 1) as Dir4) {
      if (doors.includes(dir)) continue;
      const [dx, dz] = DIR4[dir]!;
      const kind = shape?.kinds.get(key(x + dx, y, z + dz));
      const edge = shape?.edgeAt.has(edgeOf(cell, dir)) ?? false;
      if (!edge && !(kind !== undefined && LEAN_ON.has(kind))) continue;
      // A bike stood there already: another side.
      if (bikes.some((o) => o !== b && o.node === node && o.rest?.kind === 'wall' && o.rest.dir === dir)) continue;
      const d = Math.hypot(p.x - (c.x + dx * 0.4), p.z - (c.z + dz * 0.4));
      if (!best || d < best.d) best = { dir, d };
    }
    if (best) {
      const [dx, dz] = DIR4[best.dir]!;
      // Along the wall, to the side away from where they stand.
      const lat = (p.x - c.x) * -dz + (p.z - c.z) * dx;
      rest(b, 'parked', { kind: 'wall', dir: best.dir, along: lat > 0 ? -0.16 : 0.16 }, node);
      return;
    }
    // On its stand beside them, square to the way they face, kept inside the cell.
    const rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
    const sx = Math.max(c.x - 0.36, Math.min(c.x + 0.36, p.x + rx * 0.2));
    const sz = Math.max(c.z - 0.36, Math.min(c.z + 0.36, p.z + rz * 0.2));
    rest(b, 'parked', { kind: 'stand', x: sx, z: sz, heading: p.heading }, node);
  };
  /** True if every link of the route is out of doors. */
  const outdoors = (route: Route): boolean => route.links.every((l) => nav!.links[l]!.via !== 'interior');
  const mayRide = (p: Person, route: Route, goal: Goal, time: TimeSignal, b: Bike): boolean => {
    if (!nav || p.child || p.raider || p.leaving || p.costume !== null) return false;
    if (!(time.isDay || time.isDusk) || !weatherOK() || trouble(goal)) return false;
    // Taken from home only for a long trip; once in hand, ridden on (home, or on from where it stood) unless the way is a step or two.
    if (route.nodes.length - 1 < (b.at === 'ridden' ? 3 : BIKE.minWalk) || !outdoors(route)) return false;
    // What they will carry on the way: an errand's load, else what they hold.
    if (!inBasket(goal.errand ? goal.errand.load : p.load)) return false;
    return riders() - (b.at === 'ridden' ? 1 : 0) < cap();
  };
  /** May a bike be ridden across this piece (else it is wheeled)? */
  const rideable = (p: Person, b: Bike, walk: readonly Piece[], i: number): boolean => {
    const piece = walk[i]!;
    if (piece.kind !== 'move' || piece.ramp !== null || piece.sink0 !== 0 || piece.sink1 !== 0) return false;
    const n = nav!.nodes[piece.node]!;
    if (!RIDE_ON.has(n.surface) || n.rot !== undefined || n.lift !== undefined || n.pavilion !== undefined) return false;
    // Coming off a flight or steps (their foot is in this cell): wheeled.
    const prev = walk[i - 1];
    if (prev && prev.link >= 0) {
      const via = nav!.links[prev.link]!.via;
      if (via === 'stairs' || via === 'steps') return false;
    }
    if (piece.link >= 0) {
      const via = nav!.links[piece.link]!.via;
      if (via === 'stairs' || via === 'steps') return false;
    }
    // Crowded: judged once, as they come to the cell.
    // (Keyed from the walk's end, which a walk carried over to a new graph keeps.)
    const k = walk.length - i;
    let clear = b.judged.get(k);
    if (clear === undefined) {
      let others = 0;
      for (const q of host.people) if (q !== p && q.visible && q.node === piece.node && q.mode !== 'home' && q.mode !== 'visit' && q.mode !== 'gone') others++;
      clear = others < BIKE.crowd && !host.crowded(n.cell);
      b.judged.set(k, clear);
    }
    return clear;
  };
  /** How much of the riding speed is kept through a piece: less the more it turns. */
  const bendKeep = (piece: Piece): number => {
    const ax = piece.cx - piece.x0, az = piece.cz - piece.z0, bx = piece.x1 - piece.cx, bz = piece.z1 - piece.cz;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) return 1;
    const cos = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)));
    const bend = Math.acos(cos);
    return Math.max(0.3, 1 - (1 - BIKE.turn) * (bend / (Math.PI / 2)));
  };
  const index = (p: Person, fromEnd: number): number => (p.walk ? p.walk.length - fromEnd : -1);
  /** On or off for the piece they are on now (judged as they come to it). */
  const judge = (p: Person, b: Bike, walk: readonly Piece[]): void => {
    const i = p.at;
    const on = b.ride && i >= index(p, b.fromEnd) && i <= index(p, b.toEnd) && rideable(p, b, walk, i);
    if (on === b.mounted) return;
    // Getting on at the start and off at the end: a moment stood beside it. On the way (stairs, a crowd)
    // they slowed to a walk before it, and step off and on as they go (never standing in a narrow way).
    const first = on && i === index(p, b.fromEnd);
    const last = !on && i > index(p, b.toEnd);
    b.mounted = on;
    if ((first || last) && p.held < 0) b.pause = BIKE.mount;
    b.v = on ? (first ? 0.4 : 1) : 1;
  };

  return {
    get all() {
      return bikes;
    },
    inHand: handOf,
    riders,
    sync(sh, dressing, graph) {
      nav = graph;
      shape = sh;
      const seen = new Set<string>();
      const next: Bike[] = [];
      for (const prop of dressing.props) {
        if (prop.type !== 'door-bike' || !('socket' in prop.at)) continue;
        const socket = prop.at.socket;
        const door = graph.doors.find((d) => d.socket === socket) ?? null;
        if (!door || door.node < 0) continue;
        seen.add(prop.id);
        const params = (prop.params ?? {}) as { paint?: number; steps?: number };
        let b = byId.get(prop.id);
        if (!b) {
          b = {
            id: prop.id, home: door.structure, door, prop: prop.id, paint: params.paint ?? 0, steps: params.steps ?? 0, owner: null, at: 'home', rest: null, node: -1, cell: -1, x: 0, y: 0, z: 0,
            ride: false, mounted: false, v: 1, pause: 0, fromEnd: 0, toEnd: 0, judged: new Map(), tries: 0,
          };
          byId.set(prop.id, b);
        }
        b.home = door.structure;
        b.door = door;
        b.prop = prop.id;
        b.paint = params.paint ?? b.paint;
        b.steps = params.steps ?? b.steps;
        next.push(b);
      }
      for (const b of bikes) {
        if (seen.has(b.id)) continue;
        // Its prop is gone (the house rebuilt, the doorstep rolls no bike now, the house gone). At home it
        // went with the drawing; out in the town it stays where it is, or in its rider's hands.
        b.prop = null;
        b.door = null;
        if (b.at === 'home') {
          setOwner(b, null);
          byId.delete(b.id);
          continue;
        }
        next.push(b);
      }
      bikes = next;
      // Bikes out in the town: on the new graph, or (their ground gone) lying on the nearest ground.
      for (const b of bikes) {
        if (b.at !== 'parked' && b.at !== 'lying') continue;
        const node = b.cell >= 0 ? graph.nodeAt.get(b.cell) : undefined;
        let ok = node !== undefined;
        if (ok && b.rest?.kind === 'door') {
          const was = b.rest.door;
          const door = graph.doors.find((d) => d.feature === was.feature && d.structure === was.structure && d.node === node);
          if (door) b.rest = { ...b.rest, door };
          else ok = false;
        }
        if (ok) {
          b.node = node!;
          continue;
        }
        const near = nearestNode(graph, b.x, b.y, b.z);
        if (near < 0) {
          // Nowhere at all to put it: the town is gone.
          setOwner(b, null);
          b.at = 'lying';
          b.node = -1;
          continue;
        }
        const c = nodeCentre(graph, near);
        b.node = near;
        b.cell = graph.nodes[near]!.cell;
        b.at = 'lying';
        b.rest = { kind: 'lying', x: c.x, z: c.z, heading: b.rest && 'heading' in b.rest ? b.rest.heading : 0 };
        b.x = c.x;
        b.z = c.z;
        b.y = nodeHeight(graph, near);
      }
      // Owners: whoever has it keeps it while they live in its house; else the first grown-up there without one.
      for (const b of bikes) {
        const o = b.owner;
        const keeps = o !== null && o.mode !== 'gone' && host.people.includes(o) && (b.prop === null || (o.home === b.home && !o.leaving));
        if (!keeps) {
          // In hand, its rider leaving town: it goes with them (they leave it where they leave).
          if (o && b.at === 'ridden' && o.mode !== 'gone' && host.people.includes(o)) continue;
          setOwner(b, null);
        }
      }
      for (const b of bikes) {
        if (b.owner || b.prop === null) continue;
        let best: Person | null = null;
        for (const p of host.people) {
          if (p.home !== b.home || p.child || p.shutIn || p.leaving || p.raider || p.mode === 'gone' || ownerOf.has(p)) continue;
          if (!best || p.index < best.index || (p.index === best.index && p.id < best.id)) best = p;
        }
        if (best) setOwner(b, best);
      }
      for (const [p, b] of ownerOf) if (b.owner !== p || !bikes.includes(b)) ownerOf.delete(p);
    },
    next(p, stayIn) {
      const b = ownerOf.get(p);
      if (!b || b.at === 'home') return null;
      if (b.at === 'ridden') {
        // Stood with it and could not get home a few times: it is left here, on its stand.
        if (p.mode !== 'walk' && ++b.tries > 3 && nav && p.node >= 0) {
          rest(b, 'parked', { kind: 'stand', x: p.x - Math.cos(p.heading) * 0.2, z: p.z + Math.sin(p.heading) * 0.2, heading: p.heading }, p.node);
          return null;
        }
        return 'home';
      }
      if (!nav || b.node < 0 || p.node < 0 || nav.part[b.node] !== nav.part[p.node]) return null;
      // Beside it now (out of the shop they leaned it by, back at the bench): they take it.
      if (p.mode !== 'home' && (p.node === b.node || (Math.hypot(p.x - b.x, p.z - b.z) < 0.9 && Math.abs(p.y - b.y) < 0.3))) {
        take(b, p);
        return 'home';
      }
      if (stayIn) return null;
      // Over to it, to stand beside it, facing it.
      const c = nodeCentre(nav, b.node);
      const sx = c.x + (b.x - c.x) * 0.3, sz = c.z + (b.z - c.z) * 0.3;
      return { node: b.node, spot: { x: sx, z: sz }, face: Math.atan2(b.x - sx, b.z - sz) };
    },
    plan(p, route, goal, time) {
      if (!nav) return;
      const b = handOf(p);
      if (!b) {
        // Setting out from home, with the bike there on its wall and its door the one they come out of.
        const own = ownerOf.get(p);
        if (!own || own.at !== 'home' || own.prop === null || p.mode !== 'home' || !own.door || own.door.node !== route.nodes[0]) return;
        if (!mayRide(p, route, goal, time, own)) return;
        take(own, p);
        own.ride = true;
        return;
      }
      // In hand already: running from trouble, they lay it down here and go.
      if (trouble(goal) || p.raider) {
        lay(b, p, p.node);
        return;
      }
      b.ride = mayRide(p, route, goal, time, b);
      b.mounted = false;
      b.pause = 0;
    },
    started(p, walk) {
      const b = handOf(p);
      if (!b) return;
      b.mounted = false;
      b.judged.clear();
      // Wheeled across the first cell (the doorstep's, or where it stood) and the last.
      const first = walk[0]!.node, last = walk[walk.length - 1]!.node;
      let from = walk.length, to = -1;
      for (let i = 0; i < walk.length; i++) {
        if (walk[i]!.kind === 'move' && walk[i]!.node !== first) {
          from = i;
          break;
        }
      }
      for (let i = walk.length - 1; i >= 0; i--) {
        if (walk[i]!.kind === 'move' && walk[i]!.node !== last) {
          to = i;
          break;
        }
      }
      b.fromEnd = walk.length - from;
      b.toEnd = walk.length - to;
    },
    pace(p, dt) {
      const b = handOf(p);
      if (!b) return 1;
      const walk = p.walk;
      if (!walk || p.mode !== 'walk') {
        b.mounted = false;
        b.v = 1;
        return 1;
      }
      const i = p.at;
      judge(p, b, walk);
      if (b.pause > 0) {
        b.pause = Math.max(0, b.pause - dt);
        return 0;
      }
      if (!b.mounted) {
        b.v = 1;
        return 1;
      }
      // Riding: slower into a turn (this piece's, or the next one's when it is close), and to a walk before
      // getting off.
      const piece = walk[i]!;
      const left = (1 - p.t) * piece.length;
      let want = BIKE.speed * bendKeep(piece);
      const nextPiece = walk[i + 1];
      if (left < BIKE.slowAt) {
        if (!nextPiece || !(i + 1 <= index(p, b.toEnd) && rideable(p, b, walk, i + 1))) want = Math.min(want, 1);
        else want = Math.min(want, BIKE.speed * bendKeep(nextPiece));
      }
      b.v += (want - b.v) * Math.min(1, dt * BIKE.ease);
      b.v = Math.max(0.4, b.v);
      return b.v;
    },
    mounted(p) {
      return handOf(p)?.mounted === true;
    },
    entered(p, goal) {
      const b = handOf(p);
      const walk = p.walk;
      if (!b || !walk || !nav || p.mode !== 'walk') return;
      // Off before a flight or a crowd, from the very step they reach it.
      judge(p, b, walk);
      if (!goal || goal.door || p.at !== index(p, b.toEnd) + 1) return;
      const piece = walk[p.at]!, before = walk[p.at - 1];
      if (!before || piece.kind !== 'move' || (goal.seat < 0 && nav.nodes[piece.node]!.clutter !== true)) return;
      // Where they crossed into the cell, back a little into the one they left, and off to the side of the way.
      const dx = piece.cx - piece.x0, dz = piece.cz - piece.z0, len = Math.hypot(dx, dz) || 1;
      const fx = dx / len, fz = dz / len;
      const c = nodeCentre(nav, before.node);
      const x = Math.max(c.x - 0.38, Math.min(c.x + 0.38, piece.x0 - fx * 0.2 - fz * 0.3));
      const z = Math.max(c.z - 0.38, Math.min(c.z + 0.38, piece.z0 - fz * 0.2 + fx * 0.3));
      rest(b, 'parked', { kind: 'stand', x, z, heading: Math.atan2(fx, fz) }, before.node);
    },
    arrive(p, goal) {
      const b = handOf(p);
      if (!b) return;
      b.mounted = false;
      // Home: back on its wall (if it is still drawn there).
      if (goal.kind === 'home' && b.prop !== null && b.door && goal.door?.feature === b.door.feature) {
        b.at = 'home';
        b.rest = null;
        b.node = -1;
        b.ride = false;
        b.tries = 0;
        return;
      }
      park(b, p, goal);
      // Leaving town (their house is gone): it is left here.
      if (goal.kind === 'leave') setOwner(b, null);
    },
    drop(p, node) {
      const b = handOf(p);
      if (!b) return;
      lay(b, p, node ?? p.node);
    },
    gone(p) {
      const b = ownerOf.get(p);
      if (!b) return;
      if (b.at === 'ridden') {
        if (p.node >= 0) rest(b, 'parked', { kind: 'stand', x: p.x, z: p.z, heading: p.heading }, p.node);
        else lay(b, p, -1);
      }
      setOwner(b, null);
    },
  };
}

/** The node nearest a world point (as the crowd's nearestNode), or −1. */
function nearestNode(nav: NavGraph, x: number, y: number, z: number): number {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < nav.nodes.length; i++) {
    const n = nav.nodes[i]!;
    if (n.rot !== undefined || n.passage !== undefined) continue;
    const dx = keyX(n.cell) + 0.5 - x, dz = keyZ(n.cell) + 0.5 - z, dy = (keyY(n.cell) * 0.8 - y) * 1.5;
    const d = dx * dx + dz * dz + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
