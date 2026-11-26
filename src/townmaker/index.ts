// Grow a town (design section 15a): growTown(terrain, seed) returns an
// ordered list of ordinary edits that fills the island with a complete town
// showing off every building combination the rules know.
//
// How it plans:
//   1. read the island (site.ts): water distance, exposure, the hill, flat ground;
//   2. lay districts as stamps, each searching the whole island for the
//      place that suits it (the square on the flattest ground near the
//      middle, the castle on the highest flat ground, the harbour where the
//      shore is straight, the lighthouse on the most exposed point, …);
//      every stamp checks its footprint and skips what does not fit;
//   3. join every district's ways in to the streets already joined to the
//      square, nearest district first (route.ts);
//   4. fill the free ground along the streets with cottages, densely near
//      the square and thinning outward, then plant trees;
//   5. order the edits for watching: district by district outward from the
//      square, each district's ground first, then its buildings bottom-up.
//
// Pure and seeded: it uses only rand(seed, …), and every edit passed
// canApply against the town as grown so far, so the result is exactly a
// town a player could have built (on an empty island of this terrain).

import { columnIndex, key, type CellKey } from '@/core/grid';
import type { Edit, Terrain } from '@/core/world';
import { rollCharacter, type Character } from './character';
import { buildCastle } from './districts/castle';
import { buildForum, forumFootprint, lastForumForm, SIZES, type Size } from './districts/forum';
import { levelSite } from './levelling';
import { buildBarn, buildFields, buildFollyTower, buildOrchard, buildPark, buildSchool, buildSmithy, buildVillageGreen } from './districts/village';
import { buildFlowerBed, buildGreenhouse, buildManor, buildMill, buildPaddock, buildStairs, buildTrees, buildWalledGarden, buildWalledLawn, buildWillow } from './districts/country';
import { buildFarmstead, reserveFarmstead } from './districts/farmstead';
import { buildHarbour, buildWaterfront } from './districts/harbour';
import { buildPort, buildShipyard } from './districts/port';
import { buildColonnade, buildFishMarket, buildMarketPlace, buildMonument, buildQuayStretch, buildShrine, buildTownWall, buildTreeLines, buildWallTower, buildWheatFarm, buildWheatField, buildWoods } from './districts/emphasis';
import { buildWatermill } from './districts/riverside';
import { buildGreatMarket, buildRiverFront, buildTerraceRow, buildVegPlot, buildVillageCentre } from './districts/character2';
import { buildRiverside } from './districts/riverside';
import { buildCourtyard, buildHousing } from './districts/housing';
import { buildInfill } from './districts/infill';
import { buildMillCorner } from './districts/mill-corner';
import { buildWindmills } from './districts/mills';
import { buildAcropolis, buildChapel, buildCliffHouse, buildHilltop, buildLighthouse, buildWatchtower } from './districts/monuments';
import { buildSmallSquare, buildSquare } from './districts/square';
import { buildBoardwalk, buildBridge, buildInhabitedBridge, buildJetty, buildViaduct } from './districts/water';
import { Grower, type Made } from './grower';
import { joinedStreets, route } from './route';
import { readSite } from './site';
import { fromSquare, type District, type Town } from './town';

export interface GrownTown {
  edits: Edit[];
  /** Each district, with a column near its middle and how many edits it made. */
  districts: readonly { name: string; x: number; z: number; edits: number }[];
  /** Edits the generator tried that were not legal (it adapted round them). */
  refused: number;
  /** Districts that could not be joined to the square by a street. */
  unjoined: string[];
  /** True if the watching order had to fall back to the order the town was made in. */
  fellBack: boolean;
  /** The middle of the market square (its plaza), if one was laid. */
  square: { x: number; z: number; h: number } | null;
  /** What each column was claimed for (CLAIM bits), for tools and tests. */
  claims: Uint8Array;
  /** The town's character, and the one that flavours it (character.ts, README.md). */
  character: Character;
  secondary: Character;
  /** A marble city's forum form ('17×7' … 'compact'), or null. */
  forum: string | null;
  /** Column-levels of earth the planner moved to seat the forum (0: none). */
  levelled: number;
}

export interface GrowOptions {
  /** The characters the dice showed already, oldest first: not rolled again until every character the island suits has been shown. */
  avoid?: readonly Character[];
  /** A character never to roll (the planner's own fallback when a marble city has no site for its forum). */
  never?: Character;
  /** Grow this character whatever the island leans to (scenarios, tools). */
  character?: Character;
  /** Internal: this plan grows on ground the planner levelled (no second levelling). */
  levelled?: boolean;
}

export function growTown(terrain: Terrain, seed: number, opts: GrowOptions = {}): Edit[] {
  return planTown(terrain, seed, opts).edits;
}

type Step = (town: Town) => unknown;

/** Every district the planner can ask for, by name. `name:n` asks again (a second barn, a second row). */
const STEPS: Record<string, Step> = {
  square: (t) => buildSquare(t) || buildSmallSquare(t),
  forum: (t) => buildForum(t) || buildSquare(t) || buildSmallSquare(t),
  willow: buildWillow,
  hilltop: buildHilltop,
  cliff: buildCliffHouse,
  castle: buildCastle,
  acropolis: buildAcropolis,
  millCorner: (t) => buildMillCorner(t, t.districts.length),
  manor: buildManor,
  harbour: (t) => buildHarbour(t, false),
  greatHarbour: (t) => buildHarbour(t, true),
  lighthouse: buildLighthouse,
  riverside: buildRiverside,
  courtyard: (t) => buildCourtyard(t, 0, 8),
  chapel: buildChapel,
  mill: buildMill,
  greenhouse: buildGreenhouse,
  walledGarden: buildWalledGarden,
  boardwalk: buildBoardwalk,
  bridge: buildBridge,
  jetty: buildJetty,
  watchtower: buildWatchtower,
  paddock: buildPaddock,
  stairs: buildStairs,
  viaduct: buildViaduct,
  green: (t) => buildVillageGreen(t),
  barn: (t) => buildBarn(t, t.districts.length),
  orchard: (t) => buildOrchard(t, t.districts.length),
  smithy: (t) => buildSmithy(t),
  school: (t) => buildSchool(t),
  fields: (t) => buildFields(t),
  park: (t) => buildPark(t),
  inhabitedBridge: buildInhabitedBridge,
  farmstead: reserveFarmstead,
  follyTower: buildFollyTower,
  walledLawn: buildWalledLawn,
  quay: (t) => buildQuayStretch(t, t.districts.length),
  waterfront: (t) => buildWaterfront(t, t.districts.length),
  fishMarket: buildFishMarket,
  townWall: (t) => buildTownWall(t, 9) || buildTownWall(t, 8) || buildTownWall(t, 11),
  wallTower: (t) => buildWallTower(t, t.districts.length),
  colonnade: (t) => buildColonnade(t, t.districts.length),
  shrine: (t) => buildShrine(t, t.districts.length),
  monument: (t) => buildMonument(t, t.districts.length),
  marketPlace: (t) => buildMarketPlace(t, t.districts.length),
  wheatFarm: (t) => buildWheatFarm(t, t.districts.length),
  wheatField: (t) => buildWheatField(t, t.districts.length),
  smallSquare: (t) => buildSmallSquare(t) || buildSquare(t),
  village: (t) => buildVillageCentre(t) || buildSmallSquare(t) || buildSquare(t),
  vegPlot: (t) => buildVegPlot(t, t.districts.length),
  riverFront: buildRiverFront,
  terraceRow: (t) => buildTerraceRow(t, t.districts.length),
  greatMarket: buildGreatMarket,
  watermill: buildWatermill,
  flowers: (t) => buildFlowerBed(t, t.districts.length),
  // The working waterfront (port.ts): a container port a freighter can berth at (else a shorter one), a shipyard.
  port: (t) =>
    buildPort(t, 'port', { lens: [14, 13, 12, 11, 10], depths: [5, 4], stores: 2, lineUp: 8 }) ||
    buildPort(t, 'port', { lens: [14, 13, 12, 11, 10], depths: [5, 4], stores: 2 }) ||
    buildPort(t, 'port', { lens: [9, 8, 7, 6], depths: [5, 4], stores: 1 }),
  smallPort: (t) => buildPort(t, 'port', { lens: [9, 8, 7, 6], depths: [4], stores: 1, reach: 22 }),
  shipyard: (t) => buildShipyard(t, 'shipyard'),
};

/**
 * The plans, in priority order: the first districts get the best ground,
 * the rest fit where they can or are left out. `housing:n:d` is a housing
 * block about d steps from the square. See README.md for what each town is.
 */
const PLANS: Record<Character, readonly string[]> = {
  harbour: ['square', 'port', 'shipyard', 'greatHarbour', 'quay:1', 'quay:2', 'waterfront:1', 'quay:3', 'lighthouse', 'waterfront:2', 'fishMarket', 'willow', 'housing:0:8', 'chapel', 'courtyard', 'smithy', 'jetty', 'jetty:1', 'boardwalk', 'bridge', 'quay:4', 'riverside', 'housing:1:11', 'orchard', 'walledGarden'],
  marble: ['forum', 'willow', 'acropolis', 'shrine:1', 'shrine:2', 'shrine:4', 'follyTower', 'housing:0:9', 'courtyard', 'viaduct', 'shrine:3', 'chapel', 'walledGarden', 'walledLawn', 'harbour', 'lighthouse', 'manor', 'courtyard:1', 'housing:1:12', 'viaduct:1', 'bridge', 'boardwalk', 'stairs'],
  castle: ['square', 'castle', 'smithy', 'chapel', 'wallTower', 'wallTower:1', 'hilltop', 'watchtower', 'housing:0:8', 'housing:1:11', 'walledGarden', 'walledLawn', 'wallTower:2', 'watchtower:1', 'cliff', 'harbour', 'lighthouse', 'willow', 'stairs', 'bridge', 'courtyard', 'walledLawn:1', 'fields', 'orchard'],
  market: ['square', 'greatMarket', 'housing:0:8', 'housing:1:10', 'millCorner', 'orchard', 'courtyard', 'school', 'chapel', 'smithy', 'courtyard:1', 'inhabitedBridge', 'harbour', 'smallPort', 'lighthouse', 'housing:2:13', 'fields', 'greenhouse', 'willow', 'bridge', 'stairs'],
  river: ['square', 'riverside', 'bridge', 'bridge:1', 'bridge:2', 'inhabitedBridge', 'inhabitedBridge:1', 'watermill', 'watermill:1', 'mill', 'shipyard', 'orchard', 'riverFront', 'willow', 'bridge:3', 'housing:0:9', 'chapel', 'park', 'orchard:1', 'harbour', 'lighthouse', 'greenhouse', 'boardwalk', 'courtyard', 'housing:1:12', 'walledGarden'],
  farming: ['village', 'green', 'chapel', 'wheatFarm', 'wheatField', 'millCorner', 'wheatField:1', 'orchard', 'wheatFarm:1', 'orchard:1', 'paddock', 'wheatField:2', 'wheatField:3', 'vegPlot', 'barn', 'orchard:2', 'wheatField:4', 'vegPlot:1', 'barn:1', 'greenhouse', 'vegPlot:2', 'smithy', 'willow', 'lighthouse', 'harbour'],
  hill: ['square', 'hilltop', 'terraceRow', 'terraceRow:1', 'terraceRow:2', 'terraceRow:3', 'castle', 'terraceRow:4', 'stairs', 'stairs:1', 'stairs:2', 'cliff', 'cliff:1', 'terraceRow:5', 'wallTower', 'chapel', 'viaduct', 'viaduct:1', 'terraceRow:6', 'acropolis', 'millCorner', 'follyTower', 'cliff:2', 'watchtower', 'stairs:3', 'terraceRow:7', 'housing:0:9', 'harbour', 'lighthouse', 'willow', 'bridge'],
  gardens: ['square', 'manor', 'park', 'millCorner', 'park:1', 'walledGarden', 'walledLawn', 'greenhouse', 'orchard', 'fields', 'school', 'walledGarden:1', 'greenhouse:1', 'park:2', 'orchard:1', 'walledLawn:1', 'follyTower', 'housing:0:9', 'chapel', 'harbour', 'lighthouse', 'willow', 'courtyard', 'boardwalk', 'bridge', 'paddock'],
};

/** Districts that need the streets laid first (they stand beside one, or are crossed by them). */
const AFTER_STREETS: Record<Character, readonly string[]> = {
  harbour: [],
  marble: ['colonnade', 'colonnade:1', 'colonnade:2', 'monument', 'monument:1', 'monument:2'],
  castle: ['townWall'],
  market: ['marketPlace', 'marketPlace:1', 'marketPlace:2', 'marketPlace:3', 'flowers'],
  river: [],
  farming: [],
  hill: [],
  gardens: ['flowers', 'flowers:1', 'flowers:2', 'flowers:3'],
};

/** How wooded the town's leftover land is, and how many of its outer streets are lined with trees. */
const WOODS: Record<Character, { woods: number; lines: number; linesFrom: number }> = {
  harbour: { woods: 0.6, lines: 0.35, linesFrom: 9 },
  marble: { woods: 0.6, lines: 0.6, linesFrom: 6 },
  castle: { woods: 0.75, lines: 0.35, linesFrom: 9 },
  market: { woods: 0.8, lines: 0.6, linesFrom: 6 },
  river: { woods: 0.85, lines: 0.5, linesFrom: 8 },
  farming: { woods: 0.75, lines: 0.75, linesFrom: 7 },
  hill: { woods: 0.7, lines: 0.4, linesFrom: 8 },
  gardens: { woods: 1, lines: 0.9, linesFrom: 4 },
};

/** Extra housing blocks after the plan (the second number is the last block's index): fewer where the theme needs the room. */
const MORE_HOUSING: Record<Character, number> = { harbour: 3, marble: 3, castle: 3, market: 5, river: 4, farming: 1, hill: 3, gardens: 3 };

/** What a secondary character adds: its showpieces, after the primary's first few districts. */
const FLAVOUR: Record<Character, readonly string[]> = {
  harbour: ['greatHarbour'],
  marble: ['acropolis', 'shrine:5'],
  castle: ['castle', 'smithy'],
  market: ['school', 'courtyard:1'],
  river: ['riverside', 'inhabitedBridge'],
  farming: ['barn', 'orchard'],
  hill: ['hilltop', 'cliff'],
  gardens: ['park', 'fields'],
};

/** How thickly cottages fill the streets, by character. */
const INFILL: Record<Character, number> = { harbour: 1, marble: 1, castle: 1, market: 1.1, river: 1, farming: 0.35, hill: 0.9, gardens: 0.7 };

/** The plan for a primary and a secondary character. */
export function planFor(primary: Character, secondary: Character): string[] {
  const plan = [...PLANS[primary]];
  const family = (k: string): string => (k === 'greatHarbour' ? 'harbour' : k.split(':')[0]!);
  const extra = primary === 'farming' ? [] : FLAVOUR[secondary].filter((k) => !plan.some((p) => p === k || (family(p) === family(k) && family(k) !== 'housing' && !k.includes(':'))));
  plan.splice(3, 0, ...extra);
  // A great harbour replaces the plain one.
  if (plan.includes('greatHarbour')) return plan.filter((k) => k !== 'harbour');
  return plan;
}

export function planTown(terrain: Terrain, seed: number, opts: GrowOptions = {}): GrownTown {
  const g = new Grower(terrain, seed);
  const site = readSite(terrain);
  const { primary, secondary } = rollCharacter(site, seed, opts.avoid, opts.character, opts.never);
  // One town in five has no fountain anywhere, so the hand pump (D33, which needs a town without one) shows too.
  const town: Town = { g, site, square: null, districts: [], pumps: ((seed % 5) + 5) % 5 === 3 && primary !== 'marble', marketCross: primary === 'market' || secondary === 'market' };

  const plan = planFor(primary, secondary);
  // A marble city stands or falls by its forum. With no flat ground for one, level a terrace for it
  // (levelling.ts): the grand form where the earthwork is modest, else the compact one. Only with no
  // site at all does the planner grow another kind of town.
  if (primary === 'marble' && plan[0] === 'forum' && !buildForum(town)) {
    if (!opts.levelled) {
      const near = site.centre;
      // Modest earthwork first (two levels at most); then, for the compact form on a steep island, three.
      const tries: [Size, number, number][] = [
        [SIZES[2]!, 2, 0.9],
        [SIZES[3]!, 2, 0.9],
        [SIZES[3]!, 3, 1.4],
        [SIZES[3]!, 3, 1.6],
      ];
      for (const [i, [size, maxDelta, share]] of tries.entries()) {
        const { w, d } = forumFootprint(size);
        // The last try: right to the shore, on a narrow island.
        const lev = levelSite(terrain, site, w, d, near, { maxDelta, maxCost: Math.round(w * d * share), tight: i === tries.length - 1 });
        if (!lev) continue;
        const grown = planTown(lev.terrain, seed, { ...opts, character: 'marble', levelled: true });
        if (grown.character === 'marble' && grown.districts.some((x) => x.name === 'square') && grown.forum) {
          return { ...grown, character: 'marble', edits: [...lev.edits, ...grown.edits], levelled: lev.cost };
        }
      }
    }
    if (!opts.character) return planTown(terrain, seed, { avoid: opts.avoid, never: 'marble' });
  }
  const forum = primary === 'marble' ? lastForumForm : null;
  if (primary === 'marble' && town.square) plan.shift();
  // On ground levelled for it, the castle takes its terrace before the square can.
  if (primary === 'castle' && opts.levelled) plan.sort((a, b) => (b === 'castle' ? 1 : 0) - (a === 'castle' ? 1 : 0));
  for (const step of plan) {
    const [name, a, b] = step.split(':');
    if (name === 'housing') buildHousing(town, Number(a), Number(b));
    else STEPS[name!]?.(town);
  }
  // A castle town with no castle (no site fits it) is no castle town: grow another kind.
  if (primary === 'castle' && !opts.levelled && !town.districts.some((d) => d.name === 'castle')) {
    // Level a knoll for a small castle (6 × 7) before giving up on it.
    // Toward the high ground, away from the square (a castle stands apart, its gate eight or more from it).
    let high: [number, number] = [24, 24];
    for (let i = 0, best = -1; i < 48 * 48; i++) if (terrain.height[i]! > best) [best, high] = [terrain.height[i]!, [i % 48, Math.floor(i / 48)]];
    for (const [maxDelta, near] of [[2, high], [3, high], [3, site.centre]] as const) {
      const lev = levelSite(terrain, site, 6, 7, near, { maxDelta, maxCost: 6 * 7 * 1.5 });
      if (!lev) continue;
      const grown = planTown(lev.terrain, seed, { ...opts, character: 'castle', levelled: true });
      if (grown.districts.some((d) => d.name === 'castle')) return { ...grown, edits: [...lev.edits, ...grown.edits], levelled: lev.cost };
    }
  }
  if (primary === 'castle' && !opts.character && !opts.never && !town.districts.some((d) => d.name === 'castle')) {
    return planTown(terrain, seed, { avoid: opts.avoid, never: 'castle' });
  }
  for (let n = 2; n <= MORE_HOUSING[primary]; n++) buildHousing(town, n, 8 + n * 2);
  let unjoined = joinStreets(town);
  for (const step of AFTER_STREETS[primary]) STEPS[step.split(':')[0]!]?.(town);
  // Windmills in every town (Derek, 2026-11-21), once the streets are joined (each mill stands within a short
  // walk of them) and the kind's street pieces are down, before the cottages, trees and woods fill the ground:
  // the kind's forms (mills.ts).
  const before = town.districts.length;
  buildWindmills(town, primary);
  if (town.districts.length > before) unjoined = joinStreets(town);
  buildFlowerBed(town, 0);
  buildFlowerBed(town, 1);
  // A farming village keeps its cottages near the green: the rest of the island is farmland.
  for (let ring = 0; ring < (primary === 'farming' ? 2 : 4); ring++) buildInfill(town, ring, INFILL[primary]);
  buildTrees(town);
  buildTreeLines(town, WOODS[primary].lines, WOODS[primary].linesFrom);
  buildWoods(town, WOODS[primary].woods);
  buildFarmstead(town);

  const { edits, fellBack } = watchingOrder(town);
  const counts = new Map<number, number>();
  for (const m of g.made) counts.set(m.district, (counts.get(m.district) ?? 0) + 1);
  return {
    edits,
    districts: town.districts.map((d) => ({ name: d.name, x: d.x, z: d.z, edits: counts.get(d.id) ?? 0 })),
    refused: g.refused,
    unjoined,
    fellBack,
    square: town.square,
    claims: g.claim,
    character: primary,
    secondary,
    forum,
    levelled: 0,
  };
}

/**
 * Streets from every district's ways to the streets joined to the square,
 * nearest district first. "Joined" is worked out by walking the laid
 * streets (route.ts, joinedStreets), so a district whose two streets meet
 * nothing else is joined at both ends. Returns the districts left unjoined.
 */
function joinStreets(town: Town): string[] {
  const { g } = town;
  // The square's streets, or (no square fitted) the first district that laid any.
  const sq = town.districts.find((d) => d.name === 'square') ?? town.districts.find((d) => g.streetOf.includes(d.id));
  if (!sq) return [];
  const roots = (): CellKey[] => {
    const out: CellKey[] = [];
    for (let i = 0; i < g.streetOf.length; i++) {
      if (g.streetOf[i] !== sq.id) continue;
      const x = i % 48, z = Math.floor(i / 48);
      out.push(key(x, g.h(x, z), z));
    }
    return out;
  };
  let net = joinedStreets(g, roots());
  const reached = (x: number, z: number): boolean => net.has(key(x, g.h(x, z), z));
  const done = (d: District): boolean => (d.anyWay ? d.ways.some(([x, z]) => reached(x, z)) : d.ways.every(([x, z]) => reached(x, z)));
  const todo = town.districts
    .filter((d) => d !== sq && d.ways.length > 0)
    .sort((a, b) => fromSquare(town, a.x, a.z) - fromSquare(town, b.x, b.z));
  for (let pass = 0; pass < 3; pass++) {
    for (const d of todo) {
      if (done(d)) continue;
      g.district = d.id;
      const allow = new Set(d.ways.map(([x, z]) => columnIndex(x, z)));
      for (const way of d.ways) {
        if (reached(way[0], way[1])) continue;
        if (route(g, way, { reached, allow, relaxed: pass === 2 }) === null) continue;
        net = joinedStreets(g, roots());
        if (d.anyWay) break;
      }
    }
  }
  return todo.filter((d) => !done(d)).map((d) => d.name);
}

/**
 * District by district outward from the square (trees last); in each, the
 * floors on the ground first, then everything else from the bottom up.
 * The order is checked by replaying it; if it were ever illegal or built a
 * different town, the order the town was made in is used instead.
 */
function watchingOrder(town: Town): { edits: Edit[]; fellBack: boolean } {
  const { g } = town;
  const rank = new Map<number, number>();
  const byDistance = (d: District): number => {
    if (d.name === 'square') return -1;
    if (d.name === 'trees') return 1000;
    const ring = /^infill(\d)$/.exec(d.name);
    if (ring) return Number(ring[1]) * 7 + 4.5;
    return fromSquare(town, d.x, d.z);
  };
  [...town.districts].sort((a, b) => byDistance(a) - byDistance(b) || a.id - b.id).forEach((d, i) => rank.set(d.id, i));
  const indexed = g.made.map((m, i) => ({ m, i }));
  const key = (x: { m: Made; i: number }): number[] => [rank.get(x.m.district) ?? 0, x.m.ground ? 0 : 1, x.m.ground ? 0 : x.m.y, x.i];
  indexed.sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return ka[j]! - kb[j]!;
    return 0;
  });
  const ordered = indexed.map((x) => x.m.edit);
  if (sameTown(g, ordered)) return { edits: ordered, fellBack: false };
  return { edits: g.made.map((m) => m.edit), fellBack: true };
}

/** Replays edits on an empty island: all legal, and the same blocks, floors and edges as the grower holds. */
function sameTown(g: Grower, edits: readonly Edit[]): boolean {
  const replay = new Grower(g.terrain, g.seed);
  for (const e of edits) if (!replay.edit(e)) return false;
  const a = g.world, b = replay.world;
  if (a.blocks.size !== b.blocks.size || a.floors.size !== b.floors.size || a.edges.size !== b.edges.size) return false;
  for (const [k, blk] of a.blocks) {
    const o = b.blocks.get(k);
    if (!o || o.kind !== blk.kind || o.color !== blk.color || o.rot !== blk.rot) return false;
  }
  for (const [k, f] of a.floors) if (b.floors.get(k) !== f) return false;
  for (const [k, e] of a.edges) if (b.edges.get(k) !== e) return false;
  return true;
}
