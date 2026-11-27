// U18 · tier 2 · Orchard (discovery round 1, RC-04).
//
// Trees planted on a grid are an orchard (the orchards fact: six or more
// trees on the ground, each 2 from another along x or z, none right beside
// another, holding a full 2 × 2 of the lattice; on grass or a garden, not on
// a plaza or sand). Must NOT be: a grove (trees touching), a row of street
// trees (no 2 × 2), planter trees on a square.
//
// Dressing: the grass between the rows is mown (the green's sward, a shade
// lighter, no outline); a ladder leans into one tree in four, a basket of
// apples stands under another one in four; two straw beehives on the
// orchard's sunniest edge. Sockets for the life builder: each ladder's
// 'activity'/'pick', each basket's 'activity'/'basket'.
//
// The trees themselves are drawn by their species role (R-P01, the
// structures builder's): an orchard tree is a fruit tree only once R-P01
// reads the orchards fact (docs/swarm/requests/disc1-fill.md).
//
// Stability: each tree's roll is its own cell's; the beehives are seeded by
// the orchard's first tree.
//
// Reads: orchards, landUse (the orchard's grass), clearways, the trees'
// roles (a fruit tree's ladder rests in its fork). Claims: the
// slots of its ladders, baskets and hives; the sward claims nothing.

import { keyX, keyY, keyZ, neighbor, NO_CELL, opposite, type CellKey, type Dir4 } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineRule, type Candidate } from '@/resolve/engine/api';
import { DIRS } from '@/resolve/facts/lib';
import { clearways, edgePos } from '../decoration/clearways.fact';
import { landUse } from './land-use.fact';
import { claimsOf, emit, placer, type Placed } from './plots';

const RULE = 'U18.orchard';

export default defineRule<Placed[]>({
  id: RULE,
  part: 'urban',
  tier: 2,
  priority: 820,
  about: 'Reads: orchards (trees on a grid of spacing 2), landUse (the grass between them), clearways, the trees\' roles (a fruit tree\'s ladder rests in its fork). Claims: the slots of its ladders, baskets and hives; the mown sward claims nothing.',
  find({ facts, seed, plan }) {
    const clear = clearways(facts);
    const out: Candidate<Placed[]>[] = [];
    for (const use of landUse(facts).orchards) {
      const o = use.orchard;
      const grass = new Set(use.cells);
      const treeSet = new Set(o.trees);
      const p = placer((c, pos) => clear.free(c, pos));
      const look = (k: string, c: CellKey): number => hash(seed, RULE, k, c) % 1000;
      for (const c of use.cells) {
        let mask = 0;
        for (const d of DIRS) {
          const n = neighbor(c, d);
          if (grass.has(n) || treeSet.has(n)) mask |= 1 << d;
        }
        p.put({ type: 'sward', cell: c, pos: 'nw', face: 2, claim: false, params: { mask, stripe: (keyX(c) % 2) as 0 | 1, level: keyY(c) } });
      }
      for (const t of o.trees) {
        const roll = hash(seed, RULE, 'tree', t) % 4;
        if (roll > 1) continue;
        // A fruit tree's ladder rests in its fork (the ladder part); `tree` names the tree, so that the
        // ladder is drawn again when another tree is planted there.
        const sid = plan.structureAt.get(t);
        const lean: Record<string, number> = sid !== undefined && plan.roles.get(sid)?.role === 'fruit-tree' ? { tree: sid } : {};
        // The side of the tree it is set on: the first open grass side, seeded.
        const start = hash(seed, RULE, 'side', t) % 4;
        for (let k = 0; k < 4; k++) {
          const d = ((start + k) % 4) as Dir4;
          const n = neighbor(t, d);
          if (n === NO_CELL || !grass.has(n)) continue;
          const ok =
            roll === 0
              ? p.put({ type: 'ladder', cell: n, pos: edgePos(opposite(d)), face: d, activities: ['pick'], params: { back: 0.42, look: look('ladder', t), ...lean } })
              : p.put({ type: 'basket', variant: 'apples', cell: n, pos: edgePos(opposite(d)), face: d, activities: ['basket'], params: { look: look('basket', t) } });
          if (ok) break;
        }
      }
      // Two beehives on the southern edge (the sunny side), facing out of the orchard.
      const zs = use.cells.map(keyZ);
      const south = use.cells.filter((c) => keyZ(c) === Math.max(...zs)).sort((a, b) => hash(seed, RULE, 'hive', a) - hash(seed, RULE, 'hive', b));
      let hives = 0;
      for (const c of south) {
        if (hives >= 2) break;
        if (p.put({ type: 'beehive', cell: c, pos: 's', face: 2, params: { look: look('hive', c) } })) hives++;
      }
      if (p.items.length) out.push({ anchor: o.trees[0]!, data: p.items });
    }
    return out;
  },
  claims: (c) => claimsOf(c.data),
  apply: (c, out) => emit(out, c.data),
});
