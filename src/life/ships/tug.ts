// The tug (L38-F) that comes with a cargo ship: it leads it in from the
// edge of the map a little ahead of its bow, swings out to its side as it
// comes alongside and pushes it in to the quay, stands off while the cranes
// work it, and leads it out again. It never passes through the ship: going
// from ahead of the bow to its side it swings out round the bow first.
//
// Smoke puffs from its funnel, and from the cargo ship's (steamerSmoke).
// It is cut off at the edge of the map like the ships.

import { SEA_Y } from '@/core/grid';
import type { Mat4 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { TUG } from '@/parts/actors/ships/tug.part';
import { mapEdge, pathAt, type HullSize, type Mooring, type Pose, type Voyage } from '@/rules/life/ship-routes';
import type { InstanceHandle, LifeStage, Signals } from '../api';
import { swellAt, wakeRing, type Swell } from '../boats/afloat';
import { fxOf } from '../fx/fx';
import { angleDelta } from '../motion/ease';
import { fly, place } from '../motion/pose';
import { onTwos } from '../motion/twos';

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const SMOKE = { actor: 'puff', variant: 'mist' } as const;

/** What the tug needs to know of its ship. */
export interface Towed {
  phase: string;
  t: number;
  pose: Pose;
  hull: HullSize;
  mooring: Mooring;
  voyage: Voyage | null;
  s: number;
  speed: number;
}

/** A puff of smoke from a funnel at (x, y, z), drifting downwind as it rises. */
export function steamerSmoke(stage: LifeStage, x: number, y: number, z: number, size: number, wind: { dirX: number; dirZ: number; strength: number }, k: number): void {
  const drift = 0.6 + wind.strength;
  fxOf(stage).play(SMOKE, 2.6, (t, m) => {
    const s = size * (0.7 + 1.8 * t);
    place(x + wind.dirX * drift * t * 1.4, y + t * 0.9, z + wind.dirZ * drift * t * 1.4, k, s, s, s, m);
  });
}

export class Tug {
  private h: InstanceHandle;
  x = 0;
  z = 0;
  yaw = 0;
  private placed = false;
  private swell: Swell = { heave: 0, roll: 0, pitch: 0 };
  private phase: number;
  private drawn = NaN;
  private m: Mat4 = new Array<number>(16).fill(0);
  private puff = 0;
  private wake = 0;
  private cut = false;

  constructor(private stage: LifeStage, seed: number, id: string) {
    this.h = stage.spawn({ actor: 'tug' }, HIDDEN);
    this.phase = rand(seed, 'tug', id);
  }

  /** Where it wants to be beside the ship, `gap` off its side amidships, facing it. */
  private beside(ship: Towed, gap: number): Pose {
    const m = ship.mooring;
    const sin = Math.sin(ship.pose.yaw), cos = Math.cos(ship.pose.yaw);
    const mid = (ship.hull.stern + ship.hull.bow) / 2;
    const off = ship.hull.halfBeam + TUG.length / 2 + gap;
    return { x: ship.pose.x + sin * mid + m.ox * off, z: ship.pose.z + cos * mid + m.oz * off, yaw: Math.atan2(-m.ox, -m.oz) };
  }

  /** Ahead of the ship's bow on its way (or straight ahead of it, past the end of its path). */
  private ahead(ship: Towed): Pose {
    const lead = ship.hull.bow + TUG.length * 0.5 + 0.9;
    const v = ship.voyage;
    if (v && ship.s + lead <= v.path.length) {
      const p = pathAt(v.path, ship.s + lead);
      return { x: p.x, z: p.z, yaw: p.yaw };
    }
    return { x: ship.pose.x + Math.sin(ship.pose.yaw) * lead, z: ship.pose.z + Math.cos(ship.pose.yaw) * lead, yaw: ship.pose.yaw };
  }

  /** Off the bow and out to the water side: the way round between ahead and beside. */
  private bowQuarter(ship: Towed): Pose {
    const m = ship.mooring;
    const a = ship.hull.bow + 0.7;
    const out = ship.hull.halfBeam + 0.9;
    return { x: ship.pose.x + Math.sin(ship.pose.yaw) * a + m.ox * out, z: ship.pose.z + Math.cos(ship.pose.yaw) * a + m.oz * out, yaw: ship.pose.yaw };
  }

  update(dt: number, ship: Towed, signals: Signals): void {
    let want: Pose;
    let rate = 1.2;
    const remaining = ship.voyage ? ship.voyage.path.length - ship.s : 0;
    const leading = (ship.phase === 'arriving' && remaining > 5) || (ship.phase === 'leaving' && ship.t > 6);
    if (leading) {
      want = this.ahead(ship);
      rate = 4;
    } else if (ship.phase === 'arriving' || ship.phase === 'swing-in' || ship.phase === 'warp-in' || ship.phase === 'moored' || ship.phase === 'warp-out' || ship.phase === 'swing-out' || ship.phase === 'leaving') {
      const gap = ship.phase === 'warp-in' || ship.phase === 'swing-in' ? 0.02 : ship.phase === 'moored' ? 0.7 : 0.25;
      want = ship.phase === 'leaving' ? this.ahead(ship) : this.beside(ship, gap);
      // Round the bow, never through the ship.
      const sin = Math.sin(ship.pose.yaw), cos = Math.cos(ship.pose.yaw);
      const along = (this.x - ship.pose.x) * sin + (this.z - ship.pose.z) * cos;
      const across = Math.abs(-(this.x - ship.pose.x) * cos + (this.z - ship.pose.z) * sin);
      const wantAlong = (want.x - ship.pose.x) * sin + (want.z - ship.pose.z) * cos;
      if (this.placed && across < ship.hull.halfBeam + 0.6 && (along > ship.hull.bow - 0.4) !== (wantAlong > ship.hull.bow - 0.4)) want = this.bowQuarter(ship);
    } else {
      want = { x: this.x, z: this.z, yaw: this.yaw };
    }
    if (!this.placed) {
      this.placed = true;
      this.x = want.x;
      this.z = want.z;
      this.yaw = want.yaw;
    }
    const k = Math.min(1, dt * rate);
    const bx = this.x, bz = this.z;
    this.x += (want.x - this.x) * k;
    this.z += (want.z - this.z) * k;
    const moved = Math.hypot(this.x - bx, this.z - bz);
    // It heads where it goes when under way, and settles to its station's heading when still.
    const goYaw = moved > dt * 0.25 ? Math.atan2(this.x - bx, this.z - bz) : want.yaw;
    this.yaw += angleDelta(this.yaw, leading ? want.yaw : goYaw) * Math.min(1, dt * 2.5);

    const now = onTwos(signals.time.seconds, this.phase);
    if (now !== this.drawn) {
      this.drawn = now;
      swellAt(now, this.phase, TUG.length, signals.wind(this.x, this.z).strength, this.swell);
    }
    fly(this.x, SEA_Y + this.swell.heave * 0.7, this.z, this.yaw, this.swell.pitch * 0.7, this.swell.roll * 0.7, 1, this.m);
    this.h.setMatrix(this.m);
    const cut = mapEdge(this.x, this.z) > -1.4;
    if (cut !== this.cut) {
      this.cut = cut;
      this.h.setParams(1, 0, 0, cut ? -2 : 0);
    }
    // Smoke from its funnel, a wake when it moves.
    this.puff -= dt;
    if (this.puff <= 0 && !cut) {
      this.puff = 1.1;
      const [, fy, fz] = TUG.funnel;
      steamerSmoke(this.stage, this.x + Math.sin(this.yaw) * fz, SEA_Y + fy, this.z + Math.cos(this.yaw) * fz, 0.14, signals.wind(this.x, this.z), this.yaw);
    }
    this.wake += moved;
    if (this.wake > 0.6) {
      this.wake = 0;
      wakeRing(this.stage, this.x - Math.sin(this.yaw) * 0.7, this.z - Math.cos(this.yaw) * 0.7, 0.25, 2.2, 2.2);
    }
  }

  release(): void {
    this.h.release();
  }
}
