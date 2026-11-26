// The app: wiring and the main loop (CONTRACTS section 12). Owner: Interface.
//
//   world → staged resolve → view → life, once per edit (src/app/game.ts)
//   signals.advance → resolver.poll → life.update → view.render, once per frame
//
// Which town opens:
//   #t=<code>          a share link: that town, as a copy (design section 15)
//   ?scenario=<name>   a scenario (never saved)
//   ?seed=<n>          a fresh island with that seed (&gen=1 for the first island generator)
//   otherwise          the autosaved town, or a fresh island
//
// How sharp the page is drawn governs itself (src/render/quality.ts): it starts at the sharpest the
// screen allows (a step below, on a big 1x screen) and steps down only while frames are slow or uneven. ?quality=<level> holds a level (0
// the sharpest); under automation (browser tests, captures) the sharpest is held unless
// ?quality=auto. ?ink=full|half fixes the ink and the pixel ratio as before. A small touch screen
// also gets a smaller crowd in life; ?density=1|2|3 (the highest rule tier that dresses the town)
// overrides it.
//
// Seasons and weather (design section 13a) run by themselves; ?season=spring|summer|autumn|winter|
// festival|<year 0..1> and ?weather=auto|clear|cloudy|rain|storm|fog|wind|snow hold them (a scenario
// can name them too), and &settle=1 brings the weather in at once (settled snow included).
//
// The words are in the player's language (src/i18n): ?lang=en|zh|es|fr|pt|ja|ko|de|tr shows one without remembering it.
//
// window.__lc is the debug handle browser tests and the console use.

import { sceneNote, type SceneNote } from './scene-note';
import { createStatsStrip } from '@/ui/stats/strip';
import { createStatsWatch } from '@/ui/stats/watch';
import { hash } from '@/core/rand';
import type { Edit, Terrain, World } from '@/core/world';
import type { LifeRuntime } from '@/life/api';
import { createLife } from '@/life/runtime';
import { mischiefOf } from '@/life/mischief/director';
import { raidsOf } from '@/life/raid/raids';
import { applyCalendar } from '@/life/season';
import { createSignals, type TownSignals } from '@/life/signals';
import { createTownView, type CameraPose } from '@/render/index';
import { createGovernor, deviceLevel, startLevel } from '@/render/quality';
import { createPace } from './pace';
import type { ShapePlan } from '@/resolve/plan';
import { buildScenario, scenarioResolveOptions, type CameraSpec, type Scenario } from '@/scenario';
import { generateTerrain, initialWorld, NEW_ISLAND_GEN, terrainOf, type TerrainGen } from '@/terrain/terrain';
import { download, townFromHash, townPicture } from '@/ui/files';
import { dressDue, onlyStartingTrees } from '@/ui/growth';
import { isPhone } from '@/ui/dom';
import { createInterface, type Interface } from '@/ui/interface';
import { loadTown } from '@/world/save';
import { frameDrawn, slowDevice, startAnalytics, track, townShown } from './analytics';
import { createAutosave } from './autosave';
import { createGame, type GameStart } from './game';
import { createMusic } from './music';
import { browserLibrary } from './library';
import { createKeeper, ID_KEY } from './towns';
import { dismissLoader } from './loader';
import { currentLang, LANG_KEY, loadLanguage, pickLang, t, type Lang } from '@/i18n';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A new island: the newest generator (design section 6), unless the URL asks for the first (tests pin it). */
function freshIsland(seed: number, pinned?: TerrainGen): GameStart {
  const gen: TerrainGen = pinned ?? (new URLSearchParams(location.search).get('gen') === '1' ? 1 : NEW_ISLAND_GEN);
  const terrain = generateTerrain(seed, gen);
  return { terrain, world: initialWorld(seed, terrain, gen) };
}
/** A saved or shared town: on the island its own generator made (World.terrainGen; absent = 1). */
const townOf = (world: World): GameStart => ({ world, terrain: terrainOf(world) });
const newSeed = (): number => hash(Date.now() | 0, 'island', Math.floor(Math.random() * 0x7fffffff)) | 0;

// ── which language (src/i18n) ────────────────────────────────────────────
// Before anything says a word: ?lang= (a preview), the player's choice in the menu, the browser's languages.
await loadLanguage(pickLang({ param: new URLSearchParams(location.search).get('lang'), chosen: storage()?.getItem(LANG_KEY), browser: navigator.languages ?? [navigator.language], path: location.pathname }));
// The tab's name in the player's language (a link shared in another opens with that language's title).
document.title = t('Little City: A hand-drawn city builder in your browser');

// ── which town ───────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const scenarioName = params.get('scenario');
const seedParam = params.get('seed');
// The scenarios are fetched only when one is asked for. Never import them at the top of this file: some
// (scenarios/core/grown-*) plan a whole town as they load, and all of them together were four fifths of
// the page's start on a slow phone, for players who never see one (tests/e2e/start.e2e.test.ts).
let scn: Scenario | undefined = scenarioName ? (await import('@/scenario/discover')).findScenario(scenarioName) : undefined;
if (scenarioName && !scn) console.warn(`no scenario named '${scenarioName}'`);

// My towns (src/app/towns.ts): the keeper files the saved town in the library before anything can be saved over it.
/** The town on screen, once the game exists (the keeper asks before it does). */
let gameNow: { readonly world: World; readonly terrain: Terrain } | null = null;
/** Something of the player's is on the island: more than its starting trees, or reshaped land. */
const isTown = (w: World): boolean => (w.terrainEdits?.size ?? 0) > 0 || !onlyStartingTrees(w, gameNow?.world === w ? gameNow.terrain : terrainOf(w));
const keeper = createKeeper({
  storage: storage(),
  library: browserLibrary(storage()).then((r) => r.library),
  worth: isTown,
  onTrouble: () => ui?.feedback.toast(t('My towns could not be written just now. The town you are on is still saved.')),
});

const saved = scn || seedParam !== null ? null : loadTown(storage());
const shared = townFromHash(location.hash);
/** A shared town opened by someone who has a town of their own: shown, but not saved over theirs until they say so. */
let visiting = false;
let start: GameStart;
let scenarioCamera: CameraSpec | undefined;
if (shared?.ok) {
  start = townOf(shared.world);
  visiting = saved !== null;
  scn = undefined;
} else if (scn) {
  const built = buildScenario(scn);
  start = { world: built.world, terrain: built.terrain, resolve: scenarioResolveOptions(scn) };
  scenarioCamera = built.cameras[0];
} else if (saved) {
  start = townOf(saved);
  keeper.current = keeper.savedId;
} else {
  start = freshIsland(seedParam !== null ? Number(seedParam) | 0 : newSeed());
}

// ── device settings ──────────────────────────────────────────────────────
const inkParam = params.get('ink');
const densityParam = Number(params.get('density'));
const density = densityParam === 1 || densityParam === 2 || densityParam === 3 ? densityParam : undefined;
/** The town with the decoration density (rule tiers) asked for in the URL, if any. */
const tiered = (s: GameStart): GameStart => (density === undefined ? s : { ...s, resolve: { ...s.resolve, maxTier: density } });

// ── the parts ────────────────────────────────────────────────────────────
const canvas = document.getElementById('town') as HTMLCanvasElement;
// ?draw=packed or ?draw=plain: how the town's target is laid out (src/render/packed.ts), for the tests.
const drawParam = params.get('draw');
const view = createTownView(canvas, {
  ink: inkParam === 'full' || inkParam === 'half' ? inkParam : 'auto',
  ...(drawParam === 'packed' || drawParam === 'plain' ? { packed: drawParam === 'packed' } : {}),
});
let signals: TownSignals = createSignals(start.world.seed);
applyCalendar(signals, params.get('season') ?? scn?.season, params.get('weather') ?? scn?.weather, params.get('settle') === '1' || (scn !== undefined && (scn.season !== undefined || scn.weather !== undefined)));
let life: LifeRuntime = createLife(view.stage, signals);
let ui: Interface | null = null;
let note: SceneNote | null = null;
const statsWatch = createStatsWatch({ shape: () => game.shape });
let statsStrip: ReturnType<typeof createStatsStrip> | null = null;
/** The numbers on screen: on, except on a phone, where there is no room for them; the player's own choice (the menu) either way. */
const STATS_KEY = 'little-city.stats';
let statsOn = (storage()?.getItem(STATS_KEY) ?? (isPhone() ? 'off' : 'on')) === 'on';

const autosave = createAutosave({
  storage: storage(),
  world: () => game.world,
  write: (w) => keeper.save(w),
  onFail: () => ui?.feedback.toast(t('This browser will not let the town be saved, so it lasts only until you close the page.')),
});
autosave.enabled = !scn && !visiting;

/**
 * Frames still to come whose length says nothing of how fast the page is drawn: the town was just
 * resolved or rebuilt (an edit, its dressing). The quality governor leaves them out.
 */
let busyFrames = 0;
let lastDressed = -Infinity;
/** Mischief's edit is being shown: its changed buildings are redrawn a few a frame, not all in this one. */
let fromMischief = false;
let ghostQueued = false;
/** The dressed town is ready and the loading drawing is to go once it has been drawn. */
let loaderDue = false;
const BUSY_FRAMES = 3;
/** Milliseconds of the page's own work on the town since the last frame began. */
let townWork = 0;
/** When the dressing is worked out: at once, or on a slow device a little after the edit is drawn. */
const pace = createPace();

const game = createGame(tiered(start), {
  // CONTRACTS section 12: setTown before life.sync, so the instances exist.
  show(shape: ShapePlan, landed: Edit | null, more?: readonly Edit[]) {
    const t = performance.now();
    busyFrames = BUSY_FRAMES;
    pace.shown();
    // Mischief's edits are spread over frames. The player's own (a click, a growth piece) draws what it
    // changed and leaves mischief's waiting rebuilds waiting. Undo, redo, abort and a new town draw all now.
    view.setTown(shape, null, { spread: fromMischief || (landed !== null ? 'waiting' : false) });
    life.sync({ shape, dressing: null });
    townShown(shape, landed !== null);
    for (const e of landed ? [landed, ...(more ?? [])] : []) {
      if (e.type === 'placeBlock') signals.emit('blockLanded', e.cell);
      if (e.type === 'eraseBlock') signals.emit('blockRemoved', e.cell);
    }
    townWork += performance.now() - t;
  },
  changed() {
    ui?.sync();
    autosave.schedule();
  },
});

gameNow = game;

// Mischief (design section 13b): what it does reaches the town as ordinary edits, one undo step per act.
// The background piano: the page's, not a town's (it plays on through a new island).
const music = createMusic();

const mischief = mischiefOf(view.stage);
/** Runs one of mischief's edits with its rebuilds spread over frames. */
const spreading = (run: () => void): void => {
  fromMischief = true;
  try {
    run();
  } finally {
    fromMischief = false;
  }
};
mischief.connect({
  begin: () => game.begin(),
  apply: (edits) => spreading(() => game.editAll(edits)),
  end: () => game.end(),
  abort: () => void game.abort(),
  edit: (edits) => spreading(() => game.editAll(edits)),
  amend: (edits) => spreading(() => game.amend(edits)),
});

/** A different town: life and the signals start over with its seed; the held time of day carries across. */
function open(next: GameStart): void {
  const holding = signals.holding;
  mischief.detach();
  const { seasonHolding, weatherHolding } = signals;
  life.dispose();
  // A new island must not wait out the old one's dressing interval and show its props meanwhile.
  lastDressed = -Infinity;
  pace.reset();
  signals = createSignals(next.world.seed);
  signals.hold(holding);
  if (seasonHolding !== 'run') signals.holdSeason(seasonHolding);
  if (weatherHolding !== 'auto') signals.holdWeather(weatherHolding);
  life = createLife(view.stage, signals);
  game.restart(tiered(next));
}

/** A picture of the town on screen for My towns, if it is a kept town. */
function snap(): void {
  if (!autosave.enabled || keeper.current === null) return;
  const pic = townPicture(canvas, render);
  if (pic) keeper.thumb(pic);
}
/** Before the town on screen gives way to another: its last edits saved, its picture taken. */
function leaving(): void {
  if (!autosave.enabled) return;
  autosave.flush();
  snap();
}
/** The world when the last growth finished: growing again over it is another try, not a new town. */
let grownWorld: World | null = null;
const fileName = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-town'}.littlecity`;

function leaveSpecialTown(): void {
  scn = undefined;
  visiting = false;
  autosave.enabled = true;
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
}

function resize(): void {
  view.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
const opening = view.getCamera();
/** The whole-island view a new island opens on (Escape with nothing open glides back to it). */
function homeCamera(): CameraPose {
  const c = opening;
  // A phone held upright: pull back so the island's width fits the screen.
  return window.innerWidth < window.innerHeight ? { ...c, zoom: Math.max(0.7, c.zoom * Math.min(1, (window.innerWidth / window.innerHeight) * 1.05)) } : c;
}
view.setCamera(scenarioCamera ?? homeCamera());

function render(): void {
  view.render(signals);
}

ui = createInterface({
  view,
  game,
  language: {
    current: currentLang,
    // The town is saved, the choice remembered, and the page opened again in the new language (the
    // interface is built once, in one language). A ?lang= in the address would win, so it goes.
    choose(lang: Lang) {
      try {
        storage()?.setItem(LANG_KEY, lang);
      } catch {
        // not remembered: this page still changes
      }
      autosave.flush();
      const url = new URL(location.href);
      url.searchParams.set('lang', lang);
      if (storage()?.getItem(LANG_KEY) === lang) url.searchParams.delete('lang');
      // The same address with a #town in it would only move to the anchor: reload it.
      if (url.toString() === location.href) location.reload();
      else location.replace(url.toString());
    },
  },
  stats: {
    get on() {
      return statsOn;
    },
    set(on) {
      statsOn = on;
      statsStrip?.hide(!on);
      try {
        storage()?.setItem(STATS_KEY, on ? 'on' : 'off');
      } catch {
        // No storage: the choice lasts until the page closes.
      }
    },
  },
  time: {
    get holding() {
      return signals.holding;
    },
    hold: (mode) => signals.hold(mode),
    get phase() {
      return signals.time.phase;
    },
    glide: (mode) => signals.glideTime(mode),
    scrub: (phase) => signals.scrubTime(phase),
  },
  seasons: {
    get seasonHolding() {
      return signals.seasonHolding;
    },
    holdSeason: (mode) => signals.holdSeason(mode),
    get year() {
      return signals.season.year;
    },
    glideSeason: (mode) => signals.glideSeason(mode),
    scrubYear: (year) => signals.scrubYear(year),
    get weatherHolding() {
      return signals.weatherHolding;
    },
    holdWeather: (mode) => signals.holdWeather(mode),
  },
  renderNow: render,
  homeCamera,
  newIsland(seed) {
    leaving();
    keeper.detach();
    leaveSpecialTown();
    // A seed found for a kind of island (src/terrain/kinds.ts) was found on the newest generator.
    open(seed === undefined ? freshIsland(newSeed()) : freshIsland(seed, NEW_ISLAND_GEN));
  },
  openTown(world) {
    leaving();
    keeper.detach();
    leaveSpecialTown();
    open(townOf(world));
    autosave.schedule();
    ui?.feedback.toast(t('Town opened. It is in My towns now too.'));
  },
  growing(name, regrow) {
    // Grown over a town built by hand: that town stays as it was in My towns, and this is a new one.
    if (!regrow && autosave.enabled && game.world !== grownWorld && isTown(game.world)) {
      leaving();
      keeper.detach();
    }
    keeper.suggestName(name);
  },
  grown() {
    grownWorld = game.world;
  },
  towns: {
    async list() {
      leaving();
      const towns = await keeper.list();
      return { towns, current: autosave.enabled ? keeper.current : null };
    },
    open(id) {
      leaving();
      const result = keeper.open(id);
      if (!result.ok) return result.reason;
      leaveSpecialTown();
      open(townOf(result.world));
      return null;
    },
    rename: (id, name) => keeper.rename(id, name),
    remove: (id) => keeper.remove(id),
    download(id) {
      void keeper.list().then((all) => {
        const town = all.find((t) => t.id === id);
        if (town) download(new Blob([town.code], { type: 'text/plain' }), fileName(town.name));
      });
    },
  },
});
if (keeper.savedUnreadable) ui.feedback.toast(t('Your last town could not be opened by this version of Little City. It is kept safe in My towns.'));

// ── analytics (src/app/analytics.ts) ─────────────────────────────────────
const gpu = view.gpu?.() ?? '';
startAnalytics({ scenario: scn !== undefined, gpu });
track('town_opened', { how: shared?.ok ? (visiting ? 'shared_visiting' : 'shared') : saved ? 'saved' : 'new' });
townShown(game.shape, false);

// ── share links ──────────────────────────────────────────────────────────
if (shared && !shared.ok) {
  // A broken link: say so plainly and leave the player's own town as it is (plan Review Focus 2).
  ui.feedback.toast(shared.reason);
  history.replaceState(null, '', location.pathname + location.search);
} else if (shared?.ok && visiting) {
  ui.feedback.banner(t('This is a town someone shared with you.'), [
    {
      label: t('Keep it as mine'),
      primary: true,
      run() {
        track('shared_town_kept');
        keeper.detach();
        leaveSpecialTown();
        autosave.schedule();
      },
    },
    {
      label: t('Back to my town'),
      run() {
        track('shared_town_left');
        leaveSpecialTown();
        const mine = loadTown(storage());
        keeper.current = mine ? storage()?.getItem(ID_KEY) || null : null;
        open(mine ? townOf(mine) : freshIsland(newSeed()));
      },
    },
  ]);
} else if (shared?.ok) {
  // Nobody's town is at stake: the copy simply becomes the player's town.
  leaveSpecialTown();
  autosave.schedule();
}

window.addEventListener('pagehide', () => autosave.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaving();
});

// ── how sharp ────────────────────────────────────────────────────────────
const qualityParam = params.get('quality');
const levelCount = view.quality?.().levels.length ?? 1;
const automated = (navigator as { webdriver?: boolean }).webdriver === true;
if (qualityParam !== null && qualityParam !== 'auto') view.setQuality?.(Number(qualityParam) | 0);
const governed = levelCount > 1 && (qualityParam === 'auto' || (qualityParam === null && !automated));
// Where it starts: a big screen that would be drawn at four times its pixels starts a step down
// (startLevel), a device that says it is a weak one lower (deviceLevel), and a browser that has been
// here before where it ended up last time (the governor tries a step up when frames are fast).
// ('lc:quality' remembered levels that a frame-rate cap or a passing stall had sent a device to: not read any more.)
const QUALITY_KEY = 'lc:quality.2';
const qualities = view.quality?.().levels ?? [];
/** Levels differ by screen: a level is remembered for this many of them at this pixel ratio. */
const qualityScreen = `${levelCount}@${window.devicePixelRatio}`;
function rememberedLevel(): number {
  const [screen, level] = (storage()?.getItem(QUALITY_KEY) ?? '').split(':');
  return screen === qualityScreen ? Number(level) | 0 : 0;
}
const firstLevel = governed
  ? Math.max(
      startLevel(qualities, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight),
      deviceLevel(qualities, { gpu, memory: (navigator as { deviceMemory?: number }).deviceMemory }),
      rememberedLevel(),
    )
  : 0;
if (firstLevel > 0) view.setQuality?.(firstLevel);
if (qualities[firstLevel]?.rough) slowDevice();
const governor = governed ? createGovernor(levelCount, firstLevel, (i) => qualities[i]?.rough === true) : null;
let lastPose = '';

// ── the frame loop ───────────────────────────────────────────────────────
let last = performance.now();
function frame(now: number): void {
  const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
  frameDrawn(now - last, governor?.level ?? 0);
  if (governor) {
    // A change of sharpness waits for the picture to be moving, where it does not show.
    const c = view.getCamera();
    const pose = `${c.yaw}|${c.pitch}|${c.zoom}|${c.target.join(',')}`;
    const moving = pose !== lastPose || (ui?.fly.active ?? false);
    lastPose = pose;
    const next = governor.frame(now - last, moving, busyFrames > 0, townWork);
    if (next !== null) {
      view.setQuality?.(next);
      if (qualities[next]?.rough) slowDevice();
      try {
        storage()?.setItem(QUALITY_KEY, `${qualityScreen}:${next}`);
      } catch {
        // Storage full or refused: it finds its level again next time.
      }
    }
  }
  townWork = 0;
  if (busyFrames > 0) busyFrames--;
  const dt = signals.advance((now - last) / 1000);
  last = now;
  // On a slow device the dressing waits for the piece to be drawn first, and takes only a share of the time;
  // and while a town grows it follows a few times a second, not after every piece.
  const dressFrom = performance.now();
  const ready = pace.due(dressFrom) && dressDue(now, lastDressed, (ui?.growth.active ?? false) || mischief.busy) ? game.poll() : null;
  if (ready) {
    lastDressed = now;
    busyFrames = BUSY_FRAMES;
    view.setDressing(ready.dressing);
    life.sync(ready);
    view.drawSeen?.();
    ui?.dressed(ready.dressing, ready.shape);
    const t = performance.now();
    pace.done(t, t - dressFrom);
    townWork += t - dressFrom;
    // The ghost's shaders are linked once, while idle, not on the first hover over the town.
    if (!ghostQueued) {
      ghostQueued = true;
      const prepare = (): void => view.prepareGhost?.();
      const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(prepare, { timeout: 4000 });
      else setTimeout(prepare, 1500);
    }
  }
  // Fly mode moves the eye on real time (it carries on when the town's clock is held).
  ui?.fly.frame(real);
  // Flames turn to whichever eye draws: fly mode's while flying (its pitch is above the horizon, the
  // orbit camera's below it).
  const eye = view.getEyeCamera();
  const cam = view.getCamera();
  mischief.camera = eye ? { yaw: eye.yaw, pitch: -eye.pitch } : { yaw: cam.yaw, pitch: cam.pitch };
  // A frame that dressed the town makes no mischief edit (the two heavy jobs do not share a frame).
  mischief.holdEdits = ready !== null;
  life.update(dt);
  mischief.flush();
  mischief.holdEdits = false;
  ui?.beforeRender();
  // A frame that rebuilds what mischief left waiting says nothing of how fast the page draws either.
  if (view.pending() > 0) busyFrames = Math.max(busyFrames, 1);
  render();
  // The loading drawing goes when the dressed town is on screen (on Windows the view may still be waiting for its shaders).
  if (ready) loaderDue = true;
  if (loaderDue && view.started?.() !== false) {
    loaderDue = false;
    dismissLoader();
  }
  ui?.frame();
  // L57, L63: a note when a wedding, a beach day or another scene is on (one at a time, now and then).
  if (ui) (note ??= sceneNote(ui)).update(view.stage);
  // The strip at the top right: how many live here, how happy they are, something silly.
  if (ui) {
    const v = statsWatch.update(view.stage, performance.now());
    // (Watched while hidden too: the town's mood goes on, and what has happened is there when it is shown.)
    if (v && statsOn) (statsStrip ??= createStatsStrip(ui.el)).show(v);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

declare global {
  interface Window {
    __lc?: unknown;
  }
}
window.__lc = {
  view,
  get signals() {
    return signals;
  },
  /** Applies an edit if it is legal; returns whether it was. */
  edit: (e: Edit): boolean => game.edit(e).ok,
  world: (): World => game.world,
  terrain: (): Terrain => game.terrain,
  shape: (): ShapePlan => game.shape,
  game,
  ui,
  autosave,
  keeper,
  mischief,
  /** The raid (src/life/raid): `raids.summon({ at, kind })`, `raids.current`. */
  raids: raidsOf(view.stage),
  music,
  /** How sharp the page is drawn: the level in use and the levels (src/render/quality.ts). */
  quality: () => view.quality?.() ?? null,
};
