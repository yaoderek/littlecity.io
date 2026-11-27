// The guide is never wrong (design section 7): every entry's recipe, built
// with the scenario builder and run through the real rules, makes the
// building its sentence promises; every special role has an entry; every
// entry has its picture and no picture is left over.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import type { Role } from '@/core/vocab';
import { resolveScenario } from '@/scenario';
import { COLLECTION } from './collection';
import { ENTRIES, GROUPS, guideScenario, NOT_SPECIAL, provenRoles } from './entries';
import { contentsOf, holds } from './proof';

describe('every recipe makes its building', () => {
  const cases = ENTRIES.flatMap((e) => [
    [e.id, e, undefined] as const,
    ...(e.also ?? []).map((_, i) => [`${e.id}, other way ${i + 1}`, e, i] as const),
  ]);
  test.each(cases)('%s', (_name, entry, also) => {
    const r = resolveScenario(guideScenario(entry, also));
    const town = contentsOf(r.shape, r.dressing);
    const found = [...town.roles].sort().join(', ');
    expect(holds(entry.proof, town), `${entry.id}: ${JSON.stringify(entry.proof)}; the recipe made: ${found}`).toBe(true);
  });
});

describe('the list', () => {
  test('ids are unique, kebab-case, and every entry is in a known group with a short sentence', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ENTRIES) {
      expect(e.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(GROUPS.some((g) => g.id === e.group)).toBe(true);
      expect(e.how.endsWith('.')).toBe(true);
      // One sentence, two at most.
      expect(e.how.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 1).length).toBeLessThanOrEqual(2);
    }
    expect(ENTRIES[0]!.id).toBe('auto');
  });

  test('every role in the game is either an entry or left out with a reason, never both', () => {
    // Every role in RoleVocab: the type check fails if one is added and not listed here.
    const ALL = [
      'town-hall', 'chapel', 'keepers-cottage', 'mill-house', 'stilt-house', 'boathouse', 'inn', 'shop', 'manor', 'townhouse', 'row-house',
      'cliff-house', 'greenhouse', 'lookout-cottage', 'cottage',
      'steeple', 'castle-turret', 'clock-tower', 'observatory', 'dovecote', 'campanile', 'watchtower',
      'lighthouse', 'windmill',
      'temple', 'gatehouse', 'keep', 'grand-steps', 'quay-wall', 'plinth', 'terrace',
      'stone-bridge', 'sky-bridge', 'flying-buttress', 'gateway', 'loggia', 'viaduct',
      'quay', 'pier', 'boardwalk', 'jetty',
      'palm', 'willow', 'pine', 'planter-tree', 'fruit-tree', 'grove-tree', 'round-tree', 'cypress', 'bush',
      'tiered-fountain', 'well', 'birdbath', 'basin', 'fish-stall', 'flower-stall', 'market-stall',
      'wheat-field', 'herb-garden', 'reed-bed', 'park-lawn', 'kitchen-garden', 'flower-garden',
      'picket-fence', 'rope-fence', 'iron-railing', 'stone-balustrade', 'low-wall', 'garden-wall', 'curtain-wall',
      // discovery round 1, structures
      'podium', 'theatre', 'barn', 'watermill', 'warehouse', 'churchyard', 'smithy', 'forge-chimney', 'obelisk', 'folly-tower', 'bridge-shop', 'bandstand', 'stoa', 'schoolhouse',
      // the playing field
      'basketball-court', 'tennis-court', 'football-pitch', 'bowling-green', 'croquet-lawn', 'boules-court', 'running-track', 'kickabout-green',
    ] as const satisfies readonly Role[];
    type Unlisted = Exclude<Role, (typeof ALL)[number]>;
    const allListed: Unlisted extends never ? true : Unlisted = true;
    expect(allListed).toBe(true);

    const proven = new Set<string>(provenRoles());
    const left = new Set(Object.keys(NOT_SPECIAL));
    for (const role of ALL) {
      expect(proven.has(role) || left.has(role), `role '${role}' has no entry and no reason to be left out`).toBe(true);
      expect(proven.has(role) && left.has(role), `role '${role}' has an entry and is also left out`).toBe(false);
    }
  });

  test('the special buildings the design lists all have an entry', () => {
    // Design section 7, "What it lists".
    const listed = [
      'chapel', 'shop', 'inn', 'town-hall', 'manor', 'townhouse', 'row-house', 'stilt-house', 'boathouse', 'cliff-house', 'greenhouse',
      'mill-house', 'keepers-cottage', 'lookout-cottage',
      'steeple', 'clock-tower', 'castle-turret', 'campanile', 'observatory', 'dovecote', 'lighthouse',
      'temple', 'keep', 'gatehouse', 'grand-steps', 'quay-wall', 'plinth',
      'stone-bridge', 'sky-bridge', 'viaduct', 'gateway', 'loggia', 'flying-buttress',
      'pier', 'quay', 'boardwalk',
      'wheat-field', 'park', 'walled-garden', 'paddock', 'pocket-park', 'herb-garden',
      'street-lamps', 'laundry-lines', 'garrison', 'rider',
    ];
    const ids = new Set(ENTRIES.map((e) => e.id));
    for (const id of listed) expect(ids.has(id), id).toBe(true);
  });
});

describe('the pictures', () => {
  const dir = path.resolve(__dirname, '../../public/guide');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'clips') : [];

  test('every entry has its picture, small enough to load quickly', () => {
    let total = 0;
    for (const e of ENTRIES) {
      const file = path.join(dir, `${e.id}.webp`);
      expect(fs.existsSync(file), `public/guide/${e.id}.webp is missing: run npm run guide`).toBe(true);
      const size = fs.statSync(file).size;
      expect(size, `${e.id}.webp is ${size} bytes`).toBeLessThan(48_000);
      total += size;
    }
    // Pictures load lazily as the guide scrolls, so the whole set's size is not paid on opening the
    // game. The cap was 1.5 MB at 47 entries; raised as the discovery rounds added buildings.
    expect(total).toBeLessThan(4_000_000);
  });

  test('no picture is left over from an entry that is gone', () => {
    // The Mischief group's Raid has a picture of its own (src/life/testing/raid-picture.mjs).
    const ids = new Set([...ENTRIES.map((e) => `${e.id}.webp`), 'raid.webp']);
    expect(files.filter((f) => !ids.has(f))).toEqual([]);
  });
});

describe('the clips', () => {
  // Every building's picture in the Almanac is a clip of it being built (npm run guide -- --clips); the
  // happenings keep their still.
  const dir = path.resolve(__dirname, '../../public/guide/clips');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];

  test('every building has its clip in both forms, small enough to fetch as it scrolls into view', () => {
    let total = 0;
    for (const e of COLLECTION) {
      for (const ext of ['webm', 'mp4']) {
        const file = path.join(dir, `${e.id}.${ext}`);
        expect(fs.existsSync(file), `public/guide/clips/${e.id}.${ext} is missing: run npm run guide -- --clips ${e.id}`).toBe(true);
        const size = fs.statSync(file).size;
        expect(size, `${e.id}.${ext} is ${size} bytes`).toBeLessThan(160_000);
        total += size;
      }
    }
    // Both forms of every clip; a browser fetches one form, and only of the clips it plays.
    expect(total).toBeLessThan(12_000_000);
  });

  test('no clip is left over from a building that is gone, and the happenings have none', () => {
    const ids = new Set(COLLECTION.flatMap((e) => [`${e.id}.webm`, `${e.id}.mp4`]));
    expect(files.filter((f) => !ids.has(f))).toEqual([]);
  });
});
