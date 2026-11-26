// The harbour (L38–L42): every big ship in the town, from the moment it
// comes up over the edge of the map to the moment it goes down over another.
//
// A rule says only that a ship CALLS (a `ship-call` actor naming the ship
// and its berth). The ships themselves belong to this system, not to the
// plan: they are spawned instances, so a ship whose berth is built over or
// erased can still finish its visit (cast off, sail away) instead of
// vanishing with the rule's actor. See visit.ts for one ship's visit.
//
// A call anchored to a cell is a still life (the gallery): the ship lies
// there with its sails set as the call says, trimmed to the wind.

import { positionOf, type Mat4 } from '@/core/mat4';
import { SEA_Y } from '@/core/grid';
import type { ActorOf } from '@/resolve/plan';
import type { ShipKind } from '@/parts/actors/ships/rig';
import { mapEdge } from '@/rules/life/ship-routes';
import { SHIPS } from '@/style/ships';
import { defineSystem, type Signals } from '../api';
import { swellAt, type Swell } from '../boats/afloat';
import { fly, yawOf } from '../motion/pose';
import { onTwos } from '../motion/twos';
import { ShipBody } from './body';
import { createHarbour, type Harbour } from './visit';

/** A ship lying still for the gallery. */
interface StillShip {
  id: string;
  body: ShipBody;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  drawn: number;
  swell: Swell;
  m: Mat4;
}

interface State {
  still: Map<string, StillShip>;
  harbour: Harbour;
}

const kindOf = (call: ActorOf<'ship-call'>): ShipKind => (call.variant === 'cog' ? 'cog' : call.variant === 'galley' ? 'galley' : call.variant === 'barge' ? 'barge' : call.variant === 'freighter' ? 'freighter' : 'galleon');

function poseStill(s: StillShip, signals: Signals): void {
  const now = onTwos(signals.time.seconds, s.phase);
  if (now === s.drawn) return;
  const step = Number.isNaN(s.drawn) ? 1 : Math.max(0, now - s.drawn);
  s.drawn = now;
  const w = signals.wind(s.x, s.z);
  const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
  const wind = { lee: w.dirX * cos - w.dirZ * sin, along: w.dirX * sin + w.dirZ * cos, strength: w.strength };
  s.body.trim(step, wind, SHIPS.sailTime);
  // A galley lying with its sail furled is shown pulling at its oars.
  if (s.body.rig.oars) {
    s.body.rowing = s.body.canvas < 0.5 ? 1 : 0;
    s.body.stroke = (now / 2.2 + s.phase) % 1;
  }
  swellAt(now, s.phase, (s.body.rig.bow - s.body.rig.stern) * 0.35, w.strength, s.swell);
  const heel = -SHIPS.heel * Math.min(1, w.strength) * s.body.canvas * wind.lee;
  fly(s.x, SEA_Y + s.swell.heave * 0.6, s.z, s.yaw, s.swell.pitch * 0.4, s.swell.roll * 0.4 + heel, 1, s.m);
  // One lying across the edge of the map is cut off at it, like a ship sailing through.
  const rig = s.body.rig;
  const out = Math.max(mapEdge(s.x + Math.sin(s.yaw) * (rig.bow + 1.5), s.z + Math.cos(s.yaw) * (rig.bow + 1.5)), mapEdge(s.x + Math.sin(s.yaw) * rig.stern, s.z + Math.cos(s.yaw) * rig.stern));
  s.body.setCut(out > -2.5);
  s.body.pose(s.m, Math.atan2(w.dirX, w.dirZ));
}

export default defineSystem<State>({
  id: 'harbour',
  order: 40,
  create(ctx) {
    return { still: new Map(), harbour: createHarbour(ctx.stage, ctx.seed) };
  },
  sync(state, next, _prev, ctx) {
    const calls = (next.dressing?.actors ?? []).filter((a): a is ActorOf<'ship-call'> => a.type === 'ship-call');
    // ── still ships (anchored calls) ──
    const seen = new Set<string>();
    for (const call of calls) {
      if (call.at === null) continue;
      seen.add(call.id);
      if (state.still.has(call.id)) continue;
      const base = ctx.stage.instance(call.id)?.base;
      if (!base) continue;
      const [x, , z] = positionOf(base);
      const look = Math.abs(Math.round(call.params?.look ?? 0));
      const set = call.params?.set ?? 1;
      const body = new ShipBody(ctx.stage, kindOf(call), look, base, set);
      state.still.set(call.id, { id: call.id, body, x, z, yaw: yawOf(base), phase: (look * 0.137) % 1, drawn: NaN, swell: { heave: 0, roll: 0, pitch: 0 }, m: new Array<number>(16).fill(0) });
    }
    for (const [id, s] of state.still) {
      if (!seen.has(id) && next.dressing) {
        s.body.release();
        state.still.delete(id);
      }
    }
    // ── ships under way: the harbour master ──
    if (next.dressing) state.harbour.sync(next.shape, next.dressing, calls.filter((c) => c.at === null).map((c) => ({ id: c.id, kind: kindOf(c), call: c })));
  },
  update(state, dt, signals) {
    for (const s of state.still.values()) poseStill(s, signals);
    state.harbour.update(dt, signals);
  },
  dispose(state) {
    for (const s of state.still.values()) s.body.release();
    state.still.clear();
    state.harbour.dispose();
  },
});
