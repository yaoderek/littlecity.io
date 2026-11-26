import { afterEach, describe, expect, test } from 'vitest';
import { phrase } from '@/core/phrase';
import { pickLang, say, setKindNames, setLanguage, t } from './index';

afterEach(() => {
  setLanguage('en');
  setKindNames((k) => k);
});

describe('t', () => {
  test('English is the line itself, details filled in', () => {
    expect(t('Grow a town')).toBe('Grow a town');
    expect(t('Open {name}', { name: 'Town 2' })).toBe('Open Town 2');
  });

  test('a translation, and English for a line it lacks', () => {
    setLanguage('fr', { 'Grow a town': 'Faire pousser une ville', 'Open {name}': 'Ouvrir {name}' });
    expect(t('Grow a town')).toBe('Faire pousser une ville');
    expect(t('Open {name}', { name: 'Ville 2' })).toBe('Ouvrir Ville 2');
    expect(t('Not translated')).toBe('Not translated');
  });

  test('counts take the language\'s plural forms and its digit grouping', () => {
    const line = { one: '{n} minute ago', other: '{n} minutes ago' };
    expect(t(line, { n: 1 })).toBe('1 minute ago');
    expect(t(line, { n: 5 })).toBe('5 minutes ago');
    expect(t(line, { n: 1200 })).toBe('1,200 minutes ago');
    setLanguage('fr', { '{n} minutes ago': { one: 'il y a {n} minute', other: 'il y a {n} minutes' } });
    expect(t(line, { n: 1 })).toBe('il y a 1 minute');
    expect(t(line, { n: 3 })).toBe('il y a 3 minutes');
    setLanguage('ja', { '{n} minutes ago': { other: '{n}分前' } });
    expect(t(line, { n: 1 })).toBe('1分前');
  });
});

describe('pickLang', () => {
  test('?lang=, then the player\'s choice, then the browser, then the address\'s language, then English', () => {
    expect(pickLang({ browser: ['ja-JP', 'en-US'] })).toBe('ja');
    expect(pickLang({ browser: ['it-IT', 'fr-CA'] })).toBe('fr');
    expect(pickLang({ browser: ['de-AT'] })).toBe('de');
    expect(pickLang({ browser: ['tr-TR'] })).toBe('tr');
    expect(pickLang({ browser: ['zh-TW'] })).toBe('zh');
    expect(pickLang({ browser: ['it-IT'] })).toBe('en');
    // The address's language (/ja/, a shared link) only when the browser's is none we have.
    expect(pickLang({ browser: ['it-IT'], path: '/ja/' })).toBe('ja');
    expect(pickLang({ browser: ['ko-KR'], path: '/ja/' })).toBe('ko');
    expect(pickLang({ browser: [], path: '/guide/' })).toBe('en');
    expect(pickLang({ chosen: 'ko', browser: ['ja'] })).toBe('ko');
    expect(pickLang({ param: 'pt', chosen: 'ko', browser: ['ja'] })).toBe('pt');
    expect(pickLang({ param: 'xx', chosen: 'nope', browser: [] })).toBe('en');
  });
});

describe('say', () => {
  test('reads a phrased core line back into the player\'s language, the piece by its tray name', () => {
    const english = phrase('a {kind} needs firm ground or the top of a solid block', { kind: 'windmill' });
    expect(english).toBe('a windmill needs firm ground or the top of a solid block');
    expect(say(english)).toBe(english);
    setLanguage('fr', {
      'a {kind} needs firm ground or the top of a solid block': 'un bloc {kind} a besoin d’un sol ferme',
      'outside the map': 'hors de la carte',
      Mill: 'Moulin',
    });
    setKindNames((k) => (k === 'windmill' ? t('Mill') : k));
    expect(say(english)).toBe('un bloc Moulin a besoin d’un sol ferme');
    expect(say('outside the map')).toBe('hors de la carte');
    expect(say('something nobody wrote down')).toBe('something nobody wrote down');
  });

  test('a reason inside a reason', () => {
    const english = phrase('{reason} It is kept here; a newer Little City may open it.', { reason: 'outside the map' });
    setLanguage('fr', { '{reason} It is kept here; a newer Little City may open it.': '{reason} Elle reste ici.', 'outside the map': 'Hors de la carte.' });
    expect(say(english)).toBe('Hors de la carte. Elle reste ici.');
  });
});
