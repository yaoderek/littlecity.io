// The first visit (Derek, 2026-11-22: "when a new user joins the game it should just automatically start
// building… so they can be impressed immediately"): someone opening the game for the very first time,
// on an empty island, watches a town grow by itself (the island's own roll of the dice, as Grow a town's
// Surprise me), a moment after the island appears. A small closable card beside the menu button says so
// and offers the empty island back. It never happens twice in a browser, never over anything built, a
// saved town, a shared link or a scenario; a player who starts building in that first moment is left alone.
//
// On a phone there is room for one thing at a time, so the note and "a town is growing" are one small card
// just above the tray: what is happening, a way to skip it, and the empty island. (There were two cards, one
// over the other, under a third: 2026-11-24, 84 of about 160 phone players pressed Finish now, half of them
// within four seconds.)

import { t } from '@/i18n';
import { el, iconButton } from './dom';

const KEY = 'lc:welcomed';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // No storage (private mode): show it; it is one click to dismiss.
  }
}

function remember(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Nothing to do: it will show again next visit.
  }
}

export interface WelcomeHost {
  /** True when the island already has a town on it. */
  hasTown(): boolean;
  /** Grows a town on this island (the dice's kind), playing it out. */
  growTown(): void;
  /** A town is growing now. */
  growing(): boolean;
  /** A phone: the one small card, put here (over the tray). Null elsewhere. */
  compact?(): HTMLElement | null;
  /** Puts down what is left of the town (the small card's Skip). */
  skip?(): void;
  /** Takes the grown town away again: the empty island, as it was. */
  emptyIsland(): void;
}

export interface Welcome {
  /** The town is still to start growing (the island is being looked at first). */
  readonly waiting: boolean;
  /** Call when the town changes. */
  townChanged(): void;
  /** The town has finished growing. */
  grown(): void;
  /** Takes the note down and calls the growth off if it has not begun, without marking the visit seen. */
  dispose(): void;
}

const NONE: Welcome = { waiting: false, townChanged() {}, grown() {}, dispose() {} };
/** The island is looked at this long before the town starts to grow, ms. */
export const WELCOME_DELAY = 900;

/** First visit to an empty island: a town grows by itself, and a note says so. */
export function maybeWelcome(root: HTMLElement, host: WelcomeHost): Welcome {
  if (seen() || host.hasTown()) return NONE;
  let card: HTMLElement | null = null;
  const remove = (): void => {
    card?.remove();
    card = null;
    window.removeEventListener('pointerdown', outside, true);
  };
  /** A press anywhere else once the town has grown: the note has been read. */
  const outside = (e: Event): void => {
    if (card && !host.growing() && !(e.target instanceof Node && card.contains(e.target))) remove();
  };
  let said: HTMLElement | null = null;
  let skip: HTMLElement | null = null;
  const empty = (): HTMLElement =>
    el('button', {
      class: 'lc-text-btn',
      text: t('Start empty'),
      attrs: { type: 'button', 'data-ui': 'welcome-empty' },
      on: {
        click: () => {
          remove();
          host.emptyIsland();
        },
      },
    });
  /** The phone's: one line and two buttons. */
  const showCompact = (over: HTMLElement): void => {
    said = el('span', { class: 'lc-welcome-said', text: t('A town to start you off') });
    skip = el('button', {
      class: 'lc-text-btn lc-primary',
      text: t('Skip'),
      attrs: { type: 'button', 'data-ui': 'welcome-skip' },
      on: {
        click: () => {
          said!.textContent = t('Finishing…');
          skip!.remove();
          host.skip?.();
        },
      },
    });
    card = el('div', { class: 'lc-card lc-welcome lc-welcome-mini', attrs: { 'data-ui': 'welcome', role: 'status', 'aria-label': t('Welcome to Little City') } }, [said, skip, empty()]);
    over.append(card);
    window.addEventListener('pointerdown', outside, true);
  };
  const show = (): void => {
    const over = host.compact?.() ?? null;
    if (over) return showCompact(over);
    card = el('div', { class: 'lc-card lc-welcome', attrs: { 'data-ui': 'welcome', role: 'status', 'aria-label': t('Welcome to Little City') } }, [
      iconButton('close', t('Close'), { class: 'lc-welcome-close', attrs: { 'data-ui': 'welcome-close' }, on: { click: remove } }),
      el('strong', { text: t('Welcome to Little City') }),
      el('p', { text: t('Here is a town to start you off. Build on it, change it, or begin with an empty island.') }),
      el('button', {
        class: 'lc-text-btn',
        text: t('Empty island instead'),
        attrs: { type: 'button', 'data-ui': 'welcome-empty' },
        on: {
          click: () => {
            remove();
            host.emptyIsland();
          },
        },
      }),
    ]);
    root.append(card);
    window.addEventListener('pointerdown', outside, true);
  };
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    // They began building in that first moment: it is their island, and they have found their way.
    remember();
    if (host.hasTown()) return;
    host.growTown();
    show();
  }, WELCOME_DELAY);
  return {
    get waiting() {
      return timer !== null;
    },
    townChanged() {
      // Built on before the town began to grow: no town, no note.
      if (timer !== null && host.hasTown()) {
        clearTimeout(timer);
        timer = null;
        remember();
      }
    },
    grown() {
      if (!said || !card) return;
      skip?.remove();
      said.textContent = t('It’s yours. Tap to build!');
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      remove();
    },
  };
}
