// Ruins in the town plan (mischief, design section 13b): the incremental
// resolve stays exactly a full resolve when blocks are damaged and mended
// (a block's damage is in the content keys and the structure hash), and a
// ruined building houses nobody and carries no dressing.

import { describe, expect, test } from 'vitest';
import { neighbor, opposite, type Dir4 } from '@/core/grid';
import { hash } from '@/core/rand';
import type { Edit, Terrain, World } from '@/core/world';
import { buildScenario, scenarioResolveOptions } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { randomEdit } from '@/scenario/edits';
import { packRuin } from '@/world/damage';
import { applyEdit, canApply } from '@/world/world';
import { facades } from './facts/facades.fact';
import { roofRegions } from './facts/roofs.fact';
import { structureInfo } from './facts/structure.fact';
import { withoutMemos } from './facts/content-keys.fact';
import type { ResolveOptions } from './engine/api';
import { resolveDressing, resolveShape, resolveTown } from './index';
import type { DressingPlan, Prop, ShapePlan } from './plan';
import { ruinedStructures } from './ruins';
import { createStagedResolver } from './staged';

const plain = (v: unknown): unknown =>
  JSON.parse(
    JSON.stringify(v, (_k, x: unknown) => {
      if (x instanceof Map) return [...x.entries()];
      if (x instanceof Set) return [...x.values()].sort();
      if (typeof x === 'function') return undefined;
      return x;
    }),
  );

/** Everything a plan says, as plain data (trace timings left out). */
function snapshot(shape: ShapePlan, dressing: DressingPlan): Record<string, unknown> {
  return {
    kinds: plain(shape.kinds),
    structures: plain([...shape.structures.values()].sort((a, b) => a.id - b.id)),
    structureAt: plain(shape.structureAt),
    floorAt: plain(shape.floorAt),
    edgeAt: plain(shape.edgeAt),
    supports: plain(shape.supports),
    roles: plain(shape.roles),
    tags: plain(shape.tags),
    features: plain(shape.features),
    sockets: plain(shape.sockets),
    claims: plain(shape.claims),
    trace: shape.trace.map((t) => [t.rule, t.candidates, t.chanceSkipped, t.claimSkipped, t.applied]),
    hash: shape.hash,
    facades: plain(facades(shape.facts).list),
    facadeAt: facades(shape.facts).list.map((f) => facades(shape.facts).at(f.cell, f.dir) === f),
    roofs: plain(roofRegions(shape.facts).list),
    roofByCell: plain([...roofRegions(shape.facts).byCell].map(([c, r]) => [c, r.structure, r.index])),
    info: plain(structureInfo(shape.facts)),
    props: plain(dressing.props),
    actors: plain(dressing.actors),
    dressingSockets: plain(dressing.sockets),
    nav: plain(dressing.nav),
    dressingClaims: plain(dressing.claims),
    dressingTrace: dressing.trace.map((t) => [t.rule, t.candidates, t.chanceSkipped, t.claimSkipped, t.applied]),
    dressingHash: dressing.hash,
  };
}

/** A damage edit on a block of the world: damage of any kind, scaffolding, or a repair. */
function ruinEdit(w: World, seed: number, i: number): Edit | null {
  const cells = [...w.blocks.keys()];
  if (cells.length === 0) return null;
  const cell = cells[hash(seed, 'ruin-cell', i) % cells.length]!;
  const k = hash(seed, 'ruin', i) % 9;
  if (k === 8) return w.blocks.get(cell)!.ruin ? { type: 'repair', cell } : null;
  const ruin = packRuin({ stage: (k % 4) as 0 | 1 | 2 | 3, cause: k % 2 ? 'blast' : 'fire', mending: k >= 6 || k % 4 === 0 });
  return ruin ? { type: 'setRuin', cell, ruin } : null;
}

function play(name: string, edits: number, seed: number): void {
  const scn = findScenario(name)!;
  const built = buildScenario(scn);
  const t: Terrain = built.terrain;
  const opts: ResolveOptions = scenarioResolveOptions(scn);
  const resolver = createStagedResolver(t, opts);
  let world: World = built.world;
  resolver.update(world);
  resolver.poll();
  let played = 0;
  for (let i = 0; i < edits; i++) {
    const e = i % 3 === 2 ? randomEdit(world, t, seed, i) : ruinEdit(world, seed, i);
    if (!e || !canApply(world, t, e).ok) continue;
    if (i % 4 === 0) resolver.preview(applyEdit(world, t, e));
    world = applyEdit(world, t, e);
    const shape = resolver.update(world);
    const got = resolver.poll();
    expect(got, `edit ${i}: dressing`).not.toBeNull();
    const cold = withoutMemos(() => {
      const s = resolveShape(world, t, opts);
      return snapshot(s, resolveDressing(s, opts));
    });
    const warm = snapshot(shape, got!.dressing);
    for (const k of Object.keys(cold)) {
      const a = JSON.stringify(warm[k]);
      const b = JSON.stringify(cold[k]);
      if (a !== b) expect(warm[k], `${name}, edit ${i} (${JSON.stringify(e)}): ${k}`).toEqual(cold[k]);
    }
    played++;
  }
  expect(played).toBeGreaterThan(edits * 0.6);
}

describe('ruins', () => {
  test('incremental resolve equals a full resolve through damage and repair edits', () => play('everything', 120, 21), 240_000);

  test('a ruined building houses nobody and carries no dressing; repaired, it is exactly as before', () => {
    const scn = findScenario('everything')!;
    const built = buildScenario(scn);
    const t = built.terrain;
    const opts = scenarioResolveOptions(scn);
    const before = resolveTown(built.world, t, opts);
    const home = before.dressing.actors.find((a) => a.home !== undefined && before.shape.structures.get(a.home)?.kind === 'house');
    expect(home, 'the town has a resident').toBeDefined();
    const s = before.shape.structures.get(home!.home!)!;
    let w = built.world;
    for (const cell of s.cells) w = applyEdit(w, t, { type: 'setRuin', cell, ruin: packRuin({ stage: 3, cause: 'fire' }) });
    const after = resolveTown(w, t, opts);
    expect(ruinedStructures(after.shape).has(s.id)).toBe(true);
    expect(after.dressing.actors.filter((a) => a.home === s.id)).toEqual([]);
    for (const p of after.dressing.props) {
      const at = p.at;
      if ('cell' in at) expect(s.cells.includes(at.cell), `${p.id} stands in the ruin`).toBe(false);
    }
    for (const cell of s.cells) w = applyEdit(w, t, { type: 'repair', cell });
    expect(w.blocks).toEqual(built.world.blocks);
    expect(resolveTown(w, t, opts).dressing.hash).toBe(before.dressing.hash);
  });

  test('an orchard ladder whose tree is a stump, burnt bare or growing back lies on the grass, and nobody picks from it; whole again, it stands', () => {
    const scn = findScenario('U18.orchard')!;
    const built = buildScenario(scn);
    const t = built.terrain;
    const opts = scenarioResolveOptions(scn);
    const before = resolveTown(built.world, t, opts);
    const ladder = before.dressing.props.find((p) => p.type === 'ladder')!;
    expect(ladder).toBeDefined();
    const at = ladder.at as { cell: number; face: Dir4 };
    const tree = neighbor(at.cell, opposite(at.face));
    expect(built.world.blocks.get(tree)?.kind).toBe('tree');
    const down = (p: Prop): boolean => (p.params as { fallen?: number } | undefined)?.fallen === 1;
    const picks = (d: DressingPlan): number => d.sockets.filter((s) => s.owner === ladder.id).length;
    expect(picks(before.dressing)).toBe(1);
    const fallen = (ruin: number): DressingPlan => resolveTown(applyEdit(built.world, t, { type: 'setRuin', cell: tree, ruin }), t, opts).dressing;
    for (const ruin of [
      packRuin({ stage: 3, cause: 'fire' }),
      packRuin({ stage: 3, cause: 'blast' }),
      packRuin({ stage: 2, cause: 'fire' }),
      packRuin({ stage: 3, cause: 'blast', mending: true, progress: 20 }),
    ]) {
      const d = fallen(ruin);
      const p = d.props.find((q) => q.id === ladder.id);
      expect(p, 'the ladder is still there').toBeDefined();
      expect(down(p!)).toBe(true);
      expect(p!.hash, 'drawn again, lying down').not.toBe(ladder.hash);
      expect(picks(d), 'nobody climbs a fallen ladder').toBe(0);
      // The other ladders stand.
      for (const q of d.props) if (q.type === 'ladder' && q.id !== ladder.id) expect(down(q)).toBe(false);
    }
    // Scorched or shaken, the tree is whole: the ladder stands.
    for (const ruin of [packRuin({ stage: 1, cause: 'fire' }), packRuin({ stage: 1, cause: 'blast' })]) {
      const d = fallen(ruin);
      expect(down(d.props.find((q) => q.id === ladder.id)!)).toBe(false);
      expect(picks(d)).toBe(1);
    }
    const w = applyEdit(applyEdit(built.world, t, { type: 'setRuin', cell: tree, ruin: packRuin({ stage: 3, cause: 'fire' }) }), t, { type: 'repair', cell: tree });
    expect(resolveTown(w, t, opts).dressing.hash).toBe(before.dressing.hash);
  });
});
