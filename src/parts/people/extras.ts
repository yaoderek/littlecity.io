// Small things people have about them (People, Stage 3): the chat bubble
// (L26) and the kite (L28); and (animation polish) the tools of the trades in
// their hands. Meshes only; the people system places them.

import { rotationY, translation } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { PALETTE } from '@/style/palette';
import { PERSON } from '@/style/people';
import { tube } from '@/parts/ground/kit';
import { balloon, dot } from './balloon';
import { bookMesh, drawSpade } from './beach';
import { drawRaidTool, RAID_TOOLS, type RaidTool } from './raid-gear';

/**
 * A chat bubble: a white rounded balloon and its tail cut from one outline (balloon.ts: one clean line
 * round both), with three dots on its face and its back. Flat, in its XY plane facing +Z: the people
 * system turns it to the camera. Origin at the tip of the tail, just over the speaker's head.
 */
export function bubbleMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'chat-bubble' });
  const rx = 0.1, ry = 0.064, cy = 0.105, t = 0.006;
  b.setInk('bubble').setColor(PALETTE.white).setPattern(PATTERN.none);
  balloon(b, { rx, ry, cy, t, left: -Math.PI / 2 - 0.42, right: -Math.PI / 2 - 0.02, tipX: -0.035, bow: 0.012, segments: 36 });
  // The dots, a hair proud of each face (0.004: never in one plane with it, docs/swarm/steady-ink.md).
  b.setInk('dots').setColor(PALETTE.ink);
  for (const side of [0, Math.PI]) {
    b.at(rotationY(side), () => {
      for (const x of [-0.042, 0, 0.042]) dot(b, x, cy, 0.0125, t + 0.004, 10);
    });
  }
  return b.build();
}

/**
 * A kite: a diamond with a cross spar and a tail of three bows. Origin at
 * the bridle (the middle of the diamond); it flies in its XY plane, facing
 * +Z. `colour` indexes the people palette's tops.
 */
export function kiteMesh(colour: number): MeshData {
  const b = new MeshBuilder({ ink: `kite${colour}` });
  const w = 0.13, up = 0.14, down = 0.2, t = 0.006;
  const c = PERSON.tops[((colour % PERSON.tops.length) + PERSON.tops.length) % PERSON.tops.length]!;
  b.setInk('sail').setColor(c).setPattern(PATTERN.cloth).setSway(0.3);
  for (const z of [t, -t]) {
    const pts: [number, number, number][] = [[0, up, z], [-w, 0, z], [0, -down, z], [w, 0, z]];
    if (z < 0) pts.reverse();
    b.quad(pts[0]!, pts[1]!, pts[2]!, pts[3]!);
  }
  b.setColor(PALETTE.wood).setPattern(PATTERN.none).setSway(0);
  b.box([-0.008, -down, -t - 0.004], [0.008, up, t + 0.004]);
  b.box([-w, -0.008, -t - 0.004], [w, 0.008, t + 0.004]);
  // The tail.
  b.setInk('tail').setColor(PALETTE.yellow).setPattern(PATTERN.cloth);
  for (let i = 0; i < 3; i++) {
    const y = -down - 0.06 - i * 0.075, x = (i % 2 === 0 ? 1 : -1) * 0.018;
    b.setSway(0.5 + i * 0.2);
    b.box([x - 0.028, y - 0.014, -0.004], [x + 0.028, y + 0.014, 0.004]);
  }
  return b.build();
}

/** The kite's line: a hair of a box from the origin one unit along +X, to be stretched from hand to kite. */
export function lineMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'kite-line' });
  b.setInk('line').setColor(PALETTE.ink).setPattern(PATTERN.none);
  b.box([0, -0.004, -0.004], [1, 0.004, 0.004]);
  return b.build();
}

/**
 * What a worker holds (animation polish: nobody works empty-handed).
 *   broom   the shopkeeper sweeping       body frame: from the hands down to a brush on the ground ahead
 *   rod     anyone fishing                figure frame: from the hands out and up (its line and float: castLine)
 *   can     a gardener tending            body frame: a watering can in the hands, by the bed
 *   sack    the miller walking            body frame: a flour sack hugged to the chest
 *   tray    the baker                     body frame: a tray of loaves on the forearms
 *   pole    the lamplighter walking       right arm frame: held at its foot, standing up past the head
 *   reach   the lamplighter at a lamp     right arm frame: the arm raised, the pole on up to the lamp
 * All in the figure's own units (the piece's matrix scales them with the person).
 */
export type Tool = 'broom' | 'rod' | 'can' | 'sack' | 'tray' | 'pole' | 'reach' | 'pike' | 'torch' | 'lance' | 'hammer' | 'balls-a' | 'balls-b' | 'scythe' | 'umbrella-a' | 'umbrella-b' | 'umbrella-c' | 'racket' | 'mallet' | 'book' | 'spade' | RaidTool;
export const TOOLS: readonly Tool[] = ['broom', 'rod', 'can', 'sack', 'tray', 'pole', 'reach', 'pike', 'torch', 'lance', 'hammer', 'balls-a', 'balls-b', 'scythe', 'umbrella-a', 'umbrella-b', 'umbrella-c', 'racket', 'mallet', 'book', 'spade', ...RAID_TOOLS];
/** Which piece of the figure (PIECES order) a tool is held by; 5: a long tool laid in the hands along its own line (hands.ts). */
export const TOOL_PIECE: Readonly<Record<Tool, number>> = { broom: 5, rod: 5, can: 4, sack: 0, tray: 0, pole: 4, reach: 4, pike: 0, torch: 0, lance: 0, hammer: 4, 'balls-a': 0, 'balls-b': 0, scythe: 5, 'umbrella-a': 0, 'umbrella-b': 0, 'umbrella-c': 0, racket: 4, mallet: 4, book: 0, spade: 4, brand: 0, axe: 0, club: 0, horn: 0, standard: 0, pan: 0 };
/**
 * The fishing rod, figure frame: points along hands.ts's longToolLine('rod') (the butt at the chest, out and up),
 * the last of them dipping a little below that line, as a rod bends at its tip with a line on it.
 */
const ROD_FROM = [0, 0.24, 0.02] as const, ROD_ALONG = [0, 0.25, 0.44] as const;
const ROD_POINTS: [number, number, number][] = [-0.05, 0.45, 0.9, 1.3, 1.65].map((t) => {
  const bend = t > 0.9 ? 0.03 * ((t - 0.9) / 0.75) ** 2 : 0;
  return [ROD_FROM[0] + ROD_ALONG[0] * t, ROD_FROM[1] + ROD_ALONG[1] * t - bend, ROD_FROM[2] + ROD_ALONG[2] * t];
});
/** Where the line leaves the rod, in the figure's frame (the rod's piece matrix takes it to the world). */
export const ROD_TIP: readonly [number, number, number] = ROD_POINTS[ROD_POINTS.length - 1]!;

/**
 * A fishing line: a hair of a box from the origin one unit up +Y, to be stretched from the float on the water up
 * to the rod's tip. As thick as the kite's line, so the pen line round it is the line, unbroken at any zoom.
 */
export function castLineMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'fishing-line' });
  b.setInk('line').setColor(PALETTE.ink).setPattern(PATTERN.none);
  b.box([-0.004, 0, -0.004], [0.004, 1, 0.004]);
  return b.build();
}

/**
 * The float on a fishing line, world units, its origin at the waterline: a white belly under the water, a red cap
 * above it and a little stalk the line ties to. Half of it is below the surface (the sea hides that part).
 */
export const FLOAT_TOP = 0.046;
export function floatMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'fishing-float' });
  // One ink group: too small to outline piece by piece; the red and the white read by colour.
  b.setInk('float').setPattern(PATTERN.none).setColor(PALETTE.white);
  b.lathe([[0, -0.02], [0.016, -0.016], [0.024, -0.004], [0.024, 0.01]], { segments: 8 });
  b.setColor(PALETTE.red);
  b.lathe([[0.024, 0.01], [0.021, 0.022], [0.011, 0.031], [0, 0.033]], { segments: 8 });
  b.setColor(PALETTE.ink);
  b.box([-0.004, 0.03, -0.004], [0.004, FLOAT_TOP, 0.004]);
  return b.build();
}

/**
 * Where a cast line goes, from the rod's world matrix (`rod`, column-major: the figure's T · Ry · S, as the people
 * system places the rod): the float sits on the water at `seaY` (`dip` lower while a fish tugs) straight under the
 * rod's tip, and the line runs from the top of its stalk up to the tip. Writes the line's matrix (castLineMesh:
 * one unit up +Y, stretched to the gap) and the float's into `line` and `float`, and returns where the float is;
 * null when the tip is not above the water (nothing to hang).
 */
export function castLine(rod: ArrayLike<number>, seaY: number, dip: number, line: number[], float: number[]): { x: number; z: number; tipY: number } | null {
  const [tx, ty, tz] = ROD_TIP;
  const x = rod[0]! * tx + rod[4]! * ty + rod[8]! * tz + rod[12]!;
  const y = rod[1]! * tx + rod[5]! * ty + rod[9]! * tz + rod[13]!;
  const z = rod[2]! * tx + rod[6]! * ty + rod[10]! * tz + rod[14]!;
  const top = seaY - dip + FLOAT_TOP;
  if (y <= top + 0.02) return null;
  line.length = 16;
  line.fill(0);
  line[0] = 1;
  line[5] = y - top;
  line[10] = 1;
  line[12] = x;
  line[13] = top;
  line[14] = z;
  line[15] = 1;
  float.length = 16;
  float.fill(0);
  float[0] = float[5] = float[10] = float[15] = 1;
  float[12] = x;
  float[13] = seaY - dip;
  float[14] = z;
  return { x, z, tipY: y };
}

/** Seasons: the umbrellas residents put up in the rain, in three colours. */
export const UMBRELLAS: readonly Tool[] = ['umbrella-a', 'umbrella-b', 'umbrella-c'];

export function toolMesh(tool: Tool, colour: string = PALETTE.red): MeshData {
  // L63: a book to read in a deckchair (body frame, held in both hands: hands.ts CHEST_TOOLS).
  if (tool === 'book') return bookMesh(0);
  const b = new MeshBuilder({ ink: `tool-${tool}` });
  b.setInk('tool').setPattern(PATTERN.none);
  switch (tool) {
    case 'umbrella-a':
    case 'umbrella-b':
    case 'umbrella-c': {
      // Seasons: held up in the right hand, the canopy over the head, a little forward into the rain.
      const cloth = tool === 'umbrella-a' ? PALETTE.red : tool === 'umbrella-b' ? PALETTE.glass : PALETTE.ink;
      b.setColor(PALETTE.metal);
      tube(b, [[0.07, 0.2, 0.05], [0.02, 0.6, 0.03]], 0.005, { seg: 4 });
      b.setInk('canopy').setColor(cloth).setPattern(PATTERN.cloth);
      b.at(translation(0.02, 0.56, 0.03), () => b.lathe([[0.2, 0], [0.15, 0.05], [0, 0.085]], { segments: 8, smooth: false, capBottom: true }));
      break;
    }
    case 'broom':
      // Along +Y from the bristles at the origin (hands.ts lays it from the floor up into the hands).
      b.setColor(PALETTE.wood);
      tube(b, [[0, 0.03, 0], [0, 0.36, 0]], 0.006, { seg: 4 });
      b.setInk('brush').setColor('#d9b25f').setPattern(PATTERN.planks);
      b.box([-0.045, 0, -0.016], [0.045, 0.04, 0.016]);
      b.setInk('binding').setColor(PALETTE.redDark).setPattern(PATTERN.none);
      b.box([-0.03, 0.03, -0.012], [0.03, 0.042, 0.012]);
      break;
    case 'rod':
      // In the figure's frame, along hands.ts's line for it: the butt at the chest, long enough to reach well out
      // over the water, bending a little at the tip. The line is its own thing (castLineMesh), hung from ROD_TIP
      // down to the water by the people system, whatever the height of the deck above the sea.
      b.setColor(PALETTE.trunk);
      tube(b, ROD_POINTS, [0.009, 0.008, 0.007, 0.0055, 0.0045], { seg: 5 });
      break;
    case 'can':
      // Hanging from the right hand by its handle (arm frame: the hand is 0.093 down the arm).
      b.setColor('#6f9fae').setPattern(PATTERN.metal);
      tube(b, [[0, -0.09, 0], [0, -0.12, 0]], 0.004, { seg: 3 });
      b.at(translation(0.0, -0.15, 0.01), () => {
        b.lathe([[0, -0.03], [0.032, -0.03], [0.032, 0.03], [0, 0.03]], { segments: 8 });
        tube(b, [[0, 0, 0.02], [0, -0.02, 0.08]], 0.006, { seg: 4 }); // the spout, tipped to pour
      });
      break;
    case 'sack':
      b.setColor('#efe7d2').setPattern(PATTERN.cloth);
      b.at(translation(0, 0.19, 0.1), () => b.lathe([[0, -0.05], [0.042, -0.044], [0.046, 0.0], [0.034, 0.04], [0.012, 0.055], [0, 0.058]], { segments: 7 }));
      break;
    case 'tray':
      b.setColor(PALETTE.wood);
      b.box([-0.07, 0.15, 0.06], [0.07, 0.158, 0.16]);
      b.setInk('loaves').setColor('#d79a55');
      for (const x of [-0.04, 0, 0.04]) b.at(translation(x, 0.158, 0.11), () => b.lathe([[0, 0], [0.018, 0.002], [0.014, 0.016], [0, 0.02]], { segments: 6 }));
      break;
    case 'pole':
      // Up through the fist (arm frame: the hand is 0.093 down the arm).
      b.setColor(PALETTE.trunk);
      tube(b, [[0, -0.12, 0], [0, 0.42, 0]], 0.005, { seg: 4 });
      b.setInk('wick').setColor(PALETTE.metal);
      b.box([-0.008, 0.42, -0.008], [0.008, 0.45, 0.008]);
      break;
    case 'pike':
      // L36: held upright at the right hand, butt on the ground, the head well over the helmet.
      b.setColor(PALETTE.trunk);
      tube(b, [[0.085, 0.0, 0.05], [0.085, 0.66, 0.05]], 0.006, { seg: 4 });
      b.setInk('pike-head').setColor('#b9bac4').setPattern(PATTERN.metal);
      b.at(translation(0.085, 0.66, 0.05), () => b.lathe([[0, 0], [0.016, 0.018], [0, 0.07]], { segments: 4 }));
      break;
    case 'torch':
      // L36: a sentry's torch, raised a little in the right hand.
      b.setColor(PALETTE.trunk);
      tube(b, [[0.085, 0.12, 0.07], [0.085, 0.32, 0.09]], [0.007, 0.01], { seg: 4 });
      b.setInk('flame').setColor(PALETTE.yellow).setPattern(PATTERN.glow);
      b.at(translation(0.085, 0.33, 0.09), () => b.lathe([[0, 0], [0.022, 0.02], [0.012, 0.05], [0, 0.07]], { segments: 6 }));
      break;
    case 'lance':
      // L37: the rider's lance, upright, with a pennant in the garrison's colour.
      b.setColor(PALETTE.wood);
      tube(b, [[0.09, 0.06, 0.06], [0.09, 0.8, 0.07]], 0.006, { seg: 4 });
      b.setInk('pennant').setColor(colour).setPattern(PATTERN.cloth).setSway(0.6);
      b.quad([0.09, 0.78, 0.072], [0.09, 0.7, 0.072], [0.09, 0.73, -0.12], [0.09, 0.76, -0.12]);
      b.quad([0.09, 0.7, 0.068], [0.09, 0.78, 0.068], [0.09, 0.76, -0.12], [0.09, 0.73, -0.12]);
      break;
    case 'balls-a':
    case 'balls-b': {
      // L56: three juggling balls over the hands, in two drawings shown in turn.
      // Just over the hands (hands.ts JUGGLE puts them): one ball leaving the throwing hand, one high over the
      // middle, one coming down into the catching hand.
      const up = tool === 'balls-a' ? [[-0.045, 0.34], [0.0, 0.47], [0.045, 0.37]] : [[-0.045, 0.37], [0.0, 0.47], [0.045, 0.34]];
      ['#e0543e', '#f2c230', '#4f8fd6'].forEach((colour, i) => {
        b.setInk(`ball${i}`).setColor(colour).setPattern(PATTERN.none);
        b.at(translation(up[i]![0]!, up[i]![1]!, 0.09), () => b.lathe([[0, -0.022], [0.016, -0.016], [0.022, 0], [0.016, 0.016], [0, 0.022]], { segments: 6 }));
      });
      break;
    }
    case 'scythe':
      // L59: along +Y from the blade's heel at the origin up the snath into the hands (hands.ts lays it); the
      // blade swept out along +X close to the ground.
      b.setColor(PALETTE.trunk);
      tube(b, [[0, 0, 0], [0, 0.36, 0]], 0.006, { seg: 4 });
      b.setInk('blade').setColor('#c9ccd6').setPattern(PATTERN.metal);
      b.polygon([[0, 0.0, -0.01], [0.17, -0.02, 0.02], [0.17, -0.005, 0.02], [0, 0.03, -0.01]]);
      b.polygon([[0, 0.03, -0.01], [0.17, -0.005, 0.02], [0.17, -0.02, 0.02], [0, 0.0, -0.01]]);
      break;
    case 'hammer':
      // L54: a builder's hammer in the right fist (arm frame: the hand is at the end of the arm, down −Y).
      b.setColor(PALETTE.trunk);
      tube(b, [[0, -0.11, 0.0], [0, -0.11, 0.09]], 0.007, { seg: 4 });
      b.setInk('head').setColor('#8d8e99').setPattern(PATTERN.metal);
      b.box([-0.012, -0.135, 0.08], [0.012, -0.085, 0.105]);
      break;
    case 'reach':
      b.setColor(PALETTE.trunk);
      tube(b, [[0, -0.09, 0.012], [0, -0.5, 0.012]], 0.005, { seg: 4 });
      b.setInk('wick').setColor(PALETTE.yellow);
      b.box([-0.009, -0.53, 0.003], [0.009, -0.5, 0.021]);
      break;
    case 'racket': {
      // The playing field: a tennis racket in the right fist, on along the line of the arm.
      b.setColor('#f4f1ea');
      tube(b, [[0, -0.1, 0.0], [0, -0.2, 0.0]], 0.008, { seg: 4 });
      b.setInk('head').setColor(PALETTE.red).setPattern(PATTERN.none);
      const n = 10, rx = 0.045, ry = 0.06, cy = -0.26;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        tube(b, [[Math.cos(a0) * rx, cy + Math.sin(a0) * ry, 0], [Math.cos(a1) * rx, cy + Math.sin(a1) * ry, 0]], 0.006, { seg: 3 });
      }
      b.setInk('strings').setColor('#efe6c4');
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const p0: [number, number, number] = [Math.cos(a0) * rx, cy + Math.sin(a0) * ry, 0], p1: [number, number, number] = [Math.cos(a1) * rx, cy + Math.sin(a1) * ry, 0];
        b.tri([0, cy, 0], p0, p1);
        b.tri([0, cy, 0], p1, p0);
      }
      break;
    }
    case 'brand':
    case 'axe':
    case 'club':
    case 'horn':
    case 'standard':
    case 'pan':
      // The raid: held up over the head (raid-gear.ts).
      drawRaidTool(b, tool);
      break;
    case 'spade':
      // L63: a child's spade in the right fist, digging a sandcastle.
      drawSpade(b);
      break;
    case 'mallet':
      // The playing field: a croquet mallet, its long shaft down from the fist, the head across the foot.
      b.setColor(PALETTE.wood);
      tube(b, [[0, -0.1, 0.0], [0, -0.36, 0.03]], 0.006, { seg: 4 });
      b.setInk('head').setColor(PALETTE.trunk);
      b.box([-0.016, -0.4, -0.04], [0.016, -0.36, 0.1]);
      break;
  }
  return b.build();
}

/**
 * L07: somebody at a lit window, as the street sees them: a dark head and shoulders against the pane.
 * Flat, facing +Z, one unit wide (x is scaled to the width wanted: 0.1 for a whole figure, less as it
 * slides in at the pane's edge); y is in world units, standing on y = 0.
 */
export function silhouetteMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'silhouette' });
  b.setInk('figure').setColor('#2e211d').setPattern(PATTERN.none);
  const head: [number, number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    head.push([Math.cos(a) * 0.34, 0.215 + Math.sin(a) * 0.05, 0]);
  }
  b.polygon(head);
  // Shoulders: a rounded trapezium.
  b.polygon([[-0.5, 0, 0], [0.5, 0, 0], [0.48, 0.11, 0], [0.3, 0.16, 0], [-0.3, 0.16, 0], [-0.48, 0.11, 0]]);
  return b.build();
}

/** L07: a curtain being drawn across a lit pane: one unit wide (x scaled), 0.24 tall, standing on y = 0, facing +Z. */
export function curtainMesh(): MeshData {
  const b = new MeshBuilder({ ink: 'curtain' });
  b.setInk('curtain').setColor('#8a5a46').setPattern(PATTERN.cloth);
  b.polygon([[0, 0, 0], [1, 0, 0], [1, 0.24, 0], [0, 0.24, 0]]);
  return b.build();
}
