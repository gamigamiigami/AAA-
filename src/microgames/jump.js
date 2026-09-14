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
    bg: ['#ff8000', '#f07000'],
    style: 'pixel',

    create: function (c) {
      var GY = 424;
      var hero = { x: 250, y: GY, vy: 0, air: false, squash: 1, run: 0 };
      var GRAV = 2800, JUMP = 820;      // 滞空 0.59 秒。最高到達点 120px
      var n = [2, 2, 3][c.diff - 1];
      var spd = [560, 640, 730][c.diff - 1];
      var obs = [];
      var gap = 0;
      for (var i = 0; i < n; i++) {
        gap += spd * c.rng.range(0.76, 0.88);   // 滞空より必ず長い間隔にする
        obs.push({
          x: c.W + 40 + gap, w: c.rng.range(38, 54),
          h: c.rng.range(52, 74), passed: false   // 跳躍 120px より必ず低く
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
            /* 跳ぶ高さは一定にする。
             *
             * 以前は「早く離すと低く跳ぶ」可変ジャンプだった。キーボードで
             * 長押しできる人には気持ちのいい仕掛けだが、マウスをカチッと
             * 一回押しただけだと 57px しか上がらない。障害物は最大 78px。
             * つまりクリックで遊ぶ人は、どれだけ正確に押しても越えられない。
             * 同じ画面が、持っている道具で「遊べる／遊べない」に分かれていた。
             *
             * 3 秒で終わるミニゲームに跳ぶ高さの使い分けは要らない。
             * 一回押したら必ず同じ高さ跳ぶ、が答えになる。 */
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
            var hb = { x: hero.x - 22, y: hero.y - 54, w: 44, h: 54 };
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

          /* ドットの目が粗い画風なので、体そのものを大きく取る。
           * 小さく描いたものを粗く写すと、画風ではなく事故になる。 */
          A.blob(g, {
            x: hero.x, y: hero.y - 31, r: 31, color: GG.PAL.asagi,
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
