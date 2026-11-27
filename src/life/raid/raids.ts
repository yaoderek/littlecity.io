// The raids of a town (design section 13b): one register per stage, shared by
// the Raid tool (src/ui/mischief.ts), the menu's Raiders switch, the raid
// system (which plans, steps and draws them) and the raid's chain on the
// board (which sends the bands about ashore).
//
//   const raids = raidsOf(view.stage);
//   raids.summon({ at: { x, z } }); // the Raid tool: a party lands on the shore nearest the click; why not, or null
//   raids.auto = false;             // the menu's switch: none come on their own
//   raids.list                      // the raids going on now, oldest first (each its own party, ship and band)
//   raids.current                   // the newest of them, or null
//
// Any number at once: every click brings another party. Past a ceiling of
// raiders alive (RAID.ceiling, RAID.ceilingPhone) a new party is a token crew.

import { phrase } from '@/core/phrase';
import type { LifeStage } from '../api';
import type { Board } from '../town/board';
import { scenesOf, type Scene } from '../town/scenes';
import type { DressingPlan, ShapePlan } from '@/resolve/plan';
import type { StructureId } from '@/resolve/plan';
import type { Raid, RaidSound } from './raid';
import type { RaidKind } from './site';

export interface Summon {
  at: { x: number; z: number } | null;
  kind?: RaidKind;
  /** Came on its own (the switch), not from the tool. */
  auto?: boolean;
}

export interface Raids {
  /** The raids going on now, oldest first. */
  list: Raid[];
  /** The newest raid going on now, or null. */
  readonly current: Raid | null;
  /** Raids come on their own (the menu's Raiders switch, kept in the browser). */
  auto: boolean;
  /** The Raid tool: a raid near this point (or the town). Null if it is on its way; else why not. */
  summon(s: Summon): string | null;
  /** Ends every raid going on now, at once, with nothing left (undo, a new town). */
  end(): void;
  /** Ends one raid (it is over). */
  remove(raid: Raid): void;
  /** Sounds of the raids (the sound system listens). */
  on(fn: (s: RaidSound) => void): () => void;
  emit(s: RaidSound): void;
  /** Why the last raid on its own did not come (for watching and tests), or ''. */
  why: string;
  /** Raids begun on this stage, and the life time the last one began (for the cadence). */
  count: number;
  lastAt: number;
  /** Set by the system and the chain: the town now, and its board. */
  shape: ShapePlan | null;
  dressing: DressingPlan | null;
  board: Board | null;
  /** Set by the system: starts a raid now (planning it on the town as it is). */
  start: ((s: Summon) => string | null) | null;
  /**
   * Shared by the parties: the buildings one of them means to burn or loot (no two parties go for the same one)
   * and those already looted (nothing is looted twice while raids go on). Cleared when the last raid is over.
   */
  claimed: Map<StructureId, number>;
  looted: Set<StructureId>;
  /** The note and the register: one while any raid is on (the chain begins it; it ends with the last raid). */
  scene: Scene | null;
  /** Set by the system: the handles the raids have drawn and not yet let go (for tests: none once all are over). */
  handles: () => number;
}

const byStage = new WeakMap<object, Raids>();

export function raidsOf(stage: LifeStage | object): Raids {
  let r = byStage.get(stage);
  if (!r) {
    let listeners: ((s: RaidSound) => void)[] = [];
    /** The last raid over: the shared claims let go, the note ended. */
    const over = (): void => {
      raids.claimed.clear();
      raids.looted.clear();
      if (raids.scene && raids.board) scenesOf(raids.board).end(raids.scene);
      raids.scene = null;
    };
    const raids: Raids = {
      list: [],
      get current() {
        return raids.list[raids.list.length - 1] ?? null;
      },
      auto: true,
      why: '',
      count: 0,
      lastAt: -Infinity,
      shape: null,
      dressing: null,
      board: null,
      start: null,
      claimed: new Map(),
      looted: new Set(),
      scene: null,
      handles: () => 0,
      summon(s) {
        if (!raids.start) return phrase('the town is not ready yet');
        return raids.start(s);
      },
      end() {
        const all = raids.list;
        raids.list = [];
        for (const raid of all) raid.end(raids.board);
        over();
      },
      remove(raid) {
        raid.end(raids.board);
        raids.list = raids.list.filter((x) => x !== raid);
        for (const [sid, n] of raids.claimed) if (n === raid.n) raids.claimed.delete(sid);
        if (raids.list.length === 0) over();
      },
      on(fn) {
        listeners.push(fn);
        return () => {
          listeners = listeners.filter((f) => f !== fn);
        };
      },
      emit(s) {
        for (const fn of listeners) fn(s);
      },
    };
    byStage.set(stage, (r = raids));
  }
  return r;
}
