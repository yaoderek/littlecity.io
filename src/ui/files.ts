// Things that leave or enter the page as files or links: the share link,
// the town file, the postcard (design section 15). Owner: Interface.
//
// The codec itself is the world module's (encodeTown / decodeTown); this is
// only the browser side of it.

import type { World } from '@/core/world';
import { currentLang, langPath, t } from '@/i18n';
import { PALETTE } from '@/style/palette';
import { decodeTown, encodeTown, type DecodeResult } from '@/world/save';

/** Above this many characters a town goes into a file instead of a link (design section 15). */
export const LINK_LIMIT = 6000;
/** The URL fragment that carries a town: `#t=<code>`. */
export const LINK_PREFIX = '#t=';
export const TOWN_FILE_NAME = 'my-town.littlecity';

/**
 * The share link for a town, or null if it is too big for one. It opens at the sharer's language's address
 * (/ja/), so the link's preview card is in their language (tools/seo writes those pages); whoever opens it
 * still plays in their own.
 */
export function shareLink(world: World, base: string = location.origin + langPath(currentLang())): string | null {
  const code = encodeTown(world);
  return code.length > LINK_LIMIT ? null : `${base}${LINK_PREFIX}${code}`;
}

/** The town carried by a URL fragment: null if the fragment is not a town link at all. */
export function townFromHash(hash: string): DecodeResult | null {
  if (!hash.startsWith(LINK_PREFIX)) return null;
  return decodeTown(hash.slice(LINK_PREFIX.length));
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadTown(world: World): void {
  download(new Blob([encodeTown(world)], { type: 'text/plain' }), TOWN_FILE_NAME);
}

/** Reads a town file. Never throws: a bad file comes back as { ok: false, reason }. */
export async function readTownFile(file: File): Promise<DecodeResult> {
  try {
    return decodeTown((await file.text()).trim());
  } catch {
    return { ok: false, reason: t('That file could not be read.') };
  }
}

/** Copies text; false if the browser would not let us. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The postcard: the view as it is now, on a paper border, as a PNG.
 * `renderNow` must draw a frame synchronously; the canvas is copied straight
 * after it, while its drawing buffer still holds the picture. A plain first
 * version: the Polish stage may replace it with something prettier.
 */
export function makePostcard(canvas: HTMLCanvasElement, renderNow: () => void): Promise<Blob | null> {
  renderNow();
  const w = canvas.width, h = canvas.height;
  const border = Math.round(Math.min(w, h) * 0.045);
  const card = document.createElement('canvas');
  card.width = w + border * 2;
  card.height = h + border * 2;
  const g = card.getContext('2d');
  if (!g) return Promise.resolve(null);
  g.fillStyle = PALETTE.paper;
  g.fillRect(0, 0, card.width, card.height);
  g.drawImage(canvas, border, border);
  g.strokeStyle = PALETTE.ink;
  g.lineWidth = Math.max(2, border * 0.07);
  g.lineJoin = 'round';
  g.strokeRect(border, border, w, h);
  return new Promise((resolve) => card.toBlob(resolve, 'image/png'));
}

/**
 * A small picture of the town as the player sees it now, for My towns: a JPEG
 * data URL about 320 px wide, cropped to 8:5 around the middle of the view.
 * Like the postcard, the canvas is copied straight after a frame is drawn.
 * Null if the browser will not draw one.
 */
export function townPicture(canvas: HTMLCanvasElement, renderNow: () => void, width = 320): string | null {
  try {
    renderNow();
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return null;
    const aspect = 8 / 5;
    const sw = Math.min(w, h * aspect), sh = sw / aspect;
    const pic = document.createElement('canvas');
    pic.width = width;
    pic.height = Math.round(width / aspect);
    const g = pic.getContext('2d');
    if (!g) return null;
    g.fillStyle = PALETTE.paper;
    g.fillRect(0, 0, pic.width, pic.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, pic.width, pic.height);
    const url = pic.toDataURL('image/jpeg', 0.78);
    return url.startsWith('data:image/') ? url : null;
  } catch {
    return null;
  }
}
