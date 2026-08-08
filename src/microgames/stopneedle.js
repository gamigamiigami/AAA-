/* とめろ！ — 往復する針を、みどりのゾーンでピタッと止める。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'stopneedle',
    verb: 'とめろ！',
    verbEn: 'STOP!',
    control: 'press',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#7b2fbe', '#6d24ad'],
    style: 'retro',

    create: function (c) {
      var A0 = -Math.PI * 0.86, A1 = -Math.PI * 0.14;  // メーターの範囲
      var zoneHalf = [0.13, 0.10, 0.075][c.diff - 1];
      var zoneC = c.rng.range(0.28, 0.72);
      var speed = [1.15, 1.45, 1.75][c.diff - 1];
      var p = 0, dir = 1, stopped = false, stopP = 0, judgedPerfect = false;
      var cx = c.W / 2, cy = 392, R = 190;

      function ang(t) { return U.lerp(A0, A1, t); }

      return {
        /* QA 用: 針の位置と当たりゾーン。 */
        probe: function () {
          return { p: p, dir: dir, c: zoneC, half: zoneHalf, stopped: stopped };
        },

        update: function (dt) {
          if (stopped || c.result) return;
          p += dir * speed * dt;
          if (p > 1) { p = 1 - (p - 1); dir = -1; c.sfx('tick'); }
          if (p < 0) { p = -p; dir = 1; c.sfx('tick'); }

          if (c.input.actHit) {
            stopped = true; stopP = p;
            var d = Math.abs(p - zoneC);
            if (d <= zoneHalf) {
              judgedPerfect = d <= zoneHalf * 0.32;
              c.sfx(judgedPerfect ? 'levelup' : 'coin');
              c.stop(0.07); c.shake(judgedPerfect ? 10 : 5, 0.3);
              var px = cx + Math.cos(ang(p)) * R, py = cy + Math.sin(ang(p)) * R;
              c.fx.burst(px, py, {
                n: judgedPerfect ? 30 : 16,
                color: judgedPerfect ? [GG.PAL.yamabuki, '#ffffff', GG.PAL.wakaba] : [GG.PAL.wakaba, '#ffffff'],
                speed: 340, size: 8, shape: 'star'
              });
              c.fx.ring(px, py, { r1: 130, color: '#ffffff', lw: 8 });
              if (judgedPerfect) {
                c.fx.floatText(cx, cy - 130, 'PERFECT!',
                  { color: GG.PAL.yamabuki, size: 42, stroke: '#5a3d00' });
              }
              c.win();
            } else {
              c.sfx('hit'); c.shake(12, 0.3);
              c.lose();
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;

          // 台座
          g.block(cx - 200, cy - 10, 400, 96, '#c19a66', { r: 12, lw: 3 });

          // メーターの弧
          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#ddd5c4'; ctx.lineWidth = 42;
          ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();
          ctx.strokeStyle = 'rgba(64,58,72,0.10)'; ctx.lineWidth = 34;
          ctx.beginPath(); ctx.arc(cx, cy, R, A0, A1); ctx.stroke();

          // 目盛り
          for (var t = 0; t <= 20; t++) {
            var a = U.lerp(A0, A1, t / 20);
            var r0 = R + (t % 5 === 0 ? 22 : 15), r1 = R + 26;
            ctx.strokeStyle = GG.PAL.ink;
            ctx.lineWidth = t % 5 === 0 ? 4 : 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.stroke();
          }

          // 当たりゾーン
          var za = U.lerp(A0, A1, U.sat(zoneC - zoneHalf));
          var zb = U.lerp(A0, A1, U.sat(zoneC + zoneHalf));
          var pulse = 1 + 0.08 * Math.sin(c.t * 7);
          ctx.strokeStyle = GG.PAL.wakaba; ctx.lineWidth = 42 * pulse;
          ctx.beginPath(); ctx.arc(cx, cy, R, za, zb); ctx.stroke();
          var pa = U.lerp(A0, A1, U.sat(zoneC - zoneHalf * 0.32));
          var pb = U.lerp(A0, A1, U.sat(zoneC + zoneHalf * 0.32));
          ctx.strokeStyle = GG.PAL.yamabuki; ctx.lineWidth = 42;
          ctx.beginPath(); ctx.arc(cx, cy, R, pa, pb); ctx.stroke();
          ctx.restore();

          // 針
          var cur = stopped ? stopP : p;
          var a2 = U.lerp(A0, A1, cur);
          ctx.save();
          ctx.translate(cx, cy); ctx.rotate(a2 + Math.PI / 2);
          if (stopped) {
            var wob = Math.sin(c.t * 26) * Math.exp(-c.t * 3) * 0.06;
            ctx.rotate(wob);
          }
          g.polyPath([[-11, 26], [0, -R - 34], [11, 26]]).ink(GG.PAL.shu, 4);
          ctx.restore();
          g.circlePath(cx, cy, 24).ink(GG.PAL.yamabuki, 4);
          g.circlePath(cx - 6, cy - 7, 6).fill('rgba(255,255,255,0.65)');

        }
      };
    }
  });
})(window.GG);
