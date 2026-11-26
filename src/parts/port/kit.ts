// The port's drawing kit (R-D00 and after): steel members, the cranes'
// liveries, the containers' colours, lights. Pure: MeshBuilder in, triangles
// out. Everything is drawn in palette colours with the page's pen: one ink
// group per object, white trim as its own group so it gets its own line.

import type { Vec3 } from '@/core/mat4';
import { PATTERN, type ColorInput, type MeshBuilder } from '@/gen/mesh';
import { PALETTE, RAMPS } from '@/style/palette';
import { ball } from '../actors/kit';
import { stick } from '../actors/boats/hull';

/** A steel member of box section from a to c, `w` wide and `h` deep. */
export function member(b: MeshBuilder, a: Vec3, c: Vec3, w: number, h = w): void {
  stick(b, a, c, w, h);
}

/** A box from its bottom middle, size [w, h, d]: the plain block most steelwork is made of. */
export function block(b: MeshBuilder, at: Vec3, size: Vec3, skip: ('top' | 'bottom' | 'n' | 'e' | 's' | 'w')[] = []): void {
  b.boxAt(at, size, skip.length ? { skip } : undefined);
}

/** A small self-lit lamp: a ball of glow with a dark cap. Glows at dusk and night by itself. */
export function lamp(b: MeshBuilder, at: Vec3, r: number, color: ColorInput, ink: string): void {
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: `${ink}-cap` }, () => b.boxAt([at[0], at[1] + r * 0.6, at[2]], [r * 2.3, r * 0.7, r * 2.3]));
  b.with({ color, pattern: PATTERN.glow, ink }, () => ball(b, at[0], at[1], at[2], r, r, r, 7, 4));
}

/** A floodlight: a flat lamp box tipped down toward +Z, its glass glowing. */
export function floodlight(b: MeshBuilder, at: Vec3, w: number, ink: string): void {
  b.with({ color: PALETTE.metal, pattern: PATTERN.none, ink: `${ink}-box` }, () => b.boxAt([at[0], at[1], at[2] - 0.03], [w, w * 0.55, 0.06]));
  b.with({ color: PALETTE.yellow, pattern: PATTERN.glow, ink }, () => b.boxAt([at[0], at[1] + w * 0.06, at[2] + 0.01], [w * 0.82, w * 0.4, 0.025]));
}

export interface CranePaint {
  /** The steel: legs, girders, the jib. */
  steel: ColorInput;
  /** The trim: rails round the walkways, the bands, the machinery house of a large crane. */
  trim: ColorInput;
  /** The machinery house of a medium crane, and the cabs. */
  house: ColorInput;
  roof: ColorInput;
}

/** A medium crane is red or orange with white; a large one blue or teal with white. */
export function cranePaint(kind: 'medium' | 'large', look: number): CranePaint {
  const l = Math.abs(Math.round(look));
  if (kind === 'medium') {
    const steel = l % 2 === 0 ? PALETTE.red : RAMPS.roof[2]!;
    return { steel, trim: PALETTE.white, house: steel, roof: PALETTE.white };
  }
  const steel = l % 2 === 0 ? RAMPS.roof[1]! : RAMPS.roof[3]!;
  return { steel, trim: PALETTE.white, house: PALETTE.white, roof: steel };
}

/** The containers' colours: red, blue, green, ochre, white, teal. */
export function containerColors(): readonly ColorInput[] {
  return [PALETTE.red, RAMPS.roof[1]!, PALETTE.leafDark, RAMPS.roof[2]!, PALETTE.white, RAMPS.roof[3]!];
}

/** A container colour by look (0–5 and on, wrapping). */
export function containerColor(look: number): ColorInput {
  const all = containerColors();
  return all[((Math.round(look) % all.length) + all.length) % all.length]!;
}
