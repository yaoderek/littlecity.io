// Global Village's server, every call, in-process on a random port with a temporary data folder
// (design "Tests", Server). Owner: Forum.

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { key, type CellKey } from '@/core/grid';
import type { FloorKind } from '@/core/kinds';
import { encodeRanged, encodeTown } from '@/world/save';
import { emptyWorld } from '@/world/world';
import { codecFingerprint } from '@/world/codec-fingerprint';
import { fakeJpeg } from './test-helpers';
import { ERRORS, ERROR_LINES } from './errors';
import { startForum, TOP_RECENT_MS, type RunningForum } from './forum';
import { LIMITS } from './limits';

const START = Date.UTC(2026, 10, 27, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let clock = START;
let dir = '';
let srv: RunningForum;
let logged: string[] = [];

beforeEach(async () => {
  clock = START;
  logged = [];
  dir = mkdtempSync(join(tmpdir(), 'lc-forum-'));
  srv = await startForum({ dataDir: dir, port: 0, publicUrl: 'https://towns.test', gameUrl: 'https://game.test', adminPassword: 'open sesame', now: () => clock, log: (m) => logged.push(m) });
});
afterEach(async () => {
  await srv.close();
  rmSync(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  text: string;
  headers: Headers;
}

async function call(method: string, path: string, opts: { secret?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}): Promise<Answer> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.secret) headers.authorization = `Bearer ${opts.secret}`;
  let body: string | undefined = opts.raw;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['content-type'] = 'application/json';
  }
  const r = await fetch(srv.url + path, { method, headers, body, redirect: 'manual' });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a page */
  }
  return { status: r.status, json, text, headers: r.headers };
}

/** A town with `n` paths laid (n ≥ 1 is something built), on its own seed. */
function town(seed: number, n = 1): string {
  const floors = new Map<CellKey, FloorKind>();
  for (let i = 0; i < n; i++) floors.set(key(4 + (i % 40), 1, 4 + Math.floor(i / 40)), 'path');
  return encodeTown({ ...emptyWorld(seed), floors });
}
const PICTURE = readFileSync(new URL('./seed/grow.jpg', import.meta.url)).toString('base64');
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

async function player(name: string | null = 'mira'): Promise<{ id: string; secret: string }> {
  const r = await call('POST', '/v1/players');
  expect(r.status).toBe(201);
  if (name !== null) expect((await call('PUT', '/v1/me', { secret: r.json.secret, body: { name } })).status).toBe(200);
  return r.json;
}

async function post(secret: string, extra: Record<string, unknown> = {}, seed = 1): Promise<Answer> {
  return call('POST', '/v1/posts', { secret, body: { code: town(seed), caption: 'a harbour town', picture: PICTURE, ...extra } });
}

async function posted(secret: string, extra: Record<string, unknown> = {}, seed = 1): Promise<string> {
  const r = await post(secret, extra, seed);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.id;
}

const feed = (tab: string, secret?: string, after?: string) => call('GET', `/v1/posts?tab=${tab}${after ? `&after=${after}` : ''}`, { secret });

async function adminCookie(): Promise<{ cookie: string; csrf: string }> {
  const r = await fetch(`${srv.url}/admin/login`, { method: 'POST', body: 'password=open+sesame', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  expect(r.status).toBe(303);
  const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
  const page = await (await fetch(`${srv.url}/admin`, { headers: { cookie } })).text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(page)![1]!;
  return { cookie, csrf };
}
async function adminDo(action: string, id: string): Promise<number> {
  const { cookie, csrf } = await adminCookie();
  const r = await fetch(`${srv.url}/admin/${action}`, { method: 'POST', body: new URLSearchParams({ csrf, id }).toString(), headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  return r.status;
}

describe('identity', () => {
  test('a new identity is an id and a secret; only the secret\'s hash is kept', async () => {
    const r = await call('POST', '/v1/players');
    expect(r.status).toBe(201);
    expect(Object.keys(r.json).sort()).toEqual(['id', 'secret']);
    expect(r.json.id).toMatch(/^[0-9a-z]{12}$/);
    expect(r.json.secret.length).toBeGreaterThanOrEqual(40);
    const db = new DatabaseSync(join(dir, 'forum.db'), { readOnly: true });
    const row = db.prepare('SELECT * FROM players').get() as Record<string, unknown>;
    db.close();
    expect(JSON.stringify(row)).not.toContain(r.json.secret);
    expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a name: 1 to 20 characters (code points), cleaned; an unknown or missing secret is refused', async () => {
    const { secret } = await call('POST', '/v1/players').then((r) => r.json);
    expect((await call('PUT', '/v1/me', { secret, body: { name: '  小林\n ' } })).json).toEqual({ name: '小林' });
    expect((await call('PUT', '/v1/me', { secret, body: { name: '字'.repeat(20) } })).status).toBe(200);
    expect((await call('PUT', '/v1/me', { secret, body: { name: '🏠'.repeat(20) } })).status).toBe(200);
    for (const name of ['', '   ', 'a'.repeat(21), '🏠'.repeat(21)]) expect((await call('PUT', '/v1/me', { secret, body: { name } })).json).toEqual({ error: ERRORS.badName });
    expect((await call('PUT', '/v1/me', { secret, body: { name: 5 } })).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('PUT', '/v1/me', { secret, body: { name: 'x', admin: true } })).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('PUT', '/v1/me', { body: { name: 'x' } })).status).toBe(401);
    const wrong = await call('PUT', '/v1/me', { secret: 'x'.repeat(43), body: { name: 'x' } });
    expect(wrong.status).toBe(401);
    expect(wrong.json).toEqual({ error: ERRORS.whoAreYou });
    expect((await call('GET', '/v1/posts?tab=top', { headers: { authorization: 'Basic abc' } })).status).toBe(401);
  });

  test('300 new identities a day per address; behind the local proxy the address is X-Forwarded-For\'s last', async () => {
    const as = (ip: string) => call('POST', '/v1/players', { headers: { 'x-forwarded-for': `9.9.9.9, ${ip}` } });
    for (let i = 0; i < LIMITS.identitiesPerDay; i++) expect((await as('1.2.3.4')).status).toBe(201);
    const over = await as('1.2.3.4');
    expect(over.status).toBe(429);
    expect(over.json).toEqual({ error: ERRORS.slowDown });
    expect((await as('5.6.7.8')).status).toBe(201);
    clock += DAY + 1;
    expect((await as('1.2.3.4')).status).toBe(201);
  });
});

describe('posting', () => {
  test('a post: in New, Top and Mine, opened with its town code, its picture served for a year', async () => {
    const me = await player('mira');
    const id = await posted(me.secret, { caption: '  a harbour\ntown  ' });
    expect(id).toMatch(/^[0-9a-z]{10}$/);
    for (const tab of ['new', 'top', 'mine']) {
      const r = await feed(tab, me.secret);
      expect(r.status).toBe(200);
      expect(r.json.next).toBeNull();
      expect(r.json.posts).toHaveLength(1);
      const p = r.json.posts[0];
      expect(p).toMatchObject({ id, name: 'mira', caption: 'a harbour town', created: START, likes: 0, comments: 0, copies: 0, liked: false, mine: true, parent: null });
      expect('newLikes' in p).toBe(tab === 'mine');
    }
    const anon = await feed('new');
    expect(anon.json.posts[0].mine).toBe(false);
    const one = await call('GET', `/v1/posts/${id}`);
    expect(one.json).toMatchObject({ id, code: town(1), comments: 0, commentList: [], earlierComments: null });
    const pic = await fetch(`${srv.url}/pics/${id}.jpg`);
    expect(pic.status).toBe(200);
    expect(pic.headers.get('content-type')).toBe('image/jpeg');
    expect(pic.headers.get('cache-control')).toContain('max-age=31536000');
    expect(Buffer.from(await pic.arrayBuffer()).toString('base64')).toBe(PICTURE);
    expect(existsSync(join(dir, 'pics', `${id}.jpg`))).toBe(true);
  });

  test('no cap on posting: the same town twice is two posts', async () => {
    const me = await player();
    for (let i = 0; i < 40; i++) await posted(me.secret);
    expect((await feed('mine', me.secret)).json.posts).toHaveLength(24);
  });

  test('a name is needed first; a blocked player can\'t post', async () => {
    const me = await player(null);
    expect((await post(me.secret)).json).toEqual({ error: ERRORS.nameNeeded });
    expect((await post('')).status).toBe(401);
  });

  test('town codes: an empty island, garbage, a modified copy\'s town and a town too big are refused', async () => {
    const me = await player();
    const refused = async (code: unknown, line: string, status?: number) => {
      const r = await post(me.secret, { code });
      expect(r.json).toEqual({ error: line });
      if (status) expect(r.status).toBe(status);
    };
    await refused(encodeTown(emptyWorld(3)), ERRORS.townEmpty);
    await refused('not a town', ERRORS.townUnreadable);
    await refused('TEMBcfJT_5skwMAgwM', ERRORS.townUnreadable);
    // A section this game doesn't know (a copy of the game that added one).
    const floors = new Map<CellKey, FloorKind>([[key(5, 1, 5), 'path']]);
    await refused(encodeRanged({ ...emptyWorld(3), floors }, 1 << 6), ERRORS.townUnreadable);
    await refused('A'.repeat(LIMITS.code + 1), ERRORS.townTooBig, 413);
    await refused(42, ERRORS.badRequest);
    expect((await feed('new')).json.posts).toHaveLength(0);
    // A big town (thousands of paths) under the limit is fine.
    expect((await post(me.secret, { code: town(9, 1500) })).status).toBe(201);
  });

  test('pictures: a JPEG of at most 640 × 400 and 300 KB, nothing else', async () => {
    const me = await player();
    const refused = async (picture: unknown) => expect((await post(me.secret, { picture })).json).toEqual({ error: typeof picture === 'string' ? ERRORS.badPicture : ERRORS.badRequest });
    await refused(b64(fakeJpeg(641, 400)));
    await refused(b64(fakeJpeg(640, 401)));
    await refused(b64(fakeJpeg(640, 400, LIMITS.pictureBytes)));
    await refused(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'));
    await refused(b64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
    await refused('!!!!');
    await refused('');
    await refused(null);
    expect((await post(me.secret, { picture: b64(fakeJpeg(640, 400, 200 * 1024)) })).status).toBe(201);
    expect((await post(me.secret, { picture: b64(fakeJpeg(320, 200)) })).status).toBe(201);
    expect((await post(me.secret, { picture: `data:image/jpeg;base64,${PICTURE}` })).status).toBe(201);
  });

  test('captions: up to 140 characters as a reader counts them, Chinese and emoji too', async () => {
    const me = await player();
    expect((await post(me.secret, { caption: '镇'.repeat(140) })).status).toBe(201);
    expect((await post(me.secret, { caption: '🏰'.repeat(140) })).status).toBe(201);
    expect((await post(me.secret, { caption: '' })).status).toBe(201);
    const noCaption = await call('POST', '/v1/posts', { secret: me.secret, body: { code: town(1), picture: PICTURE } });
    expect(noCaption.status).toBe(201);
    expect(noCaption.json.caption).toBe('');
    expect((await post(me.secret, { caption: '镇'.repeat(141) })).json).toEqual({ error: ERRORS.captionTooLong });
    expect((await post(me.secret, { caption: '🏰'.repeat(141) })).json).toEqual({ error: ERRORS.captionTooLong });
  });

  test('only what the API expects: unknown fields, wrong types, non-JSON and oversized bodies are refused', async () => {
    const me = await player();
    expect((await post(me.secret, { extra: 1 })).json).toEqual({ error: ERRORS.badRequest });
    expect((await post(me.secret, { parent: 'not an id' })).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('POST', '/v1/posts', { secret: me.secret, raw: '[1,2]' })).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('POST', '/v1/posts', { secret: me.secret, raw: '{"code":' })).json).toEqual({ error: ERRORS.badRequest });
    const big = await call('PUT', '/v1/me', { secret: me.secret, raw: JSON.stringify({ name: 'x'.repeat(LIMITS.smallBody) }) });
    expect(big.status).toBe(413);
    expect(big.json).toEqual({ error: ERRORS.tooBig });
    const huge = await call('POST', '/v1/posts', { secret: me.secret, raw: 'x'.repeat(LIMITS.postBody + 1) });
    expect(huge.status).toBe(413);
    expect(huge.json).toEqual({ error: ERRORS.townTooBig });
    expect((await call('GET', '/v1/posts?tab=hot')).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('GET', '/v1/posts?tab=new&after=garbage!')).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('GET', '/v1/posts?tab=new&sql=1')).json).toEqual({ error: ERRORS.badRequest });
    expect((await call('GET', '/v1/nothing')).json).toEqual({ error: ERRORS.notFound });
    expect((await call('PATCH', '/v1/posts')).status).toBe(405);
    expect((await call('GET', '/v1/posts/zzzzzzzzzz')).json).toEqual({ error: ERRORS.postGone });
    expect((await call('GET', "/v1/posts/' OR 1=1 --")).json).toEqual({ error: ERRORS.postGone });
    expect((await call('GET', '/v1/posts?tab=mine')).status).toBe(401);
  });

  test('a post made from a copy names its original; a deleted original reads as gone', async () => {
    const tom = await player('tom');
    const mira = await player('mira');
    const original = await posted(tom.secret);
    const copy = await posted(mira.secret, { parent: original });
    expect((await call('GET', `/v1/posts/${copy}`)).json.parent).toEqual({ id: original, name: 'tom' });
    await call('PUT', '/v1/me', { secret: tom.secret, body: { name: 'tommy' } });
    expect((await call('GET', `/v1/posts/${copy}`)).json.parent).toEqual({ id: original, name: 'tommy' });
    expect((await call('GET', `/v1/posts/${copy}`)).json.name).toBe('mira');
    expect((await call('DELETE', `/v1/posts/${original}`, { secret: tom.secret })).status).toBe(200);
    expect((await call('GET', `/v1/posts/${copy}`)).json.parent).toEqual({ id: original, name: null });
  });
});

describe('likes, copies, comments', () => {
  test('likes are counted once per player, taken back once', async () => {
    const mira = await player('mira');
    const sam = await player('sam');
    const id = await posted(mira.secret);
    expect((await call('PUT', `/v1/posts/${id}/like`, { secret: sam.secret })).json).toEqual({ likes: 1, liked: true });
    expect((await call('PUT', `/v1/posts/${id}/like`, { secret: sam.secret })).json).toEqual({ likes: 1, liked: true });
    expect((await call('PUT', `/v1/posts/${id}/like`, { secret: mira.secret })).json).toEqual({ likes: 2, liked: true });
    expect((await feed('new', sam.secret)).json.posts[0]).toMatchObject({ likes: 2, liked: true, mine: false });
    expect((await call('DELETE', `/v1/posts/${id}/like`, { secret: sam.secret })).json).toEqual({ likes: 1, liked: false });
    expect((await call('DELETE', `/v1/posts/${id}/like`, { secret: sam.secret })).json).toEqual({ likes: 1, liked: false });
    expect((await call('PUT', `/v1/posts/${id}/like`)).status).toBe(401);
    expect((await call('PUT', '/v1/posts/zzzzzzzzzz/like', { secret: sam.secret })).json).toEqual({ error: ERRORS.postGone });
  });

  test('300 likes an hour per player', async () => {
    const mira = await player();
    const id = await posted(mira.secret);
    for (let i = 0; i < LIMITS.likesPerHour; i++) expect((await call(i % 2 ? 'DELETE' : 'PUT', `/v1/posts/${id}/like`, { secret: mira.secret })).status).toBe(200);
    expect((await call('PUT', `/v1/posts/${id}/like`, { secret: mira.secret })).json).toEqual({ error: ERRORS.slowDown });
    clock += HOUR + 1;
    expect((await call('PUT', `/v1/posts/${id}/like`, { secret: mira.secret })).status).toBe(200);
  });

  test('a copy is counted once per player', async () => {
    const mira = await player('mira');
    const sam = await player(null);
    const id = await posted(mira.secret);
    expect((await call('POST', `/v1/posts/${id}/copied`, { secret: sam.secret })).json).toEqual({ copies: 1 });
    expect((await call('POST', `/v1/posts/${id}/copied`, { secret: sam.secret })).json).toEqual({ copies: 1 });
    expect((await call('POST', `/v1/posts/${id}/copied`, { secret: mira.secret })).json).toEqual({ copies: 2 });
    expect((await call('GET', `/v1/posts/${id}`)).json.copies).toBe(2);
  });

  test('comments: 1 to 280 characters, oldest first, a name needed, the commenter\'s own to delete', async () => {
    const mira = await player('mira');
    const sam = await player('sam');
    const id = await posted(mira.secret);
    const c1 = await call('POST', `/v1/posts/${id}/comments`, { secret: sam.secret, body: { text: 'how did you do the bridge?' } });
    expect(c1.status).toBe(201);
    expect(c1.json).toMatchObject({ name: 'sam', text: 'how did you do the bridge?', created: START, mine: true });
    clock += 1000;
    await call('POST', `/v1/posts/${id}/comments`, { secret: mira.secret, body: { text: '好可爱!' } });
    expect((await call('POST', `/v1/posts/${id}/comments`, { secret: sam.secret, body: { text: '字'.repeat(280) } })).status).toBe(201);
    for (const text of ['', '  \n ', '字'.repeat(281)]) expect((await call('POST', `/v1/posts/${id}/comments`, { secret: sam.secret, body: { text } })).json).toEqual({ error: ERRORS.badComment });
    const nameless = await player(null);
    expect((await call('POST', `/v1/posts/${id}/comments`, { secret: nameless.secret, body: { text: 'hi' } })).json).toEqual({ error: ERRORS.nameNeeded });
    const one = await call('GET', `/v1/posts/${id}`, { secret: sam.secret });
    expect(one.json.commentList.map((c: { text: string }) => c.text.slice(0, 5))).toEqual(['how d', '好可爱!', '字字字字字']);
    expect(one.json.commentList.map((c: { mine: boolean }) => c.mine)).toEqual([true, false, true]);
    expect(one.json.commentList[0].id).toBe(c1.json.id);
    expect(one.json.commentList).toHaveLength(3);
    expect((await feed('new')).json.posts[0].comments).toBe(3);
    expect((await call('DELETE', `/v1/comments/${c1.json.id}`, { secret: mira.secret })).json).toEqual({ error: ERRORS.notYours });
    expect((await call('DELETE', `/v1/comments/${c1.json.id}`, { secret: sam.secret })).json).toEqual({ ok: true });
    expect((await call('DELETE', `/v1/comments/${c1.json.id}`, { secret: sam.secret })).json).toEqual({ error: ERRORS.commentGone });
    expect((await call('GET', `/v1/posts/${id}`)).json.commentList).toHaveLength(2);
    expect((await feed('new', sam.secret)).json.posts[0].comments).toBe(2);
  });

  test('30 comments an hour per player', async () => {
    const mira = await player();
    const id = await posted(mira.secret);
    for (let i = 0; i < LIMITS.commentsPerHour; i++) expect((await call('POST', `/v1/posts/${id}/comments`, { secret: mira.secret, body: { text: `${i}` } })).status).toBe(201);
    expect((await call('POST', `/v1/posts/${id}/comments`, { secret: mira.secret, body: { text: 'more' } })).json).toEqual({ error: ERRORS.slowDown });
    clock += HOUR + 1;
    expect((await call('POST', `/v1/posts/${id}/comments`, { secret: mira.secret, body: { text: 'more' } })).status).toBe(201);
  });

  test('more than 200 comments: the newest 200 come with the post, the earlier ones on request', async () => {
    const mira = await player();
    const id = await posted(mira.secret);
    const people = await Promise.all(Array.from({ length: 9 }, () => player('p')));
    for (let i = 0; i < 205; i++) {
      clock += 1000;
      await call('POST', `/v1/posts/${id}/comments`, { secret: people[i % 9]!.secret, body: { text: `c${i}` } });
    }
    const one = await call('GET', `/v1/posts/${id}`);
    expect(one.json.commentList).toHaveLength(200);
    expect(one.json.commentList[0].text).toBe('c5');
    expect(one.json.commentList[199].text).toBe('c204');
    const earlier = await call('GET', `/v1/posts/${id}/comments?before=${one.json.earlierComments}`);
    expect(earlier.json.commentList.map((c: { text: string }) => c.text)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(earlier.json.earlierComments).toBeNull();
    expect((await call('GET', `/v1/posts/${id}/comments?before=nope!`)).status).toBe(400);
  });
});

describe('feeds', () => {
  test('Top: the last 7 days most liked first (ties newer first), then older posts most liked first', async () => {
    const me = await player('mira');
    const fans = await Promise.all(Array.from({ length: 5 }, () => player(null)));
    const at = async (ago: number, likes: number) => {
      clock = START - ago;
      const id = await posted(me.secret);
      for (let i = 0; i < likes; i++) await call('PUT', `/v1/posts/${id}/like`, { secret: fans[i]!.secret });
      return id;
    };
    const oldFamous = await at(8 * DAY, 5);
    const oldQuiet = await at(30 * DAY, 1);
    const recentOne = await at(2 * DAY, 1);
    const recentTwo = await at(3 * DAY, 2);
    const justInside = await at(TOP_RECENT_MS - HOUR, 0);
    const justOutside = await at(TOP_RECENT_MS + HOUR, 0);
    const tieOlder = await at(4 * DAY, 1);
    clock = START + 20_000; // past the writer's fresh window and the cache
    const top = await feed('top');
    expect(top.json.posts.map((p: { id: string }) => p.id)).toEqual([recentTwo, recentOne, tieOlder, justInside, oldFamous, oldQuiet, justOutside]);
    const newest = await feed('new');
    expect(newest.json.posts.map((p: { id: string }) => p.id)).toEqual([recentOne, recentTwo, tieOlder, justInside, justOutside, oldFamous, oldQuiet]);
  });

  test('pages of 24 with a cursor: every post once, in order, on New, Top and Mine', async () => {
    const me = await player('mira');
    const fan = await player(null);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      clock = START - (i % 3 === 0 ? 10 * DAY : 0) + i * 1000;
      const id = await posted(me.secret);
      ids.push(id);
      if (i % 4 === 0) await call('PUT', `/v1/posts/${id}/like`, { secret: fan.secret });
    }
    clock = START + DAY;
    for (const tab of ['new', 'top', 'mine']) {
      const seen: string[] = [];
      let after: string | undefined;
      let pages = 0;
      do {
        const r = await feed(tab, me.secret, after);
        expect(r.status).toBe(200);
        expect(r.json.posts.length).toBeLessThanOrEqual(24);
        seen.push(...r.json.posts.map((p: { id: string }) => p.id));
        after = r.json.next ?? undefined;
        pages++;
      } while (after);
      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(60);
      expect(seen.sort()).toEqual([...ids].sort());
    }
    // A cursor from another tab is refused.
    const top1 = await feed('top');
    expect((await feed('new', undefined, top1.json.next)).status).toBe(400);
  });

  test('Mine shows what is new since Mine was last opened; the button\'s news counts since the forum was opened', async () => {
    const mira = await player('mira');
    const sam = await player('sam');
    const id = await posted(mira.secret);
    clock += 1000;
    await call('PUT', `/v1/posts/${id}/like`, { secret: sam.secret });
    await call('PUT', `/v1/posts/${id}/like`, { secret: mira.secret }); // her own: not news
    await call('POST', `/v1/posts/${id}/comments`, { secret: sam.secret, body: { text: 'nice' } });
    await call('POST', `/v1/posts/${id}/comments`, { secret: mira.secret, body: { text: 'thanks' } });
    expect((await call('GET', '/v1/me/news', { secret: mira.secret })).json).toEqual({ likes: 1, comments: 1 });
    expect((await feed('mine', mira.secret)).json.posts[0]).toMatchObject({ newLikes: 1, newComments: 1 });
    clock += 1000;
    expect((await call('POST', '/v1/me/seen', { secret: mira.secret, body: { what: 'forum' } })).json).toEqual({ ok: true });
    expect((await call('GET', '/v1/me/news', { secret: mira.secret })).json).toEqual({ likes: 0, comments: 0 });
    // Opening the forum on Top doesn't wipe what Mine has to show.
    expect((await feed('mine', mira.secret)).json.posts[0]).toMatchObject({ newLikes: 1, newComments: 1 });
    await call('POST', '/v1/me/seen', { secret: mira.secret, body: { what: 'mine' } });
    expect((await feed('mine', mira.secret)).json.posts[0]).toMatchObject({ newLikes: 0, newComments: 0 });
    expect((await call('POST', '/v1/me/seen', { secret: mira.secret, body: { what: 'everything' } })).status).toBe(400);
    expect((await call('GET', '/v1/me/news')).status).toBe(401);
  });

  test('feeds may be 15 s stale for others, never for the player who just wrote', async () => {
    const mira = await player('mira');
    const sam = await player('sam');
    const first = await posted(mira.secret);
    clock += 20_000;
    expect((await feed('new', sam.secret)).json.posts).toHaveLength(1); // cached now
    clock += 1000;
    const second = await posted(mira.secret);
    expect((await feed('new', mira.secret)).json.posts.map((p: { id: string }) => p.id)).toEqual([second, first]);
    clock += 1000;
    await call('PUT', `/v1/posts/${first}/like`, { secret: sam.secret });
    const samSees = await feed('new', sam.secret);
    expect(samSees.json.posts.find((p: { id: string }) => p.id === first)).toMatchObject({ likes: 1, liked: true });
    clock += LIMITS.feedCacheMs + 1;
    expect((await feed('new')).json.posts).toHaveLength(2);
  });
});

describe('deleting and blocking', () => {
  test('a poster deletes their own post: its comments, likes and picture go too', async () => {
    const mira = await player('mira');
    const sam = await player('sam');
    const id = await posted(mira.secret);
    await call('PUT', `/v1/posts/${id}/like`, { secret: sam.secret });
    const c = await call('POST', `/v1/posts/${id}/comments`, { secret: sam.secret, body: { text: 'hi' } });
    expect((await call('DELETE', `/v1/posts/${id}`, { secret: sam.secret })).json).toEqual({ error: ERRORS.notYours });
    expect((await call('DELETE', `/v1/posts/${id}`)).status).toBe(401);
    expect((await call('DELETE', `/v1/posts/${id}`, { secret: mira.secret })).json).toEqual({ ok: true });
    expect((await call('GET', `/v1/posts/${id}`)).json).toEqual({ error: ERRORS.postGone });
    expect((await call('DELETE', `/v1/posts/${id}`, { secret: mira.secret })).status).toBe(404);
    expect((await fetch(`${srv.url}/pics/${id}.jpg`)).status).toBe(404);
    expect(existsSync(join(dir, 'pics', `${id}.jpg`))).toBe(false);
    expect((await call('DELETE', `/v1/comments/${c.json.id}`, { secret: sam.secret })).status).toBe(404);
    expect((await feed('mine', mira.secret)).json.posts).toHaveLength(0);
    const db = new DatabaseSync(join(dir, 'forum.db'), { readOnly: true });
    expect(db.prepare('SELECT (SELECT COUNT(*) FROM likes) + (SELECT COUNT(*) FROM comments) AS n').get()).toEqual({ n: 0 });
    db.close();
  });

  test('a blocked player reads but can\'t post, comment or like, and their posts, comments and likes are hidden from everyone else', async () => {
    const troll = await player('troll');
    const mira = await player('mira');
    const theirs = await posted(troll.secret);
    const hers = await posted(mira.secret);
    await call('PUT', `/v1/posts/${hers}/like`, { secret: troll.secret });
    await call('POST', `/v1/posts/${hers}/comments`, { secret: troll.secret, body: { text: 'spam' } });
    await call('POST', `/v1/posts/${hers}/comments`, { secret: mira.secret, body: { text: 'mine' } });
    const trollId = troll.id;
    expect(await adminDo('block', trollId)).toBe(303);

    clock += 20_000;
    for (const tab of ['new', 'top']) expect((await feed(tab, mira.secret)).json.posts.map((p: { id: string }) => p.id)).toEqual([hers]);
    expect((await feed('new', mira.secret)).json.posts[0]).toMatchObject({ likes: 0, comments: 1 });
    expect((await call('GET', `/v1/posts/${hers}`)).json.commentList.map((c: { text: string }) => c.text)).toEqual(['mine']);
    expect((await call('GET', `/v1/posts/${theirs}`, { secret: mira.secret })).json).toEqual({ error: ERRORS.postGone });
    expect((await fetch(`${srv.url}/pics/${theirs}.jpg`)).status).toBe(404);
    expect((await fetch(`${srv.url}/p/${theirs}`)).status).toBe(404);

    // They still read, and see their own.
    expect((await feed('new', troll.secret)).status).toBe(200);
    expect((await feed('mine', troll.secret)).json.posts.map((p: { id: string }) => p.id)).toEqual([theirs]);
    expect((await call('GET', `/v1/posts/${hers}`, { secret: troll.secret })).json.commentList).toHaveLength(2);
    expect((await post(troll.secret)).json).toEqual({ error: ERRORS.blocked });
    expect((await call('POST', `/v1/posts/${hers}/comments`, { secret: troll.secret, body: { text: 'x' } })).json).toEqual({ error: ERRORS.blocked });
    expect((await call('PUT', `/v1/posts/${hers}/like`, { secret: troll.secret })).status).toBe(403);

    expect(await adminDo('unblock', trollId)).toBe(303);
    expect((await feed('new', mira.secret)).json.posts).toHaveLength(2);
    expect((await call('GET', `/v1/posts/${hers}`)).json).toMatchObject({ likes: 1, comments: 2 });
  });
});

describe('pages', () => {
  test('the share page: the post\'s picture and caption as its card, then on to the game', async () => {
    const mira = await player('mira');
    const id = await posted(mira.secret, { caption: 'castle on a cliff' });
    const r = await fetch(`${srv.url}/p/${id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).toContain(`<meta property="og:image" content="https://towns.test/pics/${id}.jpg">`);
    expect(html).toContain('<meta property="og:title" content="mira&#39;s town · Little City">');
    expect(html).toContain('<meta property="og:description" content="castle on a cliff">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(`<meta name="twitter:image" content="https://towns.test/pics/${id}.jpg">`);
    expect(html).toContain(`<meta property="og:url" content="https://towns.test/p/${id}">`);
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=https://game.test/?post=${id}">`);
    expect(html).not.toContain('<script');
    const gone = await fetch(`${srv.url}/p/zzzzzzzzzz`);
    expect(gone.status).toBe(404);
    expect(await gone.text()).toContain('url=https://game.test/?post=zzzzzzzzzz');
    expect((await fetch(`${srv.url}/p/%3Cscript%3E`)).status).toBe(404);
  });

  test('text with HTML in it comes back as text: in the API as written, escaped on every page', async () => {
    const evil = '<script>alert("x")</script><img src=x onerror=alert(1)>&amp;\'';
    const name = '<b>"bob"</b>&';
    const me = await player(name);
    const id = await posted(me.secret, { caption: evil });
    await call('POST', `/v1/posts/${id}/comments`, { secret: me.secret, body: { text: evil } });
    const api = await call('GET', `/v1/posts/${id}`);
    expect(api.json.caption).toBe(evil);
    expect(api.json.name).toBe(name);
    expect(api.json.commentList[0].text).toBe(evil);
    expect(api.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const share = await (await fetch(`${srv.url}/p/${id}`)).text();
    const { cookie } = await adminCookie();
    const admin = await (await fetch(`${srv.url}/admin`, { headers: { cookie } })).text();
    for (const html of [share, admin]) {
      expect(html).not.toContain('<script>alert');
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<b>"bob"');
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&amp;amp;&#39;');
    }
    expect(admin).toContain('&lt;b&gt;&quot;bob&quot;&lt;/b&gt;&amp;');
  });

  test('the admin page: a password (wrong ones refused), totals, the session\'s token on every action', async () => {
    const wrong = await fetch(`${srv.url}/admin/login`, { method: 'POST', body: 'password=guess', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    expect(wrong.status).toBe(403);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const out = await fetch(`${srv.url}/admin`);
    expect(await out.text()).toContain('type="password"');
    const mira = await player('mira');
    const id = await posted(mira.secret);
    await call('PUT', `/v1/posts/${id}/like`, { secret: mira.secret });
    const { cookie, csrf } = await adminCookie();
    expect(cookie).toMatch(/^lc_admin=/);
    const page = await (await fetch(`${srv.url}/admin`, { headers: { cookie } })).text();
    expect(page).toContain('Newest posts');
    expect(page).toContain(`/admin/pics/${id}.jpg`);
    expect(page.replace(/\s+/g, ' ')).toMatch(/<th>Players<\/th><td>1<\/td><td>1<\/td>/);
    expect((await fetch(`${srv.url}/admin/pics/${id}.jpg`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${srv.url}/admin/pics/${id}.jpg`)).status).toBe(403);
    // Without the token, or without the cookie, nothing happens.
    const forged = await fetch(`${srv.url}/admin/delete-post`, { method: 'POST', body: `id=${id}&csrf=nope`, headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    expect(forged.status).toBe(403);
    const noCookie = await fetch(`${srv.url}/admin/delete-post`, { method: 'POST', body: `id=${id}&csrf=${csrf}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    expect(noCookie.status).toBe(403);
    expect((await call('GET', `/v1/posts/${id}`)).status).toBe(200);
    expect(await adminDo('delete-post', id)).toBe(303);
    expect((await call('GET', `/v1/posts/${id}`)).status).toBe(404);
  });

  test('ten wrong passwords and the address waits', async () => {
    for (let i = 0; i < 10; i++) await fetch(`${srv.url}/admin/login`, { method: 'POST', body: 'password=guess' });
    const r = await fetch(`${srv.url}/admin/login`, { method: 'POST', body: 'password=open+sesame', redirect: 'manual' });
    expect(r.status).toBe(429);
  });
});

describe('the server itself', () => {
  test('health reports the codec fingerprint; CORS is open, preflight answered', async () => {
    const h = await call('GET', '/health');
    expect(h.json).toEqual({ ok: true, codec: codecFingerprint() });
    const pre = await fetch(`${srv.url}/v1/posts`, { method: 'OPTIONS', headers: { origin: 'https://someones-copy.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-methods')).toContain('DELETE');
    expect(pre.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
    expect((await call('GET', '/v1/posts?tab=new')).headers.get('access-control-allow-origin')).toBe('*');
    const err = await call('GET', '/v1/posts/zzzzzzzzzz');
    expect(err.headers.get('access-control-allow-origin')).toBe('*');
  });

  test('an unexpected failure answers the fixed line, with no details', async () => {
    srv.forum.store.db.close();
    const r = await call('GET', '/v1/posts?tab=new');
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: ERRORS.broken });
    expect(r.text).not.toMatch(/sqlite|database|stack|\n\s+at /i);
    expect(logged.length).toBe(1);
  });

  test('every error line is one fixed English line', () => {
    expect(ERROR_LINES.length).toBe(new Set(ERROR_LINES).size);
    for (const line of ERROR_LINES) expect(line).toMatch(/^[A-Z].*[.]$/);
    expect(ERROR_LINES).toContain('Slow down a little. Try again in a few minutes.');
    expect(ERROR_LINES).toContain("This town can't be opened by Little City.");
  });

  test('a backup is a consistent copy that opens with every post', async () => {
    const mira = await player('mira');
    const id = await posted(mira.secret);
    const file = join(dir, 'backup.db');
    srv.forum.store.backupTo(file);
    const db = new DatabaseSync(file, { readOnly: true });
    expect(db.prepare('SELECT id FROM posts').all()).toEqual([{ id }]);
    db.close();
  });
});
