// Fixture for U18 (orchard) with damaged trees: the orchard's ladders when the tree they lean on is
// gone. Six trees on a 2-cell grid per row, one damage state per row, north to south:
//   z 10  sound                         ladders lean on the trunk's fork
//   z 12  burnt out (fire, stage 3)     a black stump: the ladder lies on the grass
//   z 14  rubble (blast, stage 3)       a snapped stump: the ladder lies on the grass
//   z 16  half-burnt (fire, stage 2)    bare black branches: the ladder lies on the grass
//   z 18  regrowing (mending, early)    a small tree by the stump: the ladder lies on the grass
//   z 20  scorched (fire, stage 1)      the tree is still whole: the ladder stands

import { scenario } from '@/scenario';
import { packRuin } from '@/world/damage';

const ROWS: readonly number[] = [
  0,
  packRuin({ stage: 3, cause: 'fire' }),
  packRuin({ stage: 3, cause: 'blast' }),
  packRuin({ stage: 2, cause: 'fire' }),
  packRuin({ stage: 3, cause: 'blast', mending: true, progress: 8 }),
  packRuin({ stage: 1, cause: 'fire' }),
];

export default scenario({
  name: 'U18.orchard-ruins',
  seed: 1818,
  about: 'An orchard with a row of trees in each damage state: a ladder whose tree is a stump, bare or regrowing lies on the grass, and nobody picks from it.',
  build(b) {
    ROWS.forEach((ruin, i) => {
      const z = 10 + i * 2;
      for (let x = 10; x <= 20; x += 2) {
        b.put('tree', x, z);
        if (ruin) b.edit({ type: 'setRuin', cell: b.cell(x, 1, z), ruin });
      }
    });
  },
  cameras: [
    { name: 'rows', yaw: 35, pitch: 36, zoom: 3.2, target: [15, 1, 15] },
    { name: 'burnt', yaw: 30, pitch: 30, zoom: 6.5, target: [15, 1, 12.5] },
    { name: 'bare', yaw: 210, pitch: 30, zoom: 6.5, target: [15, 1, 17] },
    { name: 'standing-winter', yaw: 300, pitch: 28, zoom: 8, target: [15, 1, 20], season: 'winter' },
    { name: 'standing-winter-east', yaw: 120, pitch: 28, zoom: 8, target: [15, 1, 20], season: 'winter' },
    { name: 'fork-winter', yaw: 200, pitch: 22, zoom: 20, target: [15.6, 1.3, 20.4], season: 'winter' },
    { name: 'fork-summer', yaw: 200, pitch: 22, zoom: 20, target: [15.6, 1.3, 20.4] },
    { name: 'fallen-close', yaw: 30, pitch: 30, zoom: 16, target: [13, 1, 12] },
  ],
  expect(_plan, dressing, check) {
    const rule = 'U18.orchard';
    const ladders = check.hasProp({ rule, type: 'ladder' });
    const down = (p: (typeof ladders)[number]): boolean => !!(p.params as { fallen?: number } | undefined)?.fallen;
    // The row of the tree a ladder leans on (the cell behind its slot).
    const treeRow = (p: (typeof ladders)[number]): number => {
      if (!('cell' in p.at) || p.at.face === undefined) return -1;
      const z = (p.at.cell >> 6) & 63;
      return p.at.face === 0 ? z + 1 : p.at.face === 2 ? z - 1 : z;
    };
    const fallen = ladders.filter(down);
    check.ok(fallen.length > 0, 'a ladder whose tree is destroyed lies on the grass');
    for (const p of fallen) check.ok(!dressing.sockets.some((s) => s.owner === p.id), 'nobody picks from a fallen ladder');
    for (const p of ladders) {
      const row = treeRow(p);
      const destroyed = row >= 12 && row <= 18;
      check.ok(down(p) === destroyed, `${p.id}: ${destroyed ? 'its tree is destroyed, it lies down' : 'its tree is whole, it stands'}`);
    }
  },
});
