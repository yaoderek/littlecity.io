// Where raids come ashore (site.ts): on every grown town both kinds of raid
// find a shore near the town and a way in from the edge of the map; the boats
// go to landings spread round the town; every landing is on the town's
// walking graph; the same town and seed always plan the same raid.

import { describe, expect, test } from 'vitest';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { resolveTown } from '@/resolve';
import { mapEdge } from '@/rules/life/ship-routes';
import { pathAt } from '@/rules/life/ship-routes';
import { landingsOf, planRaid, raidField, townHeart } from './site';

const TOWNS = ['grown-harbour', 'grown-market', 'grown-town-1', 'grown-farming'];

describe('raid sites', () => {
  for (const name of TOWNS) {
    test(`${name}: a landing and a boats raid, from beyond the edge, ashore near the town`, () => {
      const built = buildScenario(findScenario(name)!);
      const { shape, dressing } = resolveTown(built.world, built.terrain);
      for (const kind of ['landing', 'boats'] as const) {
        const s = planRaid(shape, dressing.nav, 7, { kind });
        expect(s, kind).not.toBeNull();
        expect(s!.kind).toBe(kind);
        // In from beyond the edge of the map and out beyond it again.
        expect(mapEdge(pathAt(s!.voyage.arrive, 0).x, pathAt(s!.voyage.arrive, 0).z)).toBeGreaterThan(0);
        const leave = s!.voyage.leave;
        expect(mapEdge(pathAt(leave, leave.length).x, pathAt(leave, leave.length).z)).toBeGreaterThan(0);
        for (const l of s!.landings) {
          expect(dressing.nav.nodeAt.get(l.cell)).toBe(l.node);
          expect(Math.hypot(l.x - s!.heart.x, l.z - s!.heart.z)).toBeLessThan(18);
        }
        if (kind === 'boats') {
          expect(s!.landings.length).toBeGreaterThanOrEqual(2);
          expect(s!.landings.length).toBeLessThanOrEqual(4);
          expect(s!.boatPaths.length).toBe(s!.landings.length);
          // Each boat its own way, from beyond the edge to its landing and out over the edge again (no ship to put them off).
          expect(s!.boatWays.length).toBe(s!.landings.length);
          s!.boatWays.forEach((w, i) => {
            const a = pathAt(w.arrive, 0), end = pathAt(w.arrive, w.arrive.length), out = pathAt(w.leave, w.leave.length);
            expect(mapEdge(a.x, a.z), `boat ${i} comes in from beyond the edge`).toBeGreaterThan(0);
            expect(mapEdge(out.x, out.z), `boat ${i} leaves over the edge`).toBeGreaterThan(0);
            const l = s!.landings[i]!;
            expect(Math.hypot(end.x - l.x, end.z - l.z), `boat ${i} comes to its landing`).toBeLessThan(1.6);
          });
          // Hit from more than one side: the landings are apart.
          const [a, b] = s!.landings;
          expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThanOrEqual(4);
        }
        // The same town and seed plan the same raid.
        expect(JSON.stringify(planRaid(shape, dressing.nav, 7, { kind })?.landings.map((l) => l.cell))).toBe(JSON.stringify(s!.landings.map((l) => l.cell)));
      }
    }, 120_000);
  }
});

// The Raid tool's click (Derek, 2026-11-25: "the boat goes to the nearest coast on where you clicked"): the
// landing is on the shore nearest the click that a vessel can reach, and the vessel comes in from that side.
describe('raid sites from a click', () => {
  for (const name of ['grown-harbour', 'grown-market']) {
    test(`${name}: clicks round the town, inland and out at sea land on the nearest shore, coming in from that side`, () => {
      const built = buildScenario(findScenario(name)!);
      const { shape, dressing } = resolveTown(built.world, built.terrain);
      const nav = dressing.nav;
      const heart = townHeart(shape)!;
      const shore = landingsOf(shape, nav, raidField(shape));
      const nearestShore = (p: { x: number; z: number }): number => Math.min(...shore.map((o) => Math.hypot(o.x - p.x, o.z - p.z)));
      // Clicks all round the town (on the sea or the land), on the town's middle (inland) and far out at sea.
      const clicks: { x: number; z: number; what: string }[] = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        clicks.push({ x: Math.max(1, Math.min(47, heart.x + Math.cos(a) * 12)), z: Math.max(1, Math.min(47, heart.z + Math.sin(a) * 12)), what: `round ${k}` });
      }
      clicks.push({ ...heart, what: 'inland' });
      const corners = [[2, 2], [46, 2], [2, 46], [46, 46]].map(([x, z]) => ({ x: x!, z: z! }));
      corners.sort((a, b) => nearestShore(b) - nearestShore(a));
      clicks.push({ ...corners[0]!, what: 'out at sea' });
      for (const c of clicks) {
        const s = planRaid(shape, nav, 11, { near: c });
        expect(s, c.what).not.toBeNull();
        const l = s!.landings[0]!;
        // On the shore nearest the click (the very nearest, or a little along it where a vessel can get in).
        expect(Math.hypot(l.x - c.x, l.z - c.z), `${c.what}: landing ${l.x},${l.z} for a click at ${c.x.toFixed(1)},${c.z.toFixed(1)}`).toBeLessThan(nearestShore(c) + 4);
        // Coming in from that side: its way in starts beyond the edge of the map near the landing.
        const a0 = pathAt(s!.voyage.arrive, 0);
        const edge = Math.min(l.x, l.z, 48 - l.x, 48 - l.z);
        expect(Math.hypot(a0.x - l.x, a0.z - l.z), `${c.what}: comes in from the side clicked`).toBeLessThan(edge + 18);
        // A longship only where there is a beach.
        if (s!.kind === 'landing') expect(l.sand || l.near.some((n) => n.sand), c.what).toBe(true);
      }
      // Two clicks on one spot: two landings, not on top of each other.
      const c = clicks[0]!;
      const one = planRaid(shape, nav, 11, { near: c })!;
      const two = planRaid(shape, nav, 12, { near: c, avoid: one.landings.map((l) => ({ x: l.x, z: l.z })) });
      expect(two).not.toBeNull();
      for (const a of one.landings) for (const b of two!.landings) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(2.6);
    }, 120_000);
  }
});
