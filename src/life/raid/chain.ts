// The raids' chain on the living town's board (design section 13b): it holds
// the raiders ashore (they are claimed by it, so no other chain takes them),
// gives them their plans (the charge, the brands, the looting, back to the
// boats), sends the town's people running, and keeps the loot piles. Each raid
// (raid.ts) decides for its own party; this only connects them to the board,
// and keeps the one note ("Raiders off the coast!") while any is on.

import { phrase } from '@/core/phrase';
import type { Board, Chain } from '../town/board';
import type { Load } from '../people/errand';
import { scenesOf } from '../town/scenes';
import { raidsOf } from './raids';

export function raidChain(): Chain {
  const chain: Chain = {
    id: 'raid',
    sync(board: Board) {
      if (!board.stage) return;
      const raids = raidsOf(board.stage);
      raids.board = board;
      // The piles are claimed again at every change of the town (a store nobody claims is cleared away).
      for (const raid of raids.list) if (!raid.ended) for (const p of raid.piles) board.store(p.key, p.spots);
    },
    offer(p, _time, board) {
      if (!p.raider || !board.stage) return null;
      for (const raid of raidsOf(board.stage).list) {
        if (raid.ended || !raid.raiders.some((r) => r.person === p)) continue;
        return raid.offer(p, board, chain);
      }
      return null;
    },
    keeps: (_load: Load) => true,
    step(dt, time, board) {
      if (!board.stage) return;
      const raids = raidsOf(board.stage);
      raids.board = board;
      const live = raids.list.filter((r) => !r.ended);
      // One note for all of them.
      if (live.length > 0 && !raids.scene) {
        const first = live[0]!;
        raids.scene = scenesOf(board).begin({
          kind: 'raid',
          title: first.kind === 'boats' ? phrase('Raiders off the coast! Boats are coming in.') : phrase('Raiders off the coast!'),
          big: true,
          focus: () => (raids.list.find((r) => !r.ended) ?? first).focus(),
          noteworthy: () => true,
          gathering: () => raids.list.some((r) => !r.ended && r.beat !== 'done'),
          urgent: true,
        });
      }
      for (const raid of live) raid.stepLand(dt, board, time, chain.id, chain);
    },
  };
  return chain;
}
