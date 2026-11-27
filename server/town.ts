// Is a posted town code one the game opens, with something built in it? (Global Village). Owner: Forum.
//
// The server reads towns with the game's own decoder (src/world/save.ts, bundled in at build time),
// and "something built" is the game's own rule (src/app/main.ts isTown): reshaped land, or anything
// on the island beyond the trees it starts with.

import { terrainOf } from '@/terrain/terrain';
import { onlyStartingTrees } from '@/ui/growth';
import { decodeTown } from '@/world/save';
import type { ErrorKey } from './errors';

/** The longest town code taken, in characters. */
export const CODE_MAX = 200_000;

/** Null if the code is a town worth posting, else why not. */
export function townProblem(code: string): ErrorKey | null {
  if (code.length > CODE_MAX) return 'townTooBig';
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return 'townUnreadable';
  const r = decodeTown(code);
  if (!r.ok) return 'townUnreadable';
  const w = r.world;
  if ((w.terrainEdits?.size ?? 0) > 0) return null;
  return onlyStartingTrees(w, terrainOf(w)) ? 'townEmpty' : null;
}
