// My towns (design section 15, added 2026-11-20): every town the player has
// made, as pictures on cards. A card opens its town; the name can be changed
// in place; a town can go out as a file, or be deleted after a second
// question. The town on screen is marked "Here now" and cannot be deleted.
// The keeping itself is src/app/towns.ts. Owner: Interface.

import { locale, t } from '@/i18n';
import { el, iconButton } from './dom';
import { icon } from './icons';

export interface TownCard {
  id: string;
  name: string;
  updated: number;
  thumb?: string;
}

export interface TownsHost {
  /** Takes a fresh picture of the town on screen, then lists every kept town, newest first. */
  list(): Promise<{ towns: TownCard[]; current: string | null }>;
  /** Opens a kept town; a reason if it cannot be opened. */
  open(id: string): string | null;
  rename(id: string, name: string): void;
  remove(id: string): Promise<boolean>;
  download(id: string): void;
  newIsland(): void;
  /** Added by Global Village: opens the town (unless it is the one on screen, `here`) and the Post my town dialog for it. Without it, no Post button. */
  post?(id: string, here: boolean): void;
}

export interface TownsSheet {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): void;
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago", then the date. */
export function whenText(then: number, now: number = Date.now()): string {
  const s = Math.max(0, (now - then) / 1000);
  if (s < 60) return t('just now');
  const m = Math.floor(s / 60);
  if (m < 60) return t({ one: 'a minute ago', other: '{n} minutes ago' }, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t({ one: 'an hour ago', other: '{n} hours ago' }, { n: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t('yesterday');
  if (d < 14) return t({ one: 'a day ago', other: '{n} days ago' }, { n: d });
  return new Date(then).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function createTownsSheet(host: TownsHost, say: (text: string) => void): TownsSheet {
  const grid = el('div', { class: 'lc-towns-grid', attrs: { 'data-ui': 'towns-grid' } });
  const close = iconButton('close', t('Close'), { class: 'lc-round lc-towns-close', attrs: { 'data-towns': 'close' }, on: { click: () => api.close() } });
  const panel = el('div', { class: 'lc-pop lc-towns', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('My towns') } }, [
    el('div', { class: 'lc-towns-head' }, [
      el('div', {}, [el('h2', { text: t('My towns') }), el('small', { text: t('Every town you make is kept here, in this browser.') })]),
      close,
    ]),
    grid,
  ]);
  const back = el('div', { class: 'lc-towns-back', attrs: { hidden: '', 'data-ui': 'towns' } }, [panel]);
  // A click on the shade outside the panel closes it; keys typed in a name stay out of the game's shortcuts.
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) api.close();
  });
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') api.close();
  });

  const newCard = (): HTMLElement =>
    el('button', { class: 'lc-town-card lc-town-new', attrs: { type: 'button', 'data-towns': 'new' }, on: { click: () => (api.close(), host.newIsland()) } }, [
      el('span', { class: 'lc-town-pic', html: icon('island') }),
      el('span', { class: 'lc-town-new-label', text: t('New island') }),
    ]);

  const card = (town: TownCard, here: boolean): HTMLElement => {
    const pic = el('button', { class: 'lc-town-pic', attrs: { type: 'button', 'data-towns': 'open', 'aria-label': t('Open {name}', { name: town.name }) } });
    if (town.thumb) pic.append(el('img', { attrs: { src: town.thumb, alt: '', draggable: 'false' } }));
    else pic.innerHTML = icon('island');
    pic.addEventListener('click', () => {
      if (here) return api.close();
      const reason = host.open(town.id);
      if (reason) say(reason);
      else api.close();
    });
    const name = el('input', { class: 'lc-town-name', attrs: { type: 'text', value: town.name, maxlength: '60', 'aria-label': t('Town name'), 'data-towns': 'name', spellcheck: 'false' } });
    const commit = (): void => {
      const v = name.value.trim();
      if (!v) name.value = town.name;
      else if (v !== town.name) {
        town.name = v;
        host.rename(town.id, v);
      }
    };
    name.addEventListener('change', commit);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
      if (e.key === 'Escape') {
        name.value = town.name;
        name.blur();
        e.stopPropagation();
      }
    });
    const tools = el('div', { class: 'lc-town-tools' }, [
      host.post ? iconButton('village', t('Post to Global Village'), { class: 'lc-town-tool', attrs: { 'data-towns': 'post' }, on: { click: () => host.post?.(town.id, here) } }) : null,
      iconButton('download', t('Save to a file'), { class: 'lc-town-tool', attrs: { 'data-towns': 'download' }, on: { click: () => host.download(town.id) } }),
      here ? null : iconButton('trash', t('Delete'), { class: 'lc-town-tool', attrs: { 'data-towns': 'delete' }, on: { click: () => askDelete() } }),
    ]);
    const node = el('div', { class: `lc-town-card${here ? ' lc-town-here' : ''}`, attrs: { 'data-town': town.id } }, [
      pic,
      name,
      el('div', { class: 'lc-town-meta' }, [el('span', { class: here ? 'lc-town-tag' : '', text: here ? t('Here now') : whenText(town.updated) }), tools]),
    ]);
    const askDelete = (): void => {
      const ask = el('div', { class: 'lc-town-ask', attrs: { 'data-ui': 'town-delete' } }, [
        el('p', { text: t('Delete {name}?', { name: town.name }) }),
        el('small', { text: t('It will be gone for good.') }),
        el('div', { class: 'lc-confirm-buttons' }, [
          el('button', {
            class: 'lc-text-btn lc-primary',
            text: t('Delete'),
            attrs: { type: 'button', 'data-towns': 'delete-yes' },
            on: {
              click: async () => {
                if (await host.remove(town.id)) node.remove();
                else {
                  ask.remove();
                  say(t('That town could not be deleted.'));
                }
              },
            },
          }),
          el('button', { class: 'lc-text-btn', text: t('Keep it'), attrs: { type: 'button', 'data-towns': 'delete-no' }, on: { click: () => ask.remove() } }),
        ]),
      ]);
      node.append(ask);
    };
    return node;
  };

  let opening = 0;
  const api: TownsSheet = {
    el: back,
    get isOpen() {
      return !back.hasAttribute('hidden');
    },
    async open() {
      const ticket = ++opening;
      grid.replaceChildren(el('p', { class: 'lc-towns-wait', text: t('Fetching your towns…') }));
      back.removeAttribute('hidden');
      const { towns, current } = await host.list();
      if (ticket !== opening || !api.isOpen) return;
      const here = towns.filter((t) => t.id === current);
      const rest = towns.filter((t) => t.id !== current);
      // New island comes first, always in the same place (Derek, 2026-11-21); then the town on screen, then the rest.
      grid.replaceChildren(newCard(), ...here.map((t) => card(t, true)), ...rest.map((t) => card(t, false)));
      close.focus();
    },
    close() {
      opening++;
      back.setAttribute('hidden', '');
    },
  };
  return api;
}
