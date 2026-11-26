// Market talk at the shops ships supply (L58's trade): once a carter has wheeled goods off a ship up
// to a shop or an inn, residents come by to buy, asking with a cheese or a jug in their bubble
// (talk.ts), and go home with one. The goods by the door are the shop's stock: they are taken in by
// the people who live there (trade.ts), not by the buyers. A shop no ship has supplied gets no
// buyers from this chain.

import { DIR4 } from '@/core/grid';
import { rand } from '@/core/rand';
import { TALK } from '@/style/town-life';
import type { Chain, Plan, Post } from '../board';
import { canWork, reaches, standAt } from '../hands';
import { converse, type Want } from '../talk';

const CHEESE: Want = { item: 'cheese', pic: 'cheese' };
const JUG: Want = { item: 'jug', pic: 'jug' };

export function cargoChain(): Chain {
  let shops: Post[] = [];
  /** Shops (by structure) a carter has brought goods to since the town was opened. */
  const got = new Set<number>();
  const chain: Chain = {
    id: 'cargo',
    sync(board) {
      shops = board.posts('trade').filter((p) => p.role === 'to' && p.ref === 'door' && p.structure !== undefined);
    },
    step(_dt, _time, board) {
      for (const s of shops) if (!got.has(s.structure!) && (board.stores.get(`trade:to:${s.structure}`)?.items.some((x) => x !== null) ?? false)) got.add(s.structure!);
    },
    offer(p, time, board) {
      if (!time.isDay || got.size === 0 || board.claimedBy(p) || !canWork(p)) return null;
      if (rand(p.seed, 'cargo:buy', p.trips) >= TALK.cargoBuy) return null;
      const to = shops
        .filter((s) => got.has(s.structure!) && board.dist(s.cell, p.cell) <= 18 && reaches(board, p, s.cell))
        .sort((a, b) => board.dist(a.cell, p.cell) - board.dist(b.cell, p.cell) || a.cell - b.cell)[0];
      if (!to) return null;
      const want = rand(p.seed, 'cargo:what', p.trips) < 0.5 ? CHEESE : JUG;
      const home = board.homeStep(p, { tag: 'cargo:home', load: want.item });
      if (!home) return null;
      const c = board.centre(to.cell);
      const [fx, fz] = to.dir !== undefined ? DIR4[to.dir]! : [0, 0];
      const counter = { store: null, at: { x: c.x + fx * 0.45, y: c.y + 0.4, z: c.z + fz * 0.45 } };
      const side = (rand(p.seed, 'cargo:side', p.trips) - 0.5) * 0.4;
      const plan: Plan = { chain, at: 0, steps: [] };
      plan.steps.push(
        board.stepAt(to.cell, { ...standAt(board, to, 0.05, side), pose: 'chat', linger: 3, tag: 'cargo:buy', done: (q) => converse(board, q, plan, counter, want, () => [want === CHEESE ? JUG : CHEESE], home, 'cargo:buy') }),
        home,
      );
      return plan;
    },
  };
  return chain;
}
