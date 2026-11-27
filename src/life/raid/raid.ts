// A raid (design section 13b, the owner's barbarians): a longship of raiders
// comes out of the sea, the band storms ashore, sets fires, loots, and sails
// off with the town half alight, unless the player stops them.
//
// THE BEATS
//   sighted    the sail comes in over the edge of the map; a horn from the
//              ship; the bell rings in the town; somebody on the shore points
//   landing    a landing raid: the longship spins about off the beach under
//              oars and rows straight in, bow up onto the sand, and the band
//              jumps over the sides and wades ashore; a boats raid: the big
//              ship heaves to offshore and its boats row to their landings
//   ashore     a charge up the beach with a war cry; then the brands go to the
//              thatch and the timber, the axes and clubs kick in doors and come
//              out with sacks, chests, a ham, a pig; the loot piles up by the
//              boats. The town runs: indoors, away down the streets
//   recall     the chief blows his horn; they run back, take up the pile and
//              wade out to the ships
//   away       the ships back off, spin about and sail away, cut off at the
//              map's edge, the town alight behind them
//
// STOPPING THEM. The player's bombs, the nuke and lightning hit the ships as
// they hit any ship: scorched (the sail torn: it sails on), burning or broken
// (it goes down). A ship that goes down cannot carry the band: raiders still
// aboard swim off out to sea; raiders ashore are stranded, lose heart, are
// chased into the sea by the townspeople and swim away over the edge of the
// map, horns bobbing. A raid whose ship goes down before it lands never
// happens. The boats can be sunk one by one.
//
// WHO DRAWS WHAT. At sea the raid draws its raiders itself (figure.ts);
// ashore they are people of the crowd (ordinary walkers with the `raider`
// mark and a barbarian costume), sent about by the raid's chain on the
// board (chain.ts), so everything that moves people (a blast, the Hand)
// moves them as it does anybody. Everything the raid draws goes through an
// owned stage (mischief/owned.ts).
//
// UNDO AND SAFETY. A raid holds the mischief director's act open from the
// first sight of the sail to the last of it: one undo puts back every
// building it burnt, and undo while it is on ends it at once. A new town, a
// town opened, or growing one ends it with nothing left drawn or pending.
// Nothing of it is saved: its fires are ordinary saved damage that mends.

import { DIR4, key, keyX, keyY, keyZ, SEA_Y, type CellKey } from '@/core/grid';
import { rand } from '@/core/rand';
import type { Barbarian } from '@/parts/people/barbarian';
import { restingMesh, type Load } from '@/parts/people/loads';
import type { StructureId } from '@/resolve/plan';
import { pathAt } from '@/rules/life/ship-routes';
import { RAID } from '@/style/raid';
import { PEOPLE, PERSON } from '@/style/people';
import type { LifeStage, TimeSignal } from '../api';
import type { Person } from '../people/crowd';
import type { Board, Chain, Plan, PlanStep, Spot } from '../town/board';
import { DIR_HEADING } from '../town/board';
import { reaches } from '../town/hands';
import { critterPose, crittersOf } from '../mischief/critters';
import { fxOf } from '../fx/fx';
import type { Director } from '../mischief/director';
import { standsOf } from '../mischief/response';
import { angleDelta, clamp01, easeInOut } from '../motion/ease';
import { Figure, rowing } from './figure';
import type { Landing, RaidKind, RaidSite } from './site';
import { Vessel } from './vessel';
import { raiderScale } from './far';
import { place } from '../motion/pose';
import type { InstanceHandle } from '../api';

const HIDDEN_M = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -60, 0, 1];
import type { Owned } from '../mischief/owned';

export type Beat = 'sighted' | 'landing' | 'ashore' | 'recall' | 'away' | 'done';

export type RaidSound =
  | { type: 'horn'; x: number; z: number; long: boolean }
  | { type: 'cry'; x: number; z: number }
  | { type: 'bell'; x: number; z: number }
  | { type: 'splash'; x: number; z: number }
  | { type: 'crash'; x: number; z: number };

/** What a raider is for. */
export type Role = 'chief' | 'brand' | 'axe' | 'club';

/** Where a raider is. */
export type Where = 'aboard' | 'jump' | 'wade-in' | 'ashore' | 'wade-out' | 'climb' | 'swim' | 'home' | 'lost';

export interface Raider {
  readonly i: number;
  readonly costume: Barbarian;
  readonly look: number;
  readonly role: Role;
  /** The vessel they came in and go back in (0 the ship, 1… the boats), and their seat in it. */
  vessel: number;
  seat: number;
  /** Their landing (an index into the site's landings). */
  landing: number;
  where: Where;
  /** At sea: their drawing. Ashore: their person in the crowd. */
  fig: Figure | null;
  person: Person | null;
  /** The sea leg under way: from, to, seconds in, how long. */
  t: number;
  dur: number;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  /** What they carry back aboard. */
  carry: Load | null;
  /** Loot trips made, fires set. */
  trips: number;
  fires: number;
  /** The building they are seeing to now. */
  target: StructureId | null;
  /** Seconds until their next war cry is shown, and how long one shows. */
  cryIn: number;
  cry: number;
  /** Stranded and chased: running for the sea. */
  routed: boolean;
  /** The step they were last seen on, and for how long (a walk that gets nowhere is given up). */
  step: unknown;
  stepFor: number;
  /** The party they go through the town with (all but the chief), and whether they have got to its quarter yet. */
  party: number;
  there: boolean;
  /** Lost a brawl with the townspeople: running back to the boat. */
  beaten: boolean;
}

/** A building a raider sets alight or loots. */
interface Target {
  structure: StructureId;
  cell: CellKey;
  role: string;
  /** Taken by a raider now / done. */
  by: Raider | null;
  done: boolean;
  /** The quarter of the town it is in (a party's). */
  quarter: number;
  /** Damaged or being mended (scaffolding): kicked about, its builders' things carried off, not gone into. */
  site?: boolean;
}

const LOOT_BY_ROLE: Record<string, readonly Load[]> = {
  warehouse: ['barrel', 'sack', 'chest', 'crate', 'cloth'],
  shop: ['cloth', 'cheese', 'candlestick', 'ham', 'sack'],
  'bridge-shop': ['cloth', 'cheese', 'candlestick'],
  inn: ['barrel', 'ham', 'cheese'],
  chapel: ['candlestick', 'chest'],
  'town-hall': ['chest', 'candlestick'],
  manor: ['chest', 'candlestick', 'cloth'],
  barn: ['pig', 'hen', 'sack'],
  'mill-house': ['sack', 'sack', 'hen'],
  smithy: ['chest', 'crate'],
  'market-stall': ['cheese', 'ham', 'cloth', 'basket'],
  'fish-stall': ['fish', 'fishes'],
  'flower-stall': ['basket', 'bouquet'],
};
const LOOT_HOME: readonly Load[] = ['sack', 'ham', 'hen', 'cheese', 'pig', 'chest', 'barrel', 'candlestick', 'cloth'];

const facing = (from: { x: number; z: number }, to: { x: number; z: number }): number => Math.atan2(to.x - from.x, to.z - from.z);

export interface RaidHost {
  /** Draws through this (owned: everything goes back at once). */
  own: Owned;
  stage: LifeStage;
  director: Director;
  sound(s: RaidSound): void;
  /**
   * The other raids going on (each its own party): their vessels, to keep clear of at sea (the older raid has
   * the way), and the buildings claimed and looted by any party (shared, so none goes for another's).
   */
  others?: () => { n: number; v: Vessel }[];
  claimed?: Map<StructureId, number>;
  looted?: Set<StructureId>;
  /** The most raiders this party may bring (a ceiling on raiders alive at once); at least a token crew. */
  most?: number;
}

let raidCount = 0;

export class Raid {
  readonly n: number;
  readonly kind: RaidKind;
  beat: Beat = 'sighted';
  /** Seconds in this beat, and since the raid began. */
  t = 0;
  age = 0;
  /** The longship (a landing raid); a boats raid has none, only its rowing boats. */
  readonly ship: Vessel | null;
  readonly boats: Vessel[] = [];
  readonly raiders: Raider[] = [];
  /** The ship's place on its way: 'arrive' along the way in, 'spin' about, 'in' to the beach, 'beached', 'out' astern, 'spin-out', 'leave', 'gone' (a boats raid: 'gone' from the start). */
  shipState: 'arrive' | 'spin' | 'in' | 'beached' | 'out' | 'spin-out' | 'leave' | 'gone' | 'sunk' = 'arrive';
  private s = 0;
  /** Each boat: 'row-in' from beyond the edge of the map, 'wait' (run up on the shore), 'row-out' and off over the edge, 'gone', 'sunk'. */
  readonly boatState: ('row-in' | 'wait' | 'row-out' | 'gone' | 'sunk')[] = [];
  private boatS: number[] = [];
  /** The ship can no longer carry the band (gone down, or burning). */
  stranded = false;
  /** Raiders ashore lose heart once stranded (after RAID.strandedWait). */
  private heartless = false;
  /** Seconds the town has known (for the bell, the watcher). */
  private rung = false;
  /** The loot pile at each landing (a board store), by key. */
  readonly piles: { key: string; spots: Spot[] }[] = [];
  private burnTargets: Target[] = [];
  private lootTargets: Target[] = [];
  readonly burnWant: number;
  /** Parties the band splits into ashore, and the quarters of the town they go to (a building's middle each). */
  readonly parties: number;
  quarters: { x: number; z: number; cell: CellKey }[] = [];
  burnt = 0;
  /** Villagers the raid has sent running, and when they may be sent again. */
  private fled = new Map<Person, number>();
  private fleeLook = 0;
  /** People we took off the crowd ourselves (boarding): not "lost". */
  private boarded = new WeakSet<Person>();
  /** Something the system draws over a raider: a war cry. */
  ended = false;
  private exitAt = 0;
  private pointed = false;

  constructor(private host: RaidHost, readonly site: RaidSite, readonly seed: number, buildings: number) {
    this.n = ++raidCount;
    this.kind = site.kind;
    const stage = host.own.stage;
    if (this.kind === 'landing') {
      const ship = new Vessel(stage, 'ship', site.size, seed % 5, rand(seed, 'raid-phase'));
      ship.fx = host.stage;
      const start = pathAt(site.voyage.arrive, 0);
      ship.x = start.x;
      ship.z = start.z;
      ship.yaw = start.yaw;
      ship.sail = 1;
      ship.rowing = 0.6;
      this.ship = ship;
    } else {
      // No ship: the boats row in on their own from beyond the edge of the map, one behind another.
      this.ship = null;
      this.shipState = 'gone';
      const nb = site.landings.length;
      for (let b = 0; b < nb; b++) {
        const v = new Vessel(stage, 'boat', 1, (seed + b) % 5, rand(seed, 'boat-phase', b));
        v.fx = host.stage;
        const way = site.boatWays[b]!.arrive;
        const q = pathAt(way, 0);
        v.x = q.x;
        v.z = q.z;
        v.yaw = q.yaw;
        v.rowing = 1;
        this.boats.push(v);
        this.boatState.push('row-in');
        // A clear gap behind the one ahead, a boat and a half long (out of sight beyond the edge till its turn).
        this.boatS.push(-b * 3.6);
      }
    }
    // The band, scaled to the town.
    const want = Math.round(Math.max(RAID.bandMin, Math.min(RAID.bandMax, RAID.bandMin + buildings / RAID.perBuildings)));
    const seats = this.kind === 'boats' ? this.boats[0]!.seats.length * this.boats.length : this.ship!.seats.length;
    const band = Math.max(1, Math.min(want, seats, host.most ?? Infinity));
    for (let i = 0; i < band; i++) {
      const chief = i === 0;
      const v = chief ? 'chief' : (`raider-${(i - 1 + (seed % 8)) % 8}` as Barbarian);
      const role: Role = chief ? 'chief' : (i - 1 + (seed % 8)) % 3 === 0 ? 'brand' : (i - 1 + (seed % 8)) % 3 === 1 ? 'axe' : 'club';
      const vessel = this.kind === 'boats' ? 1 + (i % this.boats.length) : 0;
      const seat = this.kind === 'boats' ? Math.floor(i / this.boats.length) : i;
      const landing = this.kind === 'boats' ? vessel - 1 : 0;
      this.raiders.push({
        i, costume: v, look: Math.floor(rand(seed, 'raider-look', i) * 1e6), role, vessel, seat, landing,
        where: 'aboard', fig: null, person: null, t: 0, dur: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 },
        carry: null, trips: 0, fires: 0, target: null, cryIn: 1 + rand(seed, 'cry-in', i) * 4, cry: 0, routed: false, step: null, stepFor: 0, party: 0, there: false, beaten: false,
      });
    }
    this.parties = Math.max(1, Math.min(5, Math.floor((this.raiders.length - 1) / 3)));
    for (const r of this.raiders) r.party = r.role === 'chief' ? 0 : Math.min(this.parties - 1, Math.floor((r.i - 1) / 3));
    for (const r of this.raiders) r.fig = new Figure(stage, r.look, r.costume, `raid${this.n}-r${r.i}`);
    // Piles of loot at each landing, a step up the shore.
    site.landings.forEach((l, i) => this.piles.push({ key: `raid${this.n}:pile${i}`, spots: pileSpots(l) }));
    this.burnWant = Math.round(Math.max(RAID.burnMin, Math.min(RAID.burnMax, buildings * RAID.burnShare)));
  }

  // ───────────────────────────────────────────────────────── the sea ──

  /** The vessel a raider belongs to. */
  vesselOf(r: Raider): Vessel {
    return this.vessel(r.vessel)!;
  }

  /** Vessel `k`: 0 the ship (null in a boats raid), 1.. the boats. */
  vessel(k: number): Vessel | null {
    return k === 0 ? this.ship : this.boats[k - 1] ?? null;
  }

  /** Every vessel there is, the ship first. */
  get vessels(): Vessel[] {
    return this.ship ? [this.ship, ...this.boats] : this.boats;
  }

  /** The one to look at, blow the horn from, hang the flames' wind on: the ship, or the first boat still afloat. */
  get lead(): Vessel {
    return this.ship ?? this.boats.find((_, i) => this.boatState[i] !== 'sunk') ?? this.boats[0]!;
  }

  /** Vessel `k` is out of it: sunk, or gone over the edge. */
  private over(k: number): boolean {
    if (k === 0) return this.shipState === 'gone' || this.shipState === 'sunk';
    const st = this.boatState[k - 1];
    return st === 'sunk' || st === 'gone';
  }

  /** Every frame: the ships, and the raiders at sea. */
  stepSea(dt: number, seconds: number, wind: number): void {
    if (this.ended || this.beat === 'done') return;
    this.t += dt;
    this.age += dt;
    if (this.ship && !this.handled(this.ship, 0)) this.moveShip(dt);
    this.moveBoats(dt);
    if (this.ship) this.ship.stroke = (this.ship.stroke + dt * 0.55 * (this.ship.rowing > 0.05 ? 1 : 0)) % 1;
    // The boats pull together: one stroke for all of them (oars in time, boat to boat).
    this.boatStroke = (this.boatStroke + dt * 0.75) % 1;
    for (const b of this.boats) b.stroke = this.boatStroke;
    this.settleOffsets(dt);
    for (const v of this.vessels) {
      // Drawn where it is plus what is left of the gap the Hand put it at.
      const bx = v.x, bz = v.z, by = v.yaw;
      v.x += v.off.x;
      v.z += v.off.z;
      v.yaw += v.off.yaw;
      v.draw(seconds, wind);
      v.x = bx;
      v.z = bz;
      v.yaw = by;
    }
    // Whoever is aboard is placed on the vessel as it is drawn this frame (so they move with it rigidly).
    Figure.tick = Math.floor(seconds * PERSON.drawRate);
    this.stepFigures(dt, seconds);
    this.stepEscapees(dt, seconds);
    this.stepDamage(dt);
    // The beats that turn at sea.
    if (this.beat === 'sighted' && !this.rung && this.age > 6) {
      this.rung = true;
      const h = this.site.landings[0]!;
      this.host.sound({ type: 'bell', x: h.x, z: h.z });
    }
    if (this.ship && this.beat === 'away' && this.shipState === 'gone') this.finishSoon();
    // Everybody back aboard or gone: a sunk ship's raid is over; a ship still afloat (its band swum off) sails away;
    // boats still on the shore with nobody left to come put off. (Aboard a vessel lying on the land counts as back:
    // they sit in it, dazed, till the town hauls it off.)
    if (this.raiders.every((r) => r.where === 'lost' || r.where === 'home' || (r.where === 'aboard' && this.vesselOf(r).aground !== null)) && (this.beat !== 'sighted' || this.vessels.some((v) => v.aground))) {
      if (this.ship) {
        if (this.shipState === 'sunk') this.finishSoon();
        else if (this.shipState === 'beached') this.shipLeaves();
      } else {
        for (let k = 1; k <= this.boats.length; k++) this.checkAllAboard(k);
        if (this.boatState.every((s) => s === 'sunk' || s === 'gone')) this.finishSoon();
        else if (this.beat !== 'away' && this.boatState.every((s) => s !== 'wait' && s !== 'row-in')) this.setBeat('away');
      }
    }
    if (this.exitAt > 0 && this.age >= this.exitAt) this.beat = 'done';
  }

  private finishSoon(): void {
    if (this.exitAt === 0) this.exitAt = this.age + 0.5;
  }

  private boatStroke = 0;

  /**
   * Keeping clear of another raid's vessels at sea: an older raid has the way; this one lies on its oars while
   * one of theirs is close ahead of it (never for long: after 12 s it goes on regardless). The speed to go at, 0–1.
   */
  private giveWay(v: Vessel, dt: number): number {
    const others = this.host.others?.() ?? [];
    const sx = Math.sin(v.yaw), cz = Math.cos(v.yaw);
    let k = 1;
    for (const o of others) {
      if (o.n > this.n || o.v.sink > 0.3 || o.v.aground || o.v.held) continue;
      const dx = o.v.x - v.x, dz = o.v.z - v.z;
      const d = Math.hypot(dx, dz);
      const room = (v.length + o.v.length) * 0.5 + 0.9;
      if (d > room + 1.5 || (dx * sx + dz * cz) < d * 0.3) continue;
      k = Math.min(k, clamp01((d - room) / 1.5));
    }
    const w = this.waited.get(v) ?? 0;
    if (k < 0.2) this.waited.set(v, w + dt);
    else if (w > 0) this.waited.set(v, Math.max(0, w - dt));
    return w > 12 ? 1 : k;
  }
  private waited = new Map<Vessel, number>();

  private moveShip(dtIn: number): void {
    const v = this.ship!, site = this.site;
    const way = this.shipState === 'beached' ? 1 : this.giveWay(v, dtIn);
    const dt = dtIn * way;
    if (way < 0.2) v.rowing = Math.min(v.rowing, 0.15);
    const turn = site.voyage.turn;
    switch (this.shipState) {
      case 'arrive': {
        const p = site.voyage.arrive;
        const left = p.length - this.s;
        // Slowing over the last few cells, the sail coming in, the oars taking over.
        const speed = RAID.sail * (0.35 + 0.65 * clamp01(left / 6));
        this.s = Math.min(p.length, this.s + speed * dt);
        const q = pathAt(p, this.s);
        v.x = q.x;
        v.z = q.z;
        v.yaw = q.yaw;
        v.sail = clamp01((left - 0.8) / 2.5);
        v.rowing = 0.5 + 0.5 * clamp01(1 - left / 6);
        if (this.s >= p.length) this.shipState = 'spin';
        break;
      }
      case 'spin': {
        const want = site.beached!.yaw;
        const d = angleDelta(v.yaw, want);
        const step = RAID.spin * dt;
        v.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
        v.sail = 0;
        v.rowing = 1;
        if (Math.abs(d) <= step) {
          this.shipState = 'in';
          this.s = 0;
          this.setBeat('landing');
        }
        break;
      }
      case 'in': {
        const b = site.beached!;
        const len = Math.hypot(b.x - turn.x, b.z - turn.z);
        const left = len - this.s;
        this.s = Math.min(len, this.s + RAID.row * (0.45 + 0.55 * clamp01(left / 1.5)) * dt);
        const u = len > 0 ? this.s / len : 1;
        v.x = turn.x + (b.x - turn.x) * u;
        v.z = turn.z + (b.z - turn.z) * u;
        v.yaw = b.yaw;
        v.rowing = 1;
        // The last of the way the bow runs up the sand.
        v.beach = clamp01(1 - left / 0.9);
        if (this.s >= len) {
          this.shipState = 'beached';
          v.rowing = 0;
          v.beach = 1;
          this.host.sound({ type: 'crash', x: b.x, z: b.z });
          this.disembark(0);
        }
        break;
      }
      case 'beached':
        v.rowing = 0;
        break;
      case 'out': {
        const b = site.beached!;
        const len = Math.hypot(b.x - turn.x, b.z - turn.z);
        this.s = Math.min(len, this.s + RAID.row * 0.85 * dt);
        const u = len > 0 ? this.s / len : 1;
        v.x = b.x + (turn.x - b.x) * u;
        v.z = b.z + (turn.z - b.z) * u;
        v.astern = true;
        v.rowing = 1;
        v.beach = clamp01(1 - this.s / 0.9);
        if (this.s >= len) {
          v.astern = false;
          this.shipState = 'spin-out';
        }
        break;
      }
      case 'spin-out': {
        const want = pathAt(site.voyage.leave, 0.6).yaw;
        const d = angleDelta(v.yaw, want);
        const step = RAID.spin * dt;
        v.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
        v.rowing = 1;
        v.sail = 0;
        if (Math.abs(d) <= step) {
          this.shipState = 'leave';
          this.s = 0;
        }
        break;
      }
      case 'leave': {
        const p = site.voyage.leave;
        this.s = Math.min(p.length, this.s + RAID.sail * clamp01(0.4 + this.s / 4) * (v.hurt >= 1 ? 0.6 : 1) * dt);
        const q = pathAt(p, this.s);
        v.x = q.x;
        v.z = q.z;
        v.yaw = q.yaw;
        v.sail = clamp01(this.s / 3);
        v.rowing = 1 - 0.5 * clamp01(this.s / 5);
        if (this.s >= p.length) this.shipState = 'gone';
        break;
      }
      case 'gone':
      case 'sunk':
        break;
    }
  }

  /**
   * The Hand (mischief/critters.ts): a vessel picked up is drawn where it is held, its crew clinging on in
   * their seats; let go over the water it rows back to where it should be; let go on the land it lies over on
   * its side there, and the raid is over for it as if it had gone down (the band stranded). True while the
   * vessel is not moving by itself.
   */
  private handled(v: Vessel, k: number): boolean {
    if (v.hurt >= 3 || this.over(k)) return v.aground !== null;
    // Named as the harbour's ships are ('ship:…'): blasts leave them to the raid (it sinks them itself), only the Hand throws them.
    if (v.aground) return true;
    const id = `ship:raid${this.n}-${k}`;
    const held = critterPose(this.host.stage, id, k === 0 ? 'longship' : 'boat', v.x, SEA_Y, v.z, v.yaw, k === 0 ? 1.2 * v.size : 0.6, 1);
    // Thrown down and come to rest on the land (not still in the Hand, not in the air): it stays there.
    const phase = held ? crittersOf(this.host.stage).get(id)?.body?.phase : undefined;
    const landed = held && phase !== 'held' && phase !== 'fly' && (this.field?.(held[12]!, held[14]!) ?? 1) < 0.05;
    if (held && !landed) {
      v.held = held;
      return true;
    }
    if (v.held || landed) {
      const m = landed ? held! : v.held!;
      v.held = null;
      const x = m[12]!, z = m[14]!, yaw = Math.atan2(m[8]!, m[10]!);
      const onLand = (this.field?.(x, z) ?? 1) < 0.05;
      if (onLand) {
        v.x = x;
        v.z = z;
        v.yaw = yaw;
        v.aground = { ground: Math.max(SEA_Y, m[13]! - 0.2) };
        this.host.sound({ type: 'crash', x, z });
        if (k === 0) {
          this.stranded = true;
          this.shipState = 'sunk';
          if (this.beat === 'sighted' || this.beat === 'landing') this.setBeat('away');
        } else this.boatDown(k - 1);
        return true;
      }
      // Back in the water with a splash: it rows back to where it should be from here.
      this.host.sound({ type: 'splash', x, z });
      v.off = { x: x - v.x, z: z - v.z, yaw: angleDelta(v.yaw, yaw) };
    }
    return v.aground !== null;
  }

  /** A vessel put back in the water away from its place: drawn there, the gap closing as it rows back. */
  private settleOffsets(dt: number): void {
    for (const v of this.vessels) {
      if (v.held || v.aground) continue;
      const o = v.off;
      if (o.x === 0 && o.z === 0 && o.yaw === 0) continue;
      const k = Math.exp(-dt / 1.6);
      o.x *= k;
      o.z *= k;
      o.yaw *= k;
      if (Math.hypot(o.x, o.z) < 0.01 && Math.abs(o.yaw) < 0.01) o.x = o.z = o.yaw = 0;
      v.rowing = Math.max(v.rowing, 0.8);
    }
  }

  /**
   * The rowing boats: each in from beyond the edge of the map on its own way (one behind another), run up in the
   * shallows at its landing, waiting there while its crew are ashore, then turned about and rowed off over the edge
   * with whoever came back and what they carry.
   */
  private moveBoats(dt: number): void {
    this.boats.forEach((b, i) => {
      if (this.handled(b, i + 1)) return;
      const st = this.boatState[i];
      const ways = this.site.boatWays[i]!;
      const way = st === 'row-in' || st === 'row-out' ? this.giveWay(b, dt) : 1;
      if (st === 'row-in') {
        const path = ways.arrive;
        const left = path.length - this.boatS[i]!;
        // Pulling hard over the open water, easing in over the last few cells.
        this.boatS[i] = Math.min(path.length, this.boatS[i]! + RAID.boatRow * (0.4 + 0.95 * clamp01(left / 6)) * dt * way);
        const q = pathAt(path, Math.max(0, this.boatS[i]!));
        b.x = q.x;
        b.z = q.z;
        b.yaw += angleDelta(b.yaw, q.yaw) * Math.min(1, dt * 3);
        b.rowing = 1;
        b.beach = clamp01(1 - left / 0.5) * 0.5;
        // The first boat near in: the landing begins.
        if (left < 5 && this.beat === 'sighted') this.setBeat('landing');
        if (this.boatS[i]! >= path.length) {
          this.boatState[i] = 'wait';
          b.rowing = 0;
          this.host.sound({ type: 'splash', x: b.x, z: b.z });
          this.disembark(i + 1);
        }
      } else if (st === 'wait') {
        b.rowing = 0;
      } else if (st === 'row-out') {
        const path = ways.leave;
        // Backed off the sand, brought round, then away: slow at first, laden.
        this.boatS[i] = Math.min(path.length, this.boatS[i]! + RAID.boatRow * (0.35 + 0.75 * clamp01(this.boatS[i]! / 2)) * dt * way);
        const q = pathAt(path, this.boatS[i]!);
        b.x = q.x;
        b.z = q.z;
        b.yaw += angleDelta(b.yaw, q.yaw) * Math.min(1, dt * 1.8);
        b.rowing = 1;
        b.beach = 0;
        if (this.boatS[i]! >= path.length) {
          this.boatState[i] = 'gone';
          b.rowing = 0;
          b.hideAll();
          for (const r of this.raiders) if (r.vessel === i + 1 && (r.where === 'home' || r.where === 'aboard')) r.fig?.hideAll();
        }
      }
    });
  }

  /** All aboard (or as many as there are): the ship backs off, spins and goes. */
  private shipLeaves(): void {
    if (this.shipState === 'beached') {
      this.shipState = 'out';
      this.s = 0;
    }
    this.setBeat('away');
  }

  // ───────────────────────────────────────────────── raiders at sea ──

  /** The band (or one boat's crew) goes over the side, one or two at a time. */
  private disembark(vessel: number): void {
    const list = this.raiders.filter((r) => r.vessel === vessel && r.where === 'aboard');
    // The chief first, from the prow.
    list.sort((a, b) => (a.role === 'chief' ? -1 : b.role === 'chief' ? 1 : a.seat - b.seat));
    list.forEach((r, k) => {
      r.where = 'jump';
      r.t = -k * 0.32;
    });
    if (this.beat === 'landing' || this.beat === 'sighted') this.setBeat('ashore');
  }

  /** Where on the shore a raider stands up out of the water: their landing's edge, spread along it. */
  private shorePoint(r: Raider): { x: number; y: number; z: number } {
    const l = this.shoreOf(r);
    const spread = ((r.i * 0.37) % 1) - 0.5;
    return { x: l.x + l.ox * 0.25 - l.oz * spread * 0.6, y: l.y, z: l.z + l.oz * 0.25 + l.ox * spread * 0.6 };
  }

  /** The shore cell a raider comes ashore at and goes back from: their landing, or one beside it (the band spreads out). */
  shoreOf(r: Raider): Landing {
    const l = this.site.landings[r.landing]!;
    const near = l.near.length > 0 ? l.near : [l];
    return near[(r.i * 5) % near.length]!;
  }

  private stepFigures(dt: number, seconds: number): void {
    for (const r of this.raiders) {
      const fig = r.fig;
      if (!fig) continue;
      const v = this.vesselOf(r);
      switch (r.where) {
        case 'aboard':
        case 'home': {
          if (v.hurt >= 3 && v.sink > 0.15) {
            // Going down: over the side and swim for it.
            this.goSwim(r);
            break;
          }
          if (r.vessel > 0 && this.boatState[r.vessel - 1] === 'gone') break;
          const s = v.seatAt(r.seat);
          const seat = v.seats[r.seat % v.seats.length]!;
          const rower = seat.sit && v.rowing > 0.05;
          // Standing in the bow: the chief with his standard, or a brand held up, cheering them in.
          const bow = !seat.sit && (this.beat === 'sighted' || this.beat === 'landing') && (r.role === 'chief' || v.kind === 'boat');
          fig.pose(s.x, s.y, s.z, s.heading, seat.sit ? 'sit' : bow ? 'cheer' : 'stand', seconds, {
            grow: false,
            rigid: true,
            seat: seat.sit ? 0.12 : -1,
            gear: !rower,
            ...(rower ? { tweak: rowing(v.astern ? 1 - v.stroke : v.stroke) } : {}),
          });
          fig.setCut(v.edgeCut);
          break;
        }
        case 'jump': {
          r.t += dt;
          if (r.t < 0) {
            const s = v.seatAt(r.seat);
            fig.pose(s.x, s.y, s.z, s.heading, 'stand', seconds, { grow: false, rigid: true });
            break;
          }
          if (r.dur === 0) {
            // From the seat, over the side near the bow, into the shallows.
            const s = v.seatAt(r.seat);
            const side = r.i % 2 ? 1 : -1;
            const along = this.kind === 'landing' ? v.hull.bow * 0.45 - (r.i % 4) * 0.25 : 0;
            const w = v.beside(along, side, 0.25);
            r.from = { x: s.x, y: s.y, z: s.z };
            r.to = { x: w.x, y: SEA_Y - 0.14, z: w.z };
            r.dur = 0.55;
          }
          const u = clamp01(r.t / r.dur);
          const x = r.from.x + (r.to.x - r.from.x) * u, z = r.from.z + (r.to.z - r.from.z) * u;
          const y = r.from.y + (r.to.y - r.from.y) * u + Math.sin(u * Math.PI) * 0.35;
          fig.pose(x, y, z, facing(r.from, r.to), 'hop', r.t);
          if (u >= 1) {
            this.host.sound({ type: 'splash', x, z });
            r.where = 'wade-in';
            r.t = 0;
            r.from = { ...r.to };
            r.to = this.shorePoint(r);
            r.dur = Math.max(0.6, Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) / 1.1);
          }
          break;
        }
        case 'wade-in': {
          r.t += dt;
          const u = clamp01(r.t / r.dur);
          const x = r.from.x + (r.to.x - r.from.x) * u, z = r.from.z + (r.to.z - r.from.z) * u;
          // Waist-deep, then up out of the water onto the shore.
          const y = r.from.y + (r.to.y - r.from.y) * easeInOut(clamp01((u - 0.55) / 0.45));
          fig.pose(x, y, z, facing(r.from, r.to), 'run', r.t * 1.4);
          if (u >= 1) r.where = 'ashore'; // the chain hands them to the crowd (it holds the board)
          break;
        }
        case 'wade-out': {
          r.t += dt;
          // Back to where the vessel is now (it may have moved a little).
          const w = this.boardingPoint(r);
          r.to = { x: w.x, y: SEA_Y - 0.14, z: w.z };
          const u = clamp01(r.t / r.dur);
          const x = r.from.x + (r.to.x - r.from.x) * u, z = r.from.z + (r.to.z - r.from.z) * u;
          const y = r.from.y + (r.to.y - r.from.y) * easeInOut(clamp01(u / 0.45));
          fig.pose(x, y, z, facing(r.from, r.to), 'walk', r.t * 1.2, { load: r.carry });
          if (u >= 1) {
            r.where = 'climb';
            r.t = 0;
            r.from = { x, y, z };
            r.dur = 0.5;
          }
          break;
        }
        case 'climb': {
          r.t += dt;
          const s = v.seatAt(r.seat);
          const u = clamp01(r.t / r.dur);
          const x = r.from.x + (s.x - r.from.x) * u, z = r.from.z + (s.z - r.from.z) * u;
          const y = r.from.y + (s.y - r.from.y) * u + Math.sin(u * Math.PI) * 0.25;
          fig.pose(x, y, z, facing(r.from, s), 'hop', r.t, { load: r.carry });
          if (u >= 1) {
            r.where = 'home';
            // A pig or a hen does not stay taken: a moment later it jumps ship and swims home.
            if (r.carry === 'pig' || r.carry === 'hen') this.escape(r.carry, v, r);
            else if (r.carry) v.heap++;
            r.carry = null;
            this.checkAllAboard(r.vessel);
          }
          break;
        }
        case 'swim': {
          r.t += dt;
          const u = r.dur > 0 ? clamp01(r.t / r.dur) : 1;
          const x = r.from.x + (r.to.x - r.from.x) * u, z = r.from.z + (r.to.z - r.from.z) * u;
          // Horns bobbing over the waves, arms going.
          const bob = Math.sin(seconds * 3 + r.i) * 0.02;
          fig.pose(x, SEA_Y - 0.3 + bob, z, facing(r.from, r.to), 'splash', r.t, { tilt: 1.05, gear: false, tweak: (p) => {
            const k = Math.sin(r.t * 5 + r.i);
            p.armL = 2.4 + 0.9 * k;
            p.armR = 2.4 - 0.9 * k;
            p.outL = p.outR = 0.25;
          } });
          fig.setCut(x < 0.5 || z < 0.5 || x > 47.5 || z > 47.5 || u > 0.97);
          if (u >= 1) {
            r.where = 'lost';
            fig.setVisible(false);
          }
          break;
        }
        case 'ashore':
        case 'lost':
          break;
      }
    }
  }

  /** Livestock that jumped ship: a pig or a hen swimming home, then standing on the shore, dripping. */
  readonly escapees: { kind: Load; h: InstanceHandle; t: number; from: { x: number; z: number }; to: { x: number; y: number; z: number }; land: { x: number; y: number; z: number }; v: Vessel; seat: number }[] = [];

  private escape(kind: Load, v: Vessel, r: Raider): void {
    const l = this.shoreOf(r);
    const to = { x: l.x + l.ox * 0.55, y: SEA_Y, z: l.z + l.oz * 0.55 };
    const land = { x: l.x - l.ox * 0.6 + (rand(this.seed, 'esc', r.i) - 0.5) * 0.5, y: l.y, z: l.z - l.oz * 0.6 };
    const h = this.host.own.stage.spawnMesh(restingMesh(kind), HIDDEN_M);
    this.escapees.push({ kind, h, t: -1.5, from: { x: 0, z: 0 }, to, land, v, seat: r.seat });
  }

  private stepEscapees(dt: number, seconds: number): void {
    for (const e of this.escapees) {
      e.t += dt;
      const k = raiderScale() * 1.2;
      if (e.t < 0) {
        // In the boat a moment, wriggling.
        const s = e.v.seatAt(e.seat);
        e.from = { x: s.x, z: s.z };
        e.h.setMatrix(place(s.x, s.y + 0.18 + (Math.floor(seconds * 8) % 2) * 0.03, s.z, seconds * 3, k));
        continue;
      }
      const jump = 0.6;
      const swim = Math.max(1, Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z) / 0.7);
      if (e.t < jump) {
        const u = e.t / jump;
        e.h.setMatrix(place(e.from.x + (e.to.x - e.from.x) * u * 0.15, SEA_Y + 0.5 + Math.sin(u * Math.PI) * 0.5 - u * 0.6, e.from.z + (e.to.z - e.from.z) * u * 0.15, Math.atan2(e.to.x - e.from.x, e.to.z - e.from.z), k));
        continue;
      }
      if (e.t < jump + swim) {
        // Paddling for the shore, only the head and back above the water.
        const u = (e.t - jump) / swim;
        const x0 = e.from.x + (e.to.x - e.from.x) * 0.15, z0 = e.from.z + (e.to.z - e.from.z) * 0.15;
        e.h.setMatrix(place(x0 + (e.to.x - x0) * u, SEA_Y - 0.06 + Math.sin(seconds * 6) * 0.015, z0 + (e.to.z - z0) * u, Math.atan2(e.to.x - x0, e.to.z - z0), k));
        continue;
      }
      // Up the beach and home along the shore: it stands there, shaking itself, the raid behind it.
      const u = Math.min(1, (e.t - jump - swim) / 1.2);
      const yaw = Math.atan2(e.land.x - e.to.x, e.land.z - e.to.z) + (u >= 1 ? Math.sin(seconds * 9) * 0.25 : 0);
      e.h.setMatrix(place(e.to.x + (e.land.x - e.to.x) * u, SEA_Y + (e.land.y - SEA_Y) * Math.min(1, u * 2), e.to.z + (e.land.z - e.to.z) * u, yaw, k));
    }
  }

  /** Where a raider wading out climbs aboard: beside their vessel, its nearest point. */
  private boardingPoint(r: Raider): { x: number; z: number } {
    const v = this.vesselOf(r);
    const l = this.site.landings[r.landing]!;
    const along = v.kind === 'ship' ? v.hull.bow * 0.45 - (r.i % 4) * 0.25 : 0.2;
    // The side nearer the shore point's lateral spread.
    const side = r.i % 2 ? 1 : -1;
    const w = v.beside(along, side, v.kind === 'ship' ? 0.2 : 0.15);
    void l;
    return w;
  }

  private goSwim(r: Raider): void {
    if (!r.fig) return;
    const v = this.vesselOf(r);
    const s = v.seatAt(r.seat);
    r.where = 'swim';
    r.t = 0;
    r.from = { x: s.x, y: SEA_Y, z: s.z };
    const out = this.wayOut(s.x, s.z);
    r.to = { x: out.x, y: SEA_Y, z: out.z };
    r.dur = Math.hypot(out.x - s.x, out.z - s.z) / 0.55;
    this.host.sound({ type: 'splash', x: s.x, z: s.z });
  }

  /** Off the edge of the map the shortest way over open water from (x, z): a point just beyond it. */
  private wayOut(x: number, z: number): { x: number; z: number } {
    const field = this.field;
    const dirs: [number, number][] = [];
    for (let k = 0; k < 16; k++) dirs.push([Math.cos((k / 16) * Math.PI * 2), Math.sin((k / 16) * Math.PI * 2)]);
    let best: { x: number; z: number; d: number } | null = null;
    for (const [dx, dz] of dirs) {
      for (let t = 0.5; t < 70; t += 0.5) {
        const px = x + dx * t, pz = z + dz * t;
        if (px < -1 || pz < -1 || px > 49 || pz > 49) {
          if (!best || t < best.d) best = { x: px, z: pz, d: t };
          break;
        }
        if (field && field(px, pz) < 0.15) break;
      }
    }
    return best ?? { x: x < 24 ? -1.5 : 49.5, z };
  }

  /** The clear water (distance to anything solid) at a point: set by the system from the site's field. */
  field: ((x: number, z: number) => number) | null = null;

  /** A raider has come back aboard: when the vessel's raiders are all in, it goes. */
  private checkAllAboard(vessel: number): void {
    const mine = this.raiders.filter((r) => r.vessel === vessel);
    if (mine.some((r) => r.where !== 'home' && r.where !== 'lost' && r.where !== 'swim' && !(r.routed && r.where === 'ashore'))) return;
    if (vessel === 0) {
      if (this.ship) this.shipLeaves();
      return;
    }
    const i = vessel - 1;
    if (this.boatState[i] === 'wait') {
      this.boatState[i] = 'row-out';
      this.boatS[i] = 0;
      this.host.sound({ type: 'splash', x: this.boats[i]!.x, z: this.boats[i]!.z });
    }
    // The last boat putting off: they are away.
    if (this.boatState.every((s) => s !== 'wait' && s !== 'row-in') && (this.beat === 'recall' || this.beat === 'ashore')) this.setBeat('away');
  }

  // ─────────────────────────────────────────────────── stopping them ──

  /** Hits from the player's mischief (the system tells us): a blast at (x, z) of power `power`, or lightning. */
  hit(x: number, z: number, r3: number, r2: number, r1: number): void {
    const hitOne = (v: Vessel): 0 | 1 | 2 | 3 => {
      const sx = Math.sin(v.yaw), cz = Math.cos(v.yaw);
      const along = Math.max(v.hull.stern, Math.min(v.hull.bow, (x - v.x) * sx + (z - v.z) * cz));
      const d = Math.hypot(x - (v.x + sx * along), z - (v.z + cz * along)) - v.hull.halfBeam;
      return d < r3 ? 3 : d < r2 ? 2 : d < r1 ? 1 : 0;
    };
    const ks = this.ship ? [0] : [];
    for (let k = 1; k <= this.boats.length; k++) ks.push(k);
    for (const k of ks) {
      const v = this.vessel(k)!;
      if (this.over(k)) continue;
      // Not yet in from beyond the edge of the map: out of reach.
      if (k === 0 ? this.shipState === 'arrive' && v.edgeCut && this.s < 1 : this.boatState[k - 1] === 'row-in' && this.boatS[k - 1]! < 1) continue;
      const stage = hitOne(v);
      if (stage !== 0 && stage > v.hurt) this.hurt(v, stage);
    }
  }

  /** Lightning on a vessel: its sail catches, it burns and goes down. */
  strike(x: number, z: number): boolean {
    for (const v of this.vessels) {
      if (v.hurt >= 2 || v.edgeCut) continue;
      const sx = Math.sin(v.yaw), cz = Math.cos(v.yaw);
      const along = Math.max(v.hull.stern, Math.min(v.hull.bow, (x - v.x) * sx + (z - v.z) * cz));
      if (Math.hypot(x - (v.x + sx * along), z - (v.z + cz * along)) - v.hull.halfBeam < 0.9) {
        this.hurt(v, 2);
        return true;
      }
    }
    return false;
  }

  /** The vessel the point is on, if any (the Lightning tool asks). */
  vesselAt(x: number, z: number): [number, number] | null {
    for (const v of this.vessels) {
      if (v.sink > 0.5 || v.edgeCut) continue;
      const sx = Math.sin(v.yaw), cz = Math.cos(v.yaw);
      const along = Math.max(v.hull.stern, Math.min(v.hull.bow, (x - v.x) * sx + (z - v.z) * cz));
      const cx = v.x + sx * along, cz2 = v.z + cz * along;
      if (Math.hypot(x - cx, z - cz2) - v.hull.halfBeam < 0.6) return [cx, cz2];
    }
    return null;
  }

  /** Flames on a vessel now: where, and how fierce (the system draws them). */
  readonly fires: { v: Vessel; along: number; side: number }[] = [];

  private hurt(v: Vessel, stage: 1 | 2 | 3): void {
    v.hurt = stage;
    v.loseSail();
    v.list = rand(this.seed, 'list', v.x) < 0.5 ? -1 : 1;
    if (stage >= 2) for (let k = 0; k < 3; k++) this.fires.push({ v, along: v.hull.stern + (v.hull.bow - v.hull.stern) * (0.25 + 0.25 * k), side: (k % 2) * 2 - 1 });
    if (stage === 1) return;
    const i = this.boats.indexOf(v);
    if (i >= 0) {
      this.boatDown(i);
      return;
    }
    // The ship: it cannot carry the band now.
    this.stranded = true;
    if (this.shipState === 'arrive' || this.shipState === 'spin' || this.shipState === 'in') {
      // Before it lands: the raid never happens. Everybody aboard swims off.
      this.setBeat('away');
    }
    this.shipState = v.hurt >= 3 ? 'sunk' : this.shipState;
  }

  /**
   * A boat lost (burnt, sunk, thrown onto the land): its crew still ashore will go home in another; once the last is
   * lost the band is stranded, and if none had landed yet the raid never happens.
   */
  private boatDown(i: number): void {
    this.boatState[i] = 'sunk';
    if (this.boatState.every((s) => s === 'sunk' || s === 'gone')) {
      this.stranded = true;
      if (this.beat === 'sighted' || this.beat === 'landing') this.setBeat('away');
    }
  }

  private stepDamage(dt: number): void {
    for (const v of this.vessels) {
      if (v.hurt === 2) {
        v.burnt += dt;
        if (v.burnt > 7) v.hurt = 3;
      }
      if (v.hurt === 3) {
        v.sink = Math.min(1.2, v.sink + dt / 7);
        v.rowing = 0;
        v.sail = 0;
        if (v === this.ship) this.shipState = 'sunk';
      }
    }
    // A boat gone down: its crew swim off; those ashore who came in it go back by another boat if there is one.
    this.boats.forEach((b, i) => {
      if (this.boatState[i] !== 'sunk') return;
      for (const r of this.raiders) {
        if (r.vessel !== i + 1) continue;
        if ((r.where === 'aboard' || r.where === 'home') && b.sink > 0.15) this.goSwim(r);
        if (r.where === 'ashore' || r.where === 'wade-in' || r.where === 'jump') {
          const other = this.boatState.findIndex((s) => s === 'wait' || s === 'row-in');
          if (other >= 0) {
            r.vessel = other + 1;
            r.landing = other;
            r.seat = this.freeSeat(other + 1);
          }
        }
      }
    });
    if (this.boats.length > 0 && this.boatState.every((s) => s === 'sunk') || this.ship && this.shipState === 'sunk') this.stranded = true;
  }

  /** A free seat in a vessel (somebody moved over from a boat that went down). */
  private freeSeat(vessel: number): number {
    const v = this.vessel(vessel)!;
    const taken = new Set(this.raiders.filter((r) => r.vessel === vessel).map((r) => r.seat));
    for (let s = 0; s < v.seats.length * 2; s++) if (!taken.has(s)) return s;
    return 0;
  }

  // ───────────────────────────────────────────────────────── ashore ──

  private setBeat(b: Beat): void {
    if (this.beat === b) return;
    this.beat = b;
    this.t = 0;
  }

  /** The middle of the band ashore, or of the landings. */
  focus(): { x: number; y: number; z: number } {
    const ashore = this.raiders.filter((r) => r.person && r.person.visible);
    if (ashore.length > 0 && (this.beat === 'ashore' || this.beat === 'recall')) {
      let x = 0, z = 0, y = 0;
      for (const r of ashore) {
        x += r.person!.x;
        y += r.person!.y;
        z += r.person!.z;
      }
      return { x: x / ashore.length, y: y / ashore.length, z: z / ashore.length };
    }
    if (this.beat === 'sighted') return { x: this.lead.x, y: SEA_Y, z: this.lead.z };
    const l = this.site.landings[0]!;
    return { x: l.x, y: l.y, z: l.z };
  }

  /** Raiders ashore now, where they are (for the town's scenes to keep clear, and for the people to run from). */
  threats(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const r of this.raiders) {
      if (r.where === 'ashore' && r.person && r.person.mode !== 'gone' && !r.routed) out.push({ x: r.person.x, z: r.person.z });
      else if (r.where === 'wade-in' || r.where === 'jump') out.push({ x: r.to.x, z: r.to.z });
    }
    return out;
  }

  /** The chain, every frame: raiders handed to the crowd, plans for them, the town running. */
  stepLand(dt: number, board: Board, time: TimeSignal, chainId: string, chain: Chain): void {
    if (this.ended) return;
    const crowd = board.crowd;
    // Sighted: the townspeople nearest the shore stop and point out to sea (one waving the alarm).
    if (this.beat === 'sighted' && !this.pointed && this.age > 4 && !this.lead.edgeCut) {
      this.pointed = true;
      const l = this.site.landings[0]!;
      const near = crowd.people
        .filter((p) => !p.raider && p.visible && (p.mode === 'walk' || p.mode === 'linger') && !p.scuffle && Math.hypot(p.x - l.x, p.z - l.z) < 16)
        .sort((a, b) => Math.hypot(a.x - l.x, a.z - l.z) - Math.hypot(b.x - l.x, b.z - l.z) || (a.id < b.id ? -1 : 1))
        .slice(0, 4);
      near.forEach((p, k) => {
        p.startled = 5 + k * 0.5;
        p.startledFace = Math.atan2(this.lead.x - p.x, this.lead.z - p.z);
        p.admire = k === 0 ? 'wave' : 'look';
      });
    }
    // Piles of loot at the landings: claimed again (a store not claimed at a sync is cleared away).
    for (const p of this.piles) board.store(p.key, p.spots);
    // Ashore: into the crowd.
    for (const r of this.raiders) {
      if (r.where === 'ashore' && !r.person && r.fig?.visible) {
        const s = this.shorePoint(r);
        const l = this.shoreOf(r);
        const p = crowd.ashore(s.x, s.y, s.z, Math.atan2(-l.ox, -l.oz), r.look) ?? crowd.ashore(l.x, l.y, l.z, Math.atan2(-l.ox, -l.oz), r.look);
        if (!p) continue;
        p.leaving = false;
        p.ashore = false;
        p.raider = true;
        p.costume = r.costume;
        p.timer = 0.15;
        (p as { speed: number }).speed = PEOPLE.speed * (r.role === 'chief' ? 1.35 : 1.55);
        board.claim(p, chain);
        r.person = p;
        r.fig!.setVisible(false);
        if (r.cry <= 0) r.cry = 1.6;
      }
      // Someone took their person off the crowd without us (a fresh crowd after an undo, a blast's swim): adopt or lose them.
      if (r.where === 'ashore' && r.person && r.person.mode === 'gone' && !this.boarded.has(r.person)) {
        const again = crowd.people.find((q) => q.raider && q.costume === r.costume && !this.raiders.some((o) => o.person === q));
        if (again) {
          r.person = again;
          board.claim(again, chain);
        } else {
          r.person = null;
          r.where = 'lost';
        }
      }
    }
    // A walk that gets nowhere (a knot in a lane, a way cut by the fire) is given up for another plan.
    for (const r of this.raiders) {
      const p = r.person;
      if (r.where !== 'ashore' || !p || p.mode !== 'walk') {
        r.stepFor = 0;
        continue;
      }
      const step = p.goal?.errand ?? null;
      if (step !== r.step) {
        r.step = step;
        r.stepFor = 0;
      }
      r.stepFor += dt;
      if (r.stepFor > 14 && step && step.tag !== 'raid:board' && step.tag !== 'raid:to-sea') {
        r.stepFor = 0;
        board.drop(p);
        board.crowd.rethink(p);
      }
    }
    // War cries over the raiders ashore, now and then (the system draws them; here the timing).
    for (const r of this.raiders) {
      if (r.cry > 0) r.cry -= dt;
      if (r.where !== 'ashore' || !r.person) continue;
      r.cryIn -= dt;
      if (r.cryIn <= 0 && !r.routed && (this.beat === 'ashore' || this.beat === 'recall')) {
        r.cry = 1.4;
        r.cryIn = 5 + rand(this.seed, 'cry', r.i, Math.floor(this.age)) * 9;
        this.host.sound({ type: 'cry', x: r.person.x, z: r.person.z });
      }
    }
    if (this.beat === 'ashore' || this.beat === 'recall' || this.beat === 'away') this.runTown(dt, board, time);
    if (this.beat === 'ashore') this.fightBack(dt, board);
    this.afterBrawl(board);
    if (this.beat === 'ashore') {
      if (this.lootTargets.length === 0 && this.burnTargets.length === 0) this.chooseTargets(board);
      const busy = this.raiders.some((r) => r.where === 'jump' || r.where === 'wade-in' || r.where === 'aboard' && this.boatState.includes('row-in'));
      const work = this.burnTargets.some((t) => !t.done) || this.lootTargets.some((t) => !t.done && this.raiders.some((r) => (r.role === 'axe' || r.role === 'club') && r.trips < RAID.trips));
      if (!busy && (this.t >= RAID.ashore || (this.t >= 35 && !work) || (this.t >= 14 && this.nothing))) this.recall(board);
      if (this.stranded && !this.heartless && this.t > 0) this.loseHeart(board);
    }
    if (this.beat === 'recall' && this.stranded && !this.heartless) this.loseHeart(board);
    // Late ashore after they lost heart (still wading in when it happened): they turn and run with the rest.
    if (this.heartless) {
      for (const r of this.raiders) {
        if (r.where !== 'ashore' || !r.person || r.routed) continue;
        r.routed = true;
        r.cry = 0;
        board.drop(r.person);
        board.crowd.rethink(r.person);
      }
    }
    if (this.beat === 'recall' || this.beat === 'away') this.boardThose(board);
    // Never a stall: whoever is not back by the time the rest have waited long enough is left behind, and runs for the sea.
    if (this.beat === 'recall' && this.t > 25 && !this.heartless) this.leaveBehind(board);
    // Routed raiders at the water's edge go into the sea and swim off.
    for (const r of this.raiders) {
      if (!r.routed || r.where !== 'ashore' || !r.person) continue;
      const p = r.person;
      const tag = p.goal?.errand?.tag;
      // (Sent packing to the boat, and the boat has gone without him: into the sea all the same.)
      if (p.mode === 'linger' && (tag === 'raid:to-sea' || (tag === 'raid:board' && this.over(r.vessel)))) this.intoSea(r, board);
    }
    void chainId;
  }

  /** A brawl going on between a townsperson and a raider, and who loses it (the raider, mostly). */
  private brawl: { raider: Raider; champ: Person; raiderLoses: boolean; started: boolean; until: number } | null = null;
  private brawlIn = 12;
  /** Brawls so far, and raiders sent packing by them. */
  brawls = 0;
  beatenCount = 0;

  /**
   * The town fights back, comically: now and then the boldest townsperson near a raider (a guard of the
   * castle first) runs at him with a broom or a frying pan, and the two vanish into a dust-cloud brawl
   * (the scuffle, L50). Mostly the raider loses: he sits dazed with stars round his head, then runs for the
   * boat. Sometimes the townsperson does, and runs home. Nobody is hurt.
   */
  private fightBack(dt: number, board: Board): void {
    if (this.brawl) return;
    this.brawlIn -= dt;
    if (this.brawlIn > 0 || board.crowd.scuffles.now) return;
    this.brawlIn = 7 + rand(this.seed, 'brawl-in', this.brawls) * 7;
    let best: { r: Raider; q: Person; d: number } | null = null;
    for (const r of this.raiders) {
      const p = r.person;
      if (!p || r.role === 'chief' || r.routed || r.beaten || !p.visible || p.scuffle || p.inCloud || (p.mode !== 'walk' && p.mode !== 'linger')) continue;
      if (p.mode === 'walk' && p.walk && p.walk[p.at]!.kind !== 'move') continue;
      for (const q of board.crowd.people) {
        if (q.raider || q.child || !q.visible || q.scuffle || q.leaving || (q.mode !== 'walk' && q.mode !== 'linger')) continue;
        const guard = q.work?.job === 'guard';
        // The bold: a guard, or one in five of the rest.
        if (!guard && rand(q.seed, 'bold') > 0.2) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z) - (guard ? 3 : 0);
        if (d > 6 || Math.abs(q.y - p.y) > 0.9) continue;
        if (!best || d < best.d) best = { r, q, d };
      }
    }
    if (!best) return;
    const { r, q } = best;
    const p = r.person!;
    const nav = board.nav;
    if (!nav || !reaches(board, q, p.cell)) return;
    const c = board.centre(p.cell);
    const dx = q.x - p.x, dz = q.z - p.z, dd = Math.hypot(dx, dz) || 1;
    const spot = { x: Math.max(c.x - 0.45, Math.min(c.x + 0.45, p.x + (dx / dd) * 0.35)), z: Math.max(c.z - 0.45, Math.min(c.z + 0.45, p.z + (dz / dd) * 0.35)) };
    const brawl = { raider: r, champ: q, raiderLoses: q.work?.job === 'guard' || rand(this.seed, 'brawl', this.brawls) < 0.78, started: false, until: this.age + 20 };
    this.brawl = brawl;
    this.brawls++;
    this.fled.set(q, this.age + 40);
    board.assign(q, { chain: this.chainOf(board), at: 0, steps: [board.stepAt(p.cell, { spot, face: Math.atan2(-dx, -dz), pose: 'wave', linger: 1.2, brisk: true, tag: 'chase:brawl', done: () => {
      const rp = r.person;
      if (!rp || this.brawl !== brawl || Math.hypot(rp.x - q.x, rp.z - q.z) > 1.4) return false;
      // The raider stops where he is for it.
      if (board.crowd.scuffles.between(q, rp)) {
        brawl.started = true;
        r.cry = 1.2;
      }
    } })] });
  }

  /** A brawl over: the loser is dazed (the scuffle's stars), then goes: the raider for the boat, the townsperson home. */
  private afterBrawl(board: Board): void {
    const b = this.brawl;
    if (!b) return;
    const rp = b.raider.person;
    const on = (rp?.scuffle && rp.scuffle === b.champ.scuffle) || false;
    if (b.started && !on) {
      this.brawl = null;
      if (b.raiderLoses && rp) {
        b.raider.beaten = true;
        this.beatenCount++;
        board.drop(rp);
        board.crowd.rethink(rp);
      }
      // The townsperson goes home, the winner shaking a fist on the way.
      const home = board.homeStep(b.champ, { tag: b.raiderLoses ? 'chase:home' : 'flee:home', brisk: true });
      if (home) board.assign(b.champ, { chain: this.chainOf(board), at: 0, steps: [{ ...home, linger: 0 }] });
      return;
    }
    // Never got to blows (the raider walked off, the way was blocked): given up.
    if (!b.started && this.age > b.until) {
      this.brawl = null;
      if (board.plans.get(b.champ)?.chain.id === 'raid') board.drop(b.champ);
    }
  }

  /** The town's people within reach of the band run: indoors, or away down the streets. */
  private runTown(dt: number, board: Board, time: TimeSignal): void {
    this.fleeLook -= dt;
    if (this.fleeLook > 0) return;
    this.fleeLook = 0.5;
    const nav = board.nav;
    if (!nav) return;
    const threats = this.threats();
    if (threats.length === 0) return;
    const near = (x: number, z: number): number => Math.min(...threats.map((t) => Math.hypot(t.x - x, t.z - z)));
    for (const p of board.crowd.people) {
      if (p.raider || !p.visible || p.mode === 'gone' || p.mode === 'home' || p.mode === 'visit' || (p.mode as string) === 'thrown' || p.scuffle || p.leaving || p.shutIn) continue;
      if ((this.fled.get(p) ?? -Infinity) > this.age) continue;
      if (p.mode === 'walk' && p.walk && p.walk[p.at]!.kind !== 'move') continue;
      const tag = p.goal?.errand?.tag ?? '';
      if (tag.startsWith('fire:') || tag.startsWith('flee:') || tag.startsWith('chase:')) continue;
      const d = near(p.x, p.z);
      if (d > RAID.flee) continue;
      this.fled.set(p, this.age + 12);
      // Home if home is not where the raiders are; else away from them.
      const home = board.homeStep(p, { tag: 'flee:home', brisk: true });
      const hc = home ? board.centre(home.cell) : null;
      if (home && hc && near(hc.x, hc.z) > 3 && reaches(board, p, home.cell) && board.dist(p.cell, home.cell) < 26) {
        board.assign(p, { chain: this.chainOf(board), at: 0, steps: [{ ...home, linger: 0 }] });
        continue;
      }
      // Away: the nearest cell of their part well clear of every raider.
      let best: CellKey | null = null, bestD = Infinity;
      const part = p.node >= 0 ? nav.part[p.node]! : -1;
      for (let n = 0; n < nav.nodes.length; n += 2) {
        if (nav.part[n] !== part) continue;
        const c = nav.nodes[n]!.cell;
        const cx = keyX(c) + 0.5, cz = keyZ(c) + 0.5;
        if (near(cx, cz) < RAID.flee + 3) continue;
        const dd = Math.abs(cx - p.x) + Math.abs(cz - p.z);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (best === null) continue;
      const c = board.centre(best);
      const spot = { x: c.x + (rand(p.seed, 'flee', this.n) - 0.5) * 0.4, z: c.z + (rand(p.seed, 'flee-z', this.n) - 0.5) * 0.4 };
      const t = threats.reduce((a, b) => (Math.hypot(b.x - c.x, b.z - c.z) < Math.hypot(a.x - c.x, a.z - c.z) ? b : a));
      board.assign(p, { chain: this.chainOf(board), at: 0, steps: [board.stepAt(best, { spot, face: facing(spot, t), pose: p.child ? 'cover' : 'look', linger: 10 + rand(p.seed, 'flee-stay', this.n) * 8, brisk: true, tag: 'flee:away' })] });
    }
    void time;
  }

  private chainOf(board: Board): Chain {
    return board.chains.find((c) => c.id === 'raid') ?? board.chains[0]!;
  }

  /**
   * The sweep: the quarters of the town the parties go to (spread out, the market, the warehouses, a rich
   * house, the mill first), and in each what will burn (thatch and timber first) and what can be looted.
   */
  private chooseTargets(board: Board): void {
    const shape = board.shape, nav = board.nav;
    if (!shape || !nav) return;
    const d = this.host.director;
    const landings = this.site.landings;
    const part = nav.part[landings[0]!.node]!;
    const dist = (c: CellKey): number => Math.min(...landings.map((l) => Math.hypot(keyX(c) + 0.5 - l.x, keyZ(c) + 0.5 - l.z)));
    const all: (Target & { d: number; heat: number; burns: boolean; loots: boolean; x: number; z: number })[] = [];
    for (const [sid, st] of shape.structures) {
      const kind = st.kind;
      if (kind !== 'house' && kind !== 'stall' && kind !== 'windmill') continue;
      // Been through already by another party: nothing left in it.
      if (this.host.looted?.has(sid) && this.host.claimed?.get(sid) !== this.n) continue;
      const low = st.cells.reduce((a, b) => (keyY(b) < keyY(a) ? b : a));
      const dd = dist(low);
      if (dd > 26) continue;
      const site = st.cells.some((c) => shape.world.blocks.get(c)?.ruin);
      const stands = standsOf(board, sid);
      if (!stands.some((s2) => nav.part[nav.nodeAt.get(s2.cell) ?? -1] === part)) continue;
      const role = shape.roles.get(sid)?.role ?? kind;
      const doors = nav.doorsOf.get(sid) ?? [];
      const loots = site || doors.some((i) => nav.doors[i]!.node >= 0 && !nav.doors[i]!.hatch) || kind === 'stall';
      const burns = d.engine.canLight(low) && role !== 'chapel';
      const heat = kind === 'stall' ? 3 : kind === 'windmill' ? 2.2 : role === 'barn' || role === 'cottage' || role === 'mill-house' ? 1.8 : 1;
      all.push({ structure: sid, cell: low, role, by: null, done: false, quarter: 0, d: dd, heat, burns, loots, x: keyX(low) + 0.5, z: keyZ(low) + 0.5, ...(site ? { site: true } : {}) });
    }
    if (all.length === 0) return;
    // The quarters: from the landing, each as far from the others as it can be (and not too far in), the
    // places worth a raid preferred.
    const rich = new Set(['market-stall', 'fish-stall', 'flower-stall', 'warehouse', 'manor', 'town-hall', 'inn', 'shop', 'windmill', 'mill-house', 'barn']);
    const points: { x: number; z: number }[] = landings.map((l) => ({ x: l.x, z: l.z }));
    const qs: { x: number; z: number; cell: CellKey }[] = [];
    for (let k = 0; k < this.parties; k++) {
      let best: (typeof all)[number] | null = null, score = -Infinity;
      for (const t of all) {
        const near = Math.min(...points.map((q) => Math.hypot(q.x - t.x, q.z - t.z)));
        const sc = Math.min(near, 12) + (rich.has(t.role) ? 4 : 0) + (t.burns ? 1 : 0) + (t.site ? -2 : 0) - Math.max(0, t.d - 18) * 2 + rand(this.seed, 'quarter', t.structure) * 0.5;
        if (sc > score) {
          score = sc;
          best = t;
        }
      }
      if (!best) break;
      qs.push({ x: best.x, z: best.z, cell: best.cell });
      points.push({ x: best.x, z: best.z });
    }
    this.quarters = qs;
    for (const t of all) {
      let q = 0, qd = Infinity;
      qs.forEach((c, i) => {
        const dd = Math.hypot(c.x - t.x, c.z - t.z);
        if (dd < qd) {
          qd = dd;
          q = i;
        }
      });
      t.quarter = q;
    }
    // In each quarter, what burns best and nearest its middle first.
    const inQ = (t: (typeof all)[number]): number => Math.hypot(qs[t.quarter]!.x - t.x, qs[t.quarter]!.z - t.z);
    this.burnTargets = all.filter((t) => t.burns && inQ(t) < 7).sort((a, b) => inQ(a) / a.heat - inQ(b) / b.heat || a.structure - b.structure);
    this.nothing = all.length === 0;
    this.lootTargets = all.filter((t) => t.loots && inQ(t) < 8).sort((a, b) => (rich.has(a.role) ? -4 : 0) + inQ(a) - ((rich.has(b.role) ? -4 : 0) + inQ(b)) || a.structure - b.structure);
  }

  // ─────────────────────────────────────────── the garrison (sally.ts) ──

  /** Raiders held where they stand in a brawl with a soldier (hidden in its dust cloud). */
  readonly pinned = new Set<Raider>();
  /** The castle's garrison drove them off: back to the ship early, leaving what they took. */
  repelled = false;

  /** A soldier has him: he stops where he is, in the dust cloud. False if he cannot be held (thrown, gone). */
  pin(r: Raider, board: Board): boolean {
    const p = r.person;
    if (!p || r.where !== 'ashore' || (p.mode !== 'walk' && p.mode !== 'linger') || !p.visible || p.scuffle) return false;
    // Whatever he carried is dropped (it goes back to its owners).
    p.load = null;
    board.assign(p, { chain: this.chainOf(board), at: 0, steps: [board.stepAt(p.cell, { spot: { x: p.x, z: p.z }, face: NaN, pose: 'stand', linger: 1e6, tag: 'raid:brawl' })] });
    p.inCloud = true;
    this.pinned.add(r);
    return true;
  }

  /** The brawl over: he lost (dizzy on the ground a moment, then he runs for the ship) or won (he carries on). */
  unpin(r: Raider, lost: boolean, board: Board): void {
    if (!this.pinned.delete(r)) return;
    const p = r.person;
    if (!p) return;
    p.inCloud = false;
    if (!lost) {
      board.drop(p);
      board.crowd.rethink(p);
      return;
    }
    this.brawls++;
    board.assign(p, { chain: this.chainOf(board), at: 0, steps: [board.stepAt(p.cell, { spot: { x: p.x, z: p.z }, face: p.heading, pose: 'sit', linger: RAID.dazed, tag: 'raid:dazed', done: () => {
      r.beaten = true;
      this.beatenCount++;
      board.drop(p);
      board.crowd.rethink(p);
    } })] });
  }

  /** Driven off: the horn early, all back to the ship, nothing more burnt and nothing carried off. */
  repel(board: Board): void {
    if (this.repelled) return;
    this.repelled = true;
    this.burnTargets = [];
    this.lootTargets = [];
    // What they had taken is left where it lay (the pile cleared, nothing aboard).
    for (const r of this.raiders) {
      r.carry = null;
      if (r.person) r.person.load = null;
    }
    for (const pile of this.piles) {
      const store = board.stores.get(pile.key);
      if (store) while (board.take(store)) {
        // Back to their owners.
      }
    }
    if (this.beat === 'ashore' || this.beat === 'landing' || this.beat === 'sighted') this.recall(board);
  }

  /** The horn: all back to the ships. */
  private recall(board: Board): void {
    this.setBeat('recall');
    const chief = this.raiders.find((r) => r.role === 'chief');
    const at = chief?.person ?? null;
    this.host.sound({ type: 'horn', x: at?.x ?? this.site.landings[0]!.x, z: at?.z ?? this.site.landings[0]!.z, long: true });
    for (const r of this.raiders) {
      if (r.where !== 'ashore' || !r.person || this.pinned.has(r)) continue;
      r.cry = r.role === 'chief' ? 2.2 : 0;
      board.drop(r.person);
      board.crowd.rethink(r.person);
    }
  }

  /** Waited long enough: whoever is not back (blown away, carried off, lost in the lanes) is left behind and runs for the sea. */
  private leaveBehind(board: Board): void {
    this.heartless = true;
    for (const r of this.raiders) {
      if (r.where !== 'ashore' || this.pinned.has(r)) continue;
      r.routed = true;
      if (r.person && board.plans.has(r.person)) board.drop(r.person);
      if (r.person) board.crowd.rethink(r.person);
    }
    this.checkAllAboard(0);
    this.boats.forEach((_, i) => this.checkAllAboard(i + 1));
  }

  /** Stranded: the band loses heart, and the town chases them into the sea. */
  private loseHeart(board: Board): void {
    if (this.t < RAID.strandedWait && this.beat === 'ashore') return;
    this.heartless = true;
    this.setBeat('recall');
    for (const r of this.raiders) {
      if (r.where !== 'ashore' || !r.person || this.pinned.has(r)) continue;
      r.routed = true;
      r.cry = 0;
      board.drop(r.person);
      board.crowd.rethink(r.person);
    }
    // A few bold townspeople come after them, shaking their fists.
    const nav = board.nav;
    if (!nav) return;
    const chasers = board.crowd.people.filter((p) => !p.raider && !p.child && p.visible && (p.mode === 'walk' || p.mode === 'linger') && !p.scuffle).sort((a, b) => this.nearBand(a) - this.nearBand(b)).slice(0, 6);
    chasers.forEach((p, k) => {
      const l = this.site.landings[k % this.site.landings.length]!;
      const back = key(Math.floor(l.x - l.ox * 1), keyY(l.cell), Math.floor(l.z - l.oz * 1));
      const cell = nav.nodeAt.has(back) ? back : l.cell;
      if (!reaches(board, p, cell)) return;
      const c = board.centre(cell);
      const spot = { x: c.x + (k % 3 - 1) * 0.25, z: c.z + (Math.floor(k / 3) - 0.5) * 0.25 };
      this.fled.set(p, this.age + 60);
      board.assign(p, { chain: this.chainOf(board), at: 0, steps: [board.stepAt(cell, { spot, face: Math.atan2(l.ox, l.oz), pose: 'wave', linger: 14, brisk: true, tag: 'chase:shake' })] });
    });
  }

  private nearBand(p: Person): number {
    const t = this.threats();
    return t.length ? Math.min(...t.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) : 0;
  }

  /** A routed raider at the water's edge wades in and swims off over the edge of the map. */
  private intoSea(r: Raider, board: Board): void {
    const p = r.person!;
    this.boarded.add(p);
    board.unclaim(p);
    p.mode = 'gone';
    p.visible = false;
    r.person = null;
    const fig = r.fig!;
    const l = this.site.landings[r.landing]!;
    r.where = 'swim';
    r.t = 0;
    r.from = { x: p.x + l.ox * 0.6, y: SEA_Y, z: p.z + l.oz * 0.6 };
    const out = this.wayOut(r.from.x + l.ox, r.from.z + l.oz);
    r.to = { x: out.x, y: SEA_Y, z: out.z };
    r.dur = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) / 0.6;
    fig.setVisible(true);
    this.host.sound({ type: 'splash', x: r.from.x, z: r.from.z });
  }

  /** Raiders back at the water's edge go out to their vessel (taking up a piece of the pile as they go). */
  private boardThose(board: Board): void {
    for (const r of this.raiders) {
      if (r.where !== 'ashore' || !r.person || r.routed) continue;
      const p = r.person;
      // At his spot by the water, or near it and getting no nearer (the last of a lane by the shore): he goes.
      if (p.goal?.errand?.tag !== 'raid:board') continue;
      const sp = this.shorePoint(r);
      if (p.mode !== 'linger' && !(p.mode === 'walk' && Math.hypot(p.x - sp.x, p.z - sp.z) < 1.3 && (r.stepFor > 2.5 || p.stuck > 1))) continue;
      // His boat gone (sunk, or rowed off without him): another still on the shore, or the sea.
      if (this.over(r.vessel) && r.vessel > 0) {
        const other = this.boatState.indexOf('wait');
        if (other >= 0) {
          r.vessel = other + 1;
          r.landing = other;
          r.seat = this.freeSeat(other + 1);
          board.drop(p);
          board.crowd.rethink(p);
        } else this.intoSea(r, board);
        continue;
      }
      const v = this.vesselOf(r);
      const i = r.vessel - 1;
      // The vessel is still there to go to.
      if (r.vessel === 0 ? this.shipState !== 'beached' : this.boatState[i] !== 'wait') continue;
      const pile = board.stores.get(this.piles[r.landing]!.key);
      r.carry = this.repelled ? null : (p.load ?? (pile ? board.take(pile) : null));
      p.load = null;
      this.boarded.add(p);
      board.unclaim(p);
      p.mode = 'gone';
      p.visible = false;
      r.person = null;
      r.where = 'wade-out';
      r.t = 0;
      r.from = { x: p.x, y: p.y, z: p.z };
      const w = this.boardingPoint(r);
      r.to = { x: w.x, y: SEA_Y - 0.14, z: w.z };
      r.dur = Math.max(0.6, Math.hypot(w.x - p.x, w.z - p.z) / 0.9);
      r.fig?.pose(p.x, p.y, p.z, p.heading, 'walk', 0, { load: r.carry });
      void v;
    }
    // Whoever is left ashore with their way home gone (their vessel sunk while they were out): routed.
    if (this.stranded && !this.heartless) this.heartless = false;
  }

  // ───────────────────────────────────────────── plans for raiders ──

  /** The raid's chain asks: what does this raider do now? */
  offer(p: Person, board: Board, chain: Chain): Plan | null {
    const r = this.raiders.find((q) => q.person === p);
    if (!r) return null;
    const l = this.site.landings[r.landing]!;
    const steps: PlanStep[] = [];
    const plan = (s: PlanStep[]): Plan => ({ chain, at: 0, steps: s, fail: () => this.failed(r) });
    // Routed: down to the water and away.
    if (r.routed) {
      const edge = board.centre(l.cell);
      steps.push(board.stepAt(l.cell, { spot: { x: edge.x + l.ox * 0.3, z: edge.z + l.oz * 0.3 }, face: Math.atan2(l.ox, l.oz), pose: 'cover', linger: 0.4, brisk: true, load: p.load, tag: 'raid:to-sea' }));
      return plan(steps);
    }
    if (this.beat === 'recall' || this.beat === 'away') {
      const s = this.shorePoint(r);
      steps.push(board.stepAt(this.shoreOf(r).cell, { spot: { x: s.x, z: s.z }, face: Math.atan2(l.ox, l.oz), pose: 'stand', linger: 1e6, brisk: true, load: p.load, tag: 'raid:board' }));
      return plan(steps);
    }
    // Something in their hands: to the pile with it.
    if (p.load) {
      steps.push(this.pileStep(board, r, p.load, () => {
        r.there = false;
      }));
      return plan(steps);
    }
    // Beaten in a brawl: back to the boat, to wait for the others there.
    if (r.beaten) {
      const sp = this.shorePoint(r);
      steps.push(board.stepAt(this.shoreOf(r).cell, { spot: { x: sp.x, z: sp.z }, face: Math.atan2(l.ox, l.oz), pose: 'stand', linger: 1e6, brisk: true, tag: 'raid:board' }));
      return plan(steps);
    }
    // The charge: first up the shore a few cells with a roar.
    if (r.trips === 0 && r.fires === 0 && r.target === null && this.t < 6) {
      const c = this.charge(board, r);
      if (c !== null) {
        const at = board.centre(c);
        steps.push(board.stepAt(c, { spot: { x: at.x + (rand(this.seed, 'mx', r.i) - 0.5) * 0.5, z: at.z + (rand(this.seed, 'mz', r.i) - 0.5) * 0.5 }, face: Math.atan2(-l.ox, -l.oz), pose: 'cheer', linger: 0.9 + rand(this.seed, 'muster', r.i) * 0.6, brisk: true, tag: 'raid:charge' }));
        r.cry = 1.5;
        r.target = -1 as StructureId;
        return plan(steps);
      }
    }
    const nav = board.nav!;
    // Then on through the streets to their party's quarter, fanning out round it.
    const q = this.quarters[r.role === 'chief' ? this.chiefQuarter() : r.party % Math.max(1, this.quarters.length)];
    if (q && !r.there) {
      const cell = this.nearQuarter(board, p, q, r);
      if (cell !== null) {
        const at = board.centre(cell);
        steps.push(board.stepAt(cell, { spot: this.spread(at, r, 'there'), face: NaN, pose: 'cheer', linger: 0.7, brisk: true, tag: 'raid:quarter', done: () => {
          r.there = true;
          r.cry = 1.5;
        } }));
        return plan(steps);
      }
      r.there = true;
    }
    if (r.role === 'chief') {
      // The chief stands in the middle of it all, his standard up, roaring them on, and moves about a little.
      const cell = q ? this.nearQuarter(board, p, q, r) : l.cell;
      const c = cell ?? l.cell;
      steps.push(board.stepAt(c, { spot: this.spread(board.centre(c), r, Math.floor(this.age / 6)), face: NaN, pose: 'cheer', linger: 5, tag: 'raid:chief' }));
      return plan(steps);
    }
    const mine = (t: Target): boolean => t.quarter === r.party % Math.max(1, this.quarters.length);
    if (r.role === 'brand') {
      const t = this.takeTarget(this.burnTargets, r, board, () => this.burnt < this.burnWant, mine);
      if (t) {
        const s2 = this.standFor(board, p, t.structure);
        if (s2) {
          const at = board.centre(s2.cell);
          steps.push(board.stepAt(s2.cell, { spot: this.spread(at, r, t.structure), face: s2.face, pose: 'wave', linger: 1.1, brisk: true, tag: 'raid:burn', done: () => {
            t.done = true;
            t.by = null;
            r.target = null;
            const lit = !this.repelled && this.host.director.ignite(t.cell);
            if (lit) {
              this.burnt++;
              r.fires++;
            }
          } }));
          return plan(steps);
        }
        t.done = true;
      }
    } else {
      const t = r.trips < RAID.trips ? this.takeTarget(this.lootTargets, r, board, () => true, mine) : null;
      if (t) {
        // A building site: the scaffolding kicked about (it is a stage worse), a ladder or a hod carried off.
        if (t.site) {
          const s2 = this.standFor(board, p, t.structure);
          if (s2) {
            const at = board.centre(s2.cell);
            steps.push(board.stepAt(s2.cell, { spot: this.spread(at, r, t.structure), face: s2.face, pose: 'kick', linger: 1.4, brisk: true, tag: 'raid:wreck', done: () => {
              this.host.director.knock(t.cell);
            } }));
            steps.push(this.pileStep(board, r, rand(this.seed, 'site', t.structure, r.i) < 0.5 ? 'ladder' : 'hod', () => {
              t.done = true;
              t.by = null;
              r.target = null;
              r.there = false;
            }));
            return plan(steps);
          }
          t.done = true;
        }
        const loot = this.lootFor(t, r);
        const door = (nav.doorsOf.get(t.structure) ?? []).map((i) => nav.doors[i]!).find((dr) => dr.node >= 0 && !dr.hatch && reaches(board, p, nav.nodes[dr.node]!.cell));
        this.host.looted?.add(t.structure);
        const toPile = this.pileStep(board, r, loot, () => {
          t.done = true;
          t.by = null;
          r.target = null;
          // Back to their quarter for more.
          r.there = false;
        });
        if (door && door.dir !== undefined) {
          const cell = nav.nodes[door.node]!.cell;
          const c = board.centre(cell);
          const [dx, dz] = DIR4[door.dir]!;
          // In front of the door, facing it: a kick, in, and out with the goods.
          const spot = { x: c.x - dx * 0.22, z: c.z - dz * 0.22 };
          steps.push(board.stepAt(cell, { spot, face: DIR_HEADING[(door.dir + 2) % 4 as 0 | 1 | 2 | 3], pose: 'kick', linger: RAID.kick, brisk: true, tag: 'raid:kick' }));
          const inside = board.stepIn(t.structure, { cell, pose: 'stand', linger: RAID.inside, tag: 'raid:loot' });
          if (inside) steps.push(inside);
          steps.push(toPile);
          return plan(steps);
        }
        // A stall: taken off its counter where it stands.
        const s2 = this.standFor(board, p, t.structure);
        if (s2) {
          const at = board.centre(s2.cell);
          steps.push(board.stepAt(s2.cell, { spot: this.spread(at, r, t.structure), face: s2.face, pose: 'tend', linger: 1.2, brisk: true, tag: 'raid:grab', done: () => {
            this.emptied.add(t.structure);
            // On market day the baskets on its counter go too (put back when the raid is over).
            const at2 = board.centre(t.cell);
            for (const [key2, store] of board.stores) {
              if (!key2.startsWith('market:') || !store.spots.some((sp) => Math.hypot(sp.x - at2.x, sp.z - at2.z) < 1.2)) continue;
              for (let k = 0; k < 3; k++) {
                const it = board.take(store);
                if (it) this.taken.push({ key: key2, load: it });
              }
            }
          } }));
          steps.push(toPile);
          return plan(steps);
        }
        t.done = true;
      }
    }
    // Nothing left to do here: swagger about the quarter, weapon up, roaring.
    const c = (q ? this.nearQuarter(board, p, q, r) : null) ?? this.charge(board, r) ?? l.cell;
    steps.push(board.stepAt(c, { spot: this.spread(board.centre(c), r, Math.floor(this.age / 4)), face: NaN, pose: 'cheer', linger: 3, tag: 'raid:roam' }));
    return plan(steps);
  }

  /** The buildings this party went for (no other party goes for them while raids are on). */
  readonly took = new Set<StructureId>();
  /** Stalls their goods were taken from, and the market's baskets taken off their counters (put back at the end). */
  readonly emptied = new Set<StructureId>();
  /** The town offered nothing at all to burn or take: the horn goes early. */
  private nothing = false;
  private taken: { key: string; load: Load }[] = [];

  /** The quarter nearest the town's heart: where the chief stands with his standard. */
  private chiefQuarter(): number {
    const h = this.site.heart;
    let best = 0, bd = Infinity;
    this.quarters.forEach((q, i) => {
      const d = Math.hypot(q.x - h.x, q.z - h.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** A walkable cell near a quarter's middle, a different one for each raider (they fan out, never in a queue). */
  private nearQuarter(board: Board, p: Person, q: { x: number; z: number; cell: CellKey }, r: Raider): CellKey | null {
    const nav = board.nav!;
    const cands: { c: CellKey; d: number }[] = [];
    const y0 = keyY(q.cell);
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (const y of [y0, y0 - 1, y0 + 1]) {
          if (y < 0) continue;
          const c = key(Math.floor(q.x) + dx, y, Math.floor(q.z) + dz);
          if (nav.nodeAt.has(c) && reaches(board, p, c)) cands.push({ c, d: Math.hypot(dx, dz) + rand(this.seed, 'fan', r.i, c) * 1.5 });
        }
      }
    }
    if (cands.length === 0) return null;
    cands.sort((a, b) => a.d - b.d || a.c - b.c);
    return cands[(r.i * 3) % Math.min(cands.length, 8)]!.c;
  }

  /** A spot in a cell, off its middle by the raider's own amount (no two stand on one spot). */
  private spread(at: { x: number; z: number }, r: Raider, what: number | string): { x: number; z: number } {
    return { x: at.x + (rand(this.seed, 'sx', r.i, what) - 0.5) * 0.55, z: at.z + (rand(this.seed, 'sz', r.i, what) - 0.5) * 0.55 };
  }

  /** Where to stand at a building to set it alight or take from it: its free side nearest the raider. */
  private standFor(board: Board, p: Person, sid: StructureId): { cell: CellKey; face: number } | undefined {
    const busy = new Set(this.raiders.filter((o) => o.person && o.person !== p && o.person.goal?.errand).map((o) => o.person!.goal!.errand!.cell));
    return standsOf(board, sid)
      .filter((x) => reaches(board, p, x.cell))
      .sort((a, b) => (busy.has(a.cell) ? 6 : 0) + board.dist(a.cell, p.cell) - ((busy.has(b.cell) ? 6 : 0) + board.dist(b.cell, p.cell)))[0];
  }

  /** Back to the boats with the loot, onto the pile there (or, the pile full, holding it by the boat). */
  private pileStep(board: Board, r: Raider, loot: Load, after: () => void): PlanStep {
    const l = this.shoreOf(r);
    const pile = this.piles[r.landing]!;
    const lc = board.centre(l.cell);
    return board.stepAt(l.cell, { spot: { x: lc.x - l.ox * 0.15 + (rand(this.seed, 'px', r.i, r.trips) - 0.5) * 0.4, z: lc.z - l.oz * 0.15 + (rand(this.seed, 'pz', r.i, r.trips) - 0.5) * 0.4 }, face: Math.atan2(l.ox, l.oz), pose: 'tend', linger: 0.6, load: loot, brisk: true, tag: 'raid:pile', done: (q) => {
      const store = board.stores.get(pile.key);
      if (this.repelled) q.load = null;
      else if (store && q.load && board.put(store, q.load)) q.load = null;
      else if (q.load) {
        // The pile is full: it goes aboard with them later.
        r.carry = q.load;
        q.load = null;
      }
      r.trips++;
      after();
    } });
  }

  private failed(r: Raider): void {
    // Its building is gone or out of reach: given up; the next plan is asked for.
    for (const t of [...this.burnTargets, ...this.lootTargets]) if (t.by === r) {
      t.by = null;
      t.done = true;
    }
    r.target = null;
  }

  private takeTarget(list: Target[], r: Raider, board: Board, more: () => boolean, mine: (t: Target) => boolean = () => true): Target | null {
    if (!more()) return null;
    const p = r.person!;
    let best: Target | null = null, bestD = Infinity;
    const claimed = this.host.claimed;
    for (const t of list) {
      if (t.done || (t.by && t.by !== r)) continue;
      // Another party is at it (or has been): theirs.
      const owner = claimed?.get(t.structure);
      if (owner !== undefined && owner !== this.n) continue;
      // Their own quarter first; another's only when theirs is done.
      const d = board.dist(t.cell, p.cell) + (t.by === r ? -100 : 0) + (mine(t) ? 0 : 40);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      best.by = r;
      r.target = best.structure;
      claimed?.set(best.structure, this.n);
      this.took.add(best.structure);
    }
    return best;
  }

  private lootFor(t: Target, r: Raider): Load {
    const list = LOOT_BY_ROLE[t.role] ?? LOOT_HOME;
    return list[Math.floor(rand(this.seed, 'loot', t.structure, r.i, r.trips) * list.length)]!;
  }

  /** A cell a few steps up from the landing, for the charge and the chief. */
  private charge(board: Board, r: Raider): CellKey | null {
    const nav = board.nav;
    if (!nav) return null;
    const l = this.site.landings[r.landing]!;
    for (const k of [3, 2, 4, 1]) {
      const side = (r.i % 3) - 1;
      const x = Math.floor(l.x - l.ox * k - l.oz * side), z = Math.floor(l.z - l.oz * k + l.ox * side);
      for (const y of [keyY(l.cell), keyY(l.cell) + 1, keyY(l.cell) - 1]) {
        const c = key(x, Math.max(0, y), z);
        if (nav.nodeAt.has(c) && reaches(board, r.person!, c)) return c;
      }
    }
    return null;
  }

  // ───────────────────────────────────────────────────────── the end ──

  /** Over: every drawing hidden (the system lets them go a frame later, so nothing goes while it is drawn). */
  hideAll(): void {
    // A ship left lying on the land goes in a cloud of dust (the town hauls it off), as the harbour's does.
    for (const v of this.vessels) {
      if (!v.aground) continue;
      const x = v.x, y = v.aground.ground, z = v.z, big = v.length * 0.5;
      fxOf(this.host.stage).play({ actor: 'puff', variant: 'dust' }, 1.2, (t, out) => place(x, y + 0.3 + t * 0.6, z, 0, big * (0.6 + t), big * (0.5 + t * 0.6), big * (0.6 + t), out));
    }
    for (const e of this.escapees) e.h.setVisible(false);
    for (const r of this.raiders) r.fig?.hideAll();
    for (const v of this.vessels) v.hideAll();
  }

  /** Ends it now, everything put away (undo, a new town, a raid called off). */
  end(board: Board | null): void {
    if (this.ended) return;
    this.ended = true;
    this.beat = 'done';
    for (const r of this.pinned) if (r.person) r.person.inCloud = false;
    this.pinned.clear();
    for (const r of this.raiders) {
      r.fig?.release();
      r.fig = null;
      if (r.person && r.person.mode !== 'gone') {
        board?.unclaim(r.person);
        board?.drop(r.person);
        r.person.load = null;
        r.person.mode = 'gone';
        r.person.visible = false;
      }
      r.person = null;
    }
    for (const e of this.escapees) e.h.release();
    this.escapees.length = 0;
    for (const v of this.vessels) v.release();
    if (board) {
      for (const p of this.piles) {
        const s = board.stores.get(p.key);
        if (s) while (board.take(s)) {
          // Cleared.
        }
      }
      // The market's baskets back on their counters: the traders fetch more.
      for (const t of this.taken) {
        const s = board.stores.get(t.key);
        if (s) board.put(s, t.load);
      }
      this.taken = [];
      // Anybody still running from them goes about their day.
      for (const [p] of this.fled) {
        const plan = board.plans.get(p);
        if (plan && plan.chain.id === 'raid') board.drop(p);
      }
    }
    this.fled.clear();
  }
}

/** Where the loot piles up at a landing: on the shore cell, round its landward side. */
function pileSpots(l: Landing): Spot[] {
  const out: Spot[] = [];
  const bx = l.x - l.ox * 0.18, bz = l.z - l.oz * 0.18;
  // A heap: a bottom row of five, three on them, two, one on top; and two leaning against it.
  const offs: [number, number, number][] = [[-0.36, 0, 0], [-0.18, 0, 0.02], [0, 0, 0], [0.18, 0, 0.02], [0.36, 0, 0], [-0.27, 0.12, -0.02], [0, 0.12, -0.02], [0.27, 0.12, -0.02], [-0.13, 0.24, -0.04], [0.13, 0.24, -0.04], [0, 0.35, -0.06], [0, 0, -0.26]];
  for (const [a, up, back] of offs) {
    out.push({ x: bx - l.oz * a - l.ox * back, y: l.y + up + 0.01, z: bz + l.ox * a - l.oz * back, yaw: Math.atan2(l.ox, l.oz) + a * 2 });
  }
  return out;
}

