// The forum's limits (Global Village design, "What it checks on every post"). Owner: Forum.

export const LIMITS = {
  /** Town code, characters (town.ts CODE_MAX). */
  code: 200_000,
  /** Picture, bytes, and its largest size. */
  pictureBytes: 300 * 1024,
  pictureWidth: 640,
  pictureHeight: 400,
  caption: 140,
  nameMin: 1,
  nameMax: 20,
  commentMin: 1,
  commentMax: 280,
  /** Posts on a feed page. */
  page: 24,
  /** Comments sent with a post (older ones on request). */
  comments: 200,
  /** Per player, an hour. No limit on posting (Derek, 2026-11-27). */
  commentsPerHour: 30,
  likesPerHour: 300,
  /** Per network address, a day: only stops a script (mainland carriers put many players behind one address). */
  identitiesPerDay: 300,
  /** Request bodies, bytes: a post (the code, the picture in base64, the caption), anything else. */
  postBody: 700 * 1024,
  smallBody: 8 * 1024,
  /** How stale a feed page may be for someone who hasn't just written, ms. */
  feedCacheMs: 15_000,
} as const;

/** Counts things per key in a sliding window, in memory (a restart forgets: accepted). */
export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Counts one for the key if it is under the limit; false if it is over. */
  take(key: string, now: number): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  /** Forgets keys with nothing in the window (called now and then). */
  sweep(now: number): void {
    const from = now - this.windowMs;
    for (const [k, list] of this.hits) if (!list.some((t) => t > from)) this.hits.delete(k);
  }
}
