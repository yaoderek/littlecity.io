// Global Village's button (docs/superpowers/specs/2026-11-27-town-forum-design.md): the pill at the top
// centre that opens the forum, the heart and number of new likes and comments on the player's posts, and
// the forum's few lines in the Almanac. Owner: Interface.
//
// This is the only forum code in the start bundle. The forum itself (src/forum/) is fetched with a dynamic
// import() the first time the button is pressed, a post is asked for (?post=<id>) or My towns' Post is
// pressed. The one request made without the player asking is GET /v1/me/news, once a visit, after the town
// is on screen, and only when lc:forum says the player has posted something. Nothing here touches a town.
//
// VITE_FORUM_URL (.env.production, like the PostHog key) is the server's address; empty means no forum at
// all: no button, no request, nothing. (In development, ?forum=<address> too: see devForum.)

import { t } from '@/i18n';
import { el } from './dom';
import { icon } from './icons';
import './forum-button.css';

/**
 * In development only (npm run dev, the browser tests; never in a build): ?forum=<address> points this page at a
 * forum server, so tests/e2e/forum.e2e.test.ts can start one on a free port while every other test has no forum.
 */
function devForum(): string {
  if (!import.meta.env.DEV) return '';
  try {
    return new URLSearchParams(location.search).get('forum') ?? '';
  } catch {
    return '';
  }
}

/** The forum server's address, without a trailing slash; '' when there is no forum in this build. */
export const FORUM_URL = (((import.meta.env.VITE_FORUM_URL as string | undefined) ?? '').trim() || devForum()).trim().replace(/\/+$/, '');

/** Who the player is on the forum (design, "Who a player is"): its own localStorage key, never part of a town. */
export const FORUM_KEY = 'lc:forum';
/** A forum request with no answer by then has failed: the game carries on. */
export const FORUM_TIMEOUT_MS = 10_000;

export interface ForumIdentity {
  id: string;
  secret: string;
  /** The name the player chose (asked the first time they post or comment). */
  name?: string;
  /** They have posted a town (the button asks for news only then). */
  posted?: boolean;
}

/** The identity kept in lc:forum, or null for none (or one that cannot be read). */
export function readIdentity(storage: Pick<Storage, 'getItem'> | null): ForumIdentity | null {
  try {
    const v = JSON.parse(storage?.getItem(FORUM_KEY) ?? 'null') as Partial<ForumIdentity> | null;
    if (!v || typeof v.id !== 'string' || typeof v.secret !== 'string' || !v.id || !v.secret) return null;
    return { id: v.id, secret: v.secret, ...(typeof v.name === 'string' && v.name ? { name: v.name } : {}), ...(v.posted === true ? { posted: true } : {}) };
  } catch {
    return null;
  }
}

export type ForumTab = 'top' | 'new' | 'mine';

/** A post's town, as the forum hands it to the game. */
export interface PostTown {
  id: string;
  /** The poster's name. */
  name: string;
  code: string;
}

/** What the game does for the forum (src/app/main.ts). */
export interface ForumAppHost {
  /** The town on screen, for posting: its town code, whether anything is built in it, the post it was copied from, and whether it is someone's town being visited. */
  town(): { code: string; worth: boolean; from: string | null; visiting: boolean };
  /** A picture of what the player sees now: 640 × 400, a JPEG data URL; null if the canvas cannot give one. */
  picture(): string | null;
  /**
   * Opens a post's town to look at (visiting mode, the banner with Make a copy and Back to my town); a reason
   * if it cannot be opened. `then.back` reopens the forum on the post after Back to my town; `then.copied`
   * counts a copy made from the banner.
   */
  visit(post: PostTown, then: { back(): void; copied(): void }): string | null;
  /** The post's town becomes a new town of the player's (the visit under way, with what they built, if it is this post's); a reason if not. */
  copy(post: PostTown): string | null;
}

/** Everything the forum module is given. */
export interface ForumDeps {
  base: string;
  app: ForumAppHost;
  storage: Storage | null;
  /** A short message at the top (the game's toast). */
  say(text: string): void;
  /** The number on the button: cleared when the forum is opened. */
  setBadge(n: number): void;
  /** The forum is open or closed (the interface hides what would sit over it). */
  changed?(open: boolean): void;
  /** The copy-by-hand box for a link (the game's feedback.linkBox). */
  linkBox?(text: string, link: string): void;
}

/** What the forum module (src/forum/sheet.ts) gives back. */
export interface ForumController {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  open(tab?: ForumTab): void;
  openPost(id: string): void;
  /** ?post=<id>: fetch the post and visit it straight away. */
  visitLink(id: string): void;
  /** The Post my town dialog for the town on screen. */
  publish(): void;
  /** Closes what is open: a dialog, then a post, then the forum. True if anything was open. */
  back(): boolean;
  close(): void;
}

export interface ForumButtonOptions {
  base: string;
  app: ForumAppHost;
  storage: Storage | null;
  say(text: string): void;
  /** The copy-by-hand box for a link (the game's feedback.linkBox). */
  linkBox?(text: string, link: string): void;
  /** Where the sheet goes when it is first made. */
  parent: HTMLElement;
  /** For tests: fetch. */
  fetch?: typeof fetch;
  changed?(open: boolean): void;
}

export interface ForumButton {
  /** The card at the top centre holding the button. */
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly isOpen: boolean;
  open(tab?: ForumTab): void;
  openPost(id: string): void;
  visitLink(id: string): void;
  publish(): void;
  /** Escape: closes the innermost thing open; true if anything was. */
  back(): boolean;
  setBadge(n: number): void;
  /** Once a frame: shown or not, and the one deferred request for news. */
  frame(): void;
}

/** "♥ 12" on the button: 100 or more is "99+". */
export function badgeText(n: number): string {
  return n >= 100 ? '99+' : String(Math.max(0, Math.floor(n)));
}

/** The loading drawing (index.html) is still over the town. */
function loading(): boolean {
  return typeof document !== 'undefined' && document.querySelector('.lc-loading:not([data-state="done"])') !== null;
}

export function createForumButton(opts: ForumButtonOptions): ForumButton {
  const label = t('Global Village');
  const badgeCount = el('span', { class: 'lc-forum-badge-n' });
  const badge = el('span', { class: 'lc-forum-badge', attrs: { hidden: '', 'data-ui': 'forum-badge' } }, [el('span', { class: 'lc-forum-badge-heart', html: icon('heart') }), badgeCount]);
  const button = el('button', { class: 'lc-btn lc-forum-btn', title: label, attrs: { type: 'button', 'aria-label': label, 'data-ui': 'forum' } }, [
    el('span', { class: 'lc-btn-icon', html: icon('village') }),
    el('span', { class: 'lc-forum-btn-label', text: label }),
    badge,
  ]);
  const card = el('div', { class: 'lc-card lc-forum-pill', attrs: { hidden: '', 'data-ui': 'forum-card' } }, [button]);

  let controller: ForumController | null = null;
  let loadingModule: Promise<ForumController | null> | null = null;
  const load = (): Promise<ForumController | null> =>
    (loadingModule ??= import('@/forum/sheet')
      .then((m) => {
        controller = m.createForum({
          base: opts.base,
          app: opts.app,
          storage: opts.storage,
          say: opts.say,
          ...(opts.linkBox ? { linkBox: opts.linkBox } : {}),
          setBadge: (n) => api.setBadge(n),
          ...(opts.changed ? { changed: opts.changed } : {}),
        });
        opts.parent.append(controller.el);
        return controller;
      })
      .catch(() => {
        // The forum's code could not be fetched (offline): say so, and try again next press.
        loadingModule = null;
        opts.say(t("Global Village can't be reached right now."));
        return null;
      }));
  const withForum = (run: (c: ForumController) => void): void => {
    if (controller) run(controller);
    else void load().then((c) => c && run(c));
  };
  button.addEventListener('click', () => withForum((c) => c.open()));

  let shownOnce = false;
  let newsAsked = false;
  const askNews = (): void => {
    newsAsked = true;
    const me = readIdentity(opts.storage);
    if (!me?.posted) return;
    const f = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!f) return;
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), FORUM_TIMEOUT_MS);
    // No answer: no number, no message.
    void f(`${opts.base}/v1/me/news`, { headers: { Authorization: `Bearer ${me.secret}` }, signal: stop.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ likes?: unknown; comments?: unknown }>) : null))
      .then((news) => {
        if (!news || controller?.isOpen) return;
        const n = (Number(news.likes) || 0) + (Number(news.comments) || 0);
        api.setBadge(n);
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  };

  const api: ForumButton = {
    el: card,
    button,
    get isOpen() {
      return controller?.isOpen ?? false;
    },
    open: (tab) => withForum((c) => c.open(tab)),
    openPost: (id) => withForum((c) => c.openPost(id)),
    visitLink: (id) => withForum((c) => c.visitLink(id)),
    publish: () => withForum((c) => c.publish()),
    back: () => controller?.back() ?? false,
    setBadge(n) {
      const on = n > 0;
      badge.toggleAttribute('hidden', !on);
      badgeCount.textContent = on ? badgeText(n) : '';
      button.setAttribute('aria-label', on ? t('Global Village: {n} new', { n: badgeText(n) }) : label);
    },
    frame() {
      // Not under the loading drawing; and once the town has been on screen, the loading drawing does not come back.
      if (!shownOnce && !loading()) shownOnce = true;
      // (Fly mode puts it away with the rest of the interface: ui.css, .lc-flying.)
      const show = shownOnce;
      if (card.hasAttribute('hidden') === show) card.toggleAttribute('hidden', !show);
      if (shownOnce && !newsAsked) askNews();
    },
  };
  return api;
}

/** Global Village in the Almanac: what it is and how to get there (shown only where there is a forum). */
export function forumGuideSection(): HTMLElement {
  return el('section', { class: 'lc-guide-group lc-guide-forum', attrs: { 'data-group': 'forum' } }, [
    el('h3', {}, [el('span', { text: t('Global Village') })]),
    el('ul', { class: 'lc-guide-list' }, [
      el('li', { class: 'lc-guide-entry', attrs: { 'data-entry': 'global-village' } }, [
        el('div', { class: 'lc-guide-picture lc-guide-forum-icon', html: icon('village') }),
        el('div', { class: 'lc-guide-words' }, [
          el('h4', {}, [el('span', { text: t('Everyone’s towns') })]),
          el('p', { text: t('Press Global Village at the top to see towns other players have posted. Like them, say something, visit them, or make a copy to build on.') }),
          el('p', { text: t('Post my town shares the town on screen with everyone. Nobody can change your own town.') }),
        ]),
      ]),
    ]),
  ]);
}
