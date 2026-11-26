// The big ships' drawings (L38–L41): sound meshes, no doubled faces, a sane
// number of triangles (the galleon is the showpiece; there is at most one),
// and every look draws.

import { describe, expect, test } from 'vitest';
import { findDuplicateFaces, inkGroups, validateMesh } from '@/gen/checks';
import { allParts } from '@/gen/discover';
import { triangleCount } from '@/gen/mesh';
import type { Actor } from '@/resolve/plan';
import { resolveTown } from '@/resolve/index';
import { flatTerrain, TownBuilder } from '@/scenario';
import { emptyWorld } from '@/world/world';
import { rigOf, SHIP_KINDS, shipIndex } from './rig';

const terrain = flatTerrain(5);
const plan = resolveTown(new TownBuilder(emptyWorld(5), terrain).world, terrain).shape;
const parts = allParts();
const draw = (type: string, variant: string | undefined, params: Record<string, number>) =>
  parts.actor({ id: `${type}@test:${variant ?? ''}:${JSON.stringify(params)}`, type, variant, params, at: null, rule: 'test', hash: 1 } as Actor, { plan }).mesh;

const BUDGET: Record<string, number> = { galleon: 4500, cog: 2800, galley: 3000, barge: 2400, freighter: 4000 };

describe('big ship drawings', () => {
  test.each(SHIP_KINDS.map((k) => [k]))('%s: sound, no doubled faces, in budget, for several looks', (kind) => {
    for (const look of [0, 1, 7, 23]) {
      const mesh = draw(kind, undefined, { look });
      expect(validateMesh(mesh)).toEqual([]);
      expect(findDuplicateFaces(mesh)).toBe(0);
      expect(triangleCount(mesh)).toBeLessThan(BUDGET[kind]!);
      expect(inkGroups(mesh).size).toBeGreaterThan(6);
    }
  });

  test('every sail of every ship draws, furled and set; flags, oars, plank and goods draw', () => {
    let total = 0;
    for (const kind of SHIP_KINDS) {
      const rig = rigOf(kind, 3);
      rig.sails.forEach((s, i) => {
        for (const variant of ['yard', 'cloth']) {
          for (const side of s.kind === 'lateen' && variant === 'cloth' ? [1, -1] : [1]) {
            const mesh = draw('ship-sail', variant, { ship: shipIndex(kind), sail: i, look: 3, side });
            expect(validateMesh(mesh)).toEqual([]);
            expect(triangleCount(mesh)).toBeGreaterThan(0);
            total += triangleCount(mesh);
          }
        }
      });
    }
    expect(total).toBeLessThan(4000);
    for (const [type, variant, params] of [
      ['ship-flag', 'pennant', { look: 1, length: 1.7 }],
      ['ship-flag', 'ensign', { look: 2, length: 0.6 }],
      ['ship-oars', undefined, { side: 1, look: 0 }],
      ['ship-oars', undefined, { side: -1, look: 0 }],
      ['gangplank', undefined, { length: 1.2 }],
      ['ship-goods', 'crate', { look: 1 }],
      ['ship-goods', 'barrel', { look: 1 }],
      ['ship-goods', 'sack', { look: 1 }],
    ] as const) {
      const mesh = draw(type, variant, params);
      expect(validateMesh(mesh), `${type}/${variant}`).toEqual([]);
      expect(findDuplicateFaces(mesh), `${type}/${variant}`).toBe(0);
    }
  });
});
