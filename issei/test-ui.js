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
  // 外部フォントはこの検証環境からは取れない（本番と公開先では読める）
  const netFail = (t) => /Failed to load resource/.test(t);
  screen.on('console', m => {
    if (m.type() === 'error' && !netFail(m.text())) errors.push('[screen] ' + m.text());
  });
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
    pg.on('console', m => {
      if (m.type() === 'error' && !netFail(m.text())) errors.push('[phone] ' + m.text());
    });
    await pg.goto(BASE + '/phone.html' + (lag ? '?lag=' + lag : ''));
    await pg.fill('#name', names[i]);
    await pg.click('#go');
    phones.push(pg);
  }
  await sleep(2500);
  await phones[0].screenshot({ path: path.join(OUT, '02-phone-wait.png') });
  await screen.screenshot({ path: path.join(OUT, '03-lobby-joined.png') });

  // ---- せーの
  await screen.evaluate(() => fetch('/api/start?game=seino', { method: 'POST' }));
  await sleep(900);
  await screen.screenshot({ path: path.join(OUT, '04-seino-countin.png') });

  const delays = [980, 1010, 1040, 900, 1120, 1000];
  await Promise.all(phones.map(async (pg, i) => {
    await sleep(delays[i]);
    await pg.click('#btn');
  }));
  await sleep(2600);
  await screen.screenshot({ path: path.join(OUT, '05-seino-reveal.png') });
  await phones[0].screenshot({ path: path.join(OUT, '06-phone-result.png') });

  const seinoState = await (await fetch(BASE + '/api/state')).json();
  const seinoAnswered = seinoState.last
    ? seinoState.last.entries.filter(e => e.error !== null).length : 0;

  // ---- だるまさんがころんだ
  await fetch(BASE + '/api/stop', { method: 'POST' });
  await sleep(200);
  await fetch(BASE + '/api/start?game=daruma', { method: 'POST' });
  await sleep(120);
  const dg = (await (await fetch(BASE + '/api/state')).json()).g;

  /* 掛け声の間だけ押しっぱなしにする。各自ばらばらの「離す余裕」を持たせ、
   * 最後の1人だけ離すのが遅すぎて捕まるようにする。
   * テストはサーバーと同じプロセスなので performance.now() がそのまま共通時計。 */
  const margins = [500, 350, 250, 150, 700, -250];
  const holdRuns = phones.map(async (pg, i) => {
    await pg.mouse.move(195, 420);
    for (const ch of dg.chants.slice(0, 5)) {
      const releaseAt = ch.turnAt - margins[i];
      if (releaseAt - performance.now() < 120) continue;   // もう間に合わない掛け声は飛ばす
      const wait = ch.start - performance.now();
      if (wait > 0) await sleep(wait);
      await pg.mouse.down();
      const hold = releaseAt - performance.now();
      if (hold > 0) await sleep(hold);
      await pg.mouse.up();
    }
  });

  await sleep(1600);
  await screen.screenshot({ path: path.join(OUT, '07-daruma-play.png') });
  await Promise.all(holdRuns);

  // 判定は endsAt まで待つ
  let ds;
  do { await sleep(300); ds = await (await fetch(BASE + '/api/state')).json(); }
  while (ds.phase === 'play');
  await sleep(300);
  await screen.screenshot({ path: path.join(OUT, '08-daruma-reveal.png') });

  const st = await (await fetch(BASE + '/api/state')).json();
  const dm = st.last && st.last.game === 'daruma' ? st.last : null;
  const moved = dm ? dm.entries.filter(e => e.dist > 0).length : 0;
  const caught = dm ? dm.entries.filter(e => e.caught).length : 0;

  console.log('\n  参加人数              ' + st.players.length);
  console.log('  せーの: 入力できた人数  ' + seinoAnswered + ' / ' + names.length);
  console.log('  せーの: ばらつき        ' + (seinoState.last ? seinoState.last.spread + 'ms' : '—'));
  console.log('  だるま: 前進した人数    ' + moved + ' / ' + names.length);
  console.log('  だるま: つかまった人数  ' + caught);
  console.log('  エラー                ' + (errors.length ? '\n    ' + errors.join('\n    ') : '(なし)'));
  console.log('  スクリーンショット      ' + OUT);

  const pass = errors.length === 0 && seinoAnswered === names.length && moved >= 4;
  console.log('\n  ' + (pass ? 'PASS' : 'FAIL') + '\n');

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
