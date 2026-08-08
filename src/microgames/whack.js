/* たたけ！ — 顔を出したヤツを全部たたく。ばくだんを叩いたら失敗。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'whack',
    verb: 'たたけ！',
    verbEn: 'WHACK!',
    control: 'aim',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#8bd94a', '#7cc93c'],
    style: 'paper',

    create: function (c) {
      var COLS = 3, ROWS = 2;
      var holes = [];
      var ox = c.W / 2 - (COLS - 1) * 152 / 2;
      var oy = 262;
      for (var r = 0; r < ROWS; r++) {
        for (var i = 0; i < COLS; i++) {
          holes.push({
            x: ox + i * 152, y: oy + r * 130,
            up: 0, target: 0, kind: 0, hit: 0, t: 0, delay: 0
          });
        }
      }
      var need = [2, 3, 4][c.diff - 1];
      var bombs = [0, 1, 2][c.diff - 1];
      var order = c.rng.shuffle(holes.slice());
      var idx, remaining = need;
      for (idx = 0; idx < need; idx++) { order[idx].kind = 1; order[idx].delay = c.rng.range(0, 0.55); }
      for (; idx < need + bombs; idx++) { order[idx].kind = 2; order[idx].delay = c.rng.range(0.1, 0.7); }

      var hammer = { x: c.W / 2, y: c.H / 2, swing: 0 };

      return {
        update: function (dt) {
          hammer.x = c.input.x; hammer.y = c.input.y;
          hammer.swing = Math.max(0, hammer.swing - dt * 4.2);

          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            h.t += dt;
            if (h.kind && !h.hit) {
              h.target = h.t > h.delay ? 1 : 0;
            } else h.target = 0;
            h.up = U.damp(h.up, h.target, 0.07, dt);
            if (h.hit) h.hit += dt;
          }
          if (c.result) return;

          if (c.input.pHit || c.input.actHit) {
            hammer.swing = 1;
            c.sfx('whoosh');
            var px = c.input.pHit ? c.input.x : hammer.x;
            var py = c.input.pHit ? c.input.y : hammer.y;
            for (var k = 0; k < holes.length; k++) {
              var hh = holes[k];
              if (!hh.kind || hh.hit || hh.up < 0.5) continue;
              if (U.dist(px, py, hh.x, hh.y - 34) < 58) {
                hh.hit = 0.001;
                if (hh.kind === 2) {
                  c.sfx('hit');
                  c.fx.burst(hh.x, hh.y - 30, {
                    n: 26, color: [GG.PAL.shu, GG.PAL.kuchiba, '#2b2233'], speed: 380, size: 10
                  });
                  c.shake(18, 0.4); c.flash(0.35, GG.PAL.shu);
                  c.lose(); return;
                }
                c.sfx('thud'); c.stop(0.06);
                c.shake(7, 0.2);
                c.fx.burst(hh.x, hh.y - 30, {
                  n: 14, color: [GG.PAL.yamabuki, '#ffffff'], speed: 280, size: 7, shape: 'star'
                });
                c.fx.ring(hh.x, hh.y - 30, { r1: 90, color: '#ffffff', lw: 7 });
                remaining--;
                if (remaining <= 0) { c.win(); return; }
                break;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, 168, A.GROUND.tsuchi);

          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            // 穴（盛り土のふちで立体感を出す）
            g.ellipsePath(h.x, h.y + 7, 66, 27).fill('#a37b4e');
            g.ellipsePath(h.x, h.y + 3, 64, 25).fill('#c79a63');
            g.ellipsePath(h.x, h.y, 56, 22).fill('#5d4526');
            g.ellipsePath(h.x, h.y - 3, 56, 20).fill('#42301a');

            if (h.kind && (h.up > 0.01 || h.hit)) {
              ctx.save();
              g.ellipsePath(h.x, h.y - 2, 56, 24); ctx.rect(h.x - 62, h.y - 190, 124, 188); ctx.clip();
              var lift = h.up * 64;
              var y = h.y + 16 - lift;
              if (h.hit) {
                var k = U.sat(h.hit / 0.3);
                y += k * 46;
                ctx.globalAlpha = 1 - k;
              }
              if (h.kind === 1) {
                A.blob(g, {
                  x: h.x, y: y, r: 40, color: '#ffcf9b', feet: false,
                  squash: h.hit ? 0.72 : 1, mouth: h.hit ? 'flat' : 'smile',
                  blink: h.hit > 0
                });
              } else {
                A.bomb(g, h.x, y - 4, 32, c.t);
              }
              ctx.restore();
            }
            // 穴のふち
            ctx.save(); ctx.globalAlpha = 0.6;
            g.ellipsePath(h.x, h.y + 2, 57, 22).stroke('#c79a63', 5);
            ctx.restore();
          }

          A.count(g, c.W / 2, 108, String(Math.max(0, remaining)), 40);

          // ハンマー
          ctx.save();
          ctx.translate(hammer.x, hammer.y);
          ctx.rotate(-0.5 + U.easeOutCubic(1 - hammer.swing) * 0.0 + hammer.swing * 1.5);
          ctx.translate(0, -6);
          g.rr(-8, 0, 16, 78, 8).ink('#c19a66', 2.6);
          g.rr(-40, -34, 80, 46, 12).ink(GG.PAL.shu, 4);
          g.rr(-34, -28, 68, 14, 7).fill('rgba(255,255,255,0.28)');
          ctx.restore();
        }
      };
    }
  });
})(window.GG);
