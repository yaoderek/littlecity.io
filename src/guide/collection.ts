// The player's collection (the Almanac, src/ui/guide.ts; the unlock moment, src/ui/unlock.ts): which of the
// almanac's special buildings this player has built by hand, ever, across all their towns. Pure: plans in,
// answers out; the record itself is kept by src/ui/unlock.ts in its own localStorage key, never in a town.
//
// What counts: the entries of the building groups (Houses … Playing fields), not the Auto block's note and
// not the happenings (the events groups: a wedding is not built). A building counts as built by hand when a
// structure takes its role in an edit the player made (a click, a run, a stroke of the land tools), not in a
// town that grew, an undo, mischief, or a town opened from a link or a file. The entries proven by the
// dressing (an orchard's ladders, the street lamps, a garrison) count when the dressing that follows the
// player's own edit holds them and the one before did not.

import type { DressingPlan, ShapePlan, StructureId } from '@/resolve/plan';
import { ENTRIES, type GuideEntry, type GuideGroup } from './entries';
import { holds, propsOf } from './proof';

/** The groups of things that are built (the rest are things the town does). */
export const BUILDING_GROUPS: ReadonlySet<GuideGroup> = new Set<GuideGroup>(['houses', 'towers', 'stone', 'bridges', 'waterfront', 'green', 'town', 'play']);

/** Everything there is to build, in the almanac's order: the "of N" of "built 34 of N". */
export const COLLECTION: readonly GuideEntry[] = ENTRIES.filter((e) => BUILDING_GROUPS.has(e.group));

const ids = new Set(COLLECTION.map((e) => e.id));
/** True for an entry that can be collected. */
export const collectable = (id: string): boolean => ids.has(id);

/** Collectable entries proven by a role, by that role. */
const byRole = new Map<string, GuideEntry[]>();
for (const e of COLLECTION) {
  if (!('role' in e.proof)) continue;
  const list = byRole.get(e.proof.role) ?? [];
  list.push(e);
  byRole.set(e.proof.role, list);
}
/** Collectable entries proven by the dressing (a prop or an actor). */
const DRESSED = COLLECTION.filter((e) => 'prop' in e.proof || 'actor' in e.proof);

/** A building this edit made: the entry, and the structure that holds it (to celebrate at). */
export interface Made {
  entry: GuideEntry;
  structure: StructureId;
}

/**
 * The collectable buildings an edit made: a structure whose role is one of the almanac's and was not its
 * role before the edit (a new building, or one the edit turned into it). Structure ids are stable across
 * edits (plan.ts), so a grown chapel the player builds beside stays the grown chapel.
 */
export function madeByEdit(before: ShapePlan, after: ShapePlan): Made[] {
  const out: Made[] = [];
  const seen = new Set<string>();
  for (const [structure, { role }] of after.roles) {
    const entries = byRole.get(role);
    if (!entries || before.roles.get(structure)?.role === role) continue;
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ entry, structure });
    }
  }
  return out;
}

/** The dressing's facts (propsOf), for comparing one dressing with the next. */
export const dressingFacts = (d: DressingPlan): ReadonlySet<string> => propsOf(d);

/** The collectable buildings proven by the dressing that `after` holds and `before` did not. */
export function madeInDressing(before: ReadonlySet<string>, after: ReadonlySet<string>): GuideEntry[] {
  const town = (props: ReadonlySet<string>): { roles: ReadonlySet<string>; autoKinds: ReadonlySet<string>; props: ReadonlySet<string> } => ({ roles: new Set(), autoKinds: new Set(), props });
  const was = town(before), now = town(after);
  return DRESSED.filter((e) => holds(e.proof, now) === true && holds(e.proof, was) !== true);
}

// ── the record ─────────────────────────────────────────────────────────────
// Kept as a small JSON object: { "v": 1, "built": ["chapel", "inn", …] }. Anything else read back (an old or
// broken value, another tab's half-written one) is taken as nothing built rather than as an error.

/** The entry ids a stored record holds (unknown ids are kept: an entry renamed later still reads back). */
export function readRecord(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    const built = (v as { built?: unknown } | null)?.built;
    if (!Array.isArray(built)) return [];
    return [...new Set(built.filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9-]*$/.test(x)))];
  } catch {
    return [];
  }
}

export function writeRecord(built: Iterable<string>): string {
  return JSON.stringify({ v: 1, built: [...built] });
}

/** How many of the collection a record holds, and of how many. */
export function progress(built: ReadonlySet<string>): { got: number; all: number } {
  return { got: COLLECTION.filter((e) => built.has(e.id)).length, all: COLLECTION.length };
}
