// The game's words in the player's language (docs/superpowers/specs/2026-11-25-languages-design.md).
//
// English is the key: `t('Grow a town')` shows "Grow a town" in English and the line's translation in
// src/i18n/locales/<lang>.json otherwise. Details go in by name, never glued on: `t('Open {name}', { name })`.
// Counts pick their form by the language's own plural rules: `t({ one: '{n} minute ago', other: '{n} minutes ago' }, { n })`.
//
// The language is fixed for the life of the page: main.ts awaits `loadLanguage()` before it builds the
// interface, and choosing another one in the menu saves the town and reloads. So `t()` is called where a
// line is shown, never at module load (an import runs before the table has arrived).
//
// Adding a line: wrap it in t(), then `npm run translate` lists it as missing in every language; write the
// translations (and check each by translating it back) in the same change. src/i18n/i18n.test.ts fails while
// any line is missing, and on bare English in the interface's text, aria-label and title.

import { fill, phrased, type Vars } from '@/core/phrase';

export { fill, phrase, type Vars } from '@/core/phrase';

/** The languages there are, English first. Codes are the language part of a browser language. */
export const LANGS = ['en', 'zh', 'es', 'fr', 'pt', 'ja', 'ko', 'de', 'tr'] as const;
export type Lang = (typeof LANGS)[number];

/** Each language in its own words, for the menu. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  zh: '简体中文',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  tr: 'Türkçe',
};

/** The locale numbers, dates and plural rules use (Chinese is Simplified, Portuguese Brazilian). */
const LOCALE: Record<Lang, string> = { en: 'en', zh: 'zh-CN', es: 'es', fr: 'fr', pt: 'pt-BR', ja: 'ja', ko: 'ko', de: 'de', tr: 'tr' };

export const LANG_KEY = 'little-city.lang';

/** A line with forms for counts; the key is its `other` form. */
export interface Plural {
  one?: string;
  other: string;
}
/** A translation: a line, or a counted line's forms by plural category (zero, one, two, few, many, other). */
export type Entry = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Table = Record<string, Entry>;

let lang: Lang = 'en';
let table: Table = {};
let rules: Intl.PluralRules | null = null;

const isLang = (s: string | null | undefined): s is Lang => !!s && (LANGS as readonly string[]).includes(s);

/**
 * The language to use: `?lang=` in the address (a preview, a test; not remembered), then the player's own
 * choice from the menu, then the first of the browser's languages we have, then the address's language
 * (/ja/: a link someone shared, a search result), else English. The player reads their own language even
 * on a link shared in another; the address's language is for the link's preview and for search engines.
 */
export function pickLang(opts: { param?: string | null; chosen?: string | null; browser?: readonly string[]; path?: string }): Lang {
  if (isLang(opts.param)) return opts.param;
  if (isLang(opts.chosen)) return opts.chosen;
  for (const tag of opts.browser ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  const fromPath = pathLang(opts.path ?? '');
  return fromPath ?? 'en';
}

/** The language an address is in: /ja/… is Japanese; / and anything else, none. */
export function pathLang(path: string): Lang | null {
  const first = path.split('/')[1] ?? '';
  return first !== 'en' && isLang(first) ? first : null;
}

/** Where a language's pages live: '/' for English, '/ja/' for Japanese. */
export function langPath(l: Lang): string {
  return l === 'en' ? '/' : `/${l}/`;
}

const tables = import.meta.glob<Table>('./locales/*.json', { import: 'default' });

/** Sets the language for this page and fetches its lines (English needs none). Never throws: a failed fetch leaves English. */
export async function loadLanguage(want: Lang): Promise<Lang> {
  if (want !== 'en') {
    try {
      const load = tables[`./locales/${want}.json`];
      if (load) table = await load();
      else want = 'en';
    } catch {
      want = 'en';
      table = {};
    }
  }
  setLanguage(want, table);
  return want;
}

/** Sets the language and its table directly (tests, and loadLanguage). */
export function setLanguage(l: Lang, t: Table = {}): void {
  lang = l;
  table = l === 'en' ? {} : t;
  rules = null;
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'zh' ? 'zh-Hans' : l;
}

/** The language in use. */
export function currentLang(): Lang {
  return lang;
}

/** The locale for toLocaleString and friends. */
export function locale(): string {
  return LOCALE[lang];
}

function pluralRules(): Intl.PluralRules {
  return (rules ??= new Intl.PluralRules(LOCALE[lang]));
}

/** A number written the language's way (digit grouping). */
export function num(n: number): string {
  return n.toLocaleString(LOCALE[lang]);
}

/** One of the game's lines in the player's language, with its details filled in. */
export function t(line: string | Plural, vars?: Vars): string {
  if (typeof line === 'string') {
    const hit = table[line];
    return fill(typeof hit === 'string' ? hit : line, vars, num);
  }
  const n = Number(vars?.n ?? 0);
  const hit = table[line.other];
  if (hit && typeof hit === 'object') {
    const form = hit[pluralRules().select(n)] ?? hit.other;
    if (form) return fill(form, vars, num);
  }
  if (typeof hit === 'string') return fill(hit, vars, num);
  const en = new Intl.PluralRules('en').select(n) === 'one' && line.one ? line.one : line.other;
  return fill(en, vars, num);
}

// ── lines that come from the game core ───────────────────────────────────
// The core (src/world) says why an edit is refused in English, which analytics and the tests read as it is;
// a few of those lines carry a piece's name (`phrase('a {kind} needs firm ground…', { kind })`). Where one
// is shown, `say()` finds its line, by the whole text or as one of the phrased lines, and gives it in the
// player's language, the piece by its name on the tray.

let kindName: (kind: string) => string = (k) => k;

/** How the interface names a piece (`kind` as the core says it), in the player's language. */
export function setKindNames(name: (kind: string) => string): void {
  kindName = name;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map<string, { re: RegExp; names: string[] }>();

function pattern(line: string): { re: RegExp; names: string[] } {
  let p = patterns.get(line);
  if (!p) {
    const names: string[] = [];
    const src = line
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return escape(part);
        names.push(m[1]!);
        return m[1] === 'reason' ? '(.+)' : '(.+?)';
      })
      .join('');
    p = { re: new RegExp(`^${src}$`, 's'), names };
    patterns.set(line, p);
  }
  return p;
}

/** Details that name a piece. */
const PIECE = new Set(['kind', 'floor', 'edge', 'into']);

/** A line made somewhere else (the core, a saved file's reader) shown in the player's language; text it does not know stays as it is. */
export function say(text: string): string {
  if (lang === 'en' || !text) return text;
  const hit = table[text];
  if (typeof hit === 'string') return hit;
  for (const line of phrased()) {
    const p = pattern(line);
    const m = p.re.exec(text);
    if (!m) continue;
    const vars: Record<string, string> = {};
    p.names.forEach((name, i) => {
      const v = m[i + 1]!;
      vars[name] = name === 'reason' ? say(v) : PIECE.has(name) ? kindName(v) : v;
    });
    return t(line, vars);
  }
  return text;
}
