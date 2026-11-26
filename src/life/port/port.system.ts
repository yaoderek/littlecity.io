// The container port's life (R-D00): its cranes and its yard of containers.
// A rule puts each crane's frame in the dressing (D15-P, a `port-crane`
// actor); this system spawns its moving pieces and works them (crane.ts).
// The containers are this system's too (yard.ts): the stacks rise and fall
// as ships unload and load. With no ship to work, every crane stands idle: a
// large crane with its boom up, near-upright, a medium one with its jib
// raised.

import type { ActorOf, ShapePlan, StructureId } from '@/resolve/plan';
import { portPlanOfStructure, type PortPlan } from '@/rules/roles/port-shape';
import { defineSystem } from '../api';
import { Crane } from './crane';
import { Yard } from './yard';

interface Port {
  id: StructureId;
  plan: PortPlan;
  yard: Yard;
}

interface State {
  cranes: Map<string, Crane>;
  ports: Map<StructureId, Port>;
  shape: ShapePlan | null;
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
  create() {
    return { cranes: new Map(), ports: new Map(), shape: null };
  },
  sync(state, next, _prev, ctx) {
    // ── the yards, as soon as the shape says where the ports are ──
    if (next.shape !== state.shape) {
      state.shape = next.shape;
      const now = portsOf(next.shape);
      for (const [id, pp] of now) {
        let port = state.ports.get(id);
        if (!port) state.ports.set(id, (port = { id, plan: pp, yard: new Yard(ctx.stage, ctx.seed, String(id)) }));
        port.plan = pp;
        port.yard.layout(pp);
      }
      for (const [id, port] of state.ports) {
        if (now.has(id)) continue;
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
    }
    for (const [id, c] of state.cranes) {
      if (seen.has(id)) continue;
      c.stop();
      c.release();
      state.cranes.delete(id);
    }
  },
  update(state, dt) {
    for (const c of state.cranes.values()) c.update(dt);
  },
  dispose(state) {
    for (const c of state.cranes.values()) c.release();
    state.cranes.clear();
    for (const p of state.ports.values()) p.yard.release();
    state.ports.clear();
  },
});
