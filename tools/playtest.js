/* 勝ち筋テスト — ページ内で 60fps の自動プレイヤーを走らせ、
 * 「ちゃんと操作すればクリアできる」ことを全難易度で確認する。
 * 通信の往復で入力がブレないよう、判断も入力もブラウザ内で完結させている。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const BOTS = {
  // とべ！: 衝突までの時間が 0.3 秒を切ったら跳ぶ
  jump: `p => { if (!p.air && p.ttc < 0.31) press(280); }`,
  // れんだ！: ひたすら連打
  mash: `p => { tap(); }`,
  // つかめ！: ワクにお宝が入った瞬間に押す
  grab: `p => { if (p) press(60); }`,
  // あわせろ！: ノーツが判定に重なったら押す
  rhythm: `p => { if (p.dt < 0.012) press(50); }`,
  // とめろ！: 針がゾーン中心を通過する直前で止める
  stopneedle: `p => { if (!p.stopped && Math.abs(p.p - p.c) < p.half * 0.3) press(50); }`,
  // あつめろ！: 星の真下にカゴを運ぶ
  catch: `p => { if (!p) return; if (p.x > p.self + 6) hold('ArrowRight');
                 else if (p.x < p.self - 6) hold('ArrowLeft'); else release(); }`
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction('window.GG && window.GG.debug');

  const fails = [], rows = [];
  for (const [id, body] of Object.entries(BOTS)) {
    for (const diff of [1, 2, 3]) {
      const r = await page.evaluate(([id, diff, body]) => new Promise(resolve => {
        const G = window.GG, g = G.debug.game;
        let held = null;
        const key = (type, code) => window.dispatchEvent(
          new KeyboardEvent(type, { code: code, bubbles: true }));
        const press = ms => { key('keydown', 'Space'); setTimeout(() => key('keyup', 'Space'), ms); };
        const tap = () => { key('keydown', 'Space'); key('keyup', 'Space'); };
        const hold = code => { if (held !== code) { release(); held = code; key('keydown', code); } };
        const release = () => { if (held) { key('keyup', held); held = null; } };
        const bot = eval('(' + body + ')');
        G.debug.jump(id, diff);
        const started = performance.now();
        (function tick() {
          if (g.result) { release(); resolve(g.result); return; }
          if (performance.now() - started > 20000) { release(); resolve('TIMEOUT'); return; }
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
