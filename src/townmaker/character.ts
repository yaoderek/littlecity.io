// A grown town's character (see README.md): what kind of town it is,
// rolled from the seed and weighted by what the island offers, and the plan
// that follows from it: which districts are built, in what order (the order
// is the priority: the first get the best ground), and which are left out.

import { columnIndex } from '@/core/grid';
import { rand } from '@/core/rand';
import type { Role } from '@/core/vocab';
import type { Site } from './site';

export type Character = 'harbour' | 'marble' | 'castle' | 'market' | 'river' | 'farming' | 'hill' | 'gardens';

export const CHARACTERS: readonly Character[] = ['harbour', 'marble', 'castle', 'market', 'river', 'farming', 'hill', 'gardens'];

/** How the town is named when it grows ("A harbour town is growing"). */
export const CHARACTER_NAMES: Record<Character, string> = {
  harbour: 'harbour town',
  marble: 'marble city',
  castle: 'castle town',
  market: 'market town',
  river: 'river town',
  farming: 'farming village',
  hill: 'hill town',
  gardens: 'garden town',
};

/** What the island offers, measured once. */
export interface IslandTraits {
  /** Side of the largest flat square of land at one height (3 or lower). */
  flat: number;
  /** Highest ground. */
  maxH: number;
  /** Narrow water columns (rivers, channels). */
  river: number;
  /** Land columns. */
  land: number;
  /** Land columns on the coast. */
  coast: number;
}

export function islandTraits(site: Site): IslandTraits {
  const t = site.terrain;
  // The largest flat square: the classic dynamic programme over equal heights.
  const best = new Int32Array(48 * 48);
  let flat = 0;
  for (let z = 0; z < 48; z++) {
    for (let x = 0; x < 48; x++) {
      const i = columnIndex(x, z);
      const h = t.height[i]!;
      if (h === 0 || h > 3) continue;
      let v = 1;
      if (x > 0 && z > 0 && t.height[i - 1] === h && t.height[i - 48] === h && t.height[i - 49] === h) v = 1 + Math.min(best[i - 1]!, best[i - 48]!, best[i - 49]!);
      best[i] = v;
      flat = Math.max(flat, v);
    }
  }
  let river = 0, coast = 0;
  for (let i = 0; i < site.river.length; i++) {
    if (site.river[i]) river++;
    if (site.waterDist[i] === 1) coast++;
  }
  return { flat, maxH: site.maxH, river, land: site.land, coast };
}

/** How likely each character is on this island. */
export function characterWeights(tr: IslandTraits): Record<Character, number> {
  return {
    harbour: 1.2 + (tr.coast > 140 ? 0.8 : 0),
    marble: tr.flat >= 15 ? 3.4 : tr.flat >= 13 ? 2.6 : tr.flat >= 11 ? 1.6 : 0.4,
    castle: 1 + (tr.maxH >= 4 ? 0.8 : 0) + (tr.maxH >= 7 ? 0.6 : 0),
    market: 1.2 + (tr.flat >= 10 ? 0.5 : 0),
    // A river town needs a river long enough to be its spine.
    river: tr.river >= 45 ? 3 : tr.river >= 30 ? 1 : 0,
    farming: tr.flat >= 12 ? 1.4 : 0.5,
    hill: tr.maxH >= 7 ? 3 : tr.maxH >= 5 ? 0.8 : 0.1,
    gardens: tr.flat >= 11 ? 1 : 0.4,
  };
}

function weightedPick(seed: number, salt: string, w: Record<Character, number>, skip: ReadonlySet<Character>): Character {
  let sum = 0;
  for (const c of CHARACTERS) if (!skip.has(c)) sum += w[c];
  let r = rand(seed, 'townmaker', 'character', salt) * sum;
  for (const c of CHARACTERS) {
    if (skip.has(c)) continue;
    r -= w[c];
    if (r <= 0) return c;
  }
  return CHARACTERS.find((c) => !skip.has(c)) ?? 'market';
}

/** Below this weight the island does not suit a character: the dice need not show it before they repeat. */
const SUITED = 0.3;

/**
 * The town's primary character and a secondary one that flavours it.
 * `avoid` lists the characters the dice showed already, oldest first: none
 * of them is rolled again while a character the island suits has not been
 * shown, so a few rolls show the whole range. When all have been shown only
 * the latest is left out. `never` is left out whatever happens.
 */
export function rollCharacter(site: Site, seed: number, avoid: readonly Character[] = [], force?: Character, never?: Character): { primary: Character; secondary: Character; traits: IslandTraits } {
  const traits = islandTraits(site);
  const w = characterWeights(traits);
  let skip = new Set<Character>(avoid);
  if (never) skip.add(never);
  if (!CHARACTERS.some((c) => !skip.has(c) && w[c] >= SUITED)) {
    // Every suited character has had its turn: start again, without repeating the latest.
    skip = new Set<Character>(never ? [never] : []);
    const last = avoid[avoid.length - 1];
    if (last && CHARACTERS.some((c) => c !== last && !skip.has(c) && w[c] > 0)) skip.add(last);
  } else if (avoid.length > 0) {
    // Among those not shown yet, only the suited ones: an unsuited one keeps its small odds for a first roll.
    for (const c of CHARACTERS) if (w[c] < SUITED) skip.add(c);
  }
  const primary = force ?? weightedPick(seed, 'primary', w, skip);
  const secondary = weightedPick(seed, 'secondary', w, new Set([primary]));
  return { primary, secondary, traits };
}

/**
 * What each character promises a town shows, as groups of which at least
 * one role must appear (the tests and the scenarios check these, on islands
 * that allow them: a river town needs a river).
 */
export const PROMISES: Record<Character, readonly (readonly Role[])[]> = {
  // The working waterfront (2026-11-26): a container port and a shipyard, where the coast has room for them.
  harbour: [['warehouse'], ['quay'], ['lighthouse', 'keepers-cottage'], ['port'], ['shipyard']],
  marble: [['temple'], ['podium'], ['stoa', 'theatre'], ['obelisk', 'bandstand']],
  castle: [['keep'], ['gatehouse', 'castle-turret'], ['smithy', 'chapel']],
  market: [['town-hall'], ['clock-tower'], ['townhouse', 'row-house'], ['schoolhouse', 'smithy']],
  river: [['stone-bridge', 'bridge-shop'], ['watermill', 'boathouse'], ['willow', 'reed-bed']],
  farming: [['barn', 'wheat-field'], ['windmill', 'mill-house'], ['chapel']],
  hill: [['observatory', 'lookout-cottage'], ['cliff-house', 'keep', 'temple']],
  gardens: [['park-lawn', 'bandstand'], ['football-pitch', 'tennis-court', 'bowling-green', 'basketball-court', 'croquet-lawn']],
};
