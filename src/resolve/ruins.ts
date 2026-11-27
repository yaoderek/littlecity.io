// Ruins in the town plan (design section 13b, "What is left"). Owner: Mischief.
//
// A damaged block keeps its kind, structure, role and features, so a ruin is
// drawn as the very building it was (the generators' output is then broken
// up by src/gen/damage). What a half-destroyed or destroyed building loses is
// its life: nobody lives in it, and nothing hangs on it or stands at it (no
// laundry, flower boxes, lamps on its walls, signs, stall goods). This file
// drops that dressing after the rules have run, and lays an orchard ladder
// down on the grass when the tree it leans on is gone. A town with no ruins passes
// through untouched (the same object).

import { neighbor, NO_CELL, opposite, type CellKey } from '@/core/grid';
import { ruinUninhabitable } from '@/world/damage';
import { hashDressing, hashItem } from './engine/hash';
import type { Actor, Anchor, DressingPlan, Prop, ShapePlan, Socket, StructureId } from './plan';

/** Structures with a half-destroyed or destroyed block: they house nobody and carry no dressing. */
export function ruinedStructures(shape: ShapePlan): ReadonlySet<StructureId> {
  const out = new Set<StructureId>();
  for (const [cell, b] of shape.world.blocks) {
    if (!ruinUninhabitable(b.ruin)) continue;
    const s = shape.structureAt.get(cell);
    if (s !== undefined) out.add(s);
  }
  return out;
}

/**
 * Ladders leaning into a tree that is a stump, burnt bare or growing back (U18's orchard; a tree's ruin
 * of stage 2 or more, or mending): with nothing to rest on they lie on the grass beside it (the ladder
 * part's `fallen`), and nobody climbs them (their activity sockets go). Whole again, they stand.
 */
export function fallenLadders(shape: ShapePlan, dressing: DressingPlan, ruined: ReadonlySet<StructureId>): ReadonlySet<string> {
  const out = new Set<string>();
  for (const p of dressing.props) {
    if (p.type !== 'ladder' || !('cell' in p.at) || p.at.face === undefined) continue;
    const behind = neighbor(p.at.cell, opposite(p.at.face));
    const s = behind === NO_CELL ? undefined : shape.structureAt.get(behind);
    if (s !== undefined && ruined.has(s) && shape.structures.get(s)?.kind === 'tree') out.add(p.id);
  }
  return out;
}

export function withoutRuinedDressing(shape: ShapePlan, dressing: DressingPlan): DressingPlan {
  const ruined = ruinedStructures(shape);
  if (ruined.size === 0) return dressing;
  const inRuin = (cell: CellKey | undefined): boolean => {
    if (cell === undefined) return false;
    const s = shape.structureAt.get(cell);
    return s !== undefined && ruined.has(s);
  };
  const sockets = new Map<string, Socket>();
  for (const s of shape.sockets) sockets.set(s.id, s);
  for (const s of dressing.sockets) sockets.set(s.id, s);
  const gone = new Set<string>();
  // Features of a ruined structure (its chimney, its sign) take what hangs on them along.
  for (const f of shape.features) if (ruined.has(f.structure)) gone.add(f.id);
  const fallen = fallenLadders(shape, dressing, ruined);
  const socketGone = (id: string): boolean => {
    const s = sockets.get(id);
    if (!s) return false;
    return (
      gone.has(id) ||
      (s.structure !== undefined && ruined.has(s.structure)) ||
      inRuin(s.cell) ||
      (s.owner !== undefined && (gone.has(s.owner) || fallen.has(s.owner)))
    );
  };
  const anchorGone = (at: Anchor | null): boolean => {
    if (!at) return false;
    if ('socket' in at) return socketGone(at.socket);
    if ('cell' in at) return inRuin(at.cell);
    return socketGone(at.from) || socketGone(at.to);
  };
  // Items hang on sockets owned by other items (a lamp head on a lamp): repeat until nothing more goes.
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sockets.values()) {
      if (!gone.has(s.id) && socketGone(s.id)) {
        gone.add(s.id);
        changed = true;
      }
    }
    for (const p of dressing.props) {
      if (!gone.has(p.id) && anchorGone(p.at)) {
        gone.add(p.id);
        changed = true;
      }
    }
  }
  const keepProp = (p: Prop): boolean => !gone.has(p.id);
  const keepActor = (a: Actor): boolean => !anchorGone(a.at) && !(a.home !== undefined && ruined.has(a.home));
  const fell = (p: Prop): Prop => {
    if (!fallen.has(p.id)) return p;
    const down: Prop = { ...p, params: { ...p.params, fallen: 1 } };
    down.hash = hashItem(down);
    return down;
  };
  const props = dressing.props.filter(keepProp).map(fell);
  const actors = dressing.actors.filter(keepActor);
  const kept = dressing.sockets.filter((s) => !gone.has(s.id));
  if (fallen.size === 0 && props.length === dressing.props.length && actors.length === dressing.actors.length && kept.length === dressing.sockets.length) {
    return dressing;
  }
  const plan: DressingPlan = { ...dressing, props, actors, sockets: kept, hash: 0 };
  (plan as { hash: number }).hash = hashDressing(plan);
  return plan;
}
