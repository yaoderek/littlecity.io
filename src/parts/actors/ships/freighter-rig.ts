// The cargo ship's rig (L38-F): a steel container feeder about nine and a
// half cells long. Its numbers, shared by its part (freighter.part.ts), the
// harbour (src/life/ships) and the port's cranes (src/life/port), so a crane
// sets a container down exactly on the stack it was lifted from.
//
//   the hull     long and straight-sided, a transom stern, a raised
//                forecastle, the deck flat between them
//   the cargo    three bays of containers forward of the bridge, two across
//                and up to three high: 18 places (rig.cargo)
//   the bridge   the accommodation block right aft, four decks high, the
//                wheelhouse on top with wings out to the sides; the funnel
//                behind it (rig.funnel: where the smoke comes out)
//
// Frame: afloat. +Z the bow, +Y up, y = 0 the waterline.

import type { Vec3 } from '@/core/mat4';
import { PORT } from '@/style/port';
import { shipShape, smooth, type ShipHullSpec } from './hull';
import type { Mast, ShipRig } from './rig';

/** The deck the hatch covers stand on, their top (the containers' floor), and the bridge deck. */
export const FREIGHTER = {
  deck: 0.56,
  hatchTop: 0.64,
  forecastle: 0.84,
  /** The accommodation block: from the stern to this station, this high to the bridge deck. */
  houseTo: 0.15,
  bridgeDeck: 1.96,
  /** The middles of the three cargo bays (z), and of the two rows across (x). */
  bays: [-2.18, -0.32, 1.54] as const,
  rowX: 0.395,
};

export function freighterRig(look: number): ShipRig {
  void look;
  const rail = (t: number): number => 0.62 + (0.88 - 0.62) * smooth((t - 0.86) / 0.04);
  const spec: ShipHullSpec = {
    length: 9.4,
    beam: 1.8,
    draft: 0.32,
    widest: 0.74,
    widestY: 0.24,
    transom: 0.88,
    bowPoint: 0.62,
    stemRake: 0.3,
    transomRake: 0.04,
    round: 0.06,
    vee: 0.5,
    tumble: 0,
    rail,
    decks: [
      { t0: 0, t1: 0.87, y: FREIGHTER.deck },
      { t0: 0.87, t1: 1, y: FREIGHTER.forecastle },
    ],
    skin: 0.04,
    stations: [0, 0.03, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.74, 0.8, 0.84, 0.87, 0.9, 0.93, 0.96, 0.98, 1],
  };
  const hull = shipShape(spec);
  const slots: Vec3[] = [];
  const columns: number[][] = [];
  for (const z of FREIGHTER.bays) {
    for (const x of [FREIGHTER.rowX, -FREIGHTER.rowX]) {
      const col: number[] = [];
      for (let t = 0; t < 3; t++) {
        col.push(slots.length);
        slots.push([x, FREIGHTER.hatchTop + t * PORT.boxH, z]);
      }
      columns.push(col);
    }
  }
  const sternZ = hull.z(0, rail(0));
  const radar: Mast = { z: sternZ + 1.0, foot: FREIGHTER.bridgeDeck + 0.3, head: FREIGHTER.bridgeDeck + 0.95, r0: 0.03, r1: 0.015, rake: 0, top: null };
  const fore: Mast = { z: hull.z(0.93, FREIGHTER.forecastle), foot: FREIGHTER.forecastle, head: FREIGHTER.forecastle + 1.05, r0: 0.035, r1: 0.018, rake: 0, top: null };
  return {
    kind: 'freighter',
    spec,
    hull,
    stern: hull.z(0, 0) - 0.05,
    bow: hull.z(1, 0.4) + 0.05,
    halfBeam: spec.beam / 2,
    masts: [fore, radar],
    sails: [],
    pennant: null,
    ensign: { at: [0, rail(0) + 0.5, sternZ + 0.06], length: 0.42 },
    gangway: [hull.outer(0.17, rail(0.17)), rail(0.17), hull.z(0.17, 0.5)],
    lanterns: [],
    oars: null,
    crew: [[0.72, FREIGHTER.bridgeDeck + 0.02, sternZ + 0.9], [0.2, FREIGHTER.forecastle, hull.z(0.92, 0.84)]],
    cargo: { slots, columns },
    funnel: [0, 2.62, sternZ + 0.42],
  };
}
