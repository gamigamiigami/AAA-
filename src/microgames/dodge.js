/* よけろ！ — 落ちてくるトゲ玉を避けきる。時間切れで勝ち。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'dodge',
    verb: 'よけろ！',
    verbEn: 'DODGE!',
    control: 'move',
    beats: 8,
    defaultResult: 'win',
    bg: ['#00a0e9', '#0090d8'],
    style: 'toon',

    create: function (c) {
      var GY = 442;
      var hero = { x: c.W / 2, r: 29, squash: 1, hurt: 0 };
      var drops = [];
      var count = [5, 7, 9][c.diff - 1];
      var speed = [430, 500, 570][c.diff - 1];
      var i;
      for (i = 0; i < count; i++) {
        drops.push({
          x: c.rng.range(70, c.W - 70),
          y: -60 - i * c.rng.range(120, 190),
          r: c.rng.range(25, 35),
          vy: speed * c.rng.range(0.85, 1.15),
          rot: c.rng.range(0, 6.28),
          spin: c.rng.range(-3, 3),
          dead: 0
        });
      }
      var puffs = [];

      return {
        update: function (dt) {
          if (c.result) {
            hero.squash = U.damp(hero.squash, 1, 0.08, dt);
            return;
          }
          hero.x = c.input.steerX(hero.x, 48, c.W - 48, 470, dt);
          hero.squash = U.damp(hero.squash, 1, 0.09, dt);

          for (var i = 0; i < drops.length; i++) {
            var d = drops[i];
            if (d.dead) { d.dead += dt; continue; }
            d.y += d.vy * dt;
            d.rot += d.spin * dt;
            if (U.circHit(hero.x, GY - 29, hero.r * 0.74, d.x, d.y, d.r * 0.8)) {
              c.fx.burst(d.x, d.y, { n: 16, color: [GG.PAL.shu, '#ffffff'], speed: 300, size: 8 });
              c.sfx('hit');
              c.lose();
              return;
            }
            if (d.y > GY + 10 && !d.dead) {
              d.dead = 0.001;
              d.y = GY;
              c.fx.burst(d.x, GY, {
                n: 7, color: ['#a99ccc', '#ffffff'], speed: 190,
                dir: -Math.PI / 2, spread: 1.1, size: 5, life: 0.4
              });
              c.sfx('land');
              c.shake(4, 0.14);
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, GY + 12, A.GROUND.ishi);

          /* 落ちてくる先は教えない。
           *
           * 以前は玉が出た瞬間から、着地点まで床まで届く赤い線と、床の丸印を
           * 出していた。読みやすさのつもりだったが、答えを最初に配っていた。
           * 答えが見えている以上、あとは線の上を外して立っているだけで、
           * よけるという動作がどこにも無い。
           *
           * 玉そのものは空から見えている。それを見て動くのがこのゲームで、
           * ここに残すのは「もう来る」という直前の気配だけでいい。 */
          ctx.save();
          for (var i = 0; i < drops.length; i++) {
            var d = drops[i];
            if (d.dead) continue;
            var ttl = (GY - d.y) / d.vy;          // 着地までの秒数
            if (ttl > 0.3 || ttl < 0) continue;
            var near = 1 - ttl / 0.3;
            ctx.globalAlpha = near * 0.3;
            g.ellipsePath(d.x, GY + 6, d.r * (0.35 + near * 0.4), d.r * 0.2).fill(GG.PAL.shu);
          }
          ctx.restore();

          A.blob(g, {
            x: hero.x, y: GY - 29, r: hero.r, color: GG.PAL.yamabuki,
            squash: hero.squash, shadowY: GY + 14,
            lookX: 0, lookY: -0.6, mouth: c.result === 'lose' ? 'sad' : 'o'
          });

          for (var k = 0; k < drops.length; k++) {
            var dd = drops[k];
            if (dd.dead) continue;
            A.spike(g, dd.x, dd.y, dd.r, GG.PAL.shu, dd.rot);
          }
        }
      };
    }
  });
})(window.GG);
