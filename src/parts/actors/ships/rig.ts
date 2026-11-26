// The big ships' rigs (L38–L41): each ship's hull numbers, where its masts
// stand, where each sail's yard hangs, where its flags fly, where its oars
// work, where the gangplank meets the rail. Shared by the hull parts, the
// sail, flag and oar parts and the harbour system, so a yard meets its mast
// and an oar its thole by construction.
//
// Frame: afloat. +Z the bow, +Y up, y = 0 the waterline.
//
// Seeded variety comes in with `look`: the rake of the masts, a little in
// the size of the sails. Everything else about a ship is the same each visit.

import type { Vec3 } from '@/core/mat4';
import { rand } from '@/core/rand';
import { freighterRig } from './freighter-rig';
import { shipShape, smooth, type ShipHull, type ShipHullSpec } from './hull';

export const SHIP_KINDS = ['galleon', 'cog', 'galley', 'barge', 'freighter'] as const;
export type ShipKind = (typeof SHIP_KINDS)[number];

export interface Mast {
  /** Fore-and-aft place of its foot on deck, the deck it stands on, and its head. */
  z: number;
  foot: number;
  head: number;
  r0: number;
  r1: number;
  /** Lean aft (radians). */
  rake: number;
  /** Height of its top (the round platform), if it has one. */
  top: number | null;
}

export interface SailDef {
  /** square: hangs from a yard across the ship and fills forward; lateen: fore-and-aft on a slanting yard. */
  kind: 'square' | 'lateen';
  mast: number;
  /** The middle of the yard (square), or the point where the yard crosses the mast (lateen). */
  at: Vec3;
  /** Square: width at the head (the yard is a little longer) and at the foot, and the drop. */
  head: number;
  foot: number;
  drop: number;
  /** How far the full cloth bellies out, at its deepest. */
  belly: number;
  /** Lateen: the yard's two ends relative to `at` (fore, aft), and how low the clew comes. */
  yardFore?: Vec3;
  yardAft?: Vec3;
  /** Which sail is set first (0) leaving, and so furled last arriving. */
  order: number;
}

export interface Flag {
  at: Vec3;
  length: number;
}

export interface Oars {
  /** Oars a side, the first and last thole (z), the thole's distance out and height, the oar's length. */
  count: number;
  z0: number;
  z1: number;
  x: number;
  y: number;
  length: number;
}

export interface ShipRig {
  kind: ShipKind;
  spec: ShipHullSpec;
  hull: ShipHull;
  /** The hull's extent along its length at the water (stern, bow incl. any beak or ram), and half its beam. */
  stern: number;
  bow: number;
  halfBeam: number;
  masts: Mast[];
  sails: SailDef[];
  pennant: Flag | null;
  ensign: Flag | null;
  /** Where the gangplank comes over the rail (on the +X side: the side that lies against the quay), and the deck there. */
  gangway: Vec3;
  /** Stern lanterns. */
  lanterns: Vec3[];
  oars: Oars | null;
  /** Spots on deck where the crew stand and work. */
  crew: Vec3[];
  /** A cargo ship's containers (L38-F): where each can stand on deck, and the columns they stack in, bottom first. */
  cargo?: { slots: Vec3[]; columns: number[][] };
  /** A steamer's funnel top, where its smoke comes out. */
  funnel?: Vec3;
}

/** The rail: `waist` amidships, rising to `aft` over the stern and `fore` over the bow, with an extra `poop` right aft. */
function railOf(waist: number, aft: number, aftAt: number, fore: number, foreAt: number, poop = 0, poopAt = 0.12): (t: number) => number {
  return (t) => waist + (aft - waist) * smooth((aftAt - t) / 0.055) + poop * smooth((poopAt - t) / 0.05) + (fore - waist) * smooth((t - foreAt) / 0.05);
}

/** A mast standing on deck at station t. */
function mast(hull: ShipHull, t: number, head: number, r0: number, top: number | null, rake: number): Mast {
  const foot = hull.deck(t);
  return { z: hull.z(t, foot), foot, head, r0, r1: r0 * 0.5, rake, top };
}

/** A point on a raked mast at height y (the mast leans aft from its foot). */
export function onMast(m: Mast, y: number): Vec3 {
  return [0, y, m.z - Math.tan(m.rake) * (y - m.foot)];
}

function galleon(look: number): ShipRig {
  const r = (what: string): number => rand(look, 'galleon-rig', what);
  const spec: ShipHullSpec = {
    length: 5.5,
    beam: 1.5,
    draft: 0.36,
    widest: 0.46,
    widestY: 0.3,
    transom: 0.66,
    bowPoint: 0.72,
    stemRake: 0.34,
    transomRake: 0.1,
    round: 0.32,
    vee: 0.7,
    tumble: 0.17,
    rail: railOf(0.66, 1.3, 0.31, 0.98, 0.79, 0.17, 0.12),
    decks: [
      { t0: 0, t1: 0.1, y: 1.3 },
      { t0: 0.1, t1: 0.29, y: 1.13 },
      { t0: 0.29, t1: 0.78, y: 0.5 },
      { t0: 0.78, t1: 1, y: 0.8 },
    ],
    skin: 0.05,
    stations: [0, 0.04, 0.1, 0.16, 0.22, 0.255, 0.29, 0.33, 0.4, 0.48, 0.56, 0.64, 0.71, 0.74, 0.78, 0.83, 0.87, 0.91, 0.945, 0.975, 1],
  };
  const hull = shipShape(spec);
  const rake = 0.04 + 0.03 * r('rake');
  const masts = [
    mast(hull, 0.73, 3.9, 0.07, 2.42, rake * 0.6),
    mast(hull, 0.49, 4.55, 0.085, 2.78, rake),
    mast(hull, 0.19, 3.2, 0.055, 2.3, rake * 1.3),
  ];
  const [fore, main, miz] = masts as [Mast, Mast, Mast];
  const k = 1 + (r('sails') - 0.5) * 0.08;
  const sails: SailDef[] = [
    // Courses and topsails on the fore and main, a lateen on the mizzen.
    { kind: 'square', mast: 0, at: onMast(fore, 2.28), head: 1.55 * k, foot: 1.8 * k, drop: 1.22, belly: 0.3, order: 2 },
    { kind: 'square', mast: 0, at: onMast(fore, 3.48), head: 1.0 * k, foot: 1.38 * k, drop: 0.98, belly: 0.22, order: 0 },
    { kind: 'square', mast: 1, at: onMast(main, 2.64), head: 1.82 * k, foot: 2.1 * k, drop: 1.6, belly: 0.36, order: 3 },
    { kind: 'square', mast: 1, at: onMast(main, 4.05), head: 1.18 * k, foot: 1.62 * k, drop: 1.12, belly: 0.26, order: 1 },
    { kind: 'lateen', mast: 2, at: onMast(miz, 2.0), head: 0, foot: 0, drop: 0, belly: 0.2, yardFore: [0, -0.62, 0.95], yardAft: [0, 1.0, -1.55], order: 4 },
  ];
  const sternZ = hull.z(0, spec.rail(0));
  return {
    kind: 'galleon',
    spec,
    hull,
    stern: hull.z(0, 0) - 0.05,
    bow: hull.z(1, 0.5) + 0.8,
    halfBeam: spec.beam / 2,
    masts,
    sails,
    pennant: { at: onMast(main, main.head - 0.02), length: 1.7 },
    ensign: { at: [0, spec.rail(0) + 0.62, sternZ - 0.14], length: 0.62 },
    gangway: [hull.outer(0.55, spec.rail(0.55)), spec.rail(0.55), hull.z(0.55, 0.5)],
    lanterns: [[0, spec.rail(0) + 0.2, sternZ + 0.02], [-0.42, spec.rail(0) + 0.14, sternZ + 0.04], [0.42, spec.rail(0) + 0.14, sternZ + 0.04]],
    oars: null,
    crew: [[0.3, 0.5, hull.z(0.6, 0.5)], [-0.25, 0.5, hull.z(0.42, 0.5)], [0.1, 1.13, hull.z(0.22, 1.13)], [-0.2, 0.8, hull.z(0.85, 0.8)]],
  };
}

function cog(look: number): ShipRig {
  const r = (what: string): number => rand(look, 'cog-rig', what);
  const spec: ShipHullSpec = {
    length: 3.9,
    beam: 1.5,
    draft: 0.32,
    widest: 0.5,
    widestY: 0.24,
    transom: 0.34,
    bowPoint: 0.95,
    stemRake: 0.62,
    transomRake: 0.36,
    round: 0.28,
    vee: 0.6,
    tumble: 0.06,
    rail: railOf(0.68, 0.98, 0.2, 0.96, 0.83, 0.05, 0.06),
    decks: [
      { t0: 0, t1: 0.21, y: 0.98 },
      { t0: 0.21, t1: 0.82, y: 0.52 },
      { t0: 0.82, t1: 1, y: 0.9 },
    ],
    skin: 0.05,
    stations: [0, 0.05, 0.11, 0.17, 0.21, 0.25, 0.32, 0.4, 0.5, 0.6, 0.68, 0.75, 0.82, 0.86, 0.9, 0.94, 0.97, 1],
  };
  const hull = shipShape(spec);
  const main = mast(hull, 0.53, 3.75, 0.085, 3.05, 0.02 + 0.03 * r('rake'));
  const k = 1 + (r('sails') - 0.5) * 0.08;
  return {
    kind: 'cog',
    spec,
    hull,
    stern: hull.z(0, 0) - 0.12,
    bow: hull.z(1, 0.3) + 0.1,
    halfBeam: spec.beam / 2,
    masts: [main],
    sails: [{ kind: 'square', mast: 0, at: onMast(main, 2.86), head: 2.2 * k, foot: 2.35 * k, drop: 1.95, belly: 0.4, order: 0 }],
    pennant: { at: onMast(main, main.head - 0.02), length: 1.3 },
    ensign: { at: [0, spec.rail(0) + 0.72, hull.z(0, spec.rail(0)) + 0.08], length: 0.5 },
    gangway: [hull.outer(0.5, spec.rail(0.5)), spec.rail(0.5), hull.z(0.42, 0.52)],
    lanterns: [[0, spec.rail(0) + 0.3, hull.z(0, spec.rail(0)) + 0.12]],
    oars: null,
    crew: [[0.3, 0.52, hull.z(0.62, 0.52)], [-0.3, 0.52, hull.z(0.36, 0.52)], [0, 0.98, hull.z(0.1, 0.98)]],
  };
}

function galley(look: number): ShipRig {
  const r = (what: string): number => rand(look, 'galley-rig', what);
  const spec: ShipHullSpec = {
    length: 5.8,
    beam: 0.95,
    draft: 0.2,
    widest: 0.48,
    widestY: 0.2,
    transom: 0.32,
    bowPoint: 1.25,
    stemRake: 0.3,
    transomRake: 0.6,
    round: 0.4,
    vee: 0.85,
    tumble: 0.05,
    rail: railOf(0.36, 0.62, 0.1, 0.52, 0.9),
    decks: [
      { t0: 0, t1: 0.12, y: 0.5 },
      { t0: 0.12, t1: 0.9, y: 0.26 },
      { t0: 0.9, t1: 1, y: 0.4 },
    ],
    skin: 0.04,
    stations: [0, 0.04, 0.08, 0.12, 0.16, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86, 0.9, 0.94, 0.97, 1],
  };
  const hull = shipShape(spec);
  const main = mast(hull, 0.6, 3.0, 0.065, null, 0.01 + 0.02 * r('rake'));
  return {
    kind: 'galley',
    spec,
    hull,
    stern: hull.z(0, 0) - 0.2,
    bow: hull.z(1, 0) + 0.62,
    halfBeam: spec.beam / 2 + 0.16,
    masts: [main],
    sails: [{ kind: 'square', mast: 0, at: onMast(main, 2.82), head: 2.1, foot: 2.2, drop: 1.7, belly: 0.34, order: 0 }],
    pennant: { at: onMast(main, main.head - 0.02), length: 1.1 },
    ensign: null,
    gangway: [hull.outer(0.5, spec.rail(0.5)) + 0.14, spec.rail(0.5), hull.z(0.5, 0.26)],
    lanterns: [],
    oars: { count: 10, z0: hull.z(0.22, 0.4), z1: hull.z(0.84, 0.4), x: spec.beam / 2 + 0.12, y: 0.42, length: 1.55 },
    crew: [[0.2, 0.5, hull.z(0.05, 0.5)], [-0.2, 0.26, hull.z(0.5, 0.26)], [0.0, 0.4, hull.z(0.95, 0.4)]],
  };
}

function barge(look: number): ShipRig {
  void look;
  const spec: ShipHullSpec = {
    length: 3.0,
    beam: 1.05,
    draft: 0.14,
    widest: 0.5,
    widestY: 0.14,
    transom: 0.82,
    bowPoint: 0.35,
    stemRake: 0.9,
    transomRake: 0.7,
    round: 0.22,
    vee: 0.3,
    tumble: 0.02,
    rail: railOf(0.27, 0.32, 0.08, 0.34, 0.92),
    decks: [{ t0: 0, t1: 1, y: 0.2 }],
    skin: 0.04,
    stations: [0, 0.04, 0.1, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 0.96, 1],
  };
  const hull = shipShape(spec);
  const main = mast(hull, 0.74, 1.55, 0.04, null, 0);
  return {
    kind: 'barge',
    spec,
    hull,
    stern: hull.z(0, 0) - 0.12,
    bow: hull.z(1, 0) + 0.1,
    halfBeam: spec.beam / 2,
    masts: [main],
    sails: [{ kind: 'square', mast: 0, at: onMast(main, 1.45), head: 0.8, foot: 0.95, drop: 0.95, belly: 0.16, order: 0 }],
    // No pennant: the mast comes down under bridges.
    pennant: null,
    ensign: null,
    gangway: [hull.outer(0.5, spec.rail(0.5)), spec.rail(0.5), 0],
    lanterns: [[0.3, spec.rail(0.95) + 0.25, hull.z(0.95, 0.3)]],
    oars: null,
    crew: [[0, 0.2, hull.z(0.12, 0.2)]],
  };
}

const RIGS = new Map<string, ShipRig>();

/** The rig of a ship of this kind and look (cached: rigs are pure). */
export function rigOf(kind: ShipKind, look = 0): ShipRig {
  const k = `${kind}:${look}`;
  let rig = RIGS.get(k);
  if (!rig) {
    rig = kind === 'galleon' ? galleon(look) : kind === 'cog' ? cog(look) : kind === 'galley' ? galley(look) : kind === 'freighter' ? freighterRig(look) : barge(look);
    RIGS.set(k, rig);
  }
  return rig;
}

/** A ship kind's index (the sail and flag parts carry it as a number). */
export const shipIndex = (kind: ShipKind): number => SHIP_KINDS.indexOf(kind);
export const shipOfIndex = (i: number): ShipKind => SHIP_KINDS[Math.max(0, Math.min(SHIP_KINDS.length - 1, Math.round(i)))]!;
