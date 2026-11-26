// How a damaged structure is drawn (design section 13b, "What is left").
// Owner: Mischief. Pure.
//
// Every generator draws the structure as built; this treatment then breaks
// up that very mesh according to the damage of each of its columns (see
// ./field.ts), so a ruin is always recognisably the building it was, of any
// kind and any style, with no generator knowing about damage:
//
//   scorched (fire 1)   soot streaks over windows and doors, glass gone dark
//   cracked (blast 1)   cracks, plaster dust, windows without glass
//   half (2)            a jagged break through the roof and the top storey:
//                       charred rafters (fire) or a bite whose chunks lie at
//                       the foot of the wall (blast); a dark inside
//   burnt out (fire 3)  a blackened shell with jagged walls, fallen charred
//                       beams, ash on the floor, scorched ground round it
//   rubble (blast 3)    a stub of wall and a heap made of the building's own
//                       pieces, scorched ground round it; a tree or a pillar
//                       falls over in one piece instead
//   mending             scaffolding, a ladder, a canvas sheet, a hoist,
//                       stacked materials, pale new timber where the walls
//                       and roof are going back up, fresh patches
//
// A structure damaged in part (one end of a long inn) is cut column by
// column; where a broken column meets a sound one, a partition closes the
// sound part up to its own roof line. Stone kinds never burn past soot.

import { CELL_H, columnIndex, DIR4, inColumnBounds, keyX, keyY, keyZ, type Dir4 } from '@/core/grid';
import { hash, rand } from '@/core/rand';
import { styleVersion } from '@/core/style';
import type { GenOutput, GeneratorRegistry } from '@/gen/api';
import { hashStructure } from '@/resolve/engine/hash';
import { mergeMeshes, MeshBuilder, PATTERN, type MeshData } from '@/gen/mesh';
import type { ShapePlan, Structure } from '@/resolve/plan';
import { DAMAGE_COLORS, RUIN, rgb } from '@/style/damage';
import { PALETTE } from '@/style/palette';
import { afloatTopple, chunkMatrix, debrisOf, restMatrix, WATER_Y, type Chunk } from './debris';
import { ashFloor, beam, crackShape, fallenBeams, groundColour, heap, raftersOn, scorchRing, sootShape, studsOn } from './extras';
import { cutField, profileOf, STONE_KINDS, type Column, type Plane, type Profile } from './field';
import { area, backOf, bounds, centroid, clip, clonePoly, normalOf, polysOf as polysOfMesh, Soup, tint, transformPoly, vert, type Poly, type Vert } from './poly';
import { scaffold } from './scaffold';

/** The colour of the open ground under a column (what its scorch mark recovers to). */
const groundUnder = (prof: Profile, x: number, z: number): [number, number, number] =>
  groundColour(inColumnBounds(x, z) ? prof.plan.terrain.material[columnIndex(x, z)]! : 2);

type Field = (ix: number, iz: number) => Plane | null;

interface Broken {
  kept: Poly[];
  removed: Poly[];
  caps: { a: Vert; b: Vert; src: Poly }[];
}

/** Splits polygons along a cut field into what stays (below) and what is gone (above). */
export function breakPolys(polys: readonly Poly[], field: Field, wantRemoved = true): Broken {
  const T = RUIN.tile;
  const kept: Poly[] = [];
  const removed: Poly[] = [];
  const caps: Broken['caps'] = [];
  const range = (lo: number, hi: number): [number, number] => {
    const i0 = Math.floor((lo + 1e-6) / T);
    const i1 = Math.floor((hi - 1e-6) / T);
    return [i0, Math.max(i0, i1)];
  };
  for (const poly of polys) {
    const b = bounds(poly);
    const [ix0, ix1] = range(b[0], b[3]);
    const [iz0, iz1] = range(b[2], b[5]);
    let anyCut = false;
    let allCut = true;
    let below = true;
    let above = true;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const pl = field(ix, iz);
        if (!pl) {
          allCut = false;
          continue;
        }
        anyCut = true;
        const m = (Math.abs(pl.gx) + Math.abs(pl.gz)) * T * 0.5 + 1e-4;
        if (b[4] > pl.h - m) below = false;
        if (b[1] < pl.h + m) above = false;
      }
    }
    if (!anyCut || below) {
      kept.push(poly);
      continue;
    }
    if (allCut && above) {
      if (wantRemoved) removed.push(poly);
      continue;
    }
    for (let ix = ix0; ix <= ix1; ix++) {
      let px: Poly | null = poly;
      if (ix1 > ix0) {
        px = clip(px, -1, 0, 0, ix * T);
        if (px) px = clip(px, 1, 0, 0, -(ix + 1) * T);
      }
      if (!px) continue;
      for (let iz = iz0; iz <= iz1; iz++) {
        let pz: Poly | null = px;
        if (iz1 > iz0) {
          pz = clip(pz, 0, 0, -1, iz * T);
          if (pz) pz = clip(pz, 0, 0, 1, -(iz + 1) * T);
        }
        if (!pz) continue;
        const pl = field(ix, iz);
        if (!pl) {
          kept.push(pz);
          continue;
        }
        const d = pl.h - pl.gx * pl.cx - pl.gz * pl.cz;
        const cut: Vert[] = [];
        const k = clip(pz, -pl.gx, 1, -pl.gz, -d, cut);
        if (k) {
          kept.push(k);
          if (cut.length === 2) caps.push({ a: cut[0]!, b: cut[1]!, src: pz });
        }
        if (wantRemoved) {
          const r = clip(pz, pl.gx, -1, pl.gz, d);
          if (r) removed.push(r);
        }
      }
    }
  }
  return { kept, removed, caps };
}

/** A flat face of wall: its plane and its extent, in (u along it, y). */
interface Face {
  nx: number;
  nz: number;
  /** Plane offset: n · p. */
  d: number;
  ink: number;
  u0: number;
  u1: number;
  y0: number;
  y1: number;
  area: number;
}

const faceU = (f: { nx: number; nz: number }, x: number, z: number): number => -f.nz * x + f.nx * z;

function wallFaces(polys: readonly Poly[], walls: ReadonlySet<number>): Face[] {
  const byKey = new Map<string, Face>();
  for (const p of polys) {
    if (!walls.has(p.ink)) continue;
    const [nx, ny, nz] = normalOf(p);
    if (Math.abs(ny) > 0.2) continue;
    const l = Math.hypot(nx, nz) || 1;
    const f0 = { nx: nx / l, nz: nz / l };
    const v0 = p.v[0]!;
    const d = f0.nx * v0[0]! + f0.nz * v0[2]!;
    const k = `${p.ink}|${Math.round(f0.nx * 50)}|${Math.round(f0.nz * 50)}|${Math.round(d * 100)}`;
    let f = byKey.get(k);
    if (!f) byKey.set(k, (f = { ...f0, d, ink: p.ink, u0: Infinity, u1: -Infinity, y0: Infinity, y1: -Infinity, area: 0 }));
    for (const v of p.v) {
      const u = faceU(f, v[0]!, v[2]!);
      f.u0 = Math.min(f.u0, u);
      f.u1 = Math.max(f.u1, u);
      f.y0 = Math.min(f.y0, v[1]!);
      f.y1 = Math.max(f.y1, v[1]!);
    }
    f.area += area(p);
  }
  return [...byKey.values()];
}

/** Clips a polygon given in a face's (u, y) to the face's extent. */
function clipUV(pts: [number, number][], u0: number, u1: number, y0: number, y1: number): [number, number][] {
  const edge = (list: [number, number][], inside: (p: [number, number]) => number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const q = list[(i + 1) % list.length]!;
      const fp = inside(p);
      const fq = inside(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  };
  let l = pts;
  l = edge(l, (p) => p[0] - u0);
  l = edge(l, (p) => u1 - p[0]);
  l = edge(l, (p) => p[1] - y0);
  l = edge(l, (p) => y1 - p[1]);
  return l;
}

/** A decal given in a face's (u, y), lying on the face. */
function faceDecal(f: Face, pts: [number, number][], color: readonly number[], lift = 0.008): Poly | null {
  const c = clipUV(pts, f.u0 + 0.01, f.u1 - 0.01, f.y0 + 0.01, f.y1 - 0.01);
  if (c.length < 3) return null;
  let signed = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!, q = c[(i + 1) % c.length]!;
    signed += p[0] * q[1] - q[0] * p[1];
  }
  if (signed < 0) c.reverse();
  const tx = -f.nz, tz = f.nx;
  // u runs to the viewer's left seen from outside, so a polygon anticlockwise in (u, y) is reversed to face out.
  const v = c.reverse().map(([u, y]) => vert([f.nx * (f.d + lift) + tx * u, y, f.nz * (f.d + lift) + tz * u], [f.nx, 0, f.nz], color));
  return { v, pattern: PATTERN.none, ink: f.ink };
}

/** Upward-facing faces (roofs, tops), for sampling the height of what covers a point. */
export function roofSampler(polys: readonly Poly[], minSize = 0): (x: number, z: number, minY: number) => number | null {
  // minSize: leave out small tops (a chimney's cap, a sill), by the size of their footprint.
  const ups = polys
    .filter((p) => normalOf(p)[1] > 0.25)
    .map((p) => ({ p, b: bounds(p) }))
    .filter(({ b }) => minSize <= 0 || Math.max(b[3] - b[0], b[5] - b[2]) >= minSize);
  return (x, z, minY) => {
    let best: number | null = null;
    for (const { p, b } of ups) {
      if (x < b[0] - 1e-6 || x > b[3] + 1e-6 || z < b[2] - 1e-6 || z > b[5] + 1e-6 || b[4] < minY) continue;
      const v = p.v;
      for (let i = 1; i + 1 < v.length; i++) {
        const a = v[0]!, c = v[i]!, d = v[i + 1]!;
        const det = (c[0]! - a[0]!) * (d[2]! - a[2]!) - (d[0]! - a[0]!) * (c[2]! - a[2]!);
        if (Math.abs(det) < 1e-9) continue;
        const s = ((x - a[0]!) * (d[2]! - a[2]!) - (d[0]! - a[0]!) * (z - a[2]!)) / det;
        const t = ((c[0]! - a[0]!) * (z - a[2]!) - (x - a[0]!) * (c[2]! - a[2]!)) / det;
        if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
        const y = a[1]! + s * (c[1]! - a[1]!) + t * (d[1]! - a[1]!);
        if (y >= minY && (best === null || y > best)) best = y;
      }
    }
    return best;
  };
}

/** Ink groups that are walls: the biggest upright surfaces of the structure. */
function wallInks(polys: readonly Poly[]): Set<number> {
  const byInk = new Map<number, number>();
  for (const p of polys) {
    if (Math.abs(normalOf(p)[1]) > 0.2) continue;
    byInk.set(p.ink, (byInk.get(p.ink) ?? 0) + area(p));
  }
  let max = 0;
  for (const a of byInk.values()) max = Math.max(max, a);
  const out = new Set<number>();
  for (const [ink, a] of byInk) if (a >= max * 0.25 && a > 0.2) out.add(ink);
  return out;
}

function averageColor(polys: readonly Poly[], inks: ReadonlySet<number>): [number, number, number] {
  let r = 0, g = 0, b = 0, w = 0;
  for (const p of polys) {
    if (!inks.has(p.ink)) continue;
    const a = area(p);
    const v = p.v[0]!;
    r += v[6]! * a;
    g += v[7]! * a;
    b += v[8]! * a;
    w += a;
  }
  return w > 0 ? [r / w, g / w, b / w] : rgb(PALETTE.stone);
}

const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t,
];

/** Hollow buildings: a broken one shows a dark inside, floors, partitions and fallen beams. */
const HOLLOW_KINDS = new Set<string>(['house', 'tower', 'lighthouse', 'windmill']);

/** Built of boards and posts with nothing inside to show. */
const OPEN_WORK = new Set<string>(['dock', 'fence', 'stall']);

const WOOD_PATTERNS = new Set<number>([PATTERN.planks, PATTERN.planksAcross, PATTERN.timber, PATTERN.thatch, PATTERN.bark]);
const ROOF_PATTERNS = new Set<number>([PATTERN.shingles, PATTERN.thatch]);

/** Ground under a structure's column (the terrain top or the block it stands on). */
function isOpen(col: Column, field: Field): boolean {
  const T = RUIN.tile;
  const n = Math.round(1 / T);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (field(Math.floor(col.x / T) + i, Math.floor(col.z / T) + j)) return true;
  }
  return false;
}

/** The chunks a blast makes of a structure as it is now damaged: the same ones its rubble heap is baked from. */
export function blastChunks(intact: MeshData, s: Structure, plan: ShapePlan): Chunk[] {
  const prof = profileOf(s, plan);
  if (!prof.damaged) return [];
  // Over the water on stilts: it goes over in one piece (a big dock breaks where it was hit, below).
  if (topplesWhole(prof)) {
    const a = afloatPose(prof);
    return a.toppled && !a.mending ? [toppleOf(intact, prof)] : [];
  }
  const field = cutField(prof, 'now');
  if (s.kind === 'tree') return treeChunks(intact, prof);
  const { removed } = breakPolys(polysOfMesh(intact), field, true);
  return debrisOf(debrisPart(removed, prof), prof);
}

/** What of the removed geometry turns into flying chunks: blast damage that is not being mended. */
function debrisPart(removed: readonly Poly[], prof: Profile): Poly[] {
  return removed.filter((p) => {
    const c = centroid(p);
    const col = prof.columnNear(c[0], c[2]);
    return !!col && col.cause === 'blast' && col.stage >= 2 && (!col.mending || col.phases.clear < 1);
  });
}

/** Draws the structure's damage over what its generator drew. Undamaged structures come back untouched. */
export function damageOutput(out: GenOutput, s: Structure, plan: ShapePlan): GenOutput {
  const prof = profileOf(s, plan);
  if (!prof.damaged || out.mesh.position.length === 0) return out;
  const mesh = s.kind === 'tree' ? treeDamage(out.mesh, prof) : afloat(prof) ? afloatDamage(out.mesh, prof) : buildingDamage(out.mesh, prof);
  return { mesh, anchors: out.anchors };
}

/** `rubble` false: no heap and no pieces lying about (a wreck that went over into the water instead). */
function buildingDamage(intact: MeshData, prof: Profile, rubble = true): MeshData {
  const { s, plan } = prof;
  const seed = s.seed;
  const polys = polysOfMesh(intact);
  const field = cutField(prof, 'now');
  const broken = breakPolys(polys, field, true);
  const extras = new MeshBuilder({ ink: s.id });
  const soup = new Soup();
  const walls = wallInks(polys);
  const wallColor = averageColor(polys, walls);
  const stone = STONE_KINDS.has(s.kind);
  const C = {
    char: rgb(DAMAGE_COLORS.char),
    charDeep: rgb(DAMAGE_COLORS.charDeep),
    soot: rgb(DAMAGE_COLORS.soot),
    ash: rgb(DAMAGE_COLORS.ash),
    hole: rgb(DAMAGE_COLORS.hole),
    dust: rgb(DAMAGE_COLORS.dust),
    rubble: rgb(DAMAGE_COLORS.rubble),
    broken: rgb(DAMAGE_COLORS.broken),
    inside: rgb(DAMAGE_COLORS.inside),
    scorch: rgb(DAMAGE_COLORS.scorch),
    fresh: rgb(DAMAGE_COLORS.fresh),
    freshPlaster: rgb(DAMAGE_COLORS.freshPlaster),
  };
  const colAt = (p: Poly): Column | null => {
    const c = centroid(p);
    return prof.columnNear(c[0], c[2]);
  };
  const hollow = HOLLOW_KINDS.has(s.kind);
  const open = new Set<Column>();
  for (const col of prof.columns.values()) if (col.damaged && isOpen(col, field)) open.add(col);
  const solidInside = mix3(wallColor, C.broken, 0.5);
  const insideOf = (col: Column): [number, number, number] =>
    !hollow ? solidInside : col.mending ? mix3(C.inside, C.fresh, 0.35) : col.cause === 'fire' ? C.charDeep : C.inside;

  // Fresh work on a column being mended: what stands above where the damage cut it is new.
  const wreck = cutField(prof, 'damage');
  let kept = broken.kept;
  const fresh = new Set<Poly>();
  if ([...prof.columns.values()].some((c) => c.mending)) {
    const next: Poly[] = [];
    for (const p of kept) {
      const col = colAt(p);
      if (!col?.mending) {
        next.push(p);
        continue;
      }
      const w = breakPolys([p], (ix, iz) => (prof.columnNear((ix + 0.5) * RUIN.tile, (iz + 0.5) * RUIN.tile) === col ? wreck(ix, iz) : null), true);
      next.push(...w.kept);
      for (const r of w.removed) {
        fresh.add(r);
        next.push(r);
      }
    }
    kept = next;
  }

  // ── what is left: tinted by its damage ─────────────────────────────────
  for (const p of kept) {
    const col = colAt(p);
    if (col && col.damaged) {
      const r = rand(seed, 'poly', hash(Math.round(centroid(p)[0] * 37), Math.round(centroid(p)[1] * 41), Math.round(centroid(p)[2] * 43)));
      if (p.pattern === PATTERN.glass && col.stage >= 1 && (!col.mending || col.phases.glass < 1)) {
        p.pattern = PATTERN.none;
        tint(p, C.hole, 1);
      } else if (col.mending) {
        // New work is pale until it is painted; the old is cleaned as it goes.
        const left = 1 - col.phases.paint;
        if (fresh.has(p)) tint(p, WOOD_PATTERNS.has(p.pattern) ? C.fresh : C.freshPlaster, 0.45 * left);
        else if (col.cause === 'fire' && col.stage >= 2) tint(p, C.soot, 0.25 * left);
      } else if (col.cause === 'fire') {
        if (col.stage === 2) tint(p, C.soot, 0.22 + 0.12 * r);
        else if (col.stage === 3) tint(p, stone ? C.soot : C.char, (stone ? 0.35 : 0.6) + 0.25 * r);
      } else {
        tint(p, C.dust, 0.05 + 0.06 * col.stage);
      }
    }
    soup.add(p);
    // Inside faces where the walls are open to view (not for open-work things: docks, fences, stalls).
    if (col && open.has(col) && !OPEN_WORK.has(s.kind)) {
      const [, ny] = normalOf(p);
      const c = centroid(p);
      if (walls.has(p.ink) && Math.abs(ny) < 0.2) soup.add({ ...backOf(p, RUIN.wallThickness, insideOf(col)), pattern: PATTERN.none });
      else if (ny > 0.25 && c[1] > col.top - 0.05) soup.add({ ...backOf(p, 0.03, insideOf(col)), pattern: PATTERN.none });
    }
  }

  // ── broken wall tops ────────────────────────────────────────────────────
  for (const { a, b, src } of broken.caps) {
    if (!walls.has(src.ink)) continue;
    const [nx, ny, nz] = normalOf(src);
    if (Math.abs(ny) > 0.2) continue;
    const col = colAt(src);
    const color = col?.mending ? C.fresh : col?.cause === 'fire' && !stone ? C.char : C.broken;
    const th = RUIN.wallThickness;
    const a2 = new Float64Array(a); a2[0] = a[0]! - nx * th; a2[2] = a[2]! - nz * th;
    const b2 = new Float64Array(b); b2[0] = b[0]! - nx * th; b2[2] = b[2]! - nz * th;
    const quad = [a, b, b2, a2].map((v) => {
      const q = new Float64Array(v);
      q[6] = color[0]; q[7] = color[1]; q[8] = color[2];
      return q;
    });
    // Face it up.
    const ux = quad[1]![0]! - quad[0]![0]!, uy = quad[1]![1]! - quad[0]![1]!, uz = quad[1]![2]! - quad[0]![2]!;
    const wx = quad[3]![0]! - quad[0]![0]!, wy = quad[3]![1]! - quad[0]![1]!, wz = quad[3]![2]! - quad[0]![2]!;
    let cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    if (cy < 0) {
      quad.reverse();
      cx = -cx; cy = -cy; cz = -cz;
    }
    const l = Math.hypot(cx, cy, cz) || 1;
    for (const q of quad) {
      q[3] = cx / l; q[4] = cy / l; q[5] = cz / l;
    }
    soup.add({ v: quad, pattern: PATTERN.none, ink: src.ink });
  }

  // ── partitions: a broken column next to a sounder one of the same building ──
  const sample = roofSampler(polys);
  const partitionInk = extras.inkOf('partition');
  const T = RUIN.tile;
  for (const a of hollow ? open : []) {
    for (let d = 0 as Dir4; d < 4; d = (d + 1) as Dir4) {
      const [dx, dz] = DIR4[d]!;
      const b = prof.columns.get(prof.colKey(a.x + dx, a.z + dz));
      if (!b) continue;
      const floorY = a.stage === 3 && !a.mending ? a.wreckBase : Math.max(a.base, a.top - CELL_H);
      const pts: [number, number, number][] = [];
      const steps = Math.round(1 / T);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Along the shared boundary line.
        const bx = dx !== 0 ? a.x + (dx > 0 ? 1 : 0) : a.x + t;
        const bz = dz !== 0 ? a.z + (dz > 0 ? 1 : 0) : a.z + t;
        const inB: [number, number] = [bx + dx * 0.02, bz + dz * 0.02];
        const pl = field(Math.floor(inB[0] / T), Math.floor(inB[1] / T));
        let top = sample(inB[0], inB[1], b.top - 0.05) ?? b.top;
        if (pl) top = Math.min(top, pl.h + pl.gx * (inB[0] - pl.cx) + pl.gz * (inB[1] - pl.cz));
        pts.push([bx, Math.max(floorY, top), bz]);
      }
      const color = insideOf(a);
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i]!, q = pts[i + 1]!;
        if (p[1] - floorY < 0.02 && q[1] - floorY < 0.02) continue;
        const n = [-dx, 0, -dz];
        const lo1 = vert([p[0], floorY, p[2]], n, color), lo2 = vert([q[0], floorY, q[2]], n, color);
        const hi1 = vert(p, n, color), hi2 = vert(q, n, color);
        // Wind so it faces back into a (normal -d).
        const ux = q[0] - p[0], uz = q[2] - p[2];
        // cross((u), up) = (−uz·1? ) : for u along the line and up, the normal is (u × up) = (−uz, 0, ux)·(−1)?
        const nx = -uz, nz = ux; // u × up = (uy·0 − uz·1, uz·0 − ux·0, ux·1 − uy·0) = (−uz, 0, ux)
        const facesBack = nx * -dx + nz * -dz > 0;
        const ring = facesBack ? [lo1, lo2, hi2, hi1] : [lo2, lo1, hi1, hi2];
        soup.add({ v: ring, pattern: PATTERN.none, ink: partitionInk });
      }
    }
  }

  // ── floors inside open columns ──────────────────────────────────────────
  for (const col of hollow ? open : []) {
    const inset = (dx: number, dz: number): number => (prof.columns.has(prof.colKey(col.x + dx, col.z + dz)) ? 0 : 0.07);
    const x0 = col.x + inset(-1, 0), x1 = col.x + 1 - inset(1, 0);
    const z0 = col.z + inset(0, -1), z1 = col.z + 1 - inset(0, 1);
    if (col.stage === 3 && (!col.mending || col.phases.clear < 1)) {
      if (s.kind === 'dock') continue;
      const color = col.cause === 'fire' && !stone ? C.ash : mix3(C.rubble, wallColor, 0.3);
      ashFloor(extras, x0, z0, x1, z1, col.wreckBase + 0.02, color);
    } else if (col.top - col.base > CELL_H + 1e-6 || col.stage === 3) {
      const y = col.stage === 3 ? col.wreckBase + 0.02 : col.top - CELL_H + 0.02;
      const color = col.cause === 'fire' && !col.mending ? mix3(rgb(PALETTE.wood), C.char, 0.6) : rgb(PALETTE.wood);
      extras.setColor(color).setPattern(PATTERN.planks).setInk('floor');
      extras.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]);
      extras.quad([x0, y - 0.03, z0], [x1, y - 0.03, z0], [x1, y - 0.03, z1], [x0, y - 0.03, z1]);
    }
  }

  // ── what was taken off ──────────────────────────────────────────────────
  const settling = [...prof.columns.values()].some((c) => c.settling);
  const roofColor = (() => {
    const r = polys.find((p) => ROOF_PATTERNS.has(p.pattern));
    return r ? [r.v[0]![6]!, r.v[0]![7]!, r.v[0]![8]!] : null;
  })();
  if (!settling && rubble) {
    const chunks = debrisOf(debrisPart(broken.removed, prof), prof);
    for (const [i, ch] of chunks.entries()) {
      const col = prof.columnNear(ch.to[0], ch.to[2]);
      // Carried away a piece at a time while the rubble is cleared.
      if (col?.mending && i >= Math.round(chunks.length * (1 - col.phases.clear))) continue;
      const m = restMatrix(ch);
      for (const p of ch.polys) {
        const q = clonePoly(p);
        transformPoly(q, m);
        tint(q, C.dust, 0.12);
        soup.add(q);
      }
    }
  }
  for (const p of broken.removed) {
    const col = colAt(p);
    if (!col) continue;
    const [, ny] = normalOf(p);
    const c = centroid(p);
    if (col.mending) {
      const ph = col.phases;
      extras.setColor(C.fresh).setPattern(PATTERN.none).setInk('new-timber');
      // Rafters go up from the eaves; the frame of the walls rises from the floor.
      if (ny > 0.25 && c[1] < col.top + 1.25 * ph.rafters) raftersOn(extras, p, 0.2, 0.035);
      else if (col.stage === 3 && walls.has(p.ink) && ph.frame > 0 && c[1] < col.wreckBase + (col.top - col.wreckBase) * ph.frame + 0.2) studsOn(extras, p, 0.22, 0.035);
    } else if (col.cause === 'fire' && col.stage === 2 && ny > 0.25 && !stone) {
      extras.setColor(C.char).setPattern(PATTERN.none).setInk('rafters');
      raftersOn(extras, p, 0.22, 0.04);
    }
  }
  /** Scorched ground round the foot of a destroyed column, on open ground only; fading back as it is mended. */
  const scorched = (col: Column): void => {
    if (col.stage !== 3 || s.kind === 'dock') return;
    let ground: number | null = null;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      if (prof.columns.has(prof.colKey(col.x + dx, col.z + dz))) continue;
      const og = prof.openGround(col.x + dx, col.z + dz, col.base);
      if (og !== null && Math.abs(og - col.base) < 1e-6) ground = og;
    }
    if (ground !== null && col.base === col.wreckBase) scorchRing(extras, col, ground, hash(seed, 'scorch', col.x, col.z), C.scorch, col.mending ? col.progress : 0, groundUnder(prof, col.x, col.z));
  };
  for (const col of prof.columns.values()) {
    if (col.mending) {
      scorched(col);
      const ph = col.phases;
      if (rubble && col.stage === 3 && col.cause === 'blast' && ph.clear < 1 && s.kind !== 'dock') {
        // Rubble being cleared: the heap goes down.
        heap(extras, col, hash(seed, col.x, col.z), mix3(wallColor, C.rubble, 0.55), 1 - ph.clear);
      }
      if (col.stage >= 2 && col.top > col.base && ph.walls >= 1 && ph.tiles < 1) {
        // A top plate of new timber where the walls will meet the roof.
        extras.setColor(C.fresh).setPattern(PATTERN.none).setInk('new-timber');
        const y = col.top - 0.03;
        for (const [ax, az, bx, bz] of [[0.12, 0.12, 0.88, 0.12], [0.88, 0.14, 0.88, 0.88], [0.86, 0.88, 0.12, 0.88], [0.12, 0.86, 0.12, 0.14]] as const) {
          beam(extras, [col.x + ax, y, col.z + az], [col.x + bx, y, col.z + bz], 0.04, 0.04);
        }
      }
      continue;
    }
    if (col.stage === 3 && col.cause === 'fire' && !stone && hollow) {
      extras.setColor(C.char).setPattern(PATTERN.none).setInk('beams');
      fallenBeams(extras, col, seed, col.wreckBase + (col.top - col.wreckBase) * 0.6);
    }
    if (col.stage === 3 && col.cause === 'blast' && !settling && s.kind !== 'dock') {
      heap(extras, col, hash(seed, col.x, col.z), mix3(wallColor, C.rubble, 0.55));
    }
    scorched(col);
  }

  // ── soot over openings, cracks ──────────────────────────────────────────
  const faces = wallFaces(polys, walls);
  const decals: Poly[] = [];
  const features = plan.featuresByStructure.get(s.id) ?? [];
  for (const f of features) {
    if ((f.type !== 'window' && f.type !== 'door') || f.cell === undefined || f.dir === undefined) continue;
    const x = keyX(f.cell), y = keyY(f.cell), z = keyZ(f.cell);
    const col = prof.columns.get(prof.colKey(x, z));
    if (!col || col.cause !== 'fire' || col.stage < 1 || (col.mending && col.phases.paint >= 0.5)) continue;
    const [dx, dz] = DIR4[f.dir]!;
    const px = x + 0.5 + dx * 0.5, pz = z + 0.5 + dz * 0.5;
    const top = y * CELL_H + (f.type === 'door' ? 0.5 : 0.62);
    let face: Face | null = null;
    for (const fc of faces) {
      if (fc.nx * dx + fc.nz * dz < 0.9) continue;
      const u = faceU(fc, px, pz);
      if (u < fc.u0 || u > fc.u1 || top < fc.y0 || top > fc.y1) continue;
      if (!face || fc.d > face.d) face = fc;
    }
    if (!face) continue;
    const u = faceU(face, px, pz);
    const fs = hash(seed, 'soot', f.cell, f.dir);
    const h = (0.22 + rand(fs, 'h') * 0.18) * (col.stage === 1 ? 1 : 1.6);
    const w = 0.24 + rand(fs, 'w') * 0.08;
    const shape = sootShape(fs, w, h).map(([a, b]) => [u + a, top - 0.03 + b] as [number, number]);
    const d = faceDecal(face, shape, C.soot);
    if (d) decals.push(d);
  }
  for (const col of prof.columns.values()) {
    if (col.cause !== 'blast' || col.stage < 1 || (col.mending && col.phases.paint >= 0.5)) continue;
    const mine = faces.filter((f) => {
      const cx = f.nx * f.d + -f.nz * ((f.u0 + f.u1) / 2);
      const cz = f.nz * f.d + f.nx * ((f.u0 + f.u1) / 2);
      return prof.columnNear(cx, cz) === col;
    });
    if (mine.length === 0) continue;
    const n = col.stage * 2 + 1;
    for (let i = 0; i < n; i++) {
      const cs = hash(seed, 'crack', col.x, col.z, i);
      const f = mine[Math.floor(rand(cs, 'face') * mine.length)]!;
      const u = f.u0 + 0.1 + rand(cs, 'u') * Math.max(0, f.u1 - f.u0 - 0.2);
      const yy = f.y0 + 0.15 + rand(cs, 'y') * Math.max(0, f.y1 - f.y0 - 0.25);
      for (const q of crackShape(cs, 0.22 + rand(cs, 'len') * 0.2)) {
        const d = faceDecal(f, q.map(([a, b]) => [u + a, yy + b] as [number, number]), C.hole);
        if (d) decals.push(d);
      }
    }
  }
  for (const d of breakPolys(decals, field, false).kept) soup.add(d);

  // ── scaffolding and materials ───────────────────────────────────────────
  if ([...prof.columns.values()].some((c) => c.mending)) scaffold(extras, prof, roofColor);

  const meshes: MeshData[] = [];
  if (!soup.empty) meshes.push(soup.build());
  if (extras.vertexCount > 0) meshes.push(extras.build());
  return meshes.length === 1 ? meshes[0]! : mergeMeshes(meshes);
}

/** Where a blown-down tree snaps: just above its foot. */
function snapField(col: Column, seed: number): Field {
  return (ix, iz) => ({ h: col.base + 0.16 + rand(seed, 'snap', ix, iz) * 0.06, gx: 0.6, gz: -0.4, cx: (ix + 0.5) * RUIN.tile, cz: (iz + 0.5) * RUIN.tile });
}

function treeChunks(intact: MeshData, prof: Profile): Chunk[] {
  const col = [...prof.columns.values()][0]!;
  if (col.cause !== 'blast' || col.stage !== 3 || col.mending) return [];
  return debrisOf(breakPolys(polysOfMesh(intact), snapField(col, prof.s.seed), true).removed, prof);
}

function treeDamage(intact: MeshData, prof: Profile): MeshData {
  const { s } = prof;
  const seed = s.seed;
  const col = [...prof.columns.values()][0]!;
  const polys = polysOfMesh(intact);
  const C = {
    char: rgb(DAMAGE_COLORS.char),
    scorched: rgb(DAMAGE_COLORS.scorchedLeaf),
    dust: rgb(DAMAGE_COLORS.dust),
    scorch: rgb(DAMAGE_COLORS.scorch),
  };
  const soup = new Soup();
  const extras = new MeshBuilder({ ink: s.id });
  // The crown is everything but the trunk (and a planter's stone and earth).
  const leaf = (p: Poly): boolean => p.pattern !== PATTERN.bark && p.pattern !== PATTERN.stone && p.pattern !== PATTERN.dirt;
  const bark = polys.filter((p) => !leaf(p));
  const rk = (p: Poly, n: string): number => {
    const c = centroid(p);
    return rand(seed, n, Math.round(c[0] * 9), Math.round(c[1] * 9), Math.round(c[2] * 9));
  };
  let tb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of bark) {
    const b = bounds(p);
    tb = [Math.min(tb[0]!, b[0]), Math.min(tb[1]!, b[1]), Math.min(tb[2]!, b[2]), Math.max(tb[3]!, b[3]), Math.max(tb[4]!, b[4]), Math.max(tb[5]!, b[5])];
  }
  const trunkX = Number.isFinite(tb[0]!) ? (tb[0]! + tb[3]!) / 2 : col.x + 0.5;
  const trunkZ = Number.isFinite(tb[2]!) ? (tb[2]! + tb[5]!) / 2 : col.z + 0.5;
  const trunkR = Number.isFinite(tb[0]!) ? Math.min(0.08, Math.max(0.03, (tb[3]! - tb[0]!) / 4)) : 0.05;
  const stump = (h: number): void => {
    extras.setColor(C.char).setPattern(PATTERN.bark).setInk('stump');
    extras.at([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, trunkX, col.base, trunkZ, 1], () =>
      extras.lathe([[trunkR * 1.25, 0], [trunkR, h - 0.02], [trunkR * 0.8, h]], { segments: 8, capTop: true }),
    );
  };

  if (col.mending) {
    // Regrowing: the tree as it was, smaller, beside the old stump.
    const grow = 0.3 + 0.65 * col.progress;
    if (col.stage >= 2 && col.progress < 0.6) stump(0.16);
    const m = [grow, 0, 0, 0, 0, grow, 0, 0, 0, 0, grow, 0, trunkX * (1 - grow) + (col.stage >= 2 && col.progress < 0.6 ? 0.18 : 0), col.base * (1 - grow), trunkZ * (1 - grow), 1];
    for (const p of polys) {
      const q = clonePoly(p);
      transformPoly(q, m);
      soup.add(q);
    }
  } else if (col.cause === 'fire') {
    for (const p of polys) {
      if (leaf(p)) {
        if (col.stage === 1) tint(p, C.scorched, 0.5 + 0.2 * rk(p, 'scorch'));
        else if (col.stage === 2) {
          if (rk(p, 'burn') < 0.72) continue;
          tint(p, C.char, 0.55);
        } else continue;
        soup.add(p);
      } else if (col.stage < 3) {
        tint(p, C.char, col.stage === 1 ? 0.25 : 0.65);
        soup.add(p);
      }
    }
    if (col.stage >= 2) {
      // Bare black branches where the crown was.
      extras.setColor(C.char).setPattern(PATTERN.bark).setInk('branches');
      const topY = Number.isFinite(tb[4]!) ? tb[4]! : col.base + 0.4;
      if (col.stage === 2) {
        for (let i = 0; i < 4; i++) {
          const a = rand(seed, 'branch', i) * Math.PI * 2;
          const l = 0.18 + rand(seed, 'branch-l', i) * 0.14;
          beam(extras, [trunkX, topY - 0.06, trunkZ], [trunkX + Math.cos(a) * l, topY + 0.1 + rand(seed, 'branch-h', i) * 0.15, trunkZ + Math.sin(a) * l], 0.025, 0.025);
        }
      } else {
        stump(0.2);
        const g = prof.openGround(col.x, col.z, col.base);
        if (g !== null) scorchRing(extras, col, col.base, hash(seed, 'scorch'), C.scorch, col.mending ? col.progress : 0, groundUnder(prof, col.x, col.z));
      }
    }
  } else {
    // Blast.
    if (col.stage === 3) {
      const br = breakPolys(polys, snapField(col, seed), true);
      for (const p of br.kept) {
        tint(p, C.dust, 0.1);
        soup.add(p);
      }
      const settling = col.settling;
      if (!settling) {
        for (const ch of debrisOf(br.removed, prof)) {
          const m = restMatrix(ch);
          for (const p of ch.polys) {
            const q = clonePoly(p);
            transformPoly(q, m);
            soup.add(q);
          }
        }
      }
      stump(0.17);
    } else {
      const a = rand(seed, 'tear') * Math.PI * 2;
      const torn: Poly[] = [];
      for (const p of polys) {
        if (leaf(p)) {
          const c = centroid(p);
          const side = (c[0] - trunkX) * Math.cos(a) + (c[2] - trunkZ) * Math.sin(a);
          const gone = col.stage === 1 ? rk(p, 'shake') < 0.22 : side > -0.05 || rk(p, 'shake') < 0.3;
          if (gone) {
            torn.push(p);
            continue;
          }
        }
        tint(p, C.dust, 0.08);
        soup.add(p);
      }
      if (col.stage === 2) {
        // Clumps of the torn crown on the ground round the foot.
        for (let i = 0; i < Math.min(5, torn.length); i++) {
          const k = Math.floor(rand(seed, 'clump', i) * torn.length);
          const p = clonePoly(torn[k]!);
          const c = centroid(p);
          const ang = a + (rand(seed, 'clump-a', i) - 0.5) * 1.4;
          const r = 0.25 + rand(seed, 'clump-r', i) * 0.25;
          const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, trunkX + Math.cos(ang) * r - c[0], col.base + 0.05 - c[1], trunkZ + Math.sin(ang) * r - c[2], 1];
          transformPoly(p, m);
          soup.add(p);
        }
      }
    }
  }
  const meshes: MeshData[] = [];
  if (!soup.empty) meshes.push(soup.build());
  if (extras.vertexCount > 0) meshes.push(extras.build());
  return meshes.length === 0 ? intact : meshes.length === 1 ? meshes[0]! : mergeMeshes(meshes);
}

// ── on stilts over the water ─────────────────────────────────────────────

/**
 * Standing on stilts over the water: a pier or dock's deck itself, or anything built on one (a boathouse,
 * a house on piles, a shed on the pier). A blast knocks these over rather than heaping them up.
 */
export function afloat(prof: Profile): boolean {
  const { s, plan } = prof;
  if (s.kind === 'dock') return true;
  const low = Math.min(...s.cells.map((c) => keyY(c)));
  if (low < 1) return false;
  const base = s.cells.filter((c) => keyY(c) === low);
  return base.length > 0 && base.every((c) => plan.kinds.get(c - 4096) === 'dock');
}

/**
 * A dock this many cells or fewer (a jetty, a short pier) goes over in one piece; a bigger one (a quay, a
 * port) breaks where it was hit, cell by cell, its planks and slabs dropping into the water, and the rest of
 * it stays where it stands: nothing bigger than a few cells' worth ever leaves the ground.
 */
export const DOCK_WHOLE = 3;

/** Goes over in one piece when a blast is heavy enough: anything on stilts, and a dock only if it is small. */
export function topplesWhole(prof: Profile): boolean {
  return afloat(prof) && (prof.s.kind !== 'dock' || prof.s.cells.length <= DOCK_WHOLE);
}

/** How a structure over the water stands: knocked over (a stage-3 blast), leaning (a stage-2 one), or neither. */
function afloatPose(prof: Profile): { toppled: boolean; lean: number; mending: boolean; progress: number; clear: number; settling: boolean } {
  let stage = 0, mending = false, progress = 1, clear = 1, settling = false, blast = false;
  for (const col of prof.columns.values()) {
    if (col.cause === 'blast' && col.stage > 0) blast = true;
    stage = Math.max(stage, col.stage);
    if (col.mending) {
      mending = true;
      progress = Math.min(progress, col.progress);
      clear = Math.min(clear, col.phases.clear);
    }
    settling ||= col.settling;
  }
  const whole = topplesWhole(prof);
  const toppled = whole && blast && stage === 3;
  // A heavy hit short of knocking it over: a leg snapped, and it leans; straightened as it is mended.
  const lean = whole && blast && stage === 2 ? (prof.s.kind === 'dock' ? 0.07 : 0.16) * (mending ? 1 - progress : 1) : 0;
  return { toppled, lean, mending, progress, clear, settling };
}

/** The whole structure going over (or gone over), as one chunk. */
function toppleOf(intact: MeshData, prof: Profile): Chunk {
  const polys = polysOfMesh(intact);
  // Its windows go dark as it goes (no lamp stays lit in a house going over into the water).
  const hole = rgb(DAMAGE_COLORS.hole);
  for (const p of polys) {
    if (p.pattern !== PATTERN.glass) continue;
    p.pattern = PATTERN.none;
    tint(p, hole, 1);
  }
  let lo = Infinity;
  for (const p of polys) for (const v of p.v) lo = Math.min(lo, v[1]!);
  const deck = prof.s.kind === 'dock';
  // A deck goes down at one end; a building goes right over onto its side, half under.
  return afloatTopple(polys, prof, deck ? 0.42 : 1.3, Math.max(0, lo - WATER_Y) + (deck ? 0.12 : 0.22));
}

function afloatDamage(intact: MeshData, prof: Profile): MeshData {
  const a = afloatPose(prof);
  const hole = rgb(DAMAGE_COLORS.hole);
  const moved = (mesh: MeshData, m: readonly number[]): MeshData => {
    const soup = new Soup();
    for (const p of polysOfMesh(mesh)) {
      const q = clonePoly(p);
      transformPoly(q, m);
      // A wreck's windows are dark: no lamp is lit in a house lying in the water.
      if (q.pattern === PATTERN.glass) {
        q.pattern = PATTERN.none;
        tint(q, hole, 1);
      }
      soup.add(q);
    }
    return soup.empty ? mesh : soup.build();
  };
  if (a.toppled && !a.mending) {
    // In the air (the flight is drawing it): nothing here. Down: lying over in the water.
    if (a.settling) return mergeMeshes([]);
    const ch = toppleOf(intact, prof);
    return moved(intact, restMatrix(ch));
  }
  if (a.toppled && a.mending) {
    // Being rebuilt where it stood, as any building is; the wreck settles under the water as it is cleared.
    const ch = toppleOf(intact, prof);
    const m = restMatrix(ch);
    m[13] = m[13]! - 1.4 * a.clear;
    const meshes = [buildingDamage(intact, prof, false)];
    if (a.clear < 1) meshes.push(moved(intact, m));
    return mergeMeshes(meshes);
  }
  const now = prof.s.kind === 'dock' ? intact : buildingDamage(intact, prof);
  if (a.lean <= 0) return prof.s.kind === 'dock' ? buildingDamage(intact, prof) : now;
  // Leaning over its broken leg, a little down at that side.
  const ch = toppleOf(intact, prof);
  const m = chunkMatrix({ ...ch, topple: { pivot: ch.topple!.pivot, drop: 0 } }, -a.lean, 0, ch.to);
  return moved(prof.s.kind === 'dock' ? buildingDamage(intact, prof) : now, m);
}

/** The most elements (floats, ids) of intact mesh the cache holds: about 180 four-floor houses, 32 MB of the mostly 4-byte arrays. */
export const intactCache = { maxFloats: 8_000_000 };

function meshFloats(m: MeshData): number {
  let n = 0;
  for (const v of Object.values(m)) if (ArrayBuffer.isView(v)) n += (v as Float32Array).length;
  return n;
}

/** Wraps a generator registry so every structure is drawn with its damage. */
export function withDamage(reg: GeneratorRegistry): GeneratorRegistry & { intact: GeneratorRegistry; peek: (sid: number) => { hash: number; out: GenOutput } | null } {
  // A damaged structure's sound drawing, kept while only its ruin changes (a char or mend step).
  const cache = new Map<number, { key: number; style: number; parts: unknown; intact: GenOutput; floats: number; hash: number; out: GenOutput }>();
  let floats = 0;
  const drop = (id: number) => {
    floats -= cache.get(id)?.floats ?? 0;
    cache.delete(id);
  };
  return {
    ...reg,
    build: (s, plan, parts) => {
      if (!s.cells.some((c) => plan.world.blocks.get(c)?.ruin)) {
        drop(s.id);
        return reg.build(s, plan, parts);
      }
      const key = hashStructure(s, plan, true);
      const style = styleVersion();
      let e = cache.get(s.id);
      if (e && e.key === key && e.style === style && e.parts === parts) {
        if (e.hash === s.hash) return e.out;
      } else {
        const intact = reg.build(s, plan, parts);
        e = { key, style, parts, intact, floats: meshFloats(intact.mesh), hash: 0, out: intact };
      }
      e.out = damageOutput(e.intact, s, plan);
      e.hash = s.hash;
      drop(s.id);
      cache.set(s.id, e);
      floats += e.floats;
      // ponytail: FIFO by insertion (a refresh moves an entry to the back); a true LRU on hit is the upgrade if it ever thrashes.
      while (floats > intactCache.maxFloats && cache.size > 1) drop(cache.keys().next().value!);
      return e.out;
    },
    intact: reg,
    // The latest damaged drawing, without building one (null for a sound or never-drawn structure).
    peek: (sid) => {
      const e = cache.get(sid);
      return e ? { hash: e.hash, out: e.out } : null;
    },
  };
}
