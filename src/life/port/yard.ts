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

import { CELL_H } from '@/core/grid';
import { rand } from '@/core/rand';
import { portPoint, yawOfDir, type PortPlan, type StackSpot } from '@/rules/roles/port-shape';
import { PORT } from '@/style/port';
import type { InstanceHandle, LifeStage } from '../api';
import { place } from '../motion/pose';
import { removalPuff } from '../ships/puff';
import type { Place } from './crane';
import { fxOf } from '../fx/fx';
import { easeOut, pop } from '../motion/ease';

const HIDDEN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const DUST = { actor: 'puff', variant: 'dust', params: { look: 1 } } as const;
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

export class Yard {
  stacks: Stack[] = [];
  private arrivals: Arrival[] = [];

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

  /** Containers being set down: each drops the last bit onto its stack and settles with a puff of dust. */
  update(dt: number): void {
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
    return n;
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
    for (const s of this.stacks) this.clear(s);
    this.stacks = [];
  }

  /** Torn down with the town (no puff). */
  release(): void {
    for (const s of this.stacks) for (const b of s.boxes) b.h.release();
    this.stacks = [];
  }
}
