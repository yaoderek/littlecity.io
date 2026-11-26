// L18 · tier 2 · Fishing boat (town-wide; "Boats and ships": fit is the only
// test). Any dock it fits beside, reachable from the sea, keeps a fishing
// boat: it lies at a berth beside the docks overnight,
// leaves at dawn for the sea lane, works its way round it through the day
// and comes home at dusk with the gulls trailing after it
// (src/life/boats/fishing-boat.behaviour.ts).
//
// The berth is the open-water column beside a dock with the most open water
// round it (ties: the lowest dock key, then N, E, S, W): the boat lies along
// the dock with its bow to the open sea. No lane, or no such column: no boat.

import { columnIndex, DIR4, inColumnBounds, key, keyX, keyY, keyZ } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineRule } from '@/resolve/engine/api';
import type { Facts } from '@/resolve/facts/api';
import { edgeWater } from './berths.fact';
import { seaLane } from './sea-lanes.fact';

interface Berth {
  x: number;
  z: number;
  yaw: number;
}

const open = (facts: Facts, x: number, z: number): boolean =>
  inColumnBounds(x, z) && facts.terrain.height[columnIndex(x, z)] === 0 && !facts.kinds.has(key(x, 0, z));

/** The fishing boat's berth for a town, or null. Pure. */
export function berthOf(facts: Facts): Berth | null {
  let best: Berth | null = null;
  let bestScore = -1;
  // Not at a shipyard (R-D05): its ships are launched into that water.
  const yard = new Set<number>();
  if (facts.shapeReady) for (const [id, r] of facts.shape.roles) if (r.role === 'shipyard') for (const c of facts.structures.get(id)?.cells ?? []) yard.add(c);
  const docks = [...facts.kinds].filter(([c, k]) => k === 'dock' && keyY(c) === 0 && !yard.has(c)).map(([c]) => c).sort((a, b) => a - b);
  // Only where it could have got in from the sea.
  const reach = facts.shapeReady ? edgeWater(facts) : null;
  for (const c of docks) {
    for (const [dx, dz] of DIR4) {
      const x = keyX(c) + dx, z = keyZ(c) + dz;
      if (!open(facts, x, z) || (reach && !reach[columnIndex(x, z)])) continue;
      let wet = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (open(facts, x + i + dx, z + j + dz)) wet++;
      if (wet > bestScore) {
        bestScore = wet;
        // Lying along the dock, bow toward the open water side (whichever way along it has more sea).
        const ax = -dz, az = dx;
        const ahead = open(facts, x + ax * 2, z + az * 2) ? 1 : -1;
        best = { x: x + 0.5, z: z + 0.5, yaw: Math.atan2(ax * ahead, az * ahead) };
      }
    }
  }
  return best;
}

export default defineRule<Berth>({
  id: 'L18.fishing-boat',
  part: 'life',
  tier: 2,
  priority: 820,
  townWide: true,
  about: 'Reads: dock cells, the sea lane, open water by the docks reachable from the sea. Emits: one fishing boat (at = null) with its berth beside any dock it fits.',
  find({ facts }) {
    if (seaLane(facts).kind === 'none') return [];
    const berth = berthOf(facts);
    return berth ? [{ anchor: key(0, 0, 0), key: 0, data: berth }] : [];
  },
  apply(c, out, ctx) {
    const r = (v: number): number => Math.round(v * 1000) / 1000;
    out.actor({ type: 'fishing-boat', at: null, params: { look: hash(ctx.seed, 'L18', 'look') % 12, berthX: r(c.data.x), berthZ: r(c.data.z), berthYaw: r(c.data.yaw) } });
  },
});
