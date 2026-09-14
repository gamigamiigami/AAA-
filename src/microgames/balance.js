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
      var G = [4.4, 5.8, 7.0][c.diff - 1];      // 倒れやすさ
      var CTRL = [3.4, 3.2, 3.0][c.diff - 1];   // 押し戻す強さ
      var LIMIT = 0.80;                          // ここまで倒れても戻せる
      var GRACE = 0.55;                          // 最初のこの間は重力が効かない
      var gust = 0, nextGust = c.diff >= 2 ? 1.8 : 99;

      return {
        /* QA 用: 棒の傾き。ゲーム進行には影響しない。 */
        probe: function () { return { a: pole.a, va: pole.va, x: hero.x, limit: LIMIT }; },

        update: function (dt) {
          if (c.result) {
            pole.va += U.sign(pole.a || 1) * 6 * dt;
            pole.a += pole.va * dt;
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
            nextGust = c.t + c.rng.range(1.1, 1.8);
            gust = c.rng.sign() * c.rng.range(1.2, 2.0);
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
            c.sfx('hit'); c.shake(12, 0.35);
            c.fx.burst(hero.x, GY - 120, { n: 16, color: [GG.PAL.shu, '#fff'], speed: 300, size: 8 });
            c.lose();
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
            mouth: c.result === 'lose' ? 'sad' : (Math.abs(pole.a) > 0.4 ? 'o' : 'smile')
          });
        }
      };
    }
  });
})(window.GG);
