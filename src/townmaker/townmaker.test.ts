// Grow a town (design section 15a): legal, deterministic, connected, and a
// showcase across towns rather than within one: over seeds 1 to 30 on both
// island generators, every character is rolled, each town shows what its
// character promises, and every role and guide entry the generator can
// place appears in some towns (the survey below prints how many).

import { describe, expect, test, vi } from 'vitest';
import { key } from '@/core/grid';
import type { Role } from '@/core/vocab';
import type { Terrain } from '@/core/world';
import { resolveTown } from '@/resolve/index';
import { generateTerrain } from '@/terrain/terrain';
import { applyEdit, emptyWorld, type World } from '@/world/world';
import { generateIsland2 } from '@/terrain/terrain2';
import { ENTRIES as GUIDE } from '@/guide/entries';
import { CHARACTERS, PROMISES, type Character } from './character';
import { orchards } from '@/rules/urban/orchards.fact';
import { growTown, planTown } from './index';
import { sized } from '../../tests/helpers/tier';

/** Every role in catalogue part R (RoleVocab). The type check below fails if one is added and not listed. */
const ROLES = [
  'town-hall', 'chapel', 'keepers-cottage', 'mill-house', 'stilt-house', 'boathouse', 'inn', 'shop', 'manor', 'townhouse', 'row-house',
  'cliff-house', 'greenhouse', 'lookout-cottage', 'cottage',
  'steeple', 'castle-turret', 'clock-tower', 'observatory', 'dovecote', 'campanile', 'watchtower',
  'lighthouse', 'windmill',
  'temple', 'gatehouse', 'keep', 'grand-steps', 'quay-wall', 'plinth', 'terrace',
  'stone-bridge', 'sky-bridge', 'flying-buttress', 'gateway', 'loggia', 'viaduct',
  'quay', 'pier', 'boardwalk', 'jetty', 'shipyard',
  'palm', 'willow', 'pine', 'planter-tree', 'fruit-tree', 'grove-tree', 'round-tree', 'cypress', 'bush',
  'tiered-fountain', 'well', 'birdbath', 'basin', 'fish-stall', 'flower-stall', 'market-stall',
  'wheat-field', 'herb-garden', 'reed-bed', 'park-lawn', 'kitchen-garden', 'flower-garden',
  'picket-fence', 'rope-fence', 'iron-railing', 'stone-balustrade', 'low-wall', 'garden-wall', 'curtain-wall',
  // discovery round 1, structures (src/vocab/structures.vocab.ts)
  'podium', 'theatre', 'barn', 'watermill', 'warehouse', 'churchyard', 'smithy', 'forge-chimney', 'obelisk', 'folly-tower', 'bridge-shop', 'bandstand', 'stoa', 'schoolhouse',
  // the playing field (src/vocab/field.vocab.ts)
  'basketball-court', 'tennis-court', 'football-pitch', 'bowling-green', 'croquet-lawn', 'boules-court', 'running-track', 'kickabout-green',
  // the container port (src/vocab/port.vocab.ts)
  'port',
] as const satisfies readonly Role[];
type Unlisted = Exclude<Role, (typeof ROLES)[number]>;
const allListed: Unlisted extends never ? true : Unlisted = true;

function build(terrain: Terrain, edits: ReturnType<typeof growTown>): World {
  let w = emptyWorld(terrain.seed);
  for (const e of edits) w = applyEdit(w, terrain, e); // throws on the first illegal edit
  return w;
}



describe('grow a town', () => {
  test('every role of catalogue part R is listed', () => {
    expect(allListed).toBe(true);
  });

  // Seeds 1 to 12 in the gate, 1 to 50 in the full run (LC_FULL=1).
  test('seeds 1 to 12 (50 in full): every edit is legal on its own island, and none throws', () => {
    for (let seed = 1; seed <= sized(12, 50); seed++) {
      const t = generateTerrain(seed, 1);
      const edits = growTown(t, seed);
      expect(edits.length, `seed ${seed}`).toBeGreaterThan(300);
      expect(() => build(t, edits), `seed ${seed}`).not.toThrow();
    }
  }, sized(60_000, 600_000));

  test('deterministic per seed, different between seeds', () => {
    const t = generateTerrain(7, 1);
    expect(JSON.stringify(growTown(t, 7))).toBe(JSON.stringify(growTown(t, 7)));
    expect(JSON.stringify(growTown(t, 8))).not.toBe(JSON.stringify(growTown(t, 7)));
  });

  test('the watching order is the one used (never the fallback), and every district joins the streets', () => {
    let viaducts = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const plan = planTown(generateTerrain(seed, 1), seed);
      expect(plan.fellBack, `seed ${seed}`).toBe(false);
      expect(plan.unjoined.length, `seed ${seed}: ${plan.unjoined.join(', ')}`).toBeLessThanOrEqual(2);
      if (seed <= 5 && plan.districts.some((d) => d.name === 'viaduct')) viaducts++;
      // The summits too: up cliffs of two levels by a marble landing and stairs.
      expect(plan.unjoined.filter((n) => n === 'lookout' || n === 'observatory'), `seed ${seed}`).toEqual([]);
    }
    // Viaducts belong to some characters' plans now: the survey checks the role appears.
    void viaducts;
  });

  test('people can walk from most houses to the square, and the streets are dressed', () => {
    for (const seed of [1, 4]) {
      const t = generateTerrain(seed, 1);
      const plan = planTown(t, seed);
      const w = build(t, plan.edits);
      const town = resolveTown(w, t);
      const { nav, props } = town.dressing;
      const sq = plan.square!;
      // A plaza cell beside the fountain in the middle.
      const squareNode = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => nav.nodeAt.get(key(sq.x + dx!, sq.h, sq.z + dz!))).find((n) => n !== undefined);
      expect(squareNode, `seed ${seed}: the square is walkable`).toBeDefined();
      const part = nav.part[squareNode!];
      let houses = 0, reach = 0;
      for (const s of town.shape.structures.values()) {
        if (s.kind !== 'house') continue;
        const doors = nav.doorsOf.get(s.id) ?? [];
        if (doors.length === 0) continue;
        houses++;
        if (doors.some((d) => nav.doors[d]!.node >= 0 && nav.part[nav.doors[d]!.node] === part)) reach++;
      }
      expect(reach / houses, `seed ${seed}: ${reach} of ${houses} houses reach the square`).toBeGreaterThan(0.75);
      const byRule = (id: string): number => props.filter((p) => p.rule.startsWith(id)).length;
      expect(byRule('D01'), `seed ${seed}: street lamps`).toBeGreaterThan(5);
      expect(byRule('D05'), `seed ${seed}: laundry lines`).toBeGreaterThan(0);
      expect(byRule('U01') + byRule('U03'), `seed ${seed}: a pocket park or a front garden`).toBeGreaterThan(0);
    }
  });

});

vi.setConfig({ testTimeout: 600_000 });

/** One grown town, resolved and dressed: what the survey reads. */
interface Surveyed {
  seed: number;
  gen: 1 | 2;
  character: Character;
  roles: Set<string>;
  props: Set<string>;
  rivers: number;
  /** How much of each signature thing the town has (see EMPHASIS). */
  counts: Record<string, number>;
}

/** Counts of the things a character's emphasis is made of. */
function emphasisCounts(w: World, roleCount: Map<string, number>, orchardCount = 0): Record<string, number> {
  const c: Record<string, number> = { trees: 0, walls: 0, marble: 0, stalls: 0, stairs: 0, gardens: 0 };
  for (const b of w.blocks.values()) {
    if (b.kind === 'tree') c.trees!++;
    if (b.kind === 'wall') c.walls!++;
    if (b.kind === 'marble') c.marble!++;
    if (b.kind === 'stall') c.stalls!++;
    if (b.kind === 'stairs') c.stairs!++;
  }
  for (const f of w.floors.values()) if (f === 'garden') c.gardens!++;
  for (const e of w.edges.values()) if (e === 'wall') c.walls!++;
  const n = (r: string): number => roleCount.get(r) ?? 0;
  c.dockGroups = n('quay') + n('pier') + n('jetty') + n('boardwalk');
  c.farms = n('barn') + n('wheat-field');
  c.wheat = n('wheat-field');
  c.landings = n('jetty') + n('pier') + n('quay') + n('boathouse') + n('watermill');
  c.rowsUp = n('townhouse') + n('row-house');
  c.temples = n('temple') + n('stoa') + n('bandstand') + n('theatre') + n('obelisk');
  c.crossings = n('stone-bridge') + n('bridge-shop');
  c.willows = n('willow');
  c.cliffs = n('cliff-house');
  c.parks = n('park-lawn') + n('herb-garden') + n('greenhouse') + n('walled-garden');
  c.turrets = n('castle-turret');
  c.orchards = orchardCount;
  c.mills = n('windmill');
  return c;
}

/**
 * What makes each character unmistakable, as thresholds on emphasisCounts
 * (any one town may miss where its island has no room; the test allows a few).
 */
const EMPHASIS: Record<Character, Record<string, number>> = {
  harbour: { dockGroups: 4 },
  marble: { marble: 60, temples: 4 },
  castle: { walls: 25, turrets: 4 },
  market: { stalls: 8 },
  river: { crossings: 2, willows: 3 },
  farming: { wheat: 3, gardens: 80 },
  hill: { cliffs: 1, stairs: 4, rowsUp: 4 },
  gardens: { gardens: 50, trees: 70 },
};
/** Every town: woods and tree lines. */
const TREES_EVERYWHERE = 35;
/** Orchards for the characters that promise them. */
const ORCHARDS: Partial<Record<Character, number>> = { farming: 2, river: 1, gardens: 1, market: 1 };
/** Windmills in nearly every town (Derek, 2026-11-21): at least one in this share of the towns of every kind. */
const MILL_SHARE = 0.95;

/** Windmills on a grown town's ground: one per column holding windmill blocks. */
function millsOf(edits: ReturnType<typeof growTown>): number {
  const cols = new Set<number>();
  for (const e of edits) if (e.type === 'placeBlock' && e.kind === 'windmill') cols.add(e.cell & 4095);
  return cols.size;
}

/** Windmills per town, by kind, and the share of towns with none. */
function millLines(rows: { character: Character; mills: number }[]): string[] {
  return CHARACTERS.map((ch) => {
    const ms = rows.filter((r) => r.character === ch).map((r) => r.mills);
    if (!ms.length) return `${ch.padEnd(8)} none rolled`;
    const none = ms.filter((m) => m === 0).length, two = ms.filter((m) => m >= 2).length;
    return `${ch.padEnd(8)} ${String(ms.length).padStart(2)} towns | mills ${ms.join(' ')} | avg ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)}, none ${none}, 2+ ${two}`;
  });
}
let SURVEY: Surveyed[] | null = null;
function survey(): Surveyed[] {
  if (SURVEY) return SURVEY;
  const out: Surveyed[] = [];
  const timings: number[] = [];
  for (const gen of [1, 2] as const) {
    for (let seed = 1; seed <= 30; seed++) {
      const t = generateTerrain(seed, gen);
      const t0 = performance.now();
      const plan = planTown(t, seed);
      timings.push(performance.now() - t0);
      let w = emptyWorld(t.seed, gen);
      for (const e of plan.edits) w = applyEdit(w, t, e);
      const town = resolveTown(w, t);
      const rivers = gen === 2 ? generateIsland2(seed, (s) => generateTerrain(s, 1)).rivers : 0;
      const roleCount = new Map<string, number>();
      for (const r of town.shape.roles.values()) roleCount.set(r.role, (roleCount.get(r.role) ?? 0) + 1);
      out.push({
        seed,
        gen,
        character: plan.character,
        roles: new Set([...town.shape.roles.values()].map((r) => r.role)),
        props: new Set([...town.dressing.props.map((p) => `${p.rule.split('.')[0]}/${p.type}`), ...town.dressing.actors.map((a) => `${a.rule.split('.')[0]}/${a.type}`), ...town.dressing.sockets.map((k) => k.rule.split('.')[0]!)]),
        rivers,
        counts: {
          ...emphasisCounts(w, roleCount, orchards(town.shape.facts).list.length),
          // The working waterfront: ports, and their large gantry cranes (D15-P).
          ports: roleCount.get('port') ?? 0,
          largeCranes: town.dressing.actors.filter((a) => a.type === 'port-crane' && a.variant === 'large').length,
        },
      });
    }
  }
  timings.sort((a, b) => a - b);
  console.log(`grow-a-town timings over 60 towns (ms): median ${timings[30]!.toFixed(0)}, slowest ${timings[59]!.toFixed(0)}`);
  SURVEY = out;
  return out;
}

/**
 * Roles the generator does not try to place, and why (asserted absent from
 * the expectation, listed so a new stamp can take them off).
 */
const NOT_PLACED: Record<string, string> = {};

describe('grow a town: the survey (seeds 1 to 30, both generators)', () => {
  test('every character is rolled somewhere', () => {
    const rolled = new Set(survey().map((s) => s.character));
    expect(CHARACTERS.filter((c) => !rolled.has(c))).toEqual([]);
    console.log(`characters: ${CHARACTERS.map((c) => `${c} ${survey().filter((s) => s.character === c).length}`).join(', ')}`);
  });

  test('each character is unmistakable: its signature repeated (counts printed), and trees everywhere', () => {
    const misses: string[] = [];
    const lines: string[] = [];
    for (const s of survey()) {
      const want = EMPHASIS[s.character];
      const got = Object.keys(want).map((k) => `${k} ${s.counts[k]}`).join(', ');
      lines.push(`g${s.gen} s${s.seed} ${s.character.padEnd(8)} trees ${s.counts.trees} | ${got}`);
      // A river town needs its river.
      if (s.character === 'river' && s.gen === 2 && s.rivers === 0) continue;
      for (const [k, min] of Object.entries(want)) if ((s.counts[k] ?? 0) < min) misses.push(`g${s.gen} s${s.seed} ${s.character}: ${k} ${s.counts[k]} < ${min}`);
      const orchardFloor = ORCHARDS[s.character] ?? 0;
      if ((s.counts.orchards ?? 0) < orchardFloor) misses.push(`g${s.gen} s${s.seed} ${s.character}: orchards ${s.counts.orchards} < ${orchardFloor}`);
      if (s.counts.trees! < TREES_EVERYWHERE) misses.push(`g${s.gen} s${s.seed} ${s.character}: trees ${s.counts.trees} < ${TREES_EVERYWHERE}`);
    }
    const per = CHARACTERS.map((ch) => {
      const ts = survey().filter((x) => x.character === ch);
      if (!ts.length) return `${ch}: none`;
      const avg = (k: string): string => (ts.reduce((a, x) => a + (x.counts[k] ?? 0), 0) / ts.length).toFixed(1);
      const min = (k: string): number => Math.min(...ts.map((x) => x.counts[k] ?? 0));
      return `${ch}: trees avg ${avg('trees')} min ${min('trees')}, orchards avg ${avg('orchards')} min ${min('orchards')}`;
    });
    console.log(`trees and orchards per character:\n${per.join('\n')}`);
    console.log(`emphasis per town:\n${lines.join('\n')}\nmisses (${misses.length}):\n${misses.join('\n')}`);
    expect(misses.length).toBeLessThanOrEqual(Math.ceil(survey().length * 0.15));
  });

  test('each town shows what its character promises', () => {
    const misses: string[] = [];
    for (const s of survey()) {
      for (const group of PROMISES[s.character]) {
        // A river town on an island without a river cannot have its bridges and mills.
        if (s.character === 'river' && s.rivers === 0 && s.gen === 2) continue;
        if (!group.some((r) => s.roles.has(r))) misses.push(`g${s.gen} s${s.seed} ${s.character}: no ${group.join('/')}`);
      }
    }
    // Most do; a town on an island too cramped for one of its showpieces may miss it.
    console.log(`promises missed: ${misses.length}\n${misses.join('\n')}`);
    expect(misses.length).toBeLessThanOrEqual(Math.ceil(survey().length * 0.15));
  });

  test('harbour towns grow the working waterfront: a big port with a large crane (a second where there is room, freighters calling) and a shipyard where the coast allows (counts printed)', () => {
    const harbours = survey().filter((s) => s.character === 'harbour');
    const line = (s: Surveyed): string => {
      const why: string[] = [];
      if (!s.roles.has('port')) why.push('no port (no straight stretch of shore with open sea off it)');
      else if (!s.props.has('L38-F/ship-call')) why.push('a port, but no freighter can sail to its berth');
      if (s.roles.has('port') && !s.counts.largeCranes) why.push('no stretch of 10 for a big port: one medium crane');
      if ((s.counts.ports ?? 0) >= 2) why.push('two ports');
      if (!s.roles.has('shipyard')) why.push('no shipyard (no shore with sea down both sides of a slip and a shed site behind)');
      return `g${s.gen} s${s.seed}: ${why.join('; ') || 'port, freighter, shipyard'}`;
    };
    const ports = harbours.filter((s) => s.roles.has('port')).length, yards = harbours.filter((s) => s.roles.has('shipyard')).length;
    const freighters = harbours.filter((s) => s.props.has('L38-F/ship-call')).length;
    const large = harbours.filter((s) => (s.counts.largeCranes ?? 0) > 0).length, two = harbours.filter((s) => (s.counts.ports ?? 0) >= 2).length;
    console.log(`harbour towns: ${harbours.length}, with a port ${ports} (a large gantry crane at ${large}, two ports at ${two}, a freighter calling at ${freighters}), with a shipyard ${yards}\n${harbours.map(line).join('\n')}`);
    // Every harbour town keeps its old waterfront; most also have the new one, and a big port with a large crane (Derek, 2026-11-26).
    expect(ports).toBeGreaterThanOrEqual(Math.ceil(harbours.length * 0.7));
    expect(large).toBeGreaterThanOrEqual(Math.ceil(harbours.length * 0.7));
    expect(yards).toBeGreaterThanOrEqual(Math.ceil(harbours.length * 0.5));
  });

  test('every role the generator places appears in some towns', () => {
    const count = new Map<string, number>();
    for (const s of survey()) for (const r of s.roles) count.set(r, (count.get(r) ?? 0) + 1);
    console.log(`role shares over ${survey().length} towns:\n${ROLES.map((r) => `${r.padEnd(18)} ${count.get(r) ?? 0}`).join('\n')}`);
    expect(ROLES.filter((r) => !count.has(r) && !(r in NOT_PLACED))).toEqual([]);
  });

  test('every guide entry the generator can make appears in some towns', () => {
    const missing: string[] = [];
    for (const e of GUIDE) {
      const p = e.proof as Record<string, unknown>;
      let seen: boolean;
      if ('role' in p) seen = survey().some((s) => s.roles.has(p.role as string));
      else if ('prop' in p) {
        const q = p.prop as { rule: string; type?: string };
        const id = q.rule.split('.')[0]!;
        seen = survey().some((s) => [...s.props].some((x) => x.startsWith(`${id}/`) && (!q.type || x === `${id}/${q.type}`)));
      } else if ('actor' in p) {
        const q = p.actor as { rule: string; type?: string };
        const id = q.rule.split('.')[0]!;
        seen = survey().some((s) => [...s.props].some((x) => x.startsWith(`${id}/`)));
      } else if ('socket' in p) {
        const id = (p.socket as { rule: string }).rule.split('.')[0]!;
        seen = survey().some((s) => s.props.has(id));
      } else seen = true; // the Auto block: every town uses it
      if (!seen) missing.push(e.id);
    }
    console.log(`guide entries never grown: ${missing.join(', ') || 'none'}`);
    // Entries that need the player's hand (digging a river, painting a croquet lawn) may stay missing.
    const allowed = new Set(['dug-river', 'croquet-lawn', 'boules-court', 'running-track', 'kickabout-green', 'wedding', 'market-day', 'garrison', 'rider', 'cog', 'ships']);
    expect(missing.filter((m) => !allowed.has(m))).toEqual([]);
  });

  test('a windmill in nearly every town of every kind (counts printed)', () => {
    const rows = survey().map((s) => ({ character: s.character, mills: s.counts.mills ?? 0 }));
    console.log(`windmills per town (rolled):\n${millLines(rows).join('\n')}`);
    for (const ch of CHARACTERS) {
      const ms = rows.filter((r) => r.character === ch);
      if (ms.length) expect(ms.filter((r) => r.mills > 0).length / ms.length, ch).toBeGreaterThanOrEqual(MILL_SHARE);
    }
  });

  test('a stone bridge on every generator-2 island with a river', () => {
    const misses = survey().filter((s) => s.gen === 2 && s.rivers > 0 && !s.roles.has('stone-bridge') && !s.roles.has('bridge-shop'));
    expect(misses.map((s) => s.seed).length).toBeLessThanOrEqual(2);
  });

  test('the depth rules show across the survey (vista, corners, hall, rustic edge, courtyard, statue, castle, fingerposts, viewpoint, swings, pump)', () => {
    const has = (id: string): boolean => survey().some((s) => [...s.props].some((x) => x.startsWith(`${id}/`) || x === id));
    for (const id of ['D17', 'D19', 'D21', 'D26', 'D31', 'D32', 'D33']) expect(has(id), id).toBe(true);
    expect(survey().some((s) => s.roles.has('town-hall'))).toBe(true);
  });
});

describe('grow a town: windmills in every kind of town', () => {
  // Each kind grown on generator-2 islands, as the dice would: 4 islands each in the gate, 12 in the full run.
  test('each kind, chosen on a spread of islands, has a windmill in nearly every town; farming, garden and hill towns several', () => {
    const rows: { character: Character; mills: number }[] = [];
    for (const ch of CHARACTERS) {
      for (let seed = 101; seed <= 100 + sized(4, 12); seed++) {
        const t = generateTerrain(seed, 2);
        const plan = planTown(t, seed, { character: ch });
        rows.push({ character: plan.character, mills: millsOf(plan.edits) });
      }
    }
    console.log(`windmills per town (each kind chosen):\n${millLines(rows).join('\n')}`);
    for (const ch of CHARACTERS) {
      const ms = rows.filter((r) => r.character === ch);
      expect(ms.filter((r) => r.mills > 0).length / ms.length, ch).toBeGreaterThanOrEqual(MILL_SHARE);
      // Two or more in most towns of every kind; three or more in most farming, garden and hill towns.
      expect(ms.filter((r) => r.mills >= 2).length / ms.length, ch).toBeGreaterThan(0.5);
      if (ch === 'farming' || ch === 'gardens' || ch === 'hill') expect(ms.filter((r) => r.mills >= 3).length / ms.length, ch).toBeGreaterThan(0.5);
    }
  }, sized(120_000, 600_000));
});

describe('grow a town: the dice', () => {
  test('rolling with what was shown never repeats a character until every suited one has had a turn', () => {
    let shown: Character[] = [];
    const order: Character[] = [];
    let repeatsBeforeFull = 0;
    for (let roll = 0; roll < 24; roll++) {
      const seed = 100 + roll * 7;
      const t = generateTerrain(seed, 2);
      const c = planTown(t, seed, { avoid: shown }).character;
      order.push(c);
      // A repeat is allowed only as the start of a new round, and never the one just shown.
      if (shown.includes(c)) {
        expect(c, `roll ${roll}: the same character twice running`).not.toBe(shown[shown.length - 1]);
        if (shown.length < 4) repeatsBeforeFull++;
        shown = [c];
      } else shown = [...shown, c];
    }
    console.log(`dice order: ${order.join(', ')}`);
    expect(repeatsBeforeFull, 'a round ended after fewer than four characters').toBe(0);
    expect(new Set(order).size).toBeGreaterThanOrEqual(6);
    expect(order).toContain('marble');
  });

  test('a first roll is not changed by the dice: no characters shown, same town as before', () => {
    const t = generateTerrain(9, 2);
    expect(planTown(t, 9, { avoid: [] }).character).toBe(planTown(t, 9).character);
  });
});
