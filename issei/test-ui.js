/* 一斉 — 画面の煙テスト。
 * 実ブラウザでメイン画面とスマホを開き、参加→1ラウンド→結果まで通す。
 * コードを読んで「見た目は良い」と判断してはならないので、必ず撮る。
 *
 * 実行: node issei/test-ui.js
 */
'use strict';

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { server } = require('./server.js');

const PORT = 3998;
const BASE = 'http://127.0.0.1:' + PORT;
const OUT = path.join(__dirname, 'shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch();
  const errors = [];

  const screen = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  screen.on('pageerror', e => errors.push('[screen] ' + e.message));
  screen.on('console', m => { if (m.type() === 'error') errors.push('[screen] ' + m.text()); });
  await screen.goto(BASE + '/screen.html');
  await sleep(1200);
  await screen.screenshot({ path: path.join(OUT, '01-lobby.png') });

  // スマホを6台ぶん開く。うち1台には人工遅延を与える。
  const names = ['あお', 'みどり', 'きいろ', 'あか', 'しろ', 'くろ'];
  const phones = [];
  for (let i = 0; i < names.length; i++) {
    const lag = i === 5 ? 300 : 0;
    const pg = await browser.newPage({ viewport: { width: 390, height: 780 } });
    pg.on('pageerror', e => errors.push('[phone] ' + e.message));
    pg.on('console', m => { if (m.type() === 'error') errors.push('[phone] ' + m.text()); });
    await pg.goto(BASE + '/phone.html' + (lag ? '?lag=' + lag : ''));
    await pg.fill('#name', names[i]);
    await pg.click('#go');
    phones.push(pg);
  }
  await sleep(2500);
  await phones[0].screenshot({ path: path.join(OUT, '02-phone-wait.png') });
  await screen.screenshot({ path: path.join(OUT, '03-lobby-joined.png') });

  // 開始
  await screen.evaluate(() => fetch('/api/start', { method: 'POST' }));
  await sleep(900);
  await screen.screenshot({ path: path.join(OUT, '04-countin.png') });
  await phones[0].screenshot({ path: path.join(OUT, '05-phone-press.png') });

  // 各自ばらばらのタイミングで押す
  const delays = [980, 1010, 1040, 900, 1120, 1000];
  await Promise.all(phones.map(async (pg, i) => {
    await sleep(delays[i]);
    await pg.click('#btn');
  }));

  await sleep(2600);
  await screen.screenshot({ path: path.join(OUT, '06-reveal.png') });
  await phones[0].screenshot({ path: path.join(OUT, '07-phone-result.png') });

  const st = await (await fetch(BASE + '/api/state')).json();
  const answered = st.last ? st.last.entries.filter(e => e.error !== null).length : 0;

  console.log('\n  参加人数        ' + st.players.length);
  console.log('  入力できた人数   ' + answered);
  console.log('  ばらつき         ' + (st.last ? st.last.spread + 'ms' : '—'));
  console.log('  エラー           ' + (errors.length ? '\n    ' + errors.join('\n    ') : '(なし)'));
  console.log('  スクリーンショット ' + OUT);

  const pass = errors.length === 0 && answered === names.length;
  console.log('\n  ' + (pass ? 'PASS' : 'FAIL') + '\n');

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
