// The tutorial hand's rules (./tutorial-state.ts): place, then undo, then never again.

import { describe, expect, test } from 'vitest';
import { PLACE_SECONDS, PLACE_VISITS, saveTutorial, showing, startTutorial, stepTutorial, UNDO_PLACES, UNDO_SECONDS, type TutorialEvent, type TutorialState } from './tutorial-state';

/** Runs events and gathers what each meant. */
function run(s: TutorialState, events: TutorialEvent[]): { state: TutorialState; news: string[] } {
  const news: string[] = [];
  for (const e of events) {
    const r = stepTutorial(s, e);
    s = r.state;
    if (r.news) news.push(r.news);
  }
  return { state: s, news };
}
const tick = (dt: number, visible = true): TutorialEvent => ({ type: 'tick', dt, visible });

describe('the tutorial hand', () => {
  test('a new player: shown, placed, shown again at undo, undone, done for good', () => {
    const start = startTutorial(null);
    expect(start.step).toBe('place');
    expect(showing(start)).toBe(true);
    const { state, news } = run(start, [tick(0.5), tick(0.5), { type: 'placed' }, tick(0.5), { type: 'undone' }]);
    expect(news).toEqual(['shown', 'placed', 'shown', 'undone']);
    expect(state.step).toBe('done');
    expect(showing(state)).toBe(false);
    expect(startTutorial(saveTutorial(state)).step).toBe('done');
  });

  test('once a piece is down the place step never comes back, even if the page closes first', () => {
    const { state } = run(startTutorial(null), [tick(1), { type: 'placed' }]);
    expect(state.step).toBe('undo');
    expect(startTutorial(saveTutorial(state)).step).toBe('done');
  });

  test('time only counts while the hand is on screen', () => {
    const { state, news } = run(startTutorial(null), [tick(PLACE_SECONDS * 2, false)]);
    expect(state.shownFor).toBe(0);
    expect(news).toEqual([]);
  });

  test('left alone, the place step rests for the visit, and after a few visits for good', () => {
    let saved: string | null = null;
    for (let visit = 1; visit <= PLACE_VISITS; visit++) {
      const { state, news } = run(startTutorial(saved), [tick(1), tick(PLACE_SECONDS)]);
      saved = saveTutorial(state);
      if (visit < PLACE_VISITS) {
        expect(news).toEqual(['shown', 'rested']);
        expect(showing(state)).toBe(false);
        expect(state.step).toBe('place');
      } else {
        expect(news).toEqual(['shown', 'timed-out']);
        expect(state.step).toBe('done');
      }
    }
    expect(startTutorial(saved).step).toBe('done');
  });

  test('the undo step goes by itself after a while, or once the player builds on', () => {
    const placed = run(startTutorial(null), [{ type: 'placed' }]).state;
    expect(run(placed, [tick(UNDO_SECONDS + 1)]).news).toEqual(['timed-out']);
    const more = Array.from({ length: UNDO_PLACES }, (): TutorialEvent => ({ type: 'placed' }));
    const r = run(placed, more);
    expect(r.news).toEqual(['moved-on']);
    expect(r.state.step).toBe('done');
  });

  test('an undo before anything is placed (the town that grew) does not finish it', () => {
    const { state, news } = run(startTutorial(null), [{ type: 'undone' }]);
    expect(state.step).toBe('place');
    expect(news).toEqual([]);
  });

  test('done stays done whatever happens', () => {
    const done = startTutorial(JSON.stringify({ step: 'done', visits: 0 }));
    expect(run(done, [tick(1), { type: 'placed' }, { type: 'undone' }]).news).toEqual([]);
  });

  test('a remembered value it cannot read shows nothing rather than something wrong', () => {
    expect(startTutorial('{oops').step).toBe('done');
    expect(startTutorial(JSON.stringify({ step: 'place', visits: 1 })).step).toBe('place');
  });
});
