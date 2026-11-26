// U20 · tier 2 · Quay apron (discovery round 1, UF-09).
//
// Between a harbour street and its quay the ground is always paved: it is
// the working quay. A run of bare ground (grass or sand, no block, floor or
// other use) straight along x or z from a street to a quay (R-D01) or quay
// wall (R-M05), no more than 4 cells long, is cobbled, flush with the
// street. Along the water side of the apron, one cell in six
// gets a net-drying rack and one in six a stack of barrels or crates.
// Must not: a beach with no quay within 2 (the street runs along the sand:
// that is a beach, not a harbour); a pier or a jetty (they run out into the
// water, and their foot is not a working quay); a cell that is not between
// the two (a corner, a strip beside the street with the sea beyond it).
//
// Stability: each cell's answer depends on the cells within 4 of it; the
// racks and stacks are seeded by their own cells.
//
// Reads: roles (quays, quay walls), streets, wildGrass, landUse, clearways.
// Claims: a 'paving' slot per cell, the slot of each rack and stack.

import { DIR4, keyX, keyZ, neighbor, opposite, type CellKey, type Dir4 } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import { DIRS, groundCell } from '@/resolve/facts/lib';
import type { Slot } from '@/resolve/plan';
import { clearways, edgePos } from '../decoration/clearways.fact';
import { heightAt } from '../decoration/lib';
import { landUse } from './land-use.fact';
import { claimsOf, emit, placer, type Placed } from './plots';

const RULE = 'U20.quay-apron';
/** The most bare cells between a street and a quay that are paved as one working quay. */
const GAP = 4;

export default defineRule<{ items: Placed[]; cells: CellKey[] }>({
  id: RULE,
  part: 'urban',
  tier: 2,
  priority: 800,
  about: 'Reads: quays and quay walls, streets, bare ground, landUse, clearways. Claims: a paving slot per cobbled cell, the slot of each net rack and goods stack.',
  find({ facts, plan, seed }) {
    const clear = clearways(facts);
    const uses = landUse(facts);
    // Columns holding a quay or a quay wall.
    const quay = new Set<number>();
    for (const [id, { role }] of plan.roles) {
      if (role !== 'quay' && role !== 'quay-wall' && role !== 'port') continue;
      for (const c of facts.structures.get(id)?.cells ?? []) quay.add(keyX(c) + keyZ(c) * 64);
    }
    if (!quay.size) return [];
    const isQuay = (x: number, z: number): boolean => quay.has(x + z * 64);
    const isStreet = (x: number, z: number): boolean => {
      const g = groundCell(facts, x, z);
      return g >= 0 && facts.world.floors.get(g) === 'path';
    };
    const bare = (x: number, z: number): boolean => {
      if (heightAt(facts, x, z) <= 0) return false;
      const g = groundCell(facts, x, z);
      return g >= 0 && !facts.kinds.has(g) && !facts.world.floors.has(g) && !uses.byCell.has(g);
    };
    const cells: CellKey[] = [];
    const waterSide = new Map<CellKey, Dir4>();
    // Candidates: bare ground cells near a quay.
    for (const q of quay) {
      const qx = q % 64, qz = Math.floor(q / 64);
      for (let dz = -GAP; dz <= GAP; dz++) {
        for (let dx = -GAP; dx <= GAP; dx++) {
          const x = qx + dx, z = qz + dz;
          if (Math.abs(dx) + Math.abs(dz) > GAP || heightAt(facts, x, z) <= 0) continue;
          const c = groundCell(facts, x, z);
          if (c < 0 || cells.includes(c) || facts.kinds.has(c) || facts.world.floors.has(c) || uses.byCell.has(c)) continue;
          // Between: walking one way over bare ground a street is met, the other way a quay, with no
          // more than GAP bare cells from the street to the quay.
          for (const d of DIRS) {
            const [ux, uz] = DIR4[d]!;
            const walk = (sx: number, sz: number, hit: (x: number, z: number) => boolean): number => {
              for (let k = 1; k <= GAP; k++) {
                const wx = x + sx * k, wz = z + sz * k;
                if (hit(wx, wz)) return k;
                if (!bare(wx, wz)) return 0;
              }
              return 0;
            };
            const toStreet = walk(ux, uz, isStreet), toQuay = walk(-ux, -uz, isQuay);
            if (toStreet && toQuay && toStreet + toQuay - 1 <= GAP) {
              cells.push(c);
              if (toQuay === 1) waterSide.set(c, opposite(d));
              break;
            }
          }
        }
      }
    }
    if (!cells.length) return [];
    cells.sort((a, b) => a - b);
    const set = new Set(cells);
    // One candidate per connected piece of apron.
    const out: Candidate<{ items: Placed[]; cells: CellKey[] }>[] = [];
    const seen = new Set<CellKey>();
    for (const start of cells) {
      if (seen.has(start)) continue;
      const piece: CellKey[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop()!;
        piece.push(c);
        for (const d of DIRS) {
          const n = neighbor(c, d);
          if (set.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      piece.sort((a, b) => a - b);
      const p = placer((c, pos) => clear.free(c, pos));
      for (const c of piece) {
        let mask = 0;
        for (const d of DIRS) if (set.has(neighbor(c, d))) mask |= 1 << d;
        p.put({ type: 'paving', variant: 'cobbles', cell: c, pos: 'nw', face: 2, claim: false, params: { mask } });
      }
      // On the water side: a net rack or a stack of goods now and then.
      for (const c of piece) {
        const d = waterSide.get(c);
        if (d === undefined) continue;
        const roll = hash(seed, RULE, 'goods', c) % 6;
        const look = hash(seed, RULE, 'look', c) % 1000;
        if (roll === 0) p.put({ type: 'net-rack', cell: c, pos: edgePos(d), face: opposite(d), params: { look } });
        else if (roll === 3) p.put({ type: 'goods-stack', variant: look % 2 ? 'barrels' : 'crates', cell: c, pos: edgePos(d), face: opposite(d), params: { look } });
      }
      out.push({ anchor: piece[0]!, data: { items: p.items, cells: piece } });
    }
    return out;
  },
  claims: (c): Slot[] => [...claimsOf(c.data.items), ...c.data.cells.map((cell) => slot.custom('paving', cell))],
  apply: (c, out) => emit(out, c.data.items),
});
