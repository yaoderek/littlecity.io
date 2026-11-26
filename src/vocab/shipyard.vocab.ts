// The shipyard (R-D05, D29, L75; src/life/town/chains/shipyard.ts). Types
// only: merged into src/core/vocab.ts by module augmentation.
//
// A dock three cells wide running six or more cells straight out from the
// shore, with a warehouse or a barn by its land end, is a shipyard. Its
// middle column is the slipway; the two side columns are working decks.

import '@/core/vocab';

declare module '@/core/vocab' {
  interface RoleVocab {
    'shipyard': 'dock';
  }
  interface FeatureVocab {
    // R-D05: the slipway. cell = a DOCK cell (level 0), dir = the way to the sea, so the frame is the
    // bottom centre of the cell's seaward face, +Z out to sea.
    //   way   one cell of the slip down the middle column: the two ground ways on their blocking,
    //         sloping down toward the sea; the last one runs on down into the water
    //   side  the seaward end of a side deck: nothing drawn; it keeps mooring piles out of the launch
    'slipway': true;
    'slipway/way': true;
    'slipway/side': true;
    /** Which cell of the slip this is (0 at the land end) and how many cells the slip has. */
    'slipway.i': number;
    'slipway.n': number;
  }
  interface PropVocab {
    // D29: a low timber kerb along each long side of the slipway and across its head: the walking
    // graph treats it as a run (nobody walks under the ship). At a floor slot of a slip deck cell.
    'slip-rail': true;
    /** The dock's colour (its wood). */
    'slip-rail.color': number;
  }
}
