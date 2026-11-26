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

export class Yard {
  stacks: Stack[] = [];
  private fresh = true;

  constructor(private stage: LifeStage, private seed: number, readonly key: string) {}

  /** The port's shape now: bays that stay keep their stacks; bays that went puff theirs away. */
  layout(pp: PortPlan): void {
    const old = new Map(this.stacks.map((s) => [s.key, s]));
    const next: Stack[] = [];
    for (const spot of pp.yard.stacks) {
      const [x, z] = portPoint(pp.port, spot.i + 1, pp.port.depth - spot.r - 0.5);
      // Doors toward the aisle the unpacking bay opens on; elsewhere either way, by the bay.
      const doorsAlong = spot.unpack ? true : rand(this.seed, 'yard-doors', this.key, spot.i, spot.r) < 0.5;
      const yaw = yawOfDir(doorsAlong ? ((pp.port.along + 2) % 4 as 0 | 1 | 2 | 3) : pp.port.along);
      const key = `${spot.i},${spot.r},${spot.max}`;
      const had = old.get(key);
      if (had && Math.abs(had.x - x) < 1e-6 && Math.abs(had.z - z) < 1e-6) {
        old.delete(key);
        next.push(had);
        continue;
      }
      next.push({ key, spot, x, z, y: APRON, yaw, boxes: [] });
    }
    for (const s of old.values()) this.clear(s);
    this.stacks = next;
    if (this.fresh) {
      this.fresh = false;
      this.fill();
    }
  }

  /** A new port's yard: seeded heights, the unpacking bay with one container in it. */
  private fill(): void {
    for (const s of this.stacks) {
      const r = (what: string): number => rand(this.seed, 'yard', this.key, s.key, what);
      const n = s.spot.unpack ? 1 : Math.min(s.spot.max, Math.floor(r('h') * (s.spot.max + 1) * PORT.yardFill * 1.6));
      for (let k = 0; k < n; k++) this.push(s, Math.floor(r(`look${k}`) * 6), true);
    }
  }

  /** A new container on top of a stack (only when a port is new: everything later is carried). */
  private push(s: Stack, look: number, full: boolean): void {
    const at = this.placeOf(s, s.boxes.length);
    const h = this.stage.spawn({ actor: 'container', params: { look } }, place(at.x, at.y, at.z, at.yaw));
    s.boxes.push({ h, look, full });
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
