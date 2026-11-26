// The few DOM helpers the interface needs (no framework). Owner: Interface.

import { PALETTE } from '@/style/palette';
import { icon, iconDefs } from './icons';

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  /** Plain attributes: id, role, aria-*, data-*, type. */
  attrs?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title) node.title = props.title;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  for (const [type, fn] of Object.entries(props.on ?? {})) node.addEventListener(type, fn as EventListener);
  for (const child of children) if (child) node.append(child);
  return node;
}

/** A button with one of our icons, and optionally a label under or beside it. */
export function iconButton(iconId: string, label: string, props: ElProps & { showLabel?: boolean } = {}): HTMLButtonElement {
  const button = el('button', {
    ...props,
    class: `lc-btn ${props.class ?? ''}`.trim(),
    title: props.title ?? label,
    attrs: { type: 'button', 'aria-label': label, ...props.attrs },
  });
  button.append(el('span', { class: 'lc-btn-icon', html: icon(iconId) }));
  if (props.showLabel) button.append(el('span', { class: 'lc-btn-label', text: label }));
  return button;
}

const iconsSet = new WeakMap<Element, string>();
export function setIcon(button: HTMLElement, iconId: string): void {
  const holder = button.querySelector('.lc-btn-icon');
  // The same picture again is left alone: the time of day's is set after every edit, and parsing and painting it is not free.
  if (!holder || iconsSet.get(holder) === iconId) return;
  iconsSet.set(holder, iconId);
  holder.innerHTML = icon(iconId);
}

/**
 * Things every page of ours needs once: the shared pen-wobble filter, and
 * the palette's ink and paper as CSS variables (ui.css reads them).
 */
export function installTheme(root: HTMLElement = document.body): void {
  if (!document.getElementById('lc-wobble')) root.insertAdjacentHTML('afterbegin', iconDefs());
  const style = document.documentElement.style;
  style.setProperty('--lc-ink', PALETTE.ink);
  style.setProperty('--lc-paper', PALETTE.paper);
  style.setProperty('--lc-card', PALETTE.white);
  style.setProperty('--lc-pick', PALETTE.yellow);
  style.setProperty('--lc-refuse', PALETTE.red);
  style.setProperty('--lc-dot', PALETTE.red);
}

/** True where the main pointer is a finger (phones, tablets): no hover, bigger targets. */
/**
 * A phone-sized window: the interface starts with the least it can (ui.css, `.lc-phone`). The short side
 * of a phone held sideways counts too. (X's own browser on an iPhone leaves about 400 x 570.)
 */
export const PHONE_QUERY = '(max-width: 640px), (pointer: coarse) and (max-height: 500px)';
export function isPhone(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

export function isCoarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
