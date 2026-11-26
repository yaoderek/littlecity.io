// The game in the player's language (src/i18n): the browser's language picks it, ?lang= shows one, and the
// menu's Language changes it, keeping the town.

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startApp, type App } from '../helpers/browser';

let app: App;
beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app?.close();
});

const table = (lang: string): Record<string, string> => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../src/i18n/locales/${lang}.json`), 'utf8'));
const menuLabel = `document.querySelector('[data-ui="menu-button"]').getAttribute('aria-label')`;

describe('languages', () => {
  test('the browser\'s language picks the game\'s', async () => {
    const { page, errors } = await app.open('/?seed=1', { locale: 'ja-JP' });
    await page.waitForFunction('window.__lc !== undefined');
    expect(await page.evaluate('document.documentElement.lang')).toBe('ja');
    expect(await page.evaluate(menuLabel)).toBe(table('ja').Menu);
    expect(errors).toEqual([]);
  });

  test('English for a language the game does not have, and ?lang= wins over the browser', async () => {
    const it = await app.open('/?seed=1', { locale: 'it-IT' });
    await it.page.waitForFunction('window.__lc !== undefined');
    expect(await it.page.evaluate(menuLabel)).toBe('Menu');
    const fr = await app.open('/?seed=1&lang=fr', { locale: 'en-US' });
    await fr.page.waitForFunction('window.__lc !== undefined');
    expect(await fr.page.evaluate('document.documentElement.lang')).toBe('fr');
    expect(await fr.page.evaluate(menuLabel)).toBe(table('fr').Menu);
  });

  test('a language\'s address (a shared link, a search result): the reader\'s own language first, else the address\'s', async () => {
    const it = await app.open('/ja/?seed=1', { locale: 'it-IT' });
    await it.page.waitForFunction('window.__lc !== undefined');
    expect(await it.page.evaluate('document.documentElement.lang')).toBe('ja');
    const en = await app.open('/ja/?seed=1', { locale: 'en-US' });
    await en.page.waitForFunction('window.__lc !== undefined');
    expect(await en.page.evaluate('document.documentElement.lang')).toBe('en');
  });

  test('a share link opens at the sharer\'s language\'s address, so its preview is in their language', async () => {
    const { page, errors } = await app.open('/?seed=4&gen=1', { locale: 'ja-JP', permissions: ['clipboard-read', 'clipboard-write'] });
    await page.waitForFunction('window.__lc !== undefined');
    await page.mouse.click(640, 400);
    await page.click('[data-ui="menu-button"]');
    await page.click('[data-menu="share"]');
    await page.waitForSelector('[data-ui="toast"], [data-ui="link-box"]');
    const link = (await page.locator('[data-ui="link-box"] input').count()) ? await page.inputValue('[data-ui="link-box"] input') : ((await page.evaluate('navigator.clipboard.readText()')) as string);
    expect(new URL(link).pathname).toBe('/ja/');
    expect(link).toContain('#t=');
    expect(errors).toEqual([]);
  });

  test('the menu changes the language and keeps the town', async () => {
    const { page, errors } = await app.open('/?seed=5&gen=1', { locale: 'en-US' });
    await page.waitForFunction('window.__lc !== undefined');
    const before = (await page.evaluate('window.__lc.world().blocks.size')) as number;
    await page.mouse.click(640, 400);
    await page.waitForFunction(`window.__lc.world().blocks.size === ${before + 1} && window.__lc.keeper.current !== null`);
    const seed = await page.evaluate('window.__lc.world().seed');
    // A player's address has no ?seed= (that would open a fresh island again).
    await page.evaluate(`history.replaceState(null, '', '/?season=summer&weather=clear')`);
    await page.click('[data-ui="menu-button"]');
    await page.click('[data-menu="language"]');
    await Promise.all([page.waitForNavigation(), page.click('[data-menu="lang-ko"]')]);
    await page.waitForFunction('window.__lc !== undefined');
    expect(await page.evaluate('document.documentElement.lang')).toBe('ko');
    expect(await page.evaluate(menuLabel)).toBe(table('ko').Menu);
    expect(await page.evaluate(`localStorage.getItem('little-city.lang')`)).toBe('ko');
    expect(await page.evaluate('window.__lc.world().seed')).toBe(seed);
    expect(await page.evaluate('window.__lc.world().blocks.size')).toBe(before + 1);
    expect(errors).toEqual([]);
  });
});
