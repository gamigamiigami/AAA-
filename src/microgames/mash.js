/* れんだ！ — 連打でライバルを押し切る綱引き。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'mash',
    verb: 'れんだ！',
    verbEn: 'MASH!',
    control: 'mash',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#f8d3ca', '#eeaea3'],

    create: function (c) {
      var pos = 0;                        // -1(負け) .. +1(勝ち)
      var drain = [0.22, 0.28, 0.34][c.diff - 1];
      var gain = [0.110, 0.100, 0.094][c.diff - 1];
      var heroSq = 1, rivalSq = 1, ropeWave = 0;
      var lastMash = 0;

      return {
        /* QA 用: 綱引きの位置 (-1..1)。 */
        probe: function () { return { pos: pos }; },

        update: function (dt) {
          if (c.result) {
            heroSq = U.damp(heroSq, 1, 0.1, dt);
            rivalSq = U.damp(rivalSq, 1, 0.1, dt);
            return;
          }
          var m = c.input.mash;
          if (m > 0) {
            pos += gain * m;
            heroSq = 0.78; rivalSq = 1.14;
            lastMash = c.t;
            ropeWave = 1;
            c.sfx('click');
            c.fx.burst(c.W * 0.5 - 40, 300, {
              n: 3, color: [GG.PAL.yamabuki, '#ffffff'], speed: 260,
              dir: -Math.PI, spread: 0.9, size: 6, life: 0.35
            });
            c.shake(3, 0.1);
          }
          pos -= drain * dt;
          pos = U.clamp(pos, -1, 1);
          heroSq = U.damp(heroSq, 1, 0.07, dt);
          rivalSq = U.damp(rivalSq, 1, 0.07, dt);
          ropeWave = U.damp(ropeWave, 0, 0.09, dt);

          if (pos >= 1) {
            c.sfx('thud'); c.shake(14, 0.35);
            c.fx.confetti(c.W * 0.5, 260, 30);
            c.win();
          } else if (pos <= -1) {
            c.sfx('hit'); c.shake(14, 0.35);
            c.lose();
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, 400, A.GROUND.tsuchi);

          var cx = c.W / 2 + pos * 190;
          var hy = 320;

          // ロープ
          ctx.save();
          ctx.strokeStyle = '#d8b183'; ctx.lineWidth = 13; ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 250, hy + 8);
          ctx.quadraticCurveTo(cx, hy + 26 + Math.sin(c.t * 30) * ropeWave * 8, cx + 250, hy + 8);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(64,58,72,0.22)'; ctx.lineWidth = 5;
          ctx.stroke();
          ctx.restore();

          // 中央マーカー
          ctx.save();
          ctx.globalAlpha = 0.9;
          g.rr(c.W / 2 - 3, 190, 6, 200, 3).fill('rgba(64,58,72,0.16)');
          ctx.restore();
          g.polyPath([[cx, hy - 34], [cx + 15, hy - 8], [cx - 15, hy - 8]]).ink(GG.PAL.yamabuki, 3);

          A.blob(g, {
            x: cx - 132, y: hy - 30, r: 46, color: GG.PAL.yamabuki,
            squash: heroSq, shadowY: 404, lookX: 0.7,
            rot: -0.16, mouth: 'o'
          });
          A.blob(g, {
            x: cx + 132, y: hy - 30, r: 46, color: GG.PAL.fuji,
            squash: rivalSq, shadowY: 404, lookX: -0.7,
            rot: 0.16, mouth: c.result === 'win' ? 'sad' : 'flat'
          });

          // ゲージ
          A.gauge(g, c.W / 2 - 230, 116, 460, 34, (pos + 1) / 2, GG.PAL.yamabuki);
          g.text('YOU', c.W / 2 - 258, 133, { size: 19, fill: GG.PAL.ink, align: 'right' });
          g.text('RIVAL', c.W / 2 + 258, 133, { size: 19, fill: GG.PAL.ink, align: 'left' });

          // 連打アイコン
          if (!c.result) {
            var beat = c.t - lastMash < 0.12 ? 1.2 : 1 + 0.12 * Math.sin(c.t * 22);
            ctx.save();
            ctx.translate(c.W / 2, 468);
            ctx.scale(beat, beat);
            g.rr(-72, -22, 144, 44, 12).ink(GG.PAL.paper, 3);
            g.text('れんだ！', 0, 2, { size: 25, fill: GG.PAL.shu });
            ctx.restore();
          }
        }
      };
    }
  });
})(window.GG);
