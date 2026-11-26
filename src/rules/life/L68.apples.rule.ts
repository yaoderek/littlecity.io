// L68 · tier 2 · Apples to market. An orchard's big baskets (U18's 'activity'/'basket' sockets: the
// pickers tip their apples into them at harvest) and the places the apples are sold: the nearest
// one or two market stalls that sell fruit, else any market stall, else a shop, within APPLE_REACH
// of a basket that can be walked to. Posts (`errand` sockets, name `apples|<role>|<ref>`):
//
//   apples|basket|<prop id>   at an orchard basket that has somewhere to sell (ref: the basket prop)
//   apples|sell|stall         in front of a market stall's counter (the apples go on the counter)
//   apples|sell|door          outside a shop's door (the apples go by the door)
//
// An orchard with nowhere to sell gets no posts (the pickers fill the basket as before, and that is
// all). Reads only: it gives nothing a role. src/life/town/chains/apples.ts runs it.

import { defineRule, type Candidate } from '@/resolve/engine/api';
import type { StructureId } from '@/resolve/plan';
import { navOf, steps } from './people.lib';
import { byNearness, doorPlace, joined, stallPlace, type Place } from './town.lib';

/** The farthest (grid steps) apples are carried from the orchard. */
export const APPLE_REACH = 24;

interface Data {
  role: 'basket' | 'sell';
  ref: string;
  dir?: Place['dir'];
  structure?: StructureId;
}

export default defineRule<Data>({
  id: 'L68.apples',
  part: 'life',
  tier: 2,
  priority: 320,
  townWide: true,
  about: 'Reads: orchard baskets (U18 activity sockets), market stalls (goods:fruit first), shops, the walking graph. Emits: errand sockets apples|basket and apples|sell.',
  find(ctx) {
    const nav = navOf(ctx);
    if (!nav) return [];
    const { facts, plan } = ctx;
    const baskets = (ctx.dressing?.sockets ?? []).filter((s) => s.type === 'activity' && s.name === 'basket' && s.owner !== undefined && nav.nodeAt.has(s.cell));
    if (baskets.length === 0) return [];
    const fruit: (Place & { ref: string })[] = [], stalls: (Place & { ref: string })[] = [], shops: (Place & { ref: string })[] = [];
    for (const s of [...facts.structures.values()].sort((a, b) => a.id - b.id)) {
      const role = plan.roles.get(s.id)?.role;
      if (role === 'market-stall') {
        const at = stallPlace(ctx, nav, s.id);
        if (at) (plan.tags.get(s.id)?.has('goods:fruit') ? fruit : stalls).push({ ...at, ref: 'stall' });
      } else if (role === 'shop') {
        const at = doorPlace(nav, s.id);
        if (at) shops.push({ ...at, ref: 'door' });
      }
    }
    const first = baskets[0]!.cell;
    const near = (list: (Place & { ref: string })[]) => byNearness(first, list.filter((p) => joined(nav, p.cell, first) && baskets.some((b) => steps(b.cell, p.cell) <= APPLE_REACH)));
    // Fruit stalls first; then other stalls; a shop only if there is no stall.
    const sells = [...near(fruit), ...near(stalls)].slice(0, 2);
    if (sells.length === 0) sells.push(...near(shops).slice(0, 1));
    if (sells.length === 0) return [];
    const out: Candidate<Data>[] = [];
    for (const b of baskets) {
      if (!sells.some((s) => joined(nav, s.cell, b.cell))) continue;
      out.push({ anchor: b.cell, key: `basket:${b.owner}`, data: { role: 'basket', ref: b.owner!, ...(b.dir !== undefined ? { dir: b.dir } : {}) } });
    }
    sells.forEach((s, i) => out.push({ anchor: s.cell, key: `sell${i}`, data: { role: 'sell', ref: s.ref, dir: s.dir, structure: s.structure } }));
    return out;
  },
  apply(c, out) {
    const d = c.data;
    out.socket({
      id: `L68.apples@${c.anchor}:${String(c.key)}`,
      type: 'errand',
      cell: c.anchor,
      ...(d.dir !== undefined ? { dir: d.dir } : {}),
      ...(d.structure !== undefined ? { structure: d.structure } : {}),
      name: `apples|${d.role}|${d.ref}`,
    });
  },
});
