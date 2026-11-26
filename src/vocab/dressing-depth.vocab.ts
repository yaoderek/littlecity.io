// Vocabulary added by the Dressing owner in Stage 4 (depth): the urban-fill
// rules that change how a house is drawn (U09 to U12), the fence footing fix,
// and the rest of part D. Types only: merged into the registries by module
// augmentation (see the header of src/core/vocab.ts).

import '@/core/vocab';

declare module '@/core/vocab' {
  interface FeatureVocab {
    // U09: the facade cell a long straight street runs into. cell + dir, drawn on the wall plane
    // (origin at the bottom centre of the storey on the wall, +Z out). One of:
    'vista': true;
    'vista/clock': true; //   a clock in a stone roundel high on the storey; owns socket 'clock-hands'
    'vista/niche': true; //   a round-headed niche with a little painted saint on a ledge
    'vista/doorway': true; // a grand surround round the main door: pilasters and a pediment
    'vista/oriel': true; //   a corbelled bay window standing out of an upper storey
    'vista.look': number;

    // U10: a round corner turret on the upper storeys of a house at a street junction. `cell` = the
    // lowest storey it starts on, `dir` = the side whose RIGHT-hand corner (facing the wall) it
    // stands on. `storeys` = how many storeys its body climbs (it ends in a cone above the eave).
    'corner-oriel': true;
    'corner-oriel.storeys': number;
    'corner-oriel.look': number;

    // U11: one bay of the town hall's arcade, in front of a ground-storey wall on the square.
    // cell + dir, wall plane. `left`, `right`: 1 if the arcade ends at that side of the bay (a
    // corner pier closes it), 0 if it runs on into the next bay.
    'arcade': true;
    'arcade.left': 0 | 1;
    'arcade.right': 0 | 1;

    // Fence fix: an edge piece of a fence run with nothing flat to stand on either side of it (round
    // the eaves of a pitched roof, in mid-air). The generator leaves it out. `edge` = the piece.
    'run-bare': true;
  }
  interface PropVocab {
    // Frames, unless an entry says otherwise: a prop at a floor slot stands on the cell's floor at
    // the slot, +Z toward `face` if the anchor gives one. A prop at a 'wall-mount' socket hangs on a
    // cell face: the socket is on the cell line half-way up the storey, +Z out; the wall itself is
    // 0.07 behind it (the part steps back to it).

    // D12 is a feature ('finial/vane' with `finial.figure`), not a prop: it is part of the roof.

    // D14 roof life.
    'stork-nest': true; //             at a 'chimney-top' socket: a nest of sticks with a stork in it
    'stork-nest.look': number;
    'birdhouse': true; //              at a 'wall-mount' socket on a gable wall
    'birdhouse.look': number;

    // D17 courtyards. Cobbles: one cell, square to the world; `mask` bit d set if the cobbles run on
    // into the next cell on side d (no kerb there). A well: at the courtyard's centre slot.
    'cobbles': true;
    'cobbles.mask': number;
    'cobbles.look': number;
    'well': true;
    'well.look': number;

    // D18 garden things.
    'beehive': true; //                a row of straw skeps on a bench
    'beehive.look': number;
    'wheelbarrow': true;
    'wheelbarrow.look': number;
    'trellis': true; //                edge slot against a wall, +Z away from it: a rose on a lattice
    'trellis.look': number;
    'trellis.face': number;
    'scarecrow': true;
    'scarecrow.look': number;

    // D19: at a 'statue-base' socket (the top of a plinth).
    'statue': true;
    'statue/figure': true;
    'statue/sundial': true;
    'statue/urn': true;
    'statue.look': number;

    // D21 castle dressing.
    'wall-banner': true; //            at a 'wall-mount' socket on a curtain wall or keep: a long banner
    'wall-banner.color': number;
    'wall-banner.look': number;
    'wall-banner.back': number; //     how far behind the socket the wall face is; default 0.07
    'torch': true; //                  at a 'wall-mount' socket: a torch in an iron bracket (glows); owns 'lamp-head'
    'torch.back': number;
    'cannon': true; //                 at a floor slot, +Z the way it points
    'cannon.look': number;

    // D22: at a floor slot: an iron bowl of glowing coals on three legs. Owns 'lamp-head'.
    'brazier': true;
    'brazier.look': number;

    // D23 lighthouse base: a fog bell in a timber frame (floor slot); rocks are 'boulder' props.
    'fog-bell': true;
    'fog-bell.look': number;

    // D25 mill yard: a ladder leaning on the mill (edge slot, +Z away from the wall). Sacks and the
    // cart are the role props of R-H99.
    'ladder': true;
    'ladder.look': number;
    'ladder.back': number; //         how far behind the slot the wall it leans on is; default 0.22
    // U18 orchard: `tree`, the fruit tree behind the slot (its structure id), whose fork the part leans
    // it into; `fallen` 1 (set by src/resolve/ruins.ts when that tree is a stump, burnt bare or growing
    // back) lays it on the grass.
    'ladder.tree': number;
    'ladder.fallen': 0 | 1;

    // D26: a fingerpost at a junction, square to the world (anchor face 2): an arm toward each
    // side d with bit d set in `mask`, each with a little picture of what lies that way
    // (`signs`: 2 bits per side, 0 the town, 1 the sea, 2 a church, 3 the hills).
    'fingerpost': true;
    'fingerpost.mask': number;
    'fingerpost.signs': number;
    'fingerpost.look': number;

    // D27 post. A mailbox on a post by a door; a red pillar box on a street.
    'mailbox': true;
    'mailbox.look': number;
    'postbox': true;

    // D28 roof terrace furniture. At a floor slot on a roof terrace.
    'terrace-set': true;
    'terrace-set/parasol': true; //    a parasol over a small table and a chair
    'terrace-set/lounger': true; //    a striped deck chair
    'terrace-set/pots': true; //       a cluster of pots
    'terrace-set.color': number;
    'terrace-set.look': number;

    // D30: at a stairs cell (slot 'c', face = the way the flight climbs): pots on the steps along
    // the wall side. `side` 1 = the wall is to the climber's right (+X), −1 to the left. `steps`
    // = the bits of the five steps that carry a pot.
    'stair-pots': true;
    'stair-pots.side': number;
    'stair-pots.steps': number;
    'stair-pots.look': number;

    // D31: a coin telescope on a post, at a floor slot, +Z toward the view.
    'coin-telescope': true;

    // D32 under the trees.
    'swing': true; //                  at the tree's cell (slot 'c'), +Z toward the open side it hangs on
    'swing.look': number;
    'hammock': true; //                at the cell between two trees (slot 'c'), +X toward one tree, 1 away
    'hammock.look': number;
    'picnic': true; //                 a blanket and a basket on the grass, square to the world
    'picnic.look': number;

    // D33: a cast-iron hand pump over a stone trough, at a floor slot, +Z the way the spout points.
    'pump': true;

    // D34: a kite snagged in a tree's crown: at the tree's top cell, slot 'c'. `top` = the height
    // of the crown's top above the anchor's floor.
    'kite': true;
    'kite.top': number;
    'kite.look': number;
  }
  interface FeatureVocab {
    // D12: what a weathervane on a ridge shows: 0 an arrow, 1 a rooster, 2 a ship.
    'finial.figure': number;
  }
  interface RoleVocab {
    // U11: a big house on a square: arcaded ground storey, balcony over the door, clock, flag.
    'town-hall': 'house';
  }
  interface TagVocab {
    // U12 (edge half): a house far out from every floor of the town: thatch, timber, rough stone.
    'rustic': true;
  }
}
