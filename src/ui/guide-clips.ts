// The Almanac's clips (Derek, 2026-11-27): each building's picture is a short looping clip of it being
// built, the glove tapping each spot, the stars where it forms (made by `npm run guide -- --clips`, in
// public/guide/clips/). It behaves like a GIF: silent, looping, playing by itself while it is on screen.
// Owner: Interface.
//
// What it costs, and the rules that keep it small:
//   - nothing is fetched until the Almanac is open and the entry is near the screen; then a <video
//     preload="none"> is put over the still, and only playing it fetches it (60 KB or so);
//   - only clips well in view play, the topmost first: at most two at once on a computer, one on a phone;
//   - everything pauses the moment the Almanac closes or the page is hidden;
//   - the still shows until the clip is really playing, and again whenever it is paused;
//   - with reduced motion asked for, nothing plays by itself.

/** At most this many clips play at once. */
export const PLAY_AT_ONCE = { desktop: 2, phone: 1 } as const;
/** A clip plays only when this much of it is in view. */
export const IN_VIEW = 0.6;
/** How far off the screen (CSS px) an entry is made ready: its video element, not yet its file. */
const NEAR_PX = 240;

/** An entry's picture as the scroller sees it. */
export interface Seen {
  id: string;
  /** Its top, CSS px (order on the page). */
  top: number;
  /** How much of it is in view, 0–1. */
  ratio: number;
}

/** Which clips play now: none while the Almanac is shut; else the ones well in view, top first, at most `cap`. */
export function choosePlaying(seen: Iterable<Seen>, cap: number, open: boolean): string[] {
  if (!open || cap <= 0) return [];
  return [...seen]
    .filter((s) => s.ratio >= IN_VIEW)
    .sort((a, b) => a.top - b.top)
    .slice(0, cap)
    .map((s) => s.id);
}

/** Where an entry's clip is, in both forms (VP9 for most browsers, H.264 for Safari). */
export function clipUrls(id: string, base: string = import.meta.env.BASE_URL): { webm: string; mp4: string } {
  return { webm: `${base}guide/clips/${id}.webm`, mp4: `${base}guide/clips/${id}.mp4` };
}

export interface ClipPlayer {
  /** Gives an entry's picture a clip: `shot` holds the still (`still`); the video goes over it when near. */
  add(id: string, shot: HTMLElement, still: HTMLImageElement): void;
  /** The Almanac opened (or closed: everything pauses at once). */
  setOpen(open: boolean): void;
  /** The clips playing now (tests, the console). */
  playing(): string[];
  dispose(): void;
}

export function createClipPlayer(scroller: HTMLElement, opts: { phone(): boolean }): ClipPlayer {
  interface Clip {
    id: string;
    shot: HTMLElement;
    still: HTMLImageElement;
    video: HTMLVideoElement | null;
    ratio: number;
    failed: boolean;
  }
  const clips = new Map<string, Clip>();
  const byShot = new Map<Element, Clip>();
  let open = false;
  let due = 0;
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  const makeVideo = (c: Clip): void => {
    if (c.video || c.failed) return;
    const { webm, mp4 } = clipUrls(c.id);
    const v = document.createElement('video');
    v.className = 'lc-guide-clip';
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    v.disablePictureInPicture = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.setAttribute('tabindex', '-1');
    v.width = 180;
    v.height = 135;
    // The still is the poster: what shows until the first frame is ready.
    if (c.still.currentSrc || c.still.src) v.poster = c.still.currentSrc || c.still.src;
    for (const [src, type] of [[webm, 'video/webm; codecs="vp9"'], [mp4, 'video/mp4']] as const) {
      const s = document.createElement('source');
      s.src = src;
      s.type = type;
      v.append(s);
    }
    // Shown over the still only while it really plays; the still again whenever it stops.
    v.addEventListener('playing', () => c.shot.toggleAttribute('data-clip', true));
    v.addEventListener('pause', () => c.shot.toggleAttribute('data-clip', false));
    // No clip after all (no codec, no file, offline): the still stays, and it is not asked for again.
    const fail = (): void => {
      c.failed = true;
      c.shot.toggleAttribute('data-clip', false);
      v.remove();
      c.video = null;
      schedule();
    };
    v.addEventListener('error', fail);
    v.lastElementChild?.addEventListener('error', fail);
    c.video = v;
    c.shot.append(v);
  };

  const update = (): void => {
    due = 0;
    const live = open && !reduced?.matches && document.visibilityState !== 'hidden';
    const seen: Seen[] = [];
    for (const c of clips.values()) if (c.video && !c.failed) seen.push({ id: c.id, top: c.shot.offsetTop, ratio: c.ratio });
    const play = new Set(choosePlaying(seen, opts.phone() ? PLAY_AT_ONCE.phone : PLAY_AT_ONCE.desktop, live));
    for (const c of clips.values()) {
      const v = c.video;
      if (!v) continue;
      if (play.has(c.id)) {
        if (v.paused) void v.play().catch(() => c.shot.toggleAttribute('data-clip', false));
      } else if (!v.paused) v.pause();
    }
  };
  const schedule = (): void => {
    if (due) return;
    due = requestAnimationFrame(update);
  };

  // Near the screen: the video element is made (nothing is fetched yet).
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = byShot.get(e.target);
        if (c && e.isIntersecting && open) makeVideo(c);
      }
      schedule();
    },
    { root: scroller, rootMargin: `${NEAR_PX}px 0px` },
  );
  // In view: how much, for choosing which play.
  const inView = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = byShot.get(e.target);
        if (c) c.ratio = e.isIntersecting ? e.intersectionRatio : 0;
      }
      schedule();
    },
    { root: scroller, threshold: [0, 0.3, IN_VIEW, 0.9, 1] },
  );
  const visibility = (): void => schedule();
  document.addEventListener('visibilitychange', visibility);
  reduced?.addEventListener?.('change', visibility);

  return {
    add(id, shot, still) {
      const c: Clip = { id, shot, still, video: null, ratio: 0, failed: false };
      clips.set(id, c);
      byShot.set(shot, c);
      near.observe(shot);
      inView.observe(shot);
    },
    setOpen(next) {
      open = next;
      if (!open) {
        // At once, not on the next frame: nothing plays behind a shut book.
        if (due) cancelAnimationFrame(due);
        update();
        return;
      }
      // The observers report what is near and in view once the panel is laid out.
      for (const c of clips.values()) {
        near.unobserve(c.shot);
        near.observe(c.shot);
      }
      schedule();
    },
    playing: () => [...clips.values()].filter((c) => c.video && !c.video.paused).map((c) => c.id),
    dispose() {
      if (due) cancelAnimationFrame(due);
      near.disconnect();
      inView.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      reduced?.removeEventListener?.('change', visibility);
      for (const c of clips.values()) {
        c.video?.pause();
        c.video?.remove();
      }
      clips.clear();
    },
  };
}
