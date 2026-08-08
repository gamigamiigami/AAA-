/* つかめ！ — ベルトコンベアで流れてくるおたからを、ワクの中でつかむ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'grab',
    verb: 'つかめ！',
    verbEn: 'GRAB!',
    control: 'press',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#9a6fd8', '#8a5fc8'],
    style: 'retro',

    create: function (c) {
      var BY = 330;
      var zoneX = c.W * 0.62, zoneW = [150, 120, 96][c.diff - 1];
      var spd = [340, 420, 500][c.diff - 1];
      var items = [];
      var count = 3;
      for (var i = 0; i < count; i++) {
        items.push({
          x: -80 - i * c.rng.range(250, 310),
          gem: c.rng.chance(0.55),
          taken: 0, rot: 0
        });
      }
      // 制限時間内にワクへ届くのは先頭2つまで。そこに必ずお宝を1つ置く
      items[c.rng.int(0, 1)].gem = true;
      var claw = { y: 150, closing: 0, holding: null, down: 0 };
      var grabbed = false;

      return {
        /* QA 用: いまワクにお宝が入っているか。ゲーム進行には一切影響しない。 */
        probe: function () {
          for (var i = 0; i < items.length; i++) {
            var t = items[i];
            if (!t.taken && t.gem && Math.abs(t.x - zoneX) < zoneW / 2) return true;
          }
          return false;
        },

        update: function (dt) {
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.taken) { it.taken += dt; continue; }
            if (!grabbed) it.x += spd * dt;
            it.rot += dt * 1.2;
          }
          claw.down = U.damp(claw.down, claw.closing > 0 ? 1 : 0, 0.05, dt);
          if (claw.closing > 0) claw.closing += dt;
          if (c.result) return;

          if (c.input.actHit && claw.closing === 0) {
            claw.closing = 0.001;
            c.sfx('whoosh');
            var got = null;
            for (var k = 0; k < items.length; k++) {
              var t = items[k];
              if (t.taken) continue;
              if (Math.abs(t.x - zoneX) < zoneW / 2) { got = t; break; }
            }
            if (got && got.gem) {
              got.taken = 0.001; grabbed = true;
              c.sfx('coin'); c.stop(0.06); c.shake(7, 0.22);
              c.fx.burst(got.x, BY - 30, {
                n: 22, color: [GG.PAL.yamabuki, '#ffffff', GG.PAL.mizu], speed: 320, size: 8, shape: 'star'
              });
              c.fx.ring(got.x, BY - 30, { r1: 120, color: GG.PAL.yamabuki, lw: 7 });
              c.win();
            } else {
              c.sfx('hit'); c.shake(12, 0.3);
              if (got) {
                c.fx.burst(got.x, BY - 30, { n: 16, color: ['#7a6f96', '#fff'], speed: 260, size: 7 });
              }
              c.lose();
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, 470, A.GROUND.ishi);

          // ベルトコンベア
          g.block(-20, BY, c.W + 40, 54, '#7f8fa6', { r: 10, lw: 3 });
          ctx.save();
          ctx.beginPath(); ctx.rect(0, BY, c.W, 54); ctx.clip();
          ctx.globalAlpha = 0.22;
          for (var s = 0; s < 26; s++) {
            var sx = U.wrap(s * 46 + (grabbed ? 0 : c.t * spd), c.W + 92) - 46;
            ctx.fillStyle = GG.PAL.paper;
            ctx.fillRect(sx, BY, 18, 54);
          }
          ctx.restore();

          // つかみワク
          var pulse = 1 + 0.04 * Math.sin(c.t * 8);
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.setLineDash([16, 12]);
          ctx.lineDashOffset = -c.t * 40;
          g.rr(zoneX - zoneW / 2 * pulse, BY - 104, zoneW * pulse, 146, 16)
            .stroke(GG.PAL.yamabuki, 5);
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.14;
          g.rr(zoneX - zoneW / 2, BY - 104, zoneW, 146, 16).fill(GG.PAL.yamabuki);
          ctx.restore();

          // アイテム
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.x < -80 || it.x > c.W + 80) continue;
            var y = BY - 12;
            ctx.save();
            if (it.taken) {
              y -= U.easeOutCubic(U.sat(it.taken / 0.4)) * 190;
              ctx.globalAlpha = Math.max(0, 1 - it.taken / 0.5);
            }
            if (it.gem) {
              ctx.save();
              ctx.globalAlpha = ctx.globalAlpha * (0.55 + 0.25 * Math.sin(c.t * 7 + i));
              g.circlePath(it.x, y, 62).fill(g.rgrad(it.x, y, 4, 62,
                [[0, 'rgba(255,240,160,0.85)'], [0.45, 'rgba(255,217,61,0.35)'],
                 [1, 'rgba(255,217,61,0)']]));
              ctx.restore();
              ctx.save();
              ctx.translate(it.x, y); ctx.rotate(Math.sin(it.rot) * 0.16);
              g.polyPath([[0, -32], [28, -6], [16, 30], [-16, 30], [-28, -6]]).ink(GG.PAL.yamabuki, 4);
              g.polyPath([[0, -32], [0, 30], [-28, -6]]).fill('rgba(255,255,255,0.35)');
              ctx.restore();
            } else {
              g.block(it.x - 26, y - 26, 52, 52, '#a9a2b5', { r: 8 });
              g.text('×', it.x, y, { size: 30, fill: GG.PAL.paper });
            }
            ctx.restore();
          }

          // クレーン
          var cy = claw.y + claw.down * 116;
          ctx.save();
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(zoneX, 60); ctx.lineTo(zoneX, cy); ctx.stroke();
          g.rr(zoneX - 60, 40, 120, 26, 8).ink('#8a8296', 2.6);
          var open = claw.closing > 0 ? U.lerp(1, 0.15, U.sat(claw.closing / 0.18)) : 1;
          for (var d = -1; d <= 1; d += 2) {
            ctx.save();
            ctx.translate(zoneX, cy);
            ctx.rotate(d * (0.35 + open * 0.5));
            g.rr(-8, 0, 16, 52, 8).ink(GG.PAL.yamabuki, 3.5);
            ctx.restore();
          }
          g.circlePath(zoneX, cy, 15).ink(GG.PAL.kuchiba, 3.5);
          ctx.restore();

        }
      };
    }
  });
})(window.GG);
