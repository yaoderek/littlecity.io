// What every floating hull does (Animation, the boats): it rises and falls,
// rolls and pitches a little on the swell, more when the wind gets up, and
// leaves a ring on the water now and then. Pure functions of life time, so
// the same town at the same time floats the same way.
//
// These are POSES: callers sample them on twos (see ../MOTION.md).

import { SEA_Y } from '@/core/grid';
import type { Mat4 } from '@/core/mat4';
import { BOATS } from '@/style/boats';
import type { LifeStage, SpawnSpec } from '../api';
import { fxOf } from '../fx/fx';
import { easeOut } from '../motion/ease';
import { place } from '../motion/pose';

const TAU = Math.PI * 2;

export interface Swell {
  /** Metres up from the waterline. */
  heave: number;
  roll: number;
  pitch: number;
}

/**
 * The swell under a hull `length` long at life time `seconds`. `phase` (0–1, from the boat's seed)
 * sets where in its rhythm it is; `wind` is the wind's strength there. Longer boats move slower.
 */
export function swellAt(seconds: number, phase: number, length: number, wind: number, out: Swell = { heave: 0, roll: 0, pitch: 0 }): Swell {
  const period = BOATS.bobPeriod * Math.sqrt(length / BOATS.rowLength);
  const lively = 0.55 + 0.9 * Math.min(1.2, wind);
  const small = Math.sqrt(BOATS.rowLength / length);
  // Three rhythms that never line up for long, so the motion does not read as one sine.
  out.heave = BOATS.bob * lively * Math.sin((seconds / period + phase) * TAU);
  out.roll = BOATS.roll * lively * small * Math.sin((seconds / (period * 1.37) + phase * 3.1) * TAU);
  out.pitch = BOATS.pitch * lively * small * Math.sin((seconds / (period * 0.81) + phase * 5.3) * TAU);
  return out;
}

// ─────────────────────────────────────────────────── rings on the water ──

/** The height of a ring's ridge above its edges, in world units (the part draws it one unit high). */
export const RIDGE = 0.012;

/**
 * Writes the matrix of a ring `t` (0–1) through its life: at (x, z) on the sea, turned by `yaw`,
 * `rx` by `rz` across at birth and `grow` times that at the end. It rises out of the water in its
 * first moments and sinks as it spreads, so its stroke thins to nothing (water-ring.part.ts).
 */
export function ringPose(t: number, x: number, z: number, yaw: number, rx: number, rz: number, grow: number, out: Mat4): void {
  const k = 1 + (grow - 1) * easeOut(t);
  const shown = Math.min(1, t / 0.12) * (1 - t) ** 1.2;
  place(x, SEA_Y + RIDGE * (shown - 1) - 0.0004, z, yaw, rx * k, RIDGE, rz * k, out);
}

const HULL_RING: SpawnSpec = { actor: 'water-ring', variant: 'hull' };

/** A ring round a floating hull: it starts at the hull's own outline and spreads. */
export function hullRing(stage: LifeStage, x: number, z: number, yaw: number, beam: number, length: number, grow = 1.45, life = BOATS.wakeLife): void {
  fxOf(stage).play(HULL_RING, life, (t, m) => ringPose(t, x, z, yaw, beam * 0.56, length * 0.52, grow, m));
}

/** A round ring left on the water (the wake of a boat under way). */
export function wakeRing(stage: LifeStage, x: number, z: number, radius: number, grow: number, life: number): void {
  fxOf(stage).play(HULL_RING, life, (t, m) => ringPose(t, x, z, x * 7.3 + z * 3.1, radius, radius, grow, m));
}

// ─────────────────────────────────────────── a launch's wave (the shipyard) ──

interface Wave {
  x: number;
  z: number;
  /** Signal seconds when it set out, and how big it is (1: a galleon going in). */
  t: number;
  amp: number;
}
const wavesOn = new WeakMap<object, Wave[]>();

/** A wave sets out from (x, z) now: a ship launched into the sea (src/life/town/chains/shipyard.ts). */
export function pushWave(stage: object, x: number, z: number, seconds: number, amp: number): void {
  let w = wavesOn.get(stage);
  if (!w) wavesOn.set(stage, (w = []));
  w.push({ x, z, t: seconds, amp });
  if (w.length > 4) w.shift();
}

/** Adds the rock of any launch wave passing (x, z) now to a boat's swell: it spreads at 1.6 a second and dies away. */
export function rockBy(stage: object, x: number, z: number, seconds: number, out: Swell): Swell {
  const w = wavesOn.get(stage);
  if (!w) return out;
  for (const v of w) {
    const age = seconds - v.t;
    if (age < 0 || age > 9) continue;
    const d = Math.hypot(x - v.x, z - v.z) - age * 1.6;
    if (Math.abs(d) > 1.4) continue;
    const k = Math.cos((d / 1.4) * (Math.PI / 2)) * v.amp * Math.exp(-age * 0.3) * Math.min(1, 3 / (1 + Math.hypot(x - v.x, z - v.z)));
    out.heave += 0.06 * k * Math.sin(age * 6.5);
    out.roll += 0.16 * k * Math.sin(age * 5.2 + 0.7);
    out.pitch += 0.07 * k * Math.cos(age * 5.8);
  }
  return out;
}
