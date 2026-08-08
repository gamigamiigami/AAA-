/* とべ！ — 走ってくる障害物をジャンプでかわす。最後まで生き残れば勝ち。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'jump',
    verb: 'とべ！',
    verbEn: 'JUMP!',
    control: 'press',
    beats: 8,
    defaultResult: 'win',
    bg: ['#fadfbc', '#f0bd8c'],

    create: function (c) {
      var GY = 424;
      var hero = { x: 250, y: GY, vy: 0, air: false, squash: 1, run: 0 };
      var GRAV = 2800, JUMP = 820;      // 滞空 0.59 秒
      var n = [2, 2, 3][c.diff - 1];
      var spd = [560, 640, 730][c.diff - 1];
      var obs = [];
      var gap = 0;
      for (var i = 0; i < n; i++) {
        gap += spd * c.rng.range(0.76, 0.88);   // 滞空より必ず長い間隔にする
        obs.push({
          x: c.W + 40 + gap, w: c.rng.range(38, 54),
          h: c.rng.range(52, 78), passed: false
        });
      }

      return {
        /* QA 用: 次の障害物までの距離。ゲーム進行には影響しない。 */
        probe: function () {
          var best = Infinity;
          for (var i = 0; i < obs.length; i++) {
            var d = obs[i].x - hero.x;
            if (d > -30 && d < best) best = d;
          }
          return { gap: best, ttc: best / spd, air: hero.air };
        },

        update: function (dt) {
          hero.run += dt;
          if (!c.result) {
            if (c.input.actHit && !hero.air) {
              hero.air = true; hero.vy = -JUMP; hero.squash = 1.32;
              c.sfx('jump');
              c.fx.burst(hero.x, GY, {
                n: 9, color: ['#ffffff', '#f6dca4'], speed: 210,
                dir: Math.PI / 2, spread: 1.4, size: 6, life: 0.35, gravity: 300
              });
            }
            // 早めに離すと低くジャンプ（可変ジャンプで操作感を出す）
            if (hero.air && hero.vy < -260 && !c.input.act) hero.vy += GRAV * 1.4 * dt;
          }
          if (hero.air) {
            hero.vy += GRAV * dt;
            hero.y += hero.vy * dt;
            if (hero.y >= GY) {
              hero.y = GY; hero.vy = 0; hero.air = false; hero.squash = 0.7;
              c.sfx('land');
              c.fx.burst(hero.x, GY, {
                n: 7, color: ['#ffffff'], speed: 170, dir: -Math.PI / 2,
                spread: 1.5, size: 5, life: 0.3
              });
            }
          }
          hero.squash = U.damp(hero.squash, hero.air ? 1.12 : 1, 0.09, dt);

          for (var i = 0; i < obs.length; i++) {
            var o = obs[i];
            if (!c.result) o.x -= spd * dt;
            if (!o.passed && o.x + o.w < hero.x - 20) {
              o.passed = true;
              if (!c.result) {
                c.sfx('coin');
                c.fx.floatText(hero.x, hero.y - 90, 'ナイス！',
                  { color: GG.PAL.yamabuki, size: 26, stroke: '#5a3d00' });
              }
            }
            if (c.result) continue;
            var hb = { x: hero.x - 20, y: hero.y - 46, w: 40, h: 46 };
            var ob = { x: o.x, y: GY - o.h, w: o.w, h: o.h };
            if (U.rectHit(hb, ob)) {
              c.sfx('hit');
              c.fx.burst(o.x, GY - o.h / 2, {
                n: 20, color: [GG.PAL.shu, '#ffffff'], speed: 330, size: 9
              });
              c.lose(); return;
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // 遠景の山
          ctx.save(); ctx.globalAlpha = 0.3;
          for (var m = 0; m < 5; m++) {
            var mx = U.wrap(m * 260 - c.t * 60, c.W + 520) - 200;
            g.polyPath([[mx, GY + 12], [mx + 150, 210], [mx + 300, GY + 12]]).fill('#a9bcd4');
          }
          ctx.restore();

          A.ground(g, GY + 12, A.GROUND.kusa);

          // スクロールの手がかりになる縞
          ctx.save(); ctx.globalAlpha = 0.10;
          for (var s = 0; s < 14; s++) {
            var sx = U.wrap(s * 90 - c.t * 560, c.W + 180) - 90;
            ctx.fillStyle = GG.PAL.ink; ctx.fillRect(sx, GY + 34, 46, 8);
          }
          ctx.restore();

          for (var i = 0; i < obs.length; i++) {
            var o = obs[i];
            if (o.x > c.W + 60 || o.x < -100) continue;
            A.spike(g, o.x + o.w / 2, GY - o.h + o.w / 2, o.w * 0.72, GG.PAL.shu, c.t * 2);
            g.block(o.x, GY - o.h + o.w * 0.5, o.w, o.h - o.w * 0.5, '#8a8296', { r: 8 });
          }

          A.blob(g, {
            x: hero.x, y: hero.y - 26, r: 26, color: GG.PAL.asagi,
            squash: hero.squash, shadowY: GY + 12,
            rot: hero.air ? -0.18 : Math.sin(hero.run * 18) * 0.06,
            lookX: 0.6, lookY: hero.air ? -0.4 : 0,
            mouth: c.result === 'lose' ? 'sad' : (hero.air ? 'o' : 'smile')
          });
        }
      };
    }
  });
})(window.GG);
