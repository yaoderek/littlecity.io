#!/usr/bin/env node
// npm run guide -- [id ...] [--sheet] [--quality 0.8]
// npm run guide -- --clips [id ...] [--frames] [--sheet]
//
// Renders every guide entry's recipe town (src/guide/entries.ts) to
// public/guide/<id>.webp: 180 × 135 shown, drawn at 2× (360 × 270), by day,
// with nothing that moves by chance, cut out as a soft vignette on a
// transparent background. Pictures of entries that no longer exist are
// deleted. With ids, only those entries are drawn (and nothing is deleted).
//
// --sheet also writes .context/shots/guide-sheet.png: every picture on one
// cream page with its name, to judge the set at thumbnail size.
//
// --clips renders the buildings' clips instead (src/guide/steps.ts; the happenings keep their still): the
// recipe built a tap at a time with the tutorial's glove, the unlock stars where it forms, a hold, a fade
// back to the start. On a fixed clock at 24 frames a second, so a clip comes out the same every time. Each
// is public/guide/clips/<id>.webm (VP9) and <id>.mp4 (H.264, for Safari), 360 × 270 on the Almanac's paper
// (an iPhone shows no video transparency). --frames keeps the frames in .context/clip-frames/<id>/; --sheet
// writes a contact sheet of each clip there. Needs ffmpeg with libvpx-vp9 and libx264.

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openPage } from './lib/browser.mjs';
import { parseArgs, ROOT, startServer } from './lib/vite.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
// `--clips chapel` reads as the flag's value: it is an id.
if (typeof flags.clips === 'string') positional.unshift(flags.clips);
if (typeof flags.sheet === 'string') positional.push(flags.sheet);
const outDir = path.join(ROOT, 'public', 'guide');
const quality = Number(flags.quality ?? 0.8);
const WIDTH = 180, HEIGHT = 135, SCALE = 2;
/** Clip frames a second (tools/guide/main.ts CLIP_FPS). */
const FPS = 24;

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const { page, errors } = await openPage(browser, `${server.url}/tools/guide/index.html`, { width: WIDTH, height: HEIGHT, scale: SCALE });
  await page.waitForFunction(() => window.__guide !== undefined, null, { timeout: 60_000 });
  if (flags.clips) await clips(page);
  else await stills(page, browser);
  if (errors.length > 0) {
    console.error(`\nThe page reported ${errors.length} error(s):\n${errors.slice(0, 10).join('\n')}`);
    failed = true;
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);

/** Every entry's picture (or the ones named). */
async function stills(page, browser) {
const all = await page.evaluate(() => window.__guide.ids());
const unknown = positional.filter((id) => !all.includes(id));
if (unknown.length) throw new Error(`no guide entry ${unknown.join(', ')}; entries: ${all.join(', ')}`);
const ids = positional.length ? positional : all;
fs.mkdirSync(outDir, { recursive: true });
let total = 0;
for (const id of ids) {
  const url = await page.evaluate(([i, q]) => window.__guide.render(i, { quality: q }), [id, quality]);
  if (!url.startsWith('data:image/webp')) throw new Error(`the browser did not make a WebP for ${id}`);
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  fs.writeFileSync(path.join(outDir, `${id}.webp`), bytes);
  total += bytes.length;
  console.log(`public/guide/${id}.webp  ${(bytes.length / 1024).toFixed(1)} KB`);
}
if (!positional.length) {
  for (const f of fs.readdirSync(outDir)) {
    if (!f.endsWith('.webp')) continue;
    if (!all.includes(f.replace(/\.webp$/, ''))) {
      fs.rmSync(path.join(outDir, f));
      console.log(`removed public/guide/${f} (no such entry)`);
    }
  }
}
console.log(`${ids.length} pictures, ${(total / 1024).toFixed(0)} KB`);

if (flags.sheet) {
  const shotDir = path.join(ROOT, '.context', 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  const cards = all
    .map((id) => {
      const data = fs.readFileSync(path.join(outDir, `${id}.webp`)).toString('base64');
      return `<figure><img src="data:image/webp;base64,${data}"><figcaption>${id}</figcaption></figure>`;
    })
    .join('');
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await sheet.setContent(
    `<style>body{margin:16px;background:#fbf6ea;font:13px system-ui;display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
     figure{margin:0;text-align:center}img{width:144px;height:108px}</style>${cards}`,
  );
  const file = path.join(shotDir, 'guide-sheet.png');
  await sheet.screenshot({ path: file, fullPage: true });
  console.log(path.relative(ROOT, file));
}
}

/** --clips: every building's clip (or the ones named), encoded twice. */
async function clips(page) {
  const all = await page.evaluate(() => window.__guide.clipIds());
  const unknown = positional.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`no clip for ${unknown.join(', ')} (clips are the buildings: ${all.join(', ')})`);
  const ids = positional.length ? positional : all;
  const clipDir = path.join(outDir, 'clips');
  fs.mkdirSync(clipDir, { recursive: true });
  const ffmpeg = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
  let webm = 0, mp4 = 0;
  for (const id of ids) {
    const started = Date.now();
    const { frames, taps, formed } = await page.evaluate(([i, hold]) => window.__guide.beginClip(i, hold ? { hold: Number(hold) } : {}), [id, flags.hold]);
    const dir = path.join(ROOT, '.context', 'clip-frames', id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (let f = 0; f < frames; f++) {
      const url = await page.evaluate(() => window.__guide.clipFrame());
      fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    }
    const input = ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png')];
    // sRGB frames as BT.709 video, said so in the file: browsers then show the paper as the page's own colour.
    const colour = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
    const w = path.join(clipDir, `${id}.webm`), m = path.join(clipDir, `${id}.mp4`);
    execFileSync(ffmpeg, [...input, ...colour, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(flags.crf ?? 46), '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', '600', '-an', w]);
    execFileSync(ffmpeg, [...input, ...colour, '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', String(flags['crf-mp4'] ?? 31), '-profile:v', 'high', '-g', '600', '-movflags', '+faststart', '-an', m]);
    if (flags.sheet) {
      // Eight frames across the clip, four to a row.
      const every = Math.max(1, Math.floor(frames / Number(flags.tiles ?? 8)));
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-vf', `select='not(mod(n\\,${every}))',tile=4x${Math.ceil(Number(flags.tiles ?? 8) / 4)}:padding=6:color=0xfdfaf3`, '-frames:v', '1', path.join(dir, '..', `${id}-sheet.png`)]);
    }
    if (!flags.frames) fs.rmSync(dir, { recursive: true, force: true });
    const ws = fs.statSync(w).size, ms = fs.statSync(m).size;
    webm += ws;
    mp4 += ms;
    console.log(`public/guide/clips/${id}  ${(frames / FPS).toFixed(1)} s, ${taps.length} taps (built at ${formed + 1})  webm ${(ws / 1024).toFixed(0)} KB  mp4 ${(ms / 1024).toFixed(0)} KB  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  if (!positional.length) {
    for (const f of fs.readdirSync(clipDir)) {
      if (!f.startsWith('.') && !all.includes(f.replace(/\.(webm|mp4)$/, ''))) {
        fs.rmSync(path.join(clipDir, f));
        console.log(`removed public/guide/clips/${f} (no such building)`);
      }
    }
  }
  console.log(`${ids.length} clips: webm ${(webm / 1024 / 1024).toFixed(2)} MB, mp4 ${(mp4 / 1024 / 1024).toFixed(2)} MB`);
}
