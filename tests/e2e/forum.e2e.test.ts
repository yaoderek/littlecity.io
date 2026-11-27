// Global Village in a real browser, against the real forum server (server/forum.ts) started here on a free
// port and a temporary folder. The game is pointed at it with ?forum=<address> (development only:
// src/ui/forum-button.ts), so every other browser test runs with no forum at all.
//
// Each player is a browser context of their own (their own localStorage, so their own identity).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startForum, type RunningForum } from '../../server/forum';
import { LEGACY_TOWNS } from '../../scenarios/core/grown-town-legacy';
import { pinCalendar, startApp, type App, type OpenOptions } from '../helpers/browser';

let app: App;
let forum: RunningForum;
let dataDir = '';
const SHOTS = path.resolve(__dirname, '../../.context/forum-shots');

const options = () => ({ dataDir, publicUrl: 'http://towns.test', gameUrl: 'http://game.test', adminPassword: '' });

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-forum-e2e-'));
  forum = await startForum({ ...options(), port: 0 });
  app = await startApp();
  fs.mkdirSync(SHOTS, { recursive: true });
});
afterAll(async () => {
  await app?.close();
  await forum?.close();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

const TOWN_A = LEGACY_TOWNS[1]!;
const TOWN_B = LEGACY_TOWNS[2]!;
const SAVE_KEY = 'little-city.town.v1';

/** The address of the game with the forum on, a town of the player's own (#t=…) or none. */
function gameUrl(query = '', town: string | null = TOWN_A): string {
  return `/?forum=${encodeURIComponent(forum.url)}&dots=off${query}${town ? `#t=${town}` : ''}`;
}

/** Opens the game as a new player (a context of their own); the forum's button is on screen. */
async function player(query = '', town: string | null = TOWN_A, opts: OpenOptions = {}): Promise<{ page: Page; errors: string[]; ctx: BrowserContext }> {
  const { page, errors } = await app.open(gameUrl(query, town), opts);
  await page.waitForSelector('[data-ui="forum-card"]:not([hidden])', { timeout: 60_000 });
  return { page, errors, ctx: page.context() };
}

/** The same player opening the game again (a reload loses ?forum from the address, so the address is given again). */
async function again(page: Page, query = ''): Promise<void> {
  await page.goto(app.url + pinCalendar(gameUrl(query, null)));
  await page.waitForSelector('[data-ui="forum-card"]:not([hidden])', { timeout: 60_000 });
}

const openForum = async (page: Page): Promise<void> => {
  await page.click('[data-ui="forum"]');
  await page.waitForSelector('[data-ui="forum-sheet"]:not([hidden])');
};
const grid = (page: Page) => page.locator('[data-ui="forum-sheet"] [data-forum="grid"]');
const tab = async (page: Page, which: 'top' | 'new' | 'mine'): Promise<void> => {
  await page.click(`[data-tab="${which}"]`);
  await page.waitForSelector(`[data-tab="${which}"][aria-selected="true"]`);
  await page.waitForFunction(() => !document.querySelector('[data-forum="grid"] [data-forum="loading"]'));
};

/** Posts the town on screen; returns the new post's id. */
async function postTown(page: Page, name: string, caption: string): Promise<string> {
  await openForum(page);
  await page.click('[data-forum="post-mine"]');
  await page.waitForSelector('[data-forum="publish"]');
  await page.fill('[data-forum="pub-name"]', name);
  await page.fill('[data-forum="pub-caption"]', caption);
  await page.click('[data-forum="pub-post"]');
  await page.waitForSelector('[data-forum="publish"]', { state: 'detached' });
  await page.waitForSelector('[data-tab="new"][aria-selected="true"]');
  await page.waitForSelector('[data-forum="grid"] [data-post]');
  return (await grid(page).locator('[data-post]').first().getAttribute('data-post'))!;
}

/** Opens a post from the forum (open or not). */
async function openPost(page: Page, id: string): Promise<void> {
  if (!(await page.isVisible('[data-ui="forum-sheet"]'))) await openForum(page);
  await tab(page, 'new');
  await page.click(`[data-forum="grid"] [data-post="${id}"] .lc-forum-pic`);
  await page.waitForSelector(`[data-forum="post"][data-post="${id}"] [data-forum="say"]`);
}

async function api(method: string, route: string, secret?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(forum.url + route, { method, headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** The town on screen, as data that compares exactly (the world's blocks, floors, edges and reshaped land). */
const worldKey = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const w = (window as unknown as { __lc: { world(): { seed: number; blocks: Map<number, unknown>; floors: Map<number, unknown>; edges: Map<number, unknown>; terrainEdits?: Map<number, number> } } }).__lc.world();
    const sorted = (m?: Map<number, unknown>) => JSON.stringify([...(m ?? new Map()).entries()].sort((a, b) => a[0] - b[0]));
    return `${w.seed}|${sorted(w.blocks)}|${sorted(w.floors)}|${sorted(w.edges)}|${sorted(w.terrainEdits)}`;
  });
const blockCount = (page: Page): Promise<number> => page.evaluate('window.__lc.world().blocks.size') as Promise<number>;
const keeperCurrent = (page: Page): Promise<string | null> => page.evaluate('window.__lc.keeper.current') as Promise<string | null>;

/** Places a piece in the middle of the window (the tray's Auto block is in hand from the start). */
async function build(page: Page): Promise<void> {
  const before = await worldKey(page);
  const box = page.viewportSize()!;
  for (const [dx, dy] of [[0, 0], [40, 30], [-60, 20], [20, -50], [-30, -30]]) {
    await page.mouse.click(box.width / 2 + dx!, box.height / 2 + dy!);
    await page.waitForTimeout(150);
    if ((await worldKey(page)) !== before) return;
  }
  throw new Error('nothing could be built');
}

const pageErrors = (errors: string[]): string[] => errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|net::ERR/.test(e));

describe('Global Village', () => {
  test('a town posted (a name, a caption with Chinese and an emoji) is first under New and in Mine', async () => {
    const { page, errors } = await player();
    const caption = '我的港口 by the sea 🌊';
    const id = await postTown(page, 'mira', caption);
    expect(await grid(page).locator(`[data-post="${id}"] [data-forum="caption"]`).textContent()).toBe(caption);
    expect(await grid(page).locator(`[data-post="${id}"] .lc-forum-who`).textContent()).toBe('mira');
    await tab(page, 'mine');
    expect(await grid(page).locator('[data-post]').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-post')))).toEqual([id]);
    const stored = await api('GET', `/v1/posts/${id}`);
    expect(stored.json).toMatchObject({ caption, name: 'mira', parent: null });
    expect(pageErrors(errors)).toEqual([]);
  });

  test('another player likes and comments; the poster sees the heart number after coming back, Mine says what is new, opening clears it', async () => {
    const a = await player();
    const id = await postTown(a.page, 'mira', 'likes please');
    await a.page.click('[data-forum="close"]');

    const b = await player('', TOWN_B);
    await openForum(b.page);
    await tab(b.page, 'new');
    await b.page.click(`[data-post="${id}"] [data-forum="like"]`);
    await b.page.waitForFunction((pid) => document.querySelector(`[data-post="${pid}"] [data-forum="like"]`)?.getAttribute('aria-pressed') === 'true', id);
    await openPost(b.page, id);
    await b.page.fill('[data-forum="name"]', 'tom');
    await b.page.fill('[data-forum="comment-text"]', 'what a harbour');
    await b.page.click('[data-forum="send"]');
    await b.page.waitForSelector('.lc-forum-comment:has-text("what a harbour")');
    // Liked: counted once on the server.
    expect((await api('GET', `/v1/posts/${id}`)).json).toMatchObject({ likes: 1, comments: 1 });

    await again(a.page);
    await a.page.waitForSelector('[data-ui="forum-badge"]:not([hidden])', { timeout: 20_000 });
    expect(await a.page.textContent('.lc-forum-badge-n')).toBe('2');
    await openForum(a.page);
    expect(await a.page.isHidden('[data-ui="forum-badge"]')).toBe(true);
    await tab(a.page, 'mine');
    expect(await a.page.textContent(`[data-post="${id}"] [data-forum="news"]`)).toBe('+1 ♥ · 1 new comment');
    // Gone for good: the server was told.
    await again(a.page);
    await a.page.waitForTimeout(3000);
    expect(await a.page.isHidden('[data-ui="forum-badge"]')).toBe(true);
  });

  test('a comment with HTML in it shows as the characters typed; nothing runs', async () => {
    const { page, errors } = await player();
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs++;
      void d.dismiss();
    });
    const id = await postTown(page, 'eve', '<b>not bold</b>');
    await openPost(page, id);
    const evil = '<img src=x onerror=alert(1)>';
    await page.fill('[data-forum="comment-text"]', evil);
    await page.click('[data-forum="send"]');
    await page.waitForSelector('[data-forum="comments"] .lc-forum-comment');
    expect(await page.textContent('[data-forum="comments"] .lc-forum-said')).toBe(evil);
    expect(await page.textContent(`[data-forum="post"] [data-forum="caption"]`)).toBe('<b>not bold</b>');
    expect(await page.locator('[data-ui="forum-sheet"] img[src="x"], [data-ui="forum-sheet"] b:not(.lc-forum-who)').count()).toBe(0);
    // Seen again from the server, in a fresh look at the post.
    await page.click('[data-forum="back"]');
    await openPost(page, id);
    expect(await page.textContent('[data-forum="comments"] .lc-forum-said')).toBe(evil);
    await page.waitForTimeout(500);
    expect(dialogs).toBe(0);
    expect(pageErrors(errors)).toEqual([]);
  });

  test('Visit, build there, Back to my town: the player\'s own town is exactly as it was, and the forum is back on the post', async () => {
    const poster = await player('', TOWN_B);
    const id = await postTown(poster.page, 'mira', 'come visit');

    const { page, errors } = await player();
    await page.waitForFunction('window.__lc.keeper.current !== null');
    const mine = await worldKey(page);
    const mineId = await keeperCurrent(page);
    await openPost(page, id);
    await page.click('[data-forum="visit"]');
    await page.waitForSelector('[data-ui="banner"]:has-text("This is mira\'s town.")');
    expect(await page.isHidden('[data-ui="forum-sheet"]')).toBe(true);
    const savedDuringVisit = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    expect(await worldKey(page)).not.toBe(mine);
    await build(page);
    await page.waitForTimeout(1200);
    // Nothing of the visit is written.
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBe(savedDuringVisit);

    await page.click('[data-ui="banner"] button:has-text("Back to my town")');
    await page.waitForSelector(`[data-forum="post"][data-post="${id}"]`);
    expect(await worldKey(page)).toBe(mine);
    expect(await keeperCurrent(page)).toBe(mineId);
    await page.waitForTimeout(1200);
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBe(savedDuringVisit);
    expect(pageErrors(errors)).toEqual([]);
  });

  test('Make a copy: a new town in My towns, the player\'s own untouched, counted once; posting it says what it was built on', async () => {
    const poster = await player('', TOWN_B);
    const original = await postTown(poster.page, 'mira', 'copy me');

    const { page, errors } = await player();
    await page.waitForFunction('window.__lc.keeper.current !== null');
    const ownId = (await keeperCurrent(page))!;
    const ownSaved = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    await openPost(page, original);
    await page.click('[data-forum="copy"]');
    await page.waitForSelector('[data-ui="forum-sheet"]', { state: 'hidden' });
    await page.waitForFunction((own) => window.__lc && (window as unknown as { __lc: { keeper: { current: string | null } } }).__lc.keeper.current !== null && (window as unknown as { __lc: { keeper: { current: string | null } } }).__lc.keeper.current !== own, ownId, { timeout: 20_000 });
    const towns = (await page.evaluate('window.__lc.keeper.list()')) as { id: string; name: string; from?: string; code: string }[];
    expect(towns).toHaveLength(2);
    expect(towns.find((t) => t.id !== ownId)).toMatchObject({ name: "mira's town", from: original });
    expect(towns.find((t) => t.id === ownId)!.code).toBe(ownSaved);
    await expect.poll(async () => (await api('GET', `/v1/posts/${original}`)).json.copies).toBe(1);

    // The same player again: still one.
    await openPost(page, original);
    await page.click('[data-forum="copy"]');
    await page.waitForSelector('[data-ui="forum-sheet"]', { state: 'hidden' });
    await page.waitForTimeout(1000);
    expect((await api('GET', `/v1/posts/${original}`)).json.copies).toBe(1);

    // Posting the copy: built on mira's town, a link to the original.
    const copy = await postTown(page, 'tom', 'my take');
    expect((await api('GET', `/v1/posts/${copy}`)).json.parent).toEqual({ id: original, name: 'mira' });
    await openPost(page, copy);
    expect(await page.textContent('[data-forum="post"] [data-forum="parent"]')).toBe("built on mira's town");
    await page.click('[data-forum="post"] [data-forum="parent"]');
    await page.waitForSelector(`[data-forum="post"][data-post="${original}"] [data-forum="say"]`);
    expect(pageErrors(errors)).toEqual([]);
  });

  test('Retake takes a new picture after a few seconds of free camera', async () => {
    const { page } = await player();
    await openForum(page);
    await page.click('[data-forum="post-mine"]');
    await page.waitForSelector('[data-forum="publish"] img[src^="data:image/jpeg"]');
    const first = await page.getAttribute('[data-forum="publish"] img', 'src');
    await page.click('[data-forum="retake"]');
    await page.waitForSelector('[data-forum="retake-chip"]:not([hidden])');
    expect(await page.isHidden('[data-forum="publish"]')).toBe(true);
    await page.evaluate(() => {
      const v = (window as unknown as { __lc: { view: { getCamera(): { yaw: number; zoom: number }; setCamera(c: unknown): void } } }).__lc.view;
      const c = v.getCamera();
      v.setCamera({ ...c, yaw: c.yaw + 50, zoom: c.zoom * 1.6 });
    });
    await page.waitForSelector('[data-forum="retake-chip"]', { state: 'hidden', timeout: 8000 });
    await page.waitForSelector('[data-forum="publish"]');
    const second = await page.getAttribute('[data-forum="publish"] img', 'src');
    expect(second).toMatch(/^data:image\/jpeg/);
    expect(second).not.toBe(first);
  });

  test('the server stopped: the forum says it cannot be reached, Try again works once it is back, and the game plays on', async () => {
    const { page, errors } = await player();
    await openForum(page);
    await page.waitForSelector('[data-forum="grid"] [data-post], [data-forum="grid"] [data-forum="empty"]');
    await page.click('[data-forum="close"]');
    const port = forum.port;
    await forum.close();
    try {
      await openForum(page);
      await page.waitForSelector('[data-forum="unreachable"]', { timeout: 15_000 });
      expect(await page.textContent('[data-forum="unreachable"]')).toContain("Global Village can't be reached right now.");
    } finally {
      forum = await startForum({ ...options(), port });
    }
    await page.click('[data-forum="retry"]');
    await page.waitForSelector('[data-forum="grid"] [data-post]');
    await page.click('[data-forum="close"]');
    const before = await blockCount(page);
    await build(page);
    expect(await blockCount(page)).toBeGreaterThan(before);
    // No message outside the forum about it.
    expect(await page.locator('.lc-ui > .lc-toasts [data-ui="toast"]:has-text("reached")').count()).toBe(0);
    expect(pageErrors(errors)).toEqual([]);
  });

  test('?post=<id> opens a visit with its banner and leaves the address; a gone id says so and leaves the player home', async () => {
    const poster = await player('', TOWN_B);
    const id = await postTown(poster.page, 'mira', 'by link');

    const { page, errors } = await player(`&post=${id}`);
    await page.waitForSelector('[data-ui="banner"]:has-text("This is mira\'s town.")', { timeout: 20_000 });
    expect(page.url()).not.toContain('post=');

    const gone = await player('&post=zzzzzzzzzz&seed=11&gen=1', null);
    await gone.page.waitForSelector('[data-ui="toast"]:has-text("That town is gone.")', { timeout: 20_000 });
    expect(await gone.page.evaluate('window.__lc.world().seed')).toBe(11);
    expect(await gone.page.locator('[data-ui="banner"]').count()).toBe(0);
    expect(pageErrors([...errors, ...gone.errors])).toEqual([]);
  });

  test('a player with no town of their own visits, presses Back, and has their fresh island', async () => {
    const poster = await player('', TOWN_B);
    const id = await postTown(poster.page, 'mira', 'for a newcomer');
    const { page } = await player('&seed=13&gen=1', null);
    const fresh = await worldKey(page);
    expect(await keeperCurrent(page)).toBeNull();
    await openPost(page, id);
    await page.click('[data-forum="visit"]');
    await page.waitForSelector('[data-ui="banner"]:has-text("Back to my town")');
    expect(await worldKey(page)).not.toBe(fresh);
    await page.click('[data-ui="banner"] button:has-text("Back to my town")');
    await page.waitForSelector(`[data-forum="post"][data-post="${id}"]`);
    expect(await worldKey(page)).toBe(fresh);
    expect(await page.evaluate('window.__lc.world().seed')).toBe(13);
  });

  test('deleting one\'s own comment and one\'s own post', async () => {
    const { page } = await player();
    const id = await postTown(page, 'mira', 'soon gone');
    await openPost(page, id);
    await page.fill('[data-forum="comment-text"]', 'a note to self');
    await page.click('[data-forum="send"]');
    await page.waitForSelector('.lc-forum-comment:has-text("a note to self")');
    await page.click('.lc-forum-comment [data-forum="comment-delete"]');
    await page.waitForSelector('.lc-forum-comment', { state: 'detached' });
    expect((await api('GET', `/v1/posts/${id}`)).json.comments).toBe(0);
    await page.click('[data-forum="post"] [data-forum="delete"]');
    await page.click('[data-forum="delete-yes"]');
    await page.waitForSelector('[data-forum="post"]', { state: 'detached' });
    expect(await grid(page).locator(`[data-post="${id}"]`).count()).toBe(0);
    expect((await api('GET', `/v1/posts/${id}`)).status).toBe(404);
  });

  test('the forum over the game: its banner and messages wait under it; scrolling the sheet leaves the camera alone', async () => {
    const { page } = await player();
    await page.evaluate(() => (window as unknown as { __lc: { ui: { feedback: { banner(t: string, b: unknown[]): void } } } }).__lc.ui.feedback.banner('A banner of the game', []));
    await openForum(page);
    await page.waitForSelector('[data-forum="grid"] [data-post]');
    expect(await page.isVisible('[data-ui="banner"]:has-text("A banner of the game")')).toBe(false);
    const cam = JSON.stringify(await page.evaluate('window.__lc.view.getCamera()'));
    const box = (await grid(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 600);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    expect(JSON.stringify(await page.evaluate('window.__lc.view.getCamera()'))).toBe(cam);
    await page.click('[data-forum="close"]');
    expect(await page.isVisible('[data-ui="banner"]:has-text("A banner of the game")')).toBe(true);
  });

  for (const lang of ['zh', 'fr', 'de'] as const) {
    test(`a 375 px phone in ${lang}: the button, the feed, a post and Post my town, nothing clipped or overlapping`, async () => {
      const phone = { width: 375, height: 740, scale: 2, hasTouch: true, isMobile: true };
      const { page, errors } = await player(`&lang=${lang}`, TOWN_A, phone);
      /** Every visible element under `root` lies inside the window, and no text overflows its box. */
      const fits = (root: string) =>
        page.evaluate((sel) => {
          const bad: string[] = [];
          for (const e of document.querySelectorAll<HTMLElement>(`${sel}, ${sel} *`)) {
            const r = e.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || getComputedStyle(e).visibility === 'hidden') continue;
            // Inside a scrolled list, only what is in view counts.
            if (r.bottom < 0 || r.top > window.innerHeight) continue;
            if (r.left < -0.5 || r.right > window.innerWidth + 0.5) bad.push(`${e.className || e.tagName} outside: ${Math.round(r.left)}..${Math.round(r.right)}`);
            const clipsText = e.matches('button, .lc-forum-tab, h2, label, .lc-text-btn') && e.scrollWidth > e.clientWidth + 1;
            if (clipsText) bad.push(`${e.className || e.tagName} clips "${e.textContent}"`);
          }
          return bad;
        }, root);
      const overlap = (a: string, b: string) =>
        page.evaluate(
          ([x, y]) => {
            const r1 = document.querySelector(x!)!.getBoundingClientRect(), r2 = document.querySelector(y!)!.getBoundingClientRect();
            return r1.left < r2.right && r2.left < r1.right && r1.top < r2.bottom && r2.top < r1.bottom;
          },
          [a, b],
        );

      expect(await fits('[data-ui="forum-card"]')).toEqual([]);
      expect(await overlap('[data-ui="forum-card"]', '.lc-corner-right')).toBe(false);
      expect(await overlap('[data-ui="forum-card"]', '.lc-corner-left')).toBe(false);
      const box = (await page.locator('[data-ui="forum"]').boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: path.join(SHOTS, `e2e-${lang}-button.png`) });

      await page.tap('[data-ui="forum"]');
      await page.waitForSelector('[data-forum="grid"] [data-post]');
      await page.waitForTimeout(500);
      expect(await fits('[data-forum="sheet"]')).toEqual([]);
      await page.screenshot({ path: path.join(SHOTS, `e2e-${lang}-feed.png`) });

      const first = (await grid(page).locator('[data-post]').first().getAttribute('data-post'))!;
      await page.tap(`[data-post="${first}"] .lc-forum-pic`);
      await page.waitForSelector('[data-forum="post"] [data-forum="say"]');
      await page.waitForTimeout(500);
      expect(await fits('[data-forum="post"]')).toEqual([]);
      await page.screenshot({ path: path.join(SHOTS, `e2e-${lang}-post.png`) });
      // The box to write in, focused: it and Send are in sight.
      await page.tap('[data-forum="comment-text"]');
      await page.waitForTimeout(500);
      for (const sel of ['[data-forum="comment-text"]', '[data-forum="send"]']) {
        const r = (await page.locator(sel).boundingBox())!;
        const vv = (await page.evaluate('({ top: visualViewport.offsetTop, height: visualViewport.height })')) as { top: number; height: number };
        expect(r.y).toBeGreaterThanOrEqual(vv.top);
        expect(r.y + r.height).toBeLessThanOrEqual(vv.top + vv.height + 0.5);
      }
      await page.tap('[data-forum="back"]');

      await page.tap('[data-forum="post-mine"]');
      await page.waitForSelector('[data-forum="publish"] img[src^="data:image/jpeg"]');
      await page.waitForTimeout(400);
      expect(await fits('[data-forum="publish"]')).toEqual([]);
      await page.screenshot({ path: path.join(SHOTS, `e2e-${lang}-publish.png`) });
      expect(pageErrors(errors)).toEqual([]);
    });
  }
});
