// The red dots' state (src/ui/dots.ts draws them): pure, so its rules are tested on their own.
//
// A small red dot sits on a thing the player has not tried yet; the first time they use it, it goes for
// good. Nothing is dotted until the player has placed their first piece (or the tutorial hand's place step
// is over), so a new player meets the hand first and not a row of dots. The Almanac's dot comes back
// after a building is unlocked, until the Almanac is next opened.
//
//   waiting  nothing dotted
//     │ a piece placed by hand, or the tutorial's place step over
//     ▼
//   ready    each thing not yet used is dotted; using it clears its dot for good
//             (a thing used while waiting is never dotted)
//
// What is remembered is its own localStorage key (lc:dots), never part of a town.

export type DotId = 'almanac' | 'fly' | 'mischief' | 'grow' | 'forum';
export const DOT_IDS: readonly DotId[] = ['almanac', 'fly', 'mischief', 'grow', 'forum'];

export interface DotsState {
  /** The player has placed a first piece (or the tutorial's place step is over): dots may show. */
  ready: boolean;
  /** Things the player has used, ever: never dotted again (but the Almanac, after an unlock). */
  used: ReadonlySet<DotId>;
  /** A building was unlocked since the Almanac was last opened: its dot is back. */
  unlocked: boolean;
}

export type DotsEvent =
  /** A piece placed by hand, or the tutorial's place step is over. */
  | { type: 'ready' }
  /** The player used a thing (opened the Almanac, flew, opened the Mischief drawer, chose Grow a town, opened Global Village). */
  | { type: 'used'; id: DotId }
  /** A building was unlocked for the first time (while the Almanac was closed). */
  | { type: 'unlocked' };

/** A dot that went because its thing was used (for analytics): which, and whether it was an unlock's. */
export interface DotCleared {
  what: DotId;
  afterUnlock: boolean;
}

/** What else the game already knows of a player who was here before the dots. */
export interface DotsKnown {
  /** The tutorial's place step is over (lc:tutorial). */
  placed?: boolean;
  /** The player has used a Mischief tool (its hints were shown). */
  mischief?: boolean;
}

const isDot = (v: unknown): v is DotId => typeof v === 'string' && (DOT_IDS as readonly string[]).includes(v);

/** Where a player starts, from what is remembered (null: nothing) and what the game knows otherwise. */
export function startDots(saved: string | null | undefined, known: DotsKnown = {}): DotsState {
  let ready = known.placed === true;
  const used = new Set<DotId>();
  let unlocked = false;
  if (saved) {
    try {
      const v = JSON.parse(saved) as { ready?: unknown; used?: unknown; unlocked?: unknown } | null;
      if (v && typeof v === 'object') {
        if (v.ready === true) ready = true;
        if (Array.isArray(v.used)) for (const id of v.used) if (isDot(id)) used.add(id);
        unlocked = v.unlocked === true;
      }
    } catch {
      // Something we cannot read: start again (at worst a dot shows once more).
    }
  }
  if (known.mischief) used.add('mischief');
  return { ready, used, unlocked };
}

/** What is remembered of a state (written whenever it changes). */
export function saveDots(s: DotsState): string {
  return JSON.stringify({ v: 1, ready: s.ready, used: DOT_IDS.filter((id) => s.used.has(id)), unlocked: s.unlocked });
}

/** This thing carries a dot now (the page may still hide it for a moment: a town growing, the hand on show). */
export function dotted(s: DotsState, id: DotId): boolean {
  if (!s.ready) return false;
  return !s.used.has(id) || (id === 'almanac' && s.unlocked);
}

export function stepDots(s: DotsState, e: DotsEvent): { state: DotsState; cleared: DotCleared | null } {
  switch (e.type) {
    case 'ready':
      return { state: s.ready ? s : { ...s, ready: true }, cleared: null };
    case 'used': {
      const again = e.id === 'almanac' && s.unlocked;
      if (s.used.has(e.id) && !again) return { state: s, cleared: null };
      const had = dotted(s, e.id);
      const state: DotsState = { ...s, used: new Set([...s.used, e.id]), unlocked: e.id === 'almanac' ? false : s.unlocked };
      return { state, cleared: had ? { what: e.id, afterUnlock: again && s.used.has('almanac') } : null };
    }
    case 'unlocked':
      return { state: s.unlocked ? s : { ...s, unlocked: true }, cleared: null };
  }
}

/** The ☰ menu's button: dotted while something in the menu is (the Almanac is a menu row on a phone). */
export function menuDotted(s: DotsState, almanacInMenu: boolean): boolean {
  return dotted(s, 'grow') || (almanacInMenu && dotted(s, 'almanac'));
}
