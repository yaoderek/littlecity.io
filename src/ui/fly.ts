// Fly mode (design section 7, "Fly mode"): from wherever the camera is, fly
// round the town Minecraft style, then glide back. Owner: Interface.
//
//   in        the wings button in the top bar, or F. The builder's camera turns into a perspective eye without a jump:
//             a dolly zoom from a very narrow field of view (which draws the
//             same picture as the builder's orthographic camera) out to the
//             flying one, the eye coming in along the line it looks down.
//   flying    the mouse looks (the cursor is captured), W A S D move the way
//             the eye looks, Space up, Shift down, the wheel sets the speed.
//             Nothing can be built: a layer over the town takes every click.
//   out       Escape, or the cursor being let go (browsers take Escape for
//             themselves while the cursor is captured, so losing it is the
//             signal that counts): the eye glides back along a way clear of
//             everything to where the dolly zoom ended, and the dolly zoom
//             runs backwards to the builder's view as it was.
//
// On a touch screen a thumb low on the left holds a stick, a finger anywhere
// else looks, and a Land button glides back (src/fly/thumbs.ts).
//
// The flying itself and what is in the way are src/fly (pure, fixed step).
// This file is input, the glides and the DOM. Fly mode never edits the town.

import { track } from '@/app/analytics';
import type { CameraPose, EyePose, TownView } from '@/render/api';
import { eyeMatchingOrbit } from '@/render/eyecam';
import type { DressingPlan, ShapePlan } from '@/resolve/plan';
import { changeSpeed, clearAt, startFlight, stepFlight, type FlightState } from '@/fly/flight';
import { along, clearPath, planPath, type Vec3 } from '@/fly/glide';
import { FLY_FOV, flyFov } from '@/fly/lens';
import { addDrag, addLook, applyLook, newLook } from '@/fly/look';
import { createSolidMap, type SolidMap } from '@/fly/solid';
import { createThumbs } from '@/fly/thumbs';
import { t } from '@/i18n';
import { el, iconButton, isCoarsePointer } from './dom';

/** The dolly zoom starts (and the way out ends) at this field of view: the builder's picture, near enough. */
const FLAT_FOV = 0.5;
/** Seconds: the way in, and the way out (gliding back and the dolly zoom together). */
const IN_SECONDS = 0.7;
const OUT_SECONDS = 0.9;
/** How quickly the lens opens once in, on a touch screen (1/s). */
const LENS_RATE = 5;
/** The longest a first tap on the wings waits for the eye's shaders, milliseconds. */
const PREPARE_LONGEST = 2500;

export interface FlyHost {
  view: TownView;
  shape(): ShapePlan;
  /** Fly mode began (true) or ended (false): the interface hides and shows its building tools. */
  changed(flying: boolean): void;
}

export type FlyPhase = 'off' | 'in' | 'flying' | 'out';

export interface FlyDebug {
  phase: FlyPhase;
  eye: [number, number, number] | null;
  yaw: number;
  pitch: number;
  fov: number;
  speed: number;
  locked: boolean;
  /** The builder's camera fly mode began from (and goes back to). */
  from: CameraPose | null;
}

export interface FlyMode {
  /** The wings for the top bar. */
  readonly button: HTMLButtonElement;
  /** The layer over the town while flying (it takes every click and the wheel), with the hint. */
  readonly el: HTMLElement;
  /** Flying, or gliding in or out. */
  readonly active: boolean;
  readonly phase: FlyPhase;
  /** Takes off from the camera as it is. False if fly mode is already on. */
  enter(): boolean;
  /** Glides back to the builder's view (or cuts to it with `instant`). */
  exit(opts?: { instant?: boolean }): void;
  /** The newest dressing (props are in the way too). */
  dressed(dressing: DressingPlan): void;
  /** Once a frame before the town is drawn; dt in real seconds. */
  frame(dt: number): void;
  /**
   * For tests, where the cursor cannot be captured: hold a key down or let it go (`code` as
   * KeyboardEvent.code), turn the eye as a mouse movement of (dx, dy) CSS pixels would, and act as if
   * the browser let the cursor go.
   */
  testKey(code: string, down: boolean): void;
  testLook(dx: number, dy: number): void;
  testLoseLock(): void;
  /** For tests and stills: puts the flying eye here (world units), looking yaw / pitch, at rest. */
  testPlace(eye: readonly [number, number, number], yaw: number, pitch: number): void;
  /** For tests and stills: holds the way in or out still at t (0 to 1), or lets it run with null. */
  testHold(t: number | null): void;
  debug(): FlyDebug;
  dispose(): void;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrap = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;
const DEG = Math.PI / 180;
/** A field of view between two, eased so the picture's scale changes evenly (by the tangent). */
const fovBetween = (a: number, b: number, t: number): number => (2 * Math.atan(lerp(Math.tan((a * DEG) / 2), Math.tan((b * DEG) / 2), t))) / DEG;

/** What the fly button and layer say (out here: inside createFly, `t` is the way in or out). */
const words = (): { fly: string; flyTouch: string; land: string; keys: string; landButton: string; look: string } => ({
  fly: t('Fly (F)'),
  flyTouch: t('Fly'),
  landButton: t('Land'),
  look: t('Drag to look'),
  land: t('Esc to land'),
  keys: t('W A S D fly · Space up · Shift down · wheel for speed'),
});
const speedWords = (speed: string): string => t('Speed ×{speed}', { speed });

/** Keys that fly (KeyboardEvent.code). */
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);

export function createFly(host: FlyHost): FlyMode {
  const { view } = host;
  const touch = isCoarsePointer();
  let dressing: DressingPlan | null = null;
  let map: SolidMap | null = null;
  let mapFor: { shape: ShapePlan | null; dressing: DressingPlan | null } = { shape: null, dressing: null };
  let phase: FlyPhase = 'off';
  /** The builder's camera at take-off, and the field of view the dolly zoom ends at. */
  let from: CameraPose | null = null;
  let endFov = FLY_FOV;
  let flight: FlightState | null = null;
  let fov = FLY_FOV;
  /** 0 to 1 through the way in or out. */
  let t = 0;
  /** The way out: the path (eye positions) back to the end of the dolly zoom, and the pose it starts from. */
  let out: { path: Vec3[]; yaw: number; pitch: number; fov: number; share: number } | null = null;
  let locked = false;
  const keys = new Set<string>();
  /** The speed note in the hint shows for a moment after the wheel turns. */
  let speedShownAt = -1;
  /** Tests hold the way in or out still at this t. */
  let held: number | null = null;

  // ── the DOM ────────────────────────────────────────────────────────────
  const said = words();
  const button = iconButton('wings', touch ? said.flyTouch : said.fly, { class: 'lc-round', attrs: { 'data-ui': 'fly' } });
  const speedNote = el('span', { class: 'lc-fly-speed', attrs: { 'data-ui': 'fly-speed', hidden: '' } });
  const hint = el('div', { class: 'lc-card lc-fly-hint', attrs: { 'data-ui': 'fly-hint' } }, [
    el('b', { text: said.land }),
    el('span', { text: said.keys }),
    speedNote,
  ]);
  const land = el('button', { class: 'lc-card lc-text-btn lc-fly-land', text: said.landButton, attrs: { type: 'button', 'data-ui': 'fly-land' } });
  const knob = el('div', { class: 'lc-fly-knob' });
  const stick = el('div', { class: 'lc-fly-stick', attrs: { 'data-ui': 'fly-stick', 'aria-hidden': 'true' } }, [knob]);
  const lookHint = el('div', { class: 'lc-card lc-fly-look', text: said.look, attrs: { 'data-ui': 'fly-look' } });
  const layer = el('div', { class: 'lc-fly', attrs: { 'data-ui': 'fly-layer', hidden: '' } }, touch ? [stick, lookHint, land] : [hint]);

  const solid = (): SolidMap => {
    const shape = host.shape();
    if (!map || mapFor.shape !== shape || mapFor.dressing !== dressing) {
      map = createSolidMap(shape, dressing);
      mapFor = { shape, dressing };
    }
    return map;
  };

  const size = (): { w: number; h: number } => {
    const r = view.canvas.getBoundingClientRect();
    return { w: Math.max(1, r.width || view.canvas.clientWidth || window.innerWidth), h: Math.max(1, r.height || view.canvas.clientHeight || window.innerHeight) };
  };
  const lens = (): number => {
    const { w, h } = size();
    return flyFov(w / h);
  };
  const matching = (cam: CameraPose, f: number): EyePose => {
    const { w, h } = size();
    return eyeMatchingOrbit(cam, f, w, h);
  };

  /**
   * The flying field of view: the widest of a few for which the dolly zoom's line (from the eye it ends
   * at, back up over everything) is clear. Zoomed right in, the eye of a wide view would end up
   * among (or inside) the houses.
   */
  const chooseFov = (cam: CameraPose): number => {
    const m = solid();
    const wide = lens();
    for (const f of [...(wide > FLY_FOV ? [wide] : []), FLY_FOV, 50, 40, 30, 22, 16, 11, 8]) {
      const e = matching(cam, f);
      const far = matching(cam, f * 0.5).eye;
      // Only the stretch below the top of the town can meet anything.
      const dy = far[1] - e.eye[1];
      const k = dy > 1e-6 ? Math.min(1, (m.top + 0.5 - e.eye[1]) / dy) : 1;
      const end: Vec3 = [e.eye[0] + (far[0] - e.eye[0]) * k, e.eye[1] + (far[1] - e.eye[1]) * k, e.eye[2] + (far[2] - e.eye[2]) * k];
      if (clearAt(m, e.eye) && (k <= 0 || clearPath(m, e.eye, end))) return f;
    }
    return 8;
  };

  const show = (pose: EyePose): void => view.setEyeCamera(pose);

  const setPhase = (next: FlyPhase): void => {
    const was = phase;
    phase = next;
    if ((was === 'off') !== (next === 'off')) {
      layer.toggleAttribute('hidden', next === 'off');
      host.changed(next !== 'off');
    }
  };

  // ── the cursor ─────────────────────────────────────────────────────────
  const lock = (): void => {
    if (touch) return;
    try {
      const p = layer.requestPointerLock() as unknown as Promise<void> | undefined;
      // Refused (no user gesture, an embedded page, a headless browser): fly on, looking by plain mouse movement.
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      // as above
    }
  };
  const onLockChange = (): void => {
    const now = document.pointerLockElement === layer;
    if (now) {
      locked = true;
      return;
    }
    if (!locked) return;
    locked = false;
    // The browser let the cursor go (Escape, or switching away): back to the builder's view.
    if (phase === 'in' || phase === 'flying') api.exit();
  };
  document.addEventListener('pointerlockchange', onLockChange);

  // ── input ──────────────────────────────────────────────────────────────
  /** Mouse movement since the last frame: added up here, applied once at the start of the next frame. */
  const lookSum = newLook();
  const look = (dx: number, dy: number): void => {
    if (!flight || phase !== 'flying') return;
    addLook(lookSum, dx, dy);
  };
  layer.addEventListener('mousemove', (e) => {
    if (touch) return;
    // With the cursor captured every movement counts; without it, only while it is over the town.
    look(e.movementX, e.movementY);
  });
  // ── thumbs ─────────────────────────────────────────────────────────────
  const thumbs = createThumbs();
  /** Draws the stick where it is held, or at rest at the bottom left. */
  const showStick = (): void => {
    const { base, thumb } = thumbs;
    stick.classList.toggle('lc-fly-held', base !== null);
    if (!base || !thumb) {
      stick.style.translate = knob.style.translate = '';
      return;
    }
    stick.style.translate = `${base.x - stick.offsetLeft - stick.offsetWidth / 2}px ${base.y - stick.offsetTop - stick.offsetHeight / 2}px`;
    knob.style.translate = `${thumb.x - base.x}px ${thumb.y - base.y}px`;
  };
  const letGo = (): void => {
    thumbs.reset();
    lookSum.dx = lookSum.dy = 0;
    showStick();
  };
  if (touch) {
    const at = (e: PointerEvent): { x: number; y: number; w: number; h: number } => {
      const r = layer.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };
    layer.addEventListener('pointerdown', (e) => {
      if (land.contains(e.target as Node)) return;
      const p = at(e);
      if (!thumbs.down(e.pointerId, p.x, p.y, p.w, p.h)) return;
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        // The finger is already gone; its end comes as a cancel.
      }
      showStick();
    });
    layer.addEventListener('pointermove', (e) => {
      const p = at(e);
      const by = thumbs.move(e.pointerId, p.x, p.y);
      if (by && flight && phase === 'flying') {
        addDrag(lookSum, by.dx, by.dy);
        lookHint.hidden = true;
      }
      showStick();
    });
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      layer.addEventListener(end, (e) => {
        thumbs.up(e.pointerId);
        showStick();
      });
    }
    // iOS: no text loupe, and no swipe back to the last page from the edge the stick is near.
    layer.addEventListener(
      'touchstart',
      (e) => {
        if (!land.contains(e.target as Node)) e.preventDefault();
      },
      { passive: false },
    );
    land.addEventListener('click', () => api.exit());
  }
  layer.addEventListener('pointerdown', (e) => {
    if (touch) return;
    e.preventDefault();
    // Clicking the town while flying builds nothing; it takes the cursor back if it was let go.
    if (!locked && phase === 'flying') lock();
  });
  layer.addEventListener('contextmenu', (e) => e.preventDefault());
  layer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (!flight) return;
      const notches = e.deltaMode === 0 ? -e.deltaY / 100 : -e.deltaY;
      changeSpeed(flight, Math.max(-3, Math.min(3, notches)));
      speedNote.textContent = speedWords(flight.scale < 1 ? flight.scale.toFixed(2) : flight.scale.toFixed(1));
      speedNote.hidden = false;
      speedShownAt = performance.now();
    },
    { passive: false },
  );
  const onKey = (e: KeyboardEvent): void => {
    if (phase === 'off') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (phase === 'in' || phase === 'flying') api.exit();
      return;
    }
    if (FLY_KEYS.has(e.code)) {
      e.preventDefault();
      keys.add(e.code);
    }
    // Nothing else reaches the builder while flying (no tools by number, no undo).
    e.stopImmediatePropagation();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };
  const clearKeys = (): void => {
    keys.clear();
    letGo();
  };
  const onHide = (): void => {
    if (document.hidden) clearKeys();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', onHide);

  const input = (): { forward: number; strafe: number; rise: number } => {
    const k = (c: string): number => (keys.has(c) ? 1 : 0);
    return {
      forward: k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + thumbs.stick.y,
      strafe: k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + thumbs.stick.x,
      rise: k('Space') - k('ShiftLeft') - k('ShiftRight'),
    };
  };

  // ── the way in and out ─────────────────────────────────────────────────
  const outPose = (s: number): EyePose => {
    const o = out!;
    if (s < o.share) {
      // Back along the clear path to where the dolly zoom ended, turning to face as the builder did.
      const k = o.share > 0 ? s / o.share : 1;
      const end = matching(from!, endFov);
      return { eye: along(o.path, k), yaw: o.yaw + wrap(end.yaw - o.yaw) * k, pitch: lerp(o.pitch, end.pitch, k), fov: lerp(o.fov, endFov, k) };
    }
    // The dolly zoom, backwards: out to the builder's picture.
    const k = o.share < 1 ? (s - o.share) / (1 - o.share) : 1;
    return matching(from!, fovBetween(endFov, FLAT_FOV, k));
  };

  const finish = (): void => {
    view.setEyeCamera(null);
    if (from) view.setCamera(from);
    flight = null;
    out = null;
    clearKeys();
    if (locked && document.pointerLockElement === layer) {
      locked = false;
      document.exitPointerLock();
    }
    setPhase('off');
  };

  const api: FlyMode = {
    button,
    el: layer,
    get active() {
      return phase !== 'off';
    },
    get phase() {
      return phase;
    },
    enter() {
      if (phase !== 'off') return false;
      track('fly_started');
      // The camera as drawn: an ease still under way is finished first.
      from = view.getCamera();
      view.setCamera(from);
      from = view.getCamera();
      endFov = chooseFov(from);
      fov = endFov;
      t = 0;
      clearKeys();
      setPhase('in');
      show(matching(from, FLAT_FOV));
      lock();
      return true;
    },
    exit(opts = {}) {
      if (phase === 'off') return;
      if (opts.instant || !from) return finish();
      if (phase === 'out') return;
      if (phase === 'in') {
        // Not yet in: the dolly zoom simply runs back from where it is.
        out = { path: [], yaw: 0, pitch: 0, fov: endFov, share: 0 };
        t = 1 - t;
      } else {
        const now = view.getEyeCamera()!;
        const end = matching(from, endFov);
        const path = planPath(solid(), now.eye as Vec3, end.eye as Vec3, now.yaw, end.yaw);
        const len = path.reduce((s, p, i) => (i === 0 ? 0 : s + Math.hypot(p[0] - path[i - 1]![0], p[1] - path[i - 1]![1], p[2] - path[i - 1]![2])), 0);
        const turn = Math.abs(wrap(end.yaw - now.yaw)) + Math.abs(end.pitch - now.pitch);
        out = { path, yaw: now.yaw, pitch: now.pitch, fov: now.fov, share: len > 1e-3 || turn > 0.1 || Math.abs(now.fov - endFov) > 0.1 ? 0.6 : 0 };
        t = 0;
      }
      clearKeys();
      setPhase('out');
      if (locked && document.pointerLockElement === layer) {
        locked = false;
        document.exitPointerLock();
      }
    },
    dressed(d) {
      dressing = d;
    },
    frame(dt) {
      if (speedShownAt >= 0 && performance.now() - speedShownAt > 1500) {
        speedShownAt = -1;
        speedNote.hidden = true;
      }
      if (phase === 'off' || !from) return;
      if (phase === 'in') {
        t = held ?? Math.min(1, t + dt / IN_SECONDS);
        const pose = matching(from, fovBetween(FLAT_FOV, endFov, smooth(t)));
        show(pose);
        if (t >= 1) {
          flight = startFlight(solid(), pose.eye, pose.yaw, pose.pitch, flight?.scale ?? 1);
          fov = endFov;
          setPhase('flying');
        }
        return;
      }
      if (phase === 'flying' && flight) {
        // One camera update a frame, in this order: the look (all the mouse moved since the last
        // frame, unsmoothed), then the flight and its collisions over this frame's time, then the eye.
        applyLook(flight, lookSum);
        stepFlight(solid(), flight, input(), dt);
        // A phone has no room for a narrow lens (a flight begun zoomed in), and may be turned over.
        if (touch) fov += (lens() - fov) * (1 - Math.exp(-LENS_RATE * Math.min(dt, 0.1)));
        show({ eye: flight.eye, yaw: flight.yaw, pitch: flight.pitch, fov });
        return;
      }
      if (phase === 'out' && out) {
        t = held ?? Math.min(1, t + dt / OUT_SECONDS);
        show(outPose(smooth(t)));
        if (t >= 1) finish();
      }
    },
    testKey(code, down) {
      if (phase === 'off') return;
      if (down) keys.add(code);
      else keys.delete(code);
    },
    testLook: (dx, dy) => look(dx, dy),
    testPlace(eye, yaw, pitch) {
      if (phase !== 'flying') return;
      lookSum.dx = lookSum.dy = 0;
      flight = startFlight(solid(), eye, yaw, pitch, flight?.scale ?? 1);
      show({ eye: flight.eye, yaw, pitch, fov });
    },
    testHold(at) {
      held = at === null ? null : Math.min(1, Math.max(0, at));
    },
    testLoseLock() {
      // As the browser letting the cursor go would.
      if (locked && document.pointerLockElement === layer) return void document.exitPointerLock();
      locked = true;
      onLockChange();
    },
    debug() {
      const e = view.getEyeCamera();
      return {
        phase,
        eye: e ? [e.eye[0], e.eye[1], e.eye[2]] : null,
        yaw: e?.yaw ?? 0,
        pitch: e?.pitch ?? 0,
        fov: e?.fov ?? 0,
        speed: flight ? Math.hypot(...flight.vel) : 0,
        locked,
        from,
      };
    },
    dispose() {
      if (phase !== 'off') finish();
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', onHide);
      disposed = true;
      layer.remove();
    },
  };
  // The eye's shaders and target are made while the page is idle, not on the first take-off (a frame
  // of about 65 ms at a pixel ratio of 2 otherwise: a visible stall as the glide begins).
  // A phone makes them on the first tap instead: its page start is the lighter, and few fly.
  let preparing = false;
  let disposed = false;
  button.addEventListener('click', () => {
    if (!touch || !view.prepareEye) return void api.enter();
    if (preparing) return;
    preparing = true;
    button.classList.add('lc-busy');
    const ready = view.prepareEye();
    void Promise.race([ready, new Promise((done) => setTimeout(done, PREPARE_LONGEST))]).then(() => {
      preparing = false;
      button.classList.remove('lc-busy');
      if (!disposed) api.enter();
    });
  });
  if (!touch && view.prepareEye && view.buildsAhead?.() !== false) {
    const prepare = (): void => void view.prepareEye?.();
    const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(prepare, { timeout: 4000 });
    else setTimeout(prepare, 1500);
  }
  return api;
}
