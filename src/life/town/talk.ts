// Market talk: a purchase is a little conversation in picture bubbles.
//
//   the ask      the buyer, at the counter, shows what they want (a fish, a loaf, an apple…)
//   the answer   yes: the seller shows a coin; a gold coin arcs from the buyer's hand to the
//                seller, then the thing leaves the counter and arcs into the buyer's hand
//                sold out: the seller shows an empty basket; the buyer asks for something the
//                counter does have and takes that, or (nothing else there) goes off empty-handed
//   haggling     now and then, before the coin: one coin, two coins, one coin and a frown, a
//                handshake (both shaking hands)
//   a heart      now and then over the buyer as they turn to go
//
// One purchase about every TALK.soldOut asks first for something the stall has not got. All of it is
// pictures, never words. This file is the story (who shows what when, and what changes hands when);
// talk.system.ts draws it, with its own caps (none at the governor's lowest level: the purchase
// still happens, silently). Pure of the clock: time is the board's, chance rand(seed, ...).

import { rand } from '@/core/rand';
import type { LifeStage } from '@/life/api';
import { WARES, type Picture } from '@/parts/people/talk-art';
import { TALK } from '@/style/town-life';
import type { Person } from '../people/crowd';
import type { Load } from '../people/errand';
import type { Board, Plan, PlanStep, Store } from './board';

export type { Picture } from '@/parts/people/talk-art';

/** What a buyer is after: the thing on the counter, the picture they ask with, and what they carry home (default: the thing). */
export interface Want {
  item: Load;
  pic: Picture;
  give?: Load;
}

/** Where a purchase happens: the goods (null: a booth that never runs out) and the middle of the counter, in the world. */
export interface Counter {
  store: Store | null;
  at: { x: number; y: number; z: number };
}

/** One bubble: whose, what picture, from when to when (seconds from the talk's start). */
export interface Beat {
  who: 'buyer' | 'seller';
  pic: Picture;
  at: number;
  until: number;
}

export interface Talk {
  readonly id: number;
  readonly buyer: Person;
  /** Whoever stands at the counter to answer (a vendor, a trader), or null: the bubble then rises from the counter. */
  readonly seller: Person | null;
  readonly counter: Counter['at'];
  /** Board time it began; seconds it lasts (the buyer stands at the counter that long). */
  readonly start: number;
  readonly end: number;
  readonly beats: readonly Beat[];
  /** Seconds from the start when the coin leaves the buyer's hand, and the thing leaves the counter (NaN: no sale). */
  readonly coinAt: number;
  readonly handAt: number;
  /** What is bought (what leaves the counter) and what goes home in the hand. */
  readonly item: Load | null;
  readonly give: Load | null;
  /** The talk under way, the thing in the air, done (sold or not), or broken off. */
  state: 'talk' | 'flying' | 'done' | 'off';
  /** How it went: sold what was asked, sold something else, or nothing. */
  readonly outcome: 'sold' | 'switched' | 'none';
  readonly store: Store | null;
  readonly plan: Plan;
  readonly home: PlanStep | null;
}

export interface Talks {
  readonly list: Talk[];
  /** Purchases that ran to the end, and things that went into a hand, by kind (tests). */
  readonly sold: Map<Load, number>;
  next: number;
  /** The board's time when the talks were last stepped (the drawing reads it). */
  now: number;
}

const byBoard = new WeakMap<Board, Talks>();
const byStage = new WeakMap<LifeStage, Talks>();

/** The board's talks (made the first time). */
export function talksOf(board: Board): Talks {
  let t = byBoard.get(board);
  if (!t) {
    t = { list: [], sold: new Map(), next: 1, now: board.now };
    byBoard.set(board, t);
    if (board.stage) byStage.set(board.stage, t);
  }
  return t;
}

/** The talks drawn on a stage (talk.system.ts), or null if nobody has talked there yet. */
export function talksOnStage(stage: LifeStage): Talks | null {
  return byStage.get(stage) ?? null;
}

/** The picture a thing on a counter is asked for with, or null if it has none. */
export function pictureOf(item: Load): Picture | null {
  switch (item) {
    case 'fishes':
    case 'fish':
      return 'fish';
    case 'loaf':
    case 'tray':
      return 'loaf';
    case 'apple':
    case 'apples':
    case 'basket':
      return 'apple';
    case 'cheese':
    case 'crate':
      return 'cheese';
    case 'jug':
    case 'barrel':
      return 'jug';
    case 'bouquet':
    case 'petals':
      return 'flower';
    case 'cloth':
      return 'cloth';
    default:
      return null;
  }
}

/** The kinds lying in a store, each as something to ask for (first laid first). */
export function wantsIn(board: Board, store: Store | null): Want[] {
  if (!store) return [];
  const out: Want[] = [];
  for (const it of store.items) {
    if (!it || out.some((w) => w.item === it)) continue;
    const pic = pictureOf(it);
    if (pic) out.push({ item: it, pic });
  }
  void board;
  return out;
}

/** The middle of a store's spots (a counter's top), or null if it has none. */
export function middleOf(store: Store): Counter['at'] | null {
  if (store.spots.length === 0) return null;
  let x = 0, y = 0, z = 0;
  for (const s of store.spots) {
    x += s.x;
    y += s.y;
    z += s.z;
  }
  const n = store.spots.length;
  return { x: x / n, y: y / n, z: z / n };
}

/** Somebody standing at the counter who can answer: the nearest grown-up lingering there who is not buying. */
function sellerAt(board: Board, buyer: Person, at: Counter['at']): Person | null {
  const talks = talksOf(board);
  let best: Person | null = null;
  let bestD = 1.05;
  for (const q of board.crowd.people) {
    if (q === buyer || q.child || !q.visible || q.mode !== 'linger' || Math.abs(q.y - buyer.y) > 0.5) continue;
    const tag = q.goal?.errand?.tag ?? '';
    if (tag.endsWith(':buy') || tag.endsWith(':browse') || talks.list.some((t) => t.buyer === q && t.state !== 'off' && t.state !== 'done')) continue;
    const d = Math.hypot(q.x - at.x, q.z - at.z);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * The buyer has reached the counter: the talk is set going and they stand there for as long as it takes.
 * Returns false if they will leave with nothing (the plan then ends; they stand through the "sold out"
 * first). `others` lists what else the counter has (for when what they want is gone); `home` is the
 * plan's step home, whose load becomes what is really bought.
 */
export function converse(board: Board, buyer: Person, plan: Plan, counter: Counter, want: Want, others: () => Want[], home: PlanStep | null, tag: string): boolean {
  const talks = talksOf(board);
  const r = (what: string): number => rand(buyer.seed, tag, 'talk', buyer.trips, what);
  const B = TALK.bubble;
  const has = (w: Want): boolean => !counter.store || board.count(counter.store, w.item) > 0;
  const beats: Beat[] = [];
  const say = (who: Beat['who'], pic: Picture, at: number, len = B): void => void beats.push({ who, pic, at, until: at + len });
  let t = 0;
  let take: Want | null = want;
  let outcome: Talk['outcome'] = 'sold';
  if (!has(want)) {
    // Really gone: "a fish?" "none left": then something else this counter has, or off they go.
    say('buyer', want.pic, 0);
    say('seller', 'empty', B);
    t = 2 * B;
    take = others().find((w) => w.item !== want.item && has(w)) ?? null;
    outcome = take ? 'switched' : 'none';
  } else if (r('out') < 1 / Math.max(1, TALK.soldOut)) {
    // Something this counter has not got first (the seller shakes their head), then what it has.
    const here = new Set([want.pic, ...others().map((w) => w.pic)]);
    const away = WARES.filter((p) => !here.has(p));
    if (away.length > 0) {
      say('buyer', away[Math.floor(r('what') * away.length)]!, 0);
      say('seller', 'empty', B);
      t = 2 * B;
    }
  }
  let coinAt = NaN, handAt = NaN;
  if (take) {
    say('buyer', take.pic, t);
    t += B;
    if (r('haggle') < 1 / Math.max(1, TALK.haggleEvery)) {
      const q = TALK.haggle / 4;
      say('buyer', 'coin', t, q);
      say('seller', 'coins', t + q, q);
      say('buyer', 'haggle', t + 2 * q, q);
      say('seller', 'handshake', t + 3 * q, q);
      t += TALK.haggle;
    }
    say('seller', 'coin', t);
    coinAt = t + 0.1;
    handAt = coinAt + TALK.coinFlight + 0.05;
    t += B;
    if (r('heart') < 1 / Math.max(1, TALK.heartEvery)) say('buyer', 'heart', t - 0.15, 1.25);
  } else t += 0.4;
  const give = take ? (take.give ?? take.item) : null;
  if (home) home.load = give;
  // They stand at the counter as long as the talk lasts. (The crowd reads the goal's linger after this
  // arrival is heard: arrive() in crowd.ts.)
  if (buyer.goal) buyer.goal.linger = t;
  const talk: Talk = {
    id: talks.next++,
    buyer,
    seller: sellerAt(board, buyer, counter.at),
    counter: counter.at,
    start: board.now,
    end: t,
    beats,
    coinAt,
    handAt,
    item: take?.item ?? null,
    give,
    state: take ? 'talk' : 'done',
    outcome,
    store: counter.store,
    plan,
    home,
  };
  talks.list.push(talk);
  return take !== null;
}

/** The beat showing now over somebody in a talk, if any. */
export function beatNow(talk: Talk, now: number, who: Beat['who']): Beat | null {
  const s = now - talk.start;
  for (const b of talk.beats) if (b.who === who && s >= b.at && s < b.until) return b;
  return null;
}

/** Every frame, after the crowd has moved: the coin and the goods change hands on time; the two gesture as they talk. */
export function stepTalks(board: Board): void {
  const talks = byBoard.get(board);
  if (!talks) return;
  const now = (talks.now = board.now);
  if (talks.list.length === 0) return;
  for (const talk of talks.list) {
    const s = now - talk.start;
    const b = talk.buyer;
    if (talk.state === 'talk' || talk.state === 'flying') {
      // Called away (a raid, a fire, the town changed under them): the talk breaks off, nothing is lost.
      if (board.plans.get(b) !== talk.plan || b.mode === 'gone') {
        if (talk.state === 'flying' && talk.store && talk.item) board.put(talk.store, talk.item);
        talk.state = 'off';
        continue;
      }
      if (talk.state === 'talk' && s >= talk.handAt) {
        if (talk.store && talk.item && !board.take(talk.store, talk.item)) {
          // Gone from the counter after all (packed away, taken by somebody quicker): home with nothing.
          if (talk.home) talk.home.load = null;
          talk.state = 'done';
        } else talk.state = 'flying';
      }
      if (talk.state === 'flying' && s >= talk.handAt + TALK.handFlight) {
        b.load = talk.give;
        if (talk.give) talks.sold.set(talk.give, (talks.sold.get(talk.give) ?? 0) + 1);
        talk.state = 'done';
      }
    }
    if (talk.state === 'off' || s > talk.end) continue;
    // The hands go with the words: talking while their bubble shows, shaking on the price.
    const mine = beatNow(talk, now, 'buyer');
    const theirs = beatNow(talk, now, 'seller');
    if (b.mode === 'linger' && b.react === null && b.visible) b.react = mine?.pic === 'handshake' || theirs?.pic === 'handshake' ? 'shake' : mine ? 'chat' : null;
    const q = talk.seller;
    if (q && q.mode === 'linger' && q.react === null && q.visible) {
      const handing = Number.isFinite(talk.handAt) && s >= talk.handAt - 0.2 && s < talk.handAt + TALK.handFlight;
      q.react = theirs?.pic === 'handshake' || mine?.pic === 'handshake' ? 'shake' : handing ? 'tend' : theirs ? 'chat' : null;
    }
  }
  // Talks long over (their heart has faded too) are dropped.
  for (let i = talks.list.length - 1; i >= 0; i--) {
    const t = talks.list[i]!;
    if (t.state === 'off' || (t.state === 'done' && now - t.start > t.end + 1.5)) talks.list.splice(i, 1);
  }
}

/** The thing in the air between the counter and the hand, if any (tests count it as in a hand). */
export function inFlight(board: Board): Load[] {
  return (byBoard.get(board)?.list ?? []).filter((t) => t.state === 'flying' && t.item).map((t) => t.item!);
}
