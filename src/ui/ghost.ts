// The ghost preview (design section 7; mouse only). Owner: Interface. Pure.
//
// On hover the game applies the piece to a what-if world, runs the shape
// stage on it, and hands the view the new structure to draw translucent.
// Auto neighbours whose resolved kind would change shimmer, and so does
// the building a new block would join (design section 7, "One building"):
// the whole building is redrawn translucent over itself, which on its own
// barely shows, so its existing cells are framed too. An illegal target
// shows a red outline. Only placing a piece has a ghost: the Change,
// Paint and Erase tools act on what is already there.

import { columnIndex, keyX, keyZ, NO_CELL, type CellKey } from '@/core/grid';
import type { Edit, EditResult, Terrain, World } from '@/core/world';
import type { Ghost } from '@/render/api';
import type { ShapePlan, StructureId } from '@/resolve/plan';
import { applyEdit, applyEdits } from '@/world/world';
import type { Plan } from './actions';
import type { Run } from './length';

export interface GhostHost {
  readonly world: World;
  readonly terrain: Terrain;
  /** The shape as shown now. */
  readonly shape: ShapePlan;
  can(e: Edit): EditResult;
  preview(world: World): ShapePlan;
}

const isPlacement = (e: Edit): boolean => e.type === 'placeBlock' || e.type === 'placeFloor' || e.type === 'placeEdge';

/** The Auto blocks that would resolve to a different kind in `next` than they do in `now`. */
export function changedAutos(world: World, now: ShapePlan, next: ShapePlan): CellKey[] {
  const out: CellKey[] = [];
  for (const [cell, block] of world.blocks) {
    if (block.kind !== 'auto') continue;
    const after = next.kinds.get(cell);
    if (after !== undefined && after !== now.kinds.get(cell)) out.push(cell);
  }
  return out;
}

/**
 * The cells already in the world that the new blocks' structures would take
 * in: the building a placement joins. Empty when the new blocks stand alone.
 */
export function joinedCells(world: World, preview: ShapePlan, edits: readonly Edit[], ids: readonly StructureId[]): CellKey[] {
  if (!edits.some((e) => e.type === 'placeBlock')) return [];
  const out: CellKey[] = [];
  for (const id of ids) {
    const s = preview.structures.get(id);
    if (!s) continue;
    for (const c of s.cells) if (world.blocks.has(c)) out.push(c);
  }
  return out;
}

const withShimmer = (cells: CellKey[]): { shimmer?: CellKey[] } => (cells.length > 0 ? { shimmer: cells } : {});

/** The ghost for a planned placement, or null when there is nothing to show. */
export function ghostFor(plan: Plan, host: GhostHost): Ghost | null {
  // A piece put on a tree: the tree goes and the piece takes its place (steps), shown as one.
  const steps = plan.steps && plan.steps.length > 1 ? plan.steps : null;
  const placing = (steps ?? plan.tries).some(isPlacement) || plan.refusal !== undefined;
  if (!placing) return null;
  const first = plan.tries.find((e) => host.can(e).ok);
  if (!first) return plan.at === NO_CELL ? null : { plan: host.shape, show: [], refuse: plan.at };
  const edit = steps ? steps.findLast(isPlacement)! : first;

  const preview = host.preview(steps ? applyEdits(host.world, host.terrain, steps).world : applyEdit(host.world, host.terrain, edit));
  let id: StructureId | undefined;
  if (edit.type === 'placeBlock') id = preview.structureAt.get(edit.cell);
  else if (edit.type === 'placeFloor') id = preview.floorAt.get(edit.cell);
  else if (edit.type === 'placeEdge') id = preview.edgeAt.get(edit.edge);
  const show = id === undefined ? [] : [id];
  const shimmer = [...new Set([...changedAutos(host.world, host.shape, preview), ...joinedCells(host.world, preview, [edit], show)])];
  return { plan: preview, show, ...withShimmer(shimmer) };
}

/** The structure each placing edit made in a shape, once each (cells of one run may merge into one structure). */
export function structuresOf(edits: readonly Edit[], plan: ShapePlan): StructureId[] {
  const out = new Set<StructureId>();
  for (const e of edits) {
    let id: StructureId | undefined;
    if (e.type === 'placeBlock') id = plan.structureAt.get(e.cell);
    else if (e.type === 'placeFloor') id = plan.floorAt.get(e.cell);
    else if (e.type === 'placeEdge') id = plan.edgeAt.get(e.edge);
    if (id !== undefined) out.add(id);
  }
  return [...out];
}

/**
 * The ghost for Raise, Dig or Level (shaping the land): the ground as it would
 * be, and whatever it carries drawn where it would stand. The view draws the
 * reshaped columns from `plan.terrain`; a refused edit shows the red frame.
 */
export function ghostForLand(plan: Plan, host: GhostHost): Ghost | null {
  const edit = plan.tries.find((e) => e.type === 'land');
  if (!edit || edit.type !== 'land') return null;
  if (!host.can(edit).ok) return plan.at === NO_CELL ? null : { plan: host.shape, show: [], refuse: plan.at };
  let after = applyEdit(host.world, host.terrain, edit);
  // Level: every step to the target height, so the ghost shows where the ground ends up.
  for (const e of plan.steps?.slice(1) ?? []) after = applyEdit(after, host.terrain, e);
  const preview = host.preview(after);
  const moved = new Set([...edit.up, ...edit.down]);
  const show = new Set<StructureId>();
  for (const [cell, id] of preview.structureAt) if (moved.has(columnIndex(keyX(cell), keyZ(cell))) && !host.world.blocks.has(cell)) show.add(id);
  return { plan: preview, show: [...show] };
}

/** The ghost for a held-length run (./length.ts): the whole run, or a red outline when its first cell is refused. */
export function ghostForRun(run: Run, host: GhostHost): Ghost | null {
  if (run.edits.length === 0) return run.at === NO_CELL ? null : { plan: host.shape, show: [], refuse: run.at };
  const preview = host.preview(run.world);
  const show = structuresOf(run.edits, preview);
  const shimmer = [...new Set([...changedAutos(host.world, host.shape, preview), ...joinedCells(host.world, preview, run.edits, show)])];
  return { plan: preview, show, ...withShimmer(shimmer) };
}

/**
 * Paces the ghost to once a frame. Each new target cell costs a whole-town
 * resolve, so a stream of pointer moves must not each pay it, and a frame that
 * already carried a dressing gives the ghost up until the next one.
 */
export function createGhostPace(): { want(): void; heavy(): void; frame(run: () => void): void } {
  let wanted = false;
  let carriedDressing = false;
  return {
    want: () => { wanted = true; },
    heavy: () => { carriedDressing = true; },
    frame(run) {
      const go = wanted && !carriedDressing;
      carriedDressing = false;
      if (!go) return;
      wanted = false;
      run();
    },
  };
}
