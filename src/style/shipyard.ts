// The shipyard (R-D05, D29, L75; src/life/town/chains/shipyard.ts): its
// shape, the slipway's timber, and the rhythm of a ship built from keel to
// launch. Lengths are world units (a cell is 1 wide, 0.8 tall; the sea is at
// 0.4), times game seconds (a day and night is 8 minutes).

import { defineStyle } from '@/core/style';

export const SHIPYARD = defineStyle(
  'shipyard',
  {
    // ── the shape (R-D05) ──
    /** A shipyard is a dock 3 wide running at least this many cells straight out from the shore. */
    slipMin: 6,
    /** A slip this long or longer builds galleons; a shorter one cogs. */
    galleonAt: 8,
    /** The timber shed (a warehouse or a barn) stands within this many cells of the land end. */
    shedReach: 3,

    // ── the slipway (slipway.part.ts) ──
    /** Height of the ways' top over the deck at the land end, and at the seaward end. */
    wayHead: 0.24,
    wayFoot: 0.07,
    /** How far the ways run on past the dock's end, down into the water, and how deep they end. */
    wayRun: 1.15,
    wayDeep: 0.22,
    /** The ways: width of each, and how far each lies from the middle of the slip. */
    wayWidth: 0.13,
    wayApart: 0.27,
    /** The cradle the hull sits in, over the ways. */
    cradle: 0.07,

    // ── the build (shipyard.ts): seconds per stage ──
    keel: 30,
    frames: 60,
    planks: 90,
    paint: 45,
    /** From the bunting going up to the ship sliding: the crowd gathers, the bottle breaks. */
    gather: 40,
    /** Seconds the empty slip waits before the next keel is laid. */
    pause: 60,
    /** Seconds from the town being seen (or the yard being built) to the first keel. */
    first: 8,

    // ── the launch ──
    /** People who come to watch, at most (desktop, phone), and the share of the town that comes when it is small. */
    crowd: 22,
    crowdPhone: 15,
    crowdShare: 0.75,
    /** Shipwrights at work on one ship. */
    hands: 4,
    handsPhone: 3,
    /** Yards building at once (desktop, phone): the rest wait their turn. */
    yards: 2,
    yardsPhone: 1,
    /** How fast the hull gathers way down the slip (units per second per second), and the water's drag on it after. */
    slideAccel: 0.16,
    drag: 0.55,
  },
  {
    slipMin: [4, 12, 1],
    galleonAt: [6, 14, 1],
    shedReach: [1, 6, 1],
    wayHead: [0.05, 0.5, 0.01],
    wayFoot: [0, 0.2, 0.01],
    wayRun: [0.4, 2, 0.05],
    wayDeep: [0, 0.4, 0.01],
    wayWidth: [0.05, 0.25, 0.01],
    wayApart: [0.1, 0.45, 0.01],
    cradle: [0, 0.2, 0.01],
    keel: [5, 120, 1],
    frames: [5, 240, 1],
    planks: [5, 240, 1],
    paint: [5, 240, 1],
    gather: [5, 120, 1],
    pause: [5, 300, 1],
    first: [0, 120, 1],
    crowd: [0, 40, 1],
    crowdPhone: [0, 40, 1],
    crowdShare: [0, 1, 0.05],
    hands: [1, 8, 1],
    handsPhone: [1, 8, 1],
    yards: [1, 6, 1],
    yardsPhone: [1, 6, 1],
    slideAccel: [0.02, 1, 0.01],
    drag: [0.05, 2, 0.05],
  },
);
