// The bike by a front door (D11): leaning on the wall to the right of the
// door, where the doorstep keeps a place for it. Its own prop (not part of
// the doorstep) so that life can take it away while its owner rides it
// (src/life/people/bikes.ts). Drawn by src/parts/people/bike.ts.
// Frame: the 'door' socket (the ground line just outside the door, +Z out);
// the wall is 0.37 behind it, plus 0.1 for every stoop step.

import { definePart } from '@/gen/api';
import { BIKE_PAINT, drawBike, leaningAt } from '@/parts/people/bike';

/**
 * Where the bike leans, in the door's frame: right of the door (clear of its frame and the leaf, which
 * swings the other way), its wheels far enough out that the handlebar's near end and the saddle just touch
 * the wall as it leans back on it.
 */
export function doorBikeSpot(steps: number): { x: number; z: number } {
  const out = 0.17 + Math.max(0, steps) * 0.1;
  return { x: 0.36, z: -(out + 0.2) + 0.075 };
}

export const doorBike = definePart({
  prop: 'door-bike',
  build(item, ctx) {
    const b = ctx.mesh();
    const p = item.params ?? {};
    const at = doorBikeSpot(p.steps ?? 0);
    b.at(leaningAt(at.x, at.z), () => drawBike(b, BIKE_PAINT[(p.paint ?? 0) % BIKE_PAINT.length]!));
    return { mesh: b.build() };
  },
});
