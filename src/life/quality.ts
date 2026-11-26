// How much life a device can afford, for systems that have a cheaper way:
// a phone-sized viewport, and the lowest quality levels (the governor's
// rough levels, src/render/quality.ts: a device that could not otherwise be
// played). The app says which level it is at (src/app/main.ts); tests and
// the picture tools never do, so they get the full version.

let low = false;

/** The app: the view has gone down to (or come back up from) a rough level. */
export function setLifeLow(on: boolean): void {
  low = on;
}

/** True while the view is at one of its roughest levels. */
export function lifeLow(): boolean {
  return low;
}

/** True on a phone-sized viewport (the crowd's test). */
export function phoneSized(): boolean {
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  return typeof g.innerWidth === 'number' && typeof g.innerHeight === 'number' && Math.min(g.innerWidth, g.innerHeight) < 600;
}
