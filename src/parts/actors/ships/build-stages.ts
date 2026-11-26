// A big ship as it is built on a slipway (R-D05; src/life/town/chains/shipyard.ts),
// from the real hull of its kind: the very drawing a ship of that kind and look
// is (cog.part.ts, galleon.part.ts), shown a piece at a time.
//
//   keel     the keel laid on the cradle, the stem and stern posts up
//   ribs     the frames rise one by one along the keel: a bare skeleton, each
//            rib following the hull's own section from the keel to the rail
//   planks   the outer skin, strake by strake from the keel up (clipped from
//            the finished hull by height), in fresh unpainted timber, with its
//            inside showing; the ribs still stand above the planking
//   deck     decks, bulwarks, castles and the rest of the fittings, all still
//            bare timber
//   paint    the livery goes on one band at a time from the waterline up
//   masts    masts, yards' rigging and lanterns stepped: the finished hull,
//            exactly as it will sail (its sails are instances of their own)
//
// Every stage stands in its cradle: timber blocks under the keel down to the
// ways, which lie at y = cradleFoot(kind) in the hull's frame (+Z the bow,
// y = 0 the waterline). Meshes are made when asked for and cached a few at a
// time (a galleon's full drawing is big; the stages are cheap to cut from it).

import type { Vec3 } from '@/core/mat4';
import { MeshBuilder, type MeshData } from '@/gen/mesh';
import { tube } from '@/parts/ground/kit';
import { RAMPS } from '@/style/palette';
import { SHIPYARD } from '@/style/shipyard';
import { drawCog } from './cog.part';
import { drawGalleon } from './galleon.part';
import { shipPaint } from './paint';
import { rigOf } from './rig';

export type YardKind = 'cog' | 'galleon';

/** The ink namespace of every stage's drawing (one, so a stage and the next share their surfaces). */
const INK = 'shipyard-hull';

/** How many ribs each kind is framed with, and how many strakes it is planked in. */
const RIBS: Record<YardKind, number> = { cog: 9, galleon: 13 };
const STRAKES = 7;
/** The paint goes on to these heights (hull frame), one band a step: none, bottom and boot, to the wale, the upper works, all. */
const PAINT = [-9, 0.08, 0.3, 0.62, 9];

export type StageName = 'empty' | 'keel' | 'ribs' | 'planks' | 'deck' | 'paint' | 'masts';

export interface StageInfo {
  name: StageName;
  /** Within its stage: ribs up, strakes on, bands painted (0 for the others). */
  k: number;
}

/** The steps of a build, in order: index 0 is the empty cradle-less slip, the last the finished hull. */
export function buildSteps(kind: YardKind): StageInfo[] {
  const out: StageInfo[] = [{ name: 'empty', k: 0 }, { name: 'keel', k: 0 }];
  for (let i = 1; i <= RIBS[kind]; i++) out.push({ name: 'ribs', k: i });
  for (let i = 1; i <= STRAKES; i++) out.push({ name: 'planks', k: i });
  out.push({ name: 'deck', k: 0 });
  for (let i = 1; i < PAINT.length; i++) out.push({ name: 'paint', k: i });
  out.push({ name: 'masts', k: 0 });
  return out;
}

/** The height of the ways under the hull, in its own frame: under the deepest of the keel, by the cradle. */
export function cradleFoot(kind: YardKind): number {
  return -rigOf(kind, 0).spec.draft - SHIPYARD.cradle;
}

/** Fresh timber, and the inside of the skin. */
const RAW: [number, number, number] = hexRgb(RAMPS.wood[2]!);
const RAW_IN: [number, number, number] = hexRgb(RAMPS.wood[7]!);
const RIB = RAMPS.wood[0]!;

function hexRgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Full {
  mesh: MeshData;
  /** The inks of the outer skin (planked strake by strake) and of the rig (stepped last). */
  skin: Set<number>;
  rig: Set<number>;
}

const fulls = new Map<string, Full>();

/** The finished hull, as its part draws it, with its inks sorted. */
function full(kind: YardKind, look: number): Full {
  const key = `${kind}:${look}`;
  let f = fulls.get(key);
  if (f) return f;
  const b = new MeshBuilder({ ink: INK });
  const rig = rigOf(kind, look);
  if (kind === 'cog') drawCog(b, rig, shipPaint(look, 'cog'));
  else drawGalleon(b, rig, shipPaint(look, 'galleon'));
  const skin = new Set(['hull', 'wale', 'wale2'].map((n) => b.inkOf(n)));
  const rigNames = ['mast', 'mast-top', 'rigging', 'bowsprit'];
  for (let i = 0; i < 3; i++) rigNames.push(`mast${i}`, `mast${i}-top`, `lantern${i}-iron`, `lantern${i}-glow`);
  f = { mesh: b.build(), skin, rig: new Set(rigNames.map((n) => b.inkOf(n))) };
  // Only the last kind and look asked for is kept: a yard builds one ship at a time.
  fulls.clear();
  fulls.set(key, f);
  return f;
}

/** The keel, stem and stern posts, the ribs (the first `ribs` of them), and the cradle: drawn from the hull's own lines. */
function frame(kind: YardKind, look: number, ribs: number, keel: boolean): MeshData {
  const b = new MeshBuilder({ ink: INK });
  const rig = rigOf(kind, look);
  const h = rig.hull;
  const ts = h.spec.stations;
  const foot = cradleFoot(kind);
  // ── the cradle: blocks under the keel down to the ways, and the two sliding ways along it ──
  b.with({ color: RAMPS.wood[7]!, ink: 'cradle' }, () => {
    for (const t of [0.12, 0.3, 0.48, 0.66, 0.84]) {
      const z = h.z(t, 0), top = -h.keel(t) + 0.02;
      b.box([-0.2, foot + 0.03, z - 0.07], [0.2, top, z + 0.07]);
    }
    const z0 = h.z(0.06, 0), z1 = h.z(0.92, 0);
    for (const x of [-SHIPYARD.wayApart, SHIPYARD.wayApart]) b.box([x - 0.07, foot, z0], [x + 0.07, foot + 0.035, z1]);
  });
  if (!keel) return b.build();
  // ── the keel, and the posts at either end ──
  b.with({ color: RAMPS.wood[3]!, ink: 'keel' }, () => {
    const along: Vec3[] = ts.map((t) => [0, -h.keel(t) + 0.03, h.z(t, -h.keel(t))]);
    tube(b, along, 0.05, { seg: 4 });
    const post = (t: number, top: number): Vec3[] => [0, 0.25, 0.5, 0.75, 1].map((k) => {
      const y = -h.keel(t) + (top + h.keel(t)) * k;
      return [0, y, h.z(t, y)];
    });
    tube(b, post(1, h.rail(1) + 0.1), 0.045, { seg: 4, capEnd: true });
    tube(b, post(0, h.rail(0)), 0.045, { seg: 4, capEnd: true });
  });
  // ── the ribs: evenly along the keel, each the section of the hull at its station, a little inside the skin ──
  const n = RIBS[kind];
  b.with({ color: RIB, ink: 'ribs' }, () => {
    for (let i = 0; i < Math.min(ribs, n); i++) {
      const t = 0.07 + (0.86 * i) / (n - 1);
      const top = h.rail(t) + 0.05, bottom = -h.keel(t);
      const side = (s: number): Vec3[] => {
        const pts: Vec3[] = [];
        for (let j = 0; j <= 6; j++) {
          const y = top + (bottom - top) * (j / 6);
          pts.push([s * Math.max(0.02, h.outer(t, Math.min(y, h.rail(t))) - 0.03), y, h.z(t, y)]);
        }
        return pts;
      };
      const right = side(1), left = side(-1).reverse();
      tube(b, [...right, [0, bottom + 0.02, h.z(t, bottom)], ...left], 0.026, { seg: 4, capStart: true, capEnd: true });
    }
  });
  return b.build();
}

/** The triangles of `m` that `keep` keeps (by first vertex), recoloured by `color` if given; `inside` adds each again turned to face in, darker. */
function cut(m: MeshData, keep: (tri: number, maxY: number, midY: number, ink: number) => boolean, color?: (tri: number, midY: number, ink: number) => [number, number, number] | null, inside?: (ink: number) => boolean): MeshData {
  const tris = m.position.length / 9;
  const picked: number[] = [];
  const flipped: number[] = [];
  for (let t = 0; t < tris; t++) {
    const y0 = m.position[t * 9 + 1]!, y1 = m.position[t * 9 + 4]!, y2 = m.position[t * 9 + 7]!;
    const ink = m.inkId[t * 3]!;
    if (!keep(t, Math.max(y0, y1, y2), (y0 + y1 + y2) / 3, ink)) continue;
    picked.push(t);
    if (inside?.(ink)) flipped.push(t);
  }
  const n = (picked.length + flipped.length) * 3;
  const out: MeshData = {
    position: new Float32Array(n * 3),
    normal: new Float32Array(n * 3),
    color: new Uint8Array(n * 3),
    pattern: new Uint8Array(n),
    inkId: new Uint16Array(n),
    edge: new Float32Array(n),
    sway: new Float32Array(n),
  };
  let v = 0;
  const put = (t: number, flip: boolean): void => {
    const midY = (m.position[t * 9 + 1]! + m.position[t * 9 + 4]! + m.position[t * 9 + 7]!) / 3;
    const ink = m.inkId[t * 3]!;
    const c = flip ? RAW_IN : color?.(t, midY, ink) ?? null;
    for (let k = 0; k < 3; k++) {
      // Turned to face in: the corners in the other order, the normals reversed.
      const s = t * 3 + (flip ? [0, 2, 1][k]! : k);
      for (let a = 0; a < 3; a++) {
        out.position[v * 3 + a] = m.position[s * 3 + a]!;
        out.normal[v * 3 + a] = flip ? -m.normal[s * 3 + a]! : m.normal[s * 3 + a]!;
        out.color[v * 3 + a] = c ? c[a]! : m.color[s * 3 + a]!;
      }
      out.pattern[v] = m.pattern[s]!;
      out.inkId[v] = m.inkId[s]!;
      out.edge[v] = m.edge[s]!;
      out.sway[v] = m.sway[s]!;
      v++;
    }
  };
  for (const t of picked) put(t, false);
  for (const t of flipped) put(t, true);
  return out;
}

function join(a: MeshData, b: MeshData): MeshData {
  const n = a.inkId.length + b.inkId.length;
  const out: MeshData = {
    position: new Float32Array(n * 3),
    normal: new Float32Array(n * 3),
    color: new Uint8Array(n * 3),
    pattern: new Uint8Array(n),
    inkId: new Uint16Array(n),
    edge: new Float32Array(n),
    sway: new Float32Array(n),
  };
  for (const k of ['position', 'normal', 'color'] as const) {
    out[k].set(a[k]);
    out[k].set(b[k], a[k].length);
  }
  for (const k of ['pattern', 'inkId', 'edge', 'sway'] as const) {
    out[k].set(a[k]);
    out[k].set(b[k], a[k].length);
  }
  return out;
}

const stages = new Map<string, MeshData>();
const STAGES_KEPT = 4;

/** The drawing of a ship of this kind and look at step `step` of buildSteps(kind) (clamped). */
export function stageMesh(kind: YardKind, look: number, step: number): MeshData {
  const steps = buildSteps(kind);
  const i = Math.max(0, Math.min(steps.length - 1, Math.round(step)));
  const key = `${kind}:${look}:${i}`;
  let m = stages.get(key);
  if (m) {
    stages.delete(key);
    stages.set(key, m);
    return m;
  }
  m = draw(kind, look, steps[i]!);
  stages.set(key, m);
  while (stages.size > STAGES_KEPT) stages.delete(stages.keys().next().value!);
  return m;
}

function draw(kind: YardKind, look: number, s: StageInfo): MeshData {
  const ribs = RIBS[kind];
  const cradle = (): MeshData => frame(kind, look, 0, false);
  switch (s.name) {
    case 'empty':
      return cradle();
    case 'keel':
      return frame(kind, look, 0, true);
    case 'ribs':
      return frame(kind, look, s.k, true);
    case 'planks': {
      const f = full(kind, look);
      const h = rigOf(kind, look).hull;
      const lo = -h.spec.draft, hi = Math.max(h.rail(0), h.rail(1), h.rail(0.5)) + 0.01;
      const top = lo + ((hi - lo) * s.k) / STRAKES + (s.k === STRAKES ? 1 : 0);
      const skin = cut(f.mesh, (_t, maxY, _m, ink) => f.skin.has(ink) && maxY <= top + 1e-4, () => RAW, (ink) => f.skin.has(ink));
      return join(frame(kind, look, ribs, true), skin);
    }
    case 'deck':
    case 'paint': {
      const f = full(kind, look);
      const upTo = s.name === 'deck' ? PAINT[0]! : PAINT[s.k]!;
      const body = cut(f.mesh, (_t, _y, _m, ink) => !f.rig.has(ink), (_t, midY) => (midY < upTo ? null : RAW));
      return join(cradle(), body);
    }
    case 'masts':
      return join(cradle(), f2(kind, look));
  }
}

/** The finished hull with its cradle under it. */
function f2(kind: YardKind, look: number): MeshData {
  return full(kind, look).mesh;
}
