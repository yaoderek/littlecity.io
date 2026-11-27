// Post my town: its limits (140 characters as a reader counts them, Chinese and emoji too; a name of 1 to
// 20), what cannot be posted, and a copy of a post posted with that post as its parent.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { ForumApi } from './api';
import { cannotPost, checkWords, createPublishDialog } from './publish';
import { type FakeElement, FakeEvent, installFakeDom, settle } from './testing/fake-dom';

let restore: () => void;
beforeAll(() => {
  restore = installFakeDom();
});
afterAll(() => restore());

describe('the limits', () => {
  test('a caption of 140 characters goes, Chinese and emoji counted one each; 141 does not', () => {
    const chinese = '我'.repeat(140);
    const emoji = '🏠'.repeat(140);
    expect(emoji.length).toBe(280);
    expect(checkWords('mira', chinese)).toBeNull();
    expect(checkWords('mira', emoji)).toBeNull();
    expect(checkWords('mira', `${chinese}我`)).toBe('A caption is at most 140 characters.');
    expect(checkWords('mira', `${emoji}🏡`)).toBe('A caption is at most 140 characters.');
    expect(checkWords('mira', '')).toBeNull();
  });

  test('a name of 1 to 20 characters', () => {
    expect(checkWords('   ', 'hi')).toBe('Pick a name first.');
    expect(checkWords('小'.repeat(20), '')).toBeNull();
    expect(checkWords('🐱'.repeat(20), '')).toBeNull();
    expect(checkWords('a'.repeat(21), '')).toBe('A name is 1 to 20 characters.');
  });

  test('an island with nothing built, a town too big, a town being visited: not posted, with a plain reason', () => {
    expect(cannotPost({ code: 'c', worth: false, visiting: false })).toBe('Build something first.');
    expect(cannotPost({ code: 'x'.repeat(200_001), worth: true, visiting: false })).toBe('This town is too big to post.');
    expect(cannotPost({ code: 'c', worth: true, visiting: true })).toBe('Make a copy first.');
    expect(cannotPost({ code: 'c', worth: true, visiting: false })).toBeNull();
  });

  test('the caption box keeps no more than 140 characters as typed, and counts them', () => {
    const d = createPublishDialog(host({}).h);
    const root = d.el as unknown as FakeElement;
    const box = root.querySelector('[data-forum="pub-caption"]')!;
    box.value = '🏠'.repeat(150);
    box.dispatchEvent(new FakeEvent('input'));
    expect([...box.value].length).toBe(140);
    expect(root.querySelector('[data-forum="pub-count"]')!.textContent).toBe('140/140');
  });
});

function host(town: { from?: string | null; worth?: boolean }) {
  const sent: { code: string; caption: string; picture: string; parent?: string | null }[] = [];
  const posted: string[] = [];
  const api = {
    me: () => ({ id: 'p', secret: 's', name: 'mira' }),
    setName: async () => undefined,
    publish: async (p: (typeof sent)[number]) => (sent.push(p), 'new1'),
  } as unknown as ForumApi;
  const h = {
    api,
    app: {
      town: () => ({ code: 'TOWN', worth: town.worth ?? true, from: town.from ?? null, visiting: false }),
      picture: () => 'data:image/jpeg;base64,AAAA',
      visit: () => null,
      copy: () => null,
    },
    say: () => undefined,
    retake: () => undefined,
    posted: (id: string) => void posted.push(id),
    cancel: () => undefined,
  };
  return { h, sent, posted };
}

describe('posting', () => {
  test('a town copied from a post is posted with that post as its parent', async () => {
    const { h, sent, posted } = host({ from: 'orig7' });
    const root = createPublishDialog(h).el as unknown as FakeElement;
    root.querySelector('[data-forum="pub-caption"]')!.value = '  my harbour  ';
    root.querySelector('[data-forum="pub-post"]')!.click();
    await settle();
    expect(sent).toEqual([{ code: 'TOWN', caption: 'my harbour', picture: 'data:image/jpeg;base64,AAAA', parent: 'orig7' }]);
    expect(posted).toEqual(['new1']);
  });

  test('a town of the player\'s own has no parent; an empty island cannot be sent', async () => {
    const mine = host({});
    const root = createPublishDialog(mine.h).el as unknown as FakeElement;
    root.querySelector('[data-forum="pub-post"]')!.click();
    await settle();
    expect(mine.sent[0]!.parent).toBeNull();
    const empty = host({ worth: false });
    const r2 = createPublishDialog(empty.h).el as unknown as FakeElement;
    expect(r2.querySelector('[data-forum="pub-post"]')!.disabled).toBe(true);
    expect(r2.querySelector('[data-forum="pub-why"]')!.textContent).toBe('Build something first.');
  });
});
