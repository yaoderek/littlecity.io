// R-D00 · tier 2 · Port: a dock whose cells fill a rectangle 3+ deep and
// 6+ long against the shore, with open water off its far side (the shape:
// port-shape.ts). It runs before the quay (R-D01): a port keeps everything a
// quay has (bollards along the water, a berth for big ships, carters) and
// gets container cranes, a yard of containers, an office and floodlights
// (J23-P, D15-P), and cargo ships (L38-F).
//
// Rarer than a quay by design: it takes filling in a big block of sea.

import { defineRule, type Candidate } from '@/resolve/engine/api';
import { portOf, portRules, quayWallsOf } from './port-shape';

export default defineRule({
  id: 'R-D00.port',
  part: 'roles',
  tier: 2,
  priority: 4995,
  about: 'Reads: dock cells, the terrain and quay walls beside them, open water off them. Claims: the dock’s role.',
  find({ facts, plan }) {
    const out: Candidate[] = [];
    const wall = quayWallsOf({ structureAt: facts.structureAt, roles: plan.roles });
    const rules = portRules();
    for (const s of facts.structures.values()) {
      if (s.kind !== 'dock') continue;
      if (portOf(facts, s.cells, rules, wall)) out.push({ anchor: s.cells[0]!, structure: s.id });
    }
    return out;
  },
  apply(c, out) {
    out.role(c.structure!, 'port');
  },
});
