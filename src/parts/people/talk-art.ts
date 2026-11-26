// Market talk's drawings (meshes only; src/life/town/talk.system.ts places them): a speech balloon
// with one picture in it (what is asked for, the seller's answer), and the coin that goes from hand
// to hand. Pictures, not words, so there is nothing to translate and they read in any language.
//
// Each picture is a few flat shapes, each its own ink group, so the pen outlines every one of them;
// big and plain, to read from the whole-island view (the balloon is drawn bigger as the camera draws
// back). The balloon is the one comic outline of balloon.ts, its tail's tip at the origin and its body
// off to one side ('L': the body left of the tip, for whoever stands left on screen; 'R' the other).

import { rotationY, translation, type Vec3 } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { PALETTE } from '@/style/palette';
import { balloon, dot, stroke } from './balloon';

export type Picture = 'fish' | 'loaf' | 'apple' | 'flower' | 'cheese' | 'jug' | 'cloth' | 'shoe' | 'coin' | 'coins' | 'haggle' | 'handshake' | 'heart' | 'empty';
export const PICTURES: readonly Picture[] = ['fish', 'loaf', 'apple', 'flower', 'cheese', 'jug', 'cloth', 'shoe', 'coin', 'coins', 'haggle', 'handshake', 'heart', 'empty'];
/** The pictures of things to buy (a buyer asks with one of these). */
export const WARES: readonly Picture[] = ['fish', 'loaf', 'apple', 'flower', 'cheese', 'jug', 'cloth', 'shoe'];

/** The balloon's size (world units at the nearest zoom): half width, half height, the middle's height over the tail's tip, how far the body sits to the side. */
export const TALK_BALLOON = { rx: 0.17, ry: 0.15, cy: 0.24, side: 0.07, t: 0.008 } as const;

type P2 = readonly [number, number];

const ell = (cx: number, cy: number, rx: number, ry: number, n = 20, a0 = 0): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};
/** An ellipse turned by `rot` radians about its middle. */
const ellRot = (cx: number, cy: number, rx: number, ry: number, rot: number, n = 14): P2[] =>
  ell(0, 0, rx, ry, n).map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as const);
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 10): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
};

/** The layers a picture is drawn in, each a hair proud of the one under it (never two in one plane). */
const L0 = 0, L1 = 0.003, L2 = 0.006;

function shape(b: MeshBuilder, ink: string, colour: string, pts: readonly P2[], z: number): void {
  b.setInk(ink).setColor(colour);
  b.polygon(pts.map(([x, y]): Vec3 => [x, y, z]));
}
function line(b: MeshBuilder, ink: string, colour: string, pts: readonly P2[], w: number, z: number): void {
  b.setInk(ink).setColor(colour);
  stroke(b, pts, w, z);
}
function spot(b: MeshBuilder, ink: string, colour: string, x: number, y: number, r: number, z: number): void {
  b.setInk(ink).setColor(colour);
  dot(b, x, y, r, z, 10);
}

const GOLD = '#f2c23a', GOLD_DARK = '#c48a1a', SKIN = '#ecbd96', RED = '#e0453a';

function coin(b: MeshBuilder, x: number, y: number, r: number, z: number, ink: string): void {
  shape(b, ink, GOLD, ell(x, y, r, r, 20), z);
  line(b, `${ink}-ring`, GOLD_DARK, [...ell(x, y, r * 0.62, r * 0.62, 16), [x + r * 0.62, y]], r * 0.14, z + L1);
}

/** One picture, in the XY plane round (0, 0), about 0.2 across, facing +Z at depth z. */
function drawPicture(b: MeshBuilder, pic: Picture, z: number): void {
  switch (pic) {
    case 'fish':
      shape(b, 'fish', '#8fc3e8', ell(-0.015, 0, 0.085, 0.045, 22), z + L0);
      shape(b, 'tail', '#6a9cc4', [[0.06, 0], [0.115, 0.05], [0.105, 0], [0.115, -0.05]], z + L1);
      spot(b, 'eye', PALETTE.ink, -0.065, 0.012, 0.009, z + L1);
      line(b, 'gill', '#5f8fb8', arc(-0.06, 0, 0.03, -0.9, 0.9, 6), 0.007, z + L1);
      break;
    case 'loaf':
      shape(b, 'loaf', '#e8892a', ell(0, -0.005, 0.1, 0.052, 24), z + L0);
      for (const x of [-0.045, 0, 0.045]) line(b, `score${x}`, '#f8cf8a', [[x - 0.014, -0.022], [x + 0.014, 0.022]], 0.01, z + L1);
      break;
    case 'apple':
      shape(b, 'apple', RED, ell(0, -0.012, 0.074, 0.068, 24), z + L0);
      line(b, 'stalk', PALETTE.trunk, [[0, 0.045], [0.004, 0.07], [0.014, 0.09]], 0.012, z + L1);
      shape(b, 'leaf', PALETTE.leafDark, ellRot(0.042, 0.078, 0.032, 0.014, 0.5), z + L1);
      spot(b, 'shine', '#f7a59a', -0.03, 0.012, 0.012, z + L1);
      break;
    case 'flower':
      line(b, 'stem', '#5d8f3a', [[0, -0.095], [0, -0.01]], 0.012, z + L0);
      shape(b, 'leaf', PALETTE.leafDark, ellRot(0.025, -0.06, 0.028, 0.012, 0.6), z + L0);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i / 5) * Math.PI * 2;
        spot(b, `petal${i}`, PALETTE.pink, Math.cos(a) * 0.04, 0.03 + Math.sin(a) * 0.04, 0.03, z + L1);
      }
      spot(b, 'heart', PALETTE.yellow, 0, 0.03, 0.022, z + L2);
      break;
    case 'cheese':
      shape(b, 'cheese', '#f6cf4a', [[-0.1, -0.055], [0.1, -0.055], [0.1, 0.0], [-0.06, 0.065]], z + L0);
      shape(b, 'rind', '#d99a2a', [[-0.1, -0.055], [0.1, -0.055], [0.1, -0.035], [-0.1, -0.035]], z + L1);
      for (const [x, y, r] of [[-0.02, -0.005, 0.014], [0.045, 0.0, 0.011], [0.01, 0.03, 0.009]] as const) spot(b, `hole${x}`, '#d9a520', x, y, r, z + L1);
      break;
    case 'jug':
      b.setInk('jug').setColor('#c9744a');
      b.polygon(ell(0, -0.03, 0.062, 0.058, 22).map(([x, y]): Vec3 => [x, y, z + L0]));
      b.polygon(([[-0.026, 0.01], [0.026, 0.01], [0.026, 0.07], [-0.026, 0.07]] as const).map(([x, y]): Vec3 => [x, y, z + L0]));
      shape(b, 'lip', '#a95a36', [[-0.042, 0.062], [0.036, 0.062], [0.036, 0.082], [-0.052, 0.088]], z + L1);
      line(b, 'handle', '#a95a36', [[0.024, 0.055], [0.07, 0.05], [0.08, 0.0], [0.055, -0.035]], 0.014, z + L1);
      line(b, 'band', '#f2e2c4', [[-0.058, -0.02], [0.058, -0.02]], 0.01, z + L1);
      break;
    case 'cloth':
      shape(b, 'bolt', '#5f86c4', [[-0.095, -0.06], [0.07, -0.06], [0.07, 0.05], [-0.095, 0.05]], z + L0);
      shape(b, 'roll', '#4a6fa8', ell(0.07, -0.005, 0.03, 0.055, 16), z + L1);
      for (const y of [-0.03, 0.0, 0.03]) line(b, `stripe${y}`, PALETTE.white, [[-0.09, y], [0.045, y]], 0.008, z + L1);
      break;
    case 'shoe':
      shape(b, 'shoe', '#7a4a30', [[-0.08, -0.045], [0.07, -0.045], [0.095, -0.025], [0.08, -0.005], [0.0, 0.01], [-0.02, 0.075], [-0.08, 0.075]], z + L0);
      shape(b, 'sole', '#3e2a1e', [[-0.085, -0.065], [0.1, -0.065], [0.1, -0.045], [-0.085, -0.045]], z + L1);
      line(b, 'lace', PALETTE.white, [[-0.04, 0.05], [-0.015, 0.05]], 0.008, z + L1);
      line(b, 'lace2', PALETTE.white, [[-0.04, 0.025], [-0.008, 0.025]], 0.008, z + L1);
      break;
    case 'coin':
      coin(b, 0, 0, 0.07, z + L0, 'coin');
      break;
    case 'coins':
      coin(b, -0.04, -0.025, 0.058, z + L0, 'coin-a');
      coin(b, 0.04, 0.025, 0.058, z + L2, 'coin-b');
      break;
    case 'haggle':
      // One coin, and a frowning face beside it: "only one".
      coin(b, -0.05, -0.01, 0.05, z + L0, 'coin');
      shape(b, 'face', SKIN, ell(0.055, 0.005, 0.048, 0.048, 20), z + L0);
      spot(b, 'eye-l', PALETTE.ink, 0.04, 0.018, 0.007, z + L1);
      spot(b, 'eye-r', PALETTE.ink, 0.07, 0.018, 0.007, z + L1);
      line(b, 'frown', PALETTE.ink, arc(0.055, -0.035, 0.022, 0.5, Math.PI - 0.5, 8), 0.008, z + L1);
      line(b, 'brow', PALETTE.ink, [[0.03, 0.036], [0.048, 0.03]], 0.007, z + L1);
      line(b, 'brow2', PALETTE.ink, [[0.08, 0.036], [0.062, 0.03]], 0.007, z + L1);
      break;
    case 'handshake':
      shape(b, 'cuff-l', '#4f6fa8', [[-0.115, -0.035], [-0.05, -0.035], [-0.05, 0.03], [-0.115, 0.03]], z + L0);
      shape(b, 'cuff-r', '#c8524a', [[0.05, -0.03], [0.115, -0.03], [0.115, 0.035], [0.05, 0.035]], z + L0);
      shape(b, 'hand-l', SKIN, ellRot(-0.018, -0.002, 0.05, 0.034, -0.15), z + L1);
      shape(b, 'hand-r', '#e2a97f', ellRot(0.018, 0.006, 0.05, 0.034, 0.15), z + L2);
      for (const x of [-0.005, 0.015, 0.035]) line(b, `finger${x}`, PALETTE.ink, [[x, -0.012], [x - 0.006, 0.022]], 0.005, z + L2 + L1);
      break;
    case 'heart': {
      const pts: P2[] = [];
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * Math.PI * 2;
        pts.push([0.0052 * 16 * Math.sin(t) ** 3, 0.0052 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + 0.008]);
      }
      shape(b, 'heart', RED, pts, z + L0);
      spot(b, 'shine', '#f7a59a', -0.035, 0.035, 0.012, z + L1);
      break;
    }
    case 'empty':
      // An empty basket, tipped toward the eye so its bare inside shows.
      shape(b, 'basket', '#b07a3e', [[-0.09, 0.025], [0.09, 0.025], [0.065, -0.07], [-0.065, -0.07]], z + L0);
      shape(b, 'inside', '#6e4a26', ell(0, 0.025, 0.09, 0.024, 18), z + L1);
      for (const y of [-0.01, -0.04]) line(b, `weave${y}`, '#8a5a2c', [[-0.078 + (0.025 - y) * 0.12, y], [0.078 - (0.025 - y) * 0.12, y]], 0.007, z + L1);
      break;
  }
}

const cache = new Map<string, MeshData>();

/** A balloon with one picture in it, its tail's tip at the origin; 'L' sits up and to the left of the tip, 'R' to the right. */
export function talkBubbleMesh(pic: Picture, side: 'L' | 'R'): MeshData {
  const k = `${pic}:${side}`;
  let m = cache.get(k);
  if (m) return m;
  const { rx, ry, cy, side: off, t } = TALK_BALLOON;
  const s = side === 'L' ? 1 : -1;
  const b = new MeshBuilder({ ink: `talk-${pic}-${side}` });
  b.setPattern(PATTERN.none);
  // The body sits `off` to the side of the tip: the tail leans back to the head it comes from.
  b.at(translation(-s * off, 0, 0), () => {
    b.setInk('balloon').setColor(PALETTE.white);
    balloon(b, { rx, ry, cy, t, left: -Math.PI / 2 - 0.05 + s * 0.28, right: -Math.PI / 2 + 0.2 + s * 0.28, tipX: s * off, bow: s * 0.012, segments: 40 });
    for (const back of [0, Math.PI]) {
      b.at(rotationY(back), () => b.at(translation(0, cy, t + 0.004), () => drawPicture(b, pic, 0)));
    }
  });
  cache.set(k, (m = b.build()));
  return m;
}

/** A coin in flight: a small gold disc, standing up (its face +Z), its middle at the origin. */
export function coinMesh(): MeshData {
  const k = 'coin';
  let m = cache.get(k);
  if (m) return m;
  const b = new MeshBuilder({ ink: 'talk-coin' });
  b.setPattern(PATTERN.metal).setInk('coin').setColor(GOLD);
  b.at([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], () => b.lathe([[0, -0.007], [0.04, -0.007], [0.042, 0], [0.04, 0.007], [0, 0.007]], { segments: 14 }));
  cache.set(k, (m = b.build()));
  return m;
}
