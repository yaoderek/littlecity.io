// The town code's fingerprint (Global Village). Owner: Forum.
//
// If the pinned value below fails, the town code changed (a kind, a floor, an edge, a version or a
// section). That is allowed, but the forum server must go up before the game: run
// tools/deploy-forum.sh first, then tools/deploy-pages.sh (it checks). Then update the pin.

import { expect, test } from 'vitest';
import { codecFacts, codecFingerprint, fingerprintOf } from './codec-fingerprint';

test('the codec is read as it is: version 5, sections land and ruins, every kind in format order', () => {
  const f = codecFacts();
  expect(f.version).toBe(5);
  expect(f.sections).toBe(0b11);
  expect(f.placed[0]).toBe('auto');
  expect(f.floors).toContain('path');
  expect(f.edges).toEqual(['fence', 'wall']);
});

test('the fingerprint is pinned: a change here means the forum server goes up first', () => {
  expect(codecFingerprint()).toMatch(/^[0-9a-f]{12}$/);
  expect(codecFingerprint()).toBe('3af3b07af64c');
  expect(codecFingerprint()).toBe(codecFingerprint());
});

test('any change to what the decoder accepts changes the fingerprint', () => {
  const f = codecFacts();
  const base = fingerprintOf(f);
  const changed = [
    { ...f, version: 6 },
    { ...f, sections: f.sections | 0b100 },
    { ...f, placed: [...f.placed, 'bench'] },
    { ...f, placed: [f.placed[1]!, f.placed[0]!, ...f.placed.slice(2)] },
    { ...f, floors: [...f.floors, 'sand'] },
    { ...f, edges: [...f.edges, 'hedge'] },
  ].map(fingerprintOf);
  for (const c of changed) expect(c).not.toBe(base);
  expect(new Set(changed).size).toBe(changed.length);
});
