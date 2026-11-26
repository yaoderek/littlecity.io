// The tray (design section 7): the pieces and tools, in drawers, with the
// colour swatch beside them. On a phone the open drawer is one row that
// scrolls sideways. Owner: Interface.

import { PALETTE_SIZE, placedInfo, type PlacedKind } from '@/core/kinds';
import { RAMPS } from '@/style/palette';
import { houseStyle, RANDOM_STYLE } from '@/style/houses';
import { el, iconButton, setIcon } from './dom';
import { icon, styleIcon } from './icons';
import { t } from '@/i18n';
import { DRAWER_IDS, drawerItems, drawerLabels, drawerOf, isFloorPiece, isLandTool, isToolId, type DrawerId, type ItemId } from './pieces';
import { createStyleFlyout, styleName, type StyleFlyout } from './styles';

export interface TrayState {
  /** The drawer that is open. */
  drawer: DrawerId;
  /** The selected piece or tool. It stays selected while another drawer is open. */
  item: ItemId;
  /** 'auto' (the default): a new block takes the colour of what it was placed on. */
  swatch: number | 'auto';
  /** The house style new houses get: 0 = Random (the default), 1–6 a named style. For the session. */
  style: number;
  /**
   * Nothing in hand: the player is just looking round. Clicking the selected piece again puts it
   * down (Escape does not: it goes back to the whole island); picking any piece takes one up.
   * `item` keeps the last piece for the drawer's sake.
   */
  idle: boolean;
}

export interface Tray {
  readonly el: HTMLElement;
  readonly state: Readonly<TrayState>;
  /** Selects a piece or tool and opens its drawer. */
  select(item: ItemId): void;
  /** Puts the piece down (true) so nothing is in hand, or takes the last one up again (false). */
  setIdle(idle: boolean): void;
  openDrawer(drawer: DrawerId): void;
  setSwatch(swatch: number | 'auto'): void;
  /** Chooses the house style (0 = Random) without changing the selected piece. */
  setStyle(style: number): void;
  /** The house-style flyout on the House button. */
  readonly styles: StyleFlyout;
  /** Elements the style flyout must keep clear of (the length stepper, added by the interface). */
  avoid(el: HTMLElement): void;
  /** Keys 1–9 and 0: the nth item of the open drawer (0 is the tenth). False if there is none. */
  pickNumber(n: number): boolean;
  /** Refusal feedback: the selected button shakes its head. */
  shake(): void;
  /** Closes the colour pop-up; true if it was open. */
  closePopups(): boolean;
  /** The colour pop-up or the house-style flyout is open. */
  readonly popupOpen: boolean;
  onChange(fn: (state: Readonly<TrayState>) => void): void;
}

/** The colours the swatch offers for the selected piece: each kind maps the index onto its own ramp. */
export function swatchColors(item: ItemId): readonly string[] {
  const ramp = isToolId(item) || isFloorPiece(item) || isLandTool(item) ? 'wall' : placedInfo(item as PlacedKind).ramp;
  return RAMPS[ramp === 'none' ? 'wall' : ramp];
}

/** A button's tooltip with its key: "House (2)". */
const keyTip = (hint: string, key: string): string => (key ? t('{hint} ({key})', { hint, key }) : hint);

export function createTray(start: Partial<TrayState> = {}): Tray {
  const state: TrayState = { drawer: 'build', item: 'auto', swatch: 'auto', style: RANDOM_STYLE, idle: false, ...start };
  const listeners: ((s: Readonly<TrayState>) => void)[] = [];
  const emit = (): void => listeners.forEach((fn) => fn(state));

  const tabs = el('div', { class: 'lc-tabs', attrs: { role: 'tablist', 'aria-label': t('Drawers') } });
  const row = el('div', { class: 'lc-row', attrs: { role: 'group' } });
  const swatchButton = el('button', {
    class: 'lc-btn lc-swatch-btn',
    attrs: { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'data-ui': 'swatch' },
  });
  const swatches = el('div', { class: 'lc-pop lc-swatches', attrs: { role: 'group', 'aria-label': t('Colour'), hidden: '' } });
  const card = el('div', { class: 'lc-card lc-tray-card' }, [row, el('div', { class: 'lc-tray-side' }, [swatchButton])]);
  const root = el('div', { class: 'lc-tray', attrs: { role: 'toolbar', 'aria-label': t('Pieces and tools') } }, [tabs, card, swatches]);

  const avoid: HTMLElement[] = [];
  const styles = createStyleFlyout({
    tray: root,
    avoid: () => avoid,
    choose(style) {
      state.style = style;
      styles.close();
      renderStyle();
      // Choosing a look means "build houses like this".
      if (state.item !== 'house') api.select('house');
      else emit();
    },
  });
  root.append(styles.el);

  /** The wall colour a style's drawing uses: the swatch's, or on auto the style's own (what will be placed). */
  const wallIndex = (style: number): number => (state.swatch !== 'auto' ? state.swatch : (houseStyle(style)?.wall ?? 0));
  /** The House button shows the chosen style; the flyout shows every style in the wall colour. */
  const renderStyle = (): void => {
    const house = row.querySelector<HTMLElement>('[data-item="house"]');
    if (house) {
      const holder = house.querySelector('.lc-btn-icon');
      if (state.style === RANDOM_STYLE) setIcon(house, 'house');
      else if (holder) holder.innerHTML = styleIcon(state.style, wallIndex(state.style));
      house.dataset.houseStyle = String(state.style);
      const label = state.style === RANDOM_STYLE ? t('House') : t('House: {style}', { style: styleName(state.style) });
      house.setAttribute('aria-label', label);
      house.title = t('{what}. Hover for styles', { what: keyTip(label, house.dataset.key ?? '') });
    }
    styles.render(state.style, wallIndex);
  };

  const tabButtons = new Map<DrawerId, HTMLButtonElement>();
  const labels = drawerLabels();
  for (const id of DRAWER_IDS) {
    const tab = el('button', {
      class: 'lc-tab',
      text: labels[id],
      attrs: { type: 'button', role: 'tab', 'data-drawer': id },
      on: { click: () => api.openDrawer(id) },
    });
    tabButtons.set(id, tab);
    tabs.append(tab);
  }

  // Drawer names are longer in some languages (Spanish "Herramientas"): where the row of tabs does not fit
  // (a phone), the names get smaller, never cut or pushed off the edge. Again whenever the width changes.
  let fittedWidth = -1;
  const fitTabs = (): void => {
    const width = tabs.clientWidth;
    if (width === fittedWidth || width === 0) return;
    fittedWidth = width;
    tabs.style.removeProperty('--lc-tab-font');
    const first = tabButtons.values().next().value;
    if (!first) return;
    let size = parseFloat(getComputedStyle(first).fontSize);
    const over = (): boolean => tabs.scrollWidth > tabs.clientWidth + 1 || [...tabButtons.values()].some((b) => b.scrollWidth > b.clientWidth + 1);
    while (over() && size > 9) {
      size -= 0.5;
      tabs.style.setProperty('--lc-tab-font', `${size}px`);
    }
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitTabs()).observe(tabs);

  const renderRow = (): void => {
    row.replaceChildren();
    drawerItems(state.drawer).forEach((item, index) => {
      const key = index < 9 ? String(index + 1) : index === 9 ? '0' : '';
      const button = iconButton(item.id, item.label, {
        class: 'lc-item',
        showLabel: true,
        title: keyTip(item.hint, key),
        attrs: { 'data-item': item.id, 'data-key': key, 'aria-pressed': String(item.id === state.item && !state.idle) },
        // Clicking the piece already in hand puts it down: nothing selected, just looking.
        on: { click: () => (item.id === state.item && !state.idle ? api.setIdle(true) : api.select(item.id)) },
      });
      // The Land group (Raise, Dig, Level) is set off from the pieces after it.
      if (item.group === 'land') button.classList.add('lc-group-start');
      if (index > 0 && item.drawer === 'nature' && isLandTool(drawerItems(state.drawer)[index - 1]!.id) && !isLandTool(item.id)) button.classList.add('lc-group-after');
      row.append(button);
      if (item.id === 'house') styles.attach(button);
    });
    row.scrollLeft = 0;
    renderStyle();
  };

  const renderSwatch = (): void => {
    const colors = swatchColors(state.item);
    const auto = state.swatch === 'auto';
    swatchButton.title = auto ? t('Colour: auto (matches what you build on)') : t('Colour');
    swatchButton.setAttribute('aria-label', auto ? t('Colour: auto') : t('Colour {n}', { n: Number(state.swatch) + 1 }));
    swatchButton.setAttribute('data-swatch', String(state.swatch));
    swatchButton.replaceChildren(
      auto
        ? el('span', { class: 'lc-btn-icon', html: icon('swatch-auto') })
        : el('span', { class: 'lc-dot', attrs: { style: `background:${colors[Number(state.swatch) % colors.length]}` } }),
      el('span', { class: 'lc-btn-label', text: t('Colour') }),
    );
    swatches.replaceChildren(
      el('button', {
        class: 'lc-swatch lc-swatch-auto',
        html: icon('swatch-auto'),
        title: t('Auto: match what you build on'),
        attrs: { type: 'button', 'aria-label': t('Auto colour'), 'aria-pressed': String(auto), 'data-swatch': 'auto' },
        on: { click: () => api.setSwatch('auto') },
      }),
      ...Array.from({ length: PALETTE_SIZE }, (_, i) =>
        el('button', {
          class: 'lc-swatch',
          attrs: {
            type: 'button',
            'aria-label': t('Colour {n}', { n: i + 1 }),
            'aria-pressed': String(state.swatch === i),
            'data-swatch': String(i),
            style: `--c:${colors[i % colors.length]}`,
          },
          on: { click: () => api.setSwatch(i) },
        }),
      ),
    );
  };

  const renderSelection = (): void => {
    for (const [id, tab] of tabButtons) {
      tab.setAttribute('aria-selected', String(id === state.drawer));
      tab.classList.toggle('lc-tab-holds', id === drawerOf(state.item) && id !== state.drawer);
    }
    for (const button of row.querySelectorAll<HTMLElement>('[data-item]')) {
      button.setAttribute('aria-pressed', String(button.dataset.item === state.item && !state.idle));
    }
    row.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const setPopup = (open: boolean): void => {
    swatches.toggleAttribute('hidden', !open);
    swatchButton.setAttribute('aria-expanded', String(open));
  };
  swatchButton.addEventListener('click', () => setPopup(swatches.hasAttribute('hidden')));

  const api: Tray = {
    el: root,
    state,
    setIdle(idle) {
      if (state.idle === idle) return;
      state.idle = idle;
      renderSelection();
      emit();
    },
    select(item) {
      const drawer = drawerOf(item);
      const drawerChanged = drawer !== state.drawer;
      state.idle = false;
      state.item = item;
      state.drawer = drawer;
      if (drawerChanged) renderRow();
      renderSelection();
      renderSwatch();
      emit();
    },
    openDrawer(drawer) {
      if (drawer === state.drawer) return;
      state.drawer = drawer;
      renderRow();
      renderSelection();
      emit();
    },
    setSwatch(swatch) {
      state.swatch = swatch;
      renderSwatch();
      renderStyle();
      setPopup(false);
      emit();
    },
    setStyle(style) {
      if (style === state.style) return;
      state.style = style;
      renderStyle();
      emit();
    },
    styles,
    avoid(element) {
      avoid.push(element);
    },
    pickNumber(n) {
      const items = drawerItems(state.drawer);
      const item = items[n === 0 ? 9 : n - 1];
      if (!item) return false;
      api.select(item.id);
      return true;
    },
    shake() {
      const target = row.querySelector<HTMLElement>('[aria-pressed="true"]') ?? tabButtons.get(drawerOf(state.item))!;
      target.classList.remove('lc-shake');
      void target.offsetWidth; // restart the animation
      target.classList.add('lc-shake');
    },
    get popupOpen() {
      return !swatches.hasAttribute('hidden') || styles.isOpen;
    },
    closePopups() {
      const wasOpen = !swatches.hasAttribute('hidden');
      setPopup(false);
      return styles.close() || wasOpen;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };

  renderRow();
  renderSelection();
  renderSwatch();
  return api;
}
