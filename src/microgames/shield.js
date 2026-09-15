/* ふせげ！ — 飛んでくる方向にタテを向けて防ぐ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  // dir は「攻撃が飛んでくる側」。プレイヤーはその側にタテを向ける。
  var DIRS = ['left', 'right', 'up', 'down'];
  var VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  var OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

  GG.reg({
    id: 'shield',
    verb: 'ふせげ！',
    verbEn: 'BLOCK!',
    control: 'dir',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#1f3a6e', '#1b3260'],
    style: 'toon',

    create: function (c) {
      var cx = c.W / 2, cy = 300;
      var n = [1, 2, 3][c.diff - 1];
      var shots = [];
      var order = c.rng.shuffle(DIRS.slice()).slice(0, n);

      /* 画面は 960×540。中心から左右には 480 あるが、上下には 270 しかない。
       * 同じ速さで飛ばすと、上下から来る弾だけ反応時間が 3 割短くなる。
       * 難しいのではなく、方向によって別のゲームを遊ばされていた。
       *
       * 直し方は「距離を揃える」ではない。上下に 560 の助走はそもそも置けない。
       * 揃えるのは時間のほうで、飛ぶ距離は画面の都合、速さはその割り算にする。
       * 遊ぶ人が感じるのは距離ではなく、来ると分かってから当たるまでの間だけ。 */
      var REACT = [1.05, 0.88, 0.66][c.diff - 1];   // 動き出してから届くまで（秒）
      var HIT = 74;                                  // タテで受け止める距離
      var RUN = { left: 500, right: 500, up: 285, down: 262 };
      for (var i = 0; i < n; i++) {
        var d = order[i];
        var v = VEC[d];
        shots.push({
          dir: d, t: 0, delay: 0.35 + i * [1.0, 1.0, 0.78][c.diff - 1],
          x: cx + v[0] * RUN[d], y: cy + v[1] * RUN[d], blocked: 0,
          spd: (RUN[d] - HIT) / REACT
        });
      }
      var facing = OPPOSITE[order[0]];   // 必ず一度は向きを変える必要がある
      var turn = 0, blockPop = 0, blocked = 0;

      return {
        /* QA 用: 次に受けるべき向きと、画面の中心。 */
        probe: function () {
          for (var i = 0; i < shots.length; i++) {
            if (!shots[i].blocked) {
              return { dir: shots[i].dir, cx: cx, cy: cy, vec: VEC[shots[i].dir] };
            }
          }
          return null;
        },

        update: function (dt) {
          blockPop = Math.max(0, blockPop - dt * 3);
          var d = c.input.dirHit();
          if (d && !c.result) {
            if (d !== facing) { facing = d; turn = 1; c.sfx('click'); }
          }
          // ポインタ: 中心からの方向で決める
          if (c.input.pHit && !c.result) {
            var dx = c.input.x - cx, dy = c.input.y - cy;
            var nd = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right')
              : (dy < 0 ? 'up' : 'down');
            if (nd !== facing) { facing = nd; turn = 1; c.sfx('click'); }
          }
          turn = Math.max(0, turn - dt * 4);
          if (c.result) return;

          for (var i = 0; i < shots.length; i++) {
            var s = shots[i];
            if (s.blocked) { s.blocked += dt; continue; }
            s.t += dt;
            if (s.t < s.delay) continue;
            var v = VEC[s.dir];
            s.x -= v[0] * s.spd * dt;    // 中心に向かって飛ぶ
            s.y -= v[1] * s.spd * dt;
            var dist = U.dist(s.x, s.y, cx, cy);
            if (dist < HIT) {
              if (facing === s.dir) {
                s.blocked = 0.001; blocked++; blockPop = 1;
                c.sfx('thud'); c.stop(0.06); c.shake(9, 0.24);
                c.fx.burst(s.x, s.y, {
                  n: 18, color: [GG.PAL.yamabuki, '#ffffff'], speed: 330,
                  dir: Math.atan2(v[1], v[0]), spread: 1.1, size: 8
                });
                c.fx.ring(cx + v[0] * 66, cy + v[1] * 66, { r1: 120, color: GG.PAL.yamabuki, lw: 8 });
                if (blocked >= shots.length) { c.win(); return; }
              } else {
                c.sfx('hit'); c.shake(16, 0.4); c.flash(0.3, GG.PAL.shu);
                c.fx.burst(cx, cy, { n: 24, color: [GG.PAL.shu, '#fff'], speed: 360, size: 9 });
                c.lose(); return;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.13;
          for (var i = 0; i < 5; i++) {
            g.circlePath(cx, cy, 90 + i * 78 + Math.sin(c.t * 2 + i) * 6).stroke(GG.PAL.paper, 3);
          }
          ctx.restore();
          A.ground(g, 458, A.GROUND.ishi);

          /* 矢印は「どこから来るか」の印。出したら、最後まで消さない。
           *
           * 飛び終わった矢印を消すと、画面が勝手に「もう右からは来ない」と
           * 教えてしまう。残り 1 発になったころには、矢印が 1 本しか
           * 残っていないので、どこを向けばいいかを考える必要すら無くなる。
           * 防ぐ遊びなのに、防ぐ前に答えが出ている。
           *
           * ずっと出したままにして、これから飛んでくる矢印だけを光らせる。
           * 知らせるのは「次はここ」であって、「ここはもう終わった」ではない。 */
          for (var k = 0; k < shots.length; k++) {
            var s = shots[k];
            var v = VEC[s.dir];
            var coming = !s.blocked && s.t < s.delay;
            ctx.save();
            ctx.globalAlpha = coming ? 0.25 + 0.55 * Math.abs(Math.sin(c.t * 9)) : 0.2;
            A.arrow(g, cx + v[0] * 300, cy + v[1] * 200, OPPOSITE[s.dir], 42, GG.PAL.shu);
            ctx.restore();
          }

          // プレイヤー
          A.blob(g, {
            x: cx, y: cy, r: 40, color: GG.PAL.asagi, feet: false,
            lookX: VEC[facing][0] * 0.8, lookY: VEC[facing][1] * 0.8,
            mouth: c.result === 'lose' ? 'sad' : 'flat',
            shadowY: 470
          });

          // タテ
          var v2 = VEC[facing];
          var pushed = blockPop * 12;
          ctx.save();
          ctx.translate(cx + v2[0] * (68 - pushed), cy + v2[1] * (68 - pushed));
          ctx.rotate(Math.atan2(v2[1], v2[0]) + Math.PI / 2);
          ctx.scale(1 + turn * 0.16, 1 - turn * 0.12);
          g.rr(-46, -14, 92, 28, 12).ink(GG.PAL.yamabuki, 4.5);
          g.rr(-38, -9, 76, 10, 5).fill('rgba(255,255,255,0.45)');
          ctx.restore();

          // 弾
          for (var j = 0; j < shots.length; j++) {
            var sh = shots[j];
            if (sh.blocked || sh.t < sh.delay) continue;
            var vv = VEC[sh.dir];
            ctx.save();
            ctx.translate(sh.x, sh.y);
            ctx.rotate(Math.atan2(-vv[1], -vv[0]));
            ctx.globalAlpha = 0.4;
            g.ellipsePath(-34, 0, 40, 12).fill(GG.PAL.shu);
            ctx.globalAlpha = 1;
            g.ellipsePath(0, 0, 26, 17).ink(GG.PAL.shu, 4);
            g.ellipsePath(-6, -4, 9, 6).fill('rgba(255,255,255,0.5)');
            ctx.restore();
          }

        }
      };
    }
  });
})(window.GG);
