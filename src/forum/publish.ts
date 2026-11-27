// Post my town (design, "Posting"): the dialog that sends the town on screen to Global Village, with a
// picture taken when it opens (the player frames their own shot; Retake gives them three seconds of free
// camera and takes it again), their name, and a caption of up to 140 characters as a reader counts them.
// Owner: Interface.

import { track } from '@/app/analytics';
import { t } from '@/i18n';
import { el, iconButton } from '@/ui/dom';
import type { ForumAppHost } from '@/ui/forum-button';
import { codePoints, ForumError, LIMITS, type ForumApi } from './api';
import { glyph } from './glyphs';
import { limitTo } from './post';

/** Why the town on screen cannot be posted, or null. */
export function cannotPost(town: { code: string; worth: boolean; visiting: boolean }): string | null {
  if (town.visiting) return t('Make a copy first.');
  if (!town.worth) return t('Build something first.');
  if (town.code.length > LIMITS.code) return t('This town is too big to post.');
  return null;
}

/** Why what was typed cannot be sent, or null: a name of 1 to 20 characters, a caption of up to 140 (code points). */
export function checkWords(name: string, caption: string): string | null {
  const n = codePoints(name.trim());
  if (n < 1) return t('Pick a name first.');
  if (n > LIMITS.name) return t('A name can be up to {n} characters.', { n: LIMITS.name });
  if (codePoints(caption.trim()) > LIMITS.caption) return t('Say it in {n} characters or fewer.', { n: LIMITS.caption });
  return null;
}

export interface PublishHost {
  api: ForumApi;
  app: ForumAppHost;
  say(text: string): void;
  /** Everything put away for a moment while the player frames the shot; `done` when the time is up. */
  retake(done: () => void): void;
  /** Posted: the forum opens on New with it first. */
  posted(id: string): void;
  /** Closed without posting. */
  cancel(): void;
}

export interface PublishDialog {
  readonly el: HTMLElement;
}

export function createPublishDialog(host: PublishHost): PublishDialog {
  const town = host.app.town();
  let picture = host.app.picture();
  const img = el('img', { attrs: { alt: t('A picture of the town'), draggable: 'false' } });
  const showPicture = (): void => {
    if (picture) img.setAttribute('src', picture);
    else img.removeAttribute('src');
  };
  showPicture();
  const retake = el('button', { class: 'lc-text-btn lc-forum-retake', attrs: { type: 'button', 'data-forum': 'retake' } }, [
    el('span', { class: 'lc-forum-glyph', html: glyph('camera') }),
    el('span', { text: t('Retake') }),
  ]);
  retake.addEventListener('click', () =>
    host.retake(() => {
      picture = host.app.picture();
      showPicture();
    }),
  );

  const me = host.api.me();
  const name = el('input', { class: 'lc-forum-input', attrs: { type: 'text', id: 'lc-forum-pub-name', value: me?.name ?? '', autocomplete: 'nickname', enterkeyhint: 'next', 'data-forum': 'pub-name' } });
  name.value = me?.name ?? '';
  limitTo(name, LIMITS.name);
  const counter = el('small', { class: 'lc-forum-counter', attrs: { 'data-forum': 'pub-count' } });
  const caption = el('textarea', { class: 'lc-forum-input lc-forum-caption-box', attrs: { id: 'lc-forum-pub-caption', rows: '3', 'data-forum': 'pub-caption' } });
  limitTo(caption, LIMITS.caption, counter);

  const cancel = el('button', { class: 'lc-text-btn', text: t('Cancel'), attrs: { type: 'button', 'data-forum': 'pub-cancel' }, on: { click: () => host.cancel() } });
  const post = el('button', { class: 'lc-text-btn lc-primary', text: t('Post'), attrs: { type: 'button', 'data-forum': 'pub-post' } });
  const why = el('p', { class: 'lc-forum-why', attrs: { hidden: '', 'data-forum': 'pub-why' } });
  const refuse = cannotPost(town);
  if (refuse) {
    why.textContent = refuse;
    why.removeAttribute('hidden');
    post.disabled = true;
  }

  let sending = false;
  post.addEventListener('click', async () => {
    if (sending || refuse) return;
    const wrong = checkWords(name.value, caption.value) ?? (picture ? null : t('The picture could not be taken.'));
    if (wrong) {
      why.textContent = wrong;
      why.removeAttribute('hidden');
      return;
    }
    sending = true;
    post.disabled = true;
    post.textContent = t('Posting…');
    try {
      await host.api.setName(name.value);
      const said = caption.value.trim();
      const id = await host.api.publish({ code: town.code, caption: said, picture: picture!, parent: town.from });
      track('post_published', { caption: said.length > 0, built_on: town.from !== null });
      host.say(t('Posted'));
      host.posted(id);
    } catch (e) {
      why.textContent = e instanceof ForumError ? e.text : t("Global Village can't be reached right now.");
      why.removeAttribute('hidden');
      post.disabled = false;
      post.textContent = t('Post');
    } finally {
      sending = false;
    }
  });

  const root = el('div', { class: 'lc-pop lc-forum-publish', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('Post my town'), 'data-forum': 'publish' } }, [
    el('div', { class: 'lc-forum-pub-head' }, [el('h2', { text: t('Post my town') }), iconButton('close', t('Close'), { class: 'lc-round', attrs: { 'data-forum': 'pub-close' }, on: { click: () => host.cancel() } })]),
    el('div', { class: 'lc-forum-pub-pic' }, [img]),
    el('div', { class: 'lc-forum-pub-note' }, [el('small', { text: t('The picture is what you see now.') }), retake]),
    el('label', { class: 'lc-forum-label', text: t('Your name'), attrs: { for: 'lc-forum-pub-name' } }),
    name,
    el('label', { class: 'lc-forum-label', text: t('Say something about it (optional)'), attrs: { for: 'lc-forum-pub-caption' } }),
    el('div', { class: 'lc-forum-say-box' }, [caption, counter]),
    why,
    el('div', { class: 'lc-confirm-buttons lc-forum-pub-buttons' }, [cancel, post]),
  ]);
  return { el: root };
}
