// Selling places shared by the chains: where goods lie at a stall's counter
// or by a door, and the resident who comes to buy one and carries it home.

import { CELL_H, DIR4, keyY, opposite } from '@/core/grid';
import { rand } from '@/core/rand';
import type { TimeSignal } from '@/life/api';
import { STALL } from '@/style/props';
import type { Person } from '../people/crowd';
import type { Load } from '../people/errand';
import { heapSpots, type Board, type Chain, type Plan, type Post, type Spot, type Store } from './board';
import { reaches, standAt } from './hands';
import { converse, middleOf, pictureOf, wantsIn, type Counter, type Want } from './talk';

/** A delivery is never sent further than this walk (a stall a few steps off as the crow flies but far round by the streets). */
const FAR = 30;

export interface Outlet {
  post: Post;
  store: Store;
  /** Buyers on their way to it now. */
  coming: number;
}

/** Where goods lie at a selling post: on a stall's counter (ref 'stall'), or against the wall by a door. */
export function outletSpots(board: Board, post: Post): Spot[] {
  const out = opposite(post.dir ?? 0);
  const [fx, fz] = DIR4[out]!;
  if (post.ref === 'stall' && post.structure !== undefined) {
    const cell = board.shape?.structures.get(post.structure)?.cells[0];
    if (cell !== undefined) {
      const c = board.centre(cell);
      const y = keyY(cell) * CELL_H + STALL.counter;
      return [-0.24, 0, 0.24].map((side, i) => ({ x: c.x + fx * 0.3 - fz * side, y, z: c.z + fz * 0.3 + fx * side, yaw: Math.atan2(fx, fz) + Math.PI / 2 + i * 0.3 }));
    }
  }
  // By a door: a row of three along the wall on the side away from where sacks heap (heapSpots' side).
  return heapSpots(post.cell, out, board.centre(post.cell).y, -1, 0.17).slice(0, 3);
}

/** The outlets of a chain's `sell` posts, keeping who was on the way across a change of the town. */
export function outletsOf(board: Board, chain: string, before: readonly Outlet[]): Outlet[] {
  const was = new Map(before.map((o) => [o.post.id, o]));
  return board
    .posts(chain)
    .filter((p) => p.role === 'sell')
    .map((post) => ({ post, store: board.store(counterKey(post), outletSpots(board, post)), coming: was.get(post.id)?.coming ?? 0 }));
}

/**
 * The store at a selling place: one per counter or door, whichever chains sell there (loaves and apples
 * side by side on one stall's counter), so two chains never lay things in the same spots.
 */
export function counterKey(post: Post): string {
  return `counter:${post.structure ?? post.cell}:${post.ref}`;
}

/** Where a purchase at an outlet happens (talk.ts): its goods, and the middle of its counter (or of the row by its door). */
export function counterOf(board: Board, o: Outlet): Counter {
  const at = middleOf(o.store) ?? { ...board.centre(o.post.cell), y: board.centre(o.post.cell).y + 0.4 };
  return { store: o.store, at };
}

/** Where a delivery goes: the outlet with the most room (at least `room` free spots), then the nearest to `from`. */
export function roomiest(board: Board, p: Person, outlets: readonly Outlet[], from: number, room = 2): Outlet | null {
  return (
    outlets
      .filter((o) => o.store.items.filter((x) => x === null).length >= Math.min(room, o.store.spots.length) && reaches(board, p, o.post.cell) && board.walk(from, o.post.cell) <= FAR)
      .sort((x, y) => board.count(x.store) - board.count(y.store) || board.walk(from, x.post.cell) - board.walk(from, y.post.cell))[0] ?? null
  );
}

/** A delivery step: stand at the outlet, set out up to `n` of `item` (what was carried was `load`). */
export function deliverStep(board: Board, to: Outlet, load: Load, item: Load, n: number, tag: string) {
  return board.stepAt(to.post.cell, {
    ...standAt(board, to.post, to.post.ref === 'stall' ? 0.18 : 0.05),
    pose: 'tend',
    linger: 1.4,
    load,
    tag,
    done: (q: Person) => {
      let k = 0;
      for (let i = 0; i < n; i++) if (board.put(to.store, item, true)) k++;
      if (k === 0) return false;
      q.load = null;
    },
  });
}

/**
 * A resident goes to buy one `item` at the nearest outlet that has one (more than buyers already on the
 * way), within `reach`, asks for it at the counter in a picture bubble, pays and walks home with it
 * (talk.ts). `chance` is rolled per choice. `want` says what to buy at each outlet instead (and how to
 * ask for it), or null to pass one by; `empty` lets a buyer go to an outlet that has none of it (to be
 * told so: the sold-out talk).
 */
export function buyerPlan(board: Board, chain: Chain, p: Person, outlets: readonly Outlet[], item: Load, chance: number, reach: number, tag: string, opts: { want?(o: Outlet): Want | null; others?(o: Outlet): Want[]; empty?: boolean } = {}): Plan | null {
  if (rand(p.seed, tag, p.trips) >= chance) return null;
  const here = p.cell;
  const own: Want = { item, pic: pictureOf(item) ?? 'apple' };
  const wantAt = (o: Outlet): Want | null => (opts.want ? opts.want(o) : own);
  const to = outlets
    .filter((o) => {
      const w = wantAt(o);
      return w !== null && (opts.empty || board.count(o.store, w.item) > o.coming) && board.dist(o.post.cell, here) <= reach && reaches(board, p, o.post.cell) && board.walk(here, o.post.cell) <= reach * 1.5;
    })
    .sort((x, y) => board.walk(here, x.post.cell) - board.walk(here, y.post.cell) || x.post.cell - y.post.cell)[0];
  if (!to) return null;
  const want = wantAt(to)!;
  const home = board.homeStep(p, { tag: `${tag}:home`, load: want.give ?? want.item });
  if (!home) return null;
  to.coming++;
  let counted = true;
  const arrived = (): void => {
    if (counted) to.coming = Math.max(0, to.coming - 1);
    counted = false;
  };
  const side = (rand(p.seed, `${tag}-side`, p.trips) - 0.5) * 0.4;
  const plan: Plan = { chain, at: 0, steps: [], fail: arrived };
  plan.steps.push(
    board.stepAt(to.post.cell, {
      ...standAt(board, to.post, to.post.ref === 'stall' ? 0.18 : 0.05, side),
      pose: 'chat',
      linger: 2.2,
      tag,
      // At the counter: the talk (talk.ts) says what is bought, and hands it over as it goes.
      done: (q) => {
        arrived();
        return converse(board, q, plan, counterOf(board, to), want, () => (opts.others ? opts.others(to) : wantsIn(board, to.store)), home, tag);
      },
    }),
    home,
  );
  return plan;
}

/** Mornings (dawn and the first third of the day) are when people shop most. */
export function morning(time: TimeSignal): boolean {
  return time.isDawn || (time.isDay && time.phase < 0.2);
}
