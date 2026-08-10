/**
 * QA harness.
 *
 * The rule for this project is that visual quality is judged from real
 * screenshots of a real browser, never from reading the code. This script
 * produces those screenshots, and mechanically checks the things a human eye
 * is bad at: console errors, missing Japanese glyphs, frame rate, and whether
 * every microgame is still both losable and winnable.
 *
 *   node tools/qa.mjs            # everything, against src/
 *   node tools/qa.mjs --dist     # same, against the bundled single file
 *   node tools/qa.mjs --shots    # screenshots only (fast iteration)
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { serveDir } from './server.mjs';

const OUT = 'qa-out';
const args = process.argv.slice(2);
const useDist = args.includes('--dist');
const only = (name) => args.includes(`--${name}`);
const runAll = !args.some((a) => ['--shots', '--soak', '--solve'].includes(a));

/** Devices chosen to bracket the aspect-ratio contract: tall, wide, and square. */
const PROFILES = [
  { name: 'phone', width: 390, height: 844, dpr: 3, touch: true },
  { name: 'tablet', width: 1180, height: 820, dpr: 2, touch: true },
  { name: 'desktop', width: 1280, height: 960, dpr: 1, touch: true },
];

const JP_SAMPLE = [
  ...'よけろミニゲームラッシュステージえらぶけっかクリアしんきろくスピードアップぎんメダルもういちどタップして',
];

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  x ${msg}`);
};
const ok = (msg) => console.log(`  . ${msg}`);

async function waitFor(page, fn, { timeout = 15000, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    let v = false;
    try {
      v = await page.evaluate(fn);
    } catch {
      /* page may be mid-navigation */
    }
    if (v) return true;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await page.waitForTimeout(80);
  }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

/**
 * Start a locked practice run and wait until it is genuinely playing.
 * Comparing session serials matters: without it, a poll for phase==='play'
 * happily matches the PREVIOUS run that has not torn down yet, and the
 * screenshot captures the wrong game.
 */
async function startPractice(page, id, level) {
  await page.evaluate(
    ([gameId, lv]) => {
      window.__qaFrom = window.__game.sessionSerial;
      window.__game.practice(gameId, lv);
    },
    [id, level],
  );
  await waitFor(
    page,
    () =>
      window.__game.sessionSerial !== window.__qaFrom && window.__game.session()?.phase === 'play',
    { label: `${id} L${level} play` },
  );
}

async function newPage(browser, profile, url) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    hasTouch: profile.touch,
    isMobile: profile.name === 'phone',
  });
  const page = await context.newPage();
  /** @type {string[]} */
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(`[${profile.name}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[${profile.name}] pageerror: ${e.message}`));
  // A fixed seed makes every screenshot reproducible across runs.
  await page.goto(`${url}/?seed=qa-1`, { waitUntil: 'load' });
  await waitFor(page, () => !!window.__game?.ready, { label: '__game.ready' });
  return { context, page, errs };
}

/* ------------------------------------------------------------ font check */

async function checkGlyphs(page) {
  const result = await page.evaluate((chars) => {
    const stack =
      '"Hiragino Maru Gothic ProN", "Hiragino Sans", "YuGothic", "Yu Gothic UI", ' +
      '"Noto Sans JP", "Noto Sans CJK JP", "Meiryo", system-ui, sans-serif';
    const cv = document.createElement('canvas');
    cv.width = 72;
    cv.height = 72;
    const x = cv.getContext('2d');
    const render = (ch) => {
      x.clearRect(0, 0, 72, 72);
      x.font = `900 52px ${stack}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#000';
      x.fillText(ch, 36, 36);
      return x.getImageData(0, 0, 72, 72).data;
    };
    const isEmpty = (d) => {
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
      return true;
    };
    const same = (a, b) => {
      for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false;
      return true;
    };
    // U+E000 is private-use: no real font ships a glyph for it, so whatever it
    // renders as IS this browser's "missing glyph" box.
    const ref = render('');
    const refEmpty = isEmpty(ref);
    const bad = [];
    for (const ch of chars) {
      const d = render(ch);
      if (isEmpty(d)) bad.push(`${ch}(blank)`);
      else if (!refEmpty && same(d, ref)) bad.push(`${ch}(tofu)`);
    }
    return bad;
  }, JP_SAMPLE);

  if (result.length) fail(`Japanese glyphs not rendering: ${result.join(' ')}`);
  else ok(`Japanese glyphs render (${JP_SAMPLE.length} sampled)`);
}

/* ----------------------------------------------------------- screenshots */

async function captureScreens(browser, url) {
  console.log('\n> screenshots');
  for (const profile of PROFILES) {
    const { context, page, errs } = await newPage(browser, profile, url);

    await page.waitForTimeout(700);
    await shot(page, `${profile.name}-01-title`);

    // Tap the middle of the screen to start, exactly as a player would.
    await page.touchscreen.tap(profile.width / 2, profile.height / 2);
    await waitFor(page, () => window.__game.screen === 'select', { label: 'select' });
    await page.waitForTimeout(900);
    await shot(page, `${profile.name}-02-select`);

    await page.evaluate(() => window.__game.startSession('town'));
    await waitFor(page, () => window.__game.session()?.phase === 'intro', { label: 'intro' });
    await page.waitForTimeout(260);
    await shot(page, `${profile.name}-03-prompt`);

    await waitFor(page, () => window.__game.session()?.phase === 'play', { label: 'play' });
    await page.waitForTimeout(700);
    await shot(page, `${profile.name}-04-play`);

    await waitFor(page, () => window.__game.session()?.phase === 'resolve', { label: 'resolve' });
    await page.waitForTimeout(220);
    await shot(page, `${profile.name}-05-resolve`);

    if (profile.name === 'phone') await checkGlyphs(page);

    if (errs.length) errs.forEach(fail);
    else ok(`${profile.name}: no console errors`);
    await context.close();
  }

  // Every microgame at level 1 and level 3, on the touch profile.
  const profile = PROFILES[0];
  const { context, page, errs } = await newPage(browser, profile, url);
  const games = await page.evaluate(() => window.__game.listGames());
  console.log(`  - ${games.length} microgame(s) registered`);
  for (const gme of games) {
    for (const level of [1, 3]) {
      await startPractice(page, gme.id, level);
      await page.waitForTimeout(850);
      await shot(page, `game-${gme.id}-L${level}`);
    }
  }
  errs.forEach(fail);
  await context.close();
}

/* ------------------------------------------------------- progression soak */

/**
 * No-input soak: with the player doing nothing at all, every microgame must
 * still resolve and the run must reach the results screen. This is the check
 * that catches a game which can silently hang the whole collection.
 */
async function soak(browser, url) {
  console.log('\n> no-input soak');
  const { context, page, errs } = await newPage(browser, PROFILES[0], url);
  await page.evaluate(() => {
    window.__game.setMuted(true);
    window.__game.startSession('town');
  });

  const start = Date.now();
  let reached = false;
  let lastPhase = '';
  let stuckSince = Date.now();
  while (Date.now() - start < 60000) {
    const s = await page.evaluate(() => ({
      screen: window.__game.screen,
      session: window.__game.session(),
    }));
    if (s.screen === 'results') {
      reached = true;
      break;
    }
    const phase = s.session ? `${s.session.gameIndex}:${s.session.phase}` : 'none';
    if (phase !== lastPhase) {
      lastPhase = phase;
      stuckSince = Date.now();
    } else if (Date.now() - stuckSince > 12000) {
      fail(`progression stalled in phase ${phase} for 12s`);
      break;
    }
    await page.waitForTimeout(200);
  }

  if (reached) {
    await page.waitForTimeout(2500);
    await shot(page, 'soak-results');
    ok('idle run reached the results screen');
  } else if (!failures.length) {
    fail('idle run never reached the results screen within 60s');
  }
  errs.forEach(fail);
  await context.close();
}

/* --------------------------------------------------------- winnability */

/**
 * Winnability: drive each microgame with its own debug hint (a microgame may
 * expose `debugHint()` describing the correct action right now) and assert it
 * can actually be cleared. Games without a hint fall back to random input over
 * several attempts, which is weaker but still catches "impossible to win".
 */
async function solve(browser, url) {
  console.log('\n> winnability');
  const profile = PROFILES[2]; // desktop: 1:1 CSS pixels make pointer maths simple
  const { context, page, errs } = await newPage(browser, profile, url);
  await page.evaluate(() => window.__game.setMuted(true));
  const games = await page.evaluate(() => window.__game.listGames());

  for (const gme of games) {
    let won = false;
    for (let attempt = 0; attempt < 4 && !won; attempt++) {
      await startPractice(page, gme.id, 1);
      const before = await page.evaluate(() => window.__game.session().score);

      for (let step = 0; step < 60; step++) {
        const hint = await page.evaluate(() => window.__game.hint());
        if (hint) await applyHint(page, hint);
        else await page.mouse.click(Math.random() * profile.width, Math.random() * profile.height);
        const phase = await page.evaluate(() => window.__game.session()?.phase);
        if (phase !== 'play') break;
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => window.__game.session()?.score ?? 0);
      if (after > before) won = true;
    }
    if (won) ok(`${gme.id}: winnable`);
    else fail(`${gme.id}: could not be won in 4 attempts`);
  }
  await page.mouse.up().catch(() => {});
  errs.forEach(fail);
  await context.close();
}

async function applyHint(page, hint) {
  const p = await page.evaluate(
    ([vx, vy]) => window.__game.toScreen(vx, vy),
    [hint.x ?? 540, hint.y ?? 960],
  );
  if (!p) return;
  switch (hint.type) {
    case 'tap':
      await page.mouse.click(p.x, p.y);
      break;
    case 'drag':
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x, p.y, { steps: 1 });
      break;
    case 'swipe':
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + (hint.dx ?? 0) * 0.4, p.y + (hint.dy ?? 0) * 0.4, { steps: 4 });
      await page.mouse.up();
      break;
    case 'hold':
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      break;
    case 'release':
      await page.mouse.up();
      break;
  }
}

/* ---------------------------------------------------------- performance */

async function perf(browser, url) {
  console.log('\n> performance');
  const { context, page, errs } = await newPage(browser, PROFILES[0], url);
  await page.evaluate(() => {
    window.__game.setMuted(true);
    window.__game.startSession('neon');
  });
  await page.waitForTimeout(6000);
  const stats = await page.evaluate(() => window.__game.stats);
  if (stats.fps < 50) fail(`frame rate too low: ${stats.fps.toFixed(1)}fps`);
  else ok(`frame rate ${stats.fps.toFixed(0)}fps (worst frame ${stats.worstMs.toFixed(0)}ms)`);
  errs.forEach(fail);
  await context.close();
}

/* ---------------------------------------------------------------- main */

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  const root = useDist ? 'dist' : 'src';
  const server = await serveDir(root);
  console.log(`serving ${root} at ${server.url}`);

  const browser = await chromium.launch({
    args: [
      // Let the music start without a gesture so audio-clock code is exercised.
      '--autoplay-policy=no-user-gesture-required',
      '--font-render-hinting=none',
    ],
  });

  try {
    if (runAll || only('shots')) await captureScreens(browser, server.url);
    if (runAll || only('soak')) await soak(browser, server.url);
    if (runAll || only('solve')) await solve(browser, server.url);
    if (runAll) await perf(browser, server.url);
  } finally {
    await browser.close();
    await server.close();
  }

  const files = (await fs.readdir(OUT)).filter((f) => f.endsWith('.png'));
  console.log(`\n${files.length} screenshots in ${OUT}/`);
  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
