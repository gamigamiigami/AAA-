/* にげろ！ — 走るレーザーをかいくぐって、ゴールのドアまでたどりつく。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'escape',
    verb: 'にげろ！',
    verbEn: 'ESCAPE!',
    control: 'move2',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#3b2a6e', '#332560'],
    style: 'retro',

    create: function (c) {
      var area = { x: 90, y: 140, w: c.W - 180, h: 300 };
      var hero = { x: area.x + 26, y: area.y + area.h / 2 };
      var goal = { x: area.x + area.w - 34, y: area.y + area.h / 2, r: 40 };
      var n = [2, 3, 4][c.diff - 1];
      var lasers = [];
      for (var i = 0; i < n; i++) {
        var vertical = c.rng.chance(0.65);
        lasers.push({
          v: vertical,
          p: vertical ? c.rng.range(area.x + 130, area.x + area.w - 90)
            : c.rng.range(area.y + 60, area.y + area.h - 60),
          amp: c.rng.range(50, 100),
          spd: c.rng.range(1.6, 2.6) * [1, 1.25, 1.5][c.diff - 1],
          ph: c.rng.range(0, 6.28),
          th: 18
        });
      }

      function laserPos(l, t) {
        return l.p + Math.sin(t * l.spd + l.ph) * l.amp;
      }

      return {
        update: function (dt) {
          if (c.result) return;
          c.input.steer2D(hero, {
            x: area.x + 20, y: area.y + 20, w: area.w - 40, h: area.h - 40
          }, 400, dt);

          for (var i = 0; i < lasers.length; i++) {
            var l = lasers[i];
            var p = laserPos(l, c.t);
            var hit = l.v ? Math.abs(hero.x - p) < l.th / 2 + 15
              : Math.abs(hero.y - p) < l.th / 2 + 15;
            if (hit) {
              c.sfx('hit'); c.shake(15, 0.35); c.flash(0.3, GG.PAL.shu);
              c.fx.burst(hero.x, hero.y, { n: 22, color: [GG.PAL.shu, '#fff'], speed: 340, size: 8 });
              c.lose(); return;
            }
          }
          if (U.dist(hero.x, hero.y, goal.x, goal.y) < goal.r) {
            c.sfx('levelup');
            c.fx.confetti(goal.x, goal.y, 30);
            c.win();
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // 部屋
          g.block(area.x - 18, area.y - 18, area.w + 36, area.h + 36, '#c19a66', { r: 14, lw: 3 });
          ctx.save();
          ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
          ctx.fillStyle = GG.PAL.paper; ctx.fillRect(area.x, area.y, area.w, area.h);
          ctx.globalAlpha = 0.05;
          for (var tx = 0; tx < area.w + 60; tx += 60) {
            for (var ty = 0; ty < area.h + 60; ty += 60) {
              g.rr(area.x + tx - 20, area.y + ty - 20, 46, 46, 6).fill(GG.PAL.ai);
            }
          }
          ctx.restore();

          // ゴールのドア
          var gp = 1 + 0.05 * Math.sin(c.t * 6);
          ctx.save();
          ctx.translate(goal.x, goal.y); ctx.scale(gp, gp);
          ctx.globalAlpha = 0.35;
          g.circlePath(0, 0, 58).fill(GG.PAL.wakaba);
          ctx.globalAlpha = 1;
          g.rr(-30, -46, 60, 92, 26).ink(GG.PAL.wakaba, 4.5);
          g.text('EXIT', 0, 0, { size: 17, fill: GG.PAL.paper });
          ctx.restore();

          // レーザー
          for (var i = 0; i < lasers.length; i++) {
            var l = lasers[i], p = laserPos(l, c.t);
            ctx.save();
            ctx.globalAlpha = 0.22;
            if (l.v) g.rr(p - l.th, area.y, l.th * 2, area.h, 8).fill(GG.PAL.shu);
            else g.rr(area.x, p - l.th, area.w, l.th * 2, 8).fill(GG.PAL.shu);
            ctx.globalAlpha = 1;
            if (l.v) {
              g.rr(p - l.th / 2, area.y, l.th, area.h, 6).fill(GG.PAL.shu);
              g.rr(p - 2.5, area.y, 5, area.h, 3).fill(GG.PAL.paper);
              g.circlePath(p, area.y, 11).ink(GG.PAL.shu, 2.4);
              g.circlePath(p, area.y + area.h, 11).ink(GG.PAL.shu, 2.4);
            } else {
              g.rr(area.x, p - l.th / 2, area.w, l.th, 6).fill(GG.PAL.shu);
              g.rr(area.x, p - 2.5, area.w, 5, 3).fill(GG.PAL.paper);
              g.circlePath(area.x, p, 11).ink(GG.PAL.shu, 2.4);
              g.circlePath(area.x + area.w, p, 11).ink(GG.PAL.shu, 2.4);
            }
            ctx.restore();
          }

          A.blob(g, {
            x: hero.x, y: hero.y, r: 22, color: GG.PAL.yamabuki, feet: false,
            lookX: U.clamp((goal.x - hero.x) / 200, -1, 1),
            mouth: c.result === 'lose' ? 'sad' : 'o'
          });

        }
      };
    }
  });
})(window.GG);
