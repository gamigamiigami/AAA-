/* うて！ — 出てきた的を全部うち抜く。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'shoot',
    verb: 'うて！',
    verbEn: 'SHOOT!',
    control: 'aim',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#2f4a6b', '#101a2c'],

    create: function (c) {
      var n = [2, 3, 4][c.diff - 1];
      var spd = [110, 150, 190][c.diff - 1];
      var targets = [];
      for (var i = 0; i < n; i++) {
        targets.push({
          x: c.rng.range(150, c.W - 150),
          y: c.rng.range(250, 400),
          r: [46, 42, 38][c.diff - 1],
          vx: c.rng.sign() * spd * c.rng.range(0.8, 1.2),
          vy: c.rng.sign() * spd * c.rng.range(0.4, 0.8),
          hit: 0, born: i * 0.12, rot: 0
        });
      }
      var left = n;
      var shots = [];
      var recoil = 0;

      return {
        update: function (dt) {
          recoil = Math.max(0, recoil - dt * 5);
          for (var i = 0; i < targets.length; i++) {
            var t = targets[i];
            if (t.hit) { t.hit += dt; continue; }
            t.x += t.vx * dt; t.y += t.vy * dt;
            t.rot += dt * 1.6;
            if (t.x < 110 || t.x > c.W - 110) { t.vx *= -1; t.x = U.clamp(t.x, 110, c.W - 110); }
            if (t.y < 235 || t.y > 405) { t.vy *= -1; t.y = U.clamp(t.y, 235, 405); }
          }
          for (var s = shots.length - 1; s >= 0; s--) {
            shots[s].t += dt;
            if (shots[s].t > 0.3) shots.splice(s, 1);
          }
          if (c.result) return;

          if (c.input.pHit || c.input.actHit) {
            var px = c.input.x, py = c.input.y;
            recoil = 1;
            shots.push({ x: px, y: py, t: 0 });
            c.sfx('blip');
            var got = false;
            for (var k = 0; k < targets.length; k++) {
              var tt = targets[k];
              if (tt.hit) continue;
              if (U.dist(px, py, tt.x, tt.y) < tt.r) {
                tt.hit = 0.001; got = true; left--;
                c.sfx('pop'); c.stop(0.05); c.shake(6, 0.18);
                c.fx.burst(tt.x, tt.y, {
                  n: 18, color: ['#ff5e7d', '#ffd93d', '#ffffff'], speed: 330, size: 8
                });
                c.fx.ring(tt.x, tt.y, { r1: 110, color: '#ffffff', lw: 7 });
                c.fx.floatText(tt.x, tt.y - 30, 'HIT!',
                  { color: '#ffd93d', size: 30, stroke: '#5a3d00' });
                if (left <= 0) { c.win(); return; }
                break;
              }
            }
            if (!got) {
              c.fx.burst(px, py, { n: 5, color: ['#8899aa'], speed: 130, size: 4, life: 0.3 });
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // 射的小屋: 天幕 + 提灯 + カウンター
          ctx.save(); ctx.globalAlpha = 0.22;
          for (var i = 1; i <= 4; i++) {
            var w = c.W * (0.3 + i * 0.17), h = 300 * (0.32 + i * 0.17);
            g.rr(c.W / 2 - w / 2, 296 - h / 2, w, h, 22).stroke('#7fd7ff', 3);
          }
          ctx.restore();
          // 天幕（HUD の帯を避けて 66px から下げる）
          var TENT = 66;
          for (var s = 0; s < 12; s++) {
            var sw = c.W / 12;
            g.polyPath([[s * sw, TENT], [(s + 1) * sw, TENT],
              [(s + 1) * sw, TENT + 44], [s * sw + sw / 2, TENT + 70], [s * sw, TENT + 44]])
              .fill(s % 2 ? '#e8425f' : '#f5f0ff');
          }
          ctx.save(); ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#000'; ctx.fillRect(0, TENT + 44, c.W, 12);
          ctx.restore();
          // 提灯
          for (var l = 0; l < 7; l++) {
            var lx = 70 + l * 140, ly = 190 + Math.sin(c.t * 1.6 + l) * 6;
            ctx.save(); ctx.globalAlpha = 0.9;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(lx, 122); ctx.lineTo(lx, ly - 14); ctx.stroke();
            g.ellipsePath(lx, ly, 13, 17).ink(['#ffd93d', '#ff8fa3', '#8be9fd'][l % 3], 2.6);
            ctx.restore();
          }
          A.ground(g, 462, { top: '#4a6a94', body: '#2c4463', deep: '#16283e' });
          g.block(-20, 470, c.W + 40, 90, '#7a4f2e', { r: 14, lw: 4, gloss: 0.1 });

          for (var k = 0; k < targets.length; k++) {
            var t = targets[k];
            var app = U.sat((c.t - t.born) / 0.25);
            if (app <= 0) continue;
            ctx.save();
            ctx.translate(t.x, t.y);
            var sc = U.easeOutBack(app);
            if (t.hit) { sc *= 1 + t.hit * 3; ctx.globalAlpha = Math.max(0, 1 - t.hit * 4); }
            ctx.scale(sc, sc);
            ctx.rotate(Math.sin(t.rot) * 0.12);
            g.circlePath(0, 0, t.r).ink('#f5f0ff', 4);
            g.circlePath(0, 0, t.r * 0.74).fill('#ff5e7d');
            g.circlePath(0, 0, t.r * 0.48).fill('#f5f0ff');
            g.circlePath(0, 0, t.r * 0.22).fill('#ff5e7d');
            ctx.restore();
          }

          for (var s = 0; s < shots.length; s++) {
            var sh = shots[s], kk = sh.t / 0.3;
            ctx.save(); ctx.globalAlpha = 1 - kk;
            g.circlePath(sh.x, sh.y, 6 + kk * 22).stroke('#ffd93d', 4 * (1 - kk));
            ctx.restore();
          }

          A.tip(g, 122, 512, 'のこり ' + Math.max(0, left), 24);

          // 照準
          var cx = c.input.x, cy = c.input.y;
          ctx.save();
          ctx.translate(cx, cy);
          var rr = 22 + recoil * 10;
          ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.globalAlpha = 0.95;
          g.circlePath(0, 0, rr).stroke('#ffd93d', 3.5);
          ctx.beginPath();
          ctx.moveTo(-rr - 12, 0); ctx.lineTo(-rr + 4, 0);
          ctx.moveTo(rr + 12, 0); ctx.lineTo(rr - 4, 0);
          ctx.moveTo(0, -rr - 12); ctx.lineTo(0, -rr + 4);
          ctx.moveTo(0, rr + 12); ctx.lineTo(0, rr - 4);
          ctx.stroke();
          g.circlePath(0, 0, 3).fill('#ffd93d');
          ctx.restore();
        }
      };
    }
  });
})(window.GG);
