// What a click means: targeting only. Whether an edit is legal is the world
// module's business, so nothing here calls canApply.

import { describe, expect, test } from 'vitest';
import { CELL_H, E, edgeKey, key, N, NO_CELL, S, W } from '@/core/grid';
import { flatTerrain, TerrainBuilder, TownBuilder } from '@/scenario';
import { applyEdits, emptyWorld } from '@/world/world';
import { CHANGE_CYCLE, lineCells, planErase, planUse, stairsRot, treeSwap, type ActionContext } from './actions';
import { faceZone, pickCell, type Pick } from './pick';
import { allPieceIds, drawerItems, DRAWER_IDS, paintsRuns, trayItem } from './pieces';

const terrain = flatTerrain(1);
const down = (x: number, z: number) => ({ origin: [x, 50, z] as const, dir: [0, -1, 0] as const });
const fromEast = (y: number, z: number) => ({ origin: [40, (y + 0.5) * CELL_H, z] as const, dir: [-1, 0, 0] as const });

function setup(build: (b: TownBuilder) => void = () => {}): ActionContext {
  const b = new TownBuilder(emptyWorld(1), terrain);
  build(b);
  return { world: b.world, terrain, rayDir: [-0.5, -0.6, -0.6] };
}
const pickAt = (ctx: ActionContext, ray: Parameters<typeof pickCell>[0]): Pick => pickCell(ray, ctx.world, ctx.terrain)!;

describe('the tray catalogue', () => {
  test('every piece of the kind table is in exactly one drawer, and the tools are in Tools', () => {
    const inDrawers = DRAWER_IDS.flatMap((d) => drawerItems(d).map((i) => i.id));
    expect([...inDrawers].sort()).toEqual([...allPieceIds(), 'change', 'paint', 'erase', 'raise', 'dig', 'level', 'torch', 'bomb', 'nuke', 'raid', 'mallet', 'hand', 'ufo', 'mend'].sort());
    // Shaping the land: the Land group starts the Nature drawer.
    expect(drawerItems('nature').slice(0, 3).map((i) => i.id)).toEqual(['raise', 'dig', 'level']);
    expect(drawerItems('tools').map((i) => i.id)).toEqual(['change', 'paint', 'erase']);
    // Mischief (design section 13b) has a drawer of its own.
    expect(drawerItems('mischief').map((i) => i.id)).toEqual(['torch', 'bomb', 'nuke', 'raid', 'mallet', 'hand', 'ufo', 'mend']);
    expect(drawerItems('build')[0]!.id).toBe('auto');
    // No drawer is one long row: ten at most, so keys 1–9 and 0 reach every item.
    for (const d of DRAWER_IDS) expect(drawerItems(d).length).toBeLessThanOrEqual(10);
    expect(trayItem('lighthouse').drawer).toBe('build');
  });

  test('runs are for floors, fences, walls and marble', () => {
    expect(['path', 'plaza', 'garden', 'fence', 'wall', 'marble'].every((id) => paintsRuns(id as never))).toBe(true);
    expect(['auto', 'house', 'tree', 'erase', 'change'].some((id) => paintsRuns(id as never))).toBe(false);
  });
});

describe('placing', () => {
  test('a piece goes into the cell beyond the face, in the swatch colour, remembering the block it was put on', () => {
    const ctx = setup((b) => b.house(10, 10));
    const ground = planUse({ item: 'house', swatch: 'auto' }, pickAt(ctx, down(20.5, 20.5)), ctx);
    expect(ground).toEqual({ tries: [{ type: 'placeBlock', cell: key(20, 1, 20), kind: 'house', color: 'auto', from: null }], at: key(20, 1, 20) });
    const onHouse = planUse({ item: 'auto', swatch: 3 }, pickAt(ctx, down(10.5, 10.5)), ctx);
    expect(onHouse.tries).toEqual([{ type: 'placeBlock', cell: key(10, 2, 10), kind: 'auto', color: 3, from: key(10, 1, 10) }]);
    const beside = planUse({ item: 'tower', swatch: 'auto' }, pickAt(ctx, fromEast(1, 10.5)), ctx);
    expect(beside.tries[0]).toMatchObject({ cell: key(11, 1, 10), from: key(10, 1, 10) });
  });

  test('water targets (x, 0, z); the top of the grid has nowhere to go', () => {
    const ctx = setup((b) => b.stack('pillar', 5, 5, { floors: 31 }));
    expect(planUse({ item: 'dock', swatch: 'auto' }, pickAt(ctx, down(1.5, 2.5)), ctx).tries[0]).toMatchObject({ type: 'placeBlock', cell: key(1, 0, 2), from: null });
    const top = planUse({ item: 'house', swatch: 'auto' }, pickAt(ctx, down(5.5, 5.5)), ctx);
    expect(top).toEqual({ tries: [], at: NO_CELL, refusal: 'outside the map' });
  });

  test('a floor goes into the target cell, or under the tree, fountain or fence you point at', () => {
    const ctx = setup((b) => b.put('tree', 12, 12).house(14, 12));
    expect(planUse({ item: 'path', swatch: 'auto' }, pickAt(ctx, down(20.5, 20.5)), ctx).tries).toEqual([{ type: 'placeFloor', cell: key(20, 1, 20), floor: 'path' }]);
    expect(planUse({ item: 'plaza', swatch: 'auto' }, pickAt(ctx, down(12.5, 12.5)), ctx).tries).toEqual([{ type: 'placeFloor', cell: key(12, 1, 12), floor: 'plaza' }]);
    // A house is solid: a floor goes on top of it.
    expect(planUse({ item: 'garden', swatch: 'auto' }, pickAt(ctx, down(14.5, 12.5)), ctx).tries).toEqual([{ type: 'placeFloor', cell: key(14, 2, 12), floor: 'garden' }]);
  });

  test('a piece put on a tree takes its place, as one step; a tree on a tree, or a dock on land, does not', () => {
    const ctx = setup((b) => b.put('tree', 12, 12));
    const tree = key(12, 1, 12);
    const house = planUse({ item: 'house', swatch: 'auto' }, pickAt(ctx, down(12.5, 12.5)), ctx);
    expect(house).toEqual({
      tries: [{ type: 'eraseBlock', cell: tree }],
      at: tree,
      steps: [{ type: 'eraseBlock', cell: tree }, { type: 'placeBlock', cell: tree, kind: 'house', color: 'auto', from: null }],
    });
    const after = applyEdits(ctx.world, ctx.terrain, house.steps!);
    expect(after.applied).toBe(2);
    expect(after.world.blocks.get(tree)?.kind).toBe('house');
    // Nothing to gain from swapping a tree for a tree, and a dock never stands on land: refused as before.
    for (const item of ['tree', 'dock'] as const) {
      const plan = planUse({ item, swatch: 'auto' }, pickAt(ctx, down(12.5, 12.5)), ctx);
      expect(plan.steps).toBeUndefined();
      expect(plan.tries[0]).toMatchObject({ type: 'placeBlock', cell: key(12, 2, 12) });
    }
  });

  test('treeSwap: a run crossing a tree takes its place', () => {
    const ctx = setup((b) => b.put('tree', 12, 12));
    const wall = { type: 'placeBlock' as const, cell: key(12, 1, 12), kind: 'wall' as const, color: 'auto' as const, from: null };
    expect(treeSwap(ctx.world, ctx.terrain, wall)).toEqual([{ type: 'eraseBlock', cell: key(12, 1, 12) }, wall]);
    expect(treeSwap(ctx.world, ctx.terrain, { ...wall, cell: key(13, 1, 12) })).toBeNull();
  });
});

describe('fences and walls: centre or edge', () => {
  test('faceZone: the outer 25% on each side is that edge; the middle is the cell', () => {
    const ctx = setup();
    const zone = (x: number, z: number) => faceZone(pickAt(ctx, down(x, z)));
    expect(zone(20.5, 20.5)).toBeNull();
    expect(zone(20.3, 20.7)).toBeNull();
    expect(zone(20.5, 20.1)).toBe(N);
    expect(zone(20.9, 20.5)).toBe(E);
    expect(zone(20.5, 20.9)).toBe(S);
    expect(zone(20.1, 20.5)).toBe(W);
    // In a corner the nearer side wins.
    expect(zone(20.95, 20.85)).toBe(E);
    expect(zone(20.85, 20.95)).toBe(S);
    // Just inside and just outside the strip.
    expect(zone(20.24, 20.5)).toBe(W);
    expect(zone(20.26, 20.5)).toBeNull();
  });

  test('side faces and water have no zones', () => {
    const ctx = setup((b) => b.house(10, 10));
    expect(faceZone(pickAt(ctx, fromEast(1, 10.05)))).toBeNull();
    expect(faceZone(pickAt(ctx, down(1.05, 2.5)))).toBeNull();
  });

  test('the centre places a cell piece; a strip places an edge piece on that boundary', () => {
    const ctx = setup();
    const use = (item: 'fence' | 'wall', x: number, z: number) => planUse({ item, swatch: 'auto' }, pickAt(ctx, down(x, z)), ctx).tries[0];
    expect(use('fence', 20.5, 20.5)).toEqual({ type: 'placeBlock', cell: key(20, 1, 20), kind: 'fence', color: 'auto', from: null });
    expect(use('fence', 20.9, 20.5)).toEqual({ type: 'placeEdge', edge: edgeKey(20, 1, 20, 'E'), kind: 'fence' });
    expect(use('wall', 20.5, 20.9)).toEqual({ type: 'placeEdge', edge: edgeKey(20, 1, 20, 'S'), kind: 'wall' });
    // West and north sides are the neighbour's east and south: one boundary, one key, from either side.
    expect(use('fence', 20.1, 20.5)).toEqual({ type: 'placeEdge', edge: edgeKey(19, 1, 20, 'E'), kind: 'fence' });
    expect(use('fence', 19.9, 20.5)).toEqual(use('fence', 20.1, 20.5));
    expect(use('wall', 20.5, 20.1)).toEqual({ type: 'placeEdge', edge: edgeKey(20, 1, 19, 'S'), kind: 'wall' });
  });
});

describe('stairs', () => {
  const hill = new TerrainBuilder(1).flat(1).rect(20, 20, 22, 22, 2).build();
  const ctx: ActionContext = { world: emptyWorld(1), terrain: hill, rayDir: [-0.6, -0.5, -0.6] };

  test('face the neighbouring column that is one level higher', () => {
    expect(stairsRot(key(19, 1, 21), [19.5, CELL_H, 21.5], ctx)).toBe(E);
    expect(stairsRot(key(21, 1, 23), [21.5, CELL_H, 23.5], ctx)).toBe(N);
    expect(stairsRot(key(23, 1, 21), [23.5, CELL_H, 21.5], ctx)).toBe(W);
    expect(stairsRot(key(21, 1, 19), [21.5, CELL_H, 19.5], ctx)).toBe(S);
  });

  test('with several, the one nearest the pointer; with none, away from the camera', () => {
    const corner: ActionContext = { ...ctx, terrain: new TerrainBuilder(1).flat(1).rect(20, 20, 22, 20, 2).rect(20, 20, 20, 22, 2).build() };
    // (21, 1, 21) has higher ground to the north and to the west.
    expect(stairsRot(key(21, 1, 21), [21.5, CELL_H, 21.1], corner)).toBe(N);
    expect(stairsRot(key(21, 1, 21), [21.1, CELL_H, 21.5], corner)).toBe(W);
    // Open ground: the camera looks toward −x and −z, more along −x here… the flight climbs away from it.
    expect(stairsRot(key(10, 1, 10), [10.5, CELL_H, 10.5], { ...ctx, rayDir: [-0.7, -0.5, -0.5] })).toBe(W);
    expect(stairsRot(key(10, 1, 10), [10.5, CELL_H, 10.5], { ...ctx, rayDir: [0.2, -0.5, 0.8] })).toBe(S);
  });

  test('a block counts as higher ground too, and placing stairs carries the rot', () => {
    const b = new TownBuilder(emptyWorld(1), terrain).put('marble', 11, 10);
    const withBlock: ActionContext = { world: b.world, terrain, rayDir: [-0.6, -0.5, -0.6] };
    const plan = planUse({ item: 'stairs', swatch: 'auto' }, pickCell(down(10.5, 10.5), b.world, terrain)!, withBlock);
    expect(plan.tries[0]).toMatchObject({ type: 'placeBlock', kind: 'stairs', cell: key(10, 1, 10), rot: E });
  });
});

describe('the Change tool', () => {
  test('steps Auto → House → Tower → Lighthouse → Arch → Dock → Auto, offering the rest of the cycle in order', () => {
    expect(CHANGE_CYCLE).toEqual(['auto', 'house', 'tower', 'lighthouse', 'arch', 'dock']);
    // The dock stands where docks may: at level 0 over the water around the flat test ground.
    const ctx = setup((b) => b.auto(10, 10).tower(12, 10, { floors: 1 }).block('dock', 2, 0, 10));
    const kinds = (x: number) => planUse({ item: 'change', swatch: 'auto' }, pickAt(ctx, down(x + 0.5, 10.5)), ctx).tries.map((e) => (e.type === 'setKind' ? e.kind : e.type));
    expect(kinds(10)).toEqual(['house', 'tower', 'lighthouse', 'arch', 'dock']);
    expect(kinds(12)).toEqual(['lighthouse', 'arch', 'dock', 'auto', 'house']);
    expect(kinds(2)).toEqual(['auto', 'house', 'tower', 'lighthouse', 'arch']);
  });

  test('turns stairs a quarter turn; anything else wiggles; the ground does nothing', () => {
    const ctx = setup((b) => b.block('stairs', 10, 1, 10, { rot: 3 }).put('tree', 12, 10));
    const change = (x: number) => planUse({ item: 'change', swatch: 'auto' }, pickAt(ctx, down(x + 0.5, 10.5)), ctx);
    expect(change(10)).toEqual({ tries: [{ type: 'setRot', cell: key(10, 1, 10), rot: 0 }], at: key(10, 1, 10) });
    expect(change(12)).toEqual({ tries: [], at: key(12, 1, 10), wiggle: true });
    expect(change(20)).toEqual({ tries: [], at: NO_CELL });
  });
});

describe('the Paint tool', () => {
  test('sets the swatch colour; on "auto" it steps to the next colour', () => {
    const ctx = setup((b) => b.house(10, 10, { color: 7 }));
    const paint = (swatch: number | 'auto') => planUse({ item: 'paint', swatch }, pickAt(ctx, down(10.5, 10.5)), ctx).tries;
    expect(paint(2)).toEqual([{ type: 'paint', cell: key(10, 1, 10), color: 2 }]);
    expect(paint('auto')).toEqual([{ type: 'paint', cell: key(10, 1, 10), color: 0 }]);
    expect(paint(7)).toEqual([]);
  });
});

describe('erasing', () => {
  test('one block, floor or edge piece; what lies on a top face goes first', () => {
    const ctx = setup((b) => b.house(10, 10).path(20, 20).fenceEdge(22, 20, 'E').house(30, 30).floor('plaza', 30, 30));
    const erase = (x: number, z: number) => planErase(pickAt(ctx, down(x, z)), ctx).tries;
    expect(erase(10.5, 10.5)).toEqual([{ type: 'eraseBlock', cell: key(10, 1, 10) }]);
    expect(erase(20.5, 20.5)).toEqual([{ type: 'eraseFloor', cell: key(20, 1, 20) }]);
    expect(erase(22.9, 20.5)).toEqual([{ type: 'eraseEdge', edge: edgeKey(22, 1, 20, 'E') }]);
    expect(erase(23.1, 20.5)).toEqual([{ type: 'eraseEdge', edge: edgeKey(22, 1, 20, 'E') }]);
    // A miss of the strip on bare ground still finds the fence beside it.
    expect(erase(22.5, 20.5)).toEqual([{ type: 'eraseEdge', edge: edgeKey(22, 1, 20, 'E') }]);
    // A plaza on a roof goes before the house under it.
    expect(erase(30.5, 30.5)).toEqual([{ type: 'eraseFloor', cell: key(30, 2, 30) }]);
    // Terrain and water cannot be erased.
    expect(erase(35.5, 35.5)).toEqual([]);
    expect(erase(1.5, 1.5)).toEqual([]);
  });

  test('the Erase tool and a right click mean the same', () => {
    const ctx = setup((b) => b.house(10, 10));
    const pick = pickAt(ctx, fromEast(1, 10.5));
    expect(planUse({ item: 'erase', swatch: 'auto' }, pick, ctx)).toEqual(planErase(pick, ctx));
    expect(planErase(pick, ctx).tries).toEqual([{ type: 'eraseBlock', cell: key(10, 1, 10) }]);
  });
});

describe('lineCells', () => {
  test('walks one column at a time, never diagonally, at the first cell\'s level', () => {
    expect(lineCells(key(5, 1, 5), key(8, 1, 5))).toEqual([key(6, 1, 5), key(7, 1, 5), key(8, 1, 5)]);
    expect(lineCells(key(5, 1, 5), key(5, 1, 5))).toEqual([]);
    const diagonal = lineCells(key(5, 1, 5), key(8, 3, 8));
    expect(diagonal).toHaveLength(6);
    expect(diagonal.at(-1)).toBe(key(8, 1, 8));
    let [x, z] = [5, 5];
    for (const c of diagonal) {
      const [nx, nz] = [c & 63, (c >> 6) & 63];
      expect(Math.abs(nx - x) + Math.abs(nz - z)).toBe(1);
      [x, z] = [nx, nz];
    }
    expect(lineCells(key(8, 1, 8), key(6, 1, 9))).toHaveLength(3);
  });
});

describe('the land brush (shaping the land)', () => {
  test('the widest brush has a soft edge: corners move once they lag behind the middle, sides while level with it', async () => {
    const { tapered } = await import('./actions');
    const h = new Uint8Array(48 * 48).fill(1);
    const cols: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cols.push(20 + dx + (20 + dz) * 48);
    const first = tapered(cols, 20, 20, h, 1);
    expect(first.length).toBe(5); // the middle and its four sides
    for (const c of first) h[c] = 2;
    expect(tapered(cols, 20, 20, h, 1).length).toBe(9); // now the corners follow
    expect(tapered(cols.slice(0, 4), 20, 20, h, 1).length).toBe(4); // a narrower brush moves whole
  });
});
