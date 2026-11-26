// The view (Look, Stage 1): `createTownView` puts a town on a canvas as an
// ink-and-pencil drawing. The contract is ./api.ts; this file wires the
// pieces together:
//
//   pool.ts / poolmesh.ts   geometry: each 16 × 16 chunk of structures and
//                           layers is ONE vertex pool and one draw call;
//                           props, actors, spawned things and the ghost
//                           share one more.
//   slots.ts                movement: anything that moves has a slot (a
//                           matrix and four params in a float texture).
//                           Lifting a structure for its landing bounce only
//                           re-points its vertices at a slot.
//   shaders/surface.ts      the one material: stepped shading, pencil
//                           patterns, hatching; writes colour + glow and
//                           normal + ink id in a single pass (two render
//                           targets).
//   shaders/composite.ts    ink lines, dusk grade, halo, stars, paper grain.
//   camera.ts, grade.ts     pure maths, unit-tested.
//
// A frame is three or four draw passes and about a dozen draw calls,
// whatever the town holds: paper + chunks + the dynamic pool into the
// two-target buffer; (optionally) a half-resolution ink mask; the composite
// to the canvas; and, only when there is something to show, the overlay
// (light beams, the ghost preview).

import * as THREE from 'three';
import { allChunks, CELL_H, CHUNK, keyX, keyY, keyZ, SEA_Y, SIZE_X, SIZE_Z, type CellKey, type EdgeKey } from '@/core/grid';
import { identity, type Mat4Like, type Vec3 } from '@/core/mat4';
import { allStyles, styleVersion } from '@/core/style';
import type { PartOutput } from '@/gen/api';
import { createLayout, type Layout } from '@/gen/layout';
import { MeshBuilder, parseColor, type MeshData } from '@/gen/mesh';
import type { InstanceHandle, LifeStage, Signals, SpawnSpec } from '@/life/api';
import type { Actor, DressingPlan, Prop, ShapePlan, Structure, StructureId } from '@/resolve/plan';
import { seasonOf, weatherOf } from '@/life/season';
import { GRADE, LOOK } from '@/style/look';
import { PALETTE } from '@/style/palette';
import { TERRAIN } from '@/style/terrain';
import { SEASON_LOOK } from '@/style/season';
import type { CameraPose, Ghost, Ray, TownView, ViewOptions, ViewStats, EyePose } from './api';
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  clampPose,
  easePose,
  frameOf,
  panPose,
  pixelsPerUnit,
  project,
  rayAt,
  samePose,
  zoomPose,
  type CameraFrame,
} from './camera';
import { gradeAt } from './grade';
import { qualityLevels, type Quality } from './quality';
import { buildWithin, oldestFirst, REBUILD_BUDGET_MS, sameAnchors, sameKeys } from './rebuild-budget';
import { paperOf, seasonFrame, seasonGrade } from './season';
import { hazy } from './pool';
import { PoolMesh } from './poolmesh';
import { createPrecip } from './precip';
import { registriesFor, type Registries } from './registries';
import { compositeFragment, paperFragment, screenVertex, skyFragment } from './shaders/composite';
import { packOutputs, unpackFragment, usesDirect3D, type Properties } from './packed';
import { GROUND_MAP, heightFragment, heightVertex, shadeFragment } from './shaders/ground';
import { surfaceFragment, surfaceVertex } from './shaders/surface';
import { SLOT_AIR, SLOT_LIFTED, SLOT_WIDTH, SlotTable } from './slots';
import { buildTerrainColumns } from '@/gen/terrain/terrain.gen';
import { createGroundMotion } from './ground-motion';
import { itemKind, meshInAir } from './item-kind';
import { eyeFrame, type EyeFrame } from './eyecam';

/** While only props and actors move, the grounding picture is redrawn every this many frames. */
const GROUND_ITEMS = 4;

export type { CameraPose, Ghost, Ray, TownView, ViewOptions, ViewStats, EyePose } from './api';
export { overrideRegistries, registriesFor } from './registries';

/** The fixed light every surface is shaded from (the spike's). */
export const LIGHT: Vec3 = (() => {
  const v = [0.35, 1, 0.6] as const;
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len] as const;
})();

/**
 * Style modules that only the page reads, every frame (ink, grade, wind, the clock). A change to one
 * of these needs no geometry; a change to any other style value (a palette colour, a proportion a
 * generator reads) makes every cached mesh stale.
 */
const PAGE_STYLES = new Set(['look', 'grade', 'wind', 'time', 'season', 'weather', 'season-look']);
function geometryStyleKey(): string {
  return JSON.stringify(allStyles().filter((m) => !PAGE_STYLES.has(m.name)).map((m) => [m.name, m.values]));
}

/**
 * The coplanar tie-break (shaders/surface.ts): each ink id is drawn 0 to 23 of these nearer the eye,
 * in clip-space depth. One and a half steps of the 24-bit depth buffer (2.3e-5 units over the
 * camera's range): more than the rounding that makes two surfaces in one plane fight, so of two such
 * surfaces the same one wins every frame, unless their ids land on the same level (1 in 24). The
 * largest nudge, 5.3e-4 units, is less than the depth between a detail and the face it sits on for
 * every gap parts leave on purpose (0.004 and up at any pitch; 0.002 from 16 degrees up; the odd
 * 0.001, from 32 degrees up or when the two levels are close).
 */
const Z_STEP = 1.5 * (2 / 2 ** 24);
/** The wind texture covers the map plus this margin, at this many texels a side. */
const WIND_MARGIN = 8;
// Two columns a texel: a gust front's leading edge is about two columns, and coarser texels blurred it away.
const WIND_TEXELS = 32;
/** How far under the sea the sheet of paper lies (where the slab's shadow falls). */
const PAPER_Y = -3.2;

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function setSrgb(v: THREE.Vector3, hex: string): void {
  const [r, g, b] = parseColor(hex);
  v.set(r / 255, g / 255, b / 255);
}
function setLinear(v: THREE.Vector3, hex: string): void {
  const [r, g, b] = parseColor(hex);
  v.set(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}

interface DrawnStructure {
  hash: number;
  chunk: string;
  anchors: Record<string, Mat4Like>;
  /** The cells and edges it was drawn with: only a structure that kept them may wait for its rebuild. */
  cells: readonly CellKey[];
  edges: readonly EdgeKey[];
  /** 0 while baked; a slot while lifted. */
  slot: number;
  lifts: number;
  /** False once the structure has left the town (stale handles then do nothing). */
  alive: boolean;
}
interface DrawnLayer {
  hash: number;
  anchors: Record<string, Mat4Like>;
}
interface DrawnItem {
  hash: number;
  /** Its mesh is in a pool. */
  drawn: boolean;
  /** True for actors: drawn from the movers pool. */
  mover: boolean;
  slot: number;
  base: Mat4Like;
  handle: InstanceHandle;
}

/** True on phones: small screen and a coarse pointer. They bake the soft grounding shade smaller and get fewer raindrops. */
function looksLikePhone(): boolean {
  const g = globalThis as { matchMedia?: (q: string) => { matches: boolean }; screen?: { width: number; height: number } };
  const coarse = g.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(g.screen?.width ?? 4000, g.screen?.height ?? 4000) < 700;
  return coarse && small;
}

export function createTownView(canvas: HTMLCanvasElement, opts: ViewOptions = {}): TownView {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
  });
  // How sharp the page is drawn (./quality.ts). Given a pixel ratio or an ink, the view keeps to it;
  // otherwise it has levels from its sharpest down, and the app's governor picks among them by how fast
  // frames really come (phones used to be held at a pixel ratio of 2 with half-resolution ink, a guess
  // that looked pixelated on a 3x screen).
  const phone = looksLikePhone();
  const fixedQuality = opts.pixelRatio !== undefined || opts.ink === 'full' || opts.ink === 'half';
  const levels: Quality[] = fixedQuality
    ? (() => {
        const pr = opts.pixelRatio ?? Math.min(globalThis.devicePixelRatio ?? 1, 2);
        const half = opts.ink === 'half';
        // The drawing is made at 2 device pixels per CSS pixel at least (as the spike did) and averaged
        // down: that is what makes the colour edges under the ink smooth. Half-resolution ink skips it.
        return [{ pixelRatio: pr, superSample: half || pr >= 1.5 ? 1 : 2, halfInk: half } as Quality];
      })()
    : qualityLevels(globalThis.devicePixelRatio ?? 1);
  let level = 0;
  let pixelRatio = levels[0]!.pixelRatio;
  let superSample = levels[0]!.superSample;
  let halfInk = levels[0]!.halfInk;
  renderer.setPixelRatio(pixelRatio);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.info.autoReset = false;
  // A debug handle for measuring what the renderer holds (tools, browser tests): geometries, textures, programs.
  (globalThis as { __lcRenderer?: THREE.WebGLRenderer }).__lcRenderer = renderer;

  let width = Math.max(1, canvas.clientWidth || canvas.width || 1);
  let height = Math.max(1, canvas.clientHeight || canvas.height || 1);

  // ── render targets ───────────────────────────────────────────────────────
  // Where the browser draws through Direct3D the town goes into one packed target, split afterwards into
  // the two below (./packed.ts says why). `opts.packed` is for the tests.
  const packed = opts.packed ?? usesDirect3D(renderer.getContext());
  // Asked once, now: a question to the graphics card waits for whatever shaders are being built.
  const gpuName = ((): string => {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) ?? '');
  })();
  /** The two pictures the page is made from, the target the town is drawn into (the same one, unless packed), and its depth. */
  interface TownTarget {
    out: THREE.WebGLRenderTarget;
    draw: THREE.WebGLRenderTarget;
    depth: THREE.DepthTexture;
  }
  const townTarget = (w: number, h: number, depthType: THREE.TextureDataType): TownTarget => {
    const out = new THREE.WebGLRenderTarget(w, h, {
      count: 2,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: !packed,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    });
    const depth = new THREE.DepthTexture(w, h, depthType);
    out.textures[0]!.minFilter = out.textures[0]!.magFilter = THREE.LinearFilter; // averages the super-sampled colour down
    if (!packed) {
      out.depthTexture = depth;
      return { out, draw: out, depth };
    }
    const draw = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.UnsignedShortType,
      format: THREE.RGBAIntegerFormat,
      internalFormat: 'RGBA16UI',
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    });
    draw.depthTexture = depth;
    return { out, draw, depth };
  };
  const disposeTarget = (t: TownTarget): void => {
    t.depth.dispose();
    t.out.dispose();
    if (t.draw !== t.out) t.draw.dispose();
  };
  const town = townTarget(4, 4, THREE.UnsignedIntType);
  const sceneRT = town.out;
  const colorTex = sceneRT.textures[0]!;
  const idTex = sceneRT.textures[1]!;
  /** The town's shaders, writing whichever the town's target takes. */
  const townPass = (fragment: string): string => (packed ? packOutputs(fragment) : fragment);
  const townFragment = townPass(surfaceFragment);
  /** The half-resolution ink mask: made the first time a level uses it. */
  let inkRT: THREE.WebGLRenderTarget | null = null;
  const inkTarget = (): THREE.WebGLRenderTarget => {
    if (inkRT) return inkRT;
    inkRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
    compositeUniforms.tInk.value = inkRT.texture;
    return inkRT;
  };

  // Grounding: the town's heights from straight above, and the shade baked from them (shaders/ground.ts).
  // A soft shade: phones bake it smaller whatever their level.
  const groundSize = phone || halfInk ? 512 : 1024;
  const heightRT = new THREE.WebGLRenderTarget(groundSize, groundSize, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false });
  heightRT.depthTexture = new THREE.DepthTexture(groundSize, groundSize, THREE.UnsignedIntType);
  // The shade is soft, so it is baked at half the size: a quarter of the work each time it is redrawn.
  const shadeRT = new THREE.WebGLRenderTarget(groundSize / 2, groundSize / 2, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false, colorSpace: THREE.NoColorSpace });

  // ── data textures ────────────────────────────────────────────────────────
  const slots = new SlotTable();
  let slotGeneration = -1;
  let slotTex = new THREE.DataTexture(slots.data, SLOT_WIDTH, slots.rows, THREE.RGBAFormat, THREE.FloatType);
  const windData = new Uint8Array(WIND_TEXELS * WIND_TEXELS * 4);
  const windTex = new THREE.DataTexture(windData, WIND_TEXELS, WIND_TEXELS, THREE.RGBAFormat, THREE.UnsignedByteType);
  windTex.minFilter = windTex.magFilter = THREE.LinearFilter;
  windTex.wrapS = windTex.wrapT = THREE.ClampToEdgeWrapping;
  // The pen's noise (shaders/composite.ts): a tiling cube of fixed random values, filtered.
  const noiseData = new Uint8Array(32 * 32 * 32 * 4);
  for (let i = 0, h = 0x2545f491; i < noiseData.length; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    noiseData[i] = (h ^ (h >>> 15)) & 255;
  }
  const noiseTex = new THREE.Data3DTexture(noiseData, 32, 32, 32);
  noiseTex.format = THREE.RGBAFormat;
  noiseTex.minFilter = noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.wrapS = noiseTex.wrapT = noiseTex.wrapR = THREE.RepeatWrapping;
  noiseTex.unpackAlignment = 1;
  noiseTex.needsUpdate = true;

  // ── materials ────────────────────────────────────────────────────────────
  const v3 = (): { value: THREE.Vector3 } => ({ value: new THREE.Vector3() });
  const surfaceUniforms = {
    uSlots: { value: slotTex as THREE.Texture },
    uWind: { value: windTex as THREE.Texture },
    uTime: { value: 0 },
    uSway: { value: 0 },
    uZStep: { value: Z_STEP },
    uZOrigin: v3(),
    uZAxis: v3(),
    uLight: { value: new THREE.Vector3(...LIGHT) },
    uPx: { value: 1 },
    uCss: { value: 1 },
    uCamRight: v3(),
    uCamUp: v3(),
    uPencil: { value: 1 },
    uHatch: { value: 0 },
    uHatchSpacing: { value: 5 },
    uGlow: { value: 0 },
    uInk: v3(),
    uSand: v3(),
    uDirt: v3(),
    uSea: v3(),
    uSeaDeep: v3(),
    uShallow: v3(),
    uFoam: v3(),
    uSeaKeep: { value: new THREE.Vector3(1, 1, 1) },
    uSeaY: { value: SEA_Y },
    uSlab: { value: TERRAIN.slabRadius },
    uWhite: v3(),
    uTimber: v3(),
    uLamp: v3(),
    uFlowerA: v3(),
    uFlowerB: v3(),
    uFlowerC: v3(),
    tHeight: { value: heightRT.depthTexture as THREE.Texture },
    tShade: { value: shadeRT.texture as THREE.Texture },
    uMap: { value: new THREE.Vector4(GROUND_MAP.x0, GROUND_MAP.z0, 1 / GROUND_MAP.size, GROUND_MAP.top) },
    uMapRange: { value: GROUND_MAP.range },
    uGround: { value: 0 },
    uSlope: { value: 1.25 },
    uCast: { value: 0.5 },
    // Seasons and weather (shaders/season.ts, ./season.ts)
    uSeasonOn: { value: 0 },
    uBulbCss: { value: 1 },
    uSeason: { value: new THREE.Vector4(0, 1, 0, 0) },
    uTrees: { value: new THREE.Vector4() },
    uSnow: { value: new THREE.Vector4() },
    uWet: { value: new THREE.Vector4() },
    uLeafRef: v3(),
    uGrassRef: v3(),
    uSpringGreen: v3(),
    uSpringMix: { value: 0 },
    uAutumnGrass: v3(),
    uAutumnGrassMix: { value: 0 },
    uLeafA: v3(),
    uLeafB: v3(),
    uLeafC: v3(),
    uLeafD: v3(),
    uFrost: v3(),
    uSnowCol: v3(),
    uSnowShade: v3(),
    uSnowEdge: { value: 0 },
    uWetTint: v3(),
    uIce: v3(),
    uTwig: v3(),
    uBlossomA: v3(),
    uBlossomB: v3(),
    // fly mode only (the PERSP variants)
    uFocal: { value: 1 },
    uClip: { value: new THREE.Vector2(0.01, 100) },
    // overlay only
    tDepth: { value: town.depth as THREE.Texture },
    uCanvas: { value: new THREE.Vector2(1, 1) },
    uTint: v3(),
    uLift: v3(),
    uStar: v3(),
    uMagic: v3(),
    uRed: v3(),
  };
  const surfaceMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: surfaceVertex,
    fragmentShader: townFragment,
    uniforms: surfaceUniforms,
  });
  // Seasons: while broadleaves are losing or have lost their leaves, the page is drawn with this one
  // instead, whose crowns dissolve (shaders/season.ts). The only variant of the shader with a discard,
  // so the rest of the year pays nothing for it.
  const bareMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { BARE: 1 },
    vertexShader: surfaceVertex,
    fragmentShader: townFragment,
    uniforms: surfaceUniforms,
  });
  // The movers (actors and spawned things) are drawn the same way, except that the edge of the map is a
  // wall they are cut off at (a ship sailing in or out); a ship crossing it also has its cut face filled
  // (CAP: its back faces, flat and dark). Nothing inside the map is touched by either.
  const moverMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { EDGECUT: 1 },
    vertexShader: surfaceVertex,
    fragmentShader: townFragment,
    uniforms: surfaceUniforms,
  });
  const capMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { EDGECUT: 1, CAP: 1 },
    vertexShader: surfaceVertex,
    fragmentShader: townFragment,
    uniforms: surfaceUniforms,
    side: THREE.BackSide,
  });
  let bareOn = false;
  let groundBare = 0;
  const overlayMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { OVERLAY: 1 },
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    uniforms: surfaceUniforms,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: true,
    depthWrite: true,
  });
  const heightMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: heightVertex,
    fragmentShader: heightFragment,
    uniforms: { uSlots: surfaceUniforms.uSlots, uMap: surfaceUniforms.uMap, uMapRange: surfaceUniforms.uMapRange, uBare: { value: 0 } },
    side: THREE.DoubleSide,
    colorWrite: false,
  });
  const toLight = Math.hypot(LIGHT[0], LIGHT[2]);
  const shadeMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: screenVertex,
    fragmentShader: shadeFragment,
    uniforms: {
      tHeight: surfaceUniforms.tHeight,
      uMap: surfaceUniforms.uMap,
      uMapRange: surfaceUniforms.uMapRange,
      uToLight: { value: new THREE.Vector2(LIGHT[0] / toLight, LIGHT[2] / toLight) },
    },
    depthTest: false,
    depthWrite: false,
  });
  // The ghost preview is drawn into a buffer of its own, then outlined in pencil over the page.
  const ghostMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { GHOST: 1 },
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    uniforms: surfaceUniforms,
    blending: THREE.NoBlending,
  });
  const paperUniforms = {
    uPaper: v3(),
    uInk: v3(),
    uEye: v3(),
    uRight: v3(),
    uUp: v3(),
    uForward: v3(),
    uSlab: { value: new THREE.Vector4(SIZE_X / 2, SIZE_Z / 2, SIZE_X / 2, SIZE_Z / 2) },
    uShadowY: { value: PAPER_Y },
    uShadow: { value: 0 },
  };
  const paperMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: screenVertex,
    fragmentShader: townPass(paperFragment),
    uniforms: paperUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const compositeUniforms = {
    tColor: { value: colorTex as THREE.Texture },
    tId: { value: idTex as THREE.Texture },
    tDepth: { value: town.depth as THREE.Texture },
    tNoise: { value: noiseTex as THREE.Texture },
    tInk: { value: null as THREE.Texture | null },
    uOut: { value: new THREE.Vector2(1, 1) },
    uPR: { value: 1 },
    uOrigin: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uEye: v3(),
    uRight: v3(),
    uUp: v3(),
    uForward: v3(),
    uNear: { value: CAMERA_NEAR },
    uCss: { value: 1 },
    uThick: { value: 1.5 },
    uInner: { value: 1 },
    uDepthRange: { value: CAMERA_FAR - CAMERA_NEAR },
    uDepthT: { value: 0.07 },
    uWeights: v3(),
    uWobble: { value: 1 },
    uBoil: { value: 0 },
    uPaperAmt: { value: 1 },
    uInk: v3(),
    uTint: v3(),
    uLift: v3(),
    uSat: { value: 1 },
    uShadeTint: v3(),
    uLightView: v3(),
    uChroma: { value: 1 },
    uContrast: { value: 1 },
    uLampWarm: v3(),
    uStar: v3(),
    uGlow: { value: 0 },
    uStars: { value: 0 },
    uHalo: { value: 0 },
    uFestive: { value: 0 },
    uFog: { value: 0 },
    uFogCol: v3(),
    uFogY: { value: SEA_Y },
    // fly mode only (the PERSP variants)
    uFocal: { value: 1 },
    uInkW: { value: new THREE.Vector4() },
    uInkPx: { value: new THREE.Vector2() },
    uMoon: { value: new THREE.Vector3(0.45, 0.42, -0.79).normalize() },
    uFlat: { value: 0 },
  };
  const post = (defines: Record<string, number>): THREE.RawShaderMaterial =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      defines,
      vertexShader: screenVertex,
      fragmentShader: compositeFragment,
      uniforms: compositeUniforms,
      depthTest: false,
      depthWrite: false,
    });
  const compositeDefines = (): Record<string, number> => (halfInk ? { INK_TEX: 1 } : superSample > 1 ? { FINE_DEPTH: 1 } : {});
  const compositeMaterial = post(compositeDefines());
  // The half-resolution ink mask shares the uniforms but has its own target size.
  const inkUniforms = { ...compositeUniforms, uOut: { value: new THREE.Vector2(1, 1) }, uPR: { value: 1 } };
  const inkMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { INK_ONLY: 1 },
    vertexShader: screenVertex,
    fragmentShader: compositeFragment,
    uniforms: inkUniforms,
    depthTest: false,
    depthWrite: false,
  });

  // Seasons: falling rain and snow, drawn over the finished page (./precip.ts).
  const precip = createPrecip(
    { tHeight: surfaceUniforms.tHeight, tDepth: surfaceUniforms.tDepth, uMap: surfaceUniforms.uMap, uMapRange: surfaceUniforms.uMapRange, uZOrigin: surfaceUniforms.uZOrigin, uZAxis: surfaceUniforms.uZAxis, uCanvas: surfaceUniforms.uCanvas, uFocal: surfaceUniforms.uFocal, uClip: surfaceUniforms.uClip },
    phone,
    pixelRatio,
  );

  let ghostRT: THREE.WebGLRenderTarget | null = null;
  const ghostUniforms = { ...compositeUniforms, tColor: { value: null as THREE.Texture | null }, tId: { value: null as THREE.Texture | null }, tDepth: { value: null as THREE.Texture | null } };
  const ghostComposite = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: { GHOST: 1 },
    vertexShader: screenVertex,
    fragmentShader: compositeFragment,
    uniforms: ghostUniforms,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  /** Made the first time a ghost is shown (hover is a desktop thing; phones never pay for it). */
  const ghostTarget = (): THREE.WebGLRenderTarget => {
    const w = Math.max(1, Math.round(width * pixelRatio)), h = Math.max(1, Math.round(height * pixelRatio));
    if (!ghostRT) {
      ghostRT = new THREE.WebGLRenderTarget(w, h, { count: 2, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true, stencilBuffer: false, colorSpace: THREE.NoColorSpace });
      ghostRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      ghostRT.textures[0]!.minFilter = ghostRT.textures[0]!.magFilter = THREE.LinearFilter;
      ghostUniforms.tColor.value = ghostRT.textures[0]!;
      ghostUniforms.tId.value = ghostRT.textures[1]!;
      ghostUniforms.tDepth.value = ghostRT.depthTexture;
    } else if (ghostRT.width !== w || ghostRT.height !== h) ghostRT.setSize(w, h);
    return ghostRT;
  };

  // ── fly mode (design section 7): the same materials, drawn for a perspective eye ──
  // Made the first time someone flies; the builder never compiles them. Each is its builder twin with
  // PERSP defined, so the builder's own shaders are not changed by a single token.
  const skyUniforms = {
    uPaper: paperUniforms.uPaper,
    uInk: paperUniforms.uInk,
    uSeaWash: v3(),
    uEye: v3(),
    uRight: v3(),
    uUp: v3(),
    uForward: v3(),
    uSlab: paperUniforms.uSlab,
    uSeaY: { value: SEA_Y },
    uPxAngle: { value: 0.001 },
    uFlat: { value: 0 },
    uShadowY: paperUniforms.uShadowY,
    uShadow: paperUniforms.uShadow,
  };
  type Persp = {
    surface: THREE.RawShaderMaterial;
    bare: THREE.RawShaderMaterial;
    movers: THREE.RawShaderMaterial;
    cap: THREE.RawShaderMaterial;
    overlay: THREE.RawShaderMaterial;
    sky: THREE.RawShaderMaterial;
    composite: THREE.RawShaderMaterial;
    ink: THREE.RawShaderMaterial | null;
  };
  let persp: Persp | null = null;
  // Fly mode draws into a target of its own with a floating-point depth buffer, reversed (1 at the
  // near plane, 0 at the far one) through EXT_clip_control: depth is then as fine, relatively, at arm's
  // length as across the island, and the early depth test still works (writing depth from the fragment
  // shader, the fallback where the extension is missing, made a flying frame cost twice a builder's).
  const revz = renderer.extensions.has('EXT_clip_control');
  /** The fly mode's coplanar tie-break: float steps nearer per level of the ink id, relative. */
  const EYE_Z_STEP = revz ? 3 * 2 ** -23 : Z_STEP;
  let eye: TownTarget | null = null;
  const eyeTarget = (): TownTarget => (eye ??= townTarget(sceneRT.width, sceneRT.height, revz ? THREE.FloatType : THREE.UnsignedIntType));
  const perspMaterials = (): Persp => {
    if (persp) return persp;
    const twin = (m: THREE.RawShaderMaterial, uniforms?: Record<string, THREE.IUniform>, more: Record<string, number> = {}): THREE.RawShaderMaterial => {
      const c = m.clone();
      c.uniforms = uniforms ?? m.uniforms;
      c.defines = { ...m.defines, PERSP: 1, ...(revz ? { REVZ: 1 } : {}), ...more };
      return c;
    };
    // Every material that draws into the scene's depth buffer has a twin here (the movers' and the
    // ship caps' keep their EDGECUT; people and birds also dissolve at arm's length, NEAR_FADE), and
    // the rain and snow have theirs in precip.ts.
    persp = {
      surface: twin(surfaceMaterial),
      bare: twin(bareMaterial),
      movers: twin(moverMaterial, undefined, { NEAR_FADE: 1 }),
      cap: twin(capMaterial, undefined, { NEAR_FADE: 1 }),
      overlay: twin(overlayMaterial),
      sky: new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: screenVertex, fragmentShader: townPass(skyFragment), uniforms: skyUniforms, depthTest: false, depthWrite: false }),
      composite: twin(compositeMaterial),
      ink: twin(inkMaterial, inkUniforms),
    };
    return persp;
  };
  let eyePose: EyePose | null = null;
  let eyeReady: Promise<void> | null = null;
  let ghostPrepared = false;
  let lens: EyeFrame | null = null;
  /** Which set of materials the meshes wear now. */
  let wearing: 'orbit' | 'fly' = 'orbit';
  const perspCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  perspCamera.matrixAutoUpdate = false;

  // ── scenes ───────────────────────────────────────────────────────────────
  const screenGeometry = new THREE.BufferGeometry();
  screenGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const screenMesh = (material: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(screenGeometry, material);
    m.frustumCulled = false;
    return m;
  };
  const scene = new THREE.Scene();
  const overlayScene = new THREE.Scene();
  const paperMesh = screenMesh(paperMaterial);
  paperMesh.renderOrder = -1;
  scene.add(paperMesh);
  const postScene = new THREE.Scene();
  const postMesh = screenMesh(compositeMaterial);
  postScene.add(postMesh);
  const inkMesh = screenMesh(inkMaterial);
  const inkScene = new THREE.Scene().add(inkMesh);
  const shadeScene = new THREE.Scene().add(screenMesh(shadeMaterial));
  // Packed only: the pass that splits the town's one target into the colour and the ink ids.
  const unpackUniforms = { tPacked: { value: town.draw.texture as THREE.Texture } };
  const unpackMaterial = packed ? new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: screenVertex, fragmentShader: unpackFragment, uniforms: unpackUniforms, depthTest: false, depthWrite: false }) : null;
  const unpackScene = unpackMaterial ? new THREE.Scene().add(screenMesh(unpackMaterial)) : null;
  // The height pass ignores this camera's matrices (its shader maps the map square itself), but
  // Three.js still culls against it, so it looks straight down at the whole map from above.
  const mapCamera = new THREE.OrthographicCamera(-40, 40, 40, -40, 1, 120);
  mapCamera.position.set(SIZE_X / 2, 80, SIZE_Z / 2);
  mapCamera.up.set(0, 0, -1);
  mapCamera.lookAt(SIZE_X / 2, 0, SIZE_Z / 2);
  mapCamera.updateMatrixWorld(true);
  let groundStale = true;
  let groundAge = 0;
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
  camera.matrixAutoUpdate = false;

  // ── pools ────────────────────────────────────────────────────────────────
  const chunkPools = new Map<string, PoolMesh>();
  const addPool = (cull: boolean, material: THREE.Material = surfaceMaterial): PoolMesh => {
    const p = new PoolMesh(material, overlayMaterial, cull);
    scene.add(p.mesh);
    overlayScene.add(p.overlay);
    return p;
  };
  for (const c of allChunks()) chunkPools.set(`${c.cx}:${c.cz}`, addPool(true));
  const dynamic = addPool(false);
  // Actors and spawned things (people, birds, boats, smoke) move every frame. They live in a pool of
  // their own that is left out of the grounding picture, so their moving never makes it redraw.
  const movers = addPool(false, moverMaterial);
  // Of those, whatever holds smoke or a beam of light lives apart: the overlay pass, which draws only
  // smoke and beams, then runs over it and not over every person and boat in town as well.
  const haze = addPool(false, moverMaterial);
  const moverPools = [movers, haze];
  const moverCaps = moverPools.map((p) => {
    const caps = p.addView(capMaterial);
    caps.renderOrder = 1;
    scene.add(caps);
    return caps;
  });
  const putMover = (key: string, hash: number, mesh: MeshData, slot: number): void => {
    const [to, other] = hazy(mesh) ? [haze, movers] : [movers, haze];
    other.pool.remove(key);
    to.pool.put(key, hash, mesh, slot);
  };
  const removeMover = (key: string): void => {
    for (const p of moverPools) p.pool.remove(key);
  };
  const removeItem = (id: string, it: DrawnItem): void => {
    if (it.mover) removeMover(`i:${id}`);
    else dynamic.pool.remove(`i:${id}`);
  };
  const ghostScene = new THREE.Scene().add(dynamic.addView(ghostMaterial));
  const ghostPostScene = new THREE.Scene().add(screenMesh(ghostComposite));
  const allPools = [...chunkPools.values(), dynamic, ...moverPools];
  // The debug handle on the moving things' pool (tools): vertices drawn, and how many of them are retired.
  (globalThis as { __lcMovers?: { count: number; garbage: number } }).__lcMovers = movers.pool;
  const chunkKeyOf = (x: number, z: number): string => `${Math.floor(x / CHUNK)}:${Math.floor(z / CHUNK)}`;
  // Shaping the land: raised and dug columns bounce and sink for a moment (ground-motion.ts).
  const groundMotion = createGroundMotion(dynamic.pool, slots, (cols, plan) => buildTerrainColumns(cols, plan).build());

  // ── town state ───────────────────────────────────────────────────────────
  const structures = new Map<StructureId, DrawnStructure>();
  const layers = new Map<string, DrawnLayer>();
  const items = new Map<string, DrawnItem>();
  const partOutputs = new Map<string, PartOutput>();
  const spawnOutputs = new Map<string, PartOutput>();
  let shape: ShapePlan | null = null;
  let dressing: DressingPlan | null = null;
  let layout: Layout | null = null;
  const anchorFrames = new Map<string, Mat4Like>();
  let registries: Registries | null = null;
  let seenStyle = styleVersion();
  let seenStyleKey = geometryStyleKey();
  let rebuildMs = 0;
  /** Where the current rebuild's time goes (ViewStats.rebuild). */
  const spent = { generators: 0, layers: 0, parts: 0, view: 0, structures: 0, vertices: 0 };
  let lastSpent = { ...spent };
  const beginRebuild = (): number => {
    spent.generators = spent.layers = spent.parts = spent.structures = spent.vertices = 0;
    return performance.now();
  };
  const endRebuild = (t0: number): void => {
    rebuildMs = performance.now() - t0;
    spent.view = Math.max(0, rebuildMs - spent.generators - spent.layers - spent.parts);
    lastSpent = { ...spent };
  };
  /** Structures drawn at an old hash, oldest first, rebuilt a few a frame by render() (setTown's `spread`). */
  let pending = new Set<StructureId>();
  /** A setTown or setDressing ran since the last frame: that frame does no deferred rebuilding. */
  let busy = false;
  /**
   * Items not drawn yet: an item's mesh is made when it is first seen, not when it is planned. The
   * festival's lights wait a year for the festival and the plan's own people are never seen (life draws
   * its own): together a fifth of a town's vertices, in every pass of every frame.
   */
  const unseen = new Map<string, { item: Prop | Actor; span: number }>();
  let spawnCounter = 0;
  let ghostKeys: string[] = [];
  let ghostSlots: number[] = [];

  // ── camera ───────────────────────────────────────────────────────────────
  const aspect = (): number => width / height;
  let goal: CameraPose = clampPose({ yaw: 45, pitch: 35, zoom: 1.6, target: [SIZE_X / 2, 1, SIZE_Z / 2] }, aspect());
  let shown: CameraPose = goal;
  let frame: CameraFrame = frameOf(shown, width, height);
  let lastSeconds: number | null = null;

  const applyCamera = (): void => {
    frame = frameOf(shown, width, height);
    camera.left = -frame.halfW;
    camera.right = frame.halfW;
    camera.top = frame.halfH;
    camera.bottom = -frame.halfH;
    camera.updateProjectionMatrix();
    const { right: r, up: u, forward: f, eye: e } = frame;
    // Camera looks down its own −Z: the columns are right, up, back.
    camera.matrix.set(r[0], u[0], -f[0], e[0], r[1], u[1], -f[1], e[1], r[2], u[2], -f[2], e[2], 0, 0, 0, 1);
    camera.matrixWorldNeedsUpdate = true;
    camera.updateMatrixWorld(true);
  };

  const applyEyeCamera = (): void => {
    if (!eyePose) {
      lens = null;
      return;
    }
    const f = (lens = eyeFrame(eyePose, width, height));
    perspCamera.fov = (Math.atan(f.tanY) * 2 * 180) / Math.PI;
    perspCamera.aspect = width / height;
    perspCamera.near = f.near;
    perspCamera.far = f.far;
    perspCamera.updateProjectionMatrix();
    const { right: r, up: u, forward: fw, eye: e } = f;
    perspCamera.matrix.set(r[0], u[0], -fw[0], e[0], r[1], u[1], -fw[1], e[1], r[2], u[2], -fw[2], e[2], 0, 0, 0, 1);
    perspCamera.matrixWorldNeedsUpdate = true;
    perspCamera.updateMatrixWorld(true);
  };
  /**
   * Dresses every mesh in the orbit camera's materials or in their fly-mode twins, and the town's
   * own pools in the bare-tree variant while broadleaves are losing their leaves (Seasons).
   */
  const dress = (): void => {
    const m = wearing === 'fly' ? perspMaterials() : null;
    for (const p of allPools) {
      p.mesh.material = p === movers || p === haze ? (m?.movers ?? moverMaterial) : bareOn ? (m?.bare ?? bareMaterial) : (m?.surface ?? surfaceMaterial);
      p.overlay.material = m?.overlay ?? overlayMaterial;
    }
    for (const c of moverCaps) c.material = m?.cap ?? capMaterial;
    paperMesh.material = m?.sky ?? paperMaterial;
    postMesh.material = m?.composite ?? compositeMaterial;
    inkMesh.material = m?.ink ?? inkMaterial;
    precip.perspective(m ? { PERSP: 1, ...(revz ? { REVZ: 1 } : {}) } : null);
  };
  const wear = (mode: 'orbit' | 'fly'): void => {
    if (wearing === mode) return;
    wearing = mode;
    dress();
    const rt = mode === 'fly' ? eyeTarget() : town;
    compositeUniforms.tColor.value = rt.out.textures[0]!;
    compositeUniforms.tId.value = rt.out.textures[1]!;
    compositeUniforms.tDepth.value = rt.depth;
    surfaceUniforms.tDepth.value = rt.depth;
  };

  const resizeTargets = (): void => {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    // (1.5 times is not a whole number of pixels on every size.)
    const sw = Math.max(1, Math.round(w * superSample)), sh = Math.max(1, Math.round(h * superSample));
    for (const t of eye ? [town, eye] : [town]) {
      t.out.setSize(sw, sh);
      if (t.draw !== t.out) t.draw.setSize(sw, sh);
    }
    if (halfInk) inkTarget().setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  };
  /** Changes how sharp the page is drawn: the targets are resized, the composite recompiled if it must be. */
  const applyQuality = (q: Quality): void => {
    const shader = q.halfInk !== halfInk || q.superSample > 1 !== superSample > 1;
    pixelRatio = q.pixelRatio;
    superSample = q.superSample;
    halfInk = q.halfInk;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    resizeTargets();
    if (shader) {
      compositeMaterial.defines = compositeDefines();
      compositeMaterial.needsUpdate = true;
      if (persp) {
        persp.composite.defines = { ...compositeMaterial.defines, PERSP: 1, ...(revz ? { REVZ: 1 } : {}) };
        persp.composite.needsUpdate = true;
      }
    }
  };

  // ── building geometry ────────────────────────────────────────────────────
  const dropAll = (): void => {
    groundMotion.clear();
    for (const p of chunkPools.values()) p.pool.clear();
    for (const d of structures.values()) {
      d.alive = false;
      slots.release(d.slot);
    }
    structures.clear();
    layers.clear();
    partOutputs.clear();
    spawnOutputs.clear();
    for (const [id, it] of items) {
      removeItem(id, it);
      slots.release(it.slot);
    }
    items.clear();
    unseen.clear();
    anchorFrames.clear();
    layout = null;
  };

  /**
   * Marks every cached mesh stale without forgetting what is drawn: structures keep their lifts and
   * props keep their slots and handles, so life carries on across a style change.
   */
  const invalidate = (): void => {
    for (const d of structures.values()) d.hash = NaN;
    for (const d of layers.values()) d.hash = NaN;
    for (const it of items.values()) it.hash = NaN;
    partOutputs.clear();
    spawnOutputs.clear();
  };
  /** True if a style value that geometry depends on changed since the meshes were built. */
  const styleChanged = (): boolean => {
    if (styleVersion() === seenStyle) return false;
    seenStyle = styleVersion();
    const key = geometryStyleKey();
    if (key === seenStyleKey) return false;
    seenStyleKey = key;
    return true;
  };

  const structureChunk = (s: { cells: readonly number[]; edges: readonly number[] }): string => {
    const c = s.cells[0] ?? s.edges[0]! >> 1;
    return chunkKeyOf(keyX(c), keyZ(c));
  };

  /** Draws a structure; true if any of its anchor frames moved (or it is new). */
  const buildStructure = (s: Structure, next: ShapePlan): boolean => {
    const { generators, parts } = registries!;
    const old = structures.get(s.id);
    const t = performance.now();
    const out = generators.build(s, next, parts);
    spent.generators += performance.now() - t;
    spent.structures++;
    spent.vertices += out.mesh.position.length / 3;
    const chunk = structureChunk(s);
    if (old && old.chunk !== chunk) chunkPools.get(old.chunk)!.pool.remove(`s:${s.id}`);
    chunkPools.get(chunk)!.pool.put(`s:${s.id}`, s.hash, out.mesh, old?.slot ?? 0);
    const moved = !old || !sameAnchors(old.anchors, out.anchors);
    setAnchors(old?.anchors, out.anchors);
    if (old) {
      old.hash = s.hash;
      old.chunk = chunk;
      old.anchors = out.anchors;
      old.cells = s.cells;
      old.edges = s.edges;
    } else {
      structures.set(s.id, { hash: s.hash, chunk, anchors: out.anchors, cells: s.cells, edges: s.edges, slot: 0, lifts: 0, alive: true });
    }
    return moved;
  };

  /** `budget`: a spread sync may build some of its queue now (false once this frame has rebuilt). */
  const syncShape = (next: ShapePlan, spread: boolean | 'waiting' = false, budget = true): void => {
    const reg = registriesFor(next);
    if (!registries || reg.generators !== registries.generators || reg.parts !== registries.parts) {
      // Other generators draw this town: nothing cached applies.
      dropAll();
      registries = reg;
    }
    // styleVersion() is part of every cache key (CONTRACTS section 14): a changed style value redraws,
    // all of it at once.
    if (styleChanged()) {
      invalidate();
      spread = false;
    }
    const { generators, parts } = reg;
    for (const [id, d] of structures) {
      if (next.structures.has(id)) continue;
      chunkPools.get(d.chunk)!.pool.remove(`s:${id}`);
      d.alive = false;
      slots.release(d.slot);
      setAnchors(d.anchors, {});
      structures.delete(id);
    }
    const changed = new Map<StructureId, Structure>();
    for (const s of next.structures.values()) {
      const old = structures.get(s.id);
      if (old && old.hash === s.hash) continue;
      // Only what stayed put may wait: a building the land carried down must not float over the crater.
      // The player's own edit ('waiting') leaves waiting only what was already.
      const may = spread === true || (spread === 'waiting' && pending.has(s.id));
      if (may && old && sameKeys(old.cells, s.cells) && sameKeys(old.edges, s.edges)) changed.set(s.id, s);
      else buildStructure(s, next);
    }
    // Spread (mischief): oldest first, and what does not fit in the budget keeps its old drawing;
    // render() gets to it.
    const queue = oldestFirst(pending, [...changed.keys()]);
    pending = new Set(spread === true && budget ? buildWithin(queue, (id) => buildStructure(changed.get(id)!, next), REBUILD_BUDGET_MS) : queue);
    for (const layer of generators.layers()) {
      for (const chunk of allChunks()) {
        const k = `${chunk.cx}:${chunk.cz}`;
        const id = `l:${layer.layer}:${k}`;
        const t = performance.now();
        const hash = layer.hash(chunk, next);
        const old = layers.get(id);
        const out = old && old.hash === hash ? null : layer.build(chunk, next, parts);
        spent.layers += performance.now() - t;
        if (!out) continue;
        spent.vertices += out.mesh.position.length / 3;
        chunkPools.get(k)!.pool.put(id, hash, out.mesh, 0);
        setAnchors(old?.anchors, out.anchors);
        layers.set(id, { hash, anchors: out.anchors });
      }
    }
  };

  const propOutput = (item: Prop | Actor, category: 'prop' | 'actor', span: number): PartOutput => {
    const k = `${category}:${item.id}:${item.hash}:${span.toFixed(3)}`;
    let out = partOutputs.get(k);
    if (!out) {
      const env = { plan: shape!, span };
      const t = performance.now();
      out = category === 'prop' ? registries!.parts.prop(item as Prop, env) : registries!.parts.actor(item as Actor, env);
      spent.parts += performance.now() - t;
      partOutputs.set(k, out);
    }
    return out;
  };

  /**
   * Where every socket, prop and actor is. Built only when someone asks (life looking up a socket,
   * or dressing arriving): an edit by itself does not pay for it. The socket frames the generators
   * returned are kept in one standing map (`anchorFrames`) that changes only with what was rebuilt.
   */
  const rebuildLayout = (): void => {
    layout = null;
  };
  const getLayout = (): Layout | null => {
    if (!layout && shape) layout = createLayout({ shape, dressing, anchors: anchorFrames, propOutput: (p, span) => propOutput(p, 'prop', span) });
    return layout;
  };
  const setAnchors = (old: Record<string, Mat4Like> | undefined, next: Record<string, Mat4Like>): void => {
    if (old) for (const id in old) anchorFrames.delete(id);
    for (const id in next) anchorFrames.set(id, next[id]!);
  };

  /** Slots crossing the edge of the map with a cut face to fill (params.d < −1.5): the cap pass runs only while there are any. */
  const capSlots = new Set<number>();
  const makeHandle = (slot: () => number, base: () => Mat4Like, release: () => void): InstanceHandle => ({
    get base() {
      return base();
    },
    setMatrix(m) {
      const s = slot();
      if (s > 0) slots.setMatrix(s, m);
    },
    setVisible(v) {
      const s = slot();
      if (s > 0) slots.setVisible(s, v);
    },
    setParams(a, b, c, d) {
      const s = slot();
      if (s > 0) slots.setParams(s, a, b, c, d);
      if (s > 0 && d !== undefined && d < -1.5) capSlots.add(s);
      else capSlots.delete(s);
    },
    release() {
      capSlots.delete(slot());
      release();
    },
  });

  // An item's handle. Made out here and not inside syncDressing: a function made in there keeps what
  // syncDressing could see alive for as long as the item lives, which is that edit's dressing and its
  // layout (and through the layout the whole plan): about a megabyte a block placed, never given back.
  const noRelease = (): void => {};
  const itemHandle = (id: string, entry: DrawnItem): InstanceHandle => makeHandle(() => (items.get(id) === entry ? entry.slot : 0), () => entry.base, noRelease);

  const drawItem = (it: DrawnItem, item: Prop | Actor, span: number): void => {
    const mesh = propOutput(item, it.mover ? 'actor' : 'prop', span).mesh;
    if (it.mover) putMover(`i:${item.id}`, it.hash, mesh, it.slot);
    else dynamic.pool.put(`i:${item.id}`, it.hash, mesh, it.slot);
    slots.setKind(it.slot, itemKind(item.type, mesh));
    it.drawn = true;
  };
  /** Draws what has come to be seen since it was planned. */
  const drawSeen = (): void => {
    for (const [id, { item, span }] of unseen) {
      const it = items.get(id);
      if (it && !slots.isVisible(it.slot)) continue;
      unseen.delete(id);
      if (it) drawItem(it, item, span);
    }
  };

  /**
   * `onlyMoved` (a drain's sync, with no life.sync after it): an item whose mesh and place are as they
   * were keeps whatever pose and visibility life gave it.
   */
  const syncDressing = (next: DressingPlan, onlyMoved = false): void => {
    const seen = new Set<string>();
    const live = new Set<string>();
    const where = getLayout()!;
    const visit = (item: Prop | Actor, category: 'prop' | 'actor'): void => {
      seen.add(item.id);
      const placed = where.item(item.id);
      const span = placed?.span ?? 0;
      const base = placed?.frame ?? identity();
      live.add(`${category}:${item.id}:${item.hash}:${span.toFixed(3)}`);
      let it = items.get(item.id);
      if (!it) {
        const mover = category === 'actor';
        const slot = slots.alloc(mover);
        const entry: DrawnItem = { hash: NaN, drawn: false, mover, slot, base, handle: null as unknown as InstanceHandle };
        entry.handle = itemHandle(item.id, entry);
        items.set(item.id, (it = entry));
      }
      const hash = item.hash * 31 + Math.round(span * 1000);
      const same = it.hash === hash && sameKeys(it.base, base);
      if (it.hash !== hash) {
        it.hash = hash;
        if (it.drawn) drawItem(it, item, span);
        else unseen.set(item.id, { item, span });
      }
      it.base = base;
      if (onlyMoved && same) return;
      slots.setMatrix(it.slot, base);
      // An anchored item whose anchor is gone has nowhere to be; free-roaming actors start at the origin
      // and are shown: their behaviour places them.
      slots.setVisible(it.slot, placed !== null || item.at === null);
    };
    for (const p of next.props) visit(p, 'prop');
    for (const a of next.actors) visit(a, 'actor');
    for (const [id, it] of items) {
      if (seen.has(id)) continue;
      removeItem(id, it);
      slots.release(it.slot);
      items.delete(id);
      unseen.delete(id);
    }
    for (const k of partOutputs.keys()) if (!live.has(k)) partOutputs.delete(k);
  };

  // ── the stage: how life moves things ─────────────────────────────────────
  const spawnMesh = (data: MeshData, at: Mat4Like): InstanceHandle => {
    const key = `x:${spawnCounter++}`;
    let slot = slots.alloc(true);
    if (meshInAir(data)) slots.setKind(slot, SLOT_AIR);
    slots.setMatrix(slot, at);
    putMover(key, 0, data, slot);
    return makeHandle(
      () => slot,
      () => at,
      () => {
        if (slot === 0) return;
        removeMover(key);
        slots.release(slot);
        slot = 0;
      },
    );
  };

  const stage: LifeStage = {
    instance(itemId) {
      return items.get(itemId)?.handle ?? null;
    },
    spawn(part: SpawnSpec, at) {
      if (!shape || !registries) throw new Error('stage.spawn: no town yet');
      const k = JSON.stringify(part);
      let out = spawnOutputs.get(k);
      if (!out) {
        const fake = { id: `spawn:${k}`, at: null, rule: 'spawn', hash: 0, variant: part.variant, params: part.params };
        out =
          'prop' in part
            ? registries.parts.prop({ ...fake, type: part.prop, at: { cell: 0, pos: 'c' } } as Prop, { plan: shape })
            : registries.parts.actor({ ...fake, type: part.actor } as Actor, { plan: shape });
        spawnOutputs.set(k, out);
      }
      return spawnMesh(out.mesh, at);
    },
    spawnMesh,
    liftStructure(id) {
      const d = structures.get(id);
      if (!d) return null;
      const entryOf = () => chunkPools.get(d.chunk)!.pool.entries.get(`s:${id}`);
      if (d.slot === 0) {
        d.slot = slots.alloc();
        slots.setKind(d.slot, SLOT_LIFTED);
        const e = entryOf();
        if (e) chunkPools.get(d.chunk)!.pool.setSlot(e, d.slot);
      }
      d.lifts++;
      let held = true;
      const base = identity();
      return makeHandle(
        () => (held && d.alive ? d.slot : 0),
        () => base,
        () => {
          if (!held) return;
          held = false;
          if (!d.alive || --d.lifts > 0) return;
          // Bake it back: its vertices point at the fixed slot again.
          const e = entryOf();
          if (e) chunkPools.get(d.chunk)!.pool.setSlot(e, 0);
          slots.release(d.slot);
          d.slot = 0;
        },
      );
    },
    socket(id) {
      return getLayout()?.socket(id) ?? null;
    },
  };

  // ── the ghost preview ────────────────────────────────────────────────────
  const clearGhost = (): void => {
    for (const k of ghostKeys) dynamic.pool.remove(k);
    for (const s of ghostSlots) slots.release(s);
    ghostKeys = [];
    ghostSlots = [];
  };
  const ghostSlot = (kind: number): number => {
    const s = slots.alloc(true);
    slots.setParams(s, -1, 0, kind, 0); // a negative glow sends it to the overlay pass; c says how to draw it
    ghostSlots.push(s);
    return s;
  };
  const cellBox = (b: MeshBuilder, c: number, grow: number): void => {
    const x = keyX(c), y = keyY(c) * CELL_H, z = keyZ(c);
    b.box([x - grow, y - grow, z - grow], [x + 1 + grow, y + CELL_H + grow, z + 1 + grow]);
  };

  // ── per-frame uniforms ───────────────────────────────────────────────────
  const refreshColors = (): void => {
    const u = surfaceUniforms;
    setLinear(u.uInk.value, PALETTE.ink);
    setLinear(u.uSand.value, PALETTE.sand);
    setLinear(u.uDirt.value, PALETTE.dirt);
    setLinear(u.uSea.value, PALETTE.sea);
    setLinear(u.uSeaDeep.value, PALETTE.seaDeep);
    setLinear(u.uShallow.value, PALETTE.shallow);
    setLinear(u.uFoam.value, PALETTE.foam);
    setLinear(u.uWhite.value, PALETTE.white);
    setLinear(u.uTimber.value, PALETTE.trunk);
    setLinear(u.uLamp.value, GRADE.lamp);
    setLinear(u.uFlowerA.value, PALETTE.white);
    setLinear(u.uFlowerB.value, PALETTE.yellow);
    setLinear(u.uFlowerC.value, PALETTE.pink);
    setSrgb(u.uStar.value, GRADE.star);
    setSrgb(u.uMagic.value, PALETTE.magic);
    setSrgb(u.uRed.value, PALETTE.red);
    setSrgb(paperUniforms.uPaper.value, PALETTE.paper);
    setLinear(u.uLeafRef.value, PALETTE.leaf);
    setLinear(u.uGrassRef.value, PALETTE.grass);
    setLinear(u.uSpringGreen.value, SEASON_LOOK.springGreen);
    setLinear(u.uAutumnGrass.value, SEASON_LOOK.autumnGrass);
    setLinear(u.uLeafA.value, SEASON_LOOK.leafYellow);
    setLinear(u.uLeafB.value, SEASON_LOOK.leafOrange);
    setLinear(u.uLeafC.value, SEASON_LOOK.leafRusset);
    setLinear(u.uLeafD.value, SEASON_LOOK.leafBrown);
    setLinear(u.uFrost.value, SEASON_LOOK.frost);
    setLinear(u.uSnowCol.value, SEASON_LOOK.snow);
    setLinear(u.uSnowShade.value, SEASON_LOOK.snowShade);
    setLinear(u.uWetTint.value, SEASON_LOOK.wet);
    setLinear(u.uIce.value, SEASON_LOOK.ice);
    setLinear(u.uTwig.value, SEASON_LOOK.twig);
    setLinear(u.uBlossomA.value, PALETTE.white);
    setLinear(u.uBlossomB.value, PALETTE.pink);
    u.uSpringMix.value = SEASON_LOOK.springMix;
    u.uAutumnGrassMix.value = SEASON_LOOK.autumnGrassMix;
    u.uSnowEdge.value = SEASON_LOOK.snowEdge;
    setSrgb(compositeUniforms.uLampWarm.value, GRADE.lampWarm);
    setSrgb(compositeUniforms.uStar.value, GRADE.star);
  };
  let colorsAt = -1;

  const updateWind = (signals: Signals): void => {
    const size = SIZE_X + WIND_MARGIN * 2;
    for (let j = 0; j < WIND_TEXELS; j++) {
      for (let i = 0; i < WIND_TEXELS; i++) {
        const w = signals.wind(((i + 0.5) / WIND_TEXELS) * size - WIND_MARGIN, ((j + 0.5) / WIND_TEXELS) * size - WIND_MARGIN);
        const k = (j * WIND_TEXELS + i) * 4;
        windData[k] = Math.round(Math.min(1, Math.max(0, (w.dirX * w.strength) / 2.5 + 0.5)) * 255);
        windData[k + 1] = Math.round(Math.min(1, Math.max(0, (w.dirZ * w.strength) / 2.5 + 0.5)) * 255);
        windData[k + 3] = 255;
      }
    }
    windTex.needsUpdate = true;
  };

  applyCamera();
  resizeTargets();
  renderer.setSize(width, height, false);

  // The first frame's shaders are handed to the driver now, and linked by it while the town is worked out;
  // each used to be asked for in the first frame, one after the other, and waited for there. (A program is
  // keyed by its shader and defines alone, so any mesh and any target will do. The page's own waits for the
  // script that made the view to say how sharp to draw: that is in its defines.)
  //
  // Packed (Direct3D): the driver takes seconds over them, in the background, and nothing is drawn until
  // they are done, so the page stays alive meanwhile instead of freezing in its first frame (`starting`).
  let starting: Set<THREE.Material> | null = packed ? new Set() : null;
  /** Whether shaders are worth building before they are needed: not where each one stops the page (api.ts). */
  const buildsAhead = !packed || renderer.extensions.has('KHR_parallel_shader_compile');
  let startFence: WebGLSync | null = null;
  const compile = (...materials: THREE.Material[]): void => {
    const all = new THREE.Scene();
    for (const m of materials) all.add(screenMesh(m));
    renderer.compile(all, camera);
    if (starting) for (const m of materials) starting.add(m);
  };
  compile(surfaceMaterial, moverMaterial, overlayMaterial, shadeMaterial, heightMaterial, paperMaterial, ...(unpackMaterial ? [unpackMaterial] : []));
  queueMicrotask(() => compile(compositeMaterial, ...(halfInk ? [inkMaterial] : [])));
  /** Packed only: whether the first frame's shaders are built, asked without waiting for them. */
  const shadersReady = (): boolean => {
    if (!starting) return true;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const known = (renderer as unknown as { properties: Properties }).properties;
    for (const m of starting) {
      const program = known.get(m).currentProgram;
      if (program && !program.isReady()) return false;
    }
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) {
      // Firefox cannot say whether a program is built. A fence after the last of them is passed when they are.
      if (!startFence) {
        startFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
      }
      if (startFence && gl.clientWaitSync(startFence, 0, 0) === gl.TIMEOUT_EXPIRED) return false;
      if (startFence) gl.deleteSync(startFence);
      startFence = null;
    }
    starting = null;
    // The fly mode's are as slow: built now, in the background, not at the first tap. (Only where they can
    // be built in the background: in Firefox the town would wait behind them.)
    if (buildsAhead) queueMicrotask(() => void view.prepareEye?.());
    return true;
  };

  let drawCalls = 0;
  let triangles = 0;

  const view: TownView = {
    canvas,
    stage,

    setTown(nextShape, nextDressing, opts) {
      // A frame that already rebuilt (mending in life.update, then the flush) spends no second budget.
      const first = !busy;
      busy = true;
      const t0 = beginRebuild();
      groundMotion.changed(shape, nextShape, lastSeconds ?? 0);
      shape = nextShape;
      syncShape(nextShape, opts?.spread, first);
      if (nextDressing) dressing = nextDressing;
      rebuildLayout();
      if (nextDressing) syncDressing(nextDressing);
      endRebuild(t0);
    },
    setDressing(nextDressing) {
      if (!shape) throw new Error('setDressing before setTown');
      busy = true;
      const t0 = beginRebuild();
      dressing = nextDressing;
      rebuildLayout();
      syncDressing(nextDressing);
      endRebuild(t0);
    },
    drawSeen() {
      if (unseen.size === 0) return;
      const t0 = performance.now();
      drawSeen();
      rebuildMs += performance.now() - t0;
      lastSpent = { ...spent };
    },
    setGhost(ghost: Ghost | null) {
      clearGhost();
      if (!ghost) return;
      const reg = registriesFor(ghost.plan);
      let n = 0;
      const add = (mesh: MeshData, slot: number): void => {
        if (mesh.position.length === 0) return;
        const k = `g:${n++}`;
        dynamic.pool.put(k, 0, mesh, slot);
        ghostKeys.push(k);
      };
      if (ghost.show.length > 0) {
        const slot = ghostSlot(0);
        for (const id of ghost.show) {
          const s = ghost.plan.structures.get(id);
          if (s) add(reg.generators.build(s, ghost.plan, reg.parts).mesh, slot);
        }
      }
      if (shape && ghost.plan.terrain !== shape.terrain) {
        // Shaping the land: the ground as it would be. Reshaped columns are drawn from the ghost's island;
        // a column dug down to the water shows the water that would fill it.
        const a = shape.terrain.height, h = ghost.plan.terrain.height;
        const cols: number[] = [];
        const wet = new MeshBuilder({ ink: 'ghost' }).setColor(PALETTE.sea);
        for (let i = 0; i < a.length; i++) {
          if (a[i] === h[i]) continue;
          cols.push(i);
          if (h[i] === 0) {
            const x = i % SIZE_X, z = (i / SIZE_X) | 0;
            wet.box([x + 0.04, SEA_Y - 0.06, z + 0.04], [x + 0.96, SEA_Y, z + 0.96]);
          }
        }
        if (cols.length > 0 && cols.length <= 64) {
          const slot = ghostSlot(0);
          add(buildTerrainColumns(cols, ghost.plan, 'ghost').build(), slot);
          add(wet.build(), slot);
        }
      }
      if (ghost.shimmer && ghost.shimmer.length > 0) {
        const b = new MeshBuilder({ ink: 'ghost' });
        for (const c of ghost.shimmer) cellBox(b, c, 0.03);
        add(b.build(), ghostSlot(1));
      }
      if (ghost.refuse !== undefined) {
        // A red frame: twelve bars along the cell's edges.
        const b = new MeshBuilder({ ink: 'ghost' });
        const c = ghost.refuse;
        const x = keyX(c), y = keyY(c) * CELL_H, z = keyZ(c), t = 0.035;
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) b.box([x + dx - t, y, z + dz - t], [x + dx + t, y + CELL_H, z + dz + t]);
        for (const dy of [0, CELL_H]) {
          for (const d of [0, 1]) {
            b.box([x, y + dy - t, z + d - t], [x + 1, y + dy + t, z + d + t]);
            b.box([x + d - t, y + dy - t, z], [x + d + t, y + dy + t, z + 1]);
          }
        }
        add(b.build(), ghostSlot(2));
      }
    },

    getCamera: () => ({ ...goal, target: [...goal.target] as [number, number, number] }),
    setCamera(p) {
      goal = clampPose(
        {
          yaw: p.yaw ?? goal.yaw,
          pitch: p.pitch ?? goal.pitch,
          zoom: p.zoom ?? goal.zoom,
          target: p.target ? [p.target[0], p.target[1], p.target[2]] : goal.target,
        },
        aspect(),
      );
      // Setting a pose is a cut, not a glide: screenshots and "reset view" land at once.
      shown = goal;
      applyCamera();
    },
    orbit(dYaw, dPitch) {
      goal = clampPose({ ...goal, yaw: goal.yaw + dYaw, pitch: goal.pitch + dPitch }, aspect());
    },
    pan(dx, dy) {
      goal = panPose(goal, dx, dy, width, height);
    },
    zoomBy(factor, x, y) {
      goal = zoomPose(goal, factor, width, height, x, y);
    },
    screenToRay(x, y): Ray {
      return rayAt(frame, x, y, width, height);
    },
    worldToScreen(p: Vec3) {
      return project(frame, p, width, height);
    },

    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      resizeTargets();
      goal = clampPose(goal, aspect());
      shown = clampPose(shown, aspect());
      applyCamera();
      applyEyeCamera();
    },
    setEyeCamera(pose) {
      eyePose = pose ? { eye: [pose.eye[0], pose.eye[1], pose.eye[2]], yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov } : null;
      applyEyeCamera();
    },
    prepareEye() {
      if (eyeReady || lens) return eyeReady ?? Promise.resolve();
      // Dressed for a moment in the fly-mode twins, every scene is compiled as it will be drawn (the
      // town into a two-target buffer like the eye's own; the rest to the screen), then dressed back.
      eyeTarget();
      wearing = 'fly';
      dress();
      const was = renderer.getRenderTarget();
      renderer.setRenderTarget(eyeTarget().draw);
      const compiling = [renderer.compileAsync(scene, perspCamera)];
      renderer.setRenderTarget(null);
      compiling.push(renderer.compileAsync(postScene, postCamera), renderer.compileAsync(overlayScene, perspCamera));
      if (halfInk) {
        renderer.setRenderTarget(inkTarget());
        compiling.push(renderer.compileAsync(inkScene, postCamera));
      }
      eyeReady = Promise.allSettled(compiling).then(() => undefined);
      renderer.setRenderTarget(was);
      wearing = 'orbit';
      dress();
      // The target's storage is made by drawing into it once (a clear).
      renderer.setRenderTarget(eyeTarget().draw);
      renderer.clear(true, true, false);
      if (packed) {
        renderer.setRenderTarget(eyeTarget().out);
        renderer.clear(true, false, false);
      }
      renderer.setRenderTarget(was);
      return eyeReady;
    },
    prepareGhost() {
      if (ghostPrepared) return;
      ghostPrepared = true;
      // The ghost's view holds nothing until a piece is held, and three skips an empty one, so the
      // surface material is compiled through a mesh of its own. No target is needed: the program is
      // keyed by its shader and defines alone, so the ghost's buffer stays unmade until first used.
      const probe = new THREE.Mesh(new THREE.BufferGeometry(), ghostMaterial);
      probe.frustumCulled = false;
      void renderer.compileAsync(new THREE.Scene().add(probe), camera).then(() => probe.geometry.dispose(), () => probe.geometry.dispose());
      void renderer.compileAsync(ghostPostScene, postCamera).catch(() => undefined);
      // And what is first drawn in the middle of play, in one frame: rain and snow, a ship at the edge of the
      // map, the leaves coming down.
      void renderer.compileAsync(precip.scene, camera).catch(() => undefined);
      void renderer.compileAsync(new THREE.Scene().add(screenMesh(capMaterial), ...(buildsAhead ? [screenMesh(bareMaterial)] : [])), camera).catch(() => undefined);
    },
    gpu() {
      return gpuName;
    },
    quality() {
      return { level, levels: levels.map((q) => ({ ...q })) };
    },
    setQuality(next) {
      const to = Math.max(0, Math.min(levels.length - 1, Math.round(next)));
      if (to === level) return;
      level = to;
      applyQuality(levels[to]!);
    },
    getEyeCamera() {
      return eyePose ? { ...eyePose, eye: [eyePose.eye[0], eyePose.eye[1], eyePose.eye[2]] } : null;
    },

    buildsAhead() {
      return buildsAhead;
    },
    started() {
      return starting === null;
    },
    render(signals: Signals) {
      // Packed: nothing is drawn, and nothing waited for, until the first frame's shaders are built.
      if (!shadersReady()) return;
      // A style value changed (the tuning panel, the gallery's sliders): redraw the town with it,
      // whether or not anyone calls setTown again.
      if (shape && styleVersion() !== seenStyle) {
        const t0 = beginRebuild();
        syncShape(shape);
        rebuildLayout();
        if (dressing) syncDressing(dressing);
        endRebuild(t0);
      }
      // Mischief's waiting rebuilds, a few a frame, and never in a frame that already rebuilt. A ruin
      // change keeps the generator's anchors, so the dressing is left as it is unless one moved.
      if (!busy && pending.size > 0 && shape) {
        const plan = shape;
        let moved = false;
        pending = new Set(
          buildWithin(
            [...pending],
            (id) => {
              const s = plan.structures.get(id);
              const d = structures.get(id);
              // Gone, or already drawn as it is now: dropped.
              if (s && d && d.hash !== s.hash) moved = buildStructure(s, plan) || moved;
            },
            REBUILD_BUDGET_MS,
          ),
        );
        rebuildLayout();
        // Output that leans on its neighbours can move an anchor with the cells unchanged: the props follow.
        if (moved && dressing) syncDressing(dressing, true);
      }
      busy = false;
      // Camera damping runs on life time, which is already clamped to 100 ms a step.
      const seconds = signals.time.seconds;
      const dt = lastSeconds === null ? 0 : seconds - lastSeconds;
      lastSeconds = seconds;
      groundMotion.tick(seconds);
      if (!samePose(shown, goal)) {
        shown = easePose(shown, goal, dt);
        applyCamera();
      }

      if (colorsAt !== styleVersion()) {
        colorsAt = styleVersion();
        refreshColors();
      }
      // Seasons and weather: a few numbers for the shaders, and the grade and paper they shift.
      const sf = seasonFrame(seasonOf(signals), weatherOf(signals));
      const grade = seasonGrade(gradeAt(signals.time), sf);
      wear(lens ? 'fly' : 'orbit');
      const css = pixelsPerUnit(shown, height);
      const targetPR = pixelRatio * superSample;
      const su = surfaceUniforms;
      su.uTime.value = seconds;
      su.uSway.value = LOOK.sway;
      su.uPx.value = css * targetPR;
      su.uCss.value = css;
      su.uCamRight.value.set(...frame.right);
      su.uCamUp.value.set(...frame.up);
      su.uZOrigin.value.set(...frame.target);
      su.uZAxis.value.set(...frame.forward).multiplyScalar(2 / (CAMERA_FAR - CAMERA_NEAR));
      su.uPencil.value = LOOK.pencil;
      su.uHatch.value = LOOK.hatch;
      su.uHatchSpacing.value = LOOK.hatchSpacing;
      su.uGlow.value = grade.glow;
      su.uCanvas.value.set(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      su.uTint.value.set(...grade.tint);
      su.uLift.value.set(...grade.lift);

      su.uSeasonOn.value = sf.on ? 1 : 0;
      su.uBulbCss.value = css;
      su.uSeason.value.set(...sf.season);
      su.uTrees.value.set(...sf.trees);
      su.uSnow.value.set(...sf.snow);
      su.uWet.value.set(...sf.wet);
      const wantBare = sf.on && sf.trees[1] > 0;
      if (wantBare !== bareOn) {
        bareOn = wantBare;
        // The movers keep their own material (it cuts ships off at the map's edge); no tree is a mover.
        dress();
      }
      // A tree that has dropped its leaves stops sheltering the ground: redraw the grounding picture
      // as the leaves fall (a step at a time: it is the costliest pass).
      const bare = wantBare ? sf.trees[1] : 0;
      if (Math.abs(bare - groundBare) > 0.02 || (bare === 0) !== (groundBare === 0)) {
        groundBare = bare;
        heightMaterial.uniforms.uBare!.value = bare;
        groundStale = true;
      }

      const pu = paperUniforms;
      pu.uPaper.value.set(...paperOf(sf));
      pu.uInk.value.set(...grade.ink);
      pu.uEye.value.set(...frame.eye);
      pu.uRight.value.set(frame.right[0] * frame.halfW, frame.right[1] * frame.halfW, frame.right[2] * frame.halfW);
      pu.uUp.value.set(frame.up[0] * frame.halfH, frame.up[1] * frame.halfH, frame.up[2] * frame.halfH);
      pu.uForward.value.set(...frame.forward);
      pu.uShadow.value = LOOK.slabShadow;

      const near = Math.max(LOOK.inkFarPx + 1, LOOK.inkNearPx);
      const closeness = Math.min(1, Math.max(0, (css - LOOK.inkFarPx) / (near - LOOK.inkFarPx)));
      // Farther out than the "far" zoom (a phone showing the whole island), lines keep thinning and
      // interior detail keeps fading, so a house six pixels wide is a shape, not a blot.
      const beyond = Math.min(1, Math.max(0.3, css / Math.max(1, LOOK.inkFarPx)));
      const detail = (LOOK.inkDetailFar + (1 - LOOK.inkDetailFar) * closeness) * beyond;
      const cu = compositeUniforms;
      cu.uOut.value.set(Math.round(width * pixelRatio), Math.round(height * pixelRatio));
      cu.uPR.value = pixelRatio;
      const origin = project(frame, [0, 0, 0], width, height);
      cu.uOrigin.value.set(origin[0], height - origin[1]);
      cu.uTime.value = seconds;
      cu.uEye.value.copy(pu.uEye.value);
      cu.uRight.value.copy(pu.uRight.value);
      cu.uUp.value.copy(pu.uUp.value);
      cu.uForward.value.copy(pu.uForward.value);
      cu.uCss.value = css;
      // Line weight by zoom. Out at the overview every line is the thin far width. Coming in, the
      // outline grows toward inkWidth; the lines inside a shape follow it to playing zoom and then
      // ease back to inkWidthInner, so a close-up is a pen drawing and not a sticker.
      const outline = (LOOK.inkWidthFar + (LOOK.inkWidth - LOOK.inkWidthFar) * closeness) * Math.max(0.7, beyond);
      const ease = Math.min(1, Math.max(0, (closeness - 0.25) / 0.6));
      const inner = outline + (Math.min(outline, LOOK.inkWidthInner) - outline) * ease * ease * (3 - 2 * ease);
      cu.uThick.value = outline;
      cu.uInner.value = inner / Math.max(1e-3, outline);
      cu.uDepthT.value = LOOK.inkDepth;
      cu.uWeights.value.set(LOOK.inkSilhouette, LOOK.inkSeam * detail, LOOK.inkCrease * detail);
      cu.uWobble.value = LOOK.wobble;
      cu.uBoil.value = LOOK.boil;
      cu.uPaperAmt.value = LOOK.paper;
      cu.uInk.value.set(...grade.ink);
      cu.uTint.value.set(...grade.tint);
      cu.uLift.value.set(...grade.lift);
      cu.uSat.value = grade.sat;
      cu.uShadeTint.value.set(...grade.shade);
      cu.uChroma.value = grade.chroma;
      cu.uContrast.value = grade.contrast;
      const dotL = (a: Vec3): number => a[0] * LIGHT[0] + a[1] * LIGHT[1] + a[2] * LIGHT[2];
      cu.uLightView.value.set(dotL(frame.right), dotL(frame.up), -dotL(frame.forward));
      cu.uGlow.value = grade.glow;
      cu.uStars.value = grade.stars;
      // Snow on the ground catches the windows' and lamps' light: warmer, wider pools.
      const festive = seasonOf(signals).festival;
      // Far out, a string of bulbs is a few pixels: its glow carries it (the halo grows as the view pulls back).
      cu.uHalo.value = LOOK.halo * (1 + 0.7 * sf.snow[0] + festive * (0.6 + 1.6 * (1 - closeness)));
      cu.uFestive.value = festive;
      cu.uFog.value = sf.fog;
      if (sf.fog > 0) {
        const paper = paperOf(sf);
        cu.uFogCol.value.set(paper[0] * grade.tint[0] + grade.lift[0], paper[1] * grade.tint[1] + grade.lift[1], paper[2] * grade.tint[2] + grade.lift[2]);
      }
      if (lens) {
        // Fly mode: the same page drawn for a perspective eye. Depth is the straight distance along
        // the view over [near, far]; everything that was "per zoom" above is worked out per pixel.
        const w = lens;
        su.uPx.value = targetPR;
        su.uCss.value = 1;
        su.uFocal.value = w.focal;
        su.uClip.value.set(w.near, w.far);
        su.uZStep.value = EYE_Z_STEP;
        su.uZOrigin.value.set(...w.eye);
        su.uZAxis.value.set(...w.forward);
        su.uCamRight.value.set(...w.right);
        su.uCamUp.value.set(...w.up);
        const sk = skyUniforms;
        sk.uEye.value.set(...w.eye);
        sk.uRight.value.set(w.right[0] * w.tanX, w.right[1] * w.tanX, w.right[2] * w.tanX);
        sk.uUp.value.set(w.up[0] * w.tanY, w.up[1] * w.tanY, w.up[2] * w.tanY);
        sk.uForward.value.set(...w.forward);
        sk.uPxAngle.value = 1 / w.focal;
        sk.uFlat.value = w.flat;
        cu.uFlat.value = w.flat;
        setSrgb(sk.uSeaWash.value, PALETTE.sea);
        cu.uEye.value.copy(sk.uEye.value);
        cu.uRight.value.copy(sk.uRight.value);
        cu.uUp.value.copy(sk.uUp.value);
        cu.uForward.value.copy(sk.uForward.value);
        cu.uNear.value = w.near;
        cu.uDepthRange.value = w.far - w.near;
        cu.uCss.value = 1;
        cu.uFocal.value = w.focal;
        cu.uInkW.value.set(LOOK.inkWidthFar, LOOK.inkWidth, LOOK.inkWidthInner, LOOK.inkDetailFar);
        cu.uInkPx.value.set(LOOK.inkFarPx, LOOK.inkNearPx);
        cu.uWeights.value.set(LOOK.inkSilhouette, LOOK.inkSeam, LOOK.inkCrease);
        cu.uLightView.value.set(dotL(w.right), dotL(w.up), -dotL(w.forward));
      } else {
        su.uZStep.value = Z_STEP;
        cu.uNear.value = CAMERA_NEAR;
        cu.uDepthRange.value = CAMERA_FAR - CAMERA_NEAR;
      }
      if (halfInk && inkRT) {
        inkUniforms.uOut.value.set(inkRT.width, inkRT.height);
        inkUniforms.uPR.value = pixelRatio / 2;
      }

      drawSeen();
      updateWind(signals);
      if (slots.generation !== slotGeneration) {
        slotGeneration = slots.generation;
        slotTex.dispose();
        slotTex = new THREE.DataTexture(slots.data, SLOT_WIDTH, slots.rows, THREE.RGBAFormat, THREE.FloatType);
        surfaceUniforms.uSlots.value = slotTex;
        slots.dirty = true;
      }
      if (slots.dirty) {
        slots.dirty = false;
        slotTex.needsUpdate = true;
      }
      let overlay = false;
      let rebuilt = false;
      for (const p of allPools) {
        const changed = p.sync();
        if (p !== movers && p !== haze) rebuilt ||= changed;
        overlay ||= p.overlay.visible;
      }
      su.uGround.value = LOOK.ground;
      // A warm tint (dusk) multiplies blue water toward grey. The sea is drawn with less red and green
      // by the same measure, so after the tint it is still blue: deeper, a little violet, not grey.
      const warm = Math.min(1, Math.max(0, (grade.tint[0] - grade.tint[2]) * 4));
      const low = Math.min(grade.tint[0], grade.tint[1], grade.tint[2]);
      const keep = (channel: number): number => 1 + warm * ((low / Math.max(1e-3, grade.tint[channel]!)) ** (LOOK.seaKeep * 2.2) - 1);
      su.uSeaKeep.value.set(keep(0) * grade.sea, keep(1) * grade.sea, keep(2) * grade.sea);
      su.uSlope.value = grade.slope;
      su.uCast.value = grade.cast;

      renderer.info.reset();
      mark(null);
      // Grounding: redraw the height picture when geometry changed; at most every other frame while a
      // lifted structure bounces; every GROUND_ITEMS frames while props and actors move (a bobbing
      // boat's shade at 15 Hz is indistinguishable, and it is the most expensive pass in the frame).
      // Things in the air (src/gen/airborne.ts) are not in the picture and never make it stale.
      // A still town pays nothing for it.
      groundAge++;
      if (rebuilt) groundStale = true;
      else if (slots.urgent && groundAge >= 2) groundStale = true;
      else if (slots.moved && groundAge >= GROUND_ITEMS) groundStale = true;
      if (groundStale && LOOK.ground > 0) {
        groundStale = false;
        slots.moved = false;
        slots.urgent = false;
        groundAge = 0;
        const shown = moverPools.map((p) => p.mesh.visible);
        paperMesh.visible = false;
        for (const p of moverPools) p.mesh.visible = false;
        for (const c of moverCaps) c.visible = false;
        scene.overrideMaterial = heightMaterial;
        renderer.setRenderTarget(heightRT);
        renderer.clear(true, true, false);
        renderer.render(scene, mapCamera);
        scene.overrideMaterial = null;
        paperMesh.visible = true;
        moverPools.forEach((p, i) => (p.mesh.visible = shown[i]!));
        renderer.setRenderTarget(shadeRT);
        renderer.render(shadeScene, postCamera);
        mark('ground');
      }
      moverCaps.forEach((c, i) => (c.visible = moverPools[i]!.mesh.visible && capSlots.size > 0));
      surfaceUniforms.uSlab.value = TERRAIN.slabRadius;
      const eyeCamera = lens ? perspCamera : camera;
      const depthBuffer = renderer.state.buffers.depth;
      const reversed = lens !== null && revz;
      const target = lens ? eyeTarget() : town;
      renderer.setRenderTarget(target.draw);
      if (reversed) depthBuffer.setReversed(true);
      renderer.clear(true, true, false);
      renderer.render(scene, eyeCamera);
      if (reversed) depthBuffer.setReversed(false);
      if (unpackScene) {
        unpackUniforms.tPacked.value = target.draw.texture;
        renderer.setRenderTarget(target.out);
        renderer.render(unpackScene, postCamera);
      }
      mark('town');
      if (halfInk) {
        renderer.setRenderTarget(inkTarget());
        renderer.render(inkScene, postCamera);
        mark('ink');
      }
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
      mark('composite');
      const weather = weatherOf(signals);
      if (weather.rain > 0.01 || weather.snow > 0.01) {
        const at = lens ? lens.eye : frame.target;
        const w = signals.wind(at[0], at[2]);
        const eye = lens ? { eye: { at: lens.eye, forward: lens.forward } } : {};
        if (precip.update({ pixelRatio, frame, rain: weather.rain, snow: weather.snow, wind: w, grade, night: grade.glow, seconds, dt: Math.max(0, dt), ...eye })) {
          if (reversed) depthBuffer.setReversed(true);
          renderer.render(precip.scene, eyeCamera);
          if (reversed) depthBuffer.setReversed(false);
          mark('precip');
        }
      }
      if (overlay) {
        if (reversed) depthBuffer.setReversed(true);
        renderer.clear(false, true, false);
        renderer.render(overlayScene, eyeCamera);
        if (reversed) depthBuffer.setReversed(false);
        mark('overlay');
      }
      if (ghostKeys.length > 0 && !lens) {
        renderer.setRenderTarget(ghostTarget());
        renderer.clear(true, true, false);
        renderer.render(ghostScene, camera);
        renderer.setRenderTarget(null);
        renderer.render(ghostPostScene, postCamera);
      }
      drawCalls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
    },

    stats(): ViewStats {
      return { drawCalls, triangles, rebuildMs, rebuild: { ...lastSpent }, pending: pending.size };
    },
    pending: () => pending.size,

    dispose() {
      clearGhost();
      for (const p of allPools) p.dispose();
      for (const d of structures.values()) d.alive = false;
      structures.clear();
      layers.clear();
      items.clear();
      precip.dispose();
      ghostRT?.depthTexture?.dispose();
      ghostRT?.dispose();
      heightRT.depthTexture?.dispose();
      heightRT.dispose();
      shadeRT.dispose();
      disposeTarget(town);
      if (eye) disposeTarget(eye);
      unpackMaterial?.dispose();
      inkRT?.dispose();
      slotTex.dispose();
      windTex.dispose();
      noiseTex.dispose();
      screenGeometry.dispose();
      for (const m of [surfaceMaterial, bareMaterial, moverMaterial, capMaterial, overlayMaterial, paperMaterial, compositeMaterial, inkMaterial, heightMaterial, shadeMaterial, ghostMaterial, ghostComposite]) m.dispose();
      if (persp) for (const m of Object.values(persp)) m?.dispose();      renderer.dispose();
    },
  };
  // ── a profiler for the measuring tools (src/fly/testing/judder.mjs) ─────────────────────────────
  // While on, each render pass is waited for (a one-pixel read) and timed: the split of a frame's GPU
  // time between the passes. The frame itself is then slower than real, so read it for the split.
  let profile: Record<string, number> | null = null;
  let profileAt = 0;
  const px = new Uint8Array(4);
  function mark(name: string | null): void {
    if (!profile) return;
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const now = performance.now();
    if (name) {
      profile[name] = (profile[name] ?? 0) + (now - profileAt);
      profile[`${name}#`] = (profile[`${name}#`] ?? 0) + 1;
    } else profile['frames#'] = (profile['frames#'] ?? 0) + 1;
    profileAt = now;
  }
  // The same over the game's own frames (tools/perf.mjs): on with true; false returns the milliseconds
  // summed per pass, with how many times each pass ran (`<pass>#`) and the frames (`frames#`).
  (view as TownView & { profileLive(on: boolean): Record<string, number> | null }).profileLive = (on) => {
    const got = profile;
    profile = on ? {} : null;
    return got;
  };
  (view as TownView & { profilePasses(frames: number, signals: Signals): Record<string, number> }).profilePasses = (frames, signals) => {
    profile = {};
    for (let i = 0; i < frames; i++) view.render(signals);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(profile)) if (!k.endsWith('#')) out[k] = +(v / frames).toFixed(2);
    profile = null;
    return out;
  };
  return view;
}
