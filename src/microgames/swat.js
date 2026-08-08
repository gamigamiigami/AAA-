/* はらえ！ — ふらふら飛ぶ虫を全部たたき落とす。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'swat',
    verb: 'はらえ！',
    verbEn: 'SWAT!',
    control: 'aim',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#e6eede', '#c8d8bb'],

    create: function (c) {
      var n = [1, 2, 3][c.diff - 1];
      var bugs = [];
      for (var i = 0; i < n; i++) {
        bugs.push({
          x: c.rng.range(180, c.W - 180),
          y: c.rng.range(180, 380),
          ph: c.rng.range(0, 6.28),
          sp: c.rng.range(1.4, 2.4) * [1, 1.15, 1.3][c.diff - 1],
          ax: c.rng.range(90, 170), ay: c.rng.range(50, 110),
          dead: 0, wing: 0, tx: 0, ty: 0
        });
      }
      var left = n;
      var swat = { x: c.W / 2, y: c.H / 2, hit: 0 };

      return {
        update: function (dt) {
          swat.x = c.input.x; swat.y = c.input.y;
          swat.hit = Math.max(0, swat.hit - dt * 4.5);
          for (var i = 0; i < bugs.length; i++) {
            var b = bugs[i];
            b.wing += dt * 40;
            if (b.dead) { b.dead += dt; b.y += b.dead * 700 * dt; continue; }
            var t = c.t * b.sp + b.ph;
            b.tx = b.x + Math.sin(t) * b.ax + Math.sin(t * 2.3) * 26;
            b.ty = b.y + Math.cos(t * 1.4) * b.ay + Math.sin(t * 3.1) * 16;
          }
          if (c.result) return;

          if (c.input.pHit || c.input.actHit) {
            swat.hit = 1;
            c.sfx('whoosh');
            var got = false;
            for (var k = 0; k < bugs.length; k++) {
              var bb = bugs[k];
              if (bb.dead) continue;
              if (U.dist(c.input.x, c.input.y, bb.tx, bb.ty) < 56) {
                bb.dead = 0.001; left--; got = true;
                c.sfx('thud'); c.stop(0.06); c.shake(8, 0.22);
                c.fx.burst(bb.tx, bb.ty, {
                  n: 16, color: [GG.PAL.wakaba, '#ffffff'], speed: 280, size: 7
                });
                c.fx.ring(bb.tx, bb.ty, { r1: 100, color: '#ffffff', lw: 6 });
                if (left <= 0) { c.win(); return; }
                break;
              }
            }
            if (!got) c.fx.burst(c.input.x, c.input.y, {
              n: 5, color: ['#ffffff'], speed: 120, size: 4, life: 0.25
            });
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // テーブルとケーキ（虫が寄ってくる理由を絵で示す）
          A.ground(g, 400, A.GROUND.tatami);
          ctx.save();
          ctx.translate(c.W / 2, 420);
          g.dropShadow(0, 46, 90, 18, 0.25);
          g.rr(-84, -8, 168, 54, 12).ink(GG.PAL.paper, 3);
          g.rr(-84, -8, 168, 20, 10).fill(GG.PAL.kobai);
          A.star(g, 0, -24, 20, GG.PAL.yamabuki, c.t * 0.8);
          ctx.restore();

          for (var i = 0; i < bugs.length; i++) {
            var b = bugs[i];
            if (b.dead > 0.6) continue;
            ctx.save();
            ctx.translate(b.tx, b.ty);
            if (b.dead) { ctx.rotate(b.dead * 12); ctx.globalAlpha = Math.max(0, 1 - b.dead * 1.6); }
            // 羽
            var w = Math.sin(b.wing) * 0.5;
            ctx.save(); ctx.globalAlpha = ctx.globalAlpha * 0.6;
            g.ellipsePath(-16, -16, 20, 10, -0.6 + w).fill('#eef4f8');
            g.ellipsePath(16, -16, 20, 10, 0.6 - w).fill('#eef4f8');
            ctx.restore();
            g.ellipsePath(0, 0, 29, 23).ink('#4a4452', 3);
            g.ellipsePath(0, -3, 19, 13).fill('#6d6579');
            g.eyes(0, -4, 8, 6, 0, 0, b.dead > 0);
            // 触角
            ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-7, -16); ctx.lineTo(-14, -30);
            ctx.moveTo(7, -16); ctx.lineTo(14, -30);
            ctx.stroke();
            ctx.restore();
          }

          A.tip(g, c.W / 2, 108, 'のこり ' + Math.max(0, left), 26);

          // ハエたたき
          ctx.save();
          ctx.translate(swat.x, swat.y);
          ctx.rotate(-0.6 + swat.hit * 0.9);
          ctx.scale(1 + swat.hit * 0.12, 1 - swat.hit * 0.1);
          g.rr(-6, 10, 12, 76, 6).ink('#c19a66', 2.4);
          g.rr(-42, -44, 84, 62, 14).ink(GG.PAL.asagi, 4);
          ctx.save();
          g.rr(-42, -44, 84, 62, 14); ctx.clip();
          ctx.globalAlpha = 0.3;
          for (var gx = -40; gx < 44; gx += 12) g.rr(gx, -46, 4, 66, 2).fill('#0a3b38');
          for (var gy = -42; gy < 20; gy += 12) g.rr(-44, gy, 90, 4, 2).fill('#0a3b38');
          ctx.restore();
          ctx.restore();
        }
      };
    }
  });
})(window.GG);
