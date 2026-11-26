// The living town (L51 and up): a crowd with the town's chains on it. The
// people system runs one of these; tests step one with fixed time steps.

import type { CellKey } from '@/core/grid';
import type { MeshData } from '@/gen/mesh';
import type { TimeSignal } from '@/life/api';
import type { DressingPlan, ShapePlan } from '@/resolve/plan';
import { createCrowd, type Crowd, type CrowdOptions, type Person } from '../people/crowd';
import type { Scuffle } from '../people/scuffle';
import { SCUFFLE } from '@/style/town-life';
import type { Load } from '../people/errand';
import { createBoard, type Board, type Chain, type GoodsStage } from './board';
import { breadChain } from './chains/bread';
import { buildChain, type BuildChain } from './chains/build';
import { fishChain } from './chains/fish';
import { applesChain } from './chains/apples';
import { cargoChain } from './chains/cargo';
import { watchChain } from './chains/watch';
import { marketChain } from './chains/market-day';
import { weddingChain } from './chains/wedding';
import { tradeChain } from './chains/trade';
import { harvestChain } from './chains/harvest';
import { laundryChain } from './chains/laundry';
import { dogsChain } from './chains/dogs';
import { danceChain, pickChain, schoolChain, showChain, smithChain, vendChain } from './chains/places';
import { waterChain } from './chains/water';
import { mischiefChains } from '../mischief/response';
import { raidChain } from '../raid/chain';
import { fieldChain } from './chains/field';
import { beachChain } from './chains/beach';
import { snowDayChain } from './chains/snow-day';
import { supperChain } from './chains/supper';
import { picnicChain } from './chains/picnic';
import { carolChain } from './chains/carols';
import { iceCreamChain } from './chains/icecream';
import { welcomeChain } from './chains/welcome';
import { shipyardChain } from './chains/shipyard';

/** Every chain, in the order they are offered a person (the first that wants them has them). */
export function allChains(): Chain[] {
  // Mischief (design section 13b) first: a raid, a fire or a bomb comes before anybody's errand.
  return [raidChain(), ...mischiefChains(), weddingChain(), beachChain(), iceCreamChain(), snowDayChain(), supperChain(), picnicChain(), carolChain(), welcomeChain(), shipyardChain(), buildChain(), watchChain(), breadChain(), fishChain(), applesChain(), tradeChain(), cargoChain(), harvestChain(), laundryChain(), schoolChain(), smithChain(), showChain(), vendChain(), pickChain(), danceChain(), fieldChain(), marketChain(), waterChain(), dogsChain()];
}

/** Whoever keeps the peace near a scuffle: the watchman out on his round, else a guard on duty; sent over at a trot. */
function respondTo(board: Board, s: Scuffle): Person | null {
  const near = (p: Person): boolean => p.visible && (p.mode === 'walk' || p.mode === 'linger') && Math.hypot(p.x - s.x, p.z - s.z) < SCUFFLE.responderReach && Math.abs(p.y - s.y) < 2;
  const watch = board.chains.find((c) => c.id === 'watch');
  const who =
    board.crowd.people.find((p) => watch && board.claimedBy(p) === watch && p.load === 'lantern' && near(p)) ??
    board.crowd.people.find((p) => p.work?.job === 'guard' && near(p) && !p.scuffle);
  if (!who || who === s.a || who === s.b) return null;
  if (who.scuffle === s) {
    // Was watching: no longer.
    who.scuffle = null;
    who.startled = 0;
  }
  const c = board.centre(s.cell);
  const dx = who.x - s.x, dz = who.z - s.z, d = Math.hypot(dx, dz) || 1;
  const step = board.stepAt(s.cell, {
    spot: { x: Math.max(c.x - 0.45, Math.min(c.x + 0.45, s.x + (dx / d) * 0.42)), z: Math.max(c.z - 0.45, Math.min(c.z + 0.45, s.z + (dz / d) * 0.42)) },
    face: Math.atan2(-dx, -dz),
    pose: 'wave',
    linger: 2.5,
    load: who.load,
    brisk: true,
    tag: 'scuffle:break-up',
    done: () => board.crowd.scuffles.breakUp(),
  });
  board.assign(who, { chain: board.claimedBy(who) ?? board.chains[0]!, at: 0, steps: [step] });
  return who;
}

export interface LivingTown {
  crowd: Crowd;
  board: Board;
  sync(shape: ShapePlan, dressing: DressingPlan | null, time: TimeSignal): void;
  step(dt: number, time: TimeSignal): void;
  /** A piece of a building landed (L54: builders come). */
  landed(cell: CellKey): void;
  dispose(): void;
}

export function createLivingTown(opts: CrowdOptions & { stage?: GoodsStage; restingMesh?(kind: Load): MeshData; chains?: Chain[]; seed?: number } = {}): LivingTown {
  let board: Board | null = null;
  const crowd = createCrowd({
    ...opts,
    // L50: the night watchman (or a guard on duty) trots over to break up a scuffle.
    respond: (s) => (board ? respondTo(board, s) : null),
    errands: {
      next: (p, t) => board?.host.next(p, t) ?? null,
      arrived: (p, s) => board?.host.arrived(p, s),
      failed: (p, s) => board?.host.failed(p, s),
    },
  });
  const b = createBoard({ crowd, seed: opts.seed ?? 0, chains: opts.chains ?? allChains(), stage: opts.stage ?? null, ...(opts.restingMesh ? { restingMesh: opts.restingMesh } : {}) });
  board = b;
  return {
    crowd,
    board: b,
    sync(shape, dressing, time) {
      crowd.sync(shape, dressing, time);
      b.sync(shape, dressing);
    },
    step(dt, time) {
      crowd.step(dt, time);
      b.step(dt, time);
    },
    landed(cell) {
      for (const c of b.chains) if (c.id === 'build') (c as BuildChain).landed(cell, b);
    },
    dispose() {
      b.dispose();
    },
  };
}
