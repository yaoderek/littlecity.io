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

import { below } from '@/core/grid';
import type { ActorOf, ShapePlan, StructureId } from '@/resolve/plan';
import { portPlanOfStructure, type PortPlan } from '@/rules/roles/port-shape';
import { PORT } from '@/style/port';
import { defineSystem, type LifeStage } from '../api';
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
}

interface State {
  cranes: Map<string, Crane>;
  /** The port each crane stands on. */
  craneAt: Map<string, StructureId>;
  ports: Map<StructureId, Port>;
  shape: ShapePlan | null;
  stage: LifeStage;
  seed: number;
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
    const state: State = { cranes: new Map(), craneAt: new Map(), ports: new Map(), shape: null, stage: ctx.stage, seed: ctx.seed };
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
        if (!port) state.ports.set(id, (port = { id, plan: pp, yard: new Yard(ctx.stage, ctx.seed, String(id)), visit: null, workers: null }));
        port.plan = pp;
        port.yard.layout(pp);
        // Its dock workers, once it has an office and an unpacking bay (the link into the town: workers.ts).
        if (!port.workers && pp.yard.office && pp.yard.pile) port.workers = new DockWorkers(ctx.stage, ctx.seed, `port:${id}`, pp, Math.round(phoneSized() ? PORT.workersPhone : PORT.workers));
        else port.workers?.layout(pp);
      }
      for (const [id, port] of state.ports) {
        if (now.has(id)) continue;
        if (port.visit) port.visit.ship.held = false;
        port.workers?.release();
        port.yard.remove();
        state.ports.delete(id);
      }
    }
    // ── the cranes, once the dressing has them ──
    if (!next.dressing) return;
    const seen = new Set<string>();
    for (const a of next.dressing.actors) {
      if (a.type !== 'port-crane') continue;
      const actor = a as ActorOf<'port-crane'>;
      seen.add(actor.id);
      if (state.cranes.has(actor.id)) continue;
      const body = ctx.stage.instance(actor.id);
      if (!body) continue;
      const p = actor.params ?? {};
      state.cranes.set(actor.id, new Crane(ctx.stage, actor.id, actor.variant === 'large' ? 'large' : 'medium', p.look ?? 0, body, body.base, p.off ?? 0, p.lo ?? 0, p.hi ?? 0));
      const at = actor.at && 'cell' in actor.at ? next.shape.structureAt.get(below(actor.at.cell)) : undefined;
      if (at !== undefined) state.craneAt.set(actor.id, at);
    }
    for (const [id, c] of state.cranes) {
      if (seen.has(id)) continue;
      c.stop();
      c.release();
      state.cranes.delete(id);
      state.craneAt.delete(id);
    }
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
    for (const port of state.ports.values()) port.workers?.update(dt, port.yard);
  },
  dispose(state) {
    for (const c of state.cranes.values()) c.release();
    state.cranes.clear();
    for (const p of state.ports.values()) {
      p.workers?.release();
      p.yard.release();
    }
    state.ports.clear();
  },
});
