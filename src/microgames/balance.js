/* ささえろ！ — 頭に乗せた棒を左右に動いて倒さない。最後まで持てば勝ち。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'balance',
    verb: 'ささえろ！',
    verbEn: 'BALANCE!',
    control: 'move',
    beats: 8,
    defaultResult: 'win',
    bg: ['#7fd8f0', '#6cc9e4'],
    style: 'clay',

    create: function (c) {
      var GY = 438;
      var SPD = 430;
      var hero = { x: c.W / 2, vx: 0 };
      /* まっすぐ立った状態から始める。以前は開幕でもう傾いていたので、
       * 画面を見て何をするゲームか分かった時にはもう倒れかけていた。 */
      var pole = { a: 0, va: 0, len: 190 };
      /* 倒れやすさと、押し戻せる強さの関係。
       *
       * この 2 つは別々に決めてはいけない。傾き a のとき棒を倒す力は
       * sin(a)*G、押し戻せる力は最大 CTRL なので、CTRL < G*sin(LIMIT) だと
       * 「まだ倒れていないのに、もう絶対に戻せない角度」が生まれる。
       * 画面にはまだ余裕があるように見えるのに、何をしても倒れる時間が続く。
       * 昔の設定がまさにそれで、レベル3は a=0.44 を超えた時点で詰んでいるのに、
       * 限界は 0.80 に描かれていた。
       *
       * だから CTRL は G*sin(LIMIT) から決める（余裕 1.25 倍）。
       * 限界の手前はどこからでも必ず戻せる。
       *
       * そのうえで難しさは G ——「倒れる速さ」——で作る。レベル3は
       * レベル1の 2 倍の速さで倒れるので、同じ角度でも考える時間が半分になる。
       * 立て直せるかどうかではなく、間に合うかどうかの勝負になる。 */
      var LIMIT = [0.95, 0.90, 0.84][c.diff - 1];
      var G = [4.4, 6.6, 9.2][c.diff - 1];
      var CTRL = G * Math.sin(LIMIT) * 1.25;
      var GRACE = 0.55;                          // 最初のこの間は重力が効かない
      /* 負けるのは「もう戻せない角度に入った瞬間」ではなく「棒が倒れきった時」。
       *
       * 限界を越えた時点で結果は決まっているが、その瞬間に画面を止めると、
       * 遊んでいる側には棒がまだ斜めに立って見える。まだ行けたはずだ、と思う。
       * 結果が同じでも、納得できるかどうかは別の話で、そこは演出の仕事になる。
       * 越えたら操作を切り、重力だけで地面まで倒し、倒れきってから負けにする。 */
      var FALLEN = 1.45;                         // ほぼ真横。ここまで来たら誰が見ても倒れている
      var doomed = 0;                            // 限界を越えてからの経過時間
      // 突風。レベルが上がるほど早く、強く来る
      var gust = 0, nextGust = [99, 1.6, 1.0][c.diff - 1];
      var gustPow = [0, 1.5, 2.4][c.diff - 1];

      return {
        /* QA 用: 棒の傾き。ゲーム進行には影響しない。 */
        probe: function () { return { a: pole.a, va: pole.va, x: hero.x, limit: LIMIT, doomed: !!doomed }; },

        update: function (dt) {
          if (c.result) {
            pole.va += U.sign(pole.a || 1) * 6 * dt;
            pole.a += pole.va * dt;
            return;
          }
          if (doomed) {
            // もう操作は効かない。倒れていくところを最後まで見せる
            doomed += dt;
            pole.va += U.sign(pole.a) * (G + 5) * dt;
            pole.a += pole.va * dt;
            /* 時間切れのほうが先に来ると、倒れかけのまま勝ちになってしまう。
             * このゲームの既定は勝ちなので、倒れると決まった時点で間に合わせる。 */
            if (Math.abs(pole.a) > FALLEN || c.timeLeft < 0.12) {
              c.sfx('hit'); c.shake(12, 0.35);
              c.fx.burst(hero.x, GY - 120, { n: 16, color: [GG.PAL.shu, '#fff'], speed: 300, size: 8 });
              c.lose();
            }
            return;
          }
          var px = hero.x;
          hero.x = c.input.steerX(hero.x, 46, c.W - 46, SPD, dt);
          var moved = (hero.x - px) / Math.max(dt, 1e-4);
          hero.vx = U.damp(hero.vx, moved, 0.05, dt);

          /* 押し戻す力は「実際に動いた量」ではなく「動かそうとした量」から取る。
           *
           * これが、途中で操作が効かなくなる正体だった。棒を立て直すには
           * 傾いた側へ走り続けるしかないのに、画面の端に着いた瞬間、移動量が
           * 0 になって力も 0 になる。壁に張りついたまま、押しても引いても
           * 何も起きずに倒れていく。遊んでいる側には、ゲームが途中で入力を
           * 受け付けなくなったようにしか見えない。
           *
           * 意思のほうを読めば、端に着いていても押している限り効き続ける。 */
          var intent = c.input.usingPointer()
            ? U.clamp((c.input.x - hero.x) / 130, -1, 1)
            : c.input.axisX();
          var ctrl = Math.abs(intent) > Math.abs(moved / SPD) ? intent : moved / SPD;

          if (c.t > nextGust) {
            nextGust = c.t + c.rng.range(1.1, 1.8) / (1 + (c.diff - 1) * 0.3);
            gust = c.rng.sign() * c.rng.range(gustPow * 0.7, gustPow * 1.15);
            c.sfx('whoosh');
          }
          if (Math.abs(gust) > 0.01) {
            pole.va += gust * dt * 3;
            gust = U.damp(gust, 0, 0.12, dt);
          }

          // 倒立振子っぽい挙動: 傾くほど倒れ、動こうとした側へ押し戻す
          pole.va += Math.sin(pole.a) * G * U.sat(c.t / GRACE) * dt;
          pole.va -= ctrl * CTRL * dt;
          pole.va *= Math.exp(-1.3 * dt);
          pole.a += pole.va * dt;

          if (Math.abs(pole.a) > LIMIT) {
            doomed = 1e-4;
            c.sfx('whoosh');
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.28;
          for (var i = 0; i < 3; i++) {
            var cx = U.wrap(i * 340 - c.t * 34, c.W + 340) - 170;
            g.ellipsePath(cx, 130 + i * 46, 78, 32).fill(GG.PAL.paper);
            g.ellipsePath(cx + 52, 138 + i * 46, 52, 24).fill(GG.PAL.paper);
          }
          ctx.restore();
          A.ground(g, GY + 14, A.GROUND.kusa);

          // 傾きメーター（危険度の可視化）
          var k = U.clamp(pole.a / LIMIT, -1, 1);
          var mw = 300;
          g.block(c.W / 2 - mw / 2, 104, mw, 22, GG.PAL.paper, { r: 11, lw: 2.6 });
          var danger = Math.abs(k);
          var col = danger > 0.7 ? GG.PAL.shu : (danger > 0.45 ? GG.PAL.yamabuki : GG.PAL.wakaba);
          g.circlePath(c.W / 2 + k * (mw / 2 - 16), 115, 13).ink(col, 3);
          g.rr(c.W / 2 - 2, 100, 4, 30, 2).fill(GG.PAL.inkSoft);

          var headY = GY - 58;
          // 棒
          ctx.save();
          ctx.translate(hero.x, headY - 26);
          ctx.rotate(pole.a);
          g.rr(-7, -pole.len, 14, pole.len + 8, 7).ink('#d8b183', 2.6);
          A.star(g, 0, -pole.len - 6, 22, GG.PAL.yamabuki, c.t * 1.4);
          ctx.restore();

          A.blob(g, {
            x: hero.x, y: headY, r: 34, color: GG.PAL.kobai,
            shadowY: GY + 14,
            lookX: U.clamp(pole.a * 2, -1, 1), lookY: -0.7,
            rot: U.clamp(pole.a * 0.25, -0.2, 0.2),
            mouth: (c.result === 'lose' || doomed) ? 'sad' : (Math.abs(pole.a) > 0.4 ? 'o' : 'smile')
          });
        }
      };
    }
  });
})(window.GG);
