// People (Stage 3): every tunable number of the walking graph, routing, the
// crowd and how a person is drawn. Owner: People.

import { defineStyle } from '@/core/style';

/** The walking graph and routing (catalogue L24). Costs are per cell crossed. */
export const NAV = defineStyle(
  'nav',
  {
    path: 1,
    plaza: 1,
    garden: 2,
    trail: 1.5,
    deck: 1.5,
    roof: 1.5,
    stairs: 1.5,
    grass: 3,
    sand: 3,
    /** Extra cost of carved steps and of a gate. */
    steps: 0.5,
    gate: 0.25,
    /** Seconds an interior link takes per storey climbed (at least one storey is counted). */
    interiorSeconds: 1,
    /** Routing cost of one interior second. */
    interiorCost: 1,
    /** Added when a route goes through a building that is neither the walker's home nor where they are going. */
    through: 12,
    /** Added for crossing a cell with something solid standing in the middle of it. */
    clutter: 20,
  },
  { garden: [1, 4, 0.5], grass: [1, 6, 0.5], through: [0, 40, 1] },
);

/** The crowd (catalogue L21, L22, L25, L27, L32). */
export const PEOPLE = defineStyle(
  'people',
  {
    /** Resident cap (L21): desktop, and a phone-sized viewport. */
    cap: 60,
    capPhone: 30,
    /** A viewport whose shorter side is under this many CSS pixels counts as a phone. */
    phoneSide: 500,
    /** Cells per house resident: ceil(cells ÷ this). */
    cellsPerResident: 2,
    /** Walking speed in cells per second, and how much it varies from person to person (±). */
    speed: 0.62,
    speedVary: 0.14,
    /** Children are this much faster (they run). */
    childSpeed: 1.6,
    /** Share of residents who are children (L28). */
    children: 0.15,
    /** How far right of the line through the cell centres a walker keeps (so two-way traffic passes). */
    lane: 0.11,
    /** The same where a post stands on the boundary crossed, or something stands in the middle of the cell. */
    laneWide: 0.31,
    /** Gap kept behind the person ahead, and the distance at which a walker starts to slow for them. */
    gap: 0.2,
    slowAt: 0.42,
    /** Seconds a visit lasts (L22): min, max. */
    lingerMin: 5,
    lingerMax: 20,
    /** Seconds at home between outings by day: min, max. */
    homeMin: 4,
    homeMax: 30,
    /** At dusk everyone has set off for home within this many seconds. */
    duskSpread: 10,
    /** Share of residents who may be out at night (L25). */
    nightOut: 0.1,
    /** Routes planned per frame at most (the rest wait a frame). */
    plansPerFrame: 3,
    /** A stranded resident (L32) stays within this many links of the door. */
    strandedReach: 2,
    /** Seconds a displaced person takes to hop to the nearest walkable cell (L27), and the height of the hop. */
    hop: 0.45,
    hopHeight: 0.28,
    /** Seconds to step through a doorway, and to fade in or out at the map edge. */
    doorTime: 0.55,
    fade: 0.8,
    /** L26: a block landing within this many cells makes people stop and look, for this long; chance of a hop. */
    lookReach: 4,
    lookTime: 2.2,
    lookHop: 0.3,
    /** L26: chance two people meeting stop for a chat, and how long it lasts. */
    chat: 0.2,
    chatTime: 4,
    /** Seconds after a chat before either will stop for another. */
    chatRest: 40,
    /** L26: wind strength above which a hand goes to the hat. */
    gust: 0.72,
    /** L08: the most lamps on the lamplighter's round; the rest light by themselves. */
    lampRound: 10,
    /** L08: how long into the evening the first lamp of the round waits for the lamplighter, and each one after it that much longer. */
    lampWait: 7,
    lampStep: 5.5,
    /** L08: how much brisker than their own pace the lamplighter walks the round. */
    lampPace: 1.45,
    /** L51 and up: the share of their pace somebody keeps under a heavy load (a sack, a crate, two pails). */
    laden: 0.8,
    /** How much dearer a cluttered cell (café tables, a bench) is to walk through while somebody sits in it. */
    seatedExtra: 20,
    /** L28: wind strength above which a child at a kite spot flies a kite; how far downwind and how high it flies. */
    kiteWind: 0.24,
    kiteOut: 0.95,
    kiteUp: 1.15,
    /**
     * How far out from the middle of a dock's cell somebody fishing is drawn standing: at the edge (a cell is 1
     * across), in front of a pier head's seat and bucket, so the rod's tip and its line are well out over the water.
     * Their place in the crowd stays where the fishing spot puts it (0.3 out, on the walking graph); the figure takes
     * a short step from there to the edge as it starts to fish, and back as it stops (people.system.ts).
     */
    fishReach: 0.42,
    /** How fast that step is taken, world units a second. */
    fishStep: 0.45,
  },
  {
    cap: [0, 120, 1],
    capPhone: [0, 60, 1],
    speed: [0.2, 1.5, 0.02],
    lane: [0, 0.25, 0.01],
    gap: [0.1, 0.5, 0.01],
  },
);

/** How a person is drawn and moves. World units; a cell is 1 wide and 0.8 tall. */
export const PERSON = defineStyle(
  'person',
  {
    /** Adult height to the top of the head in world units (hair and hats add a little), and a child's share of it. */
    height: 0.46,
    child: 0.7,
    /** Head radius for a figure 0.42 tall (it scales with `height`): big for the body, as in the reference drawings. */
    head: 0.078,
    /** Steps per cell walked (one step = one leg swing). */
    stepsPerCell: 5,
    /** Leg and arm swing at full stride, radians. */
    stride: 0.62,
    armSwing: 0.5,
    /** How far the body rises on the passing pose. */
    bob: 0.014,
    /** Poses are held: the walk is drawn in this many poses per stride pair ("on twos"). */
    walkPoses: 4,
    /** Idle poses change this many times a second. */
    idleRate: 3,
    /** Drawings of the crowd per second: where people are is redrawn this often, not every frame. */
    drawRate: 15,
    skin: ['#f6d2b4', '#eebd97', '#d9a078', '#b97f58', '#8f5f44', '#f9dcc6'],
    hair: ['#4a3a34', '#6b4a34', '#2f2b33', '#b98a52', '#d8b46a', '#9c5a3c', '#e4dfd6', '#c96a4a'],
    tops: ['#e56b58', '#6d8ccf', '#ffd96e', '#7cbf9b', '#f4a3bf', '#fdfaf3', '#c6b2ff', '#eaa65c', '#9a92b8', '#88c26b'],
    bottoms: ['#4b4a55', '#6a5a4c', '#5d6f96', '#8a6f5a', '#3f4f5f', '#7b5d6e'],
    hats: ['#ffd96e', '#e56b58', '#fdfaf3', '#7b96cf', '#c99764'],
  },
  {
    height: [0.3, 0.6, 0.01],
    head: [0.05, 0.1, 0.002],
    stepsPerCell: [2, 9, 0.5],
    stride: [0.2, 1, 0.02],
    bob: [0, 0.04, 0.002],
    walkPoses: [2, 8, 1],
    drawRate: [6, 60, 1],
  },
);

/** L36: the castle's garrison. Lengths in world units, times in seconds. */
export const GARRISON = defineStyle(
  'garrison',
  {
    /** Marching pace, cells a second (a resident strolls at 0.62). */
    speed: 0.5,
    /** Between ranks along the line of march, and from the line to each file. */
    spacing: 0.44,
    file: 0.12,
    /** How far the right-hand file marches behind the left. */
    stagger: 0.16,
    /** Halted at the gate each lap; at the change of the guard (dawn, dusk); at either end of a there-and-back. */
    halt: 4,
    changeHalt: 10,
    endHalt: 2,
  },
  { speed: [0.2, 1.2, 0.02], spacing: [0.25, 0.6, 0.01], file: [0.06, 0.2, 0.01], stagger: [0, 0.3, 0.01], halt: [0, 20, 0.5], changeHalt: [0, 30, 0.5], endHalt: [0, 10, 0.5] },
);

/** L37: the rider. */
export const RIDER = defineStyle(
  'rider',
  {
    /** Trot and walk, cells a second; a walk when anybody is this near ahead. */
    trot: 1.2,
    walk: 0.5,
    crowd: 1.1,
    /** Rides a day; the horse stands tethered by the gate between them. */
    rides: 3,
    /** The horse's strides per cell walked and trotted (its legs step with the ground, not the clock). */
    walkSteps: 2.6,
    trotSteps: 1.5,
  },
  { trot: [0.5, 3, 0.05], walk: [0.2, 1.2, 0.02], crowd: [0.4, 3, 0.05], rides: [0, 8, 1], walkSteps: [1, 6, 0.1], trotSteps: [0.6, 4, 0.1] },
);

/** People are solid: how walkers step round each other (crowd.ts, "stepping aside"). Lengths in world units. */
export const AVOID = defineStyle(
  'avoid',
  {
    /** How far ahead a walker looks for somebody in the way, and how far apart two centres keep side by side. */
    look: 1.2,
    clear: 0.21,
    /** How far aside a walker may step from their line: in open cells, and in a cell with something in it. */
    room: 0.22,
    roomCluttered: 0.08,
    /** The step aside comes back to the line over this much walk before a doorway, a single-file stretch or the walk's end. */
    settle: 0.5,
    /** How fast a walker moves aside (units a second: about a third of a stroll, so it reads as deliberate). */
    rate: 0.3,
    /** Nobody steps closer than this to the side of their cell. */
    margin: 0.1,
    /** Somebody this close ahead whom there is no room to pass is waited for. */
    wait: 0.32,
  },
  { look: [0.3, 3, 0.05], clear: [0.1, 0.4, 0.01], room: [0, 0.4, 0.01], roomCluttered: [0, 0.2, 0.01], settle: [0.1, 1, 0.05], rate: [0.05, 1, 0.01], margin: [0.02, 0.3, 0.01], wait: [0.15, 0.8, 0.01] },
);
