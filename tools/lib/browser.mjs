// Headless Chromium with WebGL, for screenshots, the benchmark and browser
// tests (Stage 0, frozen). Installs Playwright's Chromium if it is missing.

import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT } from './vite.mjs';

// Ask for the real GPU through ANGLE's Metal backend on macOS. Anywhere else (the gate on GitHub's
// Linux machines, .github/workflows/gate.yml) there is no graphics card to ask for: draw WebGL in
// software (SwiftShader).
const ANGLE = process.platform === 'darwin' ? 'metal' : 'swiftshader';
const ARGS = ['--ignore-gpu-blocklist', '--enable-gpu', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader'];

export async function launchBrowser() {
  const launch = () => chromium.launch({ headless: true, args: ARGS });
  try {
    return await launch();
  } catch (err) {
    if (!/Executable doesn't exist|playwright install/i.test(String(err?.message))) throw err;
    console.error('Playwright Chromium is missing; installing it (one time)…');
    execFileSync('npx', ['playwright', 'install', 'chromium'], { cwd: ROOT, stdio: 'inherit' });
    return await launch();
  }
}

/**
 * Opens a page of the dev server and fails loudly on page errors.
 * Returns { page, errors }: `errors` collects uncaught exceptions and console errors.
 */
export async function openPage(browser, url, { width = 1280, height = 800, scale = 1, welcome = false, ...context } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, ...context });
  // The game greets a first visit with a welcome card that covers the town. Tools and tests are not
  // first-time players: mark it seen unless a test asks for it with { welcome: true }.
  if (!welcome) {
    await ctx.addInitScript(() => {
      try {
        globalThis.localStorage.setItem('lc:welcomed', '1');
      } catch {
        // No storage on this page (about:blank, file:): nothing to mark.
      }
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url, { waitUntil: 'load' });
  return { page, errors };
}
