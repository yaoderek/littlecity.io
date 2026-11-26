// R-D00 · The container port. A 4 × 12 block of dock along the south shore
// (Derek's test: one large and one medium crane, booms up until a freighter
// comes), and a 3 × 6 one on the east shore (the smallest port: one medium
// crane). Behind the big one, a street of shops and a square with a stall,
// for the carters to take the unpacked goods to.
//
//   node src/life/testing/sequence.mjs R-D00.port --warm 0 --frames 16 --every 6000 --zoom 3 --target 20,1,24

import { scenario } from '@/scenario';

export default scenario({
  name: 'R-D00.port',
  seed: 6101,
  about: 'A container port: cranes, a yard of containers, an office and floodlights; cargo ships call.',
  terrain(t) {
    t.flat(0);
    t.rect(8, 6, 38, 22, 1);
  },
  build(b) {
    for (let x = 14; x <= 25; x++) for (let z = 23; z <= 26; z++) b.block('dock', x, 0, z);
    for (let x = 39; x <= 41; x++) for (let z = 12; z <= 17; z++) b.block('dock', x, 0, z);
    b.path(10, 22, 36, 22);
    for (let i = 0; i < 5; i++) b.house(12 + i * 4, 19, { floors: 2, w: 2, color: (i * 2 + 1) % 8 });
    b.path(14, 20, 14, 21).path(18, 20, 18, 21).path(22, 20, 22, 21).path(26, 20, 26, 21);
    b.plaza(30, 16, 35, 21);
    b.put('stall', 31, 17).put('stall', 34, 19);
    for (let i = 0; i < 4; i++) b.house(11 + i * 4, 13, { floors: 1, w: 2, d: 2, color: i + 2 });
  },
  cameras: [
    { name: 'overview', yaw: 45, pitch: 35, zoom: 1.6, target: [24, 1, 24] },
    { name: 'port', yaw: 35, pitch: 30, zoom: 3.2, target: [20, 1, 25] },
    { name: 'close', yaw: 60, pitch: 26, zoom: 6, target: [17, 1.5, 25] },
  ],
  expect(plan, dressing, check) {
    check.role(14, 0, 23, 'port');
    check.role(39, 0, 12, 'port');
    const cranes = dressing.actors.filter((a) => a.type === 'port-crane');
    check.ok(cranes.filter((a) => a.variant === 'large').length === 1, 'the big port has one large crane');
    check.ok(cranes.filter((a) => a.variant === 'medium').length === 2, 'and a medium one; the small port one medium');
    check.hasFeature({ type: 'port-deck' }, 2);
    check.hasFeature({ type: 'port-office' }, 2);
    check.hasProp({ type: 'port-stack' });
    void plan;
  },
});
