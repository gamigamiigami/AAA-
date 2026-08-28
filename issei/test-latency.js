/* 一斉 — 遅延公平性の検証
 *
 * この設計全体が「端末のタイムスタンプで判定すれば、通信の遅延は結果に効かない」
 * という一点の上に乗っている。ここが崩れると全部が崩れるので、機械で確かめる。
 *
 * やること:
 *   1. 仮想プレイヤーを作る。各自ばらばらの「時計のズレ」と「片道遅延」を持つ。
 *   2. 全員が時計合わせをする。
 *   3. 全員が、狙った人間的誤差（例: 12ms 早い）ちょうどに押す。
 *   4. サーバーが出した判定が、その人間的誤差と一致するかを見る。
 *
 * 合格条件: 片道 400ms の人も 5ms の人も、判定が人間的誤差と一致すること。
 *           つまり順位が回線ではなく腕前だけで決まること。
 *
 * 実行: node issei/test-latency.js
 */
'use strict';

const { performance } = require('perf_hooks');
const { server } = require('./server.js');

const PORT = 3999;
const BASE = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 仮想プレイヤー。
 *  skew  … 端末の時計原点のズレ（performance.now() の起点は端末ごとに違う）
 *  delay … 片道の通信遅延。往復はこの倍かかる
 *  human … その人が実際に押した瞬間の、目標からのズレ（＝腕前）
 */
class Player {
  constructor(name, skew, delay, human) {
    Object.assign(this, { name, skew, delay, human });
    this.offset = 0;
  }

  localNow() { return performance.now() + this.skew; }

  // 遅延と揺らぎを両方向に注入する。経路が非対称だと時計合わせは難しくなる。
  async hop() {
    await sleep(this.delay * (0.8 + Math.random() * 0.4));
  }

  async join() {
    await this.hop();
    const r = await (await fetch(BASE + '/api/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: this.name })
    })).json();
    await this.hop();
    this.id = r.id;
  }

  async sync(samples = 20) {
    const rows = [];
    for (let i = 0; i < samples; i++) {
      const t0 = this.localNow();
      await this.hop();
      const t1 = (await (await fetch(BASE + '/api/time')).json()).t1;
      await this.hop();
      const t2 = this.localNow();
      rows.push({ t0, t1, t2, rtt: t2 - t0 });
      await sleep(5);
    }
    // 区間交差。common.js の estimate() と同じ推定。
    let lo = -Infinity, hi = Infinity;
    for (const r of rows) {
      lo = Math.max(lo, r.t1 - r.t2);
      hi = Math.min(hi, r.t1 - r.t0);
    }
    if (lo <= hi) this.offset = (lo + hi) / 2;
    else {
      rows.sort((a, b) => a.rtt - b.rtt);
      this.offset = rows[0].t1 - (rows[0].t0 + rows[0].t2) / 2;
    }
    this.syncErr = this.offset - (-this.skew);
  }

  /** 目標時刻に対し、human ms ずれたところで押す。
   *
   * 重要: 押す瞬間は「本当の時刻」で決める。人間はメイン画面を見て押すのであって、
   * 自分のスマホの時計合わせの結果を見て押すわけではない。
   * ここを自分の推定時計で決めてしまうと、時計合わせの誤差が往復で相殺されて
   * テストが甘くなる。時計合わせの精度も含めて測るために、実時刻を使う。 */
  async playRound(target) {
    const realPress = target + this.human;          // 人間が押した「本当の瞬間」
    const localReading = realPress + this.skew;     // その瞬間に端末の時計が示す値
    const at = localReading + this.offset;          // 端末が推定オフセットで変換して送る値

    // ここを実時間のループで待つとテスト自身のタイマー精度が混ざるので、押下時刻は
    // 上のように解析的に決める。残る誤差は時計合わせの精度だけになり、それが測りたいもの。
    while (performance.now() < realPress) await sleep(2);
    await this.hop();                                // 届くまでの時間は判定に無関係
    await fetch(BASE + '/api/input', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: this.id, at })
    });
  }

  /* だるまさん。掛け声のたびに「turnAt の margin ms 前」に離す。
   * margin > 0 なら助かり、margin < 0 なら振り向きに間に合わず捕まる。
   * 送信は意図的に順不同・ばらばらの遅延で行う。
   * サーバーは届いた順ではなく時刻で並べ直すので、結果は変わらないはず。 */
  planDaruma(chants, margin, goalMs) {
    const evs = [];
    let held = 0;
    for (const ch of chants) {
      const from = ch.start;
      const to = ch.turnAt - margin;
      if (to <= from) continue;
      evs.push({ t: from, down: true }, { t: to, down: false });
      held += to - from;
      if (margin < 0) break;             // 捕まるのでここで終わり
      if (held >= goalMs) break;         // ゴールしたので以降は不要
    }
    this.plannedHeld = margin < 0 ? null : Math.min(held, goalMs);
    // 端末の時計で測った値をサーバー時刻に変換して送る（= 実際の端末と同じ経路）
    return evs.map(e => ({ t: e.t + this.skew + this.offset, down: e.down }));
  }

  async sendShuffled(evs) {
    const order = evs.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    await Promise.all(order.map(async (e) => {
      await sleep(Math.random() * this.delay * 2);   // 順不同かつばらばらに届く
      await fetch(BASE + '/api/input', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: this.id, t: e.t, down: e.down })
      });
    }));
  }
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  // 回線も端末もばらばら。human（腕前）だけが本来の実力差。
  const players = [
    new Player('同じWi-Fi',  0,      2,   +6),
    new Player('Wi-Fi混雑',  -84213, 12,  -38),
    new Player('4G',        612345, 35,  +95),
    new Player('4G 弱い',    -7777,  80,  -152),
    new Player('かなり悪い',  999999, 150, +210),
    new Player('テザリング',  31415,  200, -21)
  ];

  for (const p of players) await p.join();
  await Promise.all(players.map(p => p.sync()));

  console.log('\n  時計合わせの精度');
  console.log('  ' + '-'.repeat(52));
  for (const p of players) {
    console.log('  ' + p.name.padEnd(10) + '片道' + String(p.delay).padStart(4) + 'ms'
      + '   合わせ誤差 ' + p.syncErr.toFixed(1).padStart(6) + 'ms');
  }

  await fetch(BASE + '/api/start?game=seino', { method: 'POST' });

  let st;
  do { await sleep(20); st = await (await fetch(BASE + '/api/state')).json(); }
  while (st.phase !== 'play');

  await Promise.all(players.map(p => p.playRound(st.g.target)));

  do { await sleep(50); st = await (await fetch(BASE + '/api/state')).json(); }
  while (st.phase !== 'reveal');

  const byId = new Map(st.last.entries.map(e => [e.id, e]));

  console.log('\n  判定結果');
  console.log('  ' + '-'.repeat(64));
  console.log('  ' + 'プレイヤー'.padEnd(9) + '片道遅延'.padStart(8)
    + '本当の腕前'.padStart(12) + '判定'.padStart(10) + '差'.padStart(10));
  console.log('  ' + '-'.repeat(64));

  let worst = 0, missing = 0;
  for (const p of players) {
    const e = byId.get(p.id);
    if (!e || e.error === null) { missing++; continue; }
    const diff = e.error - p.human;
    worst = Math.max(worst, Math.abs(diff));
    console.log('  ' + p.name.padEnd(11)
      + (p.delay + 'ms').padStart(8)
      + ((p.human > 0 ? '+' : '') + p.human + 'ms').padStart(12)
      + ((e.error > 0 ? '+' : '') + e.error + 'ms').padStart(10)
      + (diff.toFixed(0) + 'ms').padStart(10));
  }

  const TOL = 15;
  console.log('  ' + '-'.repeat(64));

  /* 判定は帯で行う（設計どおり）。ms の生ランキングをやめる理由がここにある——
   * 腕前が 1ms しか違わない2人は、どんな仕組みでも測り分けられない。 */
  const band = (e) => Math.abs(e) <= 80 ? 'PERFECT'
                    : Math.abs(e) <= 160 ? 'GREAT'
                    : Math.abs(e) <= 260 ? 'GOOD' : 'MISS';

  let bandOk = 0;
  for (const p of players) {
    if (band(byId.get(p.id).error) === band(p.human)) bandOk++;
  }

  /* 判定ズレが回線の速さと連動していないか（相関係数）。
   * ここが 0 に近いことが「遅延が漏れていない」ことの本質的な証拠。 */
  const xs = players.map(p => p.delay);
  const ys = players.map(p => byId.get(p.id).error - p.human);
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const corr = dx && dy ? num / Math.sqrt(dx * dy) : 0;
  /* 相関だけでは判定できない。判定ズレが 0,0,0,-1,+3 ms のような、
   * ほぼゼロのデータでも相関は簡単に 0.5 を超えるが、それは丸め誤差を見ているだけ。
   * 「遅延が 100ms 増えると判定が何 ms ずれるか」という傾きなら大きさを持つ。 */
  const slope100 = dx ? (num / dx) * 100 : 0;

  console.log('\n  最大の判定ズレ  ' + worst.toFixed(1) + 'ms   (許容 ' + TOL + 'ms)');
  console.log('  帯の一致      ' + bandOk + ' / ' + players.length + '人');
  console.log('  遅延の効き方    遅延+100ms あたり ' + slope100.toFixed(2) + 'ms ずれる  (許容 3ms)');
  console.log('  参考: 相関     ' + corr.toFixed(2) + '  ※判定ズレがほぼ0のときは意味を持たない');
  console.log('\n  片道遅延と時計合わせ誤差の関係（これが本当の限界）');
  for (const p of players) {
    console.log('    片道 ' + String(p.delay).padStart(4) + 'ms  →  合わせ誤差 '
      + Math.abs(p.syncErr).toFixed(1).padStart(5) + 'ms');
  }

  // ---------------------------------------------------------------- だるまさん
  console.log('\n  だるまさんがころんだ（押下区間の組み直し / 順不同で送信）');
  console.log('  ' + '-'.repeat(64));

  while ((await (await fetch(BASE + '/api/state')).json()).phase !== 'lobby') {
    await fetch(BASE + '/api/stop', { method: 'POST' });
    await sleep(30);
  }
  await fetch(BASE + '/api/start?game=daruma', { method: 'POST' });
  let ds;
  do { await sleep(20); ds = await (await fetch(BASE + '/api/state')).json(); }
  while (ds.phase !== 'play');

  const goalMs = ds.g.goal / ds.g.speed * 1000;
  const margins = [400, 250, 150, 90, -120, 600];   // 5人目だけ捕まる想定
  await Promise.all(players.map((p, i) =>
    p.sendShuffled(p.planDaruma(ds.g.chants, margins[i], goalMs))));

  do { await sleep(200); ds = await (await fetch(BASE + '/api/state')).json(); }
  while (ds.phase !== 'reveal');

  const dById = new Map(ds.last.entries.map(e => [e.id, e]));
  let darumaOk = true;
  for (let i = 0; i < players.length; i++) {
    const p = players[i], e = dById.get(p.id);
    const wantCaught = margins[i] < 0;
    const wantDist = p.plannedHeld === null ? null
      : Math.min(ds.last.goal, Math.round(p.plannedHeld / 1000 * ds.g.speed));
    const distOk = wantCaught || Math.abs(e.dist - wantDist) <= 2;
    const caughtOk = e.caught === wantCaught;
    if (!distOk || !caughtOk) darumaOk = false;
    console.log('  ' + p.name.padEnd(11) + ('片道' + p.delay + 'ms').padStart(10)
      + ('  余裕' + margins[i] + 'ms').padStart(13)
      + '   ' + (e.caught ? 'つかまった' : e.dist + '/' + ds.last.goal + ' すすんだ').padEnd(16)
      + (caughtOk && distOk ? 'OK' : 'NG'));
  }
  console.log('  ' + '-'.repeat(64));
  console.log('  区間の組み直し: ' + (darumaOk ? '全員一致' : '不一致あり'));

  const pass = worst <= TOL && missing === 0
    && bandOk === players.length && Math.abs(slope100) < 3 && darumaOk;

  console.log('\n  ' + (pass ? 'PASS — 回線の速さは結果に影響していない'
                             : 'FAIL — 遅延が結果に漏れている'));
  console.log('  ※ 腕前の差が ' + TOL + 'ms 未満の2人は測り分けられない。'
    + 'だから設計では帯で判定する。\n');

  server.close();
  process.exit(pass ? 0 : 1);
})();
