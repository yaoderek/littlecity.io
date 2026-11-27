// The forum server's program (Global Village), built to server/dist/forum.mjs. Owner: Forum.
//
//   node forum.mjs                     serves (settings below)
//   node forum.mjs --codec             prints the codec fingerprint this build reads, and exits
//   node forum.mjs --backup <file>     writes a consistent copy of forum.db to <file>, and exits
//                                      (safe while the server runs: the nightly backup uses it)
//   node forum.mjs --block <id>        blocks a player, by their id or the id of one of their posts
//   node forum.mjs --unblock <id>      the same, undone
//   node forum.mjs --delete-post <id>  deletes a post (its comments, likes and picture)
//                                      (the admin page does these three; these are for when it can't)
//
// Settings, from the environment (the systemd unit sets them; server/README.md):
//   FORUM_DATA        the data folder (default ./forum-data)
//   PORT, HOST        where to listen (default 8791 on 127.0.0.1: Caddy is in front)
//   ADMIN_PASSWORD    the admin page's password (unset: the page is off)
//   FORUM_PUBLIC_URL  this server's address (default http://localhost:<port>)
//   FORUM_GAME_URL    the game's address (default https://littlecity.io)

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { codecFingerprint } from '@/world/codec-fingerprint';
import { startForum } from './forum';
import { PLAYER_ID, POST_ID, Store } from './store';

const args = process.argv.slice(2);
const env = process.env;
const dataDir = resolve(env.FORUM_DATA || 'forum-data');
const trim = (s: string) => s.replace(/\/+$/, '');

if (args[0] === '--codec') {
  process.stdout.write(`${codecFingerprint()}\n`);
} else if (args[0] === '--backup') {
  const file = args[1];
  if (!file) throw new Error('usage: forum.mjs --backup <file>');
  if (existsSync(file)) throw new Error(`${file} exists already`);
  const store = new Store(dataDir);
  store.backupTo(resolve(file));
  store.close();
} else if (args[0] === '--block' || args[0] === '--unblock' || args[0] === '--delete-post') {
  const id = args[1] ?? '';
  const store = new Store(dataDir);
  try {
    if (args[0] === '--delete-post') {
      if (!POST_ID.test(id) || !store.deletePost(id)) throw new Error(`no post ${id}`);
      process.stdout.write(`deleted post ${id}\n`);
    } else {
      const player = PLAYER_ID.test(id) ? id : POST_ID.test(id) ? store.post(id)?.player : undefined;
      if (!player || !store.setBlocked(player, args[0] === '--block')) throw new Error(`no player or post ${id}`);
      process.stdout.write(`${args[0] === '--block' ? 'blocked' : 'unblocked'} player ${player}\n`);
    }
  } finally {
    store.close();
  }
} else {
  const port = Number(env.PORT || 8791);
  const running = await startForum({
    dataDir,
    port,
    host: env.HOST || '127.0.0.1',
    adminPassword: env.ADMIN_PASSWORD ?? '',
    publicUrl: trim(env.FORUM_PUBLIC_URL || `http://localhost:${port}`),
    gameUrl: trim(env.FORUM_GAME_URL || 'https://littlecity.io'),
  });
  process.stdout.write(`Global Village on ${running.url} (data ${dataDir}, codec ${codecFingerprint()})\n`);
  const stop = () => {
    void running.close().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
