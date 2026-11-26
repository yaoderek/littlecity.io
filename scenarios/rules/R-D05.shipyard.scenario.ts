// R-D05 Shipyard: a dock 3 wide running 6+ straight out from the shore with
// a warehouse by its land end. From the west:
//   3 × 6 with a warehouse       a shipyard: it builds cogs
//   3 × 8 with a warehouse       a shipyard on a long slip: it builds galleons
//   3 × 6, no shed near          a jetty
//   2 × 6 with a warehouse       too narrow: a jetty
//   3 × 7 with a warehouse       a shipyard (cogs)

import { scenario } from '@/scenario';

export default scenario({
  name: 'R-D05.shipyard',
  seed: 105,
  about: 'Shipyards, and the wide docks that are not.',
  terrain(t) {
    t.flat(1);
    t.water(4, 30, 43, 43);
  },
  build(b) {
    const dock = (x0: number, x1: number, z1: number): void => {
      for (let x = x0; x <= x1; x++) for (let z = 30; z <= z1; z++) b.block('dock', x, 0, z);
    };
    dock(8, 10, 35);
    dock(16, 18, 37);
    dock(24, 26, 35);
    dock(31, 32, 35);
    dock(37, 39, 36);
    for (const x of [8, 16, 30, 37]) b.house(x, 26, { w: 3, d: 2, floors: 2, color: 7 });
    b.path(6, 28, 41, 28);
  },
  cameras: [
    { name: 'front', yaw: 45, pitch: 34, zoom: 2.2, target: [20, 1, 32] },
    { name: 'yard', yaw: 35, pitch: 32, zoom: 5, target: [9.5, 1, 32] },
    { name: 'long', yaw: 60, pitch: 30, zoom: 4.5, target: [17.5, 1, 33] },
  ],
  expect(_plan, _dressing, check) {
    check.role(9, 0, 32, 'shipyard');
    check.role(17, 0, 33, 'shipyard');
    check.role(25, 0, 32, 'jetty');
    check.role(31, 0, 32, 'jetty');
    check.role(38, 0, 33, 'shipyard');
    // The slip: one way per cell down the middle, its sides marked at the sea end.
    check.equal(check.features({ type: 'slipway', variant: 'way', on: [9, 0, 30] }).length, 6, 'ways of the first slip');
    check.hasFeature({ type: 'slipway', variant: 'way', at: [17, 0, 37], dir: 2 });
    check.hasFeature({ type: 'slipway', variant: 'side', at: [16, 0, 37], dir: 2 });
    check.hasFeature({ type: 'slipway', variant: 'side', at: [18, 0, 37], dir: 2 });
    check.noFeature({ type: 'slipway', on: [25, 0, 30] });
    // Nothing set down or moored on the slip, no bollard on the ends of the side decks.
    check.noFeature({ type: 'bollard', at: [9, 0, 35] });
    check.noFeature({ type: 'bollard', at: [8, 0, 35], dir: 2 });
    check.noFeature({ type: 'bollard', at: [10, 0, 35], dir: 2 });
    // No mooring piles off the end, where the ships go in.
    for (const [x, z] of [[8, 35], [9, 35], [10, 35], [16, 37], [17, 37], [18, 37]] as const) check.noFeature({ type: 'dock-pile', at: [x, 0, z], dir: 2 });
    // Kerbs along the slip; the posts for the shipwrights.
    check.hasProp({ type: 'slip-rail', at: [9, 1, 30] }, 3);
    check.hasProp({ type: 'slip-rail', at: [9, 1, 33] }, 2);
    check.hasSocket({ type: 'errand', rule: 'L75.shipyard' }, 3);
  },
});
