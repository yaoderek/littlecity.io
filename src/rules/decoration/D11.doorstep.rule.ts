// D11 · tier 2 · Doorstep.
//
// What stands at a house door that opens at ground level: a doormat,
// always; a pair of potted plants (DRESSING.doorPots); a barrel
// (doorBarrel); a bicycle leaning on the wall (doorBicycle, only where the
// door faces a street: its own prop, 'door-bike', which its owner rides off
// on; the doorstep keeps its place); and where the door faces a street or a square, a
// small lantern on the wall beside it, which glows at night and owns a
// 'lamp-head' socket.
//
// It is ONE prop per door, drawn against the wall beside the door and on
// the ground just in front of it, so it never stands in the doorway. The
// pots take the house's own flower colour (its window boxes and front
// garden match).
//
// The mat lies on what is in front of the door, a hair over it (params
// `ground`, which the part turns into a height: 0 bare ground, 1 a path,
// 2 a plaza, 3 a dock deck, an arch's deck or a house's terrace, 4 a marble
// top, 5 a courtyard's cobbles (D17 lays them on bare ground later)). Where
// two doors open onto one cell (round a corner) only the first gets a mat. Not in a garden (beds and plants),
// on stairs, under a tree or a stall, or across a fence or a wall on that
// side: there is no flat place for it there (`mat` 0). It is sized to the
// door (`door`: 0 a house door, 1 a shop door, 2 a double door) and laid
// beyond the swing of the leaf, which opens outward. (It claims no floor
// position: a front garden's gate (U03) may share the cell; doors' fronts are
// kept clear by the clearways the other rules read. D11.doorstep.test.ts holds
// every mat clear of every other prop.)
//
// Stability: each door rolls for itself, seeded by its own cell and feature id.
//
// Reads: door features and their sockets, facades (what the door faces),
// the role props R-H99 placed at the door.
// Claims: the door's socket.

import { below, columnIndex, inColumnBounds, keyX, keyY, keyZ, neighbor, NO_CELL, type CellKey, type Dir4 } from '@/core/grid';
import { hash } from '@/core/rand';
import { defineRule, slot, type Candidate } from '@/resolve/engine/api';
import type { ShapePlan } from '@/resolve/plan';
import { facades } from '@/resolve/facts/facades.fact';
import { DRESSING } from '@/style/dressing';
import { landUse } from '../urban/land-use.fact';
import { lucky } from './lib';

const RULE = 'D11.doorstep';

interface Step {
  socket: string;
  steps: number;
  street: boolean;
  lit: boolean;
  /** R-H99 already put this role's things at the door: only the mat from here. */
  busy: boolean;
  /** The surface the mat lies on (the part's `ground` code); null: no mat. */
  ground: number | null;
  door: number;
}

/**
 * What lies just outside a door, `drop` levels down: which surface (the `ground` param), and the cell
 * it is in. Null where a mat has no flat place.
 */
function matGround(plan: ShapePlan, courts: ReadonlySet<CellKey>, cell: CellKey, dir: Dir4, drop: number): { ground: number; cell: CellKey } | null {
  let out = neighbor(cell, dir);
  for (let i = 0; i < drop && out !== NO_CELL; i++) out = below(out);
  if (out === NO_CELL) return null;
  if (plan.kinds.get(out) !== undefined) return null; // stairs, a tree, a stall, a lamp…
  // Not where a dock's ramp comes ashore.
  if (plan.features.some((f) => f.type === 'ramp' && f.cell !== undefined && f.dir !== undefined && [out, below(out)].includes(neighbor(f.cell, f.dir as Dir4)))) return null;
  const floor = plan.world.floors.get(out);
  if (floor === 'path') return { ground: 1, cell: out };
  if (floor === 'plaza') return { ground: 2, cell: out };
  if (floor !== undefined) return null; // a garden: beds and plants
  const x = keyX(out), z = keyZ(out);
  if (!inColumnBounds(x, z)) return null;
  if (plan.terrain.height[columnIndex(x, z)] === keyY(out)) return { ground: courts.has(out) ? 5 : 0, cell: out };
  const under = below(out);
  const u = under === NO_CELL ? undefined : plan.kinds.get(under);
  // Not on a dock cell that carries something of its own (a ramp, bollards, a crane, goods).
  if (u === 'dock' && plan.features.some((f) => f.cell === under)) return null;
  if (u === 'dock' || u === 'arch' || u === 'house') return { ground: 3, cell: out };
  if (u === 'marble') return { ground: 4, cell: out };
  return null;
}

export default defineRule<Step>({
  id: RULE,
  part: 'decoration',
  tier: 2,
  priority: 890,
  about: 'Reads: door features and sockets on houses, facades (street or plaza in front, edge pieces), kinds, floors, terrain and courtyards (landUse) outside the door. Claims: the door socket.',
  find({ facts, plan, dressing }) {
    const all = facades(facts);
    const out: Candidate<Step>[] = [];
    const courts = new Set(landUse(facts).courtyards.flatMap((c) => c.cells));
    const matted = new Set<CellKey>();
    // A house whose role already dressed its door (R-H99: an inn's lantern, a mill's sacks and cart,
    // a lookout's telescope, a boathouse's slipway) keeps that.
    const role = new Map<number, string[]>();
    for (const p of dressing?.props ?? []) {
      if (p.type !== 'role-prop') continue;
      const cell = Number(/@(\d+):/.exec(p.id)?.[1] ?? -1);
      role.set(cell, [...(role.get(cell) ?? []), p.variant ?? '']);
    }
    for (const f of plan.features) {
      if (f.type !== 'door' || f.cell === undefined || f.dir === undefined) continue;
      if (f.variant === 'hatch' || f.variant === 'deck' || facts.kinds.get(f.cell) !== 'house') continue;
      const fc = all.at(f.cell, f.dir as Dir4);
      const steps = (f.params as { steps?: number } | undefined)?.steps ?? 0;
      // At ground level: the door's stoop reaches the ground outside (one storey of steps at most).
      if (!fc || fc.drop > 1 || (fc.drop === 1 && steps === 0)) continue;
      const socket = (plan.socketsByOwner.get(f.id) ?? []).find((s) => s.type === 'door');
      if (!socket) continue;
      const street = fc.street === 1 || fc.street === 2;
      const there = role.get(f.cell) ?? [];
      const busy = there.some((v) => v !== 'lantern' && v !== 'net');
      // No mat across an edge piece on the door's side (a fence, a wall, a gate).
      let g = fc.edge === undefined ? matGround(plan, courts, f.cell, f.dir as Dir4, fc.drop) : null;
      if (g && matted.has(g.cell)) g = null;
      if (g) matted.add(g.cell);
      const door = f.variant === 'shop' ? 1 : f.variant === 'double' ? 2 : 0;
      out.push({
        anchor: f.cell, structure: f.structure, key: f.id,
        data: { socket: socket.id, steps, street, lit: (street || fc.plaza === 1) && !there.includes('lantern'), busy, ground: g?.ground ?? null, door },
      });
    }
    return out;
  },
  claims: (c) => [slot.socket(c.data.socket)],
  apply(c, out, ctx) {
    const d = c.data;
    const k = c.key ?? 0;
    const roll = (name: string, p: number): 0 | 1 => (lucky(ctx.seed, RULE, c.anchor, `${k}:${name}`, p) ? 1 : 0);
    const house = c.structure === undefined ? undefined : ctx.plan.structures.get(c.structure);
    const { busy, lit } = d;
    const bicycle = d.street && !busy ? roll('bicycle', DRESSING.doorBicycle) : 0;
    const step = out.prop({
      type: 'doorstep',
      at: { socket: d.socket },
      params: {
        steps: d.steps,
        mat: d.ground === null ? 0 : 1,
        ground: d.ground ?? 0,
        door: d.door,
        pots: busy ? 0 : roll('pots', DRESSING.doorPots),
        barrel: busy ? 0 : roll('barrel', DRESSING.doorBarrel),
        bicycle,
        lantern: lit ? 1 : 0,
        flowers: hash(house?.seed ?? 1, 'flowers') % 5,
        look: hash(ctx.seed, RULE, c.anchor, k) % 1000,
      },
    });
    if (lit) out.socket({ type: 'lamp-head', owner: step, cell: c.anchor, structure: c.structure });
    // The bike is its own prop beside the doorstep, so its owner can ride it away (src/life/people/bikes.ts).
    if (bicycle) out.prop({ type: 'door-bike', at: { socket: d.socket }, params: { steps: d.steps, paint: hash(ctx.seed, RULE, 'paint', c.anchor, k) % 2 } });
  },
});
