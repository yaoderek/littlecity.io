// Analytics (PostHog): how many come, who comes back, how long they play, what they do. Owner: Interface.
//
// Off unless the build carries a project key (VITE_POSTHOG_KEY, in .env.production); off in a
// scenario or with ?analytics=off; and off in dev and under automation (browser tests, captures)
// unless the URL says ?analytics=on. PostHog itself loads after the town is on screen; anything tracked before that
// waits in a queue. Nothing here touches the town.
//
// The events (keep this list and the PostHog dashboards in step):
//   town_opened       {how: shared | shared_visiting | saved | new}
//   playtime          {seconds, uses, use_<item>, erased, mischief_<tool>}: every 30 s of play (the tab on
//                     screen and some input in the last 3 minutes), and whatever is left when the tab hides.
//                     uses: clicks that did something with a piece or a land tool (use_<item> says which).
//                     Clicks are tallied into it rather than sent one by one. Also how it ran: fps (the usual
//                     frame), long_frames (per cent of frames over 50 ms), quality (the sharpness level, 0 best).
//   first_build       {seconds, item}: the first piece this visit placed by hand, and how long after the game appeared
//   piece_refused     {reason, item}: a click that could not be done and why (the first 20 of a visit)
//   building_earned   {role, grown}: a kind of building this browser had never seen, appearing after an
//                     edit (grown: a "grow a town" made it, not the player's hand)
//   building_unlocked {entry, role, group, built}: the player built one of the almanac's buildings by hand for the
//                     first time ever (src/ui/unlock.ts; role is the entry's role, or its id when the dressing proves it;
//                     built: how many they have built now)
//   tutorial_shown    {step: place | undo, touch}: the tutorial hand came up (src/ui/tutorial.ts), once per step a visit
//   tutorial_step     {step: placed | undone | moved-on | timed-out | rested, from, seconds, touch}: what the player
//                     did about it (moved-on: built on instead of undoing; rested: left alone, put away for the visit)
//   dot_cleared       {what: almanac | fly | mischief | grow, after_unlock, on_screen}: the player first used a thing that
//                     carried a red dot (src/ui/dots.ts), or the Almanac after an unlock brought its dot back
//                     (after_unlock); on_screen: the dot was drawn at that moment (not hidden by a growing town)
//   town_grew         {blocks, grown}: this browser's biggest town passed 10, 25, 50, 100, 250, 500 or 1000 blocks
//   town_shared       {via: link | link_box | file}
//   postcard_saved, town_downloaded, town_file_opened, shared_town_kept, shared_town_left,
//   town_grown {new_island}, new_island, guide_opened (the Almanac), fly_started
// Every event carries build, lang (the language the game is shown in, src/i18n), touch, and (for telling slow devices apart) gpu, cores and memory.
// PostHog adds its own: $pageview, $pageleave, $web_vitals, clicks on the interface (autocapture), and session
// replays (desktops only, and not slow ones, with the town in them).
//
// A share link carries the whole town in the URL fragment (#t=...): it is cut from every URL sent.

import { currentLang } from '@/i18n';
import type { CaptureResult, PostHog } from 'posthog-js';
import type { ShapePlan } from '@/resolve/plan';

type Props = Record<string, string | number | boolean>;

const KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim();
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || 'https://us.i.posthog.com';
/** The commit the build came from (tools/deploy-pages.sh sets it), so versions can be compared. */
const BUILD = (import.meta.env.VITE_BUILD as string | undefined) ?? 'dev';

/** Seconds of play per playtime event. */
const PING = 30;
/** No input for this long and the clock stops (someone who walked away from an open tab). */
const IDLE = 180;
const SIZES = [10, 25, 50, 100, 250, 500, 1000];
const ROLES_KEY = 'lc-analytics-roles';
const SIZE_KEY = 'lc-analytics-size';

let on = false;
let ph: PostHog | null = null;
const queue: [string, Props | undefined][] = [];
const tallies = new Map<string, number>();
let growing: () => boolean = () => false;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage full or refused: it is only forgotten next time.
  }
}

/** Sends an event (or queues it until PostHog has loaded). Does nothing when analytics is off. */
export function track(event: string, props?: Props): void {
  if (!on) return;
  if (ph) ph.capture(event, props);
  else queue.push([event, props]);
}

/** Counts something frequent into the next playtime event instead of sending it on its own. */
export function tally(name: string, n = 1): void {
  if (on) tallies.set(name, (tallies.get(name) ?? 0) + n);
}

/** Lets the town's changes say whether "grow a town" made them. */
export function watchGrowth(isGrowing: () => boolean): void {
  growing = isGrowing;
}

/** The device could hardly draw the town: it is spared the recorder (its pictures of the canvas, its watching). */
let slow = false;
export function slowDevice(): void {
  if (slow) return;
  slow = true;
  ph?.stopSessionRecording();
}

/** The chip's name out of what a browser says of its graphics ("ANGLE (Intel, Intel(R) UHD Graphics 620 …)"). */
export function chip(gpu: string): string {
  const angle = /^ANGLE \([^,]*, (?:ANGLE Metal Renderer: )?(.*?)(?: Direct3D| \(0x|, |\)$)/.exec(gpu);
  return (angle?.[1] ?? gpu).slice(0, 48);
}

// ── how it runs ──────────────────────────────────────────────────────────
/** Frames since the last playtime event, by their length in 4 ms steps. */
const STEP = 4;
const frames = new Uint32Array(64);
let level = 0;
/** Once a frame: how long since the last (ms), and the sharpness level it was drawn at. */
export function frameDrawn(gap: number, quality: number): void {
  if (!on || gap > 2000) return; // a hidden tab
  frames[Math.min(frames.length - 1, Math.max(0, Math.round(gap / STEP)))]!++;
  level = quality;
}

/** The usual frame's rate and the share of long frames, and starts counting over. */
function running(): Props {
  let all = 0, long = 0;
  for (let i = 0; i < frames.length; i++) {
    all += frames[i]!;
    if (i * STEP > 50) long += frames[i]!;
  }
  if (all < 30) return {};
  let half = 0, median = 0;
  while (half * 2 < all) half += frames[median++]!;
  frames.fill(0);
  return { fps: Math.round(1000 / Math.max(STEP, (median - 1) * STEP)), long_frames: Math.round((long / all) * 100), quality: level };
}

// ── finding one's way ────────────────────────────────────────────────────
let opened = 0;
let built = false;
let refusals = 0;
/** A piece went down by the player's own hand. */
export function builtByHand(item: string): void {
  if (built) return;
  built = true;
  track('first_build', { seconds: Math.round((performance.now() - opened) / 1000), item });
}
/** A click that could not be done. */
export function refused(reason: string, item: string): void {
  if (refusals++ < 20) track('piece_refused', { reason, item });
}

/** Turns analytics on for this page, if it should be. Call once, after the town is set up. */
export function startAnalytics(opts: { scenario: boolean; gpu?: string }): void {
  const asked = new URLSearchParams(location.search).get('analytics');
  const automated = (navigator as { webdriver?: boolean }).webdriver === true;
  if (on || !KEY || asked === 'off' || opts.scenario) return;
  // ?analytics=on is how a test or a developer turns it on where it would otherwise stay off.
  if (asked !== 'on' && (automated || !import.meta.env.PROD)) return;
  on = true;
  opened = performance.now();
  startClock();
  const load = (): void => {
    import('posthog-js')
      .then(({ default: posthog }) => {
        // Replays are recorded on desktops (a fine pointer) only, and not on slow ones: a phone is spared the recorder altogether (its
        // download, its watching of the page, the pictures and their upload). Phones still send events.
        //
        // A desktop replay carries the town (a WebGL canvas) as two pictures a second.
        // This works because the renderer made its WebGL context before PostHog loaded: the recorder forces
        // preserveDrawingBuffer only on contexts made after it, and for a context it saw being made without
        // it, it clears the canvas before each picture (a blank frame, and a flicker in the game). So nothing
        // may call canvas.getContext('webgl2') on the town's canvas while the game runs; the renderer's own
        // renderer.getContext() is fine. Each picture is taken in a frame callback after the game's own,
        // while the frame just drawn is still in the canvas.
        const desktop = window.matchMedia('(pointer: fine)').matches;
        posthog.init(KEY, {
          api_host: HOST,
          defaults: '2026-05-30',
          persistence: 'localStorage',
          person_profiles: 'always',
          respect_dnt: true,
          before_send: scrub,
          // PostHog drops browsers that look automated; a test that asked for analytics wants its events.
          opt_out_useragent_filter: asked === 'on',
          disable_session_recording: !desktop || slow,
          session_recording: {
            maskAllInputs: true,
            captureCanvas: { recordCanvas: true, canvasFps: 2, canvasQuality: '0.4' },
          },
        });
        const nav = navigator as { hardwareConcurrency?: number; deviceMemory?: number };
        posthog.register({ build: BUILD, lang: currentLang(), touch: !desktop, gpu: chip(opts.gpu ?? ''), cores: nav.hardwareConcurrency ?? 0, memory: nav.deviceMemory ?? 0 });
        ph = posthog;
        for (const [event, props] of queue.splice(0)) posthog.capture(event, props);
      })
      .catch(() => {
        // Blocked (an ad blocker) or offline: analytics stays off for this page.
        on = false;
        queue.length = 0;
      });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 1500);
}

/** Cuts a share link's town out of a URL. */
function cut(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const at = v.indexOf('#t=');
  return at < 0 ? v : v.slice(0, at);
}

/** Every URL in an event without a share link's town (exported for the test). */
export function scrub(r: CaptureResult | null): CaptureResult | null {
  if (!r) return r;
  for (const bag of [r.properties, r.$set, r.$set_once]) {
    if (!bag) continue;
    for (const k of Object.keys(bag)) bag[k] = cut(bag[k]);
  }
  return r;
}

// ── playtime ─────────────────────────────────────────────────────────────
/** Seconds of play not yet sent. */
let played = 0;
let lastInput = 0;
let lastTick = 0;

function startClock(): void {
  lastInput = lastTick = performance.now();
  const touched = (): void => {
    lastInput = performance.now();
  };
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(type, touched, { passive: true, capture: true });
  // The time between ticks, not the number of ticks: a busy page (a slow phone) ticks late. A gap of
  // more than 15 s is a computer that was asleep, and counts as nothing.
  setInterval(() => {
    const now = performance.now();
    const step = (now - lastTick) / 1000;
    lastTick = now;
    if (step > 15 || document.visibilityState !== 'visible' || now - lastInput > IDLE * 1000) return;
    played += step;
    if (played >= PING) ping(false);
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ping(true);
    else lastTick = performance.now();
  });
  window.addEventListener('pagehide', () => ping(true));
}

function ping(leaving: boolean): void {
  const seconds = Math.round(played);
  if (seconds === 0 && tallies.size === 0) return;
  const props: Props = { seconds, ...running(), ...Object.fromEntries(tallies) };
  played = 0;
  tallies.clear();
  // Leaving: a beacon, which the browser still sends after the page has gone.
  if (ph) ph.capture('playtime', props, leaving ? { transport: 'sendBeacon' } : undefined);
  else queue.push(['playtime', props]);
}

// ── what the town has come to ────────────────────────────────────────────
let seenRoles: Set<string> | null = null;
let biggest = -1;

/**
 * The town on screen changed. `edited`: an edit changed it (the player's hand, or a growing town), as
 * opposed to a town being opened, an undo or a redo: only an edit counts as earning something.
 */
export function townShown(shape: ShapePlan, edited: boolean): void {
  if (!on) return;
  const store = storage();
  if (seenRoles === null) {
    seenRoles = new Set(store?.getItem(ROLES_KEY)?.split(',').filter(Boolean) ?? []);
    biggest = Number(store?.getItem(SIZE_KEY)) || 0;
  }
  const grown = growing();
  let newRoles = false;
  for (const { role } of shape.roles.values()) {
    if (seenRoles.has(role)) continue;
    seenRoles.add(role);
    newRoles = true;
    if (edited) track('building_earned', { role, grown });
  }
  if (newRoles) remember(ROLES_KEY, [...seenRoles].join(','));
  const blocks = shape.world.blocks.size;
  if (blocks > biggest) {
    if (edited) for (const size of SIZES) if (size > biggest && size <= blocks) track('town_grew', { blocks: size, grown });
    biggest = blocks;
    remember(SIZE_KEY, String(blocks));
  }
}
