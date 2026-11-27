// The castle's garrison against a raid (sally.ts; Derek, 2026-11-25: "they can repel one viking raid
// successfully"). On the grown harbour town (a castle with a troop of six and a rider): the garrison turns out,
// meets the band, and the band breaks and goes early with little burnt and nothing carried off, against the
// same raid with the garrison kept in; a second party is not repelled; undo puts the soldiers straight back;
// a town with no castle raids as before. Waits on state, never on the clock.

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { encodeTown } from '@/world/save';
import { setStyle } from '@/core/style';
import { keyX, keyZ } from '@/core/grid';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { RAID } from '@/style/raid';
import { createTurmoil, type Turmoil } from '../../../tests/helpers/turmoil';
import { FULL } from '../../../tests/helpers/tier';
import { crowdOf } from '../doors/table';
import { garrisonsOf } from '../people/garrison.system';
import { raidsOf } from './raids';
import { salliesOf } from './sally';
import type { Raid } from './raid';

// Generous: the gate runs files side by side on a loaded machine (timed out at 300 s once with nothing wrong).
const LONG = FULL ? 900_000 : 600_000;

function town(name: string): Turmoil {
  const built = buildScenario(findScenario(name)!);
  const t = createTurmoil({ world: built.world, terrain: built.terrain });
  t.run(3);
  return t;
}

/** A landing raid run to its end (and the garrison home): what it burnt and carried off, and how long it took. */
function run(t: Turmoil, watch?: (raid: Raid) => void): { raid: Raid; burnt: number; carried: number; age: number; phases: string[] } {
  const raids = raidsOf(t.stage);
  expect(raids.summon({ at: null, kind: 'landing' })).toBeNull();
  const raid = raids.current!;
  let carried = 0;
  const phases: string[] = [];
  for (let s = 0; s < 400 && raids.list.length + salliesOf(t.stage).list.length > 0; s++) {
    t.run(1);
    carried = Math.max(carried, raid.ship?.heap ?? 0);
    const p = salliesOf(t.stage).list[0]?.phase;
    if (p && phases[phases.length - 1] !== p) phases.push(p);
    watch?.(raid);
  }
  return { raid, burnt: raid.burnt, carried, age: raid.age, phases };
}

afterEach(() => {
  setStyle('raid', 'sally', 1);
});
// A shorter stay ashore than a raid's own (both runs of the comparison alike): the file in half the time.
const ashore = RAID.ashore;
beforeAll(() => setStyle('raid', 'ashore', 50));
afterAll(() => setStyle('raid', 'ashore', ashore));

describe('the garrison against a raid', () => {
  test('one party: the garrison marches out, meets the band and breaks it; it goes early with little burnt and nothing carried off; the soldiers go back to their round', () => {
    // The same raid with the garrison kept in, to set it against.
    setStyle('raid', 'sally', 0);
    const alone = run(town('grown-harbour'));
    expect(alone.raid.repelled).toBe(false);
    setStyle('raid', 'sally', 1);

    const t = town('grown-harbour');
    const g = garrisonsOf(t.stage)[0]!;
    expect(g, 'the harbour town has a castle with a garrison').toBeDefined();
    let outAt = -1, farthest = 0;
    const gate = g.castle.gate!;
    const met = run(t, (raid) => {
      if (g.out && outAt < 0) outAt = raid.age;
      // How far from the gate the troop got (it leaves the castle).
      const nav = raidsOf(t.stage).board!.nav!;
      const gc = nav.nodes[gate.node]!.cell;
      for (const f of g.out?.soldiers ?? []) farthest = Math.max(farthest, Math.hypot(f.x - (keyX(gc) + 0.5), f.z - (keyZ(gc) + 0.5)));
    });
    console.log('alone', alone.burnt, alone.carried, Math.round(alone.age), 'met', met.burnt, met.carried, Math.round(met.age), met.phases.join(','), 'won', salliesOf(t.stage).count);
    expect(outAt, 'the garrison turned out while the raid was coming in').toBeGreaterThanOrEqual(0);
    expect(outAt).toBeLessThan(15);
    expect(farthest, 'they left the castle').toBeGreaterThan(4);
    expect(met.phases).toEqual(['form', 'march', 'fight', 'seeoff', 'home']);
    expect(met.raid.repelled, 'the band broke').toBe(true);
    expect(met.raid.beatenCount).toBeGreaterThanOrEqual(3);
    // Early, little burnt, nothing carried off.
    expect(met.age).toBeLessThan(alone.age);
    expect(met.burnt).toBeLessThanOrEqual(Math.max(2, alone.burnt / 2));
    expect(met.carried, 'nothing carried off').toBe(0);
    expect(alone.carried).toBeGreaterThan(0);
    // Back in their round: nobody out, resting, the troop marching on.
    expect(g.out).toBeNull();
    expect(salliesOf(t.stage).resting.has(g.key)).toBe(true);
    const s0 = g.troop!.s;
    t.run(6);
    expect(g.troop!.s, 'the troop marches its round again').not.toBe(s0);
    expect(raidsOf(t.stage).handles(), 'nothing of it left drawn').toBe(0);
    expect(crowdOf(t.stage)!.people.filter((p) => p.raider && p.mode !== 'gone').length).toBe(0);
  }, LONG);

  test('one at a time: a second party called while the garrison is out is not repelled; resting, it does not turn out', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    expect(raids.summon({ at: null, kind: 'landing' })).toBeNull();
    const first = raids.current!;
    for (let s = 0; s < 120 && salliesOf(t.stage).list[0]?.phase !== 'fight'; s++) t.run(1);
    expect(salliesOf(t.stage).list[0]?.raid).toBe(first);
    // A second party, elsewhere, while the first is fought.
    const g = garrisonsOf(t.stage)[0]!;
    const far = { x: 48 - first.site.landings[0]!.x, z: 48 - first.site.landings[0]!.z };
    expect(raids.summon({ at: far })).toBeNull();
    const second = raids.current!;
    expect(second).not.toBe(first);
    for (let s = 0; s < 500 && raids.list.length + salliesOf(t.stage).list.length > 0; s++) t.run(1);
    expect(first.repelled).toBe(true);
    expect(second.repelled, 'the second party raided as usual').toBe(false);
    expect(salliesOf(t.stage).count, 'the garrison went out once').toBe(1);
    expect(g.out).toBeNull();
  }, LONG);

  test('undo while the garrison is out: every soldier straight back in his round, nothing left; the town as before', () => {
    const t = town('grown-harbour');
    const before = encodeTown(t.game.world);
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    for (let s = 0; s < 120 && salliesOf(t.stage).list[0]?.phase !== 'fight'; s++) t.run(1);
    const g = garrisonsOf(t.stage)[0]!;
    expect(g.out).not.toBeNull();
    t.mischief.cancel();
    t.run(1);
    expect(g.out).toBeNull();
    expect(salliesOf(t.stage).list.length).toBe(0);
    expect(raids.handles()).toBe(0);
    expect(crowdOf(t.stage)!.people.filter((p) => p.raider && p.mode !== 'gone' || p.inCloud).length).toBe(0);
    expect(encodeTown(t.game.world)).toBe(before);
    const s0 = g.troop!.s;
    t.run(6);
    expect(g.troop!.s).not.toBe(s0);
  }, LONG);

  test('the ship sunk while the garrison marches: the soldiers march home and take up their round', () => {
    const t = town('grown-harbour');
    const raids = raidsOf(t.stage);
    raids.summon({ at: null, kind: 'landing' });
    const raid = raids.current!;
    for (let s = 0; s < 120 && salliesOf(t.stage).list[0]?.phase !== 'march'; s++) t.run(1);
    const g = garrisonsOf(t.stage)[0]!;
    expect(g.out).not.toBeNull();
    t.mischief.dropBomb([raid.ship!.x, 0.5, raid.ship!.z]);
    for (let s = 0; s < 400 && raids.list.length + salliesOf(t.stage).list.length > 0; s++) t.run(1);
    expect(raids.list.length).toBe(0);
    expect(g.out).toBeNull();
    expect(raids.handles()).toBe(0);
  }, LONG);

  test('no castle, no garrison: a raid as before', () => {
    const t = town('grown-market');
    expect(garrisonsOf(t.stage).length).toBe(0);
    setStyle('raid', 'ashore', 30);
    const r = run(t);
    expect(r.raid.repelled).toBe(false);
    expect(salliesOf(t.stage).count).toBe(0);
    setStyle('raid', 'ashore', 50);
  }, LONG);
});
