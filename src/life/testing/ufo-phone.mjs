#!/usr/bin/env node
/* global console, window, performance, requestAnimationFrame, process, setTimeout */
// The UFO on a phone (Derek, 2026-11-25: "spawning one in causes massive performance slowdown and
// pixelation on phones, which persists even after the UFO leaves"). A phone-sized page (390 × 844 at
// 3×, touch) with its JavaScript slowed --cpu times, the quality governor on (quality=auto), a grown
// town, the display's frame cap kept. Real frame gaps (requestAnimationFrame), in windows: before the
// call, while it comes and hovers with the beam on, after it has gone, and a while later; with the
// governor's level and what the renderer holds (draw calls, geometries, textures, programs) at each.
// Short, one page, closed at the end (headless Chromium here shares the real graphics card).
//
//   --uncapped: the display's frame cap off, so the frame gaps show how long a frame really takes (how
//   much drawing the UFO adds; not what a player sees: read stalls from a capped run).
//
//   node src/life/testing/ufo-phone.mjs [--cpu 4] [--uncapped] [--angle swiftshader] [--calls 1] [--window 8] [--query extra=1]

import { chromium } from 'playwright';
import { openPage } from '../../../tools/lib/browser.mjs';
import { parseArgs, startServer } from '../../../tools/lib/vite.mjs';

const { flags } = parseArgs(process.argv.slice(2));
const cpu = Number(flags.cpu ?? 4);
const calls = Number(flags.calls ?? 1);
const windowS = Number(flags.window ?? 8);
const server = await startServer();
// --angle swiftshader: no graphics card (drawing on the CPU): stands in for a phone's weak one, which this
// Mac's own card does not.
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', `--use-angle=${flags.angle ?? 'metal'}`, '--enable-unsafe-swiftshader', ...(flags.uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
try {
  const q = `scenario=grown-town-1&quality=${flags.quality ?? 'auto'}${flags.query ? `&${flags.query}` : ''}`;
  const { page } = await openPage(browser, `${server.url}/?${q}`, { width: 390, height: 844, scale: Number(flags.scale ?? 3), hasTouch: true, isMobile: true });
  await page.waitForFunction(() => window.__lc !== undefined && window.__lcUfo !== undefined, null, { timeout: 90_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  // Frame gaps, collected in the page.
  await page.evaluate(() => {
    const w = window;
    w.__gaps = [];
    let last = performance.now();
    const tick = (t) => {
      w.__gaps.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const sample = async (label, seconds) => {
    await page.evaluate(() => (window.__gaps.length = 0));
    const levels = [];
    for (let s = 0; s < seconds; s++) {
      await page.waitForTimeout(1000);
      levels.push(await page.evaluate(() => window.__lc.view.quality?.().level ?? -1));
    }
    const r = await page.evaluate(() => {
      const g = [...window.__gaps].sort((a, b) => a - b);
      const at = (k) => g[Math.min(g.length - 1, Math.floor((g.length - 1) * k))] ?? 0;
      const info = window.__lcRenderer?.info;
      const ph = {};
      for (const s of window.__lcUfo?.saucers ?? []) ph[s.phase] = (ph[s.phase] ?? 0) + 1;
      const ufo = Object.entries(ph).map(([k, v]) => `${k}×${v}`).join(' ');
      return {
        frames: g.length, median: at(0.5), p95: at(0.95), p99: at(0.99), worst: g[g.length - 1] ?? 0, long: g.filter((x) => x > 50).length,
        movers: window.__lcMovers ? `${window.__lcMovers.count}/${window.__lcMovers.garbage}` : '',
        calls: window.__lc.view.stats().drawCalls, geometries: info?.memory.geometries, textures: info?.memory.textures, programs: info?.programs?.length, ufo,
      };
    });
    // The split of the drawing between the passes over 3 s (each pass waited for: slower than real, for the shares).
    const passes = flags.passes ? await page.evaluate(() => new Promise((done) => {
      const v = window.__lc.view;
      v.profileLive(true);
      setTimeout(() => done(v.profileLive(false)), 3000);
    })) : null;
    if (passes) {
      const n = passes['frames#'] || 1;
      console.log(`   passes over ${n} frames: ` + Object.keys(passes).filter((k) => !k.endsWith('#')).map((k) => `${k} ${(passes[k] / n).toFixed(1)} ms (${passes[k + '#']}x)`).join(', '));
    }
    console.log(`${label.padEnd(10)} ${r.frames} frames  median ${r.median.toFixed(1)}  p95 ${r.p95.toFixed(1)}  p99 ${r.p99.toFixed(1)}  worst ${r.worst.toFixed(0)} ms  long(>50) ${r.long}  level ${levels.join(' ')}  movers ${r.movers} (vertices/retired)  draws ${r.calls} geo ${r.geometries} tex ${r.textures} prog ${r.programs}  [${r.ufo}]`);
    return r;
  };
  // --zoom: the camera in close over where it will come (a phone player zoomed in on a street).
  if (flags.zoom) await page.evaluate((z) => window.__lc.view.setCamera({ zoom: Number(z), target: [30.5, 1, 22.5] }), flags.zoom);
  await page.waitForTimeout(15000);
  await sample('settled', windowS);
  await sample('before', windowS);
  for (let i = 0; i < calls; i++) {
    await page.evaluate(() => window.__lcUfo.call(30.5, 0.8, 22.5));
    // The click and the flight in (the frame of the click among them).
    await sample(`arrive ${i + 1}`, 2);
    // In over the spot first (2.4 s), then the window is taken with its beam on.
    await page.waitForFunction(() => window.__lcUfo.saucers.some((s) => s.phase === 'beam' || s.phase === 'lift' || s.phase === 'seek'), null, { timeout: 120_000 });
    await sample(`call ${i + 1}`, Math.min(windowS, 3));
    if (calls > 1) await page.waitForFunction(() => window.__lcUfo.saucers.every((s) => s.phase === 'gone' || s.phase === 'done') || window.__lcUfo.saucers.length === 0, null, { timeout: 60_000 });
  }
  // --burst 20: that many called at once (tapped in quick succession round one spot), measured while they hover.
  if (flags.burst) {
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) window.__lcUfo.call(30.5 + ((i * 7) % 5) - 2, 0.8, 22.5 + ((i * 3) % 5) - 2);
    }, Number(flags.burst));
    await sample(`burst ${flags.burst}`, 3);
    await page.waitForTimeout(2000);
    await sample('hovering', 4);
  }
  await page.waitForFunction(() => window.__lcUfo.saucers.every((s) => s.phase === 'gone') || window.__lcUfo.saucers.length === 0, null, { timeout: 120_000 });
  await sample('after', windowS);
  await page.waitForTimeout(30000);
  await sample('later', windowS);
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
