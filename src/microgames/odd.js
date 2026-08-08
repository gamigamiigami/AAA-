/* さがせ！ — ならんだ中から1つだけちがうヤツを見つけて選ぶ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'odd',
    verb: 'さがせ！',
    verbEn: 'FIND IT!',
    control: 'pick',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#f368e0', '#4a1450'],

    create: function (c) {
      var grid = [[3, 2], [4, 2], [5, 3]][c.diff - 1];
      var COLS = grid[0], ROWS = grid[1];
      var cw = 132, ch = 118;
      var ox = c.W / 2 - (COLS - 1) * cw / 2;
      var oy = 214;
      var baseCol = c.rng.pick(['#ffd93d', '#4ecdc4', '#ff8fa3', '#a29bfe']);
      var oddIdx = c.rng.int(0, COLS * ROWS - 1);
      // 違いの種類: 色 / 表情。難易度が上がるほど差が小さい
      var mode = c.diff === 1 ? 'color' : c.rng.pick(['color', 'face']);
      var oddCol = mode === 'color'
        ? U.shade(baseCol, c.diff === 1 ? -0.42 : (c.diff === 2 ? -0.26 : -0.17))
        : baseCol;

      var cells = [];
      for (var r = 0; r < ROWS; r++) {
        for (var i = 0; i < COLS; i++) {
          var idx = r * COLS + i;
          cells.push({
            x: ox + i * cw, y: oy + r * ch,
            odd: idx === oddIdx,
            ph: c.rng.range(0, 6.28),
            delay: (i + r) * 0.045,
            pop: 0
          });
        }
      }

      return {
        update: function (dt) {
          for (var i = 0; i < cells.length; i++) cells[i].pop = Math.max(0, cells[i].pop - dt * 3);
          if (c.result) return;
          if (c.input.pHit) {
            for (var k = 0; k < cells.length; k++) {
              var ce = cells[k];
              if (U.dist(c.input.x, c.input.y, ce.x, ce.y) < 52) {
                ce.pop = 1;
                if (ce.odd) {
                  c.sfx('coin'); c.stop(0.05);
                  c.fx.burst(ce.x, ce.y, {
                    n: 22, color: ['#ffd93d', '#fff'], speed: 320, size: 8, shape: 'star'
                  });
                  c.fx.ring(ce.x, ce.y, { r1: 140, color: '#ffd93d', lw: 8 });
                  c.win();
                } else {
                  c.sfx('hit'); c.shake(12, 0.3);
                  c.lose();
                }
                return;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.1;
          for (var s = 0; s < 20; s++) {
            var a = s / 20 * U.TAU + c.t * 0.15;
            ctx.save(); ctx.translate(c.W / 2, 300); ctx.rotate(a);
            g.polyPath([[0, 0], [700, -46], [700, 46]]).fill('#fff');
            ctx.restore();
          }
          ctx.restore();

          g.text('1つだけ ちがう！', c.W / 2, 132, { size: 32, fill: '#fff', lw: 5.5 });

          for (var i = 0; i < cells.length; i++) {
            var ce = cells[i];
            var k = U.sat((c.t - ce.delay) / 0.22);
            if (k <= 0) continue;
            var sc = U.easeOutBack(k) * (1 + ce.pop * 0.25);
            var hover = !c.result &&
              U.dist(c.input.x, c.input.y, ce.x, ce.y) < 52 ? 1 : 0;
            ctx.save();
            ctx.translate(ce.x, ce.y + Math.sin(c.t * 2.6 + ce.ph) * 5);
            ctx.scale(sc * (1 + hover * 0.07), sc * (1 + hover * 0.07));
            if (hover) {
              ctx.save(); ctx.globalAlpha = 0.28;
              g.circlePath(0, 0, 60).fill('#ffffff');
              ctx.restore();
            }
            A.blob(g, {
              x: 0, y: 0, r: 42, color: ce.odd ? oddCol : baseCol, feet: false,
              lookX: Math.sin(c.t * 1.8 + ce.ph) * 0.5,
              mouth: (ce.odd && mode === 'face') ? 'flat' : 'smile',
              blink: false
            });
            ctx.restore();
          }
        }
      };
    }
  });
})(window.GG);
