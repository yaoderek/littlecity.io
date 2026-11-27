// Global Village's calls to its server (docs/superpowers/specs/2026-11-27-town-forum-design.md, "The API"):
// plain HTTPS requests with JSON, each given up after 10 seconds, and who the player is. Owner: Interface.
//
// The identity is made the first time the player likes, posts, comments or makes a copy (POST /v1/players),
// kept in localStorage under lc:forum ({ id, secret, name, posted }), never inside a town, and sent as
// `Authorization: Bearer <secret>`. Storage that refuses keeps it for this page only.
//
// Every failure comes back as a ForumError: the server's own fixed English line (shown through say(), so a
// line in the language files reads in the player's language and any other as it came), or "can't be
// reached" for no answer, a timeout or something that is not the server's JSON.

import { say, t } from '@/i18n';
import { FORUM_KEY, FORUM_TIMEOUT_MS, readIdentity, type ForumIdentity, type ForumTab } from '@/ui/forum-button';

/** A post in a list. */
export interface Post {
  id: string;
  name: string;
  caption: string;
  /** When it was posted, ms since 1970. */
  created: number;
  likes: number;
  comments: number;
  copies: number;
  liked: boolean;
  mine: boolean;
  /** The post this town was copied from; `gone` when that post was deleted. */
  parent: { id: string; name: string; gone?: boolean } | null;
  /** The Mine tab only: new since the player last opened it. */
  newLikes?: number;
  newComments?: number;
}

export interface Comment {
  id: string;
  name: string;
  text: string;
  created: number;
  mine: boolean;
}

/** One post, opened: its town and its latest comments (up to 200), oldest first. */
export interface FullPost extends Post {
  code: string;
  thread: Comment[];
  /** The cursor for the comments before these; null when these are all. */
  earlier: string | null;
}

export interface Page {
  posts: Post[];
  /** The cursor for the next page; null at the end. */
  next: string | null;
}

export class ForumError extends Error {
  /** The HTTP status; 0 for no answer. */
  readonly status: number;
  /** The server's line as it came, or '' for no answer. */
  readonly line: string;
  constructor(status: number, line: string) {
    super(line || 'unreachable');
    this.status = status;
    this.line = line;
  }
  /** Nothing came back from the server (down, slow, blocked). */
  get unreachable(): boolean {
    return this.status === 0 || !this.line;
  }
  /** What the player reads. */
  get text(): string {
    return this.unreachable ? t("Global Village can't be reached right now.") : say(this.line);
  }
}

/**
 * The server's fixed lines the game knows (design, "What it checks on every post"), listed with t() so the
 * language files carry them; say() reads any of them in the player's language, and any other as it came.
 */
export function serverLines(): string[] {
  // server/errors.ts, character for character.
  return [
    t("That request wasn't understood."),
    t('Not found.'),
    t('That town is gone.'),
    t('That comment is gone.'),
    t("This browser's Global Village identity wasn't recognised."),
    t("That isn't yours."),
    t("You can't post, comment or like in Global Village."),
    t('Slow down a little. Try again in a few minutes.'),
    t('That is too big to send.'),
    t('This town is too big to post.'),
    t("This town can't be opened by Little City."),
    t('Build something first.'),
    t('The picture must be a JPEG of at most 640 × 400 and 300 KB.'),
    t('A caption is at most 140 characters.'),
    t('Pick a name first.'),
    t('A name is 1 to 20 characters.'),
    t('A comment is 1 to 280 characters.'),
    t('Something went wrong on the server. Try again later.'),
  ];
}

/** The server no longer knows this browser's identity (its data was reset): a new one is made and the call tried once more. */
export const WHO_ARE_YOU = "This browser's Global Village identity wasn't recognised.";

/** Text counted as a reader sees it (code points): Chinese and emoji count one each. */
export function codePoints(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
/** The first `max` code points of `s`. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = '';
  let n = 0;
  for (const ch of s) {
    if (n++ >= max) break;
    out += ch;
  }
  return out;
}

/** The limits the server keeps (design, "What it checks on every post"). */
export const LIMITS = { caption: 140, name: 20, comment: 280, code: 200_000 } as const;

export interface ForumApiOptions {
  base: string;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ForumApi {
  /** The identity there is, if any (nothing is made). */
  me(): ForumIdentity | null;
  /** The identity, made now if there is none (once, however many ask at the same time). */
  identity(): Promise<ForumIdentity>;
  /** Sets the player's name (making the identity first if need be). */
  setName(name: string): Promise<void>;
  posts(tab: ForumTab, after?: string | null): Promise<Page>;
  post(id: string): Promise<FullPost>;
  /** The comments before `before` (a post's `earlier` cursor), oldest first, and the cursor for the ones before those. */
  earlierComments(id: string, before: string): Promise<{ thread: Comment[]; earlier: string | null }>;
  publish(p: { code: string; caption: string; picture: string; parent?: string | null }): Promise<string>;
  remove(id: string): Promise<void>;
  like(id: string, on: boolean): Promise<void>;
  copied(id: string): Promise<void>;
  comment(id: string, text: string): Promise<Comment>;
  removeComment(id: string): Promise<void>;
  /** New likes and comments on the player's posts since they last opened the forum. */
  news(): Promise<{ likes: number; comments: number }>;
  seen(what: 'forum' | 'mine'): Promise<void>;
  /** The picture of a post. */
  picture(id: string): string;
  /** The link to a post that travels outside the game. */
  link(id: string): string;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
/** A time as the server writes it: ms since 1970 (an ISO date is read too). */
export function toTime(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) return toTime(n);
    const d = Date.parse(v);
    if (Number.isFinite(d)) return d;
  }
  return Date.now();
}

export function readPost(raw: unknown): Post {
  const p = (raw ?? {}) as Record<string, unknown>;
  const parentRaw = p.parent as Record<string, unknown> | null | undefined;
  const parent =
    parentRaw && typeof parentRaw === 'object' && parentRaw.id !== undefined && parentRaw.id !== null
      ? { id: str(parentRaw.id), name: str(parentRaw.name), ...(parentRaw.gone === true || parentRaw.name === null || parentRaw.name === undefined ? { gone: true } : {}) }
      : null;
  return {
    id: str(p.id),
    name: str(p.name),
    caption: str(p.caption),
    created: toTime(p.created),
    likes: num(p.likes),
    comments: num(p.comments),
    copies: num(p.copies),
    liked: p.liked === true,
    mine: p.mine === true,
    parent,
    ...(p.newLikes !== undefined ? { newLikes: num(p.newLikes) } : {}),
    ...(p.newComments !== undefined ? { newComments: num(p.newComments) } : {}),
  };
}

function readComment(raw: unknown): Comment {
  const c = (raw ?? {}) as Record<string, unknown>;
  return { id: str(c.id), name: str(c.name), text: str(c.text), created: toTime(c.created), mine: c.mine === true };
}

export function createForumApi(opts: ForumApiOptions): ForumApi {
  const base = opts.base.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? FORUM_TIMEOUT_MS;
  /** The identity for this page: what storage holds, or what it would not take. */
  let held: ForumIdentity | null = readIdentity(opts.storage);
  let making: Promise<ForumIdentity> | null = null;

  const keep = (who: ForumIdentity): void => {
    held = who;
    try {
      opts.storage?.setItem(FORUM_KEY, JSON.stringify(who));
    } catch {
      // Storage refused: the player is this person until the page closes.
    }
  };
  const current = (): ForumIdentity | null => readIdentity(opts.storage) ?? held;
  /** Forgets an identity the server does not know any more. */
  const forget = (): void => {
    held = null;
    try {
      opts.storage?.setItem(FORUM_KEY, 'null');
    } catch {
      // nothing kept to forget
    }
  };
  const unknown = (e: unknown): boolean => e instanceof ForumError && e.line === WHO_ARE_YOU;

  async function call<T>(method: string, path: string, body?: unknown, secret?: string): Promise<T> {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeoutMs);
    let res: Response;
    try {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (secret) headers.Authorization = `Bearer ${secret}`;
      res = await doFetch(`${base}${path}`, { method, headers, signal: stop.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      clearTimeout(timer);
      throw new ForumError(0, '');
    }
    try {
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const line = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : '';
        throw new ForumError(line ? res.status : 0, line);
      }
      return data as T;
    } catch (e) {
      if (e instanceof ForumError) throw e;
      throw new ForumError(0, '');
    } finally {
      clearTimeout(timer);
    }
  }

  const identity = (): Promise<ForumIdentity> => {
    const have = current();
    if (have) return Promise.resolve(have);
    making ??= call<{ id?: unknown; secret?: unknown }>('POST', '/v1/players')
      .then((r) => {
        const id = str(r?.id), secret = str(r?.secret);
        if (!id || !secret) throw new ForumError(0, '');
        const who: ForumIdentity = { id, secret };
        keep(who);
        return who;
      })
      .finally(() => {
        making = null;
      });
    return making;
  };
  const authed = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    try {
      return await call<T>(method, path, body, (await identity()).secret);
    } catch (e) {
      if (!unknown(e)) throw e;
      // The server lost who this is (its data was reset): a new identity, the name carried over, one more try.
      const name = current()?.name;
      forget();
      const who = await identity();
      if (name) {
        await call('PUT', '/v1/me', { name }, who.secret);
        keep({ ...who, name });
      }
      return call<T>(method, path, body, who.secret);
    }
  };
  /** Reads that work without an identity, but say who is asking when there is one (liked, mine). */
  const read = async <T>(path: string): Promise<T> => {
    try {
      return await call<T>('GET', path, undefined, current()?.secret);
    } catch (e) {
      if (!unknown(e)) throw e;
      forget();
      return call<T>('GET', path, undefined);
    }
  };
  const enc = encodeURIComponent;

  return {
    me: current,
    identity,
    async setName(name) {
      const clean = clip(name.trim(), LIMITS.name);
      const who = await identity();
      if (who.name === clean) return;
      await call('PUT', '/v1/me', { name: clean }, who.secret);
      keep({ ...(current() ?? who), name: clean });
    },
    async posts(tab, after) {
      const data = await read<{ posts?: unknown[]; next?: unknown }>(`/v1/posts?tab=${tab}${after ? `&after=${enc(after)}` : ''}`);
      const list = Array.isArray(data?.posts) ? data.posts : [];
      const next = data?.next ?? null;
      return { posts: list.map(readPost), next: next === null || next === undefined || next === '' ? null : str(next) };
    },
    async post(id) {
      const data = await read<Record<string, unknown>>(`/v1/posts/${enc(id)}`);
      const list = Array.isArray(data?.commentList) ? (data.commentList as unknown[]) : [];
      const thread = list.map(readComment).sort((a, b) => a.created - b.created);
      const earlier = data?.earlierComments;
      return { ...readPost(data), code: str(data?.code), thread, earlier: earlier ? str(earlier) : null };
    },
    async earlierComments(id, before) {
      const data = await read<{ commentList?: unknown[]; earlierComments?: unknown }>(`/v1/posts/${enc(id)}/comments?before=${enc(before)}`);
      const thread = (Array.isArray(data?.commentList) ? data.commentList : []).map(readComment).sort((a, b) => a.created - b.created);
      return { thread, earlier: data?.earlierComments ? str(data.earlierComments) : null };
    },
    async publish(p) {
      const picture = p.picture.replace(/^data:image\/jpeg;base64,/, '');
      const data = await authed<{ id?: unknown }>('POST', '/v1/posts', { code: p.code, caption: p.caption, picture, ...(p.parent ? { parent: p.parent } : {}) });
      const who = current();
      if (who && !who.posted) keep({ ...who, posted: true });
      return str(data?.id);
    },
    remove: (id) => authed('DELETE', `/v1/posts/${enc(id)}`),
    like: (id, on) => authed(on ? 'PUT' : 'DELETE', `/v1/posts/${enc(id)}/like`),
    copied: (id) => authed('POST', `/v1/posts/${enc(id)}/copied`),
    async comment(id, text) {
      const c = readComment(await authed<Record<string, unknown>>('POST', `/v1/posts/${enc(id)}/comments`, { text }));
      return { ...c, mine: true, name: c.name || current()?.name || '', text: c.text || text };
    },
    removeComment: (id) => authed('DELETE', `/v1/comments/${enc(id)}`),
    async news() {
      const who = current();
      if (!who) return { likes: 0, comments: 0 };
      const data = await call<{ likes?: unknown; comments?: unknown }>('GET', '/v1/me/news', undefined, who.secret);
      return { likes: num(data?.likes), comments: num(data?.comments) };
    },
    async seen(what) {
      const who = current();
      if (who) await call('POST', '/v1/me/seen', { what }, who.secret);
    },
    picture: (id) => `${base}/pics/${enc(id)}.jpg`,
    link: (id) => `${base}/p/${enc(id)}`,
  };
}
