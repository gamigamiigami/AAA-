/* たたけ！ — 顔を出したヤツを全部たたく。ばくだんを叩いたら失敗。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'whack',
    verb: 'たたけ！',
    verbEn: 'WHACK!',
    control: 'aim',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#8bd94a', '#7cc93c'],
    style: 'paper',

    create: function (c) {
      var COLS = 3, ROWS = 2;
      var holes = [];
      var ox = c.W / 2 - (COLS - 1) * 152 / 2;
      var oy = 262;
      for (var r = 0; r < ROWS; r++) {
        for (var i = 0; i < COLS; i++) {
          holes.push({
            x: ox + i * 152, y: oy + r * 130,
            up: 0, target: 0, kind: 0, hit: 0, gone: 0, t: 0
          });
        }
      }
      /* 出たら引っ込む。
       *
       * これまでは一度顔を出したらずっと出たままだったので、急ぐ理由が
       * どこにも無かった。画面をひと通り見て、ゆっくり順に叩けば必ず勝てる。
       * 叩く遊びなのに、叩く速さが要らなかった。
       *
       * 決められた時間だけ出て、引っ込む。取りこぼしの許される数は
       * レベルごとに決めてあり、レベル3 は 6 匹のうち 5 匹 —— 1 匹だけ。 */
      var moles = [5, 5, 6][c.diff - 1];
      var bombs = [1, 2, 2][c.diff - 1];
      var need = [3, 4, 5][c.diff - 1];
      var STAY = [1.0, 0.8, 0.6][c.diff - 1];
      var EV = [0.44, 0.38, 0.35][c.diff - 1];

      var kinds = [];
      for (var q = 0; q < moles; q++) kinds.push(1);
      for (q = 0; q < bombs; q++) kinds.push(2);
      kinds = c.rng.shuffle(kinds);

      // 同じ穴から二重に出さない。空いている穴を選び、無ければ少し待つ
      var events = [], freeAt = holes.map(function () { return -9; });
      var hI;
      for (var e = 0; e < kinds.length; e++) {
        var at = 0.35 + e * EV;
        var pool = [];
        for (hI = 0; hI < holes.length; hI++) if (freeAt[hI] <= at) pool.push(hI);
        if (!pool.length) {
          // 空く時間まで後ろにずらす。予定を落とすと叩ける数が足りなくなる
          var soon = Infinity;
          for (hI = 0; hI < holes.length; hI++) soon = Math.min(soon, freeAt[hI]);
          at = soon;
          for (hI = 0; hI < holes.length; hI++) if (freeAt[hI] <= at) pool.push(hI);
        }
        var pick = c.rng.pick(pool);
        freeAt[pick] = at + STAY + 0.12;
        events.push({ hole: pick, kind: kinds[e], at: at });
      }
      var remaining = need;
      var missed = 0, canMiss = moles - need;

      var hammer = { x: c.W / 2, y: c.H / 2, swing: 0 };

      return {
        /* QA 用: いま叩くべき穴。ゲーム進行には影響しない。 */
        probe: function () {
          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            if (h.kind === 1 && !h.hit && !h.gone && h.up > 0.55) return { x: h.x, y: h.y - 34 };
          }
          return null;
        },

        update: function (dt) {
          hammer.x = c.input.x; hammer.y = c.input.y;
          hammer.swing = Math.max(0, hammer.swing - dt * 4.2);

          // 予定表から出し入れする
          for (var e = 0; e < events.length; e++) {
            var ev = events[e];
            var h0 = holes[ev.hole];
            if (!ev.on && c.t >= ev.at && c.t < ev.at + STAY) {
              ev.on = 1; h0.kind = ev.kind; h0.hit = 0; h0.gone = 0; h0.ev = ev;
            } else if (ev.on === 1 && c.t >= ev.at + STAY) {
              ev.on = 2;
              if (h0.ev === ev) {
                if (ev.kind === 1 && !ev.hitDone) {
                  missed++;
                  c.fx.floatText(h0.x, h0.y - 70, 'にがした', { color: GG.PAL.shu, size: 24 });
                }
                h0.gone = 1;              // 引っ込み始める。穴に沈むまでは描く
              }
            }
          }

          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            h.t += dt;
            h.target = (h.kind && !h.hit && !h.gone) ? 1 : 0;
            h.up = U.damp(h.up, h.target, 0.06, dt);
            if (h.hit) h.hit += dt;
            // 沈みきったら穴を空ける
            if (h.kind && (h.gone || h.hit > 0.34) && h.up < 0.03) {
              h.kind = 0; h.hit = 0; h.gone = 0; h.up = 0;
            }
          }
          if (c.result) return;

          // 取りこぼしが許容を超えたら、その場で終わる（時間切れを待たせない）
          if (missed > canMiss) {
            c.sfx('lose'); c.shake(9, 0.25);
            c.lose(); return;
          }

          if (c.input.pHit || c.input.actHit) {
            hammer.swing = 1;
            c.sfx('whoosh');
            var px = c.input.pHit ? c.input.x : hammer.x;
            var py = c.input.pHit ? c.input.y : hammer.y;
            for (var k = 0; k < holes.length; k++) {
              var hh = holes[k];
              if (!hh.kind || hh.hit || hh.gone || hh.up < 0.5) continue;
              if (U.dist(px, py, hh.x, hh.y - 34) < 62) {
                hh.hit = 0.001;
                if (hh.ev) hh.ev.hitDone = 1;      // 叩いた事実は予定表に残す
                                                   // （つぶれる絵が終わると hit は消えるので）
                if (hh.kind === 2) {
                  c.sfx('hit');
                  c.fx.burst(hh.x, hh.y - 30, {
                    n: 26, color: [GG.PAL.shu, GG.PAL.kuchiba, '#2b2233'], speed: 380, size: 10
                  });
                  c.shake(18, 0.4); c.flash(0.35, GG.PAL.shu);
                  c.lose(); return;
                }
                c.sfx('thud'); c.stop(0.06);
                c.shake(7, 0.2);
                c.fx.burst(hh.x, hh.y - 30, {
                  n: 14, color: [GG.PAL.yamabuki, '#ffffff'], speed: 280, size: 7, shape: 'star'
                });
                c.fx.ring(hh.x, hh.y - 30, { r1: 90, color: '#ffffff', lw: 7 });
                remaining--;
                if (remaining <= 0) { c.win(); return; }
                break;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          A.ground(g, 168, A.GROUND.tsuchi);

          for (var i = 0; i < holes.length; i++) {
            var h = holes[i];
            // 穴（盛り土のふちで立体感を出す）
            g.ellipsePath(h.x, h.y + 7, 66, 27).fill('#a37b4e');
            g.ellipsePath(h.x, h.y + 3, 64, 25).fill('#c79a63');
            g.ellipsePath(h.x, h.y, 56, 22).fill('#5d4526');
            g.ellipsePath(h.x, h.y - 3, 56, 20).fill('#42301a');

            if (h.kind && (h.up > 0.01 || h.hit)) {
              ctx.save();
              g.ellipsePath(h.x, h.y - 2, 56, 24); ctx.rect(h.x - 62, h.y - 190, 124, 188); ctx.clip();
              var lift = h.up * 64;
              var y = h.y + 16 - lift;
              if (h.hit) {
                var k = U.sat(h.hit / 0.3);
                y += k * 46;
                ctx.globalAlpha = 1 - k;
              }
              if (h.kind === 1) {
                A.blob(g, {
                  x: h.x, y: y, r: 40, color: '#ffcf9b', feet: false,
                  squash: h.hit ? 0.72 : 1, mouth: h.hit ? 'flat' : 'smile',
                  blink: h.hit > 0
                });
              } else {
                A.bomb(g, h.x, y - 4, 32, c.t);
              }
              ctx.restore();
            }
            // 穴のふち
            ctx.save(); ctx.globalAlpha = 0.6;
            g.ellipsePath(h.x, h.y + 2, 57, 22).stroke('#c79a63', 5);
            ctx.restore();
          }

          A.count(g, c.W / 2, 108, String(Math.max(0, remaining)), 40);
          if (canMiss - missed <= 1) {
            g.text('あと ' + Math.max(0, canMiss - missed) + ' ひきしか にがせない', c.W / 2, 150,
              { size: 22, fill: GG.PAL.shu, stroke: GG.PAL.paper, lw: 6 });
          }

          // ハンマー
          ctx.save();
          ctx.translate(hammer.x, hammer.y);
          ctx.rotate(-0.5 + U.easeOutCubic(1 - hammer.swing) * 0.0 + hammer.swing * 1.5);
          ctx.translate(0, -6);
          g.rr(-8, 0, 16, 78, 8).ink('#c19a66', 2.6);
          g.rr(-40, -34, 80, 46, 12).ink(GG.PAL.shu, 4);
          g.rr(-34, -28, 68, 14, 7).fill('rgba(255,255,255,0.28)');
          ctx.restore();
        }
      };
    }
  });
})(window.GG);
