// The living town (catalogue L50 and up): the scuffle, errands and chains,
// events. Times are seconds, lengths world units (a cell is 1 wide).

import { defineStyle } from '@/core/style';

/** L50: the street scuffle (a run-time reaction, like L26). */
export const SCUFFLE = defineStyle(
  'scuffle',
  {
    /** Chance that a head-on bump between two walkers who may fight turns into a scuffle; and a squeeze past. */
    chance: 0.3,
    squeeze: 0.5,
    /** Two walkers count as bumping when they meet head on closer than this to each other's line. */
    bumpLat: 0.16,
    /** Seconds the town rests after one scuffle before another may start: least, most (seeded between). */
    restMin: 75,
    restMax: 130,
    /** Seconds of the cloud: least, most. */
    fightMin: 4.2,
    fightMax: 5.8,
    /** Seconds sat dazed with stars, getting up and dusting off, and shaking hands. */
    dazed: 2.4,
    up: 1.1,
    shake: 1.8,
    /** Chance they make it up and go to the inn together (else they stomp off their own ways). */
    makeUp: 0.35,
    /** Watchers: within this many cells, at most this many; the share of them who cheer. */
    watchReach: 3.2,
    watchers: 7,
    cheer: 0.45,
    /** Size of the cloud (radius, height) and how far it rolls along the street either way. */
    cloudR: 0.36,
    cloudH: 0.58,
    roll: 0.22,
    /** Drawings a second of the cloud, its pop-outs and the swearing bubble. */
    drawRate: 12,
    /** Seconds each grawlix stays up in the bubble. */
    swear: 0.42,
    /** Seconds the cloud may roll on while somebody comes to break it up. */
    waitBreak: 16,
    /** How far off (cells) the watchman or a guard notices a scuffle and comes to break it up. */
    responderReach: 12,
  },
  {
    chance: [0, 1, 0.01],
    squeeze: [0, 1, 0.01],
    bumpLat: [0.02, 0.4, 0.01],
    restMin: [0, 600, 5],
    restMax: [0, 900, 5],
    fightMin: [1, 12, 0.1],
    fightMax: [1, 15, 0.1],
    dazed: [0.5, 6, 0.1],
    up: [0.2, 3, 0.1],
    shake: [0.5, 4, 0.1],
    makeUp: [0, 1, 0.01],
    watchReach: [1, 6, 0.1],
    watchers: [0, 16, 1],
    cheer: [0, 1, 0.01],
    cloudR: [0.1, 0.6, 0.01],
    cloudH: [0.2, 1, 0.01],
    roll: [0, 0.5, 0.01],
    drawRate: [4, 30, 1],
    swear: [0.1, 1.5, 0.02],
    waitBreak: [0, 60, 1],
    responderReach: [0, 48, 1],
  },
);

/** L51 and up: the town's chains. */
export const CHAINS = defineStyle(
  'chains',
  {
    /** L51: seconds between the miller's trips (they shuttle while the heap has room); sacks that heap by the bakery door. */
    millGap: 4,
    /** L51: how many carry sacks from the mill (the miller and a helper). */
    millers: 2,
    sacks: 6,
    /** L51: seconds the baker is in baking; seconds between batches; loaves a tray holds. */
    bake: 3.5,
    bakeGap: 4,
    tray: 3,
    /** L51: chance a resident choosing what to do goes for bread when there is some (mornings, and the rest of the day). */
    buyMorning: 0.3,
    buy: 0.14,
    /** L51: the farthest (grid steps) a resident walks for bread. */
    buyReach: 18,
    /** L52: chance a resident choosing what to do goes for water; seconds at the well filling the bucket. */
    water: 0.12,
    fill: 2.6,
    /** L53: seconds the fisher fishes before carrying the catch up; seconds between catches at least; chance a resident goes for fish. */
    fishing: 10,
    fishGap: 14,
    fishBuyMorning: 0.16,
    fishBuy: 0.08,
    /** L59: seconds a farmhand mows each cell. */
    mow: 4.5,
    /** L58: seconds a carter rests between trips with the cart. */
    cartGap: 3,
    /** L55: seconds the watchman stops at each post of the beat. */
    watchStop: 2.5,
  },
  {
    millGap: [0, 120, 1],
    millers: [1, 2, 1],
    sacks: [1, 8, 1],
    bake: [1, 20, 0.5],
    bakeGap: [0, 120, 1],
    tray: [1, 3, 1],
    buyMorning: [0, 1, 0.01],
    buy: [0, 1, 0.01],
    buyReach: [4, 40, 1],
    water: [0, 1, 0.01],
    fill: [0.5, 8, 0.1],
    fishing: [1, 120, 1],
    fishGap: [0, 300, 1],
    fishBuyMorning: [0, 1, 0.01],
    fishBuy: [0, 1, 0.01],
    watchStop: [0, 10, 0.1],
    cartGap: [0, 60, 1],
    mow: [1, 20, 0.5],
  },
);

/** L54: builders and onlookers when a building lands. */
export const BUILD = defineStyle(
  'build',
  {
    /** Seconds between two building jobs at least; jobs going at once at most. */
    gap: 6,
    most: 2,
    /** More than this many pieces landing in five seconds is a paste or a playback: then a job only every floodGap seconds. */
    flood: 10,
    floodGap: 40,
    /** Seconds a job waits for its builders before it lapses. */
    lapse: 25,
    /** The farthest (grid steps) a builder or onlooker comes from. */
    reach: 12,
    /** Seconds of hammering; onlookers for something big, and how long they look. */
    hammer: 4.5,
    watchers: 4,
    look: 7,
  },
  { gap: [0, 60, 1], most: [0, 6, 1], flood: [2, 60, 1], floodGap: [0, 300, 5], lapse: [5, 120, 1], reach: [2, 40, 1], hammer: [1, 15, 0.5], watchers: [0, 10, 1], look: [1, 20, 0.5] },
);

/** L56: market day. */
export const MARKET = defineStyle(
  'market',
  {
    /** Share of days that are market days (the first day the town is seen always is). */
    chance: 0.6,
    /** The phase of the loop at which it packs up (day runs 0–0.56; 0.4 is mid-afternoon). */
    close: 0.4,
    /** Chance a resident choosing what to do goes to buy at the market while it is on, and stops to watch the busker. */
    buy: 0.25,
    watch: 0.12,
    /** The farthest (grid steps) a resident walks to the market. */
    reach: 26,
    /** Seconds a stall stands after closing with nobody to pack it before it folds by itself. */
    abandon: 20,
  },
  { chance: [0, 1, 0.01], close: [0, 0.56, 0.01], buy: [0, 1, 0.01], watch: [0, 1, 0.01], reach: [4, 48, 1], abandon: [0, 120, 1] },
);

/** L57: the wedding. */
export const WEDDING = defineStyle(
  'wedding',
  {
    /** Seconds after the town is first seen that the first wedding starts, at least (and up to `firstSpread` more). */
    first: 25,
    firstSpread: 20,
    /** Seconds from the end of one wedding to the next, at least (and up to `everySpread` more); only by day, with day enough left to hold it. */
    every: 300,
    everySpread: 120,
    /** Seconds a wedding needs left before night when it starts (with the time of day running): it is over by the end of dusk. */
    needs: 240,
    /** The party at most, and its share of the town's people; the farthest (grid steps) anybody in it walks to get there: home to change, then to the chapel. */
    party: 20,
    share: 0.4,
    reach: 32,
    /** Seconds the guests are given to gather (they come in ones and twos), and the most it may drag on before the couple come out anyway. */
    gather: 40,
    gatherMost: 90,
    /** Seconds the couple are inside (the bells ring); seconds on the doorstep (the kiss, the shower of petals). */
    vows: 6,
    step: 5,
    /** The procession: walking speed (cells a second), the gap between rows and between the two files. */
    pace: 0.42,
    spacing: 0.4,
    file: 0.13,
    /** The longest way round (grid steps of walking) the procession may take to the square. */
    route: 34,
    /** At the square: seconds of celebration (the ring of guests, the first dance, hats in the air). */
    square: 32,
    /** Petals on the ground: seconds they lie before they are swept up. */
    lie: 50,
    /** Seconds the whole thing may take at most before it is called off. */
    most: 420,
  },
  {
    first: [0, 300, 1],
    firstSpread: [0, 120, 1],
    every: [30, 1800, 10],
    everySpread: [0, 600, 10],
    needs: [0, 330, 5],
    party: [2, 30, 1],
    share: [0.05, 1, 0.05],
    reach: [4, 60, 1],
    gather: [5, 120, 1],
    gatherMost: [10, 240, 1],
    vows: [0, 30, 0.5],
    step: [0, 15, 0.5],
    pace: [0.2, 1, 0.02],
    spacing: [0.25, 0.7, 0.01],
    file: [0.06, 0.2, 0.01],
    route: [8, 80, 1],
    square: [0, 90, 1],
    lie: [0, 300, 5],
    most: [60, 900, 10],
  },
);

/** L57: the colours of wedding finery and of the petals. */
export const FINERY = {
  white: '#fbf8f2',
  veil: '#fffdf8',
  black: '#26252e',
  grey: '#6c6a74',
  /** Bridesmaids' and guests' pale dresses. */
  pale: ['#fbf8f2', '#f9e3ea', '#fdf3dc', '#e9eef8', '#fbf8f2'] as readonly string[],
  /** Dark suits. */
  dark: ['#26252e', '#2f3448', '#3a3540'] as readonly string[],
  ties: ['#c9496b', '#8f9cc8', '#26252e', '#e6c35a'] as readonly string[],
  hats: ['#fbf8f2', '#f4c9d6', '#f2e0b0', '#cfe0f2'] as readonly string[],
  rose: '#e2557c',
  pink: '#f4a3bf',
  yellow: '#ffd96e',
  /** Petals: pinks first (they show on the cream of a path), a few white and red. */
  petals: ['#f17ea2', '#f4a3bf', '#e2557c', '#fbf8f2', '#f9c3d4', '#d9435f'] as readonly string[],
  /** In the air (each is drawn round with ink, so lighter). */
  petalsAir: ['#f7a8c4', '#fbd3e0', '#f4a3bf', '#fffdf8', '#f9c3d4', '#f490b2'] as readonly string[],
  /** Bunting and ribbons on the chapel on the day. */
  ribbons: ['#fbf8f2', '#f4a3bf', '#fbf8f2', '#e2557c'] as readonly string[],
};

/** L51 and up: what people carry. */
export const LOADS = defineStyle(
  'loads',
  {
    /** How much bigger loads are drawn from the whole-island view than close in (they grow as the camera draws back). */
    far: 1.9,
  },
  { far: [1, 3, 0.05] },
);

/** L62 and the fill builder's places. */
export const PLACES = defineStyle(
  'places',
  {
    /** School: seconds from one lesson's start to the next, of the lesson, of play in the yard after; how far from home a child goes. */
    schoolCycle: 150,
    lesson: 70,
    play: 14,
    schoolReach: 30,
    /** Smith: seconds at the anvil each spell. */
    hammer: 9,
    /** Shows: seconds from one show's start to the next at a place, of the show; the chance a resident goes, and how far. */
    showCycle: 210,
    show: 60,
    audience: 0.35,
    showReach: 24,
    /** The chance a resident choosing what to do stops at a wall booth. */
    browse: 0.1,
    /** Orchard: seconds up the ladder picking. */
    pick: 5,
    /** Maypole: seconds from one dance to the next, of the dance; dancers at most. */
    danceCycle: 180,
    dance: 50,
    dancers: 6,
  },
  {
    schoolCycle: [30, 600, 5], lesson: [10, 300, 5], play: [2, 60, 1], schoolReach: [4, 48, 1], hammer: [1, 30, 0.5],
    showCycle: [30, 900, 5], show: [10, 300, 5], audience: [0, 1, 0.01], showReach: [4, 48, 1], browse: [0, 1, 0.01],
    pick: [1, 20, 0.5], danceCycle: [30, 900, 5], dance: [10, 300, 5], dancers: [2, 12, 1],
  },
);

/** Market talk: a purchase as a little conversation in picture bubbles, and apples from the orchard to the stalls. */
export const TALK = defineStyle(
  'talk',
  {
    /** Seconds each bubble of the exchange stays up (the ask, the seller's answer); the haggle's four bubbles together. */
    bubble: 1.2,
    haggle: 3,
    /** One purchase in this many: the stall has not got the first thing asked for; one in this many haggles; one in this many leaves with a heart. */
    soldOut: 6,
    haggleEvery: 5,
    heartEvery: 4,
    /** Grid steps two bubbles' owners must be apart before both may show (bubbles of one exchange take turns, so never meet). */
    gap: 2,
    /** At most this many bubbles on screen at once: a big screen, a phone (the governor's lowest level shows none). */
    cap: 6,
    capPhone: 3,
    /** How big a bubble is drawn: close in (zoom 6 and more), and from the whole-island view. */
    near: 1,
    far: 5,
    /** Seconds the coin flies from hand to hand, and the bought thing from the counter to the hand. */
    coinFlight: 0.4,
    handFlight: 0.35,
    /** Chance a resident choosing what to do goes to buy at a shop a ship has supplied (asking for a cheese or a jug). */
    cargoBuy: 0.05,
  },
  {
    bubble: [0.4, 4, 0.1], haggle: [1, 8, 0.1], soldOut: [1, 30, 1], haggleEvery: [1, 30, 1], heartEvery: [1, 30, 1], gap: [0, 6, 1],
    cap: [0, 16, 1], capPhone: [0, 16, 1], near: [0.5, 3, 0.05], far: [0.5, 8, 0.05], coinFlight: [0.1, 1.5, 0.05], handFlight: [0.1, 1.5, 0.05], cargoBuy: [0, 1, 0.01],
  },
);

/** Apples to market: from the orchard's big basket to the stalls. */
export const APPLES = defineStyle(
  'apples',
  {
    /** Apples a picker's basket adds to the big basket; how many the big basket holds; how many a carrier takes to market at once. */
    perPick: 2,
    bigBasket: 6,
    carry: 3,
    /** Seconds the carrier waits between trips at least. */
    carryGap: 8,
    /** Chance a resident choosing what to do goes for an apple when a stall has some (mornings, the rest of the day); when none has any. */
    buyMorning: 0.16,
    buy: 0.08,
    buyEmpty: 0.02,
    /** The farthest (grid steps) a resident walks for an apple. */
    reach: 20,
  },
  { perPick: [1, 6, 1], bigBasket: [1, 9, 1], carry: [1, 6, 1], carryGap: [0, 120, 1], buyMorning: [0, 1, 0.01], buy: [0, 1, 0.01], buyEmpty: [0, 1, 0.01], reach: [4, 40, 1] },
);
