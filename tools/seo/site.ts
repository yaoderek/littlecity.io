// The pages search engines and link previews read (npm run seo, run by tools/deploy-pages.sh after the build).
//
// The game itself is one canvas: a crawler that opens littlecity.io finds a title and nothing to
// read. So the build also writes plain HTML pages with no script at all:
//
//   /about/              what Little City is, how it plays, the kinds of town, questions people ask
//   /guide/              every special building and event, grouped as in the game's guide
//   /guide/<id>/         one entry: its picture (public/guide/<id>.webp), the guide's own sentence
//                        on how to get it, and the others in its group
//   /404.html            GitHub Pages serves it for any address that is not a file
//   /sitemap.xml         every page above, with the guide pictures (Google Images)
//
// Every page but the 404 is written once per language the game speaks (src/i18n): English at the root,
// the others under /<lang>/ (/ja/guide/chapel/), each naming the others (hreflang) so a search engine
// shows people theirs. The game's own page is copied to /<lang>/index.html with its title, link preview
// and the words under the canvas in that language (homePage()): a share link opens at the sharer's
// language's address (src/ui/files.ts), so the preview card in a chat is in their language. A crawler
// fetching a preview sends no language, so the address is the only way to choose one.
//
// The words are lines like the game's (t(), src/i18n/locales): `npm run translate` lists them.
// The guide pages are written from src/guide/entries.ts, the same entries the game's guide shows
// and guide.test.ts proves, so a page can never promise a building the rules do not make.
//
// Pure: pages in, strings out. tools/seo.mjs writes them to disk.

import { ENTRIES, GROUPS, type GuideEntry, type GuideGroup } from '@/guide/entries';
import { currentLang, langPath, LANGS, setLanguage, t, type Lang, type Table } from '@/i18n';

export const ORIGIN = 'https://littlecity.io';
export const NAME = 'Little City';
/** Who made the game: named as its author on every page and in the structured data. */
export const CREATOR = 'Derek Yao';
/** The one-sentence pitch: the page description and the start of every page about the game. */
export const pitch = (): string => t('A hand-drawn town diorama builder, free in your browser. Place a few blocks, watch them turn into a town, then watch it come to life.');
const tagline = (): string => t('a hand-drawn town diorama builder');

// ── languages ────────────────────────────────────────────────────────────

const TABLES = import.meta.glob<Table>('/src/i18n/locales/*.json', { eager: true, import: 'default' });

/** Writes the pages in one language: `fn` runs with t() in it, then English again. */
export function inLanguage<T>(lang: Lang, fn: () => T): T {
  const was = currentLang();
  setLanguage(lang, TABLES[`/src/i18n/locales/${lang}.json`] ?? {});
  try {
    return fn();
  } finally {
    setLanguage(was, was === 'en' ? {} : (TABLES[`/src/i18n/locales/${was}.json`] ?? {}));
  }
}

/** The language's tag for hreflang and <html lang>. */
const HREFLANG: Record<Lang, string> = { en: 'en', zh: 'zh-Hans', es: 'es', fr: 'fr', pt: 'pt-BR', ja: 'ja', ko: 'ko', de: 'de', tr: 'tr' };
/** og:locale. */
const OG_LOCALE: Record<Lang, string> = { en: 'en_US', zh: 'zh_CN', es: 'es_ES', fr: 'fr_FR', pt: 'pt_BR', ja: 'ja_JP', ko: 'ko_KR', de: 'de_DE', tr: 'tr_TR' };

/** The address of a page (its English path, '/guide/chapel/') in the language now in use. */
const here = (key: string): string => `${langPath(currentLang()).slice(0, -1)}${key}`;
const url = (key: string): string => `${ORIGIN}${here(key)}`;

/** The <link rel="alternate"> lines naming every language's copy of a page, and the default (English). */
export function alternates(key: string): string {
  return [...LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${ORIGIN}${langPath(l).slice(0, -1)}${key}">`), `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${key}">`].join('\n');
}

export interface SitePage {
  /** Path from the site root, without a leading slash: 'about/index.html', 'ja/about/index.html'. */
  file: string;
  /** Absolute URL, or null for a page that is not in the sitemap (the 404). */
  url: string | null;
  /** The page's English path ('/about/'): every language's copy of it shares this. */
  key: string;
  lang: Lang;
  html: string;
  /** Pictures on the page, for the image sitemap. */
  images: { url: string; title: string }[];
  priority: number;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** JSON for a <script type="application/ld+json">: nothing in it can close the tag. */
const ld = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

/** Cut to at most `max` characters at a word (anywhere, in a language written without spaces), with an ellipsis if anything was cut. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.、，。\s]+$/, '')}…`;
}

const pictureOf = (e: GuideEntry): string => `${ORIGIN}/guide/${e.id}.webp`;
const pageOf = (e: GuideEntry): string => url(`/guide/${e.id}/`);
const groupTitle = (g: GuideGroup): string => t(GROUPS.find((x) => x.id === g)?.title ?? g);
const nameOf = (e: GuideEntry): string => t(e.name);
const defaultAlt = (): string => t('A hand-drawn island town with a castle, a harbour, a chapel and a lighthouse.');

const CSS = `
:root{--paper:#f2ede3;--card:#fbf8f1;--ink:#3a2f2a;--soft:#7a6a5e;--line:#d9cfbf;--accent:#c4633f}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;color:var(--ink);font:400 17px/1.6 ui-rounded,'SF Pro Rounded','Nunito','Varela Round',system-ui,-apple-system,'Segoe UI',sans-serif}
a{color:inherit;text-decoration-color:var(--line);text-underline-offset:3px}
a:hover{text-decoration-color:var(--accent)}
header,main,footer{max-width:760px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:18px;padding-bottom:6px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:19px;text-decoration:none}
.brand img{width:32px;height:32px}
nav{display:flex;gap:16px;font-size:15px;align-items:center}
.play{display:inline-block;background:var(--ink);color:var(--paper);text-decoration:none;font-weight:700;padding:9px 18px;border-radius:999px}
.play:hover{background:var(--accent)}
.play.big{font-size:19px;padding:13px 26px;margin:8px 0 4px}
h1{font-size:34px;line-height:1.2;margin:28px 0 10px}
h2{font-size:23px;margin:38px 0 8px}
h3{font-size:18px;margin:22px 0 4px}
p,li{color:var(--ink)}
.lede{font-size:20px;color:var(--soft)}
.hero{width:100%;height:auto;border-radius:14px;border:1px solid var(--line);margin:18px 0 6px;display:block}
.caption{font-size:14px;color:var(--soft);margin:0 0 8px}
.crumbs{font-size:14px;color:var(--soft);margin-top:20px}
.crumbs a{color:var(--soft)}
.shot{display:block;margin:12px auto 4px;width:360px;max-width:100%;height:auto}
.how{font-size:20px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:14px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;padding:0;margin:12px 0;list-style:none}
.grid a{display:block;text-align:center;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 6px 10px;font-size:15px;font-weight:600}
.grid a:hover{border-color:var(--accent)}
.grid img{display:block;width:100%;height:auto;aspect-ratio:4/3}
dt{font-weight:700;margin-top:16px}
dd{margin:4px 0 0}
footer{margin-top:48px;padding-top:18px;padding-bottom:40px;border-top:1px solid var(--line);font-size:14px;color:var(--soft)}
footer a{color:var(--soft)}
@media (max-width:520px){h1{font-size:28px}nav .hide-sm{display:none}}
`;

interface Shell {
  title: string;
  description: string;
  /** The page's English path: '/about/'. */
  key: string;
  image?: string;
  imageAlt?: string;
  body: string;
  data: unknown[];
  type?: 'website' | 'article';
  /** The trailer is this page's main content (og:video). */
  video?: boolean;
  /** Not in the other languages (the 404). */
  single?: boolean;
}

function page(s: Shell): string {
  const lang = currentLang();
  const address = s.single ? `${ORIGIN}${s.key}` : url(s.key);
  const image = s.image ?? `${ORIGIN}/og.jpg`;
  const home = here('/');
  return `<!doctype html>
<html lang="${HREFLANG[lang]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.description)}">
<link rel="canonical" href="${address}">
${s.single ? '' : `${alternates(s.key)}\n`}<meta name="author" content="${CREATOR}">
<meta name="theme-color" content="#f2ede3">
<meta property="og:type" content="${s.type ?? 'website'}">
<meta property="og:site_name" content="${NAME}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.description)}">
<meta property="og:url" content="${address}">
<meta property="og:image" content="${image}">
<meta property="og:image:alt" content="${esc(s.imageAlt ?? defaultAlt())}">
${s.video ? `<meta property="og:video" content="${ORIGIN}/preview.mp4">\n<meta property="og:video:secure_url" content="${ORIGIN}/preview.mp4">\n<meta property="og:video:type" content="video/mp4">\n<meta property="og:video:width" content="1280">\n<meta property="og:video:height" content="720">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(s.title)}">
<meta name="twitter:description" content="${esc(s.description)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<style>${CSS.trim()}</style>
${s.data.map((d) => `<script type="application/ld+json">${ld(d)}</script>`).join('\n')}
</head>
<body>
<header>
<a class="brand" href="${home}"><img src="/favicon.svg" alt="" width="32" height="32">${NAME}</a>
<nav><a class="hide-sm" href="${here('/about/')}">${esc(t('About'))}</a><a class="hide-sm" href="${here('/guide/')}">${esc(t('Guide'))}</a><a class="play" href="${home}">${esc(t('Play free'))}</a></nav>
</header>
<main>
${s.body.trim()}
</main>
<footer>
<p>${t('<strong>Little City</strong> is a hand-drawn town diorama builder by Derek Yao. Free, in your browser, on a computer or a phone.')} <a href="${home}">${esc(t('Play now'))}</a> · <a href="${here('/about/')}">${esc(t('About the game'))}</a> · <a href="${here('/guide/')}">${esc(t('The building guide'))}</a></p>
</footer>
</body>
</html>
`;
}

/** The game, as structured data: the same node on every page, so search engines tie them together. */
export function gameData(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'WebApplication'],
    '@id': `${ORIGIN}/#game`,
    name: NAME,
    url: `${ORIGIN}/`,
    description: pitch(),
    image: `${ORIGIN}/og.jpg`,
    genre: ['City builder', 'Town builder', 'Diorama', 'Sandbox', 'Relaxing'],
    keywords: 'diorama builder, town builder, city builder, hand-drawn, cozy game, relaxing game, sandbox, browser game, free online game',
    gamePlatform: ['Web browser', 'PC', 'Mac', 'iPhone', 'iPad', 'Android'],
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any (runs in a web browser)',
    playMode: 'SinglePlayer',
    isAccessibleForFree: true,
    inLanguage: LANGS.map((l) => HREFLANG[l]),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    author: creator(),
    creator: creator(),
    publisher: creator(),
    trailer: trailer(),
  };
}

function creator(): Record<string, unknown> {
  return { '@type': 'Person', '@id': `${ORIGIN}/#creator`, name: CREATOR };
}

/** The trailer (public/preview.mp4, 58 s). Shown as the main thing at the top of /about/, so Google can index it there. */
export function trailer(): Record<string, unknown> {
  return {
    '@type': 'VideoObject',
    '@id': `${ORIGIN}/about/#trailer`,
    name: t('Little City trailer: a hand-drawn town diorama builder'),
    description: t('A drone flies in from the sea over a hand-drawn island town in Little City: under the washing lines, through the square where a wedding is on, and out over the quay. Little City is a hand-drawn town diorama builder by Derek Yao.'),
    thumbnailUrl: [`${ORIGIN}/og.jpg`],
    contentUrl: `${ORIGIN}/preview.mp4`,
    embedUrl: `${ORIGIN}/about/`,
    uploadDate: '2026-11-21T00:00:00-08:00',
    duration: 'PT58S',
    width: 1280,
    height: 720,
    author: creator(),
    publisher: creator(),
  };
}

/** The site, as structured data: what makes Google show "Little City" as the site's name. */
export function siteData(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${ORIGIN}/#site`,
    name: NAME,
    alternateName: ['littlecity.io', 'Little City game', 'Little City city builder'],
    url: `${ORIGIN}/`,
    creator: creator(),
  };
}

function crumbs(items: [name: string, url: string][]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

function tile(e: GuideEntry): string {
  return `<li><a href="${here(`/guide/${e.id}/`)}"><img src="/guide/${e.id}.webp" alt="${esc(t('{name} in Little City', { name: nameOf(e) }))}" width="180" height="135" loading="lazy">${esc(nameOf(e))}</a></li>`;
}

// ── /about/ ──────────────────────────────────────────────────────────────

/** The questions on the about page, answered from what the game really does. */
export function faq(): [q: string, a: string][] {
  return [
    [t('Who made Little City?'), `${CREATOR}.`],
    [t('Is it free?'), t('Yes. It runs in your browser: nothing to download, no account.')],
    [t('Does it work on a phone?'), t('Yes, on iPhone, iPad and Android as well as on a computer.')],
    [t('Does my town save?'), t('Yes, by itself, in your browser. You can also share a town as a link, or save it as a postcard.')],
  ];
}

export function aboutPage(): SitePage {
  const examples = ['chapel', 'lighthouse', 'watermill', 'market-day', 'wedding', 'stone-bridge', 'keep', 'orchard']
    .map((id) => ENTRIES.find((e) => e.id === id))
    .filter((e): e is GuideEntry => e !== undefined);
  const qa = faq();
  const body = `
<h1>${NAME}</h1>
<p class="lede">${esc(t('A tiny, hand-drawn town diorama. Something like a snow globe you build yourself.'))}</p>
<a class="play big" href="${here('/')}">${esc(t('Play'))}</a>
<video class="hero" controls muted playsinline preload="metadata" poster="/og.jpg" width="1280" height="720" title="${esc(t('Little City trailer'))}">
<source src="/preview.mp4" type="video/mp4">
<img src="/og.jpg" alt="${esc(t('A hand-drawn island town in Little City, with a castle, a harbour, a chapel and a lighthouse.'))}" width="1200" height="630">
</video>
<p class="caption">${esc(t('A drone flight over a town grown in the game.'))}</p>

<p>${esc(t('Place a few blocks and they turn into a town. What each one becomes depends on where you put it. A house beside a tall tower becomes a chapel. Four blocks stacked by the sea become a lighthouse. A path becomes a street, with lamps and benches along it.'))}</p>
<p>${esc(t('Then people move in. The miller carries flour down to the bakery, and the baker takes the bread to the stall on the square. Boats go out in the morning and come back with fish. Washing goes up on the lines. Some days there\'s a market. Sometimes there\'s a wedding.'))}</p>
<p>${esc(t('The seasons turn. It snows. The lamps come on at dusk.'))}</p>
<p>${esc(t('You can also skip the building: grow a whole town on a new island (a harbour town, a castle town, a farming village) and just watch it.'))}</p>
<p>${t('There are over 80 things to find. <a href="{guide}">The guide</a> has all of them.', { guide: here('/guide/') })}</p>
<ul class="grid">${examples.map(tile).join('')}</ul>

<h2>${esc(t('A few questions'))}</h2>
<dl>${qa.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>

<p><a class="play big" href="${here('/')}">${esc(t('Play Little City'))}</a></p>
`;
  const faqData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return {
    file: `${here('/about/').slice(1)}index.html`,
    url: url('/about/'),
    key: '/about/',
    lang: currentLang(),
    priority: 0.9,
    images: [{ url: `${ORIGIN}/og.jpg`, title: `${NAME}: ${tagline()}` }],
    html: page({
      title: t('About Little City: a tiny, hand-drawn town diorama by Derek Yao'),
      description: clip(pitch(), 160),
      key: '/about/',
      body,
      video: true,
      data: [gameData(), siteData(), { '@context': 'https://schema.org', ...trailer() }, faqData, crumbs([[NAME, url('/')], [t('About'), url('/about/')]])],
    }),
  };
}

// ── /guide/ ──────────────────────────────────────────────────────────────

export function guideIndexPage(): SitePage {
  const sections = GROUPS.map((g) => {
    const entries = ENTRIES.filter((e) => e.group === g.id);
    if (entries.length === 0) return '';
    return `<h2 id="${g.id}">${esc(t(g.title))}</h2><ul class="grid">${entries.map(tile).join('')}</ul>`;
  }).join('\n');
  const n = ENTRIES.length;
  const body = `
<p class="crumbs"><a href="${here('/')}">${NAME}</a> › ${esc(t('Guide'))}</p>
<h1>${esc(t('The Little City guide'))}</h1>
<p class="lede">${esc(t('You never pick a building from a menu in Little City. You put blocks down and the town decides what they become. Here are all {n} special buildings and events, and how to get each one.', { n }))}</p>
<a class="play big" href="${here('/')}">${esc(t('Play Little City free'))}</a>
${sections}
`;
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('Little City building guide'),
    itemListElement: ENTRIES.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: nameOf(e), url: pageOf(e) })),
  };
  return {
    file: `${here('/guide/').slice(1)}index.html`,
    url: url('/guide/'),
    key: '/guide/',
    lang: currentLang(),
    priority: 0.8,
    images: ENTRIES.map((e) => ({ url: pictureOf(e), title: t('{name} in Little City', { name: nameOf(e) }) })),
    html: page({
      title: t('Little City guide: all {n} special buildings and how to get them', { n }),
      description: clip(t('How to get every special building in Little City: the chapel, the lighthouse, the keep, the watermill, market day, a wedding and the rest.'), 160),
      key: '/guide/',
      body,
      data: [list, crumbs([[NAME, url('/')], [t('Guide'), url('/guide/')]]), gameData()],
    }),
  };
}

export function entryPage(e: GuideEntry): SitePage {
  const group = groupTitle(e.group);
  const others = ENTRIES.filter((x) => x.group === e.group && x.id !== e.id);
  const name = nameOf(e);
  const how = t(e.how);
  // A happening (the guide's event groups) carries a `when`.
  const event = e.when !== undefined;
  const heading = t('{name} in Little City', { name });
  const intro = event
    ? t('{name} is one of the things a town does by itself in Little City, a hand-drawn town diorama builder. Nobody schedules it: build the right places and it happens on its own.', { name })
    : t('In Little City you never choose a building from a menu. Put the blocks down like this and the town does the rest.');
  const key = `/guide/${e.id}/`;
  const body = `
<p class="crumbs"><a href="${here('/')}">${NAME}</a> › <a href="${here('/guide/')}">${esc(t('Guide'))}</a> › <a href="${here('/guide/')}#${e.group}">${esc(group)}</a></p>
<h1>${esc(heading)}</h1>
<img class="shot" src="/guide/${e.id}.webp" alt="${esc(t('{name} in Little City, drawn in ink and pencil', { name }))}" width="360" height="270">
<p class="how"><strong>${esc(t('How to get it:'))}</strong> ${esc(how)}</p>
<p>${esc(intro)}</p>
<a class="play big" href="${here('/')}">${esc(t('Try it, free in your browser'))}</a>
${others.length ? `<h2>${esc(t('More in {group}', { group }))}</h2><ul class="grid">${others.map(tile).join('')}</ul>` : ''}
<p><a href="${here('/guide/')}">${esc(t('All {n} buildings and events', { n: ENTRIES.length }))}</a> · <a href="${here('/about/')}">${esc(t('About Little City'))}</a></p>
`;
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: heading,
    description: how,
    image: pictureOf(e),
    url: pageOf(e),
    inLanguage: HREFLANG[currentLang()],
    about: { '@id': `${ORIGIN}/#game` },
    isPartOf: { '@id': `${ORIGIN}/#site` },
  };
  return {
    file: `${here(key).slice(1)}index.html`,
    url: pageOf(e),
    key,
    lang: currentLang(),
    priority: 0.6,
    images: [{ url: pictureOf(e), title: heading }],
    html: page({
      title: event ? t('{name}: how to make it happen | Little City guide', { name }) : t('{name}: how to build it | Little City guide', { name }),
      description: clip(t('{how} Little City is a hand-drawn town diorama builder, free in your browser.', { how }), 160),
      key,
      image: `${ORIGIN}/og.jpg`,
      imageAlt: heading,
      type: 'article',
      body,
      data: [article, crumbs([[NAME, url('/')], [t('Guide'), url('/guide/')], [name, pageOf(e)]])],
    }),
  };
}

/** English only: GitHub Pages serves it for any address that is not a file. */
export function notFoundPage(): SitePage {
  const body = `
<h1>This street isn't built yet</h1>
<p class="lede">There's nothing at this address. The town is this way.</p>
<a class="play big" href="/">Go to ${NAME}</a>
<p><a href="/guide/">The building guide</a> · <a href="/about/">About the game</a></p>
`;
  const html = page({ title: `Not found | ${NAME}`, description: pitch(), key: '/404.html', body, data: [], single: true }).replace(
    '<link rel="canonical" href="https://littlecity.io/404.html">',
    '<meta name="robots" content="noindex">',
  );
  return { file: '404.html', url: null, key: '/404.html', lang: 'en', priority: 0, images: [], html };
}

// ── the game's own page, in each language ────────────────────────────────

/** The words under the game's canvas (index.html, <main class="lc-about">): for search engines and screen readers. */
export function homeAbout(): string {
  return `<main class="lc-about">
      <h1>${esc(t('Little City: a hand-drawn city builder in your browser'))}</h1>
      <p>${esc(pitch())}</p>
      <p>${esc(t('A house beside a tall tower becomes a chapel. Four blocks stacked by the sea become a lighthouse. Then people move in: the miller carries flour to the bakery, boats go out for fish, and some days there\'s a market or a wedding on the square. The seasons turn and the lamps come on at dusk.'))}</p>
      <p>${esc(t('Or grow a whole town on a new island, a harbour town, a castle town or a farming village, and just watch it.'))}</p>
      <p>${esc(t('Works on computers, iPhone, iPad and Android. Made by Derek Yao.'))}</p>
      <nav><a href="${here('/about/')}" tabindex="-1">${esc(t('About Little City'))}</a> · <a href="${here('/guide/')}" tabindex="-1">${esc(t('The guide: every special building and how to get it'))}</a></nav>
    </main>`;
}

const swap = (html: string, re: RegExp, to: string): string => {
  if (!re.test(html)) throw new Error(`index.html: nothing matches ${re}`);
  return html.replace(re, to);
};

/**
 * The game's page (the built index.html) in the language now in use: its title, description, link preview
 * and the words under the canvas, at /<lang>/ (English stays at /, with only the language links added).
 * The structured data goes in at the `<!-- seo:data -->` marker.
 */
export function homePage(indexHtml: string): SitePage {
  const lang = currentLang();
  const title = t('Little City: A hand-drawn city builder in your browser');
  const description = clip(pitch(), 160);
  const address = url('/');
  let html = indexHtml;
  const data = [gameData(), siteData()].map((d) => `<script type="application/ld+json">${ld(d)}</script>`).join('\n    ');
  html = swap(html, /<!-- seo:data[^>]*-->/, `${data}\n    ${alternates('/').replace(/\n/g, '\n    ')}\n    <meta property="og:locale" content="${OG_LOCALE[lang]}" />`);
  if (lang !== 'en') {
    const content = (attr: string, name: string, value: string): void => {
      html = swap(html, new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`), `$1${esc(value)}$2`);
    };
    html = swap(html, /<html lang="en">/, `<html lang="${HREFLANG[lang]}">`);
    html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    content('name', 'description', description);
    content('property', 'og:title', title);
    content('property', 'og:description', description);
    content('property', 'og:url', address);
    content('property', 'og:image:alt', defaultAlt());
    content('name', 'twitter:title', title);
    content('name', 'twitter:description', description);
    html = swap(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${address}$2`);
    html = swap(html, /(<canvas id="town" aria-label=")[^"]*(")/, `$1${esc(t('Little City: your town, drawn in ink and pencil'))}$2`);
    html = swap(html, /<main class="lc-about">[\s\S]*?<\/main>/, homeAbout());
  }
  return {
    file: `${here('/').slice(1)}index.html`,
    url: address,
    key: '/',
    lang,
    priority: 1,
    images: [{ url: `${ORIGIN}/og.jpg`, title: `${NAME}: ${tagline()}` }],
    html,
  };
}

/** The game's page in every language, from the built index.html: English first. */
export function homePages(indexHtml: string): SitePage[] {
  return LANGS.map((l) => inLanguage(l, () => homePage(indexHtml)));
}

/** Every page the build writes besides the game's own, in every language, then the 404. */
export function sitePages(): SitePage[] {
  return [...LANGS.flatMap((l) => inLanguage(l, () => [aboutPage(), guideIndexPage(), ...ENTRIES.map(entryPage)])), notFoundPage()];
}

/** The sitemap: the game's pages first, then the rest, each naming its copies in the other languages. */
export function sitemap(pages: readonly SitePage[], lastmod: string): string {
  const rows = pages
    .filter((p) => p.url !== null)
    .map(
      (p) =>
        `  <url>\n    <loc>${p.url}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${p.priority.toFixed(1)}</priority>\n${LANGS.map(
          (l) => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${ORIGIN}${langPath(l).slice(0, -1)}${p.key}"/>\n`,
        ).join('')}${p.images.map((i) => `    <image:image><image:loc>${i.url}</image:loc><image:title>${esc(i.title)}</image:title></image:image>\n`).join('')}  </url>`,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join('\n')}\n</urlset>\n`;
}
