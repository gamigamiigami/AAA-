/* QA ハーネス — 実際にブラウザでゲームを起動し、
 * 各ミニゲームのプレイ画面をキャプチャして目視レビューできるようにする。
 *   node tools/qa.js            全ミニゲームを撮る
 *   node tools/qa.js dodge 2    1本だけ / 難易度指定
 * コンソールエラーは全て収集して最後にまとめて出す。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'qa-shots');

(async () => {
  const only = process.argv[2];
  const diff = parseInt(process.argv[3] || '1', 10);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none']
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });

  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction('window.GG && window.GG.debug', null, { timeout: 10000 });

  const ids = await page.evaluate(() => window.GG.debug.list());
  console.log('registered microgames (' + ids.length + '):', ids.join(', '));

  const shot = async (name) => {
    const el = await page.$('#screen');
    await el.screenshot({ path: path.join(OUT, name + '.png') });
  };

  await page.waitForTimeout(900);
  await shot('00-title');

  const targets = only ? [only] : ids;
  for (const id of targets) {
    await page.evaluate(([i, d]) => window.GG.debug.jump(i, d), [id, diff]);
    await page.waitForTimeout(450);
    await shot('p-' + id + '-prompt');
    await page.waitForTimeout(1400);   // 命令語が消えて本編に入るころ
    await shot('g-' + id);
    const state = await page.evaluate(() => ({
      state: window.GG.debug.game.state,
      result: window.GG.debug.game.result
    }));
    console.log(`  ${id.padEnd(14)} state=${state.state} result=${state.result}`);
  }

  // 通しプレイ: 40 秒放置して落ちないか（入力なし = ミスし続けてゲームオーバーまで）
  if (!only) {
    await page.evaluate(() => { window.GG.debug.free(); window.GG.debug.game.startRun(); });
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => window.GG.debug.game.state);
      if (st === 'gameover') { await shot('99-gameover'); break; }
    }
    const st = await page.evaluate(() => window.GG.debug.game.state);
    console.log('idle-run final state:', st);
  }

  console.log('\n--- console output ---');
  if (!errors.length) console.log('(no errors)');
  else errors.slice(0, 60).forEach(e => console.log(e));

  await browser.close();
  process.exit(errors.some(e => e.startsWith('PAGEERROR')) ? 1 : 0);
})();
