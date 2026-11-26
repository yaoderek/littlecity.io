// A port's yard of containers (src/life/port): the stacks in their bays,
// one to three high (the unpacking bay by the office holds one). The stacks
// are life, not plan: the cranes take containers off them and put others on,
// so their heights change as ships come and go.
//
// A new port starts with its yard part full (PORT.yardFill), seeded, and a
// container waiting in the unpacking bay. When the port changes shape, the
// stacks whose bays are still there keep their containers; a container whose
// bay has gone goes in the removal puff, as goods on a quay do (it is never
// moved by magic).

import { CELL_H, SEA_Y } from '@/core/grid';
import { multiply, transformPoint, type Vec3 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { portPoint, yawOfDir, type PortPlan, type StackSpot } from '@/rules/roles/port-shape';
import { PORT } from '@/style/port';
import type { InstanceHandle, LifeStage } from '../api';
import { place } from '../motion/pose';
import { removalPuff } from '../ships/puff';
import type { Place } from './crane';
import { fxOf } from '../fx/fx';
import { easeInOut, easeOut, pop } from '../motion/ease';
import { wakeRing } from '../boats/afloat';
import { lifeLow, phoneSized } from '../quality';

const HIDDEN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const DUST = { actor: 'puff', variant: 'dust', params: { look: 1 } } as const;
const SPLASH = { actor: 'puff', variant: 'pop', params: { look: 2 } } as const;
/** Seconds a container takes to be set down. */
const SET_TIME = 0.28;

/** One container: its drawing, its colour, and whether it still holds goods (it is unpacked once). */
export interface Box {
  h: InstanceHandle;
  look: number;
  full: boolean;
}

export interface Stack {
  key: string;
  spot: StackSpot;
  /** The middle of its bay on the deck (world), the deck's height there, and the yaw its containers lie at. */
  x: number;
  z: number;
  y: number;
  yaw: number;
  boxes: Box[];
}

/** The deck's top under the containers: the port's concrete apron (src/parts/port/port-deck.part.ts). */
export const APRON = CELL_H + 0.02;

/** A container being set down in a new bay: it drops in and pops out of its foot, with a little dust. */
interface Arrival {
  box: Box;
  at: Place;
  age: number;
}

/**
 * A container blown off its stack (or dropped by a crane that was hit): it flies, tumbling, and comes down
 * on the deck or the land (lying where it fell, perhaps on its side) or in the water (bobbing); when its bay
 * has been mended it is lifted back onto its stack.
 */
interface Loose {
  box: Box;
  home: Stack | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  /** Tumbling: about which way (an axis on the ground) and how far over. */
  ax: number;
  az: number;
  roll: number;
  spin: number;
  state: 'fly' | 'rest' | 'float' | 'back';
  t: number;
  /** Going back: from where. */
  from?: { x: number; y: number; z: number; roll: number };
}

/** Where a thing falling at (x, z) comes to rest: the deck or the land's top, or null over open water. */
export type GroundAt = (x: number, z: number) => number | null;

export class Yard {
  stacks: Stack[] = [];
  private arrivals: Arrival[] = [];
  loose: Loose[] = [];
  /** Containers lost from each stack (puffed away past the cap): set down again when its bay is mended. */
  private lost = new Map<Stack, number>();

  constructor(private stage: LifeStage, private seed: number, readonly key: string) {}

  /**
   * The port's shape now: bays that stay (where they stand on the deck) keep their stacks; bays that went
   * puff theirs away; new bays get a seeded stack, set down one container after another when `arrive`
   * (an edit made the port or grew it), at once when the town is just opened.
   */
  layout(pp: PortPlan, arrive = false): void {
    const old = new Map(this.stacks.map((s) => [s.key, s]));
    const next: Stack[] = [];
    for (const spot of pp.yard.stacks) {
      const [x, z] = portPoint(pp.port, spot.i + 1, pp.port.depth - spot.r - 0.5);
      // Doors toward the aisle the unpacking bay opens on; elsewhere either way, by the bay.
      const doorsAlong = spot.unpack ? true : rand(this.seed, 'yard-doors', this.key, spot.i, spot.r) < 0.5;
      const yaw = yawOfDir(doorsAlong ? ((pp.port.along + 2) % 4 as 0 | 1 | 2 | 3) : pp.port.along);
      const key = `${Math.round(x * 2)},${Math.round(z * 2)},${spot.max}`;
      const had = old.get(key);
      if (had && Math.abs(had.x - x) < 1e-6 && Math.abs(had.z - z) < 1e-6) {
        old.delete(key);
        next.push(had);
        continue;
      }
      next.push({ key, spot, x, z, y: APRON, yaw, boxes: [] });
    }
    for (const s of old.values()) this.clear(s);
    const fresh = next.filter((s) => !this.stacks.includes(s));
    this.stacks = next;
    this.fill(fresh, arrive);
  }

  /** New bays' stacks: seeded heights, the unpacking bay with one container in it. */
  private fill(stacks: readonly Stack[], arrive: boolean): void {
    const heights = stacks.map((s) => {
      const r = (what: string): number => rand(this.seed, 'yard', this.key, s.key, what);
      return s.spot.unpack ? 1 : Math.min(s.spot.max, Math.floor(r('h') * (s.spot.max + 1) * PORT.yardFill * 1.6));
    });
    // One after another, within about a second however many.
    const total = heights.reduce((x, y) => x + y, 0);
    const gap = Math.min(0.09, 1.1 / Math.max(1, total));
    let n = 0;
    stacks.forEach((s, i) => {
      for (let k = 0; k < heights[i]!; k++) {
        const look = Math.floor(rand(this.seed, 'yard', this.key, s.key, `look${k}`) * 6);
        this.push(s, look, true, arrive ? 0.35 + gap * n++ : -1);
      }
    });
  }

  /** A new container on top of a stack (a port new or grown: everything later is carried); set down after `delay` s, or at once (< 0). */
  private push(s: Stack, look: number, full: boolean, delay: number): void {
    const at = this.placeOf(s, s.boxes.length);
    const h = this.stage.spawn({ actor: 'container', params: { look } }, delay < 0 ? place(at.x, at.y, at.z, at.yaw) : HIDDEN);
    const box = { h, look, full };
    s.boxes.push(box);
    if (delay >= 0) this.arrivals.push({ box, at, age: -delay });
  }

  // ── blown about ──

  /** The most containers loose at once in one port (a phone: fewer); past it, the rest go in a puff. */
  private get looseCap(): number {
    return phoneSized() || lifeLow() ? 16 : 40;
  }

  /**
   * A blast near a stack: its containers are thrown off it, away from `from` (the blast, world x, z), the top
   * ones furthest, each tumbling. Returns the ones thrown (to set some alight).
   */
  scatter(s: Stack, from: [number, number] | null, power: number): Box[] {
    const out: Box[] = [];
    while (s.boxes.length) {
      const k = s.boxes.length - 1;
      const box = s.boxes.pop()!;
      const at = this.placeOf(s, k);
      const r = (w: string): number => rand(this.seed, 'blown', this.key, s.key, k, w);
      let dx = from ? at.x - from[0] : r('dx') - 0.5, dz = from ? at.z - from[1] : r('dz') - 0.5;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      const sp = (1.2 + 1.6 * r('sp') + k * 0.5) * Math.min(1.6, 0.6 + power);
      if (this.loose.length >= this.looseCap) {
        removalPuff(this.stage, this.seed, at.x, at.y + PORT.boxH / 2, at.z, 1.1, k);
        box.h.release();
        this.lost.set(s, (this.lost.get(s) ?? 0) + 1);
        continue;
      }
      const a = r('axis') * Math.PI * 2;
      this.loose.push({ box, home: s, x: at.x, y: at.y, z: at.z, vx: dx * sp + (r('jx') - 0.5) * 0.6, vy: 2.2 + 1.8 * r('vy') + k * 0.4, vz: dz * sp + (r('jz') - 0.5) * 0.6, yaw: at.yaw, ax: Math.cos(a), az: Math.sin(a), roll: 0, spin: (r('spin') < 0.5 ? -1 : 1) * (3 + 4 * r('spin2')), state: 'fly', t: 0 });
      out.push(box);
    }
    return out;
  }

  /** A crane hit while it carried one: it drops from where it hung. */
  dropLoose(box: Box, at: Place, home: Stack | null): void {
    if (this.loose.length >= this.looseCap) {
      removalPuff(this.stage, this.seed, at.x, at.y + PORT.boxH / 2, at.z, 1.1, 99);
      box.h.release();
      return;
    }
    this.loose.push({ box, home, x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, yaw: at.yaw, ax: 1, az: 0, roll: 0, spin: 1.5, state: 'fly', t: 0 });
  }

  /** Where a loose container is now (for its flames), or null once it is back or gone. */
  whereIs(box: Box): Vec3 | null {
    const l = this.loose.find((q) => q.box === box);
    return l ? [l.x, l.y + PORT.boxH * 0.6, l.z] : null;
  }

  /**
   * Containers whose bays are mended (`sound`) go back onto them, one at a time, lifted in an arc (out of
   * the water with a splash); those lost in a puff are set down new.
   */
  putBack(sound: (s: Stack) => boolean): void {
    let n = 0;
    for (const l of this.loose) {
      if (l.state === 'fly' || l.state === 'back' || !l.home || !this.stacks.includes(l.home) || !sound(l.home)) continue;
      const busy = this.loose.filter((q) => q.state === 'back' && q.home === l.home).length;
      if (l.home.boxes.length + busy >= l.home.spot.max) continue;
      if (n++ > 0) continue;
      if (l.state === 'float') wakeRing(this.stage, l.x, l.z, 0.5, 2.4, 1.6);
      l.from = { x: l.x, y: l.y, z: l.z, roll: l.roll };
      l.state = 'back';
      l.t = 0;
    }
    for (const [s, k] of this.lost) {
      if (!this.stacks.includes(s)) {
        this.lost.delete(s);
        continue;
      }
      if (!sound(s) || this.loose.some((q) => q.home === s)) continue;
      const room = Math.max(0, Math.min(k, s.spot.max - s.boxes.length));
      this.lost.delete(s);
      for (let i = 0; i < room; i++) this.push(s, Math.floor(rand(this.seed, 'again', s.key, i) * 6), true, 0.4 + i * 0.3);
    }
  }

  private stepLoose(dt: number, ground: GroundAt): void {
    const G = 9;
    this.loose = this.loose.filter((l) => {
      l.t += dt;
      if (l.state === 'fly') {
        l.vy -= G * dt;
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.z += l.vz * dt;
        l.roll += l.spin * dt;
        const g = ground(l.x, l.z);
        const floor = g ?? SEA_Y - PORT.boxH * 0.45;
        if (l.y <= floor && l.vy < 0) {
          l.y = floor;
          // Down: lying flat or on its side on the deck; bobbing half under in the water.
          const q = Math.PI / 2;
          l.roll = Math.round(l.roll / q) * q;
          if (g === null) {
            l.state = 'float';
            wakeRing(this.stage, l.x, l.z, 0.6, 3, 2.2);
            fxOf(this.stage).play(SPLASH, 0.6, (t, m) => place(l.x, SEA_Y + 0.3 * Math.sin(t * Math.PI), l.z, 0, 0.5 * (1 - t), 0.5 * (1 - t), 0.5 * (1 - t), m));
          } else {
            l.state = 'rest';
            fxOf(this.stage).play(DUST, 0.6, (t, m) => {
              const sc = 0.45 * (1 - t);
              place(l.x, l.y + 0.1, l.z, 0, sc, sc, sc, m);
            });
          }
        }
      } else if (l.state === 'float') {
        l.y = SEA_Y - PORT.boxH * 0.45 + 0.04 * Math.sin(l.t * 1.7);
      } else if (l.state === 'back' && l.from && l.home) {
        const to = this.nextOf(l.home);
        if (!to || !this.stacks.includes(l.home)) {
          l.state = 'rest';
          return true;
        }
        const k = Math.min(1, l.t / 1.1);
        const e = easeInOut(k);
        l.x = l.from.x + (to.x - l.from.x) * e;
        l.z = l.from.z + (to.z - l.from.z) * e;
        l.y = l.from.y + (to.y - l.from.y) * e + Math.sin(k * Math.PI) * 1.2;
        l.roll = l.from.roll * (1 - e);
        l.yaw = to.yaw;
        if (k >= 1) {
          this.put(l.home, l.box);
          return false;
        }
      }
      // Drawn tumbled about its axis on the ground, through its middle.
      const c = Math.cos(l.roll), sn = Math.sin(l.roll);
      const [ax, az] = [l.ax, l.az];
      // Rotation about (ax, 0, az) by roll, then its yaw: R = Raxis · Ry(yaw).
      const t1 = 1 - c;
      const R = [
        t1 * ax * ax + c, sn * az, t1 * ax * az, 0,
        -sn * az, c, sn * ax, 0,
        t1 * ax * az, -sn * ax, t1 * az * az + c, 0,
        0, 0, 0, 1,
      ];
      const yawM = place(0, 0, 0, l.yaw);
      const m = multiply(R, yawM);
      const mid = PORT.boxH / 2;
      // Turn about its middle, not its floor.
      const off = transformPoint(m, [0, mid, 0]);
      m[12] = l.x - off[0];
      m[13] = l.y + mid - off[1];
      m[14] = l.z - off[2];
      l.box.h.setMatrix(m);
      return true;
    });
  }

  /** Containers being set down: each drops the last bit onto its stack and settles with a puff of dust. */
  update(dt: number, ground: GroundAt = () => null): void {
    if (this.loose.length) this.stepLoose(dt, ground);
    if (!this.arrivals.length) return;
    this.arrivals = this.arrivals.filter((a) => {
      a.age += dt;
      if (!this.stacks.some((s) => s.boxes.includes(a.box))) return false;
      if (a.age < 0) return true;
      const k = Math.min(1, a.age / SET_TIME);
      const s = Math.max(0.001, pop(k));
      const drop = 0.45 * (1 - easeOut(k));
      a.box.h.setMatrix(place(a.at.x, a.at.y + drop, a.at.z, a.at.yaw, s, s, s));
      if (k < 1) return true;
      fxOf(this.stage).play(DUST, 0.5, (t, m) => {
        const r = 0.35 + 0.5 * easeOut(t), sc = 0.28 * (1 - t);
        place(a.at.x + Math.sin(a.at.yaw) * r, a.at.y + 0.05, a.at.z + Math.cos(a.at.yaw) * r, a.at.yaw, sc, sc, sc, m);
      });
      return false;
    });
  }

  /** Where tier `k` of a stack is. */
  placeOf(s: Stack, k: number): Place {
    return { x: s.x, y: s.y + k * PORT.boxH, z: s.z, yaw: s.yaw };
  }

  /** The top container's place, or null if the stack is empty. */
  topOf(s: Stack): Place | null {
    return s.boxes.length ? this.placeOf(s, s.boxes.length - 1) : null;
  }

  /** Where the next container set on the stack goes, or null if it is full. */
  nextOf(s: Stack): Place | null {
    return s.boxes.length < s.spot.max ? this.placeOf(s, s.boxes.length) : null;
  }

  take(s: Stack): Box | null {
    return s.boxes.pop() ?? null;
  }

  /** Sets a container down on a stack (the crane let it go there). */
  put(s: Stack, box: Box): void {
    const at = this.placeOf(s, s.boxes.length);
    box.h.setMatrix(place(at.x, at.y, at.z, at.yaw));
    s.boxes.push(box);
  }

  get count(): number {
    let n = 0;
    for (const s of this.stacks) n += s.boxes.length;
    return n + this.loose.length;
  }

  /** A stack's containers go in the removal puff (its bay has gone from under them). */
  private clear(s: Stack): void {
    s.boxes.forEach((b, k) => {
      const at = this.placeOf(s, k);
      removalPuff(this.stage, this.seed, at.x, at.y + PORT.boxH / 2, at.z, 1.1, k + s.spot.i * 7);
      b.h.release();
    });
    s.boxes = [];
  }

  /** The port has gone: every container goes in the puff. */
  remove(): void {
    for (const l of this.loose) {
      removalPuff(this.stage, this.seed, l.x, l.y + PORT.boxH / 2, l.z, 1.1, 77);
      l.box.h.release();
    }
    this.loose = [];
    for (const s of this.stacks) this.clear(s);
    this.stacks = [];
  }

  /** Torn down with the town (no puff). */
  release(): void {
    for (const l of this.loose) l.box.h.release();
    this.loose = [];
    for (const s of this.stacks) for (const b of s.boxes) b.h.release();
    this.stacks = [];
  }
}
