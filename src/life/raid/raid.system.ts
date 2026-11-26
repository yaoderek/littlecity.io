// The raid, run and drawn (design section 13b). Owner: the raid.
//
// Plans a raid when one is summoned (the Raid tool, or on its own when the
// menu's switch allows), steps its ships and its raiders at sea, draws the
// war cries over the band ashore and the flames on a burning longship, and
// hears the player's mischief: a blast or a bolt of lightning on a ship.
// Ends it when it is over, or at once when undo, a new town or growing one
// calls everything off (the director's 'reset').

import { phrase } from '@/core/phrase';
import { columnIndex, keyY, SEA_Y, SIZE_X, SIZE_Z } from '@/core/grid';
import type { Mat4Like } from '@/core/mat4';
import { hash, rand } from '@/core/rand';
import { KINDS } from '@/core/kinds';
import type { MeshData } from '@/gen/mesh';
import { cryMesh } from '@/parts/raid/cry';
import { BLAST } from '@/style/damage';
import { RAID } from '@/style/raid';
import { defineSystem, type InstanceHandle, type LifeStage } from '../api';
import { fxOf } from '../fx/fx';
import { NUKE, mischiefOf, type Director, type MischiefEvent } from '../mischief/director';
import { flameMesh } from '../mischief/meshes';
import { ownStage, type Owned } from '../mischief/owned';
import { place } from '../motion/pose';
import { harbourOf } from '../ships/visit';
import { scenesOf } from '../town/scenes';
import { Raid } from './raid';
import { createSallies } from './sally';
import { raidsOf, type Raids, type Summon } from './raids';
import { planRaid, raidField } from './site';
import { raiderScale } from './far';

const HIDDEN: Mat4Like = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -60, 0, 1];

interface State {
  own: Owned;
  stage: LifeStage;
  raids: Raids;
  d: Director;
  off: () => void;
  /** Life seconds. */
  now: number;
  /** A nuke's hit on the ships waits for its shockwave. */
  pending: { at: number; x: number; z: number; power: number }[];
  /** War cries over raiders ashore. */
  cries: Map<number, InstanceHandle>;
  cryMeshes: MeshData[];
  flames: InstanceHandle[];
  smokeAcc: number;
  /** Raids over and hidden this frame: let go next frame. */
  hidden: Set<Raid>;
  /** Seconds of play with this town shown (for raids on their own). */
  played: number;
  /** The castles' garrisons turning out against raids (sally.ts). */
  sallies: ReturnType<typeof createSallies>;
  /** The next raid on its own may come at this many seconds of play. */
  nextAuto: number | null;
}

/** Which way the camera looks (the app's view), to turn a war cry to it; the default view where there is none. */
function cameraAngles(): { yaw: number; pitch: number } {
  type Angles = { yaw: number; pitch: number };
  const view = (globalThis as { __lc?: { view?: { getCamera?(): Angles; getEyeCamera?(): Angles | null } } }).__lc?.view;
  const deg = Math.PI / 180;
  const e = view?.getEyeCamera?.();
  if (e) return { yaw: e.yaw * deg, pitch: -e.pitch * deg };
  const c = view?.getCamera?.();
  return c ? { yaw: c.yaw * deg, pitch: c.pitch * deg } : { yaw: 45 * deg, pitch: 35 * deg };
}
function balloonScale(): number {
  const view = (globalThis as { __lc?: { view?: { getCamera?(): { zoom: number }; getEyeCamera?(): unknown } } }).__lc?.view;
  if (!view?.getCamera || view.getEyeCamera?.()) return 1;
  const z = view.getCamera().zoom;
  return 1.15 + 0.9 * Math.max(0, Math.min(1, (6 - z) / (6 - 1.6)));
}
function facingCamera(x: number, y: number, z: number, cam: { yaw: number; pitch: number }, sc: number): Mat4Like {
  const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw), ct = Math.cos(cam.pitch), st = Math.sin(cam.pitch);
  return [c * sc, 0, -sn * sc, 0, -sn * st * sc, ct * sc, -c * st * sc, 0, sn * ct * sc, st * sc, c * ct * sc, 0, x, y, z, 1];
}

/** The columns under the big ships in the harbour now (a raid's ships keep clear of them). */
function harbourColumns(stage: Parameters<typeof harbourOf>[0]): number[] {
  const h = harbourOf(stage);
  const out: number[] = [];
  for (const s of h?.ships ?? []) {
    if (s.phase === 'idle') continue;
    const sx = Math.sin(s.pose.yaw), cz = Math.cos(s.pose.yaw);
    for (let a = s.hull.stern; a <= s.hull.bow; a += 0.4) {
      for (const w of [-s.hull.halfBeam, 0, s.hull.halfBeam]) {
        const x = Math.floor(s.pose.x + sx * a + cz * w), z = Math.floor(s.pose.z + cz * a - sx * w);
        if (x >= 0 && z >= 0 && x < SIZE_X && z < SIZE_Z) out.push(columnIndex(x, z));
      }
    }
  }
  return out;
}

export default defineSystem<State>({
  id: 'raid',
  order: 26,
  create(ctx) {
    const own = ownStage(ctx.stage);
    const raids = raidsOf(ctx.stage);
    const d = mischiefOf(ctx.stage);
    const st: State = { own, stage: ctx.stage, raids, d, off: () => {}, now: 0, pending: [], cries: new Map(), cryMeshes: [], flames: [], smokeAcc: 0, hidden: new Set(), played: 0, nextAuto: null, sallies: createSallies(ctx.stage, own, raids, (e) => raids.emit(e.type === 'horn' ? { type: 'horn', x: e.x, z: e.z, long: e.long ?? false } : { type: e.type, x: e.x, z: e.z })) };
    raids.list = [];
    raids.start = (s: Summon) => start(st, s);
    raids.handles = () => own.live;
    const offD = d.on((e: MischiefEvent) => {
      if (e.type === 'reset') {
        // Undo while they are on, a new town, growing one: every raid ends now, nothing left; the garrison back in its round.
        st.sallies.reset();
        raids.end();
        clearDrawn(st);
        st.hidden.clear();
        st.d.threats = [];
        // Not straight back: the next on its own waits its full time.
        st.nextAuto = st.played + RAID.every + rand(raids.count, 'raid-every') * RAID.everySpread;
        return;
      }
      if (raids.list.length === 0) return;
      if (e.type === 'blast') {
        const [x, , z] = e.blast.point;
        if (e.nuke) st.pending.push({ at: st.now + 0.3, x, z, power: NUKE.power });
        else for (const raid of raids.list) raid.hit(x, z, BLAST.rubble * e.blast.power * 0.9 * 1.5, BLAST.wreck * e.blast.power * 1.2, BLAST.shake * e.blast.power);
      } else if (e.type === 'strike' && e.strike.cell === -1) {
        for (const raid of raids.list) if (raid.strike(e.strike.point[0], e.strike.point[2])) break;
      }
    });
    d.extraVessels = (x, z) => {
      for (const raid of raids.list) {
        const v = raid.vesselAt(x, z);
        if (v) return v;
      }
      return null;
    };
    st.off = () => {
      offD();
      if (d.extraVessels) d.extraVessels = null;
    };
    return st;
  },
  sync(st, next) {
    st.raids.shape = next.shape;
    if (next.dressing) st.raids.dressing = next.dressing;
  },
  update(st, dt, signals, ctx) {
    st.now += dt;
    st.played += dt;
    const raids = st.raids;
    // A nuke's shockwave reaches the ships.
    for (let i = st.pending.length - 1; i >= 0; i--) {
      const p = st.pending[i]!;
      if (st.now < p.at) continue;
      st.pending.splice(i, 1);
      for (const raid of raids.list) raid.hit(p.x, p.z, BLAST.rubble * p.power * 0.9, BLAST.wreck * p.power, BLAST.shake * p.power);
    }
    // The garrisons (before the raids are let go: a sally sees its raid end and marches home).
    st.sallies.step(dt, signals.time.seconds);
    if (raids.list.length > 0) {
      const threats: { x: number; z: number }[] = [];
      for (const raid of [...raids.list]) {
        if (st.hidden.has(raid)) {
          // Hidden last frame: let go now (nothing of it goes while it is drawn).
          st.hidden.delete(raid);
          for (const [k, h] of st.cries) {
            if (Math.floor(k / 1000) !== raid.n) continue;
            h.release();
            st.cries.delete(k);
          }
          raids.remove(raid);
          continue;
        }
        const w = signals.wind(raid.lead.x, raid.lead.z);
        raid.stepSea(dt, signals.time.seconds, w.strength);
        if (raid.beat === 'done') {
          raid.hideAll();
          for (const [k, h] of st.cries) if (Math.floor(k / 1000) === raid.n) h.setVisible(false);
          st.hidden.add(raid);
          continue;
        }
        for (const t of raid.threats()) threats.push(t);
      }
      st.d.threats = threats;
      const drawn = raids.list.filter((r) => !st.hidden.has(r));
      drawCries(st, drawn, signals.time.seconds);
      drawFlames(st, drawn, dt, signals.time.seconds);
      if (raids.list.length === 0) {
        clearDrawn(st);
        st.d.threats = [];
        st.d.hold('raid', false);
        st.nextAuto = st.played + RAID.every + rand(raids.count, 'raid-every') * RAID.everySpread;
      }
    } else autoRaid(st, signals.time.isNight);
    void ctx;
  },
  dispose(st) {
    st.sallies.dispose();
    for (const raid of st.raids.list) raid.end(null);
    st.raids.list = [];
    st.raids.start = null;
    st.raids.board = null;
    st.off();
    st.own.releaseAll();
  },
});

function start(st: State, s: Summon): string | null {
  const raids = st.raids;
  const shape = raids.shape, dressing = raids.dressing;
  if (!shape || !dressing) return phrase('the town is not ready yet');
  let buildings = 0;
  for (const [c, k] of shape.kinds) if (KINDS[k as keyof typeof KINDS]?.building && keyY(c) <= 3) buildings++;
  if (buildings < 3) return 'there is no town here to raid';
  const seed = hash(shape.world.seed, 'raid', raids.count + 1, Math.floor(st.now));
  // Clear of the harbour's ships and of the other raids' (where they are, and where they lie on the beach).
  const extra = [...harbourColumns(st.own.stage), ...raidColumns(raids.list)];
  const avoid = raids.list.flatMap((r) => r.site.landings.map((l) => ({ x: l.x, z: l.z })));
  const site = planRaid(shape, dressing.nav, seed, { ...(s.kind ? { kind: s.kind } : {}), near: s.at, extra, avoid });
  if (!site) return 'no ship can reach a shore near the town';
  // A ceiling on raiders alive at once (every click brings another party): past it, a token crew.
  let alive = 0;
  for (const r of raids.list) for (const x of r.raiders) if (x.where !== 'lost') alive++;
  const ceiling = phone() ? RAID.ceilingPhone : RAID.ceiling;
  // Well past it (a storm of clicks): the chief alone, standard up, so the ship still comes.
  const most = alive >= ceiling * 1.5 ? 1 : Math.max(RAID.tokenCrew, ceiling - alive);
  // Buildings are counted by structure for the band's size.
  const structures = new Set<number>();
  for (const [c, k] of shape.kinds) if (KINDS[k as keyof typeof KINDS]?.building) structures.add(shape.structureAt.get(c) ?? -1);
  const raid: Raid = new Raid(
    {
      own: st.own,
      stage: st.stage,
      director: st.d,
      sound: (e) => raids.emit(e),
      others: () => raids.list.filter((r) => r !== raid).flatMap((r) => r.vessels.map((v) => ({ n: r.n, v }))),
      claimed: raids.claimed,
      looted: raids.looted,
      most,
    },
    site,
    seed,
    structures.size,
  );
  const field = raidField(shape, harbourColumns(st.own.stage));
  raid.field = (x, z) => field.at(x, z);
  raids.list.push(raid);
  raids.count++;
  raids.lastAt = st.now;
  st.d.hold('raid', true);
  // The horn from the ship (or the first boat) as it comes over the edge.
  raids.emit({ type: 'horn', x: raid.lead.x, z: raid.lead.z, long: false });
  return null;
}

/** The columns under the other raids' vessels now, and under a longship's place on its beach. */
function raidColumns(list: readonly Raid[]): number[] {
  const out: number[] = [];
  const hull = (x: number, z: number, yaw: number, stern: number, bow: number, half: number): void => {
    const sx = Math.sin(yaw), cz = Math.cos(yaw);
    for (let a = stern; a <= bow; a += 0.4) {
      for (const w of [-half, 0, half]) {
        const cx = Math.floor(x + sx * a + cz * w), cz2 = Math.floor(z + cz * a - sx * w);
        if (cx >= 0 && cz2 >= 0 && cx < SIZE_X && cz2 < SIZE_Z) out.push(columnIndex(cx, cz2));
      }
    }
  };
  for (const r of list) {
    for (const v of r.vessels) if (v.sink < 0.5 && !v.aground) hull(v.x, v.z, v.yaw, v.hull.stern, v.hull.bow, v.hull.halfBeam);
    const b = r.site.beached;
    if (b) hull(b.x, b.z, b.yaw, r.site.hull.stern, r.site.hull.bow, r.site.hull.halfBeam);
  }
  return out;
}

/** True on a phone-sized viewport (the crowd's test, src/life/people/people.system.ts). */
function phone(): boolean {
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  return typeof g.innerWidth === 'number' && typeof g.innerHeight === 'number' && Math.min(g.innerWidth, g.innerHeight) < 600;
}

/** Raids on their own (the menu's switch): rarely, on a town worth raiding, never in its first minutes, at a wedding, or at night. */
function autoRaid(st: State, night: boolean): void {
  const raids = st.raids;
  if (!raids.auto || st.played < (st.nextAuto ?? RAID.first) || night) return;
  const board = raids.board, shape = raids.shape;
  if (!board || !shape) return;
  // Wait for a quiet moment: no wedding gathering, nothing else big starting, no mischief going on.
  // Never at a wedding (gathering or under way), never on top of two other big scenes, never in the middle of mischief.
  const on = scenesOf(board).on;
  if (on.some((s) => s.kind === 'wedding') || on.filter((s) => s.big).length >= 2 || st.d.active) {
    raids.why = 'waiting for a quiet moment';
    return;
  }
  let buildings = 0;
  const seen = new Set<number>();
  for (const [c, k] of shape.kinds) {
    if (!KINDS[k as keyof typeof KINDS]?.building) continue;
    const sid = shape.structureAt.get(c);
    if (sid === undefined || seen.has(sid)) continue;
    seen.add(sid);
    buildings++;
  }
  // A town mostly in ruins or under scaffolding is not worth a raid of its own (the tool still brings one).
  let wrecked = 0;
  for (const sid of seen) if (shape.structures.get(sid)?.cells.some((c) => shape.world.blocks.get(c)?.ruin)) wrecked++;
  if (wrecked > buildings * 0.4) {
    st.nextAuto = st.played + 90;
    return;
  }
  if (buildings < RAID.worth) {
    st.nextAuto = st.played + 60;
    return;
  }
  const why = start(st, { at: null, auto: true });
  raids.why = why ?? '';
  // No shore a ship can reach: look again in a while.
  if (why) st.nextAuto = st.played + 120;
}

function clearDrawn(st: State): void {
  for (const h of st.cries.values()) h.release();
  st.cries.clear();
  for (const h of st.flames) h.release();
  st.flames = [];
}

/** War cries over the bands ashore, one balloon to a knot of raiders (whichever party they are from). */
function drawCries(st: State, list: readonly Raid[], seconds: number): void {
  if (st.cryMeshes.length === 0) st.cryMeshes = [0, 1, 2].map((v) => cryMesh(v));
  const cam = cameraAngles();
  const k = balloonScale();
  const live = new Set<number>();
  const shown: { x: number; z: number }[] = [];
  for (const raid of list) for (const r of raid.raiders) {
    const p = r.person;
    if (!p || !p.visible || p.inCloud) continue;
    // A brand trails a little smoke as it is run through the streets.
    if (r.role === 'brand' && p.visible && Math.floor(seconds * 2.5 + r.i * 0.37) !== Math.floor((seconds - 1 / 60) * 2.5 + r.i * 0.37)) {
      const tx = p.x + Math.sin(p.heading) * 0.1, ty = p.y + 0.62 * raiderScale(), tz = p.z + Math.cos(p.heading) * 0.1;
      fxOf(st.stage).play({ actor: 'puff', variant: 'smoke' }, 1.3, (t, out) => place(tx, ty + t * 0.45, tz, 0, 0.05 + t * 0.12, 0.05 + t * 0.12, 0.05 + t * 0.12, out));
    }
    if (r.cry <= 0) continue;
    // One balloon to a knot of them: none within 1.3 cells of one already shown (a band landing all shouts,
    // and a heap of balloons reads as nothing).
    if (shown.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.3)) continue;
    // A few at once at most, however many parties are ashore (a sky of balloons reads as nothing).
    if (shown.length >= 6) continue;
    shown.push({ x: p.x, z: p.z });
    const id = raid.n * 1000 + r.i;
    live.add(id);
    let h = st.cries.get(id);
    if (!h) st.cries.set(id, (h = st.own.stage.spawnMesh(st.cryMeshes[r.i % 3]!, HIDDEN)));
    h.setVisible(true);
    // Over the head (the horns), jiggling on twos.
    const jig = Math.floor(seconds * 8) % 2 ? 0.012 : 0;
    h.setMatrix(facingCamera(p.x, p.y + 0.62 * raiderScale() + jig, p.z, cam, k));
  }
  // A cry over: hidden, kept for the next (one each raider at most).
  for (const [i, h] of st.cries) if (!live.has(i)) h.setVisible(false);
}

/** Flames on a burning longship or boat, and smoke off it, while it burns and goes down. */
function drawFlames(st: State, list: readonly Raid[], dt: number, seconds: number): void {
  const fires = list.flatMap((r) => r.fires).filter((f) => f.v.sink < 0.7).slice(0, 18);
  while (st.flames.length < fires.length) st.flames.push(st.own.stage.spawnMesh(flameMesh(st.flames.length % 3), HIDDEN));
  st.flames.forEach((h, i) => {
    const f = fires[i];
    if (!f) {
      h.setVisible(false);
      return;
    }
    const v = f.v;
    const m = v.m;
    const lx = f.side * v.hull.halfBeam * 0.3, ly = 0.25 * v.size, lz = f.along;
    const x = m[0]! * lx + m[4]! * ly + m[8]! * lz + m[12]!;
    const y = m[1]! * lx + m[5]! * ly + m[9]! * lz + m[13]!;
    const z = m[2]! * lx + m[6]! * ly + m[10]! * lz + m[14]!;
    const flick = 0.85 + 0.25 * (Math.floor(seconds * 7 + i) % 3) / 2;
    h.setVisible(y > SEA_Y - 0.1);
    h.setMatrix(place(x, y, z, v.yaw + i, 0.9 * v.size, 1.1 * flick * v.size, 0.9 * v.size));
  });
  if (fires.length === 0) return;
  st.smokeAcc += dt;
  if (st.smokeAcc < 0.35) return;
  st.smokeAcc = 0;
  const f = fires[Math.floor(seconds * 3) % fires.length]!;
  const v = f.v;
  const x = v.x + Math.sin(v.yaw) * f.along, z = v.z + Math.cos(v.yaw) * f.along;
  fxOf(st.stage).play({ actor: 'puff', variant: 'smoke' }, 2.2, (t, out) => place(x + t * 0.5, SEA_Y + 0.7 + t * 1.8, z + t * 0.2, 0, 0.4 + t * 0.9, 0.4 + t * 0.9, 0.4 + t * 0.9, out));
}
