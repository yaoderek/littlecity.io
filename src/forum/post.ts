// A post in Global Village (design, "A post"): its picture, caption, who and when, what it was built on,
// Visit, Make a copy, the heart, Share, Delete for the player's own, and its comments with a box to write
// one. Shown over the feed (on a phone, the whole window). Owner: Interface.
//
// Player text (names, captions, comments) only ever reaches the page as text: el()'s `text`, never `html`.

import { track } from '@/app/analytics';
import { t } from '@/i18n';
import { el, iconButton } from '@/ui/dom';
import { copyText } from '@/ui/files';
import type { ForumAppHost } from '@/ui/forum-button';
import { icon } from '@/ui/icons';
import { whenText } from '@/ui/towns';
import { clip, codePoints, ForumError, LIMITS, type Comment, type ForumApi, type FullPost, type Post } from './api';
import { glyph } from './glyphs';

export interface PostViewHost {
  api: ForumApi;
  app: ForumAppHost;
  say(text: string): void;
  linkBox?(text: string, link: string): void;
  /** Back to the feed, where the player was. */
  back(): void;
  /** Closes the forum. */
  close(): void;
  /** Opens another post (the one this was built on). */
  openPost(id: string): void;
  /** Reopens the forum on this post (Back to my town, after a visit). */
  reopen(id: string): void;
  /** The counts changed (a like, a comment): the feed's card follows. */
  changed(post: Post): void;
  /** The post was deleted. */
  removed(id: string): void;
  now?(): number;
}

export interface PostView {
  readonly el: HTMLElement;
  readonly id: string;
}

/** A heart that likes and takes back: filled when liked, with the count beside it. */
export function heartButton(post: Post, onToggle: (liked: boolean) => void, cls = ''): { el: HTMLButtonElement; show(p: Post): void } {
  const count = el('span', { class: 'lc-forum-n' });
  const button = el('button', { class: `lc-btn lc-forum-heart ${cls}`.trim(), attrs: { type: 'button', 'data-forum': 'like' } }, [el('span', { class: 'lc-forum-glyph', html: icon('heart') }), count]);
  const show = (p: Post): void => {
    count.textContent = String(p.likes);
    button.setAttribute('aria-pressed', String(p.liked));
    button.classList.toggle('lc-liked', p.liked);
    const label = p.liked ? t('Take back your like') : t('Like');
    button.setAttribute('aria-label', `${label} (${p.likes})`);
    button.title = label;
  };
  show(post);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggle(button.getAttribute('aria-pressed') !== 'true');
  });
  return { el: button, show };
}

/** Likes a post or takes the like back, at once on screen; put back if the server says no. */
export function toggleLike(api: ForumApi, post: Post, liked: boolean, shown: (p: Post) => void, say: (text: string) => void): void {
  const before = { liked: post.liked, likes: post.likes };
  if (before.liked === liked) return;
  post.liked = liked;
  post.likes = Math.max(0, post.likes + (liked ? 1 : -1));
  shown(post);
  if (liked) track('post_liked');
  api.like(post.id, liked).catch((e: unknown) => {
    post.liked = before.liked;
    post.likes = before.likes;
    shown(post);
    say(e instanceof ForumError ? e.text : t("Global Village can't be reached right now."));
  });
}

/** "mira · 2 hours ago" and, for a copy, "built on tom's town" (a link to it) or "built on a town that is gone". */
export function metaLine(post: Post, now: number, openParent?: (id: string) => void): HTMLElement {
  const meta = el('div', { class: 'lc-forum-meta' }, [el('b', { class: 'lc-forum-who', text: post.name }), el('span', { text: ` · ${whenText(post.created, now)}` })]);
  if (post.parent) {
    meta.append(el('span', { text: ' · ' }));
    if (post.parent.gone || !openParent) meta.append(el('span', { class: 'lc-forum-parent', text: post.parent.gone ? t('built on a town that is gone') : t("built on {name}'s town", { name: post.parent.name }) }));
    else {
      const parentId = post.parent.id;
      meta.append(
        el('button', {
          class: 'lc-forum-link',
          text: t("built on {name}'s town", { name: post.parent.name }),
          attrs: { type: 'button', 'data-forum': 'parent' },
          on: { click: () => openParent(parentId) },
        }),
      );
    }
  }
  return meta;
}

/** A text box that holds at most `max` characters as a reader counts them (code points). */
export function limitTo(input: HTMLInputElement | HTMLTextAreaElement, max: number, counter?: HTMLElement): () => void {
  const update = (): void => {
    if (codePoints(input.value) > max) input.value = clip(input.value, max);
    if (counter) counter.textContent = `${codePoints(input.value)}/${max}`;
  };
  input.addEventListener('input', update);
  update();
  return update;
}

export function createPostView(host: PostViewHost, id: string): PostView {
  const now = (): number => host.now?.() ?? Date.now();
  const body = el('div', { class: 'lc-forum-post-body', attrs: { 'data-forum': 'post-body' } });
  const backButton = el('button', { class: 'lc-btn lc-round lc-forum-back-btn', title: t('Back'), attrs: { type: 'button', 'aria-label': t('Back'), 'data-forum': 'back' } }, [
    el('span', { class: 'lc-btn-icon', html: glyph('back') }),
  ]);
  backButton.addEventListener('click', () => host.back());
  const close = iconButton('close', t('Close'), { class: 'lc-round', attrs: { 'data-forum': 'close' }, on: { click: () => host.close() } });
  const root = el('div', { class: 'lc-pop lc-forum-post', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('A town in Global Village'), 'data-forum': 'post', 'data-post': id } }, [
    el('div', { class: 'lc-forum-post-head' }, [backButton, close]),
    body,
  ]);

  const wait = (): void => body.replaceChildren(el('p', { class: 'lc-forum-wait', text: t('Fetching the town…') }));
  const failed = (e: unknown): void => {
    const gone = e instanceof ForumError && e.status === 404;
    const text = gone ? t('That town is gone.') : e instanceof ForumError ? e.text : t("Global Village can't be reached right now.");
    if (!gone && (!(e instanceof ForumError) || e.unreachable)) track('forum_unreachable', { where: 'post' });
    body.replaceChildren(
      el('div', { class: 'lc-forum-state', attrs: { 'data-forum': gone ? 'gone' : 'unreachable' } }, [
        el('p', { text }),
        gone ? null : el('button', { class: 'lc-text-btn lc-primary', text: t('Try again'), attrs: { type: 'button', 'data-forum': 'retry' }, on: { click: () => void load() } }),
      ]),
    );
  };

  const show = (post: FullPost): void => {
    const picture = el('div', { class: 'lc-forum-post-pic' }, [el('img', { attrs: { src: host.api.picture(post.id), alt: t('A picture of the town'), draggable: 'false' } })]);
    const caption = post.caption ? el('p', { class: 'lc-forum-post-caption', text: post.caption, attrs: { 'data-forum': 'caption' } }) : null;
    const meta = metaLine(post, now(), (pid) => host.openPost(pid));

    const town = { id: post.id, name: post.name, code: post.code };
    const visit = el('button', { class: 'lc-text-btn', text: t('Visit'), attrs: { type: 'button', 'data-forum': 'visit' } });
    visit.addEventListener('click', () => {
      const reason = host.app.visit(town, {
        back: () => host.reopen(post.id),
        copied: () => {
          countCopy(host.api, post.id);
          post.copies++;
          host.changed(post);
        },
      });
      if (reason) return host.say(reason);
      track('post_visited');
      host.close();
    });
    const copy = el('button', { class: 'lc-text-btn lc-primary', text: t('Make a copy'), attrs: { type: 'button', 'data-forum': 'copy' } });
    copy.addEventListener('click', () => copyPost(host, post, town));
    const heart = heartButton(post, (liked) => toggleLike(host.api, post, liked, (p) => (heart.show(p), host.changed(p)), host.say), 'lc-forum-heart-big');
    const share = el('button', { class: 'lc-text-btn', text: t('Share'), attrs: { type: 'button', 'data-forum': 'share' } });
    share.addEventListener('click', () => void sharePost(host, post.id));
    const actions = el('div', { class: 'lc-forum-actions' }, [visit, copy, heart.el, share]);
    if (post.mine) {
      const del = el('button', { class: 'lc-text-btn lc-forum-quiet', text: t('Delete'), attrs: { type: 'button', 'data-forum': 'delete' } });
      del.addEventListener('click', () => askDelete());
      actions.append(del);
    }
    const askDelete = (): void => {
      if (root.querySelector('.lc-forum-ask')) return;
      const ask = el('div', { class: 'lc-forum-ask', attrs: { 'data-forum': 'delete-ask' } }, [
        el('p', { text: t('Delete this post? The town itself stays in My towns.') }),
        el('div', { class: 'lc-confirm-buttons' }, [
          el('button', {
            class: 'lc-text-btn lc-primary',
            text: t('Delete'),
            attrs: { type: 'button', 'data-forum': 'delete-yes' },
            on: {
              click: () => {
                ask.remove();
                host.api.remove(post.id).then(
                  () => {
                    host.say(t('Post deleted.'));
                    host.removed(post.id);
                  },
                  (e: unknown) => host.say(e instanceof ForumError ? e.text : t("Global Village can't be reached right now.")),
                );
              },
            },
          }),
          el('button', { class: 'lc-text-btn', text: t('Keep it'), attrs: { type: 'button', 'data-forum': 'delete-no' }, on: { click: () => ask.remove() } }),
        ]),
      ]);
      actions.after(ask);
    };

    // ── the comments ──────────────────────────────────────────────────────
    const list = el('ol', { class: 'lc-forum-comments', attrs: { 'data-forum': 'comments' } });
    const row = (c: Comment): HTMLElement => {
      const li = el('li', { class: 'lc-forum-comment', attrs: { 'data-comment': c.id } }, [
        el('b', { class: 'lc-forum-who', text: c.name }),
        el('span', { class: 'lc-forum-said', text: c.text }),
        el('small', { class: 'lc-forum-when', text: whenText(c.created, now()) }),
      ]);
      if (c.mine) {
        li.append(
          el('button', {
            class: 'lc-forum-link lc-forum-del',
            text: t('Delete'),
            attrs: { type: 'button', 'data-forum': 'comment-delete' },
            on: {
              click: () =>
                host.api.removeComment(c.id).then(
                  () => {
                    li.remove();
                    post.thread = post.thread.filter((x) => x.id !== c.id);
                    post.comments = Math.max(0, post.comments - 1);
                    host.changed(post);
                    showCount();
                  },
                  (e: unknown) => host.say(e instanceof ForumError ? e.text : t("Global Village can't be reached right now.")),
                ),
            },
          }),
        );
      }
      return li;
    };
    const countLine = el('h3', { class: 'lc-forum-comments-head' });
    const showCount = (): void => {
      countLine.textContent = post.comments ? t({ one: '{n} comment', other: '{n} comments' }, { n: post.comments }) : t('No comments yet.');
    };
    showCount();
    list.replaceChildren(...post.thread.map(row));
    // The server sends the latest 200; the ones before wait behind "Earlier comments".
    let before = post.earlier;
    const earlier = el('button', { class: 'lc-text-btn lc-forum-earlier', text: t('Earlier comments'), attrs: { type: 'button', 'data-forum': 'earlier' } });
    earlier.toggleAttribute('hidden', !before);
    earlier.addEventListener('click', () => {
      if (!before) return;
      earlier.disabled = true;
      host.api.earlierComments(post.id, before).then(
        (page) => {
          post.thread.unshift(...page.thread);
          list.prepend(...page.thread.map(row));
          before = page.earlier;
          earlier.toggleAttribute('hidden', !before);
          earlier.disabled = false;
        },
        (e: unknown) => {
          earlier.disabled = false;
          host.say(e instanceof ForumError ? e.text : t("Global Village can't be reached right now."));
        },
      );
    });

    // ── writing one ───────────────────────────────────────────────────────
    const me = host.api.me();
    const nameBox = me?.name ? null : el('input', { class: 'lc-forum-input lc-forum-name', attrs: { type: 'text', placeholder: t('Your name'), 'aria-label': t('Your name'), autocomplete: 'nickname', enterkeyhint: 'next', 'data-forum': 'name' } });
    if (nameBox) limitTo(nameBox, LIMITS.name);
    const text = el('textarea', { class: 'lc-forum-input lc-forum-text', attrs: { rows: '2', placeholder: t('Say something…'), 'aria-label': t('Say something…'), enterkeyhint: 'send', 'data-forum': 'comment-text' } });
    const counter = el('small', { class: 'lc-forum-counter', attrs: { 'aria-hidden': 'true' } });
    const recount = limitTo(text, LIMITS.comment, counter);
    const send = el('button', { class: 'lc-text-btn lc-primary lc-forum-send', text: t('Send'), attrs: { type: 'button', 'data-forum': 'send' } });
    let sending = false;
    const submit = async (): Promise<void> => {
      const said = text.value.trim();
      if (sending || !said) return;
      const name = nameBox ? nameBox.value.trim() : '';
      if (nameBox && !name) {
        host.say(t('Pick a name first.'));
        nameBox.focus();
        return;
      }
      sending = true;
      send.disabled = true;
      try {
        if (nameBox) await host.api.setName(name);
        const c = await host.api.comment(post.id, said);
        track('comment_posted');
        post.thread.push(c);
        post.comments++;
        list.append(row(c));
        text.value = '';
        recount();
        nameBox?.remove();
        showCount();
        host.changed(post);
        list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
      } catch (e) {
        host.say(e instanceof ForumError ? e.text : t("Global Village can't be reached right now."));
      } finally {
        sending = false;
        send.disabled = false;
      }
    };
    send.addEventListener('click', () => void submit());
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void submit();
      }
    });
    // The box stays in sight above a phone's keyboard.
    text.addEventListener('focus', () => setTimeout(() => form.scrollIntoView?.({ block: 'end' }), 300));
    const form = el('div', { class: 'lc-forum-say', attrs: { 'data-forum': 'say' } }, [nameBox, el('div', { class: 'lc-forum-say-row' }, [el('div', { class: 'lc-forum-say-box' }, [text, counter]), send])]);

    body.replaceChildren(picture, ...(caption ? [caption] : []), meta, actions, el('section', { class: 'lc-forum-thread' }, [countLine, earlier, list, form]));
  };

  let ticket = 0;
  const load = async (): Promise<void> => {
    const mine = ++ticket;
    wait();
    try {
      const post = await host.api.post(id);
      if (mine === ticket) show(post);
    } catch (e) {
      if (mine === ticket) failed(e);
    }
  };
  void load();
  track('post_opened');
  return { el: root, id };
}

/** Make a copy: counted on the server once per player (made silently if need be), then the town is the player's. */
export function copyPost(host: Pick<PostViewHost, 'api' | 'app' | 'say' | 'close' | 'changed'>, post: Post, town: { id: string; name: string; code: string }): void {
  const reason = host.app.copy(town);
  if (reason) return host.say(reason);
  countCopy(host.api, post.id);
  post.copies++;
  host.changed(post);
  host.close();
}

/** A copy made: counted on the server (once per player; the identity made silently if need be) when it can be reached. The copy is the player's either way. */
export function countCopy(api: ForumApi, id: string): void {
  track('post_copied');
  api.copied(id).catch(() => undefined);
}

/** Share: the post's link copied, or shown to copy by hand. */
export async function sharePost(host: Pick<PostViewHost, 'api' | 'say' | 'linkBox'>, id: string): Promise<void> {
  const link = host.api.link(id);
  track('post_shared');
  if (await copyText(link)) host.say(t('Link copied'));
  else if (host.linkBox) host.linkBox(t('Copy this link to share the town:'), link);
  else host.say(link);
}
