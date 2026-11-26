// L75 · tier 2 · The shipyard's posts (R-D05): for each shipyard,
//   `shipyard|slip|<n>:<ship>`  on the deck at the head of the slip, dir out to sea, structure the dock:
//                               where the ship is built (n cells of slip; ship 'cog' or 'galleon')
//   `shipyard|shed|<slip cell>` outside the timber shed's door, facing it, structure the shed: where the
//                               shipwrights fetch their timber (none if the shed has no door to use)
// src/life/town/chains/shipyard.ts builds the ships and launches them.

import { above } from '@/core/grid';
import { defineRule, type Candidate } from '@/resolve/engine/api';
import { shedOf, yardShape } from '../roles/shipyard-shape';
import { navOf } from './people.lib';
import { doorPlace, type Place } from './town.lib';

type Post = { role: 'slip'; ref: string; dir: number; structure: number } | { role: 'shed'; ref: string; place: Place };

export default defineRule<Post>({
  id: 'L75.shipyard',
  part: 'life',
  tier: 2,
  priority: 250,
  about: 'Reads: shipyard roles, their docks, their sheds, the walking graph. Emits: errand sockets shipyard|slip at the head of the slip and shipyard|shed at the timber shed’s door.',
  find(ctx) {
    const nav = navOf(ctx);
    const out: Candidate<Post>[] = [];
    for (const [id, r] of ctx.plan.roles) {
      if (r.role !== 'shipyard') continue;
      const s = ctx.facts.structures.get(id);
      const yard = s ? yardShape(ctx.facts, s.cells) : null;
      if (!yard) continue;
      const head = above(yard.slip[0]!);
      out.push({ anchor: head, key: 'slip', data: { role: 'slip', ref: `${yard.slip.length}:${yard.ship}`, dir: yard.seaward, structure: id } });
      const shed = shedOf(ctx.plan, yard);
      const place = nav && shed !== null ? doorPlace(nav, shed) : null;
      if (place) out.push({ anchor: place.cell, key: `shed:${head}`, data: { role: 'shed', ref: String(head), place } });
    }
    return out;
  },
  apply(c, out) {
    const d = c.data;
    const id = `L75.shipyard@${c.anchor}:${String(c.key)}`;
    if (d.role === 'slip') out.socket({ id, type: 'errand', cell: c.anchor, dir: d.dir as 0 | 1 | 2 | 3, structure: d.structure, name: `shipyard|slip|${d.ref}` });
    else out.socket({ id, type: 'errand', cell: c.anchor, dir: d.place.dir, structure: d.place.structure, name: `shipyard|shed|${d.ref}` });
  },
});
