// The ☰ menu (design section 7): grow a town (design 15a: a second screen
// asks where, on this island or on a new one, and a third what kind of town),
// new island (a second screen asks what kind of island, and says what becomes
// of the town there is now), My towns (src/ui/towns.ts), share link,
// postcard, town file out and in, sound, and how loud the music and the
// sounds are. (The dev tuning panel is not in the game: removed at Derek's
// request, 2026-11-20. It lives on in the gallery.)
//
// A choice whose work takes a while (finding an island of a kind) returns a
// promise: the menu stays open with that row marked as working and the rest
// put aside until it is done; closing the menu or Back calls it off.
// Owner: Interface.

import { LANG_NAMES, LANGS, t, type Lang } from '@/i18n';
import { ISLAND_KIND_NAMES, ISLAND_KINDS, type IslandKind } from '@/terrain/kinds';
import { CHARACTER_NAMES, CHARACTERS, type Character } from '@/townmaker/character';
import { el, iconButton, isPhone, setIcon } from './dom';
import { setDot } from './dots';
import { icon } from './icons';
import { track } from '@/app/analytics';

/** The tip jar. On a wide screen a small link in the corner (interface.ts); on a phone, the menu's last row. */
export const COFFEE_URL = 'https://ko-fi.com/yaoderek';

/** What a choice does; a promise keeps the menu open, working, until it settles. */
export type Work = void | Promise<unknown>;

export interface MenuActions {
  /** Fills this island with a grown town: of this kind, or (null) the kind the dice choose, as before. */
  growTown(kind: Character | null, signal: AbortSignal): Work;
  /** Grows a town on a new island: one that suits the kind asked for, or (null) any island and the dice's kind. */
  growNewIsland(kind: Character | null, signal: AbortSignal): Work;
  /**
   * Which kinds of town this island can grow: true, false, or null while the planner is still being
   * asked (then `ready` hears each answer).
   */
  townKindsHere(ready: (kind: Character, ok: boolean) => void): Record<Character, boolean | null>;
  /** The island holds more than its starting trees: leaving it says the town will be gone. */
  hasTown(): boolean;
  /** A new island of this kind, or (null) any. The signal says the player called it off. */
  newIsland(kind: IslandKind | null, signal: AbortSignal): Work;
  /** My towns: every town the player has made. Left out of the menu when absent. */
  myTowns?(): void;
  shareLink(): void;
  postcard(): void;
  downloadTown(): void;
  openTownFile(file: File): void;
  /** Sound on or off; the menu shows the current state. */
  sound(): boolean;
  setSound(on: boolean): void;
  /** How loud, 0–1: the background music (0 is off) and the game's sounds. Left out of the menu when absent. */
  musicVolume?(): number;
  setMusicVolume?(v: number): void;
  soundVolume?(): number;
  setSoundVolume?(v: number): void;
  /** The guide to special buildings, where it has no button of its own (a phone). Left out of the menu when false. */
  guide?(): void;
  showGuide?(): boolean;
  /** The town's numbers (who lives here, how they feel) on screen or not. Left out of the menu when absent. */
  stats?(): boolean;
  setStats?(on: boolean): void;
  /** Mischief (design section 13b): the town mends its own damage. Left out of the menu when absent. */
  rebuild?(): boolean;
  setRebuild?(on: boolean): void;
  /** The raid (src/life/raid): raiders come on their own now and then. Left out of the menu when absent. */
  raiders?(): boolean;
  setRaiders?(on: boolean): void;
  /** The language the game speaks: the one in use, and the player's choice of another. Left out of the menu when absent. */
  language?: { current(): Lang; choose(lang: Lang): void };
  /** A red dot on this row (src/ui/dots.ts): something in it not tried yet. Asked as the row is drawn. */
  dot?(row: string): boolean;
  /** This row was chosen (its dot, if any, goes for good). */
  tried?(row: string): void;
}

export interface Menu {
  /** The ☰ button. */
  readonly button: HTMLButtonElement;
  /** The pop-up, hidden until the button is pressed. */
  readonly el: HTMLElement;
  /** The hidden file chooser behind "Open a town file"; it lives beside the menu, not in it. */
  readonly file: HTMLInputElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/** "harbour town" → "Harbour town". */
const capital = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

/** Why a kind of town cannot be grown on the island there is (shown on hover over its greyed row, or when it is pressed). */
export const whyNotHere = (): Record<Character, string> => ({
  harbour: t('This island has no coast for a harbour.'),
  marble: t('This island has no room for a forum.'),
  castle: t('This island has no room for a castle.'),
  market: t('This island has no room for a market.'),
  river: t('This island has no river long enough.'),
  farming: t('This island has no room for farms.'),
  hill: t('This island has no high ground.'),
  gardens: t('This island has no room for gardens.'),
});

export function createMenu(actions: MenuActions): Menu {
  const panel = el('div', { class: 'lc-pop lc-menu', attrs: { role: 'menu', hidden: '', 'data-ui': 'menu' } });
  const button = iconButton('menu', t('Menu'), {
    class: 'lc-round',
    attrs: { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-ui': 'menu-button' },
  });
  const file = el('input', { attrs: { type: 'file', accept: '.littlecity,.txt,text/plain', hidden: '', 'data-ui': 'town-file' } });
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (chosen) actions.openTownFile(chosen);
  });

  /** The choice under way, while its work takes a while. */
  let pending: AbortController | null = null;
  const callOff = (): void => {
    pending?.abort();
    pending = null;
    panel.classList.remove('lc-working');
  };

  /** Runs a choice: the menu closes at once, or when its work is done. */
  const choose = (row: HTMLButtonElement, run: (signal: AbortSignal) => Work): void => {
    callOff();
    const ctl = new AbortController();
    const work = run(ctl.signal);
    if (!(work instanceof Promise)) return api.close();
    pending = ctl;
    row.classList.add('lc-busy');
    row.setAttribute('aria-busy', 'true');
    panel.classList.add('lc-working');
    const done = (): void => {
      if (pending !== ctl) return;
      pending = null;
      api.close();
    };
    work.then(done, done);
  };

  const item = (id: string, iconId: string, label: string, run: () => void, keepOpen = false): HTMLButtonElement => {
    const row = iconButton(iconId, label, {
      class: 'lc-menu-item',
      showLabel: true,
      attrs: { role: 'menuitem', 'data-menu': id },
      on: {
        click: () => {
          actions.tried?.(id);
          if (!keepOpen) api.close();
          run();
        },
      },
    });
    if (actions.dot?.(id)) setDot(row, true);
    return row;
  };

  /** A row of a kind screen: its icon and a bare label. */
  const kindItem = (id: string, iconId: string, label: string, run: (signal: AbortSignal) => Work): HTMLButtonElement => {
    const row: HTMLButtonElement = iconButton(iconId, label, {
      class: 'lc-menu-item',
      showLabel: true,
      attrs: { role: 'menuitem', 'data-menu': id },
      on: { click: () => choose(row, run) },
    });
    return row;
  };

  const back = (id: string, to: () => void): HTMLElement =>
    el('div', { class: 'lc-confirm-buttons' }, [
      el('button', {
        class: 'lc-text-btn',
        text: t('Back'),
        attrs: { type: 'button', 'data-menu': id },
        on: {
          click: () => {
            callOff();
            to();
          },
        },
      }),
    ]);

  /**
   * The line under a kind screen's question when the player leaves the town there is now: it is kept
   * in My towns where there is My towns, and gone where there is not.
   */
  const leaving = (): HTMLElement | null =>
    actions.hasTown() ? el('small', { text: actions.myTowns ? t('The town you have now stays in My towns.') : t('The town you have now will be gone.') }) : null;

  /** A volume row: an icon, a name and a slider 0–100. Not a menu item: the menu stays open while it is dragged. */
  const volume = (id: string, iconId: string, label: string, value: number, set: (v: number) => void): HTMLElement => {
    const range = el('input', {
      attrs: { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), 'aria-label': id === 'music' ? t('Music volume') : t('Sounds volume'), 'data-ui': `volume-${id}` },
    });
    range.addEventListener('input', () => set(Number(range.value) / 100));
    return el('label', { class: 'lc-menu-volume' }, [el('span', { class: 'lc-btn-icon', html: icon(iconId) }), el('span', { class: 'lc-menu-volume-label', text: label }), range]);
  };

  const showItems = (): void => {
    const showSound = (on: boolean): void => {
      setIcon(sound, on ? 'sound-on' : 'sound-off');
      sound.querySelector('.lc-btn-label')!.textContent = on ? t('Sound: on') : t('Sound: off');
      sound.setAttribute('aria-label', on ? t('Sound: on') : t('Sound: off'));
      sounds?.classList.toggle('lc-menu-volume-off', !on);
      music?.classList.toggle('lc-menu-volume-off', !on);
    };
    const soundOn = actions.sound();
    const sound = item(
      'sound',
      soundOn ? 'sound-on' : 'sound-off',
      soundOn ? t('Sound: on') : t('Sound: off'),
      () => {
        const next = !actions.sound();
        actions.setSound(next);
        showSound(next);
      },
      true,
    );
    // Moving either slider up turns sound on: nobody sets a level for something that is off.
    const music =
      actions.musicVolume && actions.setMusicVolume
        ? volume('music', 'music', t('Music'), actions.musicVolume(), (v) => {
            actions.setMusicVolume!(v);
            if (v > 0 && !actions.sound()) {
              actions.setSound(true);
              showSound(true);
            }
          })
        : null;
    const sounds =
      actions.soundVolume && actions.setSoundVolume
        ? volume('sound', 'volume', t('Sounds'), actions.soundVolume(), (v) => {
            actions.setSoundVolume!(v);
            if (v > 0 && !actions.sound()) {
              actions.setSound(true);
              showSound(true);
            }
          })
        : null;
    sounds?.classList.toggle('lc-menu-volume-off', !soundOn);
    music?.classList.toggle('lc-menu-volume-off', !soundOn);
    const label = (on: boolean): string => (on ? t('Rebuild: on') : t('Rebuild: off'));
    const rebuild =
      actions.rebuild && actions.setRebuild
        ? item(
            'rebuild',
            'mend',
            label(actions.rebuild()),
            () => {
              const next = !actions.rebuild!();
              actions.setRebuild!(next);
              rebuild!.querySelector('.lc-btn-label')!.textContent = label(next);
              rebuild!.setAttribute('aria-label', label(next));
            },
            true,
          )
        : null;
    const raidLabel = (on: boolean): string => (on ? t('Raiders: on') : t('Raiders: off'));
    const raiders =
      actions.raiders && actions.setRaiders
        ? item(
            'raiders',
            'raid',
            raidLabel(actions.raiders()),
            () => {
              const next = !actions.raiders!();
              actions.setRaiders!(next);
              raiders!.querySelector('.lc-btn-label')!.textContent = raidLabel(next);
              raiders!.setAttribute('aria-label', raidLabel(next));
            },
            true,
          )
        : null;
    const statsLabel = (on: boolean): string => (on ? t('Town stats: on') : t('Town stats: off'));
    const stats =
      actions.stats && actions.setStats
        ? item(
            'stats',
            'people',
            statsLabel(actions.stats()),
            () => {
              const next = !actions.stats!();
              actions.setStats!(next);
              stats!.querySelector('.lc-btn-label')!.textContent = statsLabel(next);
              stats!.setAttribute('aria-label', statsLabel(next));
            },
            true,
          )
        : null;
    panel.replaceChildren(
      ...(actions.guide && actions.showGuide?.() ? [item('guide', 'guide', t('Almanac'), actions.guide)] : []),
      item('grow', 'grow', t('Grow a town'), showGrow, true),
      el('div', { class: 'lc-menu-rule' }),
      ...(actions.myTowns ? [item('towns', 'towns', t('My towns'), actions.myTowns)] : []),
      item('new', 'island', t('New island'), showIslandKinds, true),
      item('share', 'share', t('Share link'), actions.shareLink),
      item('postcard', 'postcard', t('Postcard'), actions.postcard),
      el('div', { class: 'lc-menu-rule' }),
      item('download', 'download', t('Save town to a file'), actions.downloadTown),
      item('open', 'open', t('Open a town file'), () => file.click()),
      el('div', { class: 'lc-menu-rule' }),
      ...(music ? [music] : []),
      sound,
      ...(sounds ? [sounds] : []),
      ...(rebuild ? [rebuild] : []),
      ...(raiders ? [raiders] : []),
      ...(stats ? [stats] : []),
      ...(actions.language ? [el('div', { class: 'lc-menu-rule' }), item('language', 'language', t('Language'), showLanguages, true)] : []),
      // Phones only: Derek, 2026-11-25, wanted it in the menu there, not on the town.
      ...(isPhone()
        ? [
            el('div', { class: 'lc-menu-rule' }),
            item('coffee', 'coffee', t('Buy me a coffee'), () => {
              track('coffee_clicked', { from: 'menu' });
              window.open(COFFEE_URL, '_blank', 'noopener');
            }),
          ]
        : []),
    );
  };

  /** Grow a town, second screen: where. On this island (over whatever is here) or on a new one. */
  const showGrow = (): void => {
    // The planner's word on the kinds that may fall back takes a moment: ask now, while the player reads.
    actions.townKindsHere(() => {});
    panel.replaceChildren(
      el('div', { class: 'lc-confirm lc-choice', attrs: { 'data-ui': 'grow-choice' } }, [
        el('p', { text: t('Grow a town') }),
        item('grow-here', 'grow', t('On this island'), () => showTownKinds('here'), true),
        item('grow-new', 'island', t('On a new island'), () => showTownKinds('new'), true),
        back('grow-back', showItems),
      ]),
    );
  };

  /**
   * Grow a town, third screen: what kind. Surprise me first (the dice, as before), then the eight
   * kinds. On this island a kind it cannot grow is shown greyed; on a new island every kind is
   * offered and an island is found to suit it.
   */
  const showTownKinds = (where: 'here' | 'new'): void => {
    const rows = new Map<Character, HTMLButtonElement>();
    // Why a greyed kind cannot be grown here: said on hover (the row's title) and, for a finger, in a line
    // under the list when the row is pressed. The row is aria-disabled, not disabled, so both can happen.
    const why = el('small', { class: 'lc-kind-why', attrs: { 'data-ui': 'kind-why', role: 'status', hidden: '' } });
    const mark = (kind: Character, ok: boolean | null): void => {
      const row = rows.get(kind)!;
      row.disabled = ok === null;
      row.setAttribute('aria-disabled', String(ok !== true));
      if (ok === null) row.setAttribute('aria-busy', 'true');
      else row.removeAttribute('aria-busy');
      row.dataset.can = ok === null ? 'checking' : String(ok);
      row.title = ok === false ? whyNotHere()[kind] : '';
    };
    const grow = (kind: Character | null) => (signal: AbortSignal) => (where === 'here' ? actions.growTown(kind, signal) : actions.growNewIsland(kind, signal));
    for (const kind of CHARACTERS) {
      const row = kindItem(`town-${kind}`, `town-${kind}`, t(capital(CHARACTER_NAMES[kind])), grow(kind));
      // A kind this island cannot grow: pressing it says why, and grows nothing.
      row.addEventListener(
        'click',
        (e) => {
          if (row.dataset.can !== 'false') return;
          e.stopImmediatePropagation();
          e.preventDefault();
          why.textContent = whyNotHere()[kind];
          why.removeAttribute('hidden');
        },
        true,
      );
      rows.set(kind, row);
    }
    const any = kindItem('town-any', 'dice', t('Surprise me'), grow(null));
    any.classList.add('lc-kind-any');
    const screen = el('div', { class: 'lc-confirm lc-choice lc-kinds lc-kinds-wide', attrs: { 'data-ui': 'town-kinds', 'data-where': where } }, [
      el('p', { text: t('What kind of town?') }),
      where === 'new' ? leaving() : null,
      el('div', { class: 'lc-kind-grid' }, [any, ...rows.values()]),
      why,
      back('town-back', showGrow),
    ]);
    panel.replaceChildren(screen);
    if (where === 'here') {
      const can = actions.townKindsHere((kind, ok) => {
        if (panel.contains(screen)) mark(kind, ok);
      });
      for (const kind of CHARACTERS) mark(kind, can[kind]);
    }
  };

  /** New island, second screen: what kind of island (saying what becomes of the town there is now). */
  const showIslandKinds = (): void => {
    panel.replaceChildren(
      el('div', { class: 'lc-confirm lc-choice lc-kinds', attrs: { 'data-ui': 'confirm' } }, [
        el('p', { text: t('What kind of island?') }),
        leaving(),
        kindItem('new-yes', 'dice', t('Surprise me'), (signal) => actions.newIsland(null, signal)),
        ...ISLAND_KINDS.map((kind) => kindItem(`island-${kind}`, `isle-${kind}`, t(ISLAND_KIND_NAMES[kind]), (signal) => actions.newIsland(kind, signal))),
        back('new-back', showItems),
      ]),
    );
  };

  /** Language, second screen: each language in its own name, the one in use marked. Choosing another saves the town and reloads. */
  const showLanguages = (): void => {
    const language = actions.language!;
    const now = language.current();
    panel.replaceChildren(
      el('div', { class: 'lc-confirm lc-choice', attrs: { 'data-ui': 'languages' } }, [
        el('p', { text: t('Language') }),
        ...LANGS.map((lang) => {
          const row = item(`lang-${lang}`, lang === now ? 'tick' : 'language', LANG_NAMES[lang], () => {
            if (lang !== now) language.choose(lang);
          });
          row.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : lang);
          if (lang === now) row.setAttribute('aria-current', 'true');
          return row;
        }),
        back('language-back', showItems),
      ]),
    );
  };

  const api: Menu = {
    button,
    el: panel,
    file,
    get isOpen() {
      return !panel.hasAttribute('hidden');
    },
    open() {
      showItems();
      panel.removeAttribute('hidden');
      button.setAttribute('aria-expanded', 'true');
    },
    close() {
      callOff();
      panel.setAttribute('hidden', '');
      button.setAttribute('aria-expanded', 'false');
    },
  };
  button.addEventListener('click', () => (api.isOpen ? api.close() : api.open()));
  return api;
}
