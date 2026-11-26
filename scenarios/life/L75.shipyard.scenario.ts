// L75 · A shipyard on a harbour street: a dock three wide running eight out
// from the shore (a long slip: it builds galleons) with a warehouse at its
// land end for the timber, and a street of houses behind for the shipwrights
// and the crowd. The keel is laid, the ribs rise, the planks climb, the
// livery goes on; then bunting, the town on the side decks and the shore, a
// bottle on the bow, and the ship slides into the sea and sails away.

import { scenario } from '@/scenario';

export default scenario({
  name: 'L75.shipyard',
  seed: 75,
  about: 'A shipyard with a warehouse and a street of houses: ships built and launched.',
  terrain(t) {
    t.flat(1);
    t.water(4, 24, 43, 43);
  },
  build(b) {
    for (let x = 21; x <= 23; x++) for (let z = 24; z <= 31; z++) b.block('dock', x, 0, z);
    b.house(18, 20, { w: 3, d: 2, floors: 2, color: 7 });
    b.path(8, 22, 36, 22);
    for (const x of [9, 12, 15, 25, 28, 31, 34]) b.house(x, 19, { w: 2, d: 2, floors: x % 2 ? 2 : 1, color: x % 8 });
    for (const x of [10, 14, 26, 30]) b.house(x, 15, { w: 2, d: 2, floors: 1, color: (x + 3) % 8 });
    b.path(10, 17, 31, 17).path(11, 18, 11, 21).path(27, 18, 27, 21);
  },
  cameras: [
    { name: 'overview', yaw: 45, pitch: 34, zoom: 2.4, target: [22, 1, 26] },
    { name: 'yard', yaw: 35, pitch: 32, zoom: 4.6, target: [22, 1, 27] },
    { name: 'slip', yaw: 110, pitch: 28, zoom: 5, target: [22, 1, 27] },
  ],
  expect(plan, dressing, check) {
    check.role(22, 0, 27, 'shipyard');
    const posts = dressing.sockets.filter((s) => s.type === 'errand' && (s.name ?? '').startsWith('shipyard|'));
    check.ok(posts.some((s) => s.name === 'shipyard|slip|8:galleon'), 'a slip of eight that builds galleons');
    const shed = posts.find((s) => (s.name ?? '').startsWith('shipyard|shed|'));
    check.ok(shed !== undefined && plan.roles.get(shed.structure!)?.role === 'warehouse', 'the warehouse is the timber shed');
  },
});
