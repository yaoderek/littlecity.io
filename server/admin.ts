// Derek's admin page, /admin (Global Village design, "Derek's admin page"). Owner: Forum.
//
// Behind one password (ADMIN_PASSWORD on the server; empty turns the page off). Signing in sets a
// session cookie (HttpOnly, SameSite=Strict, Secure over HTTPS, 12 hours); every action is a form
// POST carrying the session's own token as well. The password is compared in constant time, and
// sign-in tries are limited per address. English only, plain HTML, no script; every player's text
// is escaped (html.ts).
//
// The page: totals (players, posts, comments, likes: today and ever), the newest posts and the
// newest comments, each with Delete and Block this player, and the blocked players with Unblock.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Refusal } from './errors';
import { esc, PAGE_HEADERS } from './html';
import { readBody } from './http';
import { Limiter } from './limits';
import { COMMENT_ID, PLAYER_ID, POST_ID, type Store } from './store';

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'lc_admin';

interface Session {
  expires: number;
  csrf: string;
}

const sha = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest();

export class Admin {
  private sessions = new Map<string, Session>();
  private tries = new Limiter(10, 15 * 60 * 1000);

  constructor(
    private readonly store: Store,
    private readonly opts: { password: string; secureCookie: boolean; now: () => number; forget: () => void },
  ) {}

  sweep(t: number): void {
    for (const [k, s] of this.sessions) if (s.expires < t) this.sessions.delete(k);
    this.tries.sweep(t);
  }

  private passwordOk(given: string): boolean {
    return timingSafeEqual(sha(given), sha(this.opts.password)) && this.opts.password.length > 0;
  }

  private session(req: IncomingMessage): Session | null {
    const cookies = req.headers.cookie ?? '';
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`).exec(cookies);
    if (!m) return null;
    const s = this.sessions.get(m[1]!);
    if (!s || s.expires < this.opts.now()) return null;
    return s;
  }

  async handle(req: IncomingMessage, res: ServerResponse, method: string, path: string, address: string): Promise<void> {
    if (!this.opts.password) return page(res, 404, 'Not set up', '<p>The admin page is off: ADMIN_PASSWORD is not set on the server.</p>');
    const s = this.session(req);

    if (path === '/admin/login' && method === 'POST') {
      const form = await readForm(req);
      if (!this.tries.take(address, this.opts.now())) return loginPage(res, 429, 'Too many tries. Wait a quarter of an hour.');
      if (!this.passwordOk(form.get('password') ?? '')) return loginPage(res, 403, 'That is not the password.');
      const token = randomBytes(32).toString('base64url');
      this.sessions.set(token, { expires: this.opts.now() + SESSION_MS, csrf: randomBytes(24).toString('base64url') });
      const cookie = `${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${this.opts.secureCookie ? '; Secure' : ''}`;
      res.writeHead(303, { Location: '/admin', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' });
      return void res.end();
    }

    if (!s) {
      if (method === 'GET' || method === 'HEAD') return loginPage(res, path === '/admin' ? 200 : 403, '');
      await readBody(req, 4096).catch(() => undefined);
      return loginPage(res, 403, 'Sign in first.');
    }

    let m: RegExpExecArray | null;
    if ((m = /^\/admin\/pics\/([0-9a-z]{10})\.jpg$/.exec(path)) && (method === 'GET' || method === 'HEAD')) {
      try {
        const bytes = await readFile(this.store.picPath(m[1]!));
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return void res.end(bytes);
      } catch {
        return page(res, 404, 'Not found', '<p>Not found.</p>');
      }
    }

    if (path === '/admin' && (method === 'GET' || method === 'HEAD')) return this.dashboard(res, s);

    if (method === 'POST') {
      const form = await readForm(req);
      const csrf = form.get('csrf') ?? '';
      if (csrf.length !== s.csrf.length || !timingSafeEqual(Buffer.from(csrf), Buffer.from(s.csrf))) return page(res, 403, 'Refused', '<p>That form is out of date. <a href="/admin">Back</a></p>');
      const id = form.get('id') ?? '';
      let done: boolean;
      if (path === '/admin/logout') {
        for (const [k, v] of this.sessions) if (v === s) this.sessions.delete(k);
        res.writeHead(303, { Location: '/admin', 'Set-Cookie': `${COOKIE}=; Path=/admin; Max-Age=0`, 'Cache-Control': 'no-store' });
        return void res.end();
      }
      if (path === '/admin/delete-post' && POST_ID.test(id)) done = this.store.deletePost(id);
      else if (path === '/admin/delete-comment' && COMMENT_ID.test(id)) done = this.store.deleteComment(id);
      else if (path === '/admin/block' && PLAYER_ID.test(id)) done = this.store.setBlocked(id, true);
      else if (path === '/admin/unblock' && PLAYER_ID.test(id)) done = this.store.setBlocked(id, false);
      else return page(res, 404, 'Not found', '<p>No such action. <a href="/admin">Back</a></p>');
      if (done) this.opts.forget();
      res.writeHead(303, { Location: '/admin', 'Cache-Control': 'no-store' });
      return void res.end();
    }

    return page(res, 404, 'Not found', '<p>Not found. <a href="/admin">Back</a></p>');
  }

  private dashboard(res: ServerResponse, s: Session): void {
    const t = this.opts.now();
    const midnight = t - (t % (24 * 60 * 60 * 1000));
    const totals = this.store.totals(midnight);
    const button = (action: string, id: string, label: string) =>
      `<form method="post" action="/admin/${action}"><input type="hidden" name="csrf" value="${esc(s.csrf)}"><input type="hidden" name="id" value="${esc(id)}"><button>${esc(label)}</button></form>`;
    const when = (ms: number) => esc(new Date(ms).toISOString().slice(0, 16).replace('T', ' '));
    const who = (name: string | null, id: string, blocked: number) => `${esc(name ?? '(no name)')} <small>${esc(id)}</small>${blocked ? ' <b>blocked</b>' : ''}`;

    const posts = this.store.newestPosts(60).map((p) => `<tr>
<td><a href="/p/${esc(p.id)}"><img src="/admin/pics/${esc(p.id)}.jpg" alt="" width="160" height="100" loading="lazy"></a></td>
<td class="text">${esc(p.caption)}</td><td>${who(p.name, p.player, p.player_blocked)}</td><td>${when(p.created)}</td>
<td>♥ ${esc(p.likes)} · ${esc(p.comments)} comments · ${esc(p.copies)} copies</td>
<td>${button('delete-post', p.id, 'Delete')}${p.player_blocked ? '' : button('block', p.player, 'Block this player')}</td></tr>`);
    const comments = this.store.newestComments(100).map((c) => `<tr>
<td class="text">${esc(c.text)}</td><td>${who(c.name, c.player, c.blocked)}</td><td><a href="/p/${esc(c.post)}">${esc(c.post)}</a></td><td>${when(c.created)}</td>
<td>${button('delete-comment', c.id, 'Delete')}${c.blocked ? '' : button('block', c.player, 'Block this player')}</td></tr>`);
    const blocked = this.store.blockedPlayers().map((p) => `<tr>
<td>${who(p.name, p.id, 0)}</td><td>${esc(p.posts)} posts, ${esc(p.comments)} comments</td><td>${button('unblock', p.id, 'Unblock')}</td></tr>`);
    const total = (label: string, k: keyof typeof totals) => `<tr><th>${label}</th><td>${esc(totals[k].today)}</td><td>${esc(totals[k].ever)}</td></tr>`;

    page(res, 200, 'Global Village admin', `
<header><h1>Global Village admin</h1>${button('logout', '', 'Sign out')}</header>
<h2>Totals</h2>
<table class="totals"><tr><th></th><th>Today (UTC)</th><th>Ever</th></tr>
${total('Players', 'players')}${total('Posts', 'posts')}${total('Comments', 'comments')}${total('Likes', 'likes')}</table>
<h2>Newest posts</h2>
<table>${posts.join('') || '<tr><td>None yet.</td></tr>'}</table>
<h2>Newest comments</h2>
<table>${comments.join('') || '<tr><td>None yet.</td></tr>'}</table>
<h2>Blocked players</h2>
<p>A blocked player can still read, but not post, comment or like; their posts and comments are hidden from everyone else.</p>
<table>${blocked.join('') || '<tr><td>Nobody.</td></tr>'}</table>`);
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  try {
    return new URLSearchParams((await readBody(req, 4096)).toString('utf8'));
  } catch (e) {
    if (e instanceof Refusal) return new URLSearchParams();
    throw e;
  }
}

function loginPage(res: ServerResponse, status: number, message: string): void {
  page(res, status, 'Sign in', `<h1>Global Village admin</h1>
${message ? `<p class="msg">${esc(message)}</p>` : ''}
<form method="post" action="/admin/login"><label>Password <input type="password" name="password" autocomplete="current-password" autofocus></label> <button>Sign in</button></form>`);
}

function page(res: ServerResponse, status: number, title: string, body: string): void {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:1.5em;color:#222}
header{display:flex;gap:1em;align-items:center}
table{border-collapse:collapse;margin-bottom:1.5em}
td,th{border-bottom:1px solid #ddd;padding:4px 8px;vertical-align:top;text-align:left}
td.text{max-width:28em;white-space:pre-wrap;overflow-wrap:anywhere}
form{display:inline-block;margin:0 4px 4px 0}
small{color:#888}.msg{color:#a00}
img{display:block;background:#eee}
</style></head><body>${body}</body></html>`;
  res.writeHead(status, { ...PAGE_HEADERS, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}
