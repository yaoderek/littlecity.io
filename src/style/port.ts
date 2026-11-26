// The container port (R-D00 and after): when a dock is a port, the sizes of
// its cranes and containers, and the rhythm of its work. Lengths are world
// units (a cell is 1 wide, CELL_H = 0.8 tall), times game seconds.

import { defineStyle } from '@/core/style';

export const PORT = defineStyle(
  'port',
  {
    // ── the shape (R-D00) ──
    /** A port fills a rectangle at least this long along the shore and this deep out from it. */
    minLength: 6,
    minDepth: 3,

    // ── the containers ──
    /** Length, breadth and height of a container (it lies in a 2 × 1 cell bay, half a storey tall). */
    boxL: 1.72,
    boxW: 0.74,
    boxH: 0.4,
    /** Share of the yard's room filled when a port is new. */
    yardFill: 0.55,

    // ── the cranes ──
    /** Medium crane: the portal's height (the slewing house sits on it), the jib's length, how far it reaches. */
    mediumPortal: 1.55,
    mediumJib: 3.3,
    mediumReachMin: 1.1,
    mediumReachMax: 3.15,
    /** Large crane: the boom's height above the deck, how far out over the water it reaches and back over the yard. */
    largeBoomY: 3.25,
    largeOut: 4.2,
    largeBack: 3.7,
    /** Seconds of one crane cycle (lift off one place, set down in another), medium and large. */
    mediumCycle: 12,
    largeCycle: 16,
    /** Moves the cranes make in a freighter's stay, at least … at most. */
    movesMin: 6,
    movesMax: 10,
    /** Cranes working at once in one port: desktop, phone, the lowest quality level. */
    cranesMoving: 4,
    cranesPhone: 2,
    cranesLow: 1,
    /** Seconds the large crane's boom takes to come down from its idle near-upright, or go back up. */
    boomTime: 7,

    // ── the freighter (L38-F) ──
    /** Freighters in town at once: desktop, phone. */
    freightersMax: 2,
    freightersPhone: 1,
    /** Seconds alongside (the cranes may keep it longer, up to the hold). */
    freighterStay: 95,
    freighterHold: 80,
    /** How often a freighter is chosen at a port's berth, against a galleon's 5. */
    freighterWeight: 12,
    /** Seconds between funnel puffs. */
    smokeEvery: 0.55,

    // ── the dock workers ──
    /** Dock workers per port (desktop, phone). */
    workers: 2,
    workersPhone: 1,
    /** Crates, barrels and sacks carried out of an opened container, at most. */
    unpackGoods: 4,
  },
  {
    minLength: [4, 12, 1],
    minDepth: [2, 6, 1],
    boxL: [1, 1.95, 0.01],
    boxW: [0.4, 0.95, 0.01],
    boxH: [0.2, 0.8, 0.01],
    yardFill: [0, 1, 0.05],
    mediumPortal: [0.8, 2.5, 0.05],
    mediumJib: [2, 4.5, 0.05],
    mediumReachMin: [0.5, 2, 0.05],
    mediumReachMax: [2, 4.4, 0.05],
    largeBoomY: [2, 5, 0.05],
    largeOut: [2.5, 6, 0.1],
    largeBack: [1.5, 5, 0.1],
    mediumCycle: [4, 30, 0.5],
    largeCycle: [4, 30, 0.5],
    movesMin: [0, 20, 1],
    movesMax: [0, 30, 1],
    cranesMoving: [0, 4, 1],
    cranesPhone: [0, 4, 1],
    cranesLow: [0, 4, 1],
    boomTime: [1, 20, 0.5],
    freightersMax: [0, 4, 1],
    freightersPhone: [0, 4, 1],
    freighterStay: [20, 300, 5],
    freighterHold: [0, 300, 5],
    freighterWeight: [0, 30, 1],
    smokeEvery: [0.2, 3, 0.05],
    workers: [0, 4, 1],
    workersPhone: [0, 4, 1],
    unpackGoods: [0, 8, 1],
  },
);
