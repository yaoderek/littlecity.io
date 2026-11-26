#!/usr/bin/env node
/* global process, console, window, document */
// Motion cannot be judged from one screenshot. This renders a SEQUENCE: the
// real app, with its clock taken over so every frame is exactly 1/60 s, an
// optional edit, and N frames laid out as one contact sheet you can read
// left to right, top to bottom.
//
//   node src/life/testing/sequence.mjs <scenario> [options]
//
//   --time day|dusk|night|dawn|<phase 0..1>   hold that time of day (default day)
//   --run                    let the dusk cycle run from that time instead of holding it
//   --season winter|festival|<year 0..1> --weather snow|rain|...   hold a season and weather (default: as the app
//                            opens, summer and a clear sky, running); --settle brings the weather in at once
//   --year 0.74 --year-run   start the year there and let it run (so a change of season can be watched)
//   --warm 2000              milliseconds of life to play before the sequence starts
//   --edit 'place:house@10,1,10; erase@12,1,10; floor:path@9,1,9; kind:tower@10,1,10; edge:fence@10,1,10,E'
//                            edits applied at the first frame (x,y,z are grid cells; y is the level)
//            'raise@10,12; dig@10,12,14,12; level:2@8,8,12,12'
//                            shaping the land: one column (x,z) or a rectangle (x0,z0,x1,z1), one level up or
//                            down, or one step toward a height (level:<h>); each is one edit, as one brush dab
//   --then '<edits>' --after 400   a second batch of edits, that many ms into the sequence
//   mischief (design section 13b), in either list: 'fire@10,1,10' sets that block alight, 'strike@10,1,10' strikes it with lightning, 'bomb@10,1,10'
//   drops a bomb on the floor of that cell (y = the level it lands on), 'knock@10,1,10' knocks its
//   the raid: 'raid@10,0,10' summons raiders near that cell (the kind as the island and chance choose),
//   'raidland@…' a landing raid, 'raidboats@…' a boats raid; 'shipsink@0,0,0' drops a bomb on the raid's ship
//   (x: cells off its side); 'knockall@0,0,0' knocks every building a stage worse. --follow-raid keeps the camera on the raid (its ship, then the band).
//   building a stage worse, 'mend@10,1,10' / 'mendall@10,1,10' mends it, 'undo@0,0,0' presses undo,
//   'ufo@10,1,10' calls the UFO there (it comes for the nearest person on screen),
//   'crowdbomb@d,0,0' / 'crowdnuke@d,0,0' drops one d cells off the busiest knot of people out and aims the camera there
//   --hand person|dog|cat|hen|sheep|soldier|grazer|horse|rider|pigeon|<boat or ship kind>|building,<dx>,<dz>,<ms>[,drop]   the Mischief drawer's Hand, with real
//                            mouse events: picks up the one of that kind nearest the camera's target, carries it
//                            <dx>,<dz> cells over <ms> milliseconds of the sequence and lets go moving (a throw)
//                            or, with 'drop', after holding still (a drop). The camera is aimed at it first.
//   --frames 8 --every 100   how many frames to keep, and the milliseconds between them
//   --zoom 3 --target 10,1,10 --yaw 45 --pitch 35   move the camera (the app opens on the scenario's first camera)
//   --size 640x400 --scale 1 --cols 4
//   --name bounce            output: .context/shots/seq/<scenario>-<name>.png (and each frame beside it with --keep)
//
// Examples
//   node src/life/testing/sequence.mjs fx-landing --edit 'place:house@24,1,24' --frames 12 --every 33 --name land
//   node src/life/testing/sequence.mjs L07.window-light --time 0.6 --run --frames 12 --every 3000 --name dusk
//
// It drives window.__lc (the app's debug handle) and nothing else.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../../tools/lib/browser.mjs';
import { parseArgs, ROOT, startServer } from '../../../tools/lib/vite.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const scenario = positional[0];
if (!scenario) {
  console.error('usage: node src/life/testing/sequence.mjs <scenario> [--edit ...] [--frames 8] [--every 100] (see the file header)');
  process.exit(1);
}
const [width, height] = String(flags.size ?? '640x400').split('x').map(Number);
const scale = Number(flags.scale ?? 1);
const frames = Number(flags.frames ?? 8);
const every = Number(flags.every ?? 100);
const warm = Number(flags.warm ?? 2000);
const cols = Number(flags.cols ?? 4);
const name = String(flags.name ?? 'seq');
const outDir = path.resolve(ROOT, String(flags.out ?? '.context/shots/seq'));
const FRAME = 1000 / 60;

/** 'place:house@10,1,10; erase@3,1,4' → edit descriptions the page turns into Edits. */
function parseEdits(text) {
  if (!text || text === true) return [];
  return String(text)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [head, where] = s.split('@');
      const [verb, what] = head.split(':');
      const parts = where.split(',').map((p) => p.trim());
      return { verb, what, x: Number(parts[0]), y: Number(parts[1]), z: Number(parts[2]), side: parts[3], parts: parts.map(Number) };
    });
}

const server = await startServer();
const browser = await launchBrowser();
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.clock.install({ time: 0 });
  // A scenario name, or seed:N for a fresh island of that seed.
  let query = scenario.startsWith('seed:') ? `seed=${Number(scenario.slice(5))}` : `scenario=${encodeURIComponent(scenario)}`;
  if (flags.season !== undefined) query += `&season=${encodeURIComponent(String(flags.season))}`;
  if (flags.weather !== undefined) query += `&weather=${encodeURIComponent(String(flags.weather))}`;
  if (flags.settle) query += '&settle=1';
  await page.goto(`${server.url}/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lc !== undefined, null, { timeout: 60_000 });
  // The interface is not what is being looked at.
  await page.addStyleTag({ content: 'body > *:not(#town) { display: none !important; }' });
  // The page's clock has been running since it loaded (a slow start can take seconds): stop it just ahead of now.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500);

  /** Plays `ms` of the app's frame loop, one 60 fps frame at a time. */
  const play = async (ms) => {
    const n = Math.max(0, Math.round(ms / FRAME));
    for (let i = 0; i < n; i++) await page.clock.runFor(FRAME);
  };

  await play(200);
  await page.evaluate(
    ([time, run, cam]) => {
      const lc = window.__lc;
      const s = lc.signals;
      if (typeof time === 'number') {
        s.hold('day');
        s.setPhase(time);
        // hold('day') parks the cycle; setPhase moves it. With --run it is released below.
      } else s.hold(time);
      if (run) {
        const phase = s.time.phase;
        s.hold('run');
        s.setPhase(phase);
      }
      const pose = {};
      if (cam.zoom !== undefined) pose.zoom = cam.zoom;
      if (cam.yaw !== undefined) pose.yaw = cam.yaw;
      if (cam.pitch !== undefined) pose.pitch = cam.pitch;
      if (cam.target) pose.target = cam.target;
      if (Object.keys(pose).length) lc.view.setCamera(pose);
      if (cam.year !== undefined) {
        s.setYear(cam.year);
        if (cam.yearRun) s.holdSeason('run');
      }
    },
    [
      flags.time === undefined ? 'day' : Number.isNaN(Number(flags.time)) ? flags.time : Number(flags.time),
      Boolean(flags.run),
      {
        zoom: flags.zoom === undefined ? undefined : Number(flags.zoom),
        yaw: flags.yaw === undefined ? undefined : Number(flags.yaw),
        pitch: flags.pitch === undefined ? undefined : Number(flags.pitch),
        target: flags.target === undefined ? undefined : String(flags.target).split(',').map(Number),
        year: flags.year === undefined ? undefined : Number(flags.year),
        yearRun: Boolean(flags['year-run']),
      },
    ],
  );
  await play(warm);

  // --door [n]: play on (up to --wait ms) until somebody is about to go in or come out of a door (or a
  // hatch), then aim the camera at that door. n skips the first n doors found.
  if (flags.door !== undefined) {
    const skip = flags.door === true ? 0 : Number(flags.door);
    const lead = Number(flags.lead ?? 1.1);
    const seen = new Set();
    let found = null;
    for (let waited = 0; waited < Number(flags.wait ?? 120000) && !found; waited += 100) {
      const hit = await page.evaluate((lead) => {
        const crowd = window.__lcPeople;
        if (!crowd) return null;
        for (const p of crowd.people) {
          if (p.mode !== 'walk' || !p.walk) continue;
          const cur = p.walk[p.at], next = p.walk[p.at + 1];
          if (!cur || !next || next.kind !== 'door') continue;
          const key = `${next.door?.feature}`;
          if (cur.kind === 'move' && (1 - p.t) * cur.length < lead) return { key, x: next.x0, y: next.base, z: next.z0, out: false };
          if (cur.kind === 'hide' || (p.at === 0 && cur.kind === 'door')) return { key, x: next.x1, y: next.base, z: next.z1, out: true };
        }
        for (const p of crowd.people) {
          if (p.mode !== 'walk' || !p.walk || p.at !== 0) continue;
          const cur = p.walk[0];
          if (cur.kind === 'door' && p.t < 0.3) return { key: `${cur.door?.feature}`, x: cur.x1, y: cur.base, z: cur.z1, out: true };
        }
        return null;
      }, lead);
      if (hit && !seen.has(hit.key)) {
        seen.add(hit.key);
        if (seen.size > skip) found = hit;
      }
      if (!found) await play(100);
    }
    if (!found) console.log('--door: nobody went through a door in time');
    else {
      console.log(`--door: ${found.out ? 'out of' : 'into'} ${found.key} at ${found.x.toFixed(2)},${found.y.toFixed(2)},${found.z.toFixed(2)}`);
      await page.evaluate(([x, y, z, zoom]) => window.__lc.view.setCamera({ target: [x, y + 0.25, z], ...(zoom ? { zoom } : {}) }), [found.x, found.y, found.z, flags.zoom === undefined ? undefined : Number(flags.zoom)]);
    }
  }

  let shipAt = null;
  const applyEdits = (list) =>
    page.evaluate(([edits, ship]) => {
      const lc = window.__lc;
      const key = (x, y, z) => x | (z << 6) | (y << 12);
      const done = [];
      for (const e of edits) {
        const cell = key(e.x, e.y, e.z);
        const m = lc.mischief;
        if (e.verb === 'fire') { done.push(m.ignite(cell) ? 'lit' : 'would not catch'); continue; }
        if ((e.verb === 'shipbomb' || e.verb === 'shipnuke') && ship) {
          const mx = ship.x + Math.sin(ship.yaw) * ship.mid, mz = ship.z + Math.cos(ship.yaw) * ship.mid;
          const off = ship.beam + e.x;
          const px = mx - Math.cos(ship.yaw) * off * ship.dir, pz = mz + Math.sin(ship.yaw) * off * ship.dir;
          if (e.verb === 'shipnuke') m.dropNuke([px, 0.4, pz]);
          else m.dropBomb([px, 1.2, pz]);
          done.push(e.verb);
          continue;
        }
        if (e.verb === 'strike') {
          // Lightning: on the top of the building in that column.
          let top = e.y;
          while (lc.world().blocks.has(key(e.x, top + 1, e.z))) top++;
          done.push(m.strike(key(e.x, top, e.z), [e.x + 0.5, (top + 1) * 0.8, e.z + 0.5]) ? 'struck' : 'struck, would not catch');
          continue;
        }
        if (e.verb === 'raid' || e.verb === 'raidland' || e.verb === 'raidboats') {
          // The raid: a longship near that cell (raid: as the island and chance choose; raidland, raidboats: that kind).
          const why = lc.raids.summon({ at: { x: e.x + 0.5, z: e.z + 0.5 }, ...(e.verb === 'raidland' ? { kind: 'landing' } : e.verb === 'raidboats' ? { kind: 'boats' } : {}) });
          done.push(why ? `no raid: ${why}` : `raid (${lc.raids.current.kind})`);
          continue;
        }
        if (e.verb === 'shipsink' && lc.raids.current) {
          // Bombs the raid's ship (a boats raid: its first boat) where it is now (d cells off its side).
          const s = lc.raids.current.lead;
          m.dropBomb([s.x + Math.cos(s.yaw) * e.x, 0.6, s.z - Math.sin(s.yaw) * e.x]);
          done.push(`bombed the ${s.kind === 'ship' ? 'longship' : 'first boat'}`);
          continue;
        }
        if (e.verb === 'crowdbomb' || e.verb === 'crowdnuke') {
          // Where most people are out (blown about): the bomb there (x cells off along +x), the camera on it.
          const out = (window.__lcPeople?.people ?? []).filter((p) => p.visible && (p.mode === 'walk' || p.mode === 'linger'));
          let best = null, bestN = -1;
          for (const p of out) {
            const n = out.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.5).length;
            if (n > bestN) { bestN = n; best = p; }
          }
          if (!best) { done.push('nobody out'); continue; }
          const px = best.x + e.x, pz = best.z;
          if (e.verb === 'crowdnuke') m.dropNuke([px, best.y, pz]);
          else m.dropBomb([px, best.y, pz]);
          lc.view.setCamera({ target: [best.x, best.y + 0.2, best.z] });
          done.push(`${e.verb} at ${px.toFixed(1)},${pz.toFixed(1)} (${bestN} near)`);
          continue;
        }
        if (e.verb === 'ufo') {
          // As the tool does: whoever it takes is somebody on screen now.
          const v = window.__lc.view, c = v.canvas.getBoundingClientRect();
          const seen = (x, y, z) => { const [sx, sy] = v.worldToScreen([x, y, z]); return sx >= 16 && sy >= 16 && sx <= c.width - 16 && sy <= c.height - 16; };
          done.push(window.__lcUfo?.call(e.x + 0.5, e.y * 0.8, e.z + 0.5, seen) ? 'ufo called' : 'no ufo');
          continue;
        }
        if (e.verb === 'bomb') { m.dropBomb([e.x + 0.5, e.y * 0.8, e.z + 0.5]); done.push('bomb'); continue; }
        if (e.verb === 'nuke') { m.dropNuke([e.x + 0.5, e.y * 0.8, e.z + 0.5]); done.push('nuke'); continue; }
        if (e.verb === 'knockall') {
          // Every building a stage worse (a town like the owner's: wrecked and mending when the raiders come).
          let n = 0;
          for (const st of lc.shape().structures.values()) if (['house', 'tower', 'marble', 'windmill', 'lighthouse'].includes(st.kind) && m.knock(st.cells[0])) n++;
          done.push(`knocked ${n}`);
          continue;
        }
        if (e.verb === 'knock') { done.push(m.knock(cell) ? 'knocked' : 'no'); continue; }
        if (e.verb === 'mend' || e.verb === 'mendall') { done.push(m.mend(cell, e.verb === 'mendall') ? 'mended' : 'no'); continue; }
        if (e.verb === 'undo') { if (!(m.active && (m.cancel(), true))) lc.game.undo(); done.push('undone'); continue; }
        let edit;
        if (e.verb === 'raise' || e.verb === 'dig' || e.verb === 'level') {
          // Shaping the land: a column (x,z) or a rectangle of them (x0,z0,x1,z1).
          const [x0, z0, x1 = x0, z1 = z0] = e.parts;
          const cols = [];
          for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cols.push(x + z * 48);
          const h = lc.terrain().height;
          if (e.verb === 'raise') edit = { type: 'land', up: cols, down: [] };
          else if (e.verb === 'dig') edit = { type: 'land', up: [], down: cols };
          else edit = { type: 'land', up: cols.filter((c) => h[c] < Number(e.what)), down: cols.filter((c) => h[c] > Number(e.what)) };
        } else if (e.verb === 'place') edit = { type: 'placeBlock', cell, kind: e.what, color: 'auto', from: null };
        else if (e.verb === 'erase') edit = { type: 'eraseBlock', cell };
        else if (e.verb === 'floor') edit = { type: 'placeFloor', cell, floor: e.what };
        else if (e.verb === 'nofloor') edit = { type: 'eraseFloor', cell };
        else if (e.verb === 'kind') edit = { type: 'setKind', cell, kind: e.what };
        else if (e.verb === 'paint') edit = { type: 'paint', cell, color: Number(e.what) };
        else if (e.verb === 'edge') edit = { type: 'placeEdge', edge: cell * 2 + (e.side === 'S' ? 1 : 0), kind: e.what };
        else if (e.verb === 'noedge') edit = { type: 'eraseEdge', edge: cell * 2 + (e.side === 'S' ? 1 : 0) };
        else throw new Error(`unknown edit '${e.verb}'`);
        const verdict = lc.game.edit(edit);
        done.push(verdict.ok ? 'ok' : `refused: ${verdict.reason}`);
      }
      return done;
    }, [list, shipAt]);

  // --grow [ms]: start Grow a town from the menu (on a seed:N island), then play that long into it.
  if (flags.grow !== undefined) {
    await page.evaluate(() => {
      document.querySelector('[data-ui="menu-button"]')?.click();
      document.querySelector('[data-menu="grow"]')?.click();
    });
    await play(flags.grow === true ? 1500 : Number(flags.grow));
  }

  const first = parseEdits(flags.edit);
  const second = parseEdits(flags.then);
  const after = Number(flags.after ?? 0);
  // --ship moored|underway: play on until a big ship is alongside (or under way inside the map), and aim the
  // camera at it; then the verbs 'shipbomb@<d>,0,0' and 'shipnuke@<d>,0,0' hit it from <d> cells off its sea side.
  if (flags.ship) {
    let at = null;
    for (let waited = 0; waited < Number(flags.wait ?? 240000) && !at; waited += 250) {
      at = await page.evaluate((want) => {
        const h = window.__lcHarbour;
        const ok = (s) => (want === 'underway' ? (s.phase === 'arriving' || s.phase === 'leaving') && s.pose.x > 4 && s.pose.x < 44 && s.pose.z > 4 && s.pose.z < 44 : s.phase === 'moored');
        const s = h?.ships.find(ok);
        return s ? { x: s.pose.x, z: s.pose.z, yaw: s.pose.yaw, beam: s.hull.halfBeam, dir: s.dir, mid: (s.hull.stern + s.hull.bow) / 2 } : null;
      }, String(flags.ship));
      if (!at) await play(250);
    }
    if (!at) console.log('--ship: no ship in time');
    else {
      console.log(`--ship: at ${at.x.toFixed(2)},${at.z.toFixed(2)}`);
      shipAt = at;
      await page.evaluate(([x, z]) => window.__lc.view.setCamera({ target: [x, 0.6, z] }), [at.x + Math.sin(at.yaw) * at.mid, at.z + Math.cos(at.yaw) * at.mid]);
    }
  }
  if (first.length) console.log(`edits: ${(await applyEdits(first)).join(', ')}`);

  // --shore: after the edits, play on until somebody is about to come ashore (a new home's people) or step
  // off at a way out (an erased home's), and aim the camera there.
  if (flags.shore) {
    let hit = null;
    for (let waited = 0; waited < Number(flags.wait ?? 60000) && !hit; waited += 50) {
      hit = await page.evaluate((which) => {
        const crowd = window.__lcPeople;
        for (const p of crowd.people) {
          if (p.mode === 'wait' && p.fade === 0 && (p.edgeX || p.edgeZ) && p.timer < 0.3) return { x: p.x, y: p.y, z: p.z, what: 'ashore' };
          if (which !== 'ashore' && p.mode === 'walk' && p.goal?.kind === 'leave' && p.walk && p.at === p.walk.length - 1 && p.t > 0.5) return { x: p.x, y: p.y, z: p.z, what: 'leaving' };
        }
        return null;
      }, flags.shore);
      if (!hit) await play(50);
    }
    if (!hit) console.log('--shore: nobody came ashore or left in time');
    else {
      console.log(`--shore: ${hit.what} at ${hit.x.toFixed(2)},${hit.y.toFixed(2)},${hit.z.toFixed(2)}`);
      await page.evaluate(([x, y, z]) => window.__lc.view.setCamera({ target: [x, y + 0.2, z] }), [hit.x, hit.y, hit.z]);
    }
  }

  // --aim '<expression>': aim the camera at [x, y, z] from an expression evaluated in the page, e.g.
  //   --aim '(g => [g.list[0].troop.soldiers[0].x, g.list[0].troop.soldiers[0].y, g.list[0].troop.soldiers[0].z])(window.__lcGarrison)'
  // --follow re-aims it before every frame.
  const aim = async () => {
    const at = await page.evaluate((expr) => (0, eval)(expr), String(flags.aim));
    // [x, y, z] aims; a fourth number also turns the camera to that yaw (degrees).
    if (Array.isArray(at)) await page.evaluate((p) => window.__lc.view.setCamera({ target: [p[0], p[1] + 0.25, p[2]], ...(p.length > 3 ? { yaw: p[3] } : {}) }), at);
  };
  if (flags.aim) await aim();

  // --gust: play on until a gust front is about to reach the middle of the map (it is felt 12 columns
  // upwind of it), so the frames that follow show it crossing.
  if (flags.gust) {
    for (let waited = 0; waited < 40000; waited += 50) {
      const near = await page.evaluate(() => {
        const s = window.__lc.signals;
        const c = s.wind(24, 24);
        const up = s.wind(24 - c.dirX * 12, 24 - c.dirZ * 12);
        return up.strength > c.strength + 0.25;
      });
      if (near) break;
      await play(50);
    }
  }

  // --delay ms: play this long before the first frame (after any --door or --shore aim).
  if (flags.delay) await play(Number(flags.delay));

  // --hand: pick something up and carry it (see the header).
  let hand = null;
  if (flags.hand) {
    const [what, dx, dz, ms, drop] = String(flags.hand).split(',');
    const found = await page.evaluate((kind) => {
      const lc = window.__lc;
      lc.ui.tray.select('hand');
      const t = lc.view.getCamera().target;
      let best = null, bestD = Infinity;
      const consider = (x, y, z) => {
        const d = Math.hypot(x - t[0], z - t[2]);
        if (d < bestD) { bestD = d; best = { x, y, z }; }
      };
      if (kind === 'building') {
        // The top of the house nearest the camera's target.
        const shape = lc.shape();
        for (const [cell, k] of shape.kinds) {
          if (k !== 'house' || shape.kinds.get(cell + 4096) !== undefined) continue;
          consider((cell & 63) + 0.5, (cell >> 12) * 0.8 + 0.8, ((cell >> 6) & 63) + 0.5);
        }
      } else if (kind === 'person') for (const p of window.__lcPeople?.people ?? []) { if (p.visible && (p.mode === 'walk' || p.mode === 'linger')) consider(p.x, p.y + 0.2, p.z); }
      else for (const c of window.__lcThrown?.critters.values() ?? []) { if (c.kind === kind && !c.body) consider(c.x, c.y + c.height * 0.5, c.z); }
      return best;
    }, what);
    if (!found) console.log(`--hand: no ${what} to pick up`);
    else {
      await page.evaluate(([x, y, z]) => window.__lc.view.setCamera({ target: [x, y, z] }), [found.x, found.y, found.z]);
      await play(FRAME * 2);
      const box = await page.locator('#town').boundingBox();
      const at = async (x, y, z) => { const [sx, sy] = await page.evaluate((p) => window.__lc.view.worldToScreen(p), [x, y, z]); return [box.x + sx, box.y + sy]; };
      const [sx, sy] = await at(found.x, found.y, found.z);
      const [ex, ey] = await at(found.x + Number(dx), found.y + 1, found.z + Number(dz));
      hand = { sx, sy, ex, ey, ms: Number(ms), drop: drop === 'drop', t: 0, down: false, up: false };
      console.log(`--hand: ${what} at ${found.x.toFixed(1)},${found.z.toFixed(1)}`);
    }
  }
  /** Plays `ms`, moving the Hand's pointer along its way frame by frame. */
  const playHand = async (ms) => {
    if (!hand || hand.up) return play(ms);
    const n = Math.max(1, Math.round(ms / FRAME));
    for (let k = 0; k < n; k++) {
      if (!hand.down) {
        await page.mouse.move(hand.sx, hand.sy);
        await page.mouse.down();
        hand.down = true;
      } else if (!hand.up) {
        // Held still a moment, then along the way: eased in, so the end is the fastest part (a flick);
        // for a drop, there by two thirds of the way and still after.
        const u = Math.max(0, Math.min(1, (hand.t - 250) / Math.max(1, hand.ms - 250)));
        const k2 = hand.drop ? Math.min(1, u * 1.5) : u * u;
        await page.mouse.move(hand.sx + (hand.ex - hand.sx) * k2, hand.sy + (hand.ey - hand.sy) * k2);
        if (u >= 1) {
          await page.mouse.up();
          hand.up = true;
        }
      }
      await page.clock.runFor(FRAME);
      hand.t += FRAME;
      if (flags.verbose && Math.round(hand.t / FRAME) % 6 === 0) console.log(await page.evaluate(() => { const t = window.__lcThrown?.thrower; const c = window.__lc.view.getCamera(); return `cam ${c.target.map((v) => v.toFixed(1))} ` + [...(t?.thrown.values() ?? [])].map((x) => `${x.person.id} ${x.body.phase} ${x.body.x.toFixed(2)},${x.body.y.toFixed(2)},${x.body.z.toFixed(2)}`).join(' | '); }));
    }
  };

  const shots = [];
  let secondDone = second.length === 0;
  for (let i = 0; i < frames; i++) {
    // The first frame is the very next one after the edit: what the player sees first.
    await playHand(i === 0 ? FRAME : every);
    const at = i === 0 ? FRAME : FRAME + i * every;
    if (!secondDone && at >= after) {
      secondDone = true;
      console.log(`then: ${(await applyEdits(second)).join(', ')}`);
      await play(FRAME);
    }
    if (flags.aim && flags.follow) {
      await aim();
      // Drawn once from there (the clock is held: the camera moves only when a frame is drawn).
      await play(FRAME);
    }
    if (flags['follow-raid']) {
      await page.evaluate(() => {
        const r = window.__lc.raids?.current;
        if (!r) return;
        const f = r.focus();
        window.__lc.view.setCamera({ target: [f.x, f.y + 0.3, f.z] });
      });
    }
    const png = await page.locator('#town').screenshot();
    shots.push({ png, label: `${Math.round(at)} ms` });
    // --open all | --open door@<cell>:<dir>,…: after the first frame, those doors swing open and stay open.
    if (i === 0 && flags.open) {
      await page.evaluate((which) => {
        const crowd = window.__lcPeople;
        const keys = which === 'all' || which === true ? crowd.nav.doors.map((d) => d.feature) : String(which).split(',');
        for (const k of keys) crowd.doors.stand(k, true, 0);
      }, flags.open);
    }
    if (flags.keep) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, `${scenario}-${name}-${String(i).padStart(2, '0')}.png`), png);
    }
  }

  // The contact sheet: every frame in one picture.
  const sheet = await ctx.newPage();
  const rows = Math.ceil(shots.length / cols);
  await sheet.setViewportSize({ width: cols * width + (cols + 1) * 6, height: rows * (height + 22) + 6 });
  await sheet.setContent(
    `<body style="margin:0;background:#2b2622;font:12px/16px system-ui;color:#f2ede3"><div style="display:grid;grid-template-columns:repeat(${cols},${width}px);gap:6px;padding:6px">${shots
      .map((s) => `<div><img width="${width}" height="${height}" style="display:block" src="data:image/png;base64,${s.png.toString('base64')}"><div style="height:16px">${s.label}</div></div>`)
      .join('')}</div></body>`,
  );
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${scenario}-${name}.png`);
  await sheet.screenshot({ path: file });
  console.log(`${path.relative(ROOT, file)}  (${shots.length} frames, ${every} ms apart)`);
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
