// Vocabulary for the bikes by front doors (D11) that their owners ride
// (src/life/people/bikes.ts). Types only.

import '@/core/vocab';

declare module '@/core/vocab' {
  interface PropVocab {
    // D11. At a 'door' socket, beside the doorstep: the bike leaning on the wall to the right of the door
    // (the doorstep keeps that side clear: 'doorstep.bicycle'). Its own prop, so life can take it away
    // while its owner rides it (src/life/people/bikes.ts) and put it back when they are home.
    'door-bike': true;
    'door-bike.steps': number; //       the door's stoop steps (the wall is that much farther back)
    'door-bike.paint': number; //       0 red, 1 blue
  }
}
