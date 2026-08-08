/* かぞえろ！ — 出てきたモノの数を数えて、正しいボタンを選ぶ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'count',
    verb: 'かぞえろ！',
    verbEn: 'COUNT!',
    control: 'pick',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#22b14c', '#1a9e42'],
    style: 'toon',

    create: function (c) {
      var maxN = [4, 5, 6][c.diff - 1];
      var answer = c.rng.int(2, maxN);
      var items = [];
      var i, tries;
      for (i = 0; i < answer; i++) {
        var p = null;
        for (tries = 0; tries < 40; tries++) {
          p = { x: c.rng.range(120, c.W - 120), y: c.rng.range(150, 330) };
          var ok = true;
          for (var k = 0; k < items.length; k++) {
            if (U.dist(p.x, p.y, items[k].x, items[k].y) < 108) { ok = false; break; }
          }
          if (ok) break;
        }
        items.push({
          x: p.x, y: p.y, r: 30, ph: c.rng.range(0, 6.28),
          delay: i * 0.09, col: c.rng.pick([GG.PAL.yamabuki, GG.PAL.kobai, GG.PAL.mizu, GG.PAL.wakaba])
        });
      }

      // 選択肢: 2..maxN
      var opts = [];
      for (i = 2; i <= maxN; i++) opts.push(i);
      var bw = 96, bgap = 18;
      var total = opts.length * bw + (opts.length - 1) * bgap;
      var bx = c.W / 2 - total / 2, by = 386;
      var buttons = opts.map(function (v, j) {
        return { v: v, x: bx + j * (bw + bgap), y: by, w: bw, h: 76, hov: 0, press: 0 };
      });

      return {
        update: function (dt) {
          for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var over = U.pointInRect(c.input.x, c.input.y, b.x, b.y, b.w, b.h);
            b.hov = U.damp(b.hov, over && !c.result ? 1 : 0, 0.06, dt);
            b.press = Math.max(0, b.press - dt * 3);
          }
          if (c.result) return;

          var chosen = null;
          if (c.input.pHit) {
            for (var j = 0; j < buttons.length; j++) {
              if (U.pointInRect(c.input.x, c.input.y, buttons[j].x, buttons[j].y,
                buttons[j].w, buttons[j].h)) { chosen = buttons[j]; break; }
            }
          }
          var d = c.input.dirHit();
          if (d === 'left' || d === 'right') {
            // キーボードでも選べるようにカーソルを動かす
            this.cursor = U.clamp((this.cursor === undefined ? 0 : this.cursor) +
              (d === 'right' ? 1 : -1), 0, buttons.length - 1);
            c.sfx('click');
          }
          for (var n = 1; n <= 6; n++) {
            if (c.input.hit('Digit' + n)) {
              for (var q = 0; q < buttons.length; q++) if (buttons[q].v === n) chosen = buttons[q];
            }
          }
          if (!chosen && c.input.actHit && !c.input.pHit) {
            chosen = buttons[this.cursor === undefined ? 0 : this.cursor];
          }

          if (chosen) {
            chosen.press = 1;
            if (chosen.v === answer) {
              c.sfx('coin');
              c.fx.burst(chosen.x + chosen.w / 2, chosen.y + 20, {
                n: 20, color: [GG.PAL.yamabuki, '#ffffff'], speed: 300, size: 8, shape: 'star'
              });
              c.win();
            } else {
              c.sfx('hit'); c.shake(12, 0.3);
              c.lose();
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.13;
          for (var s = 0; s < 10; s++) {
            var sx = U.wrap(s * 110 + c.t * 30, c.W + 220) - 110;
            g.circlePath(sx, 120 + (s % 3) * 90, 46).fill(GG.PAL.paper);
          }
          ctx.restore();

          // 数えるモノ
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var k = U.sat((c.t - it.delay) / 0.3);
            if (k <= 0) continue;
            var sc = U.easeOutBack(k);
            ctx.save();
            ctx.translate(it.x, it.y + Math.sin(c.t * 3 + it.ph) * 7);
            ctx.scale(sc, sc);
            A.blob(g, {
              x: 0, y: 0, r: it.r, color: it.col, feet: false,
              lookX: Math.sin(c.t * 2 + it.ph) * 0.5, mouth: 'smile'
            });
            ctx.restore();
          }


          // ボタン
          for (var j = 0; j < buttons.length; j++) {
            var b = buttons[j];
            var sel = (this.cursor === j);
            var lift = b.hov * 6 + (sel ? 5 : 0) - b.press * 8;
            var col = (b.hov > 0.3 || sel) ? GG.PAL.yamabuki : GG.PAL.paper;
            g.block(b.x, b.y - lift, b.w, b.h, col, { r: 12, lw: 3 });
            g.text(String(b.v), b.x + b.w / 2, b.y + b.h / 2 - lift, { size: 40, fill: GG.PAL.ink });
          }
        }
      };
    }
  });
})(window.GG);
