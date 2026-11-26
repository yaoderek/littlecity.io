// The unlock moment (Derek, 2026-11-26): the first time a player builds one of the almanac's special
// buildings by hand, ever, across all their towns, it pops up in a burst of stars (src/life/feedback/
// celebrate.ts) and a few words float beside it, "New building unlocked!" and its name, gone in about
// three seconds. A tap on the words opens the almanac at that building. Once per kind per player.
// Owner: Interface.
//
// What counts is src/guide/collection.ts. Here: the record (its own localStorage key, never in a town), and
// telling the player's own edits from everything else. The interface runs every edit of the player's hand
// inside `hand()`; the town changes seen outside it (a town growing, mischief, undo, a town opened) are
// only watched, so nothing they make is ever counted.

import { CELL_H, keyX, keyY, keyZ } from '@/core/grid';
import type { Vec3 } from '@/core/mat4';
import { collectable, dressingFacts, madeByEdit, madeInDressing, readRecord, writeRecord } from '@/guide/collection';
import type { GuideEntry } from '@/guide/entries';
import { t } from '@/i18n';
import type { TownView } from '@/render/api';
import { EDGE_ID_BASE, FLOOR_ID_BASE, type DressingPlan, type ShapePlan, type StructureId } from '@/resolve/plan';
import { el } from './dom';

/** Where the record is kept: { "v": 1, "built": [entry ids] }. Clear it to see every unlock again. */
export const BUILT_KEY = 'lc:almanac.built';

export interface Unlocked {
  entry: GuideEntry;
  /** The building that holds it; null for one the dressing holds (it is celebrated where the edit was). */
  structure: StructureId | null;
}

export interface CollectorHost {
  storage: Storage | null;
  /** The town as it is when the collector starts. */
  shape: ShapePlan;
  /** False: nothing is counted (a scenario). */
  enabled: boolean;
  /** Buildings built by hand for the first time, just now. */
  unlocked(made: readonly Unlocked[]): void;
}

export interface Collector {
  /** The entry ids built by hand so far. */
  readonly built: ReadonlySet<string>;
  /** Runs an edit of the player's own hand: what it makes counts. */
  hand<T>(edit: () => T): T;
  /** The town on screen changed (by anything): call after every change. */
  changed(shape: ShapePlan): void;
  /** The dressing for a town arrived. */
  dressed(shape: ShapePlan, dressing: DressingPlan): void;
  /** Forgets every building built (?almanac=reset). */
  reset(): void;
}

export function createCollector(host: CollectorHost): Collector {
  const { storage } = host;
  const read = (): string[] => {
    try {
      return readRecord(storage?.getItem(BUILT_KEY));
    } catch {
      return [];
    }
  };
  const built = new Set(read());
  let last = host.shape;
  let inHand = 0;
  /** The player's edit whose dressing is awaited, and the dressing's facts from before it. */
  let pending: { shape: ShapePlan; before: ReadonlySet<string> } | null = null;
  let facts: ReadonlySet<string> | null = null;

  const record = (made: Unlocked[]): void => {
    const fresh = made.filter((m) => collectable(m.entry.id) && !built.has(m.entry.id));
    if (fresh.length === 0) return;
    // Another tab may have added to it meanwhile: merge, never overwrite.
    for (const id of read()) built.add(id);
    const news = fresh.filter((m) => !built.has(m.entry.id));
    for (const m of news) built.add(m.entry.id);
    try {
      storage?.setItem(BUILT_KEY, writeRecord(built));
    } catch {
      // Storage full or refused: it is remembered for this visit only.
    }
    if (news.length > 0) host.unlocked(news);
  };

  return {
    built,
    hand(edit) {
      inHand++;
      try {
        return edit();
      } finally {
        inHand--;
      }
    },
    changed(shape) {
      if (shape === last) return;
      const before = last;
      last = shape;
      if (!host.enabled || inHand === 0) {
        // Not the player's: whatever it made is not theirs, and its dressing is not awaited.
        pending = null;
        return;
      }
      record(madeByEdit(before, shape).map((m) => ({ entry: m.entry, structure: m.structure })));
      // What the dressing holds is known when it comes; compared with the dressing from before the first of
      // the player's edits since then.
      if (facts) pending = { shape, before: pending?.before ?? facts };
    },
    dressed(shape, dressing) {
      const now = dressingFacts(dressing);
      const was = pending;
      pending = null;
      facts = now;
      if (!host.enabled || !was || was.shape !== shape) return;
      record(madeInDressing(was.before, now).map((entry) => ({ entry, structure: null })));
    },
    reset() {
      built.clear();
      try {
        storage?.removeItem(BUILT_KEY);
      } catch {
        // as above
      }
    },
  };
}

/** The top of a structure, where its stars burst and its words float; and how wide it is, in cells. */
export function topOf(shape: ShapePlan, id: StructureId): { at: Vec3; size: number } | null {
  const s = shape.structures.get(id);
  if (!s || s.cells.length === 0) return null;
  let x = 0, z = 0, top = -Infinity, low = Infinity;
  for (const c of s.cells) {
    x += keyX(c) + 0.5;
    z += keyZ(c) + 0.5;
    top = Math.max(top, keyY(c));
    low = Math.min(low, keyY(c));
  }
  const n = s.cells.length;
  // A floor region (a field, a lawn) lies in its cells; a building stands up through them.
  const y = id >= FLOOR_ID_BASE && id < EDGE_ID_BASE ? low * CELL_H + 0.15 : (top + 1) * CELL_H;
  const columns = new Set(s.cells.map((c) => keyX(c) + keyZ(c) * 64)).size;
  return { at: [x / n, y, z / n], size: columns };
}

// ── the words by the building ───────────────────────────────────────────────

/** How long the words stay, ms (ui.css, lc-unlock, fades them over the same time). */
const NOTE_MS = 3400;

export interface UnlockNotes {
  readonly el: HTMLElement;
  /** Floats the words by a point of the town. */
  show(entry: GuideEntry, at: Vec3): void;
  /** Once a frame: the words follow the town as the view moves. */
  frame(): void;
  /** The ids whose words are showing (tests, the console). */
  showing(): string[];
}

export function createUnlockNotes(view: TownView, open: (id: string) => void): UnlockNotes {
  const layer = el('div', { class: 'lc-unlocks', attrs: { 'data-ui': 'unlocks' } });
  const notes: { node: HTMLElement; at: Vec3; id: string; row: number }[] = [];
  const place = (n: (typeof notes)[number]): void => {
    const [x, y] = view.worldToScreen(n.at);
    const w = n.node.offsetWidth, h = n.node.offsetHeight;
    const W = layer.clientWidth || window.innerWidth;
    const H = layer.clientHeight || window.innerHeight;
    // Above the building, clear of its stars; a second one at once goes above the first.
    const left = Math.min(Math.max(8, x - w / 2), Math.max(8, W - w - 8));
    const top = Math.min(Math.max(8, y - h - 74 - n.row * (h + 6)), Math.max(8, H - h - 8));
    n.node.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`;
  };
  const remove = (n: (typeof notes)[number]): void => {
    n.node.remove();
    const i = notes.indexOf(n);
    if (i >= 0) notes.splice(i, 1);
  };
  return {
    el: layer,
    show(entry, at) {
      const node = el(
        'button',
        {
          class: 'lc-unlock',
          attrs: { type: 'button', 'data-ui': 'unlock', 'data-entry': entry.id, 'aria-label': t('New building unlocked: {name}. Open it in the almanac', { name: t(entry.name) }) },
        },
        [el('strong', { text: t('New building unlocked!') }), el('span', { text: t(entry.name) })],
      );
      const n = { node, at, id: entry.id, row: notes.length };
      node.addEventListener('click', () => {
        remove(n);
        open(entry.id);
      });
      node.addEventListener('animationend', () => remove(n));
      // A slow device that never ends the animation still loses the words.
      window.setTimeout(() => remove(n), NOTE_MS + 400);
      notes.push(n);
      layer.append(node);
      place(n);
    },
    frame() {
      for (const n of notes) place(n);
    },
    showing: () => notes.map((n) => n.id),
  };
}
