// Everything broken mends on its own, out over the water too (design section
// 13b; the owner: "the auto healing doesn't seem to work for structures that
// are built over water"): docks, jetties, bridges, houses on stilts and on
// bridges, rocks, in a grown harbour, broken and left alone.

import { expect, test } from 'vitest';
import { columnIndex, key, keyX, keyZ } from '@/core/grid';
import { afloat, blastChunks } from '@/gen/damage/damage';
import { profileOf } from '@/gen/damage/field';
import { allGenerators, allParts } from '@/gen/discover';
import { Director } from '@/life/mischief/director';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { packRuin, ruinFall, ruinStage } from '@/world/damage';
import { createGame } from './game';

test('every structure over the water in a grown harbour, wrecked, mends with no help', () => {
  const { world, terrain } = buildScenario(findScenario('grown-harbour')!);
  const d = new Director(7);
  const game = createGame({ world, terrain }, { show: (shape) => d.sync(shape) });
  d.connect({ begin: () => game.begin(), apply: (e) => void game.editAll(e), end: () => game.end(), abort: () => void game.abort(), edit: (e) => void game.editAll(e), amend: (e) => void game.amend(e) });
  const wet = [...game.world.blocks.keys()].filter((c) => terrain.height[columnIndex(keyX(c), keyZ(c))] === 0);
  expect(new Set(wet.map((c) => game.world.blocks.get(c)!.kind))).toEqual(new Set(['dock', 'arch', 'house', 'auto']));
  game.editAll(wet.map((cell, i) => ({ type: 'setRuin' as const, cell, ruin: packRuin({ stage: (1 + (i % 3)) as 1 | 2 | 3, cause: i % 2 ? 'blast' : 'fire' }) })));
  expect([...game.world.blocks.values()].filter((b) => b.ruin).length).toBe(wet.length);
  for (let t = 0; t < 150; t += 0.1) {
    d.update(0.1, { wind: () => ({ dirX: 1, dirZ: 0, strength: 0 }) });
    d.flush();
  }
  expect([...game.world.blocks.values()].filter((b) => b.ruin)).toEqual([]);
});

test('a house on stilts over the water, bombed, goes over away from the blast in one piece, and is mended upright', () => {
  const { world, terrain } = buildScenario(findScenario('grown-harbour')!);
  const d = new Director(7);
  const game = createGame({ world, terrain }, { show: (shape) => d.sync(shape) });
  d.connect({ begin: () => game.begin(), apply: (e) => void game.editAll(e), end: () => game.end(), abort: () => void game.abort(), edit: (e) => void game.editAll(e), amend: (e) => void game.amend(e) });
  // A little one-storey house out on the water, standing on a dock (a stilt house: where the town grew one).
  const lone = (x: number, z: number): boolean =>
    terrain.height[columnIndex(x, z)] === 0 &&
    game.world.blocks.get(key(x, 1, z))?.kind === 'house' &&
    game.world.blocks.get(key(x, 0, z))?.kind === 'dock' &&
    !game.world.blocks.has(key(x, 2, z)) &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => game.world.blocks.get(key(x + dx!, 1, z + dz!))?.kind !== 'house');
  const at = [...game.world.blocks.keys()].map((c) => [keyX(c), keyZ(c)] as const).filter(([x, z]) => lone(x, z)).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
  expect(at).toBeDefined();
  const [hx, hz] = at!;
  const cell = key(hx, 1, hz);
  d.dropBomb([hx + 0.3, 1.6, hz + 0.5]);
  const run = (s: number): void => {
    for (let t = 0; t < s; t += 0.1) {
      d.update(0.1, { wind: () => ({ dirX: 1, dirZ: 0, strength: 0 }) });
      d.flush();
    }
  };
  for (let i = 0; i < 100 && d.bombs.length > 0; i++) run(0.1);
  run(0.2);
  const ruin = game.world.blocks.get(cell)!.ruin;
  expect(ruinStage(ruin)).toBe(3);
  // Away from the blast (it went off on the west side of the house): it falls east.
  expect(ruinFall(ruin)).toBe(1);
  // Drawn as one piece going over, not a heap.
  const shape = game.shape;
  const s = shape.structures.get(shape.structureAt.get(cell)!)!;
  expect(afloat(profileOf(s, shape))).toBe(true);
  const reg = allGenerators() as ReturnType<typeof allGenerators> & { intact?: ReturnType<typeof allGenerators> };
  const chunks = blastChunks((reg.intact ?? reg).build(s, shape, allParts()).mesh, s, shape);
  expect(chunks.length).toBe(1);
  expect(chunks[0]!.topple?.drop).toBeGreaterThan(0);
  // And left alone, it is mended upright.
  run(200);
  expect(game.world.blocks.get(cell)!.ruin ?? 0).toBe(0);
}, 120_000);
