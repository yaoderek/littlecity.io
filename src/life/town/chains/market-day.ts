// L56 · Market day (posts from L56.market-day.rule.ts). On market days (the
// first day the town is seen, then seeded: MARKET.chance of days) the square
// fills in the morning:
//
//   traders    one resident per pitch comes with a crate on their chest;
//              as they set it down the stall pops up (an awning, a counter)
//              and three baskets of their goods go out on the counter; they
//              stand behind it calling out and chatting, and put more out
//              when it runs low
//   the busker juggles in the middle of the square, three balls in the air
//   the crowd  residents choosing what to do go to the market far more than
//              anywhere else (MARKET.buy): they stop at a stall and walk home
//              with a basket; some stop and watch the busker, a few cheer
//
// Mid-afternoon (phase MARKET.close) the traders pack the goods back into
// their crates, the stalls fold away with a puff, and they carry the crates
// home. A pitch built over takes its stall away at once (with a puff); a
// trader called away leaves their stall to be folded at closing.

import { CELL_H, DIR4, key, keyX, keyY, keyZ, type CellKey } from '@/core/grid';
import type { Mat4 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { MeshBuilder } from '@/gen/mesh';
import { drawStall } from '@/gen/stall/draw';
import type { InstanceHandle } from '@/life/api';
import type { Goods } from '@/rules/roles/ground-props';
import { STALL } from '@/style/props';
import { MARKET } from '@/style/town-life';
import { fxOf } from '../../fx/fx';
import { easeIn, pop } from '../../motion/ease';
import { place } from '../../motion/pose';
import type { Person } from '../../people/crowd';
import { DIR_HEADING, type Board, type Chain, type Plan, type Post, type Spot } from '../board';
import { canWork, keepHand, reaches } from '../hands';
import { buyerPlan, type Outlet } from '../market';
import { wantsIn, type Picture, type Want } from '../talk';
import { packApples } from './apples';

interface Pitch {
  post: Post;
  outlet: Outlet;
  trader: Person | null;
  /** The stall: up (with its drawing), how far through popping up or folding (0–1), folding. */
  up: boolean;
  handle: InstanceHandle | null;
  t: number;
  folding: boolean;
  /** Seconds closed with the stall still up and nobody packing it. */
  idle: number;
  /** Market talk: the pitch the fisher's catch goes to (a fish stall for the day), the one the orchard's apples go to, or neither. */
  sells: 'fish' | 'fruit' | null;
}

/** What market-day customers ask for at a pitch, by its goods (L56: fruit, bread, cheese, pots, cloth). */
const GOODS_PICTURE: Record<Goods, Picture> = { fruit: 'apple', bread: 'loaf', cheese: 'cheese', pots: 'jug', cloth: 'cloth' };

/** How much dearer a cell with a market stall in it is to walk through (a street tree's clutter is 20). */
const NAV_STALL = 30;

export interface MarketChain extends Chain {
  /** Whether the market is on now, and today's number (0 = the first day seen). */
  readonly open: boolean;
  readonly day: number;
  readonly pitches: readonly Pitch[];
  /** The pitch the fisher's catch (or the orchard's apples) go to today, while its stall is up; else null. */
  pitchFor(kind: 'fish' | 'fruit'): Outlet | null;
}

export function marketChain(): MarketChain {
  let pitches: Pitch[] = [];
  let busk: Post | undefined;
  let busker: Person | null = null;
  let day = 0;
  let lastPart = '';
  let open = false;
  let seed = 0;

  const marketDay = (n: number): boolean => n === 0 || rand(seed, 'market-day', n) < MARKET.chance;
  const counterSpots = (board: Board, post: Post): Spot[] => {
    const [fx, fz] = DIR4[post.dir ?? 2]!;
    const c = board.centre(post.cell);
    const y = keyY(post.cell) * CELL_H + STALL.counter;
    return [-0.24, 0, 0.24].map((side, i) => ({ x: c.x + fx * 0.3 - fz * side, y, z: c.z + fz * 0.3 + fx * side, yaw: DIR_HEADING[post.dir ?? 2] + Math.PI / 2 + i * 0.4 }));
  };
  /** Behind the counter, facing out over it. */
  const behind = (board: Board, post: Post): { spot: { x: number; z: number }; face: number } => {
    const [fx, fz] = DIR4[post.dir ?? 2]!;
    const c = board.centre(post.cell);
    return { spot: { x: c.x - fx * 0.12, z: c.z - fz * 0.12 }, face: DIR_HEADING[post.dir ?? 2] };
  };
  const stallMatrix = (board: Board, p: Pitch, k: number, out?: Mat4): Mat4 => {
    const c = board.centre(p.post.cell);
    return place(c.x, c.y, c.z, 0, Math.max(0.001, k), Math.max(0.001, k), Math.max(0.001, k), out);
  };
  const raise = (board: Board, p: Pitch): void => {
    if (p.up) return;
    p.up = true;
    p.folding = false;
    p.t = 0;
    // Walkers go round it while it stands.
    board.crowd.setCrowded(p.post.cell, NAV_STALL);
    if (!board.stage) return;
    const b = new MeshBuilder({ ink: `market-${p.post.id}` });
    // The fish pitch is a fish stall for the day (market talk: the fisher brings the catch to it).
    drawStall(b, { role: p.sells === 'fish' ? 'fish-stall' : 'market-stall', goods: (p.post.ref || 'fruit') as Goods, front: p.post.dir ?? 2, seed: rand(seed, 'market-stall', p.post.cell) * 1e9 >>> 0 });
    p.handle = board.stage.spawnMesh(b.build(), stallMatrix(board, p, 0.001));
  };
  const fold = (board: Board, p: Pitch, now: boolean): void => {
    if (!p.up) return;
    board.crowd.setCrowded(p.post.cell, 0);
    // What lies on the counter goes into the crate (the trader takes it) or, if nobody packs, with the puff.
    let apples = 0;
    for (let it = board.take(p.outlet.store); it; it = board.take(p.outlet.store)) if (it === 'apple') apples++;
    packApples(board, apples);
    if (now || !board.stage) {
      p.handle?.release();
      p.handle = null;
      p.up = false;
      p.folding = false;
      if (board.stage) puff(board, p);
      return;
    }
    p.folding = true;
    p.t = 0;
  };
  const puff = (board: Board, p: Pitch): void => {
    if (!board.stage) return;
    const c = board.centre(p.post.cell);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      fxOf(board.stage).play({ actor: 'puff', variant: 'dust' }, 0.5, (t, m) => place(c.x + Math.cos(a) * 0.25 * t, c.y + 0.1 + t * 0.2, c.z + Math.sin(a) * 0.25 * t, 0, 0.6 + t * 0.6, 0.6 + t * 0.6, 0.6 + t * 0.6, m), { delay: i * 0.05 });
    }
  };

  const chain: MarketChain = {
    id: 'market',
    get open() {
      return open;
    },
    get day() {
      return day;
    },
    get pitches() {
      return pitches;
    },
    pitchFor(kind) {
      const p = pitches.find((x) => x.sells === kind);
      return open && p && p.up && !p.folding ? p.outlet : null;
    },
    sync(board) {
      seed = board.seed;
      const posts = board.posts('market');
      busk = posts.find((p) => p.role === 'busk');
      const before = new Map(pitches.map((p) => [p.post.cell, p]));
      const next: Pitch[] = [];
      for (const post of posts.filter((p) => p.role === 'pitch')) {
        const had = before.get(post.cell);
        before.delete(post.cell);
        const store = board.store(`market:${post.cell}`, counterSpots(board, post));
        const outlet: Outlet = { post: { ...post, ref: 'stall' }, store, coming: had?.outlet.coming ?? 0 };
        const p: Pitch = had ? { ...had, post, outlet } : { post, outlet, trader: null, up: false, handle: null, t: 0, folding: false, idle: 0, sells: null };
        p.trader = keepHand(board, chain, p.trader, post.cell, (q) => q.work === null);
        next.push(p);
      }
      // Pitches gone (built over, the square changed): their stalls go at once.
      for (const gone of before.values()) {
        fold(board, gone, true);
        if (gone.trader && board.claimedBy(gone.trader) === chain) board.unclaim(gone.trader);
      }
      pitches = next;
      // Market talk: the fruit pitch takes the orchard's apples; with a fisher in town, the pitch nearest the
      // catch (not the fruit one) sells fish.
      const fruit = next.find((x) => x.post.ref === 'fruit') ?? null;
      const catchAt = board.posts('fish').find((x) => x.role === 'catch')?.cell;
      const fish = catchAt === undefined ? null : (next.filter((x) => x !== fruit).sort((a, b) => board.dist(a.post.cell, catchAt) - board.dist(b.post.cell, catchAt) || a.post.cell - b.post.cell)[0] ?? null);
      for (const x of next) x.sells = x === fish ? 'fish' : x === fruit ? 'fruit' : null;
      if (busk) busker = keepHand(board, chain, busker, busk.cell, (q) => q.work === null);
      else {
        if (busker && board.claimedBy(busker) === chain) board.unclaim(busker);
        busker = null;
      }
    },
    step(dt, time, board) {
      if (time.isDawn && lastPart !== '' && lastPart !== 'dawn') day++;
      lastPart = time.part;
      open = pitches.length > 0 && marketDay(day) && (time.isDawn || (time.isDay && time.phase < MARKET.close));
      for (const p of pitches) {
        if (p.up && p.handle && board.stage) {
          p.t = Math.min(1, p.t + dt / (p.folding ? 0.45 : 0.4));
          const k = p.folding ? 1 - easeIn(p.t) : pop(p.t);
          p.handle.setMatrix(stallMatrix(board, p, k));
          if (p.folding && p.t >= 1) {
            p.handle.release();
            p.handle = null;
            p.up = false;
            p.folding = false;
            puff(board, p);
          }
        } else if (p.up && p.folding) {
          p.up = false;
          p.folding = false;
        }
        // Closed, the stall still up, and nobody coming to pack it: it folds by itself.
        p.idle = !open && p.up && !p.folding && (!p.trader || !board.plans.has(p.trader)) ? p.idle + dt : 0;
        if (p.idle > MARKET.abandon) fold(board, p, false);
      }
    },
    offer(p, _time, board) {
      for (const pitch of pitches) if (pitch.trader === p) return traderPlan(board, p, pitch);
      if (p === busker) return open && busk ? { chain, at: 0, steps: [board.stepAt(busk.cell, { ...centreOf(board, busk.cell), pose: 'juggle', linger: 20, tag: 'market:busk' })] } : null;
      if (!open || board.claimedBy(p) || !canWork(p)) return null;
      // Market talk: asked for by what lies on that counter (a fish, an apple) or what the pitch sells.
      const pitchOf = (o: Outlet): Pitch | undefined => pitches.find((x) => x.outlet === o);
      const basketOf = (pt: Pitch): Want => ({ item: 'basket', pic: GOODS_PICTURE[(pt.post.ref || 'fruit') as Goods] ?? 'apple', give: 'basket' });
      const buy = buyerPlan(board, chain, p, pitches.filter((x) => x.up && !x.folding).map((x) => x.outlet), 'basket', MARKET.buy, MARKET.reach, 'market:buy', {
        want: (o) => {
          const pt = pitchOf(o);
          if (!pt) return null;
          if (pt.sells === 'fish') return { item: 'fishes', pic: 'fish' };
          if (board.count(o.store, 'apple') > o.coming) return { item: 'apple', pic: 'apple' };
          return basketOf(pt);
        },
        others: (o) => {
          const pt = pitchOf(o);
          return wantsIn(board, o.store).map((w) => (w.item === 'basket' && pt ? basketOf(pt) : w));
        },
      });
      if (buy) return buy;
      if (busk && rand(p.seed, 'market-watch', p.trips) < MARKET.watch && reaches(board, p, busk.cell)) return watchPlan(board, p, busk);
      return null;
    },
    dispose(board) {
      for (const p of pitches) fold(board, p, true);
    },
  };

  const centreOf = (board: Board, cell: CellKey): { spot: { x: number; z: number }; face: number } => {
    const c = board.centre(cell);
    return { spot: { x: c.x, z: c.z }, face: NaN };
  };

  const watchPlan = (board: Board, p: Person, at: Post): Plan | null => {
    // A cell beside the busker, looking at them.
    const nav = board.nav;
    if (!nav) return null;
    const around = [0, 1, 2, 3]
      .map((d) => ({ d, cell: key(keyX(at.cell) + DIR4[d]![0], keyY(at.cell), keyZ(at.cell) + DIR4[d]![1]) }))
      .filter((x) => nav.nodeAt.has(x.cell));
    if (around.length === 0) return null;
    const pick = around[Math.floor(rand(p.seed, 'busk-ring', p.trips) * around.length)]!;
    const c = board.centre(pick.cell);
    const [dx, dz] = DIR4[pick.d]!;
    const side = (rand(p.seed, 'busk-side', p.trips) - 0.5) * 0.5;
    return {
      chain,
      at: 0,
      steps: [
        board.stepAt(pick.cell, {
          spot: { x: c.x + dx * 0.1 - dz * side, z: c.z + dz * 0.1 + dx * side },
          face: DIR_HEADING[(pick.d + 2) % 4]!,
          pose: rand(p.seed, 'busk-cheer', p.trips) < 0.4 ? 'cheer' : 'look',
          linger: 5 + rand(p.seed, 'busk-time', p.trips) * 5,
          tag: 'market:watch',
        }),
      ],
    };
  };

  const traderPlan = (board: Board, p: Person, pitch: Pitch): Plan | null => {
    const at = behind(board, pitch.post);
    const store = pitch.outlet.store;
    if (open && !pitch.up) {
      return {
        chain,
        at: 0,
        steps: [
          board.stepAt(pitch.post.cell, {
            ...at,
            pose: 'tend',
            linger: 1.6,
            load: 'crate',
            tag: 'market:set-up',
            done: (q) => {
              if (!open) return false;
              raise(board, pitch);
              // (The fish pitch's goods come up from the pier: fish.ts.)
              if (pitch.sells !== 'fish') for (let i = 0; i < 3; i++) board.put(store, 'basket');
              q.load = null;
            },
          }),
        ],
      };
    }
    if (open && pitch.up && !pitch.folding) {
      return {
        chain,
        at: 0,
        steps: [
          board.stepAt(pitch.post.cell, {
            ...at,
            pose: rand(p.seed, 'call', p.trips) < 0.45 ? 'wave' : 'chat',
            linger: 10 + rand(p.seed, 'stand', p.trips) * 8,
            tag: 'market:trade',
            done: () => {
              // More out from under the counter when it runs low.
              if (board.count(store) < 2 && pitch.sells !== 'fish') for (let i = 0; i < 2; i++) board.put(store, 'basket');
            },
          }),
        ],
      };
    }
    if (!open && pitch.up && !pitch.folding) {
      const home = board.homeStep(p, { tag: 'market:home', load: 'crate' });
      return {
        chain,
        at: 0,
        steps: [
          board.stepAt(pitch.post.cell, {
            ...at,
            pose: 'tend',
            linger: 1.6,
            tag: 'market:pack',
            done: (q) => {
              fold(board, pitch, false);
              q.load = 'crate';
            },
          }),
          ...(home ? [home] : []),
        ],
      };
    }
    return null;
  };

  return chain;
}
