/* 勝ち筋テスト — ページ内で 60fps の自動プレイヤーを走らせ、
 * 「ちゃんと操作すればクリアできる」ことを全難易度で確認する。
 * 通信の往復で入力がブレないよう、判断も入力もブラウザ内で完結させている。
 *
 * 操作はマウス（ポインタ）で行う。遊ぶ人はキーボードを使わないので、
 * 「キーなら勝てるがマウスでは勝てない」ゲームは、ここで落ちてほしい。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* 各ボットは probe() の戻り値を受け取り、マウスだけで操作する。
 *   click(x, y)  … その位置をクリック
 *   move(x, y)   … その位置へカーソルを動かす（steer 系はこれで動く）
 * 座標はゲーム内の 960×540 で書く。 */
const BOTS = {
  // とべ！: 衝突までの時間が 0.3 秒を切ったら跳ぶ
  jump: `p => { if (!p.air && p.ttc < 0.27) click(480, 270); }`,
  // れんだ！: ひたすらクリック
  mash: `p => { click(480, 470); }`,
  // つかめ！: ワクにお宝が入った瞬間に押す
  grab: `p => { if (p) click(480, 480); }`,
  // あわせろ！: ノーツが判定に重なったら押す
  rhythm: `p => { if (p.dt < 0.012) click(480, 480); }`,
  // リズムで たたけ！: 同上
  boss_band: `p => { if (p.dt < 0.012) click(480, 480); }`,
  // とめろ！: 針がゾーン中心を通過する直前で止める
  stopneedle: `p => { if (!p.stopped && Math.abs(p.p - p.c) < p.half * 0.3) click(480, 480); }`,
  // あつめろ！: 星の真下にカゴを運ぶ
  catch: `p => { if (p) move(p.x, 400); }`,
  // さがせ！: ちがう 1 つをクリック
  odd: `p => { if (p) click(p.x, p.y); }`,
  // ふせげ！: 飛んでくる側にタテを向ける（中心からその向きをクリック）
  shield: `p => { if (p) click(p.cx + p.vec[0] * 150, p.cy + p.vec[1] * 120); }`,
  // にげろ！: create のときに解いた道の通過点へカーソルを運ぶ
  escape: `p => { if (p) move(p.x, p.y); }`,
  // ささえろ！: 倒れる側へ体を運んで棒を押し戻す
  balance: `p => {
    const u = p.va + p.a * 3;                 // これを 0 に寄せたい
    const dir = u > 0 ? 1 : -1;               // 進む向き（傾いた側）
    move(Math.max(40, Math.min(920, p.x + dir * 260)), 380);
  }`
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction('window.GG && window.GG.debug');

  const fails = [], rows = [];
  for (const [id, body] of Object.entries(BOTS)) {
    for (const diff of [1, 2, 3]) {
      const r = await page.evaluate(([id, diff, body]) => new Promise(resolve => {
        const G = window.GG, g = G.debug.game;
        const cv = document.getElementById('screen');
        const at = (vx, vy) => {
          const r = cv.getBoundingClientRect();
          return { clientX: r.left + vx / G.VIEW_W * r.width,
                   clientY: r.top + vy / G.VIEW_H * r.height,
                   bubbles: true, pointerId: 1, isPrimary: true };
        };
        const move = (vx, vy) => cv.dispatchEvent(new PointerEvent('pointermove', at(vx, vy)));
        const click = (vx, vy) => {
          move(vx, vy);
          cv.dispatchEvent(new PointerEvent('pointerdown', at(vx, vy)));
          window.dispatchEvent(new PointerEvent('pointerup', at(vx, vy)));
        };
        const bot = eval('(' + body + ')');
        G.debug.jump(id, diff);
        const started = performance.now();
        (function tick() {
          if (g.result) { resolve(g.result); return; }
          if (performance.now() - started > 20000) { resolve('TIMEOUT'); return; }
          if (g.state === 'play' && g.cur && g.cur.inst.probe) {
            try { bot(g.cur.inst.probe()); } catch (e) { resolve('BOTERR:' + e.message); return; }
          }
          requestAnimationFrame(tick);
        })();
      }), [id, diff, body]);
      rows.push(`${id.padEnd(12)} diff${diff} -> ${r}`);
      if (r !== 'win') fails.push(`${id} diff${diff} = ${r}`);
      await page.waitForTimeout(120);
    }
  }
  rows.forEach(r => console.log(r));
  console.log('\nerrors:', errors.length ? errors : '(none)');
  console.log(fails.length ? '\nFAILURES:\n  ' + fails.join('\n  ') : '\nALL PASS');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
