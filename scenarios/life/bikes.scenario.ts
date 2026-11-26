// Bikes: a long street of cottages with a square at its far end. Some front
// doors have a bike leaning by them (D11's door-bike); their owners ride to
// the square and back (src/life/people/bikes.ts) and lean them by the door
// or wall they stop at.

import { scenario } from '@/scenario';

export default scenario({
  name: 'bikes',
  seed: 72,
  about: 'A long street of cottages, bikes by the doors, and a square at the far end.',
  terrain(t) {
    t.flat(1);
  },
  build(b) {
    b.path(5, 20, 35, 20);
    for (let i = 0; i < 8; i++) {
      b.house(6 + i * 4, 17, { floors: 1 + (i % 2), w: 2, d: 2, color: i });
      b.house(6 + i * 4, 22, { floors: 1 + ((i + 1) % 2), w: 2, d: 2, color: (i + 3) % 8 });
      b.path(7 + i * 4, 19, 7 + i * 4, 19).path(7 + i * 4, 21, 7 + i * 4, 21);
    }
    b.plaza(36, 16, 42, 24);
  },
  cameras: [
    { name: 'overview', yaw: 45, pitch: 35, zoom: 1.6, target: [24, 1, 24] },
    { name: 'street', yaw: 30, pitch: 34, zoom: 3.4, target: [24, 1, 20] },
  ],
  expect(_plan, dressing, check) {
    const bikes = dressing.props.filter((p) => p.type === 'door-bike');
    check.ok(bikes.length >= 4, `bikes by the doors (${bikes.length})`);
  },
});
