// J23 · tier 1 · Dock body. The deck, its stilts and bracing are drawn by
// the dock generator from the dock's own cells (planks along the run, stilts
// at corners and every 2 cells, cross-bracing on outer edges). This rule
// adds what is fitted to the deck, by role:
//
//   jetty      a wooden mooring post on about every other cell
//   pier       mooring posts down alternate sides, clear of the pier head
//   quay       iron bollards along the open edge, a stack of goods at one end
//              against the shore, and a hoist crane once the dock has 8+ cells
//   boardwalk  nothing (it has rope railings)
//   port       iron bollards along the open edges, like a quay; its cranes,
//              office and floodlights are J23-P's
//
// Every bollard owns a 'mooring' socket on the water below it. Each piece
// claims the deck slot it stands on, so later rules keep clear of it.

import { above, keyX, keyZ, neighbor, opposite, turn, type CellKey, type Dir4 } from '@/core/grid';
import { rand } from '@/core/rand';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import type { Facts } from '@/resolve/facts/api';
import type { CellPos, ShapePlan, Structure } from '@/resolve/plan';
import { DOCK } from '@/style/dock';
import { deckTaken, DIRS, dockSide, pierOf, quayOf, SIDE_POS } from '../roles/dock-shape';

type Fitting =
  | { what: 'bollard'; dir: Dir4; variant: 'post' | 'iron'; fender: 0 | 1 }
  | { what: 'goods'; dir: Dir4; variant: 'crates' | 'barrels' }
  | { what: 'crane'; dir: Dir4 };

/** The three floor slots along side `d` of a cell: the side itself and its two corners. */
const ALONG: readonly (readonly CellPos[])[] = [['nw', 'n', 'ne'], ['ne', 'e', 'se'], ['sw', 's', 'se'], ['nw', 'w', 'sw']];

function fittings(f: Facts, plan: ShapePlan, s: Structure): Candidate<Fitting>[] {
  const out: Candidate<Fitting>[] = [];
  const role = plan.roles.get(s.id)?.role;
  if (role === 'boardwalk') return out;
  const taken = new Set((plan.featuresByStructure.get(s.id) ?? []).map((ft) => `${ft.cell}:${ft.dir}`));
  // A tyre fender hangs only over deep water, not where the beach comes up under the deck.
  const fender = (cell: CellKey, dir: Dir4): 0 | 1 =>
    rand(f.seed, 'J23', 'fender', cell, dir) < DOCK.fender && !DIRS.some((d) => dockSide(f, cell, d) === 'land') ? 1 : 0;
  const bollard = (cell: CellKey, dir: Dir4, variant: 'post' | 'iron'): void => {
    if (deckTaken(f, cell) || taken.has(`${cell}:${dir}`) || dockSide(f, cell, dir) !== 'open') return;
    out.push({ anchor: cell, structure: s.id, key: `b${dir}`, data: { what: 'bollard', dir, variant, fender: fender(cell, dir) } });
  };

  if (role === 'quay' || role === 'port') {
    const quay = quayOf(f, s.cells, DOCK.quayCells);
    if (quay && role === 'quay') {
      const seaward = opposite(quay.landward);
      // The crane stands on the outer edge, half-way along.
      if (s.cells.length >= DOCK.craneCells) {
        let cell = quay.cells[quay.cells.length >> 1]!;
        while (dockSide(f, cell, seaward) === 'dock') cell = neighbor(cell, seaward);
        if (dockSide(f, cell, seaward) === 'open' && !deckTaken(f, cell)) out.push({ anchor: cell, structure: s.id, key: 'crane', data: { what: 'crane', dir: seaward } });
      }
      // Goods wait against the shore at one end of the row.
      const cell = rand(f.seed, 'J23', 'goods-end', s.id) < 0.5 ? quay.cells[0]! : quay.cells[quay.cells.length - 1]!;
      if (!deckTaken(f, cell)) {
        const variant = rand(f.seed, 'J23', 'goods', s.id) < 0.5 ? 'crates' : 'barrels';
        out.push({ anchor: cell, structure: s.id, key: 'goods', data: { what: 'goods', dir: quay.landward, variant } });
      }
    }
    // Iron bollards along the water side, on every other cell.
    for (const cell of s.cells) {
      if (((keyX(cell) + keyZ(cell)) & 1) !== 0) continue;
      const open = DIRS.filter((d) => dockSide(f, cell, d) === 'open');
      const seaward = quay ? opposite(quay.landward) : undefined;
      if (seaward !== undefined && open.includes(seaward)) bollard(cell, seaward, 'iron');
      else if (open.length) bollard(cell, open[0]!, 'iron');
    }
    return out;
  }

  const pier = role === 'pier' ? pierOf(f, s.cells, DOCK.pierCells) : null;
  if (pier) {
    const sides: Dir4[] = [turn(pier.seaward, 1), turn(pier.seaward, 3)];
    for (let i = 1; i < pier.cells.length - 1; i += 2) bollard(pier.cells[i]!, sides[(i >> 1) & 1]!, 'post');
    return out;
  }

  // A jetty: a post on about one cell in three (always at least one), on a seeded open side.
  const post = (cell: CellKey): boolean => {
    const open = DIRS.filter((d) => dockSide(f, cell, d) === 'open' && !taken.has(`${cell}:${d}`));
    if (!open.length || deckTaken(f, cell)) return false;
    bollard(cell, open[Math.floor(rand(f.seed, 'J23', 'side', cell) * open.length)]!, 'post');
    return true;
  };
  let posts = 0;
  for (const cell of s.cells) if ((keyX(cell) + 2 * keyZ(cell)) % 3 === 0 && post(cell)) posts++;
  if (posts === 0) s.cells.some(post);
  return out;
}

export default defineRule<Fitting>({
  id: 'J23.dock-body',
  part: 'joinery',
  tier: 1,
  priority: 770,
  about: 'Reads: dock roles, dock cells and what is beside them. Claims: the deck slot under each bollard, goods stack and crane. Emits: bollard (socket mooring), dock-goods, dock-crane (socket perch).',
  find({ facts, plan }) {
    const out: Candidate<Fitting>[] = [];
    for (const s of facts.structures.values()) if (s.kind === 'dock') out.push(...fittings(facts, plan, s));
    // The crane first where it shares a cell with a bollard: it takes the whole cell.
    return out.sort((a, b) => (a.data.what === 'crane' ? 0 : 1) - (b.data.what === 'crane' ? 0 : 1));
  },
  claims(c) {
    const deck = above(c.anchor);
    if (c.data.what === 'crane') return slot.cell(deck);
    if (c.data.what === 'goods') return ALONG[c.data.dir]!.map((p) => slot.floor(deck, p));
    return [slot.floor(deck, SIDE_POS[c.data.dir]!)];
  },
  apply(c, out) {
    const structure = c.structure!;
    const cell = c.anchor;
    const d = c.data;
    if (d.what === 'bollard') {
      const id = out.feature({ type: 'bollard', structure, cell, dir: d.dir, variant: d.variant, params: { fender: d.fender } });
      out.socket({ type: 'mooring', owner: id, structure, cell, dir: d.dir });
    } else if (d.what === 'goods') {
      out.feature({ type: 'dock-goods', structure, cell, dir: d.dir, variant: d.variant });
    } else {
      const id = out.feature({ type: 'dock-crane', structure, cell, dir: d.dir });
      out.socket({ type: 'perch', owner: id, structure, cell, dir: d.dir });
    }
  },
});
