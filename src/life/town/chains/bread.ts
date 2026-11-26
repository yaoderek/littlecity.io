// L51 · Bread, from the mill to the table (posts from L51.bread.rule.ts).
//
//   the miller   goes into the windmill, comes out with a sack of flour on
//                their chest, walks it to the bakery and sets it down by the
//                door, where the sacks stack up (at most CHAINS.sacks)
//   the baker    picks up a sack by the door, takes it in, bakes (a few
//                seconds inside), comes out with a tray of loaves, walks it
//                to the stall (or inn, or café) with the most room and sets
//                the loaves out on the counter or by the door; then back in
//   residents    now and then (more in the mornings) walk to a place with
//                loaves, stop at the counter, and walk home with a loaf
//                under the arm; the loaves on the counter go down one by one
//
// Degrades as the rule does: no mill, the baker bakes without fetching a
// sack; a place erased mid-walk, the carrier takes what they hold home.

import { opposite } from '@/core/grid';
import { CHAINS } from '@/style/town-life';
import type { Person } from '../../people/crowd';
import { heapSpots, type Board, type Chain, type Plan, type PlanStep, type Post, type Store } from '../board';
import { canWork, keepHand, standAt } from '../hands';
import { buyerPlan, counterKey, deliverStep, morning, outletSpots, outletsOf, roomiest, type Outlet } from '../market';

export function breadChain(): Chain {
  let mill: Post | undefined;
  let bakery: Post | undefined;
  let outlets: Outlet[] = [];
  let sacks: Store | null = null;
  /** The miller and a helper: two carrying sacks keeps the road from the mill busy. */
  let millers: (Person | null)[] = [null, null];
  const millAtOf = new Map<Person, number>();
  let baker: Person | null = null;
  let bakeAt = 0;

  const chain: Chain = {
    id: 'bread',
    sync(board) {
      mill = board.posts('bread').find((p) => p.role === 'mill');
      bakery = board.posts('bread').find((p) => p.role === 'bakery');
      // At the bakery's own door the loaves go on the far side from the sacks.
      outlets = outletsOf(board, 'bread', outlets);
      // The bakery's own door, for when every other place is a long way round by the streets.
      const own = bakery && !outlets.some((o) => o.post.cell === bakery!.cell) ? { ...bakery, ref: 'door', role: 'sell' } : null;
      if (own) outlets.push({ post: own, store: board.store(counterKey(own), outletSpots(board, own)), coming: 0 });
      sacks = bakery && mill ? board.store(`bread:sacks:${bakery.structure}`, heapSpots(bakery.cell, opposite(bakery.dir ?? 0), board.centre(bakery.cell).y).slice(0, CHAINS.sacks)) : null;
      if (!bakery) {
        for (const m of millers) if (m) board.unclaim(m);
        if (baker) board.unclaim(baker);
        millers = [null, null];
        baker = null;
        return;
      }
      const b = bakery;
      baker = keepHand(board, chain, baker, b.cell, (p) => (p.work?.job === 'baker' && p.work.structure === b.structure) || p.home === b.structure);
      if (mill) {
        const m = mill;
        millers = millers.map((had, i) => (i < Math.round(CHAINS.millers) ? keepHand(board, chain, had, m.cell, (p) => p.work?.job === 'miller') : (had && board.unclaim(had), null)));
      } else {
        for (const x of millers) if (x) board.unclaim(x);
        millers = [null, null];
      }
    },
    step(_dt, _time, board) {
      // Hands lost (gone, moved out of reach) are found again at the next change of the town; meanwhile a
      // hand that has gone is let go.
      millers = millers.map((x) => (x && x.mode === 'gone' ? null : x));
      if (baker && baker.mode === 'gone') baker = null;
      void board;
    },
    offer(p, time, board) {
      if (!bakery || !(time.isDay || time.isDawn)) return null;
      const b = bakery;
      if (millers.includes(p) && mill && sacks) return millerPlan(board, p, mill, b, sacks);
      if (p === baker) return bakerPlan(board, p, b);
      if (board.claimedBy(p) || !canWork(p)) return null;
      return buyerPlan(board, chain, p, outlets, 'loaf', morning(time) ? CHAINS.buyMorning : CHAINS.buy, CHAINS.buyReach, 'bread:buy');
    },
  };

  const millerPlan = (board: Board, p: Person, m: Post, b: Post, store: Store): Plan | null => {
    if (board.now < (millAtOf.get(p) ?? 0) || board.count(store) >= store.spots.length) return null;
    // Briskly there and back: a shuttle the eye can follow.
    const fill = board.stepIn(m.structure!, { cell: m.cell, linger: 1.6, brisk: true, tag: 'bread:fill' });
    if (!fill) return null;
    millAtOf.set(p, board.now + CHAINS.millGap);
    const at = standAt(board, b, 0.05);
    // L59: sheaves the farmhands heaped by the mill door go in first (the grain the flour is ground from).
    const heap = board.stores.get(`mill-heap:${m.structure}`);
    const grain: PlanStep[] = [];
    if (heap && board.count(heap, 'sheaf') > 0) {
      fill.load = 'sheaf';
      fill.done = (q) => void (q.load = null);
      grain.push(board.stepAt(m.cell, { ...standAt(board, m, 0.05, 0.25), pose: 'tend', linger: 0.9, tag: 'bread:grain', done: (q) => (board.take(heap, 'sheaf') ? void (q.load = 'sheaf') : false) }));
    }
    return {
      chain,
      at: 0,
      steps: [
        ...grain,
        fill,
        board.stepAt(b.cell, {
          ...at,
          pose: 'tend',
          linger: 1.2,
          load: 'sack',
          brisk: true,
          tag: 'bread:sack',
          done: (q) => {
            if (!board.put(store, 'sack')) return false;
            q.load = null;
          },
        }),
      ],
    };
  };

  const bakerPlan = (board: Board, p: Person, b: Post): Plan | null => {
    if (board.now < bakeAt) return null;
    // Where the tray goes: the place with the most room, then the nearest.
    // The nearest-by-the-streets place with room; the bakery's own door (the last outlet) only when the others are far.
    const others = outlets.filter((o) => o.post.cell !== b.cell);
    const to = roomiest(board, p, others, b.cell) ?? roomiest(board, p, outlets.filter((o) => o.post.cell === b.cell), b.cell);
    if (!to) return null;
    const steps: PlanStep[] = [];
    if (sacks) {
      if (board.count(sacks, 'sack') === 0) return null;
      const store = sacks;
      steps.push(
        board.stepAt(b.cell, {
          ...standAt(board, b, 0.05),
          pose: 'tend',
          linger: 1,
          tag: 'bread:lift',
          done: (q) => {
            if (!board.take(store, 'sack')) return false;
            q.load = 'sack';
          },
        }),
      );
    }
    // In at the bakery's door; a stall that bakes (no door) bakes at its counter.
    const bake =
      board.stepIn(b.structure!, { cell: b.cell, linger: CHAINS.bake, load: sacks ? 'sack' : null, tag: 'bread:bake', done: (q) => void (q.load = null) }) ??
      board.stepAt(b.cell, { ...standAt(board, b, 0.15), pose: 'tend', linger: CHAINS.bake, load: sacks ? 'sack' : null, tag: 'bread:bake', done: (q) => void (q.load = null) });
    const back = board.stepIn(b.structure!, { cell: b.cell, linger: 3, tag: 'bread:back' }) ?? board.stepAt(b.cell, { ...standAt(board, b, 0.15), pose: 'chat', linger: 3, tag: 'bread:back' });
    if (!bake || !back) return null;
    bakeAt = board.now + CHAINS.bakeGap;
    steps.push(bake, deliverStep(board, to, 'tray', 'loaf', CHAINS.tray, 'bread:deliver'), back);
    return { chain, at: 0, steps };
  };

  return chain;
}
