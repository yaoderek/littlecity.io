// What a click means (design section 7). Owner: Interface. Pure.
//
// planUse() turns "this tool, on this picked face" into the edits to try;
// planErase() does the same for a right click or a long press. Neither
// decides whether an edit is legal: that is canApply's job (the world
// module), and the caller asks it before applying anything. What lives here
// is only targeting: which cell, which edge, which way stairs face, what the
// Change tool steps to next.

import { columnIndex, DIR4, edgeOf, inBounds, inColumnBounds, key, keyX, keyY, keyZ, NO_CELL, SIZE_Y, type CellKey, type Dir4 } from '@/core/grid';
import { AUTO_KINDS, KINDS, PALETTE_SIZE, placedInfo, type Kind, type PlacedKind } from '@/core/kinds';
import type { Vec3 } from '@/core/mat4';
import { phrase } from '@/core/phrase';
import type { Edit, Rot, Terrain, World } from '@/core/world';
import { houseStyle } from '@/style/houses';
import { islandOf, LAND_MAX } from '@/terrain/land';
import { applyEdit, canApply } from '@/world/world';
import { faceZone, type Pick } from './pick';
import { isEdgePiece, isFloorPiece, isLandTool, isToolId, type ItemId, type LandId } from './pieces';

export interface ToolState {
  /** The selected tray item: a piece or a tool. */
  item: ItemId;
  /** The colour swatch: 'auto' (the default) or a forced palette index. */
  swatch: number | 'auto';
  /** The house style for a new house: 0 or absent = Random. */
  style?: number;
  /** Raise, Dig and Level: the brush, 1 to 3 columns across (the held length). Default 1. */
  brush?: number;
  /** Level during a stroke: the height the stroke began at. Default: the height of the column pointed at. */
  levelTo?: number;
}

export interface ActionContext {
  world: World;
  terrain: Terrain;
  /** Resolved kinds of the town as shown (so an Auto block that became an arch counts as an arch). */
  kinds?: ReadonlyMap<CellKey, Kind> | null;
  /** The direction the camera looks, world space: stairs with nothing to climb face away from it. */
  rayDir?: Vec3;
}

export interface Plan {
  /** Edits to try, in order; the first one canApply accepts is the one to apply. */
  tries: Edit[];
  /** The cell the action is about (where a refusal shows), or NO_CELL. */
  at: CellKey;
  /** Nothing can be tried here, and this is why (outside the map). */
  refusal?: string;
  /** The Change tool on a piece that cannot change: nothing happens and the block wiggles. */
  wiggle?: boolean;
  /**
   * Level: every step to the target height, in order (tries[0] is the first). Applied together as
   * one undo step; the ghost shows where they end.
   */
  steps?: Edit[];
}

const nothing = (at: CellKey = NO_CELL): Plan => ({ tries: [], at });

/** The Change tool's order: Auto, then the kinds Auto can become, then Auto again. */
export const CHANGE_CYCLE: readonly PlacedKind[] = ['auto', ...AUTO_KINDS];

function resolvedKind(ctx: ActionContext, cell: CellKey): Kind | null {
  const placed = ctx.world.blocks.get(cell)?.kind;
  if (placed === undefined) return null;
  return ctx.kinds?.get(cell) ?? (placed === 'auto' ? null : placed);
}

function solidAt(ctx: ActionContext, x: number, y: number, z: number): boolean {
  if (!inBounds(x, y, z)) return false;
  if (y < ctx.terrain.height[columnIndex(x, z)]!) return true;
  const block = ctx.world.blocks.get(key(x, y, z));
  return block !== undefined && placedInfo(block.kind).solid;
}

/**
 * Which way new stairs face (design section 7). `rot` is the Dir4 the flight
 * climbs toward: 0 north, 1 east, 2 south, 3 west. It points at the
 * neighbouring column whose walkable top is exactly one level higher; with
 * several, the one nearest the pointer; with none, away from the camera.
 */
export function stairsRot(cell: CellKey, point: Vec3, ctx: ActionContext): Rot {
  const x = keyX(cell), y = keyY(cell), z = keyZ(cell);
  let best: Dir4 | null = null;
  let bestDist = Infinity;
  for (let d = 0 as Dir4; d < 4; d++) {
    const [dx, dz] = DIR4[d]!;
    if (!solidAt(ctx, x + dx, y, z + dz) || solidAt(ctx, x + dx, y + 1, z + dz)) continue;
    // Distance from the pointer to the middle of the boundary shared with that neighbour.
    const dist = Math.hypot(point[0] - (x + 0.5 + dx * 0.5), point[2] - (z + 0.5 + dz * 0.5));
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  if (best !== null) return best;
  if (!ctx.rayDir) return 0;
  let away: Dir4 = 0;
  let most = -Infinity;
  for (let d = 0 as Dir4; d < 4; d++) {
    const dot = DIR4[d]![0] * ctx.rayDir[0] + DIR4[d]![1] * ctx.rayDir[2];
    if (dot > most) {
      away = d;
      most = dot;
    }
  }
  return away;
}

/**
 * The cell a floor goes into. Normally the target cell; but a floor shares
 * its cell with a tree, fountain, stall, cell fence or cell wall, and runs
 * through an arch standing on the ground, so pointing at one of those means
 * "under this".
 */
function floorCell(pick: Pick, ctx: ActionContext): CellKey {
  if (pick.hit !== 'block') return pick.target;
  const kind = resolvedKind(ctx, pick.cell);
  if (kind === null) return pick.target;
  if (KINDS[kind].keepsFloor && !KINDS[kind].solid) return pick.cell;
  if (kind === 'arch' && pick.normal[1] === 0) return pick.cell;
  return pick.target;
}

/** A click (or tap) with the selected tray item on a picked face. */
export function planUse(tool: ToolState, pick: Pick, ctx: ActionContext): Plan {
  const item = tool.item;
  if (item === 'erase') return planErase(pick, ctx);

  if (item === 'change' || item === 'paint') {
    if (pick.hit !== 'block') return nothing();
    const block = ctx.world.blocks.get(pick.cell);
    if (!block) return nothing();
    if (item === 'paint') {
      const color = tool.swatch === 'auto' ? (block.color + 1) % PALETTE_SIZE : tool.swatch;
      return color === block.color ? nothing(pick.cell) : { tries: [{ type: 'paint', cell: pick.cell, color }], at: pick.cell };
    }
    const index = CHANGE_CYCLE.indexOf(block.kind);
    if (index >= 0) {
      const tries: Edit[] = [];
      for (let n = 1; n < CHANGE_CYCLE.length; n++) {
        tries.push({ type: 'setKind', cell: pick.cell, kind: CHANGE_CYCLE[(index + n) % CHANGE_CYCLE.length]! });
      }
      return { tries, at: pick.cell };
    }
    if (block.kind === 'stairs') {
      return { tries: [{ type: 'setRot', cell: pick.cell, rot: ((block.rot + 1) % 4) as Rot }], at: pick.cell };
    }
    return { tries: [], at: pick.cell, wiggle: true };
  }
  if (isToolId(item)) return nothing();
  if (isLandTool(item)) return planLand(item, tool, pick, ctx);

  if (isFloorPiece(item)) {
    const cell = floorCell(pick, ctx);
    if (cell === NO_CELL) return { tries: [], at: NO_CELL, refusal: phrase('outside the map', {}) };
    return { tries: [{ type: 'placeFloor', cell, floor: item }], at: cell };
  }

  const target = pick.target;
  if (target === NO_CELL) return { tries: [], at: NO_CELL, refusal: phrase('outside the map', {}) };

  if (isEdgePiece(item)) {
    const side = faceZone(pick);
    if (side !== null) {
      const edge = edgeOf(target, side);
      if (edge === NO_CELL) return { tries: [], at: target, refusal: phrase('outside the map', {}) };
      return { tries: [{ type: 'placeEdge', edge, kind: item }], at: target };
    }
  }

  const edit: Edit = { type: 'placeBlock', cell: target, kind: item, color: tool.swatch, from: pick.from };
  if (item === 'stairs') edit.rot = stairsRot(target, pick.point, ctx);
  if (item === 'house' && tool.style) {
    edit.style = tool.style;
    // A chosen style brings its own wall colour (unless the swatch is set), wherever the click
    // lands: houses of one style that touch then join into one building (design section 7).
    const style = houseStyle(tool.style);
    if (style && tool.swatch === 'auto') edit.color = style.wall;
  }
  return clearingTree(edit, pick, ctx) ?? { tries: [edit], at: target };
}

/**
 * A piece put on a tree takes the tree's place: the tree goes and the piece stands where it stood,
 * as one undo step (a tree is not solid, so nothing can stand on it). Only when the piece could stand
 * there once the tree is gone; otherwise null, and the click is refused as before.
 */
function clearingTree(edit: Edit & { type: 'placeBlock' }, pick: Pick, ctx: ActionContext): Plan | null {
  if (keyY(edit.cell) === 0) return null;
  const tree = below(edit.cell);
  if (ctx.world.blocks.get(tree)?.kind !== 'tree') return null;
  const place: Edit = { ...edit, cell: tree, from: ctx.world.blocks.has(below(tree)) ? below(tree) : null };
  if (edit.kind === 'stairs') place.rot = stairsRot(tree, pick.point, { ...ctx, world: applyEdit(ctx.world, ctx.terrain, { type: 'eraseBlock', cell: tree }) });
  const steps = treeSwap(ctx.world, ctx.terrain, place);
  return steps ? { tries: [steps[0]!], at: tree, steps } : null;
}

/**
 * Putting a piece where a tree stands: the tree's erasing and then the piece, when the piece could
 * stand there once the tree is gone (never a tree for a tree); otherwise null.
 */
export function treeSwap(w: World, t: Terrain, place: Edit & { type: 'placeBlock' }): Edit[] | null {
  if (place.kind === 'tree' || w.blocks.get(place.cell)?.kind !== 'tree') return null;
  const erase: Edit = { type: 'eraseBlock', cell: place.cell };
  return canApply(applyEdit(w, t, erase), t, place).ok ? [erase, place] : null;
}

const below = (cell: CellKey): CellKey => (keyY(cell) === 0 ? NO_CELL : key(keyX(cell), keyY(cell) - 1, keyZ(cell)));

/** The column a land tool acts on: the ground, block or water pointed at. */
export function landColumn(pick: Pick): { x: number; z: number } {
  return { x: keyX(pick.cell), z: keyZ(pick.cell) };
}

/**
 * The columns under a brush (design section 6: 1, 2 or 3 across). A brush of
 * 2 covers the pointed column and the three toward the corner the pointer is
 * nearest, so it follows the pointer the way a ground run does.
 */
export function brushAt(pick: Pick, size: number): number[] {
  const { x, z } = landColumn(pick);
  const n = Math.max(1, Math.min(3, Math.round(size)));
  let xs: number[], zs: number[];
  if (n === 1) {
    xs = [x];
    zs = [z];
  } else if (n === 3) {
    xs = [x - 1, x, x + 1];
    zs = [z - 1, z, z + 1];
  } else {
    xs = [x, x + (pick.point[0] - x >= 0.5 ? 1 : -1)];
    zs = [z, z + (pick.point[2] - z >= 0.5 ? 1 : -1)];
  }
  const out: number[] = [];
  for (const cz of zs) for (const cx of xs) if (inColumnBounds(cx, cz)) out.push(columnIndex(cx, cz));
  return out;
}

/**
 * Raise, Dig or Level on the pointed column with the brush (design section 6).
 * Level brings every column of the brush one step toward `tool.levelTo` (a
 * stroke's starting height), or toward the pointed column's own height.
 */
function planLand(item: LandId, tool: ToolState, pick: Pick, ctx: ActionContext): Plan {
  const { x, z } = landColumn(pick);
  const h = ctx.terrain.height[columnIndex(x, z)]!;
  const at = key(x, Math.min(SIZE_Y - 1, h), z);
  const cols = brushAt(pick, tool.brush ?? 1);
  if (item === 'raise' || item === 'dig') {
    const moved = tapered(cols, x, z, ctx.terrain.height, item === 'raise' ? 1 : -1);
    return { tries: [item === 'raise' ? { type: 'land', up: moved, down: [] } : { type: 'land', up: [], down: moved }], at };
  }
  const to = tool.levelTo ?? h;
  const level = levelSteps(ctx.world, ctx.terrain, cols, to);
  if (level.edits.length === 0) {
    const flat = cols.every((c) => ctx.terrain.height[c] === to);
    return { tries: [], at, refusal: flat ? phrase('Level brings the ground to the height where you press: drag from there across the ground', {}) : level.reason };
  }
  return { tries: [level.edits[0]!], at, steps: level.edits };
}

/**
 * A wide brush has a soft edge (shaping the land): with the 3-across brush, the corners of the square
 * move only once they have fallen behind the middle, and the sides only while level with it or behind,
 * so dab after dab builds a rounded mound or bowl instead of a square step. Narrower brushes move whole.
 */
export function tapered(cols: readonly number[], x: number, z: number, h: ArrayLike<number>, dy: 1 | -1): number[] {
  if (cols.length < 9) return [...cols];
  const mid = h[columnIndex(x, z)]!;
  return cols.filter((c) => {
    const dx = Math.abs((c % 48) - x), dz = Math.abs(Math.floor(c / 48) - z);
    if (dx === 0 && dz === 0) return true;
    const behind = dy > 0 ? mid - h[c]! : h[c]! - mid;
    return dx + dz === 2 ? behind >= 1 : behind >= 0;
  });
}

/**
 * Level, all the way (design section 6): the land edits that bring every column to height `to`, one
 * level at a time, carrying what stands on them. A column that cannot move further stays where it
 * got to; `reason` says why the first one stopped. `world` is the town after them all.
 */
export function levelSteps(world: World, terrain: Terrain, cols: readonly number[], to: number): { edits: Edit[]; world: World; reason: string } {
  const edits: Edit[] = [];
  let w = world;
  let reason = '';
  for (let i = 0; i <= LAND_MAX; i++) {
    const t = islandOf(w, terrain);
    const up = cols.filter((c) => t.height[c]! < to);
    const down = cols.filter((c) => t.height[c]! > to);
    if (up.length === 0 && down.length === 0) break;
    const e: Edit = { type: 'land', up, down };
    const v = canApply(w, terrain, e);
    if (!v.ok) {
      reason = v.reason;
      break;
    }
    const next = applyEdit(w, terrain, e);
    // Columns that were refused this time will be refused again: note why, and go on with the rest.
    const moved = islandOf(next, terrain);
    if (!reason && [...up, ...down].some((c) => moved.height[c] === t.height[c])) reason = phrase('some of the ground cannot move: something on it would be in the way', {});
    edits.push(e);
    w = next;
  }
  return { edits, world: w, reason: reason || phrase('the ground cannot move here', {}) };
}

/**
 * Alt-click (design section 7, "Copy a look"): the kind, wall colour and
 * house style of the block under the pointer, to put into the hand. Null
 * when the pointer is not on a block.
 */
export function copyLook(pick: Pick, ctx: ActionContext): { item: PlacedKind; swatch: number; style: number } | null {
  if (pick.hit !== 'block') return null;
  const block = ctx.world.blocks.get(pick.cell);
  if (!block) return null;
  return { item: block.kind, swatch: block.color, style: block.style ?? 0 };
}

/**
 * Erase (right click, long press, or the Erase tool): one block, floor or
 * edge piece. On a top face the thing lying on it goes first: the edge
 * piece in the strip you point at, then the floor; otherwise the block you
 * point at. Terrain cannot be erased.
 */
export function planErase(pick: Pick, ctx: ActionContext): Plan {
  const { world } = ctx;
  const onTop = pick.hit !== 'water' && pick.normal[1] === 1 && pick.target !== NO_CELL;
  if (onTop) {
    const side = faceZone(pick);
    if (side !== null) {
      const edge = edgeOf(pick.target, side);
      if (edge !== NO_CELL && world.edges.has(edge)) return { tries: [{ type: 'eraseEdge', edge }], at: pick.target };
    }
    if (world.floors.has(pick.target)) return { tries: [{ type: 'eraseFloor', cell: pick.target }], at: pick.target };
  }
  if (pick.hit === 'block') return { tries: [{ type: 'eraseBlock', cell: pick.cell }], at: pick.cell };
  if (onTop) {
    // Bare ground: forgive a click that missed the strip, and take the nearest edge piece around this square.
    const nearest = faceZone(pick, 0.51);
    for (const side of nearest === null ? [] : [nearest, ...([0, 1, 2, 3] as Dir4[]).filter((d) => d !== nearest)]) {
      const edge = edgeOf(pick.target, side);
      if (edge !== NO_CELL && world.edges.has(edge)) return { tries: [{ type: 'eraseEdge', edge }], at: pick.target };
    }
  }
  return nothing();
}

/**
 * The cells on a straight walk from one cell to another at the first cell's
 * level, moving one column at a time (never diagonally, so a painted run has
 * no gaps). Leaves out `from`, includes `to`.
 */
export function lineCells(from: CellKey, to: CellKey): CellKey[] {
  const y = keyY(from);
  let x = keyX(from), z = keyZ(from);
  const x1 = keyX(to), z1 = keyZ(to);
  const nx = Math.abs(x1 - x), nz = Math.abs(z1 - z);
  const sx = Math.sign(x1 - x), sz = Math.sign(z1 - z);
  const out: CellKey[] = [];
  for (let ix = 0, iz = 0; ix < nx || iz < nz; ) {
    if (iz >= nz || (ix < nx && (0.5 + ix) / nx <= (0.5 + iz) / nz)) {
      x += sx;
      ix++;
    } else {
      z += sz;
      iz++;
    }
    out.push(key(x, y, z));
  }
  return out;
}
