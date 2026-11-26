// L38-F · tier 2 · The cargo ship (town-wide). At a port's berth (R-D00: the
// berth fact marks a port's seaward face) long enough for its hull, a steel
// container ship calls: a tug leads it in, the port's cranes unload and load
// its containers, and it sails out again with the tug. It calls only at a
// port, never at a plain quay; the old ships may still call at a port too.
//
// The rule only says that it calls, at which berth and lying which way
// (berths.fact.ts: sailed in and out with its own hull, like the others).
// The harbour system sails it (src/life/ships), the port system works it
// (src/life/port).

import { defineRule } from '@/resolve/engine/api';
import type { ShipPlan } from './berths.fact';
import { emitCall, shipCandidates } from './ships.lib';

export default defineRule<ShipPlan>({
  id: 'L38-F.freighter',
  part: 'life',
  tier: 2,
  priority: 625,
  townWide: true,
  about: 'Reads: ports’ seaward faces and open water to the edge of the map (berths.fact.ts). Emits: one ship-call (freighter) at each port berth it fits; haunt-ship sockets along the quay.',
  find: ({ facts }) => shipCandidates(facts, 'freighter').filter((c) => c.data.berth.port !== undefined),
  apply(c, out, ctx) {
    emitCall('freighter', 'L38-F.freighter', c, out, ctx);
  },
});
