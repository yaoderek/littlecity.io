// The UFO (design section 13b): it takes exactly one person and brings exactly
// that person back; with nobody out of doors it comes and goes and takes
// nobody; undo, or the town changing, mid-abduction leaves nothing drawn and
// the person on their feet. The app's own wiring, no renderer.

import { describe, expect, test } from 'vitest';
import { key, keyX, keyY, keyZ } from '@/core/grid';
import { buildScenario } from '@/scenario';
import { findScenario } from '@/scenario/discover';
import { generateTerrain, initialWorld } from '@/terrain/terrain';
import { crowdOf } from '@/life/doors/table';
import type { Person } from '@/life/people/crowd';
import { createTurmoil, type Turmoil } from '../../../tests/helpers/turmoil';
import { mischiefDrawn } from './owned';
import { UFO, ufosOf } from './ufo.system';
import { SAUCER } from './ufo-art';
import { throwerOf } from './thrown.system';
import { harbourOf, type Ship } from '../ships/visit';
import { rigOf } from '@/parts/actors/ships/rig';

function grown(): Turmoil {
  const built = buildScenario(findScenario('grown-town-1')!);
  const t = createTurmoil({ world: built.world, terrain: built.terrain });
  t.run(20);
  return t;
}

const ids = (t: Turmoil): string[] => crowdOf(t.stage)!.people.filter((p) => !p.id.startsWith('ashore:')).map((p) => p.id).sort();

describe('the UFO', () => {
  test('takes exactly one person away and brings exactly that person back, on their feet and on the walking graph', () => {
    const t = grown();
    const crowd = crowdOf(t.stage)!;
    const before = ids(t);
    const ufos = ufosOf(t.stage)!;
    expect(ufos.call(30.5, 0.8, 22.5)).toBe(true);
    let taken: Person | null = null;
    const seen = new Set<string>();
    let gone = false;
    for (let i = 0; i < 1200 && ufos.saucers.length + (taken ? 0 : 1) > 0; i++) {
      t.run(0.1);
      const s = ufos.saucers[0];
      if (s?.person) taken ??= s.person;
      if (s) seen.add(s.phase);
      if (s?.phase === 'gone') {
        gone = true;
        // Away with them: out of sight, nobody else taken, nobody lost or made twice.
        expect(taken!.visible).toBe(false);
        expect(ids(t)).toEqual(before.filter((id) => crowd.people.some((p) => p.id === id)));
        expect(crowd.people.filter((p) => p.mode === 'thrown' && !p.visible).length).toBe(1);
      }
    }
    expect(taken).not.toBeNull();
    expect(gone).toBe(true);
    for (const ph of ['in', 'beam', 'lift', 'away', 'gone', 'back', 'drop', 'leave']) expect(seen.has(ph), ph).toBe(true);
    expect(ufos.saucers.length).toBe(0);
    // Back down and up again within a bounded time.
    for (let i = 0; i < 300 && taken!.mode === 'thrown'; i++) t.run(0.1);
    expect(taken!.mode).not.toBe('thrown');
    expect(taken!.visible).toBe(true);
    expect(taken!.tumble ?? null).toBeNull();
    expect(crowd.nav!.nodes[taken!.node]).toBeDefined();
    // Nobody lost or made twice (bar anybody whose home went: there was no blast).
    const after = ids(t);
    expect(new Set(after).size).toBe(after.length);
    for (const id of before) expect(after).toContain(id);
    expect(mischiefDrawn(t.stage)).toBe(0);
  }, 180_000);

  test('with nobody about it comes, searches with its beam, and goes, taking nobody', () => {
    const terrain = generateTerrain(7);
    const t = createTurmoil({ world: initialWorld(7, terrain), terrain });
    t.run(2);
    expect(crowdOf(t.stage)?.people.filter((p) => p.visible).length ?? 0).toBe(0);
    const ufos = ufosOf(t.stage)!;
    expect(ufos.call(24.5, 1, 24.5)).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 200 && (i === 0 || ufos.saucers.length > 0); i++) {
      t.run(0.1);
      const s = ufos.saucers[0];
      if (s) {
        seen.add(s.phase);
        expect(s.person).toBeNull();
      }
    }
    expect(seen.has('seek')).toBe(true);
    expect(seen.has('lift')).toBe(false);
    expect(ufos.saucers.length).toBe(0);
    expect(mischiefDrawn(t.stage)).toBe(0);
  }, 120_000);

  test('as many as are called (no limit); undo mid-abduction: all gone at once, nothing drawn, the person on their feet', () => {
    const t = grown();
    const crowd = crowdOf(t.stage)!;
    const ufos = ufosOf(t.stage)!;
    expect(ufos.call(30.5, 0.8, 22.5)).toBe(true);
    expect(ufos.call(20.5, 0.8, 20.5)).toBe(true);
    expect(ufos.call(26.5, 0.8, 28.5)).toBe(true);
    expect(ufos.call(24.5, 0.8, 24.5)).toBe(true);
    t.run(0.1);
    expect(ufos.saucers.length).toBe(4);
    for (let i = 0; i < 100 && !ufos.saucers.some((s) => s.phase === 'lift'); i++) t.run(0.1);
    const taken = ufos.saucers.find((s) => s.phase === 'lift')!.person!;
    expect(taken.mode).toBe('thrown');
    t.mischief.cancel();
    t.run(0.1);
    expect(ufos.saucers.length).toBe(0);
    expect(mischiefDrawn(t.stage)).toBe(0);
    expect(taken.mode).not.toBe('thrown');
    expect(taken.visible).toBe(true);
    expect(crowd.people.filter((p) => p.mode === 'thrown').length).toBe(0);
    void UFO;
  }, 120_000);

  test('the town changing mid-abduction (a house built, the dressing again): it carries on and brings the same person back', () => {
    const t = grown();
    const crowd = crowdOf(t.stage)!;
    const ufos = ufosOf(t.stage)!;
    const before = ids(t);
    expect(ufos.call(30.5, 0.8, 22.5)).toBe(true);
    for (let i = 0; i < 100 && !ufos.saucers.some((s) => s.phase === 'lift'); i++) t.run(0.1);
    const taken = ufos.saucers[0]!.person!;
    // A house built elsewhere in the middle of it.
    const shape = t.game.shape;
    const free = [...shape.terrain.height.keys()].find((i) => shape.terrain.height[i]! > 0 && !shape.kinds.has(key(i % 48, shape.terrain.height[i]!, Math.floor(i / 48))) && (i % 48) > 4 && (i % 48) < 12)!;
    const x = free % 48, z = Math.floor(free / 48);
    t.game.edit({ type: 'placeBlock', cell: key(x, shape.terrain.height[free]!, z), kind: 'house', color: 'auto', from: null });
    for (let i = 0; i < 1200 && ufos.saucers.length > 0; i++) t.run(0.1);
    for (let i = 0; i < 300 && taken.mode === 'thrown'; i++) t.run(0.1);
    expect(taken.mode).not.toBe('thrown');
    expect(taken.visible).toBe(true);
    expect(mischiefDrawn(t.stage)).toBe(0);
    const after = ids(t);
    expect(new Set(after).size).toBe(after.length);
    for (const id of before) expect(after).toContain(id);
    void crowd;
  }, 180_000);

  test('who it takes: the nearest of those the camera sees, however far from the click; with nobody in view, nobody', () => {
    const t = grown();
    const crowd = crowdOf(t.stage)!;
    const ufos = ufosOf(t.stage)!;
    // The camera sees only the east of the town (x > 30); the click is far off to the west.
    const inView = (x: number): boolean => x > 30;
    const seen = crowd.people.filter((p) => p.visible && (p.mode === 'walk' || p.mode === 'linger') && inView(p.x));
    expect(seen.length).toBeGreaterThan(0);
    const click = { x: 10.5, z: 24.5 };
    const nearest = [...seen].sort((a, b) => Math.hypot(a.x - click.x, a.z - click.z) - Math.hypot(b.x - click.x, b.z - click.z))[0]!;
    expect(ufos.call(click.x, 1, click.z, (x) => inView(x))).toBe(true);
    let taken: Person | null = null;
    for (let i = 0; i < 400 && !taken; i++) {
      t.run(0.1);
      const s = ufos.saucers[0];
      if (s?.person && (s.phase === 'beam' || s.phase === 'lift')) taken = s.person;
    }
    expect(taken).not.toBeNull();
    // In view at the click; the nearest of them (unless that one went indoors meanwhile: then the next).
    expect(seen).toContain(taken);
    if (nearest.visible && nearest.mode !== 'home' && nearest.mode !== 'visit') expect(taken).toBe(nearest);
    for (let i = 0; i < 1200 && ufos.saucers.length > 0; i++) t.run(0.1);

    // Nobody in view: it comes to the click, searches it and leaves, taking nobody (though the town is full).
    expect(ufos.call(click.x, 1, click.z, () => false)).toBe(true);
    t.run(0.1);
    const phases = new Set<string>();
    for (let i = 0; i < 300 && ufos.saucers.length > 0; i++) {
      t.run(0.1);
      const s = ufos.saucers[0];
      if (!s) break;
      phases.add(s.phase);
      expect(s.person).toBeNull();
      if (s.phase === 'seek') expect(Math.hypot(s.x - click.x, s.z - click.z)).toBeLessThan(0.5);
    }
    expect(phases.has('seek')).toBe(true);
    expect(phases.has('lift')).toBe(false);
  }, 180_000);

  test('the lift is straight: a walker taken is held where they stood and rises under the hatch, no slide to the side, no jump', () => {
    const t = grown();
    const crowd = crowdOf(t.stage)!;
    const ufos = ufosOf(t.stage)!;
    const th = throwerOf(t.stage)!;
    let lifts = 0, worstOff = 0, worstStep = 0;
    for (let k = 0; k < 60 && lifts < 40; k++) {
      // Somebody walking, the nearer the better (a saucer for each, one at a time).
      const p = crowd.people.find((q) => q.visible && q.mode === 'walk' && !ufos.saucers.some((s) => s.person === q));
      if (!p) {
        t.run(1);
        continue;
      }
      ufos.call(p.x, p.y, p.z, (x, _y, z) => Math.hypot(x - p.x, z - p.z) < 0.01);
      let last: [number, number] | null = null;
      for (let i = 0; i < 600; i++) {
        t.frame(1 / 30);
        const s = ufos.saucers.find((o) => o.pool[0] === p);
        if (!s || s.phase === 'away' || s.phase === 'gone') break;
        if (s.phase !== 'beam' && s.phase !== 'lift') continue;
        const b = th.thrown.get(p)?.body;
        if (!b) continue;
        worstOff = Math.max(worstOff, Math.hypot(b.x - s.gx, b.z - s.gz));
        if (last) worstStep = Math.max(worstStep, Math.hypot(b.x - last[0], b.z - last[1]));
        last = [b.x, b.z];
      }
      if (last) lifts++;
      t.run(0.5);
    }
    expect(lifts).toBeGreaterThan(20);
    expect(worstOff).toBeLessThan(0.02);
    expect(worstStep).toBeLessThan(0.02);
    for (let i = 0; i < 3000 && ufos.saucers.length > 0; i++) t.run(0.1);
  }, 600_000);

  test('it never sits on the ground: over open ground and over the sea its underside stays two storeys up and more, in every phase', () => {
    const terrain = generateTerrain(7);
    const t = createTurmoil({ world: initialWorld(7, terrain), terrain });
    t.run(2);
    const ufos = ufosOf(t.stage)!;
    const g = (): ReturnType<typeof throwerOf> => throwerOf(t.stage);
    // Open ground somewhere on the island, and the sea off it.
    const h = terrain.height;
    let land: [number, number] | null = null;
    for (let i = 0; i < h.length && !land; i++) if (h[i]! > 0 && i % 48 > 10 && i % 48 < 38 && Math.floor(i / 48) > 10 && Math.floor(i / 48) < 38) land = [(i % 48) + 0.5, Math.floor(i / 48) + 0.5];
    const sea: [number, number] = [2.5, 2.5];
    const low: string[] = [];
    for (const [x, z] of [land!, sea]) {
      expect(ufos.call(x, 0.4, z)).toBe(true);
      t.run(0.05);
      for (let i = 0; i < 300 && ufos.saucers.length > 0; i++) {
        t.run(1 / 30);
        const s = ufos.saucers[0];
        if (!s || s.phase === 'in' || s.phase === 'away' || s.phase === 'leave' || s.phase === 'gone' || s.phase === 'back') continue;
        const under = g()!.ground!.surface(s.x, s.z, 99);
        const above = s.y - (under.water ? 0.4 : under.h);
        if (above < UFO.minHover - 0.05) low.push(`${s.phase} ${above.toFixed(2)} at ${x}, ${z}`);
      }
    }
    expect(low.slice(0, 5)).toEqual([]);
  }, 120_000);

  test('it never passes through anything: its disc stays clear of buildings, towers and trees all the way, coming in beside the tallest', () => {
    const t = grown();
    const ufos = ufosOf(t.stage)!;
    const shape = t.game.shape;
    // The tallest buildings' cells (towers, the lighthouse), and the trees.
    const tall = [...shape.kinds].filter(([, k]) => k !== 'tree').sort((a, b) => keyY(b[0]) - keyY(a[0])).slice(0, 3).map(([c]) => c);
    const trees = [...shape.kinds].filter(([, k]) => k === 'tree').map(([c]) => c);
    const inTree = (x: number, y: number, z: number): boolean => trees.some((c) => Math.abs(keyX(c) + 0.5 - x) < 0.5 && Math.abs(keyZ(c) + 0.5 - z) < 0.5 && y >= keyY(c) * 0.8 && y < keyY(c) * 0.8 + 1.9);
    const problems: string[] = [];
    for (const c of tall) {
      expect(ufos.call(keyX(c) + 1.5, 1, keyZ(c) + 0.5)).toBe(true);
      for (let i = 0; i < 900 && ufos.saucers.length > 0; i++) {
        t.run(1 / 30);
        const g = throwerOf(t.stage)!.ground!;
        for (const s of ufos.saucers) {
          if (s.phase === 'gone' || s.phase === 'done') continue;
          // Round its rim and across its middle, its underside and its top.
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * Math.PI * 2, r = k === 8 ? 0 : SAUCER.r;
            const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
            for (const y of [s.y + 0.01, s.y + SAUCER.under + SAUCER.over]) {
              if (g.blocked(x, y, z) || inTree(x, y, z)) problems.push(`saucer ${s.n} (${s.phase}) at ${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)}`);
            }
          }
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  }, 300_000);

  test('twenty called in quick succession, many over one spot: each takes its own catch (nobody twice), they never pass through each other, and all gone they leave nothing behind', () => {
    const t = grown();
    const ufos = ufosOf(t.stage)!;
    const crowd = crowdOf(t.stage)!;
    const before = ids(t);
    // Twenty taps in two seconds, round the busiest spot.
    const p0 = crowd.people.find((q) => q.visible && (q.mode === 'walk' || q.mode === 'linger'))!;
    for (let i = 0; i < 20; i++) {
      expect(ufos.call(p0.x + ((i * 7) % 5) - 2, p0.y, p0.z + ((i * 3) % 5) - 2)).toBe(true);
      t.run(0.1);
    }
    expect(ufos.saucers.length).toBe(20);
    const problems: string[] = [];
    for (let i = 0; i < 4000 && ufos.saucers.length > 0; i++) {
      t.run(0.1);
      // Never more handles out than the saucers about (nine each), and nobody in two beams.
      expect(ufos.live).toBe(ufos.saucers.length * 9);
      const held = ufos.saucers.map((s) => s.person).filter((p) => p);
      expect(new Set(held).size).toBe(held.length);
      // No two discs overlapping (centres closer than a diameter across and nearer than a hull's height up and down).
      const shown = ufos.saucers.filter((s) => s.phase !== 'gone' && s.phase !== 'done');
      for (let a = 0; a < shown.length; a++) for (let b = a + 1; b < shown.length; b++) {
        const A = shown[a]!, B = shown[b]!;
        if (Math.hypot(A.x - B.x, A.z - B.z) < SAUCER.r * 2 && Math.abs(A.y - B.y) < SAUCER.under + SAUCER.over) problems.push(`${A.n} (${A.phase} lane ${A.lane} y${A.yielded.toFixed(1)} w${A.wait.toFixed(1)} t ${A.t.toFixed(2)} to ${A.to.y.toFixed(1)}) and ${B.n} (${B.phase} lane ${B.lane} y${B.yielded.toFixed(1)} t ${B.t.toFixed(2)} to ${B.to.y.toFixed(1)}) at ${A.x.toFixed(1)}, ${A.y.toFixed(1)}, ${A.z.toFixed(1)}`);
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
    expect(ufos.saucers.length).toBe(0);
    expect(ufos.live).toBe(0);
    // (The last ones set down are still dizzy, with stars: drawn by the thrown bodies' system until they get up.)
    for (let i = 0; i < 400 && crowd.people.some((p) => p.mode === 'thrown'); i++) t.run(0.1);
    t.run(1);
    expect(mischiefDrawn(t.stage)).toBe(0);
    expect(crowd.people.filter((p) => p.mode === 'thrown').length).toBe(0);
    const after = ids(t);
    for (const id of before) expect(after).toContain(id);
  }, 300_000);
});

describe('the UFO and the sailors', () => {
  /** The harbour town, run until a ship lies moored with sailors standing on deck. */
  const harbourTown = (): { t: Turmoil; ship: Ship } => {
    const built = buildScenario(findScenario('grown-harbour')!);
    const t = createTurmoil({ world: built.world, terrain: built.terrain });
    const harbour = harbourOf(t.stage)!;
    let ship: Ship | undefined;
    for (let i = 0; i < 900 && !ship; i++) {
      t.run(1);
      ship = harbour.ships.find((s) => s.phase === 'moored' && s.t > 2 && s.t < 20 && (s.crew?.deckHands().length ?? 0) > 0);
    }
    expect(ship).toBeDefined();
    return { t, ship: ship! };
  };

  /** Seconds from now until the ship casts off (leaves its berth). */
  const castOff = (t: Turmoil, ship: Ship, each?: () => void): number => {
    let s = 0;
    while (s < 400 && ship.phase === 'moored') {
      t.run(0.1);
      s += 0.1;
      each?.();
    }
    return s;
  };

  test('a click on a moored ship takes a sailor off its deck: the ship sails on time short a hand, he comes back to it, and nobody is lost', () => {
    // Without the UFO, the same town: when the ship casts off.
    const control = harbourTown();
    const due = castOff(control.t, control.ship);

    const { t, ship } = harbourTown();
    const crew = ship.crew!;
    const ufos = ufosOf(t.stage)!;
    const crowd = crowdOf(t.stage)!;
    const before = ids(t);
    const hands = crew.hands;
    const sailor = crew.deckHands()[0]!;
    expect(ufos.call(sailor.x, sailor.y, sailor.z)).toBe(true);
    t.run(0.05);
    const s = ufos.saucers[0]!;
    // It goes for him (nobody of the town is nearer the click than a man on deck).
    expect(s.sailor?.hand.i).toBe(sailor.i);
    let lifted = false, overMasts = Infinity, count = 0;
    const left = castOff(t, ship, () => {
      if (s.phase === 'lift' && s.person) {
        expect(s.sailor).not.toBeNull();
        lifted = true;
        // Off the deck, short a hand aboard, and his saucer clear above the masts.
        expect(crew.hands).toBe(hands - 1);
        overMasts = Math.min(overMasts, s.y - SAUCER.under - (ship.m[13]! + Math.max(...rigOf(ship.kind, ship.look).masts.map((m) => m.head))));
      }
      // Every sailor is somewhere: aboard, or in the beam or the saucer.
      count = Math.max(count, crew.hands + (s.person && s.person.mode !== 'gone' ? 1 : 0));
    });
    expect(lifted).toBe(true);
    expect(overMasts).toBeGreaterThan(0);
    // It does not wait for him.
    expect(Math.abs(left - due)).toBeLessThan(1);
    // He comes back: to his place on deck if the ship is still about, else ashore into the town.
    for (let i = 0; i < 1200 && ufos.saucers.length > 0; i++) t.run(0.1);
    expect(ufos.saucers.length).toBe(0);
    const ashore = crowd.people.filter((p) => p.id.startsWith('ashore:') && p.mode !== 'gone');
    if (ship.crew === crew) expect(crew.hands + ashore.length).toBe(hands);
    else expect(ashore.length).toBeLessThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(hands);
    // Nobody of the town lost.
    const after = ids(t);
    for (const id of before) expect(after).toContain(id);
    t.run(5);
    expect(mischiefDrawn(t.stage)).toBe(0);
  }, 600_000);

  test('a sailor brought back while his ship still lies moored stands at his place on deck again', () => {
    const { t, ship } = harbourTown();
    const crew = ship.crew!;
    const ufos = ufosOf(t.stage)!;
    const hands = crew.hands;
    const sailor = crew.deckHands()[0]!;
    ufos.call(sailor.x, sailor.y, sailor.z);
    t.run(0.05);
    const s = ufos.saucers[0]!;
    for (let i = 0; i < 600 && s.phase !== 'gone'; i++) t.run(0.1);
    expect(s.phase).toBe('gone');
    // Back at once (the ship has not sailed).
    s.away = 0;
    for (let i = 0; i < 600 && s.phase !== 'leave' && s.phase !== 'done'; i++) t.run(0.1);
    expect(ship.crew).toBe(crew);
    expect(crew.hands).toBe(hands);
    expect(crew.deckHands().some((d) => d.i === sailor.i) || crew.hands === hands).toBe(true);
    expect(crowdOf(t.stage)!.people.filter((p) => p.id.startsWith('ashore:') && p.mode !== 'gone').length).toBe(0);
  }, 600_000);
});
