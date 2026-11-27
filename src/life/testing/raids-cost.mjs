#!/usr/bin/env node
/* global console, window, performance, process */
// Frame cost of many raids at once (design section 13b: every click of the Raid tool brings another party).
// Opens a grown town in a phone-sized page with the processor slowed (a weak phone), times frames with no raid,
// then with 1, 5 and 10 raids called in quick succession round the town once their bands are ashore, ending
// each set (undo) before the next.
//
//   node src/life/testing/raids-cost.mjs [scenario] [--size 390x844] [--throttle 4] [--frames 180] [--warm 30000] [--sets 1,5,10]

import { launchBrowser, openPage } from '../../../tools/lib/browser.mjs';
import { parseArgs, startServer } from '../../../tools/lib/vite.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const scenario = positional[0] ?? 'grown-harbour';
const [width, height] = String(flags.size ?? '390x844').split('x').map(Number);
const frames = Number(flags.frames ?? 180);
const warm = Number(flags.warm ?? 30000);
const sets = String(flags.sets ?? '1,5,10').split(',').map(Number);
const FRAME = 1000 / 60;
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openPage(browser, `${server.url}/?scenario=${encodeURIComponent(scenario)}&season=summer&weather=clear`, { width, height });
  await page.waitForFunction(() => window.__lc !== undefined, null, { timeout: 60_000 });
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);
  await page.evaluate(() => window.__lc.signals.hold('day'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(flags.throttle ?? 4) });
  const play = async (ms) => {
    for (let i = 0; i < ms / FRAME; i++) await page.clock.runFor(FRAME);
  };
  const time = async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      await page.clock.runFor(FRAME);
      out.push(performance.now() - t0);
    }
    out.sort((a, b) => a - b);
    return { median: out[n >> 1], p95: out[Math.floor(n * 0.95)] };
  };
  const state = () =>
    page.evaluate(() => {
      const r = window.__lc.raids;
      const raiders = r.list.reduce((n, x) => n + x.raiders.filter((y) => y.where !== 'lost').length, 0);
      const ashore = r.list.reduce((n, x) => n + x.raiders.filter((y) => y.person).length, 0);
      const walkers = (window.__lcPeople?.people ?? []).filter((p) => p.visible).length;
      return `${r.list.length} raids, ${raiders} raiders (${ashore} ashore), ${walkers} walkers drawn, ${r.handles()} raid handles, ${window.__lc.mischief.engine.burning().length} cells burning`;
    });
  await play(3000);
  const base = await time(frames);
  console.log(`no raid: median ${base.median.toFixed(1)} ms, p95 ${base.p95.toFixed(1)} ms  [${await state()}]`);
  for (const n of sets) {
    const refused = await page.evaluate((count) => {
      const lc = window.__lc;
      const why = [];
      for (let k = 0; k < count; k++) {
        const a = (k / Math.max(1, count)) * Math.PI * 2;
        const w = lc.raids.summon({ at: { x: 24 + Math.cos(a) * 15, z: 24 + Math.sin(a) * 15 } });
        if (w) why.push(w);
      }
      return why;
    }, n);
    if (refused.length) console.log(`refused ${refused.length}: ${[...new Set(refused)].join('; ')}`);
    await play(warm);
    const t = await time(frames);
    console.log(`${n} raid(s): median ${t.median.toFixed(1)} ms, p95 ${t.p95.toFixed(1)} ms  [${await state()}]`);
    // Called off (undo), and the town back, before the next set.
    await page.evaluate(() => window.__lc.mischief.cancel());
    await play(2000);
  }
} finally {
  await browser.close();
  await server.close?.();
  process.exit(0);
}
