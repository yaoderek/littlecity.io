// Lint (Stage 0, frozen). Two jobs beyond the usual:
//
//  1. THE PURITY BAN. Town logic is a pure function of the saved world, so
//     under src/core, src/terrain, src/resolve, src/rules, src/gen, src/parts
//     and src/scenario there is no Math.random, no clock, no DOM. Chance
//     comes from rand(seed, ...) in src/core/rand.ts.
//  2. THE LAYERS. core, vocab, i18n ← style ← world, terrain ← resolve, rules, townmaker ←
//     scenario, guide ← gen, parts ← life, render ← ui, app. A module may import
//     from its own layer and the ones before it, never from a later one.
//     (Checked on '@/...' imports: use the alias to import across modules.)

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const LAYERS = [
  ['core', 'vocab', 'i18n'],
  ['style'],
  ['world', 'terrain'],
  ['resolve', 'rules', 'townmaker'],
  ['scenario', 'guide'],
  ['gen', 'parts'],
  ['life', 'render', 'fly'],
  ['ui', 'app'],
];

const PURE = ['core', 'terrain', 'resolve', 'rules', 'townmaker', 'gen', 'parts', 'scenario', 'guide'];
/** Pure code that may not use Three.js at all (gen and parts may use its maths). */
const NO_THREE = ['core', 'vocab', 'style', 'world', 'terrain', 'resolve', 'rules', 'townmaker', 'scenario', 'fly'];

const purityRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Town logic is deterministic: use rand(seed, ...) from @/core/rand.' },
    { object: 'crypto', property: 'getRandomValues', message: 'Town logic is deterministic: use rand(seed, ...) from @/core/rand.' },
  ],
  'no-restricted-globals': [
    'error',
    ...['Date', 'performance'].map((name) => ({ name, message: 'Town logic never reads the clock. Only src/life does, through Signals.' })),
    ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'fetch'].map(
      (name) => ({ name, message: 'Town logic is plain data in, plain data out: no DOM, no timers, no network.' }),
    ),
  ],
};

function importRules(dir) {
  const index = LAYERS.findIndex((layer) => layer.includes(dir));
  const later = LAYERS.slice(index + 1).flat();
  const patterns = [];
  if (later.length > 0) {
    patterns.push({
      regex: `^@/(${later.join('|')})(/|$)`,
      message: `src/${dir} is in an earlier layer and may not import from: ${later.join(', ')}. See eslint.config.js.`,
    });
  }
  if (NO_THREE.includes(dir)) {
    patterns.push({ regex: '^three(/|$)', message: `src/${dir} is pure data and logic: no Three.js here.` });
  } else if (PURE.includes(dir)) {
    patterns.push({
      regex: '^three/(addons|examples)/',
      message: `src/${dir} may use Three.js maths and BufferGeometry helpers only, not scene or DOM code.`,
    });
  }
  return patterns.length > 0 ? { 'no-restricted-imports': ['error', { patterns }] } : {};
}

export default tseslint.config(
  { ignores: ['dist/**', 'server/dist/**', 'node_modules/**', 'spike/**', '.context/**', '.gstack/**', 'docs/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  ...LAYERS.flat().map((dir) => ({
    files: [`src/${dir}/**/*.ts`],
    ignores: ['**/*.test.ts'],
    rules: { ...(PURE.includes(dir) ? purityRules : {}), ...importRules(dir) },
  })),
  {
    // The world module may use timers and storage (autosave) but never chance.
    files: ['src/world/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-restricted-properties': purityRules['no-restricted-properties'] },
  },
  {
    files: ['tools/**/*.mjs', '*.js', '*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', window: 'readonly', document: 'readonly' },
    },
  },
);
