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
    bg: ['#c8d6e5', '#5f7a8c'],

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
              if (U.dist(c.input.x, c.input.y, bb.tx, bb.ty) < 52) {
                bb.dead = 0.001; left--; got = true;
                c.sfx('thud'); c.stop(0.06); c.shake(8, 0.22);
                c.fx.burst(bb.tx, bb.ty, {
                  n: 16, color: ['#7bed9f', '#ffffff'], speed: 280, size: 7
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
          A.ground(g, 400, { top: '#f0e2c8', body: '#c9a978', deep: '#8d7248' });
          ctx.save();
          ctx.translate(c.W / 2, 420);
          g.dropShadow(0, 46, 90, 18, 0.25);
          g.rr(-84, -8, 168, 54, 12).ink('#fff1f5', 4);
          g.rr(-84, -8, 168, 20, 10).fill('#ff8fa3');
          A.star(g, 0, -24, 20, '#ffd93d', c.t * 0.8);
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
            g.ellipsePath(-16, -16, 20, 10, -0.6 + w).fill('#e8f4ff');
            g.ellipsePath(16, -16, 20, 10, 0.6 - w).fill('#e8f4ff');
            ctx.restore();
            g.ellipsePath(0, 0, 24, 19).ink('#3a3350', 4);
            g.ellipsePath(0, -3, 16, 11).fill('#5a5175');
            g.eyes(0, -4, 8, 6, 0, 0, b.dead > 0);
            // 触角
            ctx.strokeStyle = '#2a2440'; ctx.lineWidth = 3; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-7, -16); ctx.lineTo(-14, -30);
            ctx.moveTo(7, -16); ctx.lineTo(14, -30);
            ctx.stroke();
            ctx.restore();
          }

          g.text('のこり ' + Math.max(0, left), c.W / 2, 108, { size: 30, fill: '#2b2244', lw: 5, stroke: '#ffffff' });

          // ハエたたき
          ctx.save();
          ctx.translate(swat.x, swat.y);
          ctx.rotate(-0.6 + swat.hit * 0.9);
          ctx.scale(1 + swat.hit * 0.12, 1 - swat.hit * 0.1);
          g.rr(-6, 10, 12, 76, 6).ink('#8d6e4f', 3);
          g.rr(-42, -44, 84, 62, 14).ink('#4ecdc4', 4);
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
