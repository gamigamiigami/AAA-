/* BOSS: きめろ！ — 8拍のリズム譜を最後まで叩ききる。リズム天国オマージュのボス。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'boss_band',
    verb: 'きめろ！',
    verbEn: 'NAIL IT!',
    control: 'press',
    beats: 16,
    boss: true,
    defaultResult: 'lose',
    bg: ['#1b2a6b', '#080c28'],

    create: function (c) {
      var beatSec = 60 / 132;
      // 8分・4分を混ぜた譜面。難易度で密度が変わる。
      var patterns = [
        [0, 1, 2, 3, 4, 5, 6, 7],
        [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 7],
        [0, 0.5, 1, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 7]
      ];
      var pat = patterns[c.diff - 1];
      var startT = beatSec * 3.5;
      var notes = pat.map(function (b) {
        return { t: startT + b * beatSec, done: 0, missed: 0 };
      });
      var win0 = [0.19, 0.165, 0.145][c.diff - 1];
      var hits = 0, misses = 0;
      var maxMiss = 1;
      var drumSq = 1, flashT = 9, cheer = 0;

      var LANE_Y = 348, JUDGE_X = 250, LEAD = beatSec * 4;

      return {
        update: function (dt) {
          drumSq = U.damp(drumSq, 1, 0.06, dt);
          flashT += dt;
          cheer = Math.max(0, cheer - dt * 2);
          if (c.result) return;

          var i, n;
          if (c.input.actHit) {
            var best = -1, bestD = 9;
            for (i = 0; i < notes.length; i++) {
              n = notes[i];
              if (n.done || n.missed) continue;
              var d = Math.abs(c.t - n.t);
              if (d < bestD) { bestD = d; best = i; }
            }
            if (best >= 0 && bestD <= win0) {
              var perfect = bestD <= win0 * 0.42;
              notes[best].done = perfect ? 2 : 1;
              hits++; drumSq = 0.62; flashT = 0; cheer = 1;
              c.sfx(perfect ? 'coin' : 'pop');
              c.stop(0.03);
              c.fx.burst(JUDGE_X, LANE_Y, {
                n: perfect ? 18 : 10,
                color: perfect ? ['#ffd93d', '#fff'] : ['#8be9fd', '#fff'],
                speed: 300, size: 7, shape: 'star'
              });
              if (perfect) c.fx.ring(JUDGE_X, LANE_Y, { r1: 110, color: '#ffd93d', lw: 6 });
            } else {
              misses++;
              c.sfx('hit'); c.shake(10, 0.25);
              c.fx.floatText(JUDGE_X, LANE_Y - 80, 'MISS',
                { color: '#ff5e7d', size: 30, stroke: '#12163a' });
              if (misses > maxMiss) { c.lose(); return; }
            }
          }

          for (i = 0; i < notes.length; i++) {
            n = notes[i];
            if (!n.done && !n.missed && c.t > n.t + win0) {
              n.missed = 1; misses++;
              c.sfx('hit'); c.shake(8, 0.2);
              c.fx.floatText(JUDGE_X, LANE_Y - 80, 'ぬけた！',
                { color: '#ff5e7d', size: 28, stroke: '#12163a' });
              if (misses > maxMiss) { c.lose(); return; }
            }
          }
          if (hits + misses >= notes.length && hits >= notes.length - maxMiss) {
            c.sfx('levelup');
            c.fx.confetti(c.W / 2, 240, 46);
            c.win();
          }
        },

        draw: function (g) {
          var ctx = g.c;
          // ステージのライト
          ctx.save();
          for (var l = 0; l < 5; l++) {
            var a = -Math.PI / 2 + Math.sin(c.t * 0.9 + l * 1.2) * 0.5;
            ctx.save();
            ctx.translate(c.W / 2 + (l - 2) * 190, -30);
            ctx.rotate(a + Math.PI / 2);
            ctx.globalAlpha = 0.12 + 0.05 * Math.sin(c.t * 5 + l);
            g.polyPath([[0, 0], [190, 620], [-190, 620]])
              .fill(['#ff5e7d', '#ffd93d', '#4ecdc4', '#8367ff', '#7bed9f'][l]);
            ctx.restore();
          }
          ctx.restore();

          A.ground(g, 452, { top: '#3a4a9e', body: '#232c66', deep: '#12163a' });

          // 観客
          ctx.save();
          for (var i = 0; i < 22; i++) {
            var r = new U.RNG(700 + i);
            var x = r.range(20, c.W - 20), y = 470 + r.range(0, 40);
            var bob = Math.sin(c.t * 5 + i) * (4 + cheer * 8);
            ctx.globalAlpha = 0.55;
            g.circlePath(x, y - bob, r.range(16, 24)).fill('#0d1130');
          }
          ctx.restore();

          // レーン
          g.block(60, LANE_Y - 62, c.W - 120, 124, '#101838', { r: 22, lw: 4, gloss: 0.05 });
          ctx.save();
          ctx.beginPath(); g.rr(60, LANE_Y - 62, c.W - 120, 124, 22); ctx.clip();
          // 拍のグリッド
          for (var b = 0; b < 10; b++) {
            var bx = JUDGE_X + (b * (60 / 132) / LEAD) * (c.W - JUDGE_X - 40)
              - ((c.t) / LEAD) * (c.W - JUDGE_X - 40) + LEAD * 0;
          }
          ctx.restore();

          // 判定サークル
          var beatPhase = U.wrap(c.t / (60 / 132), 1);
          ctx.save();
          ctx.translate(JUDGE_X, LANE_Y);
          var jp = 1 + (1 - beatPhase) * 0.12;
          ctx.scale(jp, jp);
          g.circlePath(0, 0, 42).stroke('rgba(255,255,255,0.35)', 5);
          g.circlePath(0, 0, 30).ink('#ffd93d', 4);
          ctx.restore();
          if (flashT < 0.22) {
            ctx.save(); ctx.globalAlpha = 1 - flashT / 0.22;
            g.circlePath(JUDGE_X, LANE_Y, 40 + flashT * 200)
              .stroke('#ffffff', 8 * (1 - flashT / 0.22));
            ctx.restore();
          }

          // ノーツ（右から流れる）
          for (var k = 0; k < notes.length; k++) {
            var n = notes[k];
            if (n.done) continue;
            var prog = (c.t - (n.t - LEAD)) / LEAD;
            if (prog < -0.02) continue;
            var x = U.lerp(c.W - 40, JUDGE_X, U.clamp(prog, 0, 1.25));
            ctx.save();
            ctx.globalAlpha = n.missed ? 0.28 : U.sat(prog * 8);
            if (n.missed) ctx.globalAlpha *= Math.max(0, 1 - (c.t - n.t - 0.2));
            g.orb(x, LANE_Y, 22, n.missed ? '#5a6180' : '#ff5e7d', { shadow: false });
            ctx.restore();
          }

          // ドラマー
          ctx.save();
          ctx.translate(120, 250);
          ctx.scale(drumSq, 2 - drumSq);
          A.blob(g, { x: 0, y: 0, r: 46, color: '#ffd93d', feet: false, mouth: 'o' });
          ctx.restore();
          g.ellipsePath(120, 300, 62, 16).ink('#e8c07a', 4);

          // 進行
          var doneN = notes.filter(function (n) { return n.done; }).length;
          A.gauge(g, c.W / 2 - 190, 88, 380, 22, doneN / notes.length, '#ffd93d');
          g.text('のこりミス ' + Math.max(0, maxMiss - misses + 1), c.W / 2, 66,
            { size: 20, fill: '#fff', lw: 4 });
        }
      };
    }
  });
})(window.GG);
