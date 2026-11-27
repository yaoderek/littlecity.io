#!/usr/bin/env node
// npm run forum:seed [-- --url http://localhost:8787] [--count 30]
//
// Fills a running Global Village server (npm run forum) with sample posts through its public API:
// towns grown by the game's own generator (server/seed.ts). For previews and tests only. Owner: Forum.

import { loadModule, parseArgs } from './lib/vite.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const url = String(flags.url ?? process.env.FORUM_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const count = Number(flags.count ?? 30);
const { mod, close } = await loadModule('/server/seed.ts');
let code = 0;
try {
  console.log(`Seeding Global Village at ${url}`);
  await mod.seed(url, (line) => console.log(line), count);
} catch (err) {
  console.error(String(err?.cause?.code === 'ECONNREFUSED' ? `No forum server at ${url}: start it with npm run forum` : err));
  code = 1;
} finally {
  await close();
}
process.stdout.write('', () => process.exit(code));
