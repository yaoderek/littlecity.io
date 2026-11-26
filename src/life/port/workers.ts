// The port's dock workers (src/life/port): the link from the cargo ships to
// the town. When a full container stands in the unpacking bay by the office,
// they walk over in their yellow jackets and hard hats, swing its doors open,
// carry the crates, barrels and sacks out one at a time and set them down in
// the aisle beside it, a pile on the quay like the ships' (the harbour's
// piles, key 'port:<id>'). From there the trade chain's carters (L58,
// src/life/town/chains/trade.ts) wheel them up to the shops and stalls. When
// it is empty they shut its doors and go back by the office; the cranes load
// the empty container onto the next cargo ship.
//
// Nothing appears or disappears in view: the goods come out of the dark
// inside of the container, the doors are swung, never popped.

import type { Mat4Like, Vec3 } from '@/core/mat4';
import { compose, rotationY, translation } from '@/core/mat4';
import { rand } from '@/core/rand';
import { aimArm } from '@/parts/people/hands';
import { buildPerson, lookOf, PIECES, rigOf, type Look, type Rig } from '@/parts/people/person';
import { poseOf, rigMatrices, type PoseName } from '@/parts/people/pose';
import { portPoint, type PortPlan } from '@/rules/roles/port-shape';
import { PALETTE, RAMPS } from '@/style/palette';
import { PERSON } from '@/style/people';
import { PORT } from '@/style/port';
import type { InstanceHandle, LifeStage } from '../api';
import { easeInOut } from '../motion/ease';
import { place } from '../motion/pose';
import { CARGO_AT, CARGO_GRIP, markGoods, type Pile } from '../ships/crew';
import { harbourOf } from '../ships/visit';
import type { Box, Stack, Yard } from './yard';

const HIDDEN = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
const PACE = 0.7;
const KINDS = ['crate', 'barrel', 'sack'] as const;

type Job = 'home' | 'go' | 'wait' | 'open' | 'in' | 'out' | 'drop' | 'close' | 'back';

interface Worker {
  look: Look;
  rig: Rig;
  pieces: InstanceHandle[];
  home: Vec3;
  /** Where it is, the legs of its walk still ahead, and what it is doing. */
  x: number;
  z: number;
  y: number;
  heading: number;
  route: Vec3[];
  job: Job;
  t: number;
  stride: number;
  item: InstanceHandle | null;
  kind: string;
  spot: number;
}

export class DockWorkers {
  private workers: Worker[] = [];
  private pile: Pile;
  private local = new Float32Array(80);
  private world = new Float32Array(16);
  private time = 0;
  /** The container being unpacked, its doors, how far open (0–1), and how many goods are still in it. */
  private box: Box | null = null;
  private doors: InstanceHandle[] = [];
  private boxM: Mat4Like | null = null;
  private open = 0;
  private left = 0;
  private plan: PortPlan;

  constructor(private stage: LifeStage, private seed: number, readonly key: string, plan: PortPlan, count: number) {
    this.plan = plan;
    this.pile = { spots: this.spotsOf(plan), items: [] };
    this.pile.items = this.pile.spots.map(() => null);
    harbourOf(stage)?.setPile(key, this.pile);
    for (let i = 0; i < count; i++) {
      const base = lookOf((rand(seed, 'docker', key, i) * 1e9) >>> 0);
      const look: Look = { ...base, dress: false, top: i % 2 === 0 ? PALETTE.yellow : RAMPS.roof[2]!, bottom: RAMPS.roof[1]!, hat: 'cap', hatColor: PALETTE.white, child: false };
      const meshes = buildPerson(look, `docker-${key}-${i}`);
      const home = this.homeOf(plan, i);
      this.workers.push({ look, rig: rigOf(look), pieces: PIECES.map((p) => stage.spawnMesh(meshes[p], HIDDEN)), home, x: home[0], y: home[1], z: home[2], heading: 0, route: [], job: 'home', t: 0, stride: rand(seed, 'stride', i), item: null, kind: 'crate', spot: -1 });
    }
  }

  /** Six places in the aisle beside the unpacking bay, in two rows. */
  private spotsOf(pp: PortPlan): { x: number; y: number; z: number; yaw: number }[] {
    const pile = pp.yard.pile;
    if (!pile) return [];
    const b0 = pp.port.depth - pile.r - 0.5;
    const out = [];
    for (const [da, db] of [[0.62, -0.28], [0.62, 0], [0.62, 0.28], [0.86, -0.28], [0.86, 0], [0.86, 0.28]] as const) {
      const [x, z] = portPoint(pp.port, pile.i + da, b0 + db);
      out.push({ x, y: 0.82, z, yaw: rand(this.seed, 'pile', this.key, x, z) * 6.28 });
    }
    return out;
  }

  /** Where a worker stands between jobs: on the deck in front of the office. */
  private homeOf(pp: PortPlan, i: number): Vec3 {
    const o = pp.yard.office ?? { i: 0, r: 0 };
    const [x, z] = portPoint(pp.port, o.i + 0.3 + i * 0.4, pp.port.depth - o.r - 1.25);
    return [x, 0.82, z];
  }

  /** The way from home to the doors of the unpacking bay: down to the crane row, along it, up the aisle. */
  private routeTo(pp: PortPlan, at: Vec3): Vec3[] {
    const o = pp.yard.office ?? { i: 0, r: 0 };
    const lane = 1.5; // the middle of the crane rows, in from the water
    const [x1, z1] = portPoint(pp.port, o.i + 0.5, lane);
    const [x2, z2] = portPoint(pp.port, (pp.yard.pile?.i ?? 3) + 0.35, lane);
    return [[x1, 0.82, z1], [x2, 0.82, z2], at];
  }

  /** The unpacking bay's container: where its doors are, and the place to stand in front of them. */
  private doorsOf(s: Stack): { mouth: Vec3; front: Vec3; m: Mat4Like } {
    const f: [number, number] = [Math.sin(s.yaw), Math.cos(s.yaw)];
    const L = PORT.boxL;
    const m = place(s.x, s.y, s.z, s.yaw);
    // The mouth: on the threshold (it reaches in; it is too tall to walk in).
    return { m, mouth: [s.x - f[0] * (L / 2 + 0.14), 0.82, s.z - f[1] * (L / 2 + 0.14)], front: [s.x - f[0] * (L / 2 + 0.42), 0.82, s.z - f[1] * (L / 2 + 0.42)] };
  }

  layout(pp: PortPlan): void {
    this.plan = pp;
    const spots = this.spotsOf(pp);
    // The pile stays where it lies (the harbour puffs it away if its deck goes); new places only when there was none.
    if (!this.pile.spots.length && spots.length) {
      this.pile.spots = spots;
      this.pile.items = spots.map(() => null);
    }
  }

  update(dt: number, yard: Yard): void {
    this.time += dt;
    const bay = yard.stacks.find((s) => s.spot.unpack) ?? null;
    const top = bay?.boxes[0] ?? null;
    const freeSpot = (): number => this.pile.items.findIndex((it, i) => !it && !this.workers.some((w) => w.spot === i));
    // A full container waiting, and room in the aisle: to work.
    if (!this.box && bay && top && top.full && bay.boxes.length === 1 && freeSpot() >= 0 && this.workers.length) {
      this.box = top;
      this.left = Math.max(1, Math.round(PORT.unpackGoods));
      const { front } = this.doorsOf(bay);
      this.workers.forEach((w, i) => {
        w.route = this.routeTo(this.plan, [front[0] + (i - 0.5) * 0.3, front[1], front[2]]);
        w.job = 'go';
      });
    }
    // The box has gone (a crane, or the port changed): drop everything, go home.
    if (this.box && (!bay || bay.boxes[0] !== this.box)) this.finish(true);

    const box = this.box;
    for (const [i, w] of this.workers.entries()) {
      const d = bay ? this.doorsOf(bay) : null;
      switch (w.job) {
        case 'go':
        case 'back':
        case 'home':
          if (this.walk(w, dt)) {
            if (w.job === 'go') w.job = 'wait';
            else if (w.job === 'back') {
              // Set it down on the pile.
              const sp = this.pile.spots[w.spot];
              if (w.item && sp) {
                w.item.setMatrix(place(sp.x, sp.y, sp.z, sp.yaw));
                this.pile.items[w.spot] = w.item;
              } else w.item?.release();
              w.item = null;
              w.spot = -1;
              w.job = 'drop';
              w.t = 0;
            } else w.job = 'home';
          }
          break;
        case 'wait':
          // The first to arrive swings the doors open; then each carries goods out in turn.
          if (box && d) {
            if (this.open < 1) {
              if (i === 0) this.swing(dt, d.m, box, 1);
            } else if (this.left > 0) {
              const spot = freeSpot();
              if (spot >= 0) {
                w.spot = spot;
                this.left--;
                w.route = [d.mouth];
                w.job = 'in';
              }
            } else if (this.workers.every((o) => o.job === 'wait' || o.job === 'home')) {
              w.job = 'close';
            }
          } else this.goHome(w);
          break;
        case 'in':
          if (this.walk(w, dt) && d) {
            const kind = KINDS[Math.floor(rand(this.seed, 'goods', this.key, this.time, i) * 3)]!;
            const h = this.stage.spawn({ actor: 'ship-goods', variant: kind, params: { look: Math.floor(rand(this.seed, 'goods-look', this.time, i) * 1000) } }, HIDDEN);
            markGoods(h, kind);
            w.item = h;
            w.kind = kind;
            const sp = this.pile.spots[w.spot]!;
            w.route = [[d.front[0], 0.82, d.front[2]], [sp.x - Math.sin(sp.yaw) * 0.18, 0.82, sp.z - Math.cos(sp.yaw) * 0.18]];
            w.job = 'out';
          }
          break;
        case 'out':
          if (this.walk(w, dt)) {
            w.route = [];
            w.job = 'back';
          }
          break;
        case 'drop':
          w.t += dt;
          if (w.t > 0.5) {
            w.route = d ? [d.front] : [];
            w.job = d ? 'go' : 'home';
          }
          break;
        case 'close':
          if (box && d) {
            this.swing(dt, d.m, box, 0);
            if (this.open <= 0) this.finish(false);
          } else this.goHome(w);
          break;
      }
      this.draw(w, w.job === 'wait' || w.job === 'drop' || w.job === 'close' ? 'tend' : w.item ? 'carry' : w.route.length ? 'walk' : 'stand');
    }
  }

  /** Swings the doors toward open (1) or shut (0); the container is drawn without its own while they move. */
  private swing(dt: number, m: Mat4Like, box: Box, to: 0 | 1): void {
    if (!this.doors.length) {
      // Its drawn doors are replaced by two leaves of their own (the same drawing, so nothing jumps).
      const open = this.stage.spawn({ actor: 'container', variant: 'open', params: { look: box.look } }, m);
      box.h.release();
      box.h = open;
      this.boxM = m;
      this.doors = [1, -1].map((side) => this.stage.spawn({ actor: 'container-door', params: { look: box.look, side } }, HIDDEN));
    }
    this.open = Math.max(0, Math.min(1, this.open + (to ? dt : -dt) / 1.3));
    const a = easeInOut(this.open) * 2.5;
    const W = PORT.boxW, L = PORT.boxL;
    this.doors.forEach((h, k) => {
      const side = k === 0 ? 1 : -1;
      h.setMatrix(compose(m, translation((side * W) / 2, 0, -L / 2), rotationY(-side * a)));
    });
  }

  /** The unpacking is over (or cut short): doors shut on the box if it is still there, everyone home. */
  private finish(gone: boolean): void {
    const box = this.box;
    if (box && !gone) box.full = false;
    if (this.doors.length) {
      for (const h of this.doors) h.release();
      this.doors = [];
      // The closed drawing again where the open one stands (its doors shut: the same picture).
      if (box && !gone && this.boxM) {
        const shut = this.stage.spawn({ actor: 'container', params: { look: box.look } }, this.boxM);
        box.h.release();
        box.h = shut;
      }
    }
    this.boxM = null;
    this.box = null;
    this.open = 0;
    this.left = 0;
    for (const w of this.workers) {
      if (w.item) {
        w.item.release();
        w.item = null;
      }
      w.spot = -1;
      this.goHome(w);
    }
  }

  private goHome(w: Worker): void {
    w.route = [...this.routeTo(this.plan, w.home).slice(0, 2).reverse(), w.home];
    w.job = 'home';
  }

  /** Walks along the route; true when it has arrived. */
  private walk(w: Worker, dt: number): boolean {
    let step = dt * PACE * (w.item ? 0.85 : 1);
    while (w.route.length && step > 0) {
      const [tx, ty, tz] = w.route[0]!;
      const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
      if (d <= step) {
        w.x = tx;
        w.z = tz;
        w.y = ty;
        step -= d;
        w.route.shift();
      } else {
        w.x += (dx / d) * step;
        w.z += (dz / d) * step;
        w.heading = Math.atan2(dx, dz);
        w.stride += step / (PERSON.height * 2.4);
        step = 0;
      }
    }
    return w.route.length === 0;
  }

  private draw(w: Worker, pose: PoseName | 'carry'): void {
    const phase = pose === 'walk' || pose === 'carry' ? w.stride : this.time;
    const p = poseOf(pose === 'carry' ? 'walk' : pose, phase);
    if (pose === 'carry') for (const side of [1, -1] as const) aimArm(p, w.rig, side, [side * CARGO_GRIP[0], CARGO_GRIP[1], CARGO_GRIP[2]]);
    rigMatrices(w.look, p, this.local, 0, w.rig);
    const c = Math.cos(w.heading) * w.look.scale, sn = Math.sin(w.heading) * w.look.scale;
    for (let i = 0; i < 5; i++) {
      const k = i * 16, m = this.world;
      for (let col = 0; col < 4; col++) {
        const o = k + col * 4;
        const lx = this.local[o]!, ly = this.local[o + 1]!, lz = this.local[o + 2]!;
        m[col * 4] = c * lx + sn * lz + (col === 3 ? w.x : 0);
        m[col * 4 + 1] = w.look.scale * ly + (col === 3 ? w.y : 0);
        m[col * 4 + 2] = -sn * lx + c * lz + (col === 3 ? w.z : 0);
        m[col * 4 + 3] = col === 3 ? 1 : 0;
      }
      w.pieces[i]!.setMatrix(m);
    }
    if (w.item) w.item.setMatrix(place(w.x + Math.sin(w.heading) * CARGO_AT[0], w.y + CARGO_AT[1], w.z + Math.cos(w.heading) * CARGO_AT[0], w.heading));
  }

  release(): void {
    for (const w of this.workers) {
      for (const h of w.pieces) h.release();
      w.item?.release();
    }
    this.workers = [];
    for (const h of this.doors) h.release();
    this.doors = [];
    for (const [i, it] of this.pile.items.entries()) {
      it?.release();
      this.pile.items[i] = null;
    }
    harbourOf(this.stage)?.setPile(this.key, null);
  }
}
