import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Two projects, one runner:
//   unit  every *.test.ts beside the code, in tests/ and in scenarios/ (Node, fast).
//   e2e   every *.e2e.test.ts: real headless Chromium against one shared dev server on
//         a free port (tests/helpers/browser.ts, tests/helpers/e2e-server.ts).
// `npm test` runs unit, `npm run e2e` runs e2e, `npm run check` runs both: unit first, then e2e, never
// at the same time (browsers starved by CPU-bound unit workers were most of the load timeouts).
//
// Two tiers (docs/swarm/test-diet.md): `npm run check` is the fast gate; `npm run check:full` sets
// LC_FULL=1, which turns on the big sweeps, long simulations and heavy scans (tests/helpers/tier.ts).
//
// Timeouts are honest ones for a busy shared machine: a fast-tier test that needs more than its
// project's timeout is a bug in the test (too big for the gate), not a reason to raise the timeout.
const FULL = process.env.LC_FULL === '1';
// The gate on GitHub (.github/workflows/gate.yml): its Mac has three slow cores, and a few browser tests
// that depend on timing (the first visit, touch drags, a town's growth) miss by a frame there, a
// different one or two each run. Two browsers at a time and two more tries; a test that needed one is
// reported as retried.
const CI = process.env.CI === 'true';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            sequence: { groupOrder: 0 },
            // Several agents share this machine; the default 5 s is too tight under load.
            testTimeout: FULL ? 300_000 : 60_000,
            include: ['{src,tests,scenarios,gallery,tools}/**/*.test.ts'],
            exclude: ['**/*.e2e.test.ts', '**/node_modules/**'],
          },
        },
        {
          extends: true,
          test: {
            name: 'e2e',
            environment: 'node',
            sequence: { groupOrder: 1 },
            include: ['{src,tests,scenarios,gallery,tools}/**/*.e2e.test.ts'],
            exclude: ['**/node_modules/**'],
            globalSetup: ['tests/helpers/e2e-server.ts'],
            // Each worker drives its own Chromium with WebGL: a few at a time, not one per core.
            maxWorkers: CI ? 2 : 3,
            retry: CI ? 2 : 0,
            testTimeout: 120_000,
            hookTimeout: 120_000,
          },
        },
      ],
    },
  }),
);
