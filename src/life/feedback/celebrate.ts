// The unlock moment (src/ui/unlock.ts): the first time a player builds one of the almanac's buildings by
// hand, it does not simply land (F01) but pops up out of its foot in a burst of little stars. The interface
// asks for it here; the feedback system (feedback.system.ts) plays it on its next update, before the frame
// is drawn, so the plain landing is never seen.
//
//   celebrate(stage, { structure, at })   a building: it pops, and the stars burst round it
//   celebrate(stage, { at })              something the dressing holds (an orchard, the lamps): stars only

import type { StructureId } from '@/resolve/plan';
import type { LifeStage } from '../api';

export interface Celebration {
  /** The structure to pop up, if the building is one. */
  structure?: StructureId;
  /** Where the stars burst from: the top of the building, world units. */
  at: readonly [number, number, number];
  /** How big the building is across, in cells (the stars reach a little past it). */
  size?: number;
  /**
   * How much bigger than their own size the stars are drawn (1 or more): the interface sets it from the
   * zoom, so that from the whole-island view they are still stars and not specks.
   */
  scale?: number;
}

const queues = new WeakMap<LifeStage, Celebration[]>();

/** Asks for an unlock moment; it plays on the stage's next update. */
export function celebrate(stage: LifeStage, c: Celebration): void {
  let q = queues.get(stage);
  if (!q) queues.set(stage, (q = []));
  // A burst of many at once (a big run): a handful is plenty.
  if (q.length < 4) q.push(c);
}

/** The celebrations asked for since the last call (the feedback system's). */
export function takeCelebrations(stage: LifeStage): Celebration[] {
  const q = queues.get(stage);
  if (!q || q.length === 0) return [];
  queues.delete(stage);
  return q;
}
