// Global Village's screen on a fake page: the Top / New / Mine states (fetching, empty, can't be reached
// with Try again), a post with its comments, and player text that reaches the page as text only.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ForumAppHost } from '@/ui/forum-button';
import type { Comment, ForumApi, FullPost, Page, Post } from './api';
import { ForumError } from './api';
import { createForum } from './sheet';
import { type FakeElement, htmlWrites, installFakeDom, settle } from './testing/fake-dom';

let restore: () => void;
beforeAll(() => {
  restore = installFakeDom();
});
afterAll(() => restore());

const EVIL = '<img src=x onerror="alert(1)">';

function post(id: string, over: Partial<Post> = {}): Post {
  return { id, name: 'mira', caption: `town ${id}`, created: Date.now() - 3_600_000, likes: 2, comments: 1, copies: 0, liked: false, mine: false, parent: null, ...over };
}

function fakeApi(over: Partial<ForumApi> = {}): ForumApi & { pages: Record<string, () => Promise<Page>> } {
  const pages: Record<string, () => Promise<Page>> = {};
  return {
    pages,
    me: () => null,
    identity: async () => ({ id: 'p', secret: 's' }),
    setName: async () => undefined,
    posts: vi.fn((tab: string) => (pages[tab] ?? (async () => ({ posts: [], next: null })))()),
    post: async (id: string): Promise<FullPost> => ({ ...post(id), code: 'CODE', thread: [], earlier: null }),
    earlierComments: async () => ({ thread: [], earlier: null }),
    publish: async () => 'new',
    remove: async () => undefined,
    like: vi.fn(async () => undefined),
    copied: async () => undefined,
    comment: async (_: string, text: string): Promise<Comment> => ({ id: 'c', name: 'me', text, created: Date.now(), mine: true }),
    removeComment: async () => undefined,
    news: async () => ({ likes: 0, comments: 0 }),
    seen: vi.fn(async () => undefined),
    picture: (id: string) => `http://forum.test/pics/${id}.jpg`,
    link: (id: string) => `http://forum.test/p/${id}`,
    ...over,
  } as ForumApi & { pages: Record<string, () => Promise<Page>> };
}

const app = (over: Partial<ForumAppHost> = {}): ForumAppHost => ({
  town: () => ({ code: 'CODE', worth: true, from: null, visiting: false }),
  picture: () => 'data:image/jpeg;base64,AAAA',
  visit: () => null,
  copy: () => null,
  ...over,
});

function open(api: ForumApi, host = app()) {
  const said: string[] = [];
  const badge: number[] = [];
  const forum = createForum({ base: 'http://forum.test', app: host, storage: null, api, say: (t) => said.push(t), setBadge: (n) => badge.push(n) });
  const root = forum.el as unknown as FakeElement;
  return { forum, root, said, badge, grid: () => root.querySelector('[data-forum="grid"]')!, state: () => root.querySelector('.lc-forum-state')?.getAttribute('data-forum') ?? null };
}

describe('the feed', () => {
  test('fetching, then the posts; the button\'s number goes when it opens', async () => {
    let release!: (p: Page) => void;
    const api = fakeApi();
    api.pages.top = () => new Promise((r) => (release = r));
    const f = open(api);
    f.forum.open();
    expect(f.forum.isOpen).toBe(true);
    expect(f.badge).toEqual([0]);
    expect(f.state()).toBe('loading');
    release({ posts: [post('a'), post('b')], next: null });
    await settle();
    expect(f.state()).toBeNull();
    expect(f.grid().querySelectorAll('[data-post]').map((c) => c.getAttribute('data-post'))).toEqual(['a', 'b']);
    expect(f.root.querySelector('[data-tab="top"]')!.getAttribute('aria-selected')).toBe('true');
  });

  test('an empty Top or New says so; an empty Mine offers Post my town', async () => {
    const api = fakeApi();
    const f = open(api);
    f.forum.open('new');
    await settle();
    expect(f.state()).toBe('empty');
    expect(f.grid().textContent).toContain('No towns yet. Post the first one.');
    f.root.querySelector('[data-tab="mine"]')!.click();
    await settle();
    expect(f.grid().textContent).toContain("You haven't posted a town yet.");
    expect(f.grid().querySelector('[data-forum="post-first"]')).not.toBeNull();
  });

  test('a server that cannot be reached: said here, with Try again, which tries again', async () => {
    const api = fakeApi();
    let fail = true;
    api.pages.top = async () => {
      if (fail) throw new ForumError(0, '');
      return { posts: [post('a')], next: null };
    };
    const f = open(api);
    f.forum.open();
    await settle();
    expect(f.state()).toBe('unreachable');
    expect(f.grid().textContent).toContain("Global Village can't be reached right now.");
    expect(f.said).toEqual([]);
    fail = false;
    f.grid().querySelector('[data-forum="retry"]')!.click();
    await settle();
    expect(f.state()).toBeNull();
    expect(f.grid().querySelectorAll('[data-post]')).toHaveLength(1);
  });

  test('the heart likes at once and takes it back if the server says no', async () => {
    const api = fakeApi({ like: vi.fn(async () => Promise.reject(new ForumError(429, 'Slow down a little. Try again in a few minutes.'))) });
    api.pages.top = async () => ({ posts: [post('a', { likes: 4 })], next: null });
    const f = open(api);
    f.forum.open();
    await settle();
    const heart = f.grid().querySelector('[data-forum="like"]')!;
    heart.click();
    expect(heart.getAttribute('aria-pressed')).toBe('true');
    expect(heart.textContent).toBe('5');
    await settle();
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    expect(heart.textContent).toBe('4');
    expect(f.said).toEqual(['Slow down a little. Try again in a few minutes.']);
  });

  test('Mine shows what is new on each post', async () => {
    const api = fakeApi();
    api.pages.mine = async () => ({ posts: [post('m', { mine: true, newLikes: 5, newComments: 2 })], next: null });
    const f = open(api);
    f.forum.open('mine');
    await settle();
    expect(f.grid().querySelector('[data-forum="news"]')!.textContent).toBe('+5 ♥ · 2 new comments');
  });

  test('while visiting someone\'s town, Post my town is greyed out and says Make a copy first', async () => {
    const f = open(fakeApi(), app({ town: () => ({ code: 'C', worth: true, from: null, visiting: true }) }));
    f.forum.open();
    await settle();
    const button = f.root.querySelector('[data-forum="post-mine"]')!;
    expect(button.disabled).toBe(true);
    expect(f.root.querySelector('.lc-forum-post-note')!.hasAttribute('hidden')).toBe(false);
  });

  test('Escape closes the innermost thing: the post, then the forum', async () => {
    const f = open(fakeApi());
    f.forum.open();
    await settle();
    f.forum.openPost('a');
    await settle();
    expect(f.root.querySelector('[data-forum="post"]')).not.toBeNull();
    expect(f.forum.back()).toBe(true);
    expect(f.root.querySelector('[data-forum="post"]')).toBeNull();
    expect(f.forum.isOpen).toBe(true);
    f.forum.back();
    expect(f.forum.isOpen).toBe(false);
    expect(f.forum.back()).toBe(false);
  });
});

describe('a post', () => {
  test('its comments, a new one added, Visit hands the town to the game with the way back', async () => {
    const visits: { id: string; code: string }[] = [];
    let backTo: (() => void) | null = null;
    const api = fakeApi({
      post: async (id) => ({ ...post(id, { parent: { id: 'old', name: 'tom' } }), code: 'TOWNCODE', thread: [{ id: 'c1', name: '小林', text: '好可爱!', created: Date.now() - 60_000, mine: false }], earlier: null }),
      me: () => ({ id: 'p', secret: 's', name: 'me' }),
    });
    const f = open(api, app({ visit: (p, then) => (visits.push(p), (backTo = then.back), null) }));
    f.forum.openPost('a');
    await settle();
    const view = f.root.querySelector('[data-forum="post"]')!;
    expect(view.querySelector('[data-forum="comments"]')!.textContent).toContain('好可爱!');
    expect(view.querySelector('[data-forum="parent"]')!.textContent).toBe("built on tom's town");
    // Named already: no name box.
    expect(view.querySelector('[data-forum="name"]')).toBeNull();
    const box = view.querySelector('[data-forum="comment-text"]')!;
    box.value = 'how did you do the bridge?';
    view.querySelector('[data-forum="send"]')!.click();
    await settle();
    expect(view.querySelectorAll('.lc-forum-comment')).toHaveLength(2);
    expect(box.value).toBe('');
    view.querySelector('[data-forum="visit"]')!.click();
    expect(visits).toEqual([{ id: 'a', name: 'mira', code: 'TOWNCODE' }]);
    expect(f.forum.isOpen).toBe(false);
    // Back to my town: the forum opens again on the post.
    backTo!();
    expect(f.forum.isOpen).toBe(true);
    expect(f.root.querySelector('[data-forum="post"]')!.getAttribute('data-post')).toBe('a');
  });

  test('a post that is gone says so', async () => {
    const f = open(fakeApi({ post: async () => Promise.reject(new ForumError(404, 'That town is gone.')) }));
    f.forum.openPost('x');
    await settle();
    expect(f.root.querySelector('[data-forum="gone"]')!.textContent).toBe('That town is gone.');
  });
});

describe('player text is only ever text', () => {
  test('names, captions and comments with HTML in them reach the page as the characters typed', async () => {
    htmlWrites.length = 0;
    const evil = post('e', { name: EVIL, caption: EVIL, parent: { id: 'p', name: EVIL } });
    const api = fakeApi({
      post: async () => ({ ...evil, code: 'C', thread: [{ id: 'c', name: EVIL, text: EVIL, created: Date.now(), mine: false }], earlier: null }),
    });
    api.pages.top = async () => ({ posts: [evil], next: null });
    const f = open(api);
    f.forum.open();
    await settle();
    f.forum.openPost('e');
    await settle();
    const page = f.root.textContent;
    // Shown as typed, several times over (card, post, comment)...
    expect(page.split(EVIL).length - 1).toBeGreaterThanOrEqual(5);
    // ...never parsed: no element came from it, and no innerHTML ever held it.
    expect(f.root.querySelectorAll('img').every((img) => /\/pics\/e\.jpg$/.test(img.getAttribute('src') ?? ''))).toBe(true);
    expect(f.root.querySelectorAll('[onerror]')).toHaveLength(0);
    expect(htmlWrites.some((h) => h.includes('onerror'))).toBe(false);
  });
});
