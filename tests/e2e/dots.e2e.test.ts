// Red dots on things to try (src/ui/dots.ts) in a real browser: none before the first piece; then on the
// Almanac, the wings, the Mischief tab and the menu (Grow a town inside it); each goes for good when its
// thing is used. On a phone the Almanac is a menu row, so the menu button carries its dot. Screenshots
// go to .context/dots-shots/ for a look.

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startApp, type App } from '../helpers/browser';

const SHOTS = path.resolve(__dirname, '../../.context/dots-shots');
const TOWN = '/?scenario=ui-playground';
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, hasTouch: true, isMobile: true, scale: 2 };

let app: App;
beforeAll(async () => {
  app = await startApp();
  fs.mkdirSync(SHOTS, { recursive: true });
});
afterAll(async () => {
  await app?.close();
});

type DotsDebug = { ready: boolean; showing: string[]; menu: boolean };
const dots = (page: Page): Promise<DotsDebug> => page.evaluate('window.__lc.ui.debug().dots') as Promise<DotsDebug>;
/** The button carries a dot (in the page: it may still be popping in from nothing, so not yet "visible"). */
const dotOn = async (page: Page, selector: string): Promise<boolean> => (await page.locator(`${selector} > .lc-dot`).count()) > 0;
async function open(query: string, opts: Record<string, unknown>): Promise<{ page: Page; errors: string[] }> {
  const opened = await app.open(`${TOWN}&${query}`, opts);
  await opened.page.waitForFunction('window.__lc !== undefined && window.__lc.ui !== null');
  return opened;
}
/** The dot on this button has gone (the page redraws its dots once a frame). */
const gone = (page: Page, selector: string): Promise<unknown> => page.waitForFunction((q) => !document.querySelector(`${q} > .lc-dot`), selector);
/** The dots have popped in (and their one ripple is over). */
const settle = (page: Page): Promise<void> => page.waitForTimeout(1700);

describe('desktop', () => {
  test('nothing before the first piece', async () => {
    const { page, errors } = await open('dots=reset&tutorial=on', DESKTOP);
    await page.waitForTimeout(500);
    expect(await dots(page)).toEqual({ ready: false, showing: [], menu: false });
    expect(await page.locator('.lc-dot').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('each dot shows, and goes for good when its thing is used', async () => {
    const { page, errors } = await open('dots=reset', DESKTOP);
    await page.waitForFunction('window.__lc.ui.debug().dots.showing.length === 4');
    for (const ui of ['[data-ui="guide-button"]', '[data-ui="fly"]', '.lc-tab[data-drawer="mischief"]', '[data-ui="menu-button"]']) expect(await dotOn(page, ui), ui).toBe(true);
    await settle(page);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-dots.png') });
    await page.click('[data-ui="menu-button"]');
    expect(await dotOn(page, '[data-menu="grow"]')).toBe(true);
    // On a wide screen the Almanac has its own button, not a menu row.
    expect(await page.locator('[data-menu="guide"]').count()).toBe(0);
    await settle(page);
    await page.screenshot({ path: path.join(SHOTS, 'desktop-menu.png'), clip: { x: 0, y: 0, width: 420, height: 420 } });

    // Grow a town: its row's dot, and the menu button's with it.
    await page.click('[data-menu="grow"]');
    await page.keyboard.press('Escape');
    await gone(page, '[data-ui="menu-button"]');
    expect((await dots(page)).menu).toBe(false);

    await page.click('.lc-tab[data-drawer="mischief"]');
    await gone(page, '.lc-tab[data-drawer="mischief"]');
    expect((await dots(page)).showing).not.toContain('mischief');

    await page.click('[data-ui="guide-button"]');
    await gone(page, '[data-ui="guide-button"]');
    await page.click('[data-ui="guide-button"]');
    expect((await dots(page)).showing).not.toContain('almanac');

    expect((await dots(page)).showing).toEqual(['fly']);
    // Remembered: the next visit shows only what is still untried.
    await page.goto(page.url().replace('dots=reset', 'dots=on'));
    await page.waitForSelector('[data-ui="fly"] > .lc-dot', { state: 'attached' });
    expect((await dots(page)).showing).toEqual(['fly']);
    expect(await page.locator('.lc-dot').count()).toBe(1);
    expect(errors).toEqual([]);
  });
});

describe('phone', () => {
  test('the wings and the Mischief tab carry theirs; the menu button carries the Almanac and Grow a town', async () => {
    const { page, errors } = await open('dots=reset', PHONE);
    await page.waitForFunction('window.__lc.ui.debug().dots.showing.length === 4');
    expect(await page.isVisible('[data-ui="guide-button"]')).toBe(false);
    for (const ui of ['[data-ui="fly"]', '.lc-tab[data-drawer="mischief"]', '[data-ui="menu-button"]']) expect(await dotOn(page, ui), ui).toBe(true);
    await settle(page);
    await page.screenshot({ path: path.join(SHOTS, 'phone-dots.png') });
    await page.tap('[data-ui="menu-button"]');
    await page.waitForSelector('[data-menu="guide"]');
    expect(await dotOn(page, '[data-menu="guide"]')).toBe(true);
    expect(await dotOn(page, '[data-menu="grow"]')).toBe(true);
    await settle(page);
    await page.screenshot({ path: path.join(SHOTS, 'phone-menu.png') });

    // The Almanac opened from its row: the menu button keeps its dot for Grow a town.
    await page.tap('[data-menu="guide"]');
    await page.waitForFunction('!window.__lc.ui.debug().dots.showing.includes("almanac")');
    expect((await dots(page)).menu).toBe(true);
    expect(errors).toEqual([]);
  });
});
