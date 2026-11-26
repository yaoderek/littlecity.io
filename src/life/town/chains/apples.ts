// L68 · Apples to market (posts from L68.apples.rule.ts).
//
//   the pickers   (places.ts `pick`) at harvest carry their baskets down the ladders and tip them
//                 into the orchard's big basket: apples heap up beside it (APPLES.perPick a trip)
//   the carrier   the gardener (or a grown-up nearby) lifts a basket heaped with apples off the heap
//                 and carries it on their head to a fruit stall (on market days the market's fruit
//                 pitch, market-day.ts), where the apples are set out on the counter in heaps
//   buyers        come for an apple, ask for it in a bubble (talk.ts) and walk home with one in the
//                 hand; out of harvest the heaps run out, and whoever still comes is told "none left"
//
// What is never allowed: an apple that is in no store, no hand and no heap (the ledger adds up:
// picked = in the big baskets + carried + on the counters + bought + taken home). The orchard taken
// away mid-carry: the carrier takes the apples home; its heap goes with the store, with a puff.

import { CELL_H, DIR4, keyY } from '@/core/grid';
import { APPLES } from '@/style/town-life';
import type { Person } from '../../people/crowd';
import type { Board, Chain, Plan, Post, Spot, Store } from '../board';
import { canWork, keepHand, standAt } from '../hands';
import { buyerPlan, morning, outletsOf, roomiest, type Outlet } from '../market';
import { harvestTime } from './harvest';
import type { MarketChain } from './market-day';

export interface AppleLedger {
  /** Tipped into a big basket by the pickers. */
  picked: number;
  /** Lifted from a big basket by the carrier; set out on a counter; taken home when there was nowhere to set them. */
  lifted: number;
  delivered: number;
  takenHome: number;
  /** Lying in a big basket when the orchard was taken away (they went with it, in a puff). */
  gone: number;
}

export interface ApplesChain extends Chain {
  readonly ledger: AppleLedger;
  readonly carrier: Person | null;
  /** Apples in the carrier's basket now. */
  readonly carrying: number;
  readonly outlets: readonly Outlet[];
}

interface Big {
  post: Post;
  store: Store;
}

const bigKey = (ref: string): string => `apples:basket:${ref}`;

/** The heap beside an orchard basket: a row of three on the grass, two on them, one on top, on the side away from the tree. */
function heapBeside(board: Board, post: Post): Spot[] {
  const base = board.stage?.instance(post.ref)?.base;
  const c = board.centre(post.cell);
  const bx = base ? base[12]! : c.x, by = base ? base[13]! : keyY(post.cell) * CELL_H, bz = base ? base[14]! : c.z;
  // Along the basket's side (across the way it faces), a step to its right.
  const [fx, fz] = post.dir !== undefined ? DIR4[post.dir]! : [0, 1];
  const ax = -fz, az = fx;
  const out: Spot[] = [];
  const rows: [number, number][] = [[3, 0], [2, 1], [1, 2]];
  for (const [n, row] of rows) {
    for (let i = 0; i < n; i++) {
      const along = 0.2 + (i + row * 0.5) * 0.095;
      out.push({ x: bx + ax * along + fx * 0.03, y: by + row * 0.05, z: bz + az * along + fz * 0.03, yaw: (i + row) * 1.3 });
    }
  }
  return out.slice(0, Math.max(1, Math.round(APPLES.bigBasket)));
}

/**
 * The pickers tip a basket into the big basket by this orchard basket post (the pick chain calls this):
 * up to `n` apples heap up beside it. Returns how many went in (none where the orchard has nowhere to sell).
 */
export function fillBasket(board: Board, ref: string, n: number): number {
  const store = board.stores.get(bigKey(ref));
  const chain = board.chains.find((c) => c.id === 'apples') as ApplesChain | undefined;
  if (!store || !store.live || !chain) return 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (board.put(store, 'apple')) k++;
  chain.ledger.picked += k;
  return k;
}

/** A market trader packed `n` apples from the counter into the crate at closing: they go home with the trader. */
export function packApples(board: Board, n: number): void {
  const chain = board.chains.find((c) => c.id === 'apples') as ApplesChain | undefined;
  if (chain && n > 0) chain.ledger.takenHome += n;
}

export function applesChain(): ApplesChain {
  let bigs: Big[] = [];
  let outlets: Outlet[] = [];
  let carrier: Person | null = null;
  let carrying = 0;
  let nextCarry = 0;
  const ledger: AppleLedger = { picked: 0, lifted: 0, delivered: 0, takenHome: 0, gone: 0 };

  /** The carrier's basket goes home with them: what is in it is counted as taken home. */
  const home = (): void => {
    ledger.takenHome += carrying;
    carrying = 0;
  };

  const chain: ApplesChain = {
    id: 'apples',
    get ledger() {
      return ledger;
    },
    get carrier() {
      return carrier;
    },
    get carrying() {
      return carrying;
    },
    get outlets() {
      return outlets;
    },
    sync(board) {
      const posts = board.posts('apples');
      const before = bigs;
      bigs = posts.filter((p) => p.role === 'basket').map((post) => ({ post, store: board.store(bigKey(post.ref), heapBeside(board, post)) }));
      for (const b of before) if (!bigs.some((x) => x.store === b.store)) ledger.gone += board.count(b.store, 'apple');
      outlets = outletsOf(board, 'apples', outlets);
      if (bigs.length === 0 || outlets.length === 0) {
        // The orchard (or every stall) gone: whoever is carrying takes the apples home.
        if (carrier && board.plans.get(carrier)?.chain === chain) {
          board.drop(carrier);
          board.crowd.rethink(carrier);
        }
        if (carrier && board.claimedBy(carrier) === chain) board.unclaim(carrier);
        carrier = null;
        return;
      }
      carrier = keepHand(board, chain, carrier, bigs[0]!.post.cell, (p) => p.work?.job === 'gardener');
    },
    step(_dt, _time, board) {
      if (carrier && carrier.mode === 'gone') carrier = null;
      void board;
    },
    offer(p, time, board) {
      if (!(time.isDay || time.isDawn)) return null;
      if (p === carrier) return carryPlan(board, p, time.isDay);
      if (board.claimedBy(p) || !canWork(p) || outlets.length === 0) return null;
      const any = outlets.some((o) => board.count(o.store, 'apple') > o.coming);
      if (any) return buyerPlan(board, chain, p, outlets, 'apple', morning(time) ? APPLES.buyMorning : APPLES.buy, APPLES.reach, 'apples:buy');
      // None anywhere (out of harvest): now and then somebody comes anyway, to be told there are none.
      return buyerPlan(board, chain, p, outlets, 'apple', APPLES.buyEmpty, APPLES.reach, 'apples:buy', { empty: true });
    },
  };

  const carryPlan = (board: Board, p: Person, day: boolean): Plan | null => {
    if (!day || board.now < nextCarry || p.load) return null;
    // A basketful, or the last of the heap once the harvest is over.
    const want = Math.max(1, Math.round(APPLES.carry));
    const from = bigs.filter((b) => board.count(b.store, 'apple') >= (harvestTime(board) ? want : 1)).sort((a, b) => board.count(b.store) - board.count(a.store))[0];
    if (!from) return null;
    // On market days the market's fruit pitch (if it is up); else the stall with the most room.
    const market = board.chains.find((c) => c.id === 'market') as MarketChain | undefined;
    const pitch = market?.pitchFor('fruit') ?? null;
    const to = (pitch && roomiest(board, p, [pitch], from.post.cell, 1)) ?? roomiest(board, p, outlets, from.post.cell, 1);
    if (!to) return null;
    nextCarry = board.now + APPLES.carryGap;
    const plan: Plan = {
      chain,
      at: 0,
      steps: [
        board.stepAt(from.post.cell, {
          ...(from.post.dir !== undefined ? standAt(board, from.post, 0.15) : { spot: null, face: NaN }),
          pose: 'tend',
          linger: 1.3,
          tag: 'apples:lift',
          done: (q) => {
            let n = 0;
            while (n < want && board.take(from.store, 'apple')) n++;
            if (n === 0) return false;
            carrying = n;
            ledger.lifted += n;
            q.load = 'apples';
          },
        }),
        board.stepAt(to.post.cell, {
          ...standAt(board, to.post, to.post.ref === 'stall' ? 0.18 : 0.05, -0.15),
          pose: 'tend',
          linger: 1.6,
          load: 'apples',
          tag: 'apples:deliver',
          done: (q) => {
            // Set out in heaps on the counter: as many as there is room for; any left go home in the basket.
            while (carrying > 0 && board.put(to.store, 'apple', true)) {
              carrying--;
              ledger.delivered++;
            }
            if (carrying > 0) home();
            else q.load = null;
          },
        }),
      ],
      // Called away, or the stall gone on the way: home with the basket.
      fail: () => home(),
    };
    return plan;
  };

  return chain;
}
