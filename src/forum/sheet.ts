// Global Village, the screen (docs/superpowers/specs/2026-11-27-town-forum-design.md, "The forum screen"):
// a full-window sheet built like My towns, with the Top, New and Mine tabs, a grid of posts that loads the
// next page as the player nears the end, a post opened over it (./post.ts) and the Post my town dialog
// (./publish.ts). Owner: Interface.
//
// Loaded on first use only (src/ui/forum-button.ts imports it with import()). The game keeps running
// behind; a server that cannot be reached is said here and nowhere else, with Try again.

import { track } from '@/app/analytics';
import { t } from '@/i18n';
import { el, iconButton } from '@/ui/dom';
import type { ForumController, ForumDeps, ForumTab } from '@/ui/forum-button';
import { icon } from '@/ui/icons';
import { createForumApi, ForumError, type ForumApi, type Post } from './api';
import { glyph } from './glyphs';
import { countCopy, createPostView, heartButton, metaLine, toggleLike, type PostView } from './post';
import { createPublishDialog } from './publish';
import './forum.css';

/** Seconds of free camera Retake gives before the picture is taken again. */
export const RETAKE_SECONDS = 3;
/** How near the end of the list (px) the next page is fetched. */
const MORE_PX = 600;

export interface ForumOptions extends ForumDeps {
  /** For tests: the calls (default: the real ones, against `base`). */
  api?: ForumApi;
  now?(): number;
}

interface TabState {
  posts: Post[];
  next: string | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  error: string;
  more: 'idle' | 'loading' | 'failed';
  ticket: number;
  scroll: number;
}

const TABS: readonly ForumTab[] = ['top', 'new', 'mine'];

export function createForum(opts: ForumOptions): ForumController {
  const api = opts.api ?? createForumApi({ base: opts.base, storage: opts.storage });
  const now = (): number => opts.now?.() ?? Date.now();
  const say = opts.say;
  const fresh = (): TabState => ({ posts: [], next: null, status: 'idle', error: '', more: 'idle', ticket: 0, scroll: 0 });
  const tabs: Record<ForumTab, TabState> = { top: fresh(), new: fresh(), mine: fresh() };
  let tab: ForumTab = 'top';

  // ── the sheet ─────────────────────────────────────────────────────────
  const tabLabel = (id: ForumTab): string => (id === 'top' ? t('Top') : id === 'new' ? t('New') : t('Mine'));
  const tabButtons = TABS.map((id) =>
    el('button', {
      class: 'lc-forum-tab',
      text: tabLabel(id),
      attrs: { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': id },
      on: { click: () => showTab(id) },
    }),
  );
  const close = iconButton('close', t('Close'), { class: 'lc-round lc-forum-close', attrs: { 'data-forum': 'close' }, on: { click: () => api_.close() } });
  const postMine = el('button', { class: 'lc-text-btn lc-primary lc-forum-post-mine', text: t('Post my town'), attrs: { type: 'button', 'data-forum': 'post-mine' }, on: { click: () => openPublish() } });
  const postNote = el('small', { class: 'lc-forum-post-note', text: t('Make a copy first.'), attrs: { hidden: '' } });
  const grid = el('div', { class: 'lc-forum-grid', attrs: { 'data-forum': 'grid', role: 'tabpanel' } });
  const panel = el('div', { class: 'lc-pop lc-forum', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Global Village'), 'data-forum': 'sheet' } }, [
    el('div', { class: 'lc-forum-head' }, [
      el('h2', {}, [el('span', { class: 'lc-forum-title-icon', html: icon('village') }), el('span', { text: t('Global Village') })]),
      el('div', { class: 'lc-forum-tabs', attrs: { role: 'tablist' } }, tabButtons),
      close,
    ]),
    el('div', { class: 'lc-forum-bar' }, [postNote, postMine]),
    grid,
  ]);
  const chip = el('div', { class: 'lc-card lc-forum-retake-chip', attrs: { hidden: '', 'aria-live': 'polite', 'data-forum': 'retake-chip' } });
  const back = el('div', { class: 'lc-forum-back', attrs: { hidden: '', 'data-ui': 'forum-sheet' } }, [panel, chip]);
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) api_.back();
  });
  back.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') api_.back();
  });
  // Typing stays out of the game's shortcuts.
  back.addEventListener('keyup', (e) => e.stopPropagation());

  // ── above a phone's keyboard: the sheet is as tall as what can be seen ──
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const fit = (): void => {
    if (!vv) return;
    back.style.height = `${Math.round(vv.height)}px`;
    back.style.top = `${Math.round(vv.offsetTop)}px`;
  };
  const watchViewport = (on: boolean): void => {
    if (!vv) return;
    if (on) {
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      fit();
    } else {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      back.style.height = '';
      back.style.top = '';
    }
  };

  // ── a card in the grid ──────────────────────────────────────────────
  /** The cards on screen, by post: kept in step when a post's counts change elsewhere. */
  const shown = new Map<string, (p: Post) => void>();
  const card = (post: Post, inMine: boolean): HTMLElement => {
    const pic = el('button', { class: 'lc-forum-pic', attrs: { type: 'button', 'aria-label': post.caption ? t('Open {name}', { name: post.caption }) : t("Open {name}'s town", { name: post.name }), 'data-forum': 'open' } }, [
      el('img', { attrs: { src: api.picture(post.id), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } }),
    ]);
    pic.addEventListener('click', () => openPost(post.id));
    const caption = el('p', { class: 'lc-forum-caption', text: post.caption, attrs: { 'data-forum': 'caption' } });
    if (!post.caption) caption.classList.add('lc-forum-caption-none');
    const heart = heartButton(post, (liked) => toggleLike(api, post, liked, changed, say));
    const comments = el('span', { class: 'lc-forum-count', attrs: { 'data-forum': 'comments' } });
    const copies = el('span', { class: 'lc-forum-count', attrs: { 'data-forum': 'copies' } });
    const news = inMine ? el('div', { class: 'lc-forum-news', attrs: { 'data-forum': 'news' } }) : null;
    const refresh = (p: Post): void => {
      heart.show(p);
      comments.replaceChildren(el('span', { class: 'lc-forum-glyph', html: glyph('comment') }), el('span', { class: 'lc-forum-n', text: String(p.comments) }));
      comments.setAttribute('title', t({ one: '{n} comment', other: '{n} comments' }, { n: p.comments }));
      copies.replaceChildren(el('span', { class: 'lc-forum-glyph', html: glyph('copy') }), el('span', { class: 'lc-forum-n', text: String(p.copies) }));
      copies.setAttribute('title', t({ one: '{n} copy', other: '{n} copies' }, { n: p.copies }));
      if (news) {
        const bits: string[] = [];
        if (p.newLikes) bits.push(t('+{n} ♥', { n: p.newLikes }));
        if (p.newComments) bits.push(t({ one: '{n} new comment', other: '{n} new comments' }, { n: p.newComments }));
        news.textContent = bits.join(' · ');
        news.toggleAttribute('hidden', bits.length === 0);
      }
    };
    refresh(post);
    shown.set(post.id, refresh);
    const node = el('article', { class: 'lc-forum-card', attrs: { 'data-post': post.id } }, [
      pic,
      news,
      caption,
      metaLine(post, now()),
      el('div', { class: 'lc-forum-counts' }, [heart.el, comments, copies]),
    ]);
    // A click anywhere on the card but its heart (or a link) opens the post.
    node.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.lc-forum-heart, .lc-forum-link')) return;
      if (target?.closest?.('.lc-forum-pic')) return;
      openPost(post.id);
    });
    return node;
  };

  /** A post's counts changed (a like, a comment, a copy): every list holding it, and its card, follow. */
  const changed = (p: Post): void => {
    for (const id of TABS) {
      const mine = tabs[id].posts.find((x) => x.id === p.id);
      if (mine && mine !== p) Object.assign(mine, { likes: p.likes, liked: p.liked, comments: p.comments, copies: p.copies });
    }
    shown.get(p.id)?.(p);
  };

  // ── a tab ───────────────────────────────────────────────────────────
  const state = (msg: string, kind: string, button?: HTMLElement | null): HTMLElement =>
    el('div', { class: 'lc-forum-state', attrs: { 'data-forum': kind } }, [el('p', { text: msg }), button ?? null]);
  const render = (): void => {
    const s = tabs[tab];
    shown.clear();
    for (const b of tabButtons) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    if (s.status === 'loading' || s.status === 'idle') return grid.replaceChildren(state(t('Fetching towns…'), 'loading'));
    if (s.status === 'failed') {
      return grid.replaceChildren(
        state(s.error, 'unreachable', el('button', { class: 'lc-text-btn lc-primary', text: t('Try again'), attrs: { type: 'button', 'data-forum': 'retry' }, on: { click: () => void load(tab, true) } })),
      );
    }
    if (s.posts.length === 0) {
      if (tab === 'mine') {
        const again = el('button', { class: 'lc-text-btn lc-primary', text: t('Post my town'), attrs: { type: 'button', 'data-forum': 'post-first' }, on: { click: () => openPublish() } });
        again.disabled = postMine.disabled;
        return grid.replaceChildren(state(t("You haven't posted a town yet."), 'empty', again));
      }
      return grid.replaceChildren(state(t('No towns yet. Post the first one.'), 'empty'));
    }
    const cards = s.posts.map((p) => card(p, tab === 'mine'));
    const foot =
      s.more === 'loading'
        ? el('p', { class: 'lc-forum-more', text: t('Fetching more…') })
        : s.more === 'failed'
          ? el('div', { class: 'lc-forum-more' }, [
              el('button', { class: 'lc-text-btn', text: t('Try again'), attrs: { type: 'button', 'data-forum': 'more-retry' }, on: { click: () => void more() } }),
            ])
          : null;
    grid.replaceChildren(...cards, ...(foot ? [foot] : []));
  };

  const failText = (e: unknown): string => (e instanceof ForumError ? e.text : t("Global Village can't be reached right now."));
  let unreachableSaid = false;
  const noAnswer = (e: unknown, where: string): void => {
    if ((!(e instanceof ForumError) || e.unreachable) && !unreachableSaid) {
      unreachableSaid = true;
      track('forum_unreachable', { where });
    }
  };

  const load = async (which: ForumTab, again = false): Promise<void> => {
    const s = tabs[which];
    const ticket = ++s.ticket;
    s.status = 'loading';
    s.more = 'idle';
    if (which === tab) render();
    try {
      const page = await api.posts(which);
      if (ticket !== s.ticket) return;
      s.posts = page.posts;
      s.next = page.next;
      s.status = 'ready';
      // The Mine tab's "new" marks count from the last time it was opened: it has been, now.
      if (which === 'mine' && api.me()) api.seen('mine').catch(() => undefined);
    } catch (e) {
      if (ticket !== s.ticket) return;
      s.status = 'failed';
      s.error = failText(e);
      noAnswer(e, again ? 'retry' : which);
    }
    if (which === tab && isOpen()) {
      render();
      grid.scrollTop = 0;
    }
  };

  const more = async (): Promise<void> => {
    const s = tabs[tab];
    if (s.status !== 'ready' || s.more === 'loading' || !s.next) return;
    const which = tab;
    const ticket = s.ticket;
    s.more = 'loading';
    const keep = grid.scrollTop;
    render();
    grid.scrollTop = keep;
    try {
      const page = await api.posts(which, s.next);
      if (ticket !== s.ticket) return;
      const have = new Set(s.posts.map((p) => p.id));
      s.posts.push(...page.posts.filter((p) => !have.has(p.id)));
      s.next = page.next;
      s.more = 'idle';
    } catch (e) {
      if (ticket !== s.ticket) return;
      s.more = 'failed';
      noAnswer(e, 'more');
    }
    if (which === tab && isOpen()) {
      const at = grid.scrollTop;
      render();
      grid.scrollTop = at;
    }
  };
  grid.addEventListener('scroll', () => {
    if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - MORE_PX) void more();
  });

  const showTab = (which: ForumTab): void => {
    if (which === tab && tabs[which].status !== 'idle') return;
    tabs[tab].scroll = grid.scrollTop;
    tab = which;
    // A tab is fetched afresh each time it is chosen (a feed a minute old is old news).
    void load(which);
  };

  // ── what sits over the feed: a post, the dialog ──────────────────────
  let post: PostView | null = null;
  let dialog: HTMLElement | null = null;
  /** The dialog was opened with the forum shut (My towns' Post): cancelling shuts it again. */
  let dialogAlone = false;

  const isOpen = (): boolean => !back.hasAttribute('hidden');
  const show = (): void => {
    if (isOpen()) return;
    back.removeAttribute('hidden');
    watchViewport(true);
    unreachableSaid = false;
    opts.changed?.(true);
  };
  const closePost = (): void => {
    if (!post) return;
    post.el.remove();
    post = null;
    panel.removeAttribute('hidden');
  };
  const closeDialog = (): void => {
    dialog?.remove();
    dialog = null;
  };
  const refreshPostMine = (): void => {
    const visiting = opts.app.town().visiting;
    postMine.disabled = visiting;
    postNote.toggleAttribute('hidden', !visiting);
    postMine.title = visiting ? t('Make a copy first.') : t('Post my town');
  };

  const openPost = (id: string): void => {
    show();
    closePost();
    post = createPostView(
      {
        api,
        app: opts.app,
        say,
        ...(opts.linkBox ? { linkBox: opts.linkBox } : {}),
        back: () => {
          closePost();
          if (tabs[tab].status === 'idle') void load(tab);
          else render();
        },
        close: () => api_.close(),
        openPost,
        reopen: (pid) => api_.openPost(pid),
        changed,
        removed: (pid) => {
          for (const which of TABS) tabs[which].posts = tabs[which].posts.filter((p) => p.id !== pid);
          closePost();
          render();
        },
        ...(opts.now ? { now: opts.now } : {}),
      },
      id,
    );
    // A phone: the post takes the whole window, the feed waits under it.
    back.append(post.el);
    post.el.querySelector<HTMLElement>('[data-forum="back"]')?.focus();
  };

  const openPublish = (): void => {
    const town = opts.app.town();
    if (town.visiting) return say(t('Make a copy first.'));
    dialogAlone = !isOpen();
    show();
    closeDialog();
    const d = createPublishDialog({
      api,
      app: opts.app,
      say,
      retake(done) {
        back.classList.add('lc-forum-retaking');
        let left = RETAKE_SECONDS;
        const tick = (): void => {
          chip.textContent = t('Frame your town. The picture is taken in {n}…', { n: left });
        };
        chip.removeAttribute('hidden');
        tick();
        const timer = setInterval(() => {
          left--;
          if (left > 0) return tick();
          clearInterval(timer);
          chip.setAttribute('hidden', '');
          done();
          back.classList.remove('lc-forum-retaking');
        }, 1000);
      },
      posted() {
        closeDialog();
        closePost();
        dialogAlone = false;
        panel.removeAttribute('hidden');
        tabs.mine = fresh();
        tab = 'new';
        void load('new');
      },
      cancel() {
        closeDialog();
        if (dialogAlone) api_.close();
        else panel.removeAttribute('hidden');
      },
    });
    dialog = d.el;
    if (dialogAlone) panel.setAttribute('hidden', '');
    back.append(dialog);
  };

  const api_: ForumController = {
    el: back,
    get isOpen() {
      return isOpen();
    },
    open(which = 'top') {
      const was = isOpen();
      show();
      closeDialog();
      closePost();
      panel.removeAttribute('hidden');
      refreshPostMine();
      if (!was) {
        track('forum_opened', { tab: which });
        // The button's number goes; the server is told (its count starts again from now).
        opts.setBadge(0);
        if (api.me()) api.seen('forum').catch(() => undefined);
      }
      tab = which;
      void load(which);
      close.focus();
    },
    openPost(id) {
      const was = isOpen();
      show();
      refreshPostMine();
      if (!was) {
        panel.removeAttribute('hidden');
        if (tabs[tab].status === 'idle' || tabs[tab].status === 'failed') void load(tab);
        else render();
      }
      openPost(id);
    },
    visitLink(id) {
      api.post(id).then(
        (p) => {
          const reason = opts.app.visit({ id: p.id, name: p.name, code: p.code }, { back: () => api_.openPost(p.id), copied: () => countCopy(api, p.id) });
          if (reason) return say(reason);
          track('post_visited', { from: 'link' });
        },
        (e: unknown) => {
          if (e instanceof ForumError && e.status === 404) say(t('That town is gone.'));
          else {
            noAnswer(e, 'link');
            say(failText(e));
          }
        },
      );
    },
    publish() {
      refreshPostMine();
      openPublish();
    },
    back() {
      if (!isOpen()) return false;
      if (back.classList.contains('lc-forum-retaking')) return true;
      if (dialog) {
        closeDialog();
        if (dialogAlone) api_.close();
        else panel.removeAttribute('hidden');
      } else if (post) {
        closePost();
        render();
      } else api_.close();
      return true;
    },
    close() {
      for (const which of TABS) tabs[which].ticket++;
      closeDialog();
      closePost();
      back.setAttribute('hidden', '');
      watchViewport(false);
      opts.changed?.(false);
    },
  };
  return api_;
}
