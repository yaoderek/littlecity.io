// The Almanac's clips (`npm run guide -- --clips`): each building's recipe town (entries.ts) taken apart
// into the taps a player would make, in an order that reads: the ground first (land shaped, then paths,
// plazas and gardens), then the blocks from the bottom up, each builder call finished before the next at
// the same height, the piece that makes the building as near the end as the rules allow. Pure: entries in,
// steps out; tools/guide/main.ts plays them on a fixed clock with the glove tapping each one.
//
// Never wrong (steps.test.ts): every building's steps, played in order, end in exactly the recipe's world,
// so the clip ends on the still's picture.

import { CELL_H, columnIndex, keyX, keyY, keyZ, SEA_Y, unedge, type CellKey } from '@/core/grid';
import type { Edit, Terrain, World } from '@/core/world';
import { resolveDressing, resolveShape } from '@/resolve/index';
import { TerrainBuilder, TownBuilder } from '@/scenario';
import { flatTerrain } from '@/scenario';
import { islandOf } from '@/terrain/land';
import { applyEdit, canApply, emptyWorld } from '@/world/world';
import type { GuideEntry } from './entries';
import { contentsOf, holds } from './proof';

/** One edit as the recipe made it, and where it sits. */
export interface Piece {
  edit: Edit;
  /** Which builder call made it (b.house(...) is one call): pieces of one call go down together. */
  group: number;
  /** Its place in the recipe. */
  index: number;
  /** Levels above the ground it stands on (shaping the land is -1: it goes first). */
  level: number;
  /** 0 ground cover (path, plaza, garden, field), 1 a block or an edge piece; the land is shaped before either. */
  cover: 0 | 1;
  /** The column (x, z) it stands in. */
  col: readonly [number, number];
  /** Where the glove's fingertip touches it: the top of the piece, world units. */
  at: readonly [number, number, number];
}

/** One tap of the glove: the edits it makes (one, or a short stroke of a long run). */
export interface ClipStep {
  edits: readonly Edit[];
  at: readonly [number, number, number];
}

export interface ClipPlan {
  /** The recipe's ground (before any land shaping: that is in the worlds). */
  terrain: Terrain;
  /** What stands from the first frame: the recipe's pieces that lie outside the picture (an entry's `frame`). */
  setting: World;
  steps: readonly ClipStep[];
  /** The index of the step that makes the building: its stars burst there. */
  formed: number;
  /** The recipe's own world: where the steps end. */
  final: World;
}

/** These pieces first (in the reading order), then the rest. */
const first = (pick: (p: Piece) => boolean) => (pieces: Piece[]): Piece[] => [...pieces.filter(pick), ...pieces.filter((p) => !pick(p))];
const isBlock = (p: Piece): boolean => p.edit.type === 'placeBlock';

/**
 * Hand orders, where the rule above reads wrong. Each takes the pieces in the reading order and returns
 * them in the order they go down.
 */
const HAND: Readonly<Record<string, (pieces: Piece[]) => Piece[]>> = {
  // The yard fenced first, then the little house beside it: the house makes the school (by the reading
  // order the first fence piece already did, and eleven more followed the stars).
  schoolhouse: first((p) => p.edit.type === 'placeEdge'),
  // The house, then the path laid past it: the lamps come with the fourth square.
  'street-lamps': first(isBlock),
  // The house the lane leads out of, then the lane.
  'country-lane': first(isBlock),
  // The chapel finished first (house and tower), then the garden beside it, then the wall that makes it a churchyard.
  churchyard: first(isBlock),
  // Dug in from the sea, a row at a time, so each new row fills from the water beside it (not a dry trench
  // that floods at the end); then the house, then the dock that brings the barge. (Most of the channel is
  // dug before the clip starts: PRESET.)
  'dug-river': (pieces) => {
    const land = pieces.filter((p) => p.edit.type === 'land').sort((a, b) => b.col[1] - a.col[1] || a.col[0] - b.col[0]);
    const house = pieces.filter((p) => p.edit.type === 'placeBlock' && p.edit.kind === 'house');
    const rest = pieces.filter((p) => !land.includes(p) && !house.includes(p));
    return [...land, ...house, ...rest];
  },
};

/**
 * Pieces that stand from the first frame although they are in the recipe's picture box, because the glove
 * would tap them out of sight: most of a dug river's channel (only its inland end, by the docks, is seen).
 */
const PRESET: Readonly<Record<string, (p: Piece) => boolean>> = {
  'dug-river': (p) => p.edit.type === 'land' && p.col[1] >= 14,
};

/** The entries ordered by hand. */
export const HAND_ORDERED: readonly string[] = [...new Set([...Object.keys(HAND), ...Object.keys(PRESET)])];

/** Taps at most in a clip: a longer recipe lays a few pieces a tap, as a drag does in the game. */
export const MAX_TAPS = 24;

/** The recipe's ground. */
export function recipeTerrain(entry: GuideEntry): Terrain {
  if (!entry.ground) return flatTerrain(entry.seed);
  const t = new TerrainBuilder(entry.seed);
  entry.ground(t);
  return t.build();
}

/**
 * Runs the recipe and writes down every edit it makes, with the builder call it came from. A block's
 * 'auto' colour is written down as the colour it took, so the edit makes the same block in any order.
 * Shaping the land is split into one edit a column.
 */
export function recordRecipe(entry: GuideEntry, terrain: Terrain = recipeTerrain(entry)): { edits: { edit: Edit; group: number }[]; world: World } {
  const edits: { edit: Edit; group: number }[] = [];
  let group = 0;
  class Recorder extends TownBuilder {
    override edit(e: Edit, what?: string): this {
      super.edit(e, what);
      if (e.type === 'placeBlock' && e.color === 'auto') edits.push({ edit: { ...e, color: this.world.blocks.get(e.cell)!.color }, group });
      else if (e.type === 'land') {
        for (const c of e.up) edits.push({ edit: { type: 'land', up: [c], down: [] }, group });
        for (const c of e.down) edits.push({ edit: { type: 'land', up: [], down: [c] }, group });
      } else edits.push({ edit: e, group });
      return this;
    }
  }
  const rec = new Recorder(emptyWorld(entry.seed), terrain, `guide.${entry.id}`);
  // Every call the recipe makes on the builder is a group; the calls it makes on itself are not.
  let depth = 0;
  const b = new Proxy(rec, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (typeof v !== 'function' || prop === 'constructor') return v;
      return function (this: unknown, ...args: unknown[]) {
        if (depth === 0) group++;
        depth++;
        try {
          return (v as (...a: unknown[]) => unknown).apply(receiver, args);
        } finally {
          depth--;
        }
      };
    },
  });
  entry.build(b);
  return { edits, world: rec.world };
}

/** The pieces of a recipe, each placed: its level above the ground, its column and its top. */
export function piecesOf(edits: readonly { edit: Edit; group: number }[], final: World, terrain: Terrain): Piece[] {
  const island = islandOf(final, terrain);
  const ground = (x: number, z: number): number => island.height[columnIndex(x, z)] ?? 0;
  return edits.map(({ edit: e, group }, index): Piece => {
    if (e.type === 'land') {
      const c = e.up[0] ?? e.down[0]!;
      const x = c % 48, z = Math.floor(c / 48);
      const h = ground(x, z);
      return { edit: e, group, index, level: -1, cover: 0, col: [x, z], at: [x + 0.5, h > 0 ? h * CELL_H : SEA_Y, z + 0.5] };
    }
    if (e.type === 'placeEdge') {
      const { cell, side } = unedge(e.edge);
      const x = keyX(cell), z = keyZ(cell), y = keyY(cell);
      return { edit: e, group, index, level: y - ground(x, z), cover: 1, col: [x, z], at: [x + (side === 'E' ? 1 : 0.5), y * CELL_H + 0.3, z + (side === 'S' ? 1 : 0.5)] };
    }
    const cell: CellKey = 'cell' in e ? e.cell : 0;
    const x = keyX(cell), z = keyZ(cell), y = keyY(cell);
    const floor = e.type === 'placeFloor';
    return {
      edit: e,
      group,
      index,
      level: y - ground(x, z),
      cover: floor ? 0 : 1,
      col: [x, z],
      at: [x + 0.5, floor ? y * CELL_H + 0.03 : (y + 1) * CELL_H, z + 0.5],
    };
  });
}

/**
 * The reading order: the land, then by level above the ground; at one level ground cover before blocks,
 * then builder call by builder call, and within a call a walk from each piece to the nearest one left
 * (a fence goes round, a plaza is laid row by row).
 */
export function readingOrder(pieces: readonly Piece[]): Piece[] {
  const byKey = [...pieces].sort((a, b) => a.level - b.level || a.cover - b.cover || a.group - b.group || a.index - b.index);
  const out: Piece[] = [];
  for (let i = 0; i < byKey.length; ) {
    let j = i;
    const p = byKey[i]!;
    while (j < byKey.length && byKey[j]!.level === p.level && byKey[j]!.cover === p.cover && byKey[j]!.group === p.group) j++;
    out.push(...walk(byKey.slice(i, j)));
    i = j;
  }
  return out;
}

/** From the first piece, on to the nearest one left each time (ties: the recipe's order). */
function walk(run: Piece[]): Piece[] {
  if (run.length <= 2) return run;
  const left = [...run];
  const out = [left.shift()!];
  while (left.length) {
    const [x, , z] = out[out.length - 1]!.at;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = Math.hypot(left[i]!.at[0] - x, left[i]!.at[2] - z);
      if (d < bestD - 1e-6) {
        bestD = d;
        best = i;
      }
    }
    out.push(left.splice(best, 1)[0]!);
  }
  return out;
}

/** Plays edits onto a world, giving each placed block the sequence number it has in the recipe's world (so its structures, and their looks, are the same). */
export function play(world: World, terrain: Terrain, edits: readonly Edit[], final: World): World {
  let w = world;
  for (const e of edits) {
    const v = canApply(w, terrain, e);
    if (!v.ok) throw new Error(`clip step ${e.type}: ${v.reason}`);
    w = applyEdit(w, terrain, e);
    if (e.type === 'placeBlock') {
      const seq = final.blocks.get(e.cell)?.seq;
      if (seq !== undefined) {
        const blocks = new Map(w.blocks);
        blocks.set(e.cell, { ...blocks.get(e.cell)!, seq });
        w = { ...w, blocks };
      }
    }
  }
  return w.nextSeq === final.nextSeq ? w : { ...w, nextSeq: final.nextSeq };
}

/** Does this world hold the entry's building? */
export function proven(entry: GuideEntry, world: World, terrain: Terrain): boolean {
  const shape = resolveShape(world, terrain);
  const dressed = !('role' in entry.proof) && !('autoKinds' in entry.proof);
  return holds(entry.proof, contentsOf(shape, dressed ? resolveDressing(shape) : null)) === true;
}

/** The pieces outside the entry's `frame` (whole builder calls): already standing when the clip starts. */
function outside(entry: GuideEntry, pieces: readonly Piece[]): Set<number> {
  const groups = new Set<number>();
  if (!entry.frame) return groups;
  const [x0, z0, x1, z1] = entry.frame;
  for (const p of pieces) {
    const [x, z] = p.col;
    if (x < x0 || x > x1 || z < z0 || z > z1) groups.add(p.group);
  }
  return groups;
}

/**
 * The clip of one entry: what stands at the start, the taps in order (a long run laid a few pieces a tap so
 * there are at most MAX_TAPS), and the tap that makes the building.
 */
export function clipPlan(entry: GuideEntry): ClipPlan {
  const terrain = recipeTerrain(entry);
  const { edits, world: final } = recordRecipe(entry, terrain);
  const pieces = piecesOf(edits, final, terrain);
  // What lies outside the picture stands from the start, unless it already makes the building (a rider's
  // keep): then everything is built.
  const preset = PRESET[entry.id] ?? ((): boolean => false);
  let out = outside(entry, pieces);
  const before = (p: Piece): boolean => out.has(p.group) || preset(p);
  let setting = play(emptyWorld(entry.seed), terrain, pieces.filter(before).map((p) => p.edit), final);
  if (out.size > 0 && proven(entry, setting, terrain)) {
    out = new Set();
    setting = play(emptyWorld(entry.seed), terrain, pieces.filter(before).map((p) => p.edit), final);
  }
  const shown = pieces.filter((p) => !before(p));
  let order = HAND[entry.id]?.(readingOrder(shown)) ?? readingOrder(shown);

  // The building is made at the first piece from which it holds to the end.
  let formed = formedAt(entry, prefixWorlds(setting, terrain, order, final), terrain);
  // Pieces of other kinds that come after it (the windmill's upper storey, a gateway's walls): down first
  // if the building then still waits for its own piece, so that piece is the last but the rest of its own
  // kind. Only when that piece starts its builder call: never into the middle of a call (a plaza, a garden,
  // a podium's top course) already begun.
  const starts = (i: number): boolean => !order.slice(0, i).some((p) => p.group === order[i]!.group);
  if (formed < order.length - 1 && starts(formed)) {
    const k = kindOf(order[formed]!);
    const later = order.slice(formed + 1).filter((p) => kindOf(p) !== k);
    if (later.length) {
      const tried = [...order.slice(0, formed), ...later, ...order.slice(formed).filter((p) => !later.includes(p))];
      try {
        const f2 = formedAt(entry, prefixWorlds(setting, terrain, tried, final), terrain);
        if (f2 > formed) {
          order = tried;
          formed = f2;
        }
      } catch {
        // Cannot go down earlier (it stands on the piece that makes the building): keep the order.
      }
    }
  }

  const steps = tapsOf(order, formed);
  const formedStep = steps.findIndex((t) => t.last >= formed);
  return { terrain, setting, steps: steps.map((t) => t.step), formed: formedStep, final };
}

const kindOf = (p: Piece): string =>
  p.edit.type === 'placeBlock' ? p.edit.kind : p.edit.type === 'placeFloor' ? p.edit.floor : p.edit.type === 'placeEdge' ? p.edit.kind : p.edit.type;

/**
 * The taps: one piece each, or for a long recipe a short stroke of a few alike (same kind, same level, one
 * after the other) so there are at most MAX_TAPS; the piece that makes the building always ends its tap.
 */
function tapsOf(order: readonly Piece[], formed: number): { step: ClipStep; last: number }[] {
  for (let per = Math.max(1, Math.ceil(order.length / MAX_TAPS)); ; per++) {
    const taps: { step: ClipStep; last: number }[] = [];
    for (let i = 0; i < order.length; ) {
      const head = order[i]!;
      let j = i + 1;
      while (j < order.length && j - i < per && j - 1 !== formed && kindOf(order[j]!) === kindOf(head) && order[j]!.level === head.level) j++;
      taps.push({ step: { edits: order.slice(i, j).map((p) => p.edit), at: head.at }, last: j - 1 });
      i = j;
    }
    if (taps.length <= MAX_TAPS || per >= order.length) return taps;
  }
}

function prefixWorlds(setting: World, terrain: Terrain, order: readonly Piece[], final: World): World[] {
  const worlds: World[] = [];
  let w = setting;
  for (const p of order) {
    w = play(w, terrain, [p.edit], final);
    worlds.push(w);
  }
  return worlds;
}

/** The first index from which the building holds in every world to the last (the last must hold). */
function formedAt(entry: GuideEntry, worlds: readonly World[], terrain: Terrain): number {
  let i = worlds.length - 1;
  if (i < 0) return 0;
  while (i > 0 && proven(entry, worlds[i - 1]!, terrain)) i--;
  return i;
}
