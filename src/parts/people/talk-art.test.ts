// Market talk's pictures: sound meshes, and every shape of every picture faces the camera (the
// balloon is turned to it, +Z out): a shape wound the other way would be culled, unseen.

import { describe, expect, test } from 'vitest';
import { validateMesh } from '@/gen/checks';
import { coinMesh, PICTURES, TALK_BALLOON, talkBubbleMesh } from './talk-art';

describe('market talk pictures', () => {
  test.each(PICTURES)('%s: sound, and every shape of it seen from the front', (pic) => {
    for (const side of ['L', 'R'] as const) {
      const m = talkBubbleMesh(pic, side);
      expect(validateMesh(m)).toEqual([]);
      // Ink groups by what faces the front (+Z) in front of the balloon's face, and what does not.
      const front = new Set<number>(), all = new Set<number>();
      const p = m.position;
      for (let v = 0; v < p.length; v += 9) {
        const ux = p[v + 3]! - p[v]!, uy = p[v + 4]! - p[v + 1]!, vx = p[v + 6]! - p[v]!, vy = p[v + 7]! - p[v + 1]!;
        const nz = ux * vy - uy * vx;
        const z = (p[v + 2]! + p[v + 5]! + p[v + 8]!) / 3;
        const id = m.inkId[v / 3]!;
        if (z > TALK_BALLOON.t + 0.001) {
          all.add(id);
          if (nz > 0) front.add(id);
        }
      }
      expect(all.size).toBeGreaterThan(0);
      expect([...all].filter((id) => !front.has(id))).toEqual([]);
    }
  });
  test('the coin', () => expect(validateMesh(coinMesh())).toEqual([]));
});
