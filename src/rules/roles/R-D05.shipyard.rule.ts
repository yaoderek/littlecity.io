// R-D05 · tier 2 · Shipyard: a dock exactly 3 cells wide running
// SHIPYARD.slipMin (6)+ cells straight out from the shore (shipyard-shape.ts),
// with a warehouse or a barn (the timber shed) within SHIPYARD.shedReach of
// its land end. Its middle column is the slipway, where a ship is built from
// the keel up and launched (src/life/town/chains/shipyard.ts); the side
// columns are the working decks.
//
// Emits a `slipway/way` feature on each cell of the middle column (dir out to
// sea; params i, n) and a `slipway/side` on the seaward end of each side deck
// (nothing drawn: J28 sets no mooring piles across the launch). Claims every
// floor slot of the slip's deck (nothing is set down under the ship), the
// seaward slot of each side deck's end (no bollard, so no rowboat, in the
// launch), and the beach slot at the slip's head (no ramp under its bow).
//
// Priority 4993: before the quay (4990), after the port (4995, R-D00).

import { above, DIR4, key, keyX, keyZ, opposite } from '@/core/grid';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import type { Slot } from '@/resolve/plan';
import { SIDE_POS } from './dock-shape';
import { shedOf, yardShape, type YardShape } from './shipyard-shape';

export default defineRule<YardShape>({
  id: 'R-D05.shipyard',
  part: 'roles',
  tier: 2,
  priority: 4993,
  about: 'Reads: dock cells, the terrain and blocks beside them, warehouse and barn roles. Claims: the dock’s role, the slip’s deck, the side decks’ seaward slots, the beach slot at the slip’s head. Emits: slipway (way, side).',
  find({ facts, plan }) {
    const out: Candidate<YardShape>[] = [];
    for (const s of facts.structures.values()) {
      if (s.kind !== 'dock') continue;
      const yard = yardShape(facts, s.cells);
      if (yard && shedOf(plan, yard) !== null) out.push({ anchor: yard.slip[0]!, structure: s.id, data: yard });
    }
    return out;
  },
  claims(c) {
    const y = c.data;
    const out: Slot[] = [];
    for (const cell of y.slip) out.push(...slot.cell(above(cell)));
    const sea = SIDE_POS[y.seaward]!;
    for (const side of [y.left, y.right]) out.push(slot.floor(above(side[side.length - 1]!), sea));
    const head = y.slip[0]!;
    const [lx, lz] = DIR4[opposite(y.seaward)]!;
    out.push(slot.floor(key(keyX(head) + lx, 1, keyZ(head) + lz), sea));
    return out;
  },
  apply(c, out) {
    const structure = c.structure!;
    const y = c.data;
    out.role(structure, 'shipyard');
    const n = y.slip.length;
    y.slip.forEach((cell, i) => out.feature({ type: 'slipway', variant: 'way', structure, cell, dir: y.seaward, params: { i, n } }));
    for (const side of [y.left, y.right]) out.feature({ type: 'slipway', variant: 'side', structure, cell: side[side.length - 1]!, dir: y.seaward });
  },
});
