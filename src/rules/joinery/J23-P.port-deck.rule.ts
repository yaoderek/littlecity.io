// J23-P · tier 2 · The port's deck (R-D00). What is fixed to a port, drawn
// with the dock (port-shape.ts says where):
//
//   port-deck   paint on the deck: two crane rails along the seaward rows, a
//               yellow lane line along the yard's edge, the outlines of the
//               container bays
//   port-office the harbour office at the land end of the yard, its door
//               toward the water, a flagstaff on its roof (socket flag-mount)
//   port-mast   two tall floodlight masts at the corners of aisles, lamps that
//               glow at night (socket perch on the lamp gallery)
//
// The cranes and the containers move, so they are not here: D15-P puts the
// cranes and the container bays in the dressing, src/life/port works them.

import { above, DIR4, keyX, keyZ, opposite, type CellKey, type Dir4 } from '@/core/grid';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import type { CellPos } from '@/resolve/plan';
import { portCell, portColumn, portPlanOf, portRules, quayWallsOf, type Port } from '../roles/port-shape';

type Piece =
  | { what: 'deck'; port: Port }
  | { what: 'office'; dir: Dir4 }
  | { what: 'mast'; cx: number; cz: number; pos: CellPos };

/** The floor slot at a cell's corner on the (sx, sz) side. */
function cornerPos(sx: number, sz: number): CellPos {
  return `${sz < 0 ? 'n' : 's'}${sx < 0 ? 'w' : 'e'}` as CellPos;
}

/** The mast's corner: on the land side of its aisle cell, toward i = 0. */
export function mastCorner(p: Port): [number, number] {
  const [ax, az] = DIR4[p.along]!, [lx, lz] = DIR4[p.landward]!;
  return [Math.sign(lx - ax), Math.sign(lz - az)];
}

export default defineRule<Piece>({
  id: 'J23-P.port-deck',
  part: 'joinery',
  tier: 2,
  priority: 765,
  about: 'Reads: port roles, dock cells and what stands on them. Claims: the office’s deck cell, each mast’s corner slot. Emits: port-deck, port-office (socket flag-mount), port-mast (socket perch).',
  find({ facts, plan }) {
    const out: Candidate<Piece>[] = [];
    const walls = quayWallsOf({ structureAt: facts.structureAt, roles: plan.roles });
    for (const s of facts.structures.values()) {
      if (s.kind !== 'dock' || plan.roles.get(s.id)?.role !== 'port') continue;
      const pp = portPlanOf(facts, s.cells, portRules(), walls);
      if (!pp) continue;
      const { port, yard } = pp;
      out.push({ anchor: portCell(port, 0, port.depth - 1), structure: s.id, key: 'deck', data: { what: 'deck', port } });
      if (yard.office) out.push({ anchor: portCell(port, yard.office.i, yard.office.r), structure: s.id, key: 'office', data: { what: 'office', dir: port.seaward } });
      const [cx, cz] = mastCorner(port);
      yard.masts.forEach((m, k) => out.push({ anchor: portCell(port, m.i, m.r), structure: s.id, key: `mast${k}`, data: { what: 'mast', cx, cz, pos: cornerPos(cx, cz) } }));
    }
    return out;
  },
  claims(c) {
    const deck = above(c.anchor);
    if (c.data.what === 'office') return slot.cell(deck);
    if (c.data.what === 'mast') return [slot.floor(deck, c.data.pos)];
    return [];
  },
  apply(c, out) {
    const structure = c.structure!;
    const cell: CellKey = c.anchor;
    const d = c.data;
    if (d.what === 'deck') {
      const [x0, z0] = portColumn(d.port, 0, 0);
      out.feature({ type: 'port-deck', structure, cell, params: { landward: d.port.landward, length: d.port.length, depth: d.port.depth, dx: x0 - keyX(cell), dz: z0 - keyZ(cell) } });
    } else if (d.what === 'office') {
      const id = out.feature({ type: 'port-office', structure, cell, dir: d.dir });
      out.socket({ type: 'flag-mount', owner: id, structure, cell, dir: opposite(d.dir) });
    } else {
      const id = out.feature({ type: 'port-mast', structure, cell, params: { cx: d.cx, cz: d.cz } });
      out.socket({ type: 'perch', owner: id, structure, cell });
    }
  },
});
