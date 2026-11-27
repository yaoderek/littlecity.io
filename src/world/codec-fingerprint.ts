// The town code's fingerprint, for Global Village (the town forum). Owner: Forum.
//
// The forum's server reads posted towns with the decoder it was built with, while the game is
// released separately and often. A short hash of what the decoder accepts (the piece, floor and edge
// kinds in the order the format numbers them, the newest codec version and the section bits it
// knows) tells the two apart: the server reports it at /health, and tools/deploy-pages.sh refuses to
// publish a game whose fingerprint differs from the server's (put the server up first). A release
// that leaves the town code alone has the same fingerprint.
//
// The version and the section bits are read from the codec itself, by asking it (an empty town
// written with each section flag, read back), so a new section or version can't be forgotten here.

import { EDGE_KINDS, FLOOR_KINDS } from '@/core/kinds';
import { PLACED } from './codec5';
import { fromBase64Url, toBase64Url } from './deflate';
import { decodeTown, encodeRanged } from './save';
import { emptyWorld } from './world';

/** What the fingerprint is made of. */
export interface CodecFacts {
  /** The version byte the newest encoder writes. */
  version: number;
  /** The section flags the decoder knows, as one number. */
  sections: number;
  placed: readonly string[];
  floors: readonly string[];
  edges: readonly string[];
}

/** Section bits probed: far more than the format will ever use. */
const PROBED_BITS = 16;

/** The facts of the codec this build carries. */
export function codecFacts(): CodecFacts {
  const empty = emptyWorld(1);
  const version = fromBase64Url(encodeRanged(empty).slice(0, 4))![2]!;
  // A code of a version no decoder knows: the reason it gets is the "different version" line.
  const future = decodeTown(toBase64Url(new Uint8Array([0x4c, 0x43, 0xff, 0, 0, 0, 0, 0, 0, 0, 0])));
  const otherVersion = future.ok ? '' : future.reason;
  let sections = 0;
  for (let bit = 0; bit < PROBED_BITS; bit++) {
    let known: boolean;
    try {
      const r = decodeTown(encodeRanged(empty, 1 << bit));
      known = r.ok || r.reason !== otherVersion;
    } catch {
      // Only a section the encoder knows makes it try to write something behind the flag.
      known = true;
    }
    if (known) sections |= 1 << bit;
  }
  return { version, sections, placed: PLACED, floors: FLOOR_KINDS, edges: EDGE_KINDS };
}

/** Twelve hex digits from the facts (two 32-bit FNV-1a hashes of their text, the second seeded differently). */
export function fingerprintOf(f: CodecFacts): string {
  const text = `v${f.version};s${f.sections};k${f.placed.join(',')};f${f.floors.join(',')};e${f.edges.join(',')}`;
  const fnv = (seed: number): number => {
    let h = seed;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return h >>> 0;
  };
  return (fnv(0x811c9dc5).toString(16).padStart(8, '0') + fnv(0x01000193).toString(16).padStart(8, '0')).slice(0, 12);
}

let memo: string | undefined;
/** The fingerprint of the town code this build reads and writes. */
export function codecFingerprint(): string {
  return (memo ??= fingerprintOf(codecFacts()));
}
