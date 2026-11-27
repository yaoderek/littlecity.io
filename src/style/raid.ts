// The raid (design section 13b): its numbers. Seconds of life time, cells.

import { defineStyle } from '@/core/style';

export const RAID = defineStyle(
  'raid',
  {
    /** The longship under sail, and rowing in to the beach (cells a second). */
    sail: 1.7,
    row: 0.9,
    /** The rowing boats (cells a second). */
    boatRow: 1.1,
    /** Radians a second the longship spins about under oars at its turning point. */
    spin: 0.45,
    /** The band: raiders at least and at most, and how many buildings of the town make one more raider. */
    bandMin: 8,
    bandMax: 16,
    perBuildings: 6,
    /** Seconds ashore before the chief blows the horn for home (at most; sooner once there is nothing left to take or burn). */
    ashore: 95,
    /** Buildings the torch-bearers set alight: this share of the town's buildings, at least and at most this many (the fire spreads on its own from them). */
    burnShare: 0.22,
    burnMin: 4,
    burnMax: 16,
    /** Trips a looter makes, at most. */
    trips: 2,
    /** Seconds a looter is inside a building, and holds the kick at its door. */
    inside: 2.4,
    kick: 0.7,
    /** Villagers within this many cells of a raider (or of the landing as the band comes ashore) run. */
    flee: 7,
    /** Seconds a raid without its ship waits, stranded, before the band loses heart. */
    strandedWait: 4,
    /** Raids on their own (the Raiders switch): seconds of play before the first may come, and between raids (and a spread on top). */
    first: 480,
    every: 720,
    everySpread: 480,
    /** A town must have at least this many buildings to be worth raiding on its own. */
    worth: 14,
    /**
     * Raiders alive at once, all parties together (every click brings another): past this a new party is a
     * token crew (tokenCrew). Less on a phone-sized screen.
     */
    ceiling: 40,
    ceilingPhone: 24,
    tokenCrew: 3,
    /**
     * The castle's garrison (sally.ts): seconds it rests after marching home before it will sally again;
     * its march out at the double and its run at a raider (cells a second); a brawl's seconds, at least and at
     * most; a soldier's chance of winning one alone (two on one, nearly always); seconds the loser sits dizzy;
     * and the share of a band beaten that breaks it.
     */
    /** A castle's garrison turns out against raids at all (1), or never (0: for comparing, in tests). */
    sally: 1,
    garrisonRest: 120,
    sallyMarch: 1.05,
    sallyRun: 1.35,
    brawlMin: 2.2,
    brawlMax: 3.6,
    soldierWins: 0.8,
    dazed: 2.6,
    breaks: 0.4,
  },
  {
    sail: [0.5, 4, 0.1],
    row: [0.3, 3, 0.1],
    boatRow: [0.3, 3, 0.1],
    bandMin: [2, 20, 1],
    bandMax: [2, 30, 1],
    ashore: [10, 300, 5],
    first: [0, 3600, 30],
    every: [30, 3600, 30],
    ceiling: [4, 200, 1],
    ceilingPhone: [4, 200, 1],
    tokenCrew: [1, 8, 1],
    garrisonRest: [0, 900, 10],
    soldierWins: [0, 1, 0.05],
    breaks: [0.1, 1, 0.05],
  },
);
