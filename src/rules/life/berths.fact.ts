// Berths for the big ships (catalogue "Boats and ships": fit is the only test).
//
// A BERTH is a straight run of quay: dock cells at sea level, or quay-wall
// marble (R-M05) at level 0 or 1, all with open water on the same side for
// SHIPS.berthWater columns out (a quick sieve). Open water here means no
// land and nothing built in the column at any height (a bridge would catch
// a mast).
//
// A big ship FITS a berth if there is quay enough to make fast to along its
// hull, its hull lies clear alongside, and a whole hull can sail in from an
// edge of the map, line up and come alongside, and leave again: checked by
// sailing it (ship-routes.ts). There are no other conditions: no count of
// docks, no lighthouse. A long quay is split into several berths end to end.
// The HARBOUR is every big ship that fits each berth, up to SHIPS.shipsMax
// berths (a performance cap), longest first.
// Small boats are not kept out: they share the quay, and row aside when a
// big ship comes in to their stretch.
//
// EDGE WATER is the open water a boat could reach from the edge of the map:
// a boat may moor only where it could have come in.
//
// Dressing stage only (it reads the quay walls' roles from the finished
// shape). Pure; computed once per resolve.

import { columnIndex, DIR4, inColumnBounds, key, keyX, keyY, keyZ, SIZE_X, SIZE_Z, type Dir4 } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineFact, type Facts } from '@/resolve/facts/api';
import { socketsOfType } from '@/resolve/facts/plan-index.fact';
import { SHIPS } from '@/style/ships';
import { portColumn, portPlanOfStructure } from '../roles/port-shape';
import { hullClear as hullClearAt, mooringAt, obstacleColumns, planArrival, planDeparture, seaField, type HullSize, type Mooring, type Pt, type SeaField } from './ship-routes';

export type BigShip = 'galleon' | 'cog' | 'galley' | 'freighter';

export interface Berth {
  /** Stable name: first quay column, the way the run goes, the water side. */
  key: string;
  /** The first quay column of the run (west- or north-most). */
  x: number;
  z: number;
  /** The way the run goes (E or S) and the side the water is on. */
  along: Dir4;
  out: Dir4;
  cells: number;
  /** The quay's face, in world units: from (ax, az), `len` along (dx, dz); the water toward (ox, oz). */
  face: { ax: number; az: number; dx: number; dz: number; len: number; ox: number; oz: number };
  /** The level people stand on along it (a dock's deck is level 1). */
  level: number;
  /** Columns of water it needs (column indices). */
  water: number[];
  /** L38-F: the port (R-D00) whose seaward face it is, if it is one: cargo ships call only here. */
  port?: number;
}

export interface ShipPlan {
  ship: BigShip;
  berth: Berth;
  /** Bow along the run (+1) or against it (−1). */
  dir: 1 | -1;
  mooring: Mooring;
  /** The ways it sails in and out (the lead ship's at a berth), for small boats to wait out of. */
  lanes: readonly Pt[][];
}

export interface Harbour {
  berths: readonly Berth[];
  /** Every big ship that fits at each of the longest few berths, longest berth first, biggest ship first. */
  plans: readonly ShipPlan[];
}

/** The hull each ship keeps clear with (its drawn hull plus a little; see rig.ts). */
export function hullSize(ship: BigShip | 'barge'): HullSize {
  switch (ship) {
    case 'galleon':
      return { stern: -2.85, bow: 3.55, halfBeam: SHIPS.galleonBeam / 2 };
    case 'cog':
      return { stern: -1.8, bow: 2.1, halfBeam: SHIPS.cogBeam / 2 };
    case 'galley':
      return { stern: -3.15, bow: 3.3, halfBeam: SHIPS.galleyBeam / 2 + 0.17 };
    case 'freighter':
      // Its rig's numbers (src/parts/actors/ships/freighter-rig.ts; a test keeps them equal).
      return { stern: -4.61, bow: 4.73, halfBeam: 0.92 };
    default:
      return { stern: -1.65, bow: 1.62, halfBeam: SHIPS.bargeBeam / 2 };
  }
}

/** A berth on a long quay is this many cells (a galleon's length), and the last at least this many (a cog's). */
const SLOT = 7;
const SLOT_MIN = 4;
/** A port's quay is split for cargo ships: a berth a cargo ship long and a bit, the last at least one long. */
const PORT_SLOT = 12;
const PORT_SLOT_MIN = 10;

/** The columns of every port's seaward row, with the port and the side its water is on (dressing stage only). */
function portFaces(f: Facts): Map<number, { port: number; side: Dir4 }> {
  const out = new Map<number, { port: number; side: Dir4 }>();
  if (!f.shapeReady) return out;
  for (const [id, r] of f.shape.roles) {
    if (r.role !== 'port') continue;
    const pp = portPlanOfStructure(f.shape, id);
    if (!pp) continue;
    for (let i = 0; i < pp.port.length; i++) {
      const [x, z] = portColumn(pp.port, i, pp.port.depth - 1);
      out.set(columnIndex(x, z), { port: id, side: pp.port.seaward });
    }
  }
  return out;
}

/** Quay columns: a dock at sea level, or a quay wall's low cell. Value: the level people stand on (+1), 0 if none. */
function quayColumns(f: Facts): Uint8Array {
  const q = new Uint8Array(SIZE_X * SIZE_Z);
  for (const [c, k] of f.kinds) {
    if (k === 'dock' && keyY(c) === 0) q[columnIndex(keyX(c), keyZ(c))] = 2;
  }
  if (f.shapeReady) {
    for (const [id, r] of f.shape.roles) {
      if (r.role !== 'quay-wall') continue;
      const s = f.structures.get(id);
      if (!s) continue;
      for (const c of s.cells) {
        if (keyY(c) > 1 || f.kinds.has(key(keyX(c), keyY(c) + 1, keyZ(c)))) continue;
        const i = columnIndex(keyX(c), keyZ(c));
        q[i] = Math.max(q[i]!, keyY(c) + 2);
      }
    }
    // A shipyard's docks are its slip and its working decks (R-D05): no ship berths alongside them.
    for (const [id, r] of f.shape.roles) {
      if (r.role !== 'shipyard') continue;
      for (const c of f.structures.get(id)?.cells ?? []) q[columnIndex(keyX(c), keyZ(c))] = 0;
    }
  }
  return q;
}

/** Every berth in the town, longest first. */
export function findBerths(f: Facts): Berth[] {
  const quay = quayColumns(f);
  const ports = portFaces(f);
  const blocked = obstacleColumns(f.terrain, f.kinds);
  const W = Math.max(1, Math.round(SHIPS.berthWater));
  const clear = (x: number, z: number): boolean => inColumnBounds(x, z) && blocked[columnIndex(x, z)] === 0;
  const out: Berth[] = [];
  for (const side of [0, 1, 2, 3] as Dir4[]) {
    const [ox, oz] = DIR4[side]!;
    const along: Dir4 = side === 0 || side === 2 ? 1 : 2;
    const [ax, az] = DIR4[along]!;
    const wet = (x: number, z: number): boolean => {
      for (let k = 1; k <= W; k++) if (!clear(x + ox * k, z + oz * k)) return false;
      return true;
    };
    const lines = along === 1 ? SIZE_Z : SIZE_X;
    const span = along === 1 ? SIZE_X : SIZE_Z;
    for (let l = 0; l < lines; l++) {
      const at = (p: number): [number, number] => (along === 1 ? [p, l] : [l, p]);
      let p = 0;
      while (p < span) {
        const [x, z] = at(p);
        if (!(quay[columnIndex(x, z)]! > 0 && wet(x, z))) {
          p++;
          continue;
        }
        let e = p;
        while (e + 1 < span) {
          const [nx, nz] = at(e + 1);
          if (quay[columnIndex(nx, nz)]! > 0 && wet(nx, nz)) e++;
          else break;
        }
        const next = e + 1;
        // One column of open water past each end, or the berth stops a cell short there.
        let i0 = p, i1 = e;
        const [bx, bz] = at(i0 - 1), [fx, fz] = at(i1 + 1);
        if (!(inColumnBounds(bx, bz) && wet(bx, bz))) i0++;
        if (!(inColumnBounds(fx, fz) && wet(fx, fz))) i1--;
        // A long quay holds several ships end to end: it is split into berths a galleon long with a cell's gap
        // between them, the last taking what is left (a cog's worth or more; less is added to the one before).
        // A port's face (all of the run along one port, its water this side) is split a cargo ship long.
        const port = (() => {
          let id: number | undefined;
          for (let q = i0; q <= i1; q++) {
            const [qx, qz] = at(q);
            const pf = ports.get(columnIndex(qx, qz));
            if (!pf || pf.side !== side || (id !== undefined && pf.port !== id)) return undefined;
            id = pf.port;
          }
          return id;
        })();
        const [slot, slotMin] = port !== undefined ? [PORT_SLOT, PORT_SLOT_MIN] : [SLOT, SLOT_MIN];
        const slots: [number, number][] = [];
        for (let a = i0, left = i1 - i0 + 1; left > 0; ) {
          if (left >= slot + 1 + slotMin) {
            slots.push([a, a + slot - 1]);
            a += slot + 1;
            left -= slot + 1;
          } else {
            slots.push([a, i1]);
            left = 0;
          }
        }
        for (const [s0, s1] of slots) {
          if (s1 - s0 + 1 < 3) continue;
          const [x0, z0] = at(s0);
          const water: number[] = [];
          for (let q = s0 - 1; q <= s1 + 1; q++) {
            const [qx, qz] = at(q);
            for (let k = 1; k <= W; k++) if (inColumnBounds(qx + ox * k, qz + oz * k)) water.push(columnIndex(qx + ox * k, qz + oz * k));
          }
          const len = s1 - s0 + 1;
          const fx0 = along === 1 ? x0 : side === 1 ? x0 + 1 : x0;
          const fz0 = along === 2 ? z0 : side === 2 ? z0 + 1 : z0;
          let level = 0;
          for (let q = s0; q <= s1; q++) {
            const [qx, qz] = at(q);
            level = Math.max(level, quay[columnIndex(qx, qz)]! - 1);
          }
          out.push({
            key: `${x0},${z0},${along},${side}`,
            x: x0,
            z: z0,
            along,
            out: side,
            cells: len,
            face: { ax: fx0, az: fz0, dx: ax, dz: az, len, ox, oz },
            level,
            water: [...new Set(water)].sort((a, b) => a - b),
            ...(port !== undefined ? { port } : {}),
          });
        }
        p = next;
      }
    }
  }
  out.sort((a, b) => b.cells - a.cells || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/**
 * The obstacles a ship sails round at a berth: the town, and the water off every mooring the small boats
 * may use (L17), except the berth's own (they keep out of it).
 */
export function planningField(f: Facts, berth: Berth | null, extra: Iterable<number> = []): SeaField {
  const blocked = obstacleColumns(f.terrain, f.kinds);
  const own = new Set(berth?.water ?? []);
  if (f.shapeReady) {
    for (const s of socketsOfType(f, 'mooring')) {
      if (s.dir === undefined) continue;
      const [dx, dz] = DIR4[s.dir]!;
      const x = keyX(s.cell) + dx, z = keyZ(s.cell) + dz;
      if (!inColumnBounds(x, z)) continue;
      const i = columnIndex(x, z);
      if (!own.has(i)) blocked[i] = 1;
    }
  }
  for (const i of extra) blocked[i] = 1;
  return seaField(blocked);
}

/** Margin a ship keeps from everything out at sea. */
export const SEA_MARGIN = 0.22;

/** Can this ship use this berth? The plan if so: which way it lies, checked by sailing in and out. */
export function planBerth(f: Facts, ship: BigShip, berth: Berth, field: SeaField = planningField(f, berth)): ShipPlan | null {
  const h = hullSize(ship);
  // It lies along the quay: there must be quay enough to make fast to (it may overhang a little at each end).
  if (h.bow - h.stern > berth.cells + 0.6) return null;
  const first: 1 | -1 = hash(f.seed, 'berth-dir', ship, berth.key) % 2 === 0 ? 1 : -1;
  for (const dir of [first, -first as 1 | -1]) {
    const m = mooringAt(h, berth.face, dir, SHIPS.alongside, SHIPS.warpGap);
    if (!mooredClear(field, h, m)) continue;
    const arrive = planArrival(field, h, m, SHIPS.edgeIn, SEA_MARGIN);
    if (!arrive) continue;
    const leave = planDeparture(field, h, m, SHIPS.edgeIn, SEA_MARGIN);
    if (!leave) continue;
    return { ship, berth, dir, mooring: m, lanes: [arrive.path.points, leave.path.points] };
  }
  return null;
}

/** A hull lying at its mooring (and at its warp point) touches nothing. */
export function mooredClear(field: SeaField, h: HullSize, m: Mooring): boolean {
  // Alongside, it lies close to the quay: a margin of half the gap it keeps.
  return hullClearAt(field, h, m.x, m.z, m.yaw, SHIPS.alongside * 0.5) && hullClearAt(field, h, m.wx, m.wz, m.yaw, 0.1);
}

/** The big ships, biggest first. */
export const BIG_SHIPS: readonly BigShip[] = ['galleon', 'galley', 'cog'];
/** At a port's berth a cargo ship first (L38-F): the old ships may still call there. */
export const PORT_SHIPS: readonly BigShip[] = ['freighter', ...BIG_SHIPS];

/** The last few harbours planned, by the sea they were planned on: an edit ashore changes nothing at sea. */
const PLANNED = new Map<string, ShipPlan[]>();

export const harbour = defineFact<Harbour>('harbour', (f) => {
  const berths = findBerths(f);
  if (!berths.length) return { berths, plans: [] };
  // One field for every berth: small boats' moorings in any berth's water are not in the way (they row aside).
  const own: Berth = { ...berths[0]!, water: [...new Set(berths.flatMap((b) => b.water))] };
  const field = planningField(f, own);
  let h = 2166136261;
  for (let i = 0; i < field.blocked.length; i++) h = Math.imul(h ^ field.blocked[i]!, 16777619);
  const key = `${f.seed}|${h >>> 0}|${berths.map((b) => `${b.key}/${b.cells}/${b.level}/${b.port ?? ''}`).join(';')}|${SHIPS.shipsMax}`;
  const cached = PLANNED.get(key);
  if (cached) return { berths, plans: cached.map((p) => ({ ...p, berth: berths.find((b) => b.key === p.berth.key)! })) };
  const plans: ShipPlan[] = [];
  let used = 0;
  for (const b of berths) {
    if (used >= Math.round(SHIPS.shipsMax)) break;
    // Sailed in and out with the biggest hull that fits; the smaller ships lie the same way. (Each visit is
    // planned again with its own hull when it sets out: harbour.system.ts.)
    let lead: ShipPlan | null = null;
    for (const ship of b.port !== undefined ? PORT_SHIPS : BIG_SHIPS) {
      if (!lead) {
        lead = planBerth(f, ship, b, field);
        if (lead) plans.push(lead);
      } else {
        const h2 = hullSize(ship);
        if (h2.bow - h2.stern > b.cells + 0.6) continue;
        const m = mooringAt(h2, b.face, lead.dir, SHIPS.alongside, SHIPS.warpGap);
        if (mooredClear(field, h2, m)) plans.push({ ship, berth: b, dir: lead.dir, mooring: m, lanes: lead.lanes });
      }
    }
    if (lead) used++;
  }
  PLANNED.set(key, plans);
  if (PLANNED.size > 6) PLANNED.delete(PLANNED.keys().next().value!);
  return { berths, plans };
});

/** A stretch of quay a big ship takes and the water off it: a hull from stern to bow, `half` wide. */
export interface Zone {
  x: number;
  z: number;
  hx: number;
  hz: number;
  stern: number;
  bow: number;
  half: number;
}

/** How far (x, z) lies outside a zone; negative inside. */
export function zoneGap(s: Zone, x: number, z: number): number {
  const dx = x - s.x, dz = z - s.z;
  const along = dx * s.hx + dz * s.hz;
  const across = Math.abs(-dx * s.hz + dz * s.hx);
  const a = Math.max(s.stern, Math.min(s.bow, along));
  return Math.hypot(along - a, across) - s.half;
}

/**
 * The stretches of quay big ships take and the water off them (L38–L40), as the harbour system marks them
 * for the small boats (src/life/ships/visit.ts): each planned ship's hull at its mooring and at its warp
 * point, 0.6 longer at each end and wider by the warp gap and half a column.
 */
export function berthZones(f: Facts): Zone[] {
  const out: Zone[] = [];
  for (const p of harbour(f).plans) {
    const h = hullSize(p.ship);
    const m = p.mooring;
    for (const [x, z] of [[m.x, m.z], [m.wx, m.wz]] as const) {
      out.push({ x, z, hx: Math.sin(m.yaw), hz: Math.cos(m.yaw), stern: h.stern - 0.6, bow: h.bow + 0.6, half: h.halfBeam + SHIPS.warpGap + 0.5 });
    }
  }
  return out;
}

/** Whether a point lies in the way a big ship sails in or out (its half beam and most of a column either side). */
export function shipLanes(f: Facts): (x: number, z: number) => boolean {
  const lanes = harbour(f).plans.flatMap((p) => p.lanes.map((points) => ({ points, half: hullSize(p.ship).halfBeam + 0.9 })));
  return (x, z) =>
    lanes.some(({ points, half }) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!, b = points[i]!;
        const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
        if (Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z) < half) return true;
      }
      return false;
    });
}

/**
 * Open water a boat can reach from the edge of the map (1 = reachable): a flood over open-water columns
 * (no land, nothing built at sea level) from every column on the map's edge. A boat may moor only where it
 * could have come in.
 */
export const edgeWater = defineFact<Uint8Array>('edgeWater', (f) => {
  const m = new Uint8Array(SIZE_X * SIZE_Z);
  const free = (x: number, z: number): boolean => inColumnBounds(x, z) && f.terrain.height[columnIndex(x, z)] === 0 && !f.kinds.has(key(x, 0, z));
  const stack: number[] = [];
  for (let i = 0; i < SIZE_X; i++) {
    for (const [x, z] of [[i, 0], [i, SIZE_Z - 1], [0, i], [SIZE_X - 1, i]] as const) {
      if (free(x, z) && !m[columnIndex(x, z)]) {
        m[columnIndex(x, z)] = 1;
        stack.push(columnIndex(x, z));
      }
    }
  }
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % SIZE_X, z = (c - x) / SIZE_X;
    for (const [dx, dz] of DIR4) {
      const ax = x + dx, az = z + dz;
      if (free(ax, az) && !m[columnIndex(ax, az)]) {
        m[columnIndex(ax, az)] = 1;
        stack.push(columnIndex(ax, az));
      }
    }
  }
  return m;
});
