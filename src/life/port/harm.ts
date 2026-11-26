// What mischief does to a port's moving things (src/life/port), drawn with
// the town's own fire and smoke (src/life/mischief/meshes.ts): flames on a
// burning crane or container, turned toward the reader like every flame in
// the game, smoke rising from them, both capped per port (fewer on a phone).
// The deck itself is broken and mended by the damage treatment like any
// block (src/gen/damage): this is only what stands on it.

import type { Vec3 } from '@/core/mat4';
import { compose, rotationY, translation, type Mat4 } from '@/core/mat4';
import type { InstanceHandle, LifeStage } from '../api';
import { fxOf } from '../fx/fx';
import { flameMesh } from '../mischief/meshes';
import { place } from '../motion/pose';
import { lifeLow, phoneSized } from '../quality';

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const SMOKE = { actor: 'puff', variant: 'mist' } as const;

interface Fire {
  /** Where it burns now (it may move: a falling crane), or null once that thing has gone. */
  at: () => Vec3 | null;
  size: number;
  age: number;
  life: number;
  flame: InstanceHandle;
  puff: number;
}

export class Fires {
  private fires: Fire[] = [];
  private time = 0;

  constructor(private stage: LifeStage) {}

  /** How many are burning now. */
  get count(): number {
    return this.fires.length;
  }

  /** The most burning at once in one port. */
  private get cap(): number {
    return phoneSized() || lifeLow() ? 5 : 14;
  }

  /** Something catches: flames on it for `life` seconds, dying down at the end, and smoke. */
  light(at: () => Vec3 | null, size: number, life: number, look: number): void {
    if (this.fires.length >= this.cap) return;
    this.fires.push({ at, size, age: 0, life, flame: this.stage.spawnMesh(flameMesh(look % 3), HIDDEN), puff: look * 0.37 });
  }

  update(dt: number, cameraYaw: number): void {
    this.time += dt;
    const turn = rotationY((cameraYaw * Math.PI) / 180);
    this.fires = this.fires.filter((f) => {
      f.age += dt;
      const at = f.at();
      if (!at || f.age > f.life) {
        f.flame.release();
        return false;
      }
      const k = Math.min(1, (f.life - f.age) / 4) * Math.min(1, f.age * 2.5);
      const s = f.size * (0.35 + 0.65 * k);
      f.flame.setMatrix(compose(translation(at[0], at[1], at[2]), turn, [s, 0, 0, 0, 0, s * (1.35 + 0.15 * Math.sin(this.time * 9 + f.puff * 5)), 0, 0, 0, 0, s, 0, 0, 0, 0, 1]));
      f.flame.setParams(1);
      f.flame.setVisible(k > 0.05);
      f.puff += dt * (0.8 + k);
      if (f.puff >= 1.4) {
        f.puff = 0;
        const [x, y, z] = at;
        fxOf(this.stage).play(SMOKE, 2.6, (t, m) => {
          const r = f.size * (0.6 + 1.6 * t);
          place(x + t * 0.5, y + f.size + t * 1.4, z + t * 0.2, t, r, r, r, m);
        });
      }
      return true;
    });
  }

  release(): void {
    for (const f of this.fires) f.flame.release();
    this.fires = [];
  }
}
