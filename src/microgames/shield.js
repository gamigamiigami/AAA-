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
    bg: ['#4a6fa5', '#151f36'],

    create: function (c) {
      var cx = c.W / 2, cy = 300;
      var n = [1, 2, 2][c.diff - 1];
      var spd = [340, 400, 470][c.diff - 1];
      var shots = [];
      var order = c.rng.shuffle(DIRS.slice()).slice(0, n);
      for (var i = 0; i < n; i++) {
        var d = order[i];
        var v = VEC[d];
        shots.push({
          dir: d, t: 0, delay: 0.35 + i * (c.diff === 3 ? 0.85 : 1.0),
          x: cx + v[0] * 560, y: cy + v[1] * 400, blocked: 0
        });
      }
      var facing = OPPOSITE[order[0]];   // 必ず一度は向きを変える必要がある
      var turn = 0, blockPop = 0, blocked = 0;

      return {
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
            s.x -= v[0] * spd * dt;      // 中心に向かって飛ぶ
            s.y -= v[1] * spd * dt;
            var dist = U.dist(s.x, s.y, cx, cy);
            if (dist < 74) {
              if (facing === s.dir) {
                s.blocked = 0.001; blocked++; blockPop = 1;
                c.sfx('thud'); c.stop(0.06); c.shake(9, 0.24);
                c.fx.burst(s.x, s.y, {
                  n: 18, color: ['#ffd93d', '#ffffff'], speed: 330,
                  dir: Math.atan2(v[1], v[0]), spread: 1.1, size: 8
                });
                c.fx.ring(cx + v[0] * 66, cy + v[1] * 66, { r1: 120, color: '#ffd93d', lw: 8 });
                if (blocked >= shots.length) { c.win(); return; }
              } else {
                c.sfx('hit'); c.shake(16, 0.4); c.flash(0.3, '#ff5e7d');
                c.fx.burst(cx, cy, { n: 24, color: ['#ff5e7d', '#fff'], speed: 360, size: 9 });
                c.lose(); return;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.13;
          for (var i = 0; i < 5; i++) {
            g.circlePath(cx, cy, 90 + i * 78 + Math.sin(c.t * 2 + i) * 6).stroke('#fff', 3);
          }
          ctx.restore();
          A.ground(g, 458, { top: '#7f93b8', body: '#3d4f73', deep: '#212b45' });

          // 予告インジケータ
          for (var k = 0; k < shots.length; k++) {
            var s = shots[k];
            if (s.blocked || s.t >= s.delay) continue;
            var warn = U.sat((s.t) / s.delay);
            var v = VEC[s.dir];
            ctx.save();
            ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(c.t * 9));
            A.arrow(g, cx + v[0] * 300, cy + v[1] * 200, OPPOSITE[s.dir], 42, '#ff5e7d');
            ctx.restore();
          }

          // プレイヤー
          A.blob(g, {
            x: cx, y: cy, r: 40, color: '#4ecdc4', feet: false,
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
          g.rr(-46, -14, 92, 28, 12).ink('#ffd93d', 4.5);
          g.rr(-38, -9, 76, 10, 5).fill('rgba(255,255,255,0.4)');
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
            g.ellipsePath(-34, 0, 40, 12).fill('#ff5e7d');
            ctx.globalAlpha = 1;
            g.ellipsePath(0, 0, 26, 17).ink('#ff5e7d', 4);
            g.ellipsePath(-6, -4, 9, 6).fill('rgba(255,255,255,0.55)');
            ctx.restore();
          }

          A.tip(g, c.W / 2, 108, 'くる ほうこうに タテを むけろ', 24);
        }
      };
    }
  });
})(window.GG);
