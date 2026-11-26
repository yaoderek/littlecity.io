// L18: the fishing boat. Overnight it lies at its berth by the docks and
// rides the swell. At dawn it puts out: across to the sea lane, then slowly
// round it through the day, working. At dusk it turns for home and the gulls
// of the harbour come trailing after it (fishingBoatOf, read by the gulls).
// A town opened by day finds it already out; at night, already home.
//
// A fishing boat anchored to a cell (the gallery) just lies there afloat.
//
// Travel (where it is, which way it heads) is smooth; the swell is posed on
// twos; it leaves a wake of rings under way. The legs between the berth and
// the lane keep to open water (waterRoute): round a headland, not over it.

import { boatPose } from '../mischief/boatwreck';
import { SEA_Y } from '@/core/grid';
import type { Mat4 } from '@/core/mat4';
import type { ShapePlan } from '@/resolve/plan';
import { seaLane, type SeaLane } from '@/rules/life/sea-lanes.fact';
import { alongRoute, routeLength, waterMask, waterRoute, type Pt } from '@/rules/life/waterway';
import { BOATS } from '@/style/boats';
import { defineBehaviour, type LifeStage, type TimeSignal } from '../api';
import { angleDelta, easeInOut, glide } from '../motion/ease';
import { fly } from '../motion/pose';
import { onTwos } from '../motion/twos';
import { rockBy, swellAt, wakeRing, type Swell } from './afloat';
import { entryRoute, notePose, townLive } from '../ships/ferry.system';
import { standAside } from '../ships/news';
import { floatingAt, poseFloating, refloat, type Floating } from './floating';

/** Columns a second, under way. */
export const FISH_SPEED = 0.9;

export type FishingMode = 'berth' | 'out' | 'lane' | 'return' | 'home';

/** Where the boat should be at a time of day: out from dawn to dusk, home from dusk to dawn. */
export const wantsOut = (time: TimeSignal): boolean => time.isDawn || time.isDay;

/** Where the fishing boat is, for the gulls: and whether it is coming home with them in tow. */
export interface BoatNews {
  x: number;
  z: number;
  homeward: boolean;
}
const news = new WeakMap<LifeStage, BoatNews>();
export function fishingBoatOf(stage: LifeStage): BoatNews | null {
  return news.get(stage) ?? null;
}

interface State {
  /** Made for a town already shown: it comes in from the edge (decided when it is made). */
  arrives: boolean;
  moored: Floating | null;
  mode: FishingMode;
  started: boolean;
  shape: ShapePlan | null;
  lane: SeaLane | null;
  bx: number;
  bz: number;
  byaw: number;
  x: number;
  z: number;
  yaw: number;
  /** A leg between two points (out to the lane, or home): its route through open water, how far along. */
  route: Pt[];
  leg: number;
  legLen: number;
  /** Open-water columns of the town now (waterway.ts). */
  water: Uint8Array | null;
  /** Distance along the lane, and where along it the way home leaves it. */
  s: number;
  turnHome: number;
  wake: number;
  /** Leaning into a turn (radians of roll), eased. */
  bank: number;
  phase: number;
  swell: Swell;
  drawn: number;
  m: Mat4;
}

function startLeg(state: State, tx: number, tz: number): void {
  const from: Pt = [state.x, state.z], to: Pt = [tx, tz];
  // Through open water; straight across only if no way through is found (the old behaviour).
  state.route = (state.water && waterRoute(state.water, from, to, 0.18)) || [from, to];
  state.leg = 0;
  state.legLen = Math.max(0.01, routeLength(state.route));
}

export default defineBehaviour({
  actor: 'fishing-boat',
  create(item, ctx): State {
    const p = item.params ?? {};
    const moored = item.at !== null ? floatingAt(ctx.instance.base, ctx.rand('swell'), BOATS.fishLength, BOATS.fishBeam) : null;
    const bx = p.berthX ?? 0, bz = p.berthZ ?? 0, byaw = p.berthYaw ?? 0;
    return {
      arrives: moored === null && townLive(ctx.stage),
      moored, mode: 'berth', started: false, shape: null, lane: null,
      bx, bz, byaw, x: bx, z: bz, yaw: byaw,
      route: [[bx, bz]], leg: 1, legLen: 1, water: null, s: 0, turnHome: 0, wake: 0,
      phase: ctx.rand('swell'), swell: { heave: 0, roll: 0, pitch: 0 }, bank: 0, drawn: NaN, m: new Array<number>(16).fill(0),
    };
  },
  changed(state, ctx) {
    if (state.moored) refloat(state.moored, ctx.instance.base);
    const p = ctx.item.params ?? {};
    state.bx = p.berthX ?? state.bx;
    state.bz = p.berthZ ?? state.bz;
    state.byaw = p.berthYaw ?? state.byaw;
  },
  update(state, dt, signals, ctx) {
    if (state.moored) {
      poseFloating(state.moored, signals, ctx.instance, ctx.stage, ctx.dressing, 0, { id: ctx.item.id, type: 'fishing-boat' });
      return;
    }
    if (ctx.shape !== state.shape) {
      state.shape = ctx.shape;
      state.water = waterMask(ctx.shape.facts);
      const lane = seaLane(ctx.shape.facts);
      state.lane = lane.kind === 'none' ? null : lane;
      if (state.lane && state.mode === 'lane') state.s = state.lane.nearest(state.x, state.z);
    }
    const lane = state.lane;
    const out = wantsOut(signals.time) && lane !== null;
    if (!state.started) {
      state.started = true;
      // A dock built in a town already shown: the boat comes in from the edge of the map, to work or to its berth.
      const toward: [number, number] | null = !state.arrives ? null : out ? [lane!.at(lane!.nearest(state.bx, state.bz)).x, lane!.at(lane!.nearest(state.bx, state.bz)).z] : [state.bx, state.bz];
      const route = toward && state.water ? entryRoute(state.water, toward[0], toward[1]) : null;
      if (route) {
        state.route = route;
        state.leg = 0;
        state.legLen = Math.max(0.01, routeLength(route));
        state.x = route[0]![0];
        state.z = route[0]![1];
        state.yaw = Math.atan2(route[1]![0] - route[0]![0], route[1]![1] - route[0]![1]);
        state.s = lane ? lane.nearest(toward![0], toward![1]) : 0;
        state.mode = out ? 'out' : 'home';
      } else if (out) {
        // Opened by day: already at work on the lane.
        state.s = (lane!.nearest(state.bx, state.bz) + lane!.length * 0.3 * ctx.rand('start')) % lane!.length;
        const p = lane!.at(state.s);
        state.x = p.x;
        state.z = p.z;
        state.yaw = Math.atan2(p.dx, p.dz);
        state.mode = 'lane';
      }
    }
    // Decide.
    if (out && state.mode === 'berth') {
      const s = lane!.nearest(state.bx, state.bz);
      const p = lane!.at(s);
      state.s = s;
      startLeg(state, p.x, p.z);
      state.mode = 'out';
    } else if (!out && state.mode === 'lane' && lane) {
      // Home along the lane to the point nearest the berth, then in: never across the island.
      state.turnHome = lane.nearest(state.bx, state.bz);
      state.mode = 'return';
    } else if (!out && (state.mode === 'out' || (state.mode === 'return' && !lane))) {
      startLeg(state, state.bx, state.bz);
      state.mode = 'home';
    } else if (out && (state.mode === 'return' || state.mode === 'home')) {
      // Morning came before it was in (a short night): back to work.
      state.mode = 'lane';
      if (lane) state.s = lane.nearest(state.x, state.z);
    }

    // Travel: smooth, every frame. Big ships (L38–L42) have the way: it slows for one ahead and stands aside.
    const aside = standAside(ctx.stage, state, state.x, state.z, state.yaw, dt, ctx.item.id);
    dt *= aside.slow;
    const px = state.x, pz = state.z;
    let heading: number;
    if (state.mode === 'out' || state.mode === 'home') {
      // Bow first: it gathers way only as it comes round to its course, so it never crabs sideways off the dock.
      const here = alongRoute(state.route, (state.legLen > 2 ? state.leg : easeInOut(state.leg)) * state.legLen);
      const align = Math.max(0.12, Math.cos(Math.min(Math.PI / 2, Math.abs(angleDelta(state.yaw, Math.atan2(here.dx, here.dz))))));
      state.leg = Math.min(1, state.leg + (FISH_SPEED * dt * align) / state.legLen);
      // Gathering way at the start of a leg and coming gently alongside at the end.
      const t = state.legLen > 2 ? state.leg : easeInOut(state.leg);
      const p = alongRoute(state.route, t * state.legLen);
      state.x = p.x;
      state.z = p.z;
      heading = Math.atan2(p.dx, p.dz);
      if (state.leg >= 1) {
        if (state.mode === 'out') state.mode = 'lane';
        else state.mode = 'berth';
      }
    } else if ((state.mode === 'lane' || state.mode === 'return') && lane) {
      const v = FISH_SPEED * (state.mode === 'return' ? 1 : 0.6) * dt;
      let ahead = (state.turnHome - state.s) % lane.length;
      if (ahead < 0) ahead += lane.length;
      // Working, it goes round; going home, it takes the shorter way round to where it turns in.
      const back = state.mode === 'return' && ahead > lane.length / 2;
      state.s = (((state.s + (back ? -v : v)) % lane.length) + lane.length) % lane.length;
      if (state.mode === 'return' && Math.min(ahead, lane.length - ahead) <= v) {
        startLeg(state, state.bx, state.bz);
        state.mode = 'home';
      }
      const p = lane.at(state.s);
      // Ease onto the lane (it may have moved under the boat).
      const k = glide(1.5, dt);
      state.x += (p.x - state.x) * k;
      state.z += (p.z - state.z) * k;
      heading = back ? Math.atan2(-p.dx, -p.dz) : Math.atan2(p.dx, p.dz);
    } else {
      // At the berth: swing round to lie along the dock.
      heading = state.byaw;
      const k = glide(1.2, dt);
      state.x += (state.bx - state.x) * k;
      state.z += (state.bz - state.z) * k;
    }
    const turn = angleDelta(state.yaw, heading) * glide(BOATS.turn, dt);
    state.yaw += turn;
    // Leaning into its turns, a little, while under way.
    const rate = dt > 0 ? turn / dt : 0;
    state.bank += (Math.max(-0.1, Math.min(0.1, -rate * 0.35)) - state.bank) * Math.min(1, dt * 3);
    const moved = Math.hypot(state.x - px, state.z - pz);
    state.wake += moved;
    if (state.wake > 1.1) {
      state.wake = 0;
      wakeRing(ctx.stage, state.x - Math.sin(state.yaw) * 0.45, state.z - Math.cos(state.yaw) * 0.45, BOATS.fishBeam * 0.6, 2.2, BOATS.wakeLife);
    }
    news.set(ctx.stage, { x: state.x, z: state.z, homeward: state.mode === 'home' || state.mode === 'return' });

    // Poses: the swell on twos; the place every frame.
    const now = onTwos(signals.time.seconds, state.phase);
    if (now !== state.drawn) {
      state.drawn = now;
      swellAt(now, state.phase, BOATS.fishLength, signals.wind(state.x, state.z).strength, state.swell);
      rockBy(ctx.stage, state.x, state.z, signals.time.seconds, state.swell);
    }
    fly(aside.x, SEA_Y + state.swell.heave, aside.z, state.yaw, state.swell.pitch, state.swell.roll + state.bank, 1, state.m);
    // Mischief: a blast may have swamped or capsized it (src/life/mischief/boatwreck.ts).
    boatPose(ctx.stage, ctx.item.id, 'fishing-boat', state.m, signals.time.seconds);
    ctx.instance.setMatrix(state.m);
    notePose(ctx.stage, ctx.item.id, state.m, 'fishing-boat');
  },
  dispose(_state, ctx) {
    news.delete(ctx.stage);
  },
});
