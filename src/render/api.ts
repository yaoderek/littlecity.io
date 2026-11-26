// FROZEN CONTRACT (Stage 0). Do not edit; see docs/swarm/CONTRACTS.md.
//
// The view: the one object the app, the UI, life, the screenshot page and the
// benchmark use to put a town on a canvas. The Look owner implements it in
// src/render/index.ts (`createTownView`); everyone else codes against this.
//
// Who does what with the camera: the VIEW owns the camera's state and maths
// (pose, clamping, projection). The UI owns input: it turns drags, pinches
// and wheel events into orbit / pan / zoomBy calls.

import type { CellKey } from '@/core/grid';
import type { Vec3 } from '@/core/mat4';
import type { LifeStage, Signals } from '@/life/api';
import type { DressingPlan, ShapePlan, StructureId } from '@/resolve/plan';

/** Orthographic orbit camera. Scenario cameras use the same shape. */
export interface CameraPose {
  /** Degrees about the vertical axis. 0 looks north (toward −z); 90 looks west (toward −x). */
  yaw: number;
  /** Degrees above the horizon, clamped to 10–85 so you cannot look from under the island. */
  pitch: number;
  /** 1 fits the whole 48-column map in the view's height; 3 shows a third of it. */
  zoom: number;
  /** The point looked at, in GRID units: [x, level, z] (level is multiplied by CELL_H). */
  target: readonly [number, number, number];
}

/**
 * Added by Fly: a perspective eye (fly mode, design section 7). World units, not grid levels.
 * yaw as CameraPose (0 looks north, toward −z; 90 looks west); pitch in degrees above the horizon
 * (negative looks down); fov the vertical field of view in degrees.
 */
export interface EyePose {
  eye: readonly [number, number, number];
  yaw: number;
  pitch: number;
  fov: number;
}

export interface Ray {
  /** World space. */
  origin: Vec3;
  /** Unit length. */
  dir: Vec3;
}

/** The ghost preview (design section 7). */
export interface Ghost {
  /** The what-if plan from StagedResolver.preview(). */
  plan: ShapePlan;
  /** Structures of that plan to draw translucent (the new piece, without decorations). */
  show: readonly StructureId[];
  /** Auto neighbours whose resolved kind would change: these shimmer. */
  shimmer?: readonly CellKey[];
  /** An illegal target: drawn as a red outline instead of a piece. */
  refuse?: CellKey;
}

export interface ViewStats {
  drawCalls: number;
  triangles: number;
  /** Milliseconds the last setTown / setDressing spent rebuilding geometry. */
  rebuildMs: number;
  /**
   * Added by Look. Where the last setTown / setDressing spent that time, in milliseconds, so a slow
   * rebuild can be laid at the right door: `generators` is time inside structure generators (and the
   * parts they call), `layers` inside layer hash() and build(), `parts` inside prop and actor parts,
   * `view` everything the renderer itself did (packing into pools, layout, bookkeeping). `structures`
   * and `vertices` count what was rebuilt.
   */
  rebuild?: { generators: number; layers: number; parts: number; view: number; structures: number; vertices: number };
  /** Added for mischief. Structures whose new drawing is still waiting (setTown's `spread`); their old one shows meanwhile. */
  pending: number;
}

export interface ViewOptions {
  /** Device pixel ratio cap; default min(devicePixelRatio, 2). */
  pixelRatio?: number;
  /** Keep the drawing buffer readable (screenshots, postcard export). Default false. */
  preserveDrawingBuffer?: boolean;
  /**
   * Added by Look (Stage 1). Where the ink lines are computed: 'full' at the
   * canvas resolution, 'half' at half of it (softer lines, far cheaper; the
   * phone fallback of design section 14). Default 'auto': 'half' on a small
   * touch screen, 'full' elsewhere.
   */
  ink?: 'auto' | 'full' | 'half';
  /**
   * Draw the town into one packed target (src/render/packed.ts). Default: only where the browser draws
   * through Direct3D (Windows). For the tests.
   */
  packed?: boolean;
}

export interface TownView {
  readonly canvas: HTMLCanvasElement;
  /** How life moves things. */
  readonly stage: LifeStage;

  /**
   * Shows a town. Rebuilds only what changed (by structure, layer-chunk and
   * prop hash). Pass `dressing: null` right after an edit; the previous
   * props stay until setDressing delivers the new ones.
   *
   * Added for mischief: with `spread`, changed structures already drawn are rebuilt a few a frame
   * (within REBUILD_BUDGET_MS, in frames that run no setTown or setDressing) and keep their old
   * drawing until then. New and removed structures and the layers still change at once. Without
   * it, anything still waiting is rebuilt now. `'waiting'` (the player's own edit) builds everything
   * it changed now but leaves what was already waiting, and kept its cells and edges, waiting.
   */
  setTown(shape: ShapePlan, dressing: DressingPlan | null, opts?: { spread?: boolean | 'waiting' }): void;
  /** Delivers the dressing for the shape last passed to setTown. */
  setDressing(dressing: DressingPlan): void;
  /**
   * Makes the meshes of what the dressing just delivered shows. A prop or actor is drawn only once it is
   * seen (life hides some as it syncs: the festival's lights, the plan's own people), so call this after
   * life.sync to pay for it there; render() draws whatever is left.
   */
  drawSeen?(): void;
  setGhost(ghost: Ghost | null): void;

  getCamera(): CameraPose;
  /** Sets any part of the pose (values are clamped). */
  setCamera(pose: Partial<CameraPose>): void;
  /** Turns the camera by degrees. */
  orbit(dYaw: number, dPitch: number): void;
  /** Slides the target so the picture moves by this many CSS pixels. */
  pan(dxPixels: number, dyPixels: number): void;
  /** Multiplies zoom, keeping the point under (x, y) CSS pixels fixed if given. */
  zoomBy(factor: number, x?: number, y?: number): void;
  /** The world-space ray under a point of the canvas, in CSS pixels from its top-left. */
  screenToRay(x: number, y: number): Ray;
  /** CSS pixel position of a world point. */
  worldToScreen(p: Vec3): [number, number];

  /**
   * Added by Fly. Draws from a perspective eye instead of the orbit camera (fly mode), or goes back
   * to the orbit camera with null. The orbit pose (getCamera) is left untouched, so leaving fly mode
   * shows exactly the view that was there before. screenToRay and worldToScreen keep to the orbit camera.
   */
  setEyeCamera(pose: EyePose | null): void;
  /** The perspective eye drawn from now, or null while the orbit camera draws. */
  getEyeCamera(): EyePose | null;
  /**
   * Added by Fly. Gets the perspective eye ready ahead of time (its shaders compiled, its target
   * made), so the first take-off does not stall a frame. Call when the page is idle; harmless twice.
   * Resolves once the shaders are ready (never rejects).
   */
  prepareEye?(): Promise<void>;
  /**
   * Gets the held piece's ghost ready ahead of time (its two shaders compiled), so the first hover
   * does not stall a frame. Call when the page is idle; harmless twice.
   */
  prepareGhost?(): void;
  /**
   * False while the first frame is still waiting for its shaders to be built (Windows: seconds, in the
   * background): render draws nothing until then. Absent or true: what render drew is on screen.
   */
  started?(): boolean;
  /**
   * False where building a shader stops the page for seconds and cannot be done in the background (Firefox
   * on Windows): there, the shaders that many never need (fly mode's, the bare trees') are left until they
   * are needed. Absent or true: they are built ahead, while the page is idle.
   */
  buildsAhead?(): boolean;

  /**
   * Added for the quality governor (src/render/quality.ts). How sharp the page is drawn: the levels
   * this view has, sharpest first, and the one in use. A view made with a fixed pixel ratio or ink
   * has one level.
   */
  quality?(): { level: number; levels: { pixelRatio: number; superSample: number; halfInk: boolean; rough?: true }[] };
  /** The graphics driver's name, as the browser tells it ('' where it does not). */
  gpu?(): string;
  /** Changes to a level (an index into quality().levels). */
  setQuality?(level: number): void;

  /** Match the canvas's CSS size. Call on window resize. */
  resize(width: number, height: number): void;
  /** Draws one frame. Reads time of day and wind from `signals`; never reads the clock itself. */
  render(signals: Signals): void;
  stats(): ViewStats;
  /** Added for mischief. ViewStats.pending without making the stats: cheap enough to ask every frame. */
  pending(): number;
  dispose(): void;
}

/** The signature of `createTownView` in src/render/index.ts. */
export type CreateTownView = (canvas: HTMLCanvasElement, opts?: ViewOptions) => TownView;
