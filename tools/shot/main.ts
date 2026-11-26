// The page the screenshot and benchmark tools drive (Stage 0, frozen). It
// renders any scenario from any of its cameras using only the frozen
// contracts (TownView, Signals, LifeRuntime, scenarios), so it keeps working
// whatever the app, the UI and the renderer become.

import { createLife } from '@/life/runtime';
import { createSignals, partPhases, type TownSignals } from '@/life/signals';
import { applyCalendar } from '@/life/season';
import type { LifeRuntime, SignalsDriver } from '@/life/api';
import { createTownView } from '@/render/index';
import type { TownView } from '@/render/api';
import { resolveDressing, resolveShape } from '@/resolve/index';
import { buildScenario, cameraName, scenarioResolveOptions, type BuiltScenario, type SeasonOfYear, type TimeOfDay, type WeatherOfDay } from '@/scenario';
import { findScenario, matchScenarios } from '@/scenario/discover';
import { benchEdit } from '@/scenario/edits';
import { applyEdit } from '@/world/world';

const canvas = document.getElementById('town') as HTMLCanvasElement;
let view: TownView | null = null;
let life: LifeRuntime | null = null;
let signals: TownSignals | null = null;
let current: BuiltScenario | null = null;

const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

function setTime(s: SignalsDriver, time: TimeOfDay): void {
  if (typeof time !== 'number') {
    s.hold(time);
    return;
  }
  // Hold the part of the day this phase falls in, then move to the exact phase.
  const phases = partPhases();
  s.hold((['day', 'dusk', 'night', 'dawn'] as const).find((p) => time < phases[p].end) ?? 'dawn');
  s.setPhase(time);
}

function load(name: string): BuiltScenario {
  const scn = findScenario(name);
  if (!scn) throw new Error(`no scenario named '${name}'`);
  view?.dispose();
  life?.dispose();
  // ?draw=packed or ?draw=plain: the town's target as on Windows or as elsewhere (src/render/packed.ts).
  const draw = new URLSearchParams(location.search).get('draw');
  view = createTownView(canvas, { preserveDrawingBuffer: true, pixelRatio: window.devicePixelRatio, ...(draw === 'packed' || draw === 'plain' ? { packed: draw === 'packed' } : {}) });
  view.resize(window.innerWidth, window.innerHeight);
  signals = createSignals(scn.seed);
  life = createLife(view.stage, signals);
  current = buildScenario(scn);
  const opts = scenarioResolveOptions(scn);
  const shape = resolveShape(current.world, current.terrain, opts);
  const dressing = resolveDressing(shape, opts);
  view.setTown(shape, dressing);
  life.sync({ shape, dressing });
  return current;
}

const api = {
  /** The scenarios matching a glob (null = all), with their camera names. */
  match(pattern: string | null) {
    return matchScenarios(pattern ?? undefined).map(({ scenario, file }) => {
      const cameras = buildScenario(scenario).cameras;
      return { name: scenario.name, file, cameras: cameras.map((_, i) => cameraName(cameras, i)) };
    });
  },

  /** Shows a scenario from one camera, settles life for `settle` simulated seconds, and draws it. */
  async show(name: string, camera = 0, opts: { time?: TimeOfDay; settle?: number; season?: SeasonOfYear; weather?: WeatherOfDay } = {}) {
    const built = current?.scenario.name === name ? current : load(name);
    const cam = built.cameras[camera];
    if (!cam) throw new Error(`scenario '${name}' has no camera ${camera}`);
    view!.resize(window.innerWidth, window.innerHeight);
    view!.setCamera(cam);
    setTime(signals!, opts.time ?? cam.time ?? built.scenario.time ?? 'day');
    // Seasons: summer and a clear sky unless the scenario, the camera or the command line says otherwise.
    applyCalendar(signals!, opts.season ?? cam.season ?? built.scenario.season ?? 'summer', opts.weather ?? cam.weather ?? built.scenario.weather ?? 'clear', true);
    const steps = Math.round((opts.settle ?? 2) * 30);
    for (let i = 0; i < steps; i++) life!.update(signals!.advance(1 / 30));
    view!.render(signals!);
    // Packed: the first frame waits for its shaders without blocking; so does this.
    while (view!.started?.() === false) {
      await new Promise((r) => setTimeout(r, 30));
      view!.render(signals!);
    }
    await nextFrame();
    view!.render(signals!);
    await nextFrame();
    return { ...view!.stats(), blocks: built.world.blocks.size };
  },

  /** Frame statistics and one-edit timings for a scenario (npm run bench). */
  async bench(name: string, frames = 120, calendar: { season?: SeasonOfYear; weather?: WeatherOfDay } = {}) {
    const built = load(name);
    view!.setCamera(built.cameras[0]!);
    setTime(signals!, 'day');
    applyCalendar(signals!, calendar.season ?? 'summer', calendar.weather ?? 'clear', true);
    for (let i = 0; i < 10; i++) {
      view!.render(signals!);
      await nextFrame();
    }
    const frameMs: number[] = [];
    const renderMs: number[] = [];
    const frameTriangles: number[] = [];
    let last = await nextFrame();
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      life!.update(signals!.advance(1 / 60));
      view!.orbit(0.5, 0);
      view!.render(signals!);
      renderMs.push(performance.now() - t0);
      frameTriangles.push(view!.stats().triangles);
      const now = await nextFrame();
      frameMs.push(now - last);
      last = now;
    }
    const stats = view!.stats();

    // One edit at a time: an Auto block on top of a column, a legal one for this town (benchEdit).
    // As in the app: the shape is drawn at once (the rebuild), the dressing a frame later.
    let world = built.world;
    const opts = scenarioResolveOptions(built.scenario);
    const edits: { shapeMs: number; dressingMs: number; rebuildMs: number; dressMs: number }[] = [];
    for (let i = 0; i < 20; i++) {
      const edit = benchEdit(world, built.terrain, i);
      if (!edit) break;
      world = applyEdit(world, built.terrain, edit);
      const a = performance.now();
      const shape = resolveShape(world, built.terrain, opts);
      const b = performance.now();
      view!.setTown(shape, null);
      const rebuildMs = view!.stats().rebuildMs;
      const c = performance.now();
      const dressing = resolveDressing(shape, opts);
      const d = performance.now();
      view!.setDressing(dressing);
      edits.push({ shapeMs: b - a, dressingMs: d - c, rebuildMs, dressMs: view!.stats().rebuildMs });
    }
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      blocks: built.world.blocks.size,
      frames,
      frameMs,
      renderMs,
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      frameTriangles,
      edits,
      gpu: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    };
  },
};

declare global {
  interface Window {
    __shot?: typeof api;
  }
}
window.__shot = api;
