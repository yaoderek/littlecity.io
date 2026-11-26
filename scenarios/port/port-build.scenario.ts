// A port one cell short: a block of dock 3 deep and 10 long against the
// shore with a hole in its middle row, so it is still a quay. Placing the
// missing cell makes it a port: the deck changes over in a run of puffs, the
// cranes rise one after another, the containers are set down.
//
//   node src/life/testing/sequence.mjs port-build --edit 'place:dock@18,0,22' --frames 16 --every 150 --zoom 3.4 --target 19,1,22

import { scenario } from '@/scenario';

export default scenario({
  name: 'port-build',
  seed: 6103,
  about: 'One cell short of a port: place it and the port arrives.',
  terrain(t) {
    t.flat(0);
    t.rect(8, 8, 34, 20, 1);
  },
  build(b) {
    for (let x = 14; x <= 23; x++) for (let z = 21; z <= 23; z++) if (!(x === 18 && z === 22)) b.block('dock', x, 0, z);
    b.path(12, 20, 26, 20);
    for (let i = 0; i < 4; i++) b.house(13 + i * 4, 17, { floors: 2, w: 2, color: (i * 2 + 1) % 8 });
  },
  cameras: [{ name: 'port', yaw: 35, pitch: 32, zoom: 3.4, target: [19, 1, 22] }],
  expect(_plan, dressing, check) {
    check.role(14, 0, 21, 'quay');
    check.ok(!dressing.actors.some((a) => a.type === 'port-crane'), 'no cranes yet');
  },
});
