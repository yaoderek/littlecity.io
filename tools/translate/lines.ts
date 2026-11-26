// Every English line the player can read, found in the source (src/i18n/index.ts says how lines are
// written). Used by tools/translate.mjs (what is missing in each language) and tools/translate/lines.test.ts
// (nothing missing, nothing stale, details match, no bare English in the interface).
//
// Found two ways:
//  - calls in the source: t('…'), t({ one: '…', other: '…' }), phrase('…', …) anywhere in src or in
//    tools/seo/site.ts (the search and link-preview pages), and the
//    refusals no('…') in src/world/world.ts;
//  - tables shown with t(value) where they are shown (DATA below): add yours there.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ENTRIES, GROUPS } from '@/guide/entries';
import { SILLY } from '@/style/stats';
import { HOUSE_STYLES } from '@/style/houses';
import { ISLAND_KIND_NAMES } from '@/terrain/kinds';
import { CHARACTER_NAMES } from '@/townmaker/character';
import type { Plural } from '@/i18n';

export { LANGS } from '@/i18n';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface Line {
  /** The English line, the key in every language file (a counted line's `other` form). */
  key: string;
  /** A counted line's English forms. */
  plural?: Plural;
  /** Where it was found (file:line, or the table). */
  where: string;
}

/** Tables shown with t(value): every string they hold is a line. */
function dataLines(): Line[] {
  const out: Line[] = [];
  const add = (key: string | undefined, where: string): void => {
    if (key) out.push({ key, where });
  };
  for (const g of GROUPS) add(g.title, 'guide GROUPS');
  for (const e of ENTRIES) {
    add(e.name, `guide ${e.id} name`);
    add(e.how, `guide ${e.id} how`);
    add(e.when, `guide ${e.id} when`);
  }
  for (const [k, v] of Object.entries(SILLY)) add(v, `SILLY.${k}`);
  for (const s of HOUSE_STYLES) {
    add(s.name, `HOUSE_STYLES ${s.name} name`);
    add(s.hint, `HOUSE_STYLES ${s.name} hint`);
  }
  for (const [k, v] of Object.entries(ISLAND_KIND_NAMES)) add(v, `ISLAND_KIND_NAMES.${k}`);
  // The menu shows a kind of town capitalised ("Harbour town": src/ui/menu.ts).
  for (const [k, v] of Object.entries(CHARACTER_NAMES)) add(v[0]!.toUpperCase() + v.slice(1), `CHARACTER_NAMES.${k}`);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name !== 'testing' && d.name !== 'node_modules') out.push(...sourceFiles(p));
    } else if (/\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name) && !/\.d\.ts$/.test(d.name)) out.push(p);
  }
  return out;
}

const literal = (n: ts.Node | undefined): string | undefined =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;

function pluralOf(n: ts.Node): Plural | undefined {
  if (!ts.isObjectLiteralExpression(n)) return undefined;
  const forms: Record<string, string> = {};
  for (const p of n.properties) if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) forms[p.name.text] = literal(p.initializer) ?? '';
  return forms.other ? { other: forms.other, ...(forms.one ? { one: forms.one } : {}) } : undefined;
}

export interface Found {
  lines: Line[];
  /** t(…), phrase(…) or no(…) called with something that is not a literal line (fine for tables in DATA; listed for the tool). */
  dynamic: string[];
  /** English shown in the interface without t(): text, title or aria-label given to el()/iconButton(), a toast or banner. */
  bare: { where: string; text: string }[];
}

/** Interface text that is not words to translate. */
const NOT_WORDS = new Set(['Little City', '—', '…', '×', '+', '−', '?']);
const isWords = (s: string): boolean => /[A-Za-z]{2,}/.test(s) && !NOT_WORDS.has(s);

export function scan(): Found {
  const lines: Line[] = [];
  const dynamic: string[] = [];
  const bare: Found['bare'] = [];
  // src, and the pages search engines and link previews read (tools/seo/site.ts).
  for (const file of [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'tools', 'seo', 'site.ts')]) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!/\b(t|phrase|no|el|iconButton|toast|banner)\(/.test(text)) continue;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const at = (n: ts.Node): string => `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const ui = rel.startsWith(`src${path.sep}ui`) || rel.startsWith(`src${path.sep}app`);
    const checkBare = (n: ts.Node | undefined): void => {
      const s = literal(n);
      if (n && s !== undefined && isWords(s)) bare.push({ where: at(n), text: s });
      if (n && ts.isTemplateExpression(n) && isWords(n.head.text + n.templateSpans.map((x) => x.literal.text).join(''))) bare.push({ where: at(n), text: n.getText() });
      if (n && ts.isConditionalExpression(n)) {
        checkBare(n.whenTrue);
        checkBare(n.whenFalse);
      }
    };
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        const arg = n.arguments[0];
        const isLineCall = name === 't' || name === 'phrase' || (name === 'no' && rel === path.join('src', 'world', 'world.ts'));
        if (isLineCall && arg) {
          const s = literal(arg);
          const plural = name === 't' ? pluralOf(arg) : undefined;
          if (s !== undefined) lines.push({ key: s, where: at(arg) });
          else if (plural) lines.push({ key: plural.other, plural, where: at(arg) });
          else dynamic.push(`${at(arg)} ${name}(${arg.getText().slice(0, 60)})`);
        }
        if (ui && (name === 'el' || name === 'iconButton')) {
          if (name === 'iconButton') checkBare(n.arguments[1]);
          const props = n.arguments[name === 'el' ? 1 : 2];
          if (props && ts.isObjectLiteralExpression(props)) {
            for (const p of props.properties) {
              if (!ts.isPropertyAssignment(p)) continue;
              const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
              if (key === 'text' || key === 'title') checkBare(p.initializer);
              if (key === 'attrs' && ts.isObjectLiteralExpression(p.initializer))
                for (const a of p.initializer.properties)
                  if (ts.isPropertyAssignment(a) && ts.isStringLiteral(a.name) && (a.name.text === 'aria-label' || a.name.text === 'title' || a.name.text === 'placeholder')) checkBare(a.initializer);
            }
          }
        }
      }
      if (ui && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['toast', 'banner', 'linkBox', 'refuse', 'say'].includes(n.expression.name.text)) checkBare(n.arguments[0]);
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return { lines, dynamic, bare };
}

/** Every line once, in the order found (source first, then the tables). */
export function allLines(): Line[] {
  const seen = new Map<string, Line>();
  for (const l of [...scan().lines, ...dataLines()]) {
    const had = seen.get(l.key);
    if (!had) seen.set(l.key, l);
    else if (l.plural && !had.plural) seen.set(l.key, { ...l, where: had.where });
  }
  return [...seen.values()];
}

export const LOCALES = path.join(ROOT, 'src', 'i18n', 'locales');

export function readLocale(lang: string): Record<string, string | Record<string, string>> {
  const file = path.join(LOCALES, `${lang}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

/** The `{names}` in a line, sorted. */
export const details = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
