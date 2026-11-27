// The page `npm run guide` drives: renders each guide entry's recipe town
// (src/guide/entries.ts) by day, with people, birds and boats left out so
// the pictures never change by chance, frames it tightly, and cuts it out
// as a soft-edged vignette on a transparent background.
//
// Uses only TownView, Signals, LifeRuntime and the scenario builder, like
// tools/shot.

import { CELL_H, keyX, keyY, keyZ, unedge } from '@/core/grid';
import { hash } from '@/core/rand';
import type { World } from '@/core/world';
import { ENTRIES, guideScenario, type GuideEntry } from '@/guide/entries';
import type { LifeRuntime } from '@/life/api';
import { createLife } from '@/life/runtime';
import { createSignals, type TownSignals } from '@/life/signals';
import { applyCalendar } from '@/life/season';
import { raidsOf } from '@/life/raid/raids';
import { mischiefOf } from '@/life/mischief/director';
import { key } from '@/core/grid';
import type { CameraPose, TownView } from '@/render/api';
import { frameOf, panPose, project, zoomPose } from '@/render/camera';
import { createTownView } from '@/render/index';
import { resolveDressing, resolveShape } from '@/resolve/index';
import type { DressingPlan } from '@/resolve/plan';
import { buildScenario } from '@/scenario';
import { COLLECTION, madeByEdit } from '@/guide/collection';
import { clipPlan, play } from '@/guide/steps';
import { celebrate } from '@/life/feedback/celebrate';
import { EDGE_ID_BASE, FLOOR_ID_BASE, type ShapePlan, type StructureId } from '@/resolve/plan';
import { FEEDBACK } from '@/style/animation';
import { icon, iconDefs } from '@/ui/icons';

/** Actors that move about by chance: left out of the pictures. */
const RESTLESS = new Set<string>([
  'resident', 'figure', 'gull', 'pigeon', 'swift', 'small-bird', 'bird-wing', 'cat', 'insect', 'leaf', 'cloud', 'balloon',
  'rowboat', 'sailboat', 'fishing-boat', 'boat-sail', 'mooring-line', 'sheep', 'chicken',
]);

/** Wild tufts and beach finds strewn over open ground: at thumbnail size they read as specks of dirt. */
const SCATTER = 'D24.';

const canvas = document.getElementById('town') as HTMLCanvasElement;
let view: TownView | null = null;
let life: LifeRuntime | null = null;
let signals: TownSignals | null = null;

const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

/** The world-space box round everything the recipe placed, padded by `pad` cells. */
function boxOf(entry: GuideEntry, world: World): { lo: [number, number, number]; hi: [number, number, number] } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const see = (k: number, top: number, xa = keyX(k), xb = keyX(k) + 1, za = keyZ(k), zb = keyZ(k) + 1): void => {
    x0 = Math.min(x0, xa); x1 = Math.max(x1, xb);
    z0 = Math.min(z0, za); z1 = Math.max(z1, zb);
    y0 = Math.min(y0, keyY(k)); y1 = Math.max(y1, keyY(k) + top);
  };
  // Roofs, spires and lanterns rise above a block's cell; floors, fences and walls stay low.
  for (const k of world.blocks.keys()) see(k, 2.1);
  for (const k of world.floors.keys()) see(k, 0.6);
  for (const e of world.edges.keys()) {
    // An edge piece stands on the east or south side of its cell.
    const { cell, side } = unedge(e);
    const x = keyX(cell), z = keyZ(cell);
    if (side === 'E') see(cell, 0.6, x + 1, x + 1, z, z + 1);
    else see(cell, 0.6, x, x + 1, z + 1, z + 1);
  }
  const pad = entry.pad ?? 0.4;
  if (entry.frame) {
    // A part of the recipe chosen by the entry (the castle's gate, where its people are).
    const [fx0, fz0, fx1, fz1, top] = entry.frame;
    return { lo: [fx0 - pad, y0 * CELL_H, fz0 - pad], hi: [fx1 + 1 + pad, (y0 + top) * CELL_H, fz1 + 1 + pad] };
  }
  return { lo: [x0 - pad, y0 * CELL_H, z0 - pad], hi: [x1 + pad, y1 * CELL_H, z1 + pad] };
}

/**
 * The pose that fits the box in the view, leaving `margin` of it free on each side (worked out on
 * paper, then set at once). `wanted` > 1 means the camera's closest zoom still leaves the box that
 * much too small.
 */
function fit(start: CameraPose, box: ReturnType<typeof boxOf>, width: number, height: number, margin: number): { pose: CameraPose; wanted: number } {
  let pose = start;
  let wanted = 1;
  for (let pass = 0; pass < 4; pass++) {
    const f = frameOf(pose, width, height);
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const x of [box.lo[0], box.hi[0]]) {
      for (const y of [box.lo[1], box.hi[1]]) {
        for (const z of [box.lo[2], box.hi[2]]) {
          const [px, py] = project(f, [x, y, z], width, height);
          sx0 = Math.min(sx0, px); sx1 = Math.max(sx1, px); sy0 = Math.min(sy0, py); sy1 = Math.max(sy1, py);
        }
      }
    }
    pose = panPose(pose, width / 2 - (sx0 + sx1) / 2, height / 2 - (sy0 + sy1) / 2, width, height);
    const scale = Math.min((width * (1 - 2 * margin)) / (sx1 - sx0), (height * (1 - 2 * margin)) / (sy1 - sy0));
    const before = pose.zoom;
    pose = zoomPose(pose, scale, width, height, width / 2, height / 2);
    wanted = (before * scale) / pose.zoom;
  }
  return { pose, wanted };
}

/** A soft, slightly wobbly rounded-square vignette, the same for an entry every time. */
function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string): void {
  const s = hash(0, 'guide', seed);
  const wob = (i: number): number => ((hash(s, i) % 1000) / 1000 - 0.5) * 2;
  const feather = Math.round(Math.min(w, h) * 0.035);
  const cx = w / 2, cy = h / 2, rx = w / 2 - feather * 1.6, ry = h / 2 - feather * 1.6;
  const a1 = wob(1) * 0.012, a2 = wob(2) * 0.01, p1 = wob(3) * Math.PI, p2 = wob(4) * Math.PI;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.filter = `blur(${feather}px)`;
  ctx.beginPath();
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), sn = Math.sin(t);
    // A superellipse (exponent 5): nearly square, with rounded corners.
    const e = 2 / 5;
    const r = 1 + a1 * Math.sin(3 * t + p1) + a2 * Math.sin(5 * t + p2);
    const x = cx + rx * r * Math.sign(c) * Math.abs(c) ** e;
    const y = cy + ry * r * Math.sign(sn) * Math.abs(sn) ** e;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
}


/**
 * Puts a town on the one view (a fresh WebGL context per picture would draw its first frames before its
 * shaders are ready), with fresh life and signals, and frames `world` (the recipe's) as the picture does.
 */
function stage(entry: GuideEntry, seed: number, shape: ShapePlan, dressing: DressingPlan, world: World, margin: number): { view: TownView; life: LifeRuntime; signals: TownSignals } {
  life?.dispose();
  const width = window.innerWidth, height = window.innerHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  view ??= createTownView(canvas, { preserveDrawingBuffer: true, pixelRatio: window.devicePixelRatio });
  view.resize(width, height);
  signals = createSignals(seed);
  // Summer and a clear sky, held (seasons, design section 13a): pictures as they always were; an entry
  // whose scene belongs to a season (the snow day, the harvest supper) holds its own.
  applyCalendar(signals, entry.life?.season ?? 'summer', entry.life?.weather ?? 'clear', true);
  signals.hold(entry.life?.time ?? 'day');
  life = createLife(view.stage, signals);
  view.setTown(shape, dressing);
  life.sync({ shape, dressing });

  const box = boxOf(entry, world);
  const centre: [number, number, number] = [(box.lo[0] + box.hi[0]) / 2, (box.lo[1] + box.hi[1]) / 2 / CELL_H, (box.lo[2] + box.hi[2]) / 2];
  const start: CameraPose = { yaw: entry.view.yaw, pitch: entry.view.pitch, zoom: 6, target: centre };
  let fitted = fit(start, box, width, height, margin);
  if (fitted.wanted > 1.02) {
    // Small things: the camera will not come closer, so draw a bigger canvas and keep its middle.
    const w = Math.round(width * Math.min(3, fitted.wanted)), h = Math.round(height * Math.min(3, fitted.wanted));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    view.resize(w, h);
    fitted = fit(start, box, w, h, margin);
  }
  view.setCamera(fitted.pose);
  return { view, life, signals };
}

/** The middle of the view's canvas, the picture's size, onto a fresh 2D canvas at device pixels. */
function cropOf(): { out: HTMLCanvasElement; ctx: CanvasRenderingContext2D; draw(): void } {
  const out = document.createElement('canvas');
  out.width = Math.round(window.innerWidth * window.devicePixelRatio);
  out.height = Math.round(window.innerHeight * window.devicePixelRatio);
  const ctx = out.getContext('2d')!;
  return { out, ctx, draw: () => ctx.drawImage(canvas, (canvas.width - out.width) / 2, (canvas.height - out.height) / 2, out.width, out.height, 0, 0, out.width, out.height) };
}

// ── the clips (`npm run guide -- --clips`) ─────────────────────────────────────

/** The Almanac's paper (--lc-card, src/ui/ui.css): a clip is drawn on it, as a still is seen on it (a video has no transparency on iPhones). */
const PAPER = '#fdfaf3';
const INK = '#3a2f2a';
/** Frames a second: the clock is stepped by hand, never read. */
export const CLIP_FPS = 24;
/** The glove, CSS pixels of the 180 × 135 picture; its fingertip at TIP of the drawing (src/ui/tutorial.ts). */
const GLOVE = 30;
const TIP = [0.475, 0.95] as const;
/** How big the unlock stars are drawn, CSS pixels of the picture (the game's are 24 on the whole screen). */
const STAR_PX = 10;

let glove: HTMLImageElement | null = null;
/** The tutorial's glove (icons.ts 'point'), with the pen wobble it is drawn with in the game. */
async function gloveImage(): Promise<HTMLImageElement> {
  if (glove) return glove;
  const filter = /<filter[\s\S]*<\/filter>/.exec(iconDefs())![0];
  const svg = icon('point')
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" ')
    .replace(/(<svg[^>]*>)/, `$1<defs>${filter}</defs>`);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return (glove = img);
}

/** The dressing a clip shows: the still's (no strewn specks, nobody wandering by chance), and no townsfolk at all. */
function clipDressing(shape: ShapePlan): DressingPlan {
  const full = resolveDressing(shape);
  return { ...full, props: full.props.filter((p) => !p.rule.startsWith(SCATTER)), actors: full.actors.filter((a) => !RESTLESS.has(a.type)) };
}

/** The top of a structure, where its stars burst (src/ui/unlock.ts topOf). */
function topOf(shape: ShapePlan, id: StructureId): { at: [number, number, number]; size: number } | null {
  const s = shape.structures.get(id);
  if (!s || s.cells.length === 0) return null;
  let x = 0, z = 0, top = -Infinity, low = Infinity;
  for (const c of s.cells) {
    x += keyX(c) + 0.5;
    z += keyZ(c) + 0.5;
    top = Math.max(top, keyY(c));
    low = Math.min(low, keyY(c));
  }
  const n = s.cells.length;
  const y = id >= FLOOR_ID_BASE && id < EDGE_ID_BASE ? low * CELL_H + 0.15 : (top + 1) * CELL_H;
  return { at: [x / n, y, z / n], size: new Set(s.cells.map((c) => keyX(c) + keyZ(c) * 64)).size };
}

const easeInOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const easeOut = (u: number): number => 1 - (1 - u) ** 3;
const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));

interface ClipRun {
  frames: number;
  /** Seconds each tap lands at, and the tap that makes the building. */
  taps: number[];
  formed: number;
  frame: number;
  next(): string;
}
let run: ClipRun | null = null;
/** The life now running is this one (a clip opened its town afresh): the next stage() disposes it. */
const adopt = (next: LifeRuntime): void => {
  life = next;
};

/**
 * Buildings proven by a ship that calls (or a barge): in the game it sails in from the edge of the map a
 * while later (visit.ts), long after a clip's few seconds. Their clips open the town afresh once the last
 * piece is down, as a town opened with a port is, so the ship is at its berth with the stars.
 */
const REOPEN = new Set(['ships', 'cog', 'dug-river']);

/** Prepares an entry's clip (its first frame is drawn by the first next()). */
async function beginClip(id: string, opts: { hold?: number } = {}): Promise<{ frames: number; taps: number[]; formed: number }> {
  const entry = ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`no guide entry '${id}'`);
  const plan = clipPlan(entry);
  const hand = await gloveImage();
  let world = plan.setting;
  let shape = resolveShape(world, plan.terrain);
  let dressing = clipDressing(shape);
  const staged = stage(entry, entry.seed, shape, dressing, plan.final, 0.07);
  const { view, signals } = staged;
  let life = staged.life;
  // Life settles on the setting first (trees still, water running), as a still's does.
  for (let i = 0; i < 2 * CLIP_FPS; i++) life.update(signals.advance(1 / CLIP_FPS));
  for (let i = 0; i < 4; i++) {
    view.render(signals);
    await nextFrame();
  }

  const width = window.innerWidth, height = window.innerHeight, dpr = window.devicePixelRatio;
  const n = plan.steps.length;
  // About three seconds of tapping whatever the recipe's size; a hold on the finished building; a short fade
  // back to the first frame so the loop has no jump.
  const gap = n <= 1 ? 0 : Math.min(0.5, Math.max(0.13, 2.8 / n));
  const lead = 0.55;
  const taps = plan.steps.map((_, i) => lead + i * gap);
  const lastTap = taps[n - 1]!;
  const end = Math.max(lastTap + 0.45 + (opts.hold ?? 1.3), taps[plan.formed]! + FEEDBACK.unlockStarTime + 0.45, 3.2);
  const FADE = 0.3;
  const frames = Math.round((end + FADE) * CLIP_FPS);

  // Where each tap is in the picture (CSS px), and where the glove comes from and goes.
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  const spot = (at: readonly [number, number, number]): [number, number] => {
    const [x, y] = view.worldToScreen([at[0], at[1], at[2]]);
    return [x - (cssW - width) / 2, y - (cssH - height) / 2];
  };
  const spots = plan.steps.map((s) => spot(s.at));
  const away: [number, number] = [width + GLOVE * 0.7, height * 0.92];
  const gloveAt = (t: number): { x: number; y: number; press: number } => {
    const lift = (dt: number): number => Math.min(1, Math.abs(dt) / 0.07);
    if (t < taps[0]!) {
      const u = easeInOut(clamp01((t - 0.08) / (taps[0]! - 0.16)));
      const [x0, y0] = away, [x1, y1] = spots[0]!;
      return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u - 10 * Math.sin(Math.PI * u), press: lift(t - taps[0]!) };
    }
    if (t >= lastTap) {
      const u = easeInOut(clamp01((t - lastTap - 0.12) / 0.5));
      const [x0, y0] = spots[n - 1]!, [x1, y1] = away;
      return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u - 10 * Math.sin(Math.PI * u), press: lift(t - lastTap) };
    }
    let i = 0;
    while (i + 1 < n && taps[i + 1]! <= t) i++;
    const a = taps[i]!, b = taps[i + 1]!;
    const u = easeInOut(clamp01((t - a - 0.03) / Math.max(0.01, b - a - 0.08)));
    const [x0, y0] = spots[i]!, [x1, y1] = spots[i + 1]!;
    const hop = Math.min(10, Math.hypot(x1 - x0, y1 - y0) * 0.25);
    return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u - hop * Math.sin(Math.PI * u), press: Math.min(lift(t - a), lift(t - b)) };
  };

  // The vignette as a mask, made once; the town is cut out with it and laid on the paper.
  const mask = cropOf();
  mask.ctx.fillStyle = '#000';
  mask.ctx.fillRect(0, 0, mask.out.width, mask.out.height);
  vignette(mask.ctx, mask.out.width, mask.out.height, entry.id);
  const town = cropOf();
  const out = cropOf();
  let first: HTMLCanvasElement | null = null;

  let done = 0;
  let dressDue = false;
  /** When the town is opened afresh (REOPEN), seconds. */
  let reopenAt = Infinity;
  let starsOnDressing: [number, number, number] | null = null;
  const dressed = !('role' in entry.proof);
  const starScale = (at: readonly [number, number, number]): number => {
    const [ax, ay] = view.worldToScreen([at[0], at[1], at[2]]);
    const [bx, by] = view.worldToScreen([at[0] + 1, at[1], at[2]]);
    const [cx, cy] = view.worldToScreen([at[0], at[1], at[2] + 1]);
    const perUnit = Math.max(1, (Math.hypot(bx - ax, by - ay) + Math.hypot(cx - ax, cy - ay)) / 2);
    return Math.max(1, STAR_PX / (perUnit * FEEDBACK.unlockStarSize));
  };

  const next = (): string => {
    const f = runState.frame++;
    const t = f / CLIP_FPS;
    if (dressDue) {
      // The dressing comes the frame after the edit, as in the game.
      dressDue = false;
      dressing = clipDressing(shape);
      view.setDressing(dressing);
      life.sync({ shape, dressing });
      view.drawSeen?.();
      if (starsOnDressing) {
        celebrate(view.stage, { at: starsOnDressing, size: 1, scale: starScale(starsOnDressing) });
        starsOnDressing = null;
      }
    }
    if (t >= reopenAt) {
      // A ship (a barge) that would sail in from the edge of the map long after the clip ends: the town is
      // opened afresh, as one opened with a port is, and the ship is in at its berth as the stars burst.
      reopenAt = Infinity;
      dressDue = false;
      dressing = clipDressing(shape);
      life.dispose();
      life = createLife(view.stage, signals);
      adopt(life);
      view.setDressing(dressing);
      life.sync({ shape, dressing });
      view.drawSeen?.();
      const at = plan.steps[plan.formed]!.at;
      celebrate(view.stage, { at: [at[0], at[1], at[2]], size: 1, scale: starScale(at) });
      starsOnDressing = null;
    }
    while (done < n && taps[done]! <= t + 1e-6) {
      const step = plan.steps[done]!;
      const before = shape;
      world = play(world, plan.terrain, step.edits, plan.final);
      shape = resolveShape(world, plan.terrain);
      view.setTown(shape, null, { spread: 'waiting' });
      life.sync({ shape, dressing: null });
      for (const e of step.edits) if (e.type === 'placeBlock') signals.emit('blockLanded', e.cell);
      dressDue = true;
      if (done === plan.formed) {
        if (REOPEN.has(entry.id)) reopenAt = Math.max(taps[done]!, lastTap) + FEEDBACK.landTime + 0.05;
        else if (dressed) starsOnDressing = [step.at[0], step.at[1], step.at[2]];
        else {
          const role = 'role' in entry.proof ? entry.proof.role : '';
          const made = madeByEdit(before, shape).find((m) => m.entry.id === entry.id)?.structure ?? [...shape.roles].find(([, r]) => r.role === role)?.[0];
          const top = made === undefined ? null : topOf(shape, made);
          const at = top?.at ?? [step.at[0], step.at[1], step.at[2]];
          celebrate(view.stage, { ...(top && made !== undefined ? { structure: made } : {}), at, size: top?.size ?? 1, scale: starScale(at) });
        }
      }
      done++;
    }
    life.update(signals.advance(1 / CLIP_FPS));
    view.render(signals);

    town.ctx.globalCompositeOperation = 'copy';
    town.draw();
    town.ctx.globalCompositeOperation = 'destination-in';
    town.ctx.drawImage(mask.out, 0, 0);
    const ctx = out.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, out.out.width, out.out.height);
    ctx.drawImage(town.out, 0, 0);

    // Where the glove touched: a small ring of ink spreading and fading.
    ctx.save();
    ctx.scale(dpr, dpr);
    for (let i = 0; i < done; i++) {
      const u = (t - taps[i]!) / 0.32;
      if (u < 0 || u > 1) continue;
      const [x, y] = spots[i]!;
      ctx.globalAlpha = 0.55 * (1 - u);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + 8 * easeOut(u), (2 + 8 * easeOut(u)) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // The glove: a little above its spot between taps, down on it at each tap (squashed a touch).
    const g = gloveAt(t);
    const squash = 1 - 0.07 * (1 - g.press);
    const w = GLOVE * (2 - squash), h = GLOVE * squash;
    const up = 7 * g.press;
    ctx.shadowColor = 'rgba(58, 47, 42, 0.17)';
    ctx.shadowOffsetX = 1.5 * dpr * 0.6;
    ctx.shadowOffsetY = 2.5 * dpr * 0.6;
    ctx.drawImage(hand, g.x - w * TIP[0], g.y - up - h * TIP[1], w, h);
    ctx.restore();

    if (f === 0) {
      first = document.createElement('canvas');
      first.width = out.out.width;
      first.height = out.out.height;
      first.getContext('2d')!.drawImage(out.out, 0, 0);
    }
    // The last moments fade back to the first frame: the loop has no jump.
    const fadeU = (t - end) / FADE;
    if (fadeU > 0 && first) {
      ctx.globalAlpha = easeInOut(clamp01(fadeU));
      ctx.drawImage(first, 0, 0);
      ctx.globalAlpha = 1;
    }
    return out.out.toDataURL('image/png');
  };
  const runState: ClipRun = { frames, taps, formed: plan.formed, frame: 0, next };
  run = runState;
  return { frames, taps, formed: plan.formed };
}

const api = {
  ids: (): string[] => ENTRIES.map((e) => e.id),
  /** The entries that have a clip: the buildings (the happenings keep their still). */
  clipIds: (): string[] => COLLECTION.map((e) => e.id),
  /** Gets an entry's clip ready: how many frames, when each tap lands (seconds) and which makes the building. */
  beginClip,
  /** The clip's next frame, as a PNG data URL. */
  clipFrame: (): string => {
    if (!run) throw new Error('beginClip first');
    return run.next();
  },

  /** Renders one entry and returns it as a data URL (image/webp unless `type` says otherwise). */
  async render(id: string, opts: { quality?: number; type?: string; margin?: number; settle?: number } = {}): Promise<string> {
    const entry = ENTRIES.find((e) => e.id === id);
    if (!entry) throw new Error(`no guide entry '${id}'`);
    const scn = guideScenario(entry);
    const built = buildScenario(scn);
    const shape = resolveShape(built.world, built.terrain);
    const full = resolveDressing(shape);
    const dressing: DressingPlan = {
      ...full,
      props: full.props.filter((p) => !p.rule.startsWith(SCATTER)),
      // The events' pictures keep the town's people (L56, L57).
      actors: full.actors.filter((a) => !RESTLESS.has(a.type) || (entry.life?.residents === true && a.type === 'resident')),
    };

    const { view, life, signals } = stage(entry, scn.seed, shape, dressing, built.world, opts.margin ?? 0.07);
    const width = window.innerWidth, height = window.innerHeight;

    const steps = Math.round((opts.settle ?? entry.life?.settle ?? 2) * 30);
    // A happening the player sets off (a raid, a fire) or that comes by chance (a scuffle): started on cue.
    const cue = entry.life?.start;
    const cueAt = Math.round((cue?.at ?? 0) * 30);
    for (let i = 0; i < steps; i++) {
      if (cue && i === cueAt) {
        const [x, y, z] = cue.where ?? [0, 0, 0];
        if (cue.what === 'raid') raidsOf(view.stage).summon({ at: { x, z } });
        else if (cue.what === 'fire') mischiefOf(view.stage).ignite(key(Math.floor(x), y, Math.floor(z)));
        else if (cue.what === 'scuffle') (globalThis as { __lcTown?: { crowd: { scuffles: { provoke(): unknown } } } }).__lcTown?.crowd.scuffles.provoke();
      }
      life.update(signals.advance(1 / 30));
    }
    for (let i = 0; i < 6; i++) {
      view.render(signals);
      await nextFrame();
    }

    const out = document.createElement('canvas');
    out.width = Math.round(width * window.devicePixelRatio);
    out.height = Math.round(height * window.devicePixelRatio);
    const ctx = out.getContext('2d')!;
    ctx.drawImage(canvas, (canvas.width - out.width) / 2, (canvas.height - out.height) / 2, out.width, out.height, 0, 0, out.width, out.height);
    vignette(ctx, out.width, out.height, entry.id);
    return out.toDataURL(opts.type ?? 'image/webp', opts.quality ?? 0.8);
  },
};

declare global {
  interface Window {
    __guide?: typeof api;
  }
}
window.__guide = api;
