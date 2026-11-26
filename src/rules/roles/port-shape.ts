// The port (R-D00, J23-P, D15-P and the port's life): when a dock is a
// container port, and where everything on it goes. Not a rule file; shared
// by the rules, the parts and src/life/port. Pure.
//
// A PORT is a dock whose cells fill a rectangle at least PORT.minDepth deep
// (out from the shore) and PORT.minLength long (along it), at sea level.
// One long side meets the shore (land, a cliff or a quay wall) along at
// least half its length; the other faces open water for SHIPS.berthWater
// columns all the way along. Gaps are allowed only on the inner row, and
// only where the shore itself juts out into it (that cell is land).
//
// Port coordinates: `i` along the shore (0 to length − 1), `r` rows out from
// it (0 against the land, depth − 1 on the water). The two seaward rows are
// the crane rows (rails, cranes, the way along); the rows behind are the
// yard (container stacks in blocks, with an aisle across every few cells).

import { columnIndex, DIR4, inColumnBounds, key, keyX, keyY, keyZ, opposite, turn, type CellKey, type Dir4 } from '@/core/grid';
import type { StructureId } from '@/resolve/plan';
import { PORT } from '@/style/port';
import { SHIPS } from '@/style/ships';
import { deckTaken, DIRS, dockSide, freeWater, isShore, type DockBase } from './dock-shape';

export interface Port {
  /** The side the shore is on, the side the water is on, and the way `i` counts. */
  landward: Dir4;
  seaward: Dir4;
  along: Dir4;
  /** The column of (i = 0, r = 0). */
  x0: number;
  z0: number;
  length: number;
  depth: number;
}

export interface PortRules {
  minLength: number;
  minDepth: number;
  /** Columns of open water off the seaward side, all the way along. */
  water: number;
}

/** The column of port cell (i, r). */
export function portColumn(p: Port, i: number, r: number): [number, number] {
  const [ax, az] = DIR4[p.along]!, [sx, sz] = DIR4[p.seaward]!;
  return [p.x0 + ax * i + sx * r, p.z0 + az * i + sz * r];
}

/** The dock cell (level 0) of port cell (i, r). */
export function portCell(p: Port, i: number, r: number): CellKey {
  const [x, z] = portColumn(p, i, r);
  return key(x, 0, z);
}

/**
 * A world point in port coordinates: `a` cells along from the i = 0 edge, `b` cells in from the seaward
 * face (the quay's edge on the water), at height y.
 */
export function portPoint(p: Port, a: number, b: number): [number, number] {
  const [ax, az] = DIR4[p.along]!, [sx, sz] = DIR4[p.seaward]!;
  // The corner of the rectangle at i = 0 on the seaward face.
  const [cx, cz] = portColumn(p, 0, p.depth - 1);
  const fx = cx + 0.5 + (sx * 0.5) - ax * 0.5, fz = cz + 0.5 + (sz * 0.5) - az * 0.5;
  return [fx + ax * a - sx * b, fz + az * a - sz * b];
}

/** Port coordinates (a, b) of a world point: the inverse of portPoint. */
export function portCoords(p: Port, x: number, z: number): [number, number] {
  const [ax, az] = DIR4[p.along]!, [sx, sz] = DIR4[p.seaward]!;
  const [fx, fz] = portPoint(p, 0, 0);
  const dx = x - fx, dz = z - fz;
  return [dx * ax + dz * az, -(dx * sx + dz * sz)];
}

/** The world yaw (atan2(x, z) convention) of a direction. */
export const yawOfDir = (d: Dir4): number => Math.atan2(DIR4[d]![0], DIR4[d]![1]);

/**
 * R-D00: is this dock a port, and which way does it lie? `quayWall` says whether a solid block in the
 * water beside it is a quay wall (R-M05), which counts as shore.
 */
export function portOf(f: DockBase, cells: readonly CellKey[], rules: PortRules, quayWall: (cell: CellKey) => boolean = () => false): Port | null {
  if (cells.length < rules.minLength * (rules.minDepth - 1)) return null;
  let x0 = 99, x1 = -1, z0 = 99, z1 = -1;
  for (const c of cells) {
    if (keyY(c) !== 0) return null;
    x0 = Math.min(x0, keyX(c));
    x1 = Math.max(x1, keyX(c));
    z0 = Math.min(z0, keyZ(c));
    z1 = Math.max(z1, keyZ(c));
  }
  const mine = new Set(cells);
  let best: Port | null = null;
  for (const landward of DIRS) {
    const seaward = opposite(landward);
    const alongX = landward === 0 || landward === 2;
    const along: Dir4 = alongX ? 1 : 2;
    const length = alongX ? x1 - x0 + 1 : z1 - z0 + 1;
    const depth = alongX ? z1 - z0 + 1 : x1 - x0 + 1;
    if (length < rules.minLength || depth < rules.minDepth) continue;
    // (i = 0, r = 0): the west- or north-most cell of the landward row.
    const ox = alongX ? x0 : landward === 3 ? x0 : x1;
    const oz = alongX ? (landward === 0 ? z0 : z1) : z0;
    const p: Port = { landward, seaward, along, x0: ox, z0: oz, length, depth };
    if (fits(f, p, mine, rules, quayWall) && (!best || length > best.length)) best = p;
  }
  return best;
}

function fits(f: DockBase, p: Port, mine: ReadonlySet<CellKey>, rules: PortRules, quayWall: (cell: CellKey) => boolean): boolean {
  let shore = 0;
  for (let i = 0; i < p.length; i++) {
    for (let r = 0; r < p.depth; r++) {
      const c = portCell(p, i, r);
      if (mine.has(c)) continue;
      // Only the inner row may have gaps, and only where the land itself comes out into it.
      if (r > 0) return false;
      const [x, z] = portColumn(p, i, r);
      if (!inColumnBounds(x, z) || f.terrain.height[columnIndex(x, z)]! < 1) return false;
    }
    // The landward edge of this column: the inner cell's land side, or (a gap) the land in the gap.
    const inner = portCell(p, i, 0);
    if (mine.has(inner)) {
      const side = dockSide(f, inner, p.landward);
      if (isShore(side) || (side === 'solid' && quayWall(neighborCell(inner, p.landward)))) shore++;
    } else shore++;
    // Open water off the seaward face.
    const [ox, oz] = portColumn(p, i, p.depth - 1);
    const [sx, sz] = DIR4[p.seaward]!;
    for (let k = 1; k <= rules.water; k++) if (!freeWater(f, ox + sx * k, oz + sz * k)) return false;
  }
  return shore * 2 >= p.length;
}

function neighborCell(c: CellKey, d: Dir4): CellKey {
  return key(keyX(c) + DIR4[d]![0], keyY(c), keyZ(c) + DIR4[d]![1]);
}

// ── the cranes ──────────────────────────────────────────────────────────

export type CraneKind = 'medium' | 'large';

/** How close (along) a large crane's middle may come to a medium crane's pivot. */
const MEDIUM_CLEAR = 3.3;

export interface CraneSpot {
  kind: CraneKind;
  /** Its home, cells along from the i = 0 edge (a large crane's middle; a medium crane's pivot). */
  at: number;
  /** How far along it may travel on its rails (a medium crane stands; lo = hi = at). */
  lo: number;
  hi: number;
}

/**
 * The cranes on a port of this length:
 *   6 to 9    one medium crane
 *   10 to 13  a large crane and a medium one
 *   14+       large and medium in turn, starting with a large, about one every six cells,
 *             four at most
 * Spread evenly along the quay; a large crane runs on its rails up to half-way to its neighbours.
 */
export function craneKinds(length: number): CraneKind[] {
  if (length < 6) return [];
  if (length <= 9) return ['medium'];
  if (length <= 13) return ['large', 'medium'];
  const n = Math.min(4, 2 * Math.floor(length / 6) - 1);
  return Array.from({ length: n }, (_, k) => (k % 2 === 0 ? 'large' : 'medium'));
}

export function cranesOf(length: number): CraneSpot[] {
  const kinds = craneKinds(length);
  const n = kinds.length;
  const at = kinds.map((_, k) => (n === 1 ? length / 2 : n === 2 ? length * (k === 0 ? 0.3 : 0.75) : (k + 0.5) * (length / n)));
  return kinds.map((kind, k) => {
    if (kind === 'medium') return { kind, at: at[k]!, lo: at[k]!, hi: at[k]! };
    // Clear of its neighbours: a medium crane's jib swings round its pivot.
    const lo = k === 0 ? 1.1 : at[k - 1]! + MEDIUM_CLEAR;
    const hi = k === n - 1 ? length - 1.1 : at[k + 1]! - MEDIUM_CLEAR;
    return { kind, at: at[k]!, lo: Math.min(lo, at[k]!), hi: Math.max(hi, at[k]!) };
  });
}

// ── the yard ────────────────────────────────────────────────────────────

export interface StackSpot {
  /** The first of its two cells along, and its row. */
  i: number;
  r: number;
  /** How high it may go: the unpacking bay takes one container, a stack three. */
  max: number;
  unpack?: boolean;
}

export interface Yard {
  stacks: StackSpot[];
  /** The harbour office, its cell; the aisle where unpacked goods are set down. */
  office: { i: number; r: number } | null;
  pile: { i: number; r: number } | null;
  /** Two tall floodlight masts: cells, and the corner of the cell they stand at (+1 / −1 along, in from the water). */
  masts: { i: number; r: number }[];
  /** The rows the stacks are in. */
  rows: number[];
}

/**
 * Where the stacks go. Containers are two cells long and lie along the quay, in the yard rows behind the
 * crane rows: blocks of two containers end to end with an aisle across between blocks (never more than
 * four cells without one), and the crane rows are the way along. The office, the unpacking bay and its
 * aisle are at the i = 0 end, in the yard row nearest the cranes that a crane's back reach still covers.
 */
export function yardOf(p: Port, taken: (i: number, r: number) => boolean = () => false): Yard {
  const rows: number[] = [];
  for (let r = p.depth - 3; r >= 0; r--) rows.push(r);
  const front = Math.max(0, p.depth - 4);
  const stacks: StackSpot[] = [];
  const free = (i: number, r: number, n: number): boolean => {
    for (let k = 0; k < n; k++) if (i + k >= p.length || taken(i + k, r)) return false;
    return true;
  };
  let office: Yard['office'] = null;
  let pile: Yard['pile'] = null;
  if (p.length >= 4 && free(0, front, 1) && free(1, front, 2) && free(3, front, 1)) {
    office = { i: 0, r: front };
    stacks.push({ i: 1, r: front, max: 1, unpack: true });
    pile = { i: 3, r: front };
  }
  for (const r of rows) {
    // Blocks of two containers end to end between the aisles across (i = 3, 8, 13, …).
    for (let i = 1; i + 1 < p.length; ) {
      if (aisleAt(i) || aisleAt(i + 1) || (office && r === front && i === 1)) {
        i += aisleAt(i) ? 1 : aisleAt(i + 1) ? 2 : 2;
        continue;
      }
      if (free(i, r, 2)) {
        stacks.push({ i, r, max: 3 });
        i += 2;
      } else i++;
    }
  }
  const masts: Yard['masts'] = [];
  if (pile) masts.push(pile);
  const lastAisle = (() => {
    for (let i = p.length - 1; i > 3; i--) if (aisleAt(i) && !taken(i, front)) return i;
    return -1;
  })();
  if (lastAisle > 0) masts.push({ i: lastAisle, r: front });
  else if (p.length >= 6 && !taken(p.length - 1, front) && !stacks.some((s) => s.r === front && s.i + 1 >= p.length - 1)) masts.push({ i: p.length - 1, r: front });
  return { stacks: stacks.sort((a, b) => a.r - b.r || a.i - b.i), office, pile, masts, rows };
}

/** The aisles across the yard. */
export const aisleAt = (i: number): boolean => i === 3 || (i > 3 && (i - 3) % 5 === 0);

/** The four directions as seen from a port: which Dir4 is along, back along, landward, seaward. */
export function portDirs(p: Port): { along: Dir4; back: Dir4; landward: Dir4; seaward: Dir4 } {
  return { along: p.along, back: turn(p.along, 2), landward: p.landward, seaward: p.seaward };
}

// ── everything at once ─────────────────────────────────────────────────

export interface PortPlan {
  port: Port;
  yard: Yard;
  cranes: CraneSpot[];
}

/**
 * The port a dock structure is (its role must already say so: pass `isPort`), with its yard and cranes,
 * keeping clear of anything built on its deck. Null if it is not a port.
 */
export function portPlanOf(f: DockBase, cells: readonly CellKey[], rules: PortRules, quayWall?: (cell: CellKey) => boolean): PortPlan | null {
  const port = portOf(f, cells, rules, quayWall);
  if (!port) return null;
  const taken = (i: number, r: number): boolean => deckTaken(f, portCell(port, i, r));
  const yard = yardOf(port, taken);
  const cranes = cranesOf(port.length).filter((c) => {
    const i = Math.floor(c.at);
    return [i - 1, i, i + 1].every((k) => k < 0 || k >= port.length || (!taken(k, port.depth - 1) && !taken(k, port.depth - 2)));
  });
  return { port, yard, cranes };
}

/** The port's numbers from the style (read when called, so the tuning panel's changes take). */
export function portRules(): PortRules {
  return { minLength: PORT.minLength, minDepth: PORT.minDepth, water: Math.max(1, Math.round(SHIPS.berthWater)) };
}

/** Quay walls by the roles a plan (or a plan being filled in) has given. */
export function quayWallsOf(plan: { structureAt: ReadonlyMap<CellKey, StructureId>; roles: ReadonlyMap<StructureId, { role: string }> }): (cell: CellKey) => boolean {
  return (cell) => {
    const id = plan.structureAt.get(cell);
    return id !== undefined && plan.roles.get(id)?.role === 'quay-wall';
  };
}

/** The plan of a structure the shape gave the role 'port' (null for anything else). */
export function portPlanOfStructure(plan: DockBase & { structureAt: ReadonlyMap<CellKey, StructureId>; roles: ReadonlyMap<StructureId, { role: string }>; structures: ReadonlyMap<StructureId, { cells: readonly CellKey[] }> }, id: StructureId): PortPlan | null {
  if (plan.roles.get(id)?.role !== 'port') return null;
  const s = plan.structures.get(id);
  return s ? portPlanOf(plan, s.cells, portRules(), quayWallsOf(plan)) : null;
}
