#!/usr/bin/env node
// npm run seo -- <built site dir>
//
// Writes the pages search engines read into a built site (tools/seo/site.ts says what and why):
// /about/, /guide/, /guide/<id>/ for every guide entry, each in every language the game speaks (and the
// game's own page as /<lang>/index.html), /404.html and /sitemap.xml.
// tools/deploy-pages.sh runs it on every deploy, after `vite build`.

import fs from 'node:fs';
import path from 'node:path';
import { loadModule, parseArgs } from './lib/vite.mjs';

const { positional } = parseArgs(process.argv.slice(2));
const out = positional[0];
if (!out || !fs.existsSync(path.join(out, 'index.html'))) {
  console.error('usage: npm run seo -- <built site dir> (the folder vite build wrote, with index.html in it)');
  process.exit(1);
}

const { mod, close } = await loadModule('/tools/seo/site.ts');
try {
  // The game's own page in every language (English stays index.html, the others /<lang>/index.html),
  // then the about and guide pages in every language, then the 404.
  const home = path.join(out, 'index.html');
  const index = fs.readFileSync(home, 'utf8');
  if (!/<!-- seo:data[^>]*-->/.test(index)) throw new Error('index.html has lost its <!-- seo:data --> marker');
  const pages = [...mod.homePages(index), ...mod.sitePages()];
  for (const p of pages) {
    const file = path.join(out, p.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, p.html);
  }
  const lastmod = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(out, 'sitemap.xml'), mod.sitemap(pages, lastmod));
  console.log(`seo: wrote ${pages.length} pages and sitemap.xml (${pages.filter((p) => p.url).length} urls) to ${out}`);
} finally {
  await close();
}
