// Which of the Almanac's clips play (guide-clips.ts): only while it is open, only clips well in view, the
// topmost first, two at once on a computer and one on a phone.

import { describe, expect, test } from 'vitest';
import { choosePlaying, clipUrls, IN_VIEW, PLAY_AT_ONCE, type Seen } from './guide-clips';

const seen = (id: string, top: number, ratio: number): Seen => ({ id, top, ratio });

describe('which clips play', () => {
  const page = [seen('chapel', 100, 1), seen('shop', 200, 1), seen('inn', 300, 1), seen('manor', 400, 0.2)];

  test('the topmost ones well in view, at most two on a computer and one on a phone', () => {
    expect(choosePlaying(page, PLAY_AT_ONCE.desktop, true)).toEqual(['chapel', 'shop']);
    expect(choosePlaying(page, PLAY_AT_ONCE.phone, true)).toEqual(['chapel']);
    // In whatever order the observer reports them.
    expect(choosePlaying([...page].reverse(), PLAY_AT_ONCE.desktop, true)).toEqual(['chapel', 'shop']);
  });

  test('nothing while the Almanac is shut', () => {
    expect(choosePlaying(page, PLAY_AT_ONCE.desktop, false)).toEqual([]);
  });

  test('a clip mostly scrolled out of view does not play; the next one in view does', () => {
    const scrolled = [seen('chapel', 100, IN_VIEW - 0.01), seen('shop', 200, IN_VIEW), seen('inn', 300, 1)];
    expect(choosePlaying(scrolled, PLAY_AT_ONCE.desktop, true)).toEqual(['shop', 'inn']);
    expect(choosePlaying([seen('chapel', 100, 0)], PLAY_AT_ONCE.desktop, true)).toEqual([]);
  });

  test('each clip in both forms, under the site base path', () => {
    expect(clipUrls('chapel', '/littlecity/')).toEqual({ webm: '/littlecity/guide/clips/chapel.webm', mp4: '/littlecity/guide/clips/chapel.mp4' });
  });
});
