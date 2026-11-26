// The things the living town carries (L51 and up): in the hands, and set
// down. One drawing per kind, so a sack in the miller's arms is the same sack
// that then sits by the bakery door. Meshes only; people.system holds the
// carried one to the figure, the town's stores place the resting ones.
//
// Built a little big and bright for what they are (a sack is a third of a
// person tall): they must read at playing zoom, where a person is about 23
// pixels. Figure units (a person is 0.42 tall; the figure's scale takes
// them to the world).

import { compose, multiply, rotationX, translation, type Mat4Like } from '@/core/mat4';
import { MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import { smoothBall, smoothLathe, soft } from '@/gen/soft';
import { tube } from '@/parts/ground/kit';
import { PALETTE } from '@/style/palette';
import { drawLanternPole, drawTrestle } from './supper';
import { drawRolledBlanket } from './picnic';
import { drawCone, drawIceCart } from './beach';
import { drawCarriedBall, drawCarriedHamper, drawCarriedPail, drawFoldedChair, drawFurledParasol, drawOpenParasolHeld } from './beach';
import { drawLoot, type Loot } from './loot';

/**
 * Something carried (drawn in the hands; src/parts/people/loads.ts) or set down somewhere (a store).
 *   sack     a flour or grain sack           tray     a baker's tray of loaves
 *   loaf     one loaf, bought                bucket   a pail of water
 *   fish     a basket of the catch           fishes   a fish or two, bought
 *   ladder   a builder's ladder (shoulder)   hod      a hod of bricks (shoulder)
 *   crate    a crate of goods                lantern  a lantern on a pole
 *   basket   a basket of vegetables          washing  a basket of washing
 *   sheaf    a sheaf of wheat                petals   a basket of petals
 *   bouquet  a bride's flowers
 * Market talk (src/life/town/talk.ts, chains/apples.ts):
 *   apples   a basket heaped with red apples   apple    one apple, bought (set down: a little heap)
 *   jug      a jug, bought
 * L63, the beach (beach.ts draws them; the number is the family's colour):
 *   parasol-n       a furled parasol with a rolled towel, on the shoulder
 *   parasol-open-n  the same held up open (running home in the rain)
 *   deckchair-n     a folded deckchair on the left shoulder
 *   hamper          a basket for the day, at the side
 *   pail-n          a child's pail and spade, at the side
 *   beachball       a beach ball, in both hands
 * L65, the harvest supper (supper.ts):
 *   trestle         a table top with its cloth, on the shoulder
 *   lantern-pole    a pole hung with paper lanterns
 * L66, a picnic (picnic.ts):
 *   blanket-n       a checked blanket rolled up, on the shoulder
 */
export type Load = 'sack' | 'tray' | 'loaf' | 'bucket' | 'fish' | 'fishes' | 'ladder' | 'hod' | 'crate' | 'lantern' | 'basket' | 'washing' | 'sheaf' | 'petals' | 'bouquet' | 'barrel' | 'cart' | 'cart-1' | 'cart-2' | 'cart-3' | 'scythe' | 'trestle' | 'lantern-pole' | 'icecart' | 'cone' | `blanket-${0 | 1 | 2 | 3}` | BeachLoad | Loot | MarketLoad | ShipyardLoad;

/** Market talk: the orchard's apples on their way to the stalls and home, and a jug from a shop. */
export type MarketLoad = 'apples' | 'apple' | 'jug';
/** The shipyard (src/life/town/chains/shipyard.ts): a plank on the shoulder; one end of the keel timber, carried by two. */
export type ShipyardLoad = 'plank' | 'beam';

/** The six canvas colours (beach.ts CANVAS_COLOURS) and four pail colours. */
type Canvas = 0 | 1 | 2 | 3 | 4 | 5;
export type BeachLoad = `parasol-${Canvas}` | `parasol-open-${Canvas}` | `deckchair-${Canvas}` | 'hamper' | `pail-${0 | 1 | 2 | 3}` | 'beachball';
export const BEACH_LOADS: readonly BeachLoad[] = [
  ...([0, 1, 2, 3, 4, 5] as const).flatMap((i) => [`parasol-${i}`, `parasol-open-${i}`, `deckchair-${i}`] as const),
  'hamper',
  ...([0, 1, 2, 3] as const).map((i) => `pail-${i}` as const),
  'beachball',
];
/** The number at the end of a beach load's name (its colour), or 0. */
const colourOf = (kind: string): number => Number(kind.slice(kind.lastIndexOf('-') + 1)) || 0;

/** A round thing (an apple, a bun, a bloom): smooth both ways (src/gen/soft.ts), so no rings show. */
function ball(b: MeshBuilder, rx: number, ry: number, segments = 7): void {
  smoothBall(b, 0, 0, 0, rx, ry, rx, segments, 5);
}

function basket(b: MeshBuilder, r: number, h: number, colour = '#b07a3e'): void {
  b.setInk('basket').setColor(colour).setPattern(PATTERN.thatch);
  b.lathe([[0, 0], [r * 0.8, 0], [r, h], [r * 0.88, h]], { segments: 9 });
}

/** How much bigger than life the loads are drawn, to read at playing zoom: in the hands, and set down. */
const BIG = 1.65;
const BIG_REST = 1.45;

/** One load, standing on its own bottom (y = 0) at the origin, front +Z. */
function drawLoad(b: MeshBuilder, kind: Load, big = BIG): void {
  b.at([big, 0, 0, 0, 0, big, 0, 0, 0, 0, big, 0, 0, 0, 0, 1], () => drawLoadAt(b, kind));
}

function drawLoadAt(b: MeshBuilder, kind: Load): void {
  b.setPattern(PATTERN.none);
  if (drawBeachLoad(b, kind)) return;
  // The raid's loot (loot.ts).
  if (drawLoot(b, kind)) return;
  switch (kind) {
    case 'sack':
      b.setInk('sack').setColor('#e3b866').setPattern(PATTERN.cloth);
      smoothLathe(b, [[0, 0], [0.06, 0.006], [0.068, 0.06], [0.055, 0.12], [0.022, 0.15], [0.03, 0.17], [0, 0.17]], { segments: 8, crease: 1.1 });
      b.setInk('band').setColor('#2f5fc0').setPattern(PATTERN.none);
      b.lathe([[0.069, 0.065], [0.066, 0.095]], { segments: 8 });
      break;
    case 'tray':
      b.setInk('tray').setColor(PALETTE.wood).setPattern(PATTERN.planks);
      b.box([-0.11, 0, -0.06], [0.11, 0.012, 0.06]);
      b.setInk('loaves').setColor('#e8892a').setPattern(PATTERN.none);
      for (const [x, z] of [[-0.06, -0.025], [0.0, -0.025], [0.06, -0.025], [-0.03, 0.028], [0.03, 0.028]] as const) b.at(translation(x, 0.012, z), () => ball(b, 0.03, 0.026));
      break;
    case 'loaf':
      // One long loaf, its rounded ends part of its round (soft: no ring where an end meets the middle).
      soft(b, { ink: 'loaf' }, (s) => {
        s.b.setColor('#e8892a');
        s.hold(0, 0.03, 0, 0.12, 0.03, 0.03);
        s.at(translation(0, 0.03, 0), () => {
          tube(s.b, [[-0.09, 0, 0], [0.09, 0, 0]], 0.03, { seg: 6 });
          smoothBall(s.b, -0.09, 0, 0, 0.03, 0.03, 0.03, 6, 4);
          smoothBall(s.b, 0.09, 0, 0, 0.03, 0.03, 0.03, 6, 4);
        });
      });
      b.setInk('score').setColor('#f0c27a');
      for (const x of [-0.04, 0.0, 0.04]) b.box([x - 0.006, 0.055, -0.012], [x + 0.006, 0.062, 0.012]);
      break;
    case 'bucket':
      b.setInk('bucket').setColor('#6f8fb0').setPattern(PATTERN.metal);
      b.lathe([[0, 0], [0.038, 0], [0.048, 0.075], [0.044, 0.075]], { segments: 9 });
      b.setInk('water').setColor('#3fa0ea').setPattern(PATTERN.none);
      b.lathe([[0, 0.068], [0.044, 0.068]], { segments: 9 });
      b.setInk('handle').setColor(PALETTE.metal);
      tube(b, [[-0.046, 0.075, 0], [-0.03, 0.12, 0], [0.03, 0.12, 0], [0.046, 0.075, 0]], 0.004, { seg: 3 });
      break;
    case 'fish':
      basket(b, 0.075, 0.07);
      b.setInk('catch').setColor('#bfe0f5');
      for (const [x, z, yaw] of [[-0.03, 0, 0.3], [0.02, 0.02, -0.5], [0.0, -0.025, 1.2]] as const)
        b.at(translation(x, 0.07, z), () => b.at([Math.cos(yaw), 0, -Math.sin(yaw), 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, 0, 0, 0, 1], () => ball(b, 0.018, 0.016)));
      b.setInk('tails').setColor('#7fa3bd');
      b.box([0.035, 0.07, -0.01], [0.06, 0.09, 0.01]);
      break;
    case 'fishes':
      b.setInk('fish').setColor('#bfe0f5');
      b.at(translation(0, 0.05, 0), () => ball(b, 0.018, 0.05));
      b.setInk('tail').setColor('#7fa3bd');
      b.box([-0.022, 0.0, -0.004], [0.022, 0.012, 0.004]);
      b.setInk('string').setColor(PALETTE.ink);
      b.box([-0.002, 0.1, -0.002], [0.002, 0.13, 0.002]);
      break;
    case 'ladder':
      // Lying along Z (it is carried on the shoulder, fore and aft), its middle at the origin.
      b.setInk('ladder').setColor('#d1a466').setPattern(PATTERN.planks);
      b.box([-0.045, 0, -0.3], [-0.03, 0.016, 0.3]);
      b.box([0.03, 0, -0.3], [0.045, 0.016, 0.3]);
      for (let i = 0; i < 6; i++) {
        const z = -0.25 + i * 0.1;
        b.box([-0.03, 0.004, z - 0.006], [0.03, 0.012, z + 0.006]);
      }
      break;
    case 'plank':
      // A fresh-sawn board lying along Z on the shoulder, its middle at the origin.
      b.setInk('plank').setColor('#d9ad78').setPattern(PATTERN.planks);
      b.box([-0.032, 0, -0.34], [0.032, 0.014, 0.34]);
      break;
    case 'beam':
      // The near end of a long square timber (the shipyard draws the rest of it between its two carriers).
      b.setInk('beam').setColor('#b98656').setPattern(PATTERN.planks);
      b.box([-0.03, 0, -0.12], [0.03, 0.055, 0.12]);
      break;
    case 'hod':
      b.setInk('hod').setColor(PALETTE.wood).setPattern(PATTERN.planks);
      b.box([-0.04, 0, -0.07], [0.04, 0.012, 0.07]);
      b.box([-0.04, 0, -0.07], [-0.03, 0.05, 0.07]);
      b.box([0.03, 0, -0.07], [0.04, 0.05, 0.07]);
      b.setInk('bricks').setColor('#c4583f').setPattern(PATTERN.brick);
      b.box([-0.03, 0.012, -0.06], [0.03, 0.05, 0.06]);
      break;
    case 'crate':
      b.setInk('crate').setColor('#cf8a43').setPattern(PATTERN.planks);
      b.box([-0.06, 0, -0.05], [0.06, 0.09, 0.05]);
      b.setInk('slats').setColor('#8c5f31').setPattern(PATTERN.none);
      b.box([-0.062, 0.035, -0.052], [0.062, 0.05, 0.052]);
      break;
    case 'lantern':
      b.setInk('frame').setColor(PALETTE.metal);
      b.box([-0.04, 0, -0.04], [0.04, 0.012, 0.04]);
      b.lathe([[0.034, 0.1], [0.012, 0.125], [0, 0.13]], { segments: 6 });
      b.setInk('light').setColor(PALETTE.yellow).setPattern(PATTERN.glow);
      b.box([-0.032, 0.012, -0.032], [0.032, 0.1, 0.032]);
      break;
    case 'basket':
      basket(b, 0.07, 0.065);
      // The vegetables heaped in it: one soft body, each its own colour and round, no lines between.
      soft(b, { ink: 'veg' }, (s) => {
        s.b.setColor('#e07b2c');
        s.ball(-0.025, 0.065, 0, 0.025, 0.02, 0.025, 7, 5);
        s.b.setColor('#6aa84f');
        s.ball(0.025, 0.065, 0.01, 0.028, 0.024, 0.028, 7, 5);
        s.b.setColor('#b33d5a');
        s.ball(0, 0.07, -0.025, 0.02, 0.018, 0.02, 7, 5);
      });
      break;
    case 'washing':
      basket(b, 0.08, 0.06, '#c9a46c');
      soft(b, { ink: 'cloth' }, (s) => {
        s.b.setColor(PALETTE.white).setPattern(PATTERN.cloth);
        s.ball(-0.02, 0.06, 0, 0.045, 0.025, 0.045, 7, 5);
        s.b.setColor('#8fb6e0');
        s.ball(0.03, 0.062, 0.01, 0.035, 0.022, 0.035, 7, 5);
      });
      break;
    case 'sheaf':
      b.setInk('sheaf').setColor('#d69a32').setPattern(PATTERN.thatch);
      b.lathe([[0, 0], [0.035, 0], [0.022, 0.07], [0.045, 0.16], [0, 0.17]], { segments: 7 });
      b.setInk('tie').setColor('#9b6a2f').setPattern(PATTERN.none);
      b.lathe([[0.026, 0.06], [0.025, 0.075]], { segments: 7 });
      break;
    case 'petals':
      basket(b, 0.05, 0.045, '#d8b07a');
      b.setInk('petals').setColor('#f4a6c1');
      b.at(translation(0, 0.045, 0), () => ball(b, 0.042, 0.018));
      break;
    case 'barrel':
      b.setInk('barrel').setColor('#a8672f').setPattern(PATTERN.planks);
      smoothLathe(b, [[0, 0], [0.045, 0], [0.056, 0.05], [0.045, 0.1], [0, 0.1]], { segments: 10, crease: 0.7 });
      b.setInk('hoops').setColor(PALETTE.metal).setPattern(PATTERN.none);
      for (const y of [0.022, 0.078]) b.lathe([[0.051, y - 0.005], [0.053, y + 0.005]], { segments: 10 });
      break;
    case 'cart':
    case 'cart-1':
    case 'cart-2':
    case 'cart-3': {
      // A two-wheeled handcart, handles toward −Z (where whoever pushes it stands), up to three goods on its bed.
      b.setInk('cart').setColor('#9a6a3a').setPattern(PATTERN.planks);
      b.box([-0.11, 0.08, -0.12], [0.11, 0.1, 0.14]);
      b.box([-0.11, 0.1, -0.12], [-0.1, 0.14, 0.14]);
      b.box([0.1, 0.1, -0.12], [0.11, 0.14, 0.14]);
      b.box([-0.11, 0.1, 0.13], [0.11, 0.14, 0.14]);
      b.setInk('handles').setColor(PALETTE.trunk).setPattern(PATTERN.none);
      for (const x of [-0.09, 0.09]) tube(b, [[x, 0.1, -0.12], [x, 0.16, -0.24]], 0.007, { seg: 4 });
      b.setInk('wheels').setColor('#5a3b22');
      for (const x of [-0.13, 0.13]) b.at(translation(x, 0.065, 0.02), () => b.at([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], () => b.lathe([[0, -0.012], [0.065, -0.012], [0.065, 0.012], [0, 0.012]], { segments: 10 })));
      const n = kind === 'cart' ? 0 : Number(kind.slice(5));
      const goods: Load[] = ['crate', 'barrel', 'sack'];
      for (let i = 0; i < n; i++) b.at(translation((i - 1) * 0.07, 0.1, 0.02 + (i % 2) * 0.03), () => b.at([0.75, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 0.75, 0, 0, 0, 0, 1], () => drawLoadAt(b, goods[i % 3]!)));
      break;
    }
    case 'scythe':
      b.setInk('snath').setColor(PALETTE.trunk);
      tube(b, [[0, 0, 0], [0, 0.32, 0.02]], 0.006, { seg: 4 });
      b.setInk('blade').setColor('#c9ccd6').setPattern(PATTERN.metal);
      b.polygon([[0, 0.3, 0.02], [0.02, 0.32, 0.02], [0.16, 0.24, 0.02], [0.12, 0.23, 0.02]]);
      b.polygon([[0.12, 0.23, 0.02], [0.16, 0.24, 0.02], [0.02, 0.32, 0.02], [0, 0.3, 0.02]]);
      break;
    case 'apples':
      // A basket heaped with red apples: one soft body, so one outline round the heap.
      basket(b, 0.075, 0.065);
      soft(b, { ink: 'apples' }, (s) => {
        s.b.setColor(APPLE_RED);
        for (const [x, y, z] of [[-0.035, 0.07, -0.02], [0.03, 0.07, -0.025], [0.0, 0.07, 0.03], [-0.03, 0.075, 0.03], [0.035, 0.072, 0.025], [0.0, 0.1, 0.0]] as const) s.ball(x, y, z, 0.026, 0.024, 0.026, 7, 5);
      });
      break;
    case 'apple':
      appleAt(b, 0, 0.032, 0, 0.034);
      break;
    case 'jug':
      b.setInk('jug').setColor('#c9744a');
      smoothLathe(b, [[0, 0], [0.032, 0], [0.042, 0.035], [0.03, 0.075], [0.022, 0.085], [0.026, 0.095], [0, 0.095]], { segments: 10, crease: 0.9 });
      b.setInk('handle').setColor('#a95a36');
      tube(b, [[0.03, 0.075, 0], [0.058, 0.07, 0], [0.058, 0.035, 0], [0.04, 0.025, 0]], 0.006, { seg: 4 });
      break;
    case 'bouquet':
      b.setInk('stems').setColor('#5d8f3a');
      b.lathe([[0, 0], [0.012, 0], [0.025, 0.06], [0, 0.06]], { segments: 6 });
      soft(b, { ink: 'flowers' }, (s) => {
        s.b.setColor(PALETTE.white);
        s.ball(0, 0.065, 0, 0.038, 0.026, 0.038, 8, 5);
        s.b.setColor('#f4a6c1');
        s.ball(0.02, 0.08, 0.01, 0.016, 0.014, 0.016, 6, 4);
      });
      break;
  }
}

const APPLE_RED = '#e0453a';

/** One apple: a red round with a stalk and a leaf. */
function appleAt(b: MeshBuilder, x: number, y: number, z: number, r: number): void {
  b.setInk('apple').setColor(APPLE_RED);
  smoothBall(b, x, y, z, r, r * 0.92, r, 8, 5);
  b.setInk('stalk').setColor(PALETTE.trunk);
  b.box([x - 0.004, y + r * 0.8, z - 0.004], [x + 0.004, y + r * 1.3, z + 0.004]);
  b.setInk('leaf').setColor(PALETTE.leafDark);
  b.box([x + 0.004, y + r * 1.05, z - 0.003], [x + r * 0.75, y + r * 1.25, z + 0.003]);
}

/** L63: the beach's loads, in the figure's units at their own size; false for any other load. */
function drawBeachLoad(b: MeshBuilder, kind: Load): boolean {
  if (kind.startsWith('parasol-open-')) drawOpenParasolHeld(b, colourOf(kind));
  else if (kind.startsWith('parasol-')) drawFurledParasol(b, colourOf(kind));
  else if (kind.startsWith('deckchair-')) drawFoldedChair(b, colourOf(kind));
  else if (kind.startsWith('pail-')) drawCarriedPail(b, colourOf(kind));
  else if (kind === 'hamper') drawCarriedHamper(b);
  else if (kind === 'beachball') drawCarriedBall(b);
  else if (kind === 'trestle') drawTrestle(b);
  else if (kind === 'lantern-pole') drawLanternPole(b);
  else if (kind === 'icecart') drawIceCart(b);
  else if (kind === 'cone') drawCone(b);
  else if (kind.startsWith('blanket-')) drawRolledBlanket(b, colourOf(kind));
  else return false;
  return true;
}
const isBeach = (kind: Load): boolean => (BEACH_LOADS as readonly string[]).includes(kind) || kind === 'trestle' || kind === 'lantern-pole' || kind === 'icecart' || kind === 'cone' || kind.startsWith('blanket-');

/**
 * How each load is carried, so it shows above or in front of the carrier from far off:
 *   shoulder   on the right shoulder, steadied by the right hand (a sack, a crate, a sheaf, a ladder)
 *   shoulderL  on the left shoulder (a hod of bricks)
 *   head       on the head, steadied by the left hand (baskets: the catch, vegetables, washing, petals)
 *   high       held up over the head on the right hand (the baker's tray)
 *   yoke       a yoke across the shoulders with a pail at each end (water)
 *   side       hanging from the right hand (a fish)
 *   chest      held up in front (a loaf, flowers)
 *   pole       up on a pole before them (the lantern)
 *   push       a handcart pushed ahead of them on its wheels
 */
export type Hold = 'shoulder' | 'shoulderL' | 'head' | 'high' | 'yoke' | 'side' | 'chest' | 'pole' | 'push';
const BEACH_HOLD = (kind: BeachLoad): Hold => (kind.startsWith('parasol-open-') ? 'high' : kind.startsWith('parasol-') ? 'shoulder' : kind.startsWith('deckchair-') ? 'shoulderL' : kind === 'beachball' ? 'chest' : 'side');
export const HOLD_OF: Readonly<Record<Load, Hold>> = {
  ...(Object.fromEntries(BEACH_LOADS.map((k) => [k, BEACH_HOLD(k)])) as Record<BeachLoad, Hold>),
  sack: 'shoulder',
  crate: 'shoulder',
  sheaf: 'shoulder',
  ladder: 'shoulder',
  plank: 'shoulder',
  beam: 'shoulder',
  hod: 'shoulderL',
  fish: 'head',
  basket: 'head',
  washing: 'head',
  petals: 'head',
  tray: 'high',
  bucket: 'yoke',
  fishes: 'side',
  loaf: 'chest',
  bouquet: 'chest',
  lantern: 'pole',
  barrel: 'shoulder',
  cart: 'push',
  'cart-1': 'push',
  'cart-2': 'push',
  'cart-3': 'push',
  scythe: 'shoulder',
  trestle: 'shoulder',
  'lantern-pole': 'pole',
  icecart: 'push',
  cone: 'high',
  'blanket-0': 'shoulder',
  'blanket-1': 'shoulder',
  'blanket-2': 'shoulder',
  'blanket-3': 'shoulder',
  // The raid's loot: a chest, a ham and a bolt of cloth on the shoulder; the pig and the cheese held up in
  // front; the hen and the candlestick held up high.
  chest: 'shoulder',
  ham: 'shoulder',
  cloth: 'shoulder',
  pig: 'chest',
  cheese: 'chest',
  hen: 'high',
  candlestick: 'high',
  apples: 'head',
  apple: 'chest',
  jug: 'chest',
};
/** Loads drawn at their own size whatever the camera's distance (they are big enough, or would swamp their carrier). */
export const NOT_GROWN: ReadonlySet<Load> = new Set<Load>(['beam', 'icecart', 'cart', 'cart-1', 'cart-2', 'cart-3', ...BEACH_LOADS.filter((k) => k.startsWith('parasol-open-'))]);
/** Loads heavy enough that their carrier leans into them and walks slower. */
export const HEAVY: ReadonlySet<Load> = new Set<Load>(['trestle', 'sack', 'crate', 'sheaf', 'hod', 'fish', 'bucket', 'washing', 'ladder', 'barrel', 'cart-2', 'cart-3', 'chest', 'plank', 'beam']);

const rotX = (a: number): Mat4Like => rotationX(a);
const rotZ = (a: number): Mat4Like => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Where each load sits, in the figure's body frame (origin at the feet, +Y up, +Z forward; the shoulders are at 0.25, the top of the head 0.42). */
const BEACH_AT = (kind: BeachLoad): Mat4Like =>
  kind.startsWith('parasol-open-')
    ? translation(0.088, 0.325, 0.055)
    : kind.startsWith('parasol-')
      ? // Fore and aft on the right shoulder, the furled end forward and up; held about the shoulder.
        compose(translation(0.078, 0.305, 0), rotationX(-0.38), translation(0, 0, -0.24))
      : kind.startsWith('deckchair-')
        ? // On its edge on the left shoulder, beside the head.
          compose(translation(-0.085, 0.31, -0.02), rotationX(-0.12))
        : kind === 'beachball'
          ? translation(0, 0.2, 0.085)
          : kind === 'hamper'
            ? translation(0.115, 0.04, 0.03)
            : translation(0.115, 0.055, 0.03);
const HOLD: Record<Load, Mat4Like> = {
  ...(Object.fromEntries(BEACH_LOADS.map((k) => [k, BEACH_AT(k)])) as Record<BeachLoad, Mat4Like>),
  // Lying fore and aft along the shoulder.
  sack: multiply(translation(0.075, 0.3, -0.14), rotX(Math.PI / 2)),
  crate: translation(0.07, 0.26, 0),
  sheaf: multiply(translation(0.07, 0.27, -0.12), rotX(Math.PI / 2 - 0.4)),
  ladder: translation(0.1, 0.3, 0.02),
  plank: translation(0.1, 0.3, 0.02),
  beam: translation(0.1, 0.3, 0),
  hod: translation(-0.085, 0.28, -0.01),
  fish: translation(0, 0.41, 0),
  basket: translation(0, 0.41, 0),
  washing: translation(0, 0.41, 0),
  petals: translation(0, 0.41, 0),
  // On the flat of the right hand, up at the shoulder.
  tray: translation(0.085, 0.335, 0.05),
  bucket: translation(0, 0, 0),
  fishes: translation(0.115, -0.03, 0.03),
  // A long loaf held up across the chest, one end up past the shoulder.
  loaf: multiply(translation(0.0, 0.2, 0.08), rotZ(0.9)),
  bouquet: translation(0, 0.19, 0.08),
  lantern: translation(0.09, 0.36, 0.06),
  barrel: multiply(translation(0.075, 0.27, -0.1), rotX(Math.PI / 2)),
  // On the ground ahead of them, its handles in their hands. (A cart is not drawn bigger: it is big enough.)
  cart: translation(0, 0, 0.33),
  'cart-1': translation(0, 0, 0.33),
  'cart-2': translation(0, 0, 0.33),
  'cart-3': translation(0, 0, 0.33),
  scythe: multiply(translation(0.08, 0.2, -0.04), rotX(-0.5)),
  trestle: translation(0.1, 0.3, 0.02),
  'lantern-pole': translation(0.09, 0.36, 0.06),
  icecart: translation(0, 0, 0),
  cone: translation(0.085, 0.33, 0.06),
  'blanket-0': translation(0.085, 0.3, -0.02),
  'blanket-1': translation(0.085, 0.3, -0.02),
  'blanket-2': translation(0.085, 0.3, -0.02),
  'blanket-3': translation(0.085, 0.3, -0.02),
  chest: translation(0.07, 0.26, -0.02),
  ham: multiply(translation(0.075, 0.3, -0.04), rotX(Math.PI / 2 - 0.3)),
  cloth: translation(0.075, 0.3, -0.03),
  pig: translation(0, 0.18, 0.09),
  cheese: translation(0, 0.18, 0.09),
  hen: translation(0.085, 0.335, 0.05),
  candlestick: translation(0.085, 0.335, 0.05),
  apples: translation(0, 0.41, 0),
  apple: translation(0, 0.19, 0.09),
  jug: translation(0, 0.17, 0.09),
};

const cache = new Map<string, MeshData>();

/**
 * The point of the body frame the load is held about (the carried mesh is built round it, so the people
 * system can draw a load bigger when the camera is far off without moving it off the shoulder or head).
 */
export function holdAnchor(kind: Load): [number, number, number] {
  if (kind === 'bucket') return [0, 0.26, 0];
  const m = HOLD[kind];
  return [m[12]!, m[13]!, m[14]!];
}

/** The load as carried: in the figure's body frame, about its hold anchor (holdAnchor). */
export function carriedMesh(kind: Load): MeshData {
  const k = `carried:${kind}`;
  let m = cache.get(k);
  if (!m) {
    const b = new MeshBuilder({ ink: `load-${kind}` });
    const [ax, ay, az] = holdAnchor(kind);
    b.at(multiply(translation(-ax, -ay, -az), HOLD[kind]), () => {
      if (kind === 'bucket') {
        // A yoke across the shoulders and a pail hanging from each end.
        b.setInk('yoke').setColor(PALETTE.wood).setPattern(PATTERN.planks);
        b.box([-0.2, 0.255, -0.015], [0.2, 0.275, 0.015]);
        b.setInk('ropes').setColor(PALETTE.ink).setPattern(PATTERN.none);
        for (const x of [-0.19, 0.19]) b.box([x - 0.003, 0.11, -0.003], [x + 0.003, 0.26, 0.003]);
        for (const x of [-0.19, 0.19]) b.at(translation(x, 0.02, 0), () => drawLoad(b, kind, 1.3));
      } else if (isBeach(kind)) drawLoadAt(b, kind);
      else if (kind === 'ladder') drawLoad(b, kind, 1.25);
      else if (HOLD_OF[kind] === 'push') drawLoad(b, kind, 1.15);
      else if (kind === 'lantern') {
        // On a short pole held up before them.
        b.setInk('pole').setColor(PALETTE.trunk);
        tube(b, [[0, -0.19, 0], [0, 0.02, 0]], 0.005, { seg: 4 });
        b.at(translation(0, 0.02, 0), () => drawLoad(b, kind));
      } else drawLoad(b, kind);
    });
    cache.set(k, (m = b.build()));
  }
  return m;
}

/** The load set down: in world units, standing at the origin (scale it with the people's size). */
export function restingMesh(kind: Load): MeshData {
  const k = `rest:${kind}`;
  let m = cache.get(k);
  if (!m) {
    const b = new MeshBuilder({ ink: `rest-${kind}` });
    // The figure's units to the world's (PERSON.height ÷ DESIGN_HEIGHT, about 1.1).
    b.at([1.1, 0, 0, 0, 0, 1.1, 0, 0, 0, 0, 1.1, 0, 0, 0, 0, 1], () => {
      if (kind === 'ladder') {
        // Set down, a ladder leans against the wall ahead (+Z), its foot at the origin.
        const a = 1.2, h = 0.3 * 1.25;
        b.at(multiply(translation(0, h * Math.sin(a), h * Math.cos(a)), rotationX(-a)), () => drawLoad(b, kind, 1.25));
      } else if (kind === 'sheaf') {
        // A sheaf stood up on its butt, leaning in (-X) to the others of its stook (L59), darker than the
        // standing wheat so it shows against it.
        b.at(rotZ(0.3), () => drawLoad(b, kind, 1.7));
      } else if (kind === 'apple') {
        // Set out on a counter, apples lie in a little heap (each one bought takes the heap's worth: one apple).
        const k = BIG_REST;
        for (const [x, y, z] of [[-0.03, 0, -0.012], [0.03, 0, -0.012], [0, 0, 0.028], [0, 0.045, 0.002]] as const) appleAt(b, x * k, (y + 0.03) * k, z * k, 0.03 * k);
      } else if (kind === 'sack') {
        // Set down, a sack lies on its side (they heap up by a door), its middle over the origin.
        b.at(multiply(translation(0, 0.068 * BIG_REST, -0.085 * BIG_REST), rotationX(Math.PI / 2)), () => drawLoad(b, kind, BIG_REST));
      } else drawLoad(b, kind, BIG_REST);
    });
    cache.set(k, (m = b.build()));
  }
  return m;
}
