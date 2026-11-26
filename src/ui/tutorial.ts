// The tutorial hand (Derek, 2026-11-26; 39% of players never placed a piece): once the town that greets a
// new player has finished growing, a small hand-drawn hand bounces over an empty spot by the town, "tap to
// place" (touch) or "left click to place" (mouse). When a piece is down it moves on: to the undo button,
// "tap to undo" (touch), or to the piece, "right click to remove" (a right click with a piece in hand
// removes what is under it; Ctrl/⌘Z is undo). Then never again. The rules are src/ui/tutorial-state.ts.
//
// Small and out of the way: no dark overlay, it takes no clicks, and it hides while the town grows, while
// a menu, the almanac, a slider or My towns is open, while flying, and while nothing placeable is in hand.
// Only for a player who has not placed a piece yet. ?tutorial=on shows it from the start whatever is
// remembered (and remembers nothing); lc:tutorial in localStorage is what is remembered.
// Owner: Interface.

import type { Vec3 } from '@/core/mat4';
import { track } from '@/app/analytics';
import { t } from '@/i18n';
import type { TownView } from '@/render/api';
import { el } from './dom';
import { icon } from './icons';
import { saveTutorial, showing, startTutorial, stepTutorial, type TutorialEvent, type TutorialState } from './tutorial-state';

export const TUTORIAL_KEY = 'lc:tutorial';
/** Seconds everything must have been quiet (no growth, nothing open) before the hand comes. */
const SETTLE = 1.2;
/** How often a new spot is looked for while there is none, or the one there is checked, seconds. */
const LOOK_EVERY = 0.4;

export interface TutorialHost {
  view: TownView;
  storage: Storage | null;
  /** False: never on this page (a scenario; a browser test that did not ask for it). */
  enabled: boolean;
  /** ?tutorial=on: from the start, whatever is remembered, and nothing remembered. */
  forced: boolean;
  /** Nothing in the way: no town growing, nothing open, not flying, the welcome settled. */
  free(): boolean;
  /** What is in hand places a piece. */
  canPlace(): boolean;
  /** Something is in hand, so a right click removes. */
  canRemove(): boolean;
  /** An empty spot by the town to point at (it is on screen and a click there would place), or null. */
  spot(): Vec3 | null;
  /** The spot pointed at is still empty and in view. */
  stillGood(at: Vec3): boolean;
  /** The undo button, if it is on screen and can be pressed. */
  undoButton(): HTMLElement | null;
  /** The player uses touch. */
  touch(): boolean;
}

export interface Tutorial {
  readonly el: HTMLElement;
  /** A piece placed by the player's hand, standing at `at` (its top). */
  placed(at: Vec3): void;
  /** The player undid, or removed a piece by hand. */
  undone(): void;
  /** Once a frame. */
  frame(dt: number): void;
  /** Where it is: place (no piece placed yet), undo, or done. */
  readonly step: TutorialState['step'];
  /** The hand is on screen. */
  readonly showing: boolean;
  /** What it shows (tests, the console). */
  debug(): { step: string; showing: boolean; say: string };
}

export function createTutorial(host: TutorialHost): Tutorial {
  const hand = el('div', { class: 'lc-tutor-hand', html: icon('point') });
  const say = el('div', { class: 'lc-tutor-say' });
  const layer = el('div', { class: 'lc-tutor', attrs: { 'data-ui': 'tutorial', 'aria-hidden': 'true', hidden: '' } }, [hand, say]);
  const saved = ((): string | null => {
    try {
      return host.storage?.getItem(TUTORIAL_KEY) ?? null;
    } catch {
      return null;
    }
  })();
  let state: TutorialState = host.forced ? startTutorial(null) : startTutorial(saved);
  if (!host.enabled && !host.forced) state = { ...state, step: 'done' };
  let quiet = 0;
  let spot: Vec3 | null = null;
  let piece: Vec3 | null = null;
  let since = LOOK_EVERY;
  let words = '';
  let started = performance.now();
  let shownAt = '';

  const remember = (): void => {
    if (host.forced) return;
    try {
      host.storage?.setItem(TUTORIAL_KEY, saveTutorial(state));
    } catch {
      // Storage refused: it may show again next visit.
    }
  };
  const apply = (e: TutorialEvent): void => {
    const was = state;
    const { state: next, news } = stepTutorial(state, e);
    state = next;
    if (news === 'shown') {
      started = performance.now();
      track('tutorial_shown', { step: state.step, touch: host.touch() });
    } else if (news) {
      track('tutorial_step', { step: news, from: was.step, seconds: Math.round((performance.now() - started) / 1000), touch: host.touch() });
    }
    if (news && news !== 'shown') remember();
    if (state.step !== was.step) {
      spot = null;
      since = LOOK_EVERY;
    }
  };

  const hide = (): void => {
    if (!layer.hidden) layer.hidden = true;
  };
  /** Puts the hand's fingertip at (x, y), pointing down (at the town) or up (at a button above). */
  const draw = (x: number, y: number, up: boolean, text: string): void => {
    if (text !== words) {
      words = text;
      say.textContent = text;
    }
    layer.hidden = false;
    layer.classList.toggle('lc-tutor-up', up);
    const W = window.innerWidth;
    const size = hand.offsetWidth || 52;
    // The fingertip is at (0.475, 0.95) of the drawing; drawn upside down when pointing up.
    const hx = x - size * 0.475;
    const hy = up ? y + size * 0.02 : y - size * 0.95;
    const sw = say.offsetWidth, sh = say.offsetHeight;
    const sx = Math.min(Math.max(8, x - sw / 2), Math.max(8, W - sw - 8));
    const sy = up ? hy + size + 14 : hy - sh - 14;
    const key = `${hx.toFixed(0)},${hy.toFixed(0)},${sx.toFixed(0)},${sy.toFixed(0)}`;
    if (key === shownAt) return;
    shownAt = key;
    hand.style.transform = `translate(${hx.toFixed(0)}px, ${hy.toFixed(0)}px)`;
    say.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
  };

  /** Where to point now, and what to say; null when there is nothing to point at. */
  const target = (dt: number): { x: number; y: number; up: boolean; text: string } | null => {
    const touch = host.touch();
    if (state.step === 'place') {
      if (!host.canPlace()) return null;
      since += dt;
      if (since >= LOOK_EVERY) {
        since = 0;
        if (!spot || !host.stillGood(spot)) spot = host.spot();
      }
      if (!spot) return null;
      const [x, y] = host.view.worldToScreen(spot);
      return { x, y, up: false, text: touch ? t('tap to place') : t('left click to place') };
    }
    if (touch) {
      const button = host.undoButton();
      if (!button) return null;
      const r = button.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.left + r.width / 2, y: r.bottom + 2, up: true, text: t('tap to undo') };
    }
    if (!piece || !host.canRemove()) return null;
    const [x, y] = host.view.worldToScreen(piece);
    return { x, y, up: false, text: t('right click to remove') };
  };

  return {
    el: layer,
    placed(at) {
      piece = at;
      apply({ type: 'placed' });
    },
    undone() {
      apply({ type: 'undone' });
    },
    frame(dt) {
      if (!showing(state)) return hide();
      quiet = host.free() ? quiet + dt : 0;
      const aim = quiet >= SETTLE ? target(dt) : null;
      apply({ type: 'tick', dt, visible: aim !== null });
      if (!aim || !showing(state)) return hide();
      draw(aim.x, aim.y, aim.up, aim.text);
    },
    get step() {
      return state.step;
    },
    get showing() {
      return !layer.hidden;
    },
    debug: () => ({ step: state.step, showing: !layer.hidden, say: layer.hidden ? '' : words }),
  };
}
