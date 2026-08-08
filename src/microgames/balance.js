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
    bg: ['#cfeaee', '#a6d5dc'],

    create: function (c) {
      var GY = 438;
      var hero = { x: c.W / 2, vx: 0 };
      var pole = { a: c.rng.sign() * 0.05, va: 0, len: 190 };
      var G = [6.0, 7.8, 9.4][c.diff - 1];      // 倒れやすさ
      var CTRL = [8.5, 8.0, 7.6][c.diff - 1];   // 移動が棒に効く強さ
      var LIMIT = 0.62;
      var gust = 0, nextGust = c.diff >= 2 ? 1.0 : 99;

      return {
        update: function (dt) {
          if (c.result) {
            pole.va += U.sign(pole.a || 1) * 6 * dt;
            pole.a += pole.va * dt;
            return;
          }
          var px = hero.x;
          hero.x = c.input.steerX(hero.x, 70, c.W - 70, 430, dt);
          var acc = (hero.x - px) / Math.max(dt, 1e-4);
          hero.vx = U.damp(hero.vx, acc, 0.05, dt);

          if (c.t > nextGust) {
            nextGust = c.t + c.rng.range(1.0, 1.7);
            gust = c.rng.sign() * c.rng.range(1.6, 2.6);
            c.sfx('whoosh');
          }
          if (Math.abs(gust) > 0.01) {
            pole.va += gust * dt * 3;
            gust = U.damp(gust, 0, 0.12, dt);
          }

          // 倒立振子っぽい挙動: 傾くほど倒れ、移動で押し戻す
          pole.va += Math.sin(pole.a) * G * dt;
          pole.va -= (acc / 900) * CTRL * dt;
          pole.va *= Math.exp(-0.9 * dt);
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
          var k = U.clamp(pole.a / 0.62, -1, 1);
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
