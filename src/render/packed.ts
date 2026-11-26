// Windows: the town drawn into one target instead of two. Owner: Render.
//
// On Windows a browser draws through Direct3D, and Direct3D's compiler takes seconds over the surface
// shader. Worse, a shader that writes two targets at once (the colour and the ink ids) is built twice:
// once in the background when it is linked, for one target only, and again the first time it draws into
// two, on the thread every tab is drawn from, with the whole browser frozen until it is done. (Measured on
// a Windows machine, November 2026: 3.9 s to link, then 3.9 s frozen at the first draw; into one target,
// 0.04 s at the first draw.)
//
// So there, and only there, the town's shaders write one target that holds both pictures: each channel is
// sixteen bits, the colour in the high byte and the ink id in the low. A small pass then splits it into the
// two eight-bit pictures everything after it reads, as they would have been written. Nothing else changes,
// and where the browser does not draw through Direct3D not a character of any shader does.

import type * as THREE from 'three';

/** True where the browser draws through Direct3D (Chrome, Edge and Firefox on Windows). */
export function usesDirect3D(gl: WebGL2RenderingContext | WebGLRenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const names = [gl.getParameter(gl.RENDERER), info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)];
  return names.some((n) => typeof n === 'string' && n.includes('Direct3D'));
}

const TWO = 'layout(location = 0) out vec4 oColor;\nlayout(location = 1) out vec4 oId;';
const MAIN = 'void main(){';
// A float becomes a byte as the graphics card would make it: scaled, half added, the fraction dropped.
const PACK = /* glsl */ `
void main(){
  lcMain();
  oPacked = (uvec4(floor(clamp(oColor, 0.0, 1.0) * 255.0 + 0.5)) << 8u) | uvec4(floor(clamp(oId, 0.0, 1.0) * 255.0 + 0.5));
}
`;

/** A fragment shader that writes oColor and oId, made to write the two packed into one target. */
export function packOutputs(fragment: string): string {
  if (fragment.split(TWO).length !== 2 || fragment.split(MAIN).length !== 2) throw new Error('packOutputs: not a shader with the two outputs and one main');
  return fragment.replace(TWO, 'vec4 oColor;\nvec4 oId;\nlayout(location = 0) out highp uvec4 oPacked;').replace(MAIN, 'void lcMain(){') + PACK;
}

/** Splits the packed target into the colour and the ink ids. */
export const unpackFragment = /* glsl */ `
precision highp float;
uniform highp usampler2D tPacked;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oId;
void main(){
  uvec4 p = texelFetch(tPacked, ivec2(gl_FragCoord.xy), 0);
  oColor = vec4(p >> 8u) / 255.0;
  oId = vec4(p & 255u) / 255.0;
}
`;

/** What the renderer keeps about a material (three's own record of it). */
export type Compiled = { currentProgram?: { isReady(): boolean } };
export type Properties = { get(m: THREE.Material): Compiled };
