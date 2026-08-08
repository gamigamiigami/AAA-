/* リズム！ — 光った瞬間に押す。リズム天国オマージュ。ビートクロック直結。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'rhythm',
    verb: 'あわせろ！',
    verbEn: 'ON BEAT!',
    control: 'press',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#fbdbe8', '#f0b3cb'],

    create: function (c) {
      // 4分音符でボールが跳ねてきて、着地の瞬間に押す
      var hits = [3, 3, 4][c.diff - 1];
      var window0 = [0.20, 0.16, 0.13][c.diff - 1];   // 秒（体感時間）
      var beatSec = 60 / 132;
      var startT = beatSec * 2;
      var notes = [];
      for (var i = 0; i < hits; i++) {
        notes.push({ t: startT + i * beatSec, done: 0, judge: '' });
      }
      var okCount = 0;
      var ballSquash = 1, flashT = 9, comboPop = 0;

      function nextIdx() {
        for (var i = 0; i < notes.length; i++) if (!notes[i].done) return i;
        return -1;
      }

      return {
        /* QA 用: 次のノーツまでの秒数と判定幅。 */
        probe: function () {
          for (var i = 0; i < notes.length; i++) {
            if (!notes[i].done) return { dt: notes[i].t - c.t, win: window0 };
          }
          return { dt: Infinity, win: window0 };
        },

        update: function (dt) {
          ballSquash = U.damp(ballSquash, 1, 0.06, dt);
          flashT += dt; comboPop = Math.max(0, comboPop - dt * 3);
          if (c.result) return;

          var i, n;
          // 押した
          if (c.input.actHit) {
            var idx = nextIdx();
            var best = -1, bestD = 9;
            for (i = 0; i < notes.length; i++) {
              n = notes[i];
              if (n.done) continue;
              var d = Math.abs(c.t - n.t);
              if (d < bestD) { bestD = d; best = i; }
            }
            if (best >= 0 && bestD <= window0) {
              notes[best].done = 1;
              notes[best].judge = bestD <= window0 * 0.4 ? 'PERFECT' : 'GOOD';
              okCount++;
              ballSquash = 0.6; flashT = 0; comboPop = 1;
              c.sfx(notes[best].judge === 'PERFECT' ? 'coin' : 'pop');
              c.stop(0.04);
              c.fx.burst(c.W / 2, 340, {
                n: notes[best].judge === 'PERFECT' ? 22 : 12,
                color: notes[best].judge === 'PERFECT'
                  ? [GG.PAL.yamabuki, '#ffffff'] : [GG.PAL.mizu, '#ffffff'],
                speed: 300, size: 7, shape: 'star'
              });
              c.fx.ring(c.W / 2, 340, { r1: 120, color: '#ffffff', lw: 7 });
              c.fx.floatText(c.W / 2, 250, notes[best].judge, {
                color: notes[best].judge === 'PERFECT' ? GG.PAL.yamabuki : GG.PAL.mizu,
                size: 34, });
              if (okCount >= notes.length) { c.win(); return; }
            } else {
              c.sfx('hit'); c.shake(12, 0.3);
              c.fx.floatText(c.W / 2, 250, 'MISS', { color: GG.PAL.shu, size: 34 });
              c.lose(); return;
            }
          }
          // 逃した
          for (i = 0; i < notes.length; i++) {
            n = notes[i];
            if (!n.done && c.t > n.t + window0) {
              c.sfx('hit'); c.shake(12, 0.3);
              c.fx.floatText(c.W / 2, 250, 'おそい！', { color: GG.PAL.shu, size: 34 });
              c.lose(); return;
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          var GY = 372;

          // ビートに合わせて明滅する床
          var beatPhase = U.wrap(c.t / (60 / 132), 1);
          ctx.save();
          ctx.globalAlpha = 0.10 + (1 - beatPhase) * 0.14;
          g.clear(GG.PAL.paper);
          ctx.restore();

          A.ground(g, GY + 26, A.GROUND.ita);

          // 判定ライン
          ctx.save();
          var lp = 1 + 0.06 * (1 - beatPhase);
          ctx.translate(c.W / 2, GY + 24);
          ctx.scale(lp, 1);
          g.ellipsePath(0, 0, 92, 20).ink(GG.PAL.yamabuki, 3.2);
          g.ellipsePath(0, 0, 66, 13).fill('#f0e6d0');
          ctx.restore();

          // これから来るノーツ（左から流れてくる）
          for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            if (n.done) continue;
            var lead = 60 / 132 * 2;                 // 2拍先から見える
            var k = (c.t - (n.t - lead)) / lead;     // 0 → 1 で判定ライン
            if (k < 0) continue;
            k = U.clamp(k, 0, 1.3);
            var x = U.lerp(-60, c.W / 2, k);
            var y = GY - Math.abs(Math.sin(k * Math.PI * 2)) * 150;
            ctx.save();
            ctx.globalAlpha = U.sat(k * 6);
            g.dropShadow(x, GY + 24, 26 * (1 - (GY - y) / 300), 8, 0.25);
            g.orb(x, y, 26, i === 0 || notes[i - 1].done ? GG.PAL.yamabuki : '#ff9ecb', { shadow: false });
            ctx.restore();
          }

          // 押した瞬間のヒットマーク
          if (flashT < 0.25) {
            ctx.save();
            ctx.globalAlpha = 1 - flashT / 0.25;
            g.circlePath(c.W / 2, GY, 40 + flashT * 160).stroke(GG.PAL.shu, 7 * (1 - flashT / 0.25));
            ctx.restore();
          }

          // 残りノーツ表示
          for (var j = 0; j < notes.length; j++) {
            var bx = c.W / 2 - (notes.length - 1) * 22 + j * 44;
            var done = notes[j].done;
            var sc = done ? 1 + comboPop * 0.3 : 1;
            ctx.save(); ctx.translate(bx, 122); ctx.scale(sc, sc);
            g.circlePath(0, 0, 13).ink(done ? GG.PAL.yamabuki : GG.PAL.paper, 2.4);
            ctx.restore();
          }
          g.text('タイミングよく おせ', c.W / 2, 172, { size: 24, fill: GG.PAL.ink });
        }
      };
    }
  });
})(window.GG);
