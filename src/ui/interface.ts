// Everything the player touches, put together (design section 7).
// Owner: Interface.
//
//   ☰                                   ☀ ↶ ↷
//                 (the town)
//   [Build][Ground][Nature][Tools]
//   [ the open drawer's pieces …        ] ● colour
//
// createInterface() builds the DOM over the canvas, reads the pointer and
// the keyboard, and turns them into edits on the Game. It never decides
// whether an edit is legal: it asks (game.edit → canApply) and shows the
// refusal. The view is used only through TownView.

import { MUSIC_VOLUME_DEFAULT, MUSIC_VOLUME_EVENT, MUSIC_VOLUME_KEY, SOUND_KEY, SOUND_VOLUME_DEFAULT, SOUND_VOLUME_EVENT, SOUND_VOLUME_KEY, readVolume, soundOn, writeVolume } from '@/life/sound/volume';
import { maybeWelcome } from './welcome';
import { CELL_H, columnIndex, edgeOf, inColumnBounds, key, keyX, keyY, keyZ, NO_CELL, type CellKey } from '@/core/grid';
import type { Vec3 } from '@/core/mat4';
import type { Edit, Terrain, World } from '@/core/world';
import type { DressingPlan, ShapePlan } from '@/resolve/plan';
import { celebrate } from '@/life/feedback/celebrate';
import type { TimeHold } from '@/life/api';
import { holdYear, type SeasonHold, type WeatherHold } from '@/life/season';
import { partPhases } from '@/life/signals';
import { createSlider, type SliderStop } from './slider';
import type { CameraPose, Ghost, TownView } from '@/render/api';
import { builtByHand, refused, tally, track, watchGrowth } from '@/app/analytics';
import type { Game } from '@/app/game';
import { brushAt, copyLook, landColumn, levelSteps, lineCells, planErase, planUse, treeSwap, type ActionContext, type Plan, type ToolState } from './actions';
import { el, iconButton, installTheme, isCoarsePointer, isPhone, PHONE_QUERY, setIcon } from './dom';
import { icon } from './icons';
import { createFeedback, wiggle, type Feedback } from './feedback';
import { createFly, type FlyMode, type FlyPhase } from './fly';
import { createGrowth, onlyStartingTrees, type Growth } from './growth';
import { planTown, type GrownTown } from '@/townmaker/index';
import { CHARACTERS, type Character } from '@/townmaker/character';
import { findIslandForTown, kindWeights, MAY_FALL_BACK, planKind } from '@/townmaker/kinds';
import { findIsland } from '@/terrain/kinds';
import { hash } from '@/core/rand';
import { copyText, download, downloadTown, makePostcard, readTownFile, shareLink } from './files';
import type { GestureSink } from './gestures';
import { createGhostPace, ghostFor, ghostForLand, ghostForRun } from './ghost';
import { createGuide, type Guide } from './guide';
import { clampLength, createScrollSteps, growthOf, maxLengthOf, planRun, type Run } from './length';
import { createMarkers } from './markers';
import { COFFEE_URL, createMenu } from './menu';
import { createTownsSheet, type TownsHost } from './towns';
import { createForumButton, FORUM_URL, forumGuideSection, type ForumAppHost, type ForumButton } from './forum-button';
import { faceZone, pickCell, type Pick } from './pick';
import { allPieceIds, DRAWER_IDS, drawerItems, isLandTool, isMischiefTool, isToolId, paintsRuns, trayItem, type DrawerId, type ItemId } from './pieces';
import { createMischiefTools, HINTS_KEY as MISCHIEF_HINTS_KEY } from './mischief';
import { createHand } from './hand';
import { createCollector, createUnlockNotes, topOf, type Unlocked } from './unlock';
import { createTutorial } from './tutorial';
import { createDots } from './dots';
import { mischiefOf } from '@/life/mischief/director';
import { raidsOf } from '@/life/raid/raids';
import { attachPointer } from './pointer';
import { createStepper } from './stepper';
import { createTray, type Tray } from './tray';
import { INPUT } from '@/style/input';
import { FEEDBACK } from '@/style/animation';
import { setKindNames, t, type Lang } from '@/i18n';

export interface InterfaceHost {
  view: TownView;
  game: Game;
  /**
   * The time-of-day control (the signals driver). Added by Seasons: `phase`, `glide` and `scrub` (the
   * slider eases the clock instead of jumping it); without them the slider holds parts at once.
   */
  time: { readonly holding: TimeHold; hold(mode: TimeHold): void; readonly phase?: number; glide?(mode: TimeHold): void; scrub?(phase: number): void };
  /** Added by Seasons: the season and weather controls (the signals driver). Without them, no buttons. */
  seasons?: {
    readonly seasonHolding: SeasonHold;
    holdSeason(mode: SeasonHold): void;
    /** Where the year is, 0 to 1 from the start of spring; eased moves (the slider's). */
    readonly year?: number;
    glideSeason?(mode: SeasonHold): void;
    scrubYear?(year: number): void;
    readonly weatherHolding: WeatherHold;
    holdWeather(mode: WeatherHold): void;
  };
  /** Draws a frame right now (the postcard copies the canvas straight after). */
  renderNow(): void;
  /** Added by Fly: the whole-island view a new island opens on (Escape with nothing open glides back to it). */
  homeCamera?(): CameraPose;
  /** A fresh island, already confirmed by the player: this seed on the newest generator, or (none) a random one. */
  newIsland(seed?: number): void;
  /** Replaces the town with one read from a file. */
  openTown(world: World): void;
  /** Added by My towns: every town the player has made (src/app/towns.ts). Without it, no menu entry. */
  towns?: Omit<TownsHost, 'newIsland'>;
  /** The town's numbers on screen (src/ui/stats): whether they show, and the player's choice. Without it, no menu entry. */
  stats?: { readonly on: boolean; set(on: boolean): void };
  /** A town is about to be grown on the island on screen: its kind ("A harbour town"), and whether it replaces one still growing. */
  growing?(name: string, regrow: boolean): void;
  /** The growth is finished (or stopped): the town on screen is the grown one. */
  grown?(): void;
  /** Where the interface's elements go. Default: document.body. */
  parent?: HTMLElement;
  /** The language the game speaks (src/i18n): the one in use, and the player's choice of another. Without it, no menu entry. */
  language?: { current(): Lang; choose(lang: Lang): void };
  /** Added by Global Village (./forum-button.ts): what the game does for the forum. Without it, or with no VITE_FORUM_URL, no forum. */
  forum?: ForumAppHost;
}

export interface Interface {
  readonly el: HTMLElement;
  readonly tray: Tray;
  readonly feedback: Feedback;
  /** Grow a town (design section 15a): the playing growth, if any. */
  readonly growth: Growth;
  /** The guide to special buildings (design section 7, "The guide"). */
  readonly guide: Guide;
  /** Fly mode (design section 7, "Fly mode"). main.ts calls fly.frame before each frame is drawn. */
  readonly fly: FlyMode;
  /** Global Village's button (./forum-button.ts); null where there is no forum (no address in the build, a scenario). */
  readonly forum: ForumButton | null;
  /** The dressing for the newest world arrived (the guide's ticks for lamps, laundry and parks), and the town it is for. */
  dressed(dressing: DressingPlan, shape?: ShapePlan): void;
  /** L57: glides the camera to look at a place (as Escape glides back to the whole island). */
  glideTo(target: readonly [number, number, number], zoom?: number): void;
  /** Call once per frame, just before the town is drawn (after dressed(), so the ghost can yield to a dressing). */
  beforeRender(): void;
  /** Call once per frame, after the town has been drawn. */
  frame(): void;
  /** The world or the history changed: refresh the buttons and the ghost. */
  sync(): void;
  /** What the interface is showing, for browser tests and the console. */
  debug(): {
    item: ItemId;
    drawer: DrawerId;
    swatch: number | 'auto';
    /** The house style in the hand: 0 = Random. */
    style: number;
    /** The house-style flyout is open. */
    styles: boolean;
    time: TimeHold;
    /** Added by Seasons. */
    season: SeasonHold | null;
    weather: WeatherHold | null;
    ghost: GhostSummary | null;
    markers: CellKey[];
    sound: boolean;
    /** The held piece's length, or null when the selected item has none. */
    length: number | null;
    /** How many cells of the held run the ghost shows (null when there is no run on show). */
    run: number | null;
    /** The guide is open. */
    guide: boolean;
    /** Added by Fly: where fly mode is, and whether Escape's glide to the whole island is under way. */
    fly: FlyPhase;
    recentring: boolean;
    /** The almanac's buildings built by hand, ever (src/ui/unlock.ts), and the unlock words on screen. */
    built: string[];
    unlocks: string[];
    /** The tutorial hand (src/ui/tutorial.ts). */
    tutorial: { step: string; showing: boolean; say: string };
    /** The red dots on things to try (src/ui/dots.ts). */
    dots: { ready: boolean; showing: string[]; menu: boolean };
  };
  dispose(): void;
}

export interface GhostSummary {
  show: number[];
  shimmer: CellKey[];
  refuse: CellKey | null;
}

// The time, season and weather sliders (design section 7; src/ui/slider.ts). Each button shows what
// is held and opens its slider; a "running" or "auto" stop lets the clock, the year or the sky go on.
const timeStops = (): readonly SliderStop[] => [
  { id: 'run', label: t('Running'), icon: 'time-run' },
  { id: 'dawn', label: t('Dawn'), icon: 'time-dawn' },
  { id: 'day', label: t('Day'), icon: 'time-day' },
  { id: 'dusk', label: t('Dusk'), icon: 'time-dusk' },
  { id: 'night', label: t('Night'), icon: 'time-night' },
];
const seasonStops = (): readonly SliderStop[] => [
  { id: 'run', label: t('Running'), icon: 'season-run' },
  { id: 'spring', label: t('Spring'), icon: 'season-spring' },
  { id: 'summer', label: t('Summer'), icon: 'season-summer' },
  { id: 'autumn', label: t('Autumn'), icon: 'season-autumn' },
  { id: 'winter', label: t('Winter'), icon: 'season-winter' },
  { id: 'festival', label: t('Festival'), icon: 'season-festival' },
];
const weatherStops = (): readonly SliderStop[] => [
  { id: 'auto', label: t('Auto'), icon: 'weather-auto' },
  { id: 'clear', label: t('Clear'), icon: 'weather-clear' },
  { id: 'cloudy', label: t('Cloudy'), icon: 'weather-cloudy' },
  { id: 'wind', label: t('Wind'), icon: 'weather-wind' },
  { id: 'fog', label: t('Mist'), icon: 'weather-fog' },
  { id: 'rain', label: t('Rain'), icon: 'weather-rain' },
  { id: 'storm', label: t('Storm'), icon: 'weather-storm' },
  { id: 'snow', label: t('Snow'), icon: 'weather-snow' },
];
/** What the time, season and weather buttons say while one stop is held. */
const heldTips = (): Record<string, string> => ({
  dawn: t('Time of day: holding dawn'),
  day: t('Time of day: holding day'),
  dusk: t('Time of day: holding dusk'),
  night: t('Time of day: holding night'),
  spring: t('Season: holding spring'),
  summer: t('Season: holding summer'),
  autumn: t('Season: holding autumn'),
  winter: t('Season: holding winter'),
  festival: t('Season: holding festival'),
  clear: t('Weather: holding clear'),
  cloudy: t('Weather: holding cloudy'),
  wind: t('Weather: holding wind'),
  fog: t('Weather: holding mist'),
  rain: t('Weather: holding rain'),
  storm: t('Weather: holding storm'),
  snow: t('Weather: holding snow'),
});
/** A grown town's kind, as the town's first name and as the note saying it grows. */
const grownNames = (): Record<Character, readonly [name: string, growing: string]> => ({
  harbour: [t('A harbour town'), t('A harbour town is growing.')],
  marble: [t('A marble city'), t('A marble city is growing.')],
  castle: [t('A castle town'), t('A castle town is growing.')],
  market: [t('A market town'), t('A market town is growing.')],
  river: [t('A river town'), t('A river town is growing.')],
  farming: [t('A farming village'), t('A farming village is growing.')],
  hill: [t('A hill town'), t('A hill town is growing.')],
  gardens: [t('A garden town'), t('A garden town is growing.')],
});
/** Where along a slider's held stops a value falls: `marks` rise round a loop (the day, the year). */
function along(value: number, marks: readonly number[]): number {
  const n = marks.length;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const span = (((marks[i + 1]! - marks[i]!) % 1) + 1) % 1;
    const into = (((value - marks[i]!) % 1) + 1) % 1;
    if (into <= span) return i + into / Math.max(1e-6, span);
  }
  // Outside the stretch the stops cover (between the last stop and the first): the nearer end.
  for (const [i, m] of [[0, marks[0]!], [n - 1, marks[n - 1]!]] as const) {
    const d = Math.min((((value - m) % 1) + 1) % 1, (((m - value) % 1) + 1) % 1);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
/** The value at a position along the stops, going forward round the loop between two marks. */
function valueAt(pos: number, marks: readonly number[]): number {
  const i = Math.min(marks.length - 2, Math.max(0, Math.floor(pos)));
  const span = (((marks[i + 1]! - marks[i]!) % 1) + 1) % 1;
  return (marks[i]! + span * Math.min(1, Math.max(0, pos - i))) % 1;
}
/**
 * Runs a search a slice at a time (the first slice at once, the rest in later tasks, so the page keeps
 * drawing and the menu can show it is working); null if the signal calls it off first.
 */
function inSlices<T>(search: Generator<void, T>, signal: AbortSignal, sliceMs = 12): Promise<T | null> {
  return new Promise((resolve) => {
    const work = (): void => {
      if (signal.aborted) return resolve(null);
      const t0 = performance.now();
      for (;;) {
        const r = search.next();
        if (r.done) return resolve(r.value);
        if (performance.now() - t0 > sliceMs) break;
      }
      setTimeout(work, 0);
    };
    work();
  });
}
/** How big the unlock moment's stars look on screen at the least, CSS pixels. */
const STAR_PX = 24;
const REBUILD_KEY = 'little-city.rebuild';
const RAIDERS_KEY = 'little-city.raiders';
const LAND_HINT_KEY = 'little-city.land-hint';
const LENGTH_HINT_KEY = 'little-city.length-hint';
/** How many times the length note is shown before it is taken as read (it also stops once a length has been changed). */
const LENGTH_HINT_TIMES = 3;
/** How long the length note stays up, ms. */
const LENGTH_HINT_MS = 9000;
/** The note over the stepper the first times a piece with a length is picked: what scrolling (or, on touch, − and +) does. */
export function lengthHint(growth: 'up' | 'ground' | 'brush', touch: boolean): string {
  if (growth === 'up') return touch ? t('Tap − and + to make it taller or shorter') : t('Scroll to make it taller or shorter');
  if (growth === 'brush') return touch ? t('Tap − and + to make the brush wider or narrower') : t('Scroll to make the brush wider or narrower');
  return touch ? t('Tap − and + to make it longer or shorter') : t('Scroll to make it longer or shorter');
}
/** Told once, the first time Raise, Dig or Level is picked. */
export const landHint = (): string => t('Drag the land to shape it. Drag the sea to turn the view.');

function readSound(): boolean {
  // On until the player turns it off (src/life/sound/volume.ts): it governs the music as well.
  return soundOn();
}

export function createInterface(host: InterfaceHost): Interface {
  const { view, game } = host;
  const canvas = view.canvas;
  installTheme();
  // The core names a piece by its kind ('windmill'); the player knows it by its name on the tray ('Mill').
  setKindNames((kind) => ((allPieceIds() as string[]).includes(kind) ? trayItem(kind as ItemId).label : kind));

  // ── the pieces of the interface ────────────────────────────────────────
  const root = el('div', { class: 'lc-ui', attrs: { 'data-ui': 'root' } });
  const tray = createTray();
  const markers = createMarkers(view);
  const feedback = createFeedback(root);
  const count = el('div', { class: 'lc-count', attrs: { 'data-ui': 'run-count', 'aria-hidden': 'true', hidden: '' } });
  let sound = readSound();
  // Mischief (design section 13b): its tools, and undo calling off what is going on.
  let lastUse = { x: 0, y: 0, shift: false };
  const mischief = createMischiefTools({
    view,
    game,
    feedback,
    director: mischiefOf(view.stage),
    root,
    refuse: (reason) => refuse(reason, lastUse.x, lastUse.y),
  });
  const offMischief = mischiefOf(view.stage).on(() => api.sync());
  // The Hand (./hand.ts): picks up what is under a press, carries it, throws it.
  const hand = createHand(view, (x, y) => {
    // A building under the press (any block that is part of a building, not the ground or a tree).
    const pick = pickCell(view.screenToRay(x, y), game.world, game.terrain);
    if (!pick || pick.hit !== 'block') return null;
    const kind = game.shape.kinds.get(pick.cell);
    if (!kind || !['house', 'tower', 'lighthouse', 'windmill', 'marble', 'stall'].includes(kind)) return null;
    return game.shape.structureAt.get(pick.cell) ?? null;
  });
  const coarse = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** A press the Hand took: the run that follows is the Hand's, whatever happens to what it holds. */
  let handRun = false;
  const handHeld = (): boolean => !tray.state.idle && tray.state.item === 'hand' && !growth.active;
  const undoNow = (): void => {
    tally('undo');
    if (!mischief.undo() && game.undo()) tutorial.undone();
  };

  // ── grow a town (design section 15a) ───────────────────────────────────
  let growingNote: (() => void) | null = null;
  const growth = createGrowth(game, {
    onHurry() {
      if (!growingNote) return; // the welcome card says so itself
      growingNote();
      growingNote = feedback.banner(t('Finishing the town…'), []);
    },
    onDone() {
      growingNote?.();
      growingNote = null;
      welcome?.grown();
      host.grown?.();
      api.sync();
    },
  });
  watchGrowth(() => growth.active);
  /** The characters grown so far, oldest first: none repeats until all that suit an island have had a turn. */
  let shown: Character[] = [];
  /** Grows a town: the one planned already (a kind the player chose), or the dice's, avoiding those shown. */
  const grow = (avoid: readonly Character[] = [], chosen?: GrownTown, quiet = false): void => {
    mischief.undo();
    // A new town: nothing of the old one's mischief (a scorch, a cloud, a fire, a mend under way) stays.
    mischiefOf(view.stage).reset();
    const regrow = growth.active;
    growth.stop();
    setGhost(null, '');
    const plan = chosen ?? planTown(game.terrain, game.world.seed, { avoid });
    shown = shown.includes(plan.character) ? [plan.character] : [...shown, plan.character];
    const [name, growingLine] = grownNames()[plan.character];
    // My towns: a town grown over one built by hand is a new town; the one it covers stays kept.
    host.growing?.(name, regrow);
    growth.start(plan.edits);
    if (growth.active && !quiet) growingNote = feedback.banner(growingLine, [{ label: t('Finish now'), primary: true, run: () => growth.skip() }]);
  };

  /**
   * Which kinds of town this island can grow (src/townmaker/kinds.ts), worked out once per island:
   * the weights at once, the planner's word on the kinds that may fall back one plan per task so the
   * page keeps drawing. The plans made on the way are kept, so choosing one of those grows at once.
   */
  interface KindsHere {
    terrain: Terrain;
    seed: number;
    weights: Record<Character, number>;
    can: Record<Character, boolean | null>;
    plans: Partial<Record<Character, GrownTown>>;
  }
  let here: KindsHere | null = null;
  let kindsReady: ((kind: Character, ok: boolean) => void) | null = null;
  const kindsHere = (): KindsHere => {
    const terrain = game.terrain;
    const seed = game.world.seed;
    if (here && here.terrain === terrain && here.seed === seed) return here;
    const weights = kindWeights(terrain);
    const can = {} as Record<Character, boolean | null>;
    for (const kind of CHARACTERS) can[kind] = !(weights[kind] > 0) ? false : MAY_FALL_BACK.includes(kind) ? null : true;
    const k: KindsHere = { terrain, seed, weights, can, plans: {} };
    here = k;
    const ask = (left: Character[]): void => {
      const kind = left[0];
      if (!kind || here !== k) return;
      if (k.can[kind] === null) {
        const plan = planKind(terrain, seed, kind, weights);
        k.can[kind] = plan !== null;
        if (plan) k.plans[kind] = plan;
        kindsReady?.(kind, plan !== null);
      }
      setTimeout(() => ask(left.slice(1)), 0);
    };
    setTimeout(() => ask([...MAY_FALL_BACK]), 0);
    return k;
  };
  /** Where a search for a seed starts: the clock and Math.random, as a new island's seed. */
  const searchStart = (): number => hash(Date.now() | 0, 'kind', Math.floor(Math.random() * 0x7fffffff)) | 0;
  /**
   * Leaving this town for a new island (any, or this seed found for a kind): every way there goes
   * through here and host.newIsland, so the town left is kept in My towns exactly as New island keeps it.
   */
  const leaveForNewIsland = (seed?: number): void => {
    mischief.undo();
    growth.stop();
    host.newIsland(seed);
  };
  const townsHost = host.towns;
  const towns = townsHost
    ? createTownsSheet(
        {
          ...townsHost,
          open(id) {
            mischief.undo();
            growth.stop();
            return townsHost.open(id);
          },
          newIsland: () => leaveForNewIsland(),
          // Global Village: the town opened (unless it is the one on screen), then Post my town for it once it is drawn.
          ...(host.forum && FORUM_URL
            ? {
                post(id: string, here: boolean) {
                  if (!here) {
                    mischief.undo();
                    growth.stop();
                    const reason = townsHost.open(id);
                    if (reason) return feedback.toast(reason);
                  }
                  towns?.close();
                  if (here) forum?.publish();
                  else whenDressed(() => forum?.publish());
                },
              }
            : {}),
        },
        (text) => feedback.toast(text),
      )
    : null;

  const menu = createMenu({
    growTown(kind) {
      track('town_grown', { new_island: false, kind: kind ?? 'any' });
      // On the island there is: the dice choose a different kind each time, so asking again is worth it.
      if (!kind) return grow(shown);
      const k = kindsHere();
      const plan = k.plans[kind] ?? planKind(k.terrain, k.seed, kind, k.weights);
      if (plan) grow(shown, plan);
    },
    growNewIsland(kind, signal) {
      track('town_grown', { new_island: true, kind: kind ?? 'any' });
      if (!kind) {
        leaveForNewIsland();
        grow(shown);
        return;
      }
      return inSlices(findIslandForTown(kind, searchStart()), signal).then((found) => {
        if (!found) return;
        leaveForNewIsland(found.seed);
        grow(shown, found.plan);
      });
    },
    townKindsHere(ready) {
      kindsReady = ready;
      return { ...kindsHere().can };
    },
    // A town to leave: anything built, or ground reshaped (what My towns counts as a town worth keeping).
    hasTown: () => (game.world.terrainEdits?.size ?? 0) > 0 || !onlyStartingTrees(game.world, game.terrain),
    newIsland(kind, signal) {
      track('new_island', { kind: kind ?? 'any' });
      if (!kind) return leaveForNewIsland();
      return inSlices(findIsland(kind, searchStart()), signal).then((found) => {
        if (found) leaveForNewIsland(found.seed);
      });
    },
    ...(host.language ? { language: host.language } : {}),
    ...(towns ? { myTowns: () => void towns.open() } : {}),
    shareLink: () => void share(),
    postcard: () => void postcard(),
    downloadTown: () => {
      track('town_downloaded');
      downloadTown(game.world);
    },
    openTownFile: (file) => void openFile(file),
    sound: () => sound,
    setSound(on) {
      sound = on;
      try {
        localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
      } catch {
        // No storage: the choice lasts until the page closes.
      }
      // Sound itself arrives in a later stage; it listens for this.
      window.dispatchEvent(new CustomEvent('lc:sound', { detail: on }));
    },
    musicVolume: () => readVolume(MUSIC_VOLUME_KEY, MUSIC_VOLUME_DEFAULT),
    setMusicVolume: (v) => void writeVolume(MUSIC_VOLUME_KEY, MUSIC_VOLUME_EVENT, v),
    soundVolume: () => readVolume(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT),
    setSoundVolume: (v) => void writeVolume(SOUND_VOLUME_KEY, SOUND_VOLUME_EVENT, v),
    raiders: () => raidsOf(view.stage).auto,
    setRaiders(on) {
      raidsOf(view.stage).auto = on;
      try {
        localStorage.setItem(RAIDERS_KEY, on ? 'on' : 'off');
      } catch {
        // No storage: the choice lasts until the page closes.
      }
    },
    guide: () => guide.toggle(),
    showGuide: isPhone,
    // The red dots (./dots.ts): Grow a town until first chosen, and the Almanac's row on a phone.
    dot: (row) => (row === 'grow' ? dots.showing('grow') : row === 'guide' ? dots.showing('almanac') : false),
    tried: (row) => void (row === 'grow' && dots.used('grow')),
    ...(host.stats ? { stats: () => host.stats!.on, setStats: (on: boolean) => host.stats!.set(on) } : {}),
    rebuild: () => mischiefOf(view.stage).rebuild,
    setRebuild(on) {
      mischiefOf(view.stage).rebuild = on;
      try {
        localStorage.setItem(REBUILD_KEY, on ? 'on' : 'off');
      } catch {
        // No storage: the choice lasts until the page closes.
      }
    },
  });
  try {
    // Raiders come on their own only once the player has switched them on in the menu (off by default since
    // 2026-11-27: a raid in the middle of building got in the way). Never in a town's first minutes: src/style/raid.ts.
    raidsOf(view.stage).auto = localStorage.getItem(RAIDERS_KEY) === 'on';
  } catch {
    // No storage: off.
    raidsOf(view.stage).auto = false;
  }
  try {
    mischiefOf(view.stage).rebuild = localStorage.getItem(REBUILD_KEY) !== 'off';
  } catch {
    // Default: on.
  }

  const guide = createGuide({ shape: () => game.shape, built: () => collector.built });

  // ── the collection and the unlock moment (./unlock.ts) ─────────────────
  const page = new URLSearchParams(location.search);
  const scenarioPage = page.has('scenario');
  const store = ((): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  /** Where the player's last edit was, in the town: the words for a building the dressing holds float there. */
  let handAt: Vec3 | null = null;
  const unlockNotes = createUnlockNotes(view, (id) => {
    closeAll();
    guide.openAt(id);
  });
  const unlocked = (made: readonly Unlocked[]): void => {
    for (const m of made) {
      const top = m.structure === null ? null : topOf(game.shape, m.structure);
      const at = top?.at ?? handAt;
      if (!at) continue;
      // The stars are drawn about STAR_PX across whatever the zoom (never smaller than their own size).
      const [ax, ay] = view.worldToScreen(at);
      const [bx, by] = view.worldToScreen([at[0] + 1, at[1], at[2]]);
      const [cx, cy] = view.worldToScreen([at[0], at[1], at[2] + 1]);
      const perUnit = Math.max(1, (Math.hypot(bx - ax, by - ay) + Math.hypot(cx - ax, cy - ay)) / 2);
      const scale = STAR_PX / (perUnit * FEEDBACK.unlockStarSize);
      celebrate(view.stage, { ...(top && m.structure !== null ? { structure: m.structure } : {}), at, size: top?.size ?? 1, scale });
      unlockNotes.show(m.entry, at);
      track('building_unlocked', { entry: m.entry.id, role: 'role' in m.entry.proof ? m.entry.proof.role : m.entry.id, group: m.entry.group, built: collector.built.size });
    }
    guide.collectionChanged();
    // Something new in the Almanac: its red dot is back until it is next opened.
    if (made.length > 0 && !guide.isOpen) dots.unlocked();
  };
  const collector = createCollector({ storage: store, shape: game.shape, enabled: !scenarioPage, unlocked });
  // ?almanac=reset: every building can be unlocked again (to see the moment afresh).
  if (page.get('almanac') === 'reset') collector.reset();
  const fly = createFly({
    view,
    shape: () => game.shape,
    changed(flying) {
      // Look only: the tray, its pop-ups, the ghost and the markers go; clicks reach a layer over the town.
      root.classList.toggle('lc-flying', flying);
      if (!flying) return;
      recentre = null;
      closeAll();
      hoverAt = null;
      shownRun = null;
      setGhost(null, '');
      showCount();
    },
  });

  const timeButton = iconButton('time-run', t('Time of day'), { class: 'lc-round', attrs: { 'data-ui': 'time', 'aria-haspopup': 'true', 'aria-expanded': 'false' } });
  const seasonButton = iconButton('season-run', t('Season'), { class: 'lc-round', attrs: { 'data-ui': 'season', 'aria-haspopup': 'true', 'aria-expanded': 'false' } });
  const weatherButton = iconButton('weather-auto', t('Weather'), { class: 'lc-round', attrs: { 'data-ui': 'weather', 'aria-haspopup': 'true', 'aria-expanded': 'false' } });
  // ── the sliders ─────────────────────────────────────────────────────────
  const TIME_STOPS = timeStops(), SEASON_STOPS = seasonStops(), WEATHER_STOPS = weatherStops();
  const dayMarks = (): number[] => {
    const ph = partPhases();
    return [ph.dawn.mid, ph.day.mid, ph.dusk.mid, ph.night.mid];
  };
  const timeSlider = createSlider({
    name: 'time',
    label: t('Time of day'),
    stops: TIME_STOPS,
    position: () => (host.time.holding === 'run' ? 0 : 1 + (host.time.phase === undefined ? Math.max(0, TIME_STOPS.findIndex((s) => s.id === host.time.holding) - 1) : along(host.time.phase, dayMarks()))),
    scrub(pos) {
      if (pos < 0.5) return;
      if (host.time.scrub) host.time.scrub(valueAt(pos - 1, dayMarks()));
      else host.time.hold(TIME_STOPS[Math.round(pos)]!.id as TimeHold);
      showTime();
    },
    choose(i) {
      const mode = TIME_STOPS[i]!.id as TimeHold;
      (host.time.glide ?? host.time.hold)(mode);
      showTime();
    },
  });
  const yearMarks = (): number[] => (['spring', 'summer', 'autumn', 'winter', 'festival'] as const).map((s) => holdYear(s));
  const seasonSlider = createSlider({
    name: 'season',
    label: t('Season'),
    stops: SEASON_STOPS,
    position: () => {
      const s = host.seasons;
      if (!s || s.seasonHolding === 'run') return 0;
      return 1 + (s.year === undefined ? Math.max(0, SEASON_STOPS.findIndex((x) => x.id === s.seasonHolding) - 1) : along(s.year, yearMarks()));
    },
    scrub(pos) {
      const s = host.seasons;
      if (!s || pos < 0.5) return;
      if (s.scrubYear) s.scrubYear(valueAt(pos - 1, yearMarks()));
      else s.holdSeason(SEASON_STOPS[Math.round(pos)]!.id as SeasonHold);
      showSeasons();
    },
    choose(i) {
      const s = host.seasons;
      if (!s) return;
      const mode = SEASON_STOPS[i]!.id as SeasonHold;
      if (s.glideSeason) s.glideSeason(mode);
      else s.holdSeason(mode);
      showSeasons();
    },
  });
  const weatherSlider = createSlider({
    name: 'weather',
    label: t('Weather'),
    stops: WEATHER_STOPS,
    position: () => Math.max(0, WEATHER_STOPS.findIndex((x) => x.id === host.seasons?.weatherHolding)),
    scrub(pos) {
      // The sky follows the thumb kind by kind; each change eases in (clouds gather, rain begins).
      const k = Math.round(pos);
      if (k > 0 && host.seasons && WEATHER_STOPS[k]!.id !== host.seasons.weatherHolding) {
        host.seasons.holdWeather(WEATHER_STOPS[k]!.id as WeatherHold);
        showSeasons();
      }
    },
    choose(i) {
      host.seasons?.holdWeather(WEATHER_STOPS[i]!.id as WeatherHold);
      showSeasons();
    },
  });
  const sliders = [timeSlider, seasonSlider, weatherSlider];
  const openSlider = (which: typeof timeSlider, button: HTMLElement): void => {
    for (const s of sliders) if (s !== which) s.close();
    which.toggle(button);
  };
  const undoButton = iconButton('undo', t('Undo'), { class: 'lc-round', title: t('Undo (⌘Z)'), attrs: { 'data-ui': 'undo' } });
  const redoButton = iconButton('redo', t('Redo'), { class: 'lc-round', title: t('Redo (⇧⌘Z)'), attrs: { 'data-ui': 'redo' } });
  // A phone starts with the least: the menu, and one button for the time, season and weather, which opens
  // to the three of them. Undo and redo come when there is something to undo or redo (ui.css, .lc-phone).
  const skyButton = iconButton('time-run', t('Time, season and weather'), { class: 'lc-round lc-sky', attrs: { 'data-ui': 'sky', 'aria-expanded': 'false' } });
  const corner = el('div', { class: 'lc-card lc-corner lc-corner-right' }, [
    fly.button,
    timeButton,
    ...(host.seasons ? [seasonButton, weatherButton] : []),
    undoButton,
    redoButton,
    skyButton,
  ]);
  const openSky = (open: boolean): void => {
    corner.classList.toggle('lc-sky-open', open);
    skyButton.setAttribute('aria-expanded', String(open));
    setIcon(skyButton, open ? 'close' : 'time-run');
    skyButton.setAttribute('aria-label', open ? t('Close') : t('Time, season and weather'));
    if (!open) for (const s of sliders) s.close();
  };
  skyButton.addEventListener('click', () => openSky(!corner.classList.contains('lc-sky-open')));
  const phones = window.matchMedia(PHONE_QUERY);
  const fitPhone = (): void => void root.classList.toggle('lc-phone', phones.matches);
  fitPhone();
  phones.addEventListener('change', fitPhone);
  root.append(
    markers.el,
    el('div', { class: 'lc-card lc-corner lc-corner-left' }, [menu.button]),
    el('div', { class: 'lc-card lc-corner lc-corner-left lc-corner-guide' }, [guide.button]),
    corner,
    tray.el,
    count,
    menu.el,
    menu.file,
    feedback.el,
    guide.el,
    ...sliders.map((s) => s.el),
    fly.el,
    ...(towns ? [towns.el] : []),
  );
  // Global Village (./forum-button.ts): the pill at the top centre; never in a scenario.
  const forum: ForumButton | null =
    host.forum && FORUM_URL && !scenarioPage
      ? createForumButton({
          base: FORUM_URL,
          app: host.forum,
          storage: store,
          parent: root,
          say: (text) => feedback.toast(text),
          linkBox: (text, link) => feedback.linkBox(text, link),
        })
      : null;
  if (forum) {
    root.classList.add('lc-has-forum');
    root.append(forum.el);
    guide.el.querySelector('.lc-guide-pages')?.append(forumGuideSection());
  }
  /** Runs once the next dressed town is on screen (the picture of a town just opened shows it whole); at most a few seconds later. */
  let dressedWaiters: (() => void)[] = [];
  const whenDressed = (run: () => void): void => {
    let done = false;
    const once = (): void => {
      if (done) return;
      done = true;
      run();
    };
    dressedWaiters.push(() => requestAnimationFrame(() => requestAnimationFrame(once)));
    setTimeout(once, 3000);
  };

  // The keys, very small in the bottom corner (Derek, 2026-11-21: "a small hint in the corner of controls…
  // F to enter flying mode, escape to return to main"). Only with a keyboard and room for it (ui.css hides
  // it on touch and in a narrow window); it takes no clicks, and is not shown while flying (the fly layer
  // has its own "Esc to land").
  const mac = /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  const keyHint = (k: string, what: string): HTMLElement => el('span', { class: 'lc-key' }, [el('kbd', { text: k }), el('span', { text: what })]);
  root.append(
    el('div', { class: 'lc-keys', attrs: { 'data-ui': 'keys', 'aria-hidden': 'true' } }, [
      keyHint('F', t('fly')),
      keyHint('Esc', t('whole island')),
      keyHint(mac ? '\u2318Z' : 'Ctrl Z', t('undo')),
    ]),
  );
  // The tip jar (Derek, 2026-11-25: the menu is too hidden; "a small icon in the corner or just link txt
  // that says buy me a coffee"). Small and quiet, never in the way: bottom right on a wide screen, under
  // the left buttons where the tray takes the bottom (ui.css); on a phone it is the menu's last row instead
  // (menu.ts). Gone while flying, like everything else.
  const coffee = el('a', {
    class: 'lc-coffee',
    html: icon('coffee'),
    attrs: { href: COFFEE_URL, target: '_blank', rel: 'noopener', 'data-ui': 'coffee' },
    on: { click: () => track('coffee_clicked', { from: 'corner' }) },
  });
  coffee.append(el('span', { text: t('Buy me a coffee') }));
  root.append(coffee);
  const slots = Math.max(...DRAWER_IDS.map((d) => drawerItems(d).length));
  tray.el.style.setProperty('--lc-slots', String(slots));
  (host.parent ?? document.body).append(root);

  // ── time, undo, redo ───────────────────────────────────────────────────
  const showTime = (): void => {
    const mode = host.time.holding;
    setIcon(timeButton, `time-${mode}`);
    const title = mode === 'run' ? t('Time of day: passing') : (heldTips()[mode] ?? t('Time of day: holding dawn'));
    timeButton.title = title;
    timeButton.setAttribute('aria-label', title);
    timeButton.setAttribute('data-time', mode);
  };
  timeButton.addEventListener('click', () => openSlider(timeSlider, timeButton));
  let shownSeason = '', shownWeather = '';
  const showSeasons = (): void => {
    const s = host.seasons;
    if (!s) return;
    const season = s.seasonHolding, weather = s.weatherHolding;
    if (season !== shownSeason) {
      shownSeason = season;
      setIcon(seasonButton, `season-${season}`);
      const tip = season === 'run' ? t('Season: the year is turning') : heldTips()[season]!;
      seasonButton.title = tip;
      seasonButton.setAttribute('aria-label', tip);
      seasonButton.setAttribute('data-season', season);
    }
    if (weather !== shownWeather) {
      shownWeather = weather;
      setIcon(weatherButton, `weather-${weather}`);
      const tip = weather === 'auto' ? t('Weather: comes and goes') : heldTips()[weather]!;
      weatherButton.title = tip;
      weatherButton.setAttribute('aria-label', tip);
      weatherButton.setAttribute('data-weather', weather);
    }
  };
  seasonButton.addEventListener('click', () => openSlider(seasonSlider, seasonButton));
  weatherButton.addEventListener('click', () => openSlider(weatherSlider, weatherButton));
  showSeasons();
  undoButton.addEventListener('click', undoNow);
  redoButton.addEventListener('click', () => game.redo());

  // ── acting on the town ─────────────────────────────────────────────────
  const tool = (): ToolState => ({
    item: tray.state.item,
    swatch: tray.state.swatch,
    style: tray.state.style,
    ...(isLandTool(tray.state.item) ? { brush: heldLength() ?? 1 } : {}),
  });

  const look = (x: number, y: number, world: World = game.world): { pick: Pick; ctx: ActionContext } | null => {
    const ray = view.screenToRay(x, y);
    const pick = pickCell(ray, world, game.terrain);
    return pick ? { pick, ctx: { world: game.world, terrain: game.terrain, kinds: game.shape.kinds, rayDir: ray.dir } } : null;
  };

  const refuse = (reason: string, x: number, y: number): void => {
    const r = canvas.getBoundingClientRect();
    feedback.refuse(reason, x + r.left, y + r.top);
    refused(reason, tray.state.idle ? 'hand' : tray.state.item);
    tray.shake();
  };

  /** Tries the plan's edits in order; shows the refusal if none is legal. */
  const perform = (plan: Plan, x: number, y: number): boolean => {
    if (plan.tries.length === 0) {
      if (plan.wiggle) {
        const structure = game.shape.structureAt.get(plan.at);
        if (structure !== undefined) wiggle(view.stage, structure, plan.at);
      } else if (plan.refusal) refuse(plan.refusal, x, y);
      return false;
    }
    if (plan.steps && plan.steps.length > 1) {
      // Level: all the way to the target height, as one undo step and one redraw.
      if (game.editAll(plan.steps) > 0) return true;
    }
    let reason = '';
    for (const edit of plan.tries) {
      const verdict = game.edit(edit);
      if (verdict.ok) return true;
      reason ||= verdict.reason;
    }
    refuse(reason, x, y);
    return false;
  };

  // ── the ghost (mouse only) ─────────────────────────────────────────────
  let hoverAt: { x: number; y: number } | null = null;
  let ghostKey = '';
  let ghost: Ghost | null = null;
  let worldVersion = 0;

  /**
   * On a slow device working a preview out (the whole town's shape, with the piece in it) is 50 to 100 ms,
   * and one for every square the pointer crosses left nothing for drawing. There it takes at most a share
   * of the time: the preview follows a little behind the pointer, and always ends up where the pointer does.
   */
  let ghostCost = 0;
  let ghostDone = -Infinity;
  let ghostTimer = 0;
  const GHOST_CHEAP = 12;
  const GHOST_REST = 2;
  /** The preview worked out by `make`, now or (a slow device, the last one only just done) soon. */
  const ghostNow = (make: () => Ghost | null, key: string): void => {
    const t = performance.now();
    const wait = ghostCost < GHOST_CHEAP ? 0 : ghostDone + ghostCost * GHOST_REST - t;
    window.clearTimeout(ghostTimer);
    if (wait > 0) {
      ghostTimer = window.setTimeout(() => ghostPace.want(), wait);
      return;
    }
    setGhost(make(), key);
    ghostDone = performance.now();
    const took = ghostDone - t;
    ghostCost = took > ghostCost ? took : ghostCost + (took - ghostCost) * 0.3;
  };

  const setGhost = (next: Ghost | null, key: string): void => {
    ghostKey = key;
    if (next === null && ghost === null) return;
    ghost = next;
    view.setGhost(next);
  };

  /** The run on show under the mouse, while a piece is held longer than 1. */
  let shownRun: Run | null = null;

  const showCount = (): void => {
    const n = shownRun?.edits.length ?? 0;
    count.toggleAttribute('hidden', !hoverAt || n === 0);
    if (!hoverAt || n === 0) return;
    const length = heldLength();
    count.textContent = n < (length ?? 0) ? t('{got} of {all}', { got: n, all: length! }) : String(n);
    const r = canvas.getBoundingClientRect();
    count.style.transform = `translate(${Math.round(hoverAt.x + r.left + 16)}px, ${Math.round(hoverAt.y + r.top + 14)}px)`;
  };

  const ghostPace = createGhostPace();
  let dressedThisFrame = false;
  const updateGhost = (): void => {
    if (placingRun) return;
    if (growth.active) return setGhost(null, '');
    const ghostOf = (): void => {
      if (tray.state.idle) return setGhost(null, '');
      if (!hoverAt || isToolId(tray.state.item)) return setGhost(null, '');
      const seen = look(hoverAt.x, hoverAt.y);
      if (!seen) return setGhost(null, '');
      if (isLandTool(tray.state.item)) {
        // Raise, Dig, Level: the ground as it would be, and what it carries.
        const plan = planUse(tool(), seen.pick, seen.ctx);
        const key = `${worldVersion}|${tray.state.item}|${heldLength()}|${plan.at}|${JSON.stringify(plan.tries[0] ?? null)}`;
        if (key === ghostKey) return;
        return ghostNow(() => ghostForLand(plan, game), key);
      }
      const length = heldLength();
      if (length !== null && length > 1) {
        // A held run: worked out again only when the target, the direction, the length or the piece changes.
        const run = planRun(tool(), seen.pick, seen.ctx, length);
        shownRun = run;
        const key = `${worldVersion}|${tray.state.item}|${tray.state.swatch}|${tray.state.style}|${length}|${run.at}|${run.dir}|${JSON.stringify(run.edits[0] ?? run.refusal)}`;
        if (key === ghostKey) return;
        return ghostNow(() => ghostForRun(run, game), key);
      }
      const plan = planUse(tool(), seen.pick, seen.ctx);
      // The same piece on the same target in the same world: nothing to work out again.
      const key = `${worldVersion}|${tray.state.item}|${tray.state.swatch}|${tray.state.style}|${plan.at}|${JSON.stringify(plan.tries[0] ?? plan.refusal ?? null)}`;
      if (key === ghostKey) return;
      ghostNow(() => ghostFor(plan, game), key);
    };
    shownRun = null;
    ghostOf();
    showCount();
  };

  // ── held length (design section 7) ─────────────────────────────────────
  /** Length per piece, for this session; every piece starts at 1. */
  const lengths = new Map<string, number>();
  /** The land tools share one brush. */
  const lengthKey = (item: ItemId): string => (isLandTool(item) ? 'brush' : item);
  // Nothing in hand: no length to set, so the stepper hides and the wheel zooms.
  const heldLength = (): number | null =>
    tray.state.idle || growthOf(tray.state.item) === null ? null : (lengths.get(lengthKey(tray.state.item)) ?? 1);
  const showStepper = (): void => stepper.show(heldLength(), maxLengthOf(tray.state.item), isLandTool(tray.state.item) ? 'Brush' : 'Length');
  const stepper = createStepper((by) => changeLength(by));
  tray.el.append(stepper.el);
  tray.avoid(stepper.el);
  const scrollSteps = createScrollSteps();
  /** True while a run is being placed: the ghost waits until it is all down. */
  let placingRun = false;

  const changeLength = (by: number): void => {
    const length = heldLength();
    if (length === null) return;
    const next = clampLength(length + by, maxLengthOf(tray.state.item));
    if (next === length) return;
    lengths.set(lengthKey(tray.state.item), next);
    showStepper();
    updateGhost();
    lengthLearned();
  };

  // The first times a piece with a length is picked, a note over the stepper says that scrolling changes
  // it (the owner: "otherwise they don't know that this is a mechanic"). It goes for good once a length
  // has been changed, or after it has been shown a few times.
  let lengthHintsLeft = LENGTH_HINT_TIMES;
  try {
    const seen = localStorage.getItem(LENGTH_HINT_KEY);
    lengthHintsLeft = seen === 'learned' ? 0 : Math.max(0, LENGTH_HINT_TIMES - (Number(seen) || 0));
  } catch {
    // No storage: the note shows a few times per visit.
  }
  let lengthHintTimer = 0;
  let lengthHintFor: ItemId | null = null;
  const hideLengthHint = (): void => {
    window.clearTimeout(lengthHintTimer);
    lengthHintFor = null;
    stepper.hint(null);
  };
  const rememberLengthHint = (value: string): void => {
    try {
      localStorage.setItem(LENGTH_HINT_KEY, value);
    } catch {
      // as above
    }
  };
  const lengthLearned = (): void => {
    if (lengthHintsLeft > 0) rememberLengthHint('learned');
    lengthHintsLeft = 0;
    hideLengthHint();
  };
  /** After a change of piece: the note for a piece with a length, if it is still owed. */
  const offerLengthHint = (): void => {
    const growth = tray.state.idle ? null : growthOf(tray.state.item);
    if (growth === null || lengthHintsLeft <= 0) return hideLengthHint();
    if (lengthHintFor === tray.state.item) return;
    window.clearTimeout(lengthHintTimer);
    lengthHintFor = tray.state.item;
    lengthHintsLeft--;
    rememberLengthHint(String(LENGTH_HINT_TIMES - lengthHintsLeft));
    stepper.hint(lengthHint(growth, isCoarsePointer()));
    lengthHintTimer = window.setTimeout(hideLengthHint, LENGTH_HINT_MS);
  };

  /** A plain scroll: changes the length when a piece with one is held over a valid target; otherwise it zooms. */
  const scrollLength = (dy: number, notch: boolean, x: number, y: number): boolean => {
    if (heldLength() === null) return false;
    const seen = look(x, y);
    if (!seen || !planUse(tool(), seen.pick, seen.ctx).tries.some((e) => game.can(e).ok)) {
      scrollSteps.reset();
      return false;
    }
    const steps = scrollSteps.feed(dy, notch);
    if (steps !== 0) changeLength(steps);
    return true;
  };

  /** A click with a piece held longer than 1: the part of the run that fits, as one undo step. */
  const placeRun = (x: number, y: number, seen: { pick: Pick; ctx: ActionContext }, length: number): void => {
    const run = planRun(tool(), seen.pick, seen.ctx, length);
    if (run.edits.length === 0) {
      if (run.refusal) refuse(run.refusal, x, y);
      return;
    }
    placingRun = true;
    game.begin();
    try {
      for (const edit of run.edits) if (!game.edit(edit).ok) break;
    } finally {
      game.end();
      placingRun = false;
    }
    if (hoverAt) updateGhost();
  };

  // ── Shift-drag: paint a run (floors, fences, walls, marble) ────────────
  let run: {
    /** The world when the run began: later samples are picked against it, so new pieces do not get in the way. */
    world0: World;
    level: number;
    first: Edit;
    last: CellKey;
    /** The first cell's colour, used for the rest of the run. */
    color: number | 'auto';
    done: Set<number>;
  } | null = null;

  const runStep = (x: number, y: number): void => {
    if (!run) return;
    const seen = look(x, y, run.world0);
    if (!seen) return;
    const first = run.first;
    if (first.type === 'placeEdge') {
      const side = faceZone(seen.pick);
      if (side === null || seen.pick.target === NO_CELL || keyY(seen.pick.target) !== run.level) return;
      const edge = edgeOf(seen.pick.target, side);
      if (edge === NO_CELL || run.done.has(edge)) return;
      run.done.add(edge);
      game.edit({ type: 'placeEdge', edge, kind: first.kind });
      return;
    }
    const sample = planUse(tool(), seen.pick, { ...seen.ctx, world: run.world0 }).tries[0];
    const cell = sample && 'cell' in sample ? sample.cell : NO_CELL;
    if (cell === NO_CELL || cell === run.last || keyY(cell) !== run.level) return;
    for (const c of lineCells(run.last, cell)) {
      if (run.done.has(c)) continue;
      run.done.add(c);
      if (first.type === 'placeFloor') game.edit({ type: 'placeFloor', cell: c, floor: first.floor });
      else if (first.type === 'placeBlock') {
        const place: Edit = { type: 'placeBlock', cell: c, kind: first.kind, color: run.color, from: null };
        // A run through trees takes their places.
        const swap = treeSwap(game.world, game.terrain, place);
        if (swap) game.editAll(swap);
        else game.edit(place);
      }
    }
    run.last = cell;
  };

  // ── Shift-drag with Raise, Dig or Level: a stroke (shaping the land) ───
  // Each column changes at most once per stroke, and the whole stroke is one
  // undo step. Columns gathered while the pointer moves are applied once per
  // frame, in one edit, so a fast stroke over twenty columns costs one
  // resolve and one rebuild a frame rather than one per pointer event.
  let stroke: {
    item: ItemId;
    /** The town when the stroke began: the pointer is picked against it, so the ground does not move under it. */
    world0: World;
    terrain0: Terrain;
    /** Level: the height of the column the stroke began on. */
    levelTo: number;
    brush: number;
    done: Set<number>;
    pending: number[];
    last: { x: number; z: number };
    /** Why some of the stroke could not be done (told once, when it ends). */
    refused: string;
    at: [number, number];
  } | null = null;

  const strokeAt = (x: number, y: number): Pick | null => (stroke ? pickCell(view.screenToRay(x, y), stroke.world0, stroke.terrain0) : null);

  const strokeAdd = (cols: readonly number[]): void => {
    if (!stroke) return;
    for (const c of cols) {
      if (stroke.done.has(c)) continue;
      stroke.done.add(c);
      stroke.pending.push(c);
    }
  };

  /** Applies the columns gathered since the last frame, as one edit (the player's own). Refusals are noted and told once, at the end. */
  const flushStroke = (): void => collector.hand(flushStrokeNow);
  const flushStrokeNow = (): void => {
    if (!stroke || stroke.pending.length === 0) return;
    const cols = stroke.pending;
    stroke.pending = [];
    if (stroke.item === 'level') {
      // Level goes all the way to the stroke's height (design section 6, as the name promises).
      const level = levelSteps(game.world, game.terrain, cols, stroke.levelTo);
      if (level.edits.length > 0) game.editAll(level.edits);
      const h = game.terrain.height;
      if (cols.some((c) => h[c] !== stroke!.levelTo)) stroke.refused ||= level.reason;
      return;
    }
    const e: Edit = stroke.item === 'raise' ? { type: 'land', up: cols, down: [] } : { type: 'land', up: [], down: cols };
    const v = game.edit(e);
    if (!v.ok) stroke.refused ||= v.reason;
  };

  const strokeStart = (x: number, y: number): boolean => {
    const seen = look(x, y);
    if (!seen) return false;
    const { x: cx, z: cz } = landColumn(seen.pick);
    const brush = heldLength() ?? 1;
    const levelTo = game.terrain.height[columnIndex(cx, cz)]!;
    setGhost(null, '');
    game.begin();
    stroke = { item: tray.state.item, world0: game.world, terrain0: game.terrain, levelTo, brush, done: new Set(), pending: [], last: { x: cx, z: cz }, refused: '', at: [x, y] };
    // The first dab is the brush where the stroke began.
    strokeAdd(brushAt(seen.pick, brush));
    flushStroke();
    return true;
  };

  const strokeMove = (x: number, y: number): void => {
    if (!stroke) return;
    const pick = strokeAt(x, y);
    if (!pick) return;
    const { x: tx, z: tz } = landColumn(pick);
    // Every column between the last sample and this one, so a fast stroke leaves no gaps.
    const from = key(stroke.last.x, 0, stroke.last.z);
    const steps = tx === stroke.last.x && tz === stroke.last.z ? [] : lineCells(from, key(tx, 0, tz));
    for (const c of steps) {
      const at: Pick = { ...pick, cell: key(keyX(c), keyY(pick.cell), keyZ(c)), point: [keyX(c) + (pick.point[0] - tx), pick.point[1], keyZ(c) + (pick.point[2] - tz)] };
      strokeAdd(brushAt(at, stroke.brush));
    }
    strokeAdd(brushAt(pick, stroke.brush));
    stroke.last = { x: tx, z: tz };
    stroke.at = [x, y];
  };

  const strokeEnd = (): void => {
    flushStroke();
    const told = stroke?.refused;
    const at = stroke?.at;
    stroke = null;
    game.end();
    if (told && at) refuse(told, at[0], at[1]);
  };

  // ── the pointer ────────────────────────────────────────────────────────
  /** A press on the town while a pop-up is open only closes it: that click builds nothing. */
  let dismissing = false;
  /** The press that is going on is an Alt-click with the mouse: it copies a look instead of building. */
  let copying = false;
  const closePopups = (): boolean => {
    const menuWasOpen = menu.isOpen;
    menu.close();
    return tray.closePopups() || menuWasOpen;
  };
  /** Closes everything that is open (menu, pop-ups, sliders, the guide); true if anything was. */
  const closeAll = (): boolean => {
    let any = false;
    for (const s of sliders) {
      any ||= s.isOpen;
      s.close();
    }
    any = closePopups() || any;
    return guide.close() || any;
  };
  const onCanvasDown = (e: PointerEvent): void => {
    recentre = null;
    dismissing = closePopups();
    copying = e.altKey && e.pointerType === 'mouse' && e.button === 0;
    lastUse.shift = e.shiftKey;
  };

  /** Alt-click (design section 7, "Copy a look"): the block's kind, colour and style go into the hand. */
  const copyAt = (x: number, y: number): void => {
    const seen = look(x, y);
    const copied = seen && copyLook(seen.pick, seen.ctx);
    if (!copied) return;
    tray.select(copied.item);
    tray.setSwatch(copied.swatch);
    tray.setStyle(copied.style);
  };
  canvas.addEventListener('pointerdown', onCanvasDown, { capture: true });

  const sink: GestureSink = {
    use(x, y) {
      if (dismissing) return;
      if (growth.active) return growth.skip();
      if (copying) return copyAt(x, y);
      if (tray.state.idle) return; // just looking: a click does nothing
      const item = tray.state.item;
      if (isMischiefTool(item)) {
        lastUse = { ...lastUse, x, y };
        if (mischief.use(item, look(x, y)?.pick ?? null, { shift: lastUse.shift })) tally(`mischief_${item}`);
        return;
      }
      const seen = look(x, y);
      if (!seen) return;
      const length = heldLength();
      handAt = [seen.pick.point[0], seen.pick.point[1], seen.pick.point[2]];
      const done = collector.hand(() => {
        if (length !== null && length > 1 && !isLandTool(item)) {
          placeRun(x, y, seen, length);
          return true;
        }
        return perform(planUse(tool(), seen.pick, seen.ctx), x, y);
      });
      if (!done) return;
      tally('uses');
      tally(`use_${item}`);
      if (!isToolId(item)) builtByHand(item);
      if (!isToolId(item) && !isLandTool(item)) {
        tutorial.placed(pieceTop(seen.pick.target));
        dots.placed();
      }
      if (item === 'erase') tutorial.undone();
    },
    erase(x, y) {
      if (dismissing) return;
      if (growth.active) return growth.skip();
      if (tray.state.idle) return; // just looking: no erasing by a stray right click or long press
      const seen = look(x, y);
      if (seen && collector.hand(() => perform(planErase(seen.pick, seen.ctx), x, y))) {
        navigator.vibrate?.(12);
        tally('erased');
        tutorial.undone();
      }
    },
    orbit(dx, dy) {
      recentre = null;
      view.orbit(-dx * INPUT.orbitYaw, dy * INPUT.orbitPitch);
    },
    pan(dx, dy) {
      recentre = null;
      view.pan(dx, dy);
    },
    zoom(factor, x, y) {
      recentre = null;
      view.zoomBy(factor, x, y);
      if (hoverAt) ghostPace.want();
    },
    scroll: scrollLength,
    hover(x, y) {
      hoverAt = { x, y };
      if (handHeld()) canvas.style.cursor = hand.hover(x, y) ? 'grab' : '';
      ghostPace.want();
    },
    hoverEnd() {
      hand.hoverEnd();
      hoverAt = null;
      shownRun = null;
      setGhost(null, '');
      showCount();
    },
    // A land tool held: a drag that starts on the land shapes it; one that starts on the sea turns the view.
    dragPaints(x, y) {
      if (tray.state.idle || !isLandTool(tray.state.item) || growth.active || dismissing || copying) return false;
      const seen = look(x, y);
      return seen !== null && seen.pick.hit !== 'water';
    },
    runStart(x, y) {
      if (dismissing || growth.active || copying || tray.state.idle || !paintsRuns(tray.state.item)) return false;
      if (isLandTool(tray.state.item)) return strokeStart(x, y);
      const seen = look(x, y);
      if (!seen) return false;
      const plan = planUse(tool(), seen.pick, seen.ctx);
      // A run that starts on a tree: the piece taking the tree's place sets the run.
      const first = plan.steps?.at(-1) ?? plan.tries[0];
      if (!first) return false;
      game.begin();
      handAt = [seen.pick.point[0], seen.pick.point[1], seen.pick.point[2]];
      const placed = collector.hand(() => perform(plan, x, y));
      if (placed && !isToolId(tray.state.item)) {
        tutorial.placed(pieceTop(seen.pick.target));
        dots.placed();
      }
      const cell = 'cell' in first ? first.cell : NO_CELL;
      run = {
        world0: seen.ctx.world,
        level: keyY(first.type === 'placeEdge' ? seen.pick.target : cell),
        first,
        last: cell,
        color: (placed && first.type === 'placeBlock' ? game.world.blocks.get(cell)?.color : undefined) ?? tray.state.swatch,
        done: new Set(first.type === 'placeEdge' ? [first.edge] : [cell]),
      };
      return true;
    },
    grab(x, y) {
      if (dismissing || copying || !handHeld()) return false;
      if (!hand.grab(x, y, coarse())) return false;
      canvas.style.cursor = 'grabbing';
      handRun = true;
      tally('mischief_hand');
      return true;
    },
    runMove(x, y) {
      if (handRun) return hand.move(x, y);
      if (stroke) strokeMove(x, y);
      else collector.hand(() => runStep(x, y));
    },
    runEnd() {
      if (handRun) {
        handRun = false;
        if (hand.holding) hand.release();
        canvas.style.cursor = '';
        return;
      }
      if (stroke) return strokeEnd();
      run = null;
      game.end();
    },
    dragging(on) {
      canvas.style.cursor = on ? 'grabbing' : '';
    },
  };
  const detachPointer = attachPointer(canvas, sink);

  // ── back to the whole island (Escape with nothing open) ────────────────
  /** The glide to the view a new island opens on: from, to, and how far along (0 to 1). */
  let recentre: { from: CameraPose; to: CameraPose; t: number; at: number } | null = null;
  const RECENTRE_SECONDS = 0.8;
  const startRecentre = (to?: CameraPose): void => {
    const home = to ?? host.homeCamera?.();
    if (!home) return;
    const from = view.getCamera();
    // The shorter way round.
    const yaw = from.yaw + ((((home.yaw - from.yaw + 180) % 360) + 360) % 360) - 180;
    recentre = { from, to: { ...home, yaw }, t: 0, at: performance.now() };
  };
  const stepRecentre = (): void => {
    if (!recentre) return;
    const now = performance.now();
    recentre.t = Math.min(1, recentre.t + Math.min(0.1, (now - recentre.at) / 1000) / RECENTRE_SECONDS);
    recentre.at = now;
    const { from, to } = recentre;
    const k = recentre.t * recentre.t * (3 - 2 * recentre.t);
    const mix = (a: number, b: number): number => a + (b - a) * k;
    view.setCamera({
      yaw: mix(from.yaw, to.yaw),
      pitch: mix(from.pitch, to.pitch),
      zoom: Math.exp(mix(Math.log(from.zoom), Math.log(to.zoom))),
      target: [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])],
    });
    if (recentre.t >= 1) recentre = null;
  };

  // ── the keyboard ───────────────────────────────────────────────────────
  /** Mouse buttons held down now: F does nothing in the middle of a drag. */
  let buttons = 0;
  const onButtons = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') buttons = e.buttons;
  };
  window.addEventListener('pointerdown', onButtons, true);
  window.addEventListener('pointerup', onButtons, true);
  const typing = (e: KeyboardEvent): boolean => {
    const target = e.target as HTMLElement | null;
    return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  };
  // Escape (design section 7, "Fly mode"): closes whatever is open; with nothing open, back to the
  // whole island. The piece in hand stays in hand. Taken before anything else hears it, because the
  // sliders and the guide close themselves on it and would leave nothing to tell it was open.
  // (While flying, fly mode takes Escape first.)
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || typing(e) || growth.active || fly.active) return;
    // Global Village open: Escape closes what is innermost there (a dialog, a post, the forum) and nothing else.
    if (forum?.isOpen) {
      e.stopPropagation();
      forum.back();
      return;
    }
    // Holding something in the Hand: it is put down, and nothing else happens.
    if (hand.holding) {
      hand.drop();
      canvas.style.cursor = '';
      return;
    }
    if (!closeAll()) startRecentre();
  };
  window.addEventListener('keydown', onEscape, true);
  const onKey = (e: KeyboardEvent): void => {
    if (typing(e) || fly.active || forum?.isOpen) return;
    const key = e.key.toLowerCase();
    // F takes off: what is open closes; a growing town goes on growing; not mid-drag.
    if (key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
      if (buttons !== 0) return;
      e.preventDefault();
      fly.enter();
      return;
    }
    if (growth.active && !['shift', 'control', 'alt', 'meta'].includes(key)) {
      // Any key finishes a growing town at once (and does nothing else).
      e.preventDefault();
      growth.skip();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) game.redo();
        else undoNow();
      } else if (key === 'y') {
        e.preventDefault();
        game.redo();
      }
      return;
    }
    if (e.altKey) return;
    if (/^[0-9]$/.test(e.key)) tray.pickNumber(Number(e.key));
  };
  window.addEventListener('keydown', onKey);

  // The page itself never zooms: a pinch or Ctrl + scroll over the tray or a card does nothing (over the town it zooms the town).
  const noPageZoom = (e: Event): void => {
    if (e.type !== 'wheel' || (e as WheelEvent).ctrlKey) e.preventDefault();
  };
  window.addEventListener('wheel', noPageZoom, { passive: false });
  window.addEventListener('gesturestart', noPageZoom);

  // ── towns in and out ───────────────────────────────────────────────────
  const share = async (): Promise<void> => {
    const link = shareLink(game.world);
    if (link === null) {
      track('town_shared', { via: 'file' });
      downloadTown(game.world);
      feedback.toast(t('This town is too big for a link, so here it is as a file.'));
    } else if (await copyText(link)) {
      track('town_shared', { via: 'link' });
      feedback.toast(t('Link copied. Anyone who opens it gets a copy of this town.'));
    } else {
      track('town_shared', { via: 'link_box' });
      feedback.linkBox(t('Copy this link to share your town:'), link);
    }
  };
  const postcard = async (): Promise<void> => {
    const blob = await makePostcard(canvas, host.renderNow);
    if (blob) {
      track('postcard_saved');
      download(blob, 'little-city-postcard.png');
    } else feedback.toast(t('The postcard could not be made.'));
  };
  const openFile = async (file: File): Promise<void> => {
    const result = await readTownFile(file);
    if (result.ok) growth.stop();
    if (result.ok) track('town_file_opened');
    if (result.ok) host.openTown(result.world);
    else feedback.toast(result.reason);
  };
  const onDragOver = (e: DragEvent): void => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  };
  const onDrop = (e: DragEvent): void => {
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    e.preventDefault();
    void openFile(file);
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);

  // Shaping the land: the first time a land tool is picked, one line on how it is used.
  let landHintShown = false;
  try {
    landHintShown = localStorage.getItem(LAND_HINT_KEY) === 'seen';
  } catch {
    // No storage: the hint shows once per visit.
  }
  let toldIdle = false;
  tray.onChange((state) => {
    // Another tool (or none): whatever the Hand holds is put down.
    if (state.idle || state.item !== 'hand') {
      hand.drop();
      hand.hoverEnd();
    }
    if (state.idle && !toldIdle) {
      toldIdle = true;
      feedback.toast(t('Nothing in hand: just look around. Pick a piece to build again.'));
    }
    if (!state.idle && isLandTool(tray.state.item) && !landHintShown) {
      landHintShown = true;
      feedback.toast(landHint());
      try {
        localStorage.setItem(LAND_HINT_KEY, 'seen');
      } catch {
        // as above
      }
    }
    ghostKey = '';
    scrollSteps.reset();
    showStepper();
    offerLengthHint();
    updateGhost();
  });
  showStepper();

  // The very first visit, on an empty island: a town grows by itself (see welcome.ts). Not on a shared link,
  // a scenario or ?mischief (which grows its own).
  const firstVisit = ((): boolean => {
    const q = new URLSearchParams(location.search);
    return !q.has('scenario') && !q.has('mischief') && !location.hash.startsWith('#t=');
  })();
  const welcome = firstVisit
    ? maybeWelcome(root, {
        hasTown: () => !onlyStartingTrees(game.world, game.terrain),
        growTown: () => grow([], undefined, isPhone()),
        growing: () => growth.active,
        compact: () => (isPhone() ? tray.el : null),
        skip: () => growth.skip(),
        emptyIsland() {
          // The whole growth is one undo step: leave it where it is, and take it back.
          growth.stop();
          game.undo();
        },
      })
    : { waiting: false, townChanged() {}, grown() {}, dispose() {} };

  // ── the tutorial hand (./tutorial.ts) ──────────────────────────────────
  /** Where a piece just placed in a cell stands, its top (a block) or its face (a floor). */
  const pieceTop = (cell: CellKey): Vec3 =>
    cell === NO_CELL ? (handAt ?? [24, 1, 24]) : [keyX(cell) + 0.5, (keyY(cell) + (game.world.blocks.has(cell) ? 0.85 : 0)) * CELL_H, keyZ(cell) + 0.5];
  /** The screen area the hand may point into: clear of the corners, the tray and the words over it. */
  const roomy = (x: number, y: number): boolean => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const trayTop = tray.el.getBoundingClientRect().top || h;
    if (x < 40 || x > w - 40 || y < 150 || y > Math.min(h - 40, trayTop - 30)) return false;
    // The spot, and the room above it for the hand and its words, are the town (no card, no button).
    return [0, 50, 100].every((up) => document.elementFromPoint(x, y - up) === canvas);
  };
  /** A column by the town that is empty all round, on screen, in view, where a click would place. */
  const goodSpot = (x: number, z: number): Vec3 | null => {
    const world = game.world, terrain = game.terrain;
    if (!inColumnBounds(x, z)) return null;
    const h = terrain.height[columnIndex(x, z)] ?? 0;
    if (h <= 0) return null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!inColumnBounds(x + dx, z + dz)) return null;
        const nh = terrain.height[columnIndex(x + dx, z + dz)] ?? 0;
        if (nh <= 0) return null;
        const c = key(x + dx, nh, z + dz);
        if (world.blocks.has(c) || world.floors.has(c)) return null;
      }
    }
    const at: Vec3 = [x + 0.5, h * CELL_H, z + 0.5];
    const [sx, sy] = view.worldToScreen(at);
    if (!roomy(sx, sy)) return null;
    const seen = look(sx, sy);
    if (!seen || seen.pick.hit !== 'terrain' || seen.pick.target !== key(x, h, z)) return null;
    return planUse(tool(), seen.pick, seen.ctx).tries.some((e) => game.can(e).ok) ? at : null;
  };
  /** The nearest good spot to the middle of what is built (or of the view, on an empty island). */
  const findSpot = (): Vec3 | null => {
    let cx = 0, cz = 0, n = 0;
    for (const [cell, b] of game.world.blocks) {
      if (b.kind === 'tree') continue;
      cx += keyX(cell);
      cz += keyZ(cell);
      n++;
    }
    if (n > 0) {
      cx = Math.round(cx / n);
      cz = Math.round(cz / n);
    } else {
      const mid = look(canvas.clientWidth / 2, canvas.clientHeight / 2);
      if (!mid) return null;
      cx = keyX(mid.pick.cell);
      cz = keyZ(mid.pick.cell);
    }
    for (let r = 1; r <= 14; r++) {
      const ring: [number, number, number][] = [];
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          // Nearer the viewer first (lower on the screen): the spot is in front of the town, not behind it.
          ring.push([cx + dx, cz + dz, view.worldToScreen([cx + dx + 0.5, 0, cz + dz + 0.5])[1]]);
        }
      }
      ring.sort((a, b) => b[2] - a[2]);
      for (const [x, z] of ring) {
        const at = goodSpot(x, z);
        if (at) return at;
      }
    }
    return null;
  };
  const tutorialParam = page.get('tutorial');
  const automatedPage = (navigator as { webdriver?: boolean }).webdriver === true;
  const tutorial = createTutorial({
    view,
    storage: store,
    enabled: !scenarioPage && (!automatedPage || tutorialParam === 'on') && tutorialParam !== 'off',
    forced: tutorialParam === 'on',
    free: () =>
      !growth.active &&
      !welcome.waiting &&
      !fly.active &&
      !menu.isOpen &&
      !guide.isOpen &&
      !(towns?.isOpen ?? false) &&
      !sliders.some((s) => s.isOpen) &&
      !tray.popupOpen &&
      !hand.holding &&
      !root.classList.contains('lc-flying'),
    canPlace: () => !tray.state.idle && !isToolId(tray.state.item) && !isLandTool(tray.state.item),
    canRemove: () => !tray.state.idle,
    spot: findSpot,
    stillGood: (at) => goodSpot(Math.floor(at[0]), Math.floor(at[2])) !== null,
    undoButton: () => (undoButton.disabled || undoButton.offsetParent === null ? null : undoButton),
    touch: isCoarsePointer,
  });
  root.append(unlockNotes.el, tutorial.el);

  // ── red dots on things to try (./dots.ts) ──────────────────────────────
  const dotsParam = page.get('dots');
  const dots = createDots({
    storage: store,
    // Not in a scenario or a browser test unless the address asks for them (?dots=on, ?dots=reset).
    enabled: dotsParam !== 'off' && (dotsParam === 'on' || dotsParam === 'reset' || (!scenarioPage && !automatedPage)),
    reset: dotsParam === 'reset',
    known: {
      // The tutorial's place step over, or a building of the almanac built by hand: a piece has been placed.
      placed: tutorial.step !== 'place' || collector.built.size > 0,
      // A Mischief tool used before (its hints were shown): the drawer has been opened.
      mischief: ((): boolean => {
        try {
          const hints = JSON.parse(store?.getItem(MISCHIEF_HINTS_KEY) ?? '{}') as unknown;
          return typeof hints === 'object' && hints !== null && Object.keys(hints).length > 0;
        } catch {
          return false;
        }
      })(),
    },
    buttons: {
      almanac: guide.button,
      fly: fly.button,
      mischief: tray.el.querySelector<HTMLElement>('.lc-tab[data-drawer="mischief"]'),
      menu: menu.button,
      forum: forum?.button ?? null,
    },
    hidden: () => growth.active || welcome.waiting || tutorial.showing || fly.active || root.classList.contains('lc-flying'),
    almanacInMenu: () => phones.matches,
    inUse: () => ({ almanac: guide.isOpen, fly: fly.active, mischief: tray.state.drawer === 'mischief', forum: forum?.isOpen ?? false }),
    placed: () => tutorial.step !== 'place',
  });
  let lastFrame = performance.now();

  // ?mischief: straight to a grown town with the Mischief drawer open, to try it.
  const openMischief = (): void => {
    if (!new URLSearchParams(location.search).has('mischief')) return;
    if (!welcomeHasTown()) {
      grow();
      growth.skip(true);
    }
    tray.select('torch');
  };
  const welcomeHasTown = (): boolean => !onlyStartingTrees(game.world, game.terrain);

  const api: Interface = {
    el: root,
    tray,
    feedback,
    growth,
    guide,
    fly,
    forum,
    dressed(dressing, shape) {
      collector.dressed(shape ?? game.shape, dressing);
      guide.dressed(dressing);
      fly.dressed(dressing);
      ghostPace.heavy();
      dressedThisFrame = true;
      const waiting = dressedWaiters;
      dressedWaiters = [];
      for (const run of waiting) run();
    },
    glideTo(target, zoom) {
      const now = view.getCamera();
      startRecentre({ ...now, target: [target[0], target[1], target[2]], zoom: Math.max(now.zoom, zoom ?? 0) });
    },
    beforeRender() {
      ghostPace.frame(updateGhost);
    },
    frame() {
      stepRecentre();
      for (const s of sliders) s.refresh();
      flushStroke();
      // One heavy job per frame: a frame that carried a whole-town dressing leaves growth's edit for the
      // next one, which picks up the elapsed time, so the growth rate holds.
      if (!dressedThisFrame) growth.tick(performance.now());
      dressedThisFrame = false;
      markers.update(tray.state.item === 'change' && !tray.state.idle, game.world, game.terrain);
      const now = performance.now();
      tutorial.frame(Math.min(0.25, (now - lastFrame) / 1000));
      lastFrame = now;
      dots.frame();
      forum?.frame();
      unlockNotes.frame();
    },
    sync() {
      worldVersion++;
      undoButton.disabled = !game.canUndo && !mischief.active;
      redoButton.disabled = !game.canRedo;
      showTime();
      showSeasons();
      collector.changed(game.shape);
      guide.townChanged();
      welcome.townChanged();
      if (hoverAt) ghostPace.want();
    },
    debug: () => ({
      item: tray.state.item,
      drawer: tray.state.drawer,
      swatch: tray.state.swatch,
      style: tray.state.style,
      styles: tray.styles.isOpen,
      time: host.time.holding,
      season: host.seasons?.seasonHolding ?? null,
      weather: host.seasons?.weatherHolding ?? null,
      ghost: ghost ? { show: [...ghost.show], shimmer: [...(ghost.shimmer ?? [])], refuse: ghost.refuse ?? null } : null,
      markers: markers.cells(),
      sound,
      length: heldLength(),
      run: shownRun && ghost ? shownRun.edits.length : null,
      guide: guide.isOpen,
      fly: fly.phase,
      recentring: recentre !== null,
      built: [...collector.built],
      unlocks: unlockNotes.showing(),
      tutorial: tutorial.debug(),
      dots: dots.debug(),
    }),
    dispose() {
      window.clearTimeout(lengthHintTimer);
      window.clearTimeout(ghostTimer);
      phones.removeEventListener('change', fitPhone);
      offMischief();
      mischief.dispose();
      growth.stop();
      fly.dispose();
      tray.styles.dispose();
      guide.dispose();
      welcome.dispose();
      detachPointer();
      canvas.removeEventListener('pointerdown', onCanvasDown, { capture: true });
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('pointerdown', onButtons, true);
      window.removeEventListener('pointerup', onButtons, true);
      window.removeEventListener('wheel', noPageZoom);
      window.removeEventListener('gesturestart', noPageZoom);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      view.setGhost(null);
      root.remove();
    },
  };
  api.sync();
  openMischief();
  return api;
}
