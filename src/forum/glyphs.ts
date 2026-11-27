// The forum's own small drawings, in the style of src/ui/icons.ts (an ink outline, flat pastel fills, the
// shared pen wobble), kept here so they load with the forum and not with the game. Owner: Interface.

import { PALETTE } from '@/style/palette';

const DRAWINGS: Record<string, string> = {
  // A speech bubble with two lines of talk: comments.
  comment:
    `<path d="M7.4 11.6 Q7.6 8.4 11 8.4 L37.2 8.2 Q40.6 8.4 40.6 11.8 L40.4 29 Q40.2 32.2 37 32.2 L21.6 32.4 L13 40.2 L14 32.4 L10.8 32.4 Q7.6 32.2 7.6 29 Z" fill="${PALETTE.white}" stroke-width="2.4"/>` +
    `<path stroke-width="2" d="M14 17 Q23.6 16 34 17 M14 23.6 Q21 22.8 28 23.4"/>`,
  // Two pictures of a town, one laid over the other: copies.
  copy:
    `<path d="M16.6 7.8 L39.8 7.4 L40.2 30.4 L17 30.8 Z" fill="${PALETTE.white}" stroke-width="2.2"/>` +
    `<path d="M8 17.4 L31.2 17 L31.6 40.2 L8.4 40.6 Z" fill="${PALETTE.white}" stroke-width="2.4"/>` +
    `<path stroke-width="1.6" d="M10.6 38.2 Q15.4 30.6 20.4 33 Q25.6 28.8 29.6 38 Z" fill="${PALETTE.grass}"/>` +
    `<path stroke-width="1.6" d="M14.6 33.6 L14.6 28.4 L17.6 25.4 L20.6 28.4 L20.6 32.6 Z" fill="${PALETTE.pink}"/>`,
  // An arrow back to the list.
  back: `<path stroke-width="3" d="M20.4 12.6 L9.4 24.2 L20.6 35.4"/><path stroke-width="3" d="M10.4 24 Q24.6 23.4 39 24.4"/>`,
  // A paper plane: send.
  send:
    `<path d="M6.4 22.6 L41.6 8.6 L31.4 40.4 L22.6 28 Z" fill="${PALETTE.white}" stroke-width="2.4"/>` +
    `<path stroke-width="2" d="M22.6 28 L41.6 8.6"/>`,
  // A camera: take the picture again.
  camera:
    `<path d="M6.6 15.6 L16 15.4 L19 10.6 L29.4 10.4 L32.4 15.2 L41.4 15.2 L41.2 37.6 L6.8 37.8 Z" fill="${PALETTE.white}" stroke-width="2.4"/>` +
    `<circle cx="24" cy="26" r="7.2" fill="${PALETTE.glass}" stroke-width="2.2"/>`,
};

/** SVG markup for one of the forum's drawings (sized by the box it is put in, like icon()). */
export function glyph(id: keyof typeof DRAWINGS | string): string {
  return (
    `<svg class="lc-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="${PALETTE.ink}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g filter="url(#lc-wobble)">${DRAWINGS[id] ?? ''}</g></svg>`
  );
}
