// Red dots on things to try (Derek, 2026-11-26): the little red notification dot mobile games put on
// anything new. One on the Almanac button until the Almanac is first opened (and again after a building
// is unlocked, until it is next opened), on the wings until the player first flies, on the Mischief tab
// until it is first opened, and on Grow a town in the menu until it is first chosen; the ☰ button carries
// one while anything in the menu does (on a phone the Almanac is a menu row). The rules are
// ./dots-state.ts.
//
// None before the player has placed a first piece (the tutorial hand comes first), none while a town is
// growing or the hand is on show. ?dots=reset shows them all afresh (and lets them show in a browser
// test); ?dots=off, none. lc:dots in localStorage is what is remembered.
// Owner: Interface.

import { track } from '@/app/analytics';
import { el } from './dom';
import { DOT_IDS, dotted, menuDotted, saveDots, startDots, stepDots, type DotId, type DotsEvent, type DotsKnown, type DotsState } from './dots-state';

export const DOTS_KEY = 'lc:dots';

/** A red dot on a button (or none): a span of its own at its top-right corner (ui.css, .lc-dot). */
export function setDot(button: HTMLElement, on: boolean): void {
  const dot = button.querySelector(':scope > .lc-dot');
  if (on === (dot !== null)) return;
  if (dot) {
    dot.remove();
    button.classList.remove('lc-has-dot');
    return;
  }
  button.classList.add('lc-has-dot');
  button.append(el('span', { class: 'lc-dot', attrs: { 'aria-hidden': 'true', 'data-ui': 'dot' } }));
}

export interface DotsHost {
  storage: Storage | null;
  /** False: never on this page (a scenario; a browser test that did not ask for them). */
  enabled: boolean;
  /** ?dots=reset: forget what is remembered, and show them all afresh. */
  reset: boolean;
  /** What the game knows of a player from before the dots. */
  known: DotsKnown;
  /** The buttons that carry a dot. */
  buttons: { almanac: HTMLElement; fly: HTMLElement; mischief: HTMLElement | null; menu: HTMLElement };
  /** Dots are put away for now: a town growing, the tutorial hand on show, flying. */
  hidden(): boolean;
  /** The Almanac is a row in the menu, not a button of its own (a phone). */
  almanacInMenu(): boolean;
  /** Each frame: what is in use now (the Almanac open, flying, the Mischief drawer open). */
  inUse(): { almanac: boolean; fly: boolean; mischief: boolean };
  /** The tutorial hand's place step is over. */
  placed(): boolean;
}

export interface Dots {
  /** A piece placed by hand. */
  placed(): void;
  /** The player used a thing. */
  used(id: DotId): void;
  /** A building was unlocked (while the Almanac was closed). */
  unlocked(): void;
  /** Whether a dot shows on this thing now (the menu's rows ask when they are drawn). */
  showing(id: DotId): boolean;
  /** Once a frame. */
  frame(): void;
  /** What shows (tests, the console). */
  debug(): { ready: boolean; showing: DotId[]; menu: boolean };
}

export function createDots(host: DotsHost): Dots {
  const { storage } = host;
  if (host.reset) {
    try {
      storage?.removeItem(DOTS_KEY);
    } catch {
      // as below
    }
  }
  const saved = ((): string | null => {
    try {
      return storage?.getItem(DOTS_KEY) ?? null;
    } catch {
      return null;
    }
  })();
  let state: DotsState = startDots(saved, host.reset ? {} : host.known);
  /** What is drawn now, by button: compared each frame, so the page is touched only on a change. */
  const drawn = new Map<HTMLElement, boolean>();

  const remember = (): void => {
    try {
      storage?.setItem(DOTS_KEY, saveDots(state));
    } catch {
      // Storage refused: the dots may show again next visit.
    }
  };
  const apply = (e: DotsEvent): void => {
    // Off on this page: nothing is learnt or remembered either (a scenario, a browser test).
    if (!host.enabled) return;
    const { state: next, cleared } = stepDots(state, e);
    if (next === state) return;
    state = next;
    remember();
    if (cleared) {
      // Did the dots lead the player to try things? (PostHog: dot_cleared.) on_screen: its dot was drawn just then.
      const { what } = cleared;
      const button = what === 'grow' || (what === 'almanac' && host.almanacInMenu()) ? host.buttons.menu : host.buttons[what];
      track('dot_cleared', { what, after_unlock: cleared.afterUnlock, on_screen: button ? drawn.get(button) === true : false });
    }
  };
  const showing = (id: DotId): boolean => host.enabled && !host.hidden() && dotted(state, id);

  return {
    placed: () => apply({ type: 'ready' }),
    used: (id) => apply({ type: 'used', id }),
    unlocked: () => apply({ type: 'unlocked' }),
    showing,
    frame() {
      if (!state.ready && host.placed()) apply({ type: 'ready' });
      const now = host.inUse();
      if (now.almanac) apply({ type: 'used', id: 'almanac' });
      if (now.fly) apply({ type: 'used', id: 'fly' });
      if (now.mischief) apply({ type: 'used', id: 'mischief' });
      const { buttons } = host;
      const inMenu = host.almanacInMenu();
      const show = (button: HTMLElement | null, on: boolean): void => {
        if (!button || drawn.get(button) === on) return;
        drawn.set(button, on);
        setDot(button, on);
      };
      const hidden = !host.enabled || host.hidden();
      show(buttons.almanac, !hidden && !inMenu && dotted(state, 'almanac'));
      show(buttons.fly, !hidden && dotted(state, 'fly'));
      show(buttons.mischief, !hidden && dotted(state, 'mischief'));
      show(buttons.menu, !hidden && menuDotted(state, inMenu));
    },
    debug: () => ({
      ready: state.ready,
      showing: DOT_IDS.filter(showing),
      menu: host.enabled && !host.hidden() && menuDotted(state, host.almanacInMenu()),
    }),
  };
}
