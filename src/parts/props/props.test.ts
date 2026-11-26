// The prop meshes of the Dressing owner: sound geometry, inside a triangle
// budget, a handful of ink groups (bold shapes, not ink noise), light where
// there should be light, cloth that the wind can move, and the sockets each
// part promises.

import { describe, expect, test } from 'vitest';
import { CELL_H, key, SEA_Y } from '@/core/grid';
import { positionOf } from '@/core/mat4';
import { findDuplicateFaces, inkGroups, validateMesh } from '@/gen/checks';
import { allParts } from '@/gen/discover';
import { meshBounds, PATTERN, triangleCount } from '@/gen/mesh';
import { resolveTown } from '@/resolve/index';
import type { Prop, PropOf } from '@/resolve/plan';
import { flatTerrain, resolveScenario, TownBuilder } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { forkBehind } from './landmarks.part';
import { emptyWorld } from '@/world/world';

const terrain = flatTerrain(5);
const plan = resolveTown(new TownBuilder(emptyWorld(5), terrain).world, terrain, { rules: [] }).shape;

let serial = 0;
function draw(type: string, variant?: string, params?: object, span = 0) {
  const item = { id: `test-${type}-${variant ?? ''}-${serial++}`, type, variant, params, at: { cell: key(10, 1, 10), pos: 'c' }, rule: 'test', hash: 0 } as unknown as Prop;
  return allParts().prop(item, { plan, span });
}
const max = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, v), 0);
const has = (mesh: { pattern: Uint8Array }, pattern: number): boolean => mesh.pattern.includes(pattern);

/** [type, variant, params, triangle budget, most ink groups] */
const CASES: [string, string | undefined, object | undefined, number, number][] = [
  ['lamp', 'post', { look: 1 }, 150, 3],
  ['lamp', 'bridge', { look: 2 }, 150, 3],
  ['lamp', 'pier', { look: 3 }, 190, 5],
  ['lamp', 'four-arm', { look: 4 }, 330, 11],
  ['hanging-lantern', undefined, undefined, 80, 3],
  ['flag', 'pennant', { color: 0, look: 1 }, 120, 2],
  ['flag', 'pennant', { color: 2, look: 2, staff: 1.05 }, 120, 2],
  ['flag', 'banner', { color: 3, look: 3 }, 140, 2],
  ['flag', 'pole', { color: 4, look: 4 }, 160, 3],
  ['flag', 'wall', { color: 6, look: 5 }, 120, 2],
  ['tuft', 'grass', { density: 1, look: 9 }, 80, 1],
  ['tuft', 'flowers', { density: 1, look: 9 }, 260, 1],
  ['boulder', undefined, { size: 1, look: 3 }, 140, 2],
  ['beach-find', 'driftwood', { look: 1 }, 80, 1],
  ['beach-find', 'shell', { look: 2 }, 80, 1],
  ['beach-find', 'starfish', { look: 3 }, 40, 1],
  ['reeds', undefined, { look: 4 }, 120, 1],
  ['lily-pads', undefined, { look: 5 }, 80, 1],
  ['garden-fence', 'gate', { from: 1, to: 1, look: 1 }, 320, 1],
  ['garden-fence', 'picket', { from: 0, to: 2, look: 2 }, 220, 1],
  ['flower-bed', 'border', { flowers: 1, along: 0, look: 3 }, 300, 2],
  ['flower-bed', 'round', { flowers: 2, look: 4 }, 420, 2],
  ['retaining-wall', undefined, { height: 1, from: 0, to: 0, r0: 0.45, r1: 0.45 }, 60, 3],
  ['retaining-wall', undefined, { height: 2, from: 4, to: 5, r0: 0.45, r1: 0.45, creeper: 1, drain: 1, face: 1 }, 420, 4],
  ['retaining-wall', undefined, { height: 1, from: 1, to: 2, r0: 0.1, r1: 0.4 }, 200, 3],
  ['bench', 'wood', { look: 1 }, 80, 2],
  ['bench', 'stone', { look: 1 }, 60, 2],
  ['hedge', 'run', { from: 1, to: 0 }, 80, 1],
  ['hedge', 'gap', { from: 0, to: 0 }, 120, 1],
  ['shrub', 'round', { look: 2 }, 260, 1],
  ['shrub', 'flowering', { look: 2, flowers: 1 }, 300, 1],
  ['worn-track', undefined, { mask: 15 }, 40, 1],
  ['espalier', undefined, { look: 3, face: 1 }, 360, 1],
  ['trough', undefined, undefined, 60, 1],
  ['grazer', 'sheep', { turn: 3, look: 1 }, 270, 3], // (soft ink: rounder puffs, one fleece)
  ['grazer', 'cow', { turn: 5, look: 2 }, 220, 3],
  ['goods-stack', 'crates', { look: 1 }, 160, 3],
  ['goods-stack', 'barrels', { look: 2 }, 420, 3],
  ['goods-stack', 'cat', { look: 3 }, 200, 2],
  ['wall-fountain', undefined, undefined, 120, 3],
  ['cart', undefined, { look: 4 }, 220, 3],
  ['kiosk', undefined, { color: 1 }, 60, 3],
  ['shed', undefined, { look: 5 }, 40, 3],
  ['veg-patch', undefined, { look: 6 }, 320, 2],
  ['washing-pole', undefined, { look: 7 }, 80, 5],
  ['woodpile', undefined, { look: 8 }, 300, 1],
  ['street-tree', undefined, { look: 1 }, 260, 3],
  ['signpost', undefined, { arms: 3, look: 2 }, 60, 4],
  ['dirt-trail', undefined, { dir: 1, step: 0, steps: 3, look: 5 }, 40, 1],
  ['dirt-trail', undefined, { dir: 2, step: 2, steps: 3, look: 7 }, 40, 1],
  ['hanging-lantern', 'bracket', undefined, 100, 3],
  ['cafe-table', undefined, { color: 1, look: 2 }, 200, 5],
  ['creeper', undefined, { storeys: 2, look: 3, face: 1 }, 420, 1],
  ['doorstep', undefined, { steps: 0, pots: 1, flowers: 2, look: 4 }, 260, 4],
  ['doorstep', undefined, { steps: 2, barrel: 1, bicycle: 1, lantern: 1, look: 5 }, 420, 6],
  ['rope-coil', undefined, undefined, 100, 1],
  ['lobster-pot', undefined, { look: 6 }, 140, 3],
  ['net-rack', undefined, { look: 7 }, 120, 2],
  // Stage 4 (dressing depth)
  ['stork-nest', undefined, { look: 1 }, 290, 4],
  ['birdhouse', undefined, { look: 2 }, 80, 3],
  ['statue', 'figure', { look: 3 }, 200, 1],
  ['statue', 'sundial', { look: 4 }, 120, 2],
  ['statue', 'urn', { look: 5 }, 260, 2],
  ['wall-banner', undefined, { color: 2, look: 6 }, 40, 2],
  ['torch', undefined, undefined, 80, 2],
  ['cannon', undefined, { look: 7 }, 220, 3],
  ['brazier', undefined, { look: 8 }, 180, 2],
  ['fog-bell', undefined, { look: 9 }, 160, 3],
  ['ladder', undefined, { look: 1 }, 120, 1],
  ['cobbles', undefined, { mask: 5 }, 12, 1],
  ['well', undefined, { look: 2 }, 260, 5],
  ['beehive', undefined, { look: 3 }, 220, 4],
  ['wheelbarrow', undefined, { look: 4 }, 220, 3],
  ['trellis', undefined, { look: 5 }, 400, 2],
  ['scarecrow', undefined, { look: 6 }, 160, 4],
  ['fingerpost', undefined, { mask: 0b1011, signs: 0b100100, look: 7 }, 120, 4],
  ['mailbox', undefined, { look: 8 }, 100, 3],
  ['postbox', undefined, undefined, 130, 1],
  ['terrace-set', 'parasol', { color: 1, look: 1 }, 160, 4],
  ['terrace-set', 'lounger', { color: 2, look: 2 }, 80, 2],
  ['terrace-set', 'pots', { look: 3 }, 300, 3],
  ['stair-pots', undefined, { side: 1, steps: 0b1011, look: 4 }, 300, 4],
  ['coin-telescope', undefined, undefined, 140, 2],
  ['swing', undefined, { look: 5 }, 60, 2],
  ['hammock', undefined, { look: 6 }, 140, 2],
  ['picnic', undefined, { look: 7 }, 200, 4],
  ['pump', undefined, undefined, 180, 3],
  ['kite', undefined, { top: 1.2, look: 8 }, 60, 2],
];

describe('dressing props', () => {
  test.each(CASES)('%s/%s %j is sound, in budget, and not ink noise', (type, variant, params, budget, inks) => {
    expect(allParts().has('prop', type), `a part draws '${type}'`).toBe(true);
    const out = draw(type, variant, params);
    expect(validateMesh(out.mesh)).toEqual([]);
    expect(findDuplicateFaces(out.mesh)).toBe(0);
    expect(triangleCount(out.mesh)).toBeGreaterThan(0);
    expect(triangleCount(out.mesh)).toBeLessThanOrEqual(budget);
    expect(inkGroups(out.mesh).size).toBeLessThanOrEqual(inks);
  });

  test('a lamp is not 300 triangles, its glass glows, and it owns its light', () => {
    for (const variant of ['post', 'bridge', 'pier', 'four-arm']) {
      const out = draw('lamp', variant);
      expect(has(out.mesh, PATTERN.glow), `${variant} glows`).toBe(true);
      const head = positionOf(out.anchors!['lamp-head']!);
      const { max: top } = meshBounds(out.mesh);
      expect(head[1]).toBeGreaterThan(0.25);
      expect(head[1]).toBeLessThan(top[1]);
    }
    expect(triangleCount(draw('lamp', 'post').mesh)).toBeLessThan(120);
    // Lamps stand on the ground: nothing below the slot, nothing floating.
    expect(meshBounds(draw('lamp', 'post').mesh).min[1]).toBeCloseTo(0, 2);
    const hanging = draw('hanging-lantern');
    expect(has(hanging.mesh, PATTERN.glow)).toBe(true);
    expect(meshBounds(hanging.mesh).max[1]).toBeCloseTo(0, 5); // it hangs from its socket
    expect(positionOf(hanging.anchors!['lamp-head']!)[1]).toBeLessThan(0);
  });

  test('a four-arm lamp set behind its slot moves its light with it', () => {
    const plain = positionOf(draw('lamp', 'four-arm', { look: 1 }).anchors!['lamp-head']!);
    const back = positionOf(draw('lamp', 'four-arm', { look: 1, back: 0.2 }).anchors!['lamp-head']!);
    expect(back[2]).toBeCloseTo(plain[2] - 0.2, 5);
  });

  test('cloth moves with the wind: free edges sway, fixings do not', () => {
    for (const [type, variant] of [['flag', 'pennant'], ['flag', 'banner'], ['flag', 'pole'], ['flag', 'wall']] as const) {
      const { mesh } = draw(type, variant, { color: 1 });
      expect(max(mesh.sway), `${type}/${variant} sways`).toBeGreaterThan(0.5);
      expect(mesh.sway.includes(0), `${type}/${variant} has a rigid staff`).toBe(true);
    }
    const line = draw('laundry-line', undefined, { garments: 5, look: 7 }, 1.86);
    expect(validateMesh(line.mesh)).toEqual([]);
    expect(findDuplicateFaces(line.mesh)).toBe(0);
    expect(max(line.mesh.sway)).toBeGreaterThan(0.5);
    // The rope and the pegged tops are still.
    let pegged = 0;
    for (let v = 0; v < line.mesh.sway.length; v++) if (line.mesh.sway[v] === 0) pegged++;
    expect(pegged).toBeGreaterThan(40);
    expect(triangleCount(line.mesh)).toBeLessThan(320);
    // It spans from wall to wall and is a perch at its middle.
    const { min, max: hi } = meshBounds(line.mesh);
    expect(min[0]).toBeLessThan(0);
    expect(hi[0]).toBeGreaterThan(1.86);
    expect(positionOf(line.anchors!.perch!)[0]).toBeCloseTo(0.93, 2);
  });

  test('a laundry line draws from one garment to six, on a short span and a long one', () => {
    for (const span of [0.86, 1.86, 2.86]) {
      for (const garments of [1, 3, 6]) {
        const { mesh } = draw('laundry-line', undefined, { garments, look: garments * 31 }, span);
        expect(validateMesh(mesh)).toEqual([]);
        expect(inkGroups(mesh).size).toBeGreaterThanOrEqual(3); // rope, brackets, at least one garment
        expect(inkGroups(mesh).size).toBeLessThanOrEqual(8);
      }
    }
  });

  test('water plants stand at the waterline, land plants on the ground', () => {
    for (const type of ['reeds', 'lily-pads']) {
      const { min } = meshBounds(draw(type, undefined, { look: 2 }).mesh);
      expect(min[1]).toBeGreaterThan(SEA_Y - 0.05);
      expect(min[1]).toBeLessThan(SEA_Y + 0.05);
    }
    for (const [type, variant] of [['tuft', 'grass'], ['tuft', 'flowers'], ['boulder', undefined], ['flower-bed', 'round']] as const) {
      const { min, max: hi } = meshBounds(draw(type, variant, { look: 2 }).mesh);
      expect(min[1]).toBeGreaterThan(-0.05);
      expect(min[1]).toBeLessThan(0.02);
      expect(hi[1]).toBeLessThan(0.5);
    }
  });

  test('a retaining wall is as tall as its bank, stands on the foot of it, and stays in its cell', () => {
    for (const height of [1, 2, 3]) {
      const { mesh } = draw('retaining-wall', undefined, { height, from: 0, to: 0, r0: 0.45, r1: 0.45 });
      const { min, max: hi } = meshBounds(mesh);
      expect(min[1]).toBeCloseTo(0, 5);
      expect(hi[1]).toBeGreaterThan(height * CELL_H);
      expect(hi[1]).toBeLessThan(height * CELL_H + 0.15);
      expect(min[0]).toBeCloseTo(-0.5, 5);
      expect(hi[0]).toBeCloseTo(0.5, 5);
      // In front of the cell line (z = −0.15) by the wall's thickness, behind it by the coping's reach.
      expect(hi[2]).toBeLessThan(0.05);
      expect(min[2]).toBeGreaterThan(-0.3);
    }
    // Neighbouring pieces share their ink ids: a wall is one surface, with no line at each joint.
    const a = draw('retaining-wall', undefined, { height: 1, from: 0, to: 0 }).mesh;
    const b = draw('retaining-wall', undefined, { height: 1, from: 0, to: 0 }).mesh;
    expect([...inkGroups(a).keys()].sort()).toEqual([...inkGroups(b).keys()].sort());
  });

  test('a garden fence runs the width of its cell on the cell line; a gate leaves the walk open', () => {
    const plain = meshBounds(draw('garden-fence', 'picket', { from: 1, to: 1 }).mesh);
    expect(plain.min[0]).toBeLessThan(-0.45);
    expect(plain.max[0]).toBeGreaterThan(0.45);
    expect(plain.max[1]).toBeLessThan(0.5);
    const gate = draw('garden-fence', 'gate', { from: 1, to: 1, look: 3 }).mesh;
    // No picket of the run stands in the gateway on the fence line (the leaf swings into the garden).
    let blocked = 0;
    for (let v = 0; v < gate.position.length / 3; v++) {
      const x = gate.position[v * 3]!, z = gate.position[v * 3 + 2]!;
      if (Math.abs(x) < 0.08 && Math.abs(z + 0.15) < 0.01) blocked++;
    }
    expect(blocked).toBe(0);
  });

  test('seeded: the same item draws the same mesh, another look draws another', () => {
    const one = draw('laundry-line', undefined, { garments: 4, look: 11 }, 1.86).mesh;
    const two = draw('laundry-line', undefined, { garments: 4, look: 12 }, 1.86).mesh;
    expect(Array.from(one.color)).not.toEqual(Array.from(two.color));
  });
});

describe('the orchard ladder (U18)', () => {
  const orchard = resolveScenario(findScenario('U18.orchard')!);
  const ladders = orchard.dressing.props.filter((p) => p.type === 'ladder');
  const build = (p: Prop) => allParts().prop(p, { plan: orchard.shape, span: 0 });

  test('it rests in the fork of its tree, where the limbs leave the trunk: wood that is there in winter too', () => {
    expect(ladders.length).toBeGreaterThanOrEqual(2);
    for (const p of ladders) {
      const fork = forkBehind(p as PropOf<'ladder'>, orchard.shape);
      expect(fork, `${p.id} has a tree behind it`).not.toBeNull();
      const { mesh } = build(p);
      expect(validateMesh(mesh)).toEqual([]);
      const { min, max } = meshBounds(mesh);
      // Its foot on the ground, its top just over the fork (the old one stood 0.95 tall, up out of the crown).
      expect(min[1]).toBeGreaterThan(-0.03);
      expect(max[1]).toBeGreaterThan(fork!.at[1]);
      expect(max[1]).toBeLessThan(fork!.at[1] + 0.15);
      // Its far end reaches the near side of the trunk at the fork, and no further than its middle.
      expect(min[2]).toBeLessThan(fork!.at[2] + fork!.radius + 0.05);
      expect(min[2]).toBeGreaterThan(fork!.at[2] - 0.12);
      expect(Math.abs((min[0] + max[0]) / 2 - fork!.at[0])).toBeLessThan(0.08);
    }
  });

  test('fallen, the same ladder lies flat on the grass of its own cell: not floating, not sunk', () => {
    for (const p of ladders) {
      const down = { ...p, params: { ...p.params, fallen: 1 } } as Prop;
      const { mesh } = build(down);
      expect(validateMesh(mesh)).toEqual([]);
      const { min, max } = meshBounds(mesh);
      expect(min[1]).toBeGreaterThan(0.005);
      expect(min[1]).toBeLessThan(0.02);
      expect(max[1]).toBeLessThan(0.06);
      // On its own side of the cell line (0.15 behind the slot), clear of the stump, inside its cell.
      expect(min[2]).toBeGreaterThan(-0.15);
      expect(Math.max(-min[0], max[0])).toBeLessThan(0.5);
    }
  });

  test('a ladder on a wall (the mill yard) is still the straight one', () => {
    const { max } = meshBounds(draw('ladder', undefined, { look: 1, back: 0.27 }).mesh);
    expect(max[1]).toBeGreaterThan(0.9);
  });
});
