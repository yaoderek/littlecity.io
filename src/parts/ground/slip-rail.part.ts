// D29: a low timber kerb along one edge of a shipyard's slip, on the slip's
// side of the line: it keeps feet off the slip (the walking graph reads it as
// a run) and draws the slip's edge, where the deck under the ways meets the
// working decks. Each cell's piece meets the next end to end.
//
// Frame: an edge floor slot of the slip's deck cell, +Z toward the cell's
// middle; the edge is at z = −(0.5 − SLOT_INSET).

import { definePart } from '@/gen/api';
import { dockColors } from '@/gen/dock/wood';
import { SLOT_INSET } from '@/gen/frames';
import { PATTERN } from '@/gen/mesh';

const LINE = -(0.5 - SLOT_INSET);

export default definePart({
  prop: 'slip-rail',
  build(item, ctx) {
    const b = ctx.mesh();
    const wood = dockColors(item.params?.color ?? 0);
    b.with({ color: wood.frame, pattern: PATTERN.timber, ink: 'kerb' }, () => b.box([-0.5, 0, LINE + 0.004], [0.5, 0.06, LINE + 0.07], { skip: ['bottom'] }));
    b.with({ color: wood.pale, pattern: PATTERN.none, ink: 'kerb-top' }, () => b.box([-0.5, 0.06, LINE + 0.012], [0.5, 0.068, LINE + 0.062], { skip: ['bottom'] }));
    return { mesh: b.build() };
  },
});
