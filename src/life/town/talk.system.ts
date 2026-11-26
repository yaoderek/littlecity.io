// Market talk, drawn (talk.ts tells the story): the picture bubbles over the buyer and the seller,
// turned to the camera and drawn bigger as it draws back (they must read from the whole-island view);
// the coin arcing from hand to hand and the bought thing from the counter to the hand.
//
// Caps: TALK.cap bubbles on screen at once (TALK.capPhone on a phone-sized window), none at the
// quality governor's lowest level (src/render/quality.ts: the purchase still happens, silently, and
// nothing flies either). Only over people in view; two bubbles whose owners stand closer than
// TALK.gap cells do not show at once (the older talk keeps its bubble). The buyer's and the seller's
// bubbles take turns, and whoever stands left on screen has the bubble on the left, so the two never
// cross.

import type { Mat4Like } from '@/core/mat4';
import { defineSystem, type InstanceHandle, type LifeStage } from '@/life/api';
import type { MeshData } from '@/gen/mesh';
import { restingMesh } from '@/parts/people/loads';
import { DESIGN_HEIGHT, lookOf } from '@/parts/people/person';
import { coinMesh, talkBubbleMesh, type Picture } from '@/parts/people/talk-art';
import { PEOPLE } from '@/style/people';
import { LOADS, TALK } from '@/style/town-life';
import { cameraAngles, facing } from '../people/people.system';
import type { Person } from '../people/crowd';
import type { Load } from '../people/errand';
import { place } from '../motion/pose';
import { beatNow, talksOnStage, type Talk } from './talk';

/** A bubble that would show: whose talk, its picture and where its owner's head is. */
export interface Bubble {
  talk: number;
  /** The talk's start: older talks keep their bubbles first. */
  start: number;
  pic: Picture;
  side: 'L' | 'R';
  x: number;
  y: number;
  z: number;
  /** Seconds since this bubble came up (it pops up). */
  age: number;
}

/**
 * Which bubbles show: oldest talk first, at most `cap`, and none whose owner is closer than `gap` cells
 * to the owner of one already showing from another talk. Pure (the tests read it).
 */
export function chooseBubbles(all: readonly Bubble[], cap: number, gap: number): Bubble[] {
  const out: Bubble[] = [];
  for (const b of [...all].sort((p, q) => p.start - q.start || p.talk - q.talk)) {
    if (out.length >= cap) break;
    if (out.some((o) => o.talk !== b.talk && Math.hypot(o.x - b.x, o.z - b.z) < gap)) continue;
    out.push(b);
  }
  return out;
}

interface View {
  getCamera?(): { zoom: number };
  getEyeCamera?(): unknown;
  worldToScreen?(p: [number, number, number]): [number, number];
  canvas?: { clientWidth: number; clientHeight: number };
  quality?(): { level: number; levels: readonly unknown[] };
}
const viewOf = (): View | undefined => (globalThis as { __lc?: { view?: View } }).__lc?.view;

/** How many bubbles may show now: none at the governor's lowest level, fewer on a phone. */
export function bubbleCap(quality: { level: number; levels: readonly unknown[] } | null, phone: boolean): number {
  if (quality && quality.levels.length > 1 && quality.level >= quality.levels.length - 1) return 0;
  return Math.max(0, Math.round(phone ? TALK.capPhone : TALK.cap));
}

function isPhone(): boolean {
  const w = (globalThis as { innerWidth?: number }).innerWidth, h = (globalThis as { innerHeight?: number }).innerHeight;
  return typeof w === 'number' && typeof h === 'number' && Math.min(w, h) < PEOPLE.phoneSide;
}

/** 0 close in (zoom 6 and more, fly mode) to 1 from the whole-island view. */
function farness(view: View | undefined): number {
  if (!view?.getCamera || view.getEyeCamera?.()) return 0;
  return Math.max(0, Math.min(1, (6 - view.getCamera().zoom) / (6 - 1.6)));
}

const heights = new WeakMap<Person, number>();
/** The top of a person's head. */
function headOf(p: Person): number {
  let h = heights.get(p);
  if (h === undefined) heights.set(p, (h = DESIGN_HEIGHT * lookOf(p.look, p.child).scale));
  return p.y + h + 0.06;
}

interface State {
  /** Instances by what they draw, reused frame to frame; how many of each are in use this frame. */
  pool: Map<string, InstanceHandle[]>;
  used: Map<string, number>;
}

function draw(state: State, stage: LifeStage, key: string, mesh: () => MeshData, m: Mat4Like): void {
  let list = state.pool.get(key);
  if (!list) state.pool.set(key, (list = []));
  const i = state.used.get(key) ?? 0;
  state.used.set(key, i + 1);
  let h = list[i];
  if (!h) {
    h = stage.spawnMesh(mesh(), m);
    list.push(h);
  } else h.setVisible(true);
  h.setMatrix(m);
}

const arcM = new Array<number>(16).fill(0);

export default defineSystem<State>({
  id: 'talk',
  // After the people (20): they have moved and their talks have stepped this frame.
  order: 21,
  create() {
    return { pool: new Map(), used: new Map() };
  },
  update(state, _dt, _signals, ctx) {
    const was = new Map(state.used);
    state.used.clear();
    const talks = talksOnStage(ctx.stage);
    const view = viewOf();
    const cap = talks && talks.list.length > 0 ? bubbleCap(view?.quality?.() ?? null, isPhone()) : 0;
    if (cap > 0 && talks) {
      const cam = cameraAngles();
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const W = view?.canvas?.clientWidth ?? 0, H = view?.canvas?.clientHeight ?? 0;
      const fly = Boolean(view?.getEyeCamera?.());
      const seen = (x: number, y: number, z: number): boolean => {
        if (fly || !view?.worldToScreen || W === 0) return true;
        const [sx, sy] = view.worldToScreen([x, y, z]);
        return sx > -60 && sx < W + 60 && sy > -60 && sy < H + 60;
      };
      const all: Bubble[] = [];
      const flying: { talk: Talk; s: number }[] = [];
      for (const t of talks.list) {
        if (t.state === 'off' || !t.buyer.visible) continue;
        const s = talks.now - t.start;
        const b = t.buyer;
        const seller = t.seller && t.seller.visible ? t.seller : null;
        const by = headOf(b);
        const sx = seller ? seller.x : t.counter.x, sz = seller ? seller.z : t.counter.z;
        const sy = seller ? headOf(seller) : t.counter.y + 0.2;
        if (!seen(b.x, by, b.z)) continue;
        // Whoever is left on screen has the bubble on the left.
        const buyerLeft = b.x * rx + b.z * rz <= sx * rx + sz * rz;
        const mine = beatNow(t, t.start + s, 'buyer');
        const theirs = beatNow(t, t.start + s, 'seller');
        if (mine) all.push({ talk: t.id, start: t.start, pic: mine.pic, side: buyerLeft ? 'L' : 'R', x: b.x, y: by, z: b.z, age: s - mine.at });
        if (theirs) all.push({ talk: t.id, start: t.start, pic: theirs.pic, side: buyerLeft ? 'R' : 'L', x: sx, y: sy, z: sz, age: s - theirs.at });
        flying.push({ talk: t, s });
      }
      const far = farness(view);
      const sc = TALK.near + (TALK.far - TALK.near) * far;
      const shown = chooseBubbles(all, cap, TALK.gap);
      for (const b of shown) {
        // It pops up: over a tenth of a second, a little past its size and back.
        const u = Math.min(1, b.age / 0.12);
        const k = u < 1 ? 0.3 + 0.85 * u : 1;
        draw(state, ctx.stage, `${b.pic}:${b.side}`, () => talkBubbleMesh(b.pic, b.side), facing(b.x, b.y, b.z, cam, sc * k));
      }
      // The coin and the goods in the air (only for talks with a bubble up: the same caps).
      const grow = 1 + (LOADS.far - 1) * far;
      for (const { talk: t, s } of flying) {
        if (!shown.some((b) => b.talk === t.id)) continue;
        const b = t.buyer;
        const hand = { x: b.x + Math.sin(b.heading) * 0.12, y: b.y + 0.24, z: b.z + Math.cos(b.heading) * 0.12 };
        const seller = t.seller && t.seller.visible ? t.seller : null;
        const there = seller ? { x: seller.x + Math.sin(seller.heading) * 0.12, y: seller.y + 0.26, z: seller.z + Math.cos(seller.heading) * 0.12 } : t.counter;
        const cu = (s - t.coinAt) / TALK.coinFlight;
        if (cu >= 0 && cu < 1) draw(state, ctx.stage, 'coin', coinMesh, arc(hand, there, cu, 0.28, cu * 14, grow));
        const hu = (s - t.handAt) / TALK.handFlight;
        if (hu >= 0 && hu < 1 && t.item) {
          const item: Load = t.item;
          draw(state, ctx.stage, `item:${item}`, () => restingMesh(item), arc(t.counter, hand, hu, 0.22, b.heading, 0.8 * grow));
        }
      }
    }
    // Whatever showed last frame and not this one is hidden (kept for the next).
    for (const [key, n] of was) {
      const list = state.pool.get(key)!;
      for (let i = state.used.get(key) ?? 0; i < n; i++) list[i]?.setVisible(false);
    }
  },
  dispose(state) {
    for (const list of state.pool.values()) for (const h of list) h.release();
    state.pool.clear();
    state.used.clear();
  },
});

/** Along a low arc from a to b (u 0 → 1), `lift` high at the middle, turned `yaw`, scaled `k`. */
function arc(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, u: number, lift: number, yaw: number, k: number): Mat4Like {
  const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
  const y = a.y + (b.y - a.y) * u + 4 * u * (1 - u) * lift;
  return place(x, y, z, yaw, k, k, k, arcM);
}
