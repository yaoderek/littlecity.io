// Dressing (Stage 3): the numbers behind the decoration (part D) and
// urban-fill (part U) rules and the props they place. Densities are chances
// per candidate; lengths are world units (a cell is 1 wide, 0.8 tall).
// Read by src/rules/{decoration,urban} and src/parts/props.

import { defineStyle } from '@/core/style';

/** Where and how often things appear. */
export const DRESSING = defineStyle(
  'dressing',
  {
    // ── D01 street lamps ──
    /** A street shorter than this has no lamps. */
    lampStreet: 4,
    /** One lamp every this many cells along a street. */
    lampEvery: 4,
    /** No lamp within this many path steps of a junction or dead-end lamp. */
    lampGap: 2,
    // ── D02 square lamps ──
    /** A plaza containing a square this big (and no fountain) gets the four-arm lamp. */
    lampSquare: 5,
    /** Corner lamps of a square stand at least this many cells apart. */
    lampCornerGap: 3,
    // ── D03 benches ──
    /** Share of street ends over water or a drop that get a bench facing the view. */
    benchView: 0.7,
    // ── D04 bunting, D06 lanterns ──
    bunting: 0.5,
    alleyLantern: 0.4,
    // ── D10 creepers, D11 doorsteps ──
    creeper: 0.4,
    doorPots: 0.4,
    doorBarrel: 0.2,
    doorBicycle: 0.2,
    // ── D15 dock goods ──
    dockRope: 0.3,
    dockPots: 0.2,
    dockCrates: 0.25,
    // ── D05 laundry ──
    laundry: 0.6,
    laundryGapMax: 3,
    /** At most this many lines in any three cells along an alley. */
    laundryPerThree: 2,
    // ── D09 flower boxes ──
    boxSunny: 0.5,
    boxShade: 0.2,
    boxTopStorey: 3,
    // ── D13 flags ──
    flagWatchtower: 0.5,
    flagPier: 0.5,
    flagSquare: 4,
    // ── D24 wild ground ──
    /** Chance of a tuft on a bare grass cell far from everything, and beside the town. */
    tuftFar: 0.4,
    tuftNear: 0.04,
    /** Tufts gather in drifts: the share of open country that is meadow, and the size of a drift in cells. */
    tuftDrift: 0.3,
    tuftDriftSize: 3.2,
    /** Column steps from a structure or floor at which grass counts as wild. */
    tuftReach: 5,
    /** Share of tufts that carry wildflowers. */
    tuftFlowers: 0.55,
    boulder: 0.3,
    beachFind: 0.09,
    reeds: 0.5,
    lilyPads: 0.22,
    // ── urban fill: what a leftover patch becomes ──
    /** U01: a leftover of this many cells (inclusive) touching a street or plaza is a pocket park. */
    parkMin: 2,
    parkMax: 16,
    /** U02: grass shut in by placed fences or walls, from this many cells; a park from this many trees. */
    fieldMin: 6,
    parkTrees: 3,
    /** U04: a leftover behind houses up to this many cells is back yards. */
    yardMax: 6,
    /** U05: a street tree on every nth verge cell of a straight street at least this long. */
    treeEvery: 3,
    treeStreet: 6,
    /** U06: chance that an outward-facing rear wall at the town's edge has a woodpile or a vegetable plot. */
    edgeYard: 0.4,
    /** U12: houses within this many column steps of a square are in the centre. */
    centreReach: 4,
    /** U08: chance that a nook beside a stair or under a deck is furnished. */
    nook: 1,
    // ── U07 retaining walls ──
    /** The tallest bank a retaining wall will face, in levels. */
    wallMaxRise: 3,
    wallCreeper: 0.3,
    wallDrain: 0.35,
  },
  {
    lampStreet: [2, 12, 1],
    lampEvery: [2, 8, 1],
    lampGap: [0, 4, 1],
    lampSquare: [3, 9, 1],
    lampCornerGap: [1, 8, 1],
    benchView: [0, 1, 0.05],
    bunting: [0, 1, 0.05],
    alleyLantern: [0, 1, 0.05],
    creeper: [0, 1, 0.05],
    doorPots: [0, 1, 0.05],
    doorBarrel: [0, 1, 0.05],
    doorBicycle: [0, 1, 0.05],
    dockRope: [0, 1, 0.05],
    dockPots: [0, 1, 0.05],
    dockCrates: [0, 1, 0.05],
    laundry: [0, 1, 0.05],
    laundryGapMax: [1, 3, 1],
    laundryPerThree: [1, 3, 1],
    boxSunny: [0, 1, 0.05],
    boxShade: [0, 1, 0.05],
    boxTopStorey: [1, 6, 1],
    flagWatchtower: [0, 1, 0.05],
    flagPier: [0, 1, 0.05],
    flagSquare: [3, 8, 1],
    tuftFar: [0, 1, 0.02],
    tuftNear: [0, 1, 0.02],
    tuftDrift: [0, 1, 0.02],
    tuftDriftSize: [1, 8, 0.2],
    tuftReach: [1, 10, 1],
    tuftFlowers: [0, 1, 0.05],
    boulder: [0, 1, 0.05],
    beachFind: [0, 0.5, 0.01],
    reeds: [0, 1, 0.05],
    lilyPads: [0, 1, 0.05],
    parkMin: [1, 6, 1],
    parkMax: [4, 30, 1],
    fieldMin: [2, 16, 1],
    parkTrees: [1, 8, 1],
    yardMax: [2, 12, 1],
    treeEvery: [2, 6, 1],
    treeStreet: [3, 12, 1],
    edgeYard: [0, 1, 0.05],
    nook: [0, 1, 0.05],
    centreReach: [0, 10, 1],
    wallMaxRise: [1, 5, 1],
    wallCreeper: [0, 1, 0.05],
    wallDrain: [0, 1, 0.05],
  },
);

/** The shapes of the props. */
export const PROP = defineStyle(
  'prop',
  {
    // ── lamps ──
    lampHeight: 0.86,
    lampPost: 0.028,
    lampLantern: 0.13,
    fourArmHeight: 1.18,
    fourArmReach: 0.2,
    bridgeLampHeight: 0.46,
    // ── laundry ──
    /** How far a line sags per unit of span. */
    lineSag: 0.07,
    /** Garments: drop below the line, and how much their free hem moves in the wind (0–1). */
    garmentDrop: 0.2,
    garmentSway: 0.85,
    // ── flags ──
    flagPole: 1.5,
    flagSway: 0.9,
    // ── retaining wall ──
    /** How far the wall's face stands out from the cell line, its coping's rise and overhang. */
    wallProud: 0.105,
    wallCoping: 0.05,
    wallCopingOut: 0.03,
    /** How far the coping reaches back over the bank's edge. */
    wallBack: 0.08,
    // ── front garden ──
    fenceHeight: 0.3,
    /** Half the width of a front garden's gateway. */
    gateHalf: 0.2,
  },
  {
    lampHeight: [0.6, 1.2, 0.01],
    lampPost: [0.015, 0.05, 0.001],
    lampLantern: [0.08, 0.2, 0.005],
    fourArmHeight: [0.9, 1.6, 0.01],
    fourArmReach: [0.1, 0.35, 0.01],
    bridgeLampHeight: [0.3, 0.8, 0.01],
    lineSag: [0, 0.2, 0.005],
    garmentDrop: [0.1, 0.35, 0.01],
    garmentSway: [0, 1, 0.05],
    flagPole: [1, 2.4, 0.02],
    flagSway: [0, 1, 0.05],
    wallProud: [0.04, 0.14, 0.005],
    wallCoping: [0.02, 0.1, 0.005],
    wallCopingOut: [0, 0.08, 0.005],
    wallBack: [0.04, 0.2, 0.005],
    fenceHeight: [0.2, 0.45, 0.01],
    gateHalf: [0.12, 0.3, 0.01],
  },
);
