// A big ship's crew and cargo (L38–L40). The sailors are aboard from the
// moment the ship comes in through the edge of the map to the moment it
// leaves through it: between jobs they stand at their places on deck, riding
// the swell with the ship. Its cargo lies on deck by the hatch.
//
// Alongside a quay they work it. If goods lie on the quay from an earlier
// visit they carry those aboard first and set them down on deck; then they
// take cargo from the deck, over the rail, down the gangplank, and set it
// down on the quay where it piles up. When the ship is ready to sail they go
// back to their places.
//
// Nothing appears or disappears: every crate, barrel and sack is carried from
// one place to another, and the goods on the quay stay there between visits
// (the harbour's Pile per berth). Only if the quay under them is taken away
// do they go, in the removal puff (visit.ts).
//
// Drawn like the residents (src/parts/people): five rigid pieces each, a held
// walk drawn on twos with the stride by distance, so feet do not slide.

import type { Mat4Like, Vec3 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { aimArm } from '@/parts/people/hands';
import { buildPerson, lookOf, PIECES, rigOf, type Look, type Rig } from '@/parts/people/person';
import { poseOf, rigMatrices, type PoseName } from '@/parts/people/pose';
import { PERSON } from '@/style/people';
import { PALETTE, RAMPS } from '@/style/palette';
import type { InstanceHandle, LifeStage } from '../api';
import { place } from '../motion/pose';

const HIDDEN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
/** Walking pace, columns a second (a little slower carrying). */
const PACE = 0.72;

/** The route of one trip, ship end to quay end. Deck points are in the ship's frame; the foot in the world. */
export interface Gangway {
  /** On deck by the hatch, where the cargo lies, and the foot of the rail where the plank comes aboard (ship frame). */
  hatch: Vec3;
  rail: Vec3;
  /** On the rail where the plank rests (ship frame). */
  top: Vec3;
  /** The plank's foot on the quay (world). */
  foot: Vec3;
}

/** A place on the quay where goods lie: world position and turn. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const GOODS_KIND = new WeakMap<object, string>();
/** What a piece of ship's cargo is ('crate', 'barrel', 'sack'): the town's carters (L58) read it off the quay. */
export function goodsKindOf(h: InstanceHandle): string | undefined {
  return GOODS_KIND.get(h);
}

/** Marks a piece of goods spawned elsewhere (the port's dock workers, src/life/port) so the carters know what it is. */
export function markGoods(h: InstanceHandle, kind: string): void {
  GOODS_KIND.set(h, kind);
}

/** Goods lying on a quay: what lies in each of its spots (null: free). */
export interface Pile {
  spots: Spot[];
  items: (InstanceHandle | null)[];
}

/** Where a sailor is on deck (not on the plank, the rail's top or the quay). */
const ON_DECK = new Set<string>(['idle', 'to-cargo', 'cargo', 'deck', 'back-deck', 'stow', 'home']);

type Leg = 'idle' | 'to-cargo' | 'cargo' | 'deck' | 'up' | 'plank' | 'quay' | 'drop' | 'back-quay' | 'back-plank' | 'down' | 'back-deck' | 'stow' | 'home';

/** Cargo carried in front at the chest: forward of the feet and up off the ground (world units, its bottom's middle). */
export const CARGO_AT = [0.13, 0.16] as const;
/** Where the hands go to hold it, body frame (figure units): either side of it, as far round as the arms reach. */
export const CARGO_GRIP: Vec3 = [0.1, 0.24, 0.1];

interface Sailor {
  look: Look;
  rig: Rig;
  pieces: InstanceHandle[];
  /** Where it stands between jobs (ship frame). */
  place: Vec3;
  leg: Leg;
  t: number;
  len: number;
  stride: number;
  wait: number;
  /** Taking goods aboard (from the quay) or landing them; the pile spot and deck slot it is for. */
  loading: boolean;
  spot: number;
  slot: number;
  item: InstanceHandle | null;
  heading: number;
  /** The number its face and hair come from (as the town's people's `look`). */
  seed: number;
  /** Taken off the ship (mischief: the UFO): not drawn here, no work, and the ship does not wait for him. */
  taken: boolean;
  /** Where it was last drawn (world) and facing. */
  at: [number, number, number];
  yaw: number;
}

/** A sailor standing at his place on deck now (mischief: one the UFO could take). */
export interface DeckHand {
  crew: Crew;
  i: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  look: number;
}

/** Kinds of goods each ship carries. */
const CARGO: Record<string, readonly string[]> = {
  galleon: ['crate', 'barrel', 'crate'],
  cog: ['barrel', 'sack', 'barrel'],
  galley: ['sack', 'crate', 'sack'],
};

export class Crew {
  private sailors: Sailor[] = [];
  /** The cargo on deck: slot positions round the hatch (ship frame) and what lies in each. */
  private slots: Vec3[] = [];
  private deck: (InstanceHandle | null)[] = [];
  private pile: Pile | null = null;
  private toLand = 0;
  private local = new Float32Array(80);
  private world = new Float32Array(16);
  private time = 0;
  private claimed = new Set<number>();
  private claimedSlots = new Set<number>();
  /** The ship's matrix last update (for where a sailor's place is now). */
  private hull: Mat4Like | null = null;

  constructor(private stage: LifeStage, seed: number, kind: string, places: readonly Vec3[], hatch: Vec3, cargo: number, private landing: number) {
    // Cargo slots: two rows either side of the hatch, aft and forward of it.
    for (const dz of [-0.36, -0.08, 0.2]) for (const dx of [-0.26, 0.26]) this.slots.push([hatch[0] + dx, hatch[1], hatch[2] + dz]);
    const kinds = CARGO[kind] ?? CARGO.galleon!;
    this.deck = this.slots.map((_, i) => {
      if (i >= cargo) return null;
      const h = stage.spawn({ actor: 'ship-goods', variant: kinds[i % 3]!, params: { look: (rand(seed, 'cargo', i) * 1000) | 0 } }, HIDDEN);
      GOODS_KIND.set(h, kinds[i % 3]!); // for the town's carters (L58: goodsKindOf)
      return h;
    });
    places.forEach((at, i) => {
      const lookSeed = rand(seed, 'sailor', i) * 1e9 >>> 0;
      const base = lookOf(lookSeed);
      const look: Look = { ...base, dress: false, top: i % 2 === 0 ? PALETTE.white : RAMPS.roof[1]!, bottom: PALETTE.metal, hat: i === 0 ? 'cap' : base.hat === 'straw' ? 'none' : base.hat, hatColor: PALETTE.redDark, child: false };
      const meshes = buildPerson(look, `sailor-${seed}-${i}`);
      this.sailors.push({ look, rig: rigOf(look), pieces: PIECES.map((p) => stage.spawnMesh(meshes[p], HIDDEN)), place: at, leg: 'idle', t: 1, len: 1, stride: rand(seed, 'stride', i), wait: 1.5 + i * 2.2, loading: false, spot: -1, slot: -1, item: null, heading: rand(seed, 'face', i) * Math.PI * 2, seed: lookSeed, taken: false, at: [0, -50, 0], yaw: 0 });
    });
  }

  /** Alongside a quay with this pile: work it (land up to `landing` goods). Null: at sea. */
  setPile(pile: Pile | null): void {
    if (pile && pile !== this.pile) this.toLand = this.landing;
    this.pile = pile;
  }

  /** True once everyone is back at their places aboard (one taken off it is not waited for). */
  get aboard(): boolean {
    return this.sailors.every((s) => s.leg === 'idle' || s.taken);
  }

  /** How many of the crew are aboard (not taken off it). */
  get hands(): number {
    return this.sailors.filter((s) => !s.taken).length;
  }

  /** Mischief (the UFO): the sailors on deck now (at their places or at work there, not on the plank or the quay), where they are drawn. */
  deckHands(): DeckHand[] {
    const out: DeckHand[] = [];
    this.sailors.forEach((s, i) => {
      if (!s.taken && ON_DECK.has(s.leg) && s.at[1] > -10) out.push({ crew: this, i, x: s.at[0], y: s.at[1], z: s.at[2], heading: s.yaw, look: s.seed });
    });
    return out;
  }

  /** Mischief: sailor `i` is taken off the ship now (if he is on deck): what he carried is left on deck, and he is drawn here no more. */
  take(i: number): boolean {
    const s = this.sailors[i];
    if (!s || s.taken || !ON_DECK.has(s.leg)) return false;
    this.recall(s);
    s.taken = true;
    for (const h of s.pieces) h.setMatrix(HIDDEN);
    return true;
  }

  /** Mischief: where sailor `i`'s place on deck is now (world), or null if the ship has gone. */
  placeOf(i: number): Vec3 | null {
    const s = this.sailors[i], m = this.hull;
    if (!s || !m) return null;
    const p = s.place;
    return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
  }

  /** Mischief: sailor `i` is back at his place on deck. */
  giveBack(i: number): void {
    const s = this.sailors[i];
    if (!s || !s.taken) return;
    s.taken = false;
    s.leg = 'idle';
    s.t = 1;
    s.wait = 1.5;
  }

  private nextJob(): { loading: boolean; spot: number; slot: number } | null {
    const pile = this.pile;
    if (!pile) return null;
    // Goods waiting on the quay come aboard first, to a free place on deck.
    const freeSlot = this.deck.findIndex((d, i) => !d && !this.claimedSlots.has(i));
    for (let i = pile.items.length - 1; i >= 0; i--) if (pile.items[i] && !this.claimed.has(i) && freeSlot >= 0) return { loading: true, spot: i, slot: freeSlot };
    if (this.toLand <= 0) return null;
    const load = this.deck.findIndex((d, i) => d && !this.claimedSlots.has(i));
    const spot = pile.items.findIndex((it, i) => !it && !this.claimed.has(i));
    return load >= 0 && spot >= 0 ? { loading: false, spot, slot: load } : null;
  }

  /**
   * Moves the crew `dt` seconds on and places them and the deck cargo on a ship whose matrix is `hull`.
   * `way` is the gangway while alongside (null at sea); `working` false sends everyone back to their places.
   */
  update(dt: number, hull: Mat4Like, way: Gangway | null, working: boolean): void {
    this.time += dt;
    const w = (p: Vec3): Vec3 => [hull[0]! * p[0] + hull[4]! * p[1] + hull[8]! * p[2] + hull[12]!, hull[1]! * p[0] + hull[5]! * p[1] + hull[9]! * p[2] + hull[13]!, hull[2]! * p[0] + hull[6]! * p[1] + hull[10]! * p[2] + hull[14]!];
    const yaw = Math.atan2(hull[8]!, hull[10]!);
    this.hull = hull;
    // The cargo on deck rides with the ship.
    this.deck.forEach((d, i) => {
      if (!d) return;
      const p = w(this.slots[i]!);
      d.setMatrix(place(p[0], p[1], p[2], yaw + i * 0.4));
    });
    const dist = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[2] - a[2]) + Math.abs(b[1] - a[1]) * 0.5;
    this.sailors.forEach((s, i) => {
      if (s.taken) return;
      const home = w(s.place);
      if (!way) {
        // At sea: at their places, now and then turning to look out.
        if (s.leg !== 'idle') this.recall(s);
        this.draw(s, home[0], home[1], home[2], yaw + s.heading, 'stand');
        return;
      }
      const pile = this.pile;
      const spot = pile && s.spot >= 0 ? pile.spots[s.spot] : undefined;
      const at: Vec3 = spot ? [spot.x - Math.sin(spot.yaw) * 0.22, spot.y, spot.z - Math.cos(spot.yaw) * 0.22] : way.foot;
      const cargo = s.slot >= 0 ? w(this.slots[s.slot]!) : w(way.hatch);
      const rail = w(way.rail), top = w(way.top), foot = way.foot;
      const ends: Record<Leg, [Vec3, Vec3]> = {
        idle: [home, home],
        'to-cargo': [home, cargo],
        cargo: [cargo, cargo],
        deck: [cargo, rail],
        up: [rail, top],
        plank: [top, foot],
        quay: [foot, at],
        drop: [at, at],
        'back-quay': [at, foot],
        'back-plank': [foot, top],
        down: [top, rail],
        'back-deck': [rail, cargo],
        stow: [cargo, cargo],
        home: [cargo, home],
      };
      if (s.t >= 1) {
        let next: Leg;
        switch (s.leg) {
          case 'idle': {
            const job = working ? this.nextJob() : null;
            if (!job || (s.wait -= dt) > 0) {
              this.draw(s, home[0], home[1], home[2], yaw + s.heading, 'stand');
              return;
            }
            s.loading = job.loading;
            s.spot = job.spot;
            s.slot = job.slot;
            this.claimed.add(job.spot);
            this.claimedSlots.add(job.slot);
            if (!job.loading) this.toLand--;
            next = 'to-cargo';
            break;
          }
          case 'to-cargo':
            next = 'cargo';
            break;
          case 'cargo':
            // Landing: lift it off the deck.
            if (!s.loading) {
              s.item = this.deck[s.slot] ?? null;
              this.deck[s.slot] = null;
            }
            next = 'deck';
            break;
          case 'deck': next = 'up'; break;
          case 'up': next = 'plank'; break;
          case 'plank': next = 'quay'; break;
          case 'quay': next = 'drop'; break;
          case 'drop': {
            const sp = pile!.spots[s.spot]!;
            if (s.loading) {
              s.item = pile!.items[s.spot] ?? null;
              pile!.items[s.spot] = null;
            } else if (s.item) {
              s.item.setMatrix(place(sp.x, sp.y, sp.z, sp.yaw));
              pile!.items[s.spot] = s.item;
              s.item = null;
            }
            this.claimed.delete(s.spot);
            next = 'back-quay';
            break;
          }
          case 'back-quay': next = 'back-plank'; break;
          case 'back-plank': next = 'down'; break;
          case 'down': next = 'back-deck'; break;
          case 'back-deck':
            next = 'stow';
            break;
          case 'stow':
            // Taking aboard: set it down on deck.
            if (s.item) {
              this.deck[s.slot] = s.item;
              s.item = null;
            }
            this.claimedSlots.delete(s.slot);
            next = 'home';
            break;
          default:
            next = 'idle';
            s.wait = 0.6;
        }
        s.leg = next;
        s.t = 0;
        const [a, b] = ends[next];
        s.len = next === 'cargo' || next === 'stow' ? 0.5 * PACE : next === 'drop' ? 0.5 * PACE : next === 'idle' ? 1 : Math.max(0.05, dist(a, b));
      }
      // Called back aboard: anyone on the way out turns round now, keeping what they carry.
      if (!working && (s.leg === 'quay' || s.leg === 'plank' || s.leg === 'deck' || s.leg === 'up')) {
        if (s.spot >= 0 && !s.loading) this.claimed.delete(s.spot);
        const back: Record<string, Leg> = { quay: 'back-quay', plank: 'back-plank', up: 'down', deck: 'back-deck' };
        s.leg = back[s.leg]!;
        s.t = 1 - s.t;
      }
      const [a, b] = ends[s.leg];
      const still = s.leg === 'cargo' || s.leg === 'drop' || s.leg === 'stow' || s.leg === 'idle';
      const step = (dt * PACE * (s.item ? 0.85 : 1)) / s.len;
      s.t = Math.min(1, s.t + (still ? dt / s.len : step));
      const x = a[0] + (b[0] - a[0]) * s.t, y = a[1] + (b[1] - a[1]) * s.t, z = a[2] + (b[2] - a[2]) * s.t;
      if (!still) s.stride += (dt * PACE) / (PERSON.height * 2.4);
      const heading = still ? Math.atan2(b[0] - rail[0], b[2] - rail[2]) + Math.PI : Math.atan2(b[0] - a[0], b[2] - a[2]);
      const pose: PoseName = still ? (s.leg === 'idle' ? 'stand' : 'tend') : s.item ? 'carry' : 'walk';
      this.draw(s, x, y, z, heading, pose);
      void i;
    });
  }

  /** Back to its place at once (the ship had to move off in a hurry): what it carries goes on deck. */
  private recall(s: Sailor): void {
    if (s.item) {
      const free = this.deck.findIndex((d) => !d);
      if (free >= 0) this.deck[free] = s.item;
      else this.deck[s.slot >= 0 ? s.slot : 0] = s.item;
      s.item = null;
    }
    if (s.spot >= 0) this.claimed.delete(s.spot);
    if (s.slot >= 0) this.claimedSlots.delete(s.slot);
    s.leg = 'idle';
    s.t = 1;
  }

  private draw(s: Sailor, x: number, y: number, z: number, heading: number, pose: PoseName): void {
    s.at[0] = x;
    s.at[1] = y;
    s.at[2] = z;
    s.yaw = heading;
    const phase = pose === 'walk' || pose === 'carry' ? s.stride : this.time;
    const p = poseOf(pose === 'carry' ? 'walk' : pose, phase);
    // Carrying: the arms round the cargo, a hand on either side of it (hands.ts; the cargo is placed below).
    if (pose === 'carry') for (const side of [1, -1] as const) aimArm(p, s.rig, side, [side * CARGO_GRIP[0], CARGO_GRIP[1], CARGO_GRIP[2]]);
    rigMatrices(s.look, p, this.local, 0, s.rig);
    const c = Math.cos(heading) * s.look.scale, sn = Math.sin(heading) * s.look.scale;
    for (let i = 0; i < 5; i++) {
      const k = i * 16, m = this.world;
      for (let col = 0; col < 4; col++) {
        const o = k + col * 4;
        const lx = this.local[o]!, ly = this.local[o + 1]!, lz = this.local[o + 2]!;
        m[col * 4] = c * lx + sn * lz + (col === 3 ? x : 0);
        m[col * 4 + 1] = s.look.scale * ly + (col === 3 ? y : 0);
        m[col * 4 + 2] = -sn * lx + c * lz + (col === 3 ? z : 0);
        m[col * 4 + 3] = col === 3 ? 1 : 0;
      }
      s.pieces[i]!.setMatrix(m);
    }
    // Carried in front at the chest, at its own size.
    if (s.item) s.item.setMatrix(place(x + Math.sin(heading) * CARGO_AT[0], y + CARGO_AT[1], z + Math.cos(heading) * CARGO_AT[0], heading));
  }

  /** The crew and the cargo aboard leave with the ship (it is out beyond the edge of the map). */
  release(): void {
    for (const s of this.sailors) {
      for (const h of s.pieces) h.release();
      s.item?.release();
      s.item = null;
    }
    for (const d of this.deck) d?.release();
    this.deck = [];
    this.sailors = [];
    this.hull = null;
  }
}
