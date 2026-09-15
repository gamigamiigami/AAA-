/* BOSS: リズムで たたけ！ — 8拍のリズム譜を最後まで叩ききる。リズム天国オマージュのボス。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'boss_band',
    /* 「きめろ！」では何をすればいいのか分からない。命令語は 1 秒で読んで
     * その通り手を動かすためのもので、気合いを伝えるためのものではない。 */
    verb: 'リズムで たたけ！',
    verbEn: 'NAIL IT!',
    control: 'press',
    beats: 16,
    boss: true,
    defaultResult: 'lose',
    bg: ['#0b64c8', '#0857b4'],
    style: 'clay',

    create: function (c) {
      var beatSec = 60 / 132;
      // 8分・4分を混ぜた譜面。難易度で密度が変わる。
      /* 譜面は「拍」ではなく「フレーズ」にする。
       * レベル1が 8 分の等間隔だったので、鳴っているのはメトロノームで、
       * 叩いていて気持ちのいい瞬間がどこにも無かった。休符を置いて、
       * 呼びかけと返事の形にする。
       *
       * 連打は「長押しの帯」ではなく、音符の間隔そのもので作る。
       *   たん たん たたたた
       * 4 分が続いたあとに 8 分が 4 つ並べば、それだけで手は連打になる。
       * 別の遊びを差し込む必要はなく、同じ「拍に合わせて叩く」の中で
       * 速さだけが変わる。帯にすると、そこだけ別のゲームになってしまう。
       *
       * レベル3 は 8 分休符で入る。
       *   たんたんたんたん ／ ッたたたたたん
       * 表で 4 つ刻ませたあと、小節のアタマを休符にして半拍ずらす。
       * 拍が変わったのではなく、入り口が変わっただけ —— と気づくまで、
       * 手はずっと半拍早く出る。裏に落ちたうえに連打も来るので、
       * 「速い」ではなく「どこに入るか分からない」難しさになる。 */
      /* 最後の音は 10.5 拍まで。16 拍ぶんあっても、終わりぎわに置いた音は
       * 画面が結果に切り替わるほうが先に来て、叩く機会が無いまま「ぬけた」に
       * なることがある。譜面の都合ではなく、こちらの不手際で負けさせない。 */
      var patterns = [
        // たんたんたんたん ／ たんたん たたたた ／ (休) たん たたたん
        [0, 1, 2, 3,   4, 5, 6, 6.5, 7, 7.5,   9, 10, 10.5],
        // たんたん たたたん ／ たたたん たたたん ／ たん たたたたたん
        [0, 1, 2, 2.5, 3,   4, 4.5, 5, 6, 6.5, 7,   8, 8.5, 9, 9.5, 10, 10.5],
        // たんたんたんたん ／ ッたたたたたん ／ たん たたたん ／ ッたん
        [0, 1, 2, 3,   4.5, 5, 5.5, 6, 6.5,   8, 8.5, 9, 9.5,   10.5]
      ];
      var pat = patterns[c.diff - 1];
      var startT = beatSec * 3.5;
      var notes = pat.map(function (b) {
        return { t: startT + b * beatSec, done: 0, missed: 0 };
      });
      /* 判定幅は 8 分の間隔（0.23 秒）の半分より狭くする。
       * 広いと、連打のうち 1 回の入力がどの音符のものか決められない。 */
      var win0 = [0.14, 0.12, 0.10][c.diff - 1];
      var hits = 0, misses = 0;
      /* あと何回まちがえられるのかを、はっきり決めてはっきり出す。
       * 以前は「あと 1 回」の状態で画面に「のこり 2」と出ていた。
       * 数え方が画面と中身で 1 ずれていると、慎重に行くか攻めるかを
       * 決められない。maxMiss は「許される回数」そのもの。 */
      var maxMiss = [3, 3, 2][c.diff - 1];
      var drumSq = 1, flashT = 9, cheer = 0;

      var LANE_Y = 348, JUDGE_X = 250, LEAD = beatSec * 4;

      return {
        /* QA 用: 次のノーツまでの秒数と判定幅。 */
        probe: function () {
          for (var i = 0; i < notes.length; i++) {
            if (!notes[i].done && !notes[i].missed) return { dt: notes[i].t - c.t, win: win0 };
          }
          return { dt: Infinity, win: win0 };
        },

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
                color: perfect ? [GG.PAL.yamabuki, GG.PAL.paper] : [GG.PAL.mizu, GG.PAL.paper],
                speed: 300, size: 7, shape: 'star'
              });
              if (perfect) c.fx.ring(JUDGE_X, LANE_Y, { r1: 110, color: GG.PAL.yamabuki, lw: 6 });
            } else {
              misses++;
              c.sfx('hit'); c.shake(10, 0.25);
              c.fx.floatText(JUDGE_X, LANE_Y - 80, 'MISS',
                { color: GG.PAL.shu, size: 30, });
              if (misses > maxMiss) { c.lose(); return; }
            }
          }

          for (i = 0; i < notes.length; i++) {
            n = notes[i];
            if (!n.done && !n.missed && c.t > n.t + win0) {
              n.missed = 1; misses++;
              c.sfx('hit'); c.shake(8, 0.2);
              c.fx.floatText(JUDGE_X, LANE_Y - 80, 'ぬけた！',
                { color: GG.PAL.shu, size: 28, });
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
              .fill([GG.PAL.shu, GG.PAL.yamabuki, GG.PAL.asagi, GG.PAL.fuji, GG.PAL.wakaba][l]);
            ctx.restore();
          }
          ctx.restore();

          A.ground(g, 452, A.GROUND.ita);

          // 観客
          ctx.save();
          for (var i = 0; i < 22; i++) {
            var r = new U.RNG(700 + i);
            var x = r.range(20, c.W - 20), y = 470 + r.range(0, 40);
            var bob = Math.sin(c.t * 5 + i) * (4 + cheer * 8);
            ctx.globalAlpha = 0.4;
            g.circlePath(x, y - bob, r.range(16, 24)).fill('#8b95ad');
          }
          ctx.restore();

          // レーン
          g.block(60, LANE_Y - 62, c.W - 120, 124, GG.PAL.paper, { r: 14, lw: 3 });
          ctx.save();
          ctx.beginPath(); g.rr(60, LANE_Y - 62, c.W - 120, 124, 22); ctx.clip();
          ctx.restore();

          // 判定サークル
          var beatPhase = U.wrap(c.t / (60 / 132), 1);
          ctx.save();
          ctx.translate(JUDGE_X, LANE_Y);
          var jp = 1 + (1 - beatPhase) * 0.12;
          ctx.scale(jp, jp);
          g.circlePath(0, 0, 42).stroke(GG.PAL.inkSoft, 3);
          g.circlePath(0, 0, 30).ink(GG.PAL.yamabuki, 4);
          ctx.restore();
          if (flashT < 0.22) {
            ctx.save(); ctx.globalAlpha = 1 - flashT / 0.22;
            g.circlePath(JUDGE_X, LANE_Y, 40 + flashT * 200)
              .stroke(GG.PAL.shu, 7 * (1 - flashT / 0.22));
            ctx.restore();
          }

          // ノーツ（右から流れる）
          function noteX(t) {
            return U.lerp(c.W - 40, JUDGE_X, U.clamp((c.t - (t - LEAD)) / LEAD, -0.2, 1.25));
          }
          for (var k = 0; k < notes.length; k++) {
            var n = notes[k];
            if (n.done) continue;
            var prog = (c.t - (n.t - LEAD)) / LEAD;
            if (prog < -0.02) continue;
            ctx.save();
            ctx.globalAlpha = n.missed ? 0.28 : U.sat(prog * 8);
            if (n.missed) ctx.globalAlpha *= Math.max(0, 1 - (c.t - n.t - 0.2));
            g.orb(noteX(n.t), LANE_Y, 22, n.missed ? '#b3aeb8' : GG.PAL.shu, { shadow: false });
            ctx.restore();
          }

          // ドラマー
          ctx.save();
          ctx.translate(120, 250);
          ctx.scale(drumSq, 2 - drumSq);
          A.blob(g, { x: 0, y: 0, r: 46, color: GG.PAL.yamabuki, feet: false, mouth: 'o' });
          ctx.restore();
          g.ellipsePath(120, 300, 62, 16).ink('#c19a66', 3);

          // 進行
          var doneN = notes.filter(function (n) { return n.done; }).length;
          A.gauge(g, c.W / 2 - 190, 88, 380, 22, doneN / notes.length, GG.PAL.yamabuki);
          // まちがえられる回数。数ではなく玉で出す（数えなくても残量が分かる）
          var left = maxMiss - misses;
          for (var mi = 0; mi < maxMiss; mi++) {
            var mx = c.W / 2 - (maxMiss - 1) * 21 + mi * 42;
            ctx.save();
            if (mi >= left) ctx.globalAlpha = 0.3;
            g.circlePath(mx, 54, 14).ink(mi < left ? GG.PAL.yamabuki : '#8f8a99', 3);
            if (mi >= left) {
              ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(mx - 6, 48); ctx.lineTo(mx + 6, 60);
              ctx.moveTo(mx + 6, 48); ctx.lineTo(mx - 6, 60);
              ctx.stroke();
            }
            ctx.restore();
          }
          g.text('ミス', c.W / 2 - maxMiss * 21 - 16, 55,
            { size: 17, fill: GG.PAL.paper, align: 'right', stroke: GG.PAL.ink, lw: 5 });
        }
      };
    }
  });
})(window.GG);
