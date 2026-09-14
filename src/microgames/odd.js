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
    bg: ['#ffd400', '#f0c600'],
    style: 'sketch',

    create: function (c) {
      var grid = [[3, 2], [4, 3], [6, 3]][c.diff - 1];
      var COLS = grid[0], ROWS = grid[1];
      var cw = COLS >= 6 ? 146 : 152, ch = ROWS === 2 ? 122 : 104;
      var ox = c.W / 2 - (COLS - 1) * cw / 2;
      var oy = ROWS === 2 ? 250 : 176;
      var baseCol = c.rng.pick([GG.PAL.shu, GG.PAL.ai, GG.PAL.murasaki, GG.PAL.wakaba]);
      var oddIdx = c.rng.int(0, COLS * ROWS - 1);

      /* ちがうのは、ぜんぶで 1 つ。ちがい方も 1 種類だけ。
       *
       * 以前は「1 つだけ色を薄くする」と決めておきながら、全員の目の向きを
       * バラバラの位相で動かしていた。つまり画面には、意図した差が 1 つと、
       * 意図していない差が全員ぶん出ていた。探している側からすれば
       * 「複数ちがう」ようにしか見えず、正解がどれか決められない。
       *
       * それでいて上のレベルでは、肝心の色の差を -0.17 まで薄めていた。
       * 見えない差を探させるのは難しさではなく、当てずっぽうにすること。
       *
       * 直し方は 2 つ。
       *  1. 差は「色」か「顔」のどちらか一方だけ。それ以外は完全に同じ値。
       *     向きも口も、全員が同じ式から出る。
       *  2. 差の大きさはレベルで薄めない。難しさは「数の多さ」で出す。
       *
       * 上下の揺れの位相だけは、ずらしたままにしておく。
       * 全員が同じ拍で揺れると機械の列になるし、揺れの位相は「どれが違うか」
       * の手がかりにはならない —— 見比べれば同じ動きをしていると分かる。 */
      var mode = c.diff === 1 ? 'color' : c.rng.pick(['color', 'face']);
      var oddCol = mode === 'color' ? U.shade(baseCol, -0.40) : baseCol;

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
        /* QA 用: ちがう 1 つの場所。ゲーム進行には影響しない。 */
        probe: function () {
          for (var i = 0; i < cells.length; i++) if (cells[i].odd) return cells[i];
          return null;
        },

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
                    n: 22, color: [GG.PAL.yamabuki, '#fff'], speed: 320, size: 8, shape: 'star'
                  });
                  c.fx.ring(ce.x, ce.y, { r1: 140, color: GG.PAL.yamabuki, lw: 8 });
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
              // 向きは全員そろえる。ここに位相を混ぜると差が 2 種類になる
              lookX: Math.sin(c.t * 1.8) * 0.5,
              mouth: (ce.odd && mode === 'face') ? 'sad' : 'smile',
              blink: false
            });
            ctx.restore();
          }
        }
      };
    }
  });
})(window.GG);
