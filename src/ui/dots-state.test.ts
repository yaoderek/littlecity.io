// The red dots' rules (./dots-state.ts): nothing before the first piece, each dot gone for good once its
// thing is used, the Almanac's back after an unlock until it is next opened.

import { describe, expect, test } from 'vitest';
import { DOT_IDS, dotted, menuDotted, saveDots, startDots, stepDots, type DotCleared, type DotId, type DotsEvent, type DotsState } from './dots-state';

/** Runs events and gathers the dots they cleared. */
function run(s: DotsState, events: DotsEvent[]): { state: DotsState; cleared: DotCleared[] } {
  const cleared: DotCleared[] = [];
  for (const e of events) {
    const r = stepDots(s, e);
    s = r.state;
    if (r.cleared) cleared.push(r.cleared);
  }
  return { state: s, cleared };
}
const use = (id: DotId): DotsEvent => ({ type: 'used', id });
const shown = (s: DotsState): DotId[] => DOT_IDS.filter((id) => dotted(s, id));
/** A visit later: what was remembered, read back. */
const reload = (s: DotsState): DotsState => startDots(saveDots(s));

describe('red dots', () => {
  test('a new player: nothing before the first piece, then every dot', () => {
    const start = startDots(null);
    expect(shown(start)).toEqual([]);
    expect(menuDotted(start, true)).toBe(false);
    const { state } = run(start, [{ type: 'ready' }]);
    expect(shown(state)).toEqual(['almanac', 'fly', 'mischief', 'grow']);
    expect(menuDotted(state, false)).toBe(true);
  });

  test('the tutorial place step over (remembered) counts as the first piece', () => {
    expect(shown(startDots(null, { placed: true }))).toEqual(['almanac', 'fly', 'mischief', 'grow']);
    expect(shown(startDots(null, { placed: false }))).toEqual([]);
  });

  test('each dot clears the first time its thing is used, for good', () => {
    const ready = run(startDots(null), [{ type: 'ready' }]).state;
    const { state, cleared } = run(ready, [use('fly'), use('fly'), use('mischief')]);
    expect(cleared).toEqual([
      { what: 'fly', afterUnlock: false },
      { what: 'mischief', afterUnlock: false },
    ]);
    expect(shown(state)).toEqual(['almanac', 'grow']);
    expect(shown(reload(state))).toEqual(['almanac', 'grow']);
  });

  test('a thing used before the first piece never gets a dot, and clears none', () => {
    const { state, cleared } = run(startDots(null), [use('almanac'), use('grow'), { type: 'ready' }]);
    expect(cleared).toEqual([]);
    expect(shown(state)).toEqual(['fly', 'mischief']);
  });

  test('the Almanac comes back after an unlock, until it is next opened', () => {
    const opened = run(startDots(null), [{ type: 'ready' }, use('almanac')]);
    expect(opened.cleared).toEqual([{ what: 'almanac', afterUnlock: false }]);
    expect(dotted(opened.state, 'almanac')).toBe(false);

    const unlocked = run(opened.state, [{ type: 'unlocked' }]).state;
    expect(dotted(unlocked, 'almanac')).toBe(true);
    // Remembered over a reload until it is opened.
    expect(dotted(reload(unlocked), 'almanac')).toBe(true);

    const again = run(reload(unlocked), [use('almanac')]);
    expect(again.cleared).toEqual([{ what: 'almanac', afterUnlock: true }]);
    expect(dotted(again.state, 'almanac')).toBe(false);
    expect(dotted(reload(again.state), 'almanac')).toBe(false);
  });

  test('an unlock does not bring back any other dot', () => {
    const { state } = run(startDots(null), [{ type: 'ready' }, use('fly'), use('grow'), use('mischief'), use('almanac'), { type: 'unlocked' }]);
    expect(shown(state)).toEqual(['almanac']);
  });

  test('the menu button is dotted while Grow a town is, or (on a phone) the Almanac', () => {
    const ready = run(startDots(null), [{ type: 'ready' }]).state;
    const grown = run(ready, [use('grow')]).state;
    expect(menuDotted(grown, false)).toBe(false);
    expect(menuDotted(grown, true)).toBe(true);
    const both = run(grown, [use('almanac')]).state;
    expect(menuDotted(both, true)).toBe(false);
    expect(menuDotted(run(both, [{ type: 'unlocked' }]).state, true)).toBe(true);
  });

  test('a player who used Mischief before the dots gets no dot for it', () => {
    expect(shown(startDots(null, { placed: true, mischief: true }))).toEqual(['almanac', 'fly', 'grow']);
  });

  test('what is remembered is read defensively', () => {
    expect(shown(startDots('not json', { placed: true }))).toEqual(['almanac', 'fly', 'mischief', 'grow']);
    expect(shown(startDots('null'))).toEqual([]);
    const odd = startDots(JSON.stringify({ ready: true, used: ['fly', 'rocket', 7], unlocked: 'yes' }));
    expect(shown(odd)).toEqual(['almanac', 'mischief', 'grow']);
    expect(odd.unlocked).toBe(false);
  });

  test('events that change nothing return the same state (nothing is written)', () => {
    const ready = run(startDots(null), [{ type: 'ready' }, use('fly')]).state;
    expect(stepDots(ready, { type: 'ready' }).state).toBe(ready);
    expect(stepDots(ready, use('fly')).state).toBe(ready);
    const unlocked = stepDots(ready, { type: 'unlocked' }).state;
    expect(stepDots(unlocked, { type: 'unlocked' }).state).toBe(unlocked);
  });
});
