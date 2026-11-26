// Market talk (talk.ts, talk.system.ts) and apples to market (chains/apples.ts), stepped with fixed
// time steps in their fixture towns: a purchase is a conversation in picture bubbles, the thing
// changes hands only once the coin has; an empty counter is said to be empty; apples go from the
// orchard to the counter to a home and every one is accounted for; the bubbles have their caps.

import { afterEach, describe, expect, test } from 'vitest';
import type { DressingPlan } from '@/resolve/plan';
import { TALK } from '@/style/town-life';
import fishTown from '../../../scenarios/life/L53.fish.scenario';
import applesTown from '../../../scenarios/life/L68.apples.scenario';
import type { Signals } from '../api';
import type { Person } from '../people/crowd';
import { clock, scenarioTown, watch } from '../people/testing';
import { recordingStage } from '../testing/stage';
import type { ApplesChain } from './chains/apples';
import { allChains, createLivingTown, type LivingTown } from './index';
import { converse as converseFn, inFlight, talksOf, type Talk } from './talk';
import talkSystem, { bubbleCap, chooseBubbles, type Bubble } from './talk.system';

const SCENES = new Set(['beach', 'icecream', 'snow', 'supper', 'picnic', 'carols', 'welcome', 'market']);
const knobs = TALK as { soldOut: number; haggleEvery: number; heartEvery: number };
const saved = { ...knobs };
afterEach(() => Object.assign(knobs, saved));

function living(sc: typeof fishTown, opts: { stage?: ReturnType<typeof recordingStage> } = {}) {
  const town = scenarioTown(sc);
  const c = clock(town.world.seed, 'day');
  opts.stage?.setTown(town.shape, town.dressing);
  const t = createLivingTown({ seed: town.world.seed, chains: allChains().filter((x) => !SCENES.has(x.id)), ...(opts.stage ? { stage: opts.stage.stage } : {}) });
  t.sync(town.shape, town.dressing, c.time);
  return { town, c, t };
}

/** Steps until `until` says so (or `seconds` run out), checking the crowd; returns whether it did. */
function stepUntil(t: LivingTown, c: ReturnType<typeof clock>, seconds: number, until: () => boolean, each?: () => void): boolean {
  const w = watch(t.crowd, { maxStuck: 14 });
  for (let i = 0; i < seconds * 30; i++) {
    t.step(c.tick(1 / 30), c.time);
    w.check();
    each?.();
    if (until()) return true;
  }
  expect(w.problems.filter((x) => !x.includes('walking backwards'))).toEqual([]);
  return false;
}

describe('market talk', () => {
  test('a buyer at the fish stall shows the fish bubble, the seller the coin; the coin goes first, then the fish, and they leave with it', () => {
    knobs.soldOut = 1e9;
    knobs.haggleEvery = 1e9;
    const { t, c } = living(fishTown);
    const talks = talksOf(t.board);
    let talk: Talk | null = null;
    let loadAtCoin: string | null | undefined;
    const found = stepUntil(t, c, 400, () => talk !== null && talk.state === 'done' && talk.buyer.mode === 'walk', () => {
      talk ??= talks.list.find((x) => x.item === 'fishes') ?? null;
      if (talk && loadAtCoin === undefined && t.board.now - talk.start >= talk.coinAt) loadAtCoin = talk.buyer.load;
    });
    expect(found).toBe(true);
    const tk = talk as unknown as Talk;
    expect(tk.outcome).toBe('sold');
    expect(tk.beats.map((b) => `${b.who}:${b.pic}`).filter((x) => x !== 'buyer:heart')).toEqual(['buyer:fish', 'seller:coin']);
    // The fish is still on the counter when the coin goes; in the hand by the end; home with it.
    expect(loadAtCoin).toBeNull();
    expect(tk.buyer.load).toBe('fishes');
    expect(tk.buyer.goal?.errand?.tag).toBe('fish:buy:home');
    expect(tk.handAt).toBeGreaterThan(tk.coinAt);
  });

  test('haggling: one coin, two coins, one coin and a frown, a handshake, then the sale', () => {
    knobs.soldOut = 1e9;
    knobs.haggleEvery = 1;
    const { t, c } = living(fishTown);
    const talks = talksOf(t.board);
    let talk: Talk | null = null;
    expect(stepUntil(t, c, 400, () => (talk ??= talks.list.find((x) => x.item === 'fishes') ?? null) !== null)).toBe(true);
    expect((talk as unknown as Talk).beats.map((b) => `${b.who}:${b.pic}`).slice(0, 6)).toEqual(['buyer:fish', 'buyer:coin', 'seller:coins', 'buyer:haggle', 'seller:handshake', 'seller:coin']);
  });

  test('an empty counter: "none left", then something it does have, or off with nothing', () => {
    const { t, c } = living(fishTown);
    const b = t.board;
    const buyer = t.crowd.people.find((p) => !p.child)!;
    const store = b.store('test:counter', [0, 1, 2].map((i) => ({ x: 20 + i * 0.2, y: 1.2, z: 28, yaw: 0 })));
    b.put(store, 'loaf');
    const ask = (): { plan: { chain: (typeof b.chains)[number]; at: number; steps: never[] }; home: ReturnType<typeof b.stepAt>; ok: boolean } => {
      const home = b.stepAt(buyer.cell, { tag: 'test:home', load: 'fishes' });
      const plan = { chain: b.chains[0]!, at: 0, steps: [] as never[] };
      b.assign(buyer, plan);
      const ok = talksOfConverse(b, buyer, plan, store, home);
      return { plan, home, ok };
    };
    // Fish asked for, none there, a loaf there: they switch.
    const one = ask();
    expect(one.ok).toBe(true);
    const tk = talksOf(b).list.at(-1)!;
    expect(tk.outcome).toBe('switched');
    expect(tk.beats.slice(0, 3).map((x) => `${x.who}:${x.pic}`)).toEqual(['buyer:fish', 'seller:empty', 'buyer:loaf']);
    expect(one.home.load).toBe('loaf');
    for (let i = 0; i < 30 * (tk.end + 0.5); i++) b.step(1 / 30, c.time);
    expect(buyer.load).toBe('loaf');
    expect(b.count(store)).toBe(0);
    // Now nothing at all: told so, and they go off with nothing.
    buyer.load = null;
    const two = ask();
    expect(two.ok).toBe(false);
    const tk2 = talksOf(b).list.at(-1)!;
    expect(tk2.outcome).toBe('none');
    expect(tk2.beats.map((x) => `${x.who}:${x.pic}`)).toEqual(['buyer:fish', 'seller:empty']);
    expect(two.home.load).toBeNull();
  });

  test('one in TALK.soldOut asks first for something the stall has not got', () => {
    knobs.soldOut = 1;
    const { t, c } = living(fishTown);
    const talks = talksOf(t.board);
    let talk: Talk | null = null;
    expect(stepUntil(t, c, 400, () => (talk ??= talks.list.find((x) => x.item === 'fishes') ?? null) !== null)).toBe(true);
    const beats = (talk as unknown as Talk).beats;
    expect(beats[0]!.pic).not.toBe('fish');
    expect(beats[1]!.pic).toBe('empty');
    expect(beats[2]!.pic).toBe('fish');
  });
});

/** converse() straight: what a buyer at a counter holding `store` says when they want a fish. */
function talksOfConverse(b: LivingTown['board'], buyer: Person, plan: Parameters<typeof converseFn>[2], store: Parameters<typeof b.count>[0], home: Parameters<typeof converseFn>[6]): boolean {
  return converseFn(b, buyer, plan, { store, at: { x: 20, y: 1.2, z: 28 } }, { item: 'fishes', pic: 'fish' }, () => [{ item: 'loaf', pic: 'loaf' }], home, 'test:buy');
}

describe('apples to market (L68)', () => {
  test('apples go from the trees to the big basket, to the stall’s counter, into hands and home; every apple is accounted for', () => {
    const { t, c } = living(applesTown);
    const apples = t.board.chains.find((x) => x.id === 'apples') as ApplesChain;
    const talks = talksOf(t.board);
    const seen = { carried: 0, bought: new Set<string>(), home: 0 };
    const was = new Map<Person, string | null>();
    const count = (): number => {
      let n = 0;
      for (const s of t.board.stores.values()) n += s.items.filter((x) => x === 'apple').length;
      return n;
    };
    stepUntil(t, c, 700, () => false, () => {
      for (const p of t.crowd.people) {
        if (p.load === 'apples' && was.get(p) !== 'apples') seen.carried++;
        if (p.load === 'apple') seen.bought.add(p.id);
        if (was.get(p) === 'apple' && p.load === null && p.mode === 'home') seen.home++;
        was.set(p, p.load);
      }
      // Counts add up at every step: picked = lying (big baskets and counters) + carried + in the air + bought + taken home.
      const l = apples.ledger;
      const bought = talks.sold.get('apple') ?? 0;
      expect(l.picked).toBe(count() + apples.carrying + inFlight(t.board).filter((x) => x === 'apple').length + bought + l.takenHome + l.gone);
    });
    expect(apples.ledger.picked).toBeGreaterThan(0);
    expect(seen.carried).toBeGreaterThan(0);
    expect(apples.ledger.delivered).toBeGreaterThan(0);
    expect(seen.bought.size).toBeGreaterThan(0);
    expect(seen.home).toBeGreaterThan(0);
  });

  test('the orchard taken away mid-carry: the carrier takes the apples home, nothing floats, no errors', () => {
    const { town, t, c } = living(applesTown);
    const apples = t.board.chains.find((x) => x.id === 'apples') as ApplesChain;
    const noOrchard: DressingPlan = { ...town.dressing, sockets: town.dressing.sockets.filter((s) => !(s.name ?? '').startsWith('apples|basket') && !(s.type === 'activity' && (s.name === 'basket' || s.name === 'pick'))) };
    let carrier: Person | null = null;
    expect(stepUntil(t, c, 700, () => (carrier = t.crowd.people.find((p) => p.load === 'apples' && p.mode === 'walk') ?? null) !== null)).toBe(true);
    const before = apples.ledger.picked;
    t.sync(town.shape, noOrchard, c.time);
    stepUntil(t, c, 60, () => false);
    const p = carrier as unknown as Person;
    expect(apples.carrier).toBeNull();
    // Home with them (or still on the way, the basket on the head), never set down on a counter after.
    expect(p.load === 'apples' ? p.goal?.kind : 'home').toBe('home');
    expect(apples.ledger.takenHome).toBeGreaterThan(0);
    // No big basket left lying about.
    expect([...t.board.stores.keys()].some((k) => k.startsWith('apples:basket'))).toBe(false);
    expect(apples.ledger.picked).toBe(before);
  });
});

describe('the bubbles’ caps', () => {
  const bubble = (talk: number, x: number, start = talk): Bubble => ({ talk, start, pic: 'fish', side: 'L', x, y: 1, z: 10, age: 0 });

  test('none at the governor’s lowest level; fewer on a phone', () => {
    expect(bubbleCap({ level: 5, levels: [0, 1, 2, 3, 4, 5] }, false)).toBe(0);
    expect(bubbleCap({ level: 0, levels: [0, 1, 2, 3, 4, 5] }, false)).toBe(TALK.cap);
    expect(bubbleCap({ level: 2, levels: [0, 1, 2, 3, 4, 5] }, true)).toBe(TALK.capPhone);
    expect(bubbleCap(null, false)).toBe(TALK.cap);
  });

  test('at most the cap, oldest talks first, and owners closer than TALK.gap never both', () => {
    const all = [bubble(1, 0), bubble(2, 0.5), bubble(3, 4), bubble(4, 8), bubble(5, 12), bubble(1, 0.3)];
    const shown = chooseBubbles(all, 3, 2);
    expect(shown.map((b) => b.talk)).toEqual([1, 1, 3]);
    expect(chooseBubbles(all, 0, 2)).toEqual([]);
  });

  test('at the lowest level nothing is drawn, and the purchases still happen', () => {
    const rec = recordingStage();
    const { t, c } = living(fishTown, { stage: rec });
    const sys = talkSystem;
    const ctx = { stage: rec.stage, signals: {} as Signals, seed: 0 };
    const state = sys.create(ctx);
    const g = globalThis as { __lc?: unknown };
    try {
      g.__lc = { view: { quality: () => ({ level: 4, levels: [0, 1, 2, 3, 4] }) } };
      const talks = talksOf(t.board);
      const pool = (state as { pool: Map<string, unknown[]> }).pool;
      let talked = false;
      stepUntil(t, c, 400, () => (talks.sold.get('fishes') ?? 0) >= 1, () => {
        sys.update(state, 1 / 30, ctx.signals, ctx);
        talked ||= talks.list.length > 0;
      });
      expect(talked).toBe(true);
      expect(talks.sold.get('fishes') ?? 0).toBeGreaterThanOrEqual(1);
      expect(pool.size).toBe(0);
      // Now sharp: the next talk's bubbles are drawn.
      g.__lc = { view: { quality: () => ({ level: 0, levels: [0, 1, 2, 3, 4] }) } };
      const spawnedBefore = rec.spawned.length;
      let bubbles = 0;
      stepUntil(t, c, 400, () => bubbles > 0, () => {
        sys.update(state, 1 / 30, ctx.signals, ctx);
        bubbles = pool.size;
      });
      expect(bubbles).toBeGreaterThan(0);
      expect(rec.spawned.length).toBeGreaterThan(spawnedBefore);
    } finally {
      delete g.__lc;
      sys.dispose?.(state, ctx);
    }
  });
});
