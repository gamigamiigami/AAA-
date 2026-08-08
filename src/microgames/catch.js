/* あつめろ！ — 落ちてくる星をカゴで全部受け止める。1つでも落とすと失敗。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'catch',
    verb: 'あつめろ！',
    verbEn: 'CATCH!',
    control: 'move',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#d9edf5', '#aed6e3'],

    create: function (c) {
      var BY = 424;                       // カゴの中心Y
      var basket = { x: c.W / 2, tilt: 0, pop: 0 };
      var need = [3, 4, 5][c.diff - 1];
      var got = 0;
      var SPEED = 520;                    // カゴの移動速度（input.steerX と揃える）
      var vy = [330, 380, 430][c.diff - 1];
      var stars = [];
      // 直前の星からの猶予時間で届く範囲にしか次の星を置かない。
      // これをやらないと「物理的に間に合わない配置」が生まれてクリア不能になる。
      var y = -60, prevX = c.W / 2, dy = 0;
      for (var i = 0; i < need; i++) {
        if (i > 0) { dy = c.rng.range(185, 235); y -= dy; }
        var avail = (i === 0 ? (BY + 60) : dy) / vy;
        var maxDx = SPEED * avail * 0.66;
        var x = U.clamp(prevX + c.rng.range(-maxDx, maxDx), 110, c.W - 110);
        prevX = x;
        stars.push({
          x: x, y: y, vy: vy,
          r: 25, rot: c.rng.range(0, 6.28), spin: c.rng.range(-2, 2),
          state: 0                        // 0=落下 1=取得 2=落下失敗
        });
      }

      return {
        /* QA 用: 次に落ちてくる星のX座標。 */
        probe: function () {
          var best = null;
          for (var i = 0; i < stars.length; i++) {
            if (!stars[i].state && (!best || stars[i].y > best.y)) best = stars[i];
          }
          return best ? { x: best.x, y: best.y, self: basket.x } : null;
        },

        update: function (dt) {
          basket.pop = U.damp(basket.pop, 0, 0.07, dt);
          if (c.result) return;
          var px = basket.x;
          basket.x = c.input.steerX(basket.x, 60, c.W - 60, 520, dt);
          basket.tilt = U.damp(basket.tilt, U.clamp((basket.x - px) / dt / 2600, -0.3, 0.3), 0.06, dt);

          for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            if (s.state) continue;
            s.y += s.vy * dt;
            s.rot += s.spin * dt;
            if (s.y > BY - 34 && s.y < BY + 30 && Math.abs(s.x - basket.x) < 58) {
              s.state = 1;
              got++;
              basket.pop = 1;
              c.sfx('coin');
              c.fx.burst(s.x, s.y, {
                n: 12, color: [GG.PAL.yamabuki, '#ffffff', '#f6dca4'],
                speed: 250, size: 6, life: 0.5, shape: 'star'
              });
              c.fx.floatText(s.x, s.y - 26, '+1', { color: GG.PAL.yamabuki, size: 30, stroke: '#5a3d00' });
              if (got >= need) { c.win(); return; }
            } else if (s.y > c.H + 40) {
              s.state = 2;
              c.sfx('hit');
              c.shake(10, 0.3);
              c.lose();
              return;
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // 雲
          ctx.save(); ctx.globalAlpha = 0.35;
          for (var k = 0; k < 4; k++) {
            var r = new U.RNG(90 + k);
            var cx = U.wrap(r.range(0, c.W) + c.t * 22, c.W + 240) - 120, cy = r.range(110, 250);
            g.ellipsePath(cx, cy, 66, 30).fill(GG.PAL.paper);
            g.ellipsePath(cx - 42, cy + 8, 40, 22).fill(GG.PAL.paper);
            g.ellipsePath(cx + 44, cy + 10, 36, 20).fill(GG.PAL.paper);
          }
          ctx.restore();

          A.ground(g, 470, A.GROUND.kusa);

          // 落下予告
          ctx.save();
          for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            if (s.state) continue;
            var near = U.sat(1 - (BY - s.y) / 460);
            ctx.globalAlpha = 0.1 + near * 0.25;
            g.ellipsePath(s.x, BY + 34, 34 * (0.5 + near * 0.6), 9).fill(GG.PAL.yamabuki);
          }
          ctx.restore();

          // カゴ
          ctx.save();
          ctx.translate(basket.x, BY);
          ctx.rotate(basket.tilt);
          var pop = 1 + basket.pop * 0.14;
          ctx.scale(pop, 2 - pop);
          g.dropShadow(0, 52, 56, 12, 0.3);
          g.polyPath([[-58, -22], [58, -22], [46, 34], [-46, 34]]).ink('#c19a66', 3.2);
          ctx.save();
          g.polyPath([[-58, -22], [58, -22], [46, 34], [-46, 34]]); ctx.clip();
          for (var w = -60; w < 60; w += 15) {
            g.rr(w, -24, 6, 62, 3).fill('rgba(255,255,255,0.35)');
          }
          g.rr(-60, 6, 120, 7, 3).fill('rgba(64,58,72,0.18)');
          ctx.restore();
          g.rr(-64, -30, 128, 15, 7).ink('#d8b183', 3);
          ctx.restore();

          // 星
          for (var j = 0; j < stars.length; j++) {
            var st = stars[j];
            if (st.state) continue;
            ctx.save();
            var glow = 0.5 + 0.5 * Math.sin(c.t * 8 + j);
            ctx.globalAlpha = 0.7 + glow * 0.3;
            g.circlePath(st.x, st.y, st.r * 2.3).fill(g.rgrad(st.x, st.y, 2, st.r * 2.3,
              [[0, 'rgba(255,240,170,0.75)'], [0.42, 'rgba(255,217,61,0.28)'],
               [1, 'rgba(255,217,61,0)']]));
            ctx.restore();
            A.star(g, st.x, st.y, st.r, GG.PAL.yamabuki, st.rot);
          }

          // 残り個数
          A.tip(g, c.W / 2, 110, got + ' / ' + need + ' こ', 28);
        }
      };
    }
  });
})(window.GG);
