// Many raids at once (design section 13b; Derek, 2026-11-25: "make it so you can just spam them and spawn in
// more Vikings"): every click of the Raid tool brings another party to the shore nearest it, while the others
// go on. Ten called in quick succession all run to their ends; no two land on top of each other or go for the
// same building; past the ceiling a party is a token crew; nothing is left afterwards and undo puts the town
// back. Waits on state, never on the clock.

import { describe, expect, test } from 'vitest';
import { encodeTown } from '@/world/save';
import { setStyle } from '@/core/style';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { RAID } from '@/style/raid';
import { createTurmoil } from '../../../tests/helpers/turmoil';
import { FULL } from '../../../tests/helpers/tier';
import { crowdOf } from '../doors/table';
import { raidsOf } from './raids';
import { townHeart } from './site';
import type { Raid } from './raid';

const LONG = FULL ? 600_000 : 400_000;

describe('many raids at once', () => {
  test('ten clicks in quick succession: ten parties, landings apart, no building shared, a ceiling on raiders; all end, nothing left, undo restores the town', () => {
    const ashore = RAID.ashore;
    // Shorter ashore than a raid of its own (the sweep is not what is tested here).
    setStyle('raid', 'ashore', 40);
    try {
      const built = buildScenario(findScenario('grown-harbour')!);
      const t = createTurmoil({ world: built.world, terrain: built.terrain });
      t.run(3);
      const before = encodeTown(t.game.world);
      const raids = raidsOf(t.stage);
      const heart = townHeart(t.game.shape!)!;
      // Round the town, the first spot clicked twice.
      const clicks = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
        const a = (k / 9) * Math.PI * 2;
        return { x: Math.max(1, Math.min(47, heart.x + Math.cos(a) * 12)), z: Math.max(1, Math.min(47, heart.z + Math.sin(a) * 12)) };
      });
      const all: Raid[] = [];
      for (const at of clicks) {
        expect(raids.summon({ at }), 'every click brings a party').toBeNull();
        all.push(raids.current!);
        t.run(0.4);
      }
      expect(raids.list.length).toBe(10);
      // No two parties land on top of each other (a second click on one spot lands beside the first).
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        for (const a of all[i]!.site.landings) for (const b of all[j]!.site.landings) expect(Math.hypot(a.x - b.x, a.z - b.z), `raids ${i} and ${j}`).toBeGreaterThanOrEqual(2.6);
      }
      // A ceiling on raiders alive at once: the later parties are token crews.
      const total = all.reduce((n, r) => n + r.raiders.length, 0);
      expect(total).toBeLessThanOrEqual(RAID.ceiling + RAID.tokenCrew * all.length);
      expect(all[9]!.raiders.length).toBeLessThanOrEqual(Math.max(RAID.tokenCrew, all[0]!.raiders.length));
      // No building is gone for by two parties.
      let shared = 0;
      const beats = new Map<number, string[]>();
      t.onFrame = () => {
        for (const r of raids.list) {
          const b = beats.get(r.n) ?? [];
          if (b[b.length - 1]?.split('@')[0] !== r.beat) b.push(`${r.beat}@${Math.round(r.age)}`);
          beats.set(r.n, b);
        }
        const seen = new Map<number, number>();
        for (const r of raids.list) {
          for (const x of r.took) {
            const o = seen.get(x);
            if (o !== undefined && o !== r.n) shared++;
            seen.set(x, r.n);
          }
        }
      };
      for (let s = 0; s < 700 && raids.list.length > 0; s++) t.run(1);
      t.onFrame = null;
      console.log('beats', [...beats.values()].map((b) => b.join(',')).join(' | '));
      console.log('parties', all.map((r) => `${r.kind}:${r.raiders.length} burnt ${r.burnt} trips ${r.raiders.reduce((n, x) => n + x.trips, 0)} at ${r.site.landings[0]!.x},${r.site.landings[0]!.z}`).join(' | '));
      expect(raids.list.length, 'every raid ran to its end').toBe(0);
      expect(shared, 'buildings two parties went for').toBe(0);
      expect(all.every((r) => r.ended)).toBe(true);
      expect(all.every((r) => r.raiders.every((x) => x.where === 'home' || x.where === 'lost'))).toBe(true);
      // Nothing of them left: no raider in the crowd, nobody on their plans, nothing drawn, no note.
      const crowd = crowdOf(t.stage)!;
      expect(crowd.people.filter((p) => p.raider && p.mode !== 'gone').length).toBe(0);
      expect([...raids.board!.plans.values()].filter((p) => p.chain.id === 'raid').length).toBe(0);
      expect(raids.handles(), 'handles the raids still hold').toBe(0);
      expect(raids.scene).toBeNull();
      expect(raids.claimed.size + raids.looted.size).toBe(0);
      expect(t.mischief.threats.length).toBe(0);
      // The town's people go home: nobody still running from raiders.
      const running = (): number => crowd.people.filter((p) => (p.mode === 'walk' || p.mode === 'linger') && (p.goal?.errand?.tag ?? '').startsWith('flee:')).length;
      for (let s = 0; s < 120 && running() > 0; s++) t.run(1);
      expect(running()).toBe(0);
      // One undo: the town as it was before the first of them.
      for (let s = 0; s < 300 && t.mischief.active; s++) t.run(1);
      t.game.undo();
      expect(encodeTown(t.game.world)).toBe(before);
    } finally {
      setStyle('raid', 'ashore', ashore);
    }
  }, LONG);

  test('undo while several raids are on ends them all at once and puts the town back', () => {
    const built = buildScenario(findScenario('grown-market')!);
    const t = createTurmoil({ world: built.world, terrain: built.terrain });
    t.run(3);
    const before = encodeTown(t.game.world);
    const raids = raidsOf(t.stage);
    const heart = townHeart(t.game.shape!)!;
    for (const k of [0, 3, 6]) {
      const a = (k / 9) * Math.PI * 2;
      expect(raids.summon({ at: { x: heart.x + Math.cos(a) * 12, z: heart.z + Math.sin(a) * 12 } })).toBeNull();
      t.run(0.5);
    }
    for (let s = 0; s < 150 && !raids.list.some((r) => r.burnt > 0); s++) t.run(1);
    expect(raids.list.length).toBe(3);
    t.mischief.cancel();
    t.run(1);
    expect(raids.list.length).toBe(0);
    expect(raids.handles()).toBe(0);
    expect(crowdOf(t.stage)!.people.filter((p) => p.raider && p.mode !== 'gone').length).toBe(0);
    expect(encodeTown(t.game.world)).toBe(before);
  }, LONG);
});
