// The one surface shader (Look, Stage 1). Every static chunk, prop, actor
// and ghost is drawn with it, so the whole town is a handful of draw calls.
//
// What it does, in order:
//   vertex    slot matrix (things that move), wind sway, varyings
//   fragment  flat stepped shading from one fixed light (3–4 tones, shadows
//             drifting cool), then the surface's pencil pattern, then
//             pencil hatching in the shaded tones and the grounding shade
//   outputs   location 0: colour (sRGB) and glow in alpha
//             location 1: view normal (xy) and the ink id (two bytes), which
//             the composite pass turns into ink lines
//
// With OVERLAY defined it is the translucent pass drawn over the finished
// page: light beams and the ghost preview (see index.ts).
//
// Seasons and weather (./season.ts) hook in at five places marked "Seasons", all behind uSeasonOn
// (and the BARE define for falling leaves), so summer under a clear sky draws exactly as before.
//
// Adding a pattern: give it an id in PATTERN (src/gen/mesh.ts), add a branch
// in `pattern()` below, add a swatch to scenarios/look/look-swatches and a
// line to docs/swarm/ART.md.

import { SEASON_FRAGMENT, SEASON_VERTEX } from './season';

export const NOISE = /* glsl */ `
float h1(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

export const COLOR = /* glsl */ `
vec3 toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 toSrgb(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
`;

export const surfaceVertex = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

in vec3 position;
in vec4 normal;   // xyz, sway in w
in vec4 color;    // rgb (sRGB), pattern id / 255 in a
in vec2 ink;      // ink id, edge distance * 256
in float slot;    // 0 = fixed; otherwise a row of the slot table

uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uSlots;
uniform sampler2D uWind;
uniform float uTime;
uniform float uSway;
uniform float uZStep;     // the coplanar tie-break: one level, in clip-space depth
uniform vec3 uZOrigin;    // depth, worked out near the numbers it works on: the camera's target ...
uniform vec3 uZAxis;      // ... and the way it looks, over half the depth range
uniform float uBulbCss;   // Seasons: CSS pixels per world unit, for the bulbs' least size
#ifdef PERSP
uniform float uFocal;     // fly mode: CSS pixels per world unit at a distance of one
#endif

out vec3 vW;
out vec3 vN;
out vec3 vVN;
out vec3 vCol;
out float vEdge;
flat out vec4 vParams;
flat out float vPat;
flat out vec2 vId;
flat out vec3 vOrigin;   // the slot's origin in the world (a glow centre)
flat out float vCut;     // EDGECUT: 1 if this is cut off at the edge of the map (2: and its cross-section filled)
#ifdef PERSP
// Fly mode: the distance along the view (uZOrigin is the eye, uZAxis the unit forward), interpolated
// exactly (it is affine in the world) and written as the fragment's depth; and the tie-break level.
out float vLin;
flat out float vTie;
#endif

${SEASON_VERTEX}
${COLOR}

void main(){
  vec3 p = position;
  vec3 n = normal.xyz;
  vec4 params = vec4(1.0, 0.0, 0.0, 0.0);
  vOrigin = vec3(0.0);
  int s = int(slot + 0.5);
  if (s > 0) {
    ivec2 at = ivec2((s & 63) * 4, s >> 6);
    vec4 r0 = texelFetch(uSlots, at, 0);
    vec4 r1 = texelFetch(uSlots, at + ivec2(1, 0), 0);
    vec4 r2 = texelFetch(uSlots, at + ivec2(2, 0), 0);
    params = texelFetch(uSlots, at + ivec2(3, 0), 0);
    vOrigin = vec3(r0.w, r1.w, r2.w);
    p = vec3(dot(r0.xyz, position) + r0.w, dot(r1.xyz, position) + r1.w, dot(r2.xyz, position) + r2.w);
    n = vec3(dot(r0.xyz, n), dot(r1.xyz, n), dot(r2.xyz, n));
  }
  float pat = color.a * 255.0;
  // The AIRBORNE bit (src/gen/airborne.ts) only matters to the grounding picture.
  bool aloft = pat > 127.5;
  if (aloft) pat -= 128.0;
  // The edge of the map is a wall things pass through (EDGECUT, the movers): anything that moves on the
  // water is cut off there; things in the air only when their instance asks (params.w < 0: escort gulls),
  // and an instance with params.w < -1.5 (a ship crossing the edge) has its cross-section filled.
  vCut = s > 0 && (!aloft || params.w < -0.5) ? (params.w < -1.5 ? 2.0 : 1.0) : 0.0;
#if defined(CAP)
  if (vCut < 1.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
#endif
  // Three passes share this shader and each draws its own triangles: the page (everything solid),
  // OVERLAY (light beams and mist) and GHOST (the preview: slots whose glow is negative).
  bool beam = abs(pat - 27.0) < 0.5 || abs(pat - 28.0) < 0.5;
  bool ghost = params.x < -0.5;
#if defined(GHOST)
  if (!ghost || beam) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
#elif defined(OVERLAY)
  if (!beam || ghost) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
#else
  if (beam || ghost) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
#endif
  float len = length(n);
  n = len > 0.0 ? n / len : vec3(0.0, 1.0, 0.0);

#ifdef BARE
  vRest = p;   // Seasons: where the point is at rest, for the falling leaves' dissolve
#endif
  // Seasons: a festival bulb (edge 207, src/gen/foliage.ts) never draws smaller than a couple of pixels.
#ifdef PERSP
  // (Fly mode: the scale of the page at the bulb's own distance from the eye.)
  float bulbCss = uFocal / max(dot(p - uZOrigin, uZAxis), 1e-3);
#else
  float bulbCss = uBulbCss;
#endif
  if (abs(ink.y / 256.0 - 207.0) < 0.5) p += n * max(0.0, 2.2 / max(bulbCss, 1.0) - 0.04);
  // Wind: the same field every behaviour samples, so a gust crosses baked trees and moving flags together.
  float sway = max(normal.w, 0.0);
  if (sway > 0.0) {
    vec2 w = (textureLod(uWind, (p.xz + 8.0) / 64.0, 0.0).rg * 2.0 - 1.0) * 1.25;
    float st = length(w);
    // A fixed rate: a rate that followed the strength would spin the phase (uTime is large) and make
    // everything shiver as a gust arrived, instead of leaning into it.
    float ph = uTime * 2.1 + p.x * 0.9 + p.z * 1.3 + params.y;
    vec2 d = w * (0.55 + 0.45 * sin(ph)) + vec2(-w.y, w.x) * 0.25 * sin(ph * 1.7 + 1.3);
    p.xz += d * sway * uSway;
    p.y -= st * sway * uSway * 0.15 * (0.5 + 0.5 * sin(ph));
  }

  vW = p;
  vN = n;
  vVN = mat3(viewMatrix) * n;
  vCol = toLinear(color.rgb);
  vEdge = ink.y / 256.0;
  vParams = params;
  vPat = pat;
  float id = ink.x;
  vId = vec2(floor(id / 256.0), mod(id, 256.0)) / 255.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
#ifdef PERSP
  vLin = dot(p - uZOrigin, uZAxis);
  vTie = floor(fract(id * 0.6180339) * 24.0);
#ifdef REVZ
  // A reversed depth buffer in floating point (index.ts): depth is relatively as fine near as far,
  // and the coplanar tie-break is relative too: each ink id a few float steps nearer the eye.
  gl_Position.z += vTie * uZStep * gl_Position.z;
#endif
  return;
#endif
  // The same depth as the matrices give (the camera is orthographic), but measured from the target
  // rather than from the eye 200 units away, where a float's rounding is a whole step of the depth
  // buffer: two surfaces in one plane then come out equal, not a step apart one way or the other.
  gl_Position.z = dot(p - uZOrigin, uZAxis) * gl_Position.w;
  // Two surfaces in the same plane (a coping flush with a wall top, a floor laid on a terrace) would
  // otherwise trade pixels as the view turns, and where their ink ids differ every traded pixel draws
  // a seam: a scribble that flickers over the face. Each ink id is nudged toward the eye by its own
  // few depth steps (index.ts, Z_STEP), so one of the two always wins, whichever way the camera looks.
  gl_Position.z -= floor(fract(id * 0.6180339) * 24.0) * uZStep * gl_Position.w;
}
`;

export const surfaceFragment = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

in vec3 vW;
in vec3 vN;
in vec3 vVN;
in vec3 vCol;
in float vEdge;
flat in vec4 vParams;
flat in float vPat;
flat in vec2 vId;
flat in vec3 vOrigin;
flat in float vCut;
#ifdef PERSP
in float vLin;
flat in float vTie;
uniform float uFocal;     // CSS pixels per world unit at a distance of one
uniform vec2 uClip;       // near, far
uniform float uZStep;
uniform vec3 uZOrigin;    // the eye
#endif

uniform vec3 uLight;
uniform float uSlab;      // the slab's corner radius: the map's edge is a rounded square
uniform float uTime;
uniform float uPx;        // device pixels per world unit in the render target
uniform float uCss;       // CSS pixels per world unit
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uPencil;
uniform float uHatch;
uniform float uHatchSpacing;
uniform float uGlow;      // 0 by day to 1 at night
// Palette colours the patterns need (linear).
uniform vec3 uInk;
uniform vec3 uSand;
uniform vec3 uDirt;
uniform vec3 uSea;
uniform vec3 uSeaDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSeaKeep;    // multiplies the sea: undoes most of a warm tint's pull toward grey
uniform float uSeaY;      // the waterline
uniform vec3 uWhite;
uniform vec3 uTimber;
uniform vec3 uLamp;
uniform vec3 uFlowerA;
uniform vec3 uFlowerB;
uniform vec3 uFlowerC;
// Grounding (shaders/ground.ts): the town's heights seen from above, and the shade baked from them.
uniform sampler2D tHeight;
uniform sampler2D tShade;
uniform vec4 uMap;        // x0, z0, 1 / size, top
uniform float uMapRange;
uniform float uGround;    // strength of the whole effect
uniform float uSlope;     // how steeply the light falls: lower is a longer cast shadow
uniform float uCast;      // strength of the cast shadow

#if defined(OVERLAY) || defined(GHOST)
uniform sampler2D tDepth;
uniform vec2 uCanvas;
uniform vec3 uStar;
uniform vec3 uMagic;
uniform vec3 uRed;
uniform vec3 uTint;
uniform vec3 uLift;
#endif
#ifdef OVERLAY
out vec4 oColor;
#else
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oId;
#endif

${NOISE}
${COLOR}

// The scale of the page at this fragment. The orbit camera has one for the whole picture; the fly
// camera's falls off with distance, so patterns, hatching and fading follow each surface's own size on screen.
#ifdef PERSP
float cssNow = 1.0;
float pxNow = 1.0;
#define CSS cssNow
#define PX pxNow
#else
#define CSS uCss
#define PX uPx
#endif

float heightOver(vec2 xz){ return uMap.w - texture(tHeight, (xz - uMap.xy) * uMap.z).x * uMapRange; }

// How much this point is grounded: 0 open, toward 1 in the deepest contact shade. The lookups are
// nudged by a slow noise, so the edge of the shade wanders like a pencilled one instead of being ruled.
float grounding(vec3 n){
  if (uGround <= 0.0) return 0.0;
  vec2 xz = vW.xz + (vec2(n2(vW.xz * 2.3), n2(vW.xz * 2.3 + 9.0)) - 0.5) * 0.09;
  if (n.y > 0.5) {
    vec4 sh = texture(tShade, (xz - uMap.xy) * uMap.z);
    float contact = smoothstep(0.06, 0.45, sh.r) * 0.72;
    float thrown = smoothstep(uSlope - 0.1, uSlope + 0.1, sh.g * 3.0) * uCast;
    float cover = smoothstep(0.22, 0.5, heightOver(xz) - vW.y) * 0.8;       // under a crown, an arch, a deck
    return max(max(contact, thrown), cover);
  }
  if (abs(n.y) < 0.5 && length(n.xz) > 0.1) {
    vec2 away = normalize(n.xz);
    float up = vW.y - heightOver(xz + away * 0.27);                          // height above the ground at the wall's foot
    float foot = (1.0 - smoothstep(0.0, 0.26, up)) * step(-0.04, up) * 0.7;
    float under = heightOver(vW.xz + away * 0.05) - vW.y;                    // just under an eave or a ledge
    float eave = (1.0 - smoothstep(0.02, 0.2, under)) * step(0.025, under) * 0.7;
    return max(foot, eave);
  }
  return 0.0;
}

// One layer of pencil strokes on a surface. p is a position in the surface's own plane (world
// units) and dir the direction the strokes run in that plane, so the strokes belong to the surface
// and do not slide over it when the view moves. Their spacing on the page still stays near
// uHatchSpacing at every zoom: each time the zoom doubles the spacing halves, and the new strokes
// fade in between the old ones, which stay exactly where they were.
float hatchLayer(vec2 p, vec2 dir, float seed){
  float lod = log2(max(CSS, 1.0) / 32.0);
  float o = floor(lod), fr = lod - o, scr = exp2(fr);
  vec2 q = p * (32.0 * exp2(o) / uHatchSpacing);          // in stroke spacings
  float hv = dot(q, vec2(-dir.y, dir.x)) + (mix(n2(q * 0.16 + seed), n2(q * 0.32 + seed), fr) - 0.5) * 1.1 / scr;
  float ha = dot(q, dir);
  float d = abs(fract(hv) - 0.5);
  float stroke = 1.0 - smoothstep(0.14 / scr, 0.36 / scr, d);
  float between = (1.0 - smoothstep(0.14 / scr, 0.36 / scr, 0.5 - d)) * smoothstep(0.1, 0.9, fr);
  // The pencil lifts here and there: patches of strokes, not a ruled screen.
  float lifted = mix(n2(vec2(hv * 0.9 + seed, ha * 0.2)), n2(vec2(hv * 1.8 + seed, ha * 0.4)), fr);
  return max(stroke, between) * smoothstep(0.3, 0.62, lifted);
}

// One layer of wave marks on the water: a short dash along r (level on the page) in a cell of the
// water C wide in the world, its centre moved by up to j. Only the cell the point is in is read: a
// dash reaches no more than its taper's length past the cell (one cell is a quarter of the cost of
// four, over the whole sea).
float waveMarks(vec2 p, vec2 r, float C, float j, float seed, float lenA, float lenB, float taper,
                float wFreq, float wAmp, float wSpeed, float lifeSpeed, float keep, float w, float fw){
  vec2 id = floor(p / C);
  float rr = h1(id + seed);
  if (rr < keep) return 0.0;
  vec2 d = p - (id + 0.5) * C - (vec2(h1(id + seed + 1.7), h1(id + seed + 5.3)) - 0.5) * 2.0 * j;
  vec2 lp = vec2(dot(d, r), dot(d, vec2(-r.y, r.x)));
  float len = lenA + rr * lenB;
  float wav = sin(lp.x * wFreq + rr * 6.0 + uTime * wSpeed) * wAmp;
  float life = 0.5 + 0.5 * sin(uTime * lifeSpeed + rr * 40.0);
  return (1.0 - smoothstep(w - fw, w + fw, abs(lp.y - wav))) * smoothstep(len, len - taper, abs(lp.x)) * smoothstep(0.25, 0.7, life);
}

float lineAA(float d, float w){ float fw = fwidth(d) * 1.2; return 1.0 - smoothstep(w - fw, w + fw, d); }
float fadeAt(float period);

// Earth: speckles and strata. Returns the toned colour; the pencil marks come back in pen.
vec3 earthLook(vec3 c, out float pen){
  vec2 p = vec2(vW.x + vW.z, vW.y) * vec2(5.0, 7.0); vec2 ci = floor(p); vec2 f = fract(p) - 0.5;
  float r = h1(ci);
  pen = lineAA(length(f - (vec2(h1(ci + 2.0), h1(ci + 9.0)) - 0.5) * 0.6), 0.07) * step(0.62, r) * 0.35 * fadeAt(0.14);
  pen += lineAA(abs(fract(vW.y * 2.2 + sin((vW.x + vW.z) * 1.3) * 0.08) - 0.5), 0.012) * 0.25;
  return c * (0.97 + 0.06 * n2(vec2(vW.x + vW.z, vW.y * 3.0)));
}

// Rock. Everything is a function of the world position alone (no "along the wall" coordinate), so
// beds and cracks carry on unbroken round the curve of a cliff.
vec3 rockLook(vec3 c, bool top, out float pen){
  if (top) {
    // a flat of bare rock: blotchy, with a few wandering cracks
    vec2 p = vW.xz;
    c *= 0.95 + 0.1 * n2(p * 1.3);
    float v = abs(fract(p.x * 0.7 + p.y * 0.45 + n2(p * 0.9) * 1.4) - 0.5);
    pen = lineAA(v, 0.012) * smoothstep(0.45, 0.7, n2(p * 0.5 + 7.0)) * 0.3 * fadeAt(0.5);
    return c;
  }
  // Beds: tilted a few degrees, sagging a little, each of its own thickness and tone.
  float bed = vW.y * 2.2 + vW.x * 0.15 + vW.z * 0.1 + 0.4 * n2(vec2(vW.x + vW.z * 0.7, vW.y * 0.6) * 0.5);
  bed += 0.5 * n2(vec2(bed * 0.85, 3.7));
  float row = floor(bed), f = fract(bed);
  c *= 0.925 + 0.12 * h1(vec2(row, 5.0));
  c *= 1.0 - 0.06 * smoothstep(0.7, 1.0, f);                       // each bed darkens toward its underside
  c *= 0.97 + 0.06 * n2(vec2(vW.x * 0.8 + vW.z, vW.y * 2.0) * 1.6);
  float ax = vW.x * 0.83 + vW.z * 0.61;                            // runs along any face
  float lifted = smoothstep(0.3, 0.5, n2(vec2(ax * 0.9 + row * 3.1, row * 1.7)));   // the pencil lifts along a bed line
  float line = lineAA(0.5 - abs(f - 0.5), 0.02) * lifted;
  // Cracks: three or four to a face, each wandering down part of it.
  float cx = ax * 0.72;
  float ci = floor(cx), cr = h1(vec2(ci, 9.0));
  float wob = (n2(vec2(vW.y * 1.6 + ci * 5.0, ci)) - 0.5) * 0.34 + (n2(vec2(vW.y * 6.0, ci * 3.0)) - 0.5) * 0.07 + (cr - 0.5) * 0.3;
  float d = abs(fract(cx) - 0.5 - wob) / 0.72;
  float fwc = fwidth(cx) / 0.72 * 1.2 + 1e-4;                      // from the unbroken coordinate: no hairline between cells
  float reach = smoothstep(0.34, 0.52, n2(vec2(ci * 7.0, vW.y * 0.5 + cr * 9.0)));
  float crack = (1.0 - smoothstep(0.017 - fwc, 0.017 + fwc, d)) * step(0.28, cr) * reach;
  // and a short scratch here and there off a bed line
  vec2 sp = vec2(ax * 2.3, bed * 1.0); vec2 si = floor(sp); vec2 sf = fract(sp) - 0.5;
  float scratch = lineAA(abs(sf.x * 0.5 + sf.y * 0.25), 0.02) * step(abs(sf.y), 0.32) * step(0.8, h1(si + 3.0));
  pen = max(max(line * 0.4, crack * 0.5), scratch * 0.26 * fadeAt(0.3)) * fadeAt(0.25);
  return c;
}
float band(float d, float w){ float fw = fwidth(d) * 1.2; return 1.0 - smoothstep(w - fw, w + fw, abs(d)); }
// Marks whose period shrinks to a couple of pixels fade out instead of turning to noise.
float fade(float period){ return clamp((period * PX - 2.5) / 4.0, 0.0, 1.0); }
float fadeAt(float period){ return fade(period); }

// The stepped tone for a normal: 1 lit, down to 0.66 facing away.
float toneOf(vec3 n){
  float d = dot(n, uLight);
  return d > 0.75 ? 1.0 : (d > 0.35 ? 0.9 : (d > -0.1 ? 0.79 : (d > -0.42 ? 0.71 : 0.66)));
}
vec3 shade(vec3 c, float s){
  // Shadows drift slightly cool and violet rather than just darker: it reads as paint, not plastic.
  return c * s * mix(vec3(1.0), vec3(0.93, 0.92, 1.06), (1.0 - s) * 3.0);
}
${SEASON_FRAGMENT}

/** Signed distance from the map's edge (a rounded square 48 across): negative inside, positive beyond. */
float mapEdge(vec2 p) {
  vec2 q = abs(p - vec2(24.0)) - vec2(24.0 - uSlab);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uSlab;
}

void main(){
#ifdef PERSP
  cssNow = uFocal / max(vLin, 1e-3);
  pxNow = cssNow * uPx;   // uPx is the target's device pixels per CSS pixel here
#ifndef REVZ
  // Without a reversed float depth buffer (no EXT_clip_control): depth is the distance along the view,
  // straight, written here, so the near plane can sit at arm's length without costing the far town its
  // precision; the coplanar tie-break is the orbit camera's. It costs the early depth test.
  float lin01 = (vLin - uClip.x) / (uClip.y - uClip.x);
  gl_FragDepth = clamp(lin01 - vTie * uZStep * 0.5, 0.0, 1.0);
#endif
#ifdef NEAR_FADE
  // Things that move (people, birds) are gone when within arm's length, so nobody flies through the
  // flyer's face. They go over a few centimetres (a quick stipple as they cross the line, never a
  // standing one). uZOrigin is the eye; vOrigin the thing's own origin.
  {
    float away = length(vOrigin.xz - uZOrigin.xz);
    float keep = smoothstep(0.27, 0.31, away) + step(0.9, abs(vOrigin.y + 0.25 - uZOrigin.y));
    vec2 q = floor(gl_FragCoord.xy);
    float dither = fract(dot(q, vec2(0.7548777, 0.5698403)));
    if (keep < 1.0 && dither > keep) discard;
  }
#endif
#endif
#if defined(EDGECUT)
  // The edge of the map is a wall: what crosses it is cut off there, bow first, and shown again bow first.
  if (vCut > 0.5 && mapEdge(vW.xz) > 0.0) discard;
  // And the sea is a floor they pass through: nothing that moves on the water is drawn below its surface
  // (the sea is opaque, so this hides nothing that could be seen; but a ship going down, a capsized boat or a
  // wreck sinking near the slab's edge would otherwise show through it and hang under the map).
  if (vCut > 0.5 && vW.y < uSeaY - 0.015) discard;
#endif
#if defined(CAP)
  // The cut face of a ship crossing the edge: its back faces, seen through the cut, drawn as a flat dark
  // section, with its own ink id so the pen draws a line round the cut.
  oColor = vec4(toSrgb(mix(vCol * 0.32, uInk, 0.35)), 0.0);
  oId = vec4(0.5, 0.5, vId.y, 1.0 - vId.x);
  return;
#endif
  vec3 n = normalize(vN);
  int pat = int(vPat + 0.5);
  float s = toneOf(n);
  bool top = n.y > 0.9;
  bool side = abs(n.y) < 0.5;
  // The horizontal direction along this face, and the coordinate along it.
  vec2 tang = length(n.xz) > 0.05 ? normalize(vec2(-n.z, n.x)) : vec2(1.0, 0.0);
  float along = abs(n.x) > abs(n.z) ? vW.z : vW.x;
  if (!side && !top) along = dot(vW.xz, tang);
  vec2 wall = vec2(along, vW.y);

  vec3 base = vCol;
  float pen = 0.0;      // pencil mark, drawn toward the ink colour
  float glow = 0.0;     // self-lit amount, kept out of the night grade
  float hatchable = 1.0;
  vec3 col;

#if defined(OVERLAY)
  // A shaft of light, drawn over the finished page: edge runs 0 at the source to 1 at the tip.
#if defined(PERSP) && defined(REVZ)
  // (Relative: a thousandth of the distance, the orbit camera's allowance at about ten units.)
  if (gl_FragCoord.z < texture(tDepth, gl_FragCoord.xy / uCanvas).x * 0.999) discard;
#elif defined(PERSP)
  if (lin01 > texture(tDepth, gl_FragCoord.xy / uCanvas).x + 0.00003) discard;
#else
  if (gl_FragCoord.z > texture(tDepth, gl_FragCoord.xy / uCanvas).x + 0.00003) discard;
  // A soft patch lying flat (a cloud's shadow, param d below) leaves no depth behind. Two clouds' shadows
  // lie in one plane, and where they cross each would otherwise hide the other wherever its own triangles
  // (a fan of twenty) round a hair nearer: a dark star of streaks over the sea that flickers as they drift.
  // Written as the far plane it passes the overlay's depth test wherever nothing nearer has been drawn,
  // as before, and never stops another from drawing. Puffs and beams keep their depth.
  gl_FragDepth = pat == 28 && vParams.w > 0.0 ? 1.0 : gl_FragCoord.z;
#endif
  vec3 vn = normalize(vVN);
  if (pat == 28) {
    // Mist (smoke, cloud): a watercolour wash, thick where the puff faces you and thinning to
    // nothing at its rim, so it has no edge to ink; a slow grain breaks it up like pigment on paper.
    // Graded like the page (it is drawn after the grade). Param a is its opacity.
#ifdef PERSP
    // Fly mode: the page's own pixels (the scale of the page changes across a puff seen in perspective).
    vec2 spx = gl_FragCoord.xy / uPx;
#else
    vec2 spx = vec2(dot(vW, uCamRight), dot(vW, uCamUp)) * CSS;
#endif
    float face = smoothstep(0.0, 0.5, abs(vn.z));
    // Param d > 0: a soft round patch lying flat (a cloud's shadow), d its radius in world units.
    // It has no flat middle: it fades from its centre all the way out, so it reads as a passing shade.
    if (vParams.w > 0.0) face = 1.0 - smoothstep(0.0, 1.0, length(vW.xz - vOrigin.xz) / vParams.w);
#ifdef PERSP
    // In perspective a cloud's shadow is what it is, a sheet hanging in the air (from below a dark
    // shape in the sky, from above a smudge floating over the town): it is not drawn.
    if (vParams.w > 0.0) discard;
#endif
    float grain = 0.8 + 0.2 * n2(spx * 0.09 + vParams.y * 17.0) + 0.1 * (n2(spx * 0.33) - 0.5);
    float a = clamp(max(vParams.x, 0.0) * face * grain, 0.0, 1.0);
    vec3 c = toSrgb(base) * uTint + uLift;
    // A cloud's shadow darkens what it falls on and cools it a little, keeping each surface's own
    // colour (warm stone stays warm stone): nearly black, so the wash scales the page down rather
    // than mixing grey into it.
    if (vParams.w > 0.0) c = toSrgb(base) * uTint * 0.18;
    // Param c > 0.5: a cloud, whose wash is edged with a soft graphite line where it thins.
    if (vParams.z > 0.5 && vParams.w <= 0.0) {
      float rim = smoothstep(0.04, 0.16, face) * (1.0 - smoothstep(0.18, 0.42, face));
      float line = rim * (0.55 + 0.45 * n2(spx * 0.05 + 3.0));
      c = mix(c, toSrgb(uInk) * uTint, line * 0.55);
      a = max(a, line * 0.5 * max(vParams.x, 0.0) * 1.6);
    }
    oColor = vec4(c * a, a);
  } else if (vParams.w < -0.5) {
    // A tractor beam (the UFO, param d = -1): a wash of turquoise light painted over the finished page,
    // ink and all, as the mist is (no pen line of its own, the paper's grain through it). Its vertex colour
    // is not a colour but where the fragment is: param c < 0.5, the beam, a flat shape the UFO turns to
    // face the camera, r across it (0 one edge, 1 the other) and g down it (0 at the hatch, 1 at the
    // ground); param c >= 0.5, the pool of light on the ground, r out from its middle (1 at its outer
    // edge). Param a is how far on it is, b the phase of the bands travelling along it; c 0.25 leaves
    // the sparkles out (a weak device). By day a pale, see-through wash that also lifts what is under
    // it (the town's ink turns a pale turquoise line, not black); at night it glows and lights the page.
#ifdef PERSP
    vec2 spx = gl_FragCoord.xy / uPx;
#else
    vec2 spx = vec2(dot(vW, uCamRight), dot(vW, uCamUp)) * CSS;
#endif
    float grain = 0.8 + 0.2 * n2(spx * 0.09) + 0.12 * (n2(spx * 0.31) - 0.5);
    vec3 tint = vec3(0.13, 0.8, 0.78), pale = vec3(0.78, 1.0, 0.97);
    float m = clamp(vParams.x, 0.0, 1.0);
    float a, lift, add;
    vec3 c;
    if (vParams.z < 0.5) {
      float u = vCol.r * 2.0 - 1.0, g = clamp(vCol.g, 0.0, 1.0);
      // Its edges drawn by hand: they waver a little down their length (and drift slowly).
      float wob = 0.09 * (n2(vec2(spx.y * 0.035, uTime * 0.35)) - 0.5) + 0.05 * (n2(vec2(spx.y * 0.11, 7.0 + u)) - 0.5);
      float x = abs(u) / 0.86 + wob;
      float body = 1.0 - smoothstep(0.7, 1.0, x);
      // Brighter soft walls (you look through more of it there) and a soft core.
      float walls = smoothstep(0.35, 0.85, x) * body;
      float core = exp(-x * x * 5.0);
      // Strong under the hatch, thinning toward the ground; melting into the pool at its foot.
      float along = mix(1.0, 0.52, smoothstep(0.0, 1.0, g)) * (1.0 - 0.6 * smoothstep(0.86, 1.0, g));
      // Bands of slightly deeper turquoise travelling along it, curved like rings seen from above.
      float gg = fract(g * 4.0 + vParams.y + 0.05 * sqrt(max(0.0, 1.0 - u * u)));
      float band = smoothstep(0.0, 0.05, gg) * (1.0 - smoothstep(0.06, 0.2, gg)) * body;
      float wash = body * along * (0.55 + 0.25 * core + 0.35 * walls);
      // A little more body than at first (Derek, 2026-11-25: "slightly more opaque, it's a bit thin").
      a = m * grain * (wash * 0.66 + band * 0.14);
      c = mix(pale, tint, 0.72 + 0.25 * band + 0.03 * walls);
      lift = m * wash * 0.1;
      add = m * wash * (0.04 + 0.5 * uGlow) * grain;
      // Sparkles: small soft glints rising in it (page pixels, so the same size at every zoom).
      if (vParams.z < 0.1) {
        vec2 q = vec2(spx.x, spx.y - uTime * 26.0) / 13.0;
        vec2 cell = floor(q), f = fract(q) - 0.5;
        float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 at = vec2(fract(h * 7.13), fract(h * 3.71)) - 0.5;
        float d = length(f - at * 0.6) * 13.0;
        float tw = 0.5 + 0.5 * sin(uTime * 6.0 + h * 40.0);
        add += m * body * along * step(0.72, h) * (1.0 - smoothstep(0.4, 1.8, d)) * tw * (0.5 + 0.6 * uGlow);
      }
    } else {
      // The pool: a soft glow fading out from its middle, a pale soft rim (pulsing a little) where the
      // beam's foot meets the ground, the whole edge wavering by hand.
      float r = clamp(vCol.r, 0.0, 1.0) * 1.6 + 0.07 * (n2(spx * 0.045 + 5.0) - 0.5);
      float glow = 1.0 - smoothstep(0.15, 1.35, r);
      float ring = exp(-pow((r - 1.0 - 0.04 * sin(uTime * 7.0)) / 0.09, 2.0));
      a = m * grain * (0.38 * glow + 0.18 * ring);
      c = mix(tint, pale, 0.45 + 0.5 * ring);
      lift = m * (0.12 * glow + 0.12 * ring);
      add = m * (glow * 0.7 + ring * 0.5) * (0.03 + 0.55 * uGlow);
    }
    a = clamp(a, 0.0, 0.7);
    oColor = vec4(c * a + pale * lift + tint * add + vec3(add * 0.35), a);
  } else {
    // A shaft of light. Seen end on (pointing at you) its walls are edge-on: it fades away there,
    // instead of laying a flat sheet of light over the lighthouse it comes out of.
    float side = smoothstep(0.15, 0.55, abs(vn.z));
    {
      // Turned toward you, the shaft runs down over the tower it stands on: there it fades in only
      // well clear of the lantern on the page. Seen across, it starts at the lamp.
      vec3 off = vW - vOrigin;
      float onPage = length(vec2(dot(off, uCamRight), dot(off, uCamUp)));
      float across = onPage / max(length(off), 1e-3);
      side *= mix(smoothstep(0.2, 4.5, onPage), 1.0, smoothstep(0.62, 0.95, across));
    }
    float a = pow(clamp(1.0 - vEdge, 0.0, 1.0), 1.4) * (0.10 + 0.42 * uGlow) * max(vParams.x, 0.0) * side;
    oColor = vec4(uStar * a, 0.0);
  }
#elif defined(GHOST)
  // The ghost preview, into a buffer of its own (colour with its opacity, and normal + ink id), which
  // the ghost composite then outlines in pencil. Anything hidden behind the finished drawing is left out.
  if (gl_FragCoord.z > texture(tDepth, gl_FragCoord.xy / uCanvas).x + 0.00003) discard;
  vec2 spx = vec2(dot(vW, uCamRight), dot(vW, uCamUp)) * CSS;
  vec4 fill;
  if (vParams.z > 1.5) {            // an illegal target
    fill = vec4(uRed, 0.88);
  } else if (vParams.z > 0.5) {     // an Auto neighbour that would change: a travelling glint
    float g = smoothstep(0.7, 1.0, sin((spx.x + spx.y) * 0.07 - uTime * 5.0));
    fill = vec4(mix(uMagic, vec3(1.0), g * 0.6), 0.16 + 0.4 * g);
  } else {
    // The piece itself as a wash of its own colours, thinned with white and laid in loose strokes.
    vec3 g = mix(toSrgb(shade(base, s)), vec3(1.0), 0.42);
    float strokes = smoothstep(0.28, 0.5, abs(fract((spx.x - spx.y) / 6.0 + n2(spx * 0.05) * 0.6) - 0.5));
    fill = vec4(g, 0.3 + 0.24 * strokes);
  }
  oColor = fill;
  oId = vec4(normalize(vVN).xy * 0.5 + 0.5, vId);
#else
#ifdef BARE
  if (bareCut()) discard;   // Seasons: a broadleaf losing its leaves
#endif

  if ((pat == 11 || pat == 40) && top) {
    // ── water: flat colour, deeper patches, a pale shallow band, little wave marks, foam at the shore.
    //    Pattern 40 is river water (src/gen/terrain): the vertex colour carries how much river it is (r,
    //    0 out at sea to 1 in the channel) and the way it flows (g, b), not a colour.
    hatchable = 0.0;
    float riv = 0.0;
    vec2 flow = vec2(1.0, 0.0);
    if (pat == 40) {
      vec3 raw = pow(max(vCol, vec3(0.0)), vec3(1.0 / 2.2));
      riv = clamp(raw.r, 0.0, 1.0);
      vec2 fd = raw.gb * 2.0 - 1.0;
      flow = length(fd) > 0.08 ? normalize(fd) : vec2(1.0, 0.0);
    }
    float inRiver = smoothstep(0.55, 0.95, riv);   // the channel itself
    float fan = riv * (1.0 - inRiver);              // the shallows off the mouth
    vec3 c = uSea;
    float m = n2(vW.xz * 0.32 + vec2(uTime * 0.03, 0.0));
    c = mix(c, uSeaDeep, smoothstep(0.5, 0.8, m) * 0.45);
    // A river is a touch greener and deeper than the sea, with a darker thread down the middle.
    c = mix(c, uSeaDeep * vec3(0.66, 0.9, 0.76), inRiver * 0.85);
    float sd = vEdge + (n2(vW.xz * 2.3 + uTime * 0.05) - 0.5) * 0.09;
    // Round the island the water pales in two steps, like the contours of a chart: a wide lazy
    // shelf with a pencilled edge, then the pale shallows at the shore itself. Not in a river.
    float sd2 = vEdge + (n2(vW.xz * 0.8 + 4.0) - 0.5) * 0.6 + (n2(vW.xz * 3.1) - 0.5) * 0.1;
    float fw2 = max(fwidth(sd2), 1e-4);
    float chart = 1.0 - inRiver;
    c = mix(c, uShallow, (1.0 - smoothstep(1.3 - fw2, 1.3 + fw2, sd2)) * 0.3 * chart);
    c = mix(c, uSeaDeep, (1.0 - smoothstep(0.5, 1.5, abs(sd2 - 1.3) / fw2)) * 0.55 * step(vEdge, 3.0) * chart);
    // The pale shallows: a narrow band along a river's banks, a fan of them off its mouth.
    c = mix(c, uShallow, (1.0 - smoothstep(0.0, mix(0.62, 0.2, inRiver), sd)) * 0.7);
    c = mix(c, uShallow, fan * 0.45 * (0.8 + 0.2 * n2(vW.xz * 1.4)));
    c *= uSeaKeep;       // the sea keeps its blue through a warm dusk (index.ts)
    // Wave marks lie level on the page whichever way the island is turned, each at its own place on
    // the water (waveMarks), so turning the view turns no mark out of its place.
    vec2 r2 = normalize(uCamRight.xz);
    float fwq = fwidth(dot(vW.xz, vec2(-r2.y, r2.x))) * 1.2;   // from the unbroken coordinate: no hairline between cells
    float open = smoothstep(0.25, 0.5, sd) * (1.0 - inRiver);
    // Each layer is read only where it shows: near the shore neither, and at most zooms only one.
    float near = fade(0.2) * open;
    if (near > 0.0) c = mix(c, uFoam, waveMarks(vW.xz - uTime * 0.07, r2, 0.55, 0.1, 0.0, 0.11, 0.08, 0.05, 26.0, 0.014, 1.5, 0.7, 0.45, 0.011, fwq) * 0.85 * near);
    // Seen from far off the small marks are too fine to draw, so longer, lazier swells take over.
    float far = (1.0 - fade(0.2)) * open;
    if (far > 0.0) c = mix(c, uFoam, waveMarks(vW.xz - uTime * 0.155, r2, 1.9, 0.12, 31.0, 0.4, 0.4, 0.2, 5.5, 0.05, 0.9, 0.45, 0.34, max(0.03, 0.75 / PX), fwq) * 0.7 * far);
    if (riv > 0.0) {
      // Flow marks: the same hand as the wave marks, laid along the current and drifting down it, each at
      // its own place on the water. Long and close in the channel; seen from far off, fewer and bolder.
      float fwf = fwidth(dot(vW.xz, vec2(-flow.y, flow.x))) * 1.2;
      float wet = smoothstep(0.12, 0.3, sd) * riv;
      float fm = waveMarks(vW.xz - flow * uTime * 0.22, flow, 0.42, 0.09, 53.0, 0.12, 0.12, 0.06, 14.0, 0.012, 1.1, 0.8, 0.4, 0.011, fwf) * fade(0.2)
               + waveMarks(vW.xz - flow * uTime * 0.3, flow, 1.1, 0.14, 71.0, 0.32, 0.3, 0.14, 4.0, 0.03, 0.8, 0.5, 0.45, max(0.026, 0.8 / PX), fwf) * (1.0 - fade(0.2));
      c = mix(c, uFoam, clamp(fm, 0.0, 1.0) * 0.8 * wet);
      // and the water catches the light down the middle of the channel
      c = mix(c, uShallow, smoothstep(0.35, 0.75, sd) * inRiver * 0.16 * (0.6 + 0.4 * n2(vW.xz * 0.9 - flow * uTime * 0.1)));
    }
    float rw = max(0.024, 0.9 / PX);     // the foam line never thins below a pixel
    float ring1 = band(sd - 0.1 - 0.035 * sin(uTime * 1.1), rw);
    float ring2 = band(sd - 0.34 - 0.06 * sin(uTime * 1.1 + 1.4), 0.014) * step(0.42, n2(vW.xz * 2.5 + uTime * 0.2)) * fade(0.12) * (1.0 - inRiver);
    c = mix(c, uFoam, clamp(ring1 * 0.95 + ring2 * 0.7, 0.0, 1.0));
    // Seasons: winter's grey sea, ice, rain rings.
    if (uSeasonOn > 0.5) c = seasonWater(c, sd, riv, pat == 11 && vW.y > uSeaY + 0.05, pen);
    // Things standing in the water (a dock, a hull) darken it a little where they meet it.
    c *= mix(vec3(1.0), vec3(0.8, 0.84, 0.93), grounding(n) * uGround * smoothstep(0.15, 0.4, sd));
    col = c;
  } else {
    col = shade(base, s);

    if (pat == 1) {
      if (top) {
        // ── grass: ticks, the odd tuft and flower, soft uneven tone. Terrain passes "distance from sand"
        //    in edge (0 sand to 1 grass; anything else leaves it at EDGE_FAR), so beaches get a drawn border.
        float sandy = 0.0;
        if (vEdge < 1.5) {
          float e = vEdge + (n2(vW.xz * 1.9) - 0.5) * 0.55 + (n2(vW.xz * 6.3) - 0.5) * 0.14;
          float fw = max(fwidth(e), 1e-4);
          sandy = 1.0 - smoothstep(0.5 - fw, 0.5 + fw, e);
          pen += (1.0 - smoothstep(0.7, 1.6, abs(e - 0.5) / fw)) * 0.32;
        }
        vec3 grass = col * (0.965 + 0.07 * n2(vW.xz * 0.45 + 3.0));
        // Meadow: wide patches of longer, deeper grass with a wandering edge, so open ground is not one flat green.
        float meadow = n2(vW.xz * 0.21 + 13.0) + (n2(vW.xz * 1.7 + 5.0) - 0.5) * 0.16;
        float mfw = max(fwidth(meadow), 1e-4);
        float deep = smoothstep(0.56 - mfw, 0.56 + mfw, meadow);
        grass *= mix(vec3(1.0), vec3(0.93, 0.965, 0.9), deep);
        grass = mix(grass, grass * vec3(0.78, 0.88, 0.74), (1.0 - smoothstep(0.6, 1.6, abs(meadow - 0.56) / mfw)) * 0.5);
        vec2 p = vW.xz * 3.6; vec2 c = floor(p); vec2 f = fract(p) - 0.5;
        float r = h1(c);
        f -= (vec2(h1(c + 3.1), h1(c + 7.7)) - 0.5) * 0.5;
        vec2 dir = normalize(vec2(1.0, -1.0) + (r - 0.5) * 1.1);
        float t = clamp(dot(f, dir), -0.15, 0.15);
        float m = lineAA(length(f - dir * t), 0.042) * step(0.34, r);
        // a second, sparser layer: two-stroke tufts
        vec2 p2 = vW.xz * 1.7 + 5.3; vec2 c2 = floor(p2); vec2 f2 = fract(p2) - 0.5;
        float r2 = h1(c2 + 11.0);
        f2 -= (vec2(h1(c2 + 2.3), h1(c2 + 8.9)) - 0.5) * 0.6;
        vec2 d1 = normalize(vec2(0.55, -1.0)), d2 = normalize(vec2(1.0, -0.4));
        float tuft = max(lineAA(length(f2 - d1 * clamp(dot(f2, d1), 0.0, 0.1)), 0.016), lineAA(length(f2 - d2 * clamp(dot(f2, d2), 0.0, 0.085)), 0.016)) * step(0.5, r2);
        grass = mix(grass, grass * vec3(0.54, 0.73, 0.5), max(m * fade(0.28), tuft * fade(0.5)));
        if (uSeasonOn > 0.5) grass = seasonGrass(grass);   // Seasons
        // flowers: rare specks of palette colour
        vec2 p3 = vW.xz * 2.3 + 1.7; vec2 c3 = floor(p3); vec2 f3 = fract(p3) - 0.5;
        float r3 = h1(c3 + 4.0);
        f3 -= (vec2(h1(c3 + 6.1), h1(c3 + 9.7)) - 0.5) * 0.7;
        float dotm = lineAA(length(f3), 0.085) * step(0.93, r3) * fade(0.2);
        vec3 fl = r3 > 0.977 ? uFlowerA : (r3 > 0.953 ? uFlowerB : uFlowerC);
        grass = mix(grass, fl, dotm);
        // From far off single flowers vanish, so they gather into drifts: looser, bigger specks where a slow noise says so.
        float drift = smoothstep(0.55, 0.75, n2(vW.xz * 0.33 + 41.0));
        vec2 p4 = vW.xz * 1.15 + 7.3; vec2 c4 = floor(p4); vec2 f4 = fract(p4) - 0.5;
        float r4 = h1(c4 + 17.0);
        f4 -= (vec2(h1(c4 + 3.3), h1(c4 + 8.1)) - 0.5) * 0.7;
        float speck = lineAA(length(f4), max(0.07, 1.25 / PX)) * step(1.0 - 0.55 * drift, r4) * (1.0 - fade(0.2)) * (1.0 - sandy);
        grass = mix(grass, r4 > 0.85 ? uFlowerA : (r4 > 0.7 ? uFlowerB : uFlowerC), speck * 0.8);
        // ... and the deeper meadow carries a few darker tussocks.
        vec2 p5 = vW.xz * 0.9 + 3.1; vec2 c5 = floor(p5); vec2 f5 = fract(p5) - 0.5;
        f5 -= (vec2(h1(c5 + 5.3), h1(c5 + 1.1)) - 0.5) * 0.7;
        float tussock = lineAA(length(f5 * vec2(1.0, 1.7)), max(0.09, 1.4 / PX)) * step(0.62, h1(c5 + 23.0)) * deep * (1.0 - fade(0.3));
        grass = mix(grass, grass * vec3(0.8, 0.9, 0.76), tussock * 0.8);
        // sand: stipple
        vec3 sand = shade(uSand, s) * (0.975 + 0.05 * n2(vW.xz * 0.7));
        vec2 ps = vW.xz * 9.0; vec2 cs = floor(ps); vec2 fs = fract(ps) - 0.5;
        float rs = h1(cs);
        float st = lineAA(length(fs - (vec2(h1(cs + 2.0), h1(cs + 9.0)) - 0.5) * 0.6), 0.09) * step(0.74, rs);
        pen += st * 0.3 * fade(0.11) * sandy;
        col = mix(grass, sand, sandy);
      } else {
        col *= 0.97 + 0.05 * n2(wall * 3.0);
      }
    } else if (pat == 2) {
      // ── shingles: rows down the slope, short joints, each shingle a hair different
      if (n.y > 0.15 && n.y < 0.985) {
        float y = vW.y * 11.0;
        float row = floor(y);
        float x = dot(vW.xz, tang) * 6.0 + row * 0.5 + h1(vec2(row, 1.0)) * 0.3;
        col *= 0.955 + 0.09 * h1(vec2(floor(x), row));
        pen = lineAA(abs(fract(y) - 0.5), 0.05) * 0.22;
        pen += lineAA(abs(fract(x) - 0.5), 0.03) * (1.0 - step(0.35, fract(y + 0.5))) * 0.14;
        pen *= fade(0.09);
      }
    } else if (pat == 3) {
      // ── earth: speckles and strata on slab and bank sides
      if (side) col = earthLook(col, pen);
    } else if (pat == 4) {
      // ── stone courses
      float y = vW.y * 6.0; float row = floor(y);
      float a = side ? along : vW.x + vW.z;
      float x = a * 3.2 + row * 0.5;
      float m = lineAA(abs(fract(y) - 0.5), 0.04);
      if (side) {
        m = max(m, lineAA(abs(fract(x) - 0.5), 0.025));
        col *= 0.965 + 0.07 * h1(vec2(floor(x + 0.5), row));
      }
      pen = m * 0.22 * fade(0.16);
    } else if (pat == 5) {
      // ── paving: one tile per grid cell (it shows the build grid), quartered faintly
      if (top) {
        vec2 f = abs(fract(vW.xz) - 0.5);
        pen = lineAA(0.5 - max(f.x, f.y), 0.012) * 0.28 * fade(1.0);
        vec2 g = abs(fract(vW.xz * 2.0) - 0.5);
        pen += lineAA(0.5 - max(g.x, g.y), 0.008) * 0.08 * fade(0.5);
        col *= 0.975 + 0.05 * h1(floor(vW.xz * 2.0));
      }
    } else if (pat == 6 || pat == 26) {
      // ── planks: boards along x (6) or along z (26) on tops, level boards on sides
      float across = top ? (pat == 6 ? vW.z : vW.x) : vW.y;
      float run = top ? (pat == 6 ? vW.x : vW.z) : along;
      float b = across * 9.0;
      float board = floor(b + 0.5);
      col *= 0.955 + 0.09 * h1(vec2(board, 7.0));
      pen = lineAA(abs(fract(b) - 0.5), 0.05) * 0.25;
      float jr = run * 1.6 + h1(vec2(board, 2.0)) * 5.0;
      pen += lineAA(abs(fract(jr) - 0.5), 0.012) * 0.2 * step(abs(fract(b + 0.5) - 0.5), 0.42);
      pen *= fade(0.11);
    } else if (pat == 7) {
      // ── glass: a diagonal glint by day; at dusk the windows come on one by one
      hatchable = 0.0;
      float g = fract((vW.x - vW.z) * 2.2 + vW.y * 2.6);
      float glint = smoothstep(0.02, 0.0, abs(g - 0.35) - 0.06) * 0.45;
      col = mix(col, vec3(1.0), glint);
      float hsh = h1(vId * 255.0 + 0.37);
      // Param c of the slot brings the panes forward (a shop lights before the street: L07).
      float at = hsh * 0.75 - vParams.z;
      // Param d of the slot: panes below this height are dark (downstairs has gone to bed: L07). Every
      // pane of a lit house lights in the end (a silhouette in a window must be in a lit one).
      float upstairs = vParams.w > 0.0 ? step(vParams.w, vW.y) : 1.0;
      float on = smoothstep(at, at + 0.12, uGlow) * upstairs * vParams.x * step(0.001, uGlow);
      vec3 lit = mix(uLamp, uWhite, glint * 0.5) * (0.9 + 0.1 * h1(vId * 91.0));
      col = mix(col, lit, on);
      glow = on;
    } else if (pat == 8) {
      // ── marble: soft tone drift, faint veins, and a bevel under marked top edges
      vec2 p = abs(n.y) > 0.5 ? vW.xz : (abs(n.x) > abs(n.z) ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y));
      col *= 0.955 + 0.08 * n2(p * 0.8 + 7.0);
      float warp = n2(p * 1.3) * 1.8 + n2(p * 3.1) * 0.6;
      float v = abs(fract((p.x * 0.6 + p.y * 0.4) + warp) - 0.5);
      float fd = smoothstep(0.25, 0.7, n2(p * 0.6 + 3.0));
      col = mix(col, col * vec3(0.9, 0.9, 0.96), lineAA(v, 0.05) * fd * 0.5);
      col = mix(col, col * vec3(0.7, 0.72, 0.84), lineAA(v, 0.007) * fd * 0.8);
      if (abs(n.y) < 0.5) {
        col = mix(col, base * 1.02, lineAA(abs(vEdge - 0.032), 0.032));
        pen = lineAA(abs(vEdge - 0.07), 0.006) * 0.5;
      }
    } else if (pat == 9) {
      // ── sand: stipple
      vec2 p = (top ? vW.xz : wall) * 9.0; vec2 c = floor(p); vec2 f = fract(p) - 0.5;
      float r = h1(c);
      pen = lineAA(length(f - (vec2(h1(c + 2.0), h1(c + 9.0)) - 0.5) * 0.6), 0.09) * step(0.74, r) * 0.3 * fade(0.11);
      col *= 0.975 + 0.05 * n2(p * 0.08);
      if (!top) {
        // Wet sand: a darker band where the beach slopes into the water, with an uneven upper edge.
        float wet = 1.0 - smoothstep(0.03, 0.06, vW.y - uSeaY - 0.07 - 0.05 * n2(vW.xz * 2.1));
        col *= mix(vec3(1.0), vec3(0.84, 0.86, 0.9), wet);
      }
    } else if (pat == 10) {
      // ── rock: beds of stone lying a few degrees off level, a few long cracks. The terrain passes
      //    "how rocky" in edge (0 earth to 1 rock; anything else leaves it at EDGE_FAR and gets plain
      //    rock), so earth banks and cliffs interleave along a drawn, wandering border.
      float penR;
      vec3 rc = rockLook(col, top, penR);
      col = rc;
      pen = penR;
      if (side && vEdge < 1.5) {
        float e = vEdge + (n2(vec2(vW.x * 0.9 + vW.z * 0.6, vW.y * 1.5 + vW.z * 0.5 - vW.x * 0.3) * 1.15 + 2.0) - 0.5) * 0.78
                        + (n2(vec2(vW.x * 0.7 - vW.z, vW.y * 1.2) * 4.3) - 0.5) * 0.14;
        float fw = max(fwidth(e), 1e-4);
        float rk = smoothstep(0.5 - fw, 0.5 + fw, e);
        float penE;
        vec3 ec = earthLook(shade(uDirt, s), penE);
        col = mix(ec, rc, rk);
        pen = mix(penE, penR, rk) + (1.0 - smoothstep(0.7, 1.7, abs(e - 0.5) / fw)) * 0.42;
      }
    } else if (pat == 12) {
      // ── plaster: almost flat, a few flecks
      vec2 p = wall * vec2(4.0, 7.0); vec2 c = floor(p); vec2 f = fract(p) - 0.5;
      float r = h1(c);
      f -= (vec2(h1(c + 2.0), h1(c + 9.0)) - 0.5) * 0.6;
      pen = lineAA(abs(f.y), 0.035) * step(abs(f.x), 0.16) * step(0.84, r) * 0.2 * fade(0.14);
      col *= 0.98 + 0.04 * n2(wall * 1.3);
    } else if (pat == 13) {
      // ── brick: running bond
      float y = (top ? vW.z : vW.y) * 10.0; float row = floor(y);
      float x = (top ? vW.x : along) * 4.0 + mod(row, 2.0) * 0.5;
      col *= 0.94 + 0.12 * h1(vec2(floor(x), row));
      pen = max(lineAA(abs(fract(y) - 0.5), 0.05), lineAA(abs(fract(x) - 0.5), 0.02) * step(abs(fract(y + 0.5) - 0.5), 0.4)) * 0.2 * fade(0.1);
    } else if (pat == 14) {
      // ── cobbles: rounded stones
      vec2 p = (top ? vW.xz : wall) * 5.0; vec2 c = floor(p); vec2 f = fract(p);
      float f1 = 9.0, f2 = 9.0; vec2 who = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(float(i), float(j));
        vec2 pt = o + 0.5 + (vec2(h1(c + o + 1.3), h1(c + o + 7.1)) - 0.5) * 0.7;
        float d = length(pt - f);
        if (d < f1) { f2 = f1; f1 = d; who = c + o; } else if (d < f2) { f2 = d; }
      }
      col *= 0.94 + 0.12 * h1(who + 3.0);
      pen = (1.0 - smoothstep(0.05, 0.13, f2 - f1)) * 0.26 * fade(0.2);
    } else if (pat == 15) {
      // ── thatch: layers of straw strokes with a ragged lower edge
      float u = dot(vW.xz, tang) * 20.0;
      float v = vW.y * 3.4 + 0.22 * n2(vec2(u * 0.35, 0.0));
      float row = floor(v);
      col *= 0.9 + 0.12 * fract(v);
      float stroke = lineAA(abs(fract(u + h1(vec2(row, 2.0)) * 0.7) - 0.5), 0.1) * step(0.4, h1(vec2(floor(u), row)));
      pen = stroke * 0.14 * fade(0.05) + lineAA(abs(fract(v) - 0.5) - 0.48, 0.02) * 0.3 * fade(0.29);
    } else if (pat == 16) {
      // ── half-timber: posts at the cell lines and mid-cell, rails at each storey, a brace here and there
      if (side) {
        vec2 f = vec2(fract(along), fract(vW.y / 0.8));
        vec2 c = vec2(floor(along), floor(vW.y / 0.8));
        float post = max(lineAA(0.5 - abs(f.x - 0.5), 0.05), lineAA(abs(f.x - 0.5), 0.035));
        float rail = lineAA(0.5 - abs(f.y - 0.5), 0.07);
        float half_ = step(0.5, f.x);
        vec2 g = vec2(fract(f.x * 2.0), f.y);
        float lean = h1(c + half_ * 3.0 + 1.0) > 0.5 ? g.x : 1.0 - g.x;
        float brace = lineAA(abs(lean - g.y) * 0.7, 0.04) * step(0.55, h1(c + half_ * 7.0));
        float beam = max(max(post, rail), brace);
        float rim = max(max(lineAA(abs(0.5 - abs(f.x - 0.5) - 0.05), 0.008), lineAA(abs(abs(f.x - 0.5) - 0.035), 0.008)), lineAA(abs(0.5 - abs(f.y - 0.5) - 0.07), 0.01));
        col = mix(col, shade(uTimber, s), beam);
        pen = rim * 0.4 * fade(0.1);
      }
    } else if (pat == 17) {
      // ── leaves: scallops and blotches
      vec2 p = (abs(n.y) > 0.8 ? vW.xz : vec2(vW.x + vW.z * 0.6, vW.y * 1.15)) * 5.5;
      vec2 c = floor(p); vec2 f = fract(p) - 0.5;
      float r = h1(c);
      f -= (vec2(h1(c + 3.1), h1(c + 7.7)) - 0.5) * 0.45;
      float arc = lineAA(abs(length(f) - 0.2), 0.035) * step(f.y, 0.03) * step(0.5, r);
      col = shade(base, mix(s, 1.0, 0.3)) * (0.95 + 0.1 * n2(p * 0.33 + 2.0));
      col = mix(col, col * vec3(0.62, 0.78, 0.6), arc * fade(0.18));
    } else if (pat == 18) {
      // ── bark: broken upright strokes
      float x = along * 18.0 + sin(vW.y * 9.0) * 0.6;
      pen = lineAA(abs(fract(x) - 0.5), 0.12) * step(0.4, h1(vec2(floor(x), floor(vW.y * 3.0)))) * 0.24 * fade(0.055);
    } else if (pat == 19) {
      // ── stripes: awning bands of the surface colour and white
      float a = (top ? vW.x : dot(vW.xz, tang)) * 4.0;
      float bandm = smoothstep(0.5 - fwidth(a), 0.5 + fwidth(a), abs(fract(a) - 0.5) * 2.0);
      col = mix(col, shade(uWhite, s), bandm);
      pen = lineAA(abs(abs(fract(a) - 0.5) - 0.25), 0.012) * 0.22 * fade(0.125);
    } else if (pat == 20) {
      // ── crops: furrows with a row of plants in each
      if (top) {
        float z = vW.z * 5.0; float row = floor(z);
        col *= 0.95 + 0.05 * mod(row, 2.0);
        pen = lineAA(abs(fract(z) - 0.5) - 0.46, 0.03) * 0.22 * fade(0.2);
        vec2 p = vec2(vW.x * 7.0 + h1(vec2(row, 1.0)), z); vec2 f = fract(p) - 0.5;
        float r = h1(floor(p));
        float tick = lineAA(length(vec2(f.x, f.y * 0.55) - vec2(0.0, (r - 0.5) * 0.1)), 0.13) * step(0.25, r) * fade(0.14);
        col = mix(col, col * vec3(0.66, 0.82, 0.6), tick);
      }
    } else if (pat == 21) {
      // ── cloth: soft folds
      float a = top ? vW.x : dot(vW.xz, tang);
      col *= 0.96 + 0.05 * sin(a * 16.0 + vW.y * 3.0 + n2(wall * 2.0) * 3.0);
      pen = lineAA(abs(fract(a * 4.0 + 0.3 * sin(vW.y * 5.0)) - 0.5), 0.015) * step(0.6, h1(vec2(floor(a * 4.0), 1.0))) * 0.14 * fade(0.25);
    } else if (pat == 22) {
      // ── metal: one soft streak of light, no pencil
      hatchable = 0.3;
      float g = fract((vW.x - vW.z) * 1.3 + vW.y * 1.7);
      col = mix(col, col * 1.45 + 0.03, smoothstep(0.09, 0.0, abs(g - 0.3)) * 0.5);
    } else if (pat == 23) {
      // ── dirt: speckles and scuffs
      vec2 p = (top ? vW.xz : wall) * 6.0; vec2 c = floor(p); vec2 f = fract(p) - 0.5;
      float r = h1(c);
      f -= (vec2(h1(c + 2.0), h1(c + 9.0)) - 0.5) * 0.6;
      pen = lineAA(length(f), 0.08) * step(0.66, r) * 0.3 * fade(0.16);
      pen += lineAA(abs(f.y + f.x * 0.3), 0.03) * step(abs(f.x), 0.2) * step(r, 0.16) * 0.22 * fade(0.16);
      col *= 0.95 + 0.09 * n2(p * 0.12);
    } else if (pat == 24) {
      // ── foam: churned white water, little rings
      hatchable = 0.0;
      vec2 p = vW.xz * 7.0 + vec2(uTime * 0.15, uTime * 0.07); vec2 c = floor(p); vec2 f = fract(p) - 0.5;
      float r = h1(c);
      f -= (vec2(h1(c + 2.0), h1(c + 9.0)) - 0.5) * 0.4;
      float ring = lineAA(abs(length(f) - 0.2 - 0.06 * sin(uTime * 2.0 + r * 30.0)), 0.05) * step(0.45, r);
      col = mix(col, shade(uSea, s), ring * 0.55 * fade(0.14));
    } else if (pat == 25) {
      // ── glow: lamp glass, lanterns. Unshaded by day, radiant at night.
      hatchable = 0.0;
      col = shade(base, mix(s, 1.0, 0.7));
      float on = uGlow * vParams.x;
      col = mix(col, base * 1.04, on);
      glow = on;
    } else if (pat == 11) {
      // water on a side face (a fall, a basin wall): falling streaks
      hatchable = 0.0;
      float x = along * 9.0 + sin(vW.y * 6.0 - uTime * 3.0) * 0.25;
      col = mix(col, shade(uFoam, s), lineAA(abs(fract(x) - 0.5), 0.08) * step(0.5, h1(vec2(floor(x), 0.0))) * 0.5 * fade(0.11));
    }

    // Seasons: autumn leaves, wet ground, settled snow.
    float snowAmt = 0.0;
    if (uSeasonOn > 0.5) col = seasonSurface(col, n, s, pat, top, pen, hatchable, snowAmt);

    // ── pencil hatching in the shade, laid on the surface itself (see hatchLayer): it stays put when
    //    the view pans, orbits or zooms.
    bool flatish = abs(n.y) > 0.7;
    vec2 hp = flatish ? vW.xz : vec2(dot(vW.xz, tang), vW.y);
    float ang = (flatish ? 0.35 : 0.95) + (h1(vId * 91.7) - 0.5) * 0.4;
    vec2 hd = vec2(cos(ang), sin(ang));
    float depth = s > 0.95 ? 0.22 : (s > 0.85 ? 0.5 : (s > 0.75 ? 0.8 : 1.0));
    // Grounding: a cooler, darker tone, and the pencil pressed harder there.
    float gnd = hatchable > 0.5 ? grounding(n) * uGround : 0.0;
    col *= mix(vec3(1.0), vec3(0.76, 0.77, 0.9), gnd);
    depth = max(depth, gnd * 1.15);
    float amount = hatchLayer(hp, hd, 0.0) * depth;
    if (s < 0.75) {
      // the darkest faces get a second, crossing layer
      amount = max(amount, hatchLayer(hp / 1.3, vec2(-hd.y, hd.x), 9.0) * 0.6);
    }
    col *= 1.0 - uHatch * hatchable * amount * 0.17;
    col = mix(col, uInk, clamp(pen * uPencil, 0.0, 1.0));
  }

  oColor = vec4(toSrgb(col), glow);
  oId = vec4(normalize(vVN).xy * 0.5 + 0.5, vId);
#endif
}
`;
