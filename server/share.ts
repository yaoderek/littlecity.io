// The link to a post, https://towns.littlecity.io/p/<id> (Global Village). Owner: Forum.
//
// A small page whose share card (Open Graph and Twitter card tags) is the post's picture and
// caption, for X, Discord, Telegram and the like, and which sends a person straight on to the game
// at <game>/?post=<id> (a meta refresh: the page has no script). A post that is gone still sends
// them on: the game says "That town is gone." in their language.

import { esc } from './html';
import type { PostRow } from './store';

export interface ShareSite {
  /** This server's address, for the picture's absolute URL. */
  publicUrl: string;
  /** The game's address. */
  gameUrl: string;
}

export function sharePage(site: ShareSite, id: string, post: PostRow | undefined): string {
  const game = `${site.gameUrl}/?post=${encodeURIComponent(id)}`;
  if (!post) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Little City</title><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${esc(game)}">
</head><body><p>That town is gone. <a href="${esc(site.gameUrl)}/">Open Little City</a></p></body></html>`;
  }
  const name = post.name ?? '';
  const title = name ? `${name}'s town · Little City` : 'A town · Little City';
  const description = post.caption || 'A town built in Little City. Visit it, fly around it, or make a copy and build on it.';
  const picture = `${site.publicUrl}/pics/${encodeURIComponent(post.id)}.jpg`;
  const page = `${site.publicUrl}/p/${encodeURIComponent(post.id)}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(page)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Little City">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(page)}">
<meta property="og:image" content="${esc(picture)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(picture)}">
<meta http-equiv="refresh" content="0; url=${esc(game)}">
<style>body{font:16px/1.4 system-ui,sans-serif;max-width:640px;margin:2em auto;padding:0 1em;color:#333}img{width:100%;height:auto;border-radius:8px}</style>
</head><body>
<img src="${esc(picture)}" alt="${esc(title)}" width="640" height="400">
<p>${esc(post.caption)}</p>
<p>${esc(name)}</p>
<p><a href="${esc(game)}">Open this town in Little City</a></p>
</body></html>`;
}
