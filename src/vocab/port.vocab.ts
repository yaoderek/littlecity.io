// Vocabulary for the container port (R-D00, J23-P, D15-P, L38-F and the
// port's life, src/life/port). Types only.
//
// Port coordinates (src/rules/roles/port-shape.ts): `i` along the shore,
// `r` rows out from it. The two seaward rows carry the crane rails.

import '@/core/vocab';

declare module '@/core/vocab' {
  interface RoleVocab {
    // R-D00: a dock filling a rectangle 3+ deep and 6+ long against the shore, open water off its far side.
    'port': 'dock';
  }

  interface FeatureVocab {
    // J23-P: the paint on a port's deck: the crane rails along the seaward rows, lane lines, the outlines of
    // the container bays. cell = the port's (i = 0, r = 0) cell or the first port cell; drawn in world terms
    // from its params.
    'port-deck': true;
    'port-deck.landward': number; // Dir4
    'port-deck.length': number;
    'port-deck.depth': number;
    /** Column of (i = 0, r = 0), relative to the feature's cell. */
    'port-deck.dx': number;
    'port-deck.dz': number;

    // J23-P: the harbour office at the land end of the yard. cell + dir = toward the aisle it opens on.
    // Owns socket 'flag-mount' (its flagstaff).
    'port-office': true;

    // J23-P: a tall floodlight mast at a corner of an aisle cell. cell = the dock cell; params give the
    // corner (+1/−1 east, +1/−1 south). Owns socket 'perch' (the lamp gallery's rail).
    'port-mast': true;
    'port-mast.cx': number;
    'port-mast.cz': number;
  }

  interface PropVocab {
    // D15-P: a container bay in the yard (one cell of it): the stack itself is the port's life
    // (src/life/port). Drawn as nothing; it tells the walking graph the cell is cluttered.
    'port-stack': true;
  }

  interface ActorVocab {
    // D15-P: a container crane standing on the rails of a port, anchored at its home deck cell, facing the
    // water. The static frame; its moving pieces are spawned by the port system.
    'port-crane': true;
    'port-crane/medium': true; // a slewing jib crane on a four-legged portal
    'port-crane/large': true; //  a ship-to-shore gantry, the A-frame kind
    'port-crane.look': number;
    /** Where it stands along the rails: its offset (cells, + along the port) from the anchor's middle. */
    'port-crane.off': number;
    /** How far it may travel along its rails from there (frame X, cells): a large crane runs, a medium one stands. */
    'port-crane.lo': number;
    'port-crane.hi': number;

    // The cranes' moving pieces (spawned). Frames are given with each part.
    'crane-piece': true;
    'crane-piece/medium-top': true; //  the slewing house: machinery, cab, A-frame, counterweight
    'crane-piece/medium-jib': true; //  the luffing jib, hinged at its foot, along +Z
    'crane-piece/large-boom': true; //  the outreach boom, hinged at the frame, along +Z
    'crane-piece/trolley': true; //     the trolley and its cab, running along the boom
    'crane-piece/spreader': true; //    the spreader frame that grabs a container
    'crane-piece/hook': true; //        the medium crane's hook block
    'crane-piece/cable': true; //       a pair of hoist ropes, a unit long down −Y (scaled to length)
    'crane-piece/cables4': true; //     the four ropes of a spreader, a unit long down −Y
    'crane-piece.look': number;

    // A shipping container, 2 cells by 1 and half a cell tall. Frame: its floor's middle, +Z along its length,
    // the doors at the −Z end. Spawned (the yard, the cargo ships, the cranes' loads).
    'container': true;
    'container/open': true; // without its doors (they are their own instances, swung open)
    'container.look': number; // its colour (0–5)
    // One door leaf. Frame: its hinge line's foot, the leaf along +X when shut.
    'container-door': true;
    'container-door.look': number;
    'container-door.side': number; // 1 the right-hand leaf, −1 the left

    // L38-F: the cargo ship and its tug (drawn pieces, spawned by the harbour system).
    'ship-call/freighter': true;
    'freighter': true;
    'freighter.look': number;
    'tug': true;
    'tug.look': number;
  }
}
