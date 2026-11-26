// The working waterfront (2026-11-26, Derek: "a harbour town, fishing
// village etc. should get both the shipyard and the container ship ports"):
//
//   port      a container port (R-D00): a plain rectangle of docks against a
//             straight stretch of shore, 4 deep where the sea allows (3 at
//             least) and 10 or more long so a freighter fits its berth, open
//             sea off its face and a clear way out to the edge of the map; a
//             street along its back and warehouses behind it. The rules make
//             it a port and fit it out (cranes, containers, an office); the
//             planner only lays the docks.
//   shipyard  a shipyard (R-D05): docks 3 wide running 8 (else 7, 6) straight
//             out from the shore, open water down both sides and past the end
//             with a way out to sea, and a warehouse (the timber shed) behind
//             its land end across the harbour street.
//
// Each piece's frame faces the sea: land at v ≤ 0, water from v = 1.

import { columnIndex, key } from '@/core/grid';
import { CLAIM, type Grower } from '../grower';
import { search, type Frame } from '../frame';
import { fromSquare, Local, rectFlat, rectFree, startDistrict, type Town } from '../town';
import { pave } from '../route';

/** Open water with no block at sea level, not kept clear for something else, not a river. */
function sea(town: Town, x: number, z: number): boolean {
  const { g } = town;
  return g.inMap(x, z) && g.h(x, z) === 0 && !g.world.blocks.has(key(x, 0, z)) && !g.claimed(x, z, CLAIM.keep) && !town.site.river[columnIndex(x, z)];
}
/** A block at sea level beside (x, z): docks touching would merge into one. */
function seaBlockBeside(g: Grower, x: number, z: number): boolean {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (g.inMap(x + dx, z + dz) && g.world.blocks.has(key(x + dx, 0, z + dz))) return true;
  return false;
}
/** Shore at deck level that nothing uses yet. */
function shore(g: Grower, x: number, z: number): boolean {
  return g.inMap(x, z) && g.h(x, z) === 1 && g.free(x, z) && !g.groundTaken(x, z);
}
/** No river within two of the local rectangle: a house by a river is a watermill (R-H16), not a store. */
function dryOf(town: Town, f: Frame, u0: number, v0: number, u1: number, v1: number): boolean {
  for (let v = v0 - 2; v <= v1 + 2; v++) {
    for (let u = u0 - 2; u <= u1 + 2; u++) {
      const x = f.x(u, v), z = f.z(u, v);
      if (town.g.inMap(x, z) && town.site.river[columnIndex(x, z)]) return false;
    }
  }
  return true;
}
/** Straight out from (u, v) to the edge of the map, all open sea. */
function laneOut(town: Town, f: Frame, u: number, v: number): boolean {
  for (let k = v; ; k++) {
    const x = f.x(u, k), z = f.z(u, k);
    if (!town.g.inMap(x, z)) return true;
    if (!sea(town, x, z)) return false;
  }
}
/** Where the town's waterfront is: the harbour if it has one, else the square. */
function anchorOf(town: Town): [number, number] {
  const h = town.districts.find((d) => d.name === 'harbour');
  if (h) return [h.x, h.z];
  return town.square ? [town.square.x, town.square.z] : [town.site.centre[0], town.site.centre[1]];
}

export interface PortOptions {
  /** Lengths along the shore to try, longest first, and depths out from it. */
  lens: readonly number[];
  depths: readonly number[];
  /** Warehouses behind it. */
  stores: number;
  /** At most this many steps from the square (a market town's port supplies its shops). */
  reach?: number;
  /** Open sea this far along the face past one end, for a freighter to line up in. */
  lineUp?: number;
}

/**
 * A container port: see the top of the file. Its rectangle is `depth` rows out from the shore (v = 0 to
 * depth − 1): the rows past the first are all docks; the first is a dock where it is sea (the street
 * behind it, v = −1, on land) and is left as it is where the shore juts out into it (land at deck level),
 * as R-D00 allows, so a port fits a coast that is not quite straight.
 */
export function buildPort(town: Town, name: string, opts: PortOptions): boolean {
  const { g } = town;
  const anchor = anchorOf(town);
  for (const len of opts.lens) {
    for (const depth of opts.depths) {
      const found = search(g, `${name}-${len}-${depth}`, (f) => {
        let gaps = 0;
        for (let u = 0; u < len; u++) {
          const x = f.x(u, 0), z = f.z(u, 0);
          if (shore(g, x, z)) {
            gaps++;
            continue;
          }
          if (!sea(town, x, z)) return null;
          const bx = f.x(u, -1), bz = f.z(u, -1);
          if (!g.inMap(bx, bz) || g.h(bx, bz) !== 1 || !g.free(bx, bz)) return null;
        }
        if (gaps * 2 > len) return null;
        // The docks, sea off the face, and no other dock touching (they would merge).
        for (let v = 1; v <= depth + 2; v++) for (let u = 0; u < len; u++) if (!sea(town, f.x(u, v), f.z(u, v))) return null;
        for (let v = depth; v <= depth + 2; v++) for (const u of [-1, len]) if (!sea(town, f.x(u, v), f.z(u, v))) return null;
        for (let v = 0; v <= depth; v++) {
          for (const u of [-1, len]) {
            const x = f.x(u, v), z = f.z(u, v);
            if (!g.inMap(x, z) || g.world.blocks.has(key(x, 0, z)) || (g.h(x, z) === 0 && seaBlockBeside(g, x, z))) return null;
          }
        }
        for (let u = 0; u < len; u++) if (seaBlockBeside(g, f.x(u, depth), f.z(u, depth))) return null;
        // A freighter comes in from the edge of the map, lining up along the quay from astern of its berth:
        // open sea along the face past one end (for a long port), and straight out to the edge.
        if (opts.lineUp) {
          const clear = (u0: number, u1: number): boolean => {
            for (let v = depth; v <= depth + 2; v++) for (let u = u0; u <= u1; u++) if (!sea(town, f.x(u, v), f.z(u, v))) return false;
            return true;
          };
          if (!clear(len, len + opts.lineUp) && !clear(-1 - opts.lineUp, -1)) return null;
        }
        for (const u of [1, len >> 1, len - 2]) if (!laneOut(town, f, u, depth + 3)) return null;
        const mid: [number, number] = [f.x(len >> 1, 0), f.z(len >> 1, 0)];
        const sq = fromSquare(town, mid[0], mid[1]);
        if (opts.reach !== undefined && sq > opts.reach) return null;
        const d = Math.abs(mid[0] - anchor[0]) + Math.abs(mid[1] - anchor[1]);
        // Near the waterfront, but its own stretch of it; the fewer gaps the better.
        return { score: Math.abs(d - 9) * 0.5 + sq * 0.15 + gaps, data: null };
      });
      if (!found) continue;
      const f = found.frame;
      const L = new Local(g, f);
      const d = startDistrict(town, name, f.x(len >> 1, 0), f.z(len >> 1, 0));
      // The street along its back (on the shore where it juts in), then the docks.
      for (let u = -1; u <= len; u++) {
        const land0 = g.h(f.x(u, 0), f.z(u, 0)) > 0;
        if (u >= 0 && u < len && land0) pave(g, f.x(u, 0), f.z(u, 0));
        if (g.h(f.x(u, -1), f.z(u, -1)) > 0 && g.free(f.x(u, -1), f.z(u, -1))) pave(g, f.x(u, -1), f.z(u, -1));
      }
      L.claim(0, -1, len - 1, depth, CLAIM.built);
      L.claim(-1, depth + 1, len, depth + 2, CLAIM.keep);
      for (let v = 0; v < depth; v++) for (let u = 0; u < len; u++) if (g.h(f.x(u, v), f.z(u, v)) === 0) L.put('dock', u, 0, v, 'auto');
      // Warehouses behind the street, facing the port across it.
      let stores = 0;
      for (let u = 0; u + 2 < len && stores < opts.stores; u += 4) {
        if (!rectFree(g, f, u, -3, u + 2, -2) || rectFlat(g, f, u, -3, u + 2, -2) < 0) continue;
        if (g.h(f.x(u, -1), f.z(u, -1)) !== rectFlat(g, f, u, -3, u + 2, -2) || !dryOf(town, f, u, -3, u + 2, -2)) continue;
        L.claim(u, -3, u + 2, -2, CLAIM.built);
        L.house(u, -3, u + 2, -2, 2, `${name}-store${u}`);
        stores++;
      }
      for (let u = 0; u < len; u++) {
        const v = g.h(f.x(u, 0), f.z(u, 0)) > 0 ? 0 : -1;
        if (g.h(f.x(u, v), f.z(u, v)) > 0) L.way(d, u, v);
      }
      d.anyWay = true;
      return true;
    }
  }
  return false;
}

/** A shipyard: see the top of the file. `lens` are the slip's lengths to try, longest first. */
export function buildShipyard(town: Town, name: string, lens: readonly number[] = [8, 7, 6]): boolean {
  const { g } = town;
  const anchor = anchorOf(town);
  for (const len of lens) {
    const found = search(g, `${name}-${len}`, (f) => {
      // The land end against the shore, the harbour street behind it, the timber shed behind that.
      for (let u = 0; u <= 2; u++) if (!shore(g, f.x(u, 0), f.z(u, 0))) return null;
      for (let u = -1; u <= 3; u++) {
        const x = f.x(u, -1), z = f.z(u, -1);
        if (!g.inMap(x, z) || g.h(x, z) === 0 || !g.free(x, z)) return null;
      }
      if (!rectFree(g, f, 0, -3, 2, -2) || rectFlat(g, f, 0, -3, 2, -2) < 1) return null;
      if (g.h(f.x(1, -1), f.z(1, -1)) !== rectFlat(g, f, 0, -3, 2, -2) || !dryOf(town, f, 0, -3, 2, -2)) return null;
      // Straight out: open sea down both sides and past the end, nothing at sea level touching it.
      for (let v = 1; v <= len + 2; v++) for (let u = -1; u <= 3; u++) if (!sea(town, f.x(u, v), f.z(u, v))) return null;
      for (let v = 1; v <= len + 2; v++) for (const u of [-1, 3]) if (seaBlockBeside(g, f.x(u, v), f.z(u, v))) return null;
      for (let u = 0; u <= 2; u++) if (seaBlockBeside(g, f.x(u, len + 1), f.z(u, len + 1))) return null;
      // The new ship sails out to sea.
      if (!laneOut(town, f, 1, len + 3)) return null;
      const d = Math.abs(f.x(1, 0) - anchor[0]) + Math.abs(f.z(1, 0) - anchor[1]);
      if (d < 4) return null;
      return { score: d + fromSquare(town, f.x(1, 0), f.z(1, 0)) * 0.1, data: null };
    });
    if (!found) continue;
    const f = found.frame;
    const L = new Local(g, f);
    const d = startDistrict(town, name, f.x(1, 0), f.z(1, 0));
    for (let u = -1; u <= 3; u++) pave(g, f.x(u, -1), f.z(u, -1));
    for (let u = 0; u <= 2; u++) pave(g, f.x(u, 0), f.z(u, 0));
    L.claim(-1, -3, 3, len + 1, CLAIM.built);
    L.claim(-1, len + 2, 3, len + 3, CLAIM.keep);
    for (let v = 1; v <= len; v++) for (let u = 0; u <= 2; u++) L.put('dock', u, 0, v, 'auto');
    L.house(0, -3, 2, -2, 2, `${name}-shed`);
    L.way(d, 1, -1);
    return true;
  }
  return false;
}
