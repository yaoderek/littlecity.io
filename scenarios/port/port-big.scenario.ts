// The biggest port to measure (design: phones first): a block of dock 6 deep
// and 30 long along the south shore, four cranes (large, medium, large,
// medium), two berths a cargo ship long, a yard of some fifty containers,
// and a town behind it. A cargo ship is in when it opens.
//
//   node tools/phone-bench.mjs port-big --query quality=auto

import { scenario } from '@/scenario';

export default scenario({
  name: 'port-big',
  seed: 6102,
  about: 'The biggest port: 6 × 30 dock, four cranes, two cargo-ship berths, a town behind.',
  terrain(t) {
    t.flat(0);
    t.rect(6, 6, 41, 20, 1);
  },
  build(b) {
    for (let x = 9; x <= 38; x++) for (let z = 21; z <= 26; z++) b.block('dock', x, 0, z);
    b.path(7, 20, 40, 20);
    for (let i = 0; i < 8; i++) b.house(8 + i * 4, 17, { floors: 1 + (i % 3), w: 2, color: (i * 3) % 8 });
    for (let i = 0; i < 8; i++) b.path(10 + i * 4, 18, 10 + i * 4, 19);
    b.plaza(14, 13, 21, 15);
    b.put('stall', 15, 13).put('stall', 19, 14);
    for (let i = 0; i < 6; i++) b.house(8 + i * 5, 8, { floors: 2, w: 2, d: 2, color: i + 1 });
  },
  cameras: [
    { name: 'overview', yaw: 45, pitch: 35, zoom: 1.6, target: [24, 1, 24] },
    { name: 'port', yaw: 30, pitch: 32, zoom: 2.2, target: [24, 1, 25] },
  ],
  expect(_plan, dressing, check) {
    check.role(9, 0, 21, 'port');
    check.ok(dressing.actors.filter((a) => a.type === 'port-crane').length === 4, 'four cranes');
    check.ok(dressing.actors.filter((a) => a.type === 'ship-call' && a.variant === 'freighter').length === 2, 'two cargo-ship berths');
  },
});
