// The container port's life (R-D00): its cranes. A rule puts each crane's
// frame in the dressing (D15-P, a `port-crane` actor); this system spawns
// its moving pieces and works them (crane.ts). With no ship to work, every
// crane stands idle: a large crane with its boom up, near-upright, a medium
// one with its jib raised.

import type { ActorOf } from '@/resolve/plan';
import { defineSystem } from '../api';
import { Crane } from './crane';

interface State {
  cranes: Map<string, Crane>;
}

export default defineSystem<State>({
  id: 'port',
  order: 45,
  create() {
    return { cranes: new Map() };
  },
  sync(state, next, _prev, ctx) {
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
  },
});
