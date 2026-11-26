// The guide (design section 7, "The guide"): the special buildings, each
// with one plain sentence saying how to get it and a tiny recipe town that
// proves it. Pure data and scenario recipes; no DOM.
//
// Never wrong: guide.test.ts builds every recipe with the scenario builder,
// runs the real rules and checks the entry's proof is there; `npm run guide`
// renders the same recipe to the picture in public/guide/<id>.webp. So a
// sentence, its picture and the rules cannot drift apart unnoticed.
//
// Writing an entry: the sentence is for a child holding the tray, in terms
// of tray pieces (house, tower, Light, arch, dock, marble, pillar, Mill,
// path, plaza, garden, fence, wall). Read the rule file before writing it:
// the code is the truth, the catalogue is the plan.

import type { Kind } from '@/core/kinds';
import type { ActorType, PropType, Role } from '@/core/vocab';
import { scenario, type Scenario, type TerrainBuilder, type TownBuilder } from '@/scenario';
import beachScn from '../../scenarios/life/L63.beach.scenario';
import supperScn from '../../scenarios/life/L65.supper.scenario';
import carolScn from '../../scenarios/life/L67.carols.scenario';
import harvestScn from '../../scenarios/life/L59.harvest.scenario';
import tradeScn from '../../scenarios/life/L58.trade.scenario';
import fishScn from '../../scenarios/life/L53.fish.scenario';
import breadScn from '../../scenarios/life/L51.bread.scenario';
import waterScn from '../../scenarios/life/L52.water.scenario';
import laundryScn from '../../scenarios/life/L60.laundry.scenario';
import schoolScn from '../../scenarios/life/L62.school.scenario';
import bandScn from '../../scenarios/life/L62.bandstand.scenario';
import dogsScn from '../../scenarios/life/L61.dogs.scenario';
import scuffleScn from '../../scenarios/life/L50.scuffle.scenario';
import watchScn from '../../scenarios/life/L55.watchman.scenario';
import harbourScn from '../../scenarios/life/ships-harbour.scenario';
import jobsScn from '../../scenarios/rules/L23.jobs.scenario';
import smithyScn from '../../scenarios/rules/R-H19.smithy.scenario';
import courtScn from '../../scenarios/field/field-basketball.scenario';

/** A happening's picture town: one of the living town's own fixtures (scenarios/life), as its tests run it. */
const town = (s: Scenario): { seed: number; ground?: (t: TerrainBuilder) => void; build(b: TownBuilder): void } => ({ seed: s.seed + 7000, ...(typeof s.terrain === 'function' ? { ground: s.terrain } : {}), build: s.build });


/** Seconds of life before the wedding's picture is taken: the couple on the doorstep in a shower of petals, the guard of honour either side, the doves going up (timed in a test run of its recipe). */
const WEDDING_GUIDE_AT = 96;
/** Seconds of life before the beach day's picture: the parasols up along the sand, the families there (timed in a run of its recipe). */
const BEACH_GUIDE_AT = 130;
/** Seconds of life before the picnics' picture: blankets spread, families round them. */
const PICNIC_GUIDE_AT = 85;
/** Seconds of life before the snow day's picture: the snowman up, the forts built, snowballs flying. */
const SNOW_GUIDE_AT = 105;
/** Seconds of life before the supper's picture: tables up, lanterns lit, everybody at table. */
const SUPPER_GUIDE_AT = 85;

export type GuideGroup = 'auto' | 'houses' | 'towers' | 'stone' | 'bridges' | 'waterfront' | 'green' | 'town' | 'play' | 'big-days' | 'seasons' | 'by-water' | 'every-day' | 'evening' | 'after-mischief';

export const GROUPS: readonly { id: GuideGroup; title: string }[] = [
  { id: 'auto', title: 'The Auto block' },
  { id: 'houses', title: 'Houses' },
  { id: 'towers', title: 'Towers' },
  { id: 'stone', title: 'Stone' },
  { id: 'bridges', title: 'Bridges' },
  { id: 'waterfront', title: 'Waterfront' },
  { id: 'green', title: 'Green' },
  { id: 'town', title: 'Town' },
  { id: 'play', title: 'Playing fields' },
  { id: 'big-days', title: 'Big days' },
  { id: 'seasons', title: 'Through the seasons' },
  { id: 'by-water', title: 'By the water' },
  { id: 'every-day', title: 'Every day' },
  { id: 'evening', title: 'Evening and night' },
  { id: 'after-mischief', title: 'After mischief' },
];

/** What shows the rules really made the building. */
export type Proof =
  /** A structure with this role. */
  | { role: Role }
  /** Auto blocks resolved to every one of these kinds. */
  | { autoKinds: readonly Kind[] }
  /** A prop placed by this rule (dressing stage), optionally of one type. */
  | { prop: { rule: string; type?: PropType } }
  /** An actor placed by this rule (dressing stage), optionally of one type. */
  | { actor: { rule: string; type?: ActorType } }
  /** A socket placed by this rule (dressing stage): the posts of the town's events (L56, L57). */
  | { socket: { rule: string } };

export interface Recipe {
  ground?: (t: TerrainBuilder) => void;
  build(b: TownBuilder): void;
}

export interface GuideEntry {
  /** Stable, kebab-case: the picture is public/guide/<id>.webp. */
  id: string;
  group: GuideGroup;
  name: string;
  /** How to get it, in one plain sentence (two at most). */
  how: string;
  /** For something that happens by itself: when, in a few words ("Summer, fair weather, by day"; "At dusk"). Shown over `how`. */
  when?: string;
  proof: Proof;
  /** Seed of the recipe town. */
  seed: number;
  /** The ground; default flat land at height 1 on columns 4–43 with sea round it. */
  ground?: (t: TerrainBuilder) => void;
  /** The recipe: the smallest town that makes the building, composed for one clear picture. */
  build(b: TownBuilder): void;
  /**
   * The other ways the sentence promises ("… or …"), each a recipe of its
   * own: the proof test checks them like the main one; only the main one is drawn.
   */
  also?: readonly Recipe[];
  /** The picture's camera direction; the guide tool frames the recipe tightly from here. */
  view: { yaw: number; pitch: number };
  /** Extra room round the recipe in the picture, in cells (default 0.4). */
  pad?: number;
  /**
   * Draw the picture with the castle's people (troop, rider) on, frozen after `settle` seconds of
   * simulated day. Every other picture leaves people, birds and boats out. `residents` keeps the
   * town's people in it too (the events).
   */
  life?: {
    settle: number;
    residents?: boolean;
    /** The season, weather and time of day held for the picture (default summer, a clear sky, day): the scenes of one season (L64, L65). */
    season?: string;
    weather?: string;
    time?: 'day' | 'dusk' | 'night';
    /** Something set off for the picture `at` seconds in: a raid summoned off `where` (x, _, z), a fire lit in the block at `where` (x, level, z), a scuffle provoked. */
    start?: { what: 'raid' | 'fire' | 'scuffle'; at?: number; where?: readonly [number, number, number] };
  };
  /** Frame only these columns (inclusive), `top` levels high, instead of the whole recipe. */
  frame?: readonly [x0: number, z0: number, x1: number, z1: number, top: number];
}

/** The sea to the south (z ≥ 21) of flat land: the default view looks at it over the town. */
const seaSouth = (t: TerrainBuilder): void => {
  t.flat(1);
  t.water(4, 21, 43, 43);
};
const FRONT = { yaw: 40, pitch: 30 };

/**
 * A playing field (R-G03) of x0..x1 × z0..z1 south of a little street of family houses, so there are
 * residents to come and play (children too).
 */
function playingField(b: TownBuilder, x0: number, z0: number, x1: number, z1: number): void {
  b.path(12, 17, 30, 17);
  for (let i = 0; i < 5; i++) b.house(13 + i * 4, 14, { w: 2, d: 3, floors: 2, color: (i * 3) % 8 });
  b.floor('field', x0, z0, x1, z1);
}
/** The play pictures: a game going on (residents kept, life run until it is). */
const PLAY_VIEW = { yaw: 30, pitch: 38 };

/** A small walled castle: a ring of walls with a gatehouse (two marble blocks and an arch) on a path. */
function smallCastle(b: TownBuilder): void {
  for (let x = 18; x <= 22; x++) b.put('wall', x, 18);
  for (let z = 19; z <= 21; z++) b.put('wall', 18, z).put('wall', 22, z);
  b.put('wall', 18, 22).put('wall', 22, 22);
  b.stack('marble', 19, 22, { floors: 2 }).stack('marble', 21, 22, { floors: 2 });
  b.path(20, 22, 20, 25).put('arch', 20, 22);
}
/** A keep with a gateway (an arch over a path) beside it. */
function keepAndGate(b: TownBuilder): void {
  b.fill('marble', 19, 19, 20, 20, { floors: 3 });
  b.path(18, 21, 23, 21).put('arch', 21, 21);
}
/** The keep and its gateway, with the path running on from the gate to a little plaza. */
function keepGateAndPlaza(b: TownBuilder): void {
  keepAndGate(b);
  b.path(23, 22, 23, 23).plaza(22, 24, 24, 25);
}

const LISTED: readonly GuideEntry[] = [
  // ── the Auto block ────────────────────────────────────────────────────
  {
    id: 'auto',
    group: 'auto',
    name: 'The Auto block',
    how: 'The Auto block picks what to be from where you put it. On water it is a dock; across a gap of up to six, an arch; three stacked, a tower; four stacked near the sea, a lighthouse; anything else, a house.',
    proof: { autoKinds: ['dock', 'arch', 'tower', 'lighthouse', 'house'] },
    seed: 7001,
    ground: seaSouth,
    build(b) {
      b.auto(17, 19, { floors: 4 }); // four near the sea: a lighthouse
      b.auto(20, 17, { floors: 3 }); // three on open ground: a tower
      b.auto(23, 19, { w: 2 }); // anything else: a house
      b.house(22, 16, { floors: 2, color: 4 }).house(25, 16, { floors: 2, color: 4 });
      b.block('auto', 23, 2, 16).block('auto', 24, 2, 16); // across a gap: an arch
      for (let z = 21; z <= 23; z++) b.block('auto', 20, 0, z); // on the water: docks
    },
    view: FRONT,
  },

  // ── houses ────────────────────────────────────────────────────────────
  {
    id: 'chapel',
    group: 'houses',
    name: 'Chapel',
    how: 'Put a house two or more blocks long beside a tower three or more blocks tall.',
    proof: { role: 'chapel' },
    seed: 7101,
    build(b) {
      b.house(18, 20, { w: 3, color: 5 });
      b.tower(21, 20, { floors: 4 });
    },
    also: [
      { build: (b) => void b.house(18, 20, { w: 3, color: 5 }).tower(19, 20, { floors: 3 }) },
    ],
    view: FRONT,
  },
  {
    id: 'shop',
    group: 'houses',
    name: 'Shop',
    how: 'Open a house straight onto a plaza, or onto a path close by a plaza if the house is two or more storeys tall.',
    proof: { role: 'shop' },
    seed: 7102,
    build(b) {
      b.house(19, 19, { w: 2, color: 6 });
      b.plaza(18, 20, 21, 21);
    },
    also: [
      { build: (b) => void b.house(19, 19, { w: 2, floors: 2, color: 6 }).path(17, 20, 22, 20).plaza(23, 20, 24, 21) },
    ],
    view: FRONT,
  },
  {
    id: 'inn',
    group: 'houses',
    name: 'Inn',
    how: 'Build a house of six or more blocks, two or more storeys tall, where travellers arrive: on a square (a plaza three by three or more), or by the end of a bridge. Each such place has one inn.',
    proof: { role: 'inn' },
    seed: 7103,
    build(b) {
      b.house(18, 18, { w: 3, d: 2, floors: 2, color: 1 });
      b.plaza(17, 20, 21, 22);
    },
    also: [
      {
        ground: (t) => {
          t.flat(1);
          t.water(4, 21, 43, 23);
        },
        build: (b) => void b.house(18, 18, { w: 3, floors: 2, color: 1 }).path(16, 19, 22, 19).path(20, 20, 20, 20).block('arch', 20, 0, 21).block('arch', 20, 0, 22).block('arch', 20, 0, 23).path(20, 24, 20, 25),
      },
    ],
    view: FRONT,
  },
  {
    id: 'town-hall',
    group: 'houses',
    name: 'Town hall',
    how: 'Build a big house covering eight or more squares of ground, opening onto a plaza at least three squares by three.',
    proof: { role: 'town-hall' },
    seed: 7104,
    build(b) {
      b.house(18, 18, { w: 4, d: 2, floors: 2, color: 5 });
      b.plaza(18, 20, 21, 22);
    },
    also: [
      { build: (b) => void b.house(18, 18, { w: 4, d: 2, color: 5 }).plaza(17, 20, 19, 22) },
    ],
    view: { yaw: 25, pitch: 30 },
  },
  {
    id: 'manor',
    group: 'houses',
    name: 'Manor',
    how: 'Build a house two or more storeys tall that covers ten or more squares of ground, or holds sixteen or more blocks in all.',
    proof: { role: 'manor' },
    seed: 7105,
    build(b) {
      b.house(18, 19, { w: 4, d: 3, floors: 2, color: 0 });
    },
    also: [
      { build: (b) => void b.house(18, 19, { w: 4, d: 2, floors: 2, color: 0 }) },
    ],
    view: FRONT,
  },
  {
    id: 'barn',
    group: 'houses',
    name: 'Barn',
    how: 'Build a long one-storey house of six or more squares beside a garden or field of six or more, away from paths, plazas and squares; with a house beside it, it is a farmstead.',
    proof: { role: 'barn' },
    seed: 7115,
    build(b) {
      b.house(18, 19, { w: 4, d: 2, color: 3 });
      b.house(18, 22, { w: 2, floors: 2, color: 1 });
      b.garden(23, 18, 25, 21);
    },
    view: FRONT,
  },
  {
    id: 'smithy',
    group: 'houses',
    name: 'Smithy',
    how: 'Put a one-storey house of one to three squares against a tower one or two blocks tall: the tower is its smoking forge chimney, and the hearth glows at dusk.',
    proof: { role: 'smithy' },
    seed: 7118,
    build(b) {
      b.house(19, 19, { w: 2, color: 2 }).tower(18, 19, { floors: 2 });
      b.path(17, 21, 22, 21);
    },
    view: FRONT,
  },
  {
    id: 'schoolhouse',
    group: 'houses',
    name: 'Schoolhouse',
    how: 'In a town of ten or more houses, give a one-storey house on a path a fenced yard beside it: the biggest such yard is the school’s, with a bell on the roof and hopscotch in the yard.',
    proof: { role: 'schoolhouse' },
    seed: 7119,
    build(b) {
      b.path(8, 21, 30, 21);
      for (let i = 0; i < 5; i++) b.house(8 + i * 3, 19, { w: 2, d: 2, floors: 2, color: i });
      for (let i = 0; i < 5; i++) b.house(8 + i * 3, 22, { w: 2, floors: 2, color: (i + 3) % 8 });
      b.house(24, 22, { w: 2, color: 2 });
      b.fenceAround(26, 22, 28, 24);
    },
    view: FRONT,
    frame: [22, 19, 29, 25, 3],
  },
  {
    id: 'townhouse',
    group: 'houses',
    name: 'Townhouse',
    how: 'Stack a house three or more storeys tall on a single square.',
    proof: { role: 'townhouse' },
    seed: 7106,
    build(b) {
      b.house(20, 20, { floors: 4, color: 2 });
    },
    view: FRONT,
  },
  {
    id: 'row-house',
    group: 'houses',
    name: 'Row house',
    how: 'Squeeze a small house, one or two squares of ground, between two houses of other colours on opposite sides.',
    proof: { role: 'row-house' },
    seed: 7107,
    build(b) {
      const colors = [2, 5, 0, 4, 6];
      for (let i = 0; i < 5; i++) b.house(18 + i, 20, { floors: 2, color: colors[i]! });
    },
    view: FRONT,
  },
  {
    id: 'stilt-house',
    group: 'houses',
    name: 'Stilt house',
    how: 'Build a house out over the water, standing on docks.',
    proof: { role: 'stilt-house' },
    seed: 7108,
    ground: seaSouth,
    build(b) {
      b.block('dock', 20, 0, 21).block('dock', 20, 0, 22).block('dock', 21, 0, 22);
      b.block('house', 20, 1, 22, { color: 4 }).block('house', 21, 1, 22, { color: 4 });
    },
    view: FRONT,
  },
  {
    id: 'boathouse',
    group: 'houses',
    name: 'Boathouse',
    how: 'Build a small house on the shore (one storey on four squares of ground or fewer, or two storeys on two or fewer), with a wall looking straight out onto the sea.',
    proof: { role: 'boathouse' },
    seed: 7109,
    ground: seaSouth,
    build(b) {
      b.house(19, 20, { w: 2, color: 3 });
    },
    view: FRONT,
  },
  {
    id: 'watermill',
    group: 'houses',
    name: 'Watermill',
    how: 'Build a house of two or more blocks on a river bank, a wall looking straight out onto the river: its wheel turns in the stream. One mill to a stretch of river.',
    proof: { role: 'watermill' },
    seed: 7116,
    ground: (t) => {
      t.flat(1);
      t.water(4, 21, 43, 22);
    },
    build(b) {
      b.house(19, 19, { w: 2, d: 2, floors: 2, color: 4 });
    },
    view: { yaw: 20, pitch: 28 },
    frame: [17, 18, 22, 23, 3],
  },
  {
    id: 'cliff-house',
    group: 'houses',
    name: 'Cliff house',
    how: 'Build a house right against a cliff that rises two or more blocks above its floor.',
    proof: { role: 'cliff-house' },
    seed: 7110,
    ground(t) {
      t.flat(1);
      t.rect(4, 4, 43, 19, 3);
    },
    build(b) {
      b.house(19, 20, { w: 2, floors: 3, color: 6 });
    },
    view: FRONT,
  },
  {
    id: 'greenhouse',
    group: 'houses',
    name: 'Greenhouse',
    how: 'Put a one-storey house, one or two blocks long, with garden on three or more sides of it.',
    proof: { role: 'greenhouse' },
    seed: 7111,
    build(b) {
      b.garden(18, 19, 21, 21);
      b.house(19, 20, { w: 2, color: 3 });
    },
    view: FRONT,
  },
  {
    id: 'mill-house',
    group: 'houses',
    name: 'Mill house',
    how: 'Put a house right beside a windmill.',
    proof: { role: 'mill-house' },
    seed: 7112,
    build(b) {
      b.stack('windmill', 19, 20, { floors: 2 });
      b.house(20, 20, { w: 2, color: 6 });
    },
    view: FRONT,
  },
  {
    id: 'keepers-cottage',
    group: 'houses',
    name: "Keeper's cottage",
    how: 'Put a house right beside a lighthouse.',
    proof: { role: 'keepers-cottage' },
    seed: 7113,
    ground: seaSouth,
    build(b) {
      b.stack('lighthouse', 20, 20, { floors: 5 });
      b.house(18, 20, { w: 2, color: 4 });
    },
    view: FRONT,
  },
  {
    id: 'lookout-cottage',
    group: 'houses',
    name: 'Lookout cottage',
    how: 'Build a lone house on the highest ground of the island, with nothing else built within three squares.',
    proof: { role: 'lookout-cottage' },
    seed: 7114,
    ground(t) {
      t.flat(1);
      t.disc(20, 20, 4, 2);
      t.disc(20, 20, 2.5, 3);
      t.disc(20, 20, 1.2, 4);
    },
    build(b) {
      b.house(20, 20, { color: 2 });
    },
    view: FRONT,
    pad: 1.5,
  },

  // ── towers ────────────────────────────────────────────────────────────
  {
    id: 'steeple',
    group: 'towers',
    name: 'Steeple',
    how: 'A tower three or more blocks tall beside a house two or more blocks long becomes its steeple.',
    proof: { role: 'steeple' },
    seed: 7201,
    build(b) {
      b.house(19, 20, { w: 2, color: 0 });
      b.tower(21, 20, { floors: 5 });
    },
    view: { yaw: 55, pitch: 26 },
  },
  {
    id: 'clock-tower',
    group: 'towers',
    name: 'Clock tower',
    how: 'Build a tower four or more blocks tall within two squares of a plaza at least three squares by three.',
    proof: { role: 'clock-tower' },
    seed: 7202,
    build(b) {
      b.plaza(17, 19, 19, 21);
      b.tower(20, 20, { floors: 5, color: 6 });
    },
    view: FRONT,
  },
  {
    id: 'castle-turret',
    group: 'towers',
    name: 'Castle turret',
    how: 'Build a tower with marble or walls against two or more of its sides.',
    proof: { role: 'castle-turret' },
    seed: 7203,
    build(b) {
      b.tower(20, 20, { floors: 4, color: 1 });
      b.put('wall', 18, 20).put('wall', 19, 20).put('wall', 20, 21).put('wall', 20, 22);
    },
    also: [
      { build: (b) => void b.tower(20, 20, { floors: 4 }).stack('marble', 19, 20, { floors: 2 }).stack('marble', 20, 19, { floors: 2 }) },
      { build: (b) => void b.tower(20, 20, { floors: 4 }).wallEdge(20, 20, 'W', 1).wallEdge(20, 20, 'E', 1) },
    ],
    view: FRONT,
  },
  {
    id: 'campanile',
    group: 'towers',
    name: 'Campanile',
    how: 'Build the tallest tower in town, six or more blocks tall.',
    proof: { role: 'campanile' },
    seed: 7204,
    build(b) {
      b.tower(20, 20, { floors: 7, color: 4 });
    },
    view: FRONT,
  },
  {
    id: 'observatory',
    group: 'towers',
    name: 'Observatory',
    how: 'Build a tower four or more blocks tall on the highest hilltop, more than four squares from any water.',
    proof: { role: 'observatory' },
    seed: 7205,
    ground(t) {
      t.flat(1);
      t.rect(18, 18, 22, 22, 3);
    },
    build(b) {
      b.tower(20, 20, { floors: 4, color: 7 });
    },
    view: FRONT,
    pad: 1,
  },
  {
    id: 'dovecote',
    group: 'towers',
    name: 'Dovecote',
    how: 'Build a tower exactly three blocks tall with garden within two squares of it.',
    proof: { role: 'dovecote' },
    seed: 7206,
    build(b) {
      b.garden(19, 21, 21, 22);
      b.tower(20, 20, { floors: 3, color: 2 });
    },
    view: FRONT,
  },
  {
    id: 'lighthouse',
    group: 'towers',
    name: 'Lighthouse',
    how: 'Stack the Light piece, or four or more Auto blocks, near the sea. Far inland (six squares or more from water) the Light is a folly tower.',
    proof: { role: 'lighthouse' },
    seed: 7207,
    ground: seaSouth,
    build(b) {
      b.auto(20, 20, { floors: 5 });
    },
    also: [{ ground: seaSouth, build: (b) => void b.stack('lighthouse', 20, 20, { floors: 3 }) }],
    view: FRONT,
  },
  {
    id: 'folly-tower',
    group: 'towers',
    name: 'Folly tower',
    how: 'Stack the Light piece far inland, six squares or more from any water: a stone tower with a belvedere on top for the view.',
    proof: { role: 'folly-tower' },
    seed: 7208,
    build(b) {
      b.stack('lighthouse', 20, 20, { floors: 4 });
    },
    view: FRONT,
  },

  // ── stone ─────────────────────────────────────────────────────────────
  {
    id: 'temple',
    group: 'stone',
    name: 'Temple',
    how: 'Rest marble of five blocks or more on four or more pillars, each two or more blocks tall; or a smaller one on pillars up on a marble podium.',
    proof: { role: 'temple' },
    seed: 7301,
    build(b) {
      for (const x of [18, 19, 20, 21]) for (const z of [19, 20]) b.stack('pillar', x, z, { floors: 2 }).block('marble', x, 3, z);
    },
    view: FRONT,
  },
  {
    id: 'keep',
    group: 'stone',
    name: 'Keep',
    how: 'Pile marble three or more blocks high on a base at least two squares by two.',
    proof: { role: 'keep' },
    seed: 7302,
    build(b) {
      b.fill('marble', 19, 19, 21, 20, { floors: 3 });
    },
    view: FRONT,
  },
  {
    id: 'gatehouse',
    group: 'stone',
    name: 'Gatehouse',
    how: 'Put an arch over a path with marble on one side and marble or a wall on the other.',
    proof: { role: 'gatehouse' },
    seed: 7303,
    build(b) {
      b.path(20, 18, 20, 22).put('arch', 20, 20);
      b.stack('marble', 19, 20, { floors: 2 }).stack('marble', 21, 20, { floors: 2 });
    },
    also: [
      { build: (b) => void b.path(20, 17, 20, 23).put('arch', 20, 20).stack('marble', 19, 20, { floors: 2 }).put('wall', 21, 20) },
    ],
    view: FRONT,
  },
  {
    id: 'grand-steps',
    group: 'stone',
    name: 'Grand steps',
    how: 'Pile marble in three or more rows, each row one block higher than the last and two or more squares wide.',
    proof: { role: 'grand-steps' },
    seed: 7304,
    build(b) {
      for (let row = 0; row < 4; row++) for (let x = 19; x <= 21; x++) b.stack('marble', x, 22 - row, { floors: row + 1 });
    },
    view: FRONT,
  },
  {
    id: 'quay-wall',
    group: 'stone',
    name: 'Quay wall',
    how: 'Lay marble along the shore, right at the water’s edge.',
    proof: { role: 'quay-wall' },
    seed: 7305,
    ground: seaSouth,
    build(b) {
      for (let x = 17; x <= 23; x++) b.put('marble', x, 20);
    },
    view: FRONT,
  },
  {
    id: 'plinth',
    group: 'stone',
    name: 'Plinth and statue',
    how: 'Put one marble block on a plaza and leave its top empty: it carries a statue, a sundial or an urn.',
    proof: { role: 'plinth' },
    seed: 7306,
    build(b) {
      b.plaza(19, 19, 21, 21);
      b.put('marble', 20, 20);
    },
    view: FRONT,
  },
  {
    id: 'bandstand',
    group: 'stone',
    name: 'Bandstand',
    how: 'Rest four marble blocks on four pillars two or more tall, standing on the ground: an open pavilion where a band plays. A square of four is an octagon; a row or a bent line, a garden shelter.',
    proof: { role: 'bandstand' },
    seed: 7310,
    build(b) {
      b.plaza(17, 17, 21, 21);
      for (const x of [19, 20]) for (const z of [19, 20]) b.stack('pillar', x, z, { floors: 2 }).block('marble', x, 3, z, { color: 2 });
    },
    view: FRONT,
  },
  {
    id: 'stoa',
    group: 'stone',
    name: 'Stoa',
    how: 'Rest a long marble roof, three or more times as long as it is wide and more than six blocks, on pillars beside a plaza: a market hall with one sloping roof.',
    proof: { role: 'stoa' },
    seed: 7311,
    build(b) {
      b.plaza(15, 18, 18, 23);
      for (let z = 18; z <= 23; z++) b.stack('pillar', 20, z, { floors: 2 }).block('marble', 20, 3, z, { color: 1 }).block('marble', 21, 3, z, { color: 1 });
    },
    view: FRONT,
  },
  {
    id: 'obelisk',
    group: 'stone',
    name: 'Obelisk or column',
    how: 'Stack marble three or more blocks high on a single square of a plaza, with nothing touching it: an obelisk with a gilt tip, or, four or more high, sometimes a column with a statue.',
    proof: { role: 'obelisk' },
    seed: 7309,
    build(b) {
      b.plaza(18, 18, 22, 22);
      b.stack('marble', 20, 20, { floors: 4 });
    },
    view: FRONT,
  },
  {
    id: 'podium',
    group: 'stone',
    name: 'Podium',
    how: 'Build a marble platform two or more blocks high and give it a use: a temple on top, a broad stair up its side, or a plaza over a quarter of its top.',
    proof: { role: 'podium' },
    seed: 7307,
    build(b) {
      b.fill('marble', 18, 18, 22, 20, { floors: 3 });
      for (const x of [19, 21]) for (const z of [18, 19]) b.stack('pillar', x, z, { floors: 2 });
      for (let x = 19; x <= 21; x++) for (const z of [18, 19]) b.block('marble', x, 6, z, { color: 2 });
      for (let i = 0; i < 2; i++) for (const x of [19, 20, 21]) b.stack('marble', x, 22 - i, { floors: i + 1 });
    },
    also: [
      { build: (b) => void b.fill('marble', 18, 18, 21, 21, { floors: 3 }).plaza(18, 18, 21, 20) },
      { build: (b) => void b.fill('marble', 18, 18, 22, 20, { floors: 3 }).stack('marble', 20, 22, { floors: 1 }).stack('marble', 20, 21, { floors: 2 }).stack('marble', 21, 22, { floors: 1 }).stack('marble', 21, 21, { floors: 2 }) },
    ],
    view: FRONT,
  },
  {
    id: 'theatre',
    group: 'stone',
    name: 'Theatre',
    how: 'Pile marble in rows of seats, each row one block higher and four or more wide, with nothing at the top, facing a plaza or open ground.',
    proof: { role: 'theatre' },
    seed: 7308,
    build(b) {
      for (let row = 0; row < 3; row++) for (let x = 18; x <= 22; x++) b.stack('marble', x, 20 - row, { floors: row + 1 });
      b.plaza(18, 21, 22, 22);
    },
    view: { yaw: 20, pitch: 30 },
  },
  {
    id: 'wall-shops',
    group: 'stone',
    name: 'Shops in the wall',
    how: 'Build a long marble wall two blocks tall beside a plaza or a path (not a castle): little arched shops and a fountain open in it.',
    proof: { prop: { rule: 'U16.shops-in-the-wall', type: 'wall-booth' } },
    seed: 7654,
    build(b) {
      b.fill('marble', 17, 18, 22, 19, { floors: 2, color: 2 });
      b.plaza(16, 21, 23, 22);
    },
    view: { yaw: 20, pitch: 28 },
    pad: -0.1,
  },

  // ── bridges ───────────────────────────────────────────────────────────
  {
    id: 'stone-bridge',
    group: 'bridges',
    name: 'Stone bridge',
    how: 'Lay arches across water from bank to bank, six or fewer long.',
    proof: { role: 'stone-bridge' },
    seed: 7401,
    ground(t) {
      t.flat(1);
      t.water(4, 19, 43, 21);
    },
    build(b) {
      for (let z = 19; z <= 21; z++) b.block('arch', 20, 0, z);
      b.path(20, 17, 20, 18).path(20, 22, 20, 23);
    },
    view: { yaw: 60, pitch: 28 },
  },
  {
    id: 'bridge-shop',
    group: 'bridges',
    name: 'Bridge shops',
    how: 'Build houses on a bridge two or more wide whose deck is a street (a path on it or at its end), leaving room to pass: they become shops over the river.',
    proof: { role: 'bridge-shop' },
    seed: 7406,
    ground(t) {
      t.flat(1);
      t.water(4, 19, 43, 21);
    },
    build(b) {
      for (let z = 19; z <= 21; z++) b.block('arch', 19, 0, z).block('arch', 20, 0, z);
      b.path(19, 17, 19, 23);
      b.house(20, 19, { d: 2, floors: 2, color: 4 });
    },
    view: { yaw: 60, pitch: 28 },
  },
  {
    id: 'sky-bridge',
    group: 'bridges',
    name: 'Sky bridge',
    how: 'Join two houses with arches a storey or more off the ground, with both houses rising at least a storey above them.',
    proof: { role: 'sky-bridge' },
    seed: 7402,
    build(b) {
      b.house(18, 20, { floors: 4, color: 2 }).house(21, 20, { floors: 4, color: 6 });
      b.block('arch', 19, 3, 20).block('arch', 20, 3, 20);
    },
    view: FRONT,
  },
  {
    id: 'viaduct',
    group: 'bridges',
    name: 'Viaduct',
    how: 'Line up arches on dry land, and stack a second row on top for tiers.',
    proof: { role: 'viaduct' },
    seed: 7403,
    build(b) {
      for (let x = 17; x <= 22; x++) b.put('arch', x, 20);
      for (let x = 18; x <= 21; x++) b.block('arch', x, 2, 20);
    },
    also: [{ build: (b) => void b.put('arch', 20, 20) }],
    view: FRONT,
  },
  {
    id: 'gateway',
    group: 'bridges',
    name: 'Gateway',
    how: 'Put an arch over a path.',
    proof: { role: 'gateway' },
    seed: 7404,
    build(b) {
      b.path(20, 18, 20, 22).put('arch', 20, 20);
      b.put('wall', 19, 20).put('wall', 21, 20);
    },
    view: FRONT,
  },
  {
    id: 'loggia',
    group: 'bridges',
    name: 'Loggia',
    how: 'Hang arches off the side of a house, a storey or more up, with nothing at the far end.',
    proof: { role: 'loggia' },
    seed: 7405,
    build(b) {
      b.house(19, 20, { floors: 3, color: 6 });
      b.block('arch', 20, 2, 20).block('arch', 21, 2, 20);
    },
    view: FRONT,
  },
  {
    id: 'flying-buttress',
    group: 'bridges',
    name: 'Flying buttress',
    how: 'Hang arches off a tower, marble or a chapel, with nothing at the far end and nothing on top.',
    proof: { role: 'flying-buttress' },
    seed: 7406,
    build(b) {
      b.tower(19, 20, { floors: 5, color: 1 });
      b.block('arch', 20, 3, 20).block('arch', 21, 3, 20);
    },
    also: [
      { build: (b) => void b.stack('marble', 19, 20, { floors: 4 }).block('arch', 20, 2, 20) },
      { build: (b) => void b.house(17, 20, { w: 2, floors: 2, color: 5 }).tower(19, 20, { floors: 4 }).block('arch', 17, 2, 21) },
    ],
    view: FRONT,
  },

  // ── waterfront ────────────────────────────────────────────────────────
  {
    id: 'pier',
    group: 'waterfront',
    name: 'Pier',
    how: 'Run a straight line of three or more docks out from the shore.',
    proof: { role: 'pier' },
    seed: 7501,
    ground: seaSouth,
    build(b) {
      for (let z = 21; z <= 24; z++) b.block('dock', 20, 0, z);
      b.path(20, 18, 20, 20);
    },
    view: { yaw: 60, pitch: 30 },
  },
  {
    // Shaping the land (design section 6): how to dig a river or a moat.
    id: 'dug-river',
    group: 'waterfront',
    name: 'Dug river and barge',
    how: 'Dig a narrow channel in from the sea with Dig (Nature drawer; Shift-drag paints) and it fills as a river: put a dock on it and a barge comes. Dig all round a building for a moat.',
    proof: { actor: { rule: 'L41.river-barge' } },
    seed: 7509,
    ground: seaSouth,
    build(b) {
      // A channel three wide from the sea at z = 21 up to z = 9, dug by hand.
      const cols: number[] = [];
      for (let z = 9; z <= 20; z++) for (const x of [20, 21, 22]) cols.push(x + z * 48);
      b.edit({ type: 'land', up: [], down: cols }, 'dig');
      b.block('dock', 20, 0, 10).block('dock', 20, 0, 11);
      b.house(17, 10, { color: 3 });
    },
    view: { yaw: 30, pitch: 34 },
  },
  {
    id: 'quay',
    group: 'waterfront',
    name: 'Quay',
    how: 'Lay four or more docks in a row along the shore.',
    proof: { role: 'quay' },
    seed: 7502,
    ground: seaSouth,
    build(b) {
      for (let x = 17; x <= 22; x++) b.block('dock', x, 0, 21);
      b.path(17, 20, 22, 20);
    },
    view: FRONT,
  },
  {
    id: 'boardwalk',
    group: 'waterfront',
    name: 'Boardwalk',
    how: 'Lay a straight line of docks across a cove, with land at both ends.',
    proof: { role: 'boardwalk' },
    seed: 7503,
    ground(t) {
      t.flat(1);
      t.water(18, 18, 22, 43);
    },
    build(b) {
      for (let x = 18; x <= 22; x++) b.block('dock', x, 0, 21);
      b.path(15, 21, 17, 21).path(23, 21, 25, 21);
    },
    view: FRONT,
  },
  // Boats and ships ("Boats and ships": whatever fits comes). The picture shows the ship moored: a town opened
  // with a port has its biggest ship in.
  {
    id: 'warehouse',
    group: 'waterfront',
    name: 'Warehouse',
    how: 'Build a house of six or more blocks, two or more storeys tall, facing a dock across the harbour street: loading doors climb its wall to a hoist.',
    proof: { role: 'warehouse' },
    seed: 7117,
    ground: seaSouth,
    build(b) {
      b.house(18, 17, { w: 3, d: 2, floors: 3, color: 7 });
      b.path(16, 19, 23, 19);
      for (let x = 19; x <= 20; x++) b.block('dock', x, 0, 21);
    },
    view: FRONT,
  },
  {
    id: 'ships',
    group: 'waterfront',
    name: 'Boats and ships',
    how: 'Build docks with open water beside them and boats come: a rowboat at a single dock, and the longer the quay, the bigger the ship that calls: a cog at about four docks in a row, a galley or a galleon at about seven.',
    proof: { actor: { rule: 'L38.galleon', type: 'ship-call' } },
    seed: 7504,
    ground: seaSouth,
    build(b) {
      for (let x = 15; x <= 22; x++) b.block('dock', x, 0, 21);
      b.path(15, 20, 22, 20);
      b.house(15, 17, { w: 2, floors: 2, color: 1 }).house(20, 17, { w: 2, floors: 3, color: 4 });
    },
    also: [{ ground: seaSouth, build: (b) => void [14, 15, 16, 17, 18, 19, 20].forEach((x) => b.put('marble', x, 20)) }],
    view: { yaw: 30, pitch: 28 },
    pad: 0.2,
    life: { settle: 6 },
    frame: [13, 18, 25, 24, 6],
  },
  {
    id: 'cog',
    group: 'waterfront',
    name: 'Merchant cog',
    how: 'Lay about four docks in a row along the shore with open sea beside them: a round-bellied trading cog calls there.',
    proof: { actor: { rule: 'L39.cog', type: 'ship-call' } },
    seed: 7505,
    ground: seaSouth,
    build(b) {
      for (let x = 18; x <= 21; x++) b.block('dock', x, 0, 21);
      b.path(18, 20, 21, 20);
      b.house(18, 17, { w: 2, floors: 2, color: 6 });
    },
    view: { yaw: 30, pitch: 28 },
    pad: 0.2,
    life: { settle: 6 },
    frame: [16, 18, 24, 24, 5],
  },

  // ── green ─────────────────────────────────────────────────────────────
  {
    id: 'wheat-field',
    group: 'green',
    name: 'Wheat field',
    how: 'Lay four or more garden squares in one patch within two squares of a windmill.',
    proof: { role: 'wheat-field' },
    seed: 7601,
    build(b) {
      b.stack('windmill', 18, 19, { floors: 2 });
      b.garden(19, 20, 22, 22);
    },
    view: FRONT,
  },
  {
    id: 'park',
    group: 'green',
    name: 'Park',
    how: 'Lay nine or more garden squares in one patch, away from water and windmills.',
    proof: { role: 'park-lawn' },
    seed: 7602,
    build(b) {
      b.garden(18, 18, 21, 21);
      b.put('tree', 19, 19).put('tree', 21, 20);
    },
    view: FRONT,
  },
  {
    id: 'walled-garden',
    group: 'green',
    name: 'Walled garden',
    how: 'Close in six or more squares of grass with walls on every side, and build nothing inside.',
    proof: { prop: { rule: 'U02.fenced-field', type: 'espalier' } },
    seed: 7603,
    build(b) {
      b.fenceAround(19, 19, 21, 21, 'wall');
    },
    view: { yaw: 40, pitch: 42 },
    pad: -0.1,
  },
  {
    id: 'paddock',
    group: 'green',
    name: 'Paddock',
    how: 'Close in six or more squares of grass with fences on every side, and build nothing inside.',
    proof: { prop: { rule: 'U02.fenced-field', type: 'grazer' } },
    seed: 7604,
    build(b) {
      b.fenceAround(19, 19, 21, 21);
    },
    view: { yaw: 40, pitch: 42 },
    pad: -0.1,
  },
  // ── discovery round 1: the fill builder's entries ──
  {
    id: 'country-lane',
    group: 'green',
    name: 'Country lane',
    how: 'Run a path out of town across open grass: four or more squares of it more than three squares from any building or plaza get hedges, field gates and milestones instead of street lamps.',
    proof: { prop: { rule: 'U13.country-lanes', type: 'hedge' } },
    seed: 7651,
    build(b) {
      b.house(13, 19, { color: 2 });
      b.path(13, 20, 27, 20);
    },
    view: { yaw: 30, pitch: 34 },
    pad: -0.2,
  },
  {
    id: 'burgage-plots',
    group: 'green',
    name: 'Back gardens',
    how: 'Fence in the grass behind a row of two or more houses: each house gets its own long back garden, with a fruit tree at the far end.',
    proof: { prop: { rule: 'U14.burgage-plots', type: 'fruit-tree' } },
    seed: 7652,
    build(b) {
      b.path(16, 17, 23, 17);
      for (let i = 0; i < 3; i++) b.house(17 + i * 2, 18, { w: 2, floors: 1 + (i % 2), color: (i * 3 + 1) % 8 });
      for (let x = 17; x <= 22; x++) b.fenceEdge(x, 22, 'S');
      for (let z = 19; z <= 22; z++) b.fenceEdge(17, z, 'W').fenceEdge(22, z, 'E');
    },
    view: { yaw: 200, pitch: 40 },
    pad: -0.1,
  },
  {
    id: 'village-green',
    group: 'green',
    name: 'Village green',
    how: 'Leave a patch of grass between two rows of houses that face each other across it, with a path beside it: it becomes the village green, with a maypole.',
    proof: { prop: { rule: 'U15.village-green', type: 'maypole' } },
    seed: 7653,
    build(b) {
      b.path(15, 15, 15, 24);
      for (const x of [17, 20]) b.house(x, 16, { color: x % 8 }).house(x, 23, { color: (x + 3) % 8 });
      b.path(16, 15, 21, 15).path(16, 24, 21, 24);
      b.put('tree', 21, 19);
    },
    view: { yaw: 40, pitch: 36 },
    pad: -0.1,
  },
  {
    id: 'orchard',
    group: 'green',
    name: 'Orchard',
    how: 'Plant six or more trees in rows, two squares apart each way: they become an orchard, with ladders, baskets of apples and beehives.',
    proof: { prop: { rule: 'U18.orchard', type: 'ladder' } },
    seed: 7655,
    build(b) {
      for (let x = 17; x <= 23; x += 2) for (let z = 18; z <= 22; z += 2) b.put('tree', x, z);
    },
    view: { yaw: 35, pitch: 36 },
    pad: -0.1,
  },
  {
    id: 'pocket-park',
    group: 'green',
    name: 'Pocket park',
    how: 'Leave a small patch of grass, two to sixteen squares, shut in by houses and paths.',
    proof: { prop: { rule: 'U01.pocket-park' } },
    seed: 7605,
    build(b) {
      b.house(19, 18, { w: 3, floors: 2, color: 2 });
      b.path(18, 18, 18, 22).path(22, 18, 22, 22).path(19, 22, 21, 22);
    },
    view: FRONT,
  },
  {
    id: 'churchyard',
    group: 'green',
    name: 'Churchyard',
    how: 'Wall or fence in some garden or grass beside a chapel: it fills with headstones and a yew, with a roofed lychgate where a path goes through the wall.',
    proof: { role: 'churchyard' },
    seed: 7607,
    build(b) {
      b.house(18, 18, { w: 3, color: 5 }).tower(21, 18, { floors: 4 });
      b.garden(18, 19, 20, 21).fenceAround(18, 19, 20, 21, 'wall');
    },
    view: FRONT,
  },
  {
    id: 'herb-garden',
    group: 'green',
    name: 'Herb garden',
    how: 'Lay garden in a yard closed in on every side by buildings or walls (a fence will not do).',
    proof: { role: 'herb-garden' },
    seed: 7606,
    build(b) {
      b.garden(19, 20, 21, 21).fenceAround(19, 20, 21, 21, 'wall');
    },
    also: [
      {
        build(b) {
          b.house(18, 18, { w: 4, color: 1 }).house(18, 19, { d: 3, color: 1 }).house(21, 19, { d: 3, color: 1 }).house(19, 21, { w: 2, color: 1 });
          b.garden(19, 19, 20, 20);
        },
      },
    ],
    view: FRONT,
  },

  // ── town ──────────────────────────────────────────────────────────────
  {
    id: 'street-lamps',
    group: 'town',
    name: 'Street lamps',
    how: 'Lay a path four or more squares long: lamps go up at its ends, its corners and along it.',
    proof: { prop: { rule: 'D01.street-lamps', type: 'lamp' } },
    seed: 7701,
    build(b) {
      b.path([17, 21], [22, 21], [22, 18]);
      b.house(19, 19, { w: 2, color: 1 });
    },
    view: FRONT,
  },
  {
    id: 'laundry-lines',
    group: 'town',
    name: 'Laundry lines',
    how: 'Face two houses two or more storeys tall across a narrow gap of one to three squares; most such gaps get a washing line.',
    proof: { prop: { rule: 'D05.laundry-line', type: 'laundry-line' } },
    seed: 7703,
    build(b) {
      b.house(19, 19, { w: 2, floors: 3, color: 0 });
      b.house(19, 21, { w: 2, floors: 3, color: 2 });
      b.path(18, 20, 21, 20);
    },
    view: { yaw: 72, pitch: 22 },
  },
  {
    id: 'garrison',
    group: 'town',
    name: 'Garrison',
    how: 'Build a keep, or ring a yard with castle walls and a gatehouse or castle turret: a troop of soldiers marches round it. When raiders land, it marches out under its banner and drives one party back to its ship.',
    proof: { actor: { rule: 'L36.garrison', type: 'garrison' } },
    seed: 7704,
    build: smallCastle,
    also: [
      {
        build(b) {
          b.tower(18, 18, { floors: 3 });
          for (let x = 19; x <= 22; x++) b.put('wall', x, 18).put('wall', x, 21);
          for (let z = 19; z <= 20; z++) b.put('wall', 18, z).put('wall', 22, z);
          b.put('wall', 18, 21);
        },
      },
      { build: keepAndGate },
      // A keep on its own: its troop marches round its foot.
      { build: (b) => void b.fill('marble', 19, 19, 20, 20, { floors: 3 }) },
    ],
    view: FRONT,
    pad: 0.2,
    life: { settle: 42 },
    frame: [19, 21, 23, 24, 2],
  },
  {
    id: 'rider',
    group: 'town',
    name: 'Rider',
    how: 'Every castle with a garrison keeps a rider, whose horse waits by the gate. Lay a path from the gate and the rider rides out along it, to the plaza if it reaches one.',
    proof: { actor: { rule: 'L37.rider', type: 'rider' } },
    seed: 7705,
    build: keepGateAndPlaza,
    also: [
      { build: (b) => void (smallCastle(b), b.plaza(19, 26, 21, 27)) },
      // A path and no plaza: it rides along the path and back.
      { build: keepAndGate },
      // No path: the horse stands tethered by the keep.
      { build: (b) => void b.fill('marble', 19, 19, 20, 20, { floors: 3 }) },
    ],
    view: FRONT,
    pad: 0.2,
    life: { settle: 64 },
    frame: [19, 20, 24, 22, 3],
  },

  {
    id: 'market-cross',
    group: 'town',
    name: 'Market cross',
    how: 'Put a single marble block on a plaza with two or more stalls round it (and no fountain beside it): it becomes the market cross.',
    proof: { prop: { rule: 'D37.market-cross', type: 'market-cross' } },
    seed: 7656,
    build(b) {
      b.plaza(17, 18, 22, 22);
      b.put('marble', 19, 20, { color: 3 });
      b.put('stall', 17, 20).put('stall', 21, 21);
    },
    view: { yaw: 30, pitch: 32 },
    pad: -0.1,
  },

  // ── playing fields (R-G03, D40, src/life/field) ───────────────────────
  {
    id: 'basketball-court',
    group: 'play',
    name: 'Basketball court',
    how: 'Paint a field three by two, three by three or four by three: a basketball court with a hoop at each end. Residents come and play two or three a side.',
    proof: { role: 'basketball-court' },
    seed: 8801,
    build: (b) => playingField(b, 19, 18, 22, 20),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 70, residents: true },
    frame: [18, 17, 23, 21, 2],
  },
  {
    id: 'tennis-court',
    group: 'play',
    name: 'Tennis court',
    how: 'Paint a field two wide and four to six long (or three wide and five or six long, for doubles): a tennis court with a net, clay or grass beside a garden. Residents come and play.',
    proof: { role: 'tennis-court' },
    seed: 8802,
    build: (b) => playingField(b, 18, 18, 22, 19),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 70, residents: true },
    frame: [17, 17, 23, 20, 2],
  },
  {
    id: 'football-pitch',
    group: 'play',
    name: 'Football pitch',
    how: 'Paint a field four by six or bigger (three wide will do if it is seven long): a grass pitch with goals and corner flags. Residents come and play a few a side.',
    proof: { role: 'football-pitch' },
    seed: 8803,
    build: (b) => playingField(b, 17, 18, 23, 21),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 80, residents: true },
    frame: [16, 17, 24, 22, 2],
  },
  {
    id: 'bowling-green',
    group: 'play',
    name: 'Bowling green',
    how: 'Paint a field four by four: a close-cut bowling green. Grown-ups come and roll bowls at the jack, slowly.',
    proof: { role: 'bowling-green' },
    seed: 8804,
    build: (b) => playingField(b, 19, 18, 22, 21),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 70, residents: true },
    frame: [18, 17, 23, 22, 2],
  },
  {
    id: 'croquet-lawn',
    group: 'play',
    name: 'Croquet lawn',
    how: 'Paint a field four by five: a croquet lawn with six hoops and a peg. Grown-ups come and knock their balls through the hoops in turn.',
    proof: { role: 'croquet-lawn' },
    seed: 8805,
    build: (b) => playingField(b, 18, 18, 22, 21),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 70, residents: true },
    frame: [17, 17, 23, 22, 2],
  },
  {
    id: 'boules-court',
    group: 'play',
    name: 'Boules court',
    how: 'Paint a field one wide and three or four long: a gravel boules court. Grown-ups come and toss their boules at the little jack.',
    proof: { role: 'boules-court' },
    seed: 8806,
    build: (b) => playingField(b, 18, 18, 21, 18),
    view: PLAY_VIEW,
    pad: 0.3,
    life: { settle: 70, residents: true },
    frame: [17, 17, 22, 19, 2],
  },
  {
    id: 'running-track',
    group: 'play',
    name: 'Running track',
    how: 'Paint a field one wide and five or more long (or two wide and seven or more): a running track. Children come and race.',
    proof: { role: 'running-track' },
    seed: 8807,
    build: (b) => playingField(b, 16, 18, 22, 18),
    view: PLAY_VIEW,
    pad: 0.3,
    life: { settle: 70, residents: true },
    frame: [15, 17, 23, 19, 2],
  },
  {
    id: 'kickabout-green',
    group: 'play',
    name: 'Kickabout green',
    how: 'Paint a small or odd-shaped patch of field (two by two, an L): a plain green with jumpers for goalposts. Children come and kick a ball about.',
    proof: { role: 'kickabout-green' },
    seed: 8808,
    build: (b) => {
      playingField(b, 19, 18, 21, 18);
      b.floor('field', 19, 19, 19, 20);
    },
    view: PLAY_VIEW,
    pad: 0.3,
    life: { settle: 70, residents: true },
    frame: [18, 17, 22, 21, 2],
  },

  // ── days the town earns (L56, L57, L63) ────────────────────────────────────
  {
    id: 'market-day',
    group: 'big-days',
    when: 'Market days, from dawn to early afternoon',
    name: 'Market day',
    how: 'Lay a plaza at least three by three with two stalls on it, and houses round it. On market mornings traders set up stalls there, a busker juggles and the town comes to buy.',
    proof: { socket: { rule: 'L56.market-day' } },
    seed: 7801,
    build(b) {
      b.plaza(18, 18, 22, 22);
      b.put('stall', 18, 18).put('stall', 22, 22);
      b.house(18, 15, { floors: 2, w: 2, d: 2, color: 1 }).house(21, 15, { floors: 2, w: 2, d: 2, color: 3 });
      b.house(15, 19, { floors: 2, w: 2, d: 2, color: 5 }).house(24, 19, { floors: 1, w: 2, d: 2, color: 6 });
      b.path(18, 17, 22, 17).path(17, 18, 17, 22);
    },
    view: FRONT,
    pad: 0.2,
    life: { settle: 40, residents: true },
    frame: [16, 17, 23, 23, 2],
  },
  {
    id: 'wedding',
    group: 'big-days',
    when: 'By day, every five to seven minutes',
    name: 'A wedding',
    how: 'Put a chapel (a house beside a tower) with its door on a path that runs to a plaza no more than 20 steps away, and houses round about. Every few minutes by day the bells ring for a wedding: the party, dressed in black and white, lines the way from the door, and the couple lead a procession through the streets to the plaza in a shower of petals.',
    proof: { socket: { rule: 'L57.wedding' } },
    seed: 7802,
    build(b) {
      b.house(17, 16, { w: 2, d: 2, color: 5 });
      b.tower(19, 16, { floors: 4 });
      b.path(15, 18, 25, 18);
      b.plaza(21, 19, 24, 21);
      b.house(14, 16, { floors: 1, w: 2, d: 2, color: 1 }).house(22, 15, { floors: 1, w: 2, d: 2, color: 6 }).house(25, 15, { floors: 1, w: 2, d: 2, color: 2 });
      b.path(23, 17, 23, 17).path(26, 17, 26, 17);
      // Neighbours enough for a wedding party.
      b.house(12, 16, { floors: 1, w: 2, d: 2, color: 3 }).house(25, 19, { floors: 1, w: 2, d: 2, color: 4 }).house(28, 15, { floors: 1, w: 2, d: 2, color: 7 }).house(28, 19, { floors: 1, w: 2, d: 2, color: 0 });
      b.path(12, 18, 14, 18).path(26, 18, 29, 18).path(29, 17, 29, 17);
    },
    view: { yaw: 20, pitch: 40 },
    pad: 0.2,
    // In the middle of a wedding: the couple come out (WEDDING_GUIDE_AT).
    life: { settle: WEDDING_GUIDE_AT, residents: true },
    frame: [16, 16, 24, 21, 2],
  },
  {
    id: 'beach-day',
    group: 'seasons',
    when: 'Summer, fair weather, by day',
    name: 'A beach day',
    how: 'Build a town of eight houses or more within 40 steps of sand by the sea (the strip where flat land meets the water). Families carry parasols, deckchairs and pails down to it, swim, paddle and build sandcastles, an ice-cream cart comes with a queue, and rain sends them running home.',
    proof: { socket: { rule: 'L63.beach' } },
    seed: 7803,
    ground: seaSouth,
    build(b) {
      b.path(12, 17, 29, 17);
      for (let i = 0; i < 5; i++) b.house(13 + i * 4, 14, { w: 2, d: 3, floors: 2, color: (i * 3) % 8 });
      b.house(12, 10, { w: 2, d: 2, color: 6 }).house(17, 10, { w: 2, d: 2, color: 2 }).house(22, 10, { w: 2, d: 2, color: 4 });
      b.path(12, 12, 23, 12).path(11, 12, 11, 17);
    },
    view: { yaw: 20, pitch: 40 },
    pad: 0.2,
    // The families set up on the sand (BEACH_GUIDE_AT).
    life: { settle: BEACH_GUIDE_AT, residents: true },
    frame: [12, 17, 21, 21, 2],
  },
  {
    id: 'picnic',
    group: 'seasons',
    when: 'Spring (summer too, with no beach), fair weather, by day',
    name: 'Picnics',
    how: 'Leave open grass with a few trees beside your houses. On fair spring days (and in summer, if the town has no beach) families carry out checked blankets and baskets, spread them on the grass and sit round them while the children chase about.',
    proof: { socket: { rule: 'L66.picnic' } },
    seed: 7804,
    build(b) {
      b.path(12, 17, 31, 17);
      for (let i = 0; i < 5; i++) b.house(13 + i * 4, 14, { w: 2, d: 3, floors: 2, color: (i * 3 + 1) % 8 });
      for (const [x, z] of [[16, 21], [22, 22], [27, 20], [19, 25], [25, 25]] as const) b.put('tree', x, z);
    },
    view: { yaw: 25, pitch: 42 },
    pad: 0.2,
    // The blankets out on the grass (PICNIC_GUIDE_AT).
    life: { settle: PICNIC_GUIDE_AT, residents: true },
    frame: [12, 17, 22, 21, 1],
  },
  {
    id: 'snow-day',
    group: 'seasons',
    when: 'When snow lies deep, by day',
    name: 'A snow day',
    how: 'Lay a plaza with houses round it. When snow lies deep, the children come running out, roll a snowman in the middle of the square, give it a hat and a scarf, then build snow forts either side and have a snowball fight.',
    proof: { socket: { rule: 'L64.snow-day' } },
    seed: 7805,
    build(b) {
      b.plaza(17, 18, 23, 21);
      for (let i = 0; i < 3; i++) b.house(17 + i * 3, 15, { w: 2, d: 2, floors: 2, color: (i * 3) % 8 });
      for (let i = 0; i < 3; i++) b.house(17 + i * 3, 23, { w: 2, d: 2, floors: 1, color: (i * 5 + 1) % 8 });
      b.path(16, 17, 24, 17).path(16, 22, 24, 22);
    },
    view: { yaw: 25, pitch: 40 },
    pad: 0.2,
    // The fight round the finished snowman (SNOW_GUIDE_AT), with deep snow lying.
    life: { settle: SNOW_GUIDE_AT, residents: true, season: 'winter', weather: 'clear' },
    frame: [17, 18, 23, 21, 1],
  },
  {
    id: 'harvest-supper',
    group: 'seasons',
    when: 'Autumn, from late afternoon into dusk',
    name: 'A harvest supper',
    how: 'Lay a plaza at least three by three with houses round it. In autumn, late in the day, the neighbours set a long table down the middle of the square under a string of lanterns and sit down to supper together.',
    proof: { socket: { rule: 'L65.supper' } },
    seed: 7806,
    build(b) {
      b.plaza(17, 18, 23, 21);
      for (let i = 0; i < 3; i++) b.house(17 + i * 3, 15, { w: 2, d: 2, floors: 2, color: (i * 3 + 2) % 8 });
      for (let i = 0; i < 3; i++) b.house(17 + i * 3, 23, { w: 2, d: 2, floors: 1, color: (i * 5 + 3) % 8 });
      b.path(16, 17, 24, 17).path(16, 22, 24, 22);
    },
    view: { yaw: 25, pitch: 40 },
    pad: 0.2,
    // At table under the lanterns at dusk (SUPPER_GUIDE_AT).
    life: { settle: SUPPER_GUIDE_AT, residents: true, season: 'autumn', weather: 'clear', time: 'dusk' },
    frame: [17, 18, 23, 21, 1],
  },

  // ── happenings: everything the town does by itself (L23–L72) ──────────
  {
    id: 'raid',
    group: 'big-days',
    name: 'A raid',
    when: 'With Raiders on in the menu: after 8 minutes of play, then every 12 to 20; or the Raid tool any time',
    how: 'A town of 14 buildings or more with a shore a ship can reach is raided now and then by day: a longship runs up the beach (rowing boats where there is none), the band loots and sets fires, and the townsfolk fight back with brooms. Sink the ship with a bomb or lightning before it lands and they never come ashore; they only come by themselves when the Raiders switch in the menu is on.',
    proof: { socket: { rule: 'L27.displaced' } },
    ...town(beachScn),
    view: { yaw: 20, pitch: 40 },
    pad: 0.2,
    life: { settle: 60, residents: true, start: { what: 'raid', at: 1, where: [21, 0, 27] } },
    frame: [16, 17, 25, 22, 2],
  },
  {
    id: 'festival',
    group: 'big-days',
    name: 'The midwinter festival',
    when: 'The last third of winter, lit from dusk',
    how: 'Every town dresses up for the festival: strings of lights along the streets and round the squares, wreaths on the doors and a tree on the main square. It goes up house by house and lights up at dusk.',
    proof: { prop: { rule: 'D35.festival-lights' } },
    ...town(supperScn),
    view: { yaw: 25, pitch: 40 },
    pad: 0.2,
    life: { settle: 20, residents: true, season: 'festival', weather: 'clear', time: 'dusk' },
    frame: [16, 15, 26, 24, 2],
  },
  {
    id: 'carols',
    group: 'seasons',
    name: 'Carol singers',
    when: 'Winter or the festival, at dusk',
    how: 'Build six houses or more round the middle of town. At dusk a band of singers with lanterns goes from door to door singing, and whoever is at home comes out onto the step to listen.',
    proof: { socket: { rule: 'L67.carols' } },
    ...town(carolScn),
    view: { yaw: 25, pitch: 42 },
    pad: 0.2,
    life: { settle: 45, residents: true, season: 'winter', weather: 'clear', time: 'dusk' },
    frame: [16, 16, 24, 21, 2],
  },
  {
    id: 'harvest',
    group: 'seasons',
    name: 'The harvest',
    when: 'Late summer and autumn, by day, when it is dry',
    how: 'Grow a wheat field with a windmill that can be walked to. Farmhands mow it with scythes a square at a time, stooks stand on the stubble and the sheaves are carried to the mill for flour.',
    proof: { socket: { rule: 'L59.harvest' } },
    ...town(harvestScn),
    view: { yaw: 40, pitch: 36 },
    pad: 0.2,
    life: { settle: 40, residents: true, season: 'autumn', weather: 'clear' },
    frame: [19, 15, 25, 20, 3],
  },
  {
    id: 'unloading',
    group: 'by-water',
    name: 'Ships unloading',
    when: 'Whenever a ship is in, by day',
    how: 'Build a quay with shops, an inn or stalls within 24 steps of it. Ships come in and land crates, barrels and sacks, and carters wheel the goods up to the shops by handcart.',
    proof: { socket: { rule: 'L58.trade' } },
    ...town(tradeScn),
    view: { yaw: 40, pitch: 32 },
    pad: 0.2,
    life: { settle: 80, residents: true },
    frame: [19, 22, 27, 28, 2],
  },
  {
    id: 'waving-ships-in',
    group: 'by-water',
    name: 'Waving a ship in',
    when: 'When a big ship comes in, by day',
    how: 'Build a pier or a quay where ships call. When a big ship comes in, the children run to the end of the pier nearest it and wave, jump and cheer it in to its berth.',
    proof: { socket: { rule: 'L27.displaced' } },
    ...town(harbourScn),
    view: { yaw: 40, pitch: 34 },
    pad: 0.2,
    life: { settle: 30, residents: true },
  },
  {
    id: 'the-catch',
    group: 'by-water',
    name: 'The catch comes in',
    when: 'Dawn and by day',
    how: 'Put a pier with a fish stall or a fish shop within 20 steps of it. The fisher fishes off its end and carries a basket of the catch up to the stall, and people come down to buy a fish.',
    proof: { socket: { rule: 'L53.fish' } },
    ...town(fishScn),
    view: { yaw: 30, pitch: 34 },
    pad: 0.2,
    life: { settle: 30, residents: true },
    frame: [16, 24, 23, 30, 2],
  },
  {
    id: 'bread',
    group: 'every-day',
    name: 'Bread from the mill',
    when: 'Dawn and by day',
    how: 'Have a windmill and a bakery (a shop, else the inn) the miller can walk between. The miller carries sacks of flour to the bakery, the baker carries trays of loaves to the stalls and cafés, and people come for bread in the morning.',
    proof: { socket: { rule: 'L51.bread' } },
    ...town(breadScn),
    view: { yaw: 45, pitch: 34 },
    pad: 0.2,
    life: { settle: 40, residents: true },
    frame: [16, 17, 24, 22, 2],
  },
  {
    id: 'fetching-water',
    group: 'every-day',
    name: 'Fetching water',
    when: 'By day',
    how: 'Put a well or a fountain near houses. Now and then somebody comes with a pail, fills it and carries the water home on a yoke.',
    proof: { socket: { rule: 'L52.water' } },
    ...town(waterScn),
    view: { yaw: 45, pitch: 34 },
    pad: 0.2,
    life: { settle: 40, residents: true },
    frame: [15, 19, 22, 24, 2],
  },
  {
    id: 'washing-day',
    group: 'every-day',
    name: 'Washing day',
    when: 'Mornings; taken in at dusk or in the rain',
    how: 'Hang a laundry line between two houses. The washing is carried out in a basket and hung up in the morning, and taken in again at dusk or when it rains.',
    proof: { socket: { rule: 'L60.laundry' } },
    ...town(laundryScn),
    view: { yaw: 60, pitch: 40 },
    pad: 0.2,
    life: { settle: 25, residents: true },
    frame: [16, 16, 23, 21, 3],
  },
  {
    id: 'school-lesson',
    group: 'every-day',
    name: 'School and hopscotch',
    when: 'By day, a lesson every two and a half minutes',
    how: 'Build a schoolhouse with families living near it. The teacher calls the children in for their lesson, and afterwards they burst out to hop the hopscotch in the yard.',
    proof: { socket: { rule: 'L62.places' } },
    ...town(schoolScn),
    view: { yaw: 30, pitch: 32 },
    pad: 0.2,
    life: { settle: 85, residents: true },
    frame: [26, 10, 33, 15, 2],
  },
  {
    id: 'smith-at-work',
    group: 'every-day',
    name: 'The smith at work',
    when: 'By day',
    how: 'Build a smithy. The smith hammers at the anvil with sparks flying, then works the forge inside, and the forge chimney smokes while it is hot.',
    proof: { role: 'smithy' },
    ...town(smithyScn),
    view: { yaw: 30, pitch: 28 },
    pad: 0.2,
    life: { settle: 12, residents: true },
    frame: [7, 8, 13, 13, 2],
  },
  {
    id: 'a-show',
    group: 'every-day',
    name: 'A show',
    when: 'By day and at dusk, every three and a half minutes',
    how: 'Build a bandstand or a theatre with houses round about. A band or players perform for a minute while people come to sit or stand round and clap.',
    proof: { socket: { rule: 'L62.places' } },
    ...town(bandScn),
    view: { yaw: 35, pitch: 32 },
    pad: 0.2,
    life: { settle: 30, residents: true },
    frame: [9, 8, 16, 13, 3],
  },
  {
    id: 'games',
    group: 'every-day',
    name: 'Games on the field',
    when: 'By day and into dusk, a game every minute or so',
    how: 'Lay a playing field near houses: its shape decides the game (basketball, tennis, football, bowls, boules, croquet or races). People come out to play and others stop at the edge to watch and clap.',
    proof: { role: 'basketball-court' },
    ...town(courtScn),
    view: PLAY_VIEW,
    pad: 0.2,
    life: { settle: 45, residents: true },
  },
  {
    id: 'dogs',
    group: 'every-day',
    name: 'Dogs',
    when: 'All day',
    how: 'Build six houses or more: every sixth house keeps a dog. It trots at its people’s heels, says hello to passers-by and chases the cats.',
    proof: { socket: { rule: 'L61.dogs' } },
    ...town(dogsScn),
    view: { yaw: 45, pitch: 36 },
    pad: 0.2,
    life: { settle: 30, residents: true },
    frame: [16, 18, 24, 23, 2],
  },
  {
    id: 'scuffle',
    group: 'every-day',
    name: 'A scuffle',
    when: 'Now and then, when two walkers bump into each other',
    how: 'Any town with people out in its streets: now and then two who bump into each other vanish into a dust cloud of fists and stars while a crowd gathers. They sit up dazed and dust themselves off, and the watchman or a guard breaks it up if one is near.',
    proof: { actor: { rule: 'L21.population' } },
    ...town(scuffleScn),
    view: { yaw: 30, pitch: 30 },
    pad: 0.2,
    life: { settle: 12, residents: true, start: { what: 'scuffle', at: 8 } },
    frame: [16, 18, 24, 23, 2],
  },
  {
    id: 'lamplighter',
    group: 'evening',
    name: 'The lamplighter',
    when: 'At dusk',
    how: 'Put street lamps along your paths. At dusk the lamplighter walks the round with a pole and lights them one by one, while the windows light up as people come home.',
    proof: { socket: { rule: 'L23.jobs' } },
    ...town(jobsScn),
    view: { yaw: 30, pitch: 30 },
    pad: 0.2,
    life: { settle: 25, residents: true, time: 'dusk' },
    frame: [11, 17, 19, 22, 2],
  },
  {
    id: 'night-watch',
    group: 'evening',
    name: 'The night watch',
    when: 'At night',
    how: 'Build a town of 12 houses or more with no castle. At night the watchman walks a round of its streets and squares with a lantern on a pole, stopping to look about at each.',
    proof: { socket: { rule: 'L55.watchman' } },
    ...town(watchScn),
    view: { yaw: 45, pitch: 40 },
    pad: 0.2,
    life: { settle: 30, residents: true, time: 'night' },
    frame: [17, 18, 26, 25, 2],
  },
  {
    id: 'fire-brigade',
    group: 'after-mischief',
    name: 'The fire brigade',
    when: 'As soon as something catches fire',
    how: 'Set a building alight with Lightning or a bomb in a town with a well or a fountain. The brigade wheels the pump cart from it and hoses the fire while neighbours pass buckets, and afterwards crews put the burnt buildings back up under scaffolding.',
    proof: { actor: { rule: 'L21.population' } },
    ...town(waterScn),
    view: { yaw: 45, pitch: 34 },
    pad: 0.2,
    life: { settle: 16, residents: true, start: { what: 'fire', at: 2, where: [18.5, 1, 17.5] } },
    frame: [15, 15, 22, 21, 3],
  },
];

/** Every entry, in the order the guide shows them: group by group (GROUPS), each group as listed. */
export const ENTRIES: readonly GuideEntry[] = GROUPS.flatMap((g) => LISTED.filter((e) => e.group === g.id));

/**
 * The roles the guide leaves out, and why. Every role in the game is either
 * the proof of an entry or listed here (guide.test.ts checks both ways, and
 * the type check fails if a new role is in neither).
 */
export const NOT_SPECIAL: Readonly<Partial<Record<Role, string>>> = {
  'cottage': 'the default house: what any house is when nothing special applies',
  'watchtower': 'the default tower',
  'windmill': 'a tray piece of its own (Mill): no surprise',
  'terrace': 'the default marble: plain paved marble',
  'jetty': 'the default dock',
  'palm': 'a tree variant (sand by the water): plain variants are left out',
  'willow': 'a tree variant (beside water)',
  'pine': 'a tree variant (high ground)',
  'planter-tree': 'a tree variant (on or beside a plaza)',
  'fruit-tree': 'a tree variant (on garden)',
  'grove-tree': 'a tree variant (five or more trees together)',
  'round-tree': 'a tree variant (the seeded mix)',
  'cypress': 'a tree variant (the seeded mix)',
  'bush': 'a tree variant (the seeded mix)',
  'tiered-fountain': 'a fountain variant (in a square)',
  'well': 'a fountain variant (in a courtyard)',
  'birdbath': 'a fountain variant (on garden)',
  'basin': 'the default fountain',
  'fish-stall': 'a stall variant (near a dock)',
  'flower-stall': 'a stall variant (on garden)',
  'market-stall': 'the default stall',
  'reed-bed': 'a garden variant (beside water): planting, not a building',
  'kitchen-garden': 'a garden variant (beside a house)',
  'flower-garden': 'the default garden',
  'picket-fence': 'the default fence',
  'rope-fence': 'a fence variant (on a dock or bridge)',
  'iron-railing': 'a fence variant (on a roof terrace)',
  'stone-balustrade': 'a fence variant (on marble)',
  'low-wall': 'the default wall',
  'garden-wall': 'a wall variant (around a garden)',
  'curtain-wall': 'a wall variant (touching marble or a tower): shown in the castle turret and gatehouse pictures',
  'forge-chimney': 'the smithy’s tower: shown in the smithy picture',
};

/** The recipe as a scenario (`also` picks one of the other ways): what the proof test and the picture tool use. */
export function guideScenario(entry: GuideEntry, also?: number): Scenario {
  const recipe: Recipe = also === undefined ? entry : entry.also![also]!;
  return scenario({
    name: also === undefined ? `guide.${entry.id}` : `guide.${entry.id}.${also + 1}`,
    seed: entry.seed,
    terrain: recipe.ground ?? 'flat',
    build: recipe.build,
    about: `${entry.name}: ${entry.how}`,
  });
}

/** The roles the entries prove. */
export function provenRoles(entries: readonly GuideEntry[] = ENTRIES): Role[] {
  return entries.flatMap((e) => ('role' in e.proof ? [e.proof.role] : []));
}
