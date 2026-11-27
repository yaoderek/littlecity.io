#!/usr/bin/env node
/* global console, window, performance, process */
// Frame cost of the castle's garrison against a raid (sally.ts), on a phone-sized page with the processor
// slowed 4x: no raid; then one landing raid with the band ashore before the soldiers reach it; then the
// melee (several dust-cloud brawls); then the soldiers seeing it off. Same page, same run.
//
//   node src/life/testing/sally-cost.mjs [scenario] [--at 5,33] [--size 390x844] [--throttle 4] [--frames 180]

import { launchBrowser, openPage } from '../../../tools/lib/browser.mjs';
import { parseArgs, startServer } from '../../../tools/lib/vite.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const scenario = positional[0] ?? 'raid-landing';
const [width, height] = String(flags.size ?? '390x844').split('x').map(Number);
const [ax, az] = String(flags.at ?? '5,33').split(',').map(Number);
const frames = Number(flags.frames ?? 180);
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
  const step = () => page.clock.runFor(FRAME);
  const time = async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      await step();
      out.push(performance.now() - t0);
    }
    out.sort((a, b) => a - b);
    return `median ${out[n >> 1].toFixed(1)} ms, p95 ${out[Math.floor(n * 0.95)].toFixed(1)} ms`;
  };
  const state = () =>
    page.evaluate(() => {
      const r = window.__lc.raids.current;
      const g = window.__lcGarrison?.list[0];
      const hidden = g?.out?.soldiers.filter((f) => f.hidden).length ?? 0;
      return `raid ${r?.beat ?? 'none'}, ${r ? r.raiders.filter((x) => x.person).length : 0} ashore, garrison ${g?.out ? `out (${hidden} in brawls)` : 'in'}, ${window.__lc.raids.handles()} raid handles, ${window.__lc.mischief.engine.burning().length} cells burning`;
    });
  const until = async (pred, most = 60 * 120) => {
    for (let i = 0; i < most; i++) {
      if (await page.evaluate(pred)) return true;
      await step();
    }
    return false;
  };
  for (let i = 0; i < 180; i++) await step();
  console.log(`no raid: ${await time(frames)}  [${await state()}]`);
  console.log(await page.evaluate(([x, z]) => window.__lc.raids.summon({ at: { x, z }, kind: 'landing' }) ?? 'summoned', [ax + 0.5, az + 0.5]));
  await until(() => window.__lc.raids.current?.beat === 'ashore');
  console.log(`band ashore, soldiers on the way: ${await time(Math.min(frames, 120))}  [${await state()}]`);
  await until(() => (window.__lcGarrison?.list[0]?.out?.soldiers.filter((f) => f.hidden).length ?? 0) >= 2);
  console.log(`the melee: ${await time(Math.min(frames, 120))}  [${await state()}]`);
  await until(() => window.__lc.raids.current?.repelled === true);
  console.log(`broken, seen off: ${await time(frames)}  [${await state()}]`);
} finally {
  await browser.close();
  await server.close?.();
  process.exit(0);
}
