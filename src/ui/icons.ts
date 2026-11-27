// Every picture in the interface, drawn here as inline SVG in the game's
// own style: an ink outline, flat pastel fills from the palette, and lines
// that are never quite straight. Owner: Interface.
//
// One icon per tray piece (the id is the piece's kind), one per tool, and
// the handful the top bar and the menu need. icon(id) returns SVG markup; an
// id with no drawing gets a plain box, so a new kind still shows up in the
// tray before anyone has drawn it.

import { houseStyle, styleAccent, styleRoof } from '@/style/houses';
import { PALETTE, RAMPS } from '@/style/palette';

const C = {
  ink: PALETTE.ink,
  wall: RAMPS.wall[0]!,
  roof: RAMPS.roof[0]!,
  roofBlue: RAMPS.roof[1]!,
  orange: RAMPS.roof[2]!,
  stone: PALETTE.stone,
  stoneShade: PALETTE.stoneShade,
  stoneLine: '#b9ae9e',
  wood: PALETTE.wood,
  woodDark: RAMPS.wood[3]!,
  leaf: PALETTE.leaf,
  leafDark: PALETTE.leafDark,
  trunk: PALETTE.trunk,
  red: PALETTE.red,
  redDark: PALETTE.redDark,
  brick: PALETTE.brick,
  white: PALETTE.white,
  glass: PALETTE.glass,
  magic: PALETTE.magic,
  magicLight: '#ddd0ff',
  magicDark: '#b3a0f0',
  magicInk: '#7a62c9',
  yellow: PALETTE.yellow,
  moon: '#fff1bd',
  sea: PALETTE.sea,
  shallow: PALETTE.shallow,
  seaInk: '#5f8fc4',
  path: PALETTE.path,
  plaza: PALETTE.plaza,
  garden: PALETTE.garden,
  grass: PALETTE.grass,
  dirt: PALETTE.dirt,
  dirtDark: PALETTE.dirtDark,
  pink: PALETTE.pink,
  sand: PALETTE.sand,
  metal: '#d9d4cc',
};

/** A four-pointed sparkle centred on (cx, cy). */
function sparkle(cx: number, cy: number, r: number, attrs = `fill="${C.yellow}"`): string {
  const k = r * 0.14;
  const f = (n: number): string => n.toFixed(1);
  return (
    `<path ${attrs} d="M${f(cx)} ${f(cy - r)} Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} ` +
    `Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)} Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} ` +
    `Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)} Z"/>`
  );
}

/** A sun: a disc with short rays, a little uneven. */
function sun(cx: number, cy: number, r: number, fill: string = C.yellow, rays = 8): string {
  let d = '';
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.2;
    const r0 = r + 2.6, r1 = r + (i % 2 === 0 ? 6.4 : 5.4);
    d += `M${(cx + Math.cos(a) * r0).toFixed(1)} ${(cy + Math.sin(a) * r0).toFixed(1)} L${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)} `;
  }
  return `<path d="${d}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

const CUBE_TOP = 'M24 7.6 L40.4 15.8 L24.2 24.2 L7.8 16 Z';
const CUBE_LEFT = 'M7.8 16 L24.2 24.2 L24 42 L8 33.6 Z';
const CUBE_RIGHT = 'M24.2 24.2 L40.4 15.8 L40.2 33.8 L24 42 Z';

/** A small square of ground seen from the game's angle, for the three floors. */
function tile(top: string, detail: string): string {
  return (
    `<path d="M4.2 24 L24 35.8 L24 40.6 L4.3 28.6 Z" fill="${C.dirt}"/>` +
    `<path d="M24 35.8 L43.8 24 L43.8 28.5 L24 40.6 Z" fill="${C.dirtDark}"/>` +
    `<path d="M24.1 12 L43.8 24 L24 35.8 L4.2 24 Z" fill="${top}"/>` +
    detail
  );
}

const thin = 'stroke-width="1.2"';
const picket = (x: number): string =>
  `<path d="M${x} 40.6 L${x + 0.1} 17.8 L${x + 2.9} 13.4 L${x + 5.7} 17.7 L${x + 5.8} 40.5 Z" fill="${C.white}"/>`;

const DRAWINGS: Record<string, string> = {
  // ── pieces ───────────────────────────────────────────────────────────
  auto:
    `<g stroke="${C.magicInk}" stroke-dasharray="3.6 3.2">` +
    `<path d="${CUBE_LEFT}" fill="${C.magic}"/><path d="${CUBE_RIGHT}" fill="${C.magicDark}"/><path d="${CUBE_TOP}" fill="${C.magicLight}"/></g>` +
    sparkle(24, 25, 9.5) +
    sparkle(38.4, 8.6, 4.2, `fill="${C.white}" stroke-width="1.6"`),

  house:
    `<path d="M30.5 9.4 L30.8 19 L35.6 19.2 L35.4 9.2 Z" fill="${C.redDark}"/>` +
    `<path d="M10.4 23.6 L10.8 40.7 L37.5 40.3 L37.8 23.4 Z" fill="${C.wall}"/>` +
    `<path d="M6.3 24.6 L23.7 8.6 L41.8 24.2 Z" fill="${C.roof}"/>` +
    `<path d="M15.6 40.6 L15.8 31 Q19 28.6 22.1 30.9 L22.3 40.5" fill="${C.roofBlue}"/>` +
    `<rect x="27.4" y="28.8" width="6.2" height="6" rx="0.7" fill="${C.white}"/>` +
    `<path ${thin} d="M30.5 29 L30.5 34.6 M27.6 31.8 L33.4 31.8"/>` +
    `<circle cx="23.9" cy="18.2" r="2.4" fill="${C.white}"/>`,

  tower:
    `<path d="M24.1 6 L24.1 2.2"/><path d="M24.1 2.1 L29 3.5 L24.1 5" fill="${C.red}" stroke-width="1.5"/>` +
    `<path d="M16.4 41 L17.2 19 L30.8 19.2 L31.7 40.8 Z" fill="${C.stone}"/>` +
    `<path d="M13 20.4 L24.1 6 L35.1 20.1 Z" fill="${C.roofBlue}"/>` +
    `<path d="M22.2 30.2 L22.3 26.4 Q24 24.4 25.7 26.4 L25.8 30.2 Z" fill="${C.glass}"/>` +
    `<path d="M21.5 40.8 L21.6 36.6 Q24 34.2 26.5 36.5 L26.6 40.8" fill="${C.wood}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M18.4 24 L21.6 24.1 M27.4 33 L30.4 33.1 M18 35.6 L20.2 35.6 M27 23.6 L29.6 23.6"/>`,

  lighthouse:
    `<path ${thin} d="M31.4 12.6 L38.6 10.2 M31.6 15 L38.8 17 M16.8 12.6 L9.6 10.2 M16.6 15 L9.4 17"/>` +
    `<path d="M16.8 41.2 L20.2 17.4 L27.9 17.3 L31.4 41 Z" fill="${C.white}"/>` +
    `<path stroke-width="1.4" d="M19.5 22 L28.6 22 L29.4 27.5 L18.8 27.5 Z" fill="${C.red}"/>` +
    `<path stroke-width="1.4" d="M18 33 L30.2 33 L31 38.5 L17.2 38.5 Z" fill="${C.red}"/>` +
    `<path d="M20.7 17.2 L20.9 11.2 L27.3 11.2 L27.4 17.2 Z" fill="${C.yellow}"/>` +
    `<path stroke-width="2.6" d="M18 17.5 L30.2 17.3"/>` +
    `<path d="M19 11.5 L24.1 5.4 L29.2 11.3 Z" fill="${C.red}"/>`,

  arch:
    `<path d="M7.6 40.8 L7.9 15.6 L40.3 15.2 L40.5 40.6 L31.6 40.7 L31.5 31 A7.6 7.6 0 0 0 16.4 31.2 L16.5 40.8 Z" fill="${C.stone}"/>` +
    `<path d="M5.8 15.8 L6 11.2 L42.2 10.8 L42.3 15.4 Z" fill="${C.stoneShade}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M24 23.2 L24 19.6 M18.4 25.4 L16.2 22.8 M29.6 25.4 L31.8 22.8 M9.4 21.6 L13 21.6 M35.4 21.4 L39 21.4 M9.2 30 L12.4 30 M35.8 29.8 L39.2 29.8 M10 36 L12.8 36"/>`,

  dock:
    `<path stroke-width="2.6" d="M12.4 27 L12.6 39.4 M36.2 27 L36.4 38.6 M19.4 21 L19.5 24"/>` +
    `<path d="M10.6 27.4 L42.6 23.4 L42.7 26.6 L10.8 30.8 Z" fill="${C.woodDark}"/>` +
    `<path d="M5.6 20.6 L37 17.6 L42.6 23.4 L10.6 27.4 Z" fill="${C.wood}"/>` +
    `<path ${thin} d="M13.4 19.9 L18.6 26.4 M21.2 19.1 L26.6 25.4 M29 18.4 L34.6 24.4"/>` +
    `<path stroke="${C.seaInk}" d="M3.6 39.4 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 M10 44.2 q3 -2.6 6 0 t6 0 t6 0 t6 0"/>`,

  marble:
    `<path d="${CUBE_LEFT}" fill="${C.stone}"/><path d="${CUBE_RIGHT}" fill="${C.stoneShade}"/><path d="${CUBE_TOP}" fill="${PALETTE.marble}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M11.6 22.4 Q15.4 26 13.6 31.4 M17 28 Q19 30 18.4 33.6 M29.6 27 Q33 28.4 35.2 23.6 M17.6 13.6 Q22 16 27.6 13.4"/>`,

  pillar:
    `<path d="M13.4 42 L13.6 37.8 L34.4 37.6 L34.6 41.8 Z" fill="${C.stoneShade}"/>` +
    `<path d="M17.6 37.8 L18.5 14 L29.6 13.9 L30.5 37.7 Z" fill="${C.stone}"/>` +
    `<path d="M13.8 14.2 L14 9.4 L34 9.2 L34.2 14 Z" fill="${C.stoneShade}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M21.7 17.4 L21.3 34.6 M24.1 17.4 L24 34.6 M26.5 17.4 L26.9 34.6"/>`,

  stairs:
    `<path d="M7.6 42 L7.8 33.8 L17.6 33.6 L17.8 25.6 L27.6 25.4 L27.8 17.4 L39.8 17.2 L40 41.8 Z" fill="${C.stone}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M17.8 34.4 L17.8 41.4 M27.8 26.2 L27.8 41.4 M9 37.8 L16.4 37.7 M19.2 29.6 L26.4 29.5 M29.4 21.4 L38.6 21.3"/>`,

  windmill:
    `<path d="M17.2 42 L20.6 21.6 L27.6 21.5 L31 41.8 Z" fill="${C.brick}"/>` +
    `<path d="M19.4 21.9 Q24 13.2 28.8 21.7 Z" fill="${C.redDark}"/>` +
    `<path d="M22.2 41.8 L22.3 36.6 Q24.1 34.6 25.9 36.6 L26 41.8" fill="${C.wood}"/>` +
    `<g stroke-width="1.6" fill="${C.white}">` +
    `<path d="M26.2 17.3 L36.1 7.4 L39.4 10.6 L29.5 20.5 Z"/><path d="M26.2 21.5 L36.1 31.4 L32.9 34.7 L23 24.8 Z"/>` +
    `<path d="M22 21.5 L12.1 31.4 L8.8 28.2 L18.7 18.3 Z"/><path d="M22 17.3 L12.1 7.4 L15.3 4.1 L25.2 14 Z"/></g>` +
    `<circle cx="24.1" cy="19.4" r="2.3" fill="${C.yellow}"/>`,

  tree:
    `<path d="M21.8 42 L22.2 29 L26 29 L26.4 42 Z" fill="${C.trunk}"/>` +
    `<path d="M12 22 Q9.6 13 18 10 Q24 3.6 31 8.6 Q39.4 11.6 37 21 Q39.4 29 30.4 31.2 Q24 35.4 17 31.2 Q9.6 29 12 22 Z" fill="${C.leaf}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M17 25.6 Q21.6 29.6 27.6 27.6 M27 13.4 Q31.4 15 31.8 19.4"/>`,

  fountain:
    `<path stroke="${C.seaInk}" d="M24 22 L24.1 9.2 M24 11 Q17.4 9.2 15.6 17.6 M24.1 11 Q30.8 9.2 32.5 17.6"/>` +
    `<path d="M7.6 31.4 Q8.4 41.8 24 41.8 Q39.6 41.8 40.4 31.2 Z" fill="${C.stone}"/>` +
    `<ellipse cx="24" cy="31.3" rx="16.4" ry="4.4" fill="${C.shallow}"/>` +
    `<path d="M21.6 31.6 L21.9 23 L26.2 23 L26.5 31.6" fill="${C.stone}"/>` +
    `<ellipse cx="24" cy="22.4" rx="6.6" ry="2.3" fill="${C.shallow}"/>`,

  stall:
    `<path d="M11 19 L11.2 31 M37 19 L36.8 31"/>` +
    `<path d="M8.6 30.4 L8.8 41 L39.2 40.8 L39.4 30.2 Z" fill="${C.wood}"/>` +
    `<g stroke-width="1.4"><circle cx="15.6" cy="28" r="2.5" fill="${C.yellow}"/><circle cx="21.4" cy="28.1" r="2.5" fill="${C.red}"/>` +
    `<circle cx="27.4" cy="28" r="2.5" fill="${C.pink}"/><circle cx="33" cy="28" r="2.5" fill="${C.leaf}"/></g>` +
    `<path d="M5.4 20 L9.6 8.8 L38.6 8.6 L42.6 19.8 Q39.6 23.4 36.4 19.9 Q33.3 23.4 30.2 19.9 Q27.1 23.4 24 20 Q20.9 23.4 17.8 20 Q14.7 23.4 11.6 20 Q8.5 23.4 5.4 20 Z" fill="${C.white}"/>` +
    `<g stroke-width="1.3" fill="${C.red}"><path d="M9.6 8.8 L14.4 8.8 L11.6 20 Q8.5 23.4 5.4 20 Z"/>` +
    `<path d="M19.3 8.7 L24.1 8.7 L24 20 Q20.9 23.4 17.8 20 Z"/><path d="M28.9 8.7 L33.8 8.6 L36.4 19.9 Q33.3 23.4 30.2 19.9 Z"/></g>`,

  fence:
    `<path d="M4.6 23 L43.4 22.6 L43.5 26 L4.7 26.4 Z" fill="${C.white}"/><path d="M4.6 32.4 L43.4 32 L43.5 35.4 L4.7 35.8 Z" fill="${C.white}"/>` +
    picket(7.4) + picket(16.6) + picket(25.8) + picket(35) +
    `<path ${thin} stroke="${C.leafDark}" d="M3.6 43.4 L5 41 M13.8 43.6 L14.6 41.4 M23.4 43.6 L24 41.6 M32.6 43.6 L33.6 41.4 M43 43.4 L44 41.2"/>`,

  wall:
    `<path d="M6.4 40.6 L6.6 24.6 L41.4 24.2 L41.6 40.4 Z" fill="${C.stone}"/>` +
    `<path d="M4.4 24.8 L4.6 19.6 L43.4 19.2 L43.6 24.4 Z" fill="${C.stoneShade}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M7 30 L41.2 29.8 M7 35.2 L41.2 35 M15 25 L15 29.8 M27 25 L27 29.8 M36 24.8 L36 29.8 M10.4 30.2 L10.4 35 M21 30 L21 35 M32 30 L32 35 M16 35.4 L16 40.2 M27.6 35.2 L27.6 40.2 M37 35.2 L37 40.2"/>`,

  path: tile(
    C.grass,
    `<path stroke-width="1.4" d="M10.6 28 Q19.6 26.4 23.6 22 Q27.4 17.8 30.8 16 L37.6 19.9 Q31.4 22.6 27.8 26.6 Q23.6 30.6 17.4 32 Z" fill="${C.path}"/>` +
      `<path ${thin} stroke="${C.leafDark}" d="M12 22.4 L12.6 20.6 M17.6 19 L18.2 17.2 M31 29.4 L31.6 27.6 M36 26 L36.6 24.4"/>`,
  ),

  plaza: tile(
    C.plaza,
    `<path ${thin} stroke="${C.stoneLine}" d="M10.8 27.9 L30.6 16 M17.4 31.9 L37.2 20 M10.8 20 L30.6 31.9 M17.4 16 L37.2 27.9"/>`,
  ),

  garden: tile(
    C.garden,
    `<path ${thin} stroke="${C.leafDark}" d="M12.4 24.8 L13 23 M26.6 16.8 L27.2 15.2 M27.6 31.4 L28.2 29.8 M36.6 24.6 L37.2 23"/>` +
      `<g stroke-width="1.2"><circle cx="17" cy="22.6" r="2.1" fill="${C.pink}"/><circle cx="22.6" cy="18.8" r="2.1" fill="${C.yellow}"/>` +
      `<circle cx="24" cy="26.6" r="2.1" fill="${C.red}"/><circle cx="30.4" cy="22.2" r="2.1" fill="${C.white}"/>` +
      `<circle cx="31.6" cy="27.6" r="2.1" fill="${C.pink}"/><circle cx="18.6" cy="28.6" r="2.1" fill="${C.yellow}"/></g>`,
  ),

  // Field: a hard court in chalk, a hoop at one end and the ball on it.
  field: tile(
    '#93c3c3',
    `<path ${thin} stroke="${C.white}" fill="none" d="M24.1 14.5 L39.7 24 L24 33.3 L8.3 24 Z M14.3 18.1 L33.8 29.8"/>` +
      `<ellipse ${thin} stroke="${C.white}" fill="#efb27f" cx="24" cy="24" rx="4.2" ry="2.5"/>` +
      `<g stroke-width="1.3"><path d="M11 25.2 L11.2 9.6" stroke-width="1.8"/><path d="M8.6 7.4 L14.4 6.4 L14.4 12.2 L8.6 13.2 Z" fill="${C.white}"/>` +
      `<ellipse cx="14.6" cy="13.6" rx="2.6" ry="1.1" fill="none" stroke="#e8743f" stroke-width="1.4"/>` +
      `<circle cx="31" cy="21.2" r="2.6" fill="#e8743f"/><path ${thin} d="M28.6 20.6 Q31 22.2 33.4 20.6 M31 18.6 L31 23.8"/></g>`,
  ),

  // ── shaping the land (the Land group of the Nature drawer) ───────────
  // Raise: a grassy terrace lifted out of the ground, an arrow going up.
  raise:
    `<path d="M4.2 31.6 L24 43.2 L24 46.4 L4.3 35.2 Z" fill="${C.dirt}"/>` +
    `<path d="M24 43.2 L43.8 31.6 L43.8 35 L24 46.4 Z" fill="${C.dirtDark}"/>` +
    `<path d="M24.1 19.8 L43.8 31.6 L24 43.2 L4.2 31.6 Z" fill="${C.grass}"/>` +
    `<path d="M11.8 22.2 L24 29.4 L24.1 38 L12 30.8 Z" fill="${C.dirt}"/>` +
    `<path d="M24 29.4 L36.4 22.1 L36.2 30.6 L24.1 38 Z" fill="${C.dirtDark}"/>` +
    `<path d="M24.2 14.6 Q30.8 18 36.4 22.1 Q30 26 24 29.4 Q17.6 26 11.8 22.2 Q17.8 18 24.2 14.6 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M8.6 33.4 L9.2 31.8 M37.8 33 L38.4 31.4 M19.2 21.2 L19.8 19.6 M27.4 23.4 L28 21.8"/>` +
    `<g stroke-width="2.6"><path d="M39.8 17.4 L40 4.6"/><path d="M35.6 8.8 L40 4 L44.2 8.6"/></g>`,

  // Dig: a hole in the ground with water in the bottom, and a spade.
  dig:
    `<path d="M4.2 28 L24 39.6 L24 43.2 L4.3 31.8 Z" fill="${C.dirt}"/>` +
    `<path d="M24 39.6 L43.8 28 L43.8 31.6 L24 43.2 Z" fill="${C.dirtDark}"/>` +
    `<path d="M24.1 16.2 L43.8 28 L24 39.6 L4.2 28 Z" fill="${C.grass}"/>` +
    `<path d="M12.4 27.8 Q18 24.4 24.2 21.6 Q30.4 24.6 35.8 27.6 L35.6 31 Q30 28.4 24.1 25.6 Q18.2 28.6 12.6 31.4 Z" fill="${C.dirtDark}"/>` +
    `<path d="M12.6 31.4 Q18.2 28.6 24.1 25.6 Q30 28.4 35.6 31 Q30 34.4 24 36.6 Q18 34.4 12.6 31.4 Z" fill="${C.sea}"/>` +
    `<path ${thin} stroke="${C.seaInk}" d="M18.4 31.6 q1.6 -1.3 3.2 0 t3.2 0 M24.6 33.6 q1.5 -1.2 3 0 t3 0"/>` +
    `<path d="M33.8 3.6 L36.4 4.8 L31 16.4 L28.4 15.2 Z" fill="${C.wood}" stroke-width="1.6"/>` +
    `<path d="M26.2 13.6 L33.2 16.8 L31.4 22.4 Q27.6 24.8 24.6 21.6 Z" fill="${C.metal}"/>`,

  // Level: flat ground with a spirit level lying on it, its bubble in the middle.
  level:
    `<path d="M4.2 30.4 L24 42 L24 45.4 L4.3 34 Z" fill="${C.dirt}"/>` +
    `<path d="M24 42 L43.8 30.4 L43.8 33.8 L24 45.4 Z" fill="${C.dirtDark}"/>` +
    `<path d="M24.1 18.6 L43.8 30.4 L24 42 L4.2 30.4 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M11.4 31.6 L12 30 M35.4 32.8 L36 31.2 M27.6 37.4 L28.2 35.8"/>` +
    `<path d="M6.4 14.4 L41.8 14 L41.9 22.2 L6.5 22.6 Z" fill="${C.yellow}"/>` +
    `<path ${thin} d="M10.4 14.4 L10.5 22.5 M37.8 14.1 L37.8 22.2"/>` +
    `<path stroke-width="1.6" d="M17.4 16.6 Q24 15.4 30.6 16.4 L30.6 20.2 Q24 21.4 17.4 20.4 Z" fill="${C.glass}"/>` +
    `<ellipse cx="24" cy="18.4" rx="2.6" ry="1.4" fill="${C.white}" stroke-width="1.2"/>` +
    `<path ${thin} d="M21.2 16.2 L21.2 20.6 M26.8 16.2 L26.8 20.6"/>`,

  // ── tools ────────────────────────────────────────────────────────────
  change:
    `<g stroke-width="2.4"><path d="M11.4 21.4 A13 13 0 0 1 35.6 16.6"/><path d="M36.2 9.4 L35.8 17 L28.4 15.8"/>` +
    `<path d="M36.6 26.6 A13 13 0 0 1 12.4 31.4"/><path d="M11.8 38.6 L12.2 31 L19.6 32.2"/></g>` +
    sparkle(24, 24, 6.4, `fill="${C.yellow}" stroke-width="1.6"`),

  paint:
    `<path d="M33.4 5.8 L39.6 11.4 L26.6 26.4 L21.2 21.2 Z" fill="${C.wood}"/>` +
    `<path d="M21.2 21.2 L26.6 26.4 L23.4 29.6 L18 24.4 Z" fill="${C.metal}"/>` +
    `<path d="M18 24.4 L23.4 29.6 Q22.6 37.6 12.4 39.6 Q8.6 40.2 9.2 36.6 Q13 34 12.4 29.6 Q13 25 18 24.4 Z" fill="${C.pink}"/>` +
    `<path d="M33 37.4 Q35.4 33.4 37.6 37.2 Q38.4 40.6 35.2 40.8 Q32.2 40.6 33 37.4 Z" fill="${C.pink}" stroke-width="1.5"/>`,

  erase:
    `<path d="M14 27.8 L21.2 18.6 L33.4 27.6 L26.2 37 Z" fill="${C.pink}"/>` +
    `<path d="M21.2 18.6 L28.2 9.6 L40.4 18.6 L33.4 27.6 Z" fill="${C.white}"/>` +
    `<path d="M7.6 41.6 L31.4 41.4"/><path ${thin} d="M34.6 41.4 L37 41.4 M9.4 36.6 L11.4 37.6 M6.8 33 L8.6 34"/>`,

  // ── mischief (design section 13b) ────────────────────────────────────
  // Lightning (the tool's id is still `torch`): a little storm cloud and a bolt out of it.
  torch:
    `<path d="M22.6 24.4 L17.4 34.2 L22.8 33.6 L18.6 44.2 L30.6 29.6 L24.8 30.2 L28.4 24.4 Z" fill="${C.yellow}"/>` +
    `<path d="M10.4 25.6 Q5.4 25.2 6.4 20.2 Q7.4 16 11.8 16.8 Q12.6 10.2 19.4 10.4 Q23.4 5 30 7.6 Q35.2 6.4 37.6 11.6 Q43.4 12 42.6 18.2 Q42.2 24.6 35.6 25.4 Z" fill="#6c7287"/>` +
    `<path ${thin} d="M14.2 19.8 Q16.4 16.2 20.6 17.6 M27.4 13.4 Q31.2 12.2 33.4 15.2" stroke="${C.white}" fill="none"/>`,

  bomb:
    `<circle cx="21.6" cy="28.4" r="12.6" fill="${PALETTE.metal}"/>` +
    `<path d="M27.8 15.6 L31.4 13 L34.2 16.6 L30.8 19.4 Z" fill="${PALETTE.metal}"/>` +
    `<path stroke-width="2" d="M32.8 14.8 Q35.4 9.4 39.6 10.6"/>` +
    `<path ${thin} d="M15 24 Q16.2 20.6 19.4 19.6" stroke="${C.white}"/>` +
    sparkle(40.6, 8.6, 4.6, `fill="${C.yellow}" stroke-width="1.4"`),

  // The nuke's own casing (as in the town): fat and finned, drab, a yellow band at the nose, nose down.
  nuke:
    `<g transform="rotate(-45 24 24)">` +
    `<path d="M35 20.4 L41.6 13.4 L44.4 15.6 L39.4 21.8 Z M35 27.6 L41.6 34.6 L44.4 32.4 L39.4 26.2 Z" fill="#5d6249"/>` +
    `<path d="M33.6 19.4 L38.6 20.6 L38.6 27.4 L33.6 28.6 Z" fill="#5d6249"/>` +
    `<path d="M5.4 24 Q5.6 15.6 16.4 15.4 L30.6 16 Q34.4 16.6 34.4 24 Q34.4 31.4 30.6 32 L16.4 32.6 Q5.6 32.4 5.4 24 Z" fill="#7b8063"/>` +
    `<path d="M11.8 16.4 Q9.6 24 11.8 31.6 L15.2 32.4 Q13.2 24 15.2 15.6 Z" fill="${C.yellow}"/>` +
    `<path ${thin} d="M24.6 16 L24.6 32 M27.4 16.2 L27.4 31.8"/>` +
    `<path ${thin} d="M17.6 19.4 Q24 18.4 30.2 19.2" stroke="${C.white}"/>` +
    `</g>`,

  // The raid: a longship under its striped square sail, a dragon's head at the prow, shields along its side.
  raid:
    `<path d="M24 9 L24 32" stroke-width="2.2"/>` +
    `<path d="M13.4 10.4 L34.6 10.4 Q36.4 19 34 26.4 L14 26.4 Q11.6 19 13.4 10.4 Z" fill="${C.white}"/>` +
    `<path d="M17.6 10.4 L21.8 10.4 L21.4 26.4 L17.8 26.4 Q16.6 19 17.6 10.4 Z M26.2 10.4 L30.4 10.4 Q31.4 19 30.2 26.4 L26.6 26.4 Z" fill="${PALETTE.red}" stroke="none"/>` +
    `<path d="M13.4 10.4 L34.6 10.4 Q36.4 19 34 26.4 L14 26.4 Q11.6 19 13.4 10.4 Z"/>` +
    `<path d="M4.6 31.6 Q8 40.2 24 40.2 Q38.4 40.2 41.8 31.6 L42.6 26.4 Q44.8 21 41.6 19.8 Q39.2 19.6 39.8 23 L40.4 31.4 Z" fill="${C.wood}"/>` +
    `<path d="M4.6 31.6 Q3.6 26.4 7.2 24.8" stroke-width="2.2"/>` +
    `<circle cx="13.6" cy="34.6" r="2.6" fill="${C.yellow}"/><circle cx="20" cy="35.6" r="2.6" fill="${PALETTE.red}"/>` +
    `<circle cx="26.6" cy="35.6" r="2.6" fill="${C.yellow}"/><circle cx="33" cy="34.6" r="2.6" fill="${PALETTE.red}"/>` +
    `<path ${thin} d="M6 42.6 Q12 41 17 42.6 M28 43 Q34 41.2 40 42.8" stroke="${PALETTE.glass}"/>`,

  mallet:
    `<path d="M22.6 24.2 L36.6 38.4 L33.6 41.4 L19.6 27.2 Z" fill="${C.wood}"/>` +
    `<path d="M9.4 18.4 L20.8 7 L30.2 16.4 L18.8 27.8 Z" fill="${C.woodDark}"/>` +
    `<path ${thin} d="M12.6 21.4 L23.8 10.2 M16 24.6 L27 13.6"/>` +
    `<path ${thin} d="M37.6 27.6 L41.6 25.6 M36.4 23.4 L38.8 19.8 M40.6 32 L44.4 31.6"/>`,

  // The Hand: an open hand reaching down, fingers spread, a little figure dangling from between them.
  // The UFO: a domed saucer, lights round its rim, a beam of light below it.
  ufo:
    `<path stroke-width="0" d="M18.4 27.6 L29.6 27.6 L35.6 44.6 L12.4 44.6 Z" fill="${C.yellow}" fill-opacity="0.45"/>` +
    `<path d="M16 19.6 Q16.6 9.8 24 9.6 Q31.4 9.8 32 19.6 Z" fill="#a9dcef"/>` +
    `<path ${thin} d="M21.4 15.8 Q21.6 12.6 24 12.4 Q26.4 12.6 26.6 15.8 Q24 17.4 21.4 15.8 Z" fill="#7ed36a"/>` +
    `<path d="M4.6 24 Q5.6 18.6 24 18.2 Q42.4 18.6 43.4 24 Q42.4 28.6 24 29.2 Q5.6 28.6 4.6 24 Z" fill="#c9ccd6"/>` +
    `<circle cx="10.6" cy="24.4" r="1.4" fill="${C.yellow}"/><circle cx="17.2" cy="25.8" r="1.4" fill="${C.red}"/>` +
    `<circle cx="24" cy="26.2" r="1.4" fill="${C.yellow}"/><circle cx="30.8" cy="25.8" r="1.4" fill="${C.red}"/><circle cx="37.4" cy="24.4" r="1.4" fill="${C.yellow}"/>`,

  hand:
    `<path d="M14.2 27.6 L10.6 17.4 Q10.2 14.6 12.6 14.4 Q14.6 14.4 15.4 16.8 L18 23.6 L16.6 9.6 Q16.6 7 19 7 Q21.2 7.1 21.4 9.6 L22.4 22 L23.4 7.8 Q23.6 5.4 25.8 5.6 Q28 5.8 27.8 8.4 L27 22.2 L29.6 10.4 Q30.2 8.2 32.2 8.6 Q34.2 9.2 33.6 11.6 L31.4 24.2 L34.6 20 Q36.4 18.2 38 19.6 Q39.4 21 37.8 23.2 L31 32.8 Q27.4 37.4 21.8 36.6 Q16.6 35.8 14.2 27.6 Z" fill="#f2c9a0"/>` +
    `<path ${thin} d="M18.6 29.4 Q22 31.6 26.6 30.2"/>` +
    `<path stroke-width="1.5" d="M24 36.8 L24 39.2"/>` +
    `<circle cx="24" cy="40.6" r="2" fill="${C.white}"/>` +
    `<path stroke-width="1.5" d="M24 42.4 L24 45.4 M24 43.4 L21.4 41.6 M24 43.4 L26.6 41.6"/>`,

  mend:
    `<path d="M8.8 33.6 L24.8 33.4 L24.8 41.6 L8.8 41.8 Z" fill="${C.brick}"/>` +
    `<path ${thin} d="M16.8 33.6 L16.8 41.6"/>` +
    `<path d="M22.8 27.6 L37.6 12.8 L41.4 21.4 Z" fill="${C.metal}"/>` +
    `<path d="M22.8 27.6 L18.4 24 L14.2 28.4" stroke-width="2.2"/>` +
    `<path d="M14.6 28 L11.2 31.4 L13.4 33.2 L16.6 30 Z" fill="${C.wood}"/>`,

  // ── top bar ──────────────────────────────────────────────────────────
  menu: `<path stroke-width="3" d="M10 15 Q24 13.2 38 15.4 M10 24.6 Q24 23.2 38 24 M10 33 Q24 34.6 38 33.2"/>`,
  undo: `<path stroke-width="2.6" d="M17.4 13.4 L8.8 21 L17.8 28.4"/><path stroke-width="2.6" d="M9.6 21 L28 20.8 Q38.6 21.4 38.6 29.6 Q38.4 37.2 29 37.2 L21.6 37.2"/>`,
  redo: `<path stroke-width="2.6" d="M30.6 13.4 L39.2 21 L30.2 28.4"/><path stroke-width="2.6" d="M38.4 21 L20 20.8 Q9.4 21.4 9.4 29.6 Q9.6 37.2 19 37.2 L26.4 37.2"/>`,
  // Fly mode: a pair of wings, spread, three feathers each.
  wings:
    `<path d="M22.4 22.6 Q14.6 11.8 3.8 12.6 Q5.4 17.4 9.6 19.2 Q6.2 20.6 6.8 24.2 Q10.2 26.6 13.6 25 Q12.2 29.4 15.4 31.6 Q20 31.4 22.4 27.4 Z" fill="${C.white}"/>` +
    `<path d="M25.6 22.6 Q33.4 11.8 44.2 12.6 Q42.6 17.4 38.4 19.2 Q41.8 20.6 41.2 24.2 Q37.8 26.6 34.4 25 Q35.8 29.4 32.6 31.6 Q28 31.4 25.6 27.4 Z" fill="${C.white}"/>` +
    `<path ${thin} d="M9.8 19.2 Q16 19.4 21.2 23.8 M13.8 25 Q18 24.6 21.8 26 M38.2 19.2 Q32 19.4 26.8 23.8 M34.2 25 Q30 24.6 26.2 26"/>` +
    `<path d="M22.2 22.8 Q24 20.6 25.8 22.8 L25.4 33.6 Q24 35.6 22.6 33.6 Z" fill="${C.roof}"/>`,
  // The town's numbers: two of those who live here (as on the strip, src/ui/stats/strip.ts).
  people:
    '<circle cx="17" cy="16" r="6"/><path d="M6 40c0-9 5-14 11-14s11 5 11 14"/><circle cx="34" cy="19" r="5"/><path d="M30 28c6-2 12 2 12 12"/>',
  // The guide: an open sketchbook, a little house drawn on its right page, a ribbon to keep the place.
  guide:
    `<path d="M4.6 16.4 L4.8 39.6 Q14.4 36.8 24 41 Q33.6 36.8 43.2 39.4 L43.2 16.2" fill="${C.roof}"/>` +
    `<path d="M6.6 12.4 Q15.6 9.6 24 13.8 L24.1 38.2 Q15.4 34.4 6.8 36.6 Z" fill="${C.white}"/>` +
    `<path d="M24 13.8 Q32.4 9.4 41.4 12 L41.2 36.2 Q32.6 34 24.1 38.2 Z" fill="${C.white}"/>` +
    `<path ${thin} d="M10.2 18 Q14.8 16.6 20.2 18.4 M10.2 22.6 Q14.8 21.2 20.2 23 M10.2 27.2 Q14 26 18 27.4"/>` +
    `<path stroke-width="1.5" d="M28.4 31.4 L28.5 24.8 L32.8 20.6 L37 24.6 L37 31 Z" fill="${C.pink}"/>` +
    `<path ${thin} d="M31.6 31.2 L31.6 27.8 L34 27.8 L34 31.1"/>` +
    `<path stroke-width="1.5" d="M29.8 11.6 L29.9 4.8 L33.4 4.6 L33.4 10.8 L31.6 9.4 Z" fill="${C.red}"/>`,
  // Global Village (src/ui/forum-button.ts): two little houses side by side on a curve of the round world.
  village:
    `<path d="M3.8 41.6 Q24 30.2 44.2 41.6 Z" fill="${C.grass}"/>` +
    `<path d="M7.6 36.4 L7.8 24.4 L14.6 17.6 L21.4 24.2 L21.4 33.6 Q14 34 7.6 36.4 Z" fill="${C.wall}"/>` +
    `<path d="M5.4 25.8 L14.6 15.6 L23.6 25.4" stroke-width="2.4" stroke="${C.ink}"/>` +
    `<path d="M24.6 33.4 L24.6 19.4 L32.6 11 L40.6 19.2 L40.6 36.2 Q32.4 33.2 24.6 33.4 Z" fill="${C.pink}"/>` +
    `<path d="M22.6 21 L32.6 8.8 L42.6 20.8" stroke-width="2.4" stroke="${C.ink}"/>` +
    `<path stroke-width="1.6" d="M12.6 34.4 L12.6 28.6 L16.6 28.6 L16.6 33.8"/>` +
    `<path stroke-width="1.5" d="M29.6 21.4 L35.4 21.4 L35.4 26.4 L29.6 26.4 Z" fill="${C.glass}"/>`,
  // A heart: likes (Global Village), filled when the player has liked.
  heart:
    `<path d="M24 40.4 Q9.6 31 6.6 22.2 Q4.4 13.6 11.6 10.2 Q19 7.6 24 15.4 Q29 7.6 36.4 10.2 Q43.6 13.6 41.4 22.2 Q38.4 31 24 40.4 Z" fill="${C.red}" stroke-width="2.4"/>`,
  // A cup of coffee on its saucer, steam rising: the tip jar (Ko-fi link in the corner).
  coffee:
    `<path ${thin} d="M18.4 13.6 Q15.8 10.6 18.6 7.6 Q21 5 18.8 2.8 M26.4 13.6 Q23.8 10.6 26.6 7.6 Q29 5 26.8 2.8"/>` +
    `<path d="M33.6 22.4 Q41.4 21.2 41 27.4 Q40.6 32.8 32 32.6" stroke-width="2.4"/>` +
    `<path d="M10 18.6 L10.8 30.6 Q11.6 37.4 18 38.2 L26.2 38.4 Q32.6 37.6 33.6 30.4 L34.2 18.4 Z" fill="${C.white}"/>` +
    `<path d="M10 18.6 Q22 22.4 34.2 18.4 Q22 15.2 10 18.6 Z" fill="${C.trunk}"/>` +
    `<path d="M5.6 39.4 Q22 45.2 38.6 39.2" stroke-width="2.4"/>`,
  // A small tick in a ring: an entry of the guide the town already holds.
  tick: `<circle cx="24" cy="24" r="17.5" fill="${C.leaf}"/><path stroke-width="3.6" d="M15.2 24.6 L21.6 31 L33.4 17.4" stroke="${C.ink}"/>`,
  // The Almanac's stamp on a building the player has built: a rubber stamp's ring in red ink with a tick in it.
  stamp:
    `<circle cx="24" cy="24" r="18.6" stroke="${C.redDark}" stroke-width="2.6" fill="${C.white}"/>` +
    `<circle cx="24" cy="24" r="14.4" stroke="${C.redDark}" stroke-width="1.2" stroke-dasharray="2.6 2.2"/>` +
    `<path stroke-width="3.8" d="M15.6 24.4 L21.4 30.4 L32.8 17.2" stroke="${C.redDark}"/>`,
  // The tutorial's hand (src/ui/tutorial.ts): a white glove pointing down with its first finger, a blue cuff.
  point:
    `<path d="M15.4 4.2 L33.6 4.4 L33.2 10.6 L15.6 10.4 Z" fill="${C.roofBlue}"/>` +
    `<path d="M16 10.6 L33 10.8 Q37.6 17.4 35.6 24.8 Q33.6 30.4 27.8 30.6 L26.2 30.4 L26.2 41.8 Q26 45.6 22.8 45.6 Q19.6 45.6 19.6 41.8 L19.6 29.6 Q14.2 28.6 13.4 23.2 Q9.6 21.4 11.4 17.4 Q13.4 14.8 16.4 16.8 Z" fill="${C.white}"/>` +
    `<path ${thin} d="M26.4 24.6 Q30.6 25.8 35 23.6 M26.8 19.4 Q31 20.8 35.8 18.6 M16.4 16.8 Q16.8 20.6 19.6 22.6 M19.6 29.6 L19.6 25.6"/>`,
  'time-run':
    sun(17.5, 17.5, 6.6) +
    `<path d="M33.6 21.6 A10.4 10.4 0 1 0 41 37.4 A8.4 8.4 0 0 1 33.6 21.6 Z" fill="${C.moon}"/>`,
  'time-day': sun(24, 24, 8.6),
  'time-dusk':
    `<path d="M11.2 15.6 L13.6 18.4 M24 9.6 L24 13.4 M36.8 15.6 L34.4 18.4 M6.6 26 L10 26.8 M41.4 26 L38 26.8"/>` +
    `<path d="M13.4 31.6 A10.6 10.6 0 0 1 34.6 31.6 Z" fill="${C.orange}"/>` +
    `<path d="M5.6 31.6 L42.4 31.4"/><path ${thin} d="M12 36.6 L24 36.4 M28 36.6 L36 36.4 M18 40.8 L31 40.6"/>`,
  // Dawn: the sun half up over the line of the sea, pink.
  'time-dawn':
    `<path d="M11.4 22.8 L13.6 25.2 M24 15.4 L24 19 M36.6 22.8 L34.4 25.2"/>` +
    `<path d="M14 33.4 A10 10 0 0 1 34 33.4 Z" fill="${C.pink}"/>` +
    `<path d="M5.6 33.4 L42.4 33.2"/><path ${thin} d="M13 38.4 L23 38.2 M27.6 38.4 L35 38.2"/>`,
  'time-night':
    `<path d="M28.6 7.6 A15.4 15.4 0 1 0 40.6 31.4 A12.6 12.6 0 0 1 28.6 7.6 Z" fill="${C.moon}"/>` +
    sparkle(37, 13, 4.4, `fill="${C.white}" stroke-width="1.5"`) +
    sparkle(10.4, 11.4, 2.8, `fill="${C.white}" stroke-width="1.3"`),

  // ── seasons and weather (design section 13a) ─────────────────────────
  // The year turning: four quarters, blossom pink, summer green, autumn orange, snow white.
  'season-run':
    `<path d="M24 24 L24 7.4 A16.6 16.6 0 0 1 40.6 24 Z" fill="${C.leaf}"/>` +
    `<path d="M24 24 L40.6 24 A16.6 16.6 0 0 1 24 40.6 Z" fill="${C.orange}"/>` +
    `<path d="M24 24 L24 40.6 A16.6 16.6 0 0 1 7.4 24 Z" fill="${C.white}"/>` +
    `<path d="M24 24 L7.4 24 A16.6 16.6 0 0 1 24 7.4 Z" fill="${C.pink}"/>` +
    `<path stroke-width="1.6" d="M37.6 8.6 L41.6 10.6 L39.4 14.6"/>`,
  // Spring: a blossom with a leaf.
  'season-spring':
    `<path d="M24 40.4 Q24.6 33 24.2 27.6"/>` +
    `<path d="M24.4 35.4 Q31.6 30.4 37 34.4 Q31.4 39.4 24.4 35.4 Z" fill="${C.leaf}"/>` +
    [0, 72, 144, 216, 288]
      .map((a) => `<ellipse cx="24" cy="12.8" rx="4.9" ry="6.4" transform="rotate(${a} 24 19.6)" fill="${C.pink}"/>`)
      .join('') +
    `<circle cx="24" cy="19.6" r="3.2" fill="${C.yellow}"/>`,
  // Summer: a tree in full leaf.
  'season-summer':
    `<path d="M24 41 L24.2 29.4" stroke="${C.trunk}" stroke-width="3"/>` +
    `<path d="M12.6 22.4 Q11.4 10.6 22.6 8.8 Q35.4 8 36.2 19.4 Q37.4 30 24.6 30.6 Q13.4 31 12.6 22.4 Z" fill="${C.leaf}"/>` +
    `<path ${thin} d="M18 22.6 Q20.2 25 23 24.4 M28.4 17.4 Q30.6 19.6 31.6 22.4"/>` +
    `<path stroke-width="1.4" d="M8.4 41.2 L39.8 41"/>`,
  // Autumn: a falling leaf, orange, with its veins.
  'season-autumn':
    `<path d="M24 6.6 Q31 12 35.8 10.8 Q34.4 17 39.8 21 Q34.6 23.6 35.4 29.4 Q29.2 28.2 25.6 33.8 Q20.4 28.4 14 29.6 Q15.2 23.6 9.6 20.6 Q15.6 17.4 13.2 11 Q19 12.4 24 6.6 Z" fill="${C.orange}"/>` +
    `<path ${thin} d="M24.4 31.4 L24 11.6 M24.2 22 L31.6 16.4 M24.2 22 L16.4 16.8 M24.3 27.4 L31 24.4 M24.3 27.4 L17.6 24.6"/>` +
    `<path d="M24.6 33.4 Q25.6 38 23.2 41.6"/>`,
  // Winter: a snowflake.
  'season-winter':
    `<circle cx="24" cy="24" r="16.4" fill="${C.shallow}" stroke="none"/>` +
    [0, 60, 120]
      .map((a) => `<path transform="rotate(${a} 24 24)" d="M24 8.4 L24 39.6 M19.8 11.6 L24 15.4 L28.2 11.6 M19.8 36.4 L24 32.6 L28.2 36.4"/>`)
      .join(''),
  // The midwinter festival: a little fir with coloured lights and a star.
  'season-festival':
    `<path d="M24 9.6 L36.4 36.4 L11.6 36.4 Z" fill="${C.leafDark}"/>` +
    `<path d="M21.6 36.4 L21.8 41.6 L26.4 41.6 L26.2 36.4" fill="${C.trunk}"/>` +
    `<circle cx="19.6" cy="30.4" r="2" fill="${C.red}" stroke-width="1.2"/><circle cx="27.6" cy="27.2" r="2" fill="${C.yellow}" stroke-width="1.2"/>` +
    `<circle cx="22.4" cy="21.4" r="1.8" fill="${C.sea}" stroke-width="1.2"/><circle cx="30.4" cy="33" r="1.9" fill="${C.pink}" stroke-width="1.2"/>` +
    sparkle(24, 7.6, 4.4, `fill="${C.yellow}" stroke-width="1.4"`),
  // Weather by itself: sun behind a cloud.
  'weather-auto':
    sun(18.4, 17.4, 6, C.yellow, 7) +
    `<path d="M14.4 37.8 Q8.6 37.6 9.2 32.4 Q10 27.6 15.2 28.4 Q16.4 21.6 23.6 22 Q30.4 22.4 31.2 28 Q38.8 27 39.4 32.4 Q39.8 37.8 33.4 37.8 Z" fill="${C.white}"/>`,
  'weather-clear': sun(24, 24, 8.6),
  'weather-cloudy':
    `<path d="M12.6 35.6 Q5.6 35.4 6.4 29.4 Q7.4 23.6 13.6 24.8 Q14.6 15.6 24 15.8 Q32.8 16 34 23.6 Q42.4 22.4 42.4 29.4 Q42.4 35.6 35 35.6 Z" fill="${C.white}"/>` +
    `<path ${thin} d="M16 30.8 Q20 32.6 24.6 30.6"/>`,
  'weather-rain':
    `<path d="M12.6 27.6 Q5.6 27.4 6.4 21.4 Q7.4 15.6 13.6 16.8 Q14.6 7.6 24 7.8 Q32.8 8 34 15.6 Q42.4 14.4 42.4 21.4 Q42.4 27.6 35 27.6 Z" fill="${C.white}"/>` +
    `<path stroke="${C.seaInk}" d="M14.6 32 L12.4 38.8 M22.4 32.2 L20.2 39 M30.2 32 L28 38.8 M37.4 31.8 L35.6 37.2 M18.6 41.6 L17.8 44"/>`,
  'weather-storm':
    `<path d="M12.6 27.6 Q5.6 27.4 6.4 21.4 Q7.4 15.6 13.6 16.8 Q14.6 7.6 24 7.8 Q32.8 8 34 15.6 Q42.4 14.4 42.4 21.4 Q42.4 27.6 35 27.6 Z" fill="${C.metal}"/>` +
    `<path stroke-width="1.6" d="M25.6 24.4 L19.4 34.6 L24.6 34.4 L20.6 44 L31 31.2 L25.6 31.4 L29.8 24.4 Z" fill="${C.yellow}"/>`,
  'weather-fog':
    `<path d="M7 15.6 Q12 12.8 17 15.6 T27 15.6 T37 15.6 T42 14.8"/>` +
    `<path d="M5.6 24 Q10.6 21.2 15.6 24 T25.6 24 T35.6 24 T42.6 23.4"/>` +
    `<path d="M8.4 32.4 Q13.4 29.6 18.4 32.4 T28.4 32.4 T38.4 32.4"/>` +
    `<path ${thin} d="M12 39.6 Q17 37 22 39.6 T32 39.6"/>`,
  'weather-wind':
    `<path d="M5.6 18.4 L28.6 18.4 Q34.6 18.2 34.4 13 Q34 8.6 29.6 9 Q26.2 9.6 26.6 13"/>` +
    `<path d="M5.6 26.4 L36.4 26.4 Q42.6 26.6 42.4 32 Q42 36.4 37.4 36 Q34 35.4 34.6 31.8"/>` +
    `<path ${thin} d="M9.6 34.4 L24.4 34.4"/>` +
    `<path stroke="${C.orange}" stroke-width="2.4" d="M14.4 40.4 Q16.6 38.6 18.4 41.4"/>`,
  'weather-snow':
    `<path d="M12.6 27.6 Q5.6 27.4 6.4 21.4 Q7.4 15.6 13.6 16.8 Q14.6 7.6 24 7.8 Q32.8 8 34 15.6 Q42.4 14.4 42.4 21.4 Q42.4 27.6 35 27.6 Z" fill="${C.white}"/>` +
    sparkle(14.6, 35.4, 3.4, `fill="${C.white}" stroke-width="1.3"`) +
    sparkle(25.2, 39.6, 3.8, `fill="${C.white}" stroke-width="1.3"`) +
    sparkle(35.4, 34.6, 3.2, `fill="${C.white}" stroke-width="1.3"`),

  // ── menu ─────────────────────────────────────────────────────────────
  island:
    `<path stroke="${C.seaInk}" d="M3.6 37.6 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0"/>` +
    `<path d="M8 36.4 Q13 24.6 23 26 Q33.4 22.6 40 36.2 Z" fill="${C.grass}"/>` +
    `<path d="M22 26 L22.4 18.4" stroke="${C.trunk}" stroke-width="2.4"/>` +
    `<path d="M15.6 15.4 Q16 9 22.2 8.6 Q28.6 8.4 29.4 14.6 Q29.6 19.6 22.6 19.8 Q16 19.8 15.6 15.4 Z" fill="${C.leaf}"/>` +
    sparkle(37.4, 12, 4.6, `fill="${C.yellow}" stroke-width="1.5"`),
  // My towns: two pictures of towns, one behind the other.
  towns:
    `<path d="M13.4 7.8 L40.6 6.4 L41.8 28.8 L14.6 30.2 Z" fill="${C.white}" stroke-width="1.8"/>` +
    `<path stroke-width="1.5" d="M22.6 24.4 Q29 17.6 34.4 22.8 Q37.4 19.8 40.6 24.2" fill="none"/>` +
    `<path d="M6.4 16.4 L33.8 16.2 L34 40.6 L6.6 40.8 Z" fill="${C.white}"/>` +
    `<path stroke-width="1.6" d="M8.8 38.6 Q13.6 30.4 20.4 33.2 Q26.4 28.6 31.8 38.4 Z" fill="${C.grass}"/>` +
    `<path stroke-width="1.6" d="M14.4 33.8 L14.4 27.8 L18 24.2 L21.6 27.8 L21.6 32.6 Z" fill="${C.pink}"/>` +
    sparkle(28.4, 22.2, 3.4, `fill="${C.yellow}" stroke-width="1.3"`),
  // Grow a town: three little houses in a row with a sparkle.
  grow:
    `<path d="M5.6 38.6 L5.8 27.4 L11.4 21.6 L17.2 27.4 L17.2 38.6 Z" fill="${C.wall}"/>` +
    `<path d="M15.8 38.6 L15.8 22.6 L23.6 14.6 L31.4 22.6 L31.4 38.6 Z" fill="${C.pink}"/>` +
    `<path d="M30 38.6 L30.2 28.6 L35.8 23 L41.6 28.6 L41.6 38.6 Z" fill="${C.sea}"/>` +
    `<path stroke-width="1.6" d="M21.6 38.4 L21.6 31.4 L25.6 31.4 L25.6 38.4"/><path d="M3.6 38.8 L44.4 38.6"/>` +
    sparkle(39.6, 10.6, 5.2, `fill="${C.yellow}" stroke-width="1.5"`),
  // A die showing five: grow a town on a new island.
  dice:
    `<path d="M9.4 11.2 Q9.6 8.8 12 8.8 L36.2 9 Q38.8 9.2 38.8 11.8 L38.6 36.4 Q38.4 39 35.8 39 L11.8 38.8 Q9.2 38.6 9.2 36 Z" fill="${C.white}"/>` +
    `<g fill="${PALETTE.ink}" stroke="none"><circle cx="16.6" cy="16.4" r="2.6"/><circle cx="31.6" cy="16.6" r="2.6"/><circle cx="24" cy="24" r="2.6"/>` +
    `<circle cx="16.4" cy="31.4" r="2.6"/><circle cx="31.4" cy="31.6" r="2.6"/></g>`,
  // ── kinds of island (New island) ─────────────────────────────────────
  // Plains: a long low island, flat on top, a few tufts.
  'isle-plains':
    `<path stroke="${C.seaInk}" d="M3.6 37.6 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0"/>` +
    `<path d="M5.4 35.6 Q7.4 27.8 14 27.4 L34.6 27 Q41 27.4 42.8 35.4 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M12.6 31.4 L13.2 29.6 M14.6 31.4 L14.6 29.4 M23.4 31 L24 29.2 M25.4 31 L25.4 29 M33.6 31.2 L34.2 29.4"/>`,
  // Hills: two round hills, one behind the other.
  'isle-hills':
    `<path stroke="${C.seaInk}" d="M3.6 37.6 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0"/>` +
    `<path d="M19.6 30 Q24 13.6 32.4 14.2 Q40.6 15 42.8 35.4 L24 35.4 Z" fill="${C.leaf}"/>` +
    `<path d="M5.4 35.6 Q8.4 20.4 16.4 20.6 Q24.6 21 27.6 35.4 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M11.4 27.8 Q15.6 25.8 19.8 28 M30.6 21.4 Q34.4 19.8 37.6 22"/>`,
  // Mountain: a rocky peak with snow on top and grass at its foot.
  'isle-mountain':
    `<path stroke="${C.seaInk}" d="M3.6 37.6 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0"/>` +
    `<path d="M5.6 35.6 L19.4 8.4 L25.4 17.8 L29.6 13.2 L42.6 35.4 Z" fill="${C.stone}"/>` +
    `<path d="M15.2 16.8 L19.4 8.4 L23.6 15 Q21.6 13.8 19.8 16.2 Q17.8 14.4 15.2 16.8 Z" fill="${C.white}" stroke-width="1.6"/>` +
    `<path d="M5.6 35.6 Q10.4 29.2 16 30.2 Q24 27.4 30.4 30 Q37.4 28.6 42.6 35.4 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M23.2 22.6 L21.4 27 M30.4 20.6 L32 25.2 M14.4 24.4 L13 27.4"/>`,
  // River valley: a square of ground with a river winding right across it.
  'isle-valley': tile(
    C.grass,
    `<path stroke-width="1.4" d="M11.4 19.6 Q19.4 19.4 21.4 23.8 Q23.6 28.8 31.6 31.4 L36.4 28.6 Q28.6 27 26.8 22.4 Q24.6 17.6 16.4 16.6 Z" fill="${C.sea}"/>` +
      `<path ${thin} stroke="${C.leafDark}" d="M12 26.6 L12.6 24.8 M30.6 17.2 L31.2 15.4 M34.4 21 L35 19.2 M19.4 31 L20 29.2"/>`,
  ),
  // Islands: three little islands in the sea.
  'isle-islands':
    `<path stroke="${C.seaInk}" d="M3.6 37.6 q3.2 -3 6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0 t6.4 0"/>` +
    `<path d="M4.8 35.6 Q7 27.6 13 27.8 Q19 28 20.6 35.4 Z" fill="${C.grass}"/>` +
    `<path d="M22.6 35.4 Q25.4 22.6 33 23.2 Q40.8 24 42.8 35.4 Z" fill="${C.grass}"/>` +
    `<path d="M14.6 21 Q16.4 15.4 20.6 15.6 Q24.8 16 25.8 21 Z" fill="${C.leaf}"/>` +
    `<path stroke="${C.seaInk}" stroke-width="1.4" d="M12.4 22.6 q1.6 -1.4 3.2 0 M24.6 22.6 q1.6 -1.4 3.2 0"/>`,

  // ── kinds of town (Grow a town) ──────────────────────────────────────
  // Harbour town: a stone quay with a bollard, and a boat tied up at it.
  'town-harbour':
    `<path stroke="${C.seaInk}" d="M20 39.4 q3 -2.8 6 0 t6 0 t6 0 t6 0"/>` +
    `<path d="M4.6 40.6 L4.8 22.4 L21.4 22.2 L21.6 40.4 Z" fill="${C.stone}"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M5 28.4 L21.2 28.2 M5 34.4 L21.2 34.2 M12.4 22.6 L12.4 28.2 M9 28.6 L9 34.2 M16.6 28.6 L16.6 34.2 M12.8 34.6 L12.8 40.2"/>` +
    `<path d="M11.6 22.4 L11.8 17.6 Q14 15.6 16.2 17.6 L16.4 22.4 Z" fill="${C.ink}"/>` +
    `<path stroke-width="1.4" d="M16.2 19.6 Q22.6 22 28 28.2"/>` +
    `<path d="M24.4 29.4 L43.4 29 L40 35.4 L27.6 35.6 Z" fill="${C.red}"/>` +
    `<path d="M33.4 29.2 L33.6 12.4"/><path d="M33.6 13.6 L41.6 26.4 L33.6 26.6 Z" fill="${C.white}" stroke-width="1.6"/>`,
  // Marble city: a temple front, pediment and columns on a step.
  'town-marble':
    `<path d="M6 40.6 L6.2 35.6 L41.8 35.4 L42 40.4 Z" fill="${C.stoneShade}"/>` +
    `<g fill="${PALETTE.marble}"><path d="M10.6 35.6 L10.8 20.6 L14.8 20.6 L15 35.6 Z"/><path d="M18.4 35.6 L18.6 20.6 L22.6 20.6 L22.8 35.6 Z"/>` +
    `<path d="M25.6 35.6 L25.8 20.6 L29.8 20.6 L30 35.6 Z"/><path d="M33.2 35.6 L33.4 20.6 L37.4 20.6 L37.6 35.6 Z"/></g>` +
    `<path d="M7.4 20.8 L7.6 16.6 L40.6 16.4 L40.8 20.6 Z" fill="${C.stone}"/>` +
    `<path d="M6.4 16.8 L24 6.8 L41.8 16.6 Z" fill="${PALETTE.marble}"/>` +
    `<circle cx="24" cy="12.6" r="1.8" fill="${C.yellow}" stroke-width="1.3"/>`,
  // Castle town: a keep with battlements, an arched door, a slit window and a flag.
  'town-castle':
    `<path d="M24 11 L24.1 2.6"/><path d="M24.1 2.6 L31 4.4 L24.1 6.4" fill="${C.red}" stroke-width="1.5"/>` +
    `<path d="M12.8 40.8 L13.2 17.4 L34.8 17.2 L35.2 40.6 Z" fill="${C.stone}"/>` +
    `<path d="M11 18 L11 10.8 L16 10.8 L16 13.8 L20.6 13.8 L20.6 10.8 L27.4 10.8 L27.4 13.8 L32 13.8 L32 10.8 L37 10.8 L37 18 Z" fill="${C.stoneShade}"/>` +
    `<path d="M20.4 40.6 L20.5 33.4 Q24 29.4 27.5 33.4 L27.6 40.6" fill="${C.wood}"/>` +
    `<path stroke-width="2.4" d="M24 21.6 L24 26.4"/>` +
    `<path ${thin} stroke="${C.stoneLine}" d="M15.2 22.4 L18.6 22.4 M29.6 24.4 L32.8 24.4 M15.4 31 L18.2 31 M30 35.2 L32.8 35.2"/>`,
  // Market town: the market stall.
  'town-market':
    `<path d="M11 19 L11.2 31 M37 19 L36.8 31"/>` +
    `<path d="M8.6 30.4 L8.8 41 L39.2 40.8 L39.4 30.2 Z" fill="${C.wood}"/>` +
    `<g stroke-width="1.4"><circle cx="15.6" cy="28" r="2.5" fill="${C.yellow}"/><circle cx="21.4" cy="28.1" r="2.5" fill="${C.red}"/>` +
    `<circle cx="27.4" cy="28" r="2.5" fill="${C.pink}"/><circle cx="33" cy="28" r="2.5" fill="${C.leaf}"/></g>` +
    `<path d="M5.4 20 L9.6 8.8 L38.6 8.6 L42.6 19.8 Q39.6 23.4 36.4 19.9 Q33.3 23.4 30.2 19.9 Q27.1 23.4 24 20 Q20.9 23.4 17.8 20 Q14.7 23.4 11.6 20 Q8.5 23.4 5.4 20 Z" fill="${C.white}"/>` +
    `<g stroke-width="1.3" fill="${C.sea}"><path d="M9.6 8.8 L14.4 8.8 L11.6 20 Q8.5 23.4 5.4 20 Z"/>` +
    `<path d="M19.3 8.7 L24.1 8.7 L24 20 Q20.9 23.4 17.8 20 Z"/><path d="M28.9 8.7 L33.8 8.6 L36.4 19.9 Q33.3 23.4 30.2 19.9 Z"/></g>`,
  // River town: a mill wheel turning in the stream.
  'town-river':
    `<circle cx="22" cy="21.4" r="14.4" fill="${C.wood}"/>` +
    `<circle cx="22" cy="21.4" r="9.4" fill="${C.white}"/>` +
    `<path stroke-width="1.8" d="M22 12.2 L22 30.6 M12.8 21.4 L31.2 21.4 M15.6 15 L28.4 27.8 M28.4 15 L15.6 27.8"/>` +
    `<circle cx="22" cy="21.4" r="2.6" fill="${C.woodDark}"/>` +
    `<path d="M3.6 36.4 Q14 33.4 24 36 Q34 38.6 44.4 35.4 L44.4 42.6 L3.6 42.6 Z" fill="${C.sea}"/>` +
    `<path stroke="${C.white}" stroke-width="1.6" d="M30.4 38.6 q2 -1.6 4 0 t4 0 M10.6 39.6 q2 -1.6 4 0"/>`,
  // Farming village: a sheaf of wheat tied round the middle.
  'town-farming':
    `<path stroke-width="1.8" stroke="${C.dirtDark}" d="M17.6 41.4 L22.4 28 L15.6 15.6 M24 41.6 L24 28 L19.6 12.4 M30.4 41.4 L25.6 28 L28.4 12.4 M24 28 L24 10.6 M25.6 28 L32.4 15.6"/>` +
    `<g fill="${C.yellow}" stroke-width="1.5">` +
    `<ellipse cx="15" cy="13.2" rx="2.6" ry="5.4" transform="rotate(-28 15 13.2)"/><ellipse cx="19.4" cy="9.8" rx="2.6" ry="5.4" transform="rotate(-12 19.4 9.8)"/>` +
    `<ellipse cx="24" cy="8.4" rx="2.6" ry="5.4"/><ellipse cx="28.6" cy="9.8" rx="2.6" ry="5.4" transform="rotate(12 28.6 9.8)"/>` +
    `<ellipse cx="33" cy="13.2" rx="2.6" ry="5.4" transform="rotate(28 33 13.2)"/></g>` +
    `<path stroke-width="3" stroke="${C.red}" d="M19.8 28.6 Q24 30.6 28.2 28.6"/>`,
  // Hill town: houses stepping up terraces.
  'town-hill':
    `<path d="M4.6 41 L4.8 34 L16.4 33.8 L16.6 26 L28.2 25.8 L28.4 18 L43.4 17.8 L43.6 40.8 Z" fill="${C.grass}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M16.6 34 L16.6 40.6 M28.4 26 L28.4 40.6"/>` +
    `<path d="M7.6 34 L7.8 28.4 L13.4 28.4 L13.6 34 Z" fill="${C.wall}" stroke-width="1.6"/><path d="M6.4 28.6 L10.6 24 L14.8 28.6 Z" fill="${C.roof}" stroke-width="1.6"/>` +
    `<path d="M19.4 26 L19.6 20.4 L25.2 20.4 L25.4 26 Z" fill="${C.pink}" stroke-width="1.6"/><path d="M18.2 20.6 L22.4 16 L26.6 20.6 Z" fill="${C.roofBlue}" stroke-width="1.6"/>` +
    `<path d="M32.4 18 L32.6 12.4 L38.2 12.4 L38.4 18 Z" fill="${C.wall}" stroke-width="1.6"/><path d="M31.2 12.6 L35.4 8 L39.6 12.6 Z" fill="${C.orange}" stroke-width="1.6"/>`,
  // Garden town: a round clipped tree in a planter, flowers either side.
  'town-gardens':
    `<path d="M22.4 33 L22.6 24 L25.4 24 L25.6 33 Z" fill="${C.trunk}"/>` +
    `<circle cx="24" cy="15.6" r="10.4" fill="${C.leaf}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M18.4 17.4 Q21.4 21 26 20 M26.4 10.6 Q29.6 11.8 30 15"/>` +
    `<path d="M15.6 32.6 L32.4 32.4 L30.8 41.2 L17.2 41.4 Z" fill="${C.brick}"/>` +
    `<path ${thin} stroke="${C.leafDark}" d="M8.6 41 L8.8 34.6 M39.4 41 L39.2 34.6"/>` +
    `<g stroke-width="1.3"><circle cx="8.8" cy="33.4" r="2.4" fill="${C.pink}"/><circle cx="39.2" cy="33.4" r="2.4" fill="${C.yellow}"/>` +
    `<circle cx="5.6" cy="38.4" r="1.9" fill="${C.white}"/><circle cx="42.4" cy="38.4" r="1.9" fill="${C.pink}"/></g>`,

  share:
    `<g stroke-width="2.6"><path d="M21 27 L27 21"/><path d="M19.6 20.6 L24 16.2 A6.2 6.2 0 0 1 32.8 25 L28.6 29.2"/>` +
    `<path d="M28.4 27.4 L24 31.8 A6.2 6.2 0 0 1 15.2 23 L19.4 18.8" transform="translate(0 0)"/></g>`,
  postcard:
    `<path d="M6.4 12.6 L41.4 12.2 L41.6 35.6 L6.6 36 Z" fill="${C.white}"/>` +
    `<path d="M32.4 16 L38 15.9 L38.1 22 L32.5 22.1 Z" fill="${C.pink}" stroke-width="1.5"/>` +
    `<path ${thin} d="M26 26.4 L37.6 26.2 M26 30.6 L35 30.4"/>` +
    `<path stroke-width="1.5" d="M10 31.6 Q13.6 22.6 17.4 26.4 Q20 21.6 22.6 31.4 Z" fill="${C.leaf}"/>`,
  // A bin with its lid and handle: delete (My towns). Derek, 2026-11-21: a trash can, not the eraser.
  trash:
    `<g stroke-width="2.6"><path d="M13.4 14.6 L15.4 39.2 L32.8 39.4 L34.8 14.4 Z" fill="${C.white}"/>` +
    `<path d="M9.6 14.4 L38.6 14"/><path d="M19 13.8 L19.6 9.2 L28.6 9 L29.2 13.8"/>` +
    `<path stroke-width="2" d="M20.6 20.2 L21.2 33.6 M27.6 20.2 L27 33.6"/></g>`,
  download: `<g stroke-width="2.6"><path d="M24 8 L24.1 28 M16 20.6 L24.1 28.6 L32 20.6"/><path d="M9 30.4 L9.2 39.4 L39 39.2 L39.2 30.2"/></g>`,
  open: `<g stroke-width="2.6"><path d="M24 30 L24.1 9 M16 16.6 L24.1 8.6 L32 16.6"/><path d="M9 30.4 L9.2 39.4 L39 39.2 L39.2 30.2"/></g>`,
  'sound-on':
    `<path d="M8.6 19.6 L15.6 19.4 L24.6 11.6 L24.8 36.4 L15.6 28.6 L8.8 28.6 Z" fill="${C.white}"/>` +
    `<path stroke-width="2.4" d="M30 18.4 Q34.4 24 30 29.8 M35 13 Q42.6 24 35 35"/>`,
  'sound-off':
    `<path d="M8.6 19.6 L15.6 19.4 L24.6 11.6 L24.8 36.4 L15.6 28.6 L8.8 28.6 Z" fill="${C.white}"/>` +
    `<path stroke-width="2.4" d="M31 19 L40.4 29.2 M40.4 19 L31 29.2"/>`,
  // The menu's volume rows: a pair of quavers for the music, a little speaker for the sounds.
  music:
    `<path stroke-width="2.4" d="M18 33.6 L18.2 13.4 L36 10 L36.2 29.8"/><path stroke-width="2.4" d="M18.2 19 L36 15.6"/>` +
    `<ellipse cx="14.2" cy="34" rx="4.4" ry="3.4" fill="${C.pink}"/><ellipse cx="32.2" cy="30.4" rx="4.4" ry="3.4" fill="${C.pink}"/>`,
  volume:
    `<path d="M10.6 19.6 L17.6 19.4 L26.6 11.6 L26.8 36.4 L17.6 28.6 L10.8 28.6 Z" fill="${C.white}"/>` +
    `<path stroke-width="2.4" d="M32 18.4 Q36.4 24 32 29.8"/>`,
  // The menu's Language row: a globe, its meridians and parallels.
  language:
    `<path stroke-width="2.6" d="M24 8.4 Q39.8 8.6 39.6 24.2 Q39.4 39.8 23.8 39.6 Q8.2 39.4 8.4 23.8 Q8.6 8.2 24 8.4 Z" fill="${C.shallow}"/>` +
    `<g stroke-width="1.9"><path d="M24 8.6 Q15.6 16 15.8 24 Q16 32 24 39.4 M24 8.6 Q32.4 16 32.2 24 Q32 32 24 39.4 M24.1 8.6 L23.9 39.4"/>` +
    `<path d="M10.4 17.4 Q24 15.8 37.6 17.6 M8.6 24.2 Q24 23.2 39.4 23.8 M10.4 30.6 Q24 32.2 37.6 30.4"/></g>`,
  tune:
    `<path stroke-width="2.4" d="M8 14 L40 13.8 M8 24.2 L40 24 M8 34.2 L40 34"/>` +
    `<circle cx="17" cy="14" r="3.6" fill="${C.yellow}"/><circle cx="31" cy="24" r="3.6" fill="${C.pink}"/><circle cx="21" cy="34" r="3.6" fill="${C.sea}"/>`,
  // The held-length stepper's − and +.
  less: `<path stroke-width="3.2" d="M12.4 24.6 Q24 23.2 35.8 24.2"/>`,
  more: `<path stroke-width="3.2" d="M12.4 24.6 Q24 23.2 35.8 24.2 M24.4 12.2 Q23.4 24 24.2 35.8"/>`,
  close: `<path stroke-width="2.8" d="M13 13.4 L35 34.8 M35 13.2 L13.2 35"/>`,
  // The colour swatch on "auto": four pastel quarters and a sparkle.
  'swatch-auto':
    `<path d="M24 24 L24 7 A17 17 0 0 1 41 24 Z" fill="${RAMPS.wall[0]}" stroke="none"/>` +
    `<path d="M24 24 L41 24 A17 17 0 0 1 24 41 Z" fill="${RAMPS.wall[2]}" stroke="none"/>` +
    `<path d="M24 24 L24 41 A17 17 0 0 1 7 24 Z" fill="${RAMPS.wall[4]}" stroke="none"/>` +
    `<path d="M24 24 L7 24 A17 17 0 0 1 24 7 Z" fill="${RAMPS.wall[3]}" stroke="none"/>` +
    `<circle cx="24" cy="24" r="17"/>` +
    sparkle(24, 24, 7.6, `fill="${C.white}" stroke-width="1.6"`),
  // The ✨ over an Auto block while the Change tool is selected.
  sparkle: sparkle(22, 26, 18, `fill="${C.white}" stroke-width="3"`) + sparkle(39, 9, 7, `fill="${C.yellow}" stroke-width="2.4"`),
  // Random house style: a die, its three faces showing one, two and three.
  styleDice:
    `<path d="${CUBE_LEFT}" fill="${C.white}"/><path d="${CUBE_RIGHT}" fill="${C.stoneShade}"/><path d="${CUBE_TOP}" fill="${C.white}"/>` +
    `<g fill="${C.ink}" stroke="none"><ellipse cx="24.1" cy="15.9" rx="2.3" ry="1.4"/>` +
    `<circle cx="12.6" cy="22.4" r="1.7"/><circle cx="19.5" cy="35.4" r="1.7"/>` +
    `<circle cx="28.3" cy="34.6" r="1.7"/><circle cx="32.2" cy="29" r="1.7"/><circle cx="36.1" cy="23.4" r="1.7"/></g>`,
  // A kind with no drawing yet.
  unknown: `<path d="${CUBE_LEFT}" fill="${C.stone}"/><path d="${CUBE_RIGHT}" fill="${C.stoneShade}"/><path d="${CUBE_TOP}" fill="${C.white}"/>`,
};

// ─────────────────────────────────────────────────────────── house styles ──

/** A window on the house front at (x, y): its family's shape, glass, a cross bar, and shutters if it has them. */
function styleWindow(family: string, x: number, y: number, accent: string): string {
  const f = (n: number): string => n.toFixed(1);
  if (family === 'tall') {
    return `<rect x="${f(x)}" y="${f(y - 2.6)}" width="4.6" height="9.6" rx="0.6" fill="${C.glass}"/><path ${thin} d="M${f(x + 2.3)} ${f(y - 2.4)} L${f(x + 2.3)} ${f(y + 6.8)} M${f(x + 0.2)} ${f(y + 1.6)} L${f(x + 4.4)} ${f(y + 1.6)}"/>`;
  }
  if (family === 'arched') {
    return `<path d="M${f(x)} ${f(y + 6.6)} L${f(x)} ${f(y + 1.6)} Q${f(x + 2.9)} ${f(y - 2.6)} ${f(x + 5.8)} ${f(y + 1.6)} L${f(x + 5.8)} ${f(y + 6.6)} Z" fill="${C.glass}"/><path ${thin} d="M${f(x + 2.9)} ${f(y - 0.6)} L${f(x + 2.9)} ${f(y + 6.4)}"/>`;
  }
  const pane = `<rect x="${f(x)}" y="${f(y)}" width="6.2" height="6" rx="0.7" fill="${C.glass}"/><path ${thin} d="M${f(x + 3.1)} ${f(y + 0.2)} L${f(x + 3.1)} ${f(y + 5.8)} M${f(x + 0.2)} ${f(y + 3)} L${f(x + 6)} ${f(y + 3)}"/>`;
  if (family !== 'shuttered') return pane;
  return pane + `<rect ${thin} x="${f(x - 2.8)}" y="${f(y - 0.2)}" width="2.5" height="6.4" fill="${accent}"/><rect ${thin} x="${f(x + 6.5)}" y="${f(y - 0.2)}" width="2.5" height="6.4" fill="${accent}"/>`;
}

/** The front door at x = 15.6–22.3, standing on the ground line. */
function styleDoor(door: string, accent: string): string {
  if (door === 'arched') return `<path d="M15.6 40.6 L15.7 32.4 Q19 27.6 22.2 32.4 L22.3 40.5 Z" fill="${accent}"/>`;
  if (door === 'glazed') return `<path d="M15.7 40.6 L15.8 30.6 L22.2 30.5 L22.3 40.5 Z" fill="${accent}"/><rect ${thin} x="17.3" y="32" width="3.4" height="3.6" fill="${C.glass}"/>`;
  if (door === 'panel') return `<path d="M15.7 40.6 L15.8 30.6 L22.2 30.5 L22.3 40.5 Z" fill="${accent}"/><path ${thin} d="M17.2 32.2 L20.8 32.2 L20.8 35 L17.2 35 Z M17.2 36.4 L20.8 36.4 L20.8 39.2 L17.2 39.2 Z"/>`;
  return `<path d="M15.7 40.6 L15.8 30.6 L22.2 30.5 L22.3 40.5 Z" fill="${accent}"/><path ${thin} d="M18 30.8 L18 40.4 M20.1 30.7 L20.1 40.4"/>`;
}

/**
 * A tiny house in a style (design section 7, "House style"), for the House
 * button's flyout: the style's roof, walls, windows, door and chimney over
 * the given wall colour (a palette index; the roof follows the style's
 * stand-in for colours its own would clash with). Style 0 is the dice.
 */
export function styleIcon(style: number, wallIndex: number): string {
  const st = houseStyle(style);
  if (!st) return icon('styleDice');
  const c = ((wallIndex % 8) + 8) % 8;
  const wall = RAMPS.wall[c]!;
  const accent = styleAccent(st, c);
  const roof = st.cover === 'thatch' ? PALETTE.sand : RAMPS.roof[styleRoof(st, c)]!;
  const stack = st.chimney.stack === 'stone' ? PALETTE.stoneShade : st.chimney.stack === 'plaster' ? PALETTE.white : C.brick;
  const pots = st.chimney.pots === 2 ? `<path ${thin} d="M31.6 9.2 L31.6 7.2 M34.4 9.2 L34.4 7.2"/>` : `<path ${thin} d="M33 9.2 L33 7"/>`;
  const plankLines = (y0: number, y1: number): string => {
    let d = '';
    for (let y = y0; y < y1; y += 3.4) d += `M11 ${y.toFixed(1)} L37.3 ${(y - 0.2).toFixed(1)} `;
    return `<path ${thin} stroke="${C.woodDark}" stroke-opacity="0.55" d="${d}"/>`;
  };
  let body =
    `<path d="M30.5 9.4 L30.8 19 L35.6 19.2 L35.4 9.2 Z" fill="${stack}"/>` + pots +
    `<path d="M10.4 23.6 L10.8 40.7 L37.5 40.3 L37.8 23.4 Z" fill="${wall}"/>`;
  // Walls.
  if (st.walls === 'planks') body += plankLines(27, 40);
  else if (st.plankUpper) body += plankLines(27, 31);
  if (st.walls === 'timber') {
    body += `<path stroke-width="1.7" stroke="${C.trunk}" d="M10.8 31.4 L37.5 31.2 M13.4 23.8 L13.6 40.4 M25 23.6 L25 40.4 M34.8 23.5 L34.8 40.3 M13.6 31.4 L25 23.8 M25 31.2 L34.8 23.6"/>`;
  }
  if (st.storeyBands) body += `<path stroke-width="1.6" d="M10.6 30.4 L37.6 30.2"/>`;
  // Roof.
  if (st.cover === 'thatch') {
    body +=
      `<path d="M5.4 25.4 Q6 23 9 21.4 L22.6 9 Q24 7.4 25.4 9 L39.6 21.4 Q42.4 23.2 42.6 25.2 Q24 27.4 5.4 25.4 Z" fill="${roof}"/>` +
      `<path ${thin} stroke="${C.dirtDark}" d="M13 19.4 L11.4 23.6 M18 15 L16.6 24.4 M24 10.8 L24 24.8 M30 15 L31.4 24.4 M35 19.4 L36.6 23.6"/>`;
  } else {
    body += `<path d="M6.3 24.6 L23.7 8.6 L41.8 24.2 Z" fill="${roof}"/>`;
    if (st.timberGable) {
      // The gable end under the eaves, half-timbered.
      body +=
        `<path ${thin} d="M13.4 23.8 L23.8 14.2 L34.4 23.6 Z" fill="${wall}"/>` +
        `<path ${thin} stroke="${C.trunk}" d="M18.6 19.2 L29 19.1 M23.8 14.6 L23.8 23.6 M19.6 23.6 L23.8 19.2 L28.2 23.6"/>`;
    } else body += `<path ${thin} stroke-opacity="0.45" d="M14.6 19.2 L33 19 M19.6 14.4 L28 14.3"/>` + `<circle cx="23.9" cy="18.2" r="2.4" fill="${C.white}"/>`;
  }
  // Openings: the door on the left, a window on the right.
  body += styleDoor(st.door, accent) + styleWindow(st.family, 27.4, 31.4, accent);
  return (
    `<svg class="lc-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="${PALETTE.ink}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g filter="url(#lc-wobble)">${body}</g></svg>`
  );
}

export function hasIcon(id: string): boolean {
  return id in DRAWINGS && id !== 'unknown';
}

/** Every icon id, for the gallery's icon sheet. */
export function iconIds(): string[] {
  return Object.keys(DRAWINGS);
}

/** SVG markup for an icon; scales with the box it is put in (see .lc-icon in ui.css). */
export function icon(id: string): string {
  const body = DRAWINGS[id] ?? DRAWINGS.unknown!;
  return (
    `<svg class="lc-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="${PALETTE.ink}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g filter="url(#lc-wobble)">${body}</g></svg>`
  );
}

/**
 * The pen wobble every icon shares: a slight, fixed displacement, so lines
 * drawn straight above come out a little uneven, as they do in the town.
 * Put once into the page (icons refer to it by id).
 */
export function iconDefs(): string {
  return (
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>` +
    `<filter id="lc-wobble" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>` +
    `</filter></defs></svg>`
  );
}
