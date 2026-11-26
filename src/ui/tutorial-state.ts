// The tutorial hand's state (src/ui/tutorial.ts draws it): pure, so its rules are tested on their own.
//
//   place  "tap to place" / "left click to place", pointing at an empty spot by the town
//     │ a piece placed by hand
//     ▼
//   undo   "tap to undo" at the undo button (touch) / "right click to remove" at the piece (mouse)
//     │ undone or removed, or the player builds on (a few more pieces), or it has been up a while
//     ▼
//   done   never again (remembered)
//
// The place step goes away by itself after a while on show (the player is busy with other things): for
// this visit only, and for good after it has gone unheeded on a few visits. Once a piece is placed the
// place step is never shown again, even if the page closes before the undo step is done.

export type TutorialStep = 'place' | 'undo' | 'done';

export interface TutorialState {
  step: TutorialStep;
  /** Visits on which the place step was shown and went unheeded (remembered). */
  visits: number;
  /** Seconds the current step has been on show this visit. */
  shownFor: number;
  /** Pieces placed since the undo step began. */
  placedSince: number;
  /** Put away for the rest of this visit. */
  resting: boolean;
  /** The current step has been on show this visit (its tutorial_shown is sent once). */
  shown: boolean;
}

export type TutorialEvent =
  /** A piece placed by the player's hand. */
  | { type: 'placed' }
  /** The player undid, or removed a piece by hand. */
  | { type: 'undone' }
  /** Time passed; `visible`: the hand was on screen meanwhile. */
  | { type: 'tick'; dt: number; visible: boolean };

/** What the change means, for analytics and for the record (null: nothing worth saying). */
export type TutorialNews = 'shown' | 'placed' | 'undone' | 'moved-on' | 'timed-out' | 'rested' | null;

/** Seconds the place step stays on show before it rests for the visit. */
export const PLACE_SECONDS = 45;
/** Visits the place step may go unheeded before it is put away for good. */
export const PLACE_VISITS = 3;
/** Seconds the undo step stays on show. */
export const UNDO_SECONDS = 20;
/** Pieces placed after the first before the undo step is taken as not wanted. */
export const UNDO_PLACES = 4;

/** Where a player starts, from what is remembered (null: nothing, a new player). */
export function startTutorial(saved: string | null | undefined): TutorialState {
  let step: TutorialStep = 'place';
  let visits = 0;
  if (saved) {
    try {
      const v = JSON.parse(saved) as { step?: unknown; visits?: unknown };
      if (v.step === 'done') step = 'done';
      visits = Math.max(0, Math.min(99, Number(v.visits) | 0));
    } catch {
      step = 'done'; // Something we cannot read: better no hand than a hand that is wrong.
    }
  }
  if (visits >= PLACE_VISITS) step = 'done';
  return { step, visits, shownFor: 0, placedSince: 0, resting: false, shown: false };
}

/** What is remembered of a state (written whenever it changes). */
export function saveTutorial(s: TutorialState): string {
  // Once a piece is down, the place step is over for good: a new visit starts at done, not at undo.
  return JSON.stringify({ step: s.step === 'place' ? 'place' : 'done', visits: s.visits });
}

/** The hand is on screen now (and should be drawn). */
export const showing = (s: TutorialState): boolean => s.step !== 'done' && !s.resting;

export function stepTutorial(s: TutorialState, e: TutorialEvent): { state: TutorialState; news: TutorialNews } {
  if (s.step === 'done') return { state: s, news: null };
  switch (e.type) {
    case 'placed':
      if (s.step === 'place') return { state: { ...s, step: 'undo', shownFor: 0, placedSince: 0, resting: false, shown: false }, news: 'placed' };
      if (s.placedSince + 1 >= UNDO_PLACES) return { state: { ...s, step: 'done' }, news: 'moved-on' };
      return { state: { ...s, placedSince: s.placedSince + 1 }, news: null };
    case 'undone':
      // Undoing before anything was placed (the town that grew, say) is not the step being learned.
      if (s.step !== 'undo') return { state: s, news: null };
      return { state: { ...s, step: 'done' }, news: 'undone' };
    case 'tick': {
      if (!e.visible || s.resting) return { state: s, news: null };
      const first = !s.shown;
      const next = { ...s, shownFor: s.shownFor + e.dt, shown: true };
      if (s.step === 'undo' && next.shownFor >= UNDO_SECONDS) return { state: { ...next, step: 'done' }, news: 'timed-out' };
      if (s.step === 'place' && next.shownFor >= PLACE_SECONDS) {
        const visits = s.visits + 1;
        if (visits >= PLACE_VISITS) return { state: { ...next, visits, step: 'done' }, news: 'timed-out' };
        return { state: { ...next, visits, resting: true }, news: 'rested' };
      }
      return { state: next, news: first ? 'shown' : null };
    }
  }
}
