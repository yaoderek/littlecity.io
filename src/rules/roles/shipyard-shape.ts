// The shipyard's shape (R-D05), shared by its rules (R-D05, D29, L75): a
// dock exactly 3 cells wide running SHIPYARD.slipMin+ cells straight out from
// the shore, its land end against the shore, its sea end and long sides on
// open water, nothing standing on its middle column, and open water past its
// end for the launch. The middle column is the slip; the side columns the
// working decks. Not a rule file.
//
// It must not take over a dock somebody built for something else: a quay
// runs ALONG the shore (R-D01 needs 4+ cells in a row there; a shipyard's
// land end is 3), a pier is 1 wide, a port (R-D00) is wider along the shore
// than out from it. The shed (a warehouse or a barn by the land end) is the
// other half of the test, in R-D05.

import { DIR4, keyX, keyY, keyZ, opposite, turn, type CellKey, type Dir4 } from '@/core/grid';
import type { ShapePlan, StructureId } from '@/resolve/plan';
import { SHIPYARD } from '@/style/shipyard';
import { deckTaken, dockSide, freeWater, isShore, type DockBase } from './dock-shape';

export type YardShip = 'cog' | 'galleon';

export interface YardShape {
  /** The middle column, the slip: from the land end out to sea. */
  slip: CellKey[];
  /** The two side columns, each from the land end out: on the slip's left and right looking out to sea. */
  left: CellKey[];
  right: CellKey[];
  /** The way out to sea along the slip. */
  seaward: Dir4;
  /** What the slip builds: the longer slips build galleons. */
  ship: YardShip;
}

/** A dock of this shape, or null. Reads only terrain, kinds and the dock's own cells. */
export function yardShape(f: DockBase, cells: readonly CellKey[]): YardShape | null {
  const len = cells.length / 3;
  if (!Number.isInteger(len) || len < SHIPYARD.slipMin) return null;
  let x0 = 99, x1 = -1, z0 = 99, z1 = -1;
  for (const c of cells) {
    if (keyY(c) !== 0) return null;
    x0 = Math.min(x0, keyX(c));
    x1 = Math.max(x1, keyX(c));
    z0 = Math.min(z0, keyZ(c));
    z1 = Math.max(z1, keyZ(c));
  }
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  // Cells are distinct, so a full count in a 3 × len box is the whole rectangle.
  const alongZ = w === 3 && d === len, alongX = d === 3 && w === len;
  if (!alongZ && !alongX) return null;
  const at = (along: number, across: number): CellKey => {
    const x = alongX ? x0 + along : x0 + across, z = alongX ? z0 + across : z0 + along;
    return cells.find((c) => keyX(c) === x && keyZ(c) === z)!;
  };
  const row = (along: number): CellKey[] => [0, 1, 2].map((k) => at(along, k));
  // Which end is the land end: all three against the shore (one at least on level ground), the other end all open.
  const back: Dir4 = alongX ? 3 : 0;
  const ends: { cells: CellKey[]; out: Dir4 }[] = [
    { cells: row(0), out: back },
    { cells: row(len - 1), out: opposite(back) },
  ];
  const landEnd = (e: { cells: CellKey[]; out: Dir4 }): boolean => e.cells.every((c) => isShore(dockSide(f, c, e.out))) && e.cells.some((c) => dockSide(f, c, e.out) === 'land');
  const seaEnd = (e: { cells: CellKey[]; out: Dir4 }): boolean => e.cells.every((c) => dockSide(f, c, e.out) === 'open');
  let fromLand: boolean;
  if (landEnd(ends[0]!) && seaEnd(ends[1]!)) fromLand = true;
  else if (landEnd(ends[1]!) && seaEnd(ends[0]!)) fromLand = false;
  else return null;
  const seaward: Dir4 = fromLand ? opposite(back) : back;
  const order = (k: number): CellKey[] => {
    const col: CellKey[] = [];
    for (let i = 0; i < len; i++) col.push(at(fromLand ? i : len - 1 - i, k));
    return col;
  };
  const cols = [order(0), order(1), order(2)];
  // Left and right looking out to sea: the left side lies a quarter turn anticlockwise of seaward.
  const leftDir = turn(seaward, 3);
  const [dx, dz] = DIR4[leftDir]!;
  const lowFirst = dx + dz < 0;
  const left = lowFirst ? cols[0]! : cols[2]!, right = lowFirst ? cols[2]! : cols[0]!;
  const slip = cols[1]!;
  // Straight out: past the land end, the long sides stand in open water.
  for (const [col, side] of [[left, leftDir], [right, opposite(leftDir)]] as const) {
    for (let i = 1; i < len; i++) if (dockSide(f, col[i]!, side) !== 'open') return null;
  }
  // Nothing on the slip.
  if (slip.some((c) => deckTaken(f, c))) return null;
  // Open water past the end to launch into: the three columns beyond it, and the next past the slip's.
  const [sx, sz] = DIR4[seaward]!;
  for (const c of [left[len - 1]!, slip[len - 1]!, right[len - 1]!]) if (!freeWater(f, keyX(c) + sx, keyZ(c) + sz)) return null;
  const end = slip[len - 1]!;
  if (!freeWater(f, keyX(end) + sx * 2, keyZ(end) + sz * 2)) return null;
  return { slip, left, right, seaward, ship: len >= SHIPYARD.galleonAt ? 'galleon' : 'cog' };
}

/** The roles a timber shed may have. */
const SHEDS: ReadonlySet<string> = new Set(['warehouse', 'barn']);

/**
 * The timber shed of a shipyard of this shape: the warehouse or barn with a cell nearest the land end
 * (within SHIPYARD.shedReach of one of its three cells, counting diagonals), lowest id on a tie; or null.
 */
export function shedOf(plan: Pick<ShapePlan, 'roles' | 'structures'>, yard: YardShape): StructureId | null {
  const land = [yard.left[0]!, yard.slip[0]!, yard.right[0]!];
  let best: StructureId | null = null;
  let bestD = Infinity;
  for (const [id, r] of plan.roles) {
    if (!SHEDS.has(r.role)) continue;
    const s = plan.structures.get(id);
    if (!s) continue;
    let d = Infinity;
    for (const c of s.cells) for (const l of land) d = Math.min(d, Math.max(Math.abs(keyX(c) - keyX(l)), Math.abs(keyZ(c) - keyZ(l))));
    if (d <= SHIPYARD.shedReach && (d < bestD || (d === bestD && best !== null && id < best))) {
      best = id;
      bestD = d;
    }
  }
  return best;
}
