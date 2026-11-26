// A cargo ship's visit to a port (L38-F), as the port sees it: the cranes
// unload some of its containers onto the yard's stacks and load others from
// the stacks onto it, 6 to 10 moves (PORT.movesMin, movesMax), so both the
// ship's load and the yard's stacks visibly change. One of the containers it
// brings goes to the unpacking bay by the office, for the dock workers.
//
// The ship is held alongside until the moves are done (Ship.held), or for
// PORT.freighterHold seconds past its stay at most. Every container is always
// somewhere: on the ship, on a stack, or under a crane; a crane hands it over
// at the grab and the let-go. If a place goes from under a crane's job (the
// ship casts off, the port is erased), the container goes back where it came
// from if it still can, else in the removal puff: never left in the air.

import { rand } from '@/core/rand';
import { PORT } from '@/style/port';
import type { InstanceHandle, LifeStage } from '../api';
import type { CargoBox } from '../ships/body';
import { removalPuff } from '../ships/puff';
import type { Ship } from '../ships/visit';
import type { Crane, Job, Place } from './crane';
import type { Box, Stack, Yard } from './yard';

export interface Visit {
  ship: Ship;
  unload: number;
  load: number;
  /** Ship columns and stacks a crane is working now (one crane to a column or stack at a time). */
  busy: Set<string>;
  /** The unpacking bay has had its container off this ship. */
  unpacked: boolean;
  /** A crane hit while it carried a container drops it (it falls loose: yard.ts); else it goes in a puff. */
  drop?: (box: Box, at: Place, home: Stack | null) => void;
}

/** The world place of a slot on a ship (its floor's middle), lying the way the ship lies. */
export function slotPlace(ship: Ship, slot: number): Place | null {
  const body = ship.body;
  const plan = body?.rig.cargo;
  if (!body || !plan || ship.phase !== 'moored') return null;
  const [x, y, z] = plan.slots[slot]!;
  const m = ship.m;
  return { x: m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, y: m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, z: m[2]! * x + m[6]! * y + m[10]! * z + m[14]!, yaw: ship.pose.yaw };
}

export function newVisit(ship: Ship, seed: number): Visit {
  const n = PORT.movesMin + Math.floor(rand(seed, 'moves', ship.id, ship.visits) * (Math.max(PORT.movesMin, PORT.movesMax) - PORT.movesMin + 1));
  const unload = Math.ceil(n / 2);
  return { ship, unload, load: n - unload, busy: new Set(), unpacked: false };
}

/** The column's top container (its slot), or −1. */
function topSlot(ship: Ship, col: readonly number[]): number {
  const cargo = ship.body?.cargo ?? [];
  for (let k = col.length - 1; k >= 0; k--) if (cargo[col[k]!]) return col[k]!;
  return -1;
}
/** The column's lowest free slot, or −1. */
function freeSlot(ship: Ship, col: readonly number[]): number {
  const cargo = ship.body?.cargo ?? [];
  for (let k = 0; k < col.length; k++) if (!cargo[col[k]!]) return col[k]!;
  return -1;
}

/**
 * The next job for a crane on this visit, or null: unloading and loading in turn while both are left, the
 * unpacking bay served first (its emptied container goes back aboard; a full one comes off for it).
 */
export function nextJob(stage: LifeStage, seed: number, v: Visit, yard: Yard, crane: Crane): Job | null {
  const ship = v.ship;
  const plan = ship.body?.rig.cargo;
  if (!plan || ship.phase !== 'moored' || !ship.body) return null;
  const free = (k: string): boolean => !v.busy.has(k);
  const near = (p: Place | null): number => {
    if (!p) return Infinity;
    const [lx, , lz] = crane.local(p.x, p.y, p.z);
    return Math.abs(lx) + Math.abs(lz) * 0.3;
  };
  const columns = plan.columns.map((col, c) => ({ col, c, key: `col${c}` })).filter((x) => free(x.key));
  const stacks = yard.stacks.filter((s) => free(`stack${s.key}`));
  const unpack = yard.stacks.find((s) => s.spot.unpack);

  const unloadJob = (): Job | null => {
    const from = columns
      .map((x) => ({ ...x, slot: topSlot(ship, x.col) }))
      .filter((x) => x.slot >= 0 && crane.reaches(slotPlace(ship, x.slot)!))
      .sort((a, b) => near(slotPlace(ship, a.slot)) - near(slotPlace(ship, b.slot)))[0];
    if (!from) return null;
    // The unpacking bay first, when it is empty and this crane reaches it; else the lowest stack it reaches.
    const wantsUnpack = !v.unpacked && unpack && unpack.boxes.length === 0 && free(`stack${unpack.key}`) && crane.reaches(yard.placeOf(unpack, 0));
    const to = wantsUnpack
      ? unpack!
      : stacks
          .filter((s) => !s.spot.unpack && yard.nextOf(s) && crane.reaches(yard.nextOf(s)!))
          .sort((a, b) => a.boxes.length - b.boxes.length || near(yard.nextOf(a)) - near(yard.nextOf(b)))[0];
    if (!to) return null;
    if (to === unpack) v.unpacked = true;
    return shipToStack(stage, seed, v, yard, from.c, from.slot, to);
  };
  const loadJob = (): Job | null => {
    // An emptied container in the unpacking bay goes back aboard first.
    const fromStacks = stacks
      .filter((s) => s.boxes.length > 0 && (!s.spot.unpack || !s.boxes[s.boxes.length - 1]!.full) && crane.reaches(yard.topOf(s)!))
      .sort((a, b) => Number(!!b.spot.unpack) - Number(!!a.spot.unpack) || b.boxes.length - a.boxes.length || near(yard.topOf(a)) - near(yard.topOf(b)));
    const from = fromStacks[0];
    if (!from) return null;
    const to = columns
      .map((x) => ({ ...x, slot: freeSlot(ship, x.col) }))
      .filter((x) => x.slot >= 0 && crane.reaches(slotPlace(ship, x.slot)!))
      .sort((a, b) => near(slotPlace(ship, a.slot)) - near(slotPlace(ship, b.slot)))[0];
    if (!to) return null;
    return stackToShip(stage, seed, v, yard, from, to.c, to.slot);
  };
  // Unload and load in turn: whichever there is more of left goes first.
  const order = v.unload >= v.load ? [unloadJob, loadJob] : [loadJob, unloadJob];
  for (const make of order) {
    if (make === unloadJob && v.unload <= 0) continue;
    if (make === loadJob && v.load <= 0) continue;
    const job = make();
    if (job) {
      if (make === unloadJob) v.unload--;
      else v.load--;
      return job;
    }
  }
  return null;
}

/** A container that can no longer go anywhere: taken away under the puff where it hangs. */
function puffAway(stage: LifeStage, seed: number, h: InstanceHandle, at: Place | null, k: number): void {
  if (at) removalPuff(stage, seed, at.x, at.y + PORT.boxH / 2, at.z, 1.1, k);
  h.release();
}

function shipToStack(stage: LifeStage, seed: number, v: Visit, yard: Yard, col: number, slot: number, to: Stack): Job {
  const ship = v.ship;
  const keys = [`col${col}`, `stack${to.key}`];
  for (const k of keys) v.busy.add(k);
  let box: CargoBox | null = null;
  const done = (): void => {
    for (const k of keys) v.busy.delete(k);
  };
  const back = (): boolean => {
    // Back aboard, onto the slot it came off, if the ship is still alongside.
    const cargo = ship.body?.cargo;
    if (box && cargo && ship.phase === 'moored' && !cargo[slot]) {
      cargo[slot] = box;
      box = null;
      return true;
    }
    return false;
  };
  const stackOk = (): boolean => yard.stacks.includes(to) && yard.nextOf(to) !== null;
  const slotOk = (): boolean => !!ship.body?.cargo && ship.phase === 'moored' && !ship.body.cargo[slot];
  return {
    from: () => slotPlace(ship, slot),
    // To its stack; if the stack has gone, carried back aboard.
    to: () => (stackOk() ? yard.nextOf(to) : box && slotOk() ? slotPlace(ship, slot) : null),
    take() {
      const cargo = ship.body?.cargo;
      const b = cargo?.[slot];
      if (!cargo || !b || ship.phase !== 'moored') return null;
      cargo[slot] = null;
      box = b;
      return b.h;
    },
    put(h, at) {
      if (box && stackOk()) {
        yard.put(to, box as Box);
        box = null;
      } else if (!back()) puffAway(stage, seed, h, at, slot);
      done();
    },
    abandon(h, at) {
      if (h && box && at && v.drop) v.drop(box as Box, at, to);
      else if (h) puffAway(stage, seed, h, at, slot);
      else v.unload++;
      box = null;
      done();
    },
  };
}

function stackToShip(stage: LifeStage, seed: number, v: Visit, yard: Yard, from: Stack, col: number, slot: number): Job {
  const ship = v.ship;
  const keys = [`col${col}`, `stack${from.key}`];
  for (const k of keys) v.busy.add(k);
  let box: Box | null = null;
  const done = (): void => {
    for (const k of keys) v.busy.delete(k);
  };
  const back = (): boolean => {
    // Back on the stack it came off, if the bay is still there.
    if (box && yard.stacks.includes(from) && yard.nextOf(from)) {
      yard.put(from, box);
      box = null;
      return true;
    }
    return false;
  };
  const slotOk = (): boolean => !!ship.body?.cargo && ship.phase === 'moored' && !ship.body.cargo[slot];
  const stackOk = (): boolean => yard.stacks.includes(from) && yard.nextOf(from) !== null;
  return {
    from: () => (yard.stacks.includes(from) ? yard.topOf(from) : null),
    // Aboard; if the ship has gone, carried back to its stack.
    to: () => (slotOk() ? slotPlace(ship, slot) : box && stackOk() ? yard.nextOf(from) : null),
    take() {
      if (!yard.stacks.includes(from)) return null;
      const b = yard.take(from);
      if (!b) return null;
      box = b;
      return b.h;
    },
    put(h, at) {
      const cargo = ship.body?.cargo;
      if (box && cargo && slotOk()) {
        cargo[slot] = box;
        box = null;
      } else if (!back()) puffAway(stage, seed, h, at, slot + 100);
      done();
    },
    abandon(h, at) {
      if (h && box && at && v.drop) v.drop(box, at, from);
      else if (h) puffAway(stage, seed, h, at, slot + 100);
      else v.load++;
      box = null;
      done();
    },
  };
}
