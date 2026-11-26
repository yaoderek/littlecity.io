// R-D05: the slipway down the middle of a shipyard. One feature per cell of
// the slip (`slipway/way`): two ground ways (heavy timbers, their tops
// greased pale with tallow) on cribs of blocking, sloping down from the head
// of the slip toward the sea, so the ship built on them sits bow up and
// stern to the water. A cross timber stops the head; the last cell's ways run
// on past the end of the dock, steeply down into the water on two piles.
// `slipway/side` draws nothing (it only marks the side decks' ends).
//
// Frame: the bottom centre of the dock cell's seaward face, +Z out to sea; the
// cell is z ∈ [−1, 0]. The deck is at y = CELL_H.
//
// The heights are shared with the shipyard's life (the hull sits on the ways):
// `slipTop` is the one place they are worked out.

import { CELL_H, SEA_Y } from '@/core/grid';
import type { Mat4Like } from '@/core/mat4';
import { definePart } from '@/gen/api';
import { dockColors } from '@/gen/dock/wood';
import { PATTERN, type MeshBuilder } from '@/gen/mesh';
import { SHIPYARD } from '@/style/shipyard';
import { tube } from './kit';

/** Depth of a way's timber. */
export const WAY_DEPTH = 0.065;
/** The deck's top. */
const DECK = CELL_H + 0.004;

/**
 * The height of the ways' top at `u` cells from the head of a slip `n` cells long (u in [0, n] is over the
 * dock; past n they run on down into the water).
 */
export function slipTop(u: number, n: number): number {
  const head = DECK + SHIPYARD.wayHead, foot = DECK + SHIPYARD.wayFoot;
  if (u <= n) return head + ((foot - head) * u) / n;
  const run = SHIPYARD.wayRun;
  return foot + ((SEA_Y - SHIPYARD.wayDeep - foot) * Math.min(u - n, run)) / run;
}

/** A timber with its top and bottom sheared to slope `k` (rise per unit along +Z, about z = 0). */
function sloped(b: MeshBuilder, k: number, min: readonly [number, number, number], max: readonly [number, number, number]): void {
  const shear: Mat4Like = [1, 0, 0, 0, 0, 1, 0, 0, 0, k, 1, 0, 0, 0, 0, 1];
  b.at(shear, () => b.box([min[0], min[1], min[2]], [max[0], max[1], max[2]]));
}

export default definePart({
  feature: 'slipway',
  build(item, ctx) {
    const b = ctx.mesh();
    if (item.variant !== 'way') return { mesh: b.build() };
    const wood = dockColors(ctx.structure?.color ?? 0);
    const i = item.params?.i ?? 0, n = Math.max(1, item.params?.n ?? 1);
    const k = (SHIPYARD.wayFoot - SHIPYARD.wayHead) / n;
    const top0 = slipTop(i + 1, n);
    const half = SHIPYARD.wayWidth / 2;
    const xs = [-SHIPYARD.wayApart, SHIPYARD.wayApart];
    // ── the ways over this cell ──
    for (const x of xs) {
      b.with({ color: wood.frame, pattern: PATTERN.timber, ink: 'ways' }, () => sloped(b, k, [x - half, top0 - WAY_DEPTH, -1], [x + half, top0, 0]));
      b.with({ color: wood.pale, pattern: PATTERN.none, ink: 'tallow' }, () => sloped(b, k, [x - half + 0.015, top0, -1], [x + half - 0.015, top0 + 0.008, 0]));
    }
    // ── cribs of blocking under them, where they stand clear of the deck ──
    b.with({ color: wood.pile, pattern: PATTERN.timber, ink: 'blocking' }, () => {
      for (const z of [-0.76, -0.26]) {
        const under = slipTop(i + 1 + z, n) - WAY_DEPTH;
        if (under - DECK < 0.025) continue;
        for (const x of xs) {
          // Two courses crossed: the lower one across the slip, the upper one along it.
          const mid = DECK + (under - DECK) * 0.5;
          b.box([x - half - 0.03, DECK, z - 0.07], [x + half + 0.03, mid, z + 0.07]);
          b.box([x - half + 0.005, mid, z - 0.1], [x + half - 0.005, under, z + 0.1]);
        }
      }
    });
    // ── the head: a cross timber the keel's foot rests against ──
    if (i === 0) {
      b.with({ color: wood.frame, pattern: PATTERN.timber, ink: 'head' }, () => b.box([-0.44, DECK, -0.98], [0.44, slipTop(0, n) + 0.05, -0.86]));
    }
    // ── the end: on down into the water past the dock, on two piles ──
    if (i === n - 1) {
      const run = SHIPYARD.wayRun;
      const k2 = (slipTop(n + run, n) - slipTop(n, n)) / run;
      for (const x of xs) {
        b.with({ color: wood.frame, pattern: PATTERN.timber, ink: 'ways-end' }, () => sloped(b, k2, [x - half, top0 - WAY_DEPTH, 0], [x + half, top0, run]));
        b.with({ color: wood.pale, pattern: PATTERN.none, ink: 'tallow-end' }, () => sloped(b, k2, [x - half + 0.015, top0, 0], [x + half - 0.015, top0 + 0.008, run]));
      }
      b.with({ color: wood.pile, pattern: PATTERN.bark, ink: 'end-piles' }, () => {
        for (const x of xs) {
          const z = run * 0.55;
          tube(b, [[x * 1.15, SEA_Y - 0.45, z], [x, slipTop(n + z, n) - WAY_DEPTH, z]], 0.05, { seg: 7 });
        }
      });
      // A brace across the piles at the water.
      b.with({ color: wood.frame, pattern: PATTERN.none, ink: 'end-brace' }, () => {
        const z = run * 0.55;
        b.box([-SHIPYARD.wayApart * 1.12, SEA_Y - 0.06, z - 0.03], [SHIPYARD.wayApart * 1.12, SEA_Y + 0.04, z + 0.03]);
      });
    }
    return { mesh: b.build() };
  },
});
