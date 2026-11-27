// The interface in a real browser, on a desktop viewport (mouse and keys)
// and a phone viewport (touch): design section 7, action by action.
//
// The tests play in scenarios/ui/ui-playground.scenario.ts: flat ground that
// never moves, and only edits the design's rules allow (pieces on grass,
// fences on its edges), so they hold when the real placement rules replace
// the stubs. Where the rules decide the outcome (which kinds the Change
// tool may step to), the test accepts what the rules say.

import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { startApp, type App } from '../helpers/browser';
import { FULL } from '../helpers/tier';

const SHOTS = path.resolve(__dirname, '../../.context/shots');
const TOWN = '/?scenario=ui-playground';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, hasTouch: true, isMobile: true, scale: 2 };

const key = (x: number, y: number, z: number): number => x | (z << 6) | (y << 12);
const AUTO = key(20, 1, 22);
const TREE = key(27, 1, 22);
const STAIRS = key(22, 1, 25);

let app: App;
beforeAll(async () => {
  app = await startApp();
  fs.mkdirSync(SHOTS, { recursive: true });
});
afterAll(async () => {
  await app?.close();
});
// (Animation, Stage 3.) Every test opens its own pages. They used to stay open until the end of the
// file, which was harmless while a town stood still; now each one is a living town drawing every
// frame, and twenty of them starved the last tests of the GPU. So a test's pages close when it ends.
const openPages: Page[] = [];
afterEach(async () => {
  for (const page of openPages.splice(0)) await page.context().close().catch(() => {});
});

// ── helpers ──────────────────────────────────────────────────────────────

async function open(url: string, opts: Record<string, unknown> = DESKTOP): Promise<{ page: Page; errors: string[] }> {
  const opened = await app.open(url, opts);
  openPages.push(opened.page);
  await opened.page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
  return opened;
}

const js = <T>(page: Page, expression: string): Promise<T> => page.evaluate(expression) as Promise<T>;

/** Screen position of a point given in grid units (level 1 is the top of the flat ground). Fails if the interface covers it. */
async function at(page: Page, gx: number, level: number, gz: number): Promise<[number, number]> {
  const [x, y] = await js<[number, number]>(page, `window.__lc.view.worldToScreen([${gx}, ${level} * 0.8, ${gz}])`);
  const clear = await js<boolean>(page, `document.elementFromPoint(${x}, ${y}) === window.__lc.view.canvas`);
  expect(clear, `(${gx}, ${level}, ${gz}) is at ${x.toFixed(0)},${y.toFixed(0)}: on the canvas, not under the interface`).toBe(true);
  return [x, y];
}
/** A point on the grass of column (x, z); fx and fz say where within the square. */
const ground = (page: Page, x: number, z: number, fx = 0.5, fz = 0.5): Promise<[number, number]> => at(page, x + fx, 1, z + fz);
/** The middle of the top face of the block in a cell. */
const blockTop = (page: Page, x: number, y: number, z: number): Promise<[number, number]> => at(page, x + 0.5, y + 1, z + 0.5);

const blockAt = (page: Page, cell: number): Promise<{ kind: string; color: number; rot: number } | null> =>
  js(page, `window.__lc.world().blocks.get(${cell}) ?? null`);
const count = (page: Page, what: 'blocks' | 'floors' | 'edges' = 'blocks'): Promise<number> => js(page, `window.__lc.world().${what}.size`);
const debug = <T>(page: Page, field: string): Promise<T> => js(page, `window.__lc.ui.debug().${field}`);

async function pick(page: Page, item: string, tap = false): Promise<void> {
  const drawer = ['change', 'paint', 'erase'].includes(item)
    ? 'tools'
    : ['path', 'plaza', 'field', 'fence', 'wall', 'stall'].includes(item)
      ? 'ground'
      : ['tree', 'garden', 'fountain'].includes(item)
        ? 'nature'
        : 'build';
  const press = (selector: string): Promise<void> => (tap ? page.tap(selector) : page.click(selector));
  await press(`[data-drawer="${drawer}"]`);
  // Clicking the piece already in hand puts it down, so only press one that is not selected.
  if ((await page.getAttribute(`[data-item="${item}"]`, 'aria-pressed')) !== 'true') await press(`[data-item="${item}"]`);
  expect(await debug(page, 'item')).toBe(item);
}

/** Uses the menu's "Share link" and returns the link it produced (from the clipboard, or from the copy-by-hand box). */
async function shareLinkOf(page: Page): Promise<string> {
  await page.click('[data-ui="menu-button"]');
  await page.click('[data-menu="share"]');
  await page.waitForSelector('[data-ui="toast"], [data-ui="link-box"]');
  const link = (await page.locator('[data-ui="link-box"] input').count())
    ? await page.inputValue('[data-ui="link-box"] input')
    : await js<string>(page, 'navigator.clipboard.readText()');
  expect(link).toContain('#t=');
  return link.slice(link.indexOf('/#t='));
}

// Real multi-touch through the DevTools protocol.
type Touch = { x: number; y: number; id: number };
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id })) });
}

// ── desktop ──────────────────────────────────────────────────────────────

describe('desktop: mouse and keys', () => {
  test('place with a click, erase with a right click, undo and redo with keys and buttons', async () => {
    const { page, errors } = await open(TOWN);
    expect(await count(page)).toBe(5);
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(true);

    await pick(page, 'house');
    await page.mouse.click(...(await ground(page, 24, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect((await blockAt(page, key(24, 1, 27)))?.kind).toBe('house');
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(false);

    // Clicking the new house's top stacks on it, in the same colour (the swatch is on auto).
    await page.mouse.click(...(await blockTop(page, 24, 1, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 7`);
    expect((await blockAt(page, key(24, 2, 27)))?.color).toBe((await blockAt(page, key(24, 1, 27)))?.color);

    // Right click erases the block it points at, whatever tool is selected.
    await page.mouse.click(...(await blockTop(page, 24, 2, 27)), { button: 'right' });
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect(await blockAt(page, key(24, 2, 27))).toBeNull();

    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForFunction(`window.__lc.world().blocks.size === 7`);
    await page.click('[data-ui="undo"]');
    await page.click('[data-ui="undo"]');
    expect(await count(page)).toBe(5);
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(true);
    await page.click('[data-ui="redo"]');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await count(page)).toBe(7);
    await page.click('[data-ui="redo"]');
    expect(await count(page)).toBe(6);
    expect(await page.isDisabled('[data-ui="redo"]')).toBe(true);

    // The Erase tool does the same with a plain click.
    await pick(page, 'erase');
    await page.mouse.click(...(await blockTop(page, 24, 1, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 5`);
    expect(errors).toEqual([]);
  });

  test('a click is within 5 px; a drag orbits, a right drag pans, the wheel zooms, and none of them build', async () => {
    const { page, errors } = await open(TOWN);
    const camera = (): Promise<{ yaw: number; pitch: number; zoom: number; target: number[] }> => js(page, 'window.__lc.view.getCamera()');
    const [x, y] = await ground(page, 24, 27);

    // Pressed and released 4 px apart: still a click.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 4, y);
    await page.mouse.up();
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);

    const before = await camera();
    await page.mouse.move(x + 40, y + 60);
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 80, { steps: 4 });
    await page.mouse.up();
    const orbited = await camera();
    expect(orbited.yaw).not.toBe(before.yaw);
    expect(orbited.pitch).not.toBe(before.pitch);
    expect(orbited.target).toEqual(before.target);

    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x + 160, y + 100, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    const panned = await camera();
    expect(panned.target).not.toEqual(orbited.target);
    expect(panned.yaw).toBe(orbited.yaw);

    await page.mouse.wheel(0, -300);
    await page.waitForFunction(`window.__lc.view.getCamera().zoom > ${panned.zoom}`);
    expect(await count(page)).toBe(6);
    expect(errors).toEqual([]);
  });

  test('the Change tool steps an Auto block through the kinds and back, marks Auto blocks, and turns stairs', async () => {
    const { page, errors } = await open(TOWN);
    expect(await debug(page, 'markers')).toEqual([]);
    await pick(page, 'change');
    // While the Change tool is selected, every Auto block shows a sparkle.
    await page.waitForFunction(`window.__lc.ui.debug().markers.includes(${AUTO})`);
    expect(await page.locator('.lc-marker:not([hidden])').count()).toBe(1);

    const [x, y] = await blockTop(page, 20, 1, 22);
    const seen: string[] = [];
    for (let i = 0; i < 8 && seen.at(-1) !== 'auto'; i++) {
      await page.mouse.click(x, y);
      seen.push((await blockAt(page, AUTO))!.kind);
    }
    // Auto → House → Tower → Lighthouse → Arch → Dock (only where a dock is legal) → Auto.
    expect(seen.slice(0, 4)).toEqual(['house', 'tower', 'lighthouse', 'arch']);
    expect([['dock', 'auto'], ['auto']]).toContainEqual(seen.slice(4));
    await page.waitForFunction(`window.__lc.ui.debug().markers.includes(${AUTO})`);

    // A fixed block has no sparkle.
    await page.mouse.click(x, y);
    expect((await blockAt(page, AUTO))!.kind).toBe('house');
    await page.waitForFunction(`window.__lc.ui.debug().markers.length === 0`);

    // Stairs turn a quarter turn; a tree cannot change (it only wiggles).
    const rot = (await blockAt(page, STAIRS))!.rot;
    await page.mouse.click(...(await blockTop(page, 22, 1, 25)));
    expect((await blockAt(page, STAIRS))!.rot).toBe((rot + 1) % 4);
    const steps = await js<number>(page, 'window.__lc.world().nextSeq');
    await page.mouse.click(...(await blockTop(page, 27, 1, 22)));
    expect((await blockAt(page, TREE))!.kind).toBe('tree');
    expect(await js<number>(page, 'window.__lc.world().nextSeq')).toBe(steps);
    await page.waitForTimeout(400); // let the wiggle finish without an error

    // Each use was one undo step.
    await page.keyboard.press('ControlOrMeta+z');
    expect((await blockAt(page, STAIRS))!.rot).toBe(rot);
    await pick(page, 'house');
    expect(await debug(page, 'markers')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('fence and wall: the centre of a square places a cell piece, its outer strip an edge piece', async () => {
    const { page, errors } = await open(TOWN);
    await pick(page, 'fence');
    await page.mouse.click(...(await ground(page, 26, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect((await blockAt(page, key(26, 1, 27)))?.kind).toBe('fence');
    expect(await count(page, 'edges')).toBe(0);

    // The east strip of (28, 27): an edge piece on its east side; no block.
    await page.mouse.click(...(await ground(page, 28, 27, 0.9, 0.5)));
    await page.waitForFunction(`window.__lc.world().edges.size === 1`);
    expect(await js(page, `window.__lc.world().edges.get(${key(28, 1, 27) * 2})`)).toBe('fence');

    // The north strip of (22, 28) is the south side of (22, 27).
    await pick(page, 'wall');
    await page.mouse.click(...(await ground(page, 22, 28, 0.5, 0.1)));
    await page.waitForFunction(`window.__lc.world().edges.size === 2`);
    expect(await js(page, `window.__lc.world().edges.get(${key(22, 1, 27) * 2 + 1})`)).toBe('wall');
    expect(await count(page)).toBe(6);

    // Right click on the strip takes the edge piece away again.
    await page.mouse.click(...(await ground(page, 28, 27, 0.9, 0.5)), { button: 'right' });
    await page.waitForFunction(`window.__lc.world().edges.size === 1`);
    expect(errors).toEqual([]);
  });

  test('the tray: drawers switch, number keys pick within the open drawer, the swatch forces a colour', async () => {
    const { page, errors } = await open(TOWN);
    const items = (): Promise<string[]> => js(page, `[...document.querySelectorAll('.lc-row [data-item]')].map((b) => b.dataset.item)`);
    expect(await debug(page, 'drawer')).toBe('build');
    expect(await debug(page, 'item')).toBe('auto');
    expect(await items()).toEqual(['auto', 'house', 'tower', 'lighthouse', 'arch', 'dock', 'marble', 'pillar', 'stairs', 'windmill']);

    await page.click('[data-drawer="ground"]');
    expect(await items()).toEqual(['path', 'plaza', 'field', 'fence', 'wall', 'stall']);
    // Opening a drawer does not change the tool in hand.
    expect(await debug(page, 'item')).toBe('auto');
    await page.click('[data-drawer="nature"]');
    expect(await items()).toEqual(['raise', 'dig', 'level', 'tree', 'garden', 'fountain']); // the Land group first (shaping the land)
    await page.click('[data-drawer="tools"]');
    expect(await items()).toEqual(['change', 'paint', 'erase']);

    await page.keyboard.press('3');
    expect(await debug(page, 'item')).toBe('erase');
    await page.click('[data-drawer="build"]');
    await page.keyboard.press('2');
    expect(await debug(page, 'item')).toBe('house');
    await page.keyboard.press('0');
    expect(await debug(page, 'item')).toBe('windmill');
    expect(await page.getAttribute('[data-item="windmill"]', 'aria-pressed')).toBe('true');

    // Every piece in the tray has its own drawn icon.
    for (const drawer of ['build', 'ground', 'nature', 'tools']) {
      await page.click(`[data-drawer="${drawer}"]`);
      expect(await js(page, `[...document.querySelectorAll('.lc-row [data-item] svg')].every((s) => s.querySelectorAll('path, circle, rect, ellipse').length > 1)`)).toBe(true);
    }

    // Colour: auto by default; a chosen colour is used until set back.
    expect(await debug(page, 'swatch')).toBe('auto');
    await pick(page, 'house');
    await page.click('[data-ui="swatch"]');
    await page.click('.lc-swatches [data-swatch="5"]');
    expect(await debug(page, 'swatch')).toBe(5);
    await page.mouse.click(...(await ground(page, 24, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect((await blockAt(page, key(24, 1, 27)))?.color).toBe(5);

    // Paint recolours with the swatch.
    await page.click('[data-ui="swatch"]');
    await page.click('.lc-swatches [data-swatch="2"]');
    await pick(page, 'paint');
    await page.mouse.click(...(await blockTop(page, 24, 1, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.get(${key(24, 1, 27)}).color === 2`);
    expect(errors).toEqual([]);
  });

  test('the ghost follows the mouse, is worked out once per target, and is gone for tools and when the mouse leaves', async () => {
    const { page, errors } = await open(TOWN);
    await page.evaluate(`{
      const view = window.__lc.view, real = view.setGhost.bind(view);
      window.__ghosts = 0;
      view.setGhost = (g) => { window.__ghosts++; real(g); };
    }`);
    await pick(page, 'house');
    const [x, y] = await ground(page, 24, 27);
    await page.mouse.move(x, y);
    await page.waitForFunction('window.__lc.ui.debug().ghost !== null');
    const ghost = await debug<{ show: number[]; refuse: number | null }>(page, 'ghost');
    expect(ghost.show).toHaveLength(1);
    expect(ghost.refuse).toBeNull();
    // The world itself is untouched by the preview.
    expect(await count(page)).toBe(5);

    // Moving about inside the same square asks for nothing new.
    const calls = await js<number>(page, 'window.__ghosts');
    await page.mouse.move(x + 3, y + 1);
    await page.mouse.move(x - 2, y - 2);
    await page.mouse.move(x, y + 2);
    expect(await js<number>(page, 'window.__ghosts')).toBe(calls);
    // Another square does.
    await page.mouse.move(...(await ground(page, 26, 28)));
    await page.waitForFunction(`window.__ghosts === ${calls + 1}`);

    // Tools act on what is there: no ghost.
    await pick(page, 'erase');
    await page.mouse.move(x, y);
    expect(await debug(page, 'ghost')).toBeNull();
    await pick(page, 'fence');
    await page.mouse.move(x + 1, y);
    await page.waitForFunction('window.__lc.ui.debug().ghost !== null');
    // Over the interface the mouse has left the town.
    await page.mouse.move(640, 20);
    await page.hover('[data-ui="undo"]');
    await page.waitForFunction('window.__lc.ui.debug().ghost === null');
    expect(errors).toEqual([]);
  });

  test('Shift + drag paints a run that undoes as one', async () => {
    const { page, errors } = await open(TOWN);
    await pick(page, 'path');
    const from = await ground(page, 20, 29);
    const to = await ground(page, 25, 29);
    await page.keyboard.down('Shift');
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const floors = await js<number[]>(page, '[...window.__lc.world().floors.keys()].sort((a, b) => a - b)');
    expect(floors).toEqual([20, 21, 22, 23, 24, 25].map((x) => key(x, 1, 29)));
    // The camera did not turn.
    expect(await js(page, 'window.__lc.view.getCamera().yaw')).toBe(45);

    // Marble: the first block's colour all the way along.
    await pick(page, 'marble');
    await page.keyboard.down('Shift');
    await page.mouse.move(...(await ground(page, 21, 31)));
    await page.mouse.down();
    await page.mouse.move(...(await ground(page, 24, 31)), { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const colours = await js<(number | undefined)[]>(page, `[21, 22, 23, 24].map((x) => window.__lc.world().blocks.get(x | (31 << 6) | (1 << 12))?.color)`);
    expect(new Set(colours).size).toBe(1);
    expect(colours[0]).not.toBeUndefined();

    await page.keyboard.press('ControlOrMeta+z');
    expect(await count(page)).toBe(5);
    expect(await count(page, 'floors')).toBe(6);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await count(page, 'floors')).toBe(0);
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the time, season and weather sliders: open beside their button, scrub, settle on a stop, step with arrows, close', async () => {
    // The helper holds summer and clear; this town lets everything run.
    const { page, errors } = await open(`${TOWN}&season=run&weather=auto`);
    const signals = (k: string) => js(page, `window.__lc.signals.${k}`);
    // Time: click the sun; a slider opens with five stops, the running one chosen.
    await page.click('[data-ui="time"]');
    const time = '[data-ui="slider-time"]';
    await page.waitForSelector(`${time}:not([hidden])`);
    expect(await page.locator(`${time} .lc-slider-stop`).count()).toBe(5);
    expect(await page.getAttribute(`${time} [role="slider"]`, 'aria-valuetext')).toBe('Running');
    // Drag along the track to dusk: the town follows while dragging, and settles on dusk when let go.
    const rail = (await page.locator(`${time} .lc-slider-rail`).boundingBox())!;
    const y = rail.y + rail.height / 2;
    await page.mouse.move(rail.x + rail.width * 0.25, y);
    await page.mouse.down();
    await page.mouse.move(rail.x + rail.width * 0.5, y, { steps: 6 });
    expect(await signals('holding')).not.toBe('run');
    await page.mouse.move(rail.x + rail.width * 0.74, y, { steps: 6 });
    await page.mouse.up();
    expect(await signals('holding')).toBe('dusk');
    expect(await page.getAttribute('[data-ui="time"]', 'data-time')).toBe('dusk');
    // Arrows step stop by stop; Escape closes.
    await page.keyboard.press('ArrowRight');
    expect(await signals('holding')).toBe('night');
    await page.keyboard.press('Home');
    expect(await signals('holding')).toBe('run');
    await page.keyboard.press('Escape');
    expect(await page.isHidden(time)).toBe(true);

    // Season: six stops ending in the festival; clicking a stop goes there, the year easing.
    await page.click('[data-ui="season"]');
    const season = '[data-ui="slider-season"]';
    await page.waitForSelector(`${season}:not([hidden])`);
    expect(await page.locator(`${season} .lc-slider-stop`).count()).toBe(6);
    await page.click(`${season} [data-stop="winter"]`);
    expect(await signals('seasonHolding')).toBe('winter');
    const y0 = await signals('season.year');
    await page.waitForTimeout(300);
    const y1 = await signals('season.year');
    expect(y1).not.toBe(y0); // still easing, not jumped
    // A click elsewhere closes it.
    await page.mouse.click(640, 500);
    expect(await page.isHidden(season)).toBe(true);

    // Weather: eight stops, auto first.
    await page.click('[data-ui="weather"]');
    const weather = '[data-ui="slider-weather"]';
    await page.waitForSelector(`${weather}:not([hidden])`);
    expect(await page.locator(`${weather} .lc-slider-stop`).count()).toBe(8);
    await page.keyboard.press('End');
    expect(await signals('weatherHolding')).toBe('snow');
    await page.keyboard.press('ArrowLeft');
    expect(await signals('weatherHolding')).toBe('storm');
    // Opening another slider closes this one.
    await page.click('[data-ui="time"]');
    expect(await page.isHidden(weather)).toBe(true);
    expect(await page.isVisible('[data-ui="slider-time"]')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('on a phone the slider is a strip across the screen with a thumb a finger can hold', async () => {
    const { page, errors } = await open(TOWN, { width: 390, height: 844, hasTouch: true, isMobile: true });
    await page.tap('[data-ui="sky"]');
    await page.tap('[data-ui="weather"]');
    const card = (await page.locator('[data-ui="slider-weather"]').boundingBox())!;
    expect(card.width).toBeGreaterThan(360);
    const thumb = (await page.locator('[data-ui="slider-weather"] .lc-slider-thumb').boundingBox())!;
    expect(thumb.width).toBeGreaterThanOrEqual(43);
    expect(errors).toEqual([]);
  });

  test('the menu: new island asks first; sound toggles; a refusal is shown, not thrown', async () => {
    const { page, errors } = await open(TOWN);
    await page.click('[data-ui="menu-button"]');
    expect(await js(page, `[...document.querySelectorAll('[data-menu]')].map((b) => b.dataset.menu)`)).toEqual(['grow', 'towns', 'new', 'share', 'postcard', 'download', 'open', 'sound', 'rebuild', 'raiders', 'stats', 'language']);

    // Raiders are off until the player switches them on (since 2026-11-27).
    expect(await js(page, `document.querySelector('[data-menu="raiders"]').textContent`)).toContain('off');

    // Sound is on until the player turns it off, and the switch governs the music as well.
    expect(await debug(page, 'sound')).toBe(true);
    expect(await js(page, `window.__lc.music.volume`)).toBe(0.4);
    await page.click('[data-menu="sound"]');
    expect(await debug(page, 'sound')).toBe(false);
    expect(await js(page, `window.__lc.music.volume`)).toBe(0);
    expect(await js(page, `localStorage.getItem('little-city.sound')`)).toBe('off');
    await page.click('[data-menu="sound"]');
    expect(await debug(page, 'sound')).toBe(true);
    expect(await js(page, `window.__lc.music.volume`)).toBe(0.4);
    // How loud: the music's slider (0 is off) and the sounds'.
    await page.locator('[data-ui="volume-music"]').fill('75');
    expect(await js(page, `window.__lc.music.volume`)).toBe(0.75);
    expect(await js(page, `localStorage.getItem('little-city.music-volume')`)).toBe('0.75');
    await page.locator('[data-ui="volume-music"]').fill('0');
    expect(await js(page, `window.__lc.music.volume`)).toBe(0);
    await page.locator('[data-ui="volume-sound"]').fill('50');
    expect(await js(page, `localStorage.getItem('little-city.sound-volume')`)).toBe('0.5');
    // With sound off, the slider's level is kept but nothing plays; moving a slider up turns sound on again.
    await page.locator('[data-ui="volume-music"]').fill('60');
    await page.click('[data-menu="sound"]');
    expect(await debug(page, 'sound')).toBe(false);
    expect(await js(page, `window.__lc.music.volume`)).toBe(0);
    await page.locator('[data-ui="volume-music"]').fill('30');
    expect(await debug(page, 'sound')).toBe(true);
    expect(await js(page, `window.__lc.music.volume`)).toBe(0.3);
    await page.click('[data-menu="sound"]');
    expect(await debug(page, 'sound')).toBe(false);
    await page.click('[data-ui="menu-button"]');
    expect(await page.isHidden('[data-ui="menu"]')).toBe(true);
    // The dev tuning panel is not in the game.
    expect(await page.locator('[data-ui="tuning"]').count()).toBe(0);

    // A click on the town while the menu is open only closes the menu.
    await pick(page, 'house');
    await page.click('[data-ui="menu-button"]');
    await page.mouse.click(...(await ground(page, 26, 28)));
    expect(await page.isHidden('[data-ui="menu"]')).toBe(true);
    expect(await count(page)).toBe(5);

    // New island: it asks what kind and says the town stays in My towns; Back changes nothing; Surprise me starts over.
    const seed = await js<number>(page, 'window.__lc.world().seed');
    await pick(page, 'house');
    await page.mouse.click(...(await ground(page, 24, 27)));
    await page.click('[data-ui="menu-button"]');
    await page.click('[data-menu="new"]');
    await page.waitForSelector('[data-ui="confirm"]');
    expect(await page.textContent('[data-ui="confirm"]')).toContain('The town you have now stays in My towns.');
    await page.click('[data-menu="new-back"]');
    await page.waitForSelector('[data-menu="share"]');
    expect(await js(page, 'window.__lc.world().seed')).toBe(seed);
    expect(await count(page)).toBe(6);
    await page.click('[data-menu="new"]');
    await page.click('[data-menu="new-yes"]');
    await page.waitForFunction(`window.__lc.world().seed !== ${seed}`);
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(true);
    expect(await js(page, 'window.__lc.shape().world === window.__lc.world()')).toBe(true);
    expect(await js(page, 'location.search')).toBe('');

    // An edit the rules refuse (a block where one already is) is answered, and nothing breaks.
    const made = await js<boolean>(page, `window.__lc.edit({ type: 'placeBlock', cell: ${key(24, 9, 24)}, kind: 'pillar', color: 'auto', from: null })`);
    if (made) expect(await js(page, `window.__lc.edit({ type: 'placeBlock', cell: ${key(24, 9, 24)}, kind: 'pillar', color: 'auto', from: null })`)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a share link carries the town; a broken link leaves the town alone; autosave brings the town back', async () => {
    const { page, errors } = await open('/?seed=4&gen=1', { ...DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] });
    await page.mouse.click(640, 400);
    await page.waitForFunction('window.__lc.world().blocks.size >= 1');
    const blocks = await count(page);
    const first = await js<number>(page, '[...window.__lc.world().blocks.keys()][0]');
    const link = await shareLinkOf(page);

    // Someone with no town of their own opens it: they get the copy, and it becomes theirs.
    const visitor = await open(link);
    expect(await count(visitor.page)).toBe(blocks);
    expect(await js(visitor.page, 'window.__lc.world().seed')).toBe(4);
    expect(await js(visitor.page, `window.__lc.world().blocks.has(${first})`)).toBe(true);
    expect(await visitor.page.locator('[data-ui="banner"]').count()).toBe(0);
    await visitor.page.waitForFunction('location.hash === ""');

    // Autosave: 500 ms after the edit the town is stored, and a plain reload restores it.
    await page.waitForTimeout(800);
    await page.goto(app.url + '/');
    await page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
    expect(await js(page, 'window.__lc.world().seed')).toBe(4);
    expect(await count(page)).toBe(blocks);

    // The same player opens a link to another town: they are asked before theirs is replaced.
    const other = await open('/?seed=9&gen=1', { ...DESKTOP, permissions: ['clipboard-read', 'clipboard-write'] });
    await other.page.mouse.click(600, 380);
    await other.page.mouse.click(700, 420);
    const otherLink = await shareLinkOf(other.page);
    await page.goto(app.url + otherLink);
    await page.reload();
    await page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
    await page.waitForSelector('[data-ui="banner"]');
    expect(await js(page, 'window.__lc.world().seed')).toBe(9);
    // Looking is not keeping: their own town is still the saved one.
    await page.waitForTimeout(700);
    expect(await js(page, `JSON.stringify(Object.keys(localStorage))`)).toContain('little-city');
    await page.click('[data-ui="banner"] button:not(.lc-primary)');
    await page.waitForFunction('window.__lc.world().seed === 4');
    expect(await count(page)).toBe(blocks);
    expect(await js(page, 'location.hash')).toBe('');

    // A link that cannot be read: a plain message, the saved town untouched, no exception.
    await page.goto(app.url + '/#t=this-is-not-a-town');
    await page.reload();
    await page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
    await page.waitForSelector('[data-ui="toast"]');
    expect(await js(page, 'window.__lc.world().seed')).toBe(4);
    expect(await count(page)).toBe(blocks);
    expect([...errors, ...visitor.errors, ...other.errors]).toEqual([]);
  });

  test('a refusal is said where it happened: the ghost turns red, the tool shakes, nothing is built', async () => {
    const { page, errors } = await open(TOWN);
    // Whatever the real rules are, this is what the interface does when they say no.
    await page.evaluate(`{
      const game = window.__lc.game;
      game.can = () => ({ ok: false, reason: 'not on a tree' });
      game.edit = game.can;
    }`);
    await pick(page, 'house');
    const [x, y] = await ground(page, 24, 27);
    await page.mouse.move(x, y);
    await page.waitForFunction(`window.__lc.ui.debug().ghost?.refuse === ${key(24, 1, 27)}`);
    expect(await debug(page, 'ghost.show')).toEqual([]);
    await page.mouse.click(x, y);
    await page.waitForSelector('[data-ui="refusal"]');
    expect(await page.textContent('[data-ui="refusal"]')).toBe('Not on a tree');
    expect(await page.getAttribute('[data-item="house"]', 'class')).toContain('lc-shake');
    expect(await count(page)).toBe(5);
    // The message goes away by itself.
    await page.waitForSelector('[data-ui="refusal"]', { state: 'detached' });
    expect(errors).toEqual([]);
  });

  test('a town goes out as a file and comes back; the postcard is a picture of the view', async () => {
    const { page, errors } = await open(TOWN);
    await pick(page, 'house');
    await page.mouse.click(...(await ground(page, 24, 27)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);

    const menuItem = async (id: string): Promise<void> => {
      await page.click('[data-ui="menu-button"]');
      await page.click(`[data-menu="${id}"]`);
    };
    const [townFile] = await Promise.all([page.waitForEvent('download'), menuItem('download')]);
    expect(townFile.suggestedFilename()).toBe('my-town.littlecity');
    const saved = path.join(SHOTS, 'town-file-test.littlecity');
    await townFile.saveAs(saved);

    const [card] = await Promise.all([page.waitForEvent('download'), menuItem('postcard')]);
    expect(card.suggestedFilename()).toBe('little-city-postcard.png');
    const png = path.join(SHOTS, 'postcard.png');
    await card.saveAs(png);
    // A drawn town with a paper border, not an empty canvas.
    expect(fs.statSync(png).size).toBeGreaterThan(8000);

    // Start over, then open the file: the town is back, as a new history.
    await menuItem('new');
    await page.click('[data-menu="new-yes"]');
    await page.waitForFunction('window.__lc.world().seed !== 11');
    await page.setInputFiles('[data-ui="town-file"]', saved);
    await page.waitForFunction('window.__lc.world().seed === 11');
    expect(await count(page)).toBe(6);
    expect((await blockAt(page, key(24, 1, 27)))?.kind).toBe('house');
    expect(await page.isDisabled('[data-ui="undo"]')).toBe(true);

    // A file that is not a town: a plain message, and the town stays.
    const junk = path.join(SHOTS, 'not-a-town.txt');
    fs.writeFileSync(junk, 'hello, this is a shopping list');
    await page.click('[data-ui="menu-button"]');
    await page.setInputFiles('[data-ui="town-file"]', junk);
    await page.waitForFunction(`[...document.querySelectorAll('[data-ui="toast"]')].length > 0`);
    expect(await count(page)).toBe(6);
    fs.rmSync(saved);
    fs.rmSync(junk);
    expect(errors).toEqual([]);
  });

  // A picture for people to look at (.context/shots): only in the full run (LC_FULL=1).
  test.runIf(FULL)('how it looks on a desktop', async () => {
    const { page, errors } = await open(TOWN, { ...DESKTOP, scale: 2 });
    await pick(page, 'house');
    await page.mouse.move(...(await ground(page, 25, 27)));
    await page.waitForFunction('window.__lc.ui.debug().ghost !== null');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'interface-desktop.png') });
    await pick(page, 'change');
    await page.click('[data-ui="swatch"]');
    await page.click('[data-ui="menu-button"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'interface-desktop-menu.png') });
    expect(fs.statSync(path.join(SHOTS, 'interface-desktop.png')).size).toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });
});

// ── phone ────────────────────────────────────────────────────────────────

describe('phone: touch', () => {
  test('a tap places; a long press erases; there is no ghost', async () => {
    const { page, errors } = await open(TOWN, PHONE);
    const cdp = await page.context().newCDPSession(page);
    await pick(page, 'house', true);
    const [x, y] = await ground(page, 24, 26);
    await page.touchscreen.tap(x, y);
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect((await blockAt(page, key(24, 1, 26)))?.kind).toBe('house');
    expect(await debug(page, 'ghost')).toBeNull();

    // Hold a finger still on the new house for longer than 450 ms.
    const [bx, by] = await blockTop(page, 24, 1, 26);
    await touch(cdp, 'touchStart', [{ x: bx, y: by, id: 1 }]);
    await page.waitForTimeout(250);
    expect(await count(page)).toBe(6); // not yet
    await page.waitForFunction(`window.__lc.world().blocks.size === 5`, undefined, { timeout: 3000 });
    await touch(cdp, 'touchEnd', []);
    // Lifting the finger afterwards does not build anything.
    await page.waitForTimeout(100);
    expect(await count(page)).toBe(5);

    // Undo is a button on a phone.
    await page.tap('[data-ui="undo"]');
    expect(await count(page)).toBe(6);
    expect(errors).toEqual([]);
  });

  test('a one-finger drag orbits instead of placing; two fingers pan and pinch to zoom', async () => {
    const { page, errors } = await open(TOWN, PHONE);
    const cdp = await page.context().newCDPSession(page);
    const camera = (): Promise<{ yaw: number; pitch: number; zoom: number; target: number[] }> => js(page, 'window.__lc.view.getCamera()');
    const [x, y] = await ground(page, 24, 26);
    const start = await camera();

    await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: x + i * 12, y: y + i * 4, id: 1 }]);
    await touch(cdp, 'touchEnd', []);
    // The camera turns on the next frame, which a slow machine (the gate on GitHub) may not have drawn yet.
    await expect.poll(async () => (await camera()).yaw, { timeout: 10_000 }).not.toBe(start.yaw);
    const orbited = await camera();
    expect(orbited.zoom).toBe(start.zoom);
    expect(await count(page)).toBe(5);

    // Pinch out: the two fingers move apart about their middle.
    await touch(cdp, 'touchStart', [{ x: x - 30, y, id: 1 }]);
    await touch(cdp, 'touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }]);
    for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: x - 30 - i * 10, y, id: 1 }, { x: x + 30 + i * 10, y, id: 2 }]);
    await touch(cdp, 'touchEnd', []);
    const pinched = await camera();
    expect(pinched.zoom).toBeGreaterThan(orbited.zoom * 1.5);
    expect(pinched.yaw).toBe(orbited.yaw);

    // Two fingers moving together slide the picture.
    await touch(cdp, 'touchStart', [{ x: x - 30, y, id: 1 }]);
    await touch(cdp, 'touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }]);
    for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', [{ x: x - 30 + i * 8, y: y + i * 10, id: 1 }, { x: x + 30 + i * 8, y: y + i * 10, id: 2 }]);
    await touch(cdp, 'touchEnd', []);
    const panned = await camera();
    expect(panned.target).not.toEqual(pinched.target);
    expect(panned.zoom).toBeCloseTo(pinched.zoom, 5);
    expect(await count(page)).toBe(5);
    expect(errors).toEqual([]);
  });

  test('the tray is one row that scrolls sideways, with drawers and 44 px targets', async () => {
    const { page, errors } = await open(TOWN, PHONE);
    // Every button a finger must hit is at least 44 px in both directions.
    const small = await js<string[]>(
      page,
      `[...document.querySelectorAll('.lc-ui button')].filter((b) => b.offsetParent !== null).map((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 ? (b.dataset.item ?? b.dataset.ui ?? b.textContent) + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) : null; }).filter(Boolean)`,
    );
    expect(small).toEqual([]);

    // The Build drawer is wider than the phone: it scrolls, in one row.
    const row = await js<{ scroll: number; client: number; tops: number[] }>(
      page,
      `(() => { const r = document.querySelector('.lc-row'); return { scroll: r.scrollWidth, client: r.clientWidth, tops: [...new Set([...r.children].map((c) => c.offsetTop))] }; })()`,
    );
    expect(row.scroll).toBeGreaterThan(row.client);
    expect(row.tops).toHaveLength(1);
    expect(await js(page, `document.querySelector('.lc-tray').getBoundingClientRect().right <= innerWidth`)).toBe(true);

    // A piece off the right edge can be reached and picked.
    await page.locator('[data-item="windmill"]').scrollIntoViewIfNeeded();
    await page.tap('[data-item="windmill"]');
    expect(await debug(page, 'item')).toBe('windmill');

    await page.tap('[data-drawer="tools"]');
    expect(await debug(page, 'drawer')).toBe('tools');
    await page.tap('[data-item="erase"]');
    expect(await debug(page, 'item')).toBe('erase');
    await page.tap('[data-drawer="nature"]');
    await page.tap('[data-item="tree"]');
    await page.touchscreen.tap(...(await ground(page, 25, 26)));
    await page.waitForFunction(`window.__lc.world().blocks.size === 6`);
    expect((await blockAt(page, key(25, 1, 26)))?.kind).toBe('tree');

    // The swatch and the menu open within the screen.
    await page.tap('[data-ui="swatch"]');
    await page.tap('[data-ui="menu-button"]');
    for (const selector of ['.lc-swatches', '[data-ui="menu"]']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    expect(errors).toEqual([]);
  });

  // A picture for people to look at (.context/shots): only in the full run (LC_FULL=1).
  test.runIf(FULL)('how it looks on a phone', async () => {
    const { page, errors } = await open(TOWN, { ...PHONE, scale: 3 });
    await pick(page, 'house', true);
    await page.touchscreen.tap(...(await ground(page, 24, 26)));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS, 'interface-phone.png') });
    await page.tap('[data-drawer="tools"]');
    await page.tap('[data-item="change"]');
    await page.tap('[data-ui="swatch"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'interface-phone-tools.png') });
    await page.tap('[data-ui="menu-button"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'interface-phone-menu.png') });
    expect(fs.statSync(path.join(SHOTS, 'interface-phone.png')).size).toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });
});
