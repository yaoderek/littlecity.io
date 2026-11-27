// Where a raid comes ashore, and how its ships get there (design section 13b,
// the raid). Pure: it reads the town (shape and walking graph) and nothing
// else, so the same town and the same seed always plan the same raid.
//
// THE SHORE. Every walkable cell at the water's level (a beach, a bank, a
// quay at sea level) with open sea beside it is a place a raider could wade
// in or climb out: a LANDING, with the way out to the water and the point
// in the shallows where a raider stands up out of the sea.
//
// THE LANDING RAID. A longship runs straight up onto a landing, bow on the
// sand: it needs a beach (sand best, a low bank will do) with a straight run
// of open water out from it, and a turning point a little way off where it
// can spin about under oars (a circle of clear water). It comes in from the
// edge of the map to the turning point (a route a whole hull can sail,
// ship-routes.ts), turns to face the shore and rows in; it leaves the same
// way backwards: rows astern to the turning point, spins, and sails off to
// an edge.
//
// THE BOATS RAID. No ship: two to four rowing boats, each with its own way in
// from beyond the edge of the map (all over the same water, the first one's)
// to a different landing round the town (spread out, so it is hit from more
// than one side), where it waits in the shallows, and its own way out over an
// edge. No clear circle is needed: a boat comes in bow first and turns about
// as it rows off.
//
// Which: a beach close to the town favours the landing; a rocky or built-up
// shore the boats; and chance.

import { columnIndex, DIR4, key, keyX, keyY, keyZ, SIZE_X, SIZE_Z, type CellKey } from '@/core/grid';
import { KINDS } from '@/core/kinds';
import { rand } from '@/core/rand';
import { BOAT, LONGSHIP } from '@/parts/raid/longship';
import type { NavGraph, ShapePlan } from '@/resolve/plan';
import { chaikin, edgePoints, graphFrom, mapEdge, obstacleColumns, pathClear, pathOf, routeTo, seaField, type HullSize, type Path, type Pt, type SeaField } from '@/rules/life/ship-routes';

export type RaidKind = 'landing' | 'boats';

/** A place on the shore a raider wades in at or climbs out of the sea at. */
export interface Landing {
  /** The walkable cell on the shore, and its node. */
  cell: CellKey;
  node: number;
  /** Its middle and its floor's height. */
  x: number;
  y: number;
  z: number;
  /** Unit vector from it out to the open water. */
  ox: number;
  oz: number;
  /** A beach (sand): a ship can run up on it. */
  sand: boolean;
  /** Walkable cells round it (5 by 5, a level either way): room for a band to come ashore and spread out. */
  open: number;
  /** Other landings beside it, where the rest of a band comes ashore (itself first). */
  near: Landing[];
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

/** A ship's way in and out. */
export interface Voyage {
  /** From beyond the edge of the map to the turning point. */
  arrive: Path;
  /** Where it turns about (the boats raid: the first boat's landing, for the camera). */
  turn: Pose;
  /** From the turning point back out beyond an edge. */
  leave: Path;
}

export interface RaidSite {
  kind: RaidKind;
  /** The middle of the town (where the houses are thickest). */
  heart: { x: number; z: number };
  /** The ship's size (1 the landing longship, more the big one) and its clearance hull. */
  size: number;
  hull: HullSize;
  voyage: Voyage;
  /** Landing raid: the pose it lies in beached, bow on the sand. */
  beached: Pose | null;
  /** Where the band comes ashore: one landing for a landing raid, two to four for the boats. */
  landings: Landing[];
  /** Boats raid: each boat's way in from beyond the edge of the map to its landing (and `boatWays`: in and out). */
  boatPaths: Path[];
  boatWays: { arrive: Path; leave: Path }[];
}

/** The clearance hull of a longship of this size. */
export function longshipHull(size: number): HullSize {
  return { stern: LONGSHIP.stern * size, bow: LONGSHIP.bow * size, halfBeam: LONGSHIP.halfBeam * size };
}
export const BOAT_HULL: HullSize = { stern: BOAT.stern, bow: BOAT.bow, halfBeam: BOAT.halfBeam };

/** The obstacle field the raid's ships plan with: land, everything built in the water, and `extra` columns (moored ships). */
export function raidField(shape: ShapePlan, extra: Iterable<number> = []): SeaField {
  const blocked = obstacleColumns(shape.terrain, shape.kinds);
  for (const c of extra) blocked[c] = 1;
  return seaField(blocked);
}

/** The middle of the town: the mean of its building cells, weighted to where they are thickest. */
export function townHeart(shape: ShapePlan): { x: number; z: number } | null {
  const cells: [number, number][] = [];
  for (const [c, k] of shape.kinds) if (KINDS[k as keyof typeof KINDS]?.building && keyY(c) <= 3) cells.push([keyX(c) + 0.5, keyZ(c) + 0.5]);
  if (cells.length === 0) return null;
  let mx = 0, mz = 0;
  for (const [x, z] of cells) {
    mx += x;
    mz += z;
  }
  mx /= cells.length;
  mz /= cells.length;
  // The building nearest the mean that has most others round it.
  let best = cells[0]!, score = -1;
  for (const [x, z] of cells) {
    let n = 0;
    for (const [x2, z2] of cells) if (Math.abs(x2 - x) + Math.abs(z2 - z) <= 6) n++;
    const s = n - Math.hypot(x - mx, z - mz) * 0.5;
    if (s > score) {
      score = s;
      best = [x, z];
    }
  }
  return { x: best[0], z: best[1] };
}

/** The walking graph's main part: the one with the most building doors on it. */
export function mainPart(nav: NavGraph): number {
  const count = new Map<number, number>();
  for (const d of nav.doors) if (d.node >= 0) count.set(nav.part[d.node]!, (count.get(nav.part[d.node]!) ?? 0) + 1);
  let best = -1, n = -1;
  for (const [p, c] of count) if (c > n || (c === n && p < best)) {
    best = p;
    n = c;
  }
  return best;
}

/** Every landing on the shore of the main part of the town. */
export function landingsOf(shape: ShapePlan, nav: NavGraph, field: SeaField): Landing[] {
  const part = mainPart(nav);
  const blocked = obstacleColumns(shape.terrain, shape.kinds);
  const out: Landing[] = [];
  nav.nodes.forEach((node, n) => {
    if (part >= 0 && nav.part[n] !== part) return;
    const c = node.cell;
    const x = keyX(c), y = keyY(c), z = keyZ(c);
    // At the water's level: the ground just above the sea, or a quay or dock at its foot.
    if (y > 1 || node.rot !== undefined || node.passage !== undefined || node.surface === 'roof' || node.surface === 'stairs') return;
    for (const [dx, dz] of DIR4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= SIZE_X - 1 || nz >= SIZE_Z - 1) continue;
      if (blocked[columnIndex(nx, nz)] === 1) continue;
      // Open water beyond it (not a pool or a ditch): a boat's width of sea a cell and two out.
      if (field.at(x + 0.5 + dx * 1.5, z + 0.5 + dz * 1.5) < 0.45 || field.at(x + 0.5 + dx * 2.5, z + 0.5 + dz * 2.5) < 0.6) continue;
      if (nav.nodeAt.has(key(nx, y, nz))) continue;
      out.push({ cell: c, node: n, x: x + 0.5, y: y * 0.8, z: z + 0.5, ox: dx, oz: dz, sand: node.surface === 'sand', open: openAround(nav, x, y, z), near: [] });
      break;
    }
  });
  for (const l of out) l.near = [l, ...out.filter((o) => o !== l && Math.hypot(o.x - l.x, o.z - l.z) < 2.6 && Math.abs(o.y - l.y) < 0.5)];
  return out;
}

function openAround(nav: NavGraph, x: number, y: number, z: number): number {
  let n = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (const dy of [0, 1, -1]) if (y + dy >= 0 && nav.nodeAt.has(key(x + dx, y + dy, z + dz))) {
    n++;
    break;
  }
  return n;
}

/** A circle of clear water round (x, z) a hull of this reach can spin in, well inside the map. */
function roomToTurn(field: SeaField, x: number, z: number, reach: number): boolean {
  return mapEdge(x, z) < -Math.min(reach, 3) - 0.5 && field.at(x, z) >= reach + 0.25;
}

/** Rounds a route's corners where the rounding stays clear; else leaves it as it is. */
function smooth(field: SeaField, pts: Pt[], r: number): Pt[] {
  for (const rounds of [3, 2, 1]) {
    const c = chaikin(pts, rounds);
    let ok = true;
    for (let i = 0; i + 1 < c.length && ok; i++) {
      const a = c[i]!, b = c[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t <= len && ok; t += 0.2) {
        const u = len > 0 ? t / len : 0;
        if (field.at(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u) < r * 0.9) ok = false;
      }
    }
    if (ok) return c;
  }
  return pts;
}

/**
 * Ways between the turning point and the edges of the map: in (from beyond an edge to the turning point) and
 * out (to beyond another edge, or the same if it must). Null if a hull cannot get there.
 */
export function voyageTo(field: SeaField, h: HullSize, turn: Pose, pick: number, from?: Pt): Voyage | null {
  const r = h.halfBeam + 0.22;
  const g = graphFrom(field, [turn.x, turn.z], r);
  const ends = edgePoints(field, 1.5, r).filter((e) => g.cost[columnIndex(Math.floor(e.x), Math.floor(e.z))]! < Infinity);
  if (ends.length === 0) return null;
  ends.sort((a, b) => g.cost[columnIndex(Math.floor(a.x), Math.floor(a.z))]! - g.cost[columnIndex(Math.floor(b.x), Math.floor(b.z))]! || a.side - b.side || a.x + a.z - b.x - b.z);
  const len = h.bow - h.stern;
  const out = len + 2.5;
  const way = (i: number, inbound: boolean): Path | null => {
    const e = ends[i]!;
    const ahead: Pt = [e.x + Math.sin(e.yaw) * 2.5, e.z + Math.cos(e.yaw) * 2.5];
    const route = routeTo(g, [turn.x, turn.z], ahead);
    if (!route) return null;
    const outside: Pt = [e.x - Math.sin(e.yaw) * out, e.z - Math.cos(e.yaw) * out];
    // From the turning point to the edge and beyond.
    const pts: Pt[] = [...route.slice(0, -1), [e.x, e.z], outside];
    const p = pathOf(smooth(field, pts, r));
    const rev = pathOf([...p.points].reverse());
    const path = inbound ? rev : p;
    if (!pathClear(field, h, path, 0.12, inbound ? out : 0, inbound ? path.length : Math.max(0, path.length - out))) {
      // A hull swept along it touches something: try again without the rounding.
      const raw = pathOf(inbound ? [...pts].reverse() : pts);
      return pathClear(field, h, raw, 0.06, inbound ? out : 0, inbound ? raw.length : Math.max(0, raw.length - out)) ? raw : null;
    }
    return path;
  };
  // Coming in beside another (a boat beside the first): the edge nearest where that one came in.
  if (from) ends.sort((a, b) => Math.hypot(a.x - from[0], a.z - from[1]) - Math.hypot(b.x - from[0], b.z - from[1]));
  const few = Math.min(ends.length, 4);
  const first = from ? 0 : Math.min(few - 1, Math.floor(pick * few));
  let arrive: Path | null = null, leave: Path | null = null;
  let inSide = -1;
  for (let k = 0; k < Math.min(ends.length, 6) && !arrive; k++) {
    const i = (first + k) % Math.min(ends.length, 6);
    arrive = way(i, true);
    if (arrive) inSide = ends[i]!.side;
  }
  if (!arrive) return null;
  // Out over another edge if there is one in reach (it does not leave the way it came), else the same.
  const order = ends.map((e, i) => i).sort((a, b) => (ends[a]!.side === inSide ? 1 : 0) - (ends[b]!.side === inSide ? 1 : 0) || a - b);
  for (const i of order.slice(0, 6)) {
    leave = way(i, false);
    if (leave) break;
  }
  if (!leave) return null;
  return { arrive, turn, leave };
}

export interface PlanOptions {
  /** Force a kind (the scenarios, the tests); otherwise chosen by the shore and by chance. */
  kind?: RaidKind;
  /**
   * Where the Raid tool was clicked: they land on the shore nearest it (a longship if there is a beach there,
   * rowing boats if not), coming in by the shortest clear way from the edge of the map. Without it (a raid on
   * its own) the site is chosen by how good it is, near the town.
   */
  near?: { x: number; z: number } | null;
  /** Columns to keep clear of (ships moored in the harbour, other raids' ships on the beach). */
  extra?: Iterable<number>;
  /** Other raids' landings now: none within 2.6 cells of one (a second ship lands beside the first). */
  avoid?: readonly { x: number; z: number }[];
}

/** Plans a raid on this town, or null if no ship can reach a shore near it. */
export function planRaid(shape: ShapePlan, nav: NavGraph, seed: number, opts: PlanOptions = {}): RaidSite | null {
  const heart = townHeart(shape);
  if (!heart) return null;
  const field = raidField(shape, opts.extra ?? []);
  const avoid = opts.avoid ?? [];
  const all = landingsOf(shape, nav, field);
  const clear = (gap: number): Landing[] => all.filter((l) => !avoid.some((a) => Math.hypot(a.x - l.x, a.z - l.z) < gap));
  const shore = clear(2.6);
  if (opts.near) {
    // Every shore near it taken by other parties: closer in beside them, rather than not at all.
    const site = planAt(field, shore, opts.near, opts.kind, seed) ?? (avoid.length ? planAt(field, clear(1.2), opts.near, opts.kind, seed) : null);
    return site ? { ...site, heart } : null;
  }
  if (shore.length === 0) return null;
  const focus = heart;
  const towns = (l: Landing): number => Math.hypot(l.x - heart.x, l.z - heart.z);
  const near = (l: Landing): number => Math.hypot(l.x - focus.x, l.z - focus.z);
  const landing = opts.kind !== 'boats' ? planLanding(field, shore, towns, near, seed) : null;
  const boats = opts.kind !== 'landing' ? planBoats(field, shore, towns, near, heart, seed) : null;
  // A beach near the town favours the landing; a rocky or built-up shore, the boats; and chance.
  const beach = landing && towns(landing.landings[0]!) < 12 ? 0.72 : 0.45;
  const kind: RaidKind | null = landing && boats ? (rand(seed, 'raid-kind') < beach ? 'landing' : 'boats') : landing ? 'landing' : boats ? 'boats' : null;
  if (!kind) return null;
  const site = kind === 'landing' ? landing! : boats!;
  return { ...site, heart };
}

type SiteFor = Omit<RaidSite, 'heart'>;

function planLanding(field: SeaField, shore: readonly Landing[], towns: (l: Landing) => number, near: (l: Landing) => number, seed: number): SiteFor | null {
  // Beaches first, then any low shore; nearest the town first, never far from it.
  const ranked = shore
    .filter((l) => towns(l) < 18)
    .map((l) => ({ l, score: near(l) + towns(l) * 0.5 + (l.sand ? 0 : 6) + Math.max(0, 16 - l.open) * 0.8 + (l.near.length < 2 ? 3 : 0) + rand(seed, 'landing', l.cell) * 2 }))
    .sort((a, b) => a.score - b.score || a.l.cell - b.l.cell);
  for (const { l } of ranked.slice(0, 40)) {
    const site = landingAt(field, l, rand(seed, 'voyage'));
    if (site) return site;
  }
  return null;
}

/** A longship run up on the shore at this landing, its way in and out (the most direct when `pick` is 0); or null. */
function landingAt(field: SeaField, l: Landing, pick: number): SiteFor | null {
  const size = 1;
  const h = longshipHull(size);
  const reach = Math.max(-h.stern, h.bow) + h.halfBeam * 0.5;
  {
    // Bow on the sand: the stem a little past the water's edge.
    const ex = l.x + l.ox * 0.5, ez = l.z + l.oz * 0.5;
    const yaw = Math.atan2(-l.ox, -l.oz);
    const bx = ex - Math.sin(yaw) * (h.bow - 0.45), bz = ez - Math.cos(yaw) * (h.bow - 0.45);
    // The hull from its stern to a little short of the bow lies in open water.
    let ok = true;
    for (let a = h.stern; a <= h.bow - 1.3 && ok; a += 0.3) {
      if (field.at(bx + Math.sin(yaw) * a, bz + Math.cos(yaw) * a) < h.halfBeam * 0.75) ok = false;
    }
    if (!ok) return null;
    // A turning point straight out, with room to spin.
    let turn: Pose | null = null;
    for (const d of [2.5, 3.5, 4.5, 6, 7.5, 9]) {
      const tx = bx + l.ox * d, tz = bz + l.oz * d;
      if (!roomToTurn(field, tx, tz, reach)) continue;
      // The straight run in from it is clear.
      let run = true;
      for (let s = 0; s <= d && run; s += 0.3) if (!hullClearish(field, h, bx + l.ox * s, bz + l.oz * s, yaw, s < 1.2)) run = false;
      if (run) {
        turn = { x: tx, z: tz, yaw };
        break;
      }
    }
    if (!turn) return null;
    const voyage = voyageTo(field, h, turn, pick);
    if (!voyage) return null;
    return { kind: 'landing', size, hull: h, voyage, beached: { x: bx, z: bz, yaw }, landings: [l], boatPaths: [], boatWays: [] };
  }
}

/**
 * The Raid tool's click: the shore nearest the point (on the sea, the shore nearest that water; inland, the
 * nearest coast). A longship where there is a beach to run up there, rowing boats where there is not (or the
 * kind asked for); if no vessel can reach the very nearest bit of shore, the nearest that one can. Each comes
 * in by the shortest clear way from the edge of the map, so it appears on the side that was clicked.
 */
function planAt(field: SeaField, shore: readonly Landing[], at: { x: number; z: number }, kind: RaidKind | undefined, seed: number): SiteFor | null {
  const d = (l: Landing): number => Math.hypot(l.x - at.x, l.z - at.z);
  const ranked = [...shore].sort((a, b) => d(a) - d(b) || a.cell - b.cell);
  for (const l of ranked.slice(0, 160)) {
    const beach = l.sand || l.near.some((n) => n.sand);
    if (kind !== 'boats' && (kind === 'landing' || beach)) {
      const site = landingAt(field, l, 0);
      if (site) return site;
      if (kind === 'landing') continue;
    }
    // Rowing boats: this landing first, then one or two beside it (a cell or more apart), all near the click.
    const pool = [l, ...ranked.filter((o) => o !== l && Math.hypot(o.x - l.x, o.z - l.z) < 7 && o.open >= 6).sort((a, b) => Math.hypot(a.x - l.x, a.z - l.z) - Math.hypot(b.x - l.x, b.z - l.z))];
    const site = boatsTo(field, pool, Math.min(3, Math.max(2, Math.round(2 + rand(seed, 'boats') * 1.2))), 2.5, 0, true);
    if (site) return site;
  }
  return null;
}

/** Fits, the bow allowed onto the shore when `beaching`. */
function hullClearish(field: SeaField, h: HullSize, x: number, z: number, yaw: number, beaching: boolean): boolean {
  const sx = Math.sin(yaw), cz = Math.cos(yaw);
  for (let a = h.stern; a <= h.bow - (beaching ? 1.3 : 0.4); a += 0.3) if (field.at(x + sx * a, z + cz * a) < h.halfBeam * 0.75) return false;
  return true;
}

function planBoats(field: SeaField, shore: readonly Landing[], towns: (l: Landing) => number, near: (l: Landing) => number, _heart: { x: number; z: number }, seed: number): SiteFor | null {
  // Landings round the town, spread out: the nearest one first, then each the farthest from those taken.
  const pool = shore.filter((l) => towns(l) < 14 && l.open >= 9).sort((a, b) => near(a) + Math.max(0, 16 - a.open) * 0.5 - near(b) - Math.max(0, 16 - b.open) * 0.5 || a.cell - b.cell);
  if (pool.length === 0) return null;
  const want = Math.min(4, Math.max(2, Math.round(2 + rand(seed, 'boats') * 2.2)));
  return boatsTo(field, pool, want, 4, rand(seed, 'voyage'), false);
}

/** Boats to up to `want` landings from `pool` in its order, `apart` cells apart at least (the first required when `first`). */
function boatsTo(field: SeaField, pool: readonly Landing[], want: number, apart: number, pick: number, first: boolean): SiteFor | null {
  const kept: Landing[] = [];
  const ways: { arrive: Path; leave: Path }[] = [];
  // Each boat its own way in from beyond the edge of the map to its landing, and out again: no ship stands off.
  const tryOne = (l: Landing): boolean => {
    const lead: Pt = [l.x + l.ox * 2.2, l.z + l.oz * 2.2];
    const shallows: Pt = [l.x + l.ox * 1.05, l.z + l.oz * 1.05];
    if (field.at(lead[0], lead[1]) < BOAT_HULL.halfBeam + 0.25) return false;
    // The first picks its edge; the rest come in over the same water beside it (a little fleet, not boats from everywhere).
    const first = ways[0]?.arrive.points[0];
    const v = voyageTo(field, BOAT_HULL, { x: lead[0], z: lead[1], yaw: Math.atan2(-l.ox, -l.oz) }, pick, first ? [first[0], first[1]] : undefined);
    if (!v) return false;
    ways.push({ arrive: pathOf([...v.arrive.points, shallows]), leave: pathOf([shallows, ...v.leave.points]) });
    kept.push(l);
    return true;
  };
  for (const l of pool) {
    if (kept.length >= want) break;
    if (kept.some((c) => Math.hypot(c.x - l.x, c.z - l.z) < apart)) continue;
    if (!tryOne(l) && first && kept.length === 0) return null;
  }
  if (kept.length === 0) return null;
  return { kind: 'boats', size: 1, hull: BOAT_HULL, voyage: { arrive: ways[0]!.arrive, turn: { x: kept[0]!.x, z: kept[0]!.z, yaw: 0 }, leave: ways[0]!.leave }, beached: null, landings: kept, boatPaths: ways.map((w) => w.arrive), boatWays: ways };
}
