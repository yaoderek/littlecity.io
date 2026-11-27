// Global Village's calls against a fake fetch: the identity made once and kept, the Authorization header,
// the 10-second give-up, and the server's lines coming back as the player's words.

import { afterEach, describe, expect, test, vi } from 'vitest';
import { setLanguage } from '@/i18n';
import { FORUM_KEY, readIdentity } from '@/ui/forum-button';
import { clip, codePoints, createForumApi, ForumError, readPost, toTime } from './api';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake server: answers by "METHOD /path" (without the query), records every call. */
function server(routes: Record<string, (c: Call) => { status?: number; body?: unknown; raw?: string } | Promise<never>>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const c: Call = { url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const path = new URL(url).pathname;
    const route = routes[`${c.method} ${path}`];
    if (!route) return new Response(JSON.stringify({ error: 'Not here.' }), { status: 404 });
    const r = await route(c);
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

function store(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const BASE = 'http://forum.test';
let made = 0;
const players = () => ({ body: { id: `p${++made}`, secret: `s${made}` } });

afterEach(() => {
  vi.useRealTimers();
  setLanguage('en');
});

describe('who the player is', () => {
  test('nothing is made until it is needed; then once, however many ask at the same time, and kept in lc:forum', async () => {
    const s = store();
    const srv = server({ 'POST /v1/players': players, 'PUT /v1/posts/a/like': () => ({ body: {} }), 'PUT /v1/posts/b/like': () => ({ body: {} }) });
    const api = createForumApi({ base: BASE, storage: s, fetch: srv.fetch });
    expect(api.me()).toBeNull();
    await api.posts('top').catch(() => undefined);
    expect(srv.calls.filter((c) => c.url.endsWith('/v1/players'))).toHaveLength(0);
    await Promise.all([api.like('a', true), api.like('b', true)]);
    expect(srv.calls.filter((c) => c.url.endsWith('/v1/players'))).toHaveLength(1);
    const who = readIdentity(s);
    expect(who).toMatchObject({ id: expect.any(String), secret: expect.any(String) });
    expect(JSON.parse(s.data.get(FORUM_KEY)!)).toEqual(who);
    // A later page reads the same person back and makes no other.
    const again = createForumApi({ base: BASE, storage: s, fetch: srv.fetch });
    await again.like('a', false).catch(() => undefined);
    expect(srv.calls.filter((c) => c.url.endsWith('/v1/players'))).toHaveLength(1);
    expect(again.me()).toEqual(who);
  });

  test('every call made as the player carries Authorization: Bearer <secret>; reads say who asks once there is someone', async () => {
    const s = store({ [FORUM_KEY]: JSON.stringify({ id: 'p9', secret: 'shh', name: 'mira' }) });
    const srv = server({
      'POST /v1/posts/x/comments': (c) => ({ body: { id: 'c1', name: 'mira', text: (c.body as { text: string }).text, created: 1_700_000_000_000 } }),
      'GET /v1/posts': () => ({ body: { posts: [], next: null } }),
    });
    const api = createForumApi({ base: BASE, storage: s, fetch: srv.fetch });
    const c = await api.comment('x', 'hello');
    expect(c).toMatchObject({ id: 'c1', text: 'hello', mine: true });
    await api.posts('mine');
    for (const call of srv.calls) expect(call.headers.Authorization).toBe('Bearer shh');
    expect(srv.calls[0]!.headers['Content-Type']).toBe('application/json');
  });

  test('storage that refuses: the player is one person for the rest of the page', async () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const srv = server({ 'POST /v1/players': players, 'POST /v1/posts/a/copied': () => ({ body: {} }) });
    const api = createForumApi({ base: BASE, storage: refusing, fetch: srv.fetch });
    await api.copied('a');
    await api.copied('a');
    expect(srv.calls.filter((c) => c.url.endsWith('/v1/players'))).toHaveLength(1);
    expect(api.me()).not.toBeNull();
  });

  test('the name is set on the server and remembered; posting marks the player as one who has posted', async () => {
    const s = store();
    const srv = server({ 'POST /v1/players': players, 'PUT /v1/me': () => ({ body: {} }), 'POST /v1/posts': () => ({ body: { id: 'new1' } }) });
    const api = createForumApi({ base: BASE, storage: s, fetch: srv.fetch });
    await api.setName('  小林  ');
    expect(srv.calls.find((c) => c.method === 'PUT')!.body).toEqual({ name: '小林' });
    expect(readIdentity(s)?.name).toBe('小林');
    await api.setName('小林');
    expect(srv.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    const id = await api.publish({ code: 'CODE', caption: 'hi', picture: 'data:image/jpeg;base64,AAAA', parent: 'p0' });
    expect(id).toBe('new1');
    expect(srv.calls.find((c) => c.url.endsWith('/v1/posts') && c.method === 'POST')!.body).toEqual({ code: 'CODE', caption: 'hi', picture: 'AAAA', parent: 'p0' });
    expect(readIdentity(s)?.posted).toBe(true);
  });
});

describe('when the server is slow, down or says no', () => {
  test('an identity the server no longer knows is thrown away, a new one made (name carried over), and the call tried once more', async () => {
    const s = store({ [FORUM_KEY]: JSON.stringify({ id: 'old', secret: 'stale', name: 'mira', posted: true }) });
    const srv = server({
      'POST /v1/players': players,
      'PUT /v1/me': () => ({ body: {} }),
      'PUT /v1/posts/a/like': (c) => (c.headers.Authorization === 'Bearer stale' ? { status: 401, body: { error: "This browser's Global Village identity wasn't recognised." } } : { body: {} }),
    });
    const api = createForumApi({ base: BASE, storage: s, fetch: srv.fetch });
    await api.like('a', true);
    expect(srv.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['PUT /v1/posts/a/like', 'POST /v1/players', 'PUT /v1/me', 'PUT /v1/posts/a/like']);
    expect(readIdentity(s)).toMatchObject({ name: 'mira' });
    expect(readIdentity(s)?.secret).not.toBe('stale');
  });


  test('a call with no answer gives up after 10 seconds, as "can\'t be reached"', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const api = createForumApi({ base: BASE, storage: store(), fetch: fetch as unknown as typeof globalThis.fetch });
    let failed: unknown = null;
    void api.posts('top').catch((e: unknown) => (failed = e));
    await vi.advanceTimersByTimeAsync(9_900);
    expect(failed).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    expect(failed).toBeInstanceOf(ForumError);
    expect((failed as ForumError).unreachable).toBe(true);
    expect((failed as ForumError).text).toBe("Global Village can't be reached right now.");
  });

  test('a refused network and a page that is not the server\'s JSON are "can\'t be reached" too', async () => {
    const down = createForumApi({ base: BASE, storage: store(), fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch });
    await expect(down.posts('new')).rejects.toMatchObject({ unreachable: true });
    const proxy = server({ 'GET /v1/posts': () => ({ status: 502, raw: '<html>Bad gateway</html>' }) });
    const api = createForumApi({ base: BASE, storage: store(), fetch: proxy.fetch });
    await expect(api.posts('new')).rejects.toMatchObject({ unreachable: true, status: 0 });
  });

  test('the server\'s fixed line comes back as itself, read in the player\'s language where there is a translation', async () => {
    const srv = server({
      'POST /v1/players': players,
      'POST /v1/posts': () => ({ status: 429, body: { error: 'Slow down a little. Try again in a few minutes.' } }),
      'DELETE /v1/posts/z': () => ({ status: 403, body: { error: 'Only the poster can do that.' } }),
    });
    const api = createForumApi({ base: BASE, storage: store(), fetch: srv.fetch });
    const e = (await api.publish({ code: 'c', caption: '', picture: 'p' }).catch((x: unknown) => x)) as ForumError;
    expect(e).toBeInstanceOf(ForumError);
    expect(e.status).toBe(429);
    expect(e.unreachable).toBe(false);
    expect(e.text).toBe('Slow down a little. Try again in a few minutes.');
    setLanguage('zh', { 'Slow down a little. Try again in a few minutes.': '慢一点。过几分钟再试吧。' });
    expect(e.text).toBe('慢一点。过几分钟再试吧。');
    // A line the game has no translation for is shown as it came.
    const other = (await api.remove('z').catch((x: unknown) => x)) as ForumError;
    expect(other.text).toBe('Only the poster can do that.');
  });
});

describe('reading what the server sends', () => {
  test('a page of posts and its cursor; times as ms (or a date)', async () => {
    const srv = server({
      'GET /v1/posts': (c) => ({
        body: {
          posts: [{ id: 'a', name: 'mira', caption: 'harbour', created: 1_700_000_000_000, likes: 3, comments: 1, copies: 0, liked: true, mine: false, parent: { id: 'b', name: 'tom' } }],
          next: new URL(c.url).searchParams.get('after') ? null : 'cur1',
        },
      }),
    });
    const api = createForumApi({ base: `${BASE}/`, storage: store(), fetch: srv.fetch });
    const first = await api.posts('top');
    expect(srv.calls[0]!.url).toBe(`${BASE}/v1/posts?tab=top`);
    expect(first.next).toBe('cur1');
    expect(first.posts[0]).toMatchObject({ id: 'a', created: 1_700_000_000_000, liked: true, parent: { id: 'b', name: 'tom' } });
    const second = await api.posts('top', 'cur1');
    expect(srv.calls[1]!.url).toBe(`${BASE}/v1/posts?tab=top&after=cur1`);
    expect(second.next).toBeNull();
    expect(toTime('2026-11-27T10:00:00Z')).toBe(Date.parse('2026-11-27T10:00:00Z'));
    expect(toTime(1_764_000_000_000)).toBe(1_764_000_000_000);
  });

  test('a post built on one that was deleted reads as gone', () => {
    expect(readPost({ id: 'a', parent: { id: 'b', name: null } }).parent).toEqual({ id: 'b', name: '', gone: true });
    expect(readPost({ id: 'a', parent: { id: 'b', name: '' } }).parent).toEqual({ id: 'b', name: '' });
    expect(readPost({ id: 'a', parent: null }).parent).toBeNull();
  });

  test('one post: its town code and its comments, oldest first', async () => {
    const srv = server({
      'GET /v1/posts/a': () => ({
        body: {
          id: 'a', name: 'mira', caption: '', created: 1, likes: 0, comments: 3, copies: 0, code: 'TOWN',
          commentList: [{ id: 'c2', name: 'b', text: 'second', created: 2000 }, { id: 'c1', name: 'a', text: 'first', created: 1000 }],
          earlierComments: 'cur',
        },
      }),
      'GET /v1/posts/a/comments': (c) => ({ body: { commentList: [{ id: 'c0', name: 'z', text: `before ${new URL(c.url).searchParams.get('before')}`, created: 500 }], earlierComments: null } }),
    });
    const api = createForumApi({ base: BASE, storage: store(), fetch: srv.fetch });
    const p = await api.post('a');
    expect(p.code).toBe('TOWN');
    expect(p.thread.map((c) => c.text)).toEqual(['first', 'second']);
    expect(p.comments).toBe(3);
    expect(p.earlier).toBe('cur');
    expect(await api.earlierComments('a', 'cur')).toEqual({ thread: [{ id: 'c0', name: 'z', text: 'before cur', created: 500, mine: false }], earlier: null });
    expect(api.picture('a')).toBe(`${BASE}/pics/a.jpg`);
    expect(api.link('a')).toBe(`${BASE}/p/a`);
  });
});

describe('counting characters as a reader does', () => {
  test('Chinese and emoji are one each', () => {
    expect(codePoints('我的小镇')).toBe(4);
    expect(codePoints('🏠🏡')).toBe(2);
    expect('🏠🏡'.length).toBe(4);
    expect(clip('ab🏠cd', 3)).toBe('ab🏠');
  });
});
