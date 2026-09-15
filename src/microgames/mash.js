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
    bg: ['#e8112d', '#d40a24'],
    style: 'sketch',

    create: function (c) {
      var pos = 0;                        // -1(負け) .. +1(勝ち)
      /* 必要な回数から逆算する。
       *
       * 上限は「クリック一本しかできない人が押し切れる速さ」。以前のレベル3は
       * 3.4 秒で 24 回＝毎秒 7 回で、キーを交互に叩ける人しか遊べなかった。
       * かといって 14 回まで落とすと、今度は誰でも押し切れて勝負にならない。
       *
       * 上限のすぐ内側に置いて、レベルで段をつける。
       *   レベル1  8 回 … 押せば勝てる
       *   レベル2 13 回 … 休まず押し続ける必要がある
       *   レベル3 18 回 … 毎秒 5.3 回。腕の見せどころだが、クリックで届く
       *
       * drain は「押していない間に戻される速さ」。ここを上げると、回数だけで
       * なく「休めない」が効いてくる。合計回数と休めなさの両方で段をつける。 */
      var drain = [0.14, 0.24, 0.34][c.diff - 1];
      var gain = [0.181, 0.136, 0.116][c.diff - 1];   // 8 / 13 / 18 回で押し切る
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

        }
      };
    }
  });
})(window.GG);
