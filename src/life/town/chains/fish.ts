// L53 · The catch comes in (posts from L53.fish.rule.ts). The fisher (L23's,
// at their dock) fishes a while, then lifts a basket of the catch and
// carries it up the pier to the fish stall (or the fish shop) with the most
// room, where fish are laid out on the counter; then goes back to fishing.
// Residents come by for a fish and walk home with it dangling from a hand.

import { CHAINS } from '@/style/town-life';
import type { Person } from '../../people/crowd';
import type { Chain, Post } from '../board';
import { canWork, keepHand, standAt } from '../hands';
import { buyerPlan, deliverStep, morning, outletsOf, roomiest, type Outlet } from '../market';
import type { MarketChain } from './market-day';

export function fishChain(): Chain {
  let catches: Post[] = [];
  let outlets: Outlet[] = [];
  const fishers = new Map<string, Person>();
  let next = 0;
  const chain: Chain = {
    id: 'fish',
    sync(board) {
      catches = board.posts('fish').filter((p) => p.role === 'catch');
      outlets = outletsOf(board, 'fish', outlets);
      for (const [id, p] of fishers) {
        if (catches.some((c) => c.id === id)) continue;
        if (board.claimedBy(p) === chain) board.unclaim(p);
        fishers.delete(id);
      }
      for (const c of catches) {
        const had = fishers.get(c.id) ?? null;
        const hand = keepHand(board, chain, had, c.cell, (p) => p.work?.job === 'fisher' && p.work.structure === c.structure);
        if (hand) fishers.set(c.id, hand);
        else fishers.delete(c.id);
      }
    },
    offer(p, time, board) {
      if (!(time.isDay || time.isDawn)) return null;
      const post = catches.find((c) => fishers.get(c.id) === p);
      if (post) {
        if (board.now < next) return null;
        // On market days the catch goes to the market's fish pitch while its stall is up (market talk).
        const pitch = (board.chains.find((c) => c.id === 'market') as MarketChain | undefined)?.pitchFor('fish') ?? null;
        const to = (pitch && roomiest(board, p, [pitch], post.cell)) ?? roomiest(board, p, outlets, post.cell);
        if (!to) return null;
        next = board.now + CHAINS.fishGap;
        return {
          chain,
          at: 0,
          steps: [
            board.stepAt(post.cell, { ...standAt(board, post, 0.3), pose: 'fish', linger: CHAINS.fishing, tag: 'fish:fishing', done: (q) => void (q.load = 'fish') }),
            deliverStep(board, to, 'fish', 'fishes', 3, 'fish:deliver'),
          ],
        };
      }
      if (board.claimedBy(p) || !canWork(p)) return null;
      return buyerPlan(board, chain, p, outlets, 'fishes', morning(time) ? CHAINS.fishBuyMorning : CHAINS.fishBuy, CHAINS.buyReach, 'fish:buy');
    },
  };
  return chain;
}
