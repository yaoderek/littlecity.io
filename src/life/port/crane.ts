// One container crane at work (src/life/port): its moving pieces, spawned
// once and posed every frame from a handful of numbers, and the job it is
// doing (lift a container from one place, set it down in another).
//
// The crane's frame C (src/parts/port/crane.part.ts): X along the rails, Z out
// to sea, y = 0 the deck, the origin at its middle between the rails.
//
//   medium  slews (turns about its ring) and luffs (raises and lowers its jib)
//           to put the hook over a place; the hook goes down on its ropes
//   large   travels along its rails and runs its trolley along the boom to be
//           over a place; the spreader goes down on four ropes. Idle, its
//           boom is up, near-upright; it comes down before it works
//
// A job is in phases (to the pick, down, grab, up, to the drop, down,
// let go, up), each with its own duration: the whole lasts about one cycle
// (PORT.mediumCycle, largeCycle). The container is taken at the grab and
// handed over at the let-go: it is always somewhere (on its stack, on the
// ship, or under the crane).

import { compose, invertAffine, multiply, rotationX, rotationY, translation, transformPoint, type Mat4, type Mat4Like, type Vec3 } from '@/core/mat4';
import { APEX_Y, APEX_Z, GIRDER_X, HINGE_Z, JIB_HINGE, MEDIUM_APEX, ringTop } from '@/parts/port/crane.part';
import { PORT } from '@/style/port';
import type { InstanceHandle, LifeStage } from '../api';
import { angleDelta, clamp01, easeIn, easeInOut, pop } from '../motion/ease';
import { removalPuff } from '../ships/puff';

const HIDDEN: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

/** Where a container is (or is to go): its floor's middle in the world, and which way its length lies. */
export interface Place {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * A job: where from and where to; `take` hands over the container at the grab, `put` takes it at the
 * let-go (where it hangs: `at`). `to` may change while the crane carries it (its place went: it is carried
 * back where it came from). `abandon`: the job cannot finish; the container (if any) is given up where it
 * hangs, in the removal puff.
 */
export interface Job {
  from: () => Place | null;
  to: () => Place | null;
  take(): InstanceHandle | null;
  put(h: InstanceHandle, at: Place): void;
  abandon(h: InstanceHandle | null, at: Place | null): void;
}

type Phase = 'idle' | 'boom-down' | 'to-pick' | 'down-pick' | 'grab' | 'up-pick' | 'to-drop' | 'down-drop' | 'let-go' | 'up-drop' | 'rest' | 'boom-up';

/** The crane's pose: the large crane's travel, boom and trolley; the medium crane's slew and luff; the hoist. */
interface Pose {
  travel: number;
  raise: number;
  trolley: number;
  slew: number;
  luff: number;
  /** The load's floor height (C frame) and its yaw relative to C. */
  y: number;
  yaw: number;
}

/** Safe height for a load's floor over the deck: clear of a stack three high and a loaded ship. */
const SAFE = 1.75;
/** The large crane's boom: idle near-upright, working flat. */
const BOOM_UP = 1.38;
/** The medium crane's jib idle. */
const LUFF_IDLE = 1.18;
const TROLLEY_PARK = -0.55;

export class Crane {
  readonly large: boolean;
  /** C: the crane's frame at home; and its inverse. */
  private home: Mat4;
  private inv: Mat4;
  private pieces: InstanceHandle[] = [];
  private top: InstanceHandle | null = null;
  private jib: InstanceHandle | null = null;
  private boom: InstanceHandle | null = null;
  private trolleyH: InstanceHandle | null = null;
  private spreader: InstanceHandle | null = null;
  private hook: InstanceHandle | null = null;
  private ropes: InstanceHandle | null = null;
  private stays: InstanceHandle[] = [];
  pose: Pose;
  private from: Pose;
  private target: Pose;
  phase: Phase = 'idle';
  private t = 0;
  private dur = 1;
  job: Job | null = null;
  load: InstanceHandle | null = null;
  /** Where the load hangs (its floor's middle, world), for a puff if it must be given up. */
  private loadPlace: Place = { x: 0, y: 0, z: 0, yaw: 0 };
  /** True once it has been told to stand idle with its boom up (no ship, or over the cap). */
  private parked = true;

  constructor(
    private stage: LifeStage,
    readonly id: string,
    kind: 'medium' | 'large',
    look: number,
    /** The actor's own instance (the frame on its rails), and its base matrix. */
    private body: InstanceHandle | null,
    private base: Mat4Like,
    private off: number,
    /** How far along the rails it may travel from home (C frame X). */
    public lo: number,
    public hi: number,
    private seed = 0,
  ) {
    this.large = kind === 'large';
    this.home = multiply(base, translation(off, 0, 0.5));
    this.inv = invertAffine(this.home);
    const piece = (variant: string): InstanceHandle => {
      const h = stage.spawn({ actor: 'crane-piece', variant, params: { look } }, HIDDEN);
      this.pieces.push(h);
      return h;
    };
    if (this.large) {
      this.boom = piece('large-boom');
      this.trolleyH = piece('trolley');
      this.ropes = piece('cables4');
      this.spreader = piece('spreader');
      this.stays = [piece('cable'), piece('cable')];
    } else {
      this.top = piece('medium-top');
      this.jib = piece('medium-jib');
      this.ropes = piece('cable');
      this.hook = piece('hook');
      this.stays = [piece('cable')];
    }
    this.pose = this.idlePose();
    this.from = { ...this.pose };
    this.target = { ...this.pose };
    this.draw();
  }

  private idlePose(): Pose {
    return this.large ? { travel: 0, raise: BOOM_UP, trolley: TROLLEY_PARK, slew: 0, luff: 0, y: PORT.largeBoomY - 1.2, yaw: Math.PI / 2 } : { travel: 0, raise: 0, trolley: 0, slew: 0, luff: LUFF_IDLE, y: mediumIdleY(), yaw: 0 };
  }

  /** The crane frame of a world point. */
  local(x: number, y: number, z: number): Vec3 {
    return transformPoint(this.inv, [x, y, z]) as Vec3;
  }

  /** True while it is at work or getting ready to (boom coming down). */
  get busy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'boom-up';
  }

  /** Can it reach a place (with its rails and boom, or its jib)? */
  reaches(p: Place): boolean {
    const [lx, , lz] = this.local(p.x, p.y, p.z);
    if (this.large) return lx >= this.lo - 0.05 && lx <= this.hi + 0.05 && lz <= PORT.largeOut + 0.6 && lz >= -PORT.largeBack + 0.4;
    const r = Math.hypot(lx, lz);
    return r >= PORT.mediumReachMin && r <= PORT.mediumReachMax;
  }

  /** Starts a job (it must be idle or parked). */
  start(job: Job): void {
    this.job = job;
    this.parked = false;
    this.go(this.large && this.pose.raise > 0.02 ? 'boom-down' : 'to-pick');
  }

  /** No ship to work: finish what is in hand, then stand with the boom up. */
  park(): void {
    this.parked = true;
    if (this.phase === 'idle' && !this.atRest()) this.go('boom-up');
  }

  /** A ship is coming alongside: the boom comes down (a large crane) and it waits for work. */
  ready(): void {
    this.parked = false;
    if (this.phase === 'idle' && this.large && this.pose.raise > 0.02) this.go('boom-down');
  }

  /** Standing as it does with no ship in: boom up, jib raised. */
  private atRest(): boolean {
    return this.large ? Math.abs(this.pose.raise - BOOM_UP) < 0.02 : Math.abs(this.pose.luff - LUFF_IDLE) < 0.02;
  }

  /** At work on a job, or on the way to or from one. */
  get working(): boolean {
    return this.job !== null || this.phase === 'rest';
  }

  /** Loads the pose a phase moves to, and its duration. */
  private go(phase: Phase): void {
    this.phase = phase;
    this.t = 0;
    this.from = { ...this.pose };
    const tg = { ...this.pose };
    const cycle = this.large ? PORT.largeCycle : PORT.mediumCycle;
    let raw: number;
    const over = (p: Place | null, y: number): void => {
      if (!p) return;
      const [lx, ly, lz] = this.local(p.x, p.y, p.z);
      void ly;
      if (this.large) {
        tg.travel = Math.max(this.lo, Math.min(this.hi, lx));
        tg.trolley = lz;
      } else {
        tg.slew = Math.atan2(lx, lz);
        const r = Math.max(PORT.mediumReachMin, Math.min(PORT.mediumReachMax, Math.hypot(lx, lz)));
        tg.luff = Math.acos(Math.max(-1, Math.min(1, (r - JIB_HINGE[2]) / PORT.mediumJib)));
      }
      tg.y = y;
    };
    const placeY = (p: Place | null): number => (p ? this.local(p.x, p.y, p.z)[1] : SAFE);
    const turnTo = (p: Place | null): void => {
      if (p) tg.yaw = angleDelta(0, p.yaw - this.craneYaw());
    };
    switch (phase) {
      case 'boom-down':
        tg.raise = 0;
        raw = PORT.boomTime / (cycle / 16) / 2.2;
        break;
      case 'boom-up':
        if (this.large) {
          tg.raise = BOOM_UP;
          tg.trolley = TROLLEY_PARK;
          tg.y = PORT.largeBoomY - 1.2;
          tg.yaw = Math.PI / 2;
        } else {
          tg.luff = LUFF_IDLE;
          tg.slew = 0;
          tg.y = mediumIdleY();
          tg.yaw = 0;
        }
        raw = PORT.boomTime / (cycle / 16) / 2.2;
        break;
      case 'to-pick': {
        const p = this.job?.from() ?? null;
        over(p, SAFE);
        turnTo(p);
        raw = this.travelTime(tg);
        break;
      }
      case 'down-pick':
        tg.y = placeY(this.job?.from() ?? null);
        raw = Math.abs(this.pose.y - tg.y) / 0.9 + 0.3;
        break;
      case 'grab':
      case 'let-go':
        raw = 0.7;
        break;
      case 'up-pick':
      case 'up-drop':
        tg.y = SAFE;
        raw = Math.abs(this.pose.y - SAFE) / 0.9 + 0.3;
        break;
      case 'to-drop': {
        const p = this.job?.to() ?? null;
        over(p, SAFE);
        turnTo(p);
        raw = this.travelTime(tg);
        break;
      }
      case 'down-drop':
        tg.y = placeY(this.job?.to() ?? null);
        raw = Math.abs(this.pose.y - tg.y) / 0.9 + 0.3;
        break;
      case 'rest':
        if (!this.large) {
          tg.luff = Math.max(tg.luff, 0.9);
          tg.y = SAFE + 0.4;
        } else {
          tg.trolley = Math.min(tg.trolley, 1.4);
          tg.y = SAFE + 0.3;
        }
        raw = 1.6;
        break;
      default:
        raw = 0.5;
    }
    // Every job lasts about one cycle: its legs are timed in proportion.
    this.dur = Math.max(0.35, raw * (cycle / 16) * (this.large ? 1 : 1.25));
    this.target = tg;
  }

  private travelTime(tg: Pose): number {
    if (this.large) return Math.max(Math.abs(tg.travel - this.pose.travel) / 0.8, Math.abs(tg.trolley - this.pose.trolley) / 1.4, 1.2) + 0.4;
    return Math.max(Math.abs(angleDelta(this.pose.slew, tg.slew)) / 0.55, Math.abs(tg.luff - this.pose.luff) / 0.35, 1.2) + 0.4;
  }

  private craneYaw(): number {
    return Math.atan2(this.home[8]!, this.home[10]!);
  }

  /** Moves on `dt` seconds; returns true when a job has just finished. */
  update(dt: number): boolean {
    if (this.comeAndGo(dt)) return false;
    let finished = false;
    if (this.phase !== 'idle') {
      this.t += dt;
      const k = easeInOut(clamp01(this.t / this.dur));
      const a = this.from, b = this.target;
      const lerp = (x: number, y: number): number => x + (y - x) * k;
      this.pose.travel = lerp(a.travel, b.travel);
      this.pose.raise = lerp(a.raise, b.raise);
      this.pose.trolley = lerp(a.trolley, b.trolley);
      this.pose.slew = a.slew + angleDelta(a.slew, b.slew) * k;
      this.pose.luff = lerp(a.luff, b.luff);
      this.pose.y = lerp(a.y, b.y);
      this.pose.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * k;
      // Over a place that moves (a ship on the swell): follow it down.
      if ((this.phase === 'down-pick' || this.phase === 'grab') && this.job) this.follow(this.job.from());
      if ((this.phase === 'down-drop' || this.phase === 'let-go') && this.job) this.follow(this.job.to());
      if (this.t >= this.dur) finished = this.next();
    }
    this.draw();
    return finished;
  }

  /** Keeps the hoist over a place that is moving a little, and the load's floor on it. */
  private follow(p: Place | null): void {
    if (!p) return;
    const [lx, ly, lz] = this.local(p.x, p.y, p.z);
    const k = clamp01(this.t / this.dur);
    if (this.large) {
      this.pose.trolley += (lz - this.pose.trolley) * 0.3;
      this.pose.travel += (Math.max(this.lo, Math.min(this.hi, lx)) - this.pose.travel) * 0.3;
    } else {
      this.pose.slew += angleDelta(this.pose.slew, Math.atan2(lx, lz)) * 0.3;
    }
    if (this.phase === 'grab' || this.phase === 'let-go' || k > 0.85) this.pose.y = ly;
  }

  /** The phase after this one; true when a job has just been done. */
  private next(): boolean {
    const job = this.job;
    switch (this.phase) {
      case 'boom-down':
        if (job) this.go('to-pick');
        else if (this.parked) this.go('boom-up');
        else this.phase = 'idle';
        return false;
      case 'to-pick':
        if (!job || !job.from()) return this.giveUp();
        this.go('down-pick');
        return false;
      case 'down-pick':
        this.go('grab');
        return false;
      case 'grab': {
        const h = job?.take() ?? null;
        if (!h) return this.giveUp();
        this.load = h;
        this.go('up-pick');
        return false;
      }
      case 'up-pick':
        this.go('to-drop');
        return false;
      case 'to-drop': {
        const p = job?.to();
        if (!p) return this.giveUp();
        // Its place changed on the way (it goes back where it came from): over there first.
        const [lx, , lz] = this.local(p.x, p.y, p.z);
        const off = this.large ? Math.hypot(Math.max(this.lo, Math.min(this.hi, lx)) - this.pose.travel, lz - this.pose.trolley) : Math.abs(angleDelta(this.pose.slew, Math.atan2(lx, lz)));
        this.go(off > 0.25 ? 'to-drop' : 'down-drop');
        return false;
      }
      case 'down-drop':
        this.go('let-go');
        return false;
      case 'let-go':
        if (this.load && job) job.put(this.load, { ...this.loadPlace });
        this.load = null;
        this.go('up-drop');
        return false;
      case 'up-drop':
        this.job = null;
        this.go('rest');
        return true;
      case 'rest':
        this.phase = 'idle';
        if (this.parked) this.go('boom-up');
        return false;
      case 'boom-up':
        this.phase = 'idle';
        return false;
      default:
        this.phase = 'idle';
        return false;
    }
  }

  /** The job's place has gone: back to rest, the load handed back (or given up) by the job. */
  private giveUp(): boolean {
    const job = this.job;
    this.job = null;
    job?.abandon(this.load, this.load ? { ...this.loadPlace } : null);
    this.load = null;
    this.go('rest');
    return true;
  }

  /** Sent to stand idle at once (its port changed under it): whatever it carries is given back to the job. */
  stop(): void {
    if (this.job) this.giveUp();
    this.parked = true;
  }

  /** The world matrices of every piece, from the pose. */
  private draw(): void {
    const p = this.pose;
    // Arriving or leaving, everything is drawn grown out of (or shrunk into) the crane's own foot.
    const g = this.grow;
    const G: Mat4 | null = g === 1 ? null : compose(this.home, [g, 0, 0, 0, 0, g, 0, 0, 0, 0, g, 0, 0, 0, 0, 1], this.inv);
    const fin = (m: Mat4Like): Mat4Like => (G ? multiply(G, m) : m);
    const C = this.large ? multiply(this.home, translation(p.travel, 0, 0)) : this.home;
    if (this.large || G) this.frame?.setMatrix(fin(multiply(this.base, translation(this.large ? p.travel : 0, 0, 0))));
    const at = (m: Mat4Like, h: InstanceHandle | null): void => h?.setMatrix(fin(m));
    let loadAt: Mat4;
    if (this.large) {
      const B = PORT.largeBoomY;
      const boom = compose(C, translation(0, B, HINGE_Z), rotationX(-p.raise));
      at(boom, this.boom);
      // The trolley rides the boom when it is down, else waits on the fixed girders.
      const onBoom = p.trolley > HINGE_Z;
      const trolley = onBoom ? compose(boom, translation(0, 0, p.trolley - HINGE_Z)) : compose(C, translation(0, B, p.trolley));
      at(trolley, this.trolleyH);
      const tp = transformPoint(trolley, [0, -0.12, 0]);
      const spreaderTop = p.y + PORT.boxH + 0.17;
      const ss = transformPoint(C, [0, spreaderTop, p.trolley]);
      const len = Math.max(0.05, tp[1] - ss[1]);
      const yawC = this.craneYaw();
      at(compose(translation(tp[0], tp[1], tp[2]), rotationY(yawC), scaleY(len)), this.ropes);
      const spreader = compose(translation(ss[0], ss[1], ss[2]), rotationY(yawC + p.yaw));
      at(spreader, this.spreader);
      loadAt = compose(spreader, translation(0, -(PORT.boxH + 0.17), 0));
      // The forestays from the apex to the boom.
      const L = PORT.largeOut + 1.0 - HINGE_Z;
      this.stays.forEach((h, i) => {
        const s = i === 0 ? 1 : -1;
        const a = transformPoint(C, [s * 0.24, APEX_Y - 0.05, APEX_Z]);
        const b = transformPoint(boom, [s * GIRDER_X, 0.16, L * 0.68]);
        h.setMatrix(fin(ropeMatrix(a, b)));
      });
    } else {
      const top = compose(C, translation(0, ringTop(), 0), rotationY(p.slew));
      at(top, this.top);
      const jib = compose(top, translation(JIB_HINGE[0], JIB_HINGE[1], JIB_HINGE[2]), rotationX(-p.luff));
      at(jib, this.jib);
      const head = transformPoint(jib, [0, -0.08, PORT.mediumJib + 0.04]);
      // The hook hangs plumb under the head, the load's top just under the lifting beam.
      const hookTop = p.y + PORT.boxH + 0.39;
      const hy = transformPoint(C, [0, hookTop, 0])[1];
      const len = Math.max(0.05, head[1] - hy);
      at(compose(translation(head[0], head[1], head[2]), rotationY(this.craneYaw() + p.slew), scaleY(len)), this.ropes);
      const hook = compose(translation(head[0], hy, head[2]), rotationY(this.craneYaw() + p.yaw));
      at(hook, this.hook);
      loadAt = compose(hook, translation(0, -(PORT.boxH + 0.39), 0));
      const a = transformPoint(top, MEDIUM_APEX);
      const b = transformPoint(jib, [0, 0.1, PORT.mediumJib - 0.1]);
      this.stays[0]?.setMatrix(fin(ropeMatrix(a, b)));
    }
    if (this.load) {
      this.load.setMatrix(fin(loadAt));
      this.loadPlace.x = loadAt[12]!;
      this.loadPlace.y = loadAt[13]!;
      this.loadPlace.z = loadAt[14]!;
    }
  }

  release(): void {
    for (const h of this.pieces) h.release();
    this.pieces = [];
    this.stand?.release();
    this.stand = null;
    if (this.body) this.body.setMatrix(this.base);
  }

  // ── arriving and leaving ──

  /** How big it is drawn about its foot (1 standing; less while it rises or goes). */
  private grow = 1;
  private arrival: number | null = null;
  private leaving: number | null = null;
  /** A drawing of its frame of its own, once the plan's has gone (it shrinks away in its puffs). */
  private stand: InstanceHandle | null = null;
  private get frame(): InstanceHandle | null {
    return this.stand ?? this.body;
  }

  /**
   * Raised where it stands (a port just made, or grown): after `delay` seconds its frame grows up out of the
   * deck with the game's pop, then its boom (or jib) swings up into its idle place. About a second and a half.
   */
  arrive(delay: number): void {
    this.arrival = -delay;
    this.grow = 0;
    if (this.large) this.pose.raise = 0;
    else this.pose.luff = 0.15;
    this.phase = 'idle';
    this.draw();
  }

  /** Arriving or leaving: not to be given work. */
  get coming(): boolean {
    return this.arrival !== null || this.leaving !== null;
  }

  /**
   * Its port has gone (or it moves along): whatever it carries is given back to its job, and it shrinks into
   * its foot in a burst of puffs, as anything removed does. `spec`: its frame's drawing, now gone from the plan.
   */
  leave(spec: { variant: string; look: number; off: number }): void {
    this.stop();
    this.body = null;
    this.stand = this.stage.spawn({ actor: 'port-crane', variant: spec.variant, params: { look: spec.look, off: spec.off } }, this.base);
    this.leaving = 0;
    const [x, y, z] = transformPoint(this.home, [0, 0, 0]);
    const h = this.large ? APEX_Y : ringTop() + 1;
    for (let k = 0; k < 3; k++) removalPuff(this.stage, this.seed, x, y + (h * (k + 0.5)) / 3, z, 1.6, k + (this.large ? 10 : 20));
  }

  /** True once it has finished leaving (release it). */
  get gone(): boolean {
    return this.leaving !== null && this.leaving >= LEAVE_TIME;
  }

  /** Steps an arrival or a leaving; true while one is under way (and it then takes the frame's step). */
  private comeAndGo(dt: number): boolean {
    if (this.leaving !== null) {
      this.leaving += dt;
      this.grow = Math.max(0.001, 1 - easeIn(clamp01(this.leaving / LEAVE_TIME)));
      this.draw();
      return true;
    }
    if (this.arrival === null) return false;
    this.arrival += dt;
    if (this.arrival < 0) {
      this.grow = 0.001;
      this.draw();
      return true;
    }
    const k = this.arrival / GROW_TIME;
    this.grow = Math.max(0.001, pop(Math.min(1, k)));
    if (k >= 1) {
      this.grow = 1;
      this.arrival = null;
      // The boom swings up into its idle place, quickly.
      this.go('boom-up');
      this.dur = 0.9;
      this.draw();
      return false;
    }
    this.draw();
    return true;
  }
}

/** The medium crane's load floor height when it stands idle, its jib up and the hook a little under the head. */
function mediumIdleY(): number {
  const head = ringTop() + JIB_HINGE[1] + PORT.mediumJib * Math.sin(LUFF_IDLE) - 0.08;
  return head - 0.7 - PORT.boxH - 0.39;
}

/** Seconds a crane takes to grow out of the deck, and to shrink away. */
const GROW_TIME = 0.5;
const LEAVE_TIME = 0.35;

function scaleY(s: number): Mat4 {
  return [1, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** A matrix taking a rope piece (a unit long down −Y from its origin) to run from a to b. */
export function ropeMatrix(a: Vec3 | number[], b: Vec3 | number[]): Mat4 {
  const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, dz = b[2]! - a[2]!;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  // −Y along a→b: Y = −d.
  const yx = -dx / len, yy = -dy / len, yz = -dz / len;
  // X level and square to it (or along X if the rope is level).
  let xx = yz, xz = -yx;
  const xl = Math.hypot(xx, xz);
  if (xl < 1e-6) {
    xx = 1;
    xz = 0;
  } else {
    xx /= xl;
    xz /= xl;
  }
  // Z = X × Y.
  const zx = 0 * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - 0 * yx;
  return [xx, 0, xz, 0, yx * len, yy * len, yz * len, 0, zx, zy, zz, 0, a[0]!, a[1]!, a[2]!, 1];
}
