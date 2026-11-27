// The guide in a real browser (design section 7, "The guide"): the book
// button opens and closes it on desktop and on a phone; Escape and a swipe
// down close it; a house beside a three-tall tower ticks the chapel; and the
// town can still be built on with the guide open on desktop. Screenshots of
// the open guide go to .context/shots/ for a look.

import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { ENTRIES } from '@/guide/entries';
import { startApp, type App } from '../helpers/browser';

const SHOTS = path.resolve(__dirname, '../../.context/shots');
const TOWN = '/?scenario=ui-playground';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, hasTouch: true, isMobile: true, scale: 2 };

const key = (x: number, y: number, z: number): number => x | (z << 6) | (y << 12);

let app: App;
const pages: Page[] = [];
beforeAll(async () => {
  app = await startApp();
  fs.mkdirSync(SHOTS, { recursive: true });
});
afterEach(async () => {
  for (const p of pages.splice(0)) await p.close().catch(() => undefined);
});
afterAll(async () => {
  await app?.close();
});

async function open(opts: Record<string, unknown> = DESKTOP): Promise<{ page: Page; errors: string[] }> {
  const opened = await app.open(TOWN, opts);
  pages.push(opened.page);
  await opened.page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
  return opened;
}
const js = <T>(page: Page, expression: string): Promise<T> => page.evaluate(expression) as Promise<T>;
const isOpen = (page: Page): Promise<boolean> => js(page, 'window.__lc.ui.debug().guide');
/** The buildings' clips playing now (src/ui/guide-clips.ts). */
const playing = (page: Page): Promise<string[]> => js(page, 'window.__lc.ui.guide.clips()');
/** The clip files the page has fetched. */
const fetchedClips = (page: Page): Promise<string[]> =>
  js(page, '[...new Set(performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes("/guide/clips/")))]');
/** Scrolls the pages so an entry is at the top. */
const scrollTo = (page: Page, id: string): Promise<unknown> =>
  page.locator('[data-ui="guide"] .lc-guide-pages').evaluate((el, at) => {
    const pages = el as HTMLElement;
    const card = pages.querySelector(`[data-entry="${at}"]`) as HTMLElement;
    pages.scrollTop = card.offsetTop - pages.offsetTop - 8;
  }, id);
const ticked = (page: Page): Promise<string[]> => js(page, '[...document.querySelectorAll("[data-ui=guide] [data-found]")].map((e) => e.dataset.entry)');

/** The panel's slide-in has finished. */
const settled = (page: Page): Promise<unknown> =>
  page.locator('[data-ui="guide"]').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

/** Every picture in the panel has loaded (they are lazy: scroll them into view first). */
async function picturesLoad(page: Page): Promise<void> {
  const ids = await js<string[]>(page, '[...document.querySelectorAll("[data-ui=guide] [data-entry]")].map((e) => e.dataset.entry)');
  expect(ids).toEqual(ENTRIES.map((e) => e.id));
  for (const id of ids) await page.locator(`[data-entry="${id}"] img`).scrollIntoViewIfNeeded();
  await page.waitForFunction('[...document.querySelectorAll("[data-ui=guide] img")].every((i) => i.complete && i.naturalWidth > 0)', null, { timeout: 20_000 });
  await page.locator('[data-ui="guide"] .lc-guide-pages').evaluate((el) => (el.scrollTop = 0));
}

/** Screen position of a point given in grid units, checked to be on the canvas (not under the interface). */
async function at(page: Page, gx: number, level: number, gz: number): Promise<[number, number]> {
  const [x, y] = await js<[number, number]>(page, `window.__lc.view.worldToScreen([${gx}, ${level} * 0.8, ${gz}])`);
  expect(await js<boolean>(page, `document.elementFromPoint(${x}, ${y}) === window.__lc.view.canvas`), `(${gx}, ${level}, ${gz}) is under the interface`).toBe(true);
  return [x, y];
}

describe('desktop', () => {
  test('the book button opens a page beside the town; the button, the close button and Escape close it', async () => {
    const { page, errors } = await open();
    expect(await page.isHidden('[data-ui="guide"]')).toBe(true);
    // The button sits under the menu button.
    const menu = (await page.locator('[data-ui="menu-button"]').boundingBox())!;
    const book = (await page.locator('[data-ui="guide-button"]').boundingBox())!;
    expect(book.y).toBeGreaterThan(menu.y + menu.height);
    expect(Math.abs(book.x - menu.x)).toBeLessThan(4);

    await page.click('[data-ui="guide-button"]');
    expect(await isOpen(page)).toBe(true);
    expect(await page.getAttribute('[data-ui="guide-button"]', 'aria-expanded')).toBe('true');
    await settled(page); // it slides in
    // A side page on the right, clear of the top-right buttons and of the tray.
    const panel = (await page.locator('[data-ui="guide"]').boundingBox())!;
    expect(panel.x).toBeGreaterThan(DESKTOP.width / 2);
    expect(panel.x + panel.width).toBeLessThanOrEqual(DESKTOP.width);
    const tray = (await page.locator('.lc-tray').boundingBox())!;
    expect(tray.x + tray.width).toBeLessThan(panel.x);
    // Groups with headings, the Auto block first.
    expect(await page.locator('[data-ui="guide"] h3').allTextContents()).toEqual(
      expect.arrayContaining([expect.stringContaining('Houses'), expect.stringContaining('Towers'), expect.stringContaining('Green')]),
    );
    expect(await page.getAttribute('[data-ui="guide"] [data-entry]:first-of-type', 'data-entry')).toBe('auto');
    await picturesLoad(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'guide-desktop.png') });

    // Scroll position stays while it is closed and opened again.
    await page.locator('[data-ui="guide"] .lc-guide-pages').evaluate((el) => (el.scrollTop = 900));
    await page.click('[data-ui="guide-button"]');
    expect(await isOpen(page)).toBe(false);
    await page.click('[data-ui="guide-button"]');
    expect(await page.locator('[data-ui="guide"] .lc-guide-pages').evaluate((el) => el.scrollTop)).toBe(900);

    await page.click('[data-ui="guide-close"]');
    expect(await isOpen(page)).toBe(false);

    // From the keyboard: the button opens it, Escape closes it and gives the focus back.
    await page.focus('[data-ui="guide-button"]');
    await page.keyboard.press('Enter');
    expect(await isOpen(page)).toBe(true);
    await page.keyboard.press('PageDown');
    await page.keyboard.press('Escape');
    expect(await isOpen(page)).toBe(false);
    expect(await js<string | undefined>(page, 'document.activeElement?.dataset.ui')).toBe('guide-button');
    expect(errors).toEqual([]);
  });

  test('a building\'s clip plays while its entry is in view, two at most; nothing is fetched before it opens and nothing plays once it shuts', async () => {
    const { page, errors } = await open();
    await page.waitForTimeout(400);
    expect(await fetchedClips(page)).toEqual([]);
    await page.click('[data-ui="guide-button"]');
    await settled(page);
    await scrollTo(page, 'chapel');
    await page.waitForFunction('window.__lc.ui.guide.clips().length > 0', null, { timeout: 20_000 });
    // Shown over the still once it plays; at most two at once, all of them in view.
    await page.waitForFunction('document.querySelectorAll("[data-ui=guide] .lc-guide-shot[data-clip]").length > 0');
    for (let i = 0; i < 4; i++) {
      const now = await playing(page);
      expect(now.length).toBeLessThanOrEqual(2);
      expect(now).toContain('chapel');
      await page.waitForTimeout(150);
    }
    // Only the clips near the screen were made ready, and only the playing ones fetched.
    const fetched = await fetchedClips(page);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.length).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOTS, 'guide-clips-desktop.png') });

    // Further down, others take over.
    await scrollTo(page, 'temple');
    await page.waitForFunction('window.__lc.ui.guide.clips().includes("temple")', null, { timeout: 20_000 });
    expect((await playing(page)).length).toBeLessThanOrEqual(2);
    expect(await playing(page)).not.toContain('chapel');

    // Shut: everything stops at once.
    await page.click('[data-ui="guide-close"]');
    expect(await playing(page)).toEqual([]);
    expect(await js<boolean>(page, '[...document.querySelectorAll("video.lc-guide-clip")].every((v) => v.paused)')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the town can be built on with the guide open; a house beside a three-tall tower ticks the chapel', async () => {
    const { page, errors } = await open();
    await page.click('[data-ui="guide-button"]');
    expect(await ticked(page)).not.toContain('chapel');

    // A real click with the guide open: House, on the east face of the one-cell house at (24, 1, 22),
    // extends it (same colour), so it is two cells long.
    await page.click('[data-drawer="build"]');
    await page.click('[data-item="house"]');
    await page.mouse.click(...(await at(page, 25, 1.5, 22.5)));
    await page.waitForFunction(`window.__lc.world().blocks.has(${key(25, 1, 22)})`);
    expect(await isOpen(page)).toBe(true);
    expect(await ticked(page)).not.toContain('chapel');

    // A tower three blocks tall beside it.
    for (let y = 1; y <= 3; y++) {
      expect(await js<boolean>(page, `window.__lc.edit({ type: 'placeBlock', cell: ${key(26, y, 22)}, kind: 'tower', color: 'auto', from: ${y === 1 ? 'null' : key(26, y - 1, 22)} })`)).toBe(true);
    }
    await page.waitForFunction('document.querySelector("[data-entry=chapel]").hasAttribute("data-found")');
    expect(await ticked(page)).toEqual(expect.arrayContaining(['chapel', 'steeple']));
    await page.locator('[data-entry="chapel"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, 'guide-desktop-tick.png') });

    // A path four squares long: its lamps (dressing, which arrives a moment later) tick Street lamps.
    expect(await ticked(page)).not.toContain('street-lamps');
    for (let x = 18; x <= 22; x++) expect(await js<boolean>(page, `window.__lc.edit({ type: 'placeFloor', cell: ${key(x, 1, 28)}, floor: 'path' })`)).toBe(true);
    await page.waitForFunction('document.querySelector("[data-entry=street-lamps]").hasAttribute("data-found")');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ControlOrMeta+z');

    // Undo takes the tower's top away: no chapel any more.
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForFunction('!document.querySelector("[data-entry=chapel]").hasAttribute("data-found")');
    expect(errors).toEqual([]);
  });

  test('the pictures load under the site base path too', async () => {
    const { page } = await open();
    const src = await page.getAttribute('[data-entry="chapel"] img', 'src');
    expect(src).toBe('/guide/chapel.webp');
    const res = await page.request.get(app.url + src);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/webp');
  });
});

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
}

describe('phone', () => {
  test('the menu opens it, a full-height sheet (no book button on a phone); the close button and a swipe down close it', async () => {
    const { page, errors } = await open(PHONE);
    const fromMenu = async (): Promise<void> => {
      await page.tap('[data-ui="menu-button"]');
      await page.tap('[data-menu="guide"]');
    };
    expect(await page.isVisible('[data-ui="guide-button"]')).toBe(false);
    await fromMenu();
    expect(await isOpen(page)).toBe(true);
    await settled(page); // it slides up
    const sheet = (await page.locator('[data-ui="guide"]').boundingBox())!;
    expect(sheet.x).toBe(0);
    expect(sheet.width).toBe(PHONE.width);
    expect(sheet.y).toBeLessThan(60);
    expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(PHONE.height - 1);
    // Touch targets of 44 px.
    const close = (await page.locator('[data-ui="guide-close"]').boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    await picturesLoad(page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'guide-phone.png') });

    await page.tap('[data-ui="guide-close"]');
    expect(await isOpen(page)).toBe(false);

    // Swipe down from the top of the pages.
    await fromMenu();
    expect(await isOpen(page)).toBe(true);
    await page.waitForTimeout(300);
    const cdp = await page.context().newCDPSession(page);
    const x = PHONE.width / 2, y0 = 200;
    await touch(cdp, 'touchStart', x, y0);
    for (let dy = 20; dy <= 220; dy += 40) await touch(cdp, 'touchMove', x, y0 + dy);
    await touch(cdp, 'touchEnd', x, y0 + 220);
    await page.waitForFunction('!window.__lc.ui.debug().guide');

    // A swipe up scrolls the pages and keeps the sheet open.
    await fromMenu();
    await page.waitForTimeout(300);
    await touch(cdp, 'touchStart', x, 600);
    for (let dy = 20; dy <= 220; dy += 40) await touch(cdp, 'touchMove', x, 600 - dy);
    await touch(cdp, 'touchEnd', x, 380);
    await page.waitForTimeout(200);
    expect(await isOpen(page)).toBe(true);
    expect(await page.locator('[data-ui="guide"] .lc-guide-pages').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('one clip plays at a time on a phone, and none once the sheet is shut', async () => {
    const { page, errors } = await open(PHONE);
    await page.tap('[data-ui="menu-button"]');
    await page.tap('[data-menu="guide"]');
    await settled(page);
    await scrollTo(page, 'chapel');
    await page.waitForFunction('window.__lc.ui.guide.clips().length > 0', null, { timeout: 20_000 });
    for (let i = 0; i < 4; i++) {
      expect((await playing(page)).length).toBe(1);
      await page.waitForTimeout(150);
    }
    await page.tap('[data-ui="guide-close"]');
    expect(await playing(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
