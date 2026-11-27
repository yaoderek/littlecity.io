// The forum's data: one SQLite file and a folder of pictures (Global Village). Owner: Forum.
//
//   <data>/forum.db          players, posts (with the town code), likes, comments, copies
//   <data>/pics/<id>.jpg     each post's picture, written once, never changed
//
// Moving the server is copying the folder. Every query is parameterised. A post's likes, comments
// and copies are kept as counts on the post, changed in the same transaction as the row they count,
// and counted again from the rows (leaving out blocked players) when someone is blocked or unblocked.
// A player's secret is kept only as its SHA-256 (it is 32 random bytes: no slow hash is needed).

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  seen_forum INTEGER NOT NULL,
  seen_mine INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL REFERENCES players(id),
  caption TEXT NOT NULL,
  code TEXT NOT NULL,
  parent TEXT,
  created INTEGER NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  copies INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS posts_new ON posts (created DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_player ON posts (player, created DESC);
CREATE TABLE IF NOT EXISTS likes (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  player TEXT NOT NULL REFERENCES players(id),
  created INTEGER NOT NULL,
  PRIMARY KEY (post, player)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS likes_player ON likes (player);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  player TEXT NOT NULL REFERENCES players(id),
  text TEXT NOT NULL,
  created INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS comments_post ON comments (post, created, id);
CREATE INDEX IF NOT EXISTS comments_player ON comments (player, created);
CREATE TABLE IF NOT EXISTS copies (
  post TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  player TEXT NOT NULL REFERENCES players(id),
  created INTEGER NOT NULL,
  PRIMARY KEY (post, player)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS copies_player ON copies (player);
`;

/** Ids are random letters and digits: posts 10, players and comments 12. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const POST_ID = /^[0-9a-z]{10}$/;
export const PLAYER_ID = /^[0-9a-z]{12}$/;
export const COMMENT_ID = /^[0-9a-z]{12}$/;

export function newId(length: number): string {
  const bytes = randomBytes(length * 2);
  let s = '';
  // 252 = 7 × 36: bytes at or above it are skipped, so every letter is equally likely.
  for (let i = 0; i < bytes.length && s.length < length; i++) if (bytes[i]! < 252) s += ALPHABET[bytes[i]! % 36];
  return s.length === length ? s : newId(length);
}

export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

export interface PlayerRow {
  id: string;
  name: string | null;
  created: number;
  blocked: number;
  seen_forum: number;
  seen_mine: number;
}

/** A post as the feeds read it (the town code is left out). */
export interface PostRow {
  id: string;
  player: string;
  name: string | null;
  caption: string;
  created: number;
  likes: number;
  comments: number;
  copies: number;
  parent: string | null;
  /** The parent post's player's name, if the parent is still there and shown. */
  parent_name: string | null;
  /** 1 if the parent post is still there and shown. */
  parent_shown: number | null;
  blocked: number;
}

export interface CommentRow {
  id: string;
  post: string;
  player: string;
  name: string | null;
  text: string;
  created: number;
}

const POST_COLUMNS = `p.id, p.player, pl.name, p.caption, p.created, p.likes, p.comments, p.copies, p.parent, pl.blocked,
  CASE WHEN pp.id IS NOT NULL AND ppl.blocked = 0 THEN ppl.name END AS parent_name,
  CASE WHEN pp.id IS NOT NULL AND ppl.blocked = 0 THEN 1 END AS parent_shown`;
const POST_FROM = `posts p JOIN players pl ON pl.id = p.player
  LEFT JOIN posts pp ON pp.id = p.parent LEFT JOIN players ppl ON ppl.id = pp.player`;

export class Store {
  readonly db: DatabaseSync;
  readonly pics: string;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.pics = join(dir, 'pics');
    mkdirSync(this.pics, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'forum.db'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }

  /** Runs fn in one transaction. */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  private one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  private run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).run(...params).changes);
  }

  // ── players ──

  addPlayer(now: number): { id: string; secret: string } {
    const secret = randomBytes(32).toString('base64url');
    for (;;) {
      const id = newId(12);
      if (this.one('SELECT 1 AS x FROM players WHERE id = ?', id)) continue;
      this.run('INSERT INTO players (id, secret_hash, created, seen_forum, seen_mine) VALUES (?, ?, ?, ?, ?)', id, hashSecret(secret), now, now, now);
      return { id, secret };
    }
  }

  playerBySecret(secret: string): PlayerRow | undefined {
    return this.one<PlayerRow>('SELECT id, name, created, blocked, seen_forum, seen_mine FROM players WHERE secret_hash = ?', hashSecret(secret));
  }

  player(id: string): PlayerRow | undefined {
    return this.one<PlayerRow>('SELECT id, name, created, blocked, seen_forum, seen_mine FROM players WHERE id = ?', id);
  }

  setName(id: string, name: string): void {
    this.run('UPDATE players SET name = ? WHERE id = ?', name, id);
  }

  setSeen(id: string, what: 'forum' | 'mine', now: number): void {
    this.run(what === 'forum' ? 'UPDATE players SET seen_forum = ? WHERE id = ?' : 'UPDATE players SET seen_mine = ? WHERE id = ?', now, id);
  }

  /** New likes and comments by others (not blocked) on the player's posts since a time. */
  news(id: string, since: number): { likes: number; comments: number } {
    const likes = this.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM likes l JOIN posts p ON p.id = l.post JOIN players x ON x.id = l.player
       WHERE p.player = ? AND l.player <> p.player AND l.created > ? AND x.blocked = 0`, id, since)!.n;
    const comments = this.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM comments c JOIN posts p ON p.id = c.post JOIN players x ON x.id = c.player
       WHERE p.player = ? AND c.player <> p.player AND c.created > ? AND x.blocked = 0`, id, since)!.n;
    return { likes, comments };
  }

  /** Per post of these, the new likes and comments by others since a time. */
  newsByPost(ids: readonly string[], owner: string, since: number): Map<string, { likes: number; comments: number }> {
    const out = new Map<string, { likes: number; comments: number }>(ids.map((id) => [id, { likes: 0, comments: 0 }]));
    if (!ids.length) return out;
    const marks = ids.map(() => '?').join(',');
    for (const r of this.all<{ post: string; n: number }>(
      `SELECT l.post, COUNT(*) AS n FROM likes l JOIN players x ON x.id = l.player
       WHERE l.post IN (${marks}) AND l.player <> ? AND l.created > ? AND x.blocked = 0 GROUP BY l.post`, ...ids, owner, since)) out.get(r.post)!.likes = r.n;
    for (const r of this.all<{ post: string; n: number }>(
      `SELECT c.post, COUNT(*) AS n FROM comments c JOIN players x ON x.id = c.player
       WHERE c.post IN (${marks}) AND c.player <> ? AND c.created > ? AND x.blocked = 0 GROUP BY c.post`, ...ids, owner, since)) out.get(r.post)!.comments = r.n;
    return out;
  }

  // ── posts ──

  /** Writes the picture, then the post. */
  addPost(p: { player: string; caption: string; code: string; parent: string | null; picture: Uint8Array }, now: number): string {
    let id: string;
    do id = newId(10);
    while (this.one('SELECT 1 AS x FROM posts WHERE id = ?', id));
    const file = this.picPath(id);
    writeFileSync(`${file}.part`, p.picture);
    renameSync(`${file}.part`, file);
    try {
      this.run('INSERT INTO posts (id, player, caption, code, parent, created) VALUES (?, ?, ?, ?, ?, ?)', id, p.player, p.caption, p.code, p.parent, now);
    } catch (e) {
      rmSync(file, { force: true });
      throw e;
    }
    return id;
  }

  picPath(id: string): string {
    return join(this.pics, `${id}.jpg`);
  }

  post(id: string): PostRow | undefined {
    return this.one<PostRow>(`SELECT ${POST_COLUMNS} FROM ${POST_FROM} WHERE p.id = ?`, id);
  }

  code(id: string): string | undefined {
    return this.one<{ code: string }>('SELECT code FROM posts WHERE id = ?', id)?.code;
  }

  /** Deletes a post with its likes, comments and copies, and its picture. Posts built on it keep pointing at it (it reads as gone). */
  deletePost(id: string): boolean {
    const gone = this.run('DELETE FROM posts WHERE id = ?', id) > 0;
    if (gone) rmSync(this.picPath(id), { force: true });
    return gone;
  }

  /** A page of a feed: up to `limit` rows after the cursor's place. */
  feed(tab: 'top' | 'new' | 'mine', after: FeedCursor | null, opts: { since: number; me?: string; limit: number }): PostRow[] {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    let order: string;
    if (tab === 'mine') {
      where.push('p.player = ?');
      params.push(opts.me!);
    } else where.push('pl.blocked = 0');
    if (tab === 'top') {
      order = '(p.created >= ?) DESC, p.likes DESC, p.created DESC, p.id DESC';
      if (after && after.tab === 'top') {
        where.push(`((p.created >= ?) < ? OR ((p.created >= ?) = ? AND (p.likes < ? OR (p.likes = ? AND (p.created < ? OR (p.created = ? AND p.id < ?))))))`);
        params.push(after.since, after.recent, after.since, after.recent, after.likes, after.likes, after.created, after.created, after.id);
      }
    } else {
      order = 'p.created DESC, p.id DESC';
      if (after && after.tab !== 'top') {
        where.push('(p.created < ? OR (p.created = ? AND p.id < ?))');
        params.push(after.created, after.created, after.id);
      }
    }
    const orderParams: SQLInputValue[] = tab === 'top' ? [after?.tab === 'top' ? after.since : opts.since] : [];
    return this.all<PostRow>(`SELECT ${POST_COLUMNS} FROM ${POST_FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`, ...params, ...orderParams, opts.limit);
  }

  /** Which of these posts the player likes. */
  likedOf(player: string, ids: readonly string[]): Set<string> {
    if (!ids.length) return new Set();
    const rows = this.all<{ post: string }>(`SELECT post FROM likes WHERE player = ? AND post IN (${ids.map(() => '?').join(',')})`, player, ...ids);
    return new Set(rows.map((r) => r.post));
  }

  // ── likes, copies, comments ──

  /** Likes (true) or takes it back (false); the post's like count after. */
  like(post: string, player: string, on: boolean, now: number): number {
    return this.tx(() => {
      const changed = on
        ? this.run('INSERT OR IGNORE INTO likes (post, player, created) VALUES (?, ?, ?)', post, player, now)
        : this.run('DELETE FROM likes WHERE post = ? AND player = ?', post, player);
      if (changed) this.run(`UPDATE posts SET likes = likes ${on ? '+' : '-'} 1 WHERE id = ?`, post);
      return this.one<{ likes: number }>('SELECT likes FROM posts WHERE id = ?', post)!.likes;
    });
  }

  /** Counts a copy, once per player; the post's copy count after. */
  copied(post: string, player: string, now: number): number {
    return this.tx(() => {
      if (this.run('INSERT OR IGNORE INTO copies (post, player, created) VALUES (?, ?, ?)', post, player, now)) this.run('UPDATE posts SET copies = copies + 1 WHERE id = ?', post);
      return this.one<{ copies: number }>('SELECT copies FROM posts WHERE id = ?', post)!.copies;
    });
  }

  addComment(post: string, player: string, text: string, now: number): string {
    return this.tx(() => {
      let id: string;
      do id = newId(12);
      while (this.one('SELECT 1 AS x FROM comments WHERE id = ?', id));
      this.run('INSERT INTO comments (id, post, player, text, created) VALUES (?, ?, ?, ?, ?)', id, post, player, text, now);
      this.run('UPDATE posts SET comments = comments + 1 WHERE id = ?', post);
      return id;
    });
  }

  comment(id: string): CommentRow | undefined {
    return this.one<CommentRow>('SELECT c.id, c.post, c.player, pl.name, c.text, c.created FROM comments c JOIN players pl ON pl.id = c.player WHERE c.id = ?', id);
  }

  deleteComment(id: string): boolean {
    return this.tx(() => {
      const c = this.one<{ post: string }>('SELECT post FROM comments WHERE id = ?', id);
      if (!c) return false;
      this.run('DELETE FROM comments WHERE id = ?', id);
      this.recount(c.post);
      return true;
    });
  }

  /** Comments of a post a viewer sees (others' unless blocked, and their own), newest `limit` before a place, oldest first. */
  comments(post: string, viewer: string | null, before: { created: number; id: string } | null, limit: number): CommentRow[] {
    const rows = this.all<CommentRow>(
      `SELECT c.id, c.post, c.player, pl.name, c.text, c.created FROM comments c JOIN players pl ON pl.id = c.player
       WHERE c.post = ? AND (pl.blocked = 0 OR c.player = ?) ${before ? 'AND (c.created < ? OR (c.created = ? AND c.id < ?))' : ''}
       ORDER BY c.created DESC, c.id DESC LIMIT ?`,
      post, viewer ?? '', ...(before ? [before.created, before.created, before.id] : []), limit);
    return rows.reverse();
  }

  /** Comments by the player in the last hour (the rate limit reads it). */
  commentsSince(player: string, since: number): number {
    return this.one<{ n: number }>('SELECT COUNT(*) AS n FROM comments WHERE player = ? AND created > ?', player, since)!.n;
  }

  /** Counts a post's likes, comments and copies again from the rows, leaving out blocked players. */
  recount(post: string): void {
    this.run(
      `UPDATE posts SET
         likes = (SELECT COUNT(*) FROM likes l JOIN players x ON x.id = l.player WHERE l.post = posts.id AND x.blocked = 0),
         comments = (SELECT COUNT(*) FROM comments c JOIN players x ON x.id = c.player WHERE c.post = posts.id AND x.blocked = 0),
         copies = (SELECT COUNT(*) FROM copies k JOIN players x ON x.id = k.player WHERE k.post = posts.id AND x.blocked = 0)
       WHERE id = ?`, post);
  }

  // ── Derek's admin page ──

  setBlocked(player: string, blocked: boolean): boolean {
    return this.tx(() => {
      if (!this.run('UPDATE players SET blocked = ? WHERE id = ?', blocked ? 1 : 0, player)) return false;
      const touched = this.all<{ post: string }>(
        'SELECT post FROM likes WHERE player = ? UNION SELECT post FROM comments WHERE player = ? UNION SELECT post FROM copies WHERE player = ?', player, player, player);
      for (const t of touched) this.recount(t.post);
      return true;
    });
  }

  newestPosts(limit: number): (PostRow & { player_blocked: number })[] {
    return this.all(`SELECT ${POST_COLUMNS}, pl.blocked AS player_blocked FROM ${POST_FROM} ORDER BY p.created DESC, p.id DESC LIMIT ?`, limit);
  }

  newestComments(limit: number): (CommentRow & { blocked: number })[] {
    return this.all('SELECT c.id, c.post, c.player, pl.name, c.text, c.created, pl.blocked FROM comments c JOIN players pl ON pl.id = c.player ORDER BY c.created DESC, c.id DESC LIMIT ?', limit);
  }

  blockedPlayers(): (PlayerRow & { posts: number; comments: number })[] {
    return this.all(
      `SELECT pl.id, pl.name, pl.created, pl.blocked, pl.seen_forum, pl.seen_mine,
         (SELECT COUNT(*) FROM posts WHERE player = pl.id) AS posts, (SELECT COUNT(*) FROM comments WHERE player = pl.id) AS comments
       FROM players pl WHERE pl.blocked = 1 ORDER BY pl.created DESC`);
  }

  totals(since: number): Record<'players' | 'posts' | 'comments' | 'likes', { today: number; ever: number }> {
    const count = (table: string) => this.one<{ today: number; ever: number }>(`SELECT COUNT(*) AS ever, COUNT(CASE WHEN created >= ? THEN 1 END) AS today FROM ${table}`, since)!;
    return { players: count('players'), posts: count('posts'), comments: count('comments'), likes: count('likes') };
  }

  /** A consistent copy of the database, for the nightly backup (the live server may keep running). */
  backupTo(file: string): void {
    this.db.prepare('VACUUM INTO ?').run(file);
  }
}

/** Where a feed page ends, to start the next one from. */
export type FeedCursor =
  | { tab: 'top'; since: number; recent: 0 | 1; likes: number; created: number; id: string }
  | { tab: 'new' | 'mine'; created: number; id: string };

export function encodeCursor(c: FeedCursor): string {
  const parts = c.tab === 'top' ? ['t', c.since, c.recent, c.likes, c.created, c.id] : [c.tab === 'new' ? 'n' : 'm', c.created, c.id];
  return Buffer.from(parts.join('.')).toString('base64url');
}

const INT = /^(0|[1-9][0-9]{0,15})$/;
/** The cursor, or null if it isn't one this server made for this tab. */
export function decodeCursor(s: string, tab: 'top' | 'new' | 'mine'): FeedCursor | null {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(s)) return null;
  const parts = Buffer.from(s, 'base64url').toString('utf8').split('.');
  const ints = (xs: string[]) => (xs.every((x) => INT.test(x)) ? xs.map(Number) : null);
  if (tab === 'top') {
    if (parts.length !== 6 || parts[0] !== 't' || !POST_ID.test(parts[5]!)) return null;
    const n = ints(parts.slice(1, 5));
    if (!n || (n[1] !== 0 && n[1] !== 1)) return null;
    return { tab, since: n[0]!, recent: n[1] as 0 | 1, likes: n[2]!, created: n[3]!, id: parts[5]! };
  }
  if (parts.length !== 3 || parts[0] !== (tab === 'new' ? 'n' : 'm') || !POST_ID.test(parts[2]!)) return null;
  const n = ints(parts.slice(1, 2));
  return n ? { tab, created: n[0]!, id: parts[2]! } : null;
}
