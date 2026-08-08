/* のばせ！ — 押しっぱなしで橋をのばし、向こう岸にちょうど届かせる。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'stretch',
    verb: 'のばせ！',
    verbEn: 'STRETCH!',
    control: 'hold',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#fae3bd', '#eec894'],

    create: function (c) {
      var GY = 400;
      var leftEdge = 260;
      var gap = [200, 250, 290][c.diff - 1] + c.rng.range(-24, 24);
      var rightEdge = leftEdge + gap;
      var platW = [110, 88, 70][c.diff - 1];
      var growth = [300, 340, 380][c.diff - 1];

      var len = 0, growing = false, released = false;
      var fall = 0, walk = 0, hero = { x: leftEdge - 40, y: GY - 30 };
      var bridgeA = 0;   // 倒れ角

      return {
        update: function (dt) {
          if (c.result && !released) return;

          if (!released) {
            if (c.input.act) {
              if (!growing) { growing = true; c.sfx('charge'); }
              len += growth * dt;
              c.shake(1.5, 0.06);
            } else if (growing) {
              released = true;
              growing = false;
              c.sfx('whoosh');
            }
            if (len > 460) { released = true; growing = false; }
            return;
          }

          // 橋を倒す
          if (bridgeA < Math.PI / 2) {
            bridgeA = Math.min(Math.PI / 2, bridgeA + dt * 5.2);
            if (bridgeA >= Math.PI / 2 && !this._landed) {
              this._landed = true;
              c.sfx('land'); c.shake(8, 0.24);
              var tip = leftEdge + len;
              var ok = tip >= rightEdge && tip <= rightEdge + platW;
              this._ok = ok;
              if (!ok) {
                c.fx.burst(tip, GY, { n: 14, color: [GG.PAL.shu, '#fff'], speed: 260, size: 7 });
              }
            }
            return;
          }

          // 歩く
          if (this._ok) {
            walk += dt;
            hero.x = U.lerp(leftEdge - 40, rightEdge + platW / 2, U.sat(walk / 0.55));
            if (walk > 0.55 && !c.result) {
              c.sfx('levelup');
              c.fx.confetti(hero.x, GY - 60, 26);
              c.win();
            }
          } else {
            fall += dt;
            hero.x = U.lerp(leftEdge - 40, leftEdge + Math.min(len, gap) * 0.9, U.sat(fall / 0.35));
            hero.y = GY - 30 + Math.max(0, fall - 0.3) * 900;
            if (fall > 0.45 && !c.result) { c.sfx('lose'); c.lose(); }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.3;
          for (var i = 0; i < 4; i++) {
            var cx = U.wrap(i * 300 - c.t * 26, c.W + 300) - 150;
            g.ellipsePath(cx, 120 + i * 34, 74, 28).fill(GG.PAL.paper);
          }
          ctx.restore();

          // 谷底
          ctx.fillStyle = g.grad(0, GY, 0, c.H, [[0, 'rgba(64,58,72,0.05)'], [1, 'rgba(64,58,72,0.32)']]);
          ctx.fillRect(0, GY, c.W, c.H - GY);

          function pillar(x, w) {
            g.block(x, GY, w, c.H - GY + 20, '#b98b57', { r: 8 });
            g.rr(x - 6, GY - 16, w + 12, 26, 8).ink('#a8c98a', 3);
          }
          pillar(0, leftEdge);
          pillar(rightEdge, platW);

          // 目標マーカー（着地させたい範囲をはっきり示す）
          ctx.save();
          var mp = 0.6 + 0.4 * Math.sin(c.t * 6);
          ctx.globalAlpha = 0.25 + mp * 0.2;
          g.rr(rightEdge, GY - 150, platW, 140, 10).fill(GG.PAL.yamabuki);
          ctx.globalAlpha = 0.9;
          ctx.setLineDash([12, 9]); ctx.lineDashOffset = -c.t * 34;
          g.rr(rightEdge, GY - 150, platW, 140, 10).stroke(GG.PAL.yamabuki, 4);
          ctx.setLineDash([]);
          ctx.restore();
          A.tip(g, rightEdge + platW / 2, GY - 168, 'ここ！', 19,
            'rgba(255,217,61,0.95)', '#4a3200');

          // 橋
          var L = Math.max(0, len);
          ctx.save();
          ctx.translate(leftEdge, GY - 14);
          ctx.rotate(-Math.PI / 2 + bridgeA);
          g.rr(0, -8, L, 16, 6).ink('#d8b183', 3);
          for (var s = 20; s < L; s += 34) {
            g.rr(s, -8, 6, 16, 3).fill('rgba(64,58,72,0.2)');
          }
          ctx.restore();

          // ヒーロー
          A.blob(g, {
            x: hero.x, y: hero.y, r: 26, color: GG.PAL.asagi,
            shadowY: hero.y < GY ? GY - 12 : undefined,
            rot: fall > 0.3 ? (c.t * 6) % 6.28 : Math.sin(walk * 20) * 0.08,
            lookX: 0.7,
            mouth: c.result === 'lose' ? 'sad' : (growing ? 'o' : 'smile')
          });

          // ゲージ
          if (!released) {
            var need = U.sat(len / (gap + platW));
            A.gauge(g, c.W / 2 - 180, 110, 360, 26, U.sat(len / 460), GG.PAL.yamabuki);
            // ちょうど良い範囲をゲージ上に表示
            var a0 = gap / 460, a1 = (gap + platW) / 460;
            ctx.save(); ctx.globalAlpha = 0.85;
            g.rr(c.W / 2 - 180 + 5 + (360 - 10) * a0, 113,
              (360 - 10) * (a1 - a0), 20, 8).fill('rgba(123,237,159,0.75)');
            ctx.restore();
            g.text(growing ? 'はなすと たおれる' : '押しっぱなしで のばす',
              c.W / 2, 84, { size: 22, fill: GG.PAL.ink });
          }
        }
      };
    }
  });
})(window.GG);
