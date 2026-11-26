// D15-P · tier 2 · The port's yard (R-D00): what on a port moves, put in
// the dressing for the port's life (src/life/port) to work.
//
//   port-crane  an actor on each crane's home deck cell (on the inner crane
//               row, facing the water), medium or large (port-shape.ts says
//               how many, which and where); params look and off (its middle
//               along the rails from the cell's)
//   port-stack  a prop on each deck cell of a container bay: drawn as
//               nothing, it tells the walking graph the cell is cluttered,
//               so people and carters keep to the aisles
//   flag        on the harbour office's flagstaff (J23-P's flag-mount)
//
// The containers themselves are life: their stacks rise and fall as ships
// unload and load.

import { above, DIR4, type CellKey, type Dir4 } from '@/core/grid';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import { socketsOfType } from '@/resolve/facts/plan-index.fact';
import { portCell, portPlanOfStructure, type CraneSpot } from '../roles/port-shape';
import { townColor } from './lib';

type Item =
  | { what: 'crane'; crane: CraneSpot; face: Dir4; off: number; sign: 1 | -1; index: number }
  | { what: 'stack' }
  | { what: 'flag'; socket: string };

/** The sign of the along direction in a frame facing `face` (the frame's +X is Z turned a quarter clockwise). */
export function alongSign(face: Dir4, along: Dir4): 1 | -1 {
  const [zx, zz] = DIR4[face]!;
  const [ax, az] = DIR4[along]!;
  return zz * ax - zx * az >= 0 ? 1 : -1;
}

export default defineRule<Item>({
  id: 'D15-P.port-yard',
  part: 'decoration',
  tier: 2,
  priority: 855,
  about: 'Reads: port roles, the port’s shape, the office’s flag-mount. Claims: each container bay’s deck cells, each crane’s home slot, the flagstaff. Emits: port-crane actors, port-stack props, the office flag.',
  find({ facts, plan }) {
    const out: Candidate<Item>[] = [];
    for (const s of facts.structures.values()) {
      if (s.kind !== 'dock') continue;
      const pp = portPlanOfStructure(plan, s.id);
      if (!pp) continue;
      const { port, yard, cranes } = pp;
      cranes.forEach((crane, index) => {
        const i = Math.max(0, Math.min(port.length - 1, Math.floor(crane.at)));
        const anchor = above(portCell(port, i, port.depth - 2));
        const sign = alongSign(port.seaward, port.along);
        const off = (crane.at - (i + 0.5)) * sign;
        out.push({ anchor, structure: s.id, key: `crane${index}`, data: { what: 'crane', crane, face: port.seaward, off, sign, index } });
      });
      for (const st of yard.stacks) {
        for (const i of [st.i, st.i + 1]) out.push({ anchor: above(portCell(port, i, st.r)), structure: s.id, key: 'stack', data: { what: 'stack' } });
      }
    }
    for (const sk of socketsOfType(facts, 'flag-mount')) {
      const owner = sk.owner === undefined ? undefined : plan.features.find((f) => f.id === sk.owner);
      if (owner?.type === 'port-office') out.push({ anchor: sk.cell, structure: sk.structure, key: 'flag', data: { what: 'flag', socket: sk.id } });
    }
    return out;
  },
  claims(c) {
    if (c.data.what === 'flag') return [slot.socket(c.data.socket)];
    if (c.data.what === 'stack') return slot.cell(c.anchor);
    return [slot.floor(c.anchor, 'c'), slot.custom('D15-P', 'crane', c.anchor)];
  },
  apply(c, out, ctx) {
    const d = c.data;
    const cell: CellKey = c.anchor;
    if (d.what === 'stack') out.prop({ type: 'port-stack', at: { cell, pos: 'c' } });
    else if (d.what === 'flag') out.prop({ type: 'flag', variant: 'pennant', at: { socket: d.socket }, params: { color: townColor(ctx.seed), look: Math.floor(ctx.rand('look') * 100), staff: 0.62 } });
    else {
      // Its travel along the rails, in its own frame's X (which may run against the port's `along`).
      const a = d.sign * (d.crane.lo - d.crane.at), b = d.sign * (d.crane.hi - d.crane.at);
      const r = (v: number): number => Math.round(v * 1000) / 1000;
      out.actor({ type: 'port-crane', variant: d.crane.kind, at: { cell, pos: 'c', face: d.face }, params: { look: Math.floor(ctx.rand('look') * 2) + d.index, off: r(d.off), lo: r(Math.min(a, b)), hi: r(Math.max(a, b)) } });
    }
  },
});
