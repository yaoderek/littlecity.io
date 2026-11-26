// The castle's garrison turns out against a raid (design section 13b; Derek, 2026-11-25: "i want the castle
// guards to fight the raiders if there is a castle guard of people. they can repel one viking raid
// successfully"). Owner: the raid.
//
//   form    a raid is sighted: the alarm; the troop (L36) leaves its round and forms up in its column of twos
//           at the castle's gate, the rider (L37) at its head
//   march   out at the double, pikes up, the rider trotting ahead, by the streets to the raid's landing
//   fight   near the band, each soldier runs at the nearest raider not already taken (two on one at most):
//           a dust-cloud brawl (several at once: our own clouds, not the town's one-at-a-time scuffle). The
//           soldier mostly wins; the loser sits dizzy with stars, then runs (a raider for his ship, a soldier
//           back to the gate). Once enough of the band is beaten it breaks: the horn early, everybody back to
//           the ship, nothing more burnt and nothing carried off (raid.repel)
//   see off on the shore, facing the sea, cheering, until the ship is away
//   home    each back to his place in the round, which carries on from there; then the garrison rests
//           (RAID.garrisonRest) before it will turn out again
//
// One party at a time: while a garrison is out or resting, other parties raid as usual. It goes for the first
// raid sighted that it can reach on foot. A raid called off (undo) puts the soldiers straight back; a raid that
// ends otherwise (its ship sunk, the band swum off) sends them home. A soldier in the air (blast, Hand) is
// simply missing from it until he is down. Nothing here scales with the camera or fades out of existence.

import { rand } from '@/core/rand';
import type { Mat4Like } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { phrase } from '@/core/phrase';
import { cloudMesh, dazeStarMesh, popMesh, POPS } from '@/parts/people/scuffle-art';
import { RAID } from '@/style/raid';
import { GARRISON, PERSON } from '@/style/people';
import { SCUFFLE } from '@/style/town-life';
import type { InstanceHandle, LifeStage } from '../api';
import { crittersOf } from '../mischief/critters';
import type { Owned } from '../mischief/owned';
import { garrisonsOf, type GarrisonView, type OutFigure } from '../people/garrison.system';
import { createRouter, type Router } from '../people/route';
import { nearestOnTrack, outdoorRoute, trackAt, trackOf, type Track, type TrackPoint } from '../people/track';
import { CELL_H, key } from '@/core/grid';
import type { Board } from '../town/board';
import { scenesOf, type Scene } from '../town/scenes';
import type { Raid, Raider } from './raid';
import type { Raids } from './raids';

const HIDDEN: Mat4Like = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -60, 0, 1];

type Phase = 'form' | 'march' | 'fight' | 'seeoff' | 'home';
type ManState = 'go' | 'ready' | 'engage' | 'brawl' | 'dazed' | 'back' | 'stand';

/** Where somebody is going: along a route, then straight to the spot. */
interface Leg {
  /** First straight onto the route where it passes nearest (never a jump onto it). */
  lead: { x: number; y: number; z: number } | null;
  track: Track | null;
  s: number;
  end: { x: number; y: number; z: number };
}

interface Man {
  i: number;
  fig: OutFigure;
  node: number;
  leg: Leg | null;
  state: ManState;
  foe: Raider | null;
  /** Seconds in this state, and until the next look round for a foe. */
  t: number;
  look: number;
  /** Distance walked (the stride). */
  walked: number;
}

interface Brawl {
  men: Man[];
  r: Raider;
  t: number;
  dur: number;
  win: boolean;
  x: number;
  y: number;
  z: number;
  seed: number;
}

export interface Sally {
  readonly g: GarrisonView;
  readonly raid: Raid;
  phase: Phase;
  /** Seconds in the phase. */
  t: number;
  /** The way from the gate to the landing, and how far the column's head is along it. */
  readonly path: Track;
  head: number;
  readonly men: Man[];
  rider: Man | null;
  readonly brawls: Brawl[];
  /** Brawls the soldiers won and lost (for watching and tests). */
  won: number;
  lost: number;
  /** The castle's banner, carried at the head of the column (seen from across the town). */
  banner: InstanceHandle | null;
  /** Its note ("The castle's garrison marches out!"). */
  scene: Scene | null;
}

const banners = new Map<string, MeshData>();
/** A tall standard in the castle's colour: a pole a person and a half high, a swallow-tailed flag at its top. */
function bannerMesh(colour: string): MeshData {
  let m = banners.get(colour);
  if (m) return m;
  const b = new MeshBuilder({ ink: 'sally-banner' });
  b.setInk('pole').setColor('#6b4a2b').setPattern(PATTERN.planks);
  b.box([-0.012, 0, -0.012], [0.012, 1.05, 0.012]);
  b.setInk('finial').setColor('#e0a92e').setPattern(PATTERN.metal);
  b.box([-0.025, 1.05, -0.025], [0.025, 1.1, 0.025]);
  b.setInk('flag').setColor(colour).setPattern(PATTERN.cloth);
  // Two-sided, a little apart: a flag off the pole, its tail cut in two.
  // Each face both ways round (a side for each way it is seen from), a hair apart.
  const quad = (z: number, p: [number, number][]): void => {
    const v = p.map(([x, y]) => [x, y, z] as [number, number, number]);
    if (z > 0) b.quad(v[0]!, v[1]!, v[2]!, v[3]!);
    else b.quad(v[3]!, v[2]!, v[1]!, v[0]!);
  };
  const tri = (z: number, p: [number, number][]): void => {
    const v = p.map(([x, y]) => [x, y, z] as [number, number, number]);
    if (z > 0) b.tri(v[0]!, v[1]!, v[2]!);
    else b.tri(v[2]!, v[1]!, v[0]!);
  };
  for (const z of [-0.004, 0.004]) {
    quad(z, [[0.012, 1.02], [0.012, 0.72], [0.32, 0.74], [0.32, 1.0]]);
    tri(z, [[0.32, 1.0], [0.32, 0.88], [0.42, 0.98]]);
    tri(z, [[0.32, 0.86], [0.32, 0.74], [0.42, 0.74]]);
  }
  b.setInk('flag-band').setColor('#f2ead8').setPattern(PATTERN.cloth);
  for (const z of [-0.007, 0.007]) quad(z, [[0.1, 0.94], [0.1, 0.8], [0.16, 0.8], [0.16, 0.94]]);
  banners.set(colour, (m = b.build()));
  return m;
}

export interface Sallies {
  readonly list: readonly Sally[];
  /** Garrisons resting after a sally: life seconds until each is ready again, by key. */
  readonly resting: ReadonlyMap<string, number>;
  /** Sallies begun on this stage. */
  readonly count: number;
}

const byStage = new WeakMap<object, Sallies>();
/** The garrisons out against raids on this stage now (for watching and tests). */
export function salliesOf(stage: LifeStage): Sallies {
  return byStage.get(stage) ?? { list: [], resting: new Map(), count: 0 };
}

const pt: TrackPoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1, node: -1 };

export function createSallies(stage: LifeStage, own: Owned, raids: Raids, sound: (s: { type: 'bell' | 'cry' | 'horn'; x: number; z: number; long?: boolean }) => void) {
  const list: Sally[] = [];
  const resting = new Map<string, number>();
  let count = 0;
  let now = 0;
  let router: Router | null = null;
  let routerNav: unknown = null;
  const view: Sallies = {
    get list() {
      return list;
    },
    resting,
    get count() {
      return count;
    },
  };
  byStage.set(stage, view);

  // The drawings: dust clouds, things popping out of them, stars round dizzy heads (pools, hidden when idle).
  let meshes: { clouds: MeshData[]; pops: MeshData[]; star: MeshData } | null = null;
  const clouds: InstanceHandle[] = [];
  const pops: InstanceHandle[] = [];
  const stars: InstanceHandle[] = [];
  /** Hidden last frame, to be let go now. */
  const later: InstanceHandle[] = [];
  const take = (pool: InstanceHandle[], n: number, mesh: (k: number) => MeshData): InstanceHandle => {
    while (pool.length <= n) pool.push(own.stage.spawnMesh(mesh(pool.length), HIDDEN));
    return pool[n]!;
  };

  const routerFor = (board: Board): Router | null => {
    const nav = board.nav;
    if (!nav) return null;
    if (routerNav !== nav) {
      router = createRouter(nav);
      routerNav = nav;
    }
    return router;
  };

  /** A leg from a node to a spot: by the streets (out of doors if it can), then straight in. */
  const legTo = (board: Board, m: Man, to: number, end: { x: number; y: number; z: number }): Leg => {
    const r = routerFor(board);
    const nav = board.nav!;
    const f = m.fig;
    // From the cell he stands in now (not where his last route left off).
    const from = nav.nodeAt.get(key(Math.floor(f.x), Math.max(0, Math.round(f.y / CELL_H)), Math.floor(f.z))) ?? m.node;
    m.node = from;
    const route = r && from >= 0 && to >= 0 ? (outdoorRoute(nav, r, from, to) ?? r.find(from, to)) : null;
    const track = route && route.nodes.length > 1 ? trackOf(nav, [route], false) : null;
    if (!track) return { lead: null, track: null, s: 0, end };
    const at = nearestOnTrack(track, f.x, f.z);
    trackAt(track, at, pt);
    return { lead: { x: pt.x, y: pt.y, z: pt.z }, track, s: at, end };
  };

  /** Along the leg at `speed`; true once there. */
  const walk = (m: Man, dt: number, speed: number): boolean => {
    const leg = m.leg;
    if (!leg) return true;
    let go = speed * dt;
    const f = m.fig;
    if (leg.lead) {
      const dx = leg.lead.x - f.x, dz = leg.lead.z - f.z, d = Math.hypot(dx, dz);
      const step = Math.min(go, d);
      if (d > 1e-4) {
        f.x += (dx / d) * step;
        f.z += (dz / d) * step;
        f.y += (leg.lead.y - f.y) * Math.min(1, step / d);
        f.heading = Math.atan2(dx, dz);
      }
      m.walked += step;
      go -= step;
      if (step >= d) leg.lead = null;
      if (go <= 0) return false;
    }
    if (leg.track && leg.s < leg.track.length) {
      const step = Math.min(go, leg.track.length - leg.s);
      leg.s += step;
      go -= step;
      trackAt(leg.track, leg.s, pt);
      f.x = pt.x;
      f.y = pt.y;
      f.z = pt.z;
      f.heading = Math.atan2(pt.dx, pt.dz);
      m.node = pt.node;
      m.walked += step;
      if (go <= 0) return false;
    }
    const dx = leg.end.x - f.x, dz = leg.end.z - f.z, d = Math.hypot(dx, dz);
    if (d <= go || d < 1e-4) {
      f.x = leg.end.x;
      f.z = leg.end.z;
      f.y = leg.end.y;
      m.walked += d;
      return true;
    }
    f.x += (dx / d) * go;
    f.z += (dz / d) * go;
    f.y += (leg.end.y - f.y) * Math.min(1, go / d);
    f.heading = Math.atan2(dx, dz);
    m.walked += go;
    return false;
  };

  const missing = (s: Sally, m: Man): boolean => m !== s.rider && !!crittersOf(stage).get(`${s.g.key}-soldier${m.i}`)?.body;

  /** A raider a soldier may go for now. */
  const free = (raid: Raid, r: Raider): boolean => {
    const p = r.person;
    if (!p || r.where !== 'ashore' || r.routed || r.beaten || raid.pinned.has(r) || !p.visible || p.inCloud || p.scuffle) return false;
    if (p.mode !== 'walk' && p.mode !== 'linger') return false;
    return p.goal?.errand?.tag !== 'raid:dazed';
  };

  /** The place in the column on the way out of soldier i, `head` being its front. */
  const slot = (path: Track, head: number, i: number): { x: number; y: number; z: number; heading: number; node: number } => {
    const row = i >> 1, file = i & 1 ? 1 : -1;
    trackAt(path, Math.max(0, head - row * GARRISON.spacing), pt);
    const w = GARRISON.file * 1.3 * file;
    return { x: pt.x - pt.dz * w, y: pt.y, z: pt.z + pt.dx * w, heading: Math.atan2(pt.dx, pt.dz), node: pt.node };
  };

  /** Starts one: the garrison against this raid, if it can reach the landing on foot. */
  const begin = (board: Board, g: GarrisonView, raid: Raid): boolean => {
    const nav = board.nav, gate = g.castle.gate, troop = g.troop;
    if (!nav || !gate || !troop) return false;
    const r = routerFor(board);
    const landing = raid.site.landings[0]!;
    const route = r ? (outdoorRoute(nav, r, gate.node, landing.node) ?? r.find(gate.node, landing.node)) : null;
    const path = route && route.nodes.length > 1 ? trackOf(nav, [route], false) : null;
    if (!path) return false;
    const span = ((troop.soldiers.length - 1) >> 1) * GARRISON.spacing;
    const head = Math.min(path.length, span + 0.3);
    const men: Man[] = troop.soldiers.map((sd, i) => {
      const to = slot(path, head, i);
      const fig: OutFigure = { x: sd.x, y: sd.y, z: sd.z, heading: sd.heading, pose: 'run', stride: 0, hidden: false };
      const m: Man = { i, fig, node: sd.node, leg: null, state: 'go', foe: null, t: 0, look: 0, walked: 0 };
      m.leg = legTo(board, m, to.node, to);
      return m;
    });
    let rider: Man | null = null;
    if (g.ride) {
      const rd = g.ride;
      trackAt(path, Math.min(path.length, head + 1.1), pt);
      const fig: OutFigure = { x: rd.x, y: rd.y, z: rd.z, heading: rd.heading, pose: 'run', stride: 0, hidden: false };
      const to = { x: pt.x, y: pt.y, z: pt.z }, toNode = pt.node;
      rider = { i: -1, fig, node: rd.node, leg: null, state: 'go', foe: null, t: 0, look: 0, walked: 0 };
      rider.leg = legTo(board, rider, toNode, to);
    }
    g.out = { soldiers: men.map((m) => m.fig), rider: rider?.fig ?? null };
    const sally: Sally = { g, raid, phase: 'form', t: 0, path, head, men, rider, brawls: [], won: 0, lost: 0, banner: own.stage.spawnMesh(bannerMesh(g.colour), HIDDEN), scene: null };
    list.push(sally);
    count++;
    // The note (it takes the place of the raid's while they march out; Watch follows the column).
    sally.scene = scenesOf(board).begin({
      kind: 'raid',
      title: phrase("The castle's garrison marches out to meet the raiders!"),
      big: true,
      focus: () => {
        const f = (sally.men.find((m) => !m.fig.hidden) ?? sally.men[0]!).fig;
        return { x: f.x, y: f.y, z: f.z };
      },
      noteworthy: () => true,
      gathering: () => list.includes(sally),
      urgent: true,
    });
    // The alarm from the castle.
    const gc = board.centre(nav.nodes[gate.node]!.cell);
    sound({ type: 'bell', x: gc.x, z: gc.z });
    return true;
  };

  /** Home: each back to his place in the round. */
  const goHome = (board: Board, s: Sally): void => {
    if (s.phase === 'home') return;
    s.phase = 'home';
    s.t = 0;
    for (const b of s.brawls) endBrawl(board, s, b, true);
    s.brawls.length = 0;
    const troop = s.g.troop!;
    for (const m of s.men) {
      const sd = troop.soldiers[m.i]!;
      m.state = 'go';
      m.fig.hidden = false;
      m.leg = legTo(board, m, sd.node, { x: sd.x, y: sd.y, z: sd.z });
    }
    if (s.rider && s.g.ride) {
      const rd = s.g.ride;
      s.rider.state = 'go';
      s.rider.leg = legTo(board, s.rider, rd.node, { x: rd.x, y: rd.y, z: rd.z });
    }
  };

  /** All back in their places: the round carries on; the garrison rests a while. */
  const finish = (s: Sally, rest: boolean): void => {
    for (const b of s.brawls) if (b.r.person) b.r.person.inCloud = false;
    s.brawls.length = 0;
    // Hidden now, let go next frame (nothing goes while it is drawn).
    if (s.banner) {
      s.banner.setVisible(false);
      later.push(s.banner);
    }
    s.banner = null;
    if (s.scene && raids.board) scenesOf(raids.board).end(s.scene);
    s.scene = null;
    s.g.out = null;
    list.splice(list.indexOf(s), 1);
    if (rest) resting.set(s.g.key, now + RAID.garrisonRest);
    // The last one in: the drawings let go (nothing of it left).
    hideArt();
    if (list.length === 0) {
      later.push(...clouds, ...pops, ...stars);
      clouds.length = pops.length = stars.length = 0;
    }
  };

  const endBrawl = (board: Board, s: Sally, b: Brawl, quiet = false): void => {
    // Quietly (called home, called off): nobody loses; the raider carries on.
    const soldiersWin = quiet ? false : b.win;
    s.raid.unpin(b.r, soldiersWin, board);
    for (const m of b.men) {
      m.fig.hidden = false;
      m.t = 0;
      m.foe = null;
      if (quiet) m.state = 'stand';
      else if (soldiersWin) {
        // A cheer, and on to the next.
        m.state = 'engage';
        m.look = 0.6;
        m.fig.pose = 'cheer';
      } else {
        m.state = 'dazed';
        m.fig.pose = 'sit';
      }
    }
    if (!quiet) {
      if (soldiersWin) s.won++;
      else s.lost++;
    }
  };

  /** One soldier's turn in the fight. */
  const fight = (board: Board, s: Sally, m: Man, dt: number): void => {
    const raid = s.raid;
    const f = m.fig;
    if (m.state === 'dazed') {
      f.pose = 'sit';
      f.stride = now;
      if (m.t > RAID.dazed) {
        // Off back to the gate.
        m.state = 'back';
        m.t = 0;
        const gate = s.g.castle.gate!;
        const gc = board.centre(board.nav!.nodes[gate.node]!.cell);
        m.leg = legTo(board, m, gate.node, { x: gc.x + gate.dx * 0.4, y: f.y, z: gc.z + gate.dz * 0.4 });
      }
      return;
    }
    if (m.state === 'back') {
      f.pose = walk(m, dt, RAID.sallyRun) ? 'stand' : 'run';
      f.stride = m.walked * PERSON.stepsPerCell * 0.5;
      return;
    }
    if (m.state === 'brawl') return;
    if (m.state !== 'engage') {
      m.state = 'engage';
      m.look = 0;
    }
    // A foe: the nearest raider of this band nobody (or only one other) has, reachable on foot.
    m.look -= dt;
    const foe = m.foe;
    if (foe && (!free(raid, foe) && !raid.pinned.has(foe))) m.foe = null;
    if (!m.foe && m.look <= 0) {
      m.look = 1;
      let best: Raider | null = null, bd = 14;
      for (const r of raid.raiders) {
        if (!free(raid, r) && !(raid.pinned.has(r) && s.brawls.some((b) => b.r === r && b.men.length === 1))) continue;
        const takers = s.men.filter((o) => o !== m && o.foe === r).length;
        if (takers >= 2) continue;
        const p = r.person!;
        const d = Math.hypot(p.x - f.x, p.z - f.z) + takers * 2;
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
      m.foe = best;
      if (best) m.leg = legTo(board, m, best.person!.node, { x: best.person!.x, y: best.person!.y, z: best.person!.z });
    } else if (m.foe && m.look <= 0) {
      // He moved: after him again.
      m.look = 1;
      const p = m.foe.person!;
      m.leg = legTo(board, m, p.node, { x: p.x, y: p.y, z: p.z });
    }
    if (!m.foe) {
      // Nobody to go for: stand with the others, pike up.
      f.pose = m.t < 0.6 ? f.pose : 'stand';
      return;
    }
    const p = m.foe.person!;
    if (m.leg) m.leg.end = { x: p.x, y: p.y, z: p.z };
    walk(m, dt, RAID.sallyRun);
    f.pose = 'run';
    f.stride = m.walked * PERSON.stepsPerCell * 0.5;
    if (Math.hypot(p.x - f.x, p.z - f.z) < 0.6 && Math.abs(p.y - f.y) < 0.5) {
      // At him: into the dust (a second soldier joins one already at it).
      const on = s.brawls.find((b) => b.r === m.foe);
      if (on) {
        if (on.men.length < 2) {
          on.men.push(m);
          on.win = on.win || rand(on.seed, 'two') < 0.85;
          m.state = 'brawl';
          f.hidden = true;
        }
        return;
      }
      if (!raid.pin(m.foe, board)) {
        m.foe = null;
        return;
      }
      const seed = (count * 977 + s.won * 31 + s.lost * 7 + m.i) | 0;
      s.brawls.push({ men: [m], r: m.foe, t: 0, dur: RAID.brawlMin + rand(seed, 'dur') * (RAID.brawlMax - RAID.brawlMin), win: rand(seed, 'win') < RAID.soldierWins, x: (p.x + f.x) / 2, y: p.y, z: (p.z + f.z) / 2, seed });
      m.state = 'brawl';
      f.hidden = true;
      sound({ type: 'cry', x: p.x, z: p.z });
    }
  };

  /** What the band needs beaten to break: a share of it, at least three. */
  const breaksAt = (raid: Raid): number => Math.max(3, Math.ceil(raid.raiders.length * RAID.breaks));

  const stepSally = (board: Board, s: Sally, dt: number): void => {
    s.t += dt;
    const raid = s.raid;
    const live = raids.list.includes(raid) && !raid.ended;
    // The raid over some other way (its ship sunk and the band swum off, or gone): home.
    if (s.phase !== 'home' && (!live || raid.beat === 'done')) goHome(board, s);
    const troop = s.g.troop!;
    switch (s.phase) {
      case 'form': {
        let all = true;
        for (const m of s.men) {
          if (missing(s, m)) continue;
          if (m.state === 'go') {
            if (walk(m, dt, RAID.sallyRun)) {
              m.state = 'ready';
              m.fig.heading = slot(s.path, s.head, m.i).heading;
            } else all = false;
          }
          m.fig.pose = m.state === 'go' ? 'run' : 'stand';
          m.fig.stride = m.walked * PERSON.stepsPerCell * 0.5;
        }
        if (s.rider) {
          if (s.rider.state === 'go' && walk(s.rider, dt, RAID.sallyRun)) s.rider.state = 'ready';
          s.rider.fig.pose = s.rider.state === 'go' ? 'run' : 'stand';
          s.rider.fig.stride += dt * 3;
          if (s.rider.state === 'go') all = false;
        }
        // Half of them formed up (the rest are coming at a run and fall in on the march), or long enough.
        const formed = s.men.filter((m) => m.state === 'ready').length;
        if (all || formed * 2 >= s.men.length || s.t > 10) {
          s.phase = 'march';
          s.t = 0;
          for (const m of s.men) if (m.state === 'ready') m.state = 'stand';
          if (s.rider?.state === 'ready') s.rider.state = 'stand';
        }
        break;
      }
      case 'march': {
        // At the double, in step, pikes up; the rider a horse's length ahead.
        s.head = Math.min(s.path.length, s.head + RAID.sallyMarch * dt);
        for (const m of s.men) {
          if (missing(s, m)) continue;
          const to = slot(s.path, s.head, m.i);
          if (m.state === 'go') {
            // Still coming: running after his place in the column, falling in when he reaches it.
            if (m.leg) m.leg.end = to;
            if (walk(m, dt, RAID.sallyRun) || Math.hypot(to.x - m.fig.x, to.z - m.fig.z) < 0.15) m.state = 'stand';
            m.fig.pose = 'run';
            m.fig.stride = m.walked * PERSON.stepsPerCell * 0.5;
            continue;
          }
          m.fig.x = to.x;
          m.fig.y = to.y;
          m.fig.z = to.z;
          m.fig.heading = to.heading;
          m.node = to.node;
          m.fig.pose = 'run';
          m.fig.stride = s.head * PERSON.stepsPerCell * 0.5;
        }
        if (s.rider && s.rider.state === 'go') {
          trackAt(s.path, Math.min(s.path.length, s.head + 1.1), pt);
          if (s.rider.leg) s.rider.leg.end = { x: pt.x, y: pt.y, z: pt.z };
          if (walk(s.rider, dt, RAID.sallyRun * 1.3) || Math.hypot(pt.x - s.rider.fig.x, pt.z - s.rider.fig.z) < 0.15) s.rider.state = 'stand';
          s.rider.fig.pose = 'run';
          s.rider.fig.stride += dt * 3;
        } else if (s.rider) {
          trackAt(s.path, Math.min(s.path.length, s.head + 1.1), pt);
          const f = s.rider.fig;
          f.x = pt.x;
          f.y = pt.y;
          f.z = pt.z;
          f.heading = Math.atan2(pt.dx, pt.dz);
          s.rider.node = pt.node;
          f.pose = s.head < s.path.length ? 'run' : 'stand';
          f.stride += dt * 3;
        }
        // The band in reach of the head of the column, or the column at the landing: at them.
        trackAt(s.path, s.head, pt);
        const near = raid.raiders.some((r) => free(raid, r) && Math.hypot(r.person!.x - pt.x, r.person!.z - pt.z) < 4);
        if (near || s.head >= s.path.length) {
          s.phase = 'fight';
          s.t = 0;
          for (const m of s.men) {
            m.state = 'engage';
            m.look = 0;
            m.leg = null;
          }
          if (s.rider) s.rider.fig.pose = 'stand';
        }
        break;
      }
      case 'fight': {
        for (const m of s.men) {
          m.t += dt;
          if (missing(s, m)) continue;
          fight(board, s, m, dt);
        }
        for (let k = s.brawls.length - 1; k >= 0; k--) {
          const b = s.brawls[k]!;
          b.t += dt;
          // A soldier blown out of it, or the raider gone: it is over, nobody beaten.
          if (!b.r.person || b.r.where !== 'ashore' || b.men.every((m) => missing(s, m))) {
            endBrawl(board, s, b, true);
            s.brawls.splice(k, 1);
          } else if (b.t >= b.dur) {
            endBrawl(board, s, b);
            s.brawls.splice(k, 1);
          }
        }
        // Enough of them beaten: the band breaks (the horn, back to the ship, leaving it all).
        if (!raid.repelled && raid.beatenCount >= breaksAt(raid)) raid.repel(board);
        // Nobody left to fight (broken, or all back aboard): see them off.
        const anyone = raid.raiders.some((r) => free(raid, r) && !raid.repelled);
        if ((raid.repelled || raid.stranded || (!anyone && s.t > 4)) && s.brawls.length === 0) seeOff(board, s);
        break;
      }
      case 'seeoff': {
        for (const m of s.men) {
          m.t += dt;
          if (missing(s, m)) continue;
          if (m.state === 'dazed' || m.state === 'back') {
            fight(board, s, m, dt);
            continue;
          }
          if (m.state === 'go') {
            m.fig.pose = walk(m, dt, RAID.sallyRun) ? 'stand' : 'run';
            m.fig.stride = m.walked * PERSON.stepsPerCell * 0.5;
            if (m.fig.pose === 'stand') {
              m.state = 'stand';
              m.t = 0;
            }
          } else {
            // Facing the sea, pikes raised, cheering them off now and then.
            const l = raid.site.landings[0]!;
            m.fig.heading = Math.atan2(l.ox, l.oz);
            m.fig.pose = (m.t + m.i * 0.7) % 4 < 2.2 ? 'cheer' : 'stand';
            m.fig.stride = now;
          }
        }
        if (s.rider) s.rider.fig.pose = 'stand';
        // The ship away (or gone some other way), or long enough: home.
        if ((raid.beat === 'away' && s.t > 8) || raid.beat === 'done' || s.t > 45) goHome(board, s);
        break;
      }
      case 'home': {
        let all = true;
        for (const m of s.men) {
          if (missing(s, m)) continue;
          if (m.state !== 'ready') {
            if (walk(m, dt, RAID.sallyMarch)) {
              m.state = 'ready';
              m.fig.heading = troop.soldiers[m.i]!.heading;
            } else all = false;
          }
          m.fig.pose = m.state === 'ready' ? 'stand' : 'walk';
          m.fig.stride = m.walked * PERSON.stepsPerCell * 0.5;
        }
        if (s.rider) {
          if (s.rider.state !== 'ready' && walk(s.rider, dt, RAID.sallyMarch)) s.rider.state = 'ready';
          if (s.rider.state !== 'ready') all = false;
          s.rider.fig.pose = s.rider.state === 'ready' ? 'stand' : 'run';
          s.rider.fig.stride += dt * 2;
        }
        // Everybody in place (or a long while: those still out are put back).
        if (all || s.t > 90) finish(s, true);
        break;
      }
    }
  };

  const seeOff = (board: Board, s: Sally): void => {
    s.phase = 'seeoff';
    s.t = 0;
    const l = s.raid.site.landings[0]!;
    const spots = l.near.length > 0 ? l.near : [l];
    s.men.forEach((m, k) => {
      m.foe = null;
      if (m.state === 'dazed' || m.state === 'back') return;
      const at = spots[k % spots.length]!;
      const c = board.centre(at.cell);
      const side = ((k >> 1) - 1) * 0.25;
      m.state = 'go';
      m.leg = legTo(board, m, at.node, { x: c.x - at.ox * 0.3 - at.oz * side, y: at.y, z: c.z - at.oz * 0.3 + at.ox * side });
    });
  };

  const hideArt = (): void => {
    for (const h of [...clouds, ...pops, ...stars]) h.setVisible(false);
  };

  const m4 = (x: number, y: number, z: number, yaw: number, sc: number): Mat4Like => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    return [c * sc, 0, -sn * sc, 0, 0, sc, 0, 0, sn * sc, 0, c * sc, 0, x, y, z, 1];
  };

  /** The clouds, their pop-outs and the dizzy stars, on twos. */
  const draw = (seconds: number): void => {
    meshes ??= { clouds: [0, 1, 2].map((v) => cloudMesh(v, SCUFFLE.cloudR, SCUFFLE.cloudH)), pops: POPS.map((k) => popMesh(k)), star: dazeStarMesh() };
    const tick = Math.floor(seconds * SCUFFLE.drawRate);
    let nc = 0, np = 0, ns = 0;
    const star = (x: number, y: number, z: number, k: number): void => {
      for (let j = 0; j < 3; j++) {
        const h = take(stars, ns++, () => meshes!.star);
        const a = tick * 0.55 + j * ((Math.PI * 2) / 3) + k;
        h.setVisible(true);
        h.setMatrix(m4(x + Math.cos(a) * 0.1, y + Math.sin(a * 2) * 0.012, z + Math.sin(a) * 0.1, -a, 1));
      }
    };
    for (const s of list) {
      // The banner with the first soldier on his feet (the standard-bearer), held up beside him.
      const bearer = s.men.find((m) => !m.fig.hidden && m.state !== 'dazed' && !missing(s, m));
      if (s.banner) {
        s.banner.setVisible(!!bearer);
        if (bearer) {
          const f = bearer.fig;
          const side = 0.13, c = Math.cos(f.heading), sn = Math.sin(f.heading);
          const lift = f.pose === 'cheer' ? 0.12 + (tick % 2) * 0.04 : 0;
          // Big enough to pick out from across the town (a standard, not a hand flag).
          s.banner.setMatrix(m4(f.x - c * side, f.y + 0.05 + lift, f.z + sn * side, f.heading + Math.PI / 2, 1.5));
        }
      }
      for (const b of s.brawls) {
        const h = take(clouds, nc, (k) => meshes!.clouds[k % 3]!);
        nc++;
        const grow = Math.min(1, b.t / 0.18);
        const sc = (grow < 1 ? 0.4 + grow * 0.75 : 1 + 0.06 * Math.sin(tick * 2.1)) * (b.men.length > 1 ? 1.2 : 1);
        const roll = Math.sin(b.t * 1.6 + (b.seed % 7)) * SCUFFLE.roll;
        h.setVisible(true);
        h.setMatrix(m4(b.x + roll, b.y + Math.abs(Math.sin(tick * 1.7) * 0.04), b.z, tick * 0.9 + (b.seed % 10), sc));
        for (let j = 0; j < 2; j++) {
          if (rand(b.seed, 'pop', j, tick) > 0.6 || b.t < 0.25) continue;
          const kind = Math.floor(rand(b.seed, 'kind', j, tick) * POPS.length);
          const ph = take(pops, np, () => meshes!.pops[kind]!);
          np++;
          const ang = rand(b.seed, 'a', j, tick) * Math.PI * 2;
          ph.setVisible(true);
          ph.setMatrix(m4(b.x + Math.cos(ang) * SCUFFLE.cloudR, b.y + 0.08 + rand(b.seed, 'y', j, tick) * SCUFFLE.cloudH * 0.8, b.z + Math.sin(ang) * SCUFFLE.cloudR, tick * 0.7, 1.7));
        }
      }
      for (const m of s.men) if (m.state === 'dazed') star(m.fig.x, m.fig.y + 0.34, m.fig.z, m.i);
      for (const r of s.raid.raiders) {
        const p = r.person;
        if (p && p.visible && p.goal?.errand?.tag === 'raid:dazed') star(p.x, p.y + 0.34, p.z, r.i);
      }
    }
    for (let k = nc; k < clouds.length; k++) clouds[k]!.setVisible(false);
    for (let k = np; k < pops.length; k++) pops[k]!.setVisible(false);
    for (let k = ns; k < stars.length; k++) stars[k]!.setVisible(false);
  };

  return {
    view,
    /** Every frame: garrisons turn out against raids sighted, and those out go on. */
    step(dt: number, seconds: number): void {
      now += dt;
      for (const h of later.splice(0)) h.release();
      const board = raids.board;
      for (const [k, until] of resting) if (now >= until) resting.delete(k);
      const garrisons = garrisonsOf(stage);
      // A garrison gone (the town changed under it): its sally with it.
      for (const s of [...list]) if (!garrisons.includes(s.g)) list.splice(list.indexOf(s), 1);
      if (!board?.nav) return;
      // Ready garrisons go for the first raid sighted they can reach on foot (not one another is out against).
      if (RAID.sally > 0) for (const g of garrisons) {
        if (!g.troop || !g.castle.gate || g.out || resting.has(g.key) || list.some((s) => s.g === g)) continue;
        for (const raid of raids.list) {
          if (raid.ended || raid.repelled || raid.stranded || list.some((s) => s.raid === raid)) continue;
          if (raid.beat !== 'sighted' && raid.beat !== 'landing' && raid.beat !== 'ashore') continue;
          if (raid.beat === 'sighted' && raid.age < 2) continue;
          if (begin(board, g, raid)) break;
        }
      }
      for (const s of [...list]) stepSally(board, s, dt);
      if (list.length > 0) draw(seconds);
    },
    /** Undo, a new town: everybody straight back in their places in the round, nothing left drawn. */
    reset(): void {
      for (const s of [...list]) finish(s, false);
      resting.clear();
    },
    dispose(): void {
      for (const s of [...list]) finish(s, false);
      for (const h of later.splice(0)) h.release();
      for (const h of [...clouds, ...pops, ...stars]) h.release();
      clouds.length = pops.length = stars.length = 0;
    },
  };
}
