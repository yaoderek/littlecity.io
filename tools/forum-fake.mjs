#!/usr/bin/env node
// A fake Global Village server for looking at the game's forum screens in development only
// (docs/superpowers/specs/2026-11-27-town-forum-design.md, "The API"). Node's http, everything in memory,
// a dozen made-up posts with plain two-colour JPEG pictures and the towns of scenarios/core/grown-town-legacy.ts.
// It checks nothing the real server checks. Never imported by the game.
//
//   npm run forum:fake            # http://localhost:8791   (PORT=… to move it; PAGE=6 for short pages)
//   npm run forum:dev             # the game, talking to it
//
// A player whose secret is "fake-me" exists from the start and owns two posts with news on them, so the
// Mine tab and the button's number can be seen without posting: put
//   localStorage['lc:forum'] = '{"id":"me","secret":"fake-me","name":"Derek","posted":true}'

import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8791;
const PAGE = Number(process.env.PAGE) || 24;
const SLOW = Number(process.env.SLOW) || 0;
/** Control characters and line breaks, which the real server removes. */
const CONTROL = /\p{Cc}/gu;

// ── pictures: a tiny baseline JPEG encoder for flat colours ────────────────
/** A JPEG of w × h whose 8 × 8 blocks are each one flat colour, `colour(bx, by)` → [r, g, b]. */
function flatJpeg(w, h, colour) {
  const bw = Math.ceil(w / 8), bh = Math.ceil(h / 8);
  const out = [];
  const u16 = (n) => [(n >> 8) & 255, n & 255];
  const seg = (marker, body) => out.push(0xff, marker, ...u16(body.length + 2), ...body);
  out.push(0xff, 0xd8);
  seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  seg(0xdb, [0, ...new Array(64).fill(1)]);
  seg(0xc0, [8, ...u16(h), ...u16(w), 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  // DC: the twelve size categories, each a 4-bit code. AC: only end-of-block, the 1-bit code 0.
  const dcBits = [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  seg(0xc4, [0x00, ...dcBits, ...Array.from({ length: 12 }, (_, i) => i)]);
  seg(0xc4, [0x10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  seg(0xda, [3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0]);
  let acc = 0, n = 0;
  const bits = (value, len) => {
    for (let i = len - 1; i >= 0; i--) {
      acc = (acc << 1) | ((value >> i) & 1);
      if (++n === 8) {
        out.push(acc);
        if (acc === 0xff) out.push(0);
        acc = 0;
        n = 0;
      }
    }
  };
  const prev = [0, 0, 0];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const [r, g, b] = colour(bx, by);
      const ycc = [0.299 * r + 0.587 * g + 0.114 * b, -0.1687 * r - 0.3313 * g + 0.5 * b + 128, 0.5 * r - 0.4187 * g - 0.0813 * b + 128];
      ycc.forEach((v, c) => {
        const dc = Math.round(8 * (Math.max(0, Math.min(255, v)) - 128));
        const diff = dc - prev[c];
        prev[c] = dc;
        const size = diff === 0 ? 0 : Math.floor(Math.log2(Math.abs(diff))) + 1;
        bits(size, 4);
        if (size) bits(diff > 0 ? diff : diff + (1 << size) - 1, size);
        bits(0, 1); // end of block
      });
    }
  }
  if (n) bits(0xff, 8 - n);
  out.push(0xff, 0xd9);
  return Buffer.from(out);
}

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
/** A post's picture: a sky, the sea, and an island in the post's colour. */
function picture(colour) {
  const land = hex(colour);
  return flatJpeg(64, 40, (bx, by) => {
    if (by < 2) return [205, 230, 240];
    if (by === 4 || bx < 1 || bx > 6) return [140, 185, 220];
    return land;
  });
}

// ── the made-up forum ───────────────────────────────────────────────────
const legacy = fs.readFileSync(path.join(ROOT, 'scenarios/core/grown-town-legacy.ts'), 'utf8');
const TOWNS = [...legacy.matchAll(/^\s+\d+: '([^']+)'/gm)].map((m) => m[1]);
if (TOWNS.length === 0) throw new Error('no towns found in grown-town-legacy.ts');

const players = new Map(); // secret → { id, name, seen: { forum, mine } }
const posts = []; // newest first
const likes = new Map(); // post id → Map(player id → time)
const copies = new Map(); // post id → Set(player id)
const comments = new Map(); // post id → [{ id, player, text, created }]
let nextId = 1;
const id = () => (nextId++).toString(36).padStart(4, 'x');
const HOUR = 3_600_000;
const now = Date.now();

players.set('fake-me', { id: 'me', name: 'Derek', seen: { forum: now - 30 * HOUR, mine: now - 30 * HOUR } });
const fakeNames = ['mira', '小林', 'tom', 'Sofía', 'ゆき', '민준', 'Jonas', 'Ayşe', 'Lucas', 'Chloé', '<img src=x onerror=alert(1)>', 'pip'];
for (const [i, n] of fakeNames.entries()) players.set(`s${i}`, { id: `u${i}`, name: n, seen: { forum: 0, mine: 0 } });
const P = (i) => [...players.values()][i + 1];

const seed = [
  [0, 'a harbour town where the lighthouse keeper lives', '#e9b872', 2],
  [1, '我的小镇', '#f4a3bf', 5],
  [2, 'castle on a cliff', '#b9dc94', 26],
  [3, 'Mi pueblo junto al río, con su molino y un mercado los domingos 🌊', '#9fc6e8', 30],
  [4, 'ゆっくり作った町です', '#d6eeae', 50],
  [5, '', '#c9b6f0', 70],
  [6, 'Eine kleine Stadt mit einer sehr langen Brücke über das ganze Tal, die viel zu lange gedauert hat', '#f2d16b', 100],
  [7, 'Küçük bir balıkçı köyü', '#a3cf80', 140],
  [8, 'farm village 🌾🐄 with way too many fences', '#e7a07a', 200],
  [9, '<b>bold?</b> <script>alert(1)</script>', '#bfe0ea', 300],
  [10, 'just a tiny island', '#f6c1a4', 400],
];
for (const [i, caption, colour, hoursAgo] of seed) {
  posts.push({ id: id(), player: P(i).id, caption, colour, created: now - hoursAgo * HOUR, code: TOWNS[i % TOWNS.length], parent: null });
}
// Mine: two posts of "Derek", one built on mira's.
posts.push({ id: id(), player: 'me', caption: 'built on mira’s harbour, with a market', colour: '#ffd96e', created: now - 20 * HOUR, code: TOWNS[0], parent: posts[0].id });
posts.push({ id: id(), player: 'me', caption: 'my first town', colour: '#7b96cf', created: now - 60 * HOUR, code: TOWNS[3], parent: null });
// A post built on one that was deleted.
posts.push({ id: id(), player: P(2).id, caption: 'rebuilt from a town that is gone now', colour: '#d9d4cc', created: now - 8 * HOUR, code: TOWNS[5], parent: 'gone0' });
posts.sort((a, b) => b.created - a.created);
const pics = new Map(posts.map((p) => [p.id, picture(p.colour)]));
const words = ['好可爱!', 'how did you do the bridge?', 'love the windmill', 'すてき！', 'Que bonito 😍', 'more trees!', '<i>nice</i> <img src=x onerror=alert(2)>'];
posts.forEach((p, i) => {
  const l = new Map();
  for (let k = 0; k < (i * 7) % 13; k++) l.set(`u${k}`, now - k * 2 * HOUR);
  likes.set(p.id, l);
  copies.set(p.id, new Set(Array.from({ length: i % 4 }, (_, k) => `u${k}`)));
  comments.set(
    p.id,
    Array.from({ length: i === 0 ? 3 : i % 3 }, (_, k) => ({ id: id(), player: P((i + k) % 11).id, text: words[(i + k) % words.length], created: now - (k + 1) * 40 * 60_000 })),
  );
});
// The first post has a long thread, to see "Earlier comments".
comments.get(posts[1].id).unshift(...Array.from({ length: 45 }, (_, k) => ({ id: id(), player: P(k % 11).id, text: `comment number ${k + 1}`, created: now - (50 - k) * HOUR })));

// ── the API ─────────────────────────────────────────────────────────────
const nameOf = (pid) => [...players.values()].find((p) => p.id === pid)?.name ?? '';
function summary(p, me) {
  const l = likes.get(p.id);
  const out = {
    id: p.id,
    name: nameOf(p.player),
    caption: p.caption,
    created: p.created,
    likes: l.size,
    comments: comments.get(p.id).length,
    copies: copies.get(p.id).size,
    liked: me ? l.has(me.id) : false,
    mine: me ? p.player === me.id : false,
    parent: p.parent ? (posts.find((x) => x.id === p.parent) ? { id: p.parent, name: nameOf(posts.find((x) => x.id === p.parent).player) } : { id: p.parent, name: null }) : null,
  };
  return out;
}
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const fail = (res, status, error) => send(res, status, { error });

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (SLOW) await new Promise((r) => setTimeout(r, SLOW));
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  const me = players.get((req.headers.authorization ?? '').replace(/^Bearer /, '')) ?? null;
  let body = {};
  if (req.method === 'POST' || req.method === 'PUT') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      return fail(res, 400, 'That could not be read.');
    }
  }
  const need = () => (me ? me : (fail(res, 401, 'Who are you?'), null));
  const route = `${req.method} /${parts.join('/')}`;
  console.log(route);

  if (parts[0] === 'pics') {
    const pic = pics.get(parts[1]?.replace(/\.jpg$/, ''));
    if (!pic) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000' });
    return res.end(pic);
  }
  if (route === 'GET /health') return send(res, 200, { ok: true, codec: 'fake' });
  if (route === 'POST /v1/players') {
    const secret = `sec-${id()}-${Math.random().toString(36).slice(2)}`;
    const who = { id: `pl-${id()}`, name: '', seen: { forum: Date.now(), mine: Date.now() } };
    players.set(secret, who);
    return send(res, 200, { id: who.id, secret });
  }
  if (route === 'PUT /v1/me') {
    if (!need()) return;
    const name = String(body.name ?? '').trim().slice(0, 20);
    if (!name) return fail(res, 400, 'A name, please.');
    me.name = name;
    return send(res, 200, {});
  }
  if (route === 'GET /v1/me/news') {
    if (!need()) return;
    let l = 0, c = 0;
    for (const p of posts.filter((x) => x.player === me.id)) {
      for (const t of likes.get(p.id).values()) if (t > me.seen.forum) l++;
      for (const k of comments.get(p.id)) if (k.created > me.seen.forum) c++;
    }
    return send(res, 200, { likes: l, comments: c });
  }
  if (route === 'POST /v1/me/seen') {
    if (!need()) return;
    me.seen[body.what === 'mine' ? 'mine' : 'forum'] = Date.now();
    return send(res, 200, {});
  }
  if (route === 'GET /v1/posts') {
    const tab = url.searchParams.get('tab') ?? 'top';
    let list = [...posts];
    if (tab === 'mine') list = me ? list.filter((p) => p.player === me.id) : [];
    if (tab === 'top') {
      const week = Date.now() - 7 * 24 * HOUR;
      const score = (p) => likes.get(p.id).size;
      list.sort((a, b) => Number(b.created > week) - Number(a.created > week) || score(b) - score(a) || b.created - a.created);
    }
    const from = Number(url.searchParams.get('after') ?? 0) || 0;
    const page = list.slice(from, from + PAGE).map((p) => {
      const s = summary(p, me);
      if (tab === 'mine') {
        s.newLikes = [...likes.get(p.id).values()].filter((t) => t > me.seen.mine).length;
        s.newComments = comments.get(p.id).filter((k) => k.created > me.seen.mine).length;
      }
      return s;
    });
    return send(res, 200, { posts: page, next: from + PAGE < list.length ? String(from + PAGE) : null });
  }
  if (route === 'POST /v1/posts') {
    if (!need()) return;
    const caption = String(body.caption ?? '').replace(CONTROL, '').trim();
    if ([...caption].length > 140) return fail(res, 400, 'That caption is too long.');
    if (!body.code || String(body.code).length > 200_000) return fail(res, 413, 'This town is too big to post.');
    const p = { id: id(), player: me.id, caption, colour: '#ffffff', created: Date.now(), code: String(body.code), parent: body.parent ?? null };
    posts.unshift(p);
    pics.set(p.id, Buffer.from(String(body.picture ?? '').replace(/^data:image\/jpeg;base64,/, ''), 'base64'));
    likes.set(p.id, new Map());
    copies.set(p.id, new Set());
    comments.set(p.id, []);
    return send(res, 201, summary(p, me));
  }
  const post = parts[0] === 'v1' && parts[1] === 'posts' && parts[2] ? posts.find((p) => p.id === parts[2]) : null;
  if (parts[0] === 'v1' && parts[1] === 'posts' && parts[2] && !post) return fail(res, 404, 'That town is gone.');
  if (post && parts.length === 3 && req.method === 'GET') {
    const thread = comments.get(post.id).map((k) => ({ id: k.id, name: nameOf(k.player), text: k.text, created: k.created, mine: me ? k.player === me.id : false }));
    return send(res, 200, { ...summary(post, me), code: post.code, commentList: thread.slice(-200), earlierComments: thread.length > 200 ? 'older' : null });
  }
  if (post && parts.length === 3 && req.method === 'DELETE') {
    if (!need()) return;
    if (post.player !== me.id) return fail(res, 403, 'That is not yours.');
    posts.splice(posts.indexOf(post), 1);
    return send(res, 200, {});
  }
  if (post && parts[3] === 'like') {
    if (!need()) return;
    if (req.method === 'PUT') likes.get(post.id).set(me.id, Date.now());
    else likes.get(post.id).delete(me.id);
    return send(res, 200, { likes: likes.get(post.id).size });
  }
  if (post && parts[3] === 'copied' && req.method === 'POST') {
    if (!need()) return;
    copies.get(post.id).add(me.id);
    return send(res, 200, { copies: copies.get(post.id).size });
  }
  if (post && parts[3] === 'comments' && req.method === 'POST') {
    if (!need()) return;
    const text = String(body.text ?? '').replace(CONTROL, ' ').trim();
    if (!text || [...text].length > 280) return fail(res, 400, 'A comment is 1 to 280 characters.');
    const k = { id: id(), player: me.id, text, created: Date.now() };
    comments.get(post.id).push(k);
    return send(res, 200, { id: k.id, name: me.name, text, created: k.created, mine: true });
  }
  if (parts[0] === 'v1' && parts[1] === 'comments' && parts[2] && req.method === 'DELETE') {
    if (!need()) return;
    for (const list of comments.values()) {
      const i = list.findIndex((k) => k.id === parts[2] && k.player === me.id);
      if (i >= 0) {
        list.splice(i, 1);
        return send(res, 200, {});
      }
    }
    return fail(res, 404, 'That comment is gone.');
  }
  if (parts[0] === 'p' && parts[1]) {
    res.writeHead(302, { Location: `http://localhost:5173/?post=${encodeURIComponent(parts[1])}` });
    return res.end();
  }
  fail(res, 404, 'Not here.');
});
server.listen(PORT, '127.0.0.1', () => console.log(`fake Global Village on http://localhost:${PORT} (${posts.length} posts)`));
