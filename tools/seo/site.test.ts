import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTRIES } from '@/guide/entries';
import { LANGS } from '@/i18n';
import { homeAbout, homePages, ORIGIN, sitemap, sitePages } from './site';

const index = fs.readFileSync('index.html', 'utf8');
const homes = homePages(index);
const pages = [...homes, ...sitePages()];
const field = (html: string, re: RegExp): string => re.exec(html)?.[1] ?? '';
const words = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the pages search engines and link previews read', () => {
  it('has a page for every guide entry in every language, and its picture exists', () => {
    for (const e of ENTRIES) {
      for (const l of LANGS) {
        const file = `${l === 'en' ? '' : `${l}/`}guide/${e.id}/index.html`;
        expect(pages.some((p) => p.file === file), file).toBe(true);
      }
      expect(fs.existsSync(path.join('public', 'guide', `${e.id}.webp`)), `public/guide/${e.id}.webp`).toBe(true);
    }
  });

  it('gives every page a title, a description short enough to show whole, and one canonical address', () => {
    const titles = new Set<string>();
    for (const p of pages) {
      const title = field(p.html, /<title>(.*?)<\/title>/);
      const description = field(p.html, /<meta name="description" content="([^"]*)"/);
      expect(title.length, p.file).toBeGreaterThan(8);
      expect(description.length, p.file).toBeGreaterThan(p.lang === 'en' ? 50 : 20);
      expect(description.length, p.file).toBeLessThanOrEqual(160);
      expect(titles.has(title), `two pages titled ${title}`).toBe(false);
      titles.add(title);
      if (p.url) expect(field(p.html, /<link rel="canonical" href="([^"]*)"/), p.file).toBe(p.url);
      else expect(p.html, p.file).toContain('noindex');
    }
  });

  it('says each page\'s language, and names its copy in every language', () => {
    const files = new Set(pages.map((p) => p.file));
    for (const p of pages.filter((x) => x.url)) {
      const alts = [...p.html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[2]!);
      expect(alts.length, p.file).toBe(LANGS.length + 1);
      for (const a of alts) expect(files.has(`${a.slice(ORIGIN.length + 1)}index.html`), `${p.file} names ${a}`).toBe(true);
      expect(alts, p.file).toContain(p.url);
    }
    expect(field(homes.find((h) => h.lang === 'ja')!.html, /<html lang="([^"]+)"/)).toBe('ja');
  });

  it('shows the link preview in the page\'s language', () => {
    const ja = homes.find((h) => h.lang === 'ja')!.html;
    const en = homes.find((h) => h.lang === 'en')!.html;
    for (const name of ['og:title', 'og:description']) {
      const re = new RegExp(`<meta property="${name}" content="([^"]*)"`);
      expect(field(ja, re), name).not.toBe(field(en, re));
    }
    expect(field(ja, /<meta property="og:url" content="([^"]*)"/)).toBe(`${ORIGIN}/ja/`);
    // English is index.html as written, with only the structured data and the language links added.
    expect(field(en, /<title>(.*?)<\/title>/)).toBe(field(index, /<title>(.*?)<\/title>/));
  });

  it('the words under the game in index.html are the English of homeAbout() (the other languages are made from it)', () => {
    expect(words(homeAbout())).toBe(words(field(index, /(<main class="lc-about">[\s\S]*?<\/main>)/)));
  });

  it('writes structured data that parses', () => {
    for (const p of pages) {
      for (const m of p.html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) expect(() => JSON.parse(m[1]!), p.file).not.toThrow();
    }
  });

  it('lists every indexable page once in the sitemap, the game first, and nothing else', () => {
    const urls = [...sitemap(pages, '2026-11-21').matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls[0]).toBe(`${ORIGIN}/`);
    expect(urls.length).toBe(pages.filter((p) => p.url).length);
  });

  it('links only to pages that exist', () => {
    const files = new Set(pages.map((p) => p.file));
    const check = (from: string, html: string): void => {
      for (const m of html.matchAll(/href="(\/[^"#]*)/g)) {
        const href = m[1]!;
        if (/\.(svg|png|ico|webmanifest|css)$/.test(href)) continue;
        expect(files.has(`${href.slice(1)}index.html`), `${from} links to ${href}`).toBe(true);
      }
    };
    for (const p of pages) check(p.file, p.key === '/' ? field(p.html, /(<main class="lc-about">[\s\S]*?<\/main>)/) : p.html);
  });
});
