// Global Village's server: the API, the pictures, the link to a post and Derek's admin page.
// Owner: Forum. Design: docs/superpowers/specs/2026-11-27-town-forum-design.md.
//
// One Node program, no dependencies beyond Node: node:http in front of node:sqlite (store.ts). Caddy
// stands before it for HTTPS only. createForum() makes the request handler (tests start it on a
// random port, main.ts on 8787). Every answer to a refused request is a status and a fixed line
// (errors.ts); nothing a player sends is ever put on a page unescaped, and no error's details
// (a stack, a SQL message) ever leave the server.
//
// Feed pages for everyone are cached for up to 15 s; a player who has just written something (a
// post, a like, a comment, a delete) skips the cache for those 15 s, so they see it at once.

import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { codecFingerprint } from '@/world/codec-fingerprint';
import { Admin } from './admin';
import { Refusal, refuse } from './errors';
import { PAGE_HEADERS } from './html';
import { clientAddress, CORS, readJson, sendError, sendJson } from './http';
import { jpegSize } from './jpeg';
import { LIMITS, Limiter } from './limits';
import { sharePage } from './share';
import { COMMENT_ID, decodeCursor, encodeCursor, POST_ID, Store, type CommentRow, type FeedCursor, type PlayerRow, type PostRow } from './store';
import { cleanText, codePoints } from './text';
import { townProblem } from './town';

export interface ForumOptions {
  /** The data folder (forum.db and pics/). */
  dataDir: string;
  /** This server's public address, no trailing slash (the share page's picture URLs). */
  publicUrl: string;
  /** The game's address, no trailing slash (the share page sends people there). */
  gameUrl: string;
  /** Derek's admin password; empty or absent turns the admin page off. */
  adminPassword?: string;
  /** The clock, ms (tests move it). */
  now?: () => number;
  /** Where unexpected errors are written (stderr by default; journald keeps them). */
  log?: (msg: string) => void;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** Top: the posts of this long ago and since come first. */
export const TOP_RECENT_MS = 7 * DAY;

type Tab = 'top' | 'new' | 'mine';
interface Page {
  rows: PostRow[];
  next: string | null;
}

export interface Forum {
  handle(req: IncomingMessage, res: ServerResponse): void;
  readonly store: Store;
  close(): void;
}

export function createForum(opts: ForumOptions): Forum {
  const store = new Store(opts.dataDir);
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  const likes = new Limiter(LIMITS.likesPerHour, HOUR);
  const identities = new Limiter(LIMITS.identitiesPerDay, DAY);
  const cache = new Map<string, { at: number; page: Page }>();
  /** Players who wrote something lately, and when: they read the feeds fresh. */
  const wrote = new Map<string, number>();
  const admin = new Admin(store, { password: opts.adminPassword ?? '', secureCookie: opts.publicUrl.startsWith('https:'), now, forget: () => cache.clear() });
  const codec = codecFingerprint();
  let lastSweep = now();

  const sweep = (t: number): void => {
    if (t - lastSweep < 10 * 60 * 1000) return;
    lastSweep = t;
    likes.sweep(t);
    identities.sweep(t);
    admin.sweep(t);
    for (const [id, at] of wrote) if (t - at > LIMITS.feedCacheMs) wrote.delete(id);
    for (const [k, v] of cache) if (t - v.at > LIMITS.feedCacheMs) cache.delete(k);
  };

  // ── who is asking ──

  /** The player the request proves to be, null if it sends no secret; an unknown secret is refused. */
  const viewer = (req: IncomingMessage): PlayerRow | null => {
    const auth = req.headers.authorization;
    if (auth === undefined) return null;
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(auth);
    if (!m) return refuse(401, 'whoAreYou');
    return store.playerBySecret(m[1]!) ?? refuse(401, 'whoAreYou');
  };
  const player = (req: IncomingMessage): PlayerRow => viewer(req) ?? refuse(401, 'whoAreYou');
  const unblocked = (req: IncomingMessage): PlayerRow => {
    const p = player(req);
    if (p.blocked) refuse(403, 'blocked');
    return p;
  };
  /** A post anyone may see (not by a blocked player, unless it is the viewer's own). */
  const shownPost = (id: string, me: PlayerRow | null): PostRow => {
    const p = POST_ID.test(id) ? store.post(id) : undefined;
    if (!p || (p.blocked && p.player !== me?.id)) return refuse(404, 'postGone');
    return p;
  };

  // ── what goes out ──

  const postOut = (r: PostRow, me: PlayerRow | null, liked: Set<string>, news?: Map<string, { likes: number; comments: number }>) => ({
    id: r.id,
    name: r.name ?? '',
    caption: r.caption,
    created: r.created,
    likes: r.likes,
    comments: r.comments,
    copies: r.copies,
    liked: liked.has(r.id),
    mine: !!me && r.player === me.id,
    parent: r.parent ? { id: r.parent, name: r.parent_shown ? (r.parent_name ?? '') : null } : null,
    ...(news ? { newLikes: news.get(r.id)?.likes ?? 0, newComments: news.get(r.id)?.comments ?? 0 } : {}),
  });
  const commentOut = (c: CommentRow, me: PlayerRow | null) => ({ id: c.id, name: c.name ?? '', text: c.text, created: c.created, mine: !!me && c.player === me.id });
  const commentCursor = (c: CommentRow): string => Buffer.from(`${c.created}.${c.id}`).toString('base64url');
  const readCommentCursor = (s: string): { created: number; id: string } | null => {
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(s)) return null;
    const m = /^(0|[1-9][0-9]{0,15})\.([0-9a-z]{12})$/.exec(Buffer.from(s, 'base64url').toString('utf8'));
    return m ? { created: Number(m[1]), id: m[2]! } : null;
  };
  /** The newest `LIMITS.comments` comments before a place, oldest first, and where the earlier ones start. */
  const commentPage = (post: string, me: PlayerRow | null, before: { created: number; id: string } | null) => {
    const rows = store.comments(post, me?.id ?? null, before, LIMITS.comments + 1);
    const more = rows.length > LIMITS.comments;
    const shown = more ? rows.slice(1) : rows;
    return { commentList: shown.map((c) => commentOut(c, me)), earlierComments: more ? commentCursor(shown[0]!) : null };
  };

  const feedPage = (tab: Tab, after: FeedCursor | null, me: PlayerRow | null, t: number): Page => {
    const rows = store.feed(tab, after, { since: t - TOP_RECENT_MS, me: me?.id, limit: LIMITS.page + 1 });
    const more = rows.length > LIMITS.page;
    const shown = more ? rows.slice(0, LIMITS.page) : rows;
    const last = shown[shown.length - 1];
    let next: FeedCursor | null = null;
    if (more && last) {
      if (tab === 'top') {
        const since = after?.tab === 'top' ? after.since : t - TOP_RECENT_MS;
        next = { tab, since, recent: last.created >= since ? 1 : 0, likes: last.likes, created: last.created, id: last.id };
      } else next = { tab, created: last.created, id: last.id };
    }
    return { rows: shown, next: next && encodeCursor(next) };
  };

  // ── the calls ──

  const wroteNow = (p: PlayerRow, t: number): void => void wrote.set(p.id, t);

  async function api(req: IncomingMessage, res: ServerResponse, method: string, path: string, query: URLSearchParams): Promise<void> {
    const t = now();
    sweep(t);
    let m: RegExpExecArray | null;

    if (path === '/v1/players' && method === 'POST') {
      await readJson(req, LIMITS.smallBody, []);
      if (!identities.take(clientAddress(req), t)) refuse(429, 'slowDown');
      return sendJson(res, 201, store.addPlayer(t));
    }

    if (path === '/v1/me' && method === 'PUT') {
      const me = player(req);
      const body = await readJson(req, LIMITS.smallBody, ['name']);
      if (typeof body.name !== 'string') refuse(400, 'badRequest');
      const name = cleanText(body.name as string);
      const n = codePoints(name);
      if (n < LIMITS.nameMin || n > LIMITS.nameMax) refuse(400, 'badName');
      store.setName(me.id, name);
      wroteNow(me, t);
      return sendJson(res, 200, { name });
    }

    if (path === '/v1/me/news' && method === 'GET') {
      const me = player(req);
      return sendJson(res, 200, store.news(me.id, me.seen_forum));
    }

    if (path === '/v1/me/seen' && method === 'POST') {
      const me = player(req);
      const body = await readJson(req, LIMITS.smallBody, ['what']);
      if (body.what !== 'forum' && body.what !== 'mine') refuse(400, 'badRequest');
      store.setSeen(me.id, body.what as 'forum' | 'mine', t);
      return sendJson(res, 200, { ok: true });
    }

    if (path === '/v1/posts' && method === 'GET') {
      for (const k of query.keys()) if (k !== 'tab' && k !== 'after') refuse(400, 'badRequest');
      const tab = query.get('tab') ?? 'top';
      if (tab !== 'top' && tab !== 'new' && tab !== 'mine') refuse(400, 'badRequest');
      const me = tab === 'mine' ? player(req) : viewer(req);
      const afterText = query.get('after');
      const after = afterText === null || afterText === '' ? null : decodeCursor(afterText, tab as Tab);
      if (afterText && !after) refuse(400, 'badRequest');
      let page: Page;
      if (tab === 'mine') page = feedPage('mine', after, me, t);
      else {
        const key = `${tab}|${afterText ?? ''}`;
        const hit = cache.get(key);
        const fresh = me && t - (wrote.get(me.id) ?? -Infinity) < LIMITS.feedCacheMs;
        if (hit && !fresh && t - hit.at < LIMITS.feedCacheMs) page = hit.page;
        else {
          page = feedPage(tab as Tab, after, me, t);
          if (cache.size > 2000) cache.clear();
          cache.set(key, { at: t, page });
        }
      }
      const ids = page.rows.map((r) => r.id);
      const liked = me ? store.likedOf(me.id, ids) : new Set<string>();
      const news = tab === 'mine' ? store.newsByPost(ids, me!.id, me!.seen_mine) : undefined;
      return sendJson(res, 200, { posts: page.rows.map((r) => postOut(r, me, liked, news)), next: page.next });
    }

    if (path === '/v1/posts' && method === 'POST') {
      const me = unblocked(req);
      if (!me.name) refuse(400, 'nameNeeded');
      const body = await readJson(req, LIMITS.postBody, ['code', 'caption', 'picture', 'parent'], 'townTooBig');
      const { code, caption, picture, parent } = body;
      if (typeof code !== 'string' || typeof picture !== 'string' || (caption !== undefined && typeof caption !== 'string')) refuse(400, 'badRequest');
      if (parent !== undefined && parent !== null && (typeof parent !== 'string' || !POST_ID.test(parent))) refuse(400, 'badRequest');
      const problem = townProblem((code as string).trim());
      if (problem) refuse(problem === 'townTooBig' ? 413 : 422, problem);
      const text = cleanText((caption as string | undefined) ?? '');
      if (codePoints(text) > LIMITS.caption) refuse(400, 'captionTooLong');
      const jpeg = readPicture(picture as string);
      const id = store.addPost({ player: me.id, caption: text, code: (code as string).trim(), parent: (parent as string | null | undefined) ?? null, picture: jpeg }, t);
      wroteNow(me, t);
      return sendJson(res, 201, postOut(store.post(id)!, me, new Set()));
    }

    if ((m = /^\/v1\/posts\/([^/]+)$/.exec(path))) {
      if (method === 'GET') {
        for (const _ of query.keys()) refuse(400, 'badRequest');
        const me = viewer(req);
        const post = shownPost(m[1]!, me);
        const liked = me ? store.likedOf(me.id, [post.id]) : new Set<string>();
        return sendJson(res, 200, { ...postOut(post, me, liked), code: store.code(post.id)!, ...commentPage(post.id, me, null) });
      }
      if (method === 'DELETE') {
        const me = player(req);
        const post = shownPost(m[1]!, me);
        if (post.player !== me.id) refuse(403, 'notYours');
        store.deletePost(post.id);
        wroteNow(me, t);
        return sendJson(res, 200, { ok: true });
      }
    }

    if ((m = /^\/v1\/posts\/([^/]+)\/comments$/.exec(path))) {
      if (method === 'GET') {
        for (const k of query.keys()) if (k !== 'before') refuse(400, 'badRequest');
        const me = viewer(req);
        const post = shownPost(m[1]!, me);
        const beforeText = query.get('before');
        const before = beforeText ? readCommentCursor(beforeText) : null;
        if (beforeText && !before) refuse(400, 'badRequest');
        return sendJson(res, 200, commentPage(post.id, me, before));
      }
      if (method === 'POST') {
        const me = unblocked(req);
        if (!me.name) refuse(400, 'nameNeeded');
        const post = shownPost(m[1]!, me);
        const body = await readJson(req, LIMITS.smallBody, ['text']);
        if (typeof body.text !== 'string') refuse(400, 'badRequest');
        const text = cleanText(body.text as string);
        const n = codePoints(text);
        if (n < LIMITS.commentMin || n > LIMITS.commentMax) refuse(400, 'badComment');
        if (store.commentsSince(me.id, t - HOUR) >= LIMITS.commentsPerHour) refuse(429, 'slowDown');
        const id = store.addComment(post.id, me.id, text, t);
        wroteNow(me, t);
        return sendJson(res, 201, commentOut(store.comment(id)!, me));
      }
    }

    if ((m = /^\/v1\/posts\/([^/]+)\/like$/.exec(path)) && (method === 'PUT' || method === 'DELETE')) {
      const me = unblocked(req);
      const post = shownPost(m[1]!, me);
      await readJson(req, LIMITS.smallBody, []);
      if (!likes.take(me.id, t)) refuse(429, 'slowDown');
      const on = method === 'PUT';
      const count = store.like(post.id, me.id, on, t);
      wroteNow(me, t);
      return sendJson(res, 200, { likes: count, liked: on });
    }

    if ((m = /^\/v1\/posts\/([^/]+)\/copied$/.exec(path)) && method === 'POST') {
      const me = player(req);
      const post = shownPost(m[1]!, me);
      await readJson(req, LIMITS.smallBody, []);
      // A blocked player's copy is theirs to make; it just isn't counted.
      const copies = me.blocked ? post.copies : store.copied(post.id, me.id, t);
      wroteNow(me, t);
      return sendJson(res, 200, { copies });
    }

    if ((m = /^\/v1\/comments\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      const me = player(req);
      const c = COMMENT_ID.test(m[1]!) ? store.comment(m[1]!) : undefined;
      if (!c) refuse(404, 'commentGone');
      if (c!.player !== me.id) refuse(403, 'notYours');
      store.deleteComment(c!.id);
      wroteNow(me, t);
      return sendJson(res, 200, { ok: true });
    }

    if (/^\/v1\/(players|me|me\/news|me\/seen|posts(\/[^/]+(\/(like|copied|comments))?)?|comments\/[^/]+)$/.test(path)) refuse(405, 'badRequest');
    refuse(404, 'notFound');
  }

  function readPicture(s: string): Uint8Array {
    const b64 = s.startsWith('data:image/jpeg;base64,') ? s.slice(23) : s;
    if (b64.length > Math.ceil((LIMITS.pictureBytes * 4) / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) refuse(400, 'badPicture');
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > LIMITS.pictureBytes) refuse(400, 'badPicture');
    const size = jpegSize(bytes);
    if (!size || size.width > LIMITS.pictureWidth || size.height > LIMITS.pictureHeight) refuse(400, 'badPicture');
    return bytes;
  }

  async function picture(res: ServerResponse, id: string): Promise<void> {
    const post = POST_ID.test(id) ? store.post(id) : undefined;
    if (!post || post.blocked) return notFoundText(res);
    let bytes: Buffer;
    try {
      bytes = await readFile(store.picPath(id));
    } catch {
      return notFoundText(res);
    }
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'image/jpeg',
      'Content-Length': bytes.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(bytes);
  }

  function notFoundText(res: ServerResponse): void {
    res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end('Not found.');
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://forum.invalid');
    const path = url.pathname;
    const read = method === 'GET' || method === 'HEAD';
    let m: RegExpExecArray | null;

    if (path === '/admin' || path.startsWith('/admin/')) return admin.handle(req, res, method, path, clientAddress(req));

    if (method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return void res.end();
    }

    if (path === '/health' && read) {
      store.db.prepare('SELECT 1').get();
      return sendJson(res, 200, { ok: true, codec });
    }

    if (path.startsWith('/v1/')) return api(req, res, method === 'HEAD' ? 'GET' : method, path, url.searchParams);

    if ((m = /^\/pics\/([^/]+)\.jpg$/.exec(path)) && read) return picture(res, m[1]!);

    if ((m = /^\/p\/([^/]+)$/.exec(path)) && read) {
      const id = m[1]!;
      const post = POST_ID.test(id) ? store.post(id) : undefined;
      const shown = post && !post.blocked ? post : undefined;
      const html = sharePage({ publicUrl: opts.publicUrl, gameUrl: opts.gameUrl }, POST_ID.test(id) ? id : '', shown);
      res.writeHead(shown ? 200 : 404, { ...PAGE_HEADERS, 'Cache-Control': shown ? 'public, max-age=300' : 'no-store', 'Content-Length': Buffer.byteLength(html) });
      return void res.end(html);
    }

    if (path === '/' && read) {
      res.writeHead(302, { Location: `${opts.gameUrl}/`, 'Cache-Control': 'no-store' });
      return void res.end();
    }

    notFoundText(res);
  }

  return {
    store,
    handle(req, res) {
      route(req, res).catch((e: unknown) => {
        if (e instanceof Refusal) {
          // A body too big is refused without reading the rest: close the connection after the answer.
          if (e.status === 413) res.setHeader('Connection', 'close');
          if (!res.headersSent) sendError(res, e.status, e.key);
          return;
        }
        log(`forum: ${req.method} ${(req.url ?? '').slice(0, 200)}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
        if (!res.headersSent) sendError(res, 500, 'broken');
        else res.destroy();
      });
    },
    close() {
      store.close();
    },
  };
}

export interface RunningForum {
  url: string;
  port: number;
  forum: Forum;
  server: Server;
  close(): Promise<void>;
}

/** Starts the forum on a port (0: any free one) and host. */
export function startForum(opts: ForumOptions & { port: number; host?: string }): Promise<RunningForum> {
  const forum = createForum(opts);
  const server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, (req, res) => forum.handle(req, res));
  server.keepAliveTimeout = 5_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host ?? '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://${opts.host && opts.host !== '0.0.0.0' ? opts.host : '127.0.0.1'}:${port}`,
        port,
        forum,
        server,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              forum.close();
              done();
            });
            server.closeAllConnections();
          }),
      });
    });
  });
}
