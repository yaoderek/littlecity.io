// The game says everything in every language it offers (src/i18n/index.ts): no line missing, none left over
// from English that changed, the same {details} in each translation, and no English in the interface that
// skipped t(). `npm run translate` lists what to do.

import { describe, expect, test } from 'vitest';
import { LANGS } from '@/i18n';
import { allLines, details, readLocale, scan } from './lines';

const lines = allLines();
const OTHERS = LANGS.filter((l) => l !== 'en');

describe('languages', () => {
  test('the source has lines to translate', () => {
    expect(lines.length).toBeGreaterThan(300);
  });

  test('no English in the interface skips t()', () => {
    expect(scan().bare.map((b) => `${b.where}  ${b.text}`)).toEqual([]);
  });

  test.each(OTHERS)('%s has every line, and nothing else', (lang) => {
    const table = readLocale(lang);
    const missing = lines.filter((l) => !(l.key in table)).map((l) => `${l.where}  ${l.key}`);
    const keys = new Set(lines.map((l) => l.key));
    const extra = Object.keys(table).filter((k) => !keys.has(k));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  test.each(OTHERS)('%s keeps every line\'s {details}, and counts have their forms', (lang) => {
    const table = readLocale(lang);
    const wrong: string[] = [];
    for (const l of lines) {
      const v = table[l.key];
      if (v === undefined) continue;
      const want = details(l.key).join(',');
      if (l.plural) {
        if (typeof v !== 'object' || !v.other) wrong.push(`${l.key}: a counted line needs { "other": … } (and its other forms)`);
        // A form other than `other` may leave the count out ("a minute ago", "il y a une minute").
        else for (const [form, s] of Object.entries(v)) if (details(s).join(',') !== want && !(form !== 'other' && details(s).join(',') === details(l.key).filter((d) => d !== 'n').join(','))) wrong.push(`${l.key} [${form}]: ${s}`);
      } else if (typeof v !== 'string') wrong.push(`${l.key}: should be a plain line`);
      else if (details(v).join(',') !== want) wrong.push(`${l.key}: ${v}`);
      if (typeof v === 'string' && v.trim() === '') wrong.push(`${l.key}: empty`);
      // Lines for the web pages carry a little HTML (<strong>, <a href="{guide}">): the same tags, in any order.
      const tags = (x: string): string => [...x.matchAll(/<[^>]+>/g)].map((m) => m[0]).sort().join('');
      for (const form of typeof v === 'string' ? [v] : Object.values(v)) if (tags(form) !== tags(l.key)) wrong.push(`${l.key}: its tags differ: ${form}`);
    }
    expect(wrong).toEqual([]);
  });
});
