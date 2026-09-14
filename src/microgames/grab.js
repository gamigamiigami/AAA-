/* つかめ！ — ベルトコンベアで流れてくるおたからを、ワクの中でつかむ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'grab',
    verb: 'つかめ！',
    verbEn: 'GRAB!',
    control: 'press',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#9a6fd8', '#8a5fc8'],
    style: 'retro',

    create: function (c) {
      var BY = 330;
      var zoneX = c.W * 0.62, zoneW = [150, 120, 96][c.diff - 1];
      var spd = [340, 420, 500][c.diff - 1];

      /* 流れてくる物は、着く時刻から逆算して置く。
       *
       * 以前は初期位置を乱数で散らしていたので、制限時間内にワクへ届くのが
       * 2 つのときも 3 つのときもあり、届く順番も毎回違った。
       * 「1 つ目を見送って 2 つ目を待つ」がまともな作戦かどうかが、
       * 遊ぶ人には確かめようがなかった。等間隔に着くと決めておけば、
       * 見送る判断がそのまま作戦になる。 */
      var ARRIVE = [1.05, 1.95, 2.85];
      /* お宝はきっかり 1 つ。どれが当たりかはレベルで変える。
       * レベル3では 1 つ目が必ずガラクタになり、見送る判断が必ず要る。 */
      var gemAt = [c.rng.int(0, 1), c.rng.int(0, 2), c.rng.int(1, 2)][c.diff - 1];
      var items = [];
      for (var i = 0; i < ARRIVE.length; i++) {
        items.push({
          x: zoneX - spd * ARRIVE[i],
          gem: i === gemAt,
          seed: c.rng.int(1, 9999),
          taken: 0, rot: 0
        });
      }

      /* クレーンの一往復。押してから戻るまで入力を受け付けない。
       *
       * 以前は「ワクに何も無いときに押したら即ミス」だった。つまり
       * 1 つ目を見送ろうとして指が早かっただけで、まだ何も掴んでいないのに
       * 負けが決まる。見送るのが正解の場面で、見送ろうとした動作そのものが
       * 罰せられていた。空振りの代償は、時間を失うことで足りる。 */
      var DOWN = 0.15, CLOSE = 0.13, UP = 0.26;
      var claw = { ph: 'idle', t: 0, hold: null, target: null, missT: 9 };
      var TOP = 150, BOT = BY - 52;
      var grabbed = false;

      function clawY() {
        if (claw.ph === 'down') return U.lerp(TOP, BOT, U.easeOutCubic(claw.t / DOWN));
        if (claw.ph === 'close') return BOT;
        if (claw.ph === 'up') return U.lerp(BOT, TOP, U.easeOutCubic(claw.t / UP));
        return TOP;
      }
      function clawOpen() {
        if (claw.ph === 'close') return U.lerp(1, 0.12, U.sat(claw.t / CLOSE));
        if (claw.ph === 'up') return 0.12;
        return 1;
      }
      function inZone() {
        for (var k = 0; k < items.length; k++) {
          var t = items[k];
          if (t.taken) continue;
          if (Math.abs(t.x - zoneX) < zoneW / 2) return t;
        }
        return null;
      }

      return {
        /* QA 用: いまワクにお宝が入っているか。ゲーム進行には一切影響しない。 */
        probe: function () {
          var t = inZone();
          return !!(t && t.gem) && claw.ph === 'idle';
        },

        update: function (dt) {
          claw.missT += dt;
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.taken) { it.taken += dt; continue; }
            if (!grabbed) it.x += spd * dt;
            it.rot += dt * 1.2;
          }

          // クレーンの一往復
          if (claw.ph !== 'idle') {
            claw.t += dt;
            if (claw.ph === 'down' && claw.t >= DOWN) {
              claw.ph = 'close'; claw.t = 0;
              /* つかむのは「押した瞬間にワクにあった物」。
               * 降りきってから改めて中を見ていたので、レベル3では
               * 速すぎて、爪が着く頃にはもう流れていってしまう。
               * 狙ったものと掴んだものが違うゲームは、腕前の話にならない。 */
              var got = claw.target;
              claw.target = null;
              if (got) {
                claw.hold = got; grabbed = true;
                c.sfx(got.gem ? 'coin' : 'thud');
                c.stop(0.05); c.shake(got.gem ? 7 : 11, 0.22);
              } else {
                claw.missT = 0;
                c.sfx('click');
              }
            } else if (claw.ph === 'close' && claw.t >= CLOSE) {
              claw.ph = 'up'; claw.t = 0;
              if (claw.hold) {
                /* 掴んだ瞬間ではなく、持ち上げてから勝ち負けを言う。
                 * 掴む動作を見せないと、押した音と結果の札だけが出て、
                 * 自分の手が何をしたのか画面に残らない。 */
                if (claw.hold.gem) {
                  c.fx.burst(zoneX, BOT, {
                    n: 22, color: [GG.PAL.yamabuki, '#ffffff', GG.PAL.mizu],
                    speed: 320, size: 8, shape: 'star'
                  });
                  c.fx.ring(zoneX, BOT, { r1: 120, color: GG.PAL.yamabuki, lw: 7 });
                  c.win();
                } else {
                  c.fx.burst(zoneX, BOT, {
                    n: 16, color: ['#7a6f96', '#fff'], speed: 260, size: 7
                  });
                  c.lose();
                }
              }
            } else if (claw.ph === 'up' && claw.t >= UP) {
              claw.ph = 'idle'; claw.t = 0;
            }
          }
          if (c.result) return;

          if (c.input.actHit && claw.ph === 'idle') {
            claw.ph = 'down'; claw.t = 0;
            claw.target = inZone();
            // 狙いが定まったらベルトを止める。爪はその物めがけて降りる
            if (claw.target) grabbed = true;
            c.sfx('whoosh');
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, 470, A.GROUND.ishi);

          // ベルトコンベア
          g.block(-20, BY, c.W + 40, 54, '#7f8fa6', { r: 10, lw: 3 });
          ctx.save();
          ctx.beginPath(); ctx.rect(0, BY, c.W, 54); ctx.clip();
          ctx.globalAlpha = 0.22;
          for (var s = 0; s < 26; s++) {
            var sx = U.wrap(s * 46 + (grabbed ? 0 : c.t * spd), c.W + 92) - 46;
            ctx.fillStyle = GG.PAL.paper;
            ctx.fillRect(sx, BY, 18, 54);
          }
          ctx.restore();

          // つかみワク
          var pulse = 1 + 0.04 * Math.sin(c.t * 8);
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.setLineDash([16, 12]);
          ctx.lineDashOffset = -c.t * 40;
          g.rr(zoneX - zoneW / 2 * pulse, BY - 104, zoneW * pulse, 146, 16)
            .stroke(GG.PAL.yamabuki, 5);
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.14;
          g.rr(zoneX - zoneW / 2, BY - 104, zoneW, 146, 16).fill(GG.PAL.yamabuki);
          ctx.restore();

          var cy = clawY();

          // アイテム
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var held = claw.hold === it;
            // ベルトの上に「乗って」いる高さ。BY-12 だと半分めり込んでいた
            var ix = held ? zoneX : it.x, iy = held ? cy + 44 : BY - 30;
            if (!held && (it.x < -80 || it.x > c.W + 80)) continue;
            ctx.save();
            if (it.gem) {
              ctx.save();
              ctx.globalAlpha = ctx.globalAlpha * (0.55 + 0.25 * Math.sin(c.t * 7 + i));
              g.circlePath(ix, iy, 62).fill(g.rgrad(ix, iy, 4, 62,
                [[0, 'rgba(255,240,160,0.85)'], [0.45, 'rgba(255,217,61,0.35)'],
                 [1, 'rgba(255,217,61,0)']]));
              ctx.restore();
              ctx.save();
              ctx.translate(ix, iy); ctx.rotate(Math.sin(it.rot) * 0.16);
              g.polyPath([[0, -32], [28, -6], [16, 30], [-16, 30], [-28, -6]]).ink(GG.PAL.yamabuki, 4);
              g.polyPath([[0, -32], [0, 30], [-28, -6]]).fill('rgba(255,255,255,0.35)');
              ctx.restore();
            } else {
              /* ガラクタは「ガラクタの形」で描く。
               * 以前は灰色の箱に × を書いていたが、宝を運ぶベルトに
               * 「× と書かれた箱」が乗っている理由はどこにも無い。
               * 記号ではなく物を置けば、説明はいらない。 */
              ctx.save();
              ctx.translate(ix, iy); ctx.rotate(Math.sin(it.rot * 0.7) * 0.1);
              var rng = new U.RNG(it.seed), pts = [];
              for (var v = 0; v < 9; v++) {
                var a = v / 9 * U.TAU, rr = 26 * rng.range(0.74, 1.12);
                pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.86 + 4]);
              }
              g.polyPath(pts).ink('#8d8797', 4);
              ctx.save();
              g.polyPath(pts); ctx.clip();
              g.ellipsePath(-9, -12, 13, 8, -0.5).fill('rgba(255,255,255,0.32)');
              g.ellipsePath(6, 9, 16, 11, 0.3).fill('rgba(0,0,0,0.14)');
              ctx.restore();
              ctx.restore();
            }
            ctx.restore();
          }

          // クレーン
          ctx.save();
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(zoneX, 60); ctx.lineTo(zoneX, cy); ctx.stroke();
          g.rr(zoneX - 60, 40, 120, 26, 8).ink('#8a8296', 2.6);
          var open = clawOpen();
          for (var d = -1; d <= 1; d += 2) {
            ctx.save();
            ctx.translate(zoneX, cy);
            ctx.rotate(d * (0.35 + open * 0.5));
            g.rr(-8, 0, 16, 52, 8).ink(GG.PAL.yamabuki, 3.5);
            ctx.restore();
          }
          g.circlePath(zoneX, cy, 15).ink(GG.PAL.kuchiba, 3.5);
          ctx.restore();

          // 空振り。失敗ではなく「間に合わなかった」ことだけを言う
          if (claw.missT < 0.5) {
            ctx.save();
            ctx.globalAlpha = 1 - claw.missT / 0.5;
            g.text('スカッ', zoneX + 58, BOT - 8,
              { size: 24, fill: '#efe7ff', stroke: GG.PAL.ink, lw: 6, align: 'left' });
            ctx.restore();
          }
        }
      };
    }
  });
})(window.GG);
