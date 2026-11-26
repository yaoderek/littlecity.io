// D15 · tier 2 · Dock goods.
//
// What lies about on a working dock, on the deck cells and off the walking
// line: a coil of rope (DRESSING.dockRope of deck cells), lobster pots
// (dockPots), a stack of crates or barrels on quays (dockCrates; J23
// already stacks goods along a quay's shore side and those cells are left
// alone), and on a dock of four cells or more one rack of nets hung to dry.
// One thing to a cell at most, never on the pier's head (its seat and its
// lamp are there), never on a ramp.
//
// Stability: each deck cell rolls for itself; the net rack's cell is chosen
// by the dock's own seed.
//
// Reads: dock structures and roles, pier-head, ramp and dock-goods features,
// clearways. Claims: the floor slot it stands on, and one thing per cell.

import { keyY, type CellKey } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import type { CellPos } from '@/resolve/plan';
import { DRESSING } from '@/style/dressing';
import { clearways } from './clearways.fact';
import { lucky } from './lib';

const RULE = 'D15.dock-goods';
const CORNERS: readonly CellPos[] = ['ne', 'se', 'sw', 'nw'];
const EDGES: readonly CellPos[] = ['n', 'e', 's', 'w'];
type Thing = 'rope' | 'pots' | 'crates' | 'barrels' | 'nets';

export default defineRule<{ thing: Thing; pos: CellPos }>({
  id: RULE,
  part: 'decoration',
  tier: 2,
  priority: 850,
  about: 'Reads: dock structures and roles, pier-head, ramp and dock-goods features, clearways. Claims: the floor slot of each thing, one thing per deck cell.',
  find({ facts, plan, seed }) {
    const clear = clearways(facts);
    const out: Candidate<{ thing: Thing; pos: CellPos }>[] = [];
    for (const s of facts.structures.values()) {
      if (s.kind !== 'dock') continue;
      const role = plan.roles.get(s.id)?.role;
      // A port's deck is its yard (D15-P).
      if (role === 'port') continue;
      const skip = new Set<CellKey>();
      for (const f of plan.featuresByStructure.get(s.id) ?? []) {
        if ((f.type === 'pier-head' || f.type === 'ramp' || f.type === 'dock-goods' || f.type === 'dock-crane') && f.cell !== undefined) skip.add(f.cell);
      }
      // The deck: the cell above each dock block that has nothing on it.
      const deck = s.cells.filter((c) => !skip.has(c) && !facts.kinds.has(c + (1 << 12)) && keyY(c) < 30).map((c) => c + (1 << 12));
      const pick = (cell: CellKey, from: readonly CellPos[], salt: string): CellPos | undefined => {
        const start = hash(seed, RULE, salt, cell) % from.length;
        for (let i = 0; i < from.length; i++) {
          const pos = from[(start + i) % from.length]!;
          if (clear.free(cell, pos)) return pos;
        }
        return undefined;
      };
      const rack = s.cells.length >= 4 && deck.length ? deck[hash(s.seed, RULE, 'rack') % deck.length]! : -1;
      for (const cell of deck) {
        let thing: Thing | undefined;
        if (cell === rack) thing = 'nets';
        else if (lucky(seed, RULE, cell, 'rope', DRESSING.dockRope)) thing = 'rope';
        else if (lucky(seed, RULE, cell, 'pots', DRESSING.dockPots)) thing = 'pots';
        else if (role === 'quay' && lucky(seed, RULE, cell, 'crates', DRESSING.dockCrates)) thing = hash(seed, RULE, 'kind', cell) % 2 ? 'crates' : 'barrels';
        if (!thing) continue;
        // Stacks need the middle of the cell (they would hang over the edge from a corner); nets hang along an edge.
        const pos = thing === 'crates' || thing === 'barrels' ? (clear.free(cell, 'c') ? 'c' : undefined) : pick(cell, thing === 'nets' ? EDGES : CORNERS, thing);
        if (pos) out.push({ anchor: cell, structure: s.id, data: { thing, pos } });
      }
    }
    return out;
  },
  claims: (c) => [slot.floor(c.anchor, c.data.pos), slot.custom(RULE, c.anchor)],
  apply(c, out, ctx) {
    const at = { cell: c.anchor, pos: c.data.pos };
    const look = hash(ctx.seed, RULE, 'look', c.anchor) % 1000;
    const thing = c.data.thing;
    if (thing === 'rope') out.prop({ type: 'rope-coil', at });
    else if (thing === 'pots') out.prop({ type: 'lobster-pot', at, params: { look } });
    else if (thing === 'nets') out.prop({ type: 'net-rack', at, params: { look } });
    else out.prop({ type: 'goods-stack', variant: thing, at, params: { look } });
  },
});
