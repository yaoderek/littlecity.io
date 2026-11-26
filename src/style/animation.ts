// Motion (Stage 3, Animation owner): every number the moving things read.
// The style of the motion itself is written down in src/life/MOTION.md; this
// file is its dials. Times are seconds, lengths world units (a cell is 1 wide,
// 0.8 tall), angles radians unless the name says degrees.

import { defineStyle } from '@/core/style';

/** The house style of motion: how drawn things are timed. */
export const MOTION = defineStyle(
  'motion',
  {
    /** Poses are redrawn this many times a second ("on twos" at 24 fps). Travel stays smooth. */
    poseFps: 12,
    /** Overshoot of the one easing family's "pop" (the classic back ease; 1.70158 overshoots by 10%). */
    overshoot: 1.70158,
  },
  { poseFps: [4, 60, 1], overshoot: [0, 4, 0.05] },
);

/** F01–F05: what a click does. The single most felt thing in the game. */
export const FEEDBACK = defineStyle(
  'feedback',
  {
    // F01 landing: drop, squash, overshoot, settle.
    landTime: 0.28,
    /** Fraction of a cell the piece falls. */
    landDrop: 0.4,
    landSquash: 0.85,
    landStretch: 1.08,
    /** When the piece touches down, as a fraction of landTime. */
    landImpact: 0.3,
    /** A big merged structure moves less: amplitude = 1 / (1 + landHeavy × (cells − 1)). */
    landHeavy: 0.3,
    /** Never less than this, however big the structure. */
    landMin: 0.14,
    // The dust ring.
    dustPuffs: 6,
    dustTime: 0.45,
    dustReach: 1.0,
    dustSize: 0.3,
    // F02 neighbour wobble.
    wobbleTime: 0.3,
    wobbleDegrees: 2,
    wobbleCycles: 1.6,
    /** At most this many neighbours rock for one edit (the nearest ones). */
    wobbleMax: 8,
    /** Structures with more cells than this do not rock (a street, a long wall). */
    wobbleCells: 40,
    // F03 Auto morph.
    morphTime: 0.2,
    morphSquash: 0.72,
    sparkles: 6,
    sparkleTime: 0.5,
    sparkleReach: 0.7,
    // F04 removal.
    removeTime: 0.2,
    removePuffs: 5,
    /** A removed structure is redrawn to shrink away only if it had at most this many cells. */
    removeCells: 6,
    /** At most this many props pop when they lose their slot. */
    popOutMax: 10,
    // F05 pop-in.
    popGap: 0.1,
    popTime: 0.24,
    /** With more new props than this, the gap shrinks so the whole run takes popGap × popMany. */
    popMany: 18,
    /** An edit that changes more structures than this is a new town, not an edit: nothing plays. */
    quietAbove: 24,
    // The unlock moment (src/life/feedback/celebrate.ts): a building built by hand for the first time pops
    // up out of its foot instead of landing, in a burst of stars big enough to read from the opening view.
    unlockTime: 0.62,
    unlockStars: 14,
    unlockStarTime: 1.25,
    unlockReach: 1.15,
    unlockStarSize: 0.42,
  },
  {
    landTime: [0.1, 0.8, 0.01],
    landDrop: [0, 1, 0.05],
    landSquash: [0.5, 1, 0.01],
    landStretch: [1, 1.4, 0.01],
    landImpact: [0.1, 0.6, 0.01],
    landHeavy: [0, 2, 0.05],
    dustPuffs: [0, 12, 1],
    dustTime: [0.1, 1, 0.01],
    dustReach: [0.2, 1.5, 0.02],
    dustSize: [0.04, 0.3, 0.01],
    wobbleTime: [0.1, 1, 0.01],
    wobbleDegrees: [0, 8, 0.25],
    wobbleCycles: [0.5, 4, 0.1],
    morphTime: [0.05, 0.6, 0.01],
    morphSquash: [0.4, 1, 0.01],
    sparkles: [0, 12, 1],
    sparkleTime: [0.1, 1.2, 0.02],
    removeTime: [0.05, 0.6, 0.01],
    popGap: [0, 0.4, 0.01],
    popTime: [0.05, 0.8, 0.01],
    unlockTime: [0.2, 1.5, 0.02],
    unlockStars: [0, 24, 1],
    unlockStarTime: [0.4, 2.5, 0.05],
    unlockReach: [0.3, 3, 0.05],
    unlockStarSize: [0.1, 0.9, 0.02],
  },
);

/** L02, L03, L06: things the wind and the water move. */
export const WINDY = defineStyle(
  'windy',
  {
    // L02 smoke.
    /** Puffs alive over one chimney by day, and at dawn and dusk (the stove is lit). */
    smokePuffs: 3,
    smokePuffsBusy: 4,
    /** Seconds a puff lives. */
    smokeLife: 4.6,
    smokeRise: 1.0,
    /** Columns a second a puff drifts downwind, per unit of wind strength. */
    smokeLean: 0.3,
    /** Width of a puff leaving the pot, and how many times that it grows to. */
    smokeSize: 0.16,
    smokeGrow: 3.1,
    /** Opacity of the wash by day, and at dawn and dusk. */
    smokeOpacity: 0.62,
    smokeOpacityBusy: 0.82,
    /** ... and at night, when it is hard to see against the dark. */
    smokeOpacityNight: 0.3,
    // L03 sails.
    /** Radians a second at wind strength 1; a mill in calm air still creeps at sailIdle. */
    sailSpeed: 1.9,
    sailIdle: 0.12,
    /** How quickly the wheel picks up and loses speed (per second). */
    sailInertia: 0.6,
    /** Weathervanes: how fast they swing round to the wind, and how much they hunt about it. */
    vaneTurn: 2.4,
    vaneHunt: 0.35,
    // L06 rings on the water.
    ringEvery: 2.6,
    ringLife: 2.2,
    ringGrow: 2.6,
  },
  {
    smokePuffs: [0, 6, 1],
    smokePuffsBusy: [0, 8, 1],
    smokeLife: [1, 8, 0.1],
    smokeRise: [0.2, 2, 0.05],
    smokeLean: [0, 2, 0.02],
    smokeSize: [0.03, 0.4, 0.005],
    smokeGrow: [1, 4, 0.1],
    smokeOpacity: [0, 1, 0.01],
    smokeOpacityBusy: [0, 1, 0.01],
    smokeOpacityNight: [0, 1, 0.01],
    sailSpeed: [0, 6, 0.1],
    sailIdle: [0, 1, 0.02],
    sailInertia: [0.1, 4, 0.1],
    vaneTurn: [0.2, 8, 0.1],
    vaneHunt: [0, 1, 0.05],
    ringEvery: [0.5, 8, 0.1],
    ringLife: [0.5, 5, 0.1],
    ringGrow: [1, 5, 0.1],
  },
);

/** L07, L09 and lamps: what dusk switches on. */
export const DUSKY = defineStyle(
  'dusky',
  {
    /** L07: shop windows come on over this many seconds, as soon as the page lets anything glow. */
    shopRamp: 4,
    /** L07: the share of homes that stay up through the night (about one in six), and of early risers lit at dawn. */
    nightOwls: 0.167,
    earlyRisers: 0.3,
    /** L07: homes go to bed between these fractions of the night (the first half); downstairs goes dark first, upstairs this much later. */
    bedFrom: 0.04,
    bedTo: 0.42,
    upstairsLater: 0.06,
    /** L07: an owl's light goes out for a while about this share of the time; a sleeper's comes on for a while about this share (seconds-long spells, changing through the night). */
    owlOff: 0.22,
    wakeUp: 0.04,
    nightSpell: 24,
    /** Seconds a house takes to fade when it goes to bed or someone comes home. */
    houseFade: 0.5,
    /** Lamps: seconds between one lamp and the next along a street, and how late the last street may start. */
    lampGap: 1.4,
    lampSpread: 7,
    /** Seconds a lamp takes to catch, with a flicker. */
    lampCatch: 0.45,
    /** L09: seconds for one turn of the beam; its half-width in radians; length per storey. */
    beamTurn: 9,
    beamWidth: 0.11,
    beamReach: 9,
    beamReachPerStorey: 1.2,
    /** L09: seconds the beam takes to come up at nightfall and die at dawn. */
    beamFade: 3,
  },
  {
    shopRamp: [0, 12, 0.5],
    nightOwls: [0, 1, 0.01],
    earlyRisers: [0, 1, 0.01],
    upstairsLater: [0, 0.3, 0.01],
    owlOff: [0, 1, 0.01],
    wakeUp: [0, 0.5, 0.01],
    nightSpell: [4, 120, 1],
    bedFrom: [0, 1, 0.01],
    bedTo: [0, 1, 0.01],
    houseFade: [0, 3, 0.05],
    lampGap: [0.1, 5, 0.1],
    lampSpread: [0, 20, 0.5],
    lampCatch: [0, 2, 0.05],
    beamTurn: [3, 30, 0.5],
    beamWidth: [0.03, 0.4, 0.01],
    beamReach: [3, 24, 0.5],
    beamReachPerStorey: [0, 4, 0.1],
    beamFade: [0, 10, 0.5],
  },
);

/** L03 caps and L29: the town's mechanisms. */
export const MECHANISMS = defineStyle(
  'mechanisms',
  {
    /** A mill cap turning to the wind: how quickly (per second) it closes on it, and the most it turns a second (radians). */
    capTurn: 0.35,
    capMaxSpeed: 0.3,
    /** Bells: seconds a peal lasts at the start of dusk, the swing (radians) at its height, and seconds a swing takes. */
    pealTime: 14,
    bellSwing: 0.75,
    bellPeriod: 1.7,
    /** Fountain jets: beads in each stream, and seconds a bead takes from lip to pool. */
    jetBeads: 3,
    jetFall: 0.7,
    /** Shop signs: radians of swing per unit of wind across the board, and how springy the hinge is. */
    signSwing: 0.45,
    signSpring: 9,
    signDamp: 1.4,
  },
  {
    capTurn: [0.02, 3, 0.01],
    capMaxSpeed: [0.02, 3, 0.01],
    pealTime: [0, 60, 1],
    bellSwing: [0, 1.4, 0.05],
    bellPeriod: [0.6, 4, 0.1],
    jetBeads: [0, 8, 1],
    jetFall: [0.2, 2, 0.05],
    signSwing: [0, 1.2, 0.05],
    signSpring: [1, 30, 0.5],
    signDamp: [0, 8, 0.1],
  },
);

/** L29: doors that open (design section 13, "Doors and thresholds"). Lengths are along the walk, from the threshold. */
export const DOORS = defineStyle(
  'doors',
  {
    /** Seconds a leaf takes to swing fully open, and to close. */
    openTime: 0.45,
    shutTime: 0.65,
    /** Seconds it stays open after the last person through, so two in quick succession hold it. */
    linger: 0.8,
    /** Somebody walking in claims the door this far before the threshold; somebody coming out, this many seconds before. */
    reach: 1.0,
    lead: 0.6,
    /** And holds it until this far past it. */
    clear: 0.5,
    /** A walker whose door is not open yet waits this far before the threshold, clear of the swing. */
    wait: 0.36,
    /** Shops stand open by day: they open and shut up to this many seconds apart. */
    shopSpread: 18,
  },
  {
    openTime: [0.1, 2, 0.05],
    shutTime: [0.1, 2, 0.05],
    linger: [0, 4, 0.1],
    reach: [0.4, 2, 0.05],
    lead: [0, 2, 0.05],
    clear: [0.2, 1.5, 0.05],
    wait: [0.3, 0.6, 0.01],
    shopSpread: [0, 60, 1],
  },
);
