// D29 · tier 2 · Slip rails: a low timber kerb (`slip-rail`) along both long
// sides of a shipyard's slip (R-D05) and across its head, on the slip's own
// deck cells. The walking graph reads the kerb as a run (src/resolve/nav.ts),
// so nobody walks under the ship on the slip; the shipwrights and the crowd
// stand on the side decks and the shore. R-D05 claimed the slip's slots for
// this: no claims here.

import { above, opposite, turn } from '@/core/grid';
import { defineRule, type Candidate } from '@/resolve/engine/api';
import type { CellPos } from '@/resolve/plan';
import { SIDE_POS } from '../roles/dock-shape';
import { yardShape } from '../roles/shipyard-shape';

export default defineRule<{ pos: CellPos; color: number }>({
  id: 'D29.slip-rails',
  part: 'decoration',
  tier: 2,
  priority: 710,
  about: 'Reads: shipyard roles, their dock cells. Claims: nothing (R-D05 holds the slip’s floor slots for it). Emits: slip-rail props along the slip’s sides and head.',
  find({ facts, plan }) {
    const out: Candidate<{ pos: CellPos; color: number }>[] = [];
    for (const [id, r] of plan.roles) {
      if (r.role !== 'shipyard') continue;
      const s = facts.structures.get(id);
      const yard = s ? yardShape(facts, s.cells) : null;
      if (!s || !yard) continue;
      const sides = [SIDE_POS[turn(yard.seaward, 3)]!, SIDE_POS[turn(yard.seaward, 1)]!];
      yard.slip.forEach((cell, i) => {
        const deck = above(cell);
        for (const pos of sides) out.push({ anchor: deck, structure: id, key: pos, data: { pos, color: s.color } });
        if (i === 0) {
          const pos = SIDE_POS[opposite(yard.seaward)]!;
          out.push({ anchor: deck, structure: id, key: pos, data: { pos, color: s.color } });
        }
      });
    }
    return out;
  },
  apply(c, out) {
    out.prop({ type: 'slip-rail', at: { cell: c.anchor, pos: c.data.pos }, params: { color: c.data.color } });
  },
});
