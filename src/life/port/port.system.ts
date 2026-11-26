// The container port's life (R-D00): its cranes, its yard of containers,
// and the cargo ships' visits (L38-F). A rule puts each crane's frame in the
// dressing (D15-P, a `port-crane` actor); this system spawns its moving
// pieces and works them (crane.ts). The containers are this system's too
// (yard.ts): the stacks rise and fall as ships unload and load (work.ts).
//
// With no ship to work, every crane stands idle: a large crane with its boom
// up, near-upright, a medium one with its jib raised. When a cargo ship comes
// in for the port, the booms come down before it is alongside; once it is
// moored the cranes work it, holding it alongside until they are done.
//
// Speed: at most PORT.cranesMoving cranes of a port work at once
// (cranesPhone on a phone, cranesLow at the lowest quality levels); the
// others stand idle, booms up.

import { below, CELL_H, keyX, keyZ, type CellKey } from '@/core/grid';
import { rand } from '@/core/rand';
import type { ActorOf, ShapePlan, StructureId } from '@/resolve/plan';
import { portPlanOfStructure, type PortPlan } from '@/rules/roles/port-shape';
import { PORT } from '@/style/port';
import { defineSystem, type LifeStage, type SpawnSpec } from '../api';
import { fxOf } from '../fx/fx';
import { easeIn, easeOut } from '../motion/ease';
import { place } from '../motion/pose';
import { lifeLow, phoneSized } from '../quality';
import { harbourOf, type Ship } from '../ships/visit';
import { Crane } from './crane';
import { newVisit, nextJob, type Visit } from './work';
import { DockWorkers } from './workers';
import { Yard } from './yard';

interface Port {
  id: StructureId;
  plan: PortPlan;
  yard: Yard;
  visit: Visit | null;
  workers: DockWorkers | null;
  /** Its dock cells (to puff the deck over cells that become the port's, or stop being it). */
  cells: Set<CellKey>;
}

interface State {
  cranes: Map<string, Crane>;
  /** The port each crane stands on. */
  craneAt: Map<string, StructureId>;
  ports: Map<StructureId, Port>;
  shape: ShapePlan | null;
  stage: LifeStage;
  seed: number;
  /** Cranes going away (shrinking into their feet in a puff), until they have gone. */
  leaving: Crane[];
  /** Each crane's drawing, to draw it once more as it goes. */
  spec: Map<string, { variant: string; look: number; off: number; lo: number; hi: number }>;
  /** The town has been shown once: from now on what appears arrives (opening a town shows it as it is). */
  shown: boolean;
}

const states = new WeakMap<LifeStage, State>();
/** The ports and cranes running on a stage (for tests). */
export function portLifeOf(stage: LifeStage): { ports: ReadonlyMap<StructureId, { yard: Yard; visit: Visit | null }>; cranes: ReadonlyMap<string, Crane> } | null {
  return states.get(stage) ?? null;
}

/** Cranes working at once in one port, on this device. */
export function craneCap(): number {
  return Math.round(lifeLow() ? PORT.cranesLow : phoneSized() ? PORT.cranesPhone : PORT.cranesMoving);
}

/** A cargo ship coming in to (or lying at) a port's berth. */
function shipFor(stage: LifeStage, port: StructureId, moored: boolean): Ship | null {
  for (const s of harbourOf(stage)?.ships ?? []) {
    if (s.kind !== 'freighter' || !s.body || s.berth.port !== port || s.orphan) continue;
    if (s.phase === 'moored') return s;
    if (!moored && (s.phase === 'swing-in' || s.phase === 'warp-in' || (s.phase === 'arriving' && s.voyage !== null && s.voyage.path.length - s.s < 28))) return s;
  }
  return null;
}

const POP: SpawnSpec[] = [0, 1, 2, 3].map((look) => ({ actor: 'puff', variant: 'pop', params: { look } }));

/**
 * A deck changing over (boards to concrete, or back): a quick run of puffs across its cells, one after
 * another along the quay, under a second in all; every other cell on a phone.
 */
export function deckPuffs(stage: LifeStage, seed: number, cells: readonly CellKey[]): void {
  if (!cells.length) return;
  const fx = fxOf(stage);
  const sorted = [...cells].sort((a, b) => keyX(a) + keyZ(a) - (keyX(b) + keyZ(b)) || a - b);
  const every = phoneSized() || lifeLow() ? 2 : 1;
  const gap = Math.min(0.03, 0.8 / sorted.length);
  sorted.forEach((c, i) => {
    if (i % every) return;
    const x = keyX(c) + 0.5, z = keyZ(c) + 0.5, y = CELL_H + 0.1;
    const r = (w: string): number => rand(seed, 'deck-puff', c, w);
    const a = r('a') * Math.PI * 2;
    fx.play(POP[i % POP.length]!, 0.45, (t, m) => {
      const s = 0.42 * (t < 0.3 ? easeOut(t / 0.3) : 1 - easeIn((t - 0.3) / 0.7));
      place(x + Math.cos(a) * 0.15 * t, y + 0.25 * easeOut(t), z + Math.sin(a) * 0.15 * t, a, s, s, s, m);
    }, { delay: i * gap, smooth: true });
  });
}

/** The ports in a town, by structure. */
export function portsOf(shape: ShapePlan): Map<StructureId, PortPlan> {
  const out = new Map<StructureId, PortPlan>();
  for (const [id, r] of shape.roles) {
    if (r.role !== 'port') continue;
    const pp = portPlanOfStructure(shape, id);
    if (pp) out.set(id, pp);
  }
  return out;
}

export default defineSystem<State>({
  id: 'port',
  order: 45,
  create(ctx) {
    const state: State = { cranes: new Map(), craneAt: new Map(), ports: new Map(), shape: null, stage: ctx.stage, seed: ctx.seed, leaving: [], spec: new Map(), shown: false };
    states.set(ctx.stage, state);
    return state;
  },
  sync(state, next, _prev, ctx) {
    // ── the yards, as soon as the shape says where the ports are ──
    if (next.shape !== state.shape) {
      state.shape = next.shape;
      const now = portsOf(next.shape);
      for (const [id, pp] of now) {
        let port = state.ports.get(id);
        if (!port) state.ports.set(id, (port = { id, plan: pp, yard: new Yard(ctx.stage, ctx.seed, String(id)), visit: null, workers: null, cells: new Set() }));
        port.plan = pp;
        port.yard.layout(pp, state.shown);
        // The deck changes over in a run of puffs across the cells that have just become the port's.
        const cells = new Set(next.shape.structures.get(id)?.cells ?? []);
        if (state.shown) deckPuffs(ctx.stage, ctx.seed, [...cells].filter((c) => !port.cells.has(c)));
        port.cells = cells;
        // Its dock workers, once it has an office and an unpacking bay (the link into the town: workers.ts).
        if (!port.workers && pp.yard.office && pp.yard.pile) port.workers = new DockWorkers(ctx.stage, ctx.seed, `port:${id}`, pp, Math.round(phoneSized() ? PORT.workersPhone : PORT.workers));
        else port.workers?.layout(pp);
      }
      for (const [id, port] of state.ports) {
        if (now.has(id)) continue;
        if (port.visit) port.visit.ship.held = false;
        port.workers?.release();
        port.yard.remove();
        // Back to boards: the same run of puffs over what was its deck.
        deckPuffs(ctx.stage, ctx.seed, [...port.cells]);
        state.ports.delete(id);
      }
    }
    // ── the cranes, once the dressing has them ──
    if (!next.dressing) return;
    const seen = new Set<string>();
    let fresh = 0;
    const going = (id: string, c: Crane): void => {
      const sp = state.spec.get(id);
      if (sp && state.shown) {
        c.leave(sp);
        state.leaving.push(c);
      } else {
        c.stop();
        c.release();
      }
      state.cranes.delete(id);
      state.craneAt.delete(id);
      state.spec.delete(id);
    };
    for (const a of next.dressing.actors) {
      if (a.type !== 'port-crane') continue;
      const actor = a as ActorOf<'port-crane'>;
      seen.add(actor.id);
      const p = actor.params ?? {};
      const spec = { variant: actor.variant ?? 'medium', look: p.look ?? 0, off: p.off ?? 0, lo: p.lo ?? 0, hi: p.hi ?? 0 };
      const had = state.cranes.get(actor.id);
      const was = state.spec.get(actor.id);
      if (had && was) {
        // The same crane with a longer or shorter run of rail: it keeps standing; drawn otherwise, it is a new one.
        if (was.variant === spec.variant && was.look === spec.look && was.off === spec.off) {
          had.lo = spec.lo;
          had.hi = spec.hi;
          state.spec.set(actor.id, spec);
          continue;
        }
        going(actor.id, had);
      }
      const body = ctx.stage.instance(actor.id);
      if (!body) continue;
      const crane = new Crane(ctx.stage, actor.id, spec.variant === 'large' ? 'large' : 'medium', spec.look, body, body.base, spec.off, spec.lo, spec.hi, ctx.seed);
      // Raised where it stands, one after another (never all in one frame), once the town has been shown.
      if (state.shown) crane.arrive(0.15 + fresh++ * 0.25);
      state.cranes.set(actor.id, crane);
      state.spec.set(actor.id, spec);
      const at = actor.at && 'cell' in actor.at ? next.shape.structureAt.get(below(actor.at.cell)) : undefined;
      if (at !== undefined) state.craneAt.set(actor.id, at);
    }
    for (const [id, c] of [...state.cranes]) if (!seen.has(id)) going(id, c);
    state.shown = true;
  },
  update(state, dt) {
    const cap = craneCap();
    for (const port of state.ports.values()) {
      // The visit: a cargo ship moored at this port's berth.
      const ship = shipFor(state.stage, port.id, true);
      if (port.visit && port.visit.ship !== ship) {
        port.visit.ship.held = false;
        port.visit = null;
      }
      if (ship && !port.visit) {
        port.visit = newVisit(ship, state.seed);
        ship.held = true;
      }
      const coming = ship ?? shipFor(state.stage, port.id, false);
      // Those that reach the ship in work first (large before medium); the rest stand idle under the cap.
      const reach = (c: Crane): number => {
        const cargo = coming?.body?.rig.cargo;
        if (!coming || !cargo) return 0;
        // Where its containers will be when it lies at its mooring (+Z its bow, +X its starboard side).
        const { x: mx, z: mz, yaw } = coming.mooring;
        const sn = Math.sin(yaw), cs = Math.cos(yaw);
        return cargo.slots.some(([x, , z]) => c.reaches({ x: mx + cs * x + sn * z, y: 0, z: mz - sn * x + cs * z, yaw: 0 })) ? 1 : 0;
      };
      const cranes = [...state.cranes.entries()]
        .filter(([id]) => state.craneAt.get(id) === port.id)
        .map(([, c]) => c)
        .sort((a, b) => reach(b) - reach(a) || Number(b.large) - Number(a.large));
      const v = port.visit;
      const overtime = v !== null && v.ship.t > PORT.freighterStay + PORT.freighterHold;
      cranes.forEach((c, k) => {
        if (c.coming) return;
        if (!coming || k >= cap) {
          c.park();
          return;
        }
        c.ready();
        if (!v || c.working || overtime || v.unload + v.load <= 0) return;
        const job = nextJob(state.stage, state.seed, v, port.yard, c);
        if (job) c.start(job);
      });
      // Done when every move is made (or it has been held long enough) and no crane is still at it.
      if (v && (v.unload + v.load <= 0 || overtime || cranes.slice(0, cap).every((c) => !c.working)) && !cranes.some((c) => c.working)) {
        if (v.unload + v.load <= 0 || overtime || v.ship.t > 20) v.ship.held = false;
      }
    }
    for (const c of state.cranes.values()) c.update(dt);
    for (const c of state.leaving) c.update(dt);
    state.leaving = state.leaving.filter((c) => {
      if (!c.gone) return true;
      c.release();
      return false;
    });
    for (const port of state.ports.values()) {
      port.yard.update(dt);
      port.workers?.update(dt, port.yard);
    }
  },
  dispose(state) {
    for (const c of state.cranes.values()) c.release();
    state.cranes.clear();
    for (const c of state.leaving) c.release();
    state.leaving = [];
    for (const p of state.ports.values()) {
      p.workers?.release();
      p.yard.release();
    }
    state.ports.clear();
  },
});
