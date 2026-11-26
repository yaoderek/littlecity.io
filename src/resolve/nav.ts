// The walking graph (design section 13). Owner: People (Stage 3).
//
// Called by the engine after the decoration and urban rules and before the
// life rules, so life rules can read it as `ctx.dressing.nav`. Pure: the same
// shape plan gives the same graph, node for node.
//
// NODES are the cells a person can stand in:
//   - a cell directly above a walkable top (the terrain top of a land
//     column, a dock, arch or marble block, or a house block whose roof is a
//     flat terrace) that is empty or holds only a floor;
//   - a stairs cell;
//   - a ground arch (an arch block standing on a walkable top), crossed only
//     along its passage (J15);
//   - a cell fence or wall that J20 made a gate, crossed only along the way
//     through;
//   - a bandstand's floor (R-M11 'pavilion-floor': the foot cells of its
//     pillars, up on its plinth), entered only through its open bay.
// A cell holding a tree, fountain, stall, windmill or a plain cell fence or
// wall is not a node: people walk round it.
//
// LINKS:
//   walk      two nodes side by side at one level, unless an edge piece
//             stands between them;
//   gate      the same through an edge piece or cell piece J20 made a gate,
//             or into a bandstand through its open bay (its rail closes the
//             other sides, so it is never a short cut);
//   stairs    from a stairs cell to the cell at its head, one level up. The
//             foot of a flight is a plain 'walk' link from the cell on its
//             low side;
//   steps     the two path cells either side of carved terrain steps (J17);
//   interior  every pair of doors of one building, and the hatch of its roof
//             terrace: through the building, 1 second per storey, hidden.
//
// A one-level step in the ground with no carved steps is not linked, nor is
// anything else the list above does not name.

import {
  above,
  below,
  columnIndex,
  E,
  edgeOf,
  key,
  keyY,
  neighbor,
  NO_CELL,
  opposite,
  S,
  SIZE_X,
  SIZE_Y,
  SIZE_Z,
  type CellKey,
  type Dir4,
  type EdgeKey,
} from '@/core/grid';
import type { Kind } from '@/core/kinds';
import { MAT } from '@/core/world';
import { NAV } from '@/style/people';
import type { DressingDraft } from './engine/api';
import { roofRegions } from './facts/roofs.fact';
import {
  EMPTY_NAV,
  type NavDoor,
  type NavGraph,
  type NavLink,
  type NavNode,
  type NavRun,
  type NavSurface,
  type ShapePlan,
  type StructureId,
} from './plan';

/**
 * How a decoration prop standing at a floor slot of a walkable cell is treated. Props are not blocks,
 * so nothing in the saved world says they are in the way; this table does. (Props on sockets and on
 * lines hang on walls or overhead and are ignored.)
 *
 *   centre  'clutter'  something solid in the middle of the cell: the node stays, dearer, and is
 *                      crossed to one side (never removed: a crate on a one-wide pier must not cut
 *                      the pier end off)
 *   edge    'cut'      a run along that side (a fence, a hedge, a retaining wall): no link across it
 *           'gate'     a way through such a run: a single-file link
 *           'steer'    a post in the middle of that side: the link stays; walkers cross to one side
 *           'block'    something wide on that side (a bench, a net rack): the link stays but costs
 *                      NAV.clutter more, so it is used only when there is no other way (only a real
 *                      run may cut a place off: a rack across the foot of a pier must not)
 *
 * Corner slots are clear of every line people walk and are ignored. A type not listed is a small
 * solid thing: clutter at the centre, steer at an edge.
 */
type Footprint = { centre?: 'clutter'; edge?: 'cut' | 'gate' | 'steer' | 'block' };
const FLAT: Footprint = {};
const POST: Footprint = { centre: 'clutter', edge: 'steer' };
const BULK: Footprint = { centre: 'clutter', edge: 'block' };
const RUN: Footprint = { edge: 'cut' };
const WAY: Footprint = { edge: 'gate' };
const FOOTPRINTS: Readonly<Record<string, Footprint>> = {
  // Underfoot or on the wall: walked over or past.
  tuft: FLAT, 'beach-find': FLAT, 'worn-track': FLAT, 'dirt-trail': FLAT, reeds: FLAT, 'lily-pads': FLAT, creeper: FLAT, doorstep: FLAT,
  // Runs along a side, and the ways through them.
  'garden-fence': RUN, 'garden-fence/gate': WAY, hedge: RUN, 'hedge/gap': WAY, 'retaining-wall': RUN, espalier: RUN,
  // Wide things: they fill a side, or the middle of a cell.
  bench: BULK, 'cafe-table': BULK, 'flower-bed': BULK, 'net-rack': BULK, trough: BULK, shed: BULK, woodpile: BULK, 'wall-fountain': BULK,
  'street-tree': BULK, 'goods-stack': BULK, cart: BULK, kiosk: BULK, grazer: BULK, 'veg-patch': BULK, 'role-prop/net': BULK,
  // The fill builder's (disc1-fill): flat things underfoot, a gate in a hedge, and wide things.
  sward: FLAT, paving: FLAT, 'bleaching-sheet': FLAT, 'hedge/wild': RUN, 'field-gate': WAY,
  'wall-booth': BULK, 'store-door': BULK, 'niche-bench': BULK, stable: BULK, hay: BULK, compost: BULK, 'drying-line': BULK, pergola: BULK,
  'market-cross': BULK, 'stepping-stones': BULK,
  // The kerb along a shipyard's slip (D29): nobody walks under the ship.
  'slip-rail': RUN,
};
function footprintOf(type: string, variant: string | undefined): Footprint {
  return (variant !== undefined ? FOOTPRINTS[`${type}/${variant}`] : undefined) ?? FOOTPRINTS[type] ?? POST;
}
const EDGE_SLOT: Readonly<Record<string, Dir4 | undefined>> = { n: 0, e: 1, s: 2, w: 3 };

/** The kinds whose top can be walked on as it is. A house top is walkable only where its roof is a flat terrace. */
const DECK_KINDS: ReadonlySet<Kind> = new Set<Kind>(['dock', 'arch', 'marble']);

/** The node at the other end of a link. */
export function otherEnd(link: NavLink, node: number): number {
  return link.a === node ? link.b : link.a;
}

/** True when a route exists between two nodes. */
export function connected(nav: NavGraph, a: number, b: number): boolean {
  return a >= 0 && b >= 0 && nav.part[a] === nav.part[b];
}

/** The usable doors of a building (those that open onto a node), main door first. */
export function usableDoors(nav: NavGraph, structure: StructureId): NavDoor[] {
  const out: NavDoor[] = [];
  for (const i of nav.doorsOf.get(structure) ?? []) {
    const d = nav.doors[i]!;
    if (d.node >= 0) out.push(d);
  }
  return out.sort((a, b) => Number(b.main) - Number(a.main));
}

export function buildNav(shape: ShapePlan, draft: DressingDraft): NavGraph {
  const { world, terrain, kinds } = shape;

  // ── what the decoration and urban rules stood in the way ───────────────
  const cluttered = new Set<CellKey>();
  /** Per edge: 2 = cut, 1 = a gate, 4 = something wide, 3 = a post. A cut wins over a gate, a gate over the rest. */
  const propEdges = new Map<EdgeKey, 1 | 2 | 3 | 4>();
  for (const p of draft.props) {
    if (!('cell' in p.at)) continue;
    const foot = footprintOf(p.type, p.variant);
    if (p.at.pos === 'c') {
      if (foot.centre) cluttered.add(p.at.cell);
      continue;
    }
    const side = EDGE_SLOT[p.at.pos];
    if (side === undefined || !foot.edge) continue;
    const e = edgeOf(p.at.cell, side);
    if (e === NO_CELL) continue;
    const had = propEdges.get(e);
    const now = foot.edge === 'cut' ? 2 : foot.edge === 'gate' ? 1 : foot.edge === 'block' ? 4 : 3;
    if (had === undefined || now === 2 || (now === 1 && had !== 2) || (now === 4 && had === 3)) propEdges.set(e, now);
  }

  // ── what the shape rules decided ──────────────────────────────────────
  /** House cells whose top is a flat terrace. */
  const terrace = new Set<CellKey>();
  const terraceRegions: { structure: StructureId; cells: readonly CellKey[] }[] = [];
  const gateCells = new Map<CellKey, Dir4>();
  const gateEdges = new Set<EdgeKey>();
  const archPassage = new Map<CellKey, Dir4>();
  const trails = new Set<CellKey>();
  const steps: { cell: CellKey; dir: Dir4 }[] = [];
  const doorFeatures: ShapePlan['features'][number][] = [];
  const pavilionFloors: ShapePlan['features'][number][] = [];
  let regions: ReturnType<typeof roofRegions> | null = null;
  for (const f of shape.features) {
    switch (f.type) {
      case 'roof': {
        if (f.variant !== 'flat' || f.region === undefined) break;
        regions ??= roofRegions(shape.facts);
        const region = regions.byStructure.get(f.structure)?.find((r) => r.index === f.region);
        if (!region) break;
        const pierced = new Set(region.pierced);
        const cells = region.cells.filter((c) => !pierced.has(c));
        for (const c of cells) terrace.add(c);
        terraceRegions.push({ structure: f.structure, cells });
        break;
      }
      case 'gate':
        if (f.cell !== undefined && f.dir !== undefined) gateCells.set(f.cell, f.dir);
        else if (f.edge !== undefined) gateEdges.add(f.edge);
        break;
      case 'arch-opening': {
        if (f.cell === undefined || f.dir === undefined) break;
        // The opening must cover the middle of the cell, or the way through is a pier.
        const p = (f.params ?? {}) as { lo?: number; hi?: number; lo2?: number; hi2?: number };
        const open = (lo?: number, hi?: number): boolean => lo !== undefined && hi !== undefined && lo <= 0.35 && hi >= 0.65;
        if (open(p.lo, p.hi) || open(p.lo2, p.hi2)) archPassage.set(f.cell, f.dir);
        break;
      }
      case 'trail':
        if (f.cell !== undefined) trails.add(f.cell);
        break;
      case 'terrain-steps':
        if (f.cell !== undefined && f.dir !== undefined) steps.push({ cell: f.cell, dir: f.dir });
        break;
      case 'door':
        doorFeatures.push(f);
        break;
      case 'pavilion-floor':
        if (f.cell !== undefined) pavilionFloors.push(f);
        break;
      default:
    }
  }

  const heightAt = (c: CellKey): number => terrain.height[columnIndex(c & 63, (c >> 6) & 63)]!;
  /** The top of this cell can be stood on. */
  const walkableTop = (c: CellKey): boolean => {
    if (c === NO_CELL) return false;
    const h = heightAt(c);
    const y = keyY(c);
    if (y < h) return y === h - 1;
    const k = kinds.get(c);
    return k !== undefined && (DECK_KINDS.has(k) || (k === 'house' && terrace.has(c)));
  };

  // ── nodes ─────────────────────────────────────────────────────────────
  const found = new Map<CellKey, NavNode>();
  const surfaceOn = (c: CellKey): NavSurface => {
    const floor = world.floors.get(c);
    // A playing field is walked like a garden: open ground, a little dearer than a street.
    if (floor) return floor === 'field' ? 'garden' : floor;
    if (trails.has(c)) return 'trail';
    const under = below(c);
    if (under !== NO_CELL && keyY(under) < heightAt(under)) {
      return terrain.material[columnIndex(c & 63, (c >> 6) & 63)] === MAT.sand ? 'sand' : 'grass';
    }
    return under !== NO_CELL && kinds.get(under) === 'house' ? 'roof' : 'deck';
  };
  const node = (cell: CellKey, surface: NavSurface, extra?: Partial<NavNode>): void => {
    const clutter = cluttered.has(cell);
    found.set(cell, { cell, surface, cost: NAV[surface] + (clutter ? NAV.clutter : 0), ...(clutter ? { clutter } : {}), ...extra });
  };
  /** A cell directly above a walkable top: a node if nothing but a floor (or a gate) is in it. */
  const stand = (c: CellKey): void => {
    if (c === NO_CELL || found.has(c)) return;
    const k = kinds.get(c);
    if (k === undefined) node(c, surfaceOn(c));
    else if (k === 'fence' || k === 'wall') {
      const passage = gateCells.get(c);
      if (passage !== undefined) node(c, surfaceOn(c), { passage });
    }
    // stairs and arches are added from the block loop; anything else is in the way
  };
  for (let z = 0; z < SIZE_Z; z++) {
    for (let x = 0; x < SIZE_X; x++) {
      const h = terrain.height[columnIndex(x, z)]!;
      if (h > 0 && h < SIZE_Y) stand(key(x, h, z));
    }
  }
  for (const f of pavilionFloors) {
    const lift = ((f.params ?? {}) as { lift?: number }).lift ?? 0;
    node(f.cell!, 'deck', { lift, pavilion: f.structure, ...(f.dir !== undefined ? { entry: f.dir as Dir4 } : {}) });
  }
  for (const [c, k] of kinds) {
    if (k === 'stairs') {
      node(c, 'stairs', { rot: (world.blocks.get(c)?.rot ?? 0) as Dir4 });
      continue;
    }
    if (k === 'arch') {
      const passage = archPassage.get(c);
      const under = below(c);
      if (passage !== undefined && under !== NO_CELL && walkableTop(under)) node(c, surfaceOn(c), { passage });
    }
    if (DECK_KINDS.has(k) || (k === 'house' && terrace.has(c))) stand(above(c));
  }

  if (found.size === 0) return EMPTY_NAV;
  const nodes = [...found.values()].sort((a, b) => a.cell - b.cell);
  const nodeAt = new Map<CellKey, number>();
  for (let i = 0; i < nodes.length; i++) nodeAt.set(nodes[i]!.cell, i);
  const at = (c: CellKey): number => (c === NO_CELL ? -1 : (nodeAt.get(c) ?? -1));

  // ── links ─────────────────────────────────────────────────────────────
  const links: NavLink[] = [];
  /** Can a person step out of (or into) node `n` across its side `d`? */
  const opens = (n: NavNode, d: Dir4): boolean => {
    if (n.rot !== undefined) return d === opposite(n.rot); // a flight is entered at its foot
    if (n.passage !== undefined) return (d & 1) === (n.passage & 1);
    return true;
  };
  /** 0 = nothing between, 1 = a gate, 2 = an edge piece in the way. */
  const edgeBetween = (c: CellKey, d: Dir4): 0 | 1 | 2 => {
    const e = edgeOf(c, d);
    if (e === NO_CELL || !world.edges.has(e)) return 0;
    return gateEdges.has(e) ? 1 : 2;
  };
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    for (const d of [E, S] as const) {
      const j = at(neighbor(n.cell, d));
      if (j < 0) continue;
      const m = nodes[j]!;
      let edge: 0 | 1 | 2 | 3 | 4 = edgeBetween(n.cell, d);
      if (edge === 0) {
        // A prop on this side. A run of them never closes a street or a square: where both cells lie on
        // one floor region it is taken for a post.
        const prop = propEdges.get(edgeOf(n.cell, d)) ?? 0;
        const oneFloor = shape.floorAt.get(n.cell) !== undefined && shape.floorAt.get(n.cell) === shape.floorAt.get(m.cell);
        edge = prop === 2 && oneFloor ? 3 : prop;
      }
      if (edge === 2) continue;
      // A bandstand's floor: open to its own floor, and out only across its way in.
      if (n.pavilion !== undefined || m.pavilion !== undefined) {
        if (n.pavilion === m.pavilion) {
          links.push({ a: i, b: j, via: 'walk', cost: 0 });
          continue;
        }
        const inside = n.pavilion !== undefined ? n : m;
        const out = inside === n ? d : opposite(d);
        if (inside.entry !== out || (n.pavilion !== undefined && m.pavilion !== undefined)) continue;
        if (!opens(inside === n ? m : n, opposite(out))) continue;
        links.push({ a: i, b: j, via: 'gate', cost: NAV.gate });
        continue;
      }
      // Two cells of one wide flight, side by side.
      const sameFlight = n.rot !== undefined && m.rot === n.rot && (d & 1) !== (n.rot & 1);
      if (!sameFlight && !(opens(n, d) && opens(m, opposite(d)))) continue;
      const gate = edge === 1 || (n.passage !== undefined && kinds.get(n.cell) !== 'arch') || (m.passage !== undefined && kinds.get(m.cell) !== 'arch');
      links.push({ a: i, b: j, via: gate ? 'gate' : 'walk', cost: gate ? NAV.gate : edge === 4 ? NAV.clutter : 0, ...(edge >= 3 ? { post: true } : {}) });
    }
    if (n.rot !== undefined) {
      // The head of the flight: the cell ahead, one level up.
      const ahead = neighbor(n.cell, n.rot);
      const head = ahead === NO_CELL ? NO_CELL : above(ahead);
      const j = at(head);
      if (j >= 0) {
        const m = nodes[j]!;
        const back = opposite(n.rot);
        const ok = m.rot !== undefined ? m.rot === n.rot : opens(m, back) && edgeBetween(head, back) !== 2;
        if (ok) links.push({ a: i, b: j, via: 'stairs', cost: 0 });
      }
    }
  }
  for (const s of steps) {
    const up = neighbor(s.cell, s.dir);
    const i = at(s.cell), j = at(up === NO_CELL ? NO_CELL : above(up));
    if (i < 0 || j < 0) continue;
    if (!opens(nodes[i]!, s.dir) || !opens(nodes[j]!, opposite(s.dir))) continue;
    links.push({ a: i, b: j, via: 'steps', cost: NAV.steps });
  }

  // ── doors, hatches and the way through a building ─────────────────────
  const doors: NavDoor[] = [];
  for (const f of doorFeatures) {
    if (f.cell === undefined) continue;
    const params = (f.params ?? {}) as { main?: number; steps?: number };
    const socket = shape.socketsByOwner.get(f.id)?.find((s) => s.type === 'door')?.id;
    const door: NavDoor = {
      structure: f.structure,
      cell: f.cell,
      dir: f.dir,
      node: -1,
      feature: f.id,
      ...(socket !== undefined ? { socket } : {}),
      main: params.main === 1,
      hatch: f.variant === 'hatch' || f.dir === undefined,
      drop: 0,
    };
    if (door.hatch) {
      // A hatch names the terrace cell, or the roof cell under it.
      door.node = at(shape.structureAt.get(f.cell) === f.structure ? above(f.cell) : f.cell);
      delete door.dir;
    } else {
      const out = neighbor(f.cell, f.dir!);
      if (out !== NO_CELL && edgeBetween(f.cell, f.dir!) !== 2) {
        const level = at(out);
        if (level >= 0) {
          if (opens(nodes[level]!, opposite(f.dir!))) door.node = level;
        } else {
          const under = at(below(out));
          if (under >= 0) {
            const n = nodes[under]!;
            // A flight climbing straight to the door (J07), or a stoop down to the ground (J08).
            if (n.rot !== undefined) {
              if (n.rot === opposite(f.dir!)) door.node = under;
            } else if (n.passage === undefined && (params.steps ?? 0) > 0) {
              door.node = under;
              door.drop = 1;
            }
          }
        }
      }
    }
    doors.push(door);
  }
  // A terrace no door opens onto is reached by a hatch from inside (the vocabulary's door/hatch; no rule
  // emits one yet, so the graph derives it: the terrace cell with the lowest key).
  for (const region of terraceRegions) {
    if (shape.structures.get(region.structure)?.kind !== 'house') continue;
    const cells = region.cells.map((c) => above(c)).filter((c) => at(c) >= 0);
    if (cells.length === 0) continue;
    const onIt = new Set(cells.map((c) => at(c)));
    if (doors.some((d) => d.structure === region.structure && onIt.has(d.node))) continue;
    const cell = cells.reduce((a, b) => Math.min(a, b));
    doors.push({ structure: region.structure, cell, node: at(cell), feature: `hatch@${cell}`, main: false, hatch: true, drop: 0 });
  }
  const doorsOf = new Map<StructureId, number[]>();
  for (let i = 0; i < doors.length; i++) {
    const list = doorsOf.get(doors[i]!.structure);
    if (list) list.push(i);
    else doorsOf.set(doors[i]!.structure, [i]);
  }
  for (const [structure, list] of [...doorsOf].sort((a, b) => a[0] - b[0])) {
    const usable = list.filter((i) => doors[i]!.node >= 0);
    for (let p = 0; p < usable.length; p++) {
      for (let q = p + 1; q < usable.length; q++) {
        const da = doors[usable[p]!]!, db = doors[usable[q]!]!;
        if (da.node === db.node) continue;
        const seconds = Math.max(1, Math.abs(keyY(da.cell) - keyY(db.cell))) * NAV.interiorSeconds;
        links.push({ a: da.node, b: db.node, via: 'interior', cost: seconds * NAV.interiorCost, structure, seconds, doorA: usable[p]!, doorB: usable[q]! });
      }
    }
  }

  // ── adjacency ─────────────────────────────────────────────────────────
  const linkStart = new Int32Array(nodes.length + 1);
  for (const l of links) {
    linkStart[l.a + 1]!++;
    linkStart[l.b + 1]!++;
  }
  for (let i = 0; i < nodes.length; i++) linkStart[i + 1]! += linkStart[i]!;
  const linkOf = new Int32Array(links.length * 2);
  const fill = linkStart.slice(0, nodes.length);
  for (let l = 0; l < links.length; l++) {
    linkOf[fill[links[l]!.a]!++] = l;
    linkOf[fill[links[l]!.b]!++] = l;
  }

  // ── connected parts ───────────────────────────────────────────────────
  const part = new Int32Array(nodes.length).fill(-1);
  const floorCounts: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (part[i] !== -1) continue;
    const id = floorCounts.length;
    let floors = 0;
    part[i] = id;
    stack.push(i);
    while (stack.length > 0) {
      const n = stack.pop()!;
      const s = nodes[n]!.surface;
      if (s === 'path' || s === 'plaza' || s === 'garden') floors++;
      for (let k = linkStart[n]!; k < linkStart[n + 1]!; k++) {
        const o = otherEnd(links[linkOf[k]!]!, n);
        if (part[o] === -1) {
          part[o] = id;
          stack.push(o);
        }
      }
    }
    floorCounts.push(floors);
  }

  // ── single-file runs ──────────────────────────────────────────────────
  // A node only one person wide: a stairs cell with no flight beside it, a gate cell, a ground arch.
  const narrow = new Uint8Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.passage !== undefined) narrow[i] = 1;
    else if (n.rot !== undefined) {
      const beside = (d: Dir4): boolean => {
        const j = at(neighbor(n.cell, d));
        return j >= 0 && nodes[j]!.rot === n.rot;
      };
      narrow[i] = beside(((n.rot + 1) & 3) as Dir4) || beside(((n.rot + 3) & 3) as Dir4) ? 0 : 1;
    }
  }
  const runOf = new Int32Array(links.length).fill(-1);
  const runs: NavRun[] = [];
  const single = (l: NavLink): boolean => l.via !== 'interior' && (l.via === 'steps' || l.via === 'gate' || narrow[l.a] === 1 || narrow[l.b] === 1);
  for (let l = 0; l < links.length; l++) {
    if (runOf[l] !== -1 || !single(links[l]!)) continue;
    const id = runs.length;
    const members: number[] = [];
    const ends = new Set<number>();
    const queue = [l];
    runOf[l] = id;
    while (queue.length > 0) {
      const cur = queue.pop()!;
      members.push(cur);
      for (const n of [links[cur]!.a, links[cur]!.b]) {
        if (!narrow[n]) {
          ends.add(n);
          continue;
        }
        for (let k = linkStart[n]!; k < linkStart[n + 1]!; k++) {
          const o = linkOf[k]!;
          if (runOf[o] === -1 && single(links[o]!)) {
            runOf[o] = id;
            queue.push(o);
          }
        }
      }
    }
    runs.push({ id, links: members.sort((a, b) => a - b), ends: [...ends].sort((a, b) => a - b) });
  }

  return { nodes, links, nodeAt, linkStart, linkOf, doors, doorsOf, part, partFloors: Int32Array.from(floorCounts), runs, runOf };
}
