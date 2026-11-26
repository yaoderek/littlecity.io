// Small answers to what the player just did: a passing message, a refusal
// said where it happened (catalogue F08), and the wiggle of a block the
// Change tool cannot change (design section 7). Owner: Interface.

import { cellFloorCenter, CELL_H, type CellKey } from '@/core/grid';
import { compose, rotationZ, translation } from '@/core/mat4';
import type { LifeStage } from '@/life/api';
import type { StructureId } from '@/resolve/plan';
import { locale, say, t } from '@/i18n';
import { el } from './dom';

export interface Feedback {
  readonly el: HTMLElement;
  /** A short message at the top that fades by itself. Saying the same thing twice in a row shows it once. */
  toast(text: string): void;
  /** A message with buttons that stays until one is pressed. Returns the function that removes it. */
  banner(text: string, buttons: { label: string; primary?: boolean; run(): void }[]): () => void;
  /** A link to copy by hand, for when the clipboard is not allowed. */
  linkBox(text: string, link: string): void;
  /** Why not, at the place it was tried (CSS pixels in the page). */
  refuse(reason: string, x: number, y: number): void;
}

// The language's own capitals (Turkish i is İ).
const sentence = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : s);

export function createFeedback(layer: HTMLElement): Feedback {
  const toasts = el('div', { class: 'lc-toasts', attrs: { 'aria-live': 'polite' } });
  let lastToast: HTMLElement | null = null;

  return {
    el: toasts,
    toast(line) {
      const text = say(line);
      if (lastToast?.isConnected && lastToast.textContent === text) lastToast.remove();
      const node = el('div', { class: 'lc-card lc-toast', text, attrs: { 'data-ui': 'toast' } });
      node.addEventListener('animationend', () => node.remove());
      lastToast = node;
      toasts.append(node);
    },
    banner(text, buttons) {
      const node = el('div', { class: 'lc-card lc-banner', attrs: { 'data-ui': 'banner' } }, [el('span', { text: say(text) })]);
      const close = (): void => node.remove();
      for (const b of buttons) {
        node.append(
          el('button', {
            class: `lc-text-btn${b.primary ? ' lc-primary' : ''}`,
            text: b.label,
            attrs: { type: 'button' },
            on: {
              click: () => {
                close();
                b.run();
              },
            },
          }),
        );
      }
      toasts.append(node);
      return close;
    },
    linkBox(text, link) {
      const input = el('input', { attrs: { type: 'text', readonly: '', value: link, 'aria-label': t('Link') } });
      const node = el('div', { class: 'lc-card lc-link-box', attrs: { 'data-ui': 'link-box' } }, [
        el('span', { text }),
        input,
        el('button', { class: 'lc-text-btn', text: t('Done'), attrs: { type: 'button' }, on: { click: () => node.remove() } }),
      ]);
      toasts.append(node);
      input.focus();
      input.select();
    },
    refuse(reason, x, y) {
      const node = el('div', { class: 'lc-puff', text: sentence(say(reason)), attrs: { 'data-ui': 'refusal' } });
      layer.append(node);
      // Keep it on the screen: centred over the point, clamped to the edges.
      const w = node.offsetWidth, h = node.offsetHeight;
      const left = Math.min(Math.max(6, x - w / 2), Math.max(6, layer.clientWidth - w - 6));
      const top = Math.max(6, y - h - 18);
      node.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`;
      node.addEventListener('animationend', () => node.remove());
    },
  };
}

/**
 * Rocks a structure about its foot and lets it settle: "no, this one does
 * not change". Uses only the stage (lift, move, bake back).
 */
export function wiggle(stage: LifeStage, structure: StructureId, cell: CellKey, ms = 320): void {
  const handle = stage.liftStructure(structure);
  if (!handle) return;
  const [cx, cy, cz] = cellFloorCenter(cell);
  const pivot = translation(cx, cy, cz);
  const back = translation(-cx, -cy, -cz);
  const lift = translation(0, CELL_H * 0.04, 0);
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    if (t >= 1) {
      handle.release();
      return;
    }
    const angle = Math.sin(t * Math.PI * 4) * (1 - t) * 0.09;
    handle.setMatrix(compose(handle.base, pivot, lift, rotationZ(angle), back));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
