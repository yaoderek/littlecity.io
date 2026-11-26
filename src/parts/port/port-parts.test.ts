// The port's drawings (R-D00): the cranes' frames and moving pieces, the
// containers and their doors, the tug. Sound meshes, no doubled faces, a sane
// number of triangles: a port of four cranes and a hundred containers must
// stay cheap on a phone.

import { describe, expect, test } from 'vitest';
import { findDuplicateFaces, validateMesh } from '@/gen/checks';
import { allParts } from '@/gen/discover';
import { triangleCount } from '@/gen/mesh';
import { resolveTown } from '@/resolve/index';
import type { Actor } from '@/resolve/plan';
import { flatTerrain, TownBuilder } from '@/scenario';
import { emptyWorld } from '@/world/world';

const terrain = flatTerrain(5);
const plan = resolveTown(new TownBuilder(emptyWorld(5), terrain).world, terrain).shape;
const parts = allParts();
const draw = (type: string, variant: string | undefined, params: Record<string, number>) =>
  parts.actor({ id: `${type}@test:${variant ?? ''}:${JSON.stringify(params)}`, type, variant, params, at: null, rule: 'test', hash: 1 } as Actor, { plan }).mesh;

const CASES: [string, string | undefined, Record<string, number>, number][] = [
  ['port-crane', 'medium', { look: 0 }, 1500],
  ['port-crane', 'large', { look: 1, off: 0.3 }, 3000],
  ['crane-piece', 'medium-top', { look: 0 }, 1200],
  ['crane-piece', 'medium-jib', { look: 1 }, 1200],
  ['crane-piece', 'large-boom', { look: 0 }, 800],
  ['crane-piece', 'trolley', { look: 0 }, 400],
  ['crane-piece', 'spreader', {}, 400],
  ['crane-piece', 'hook', {}, 300],
  ['crane-piece', 'cable', {}, 50],
  ['crane-piece', 'cables4', {}, 80],
  ['container', undefined, { look: 3 }, 260],
  ['container', 'open', { look: 2 }, 260],
  ['container-door', undefined, { look: 2, side: -1 }, 80],
  ['tug', undefined, {}, 1500],
];

describe('port drawings', () => {
  test.each(CASES)('%s %s: sound, no doubled faces, in budget', (type, variant, params, budget) => {
    const mesh = draw(type, variant, params);
    expect(validateMesh(mesh)).toEqual([]);
    expect(findDuplicateFaces(mesh)).toBe(0);
    expect(triangleCount(mesh)).toBeGreaterThan(0);
    expect(triangleCount(mesh)).toBeLessThan(budget);
  });
});
