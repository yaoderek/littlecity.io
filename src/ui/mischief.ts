// The Mischief drawer's tools, in use (design section 13b). Owner: Mischief.
//
//   Lightning  click a building: a storm cloud gathers, a bolt strikes, it catches fire
//   Bomb    click anywhere: a bomb drops there, fizzes, and goes off
//   Mallet  click a building: it is knocked a stage worse (cracked, half, rubble)
//   Raid    click a shore: raiders land there; click again for more (src/life/raid)
//   Hand    press on a person or an animal: picked up; drag and let go to throw it (./hand.ts)
//   UFO     click anywhere: a flying saucer comes for somebody near, beams them up, and brings them back later
//   Mend    click a damaged building: scaffolding goes up, then it is mended a
//           stage a click; Shift-click mends it at once
//
// Nothing destructive happens by surprise: only these clicks start anything,
// the drawer looks different from the others (a red, dashed tab), and the
// first use of each tool says, once, that undo puts it all back. A blast
// has no drawn word over it (the "BOOM!" was removed at Derek's request,
// 2026-11-20: the smoke, dust and fire say it).

import { CELL_H, keyY, type CellKey } from '@/core/grid';
import type { Game } from '@/app/game';
import type { Director, MischiefEvent } from '@/life/mischief/director';
import { ufosOf } from '@/life/mischief/ufo.system';
import type { TownView } from '@/render/api';
import { phrase, t } from '@/i18n';
import { PALETTE } from '@/style/palette';
import type { Feedback } from './feedback';
import type { Pick } from './pick';
import { el } from './dom';
import { icon } from './icons';
import type { MischiefToolId } from './pieces';
import { raidsOf } from '@/life/raid/raids';

/** The field guide's Mischief group: what each tool does, in a sentence (no recipe town: nothing here is built). */
export const mischiefGuide = (): readonly { tool: MischiefToolId; name: string; how: string }[] => [
  { tool: 'torch', name: t('Lightning'), how: t('Click a building: a little storm cloud gathers over it and a bolt of lightning sets it alight. Timber and thatch burn fast and the wind carries the fire along a row; a street, a wall or water stops it, and stone only scorches.') },
  { tool: 'bomb', name: t('Bomb'), how: t('Click anywhere: a bomb drops, fizzes and goes off. What is right beside it falls to rubble, what is near loses its glass, and every bird takes off. In the sea it only splashes.') },
  { tool: 'nuke', name: t('Nuke'), how: t('The big one: a siren, a long whistle, a white flash, a shockwave racing out, a fireball rising into a mushroom cloud. Everything for streets around is flattened, fires start at the edge, and a crater is left in the ground. One undo puts even the ground back.') },
  { tool: 'raid', name: t('Raid'), how: t('Click a shore: raiders land there. Click again for more. A longship with a striped sail and a dragon at its prow runs up the beach nearest your click, or a little fleet of rowing boats rows in where there is no beach. The raiders storm ashore roaring, set the thatch alight, kick in doors and carry off sacks, chests and a pig, then sail away with the town in flames. Sink their ship with a bomb or a bolt of lightning and they are stranded: the town chases them into the sea. Undo puts it all back.') },
  { tool: 'mallet', name: t('Mallet'), how: t('Click a building to knock it a stage worse: cracked, then half-wrecked, then a heap of its own bricks.') },
  { tool: 'hand', name: t('Hand'), how: t('Press on anybody out in the town, a dog, a cat, a hen, a sheep, a soldier, the knight or his horse, a little boat or a big ship: up it comes, kicking. Drag it over the roofs and let go to drop it, or flick to throw it across the island. People land, see stars, get up and carry on; whoever they hit goes over too. A ship dropped on the land lies there until it is refloated. Press on a building and it wobbles on its foundations until you let go.') },
  { tool: 'ufo', name: t('UFO'), how: t('Click anywhere: a flying saucer swoops in, hovers over somebody out of doors near where you clicked, and beams them up, kicking and shouting for help. Half a minute later it brings them back somewhere else in town, a little dizzy. With nobody about, it searches the empty streets with its beam and flies off.') },
  { tool: 'mend', name: t('Mend'), how: t('Click something damaged: scaffolding goes up, and each click mends a stage until it is exactly as you built it. Shift-click mends it at once.') },
];

export function mischiefGuideSection(): HTMLElement {
  const list = el('ul', { class: 'lc-guide-list' });
  for (const m of mischiefGuide()) {
    list.append(
      el('li', { class: 'lc-guide-entry', attrs: { 'data-mischief': m.tool } }, [
        // The raid has a picture of its own (src/life/testing/raid-picture.mjs); the rest show their tool.
        m.tool === 'raid'
          ? el('img', { class: 'lc-guide-picture', attrs: { src: `${import.meta.env.BASE_URL}guide/raid.webp`, alt: '', loading: 'lazy', decoding: 'async', width: '180', height: '135', draggable: 'false' } })
          : el('div', { class: 'lc-guide-picture lc-guide-mischief-icon', html: icon(m.tool) }),
        el('div', { class: 'lc-guide-words' }, [el('h4', {}, [el('span', { text: m.name })]), el('p', { text: m.how })]),
      ]),
    );
  }
  return el('section', { class: 'lc-guide-group lc-guide-mischief', attrs: { 'data-group': 'mischief' } }, [
    el('h3', {}, [el('span', { text: t('Mischief') })]),
    el('p', { class: 'lc-guide-note', text: t('Only your clicks start anything, and undo puts it all back.') }),
    list,
  ]);
}

const HINTS_KEY = 'little-city.mischief-hints';

const CSS = `
.lc-tab[data-drawer='mischief'] {
  border-style: dashed;
  border-color: ${PALETTE.redDark};
  color: ${PALETTE.redDark};
  background: color-mix(in srgb, ${PALETTE.red} 14%, var(--lc-paper));
  margin-left: 8px;
}
.lc-tab[data-drawer='mischief'][aria-selected='true'] {
  background: color-mix(in srgb, ${PALETTE.red} 10%, var(--lc-card));
  border-bottom-color: color-mix(in srgb, ${PALETTE.red} 10%, var(--lc-card));
}
.lc-tray:has(.lc-tab[data-drawer='mischief'][aria-selected='true']) .lc-tray-card {
  background: color-mix(in srgb, ${PALETTE.red} 10%, var(--lc-card));
  border-color: ${PALETTE.redDark};
  border-style: dashed;
}
.lc-guide-mischief-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, ${PALETTE.red} 10%, var(--lc-card));
}
.lc-guide-mischief-icon .lc-icon { width: 60%; height: 60%; }
.lc-whiteout {
  position: fixed;
  inset: 0;
  background: #fffdf4;
  pointer-events: none;
  z-index: 45;
  animation: lc-whiteout 0.62s linear forwards;
}
/* Hard white for a frame or two, then the light coming back. */
@keyframes lc-whiteout {
  0% { opacity: 1; }
  11% { opacity: 1; }
  35% { opacity: 0.5; }
  100% { opacity: 0; }
}
`;

export interface MischiefTools {
  /** A click with a mischief tool. True if it did something. */
  use(tool: MischiefToolId, pick: Pick | null, opts: { shift: boolean }): boolean;
  /** Undo pressed: while something is going on, it is all called off. True if it was. */
  undo(): boolean;
  /** An act of mischief is going on (undo cancels it). */
  readonly active: boolean;
  dispose(): void;
}

export function createMischiefTools(host: {
  view: TownView;
  game: Game;
  feedback: Feedback;
  director: Director;
  root: HTMLElement;
  /** Why not, at the pointer. */
  refuse(reason: string): void;
}): MischiefTools {
  const { director, feedback } = host;
  if (!document.getElementById('lc-mischief-style')) {
    const style = document.createElement('style');
    style.id = 'lc-mischief-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  let hinted: Record<string, boolean> = {};
  try {
    hinted = JSON.parse(localStorage.getItem(HINTS_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    hinted = {};
  }
  const hint = (tool: MischiefToolId): void => {
    if (hinted[tool]) return;
    hinted[tool] = true;
    try {
      localStorage.setItem(HINTS_KEY, JSON.stringify(hinted));
    } catch {
      // No storage: the hint shows once a session.
    }
    feedback.toast(tool === 'mend' ? t('Mending a stage at a time; Shift-click mends it at once.') : t('Undo puts it all back.'));
  };

  /** A nuke whites the page out for an instant. */
  const whiteout = (): void => {
    const node = document.createElement('div');
    node.className = 'lc-whiteout';
    node.addEventListener('animationend', () => node.remove());
    host.root.append(node);
  };
  const off = director.on((e: MischiefEvent) => {
    if (e.type !== 'blast') return;
    // The nuke says it with light. A bomb has no word over it: its smoke, dust and fire say it.
    if (e.nuke) whiteout();
  });

  /** Whether a world point is on screen now, a little in from the edges and not under the tray or an open menu. */
  const onScreen = (): ((x: number, y: number, z: number) => boolean) => {
    const box = host.view.canvas.getBoundingClientRect();
    const covers = [...document.querySelectorAll('.lc-tray, .lc-menu:not([hidden])')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const m = 16;
    return (x, y, z) => {
      const [sx, sy] = host.view.worldToScreen([x, y, z]);
      if (!(sx >= m && sy >= m && sx <= box.width - m && sy <= box.height - m)) return false;
      const px = box.left + sx, py = box.top + sy;
      return !covers.some((r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom);
    };
  };

  const blockOf = (pick: Pick | null): CellKey | null => (pick && pick.hit === 'block' ? pick.cell : null);

  return {
    use(tool, pick, { shift }) {
      // The Hand works by pressing (./hand.ts): a click on nothing does nothing.
      if (tool === 'hand') return false;
      if (tool === 'ufo') {
        // Anywhere: a saucer comes for the nearest person to the click of those on screen now (never anybody
        // the player cannot see: off the edges, or under the tray or the menu) (src/life/mischief/ufo.system.ts).
        const at = pick?.point ?? null;
        const ufos = ufosOf(host.view.stage);
        if (!at || !ufos) return false;
        ufos.call(at[0], at[1], at[2], onScreen());
        hint(tool);
        return true;
      }
      if (tool === 'bomb' || tool === 'nuke') {
        if (!pick) return false;
        // On whatever was clicked: a roof, the ground, the sea.
        const p = pick.point;
        const y = pick.hit === 'water' ? p[1] : pick.hit === 'block' && pick.normal[1] > 0 ? (keyY(pick.cell) + 1) * CELL_H : p[1];
        if (tool === 'nuke') director.dropNuke([p[0], y, p[2]]);
        else director.dropBomb([p[0], y, p[2]]);
        hint(tool);
        return true;
      }
      if (tool === 'raid') {
        // The raid (src/life/raid): a party lands on the shore nearest the click; every click brings another.
        const at = pick ? { x: pick.point[0], z: pick.point[2] } : null;
        const why = raidsOf(host.view.stage).summon({ at });
        if (why) {
          host.refuse(why);
          return false;
        }
        hint(tool);
        return true;
      }
      const cell = blockOf(pick);
      // Lightning on a ship or a boat (the nearest under the pointer): its sails catch.
      if (tool === 'torch' && cell === null && pick) {
        const v = director.vesselAt(pick.point[0], pick.point[2]);
        if (v) {
          director.strikeVessel([v[0], pick.point[1] + 0.9, v[1]]);
          hint(tool);
          return true;
        }
      }
      if (cell === null) {
        host.refuse(tool === 'mend' ? phrase('click something that needs mending', {}) : tool === 'torch' ? phrase('click a building or a boat', {}) : phrase('click a building', {}));
        return false;
      }
      let ok: boolean;
      if (tool === 'torch') {
        // Lightning (the tool's id is still `torch`): a storm cloud gathers and the bolt sets it alight. On
        // what will not burn the bolt strikes all the same and only flashes.
        ok = director.strike(cell, pick!.point);
        if (!ok) host.refuse(phrase("that won't catch", {}));
      } else if (tool === 'mallet') {
        ok = director.knock(cell);
        if (!ok) host.refuse(phrase('there is nothing left to knock down', {}));
      } else {
        ok = director.mend(cell, shift);
        if (!ok) host.refuse(phrase('that is not damaged', {}));
      }
      if (ok) hint(tool);
      return ok;
    },
    undo() {
      if (!director.active) {
        director.undoing();
        return false;
      }
      director.cancel();
      return true;
    },
    get active() {
      return director.active;
    },
    dispose() {
      off();
    },
  };
}
