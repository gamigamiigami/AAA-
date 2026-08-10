/**
 * Preview a single microgame in a real browser and save screenshots.
 *
 *   node tools/preview.mjs dodge          # levels 1 and 3
 *   node tools/preview.mjs dodge 2        # one level
 *   node tools/preview.mjs dodge 1 --shots 6   # a strip through the whole play
 *
 * Loads the game directly from src/microgames/<id>/game.js, so a game can be
 * previewed before it is registered.
 *
 * LOOK AT THE PNGs. A microgame that only passes a typecheck is not finished.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { serveDir } from './server.mjs';

const OUT = 'qa-out';
const argv = process.argv.slice(2);
const id = argv[0];
const levelArg = argv[1] && !argv[1].startsWith('--') ? Number(argv[1]) : null;
const shotsIdx = argv.indexOf('--shots');
const shotCount = shotsIdx >= 0 ? Number(argv[shotsIdx + 1] ?? 4) : 1;

if (!id) {
  console.error('usage: node tools/preview.mjs <gameId> [level] [--shots N]');
  process.exit(1);
}

const levels = levelArg ? [levelArg] : [1, 3];

async function waitFor(page, fn, label, timeout = 15000) {
  const start = Date.now();
  for (;;) {
    let v = false;
    try {
      v = await page.evaluate(fn);
    } catch {
      /* transient */
    }
    if (v) return;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await page.waitForTimeout(80);
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const server = await serveDir('src');
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  /** @type {string[]} */
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${server.url}/?seed=preview`, { waitUntil: 'load' });
  await waitFor(page, () => !!window.__game?.ready, '__game.ready');
  await page.evaluate(() => window.__game.setMuted(true));

  const written = [];
  for (const level of levels) {
    await page.evaluate(
      ([gid, lv]) => {
        window.__qaFrom = window.__game.sessionSerial;
        return window.__game.tryGame(gid, lv);
      },
      [id, level],
    );
    // Comparing session serials avoids catching the previous run's 'play'.
    await waitFor(
      page,
      () =>
        window.__game.sessionSerial !== window.__qaFrom &&
        window.__game.session()?.phase === 'play',
      `${id} L${level} play`,
    );

    for (let i = 0; i < shotCount; i++) {
      await page.waitForTimeout(i === 0 ? 500 : 600);
      const name =
        shotCount === 1 ? `preview-${id}-L${level}.png` : `preview-${id}-L${level}-${i}.png`;
      await page.screenshot({ path: path.join(OUT, name) });
      written.push(name);
    }

    // Report how the round ended: a game that never resolves is a bug.
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => window.__game.session());
    console.log(`L${level}: phase=${s?.phase} score=${s?.score} lives=${s?.lives}`);
  }

  const stats = await page.evaluate(() => window.__game.stats);
  console.log(`fps ${stats.fps.toFixed(0)} (worst frame ${stats.worstMs.toFixed(0)}ms)`);
  console.log(`screenshots: ${written.map((w) => `${OUT}/${w}`).join(' ')}`);
  if (errors.length) {
    console.error('\nERRORS:');
    errors.forEach((e) => console.error('  ' + e));
  }

  await browser.close();
  await server.close();
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
