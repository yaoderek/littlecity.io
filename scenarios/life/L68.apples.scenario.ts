// L68 · Apples to market. An orchard (twelve trees two apart) beside a
// little market square with two stalls, one selling fruit, and houses round
// it: at harvest the pickers fill the big baskets, the gardener carries a
// basket heaped with apples to the fruit stall, and people come to buy one,
// asking in a picture bubble.

import { scenario } from '@/scenario';

export default scenario({
  name: 'L68.apples',
  seed: 68,
  about: 'An orchard and a square with a fruit stall: apples from the trees to the counter to people’s hands.',
  terrain(t) {
    t.flat(1);
  },
  build(b) {
    for (let x = 10; x <= 16; x += 2) for (let z = 12; z <= 16; z += 2) b.put('tree', x, z);
    b.path(10, 18, 26, 18).path(18, 12, 18, 17);
    b.plaza(20, 12, 24, 16);
    b.put('stall', 20, 12).put('stall', 24, 16);
    for (let i = 0; i < 3; i++) b.house(20 + i * 3, 19, { floors: 2, w: 2, d: 2, color: i + 1 });
    b.house(26, 12, { floors: 2, w: 2, d: 2, color: 5 }).house(26, 15, { floors: 1, w: 2, d: 2, color: 6 });
    b.house(10, 19, { floors: 1, w: 2, d: 2, color: 4 }).house(14, 19, { floors: 2, w: 2, d: 2, color: 7 });
    b.path(25, 13, 25, 16);
  },
  cameras: [
    { name: 'orchard', yaw: 35, pitch: 36, zoom: 3.6, target: [18, 1, 15] },
    { name: 'stall', yaw: 40, pitch: 34, zoom: 6, target: [21, 1, 14] },
  ],
  expect(plan, dressing, check) {
    const posts = dressing.sockets.filter((s) => s.type === 'errand' && (s.name ?? '').startsWith('apples|'));
    check.ok(posts.some((s) => s.name!.startsWith('apples|basket|')), 'an orchard basket is a post');
    check.ok(posts.some((s) => s.name!.startsWith('apples|sell|stall')), 'a stall to sell the apples at');
    for (const s of posts) check.ok(dressing.nav.nodeAt.has(s.cell), `${s.name} on the graph`);
    const fruit = [...plan.tags].some(([, tags]) => tags.has('goods:fruit'));
    check.ok(fruit, 'one of the stalls sells fruit');
  },
});
