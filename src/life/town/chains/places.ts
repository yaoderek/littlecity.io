// L62 and the fill builder's places: the town's buildings and greens at work.
//
//   school   (L62) a lesson every SCHOOL.cycle seconds by day: the teacher stands at the door waving
//            the children in, the children of the town come and go in; when the lesson is over they
//            burst out running to the yard and hop the hopscotch a while, then go home
//   smith    (L62) the smith hammers at the anvil, sparks flying, between spells in the forge; the
//            forge chimney smokes while the forge is worked
//   show     (L62) now and then a show at a theatre or bandstand: players on the stage (or a band),
//            and residents come to sit on the tiers (or stand round), clapping, until it is over
//   vend     (L62, and disc1-fill's `vend`/`browse`) a shopkeeper at each bridge shop's door, a vendor
//            behind each wall booth and on the market cross's step; customers stop at a booth and go
//            home with a basket
//   pick     (disc1-fill's orchard) at harvest time pickers climb to the fruit by the ladder and carry
//            baskets of apples to the big basket
//   dance    (disc1-fill's maypole) now and then by day, dancers circle the maypole, hand in hand
//
// Every one is a chain on the board (board.ts): they take their hands from the residents.

import { DIR4, key, keyX, keyY, keyZ, opposite, type CellKey } from '@/core/grid';
import { rand } from '@/core/rand';
import { PLACES } from '@/style/town-life';
import { fxOf } from '../../fx/fx';
import { place } from '../../motion/pose';
import type { Person } from '../../people/crowd';
import { DIR_HEADING, type Board, type Chain, type Plan, type PlanStep, type Post } from '../board';
import { canWork, homeCell, keepHand, reaches, standAt } from '../hands';
import { harvestTime } from './harvest';

/** A cycle in life time: where in it we are (0 ≤ t < len) and which one it is. */
function cycle(now: number, len: number, offset: number): { t: number; n: number } {
  const x = now + offset;
  return { t: ((x % len) + len) % len, n: Math.floor(x / len) };
}

// ───────────────────────────────────────────────────────────── school ──

export function schoolChain(): Chain {
  let schools: { door: Post; yard: Post | undefined; teacher: Person | null }[] = [];
  const chain: Chain = {
    id: 'school',
    sync(board) {
      const posts = board.posts('school');
      const before = schools;
      schools = posts
        .filter((p) => p.role === 'door')
        .map((door) => {
          const had = before.find((s) => s.door.structure === door.structure);
          const teacher = keepHand(board, chain, had?.teacher ?? null, door.cell, (p) => p.home === door.structure || p.work === null);
          return { door, yard: posts.find((p) => p.role === 'yard' && p.ref === door.ref), teacher };
        });
      for (const s of before) if (s.teacher && !schools.some((x) => x.teacher === s.teacher) && board.claimedBy(s.teacher) === chain) board.unclaim(s.teacher);
    },
    offer(p, time, board) {
      if (!time.isDay) return null;
      for (const s of schools) {
        const { t } = cycle(board.now, PLACES.schoolCycle, (s.door.structure ?? 0) * 7.3);
        const lessonLeft = PLACES.lesson - t;
        if (p === s.teacher) {
          // Calling them in at the door, then in for the lesson.
          if (t < PLACES.lesson - 4) {
            const inside = board.stepIn(s.door.structure!, { cell: s.door.cell, linger: Math.max(2, lessonLeft), tag: 'school:teach' });
            if (!inside) return null;
            return { chain, at: 0, steps: [board.stepAt(s.door.cell, { ...standAt(board, s.door, 0.05, 0.3), pose: 'wave', linger: 4, tag: 'school:bell' }), inside] };
          }
          return null;
        }
        if (!p.child || board.claimedBy(p) || !reaches(board, p, s.door.cell)) continue;
        const home = homeCell(board, p);
        if (home === null || board.dist(home, s.door.cell) > PLACES.schoolReach) continue;
        if (t > PLACES.lesson - 6) continue; // too late for this one
        const lesson = board.stepIn(s.door.structure!, { cell: s.door.cell, linger: Math.max(1, lessonLeft), brisk: true, tag: 'school:lesson' });
        if (!lesson) continue;
        const steps: PlanStep[] = [lesson];
        if (s.yard) {
          // Out they burst, to the hopscotch.
          const c = board.centre(s.yard.cell);
          const a = rand(p.seed, 'yard', board.now) * Math.PI * 2;
          steps.push(board.stepAt(s.yard.cell, { spot: { x: c.x + Math.cos(a) * 0.25, z: c.z + Math.sin(a) * 0.25 }, face: a + Math.PI, pose: 'hop', linger: PLACES.play * (0.6 + rand(p.seed, 'play', board.now) * 0.6), brisk: true, tag: 'school:play' }));
        }
        return { chain, at: 0, steps };
      }
      return null;
    },
  };
  return chain;
}

// ────────────────────────────────────────────────────────────── smith ──

export function smithChain(): Chain {
  let forges: { anvil: Post; smith: Person | null; chimney: number | undefined; hot: number; spark: number; smoke: number }[] = [];
  const chain: Chain = {
    id: 'smith',
    sync(board) {
      const before = forges;
      forges = board
        .posts('smith')
        .filter((p) => p.role === 'anvil')
        .map((anvil) => {
          const had = before.find((f) => f.anvil.structure === anvil.structure);
          return { anvil, smith: keepHand(board, chain, had?.smith ?? null, anvil.cell, (p) => p.home === anvil.structure || p.work === null), chimney: anvil.ref ? Number(anvil.ref) : undefined, hot: 0, spark: 0, smoke: 0 };
        });
    },
    step(dt, _time, board) {
      for (const f of forges) {
        const s = f.smith;
        const hammering = s !== null && s.mode === 'linger' && s.goal?.errand?.tag === 'smith:hammer';
        f.hot = hammering || (s !== null && s.mode === 'visit' && s.goal?.errand?.tag === 'smith:forge') ? 4 : Math.max(0, f.hot - dt);
        if (!board.stage) continue;
        // Sparks off the anvil with the blows.
        f.spark -= dt;
        if (hammering && f.spark <= 0) {
          f.spark = 0.35;
          const x = s.x + Math.sin(s.heading) * 0.22, z = s.z + Math.cos(s.heading) * 0.22, y = s.y + 0.22;
          for (let i = 0; i < 3; i++) {
            const a = rand(board.seed, 'spark', board.now, i) * Math.PI * 2, r = 0.12 + rand(board.seed, 'spark-r', board.now, i) * 0.12;
            fxOf(board.stage).play({ actor: 'sparkle' }, 0.35, (t, m) => place(x + Math.cos(a) * r * t, y + 0.18 * Math.sin(t * Math.PI), z + Math.sin(a) * r * t, 0, 0.55 * (1 - t) + 0.1, 0.55 * (1 - t) + 0.1, 0.55 * (1 - t) + 0.1, m), { delay: i * 0.04 });
          }
        }
        // Smoke from the forge chimney while the forge is hot.
        f.smoke -= dt;
        if (f.hot > 0 && f.smoke <= 0 && f.chimney !== undefined) {
          f.smoke = 0.7;
          const st = board.shape?.structures.get(f.chimney);
          if (st) {
            const top = st.cells.reduce((a, c) => (keyY(c) > keyY(a) ? c : a));
            const c = board.centre(top);
            const drift = rand(board.seed, 'smoke', board.now);
            fxOf(board.stage).play({ actor: 'puff', variant: 'smoke' }, 2.4, (t, m) => place(c.x + t * 0.4 * (drift - 0.3), c.y + 0.85 + t * 1.1, c.z + t * 0.2, 0, 0.35 + t * 0.7, 0.35 + t * 0.7, 0.35 + t * 0.7, m));
          }
        }
      }
    },
    offer(p, time, board) {
      const f = forges.find((x) => x.smith === p);
      if (!f || !(time.isDay || time.isDawn)) return null;
      const at = f.anvil.dir !== undefined ? standAt(board, f.anvil, 0.05) : { spot: null, face: NaN };
      const steps: PlanStep[] = [board.stepAt(f.anvil.cell, { ...at, pose: 'hammer', linger: PLACES.hammer, tag: 'smith:hammer' })];
      const forge = board.stepIn(f.anvil.structure!, { linger: 3, tag: 'smith:forge' });
      if (forge) steps.push(forge);
      return { chain, at: 0, steps };
    },
  };
  return chain;
}

// ─────────────────────────────────────────────────────────────── show ──

export interface ShowChain extends Chain {
  /** Places with a show on now (by structure id). */
  readonly on: ReadonlySet<number>;
  /** L57: the band at the nearest bandstand within `reach` steps of a cell strikes up now (a wedding at the square). True if one does. */
  strike?(board: Board, near: CellKey, reach: number): boolean;
}

/**
 * Where player `i` of a band stands on a bandstand's floor (R-M11): in a row across the way in, a little
 * back from the open bay, facing out through it; on a 2 × 2 octagon (two ways in) in the middle of its
 * front half. Null for any other venue.
 */
function bandPlace(board: Board, venue: number, stage: readonly Post[], i: number): { post: Post; place: { spot: { x: number; z: number }; face: number } } | null {
  if (board.shape?.roles.get(venue)?.role !== 'bandstand' || stage.length === 0 || stage[0]!.dir === undefined) return null;
  const dir = stage[0]!.dir;
  const [dx, dz] = DIR4[dir]!;
  const cx = stage.reduce((a, p) => a + keyX(p.cell) + 0.5, 0) / stage.length, cz = stage.reduce((a, p) => a + keyZ(p.cell) + 0.5, 0) / stage.length;
  const back = stage.length > 1 ? 0.2 : 0.05, gap = stage.length > 1 ? 0.3 : 0.2;
  const side = (i - 1) * gap;
  const spot = { x: cx - dx * back - dz * side, z: cz - dz * back + dx * side };
  const post = stage.find((p) => keyX(p.cell) === Math.floor(spot.x) && keyZ(p.cell) === Math.floor(spot.z)) ?? stage[0]!;
  return { post, place: { spot, face: DIR_HEADING[dir] } };
}

export function showChain(): ShowChain {
  let venues: { id: number; stage: Post[]; seats: Post[]; players: (Person | null)[]; taken: Set<string> }[] = [];
  const on = new Set<number>();
  /** L57: shows struck up out of turn (by structure id: when). */
  const struck = new Map<number, number>();
  const showOn = (board: Board, id: number): { on: boolean; left: number } => {
    const at = struck.get(id);
    if (at !== undefined && board.now - at < PLACES.show) return { on: true, left: PLACES.show - (board.now - at) };
    const { t } = cycle(board.now, PLACES.showCycle, id * 13.1);
    return { on: t < PLACES.show, left: PLACES.show - t };
  };
  const chain: ShowChain = {
    id: 'show',
    on,
    strike(board, near, reach) {
      const v = venues
        .filter((x) => board.shape?.roles.get(x.id)?.role === 'bandstand' && x.stage.length > 0 && board.dist(x.stage[0]!.cell, near) <= reach)
        .sort((a, b) => board.dist(a.stage[0]!.cell, near) - board.dist(b.stage[0]!.cell, near) || a.id - b.id)[0];
      if (!v) return false;
      if (!showOn(board, v.id).on) struck.set(v.id, board.now);
      // The players come now.
      for (const p of v.players) if (p) board.crowd.rethink(p);
      return true;
    },
    sync(board) {
      const posts = board.posts('show');
      const ids = [...new Set(posts.map((p) => p.structure).filter((x): x is number => x !== undefined))];
      const before = venues;
      venues = ids.map((id) => {
        const had = before.find((v) => v.id === id);
        const stage = posts.filter((p) => p.role === 'stage' && p.structure === id);
        const players = [0, 1, 2].map((i) => (i < stage.length + 1 ? keepHand(board, chain, had?.players[i] ?? null, stage[0]!.cell, (p) => p.work === null) : null));
        return { id, stage, seats: posts.filter((p) => p.role === 'seat' && p.structure === id), players, taken: had?.taken ?? new Set() };
      });
    },
    step(_dt, _time, board) {
      on.clear();
      for (const v of venues) if (showOn(board, v.id).on) on.add(v.id);
    },
    offer(p, time, board) {
      if (!time.isDay && !time.isDusk) return null;
      for (const v of venues) {
        const s = showOn(board, v.id);
        const i = v.players.indexOf(p);
        if (i >= 0) {
          if (!s.on || s.left < 4) return null;
          const band = bandPlace(board, v.id, v.stage, i);
          const at = band?.post ?? v.stage[i % v.stage.length]!;
          const where = band?.place ?? standAt(board, at, 0.1, (i - 1) * 0.2);
          // Playing: gestures, a bow at the end.
          return { chain, at: 0, steps: [board.stepAt(at.cell, { ...where, pose: i === 0 ? 'wave' : 'chat', linger: s.left - 2, tag: 'show:play' }), board.stepAt(at.cell, { ...where, pose: 'tend', linger: 1.5, tag: 'show:bow' })] };
        }
        if (!s.on || s.left < 25 || board.claimedBy(p) || !canWork(p) || rand(p.seed, 'show', p.trips) >= PLACES.audience) continue;
        const seat = v.seats.find((x) => !v.taken.has(x.id) && reaches(board, p, x.cell) && board.dist(x.cell, p.cell) <= PLACES.showReach);
        if (!seat) continue;
        v.taken.add(seat.id);
        const free = (): void => void v.taken.delete(seat.id);
        const sitting = board.shape?.roles.get(v.id)?.role === 'theatre';
        return {
          chain,
          at: 0,
          steps: [board.stepAt(seat.cell, { ...standAt(board, seat, 0, (rand(p.seed, 'seat', p.trips) - 0.5) * 0.3), pose: sitting ? 'sit' : rand(p.seed, 'clap', p.trips) < 0.4 ? 'cheer' : 'look', linger: Math.max(8, s.left - 1), tag: 'show:watch', done: free })],
          fail: free,
        };
      }
      return null;
    },
  };
  return chain;
}

// ─────────────────────────────────────────────────────────────── vend ──

export function vendChain(): Chain {
  let stands: { post: Post; vendor: Person | null }[] = [];
  let browse: Post[] = [];
  const chain: Chain = {
    id: 'vend',
    sync(board) {
      const posts = [...board.posts('vend'), ...board.posts('activity').filter((p) => p.role === 'vend')];
      browse = board.posts('activity').filter((p) => p.role === 'browse');
      const before = stands;
      stands = posts.map((post) => ({ post, vendor: before.find((b) => b.post.id === post.id)?.vendor ?? null }));
      for (const s of stands) s.vendor = keepHand(board, chain, s.vendor, s.post.cell, (p) => (s.post.structure !== undefined && p.home === s.post.structure) || p.work === null);
    },
    offer(p, time, board) {
      if (!time.isDay) return null;
      const s = stands.find((x) => x.vendor === p);
      if (s) {
        const at = s.post.dir !== undefined ? standAt(board, s.post, 0.1, 0.25) : { spot: null, face: NaN };
        return { chain, at: 0, steps: [board.stepAt(s.post.cell, { ...at, pose: rand(p.seed, 'call', p.trips) < 0.4 ? 'wave' : 'chat', linger: 12 + rand(p.seed, 'vend', p.trips) * 10, tag: 'vend:stand' })] };
      }
      if (board.claimedBy(p) || !canWork(p) || browse.length === 0 || rand(p.seed, 'browse', p.trips) >= PLACES.browse) return null;
      const b = browse.filter((x) => reaches(board, p, x.cell) && board.dist(x.cell, p.cell) <= 16).sort((x, y) => board.dist(x.cell, p.cell) - board.dist(y.cell, p.cell))[0];
      if (!b) return null;
      const home = board.homeStep(p, { tag: 'vend:home', load: 'basket' });
      if (!home) return null;
      const at = b.dir !== undefined ? standAt(board, b, 0.15) : { spot: null, face: NaN };
      return { chain, at: 0, steps: [board.stepAt(b.cell, { ...at, pose: 'chat', linger: 3, tag: 'vend:browse', done: (q) => void (q.load = 'basket') }), home] };
    },
  };
  return chain;
}

// ─────────────────────────────────────────────────────── orchard picking ──

export function pickChain(): Chain {
  let picks: Post[] = [];
  let baskets: Post[] = [];
  let pickers: (Person | null)[] = [null, null];
  const chain: Chain = {
    id: 'pick',
    keeps: (load) => load === 'basket',
    sync(board) {
      picks = board.posts('activity').filter((p) => p.role === 'pick');
      baskets = board.posts('activity').filter((p) => p.role === 'basket');
      if (picks.length === 0) {
        for (const x of pickers) if (x && board.claimedBy(x) === chain) board.unclaim(x);
        pickers = [null, null];
        return;
      }
      pickers = pickers.map((had) => keepHand(board, chain, had, picks[0]!.cell, (p) => p.work?.job === 'gardener' || p.work === null));
    },
    offer(p, time, board) {
      const i = pickers.indexOf(p);
      if (i < 0 || !time.isDay || !harvestTime(board) || board.weather.rain > 0.4) return null;
      const pick = picks[(i + Math.floor(board.now / 20)) % picks.length]!;
      const into = baskets.slice().sort((a, b) => board.dist(a.cell, pick.cell) - board.dist(b.cell, pick.cell))[0];
      // At the ladder's foot, facing the tree (the post's dir points away from it). A ladder whose tree is
      // gone lies on the grass and has no post (src/resolve/ruins.ts), so nobody comes to it.
      const foot = pick.dir !== undefined ? standAt(board, { cell: pick.cell, dir: opposite(pick.dir) }, 0.32) : { spot: null, face: NaN };
      const steps: PlanStep[] = [board.stepAt(pick.cell, { ...foot, pose: 'wave', linger: PLACES.pick, tag: 'pick:pick', done: (q) => void (q.load = 'basket') })];
      if (into) steps.push(board.stepAt(into.cell, { ...(into.dir !== undefined ? standAt(board, into, 0.15) : { spot: null, face: NaN }), pose: 'tend', linger: 1, load: 'basket', tag: 'pick:basket', done: (q) => void (q.load = null) }));
      return { chain, at: 0, steps };
    },
  };
  return chain;
}

// ────────────────────────────────────────────────────────────── dance ──

export function danceChain(): Chain {
  let poles: Post[] = [];
  const dancers = new Map<Post, Set<Person>>();
  const chain: Chain = {
    id: 'dance',
    sync(board) {
      poles = board.posts('activity').filter((p) => p.role === 'dance');
    },
    offer(p, time, board) {
      if (!time.isDay || board.claimedBy(p) || p.shutIn || p.leaving) return null;
      for (const pole of poles) {
        const { t, n } = cycle(board.now, PLACES.danceCycle, keyX(pole.cell) * 3.7);
        const left = PLACES.dance - t;
        if (left < 8) continue;
        const set = dancers.get(pole) ?? new Set();
        dancers.set(pole, set);
        for (const d of set) if (!board.plans.has(d)) set.delete(d);
        if (set.size >= PLACES.dancers || !reaches(board, p, pole.cell) || board.dist(p.cell, pole.cell) > 14 || rand(p.seed, 'dance', n) >= 0.5) continue;
        // Round the pole by the cells about it, hand in hand: each dancer starts a quarter round from the last.
        const ring: CellKey[] = [];
        for (const d of [0, 1, 2, 3] as const) {
          const c = key(keyX(pole.cell) + DIR4[d]![0], keyY(pole.cell), keyZ(pole.cell) + DIR4[d]![1]);
          if (board.nav?.nodeAt.has(c)) ring.push(c);
        }
        if (ring.length < 2) continue;
        const start = set.size;
        set.add(p);
        const laps = Math.max(1, Math.floor(left / (ring.length * 2.2)));
        const steps: PlanStep[] = [];
        for (let k = 0; k < laps * ring.length; k++) {
          const cell = ring[(start + k) % ring.length]!;
          const c = board.centre(cell), pc = board.centre(pole.cell);
          const toward = Math.atan2(pc.x - c.x, pc.z - c.z);
          steps.push(board.stepAt(cell, { spot: { x: c.x + (pc.x - c.x) * 0.15, z: c.z + (pc.z - c.z) * 0.15 }, face: toward, pose: 'cheer', linger: 0.4, brisk: true, tag: 'dance:round' }));
        }
        return { chain, at: 0, steps, fail: () => set.delete(p) } satisfies Plan;
      }
      return null;
    },
  };
  return chain;
}

