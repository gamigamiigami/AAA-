/* かぞえろ！ — 出てきたモノの数を数えて、正しいボタンを選ぶ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'count',
    verb: 'かぞえろ！',
    verbEn: 'COUNT!',
    control: 'pick',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#22b14c', '#1a9e42'],
    style: 'toon',

    create: function (c) {
      var maxN = [5, 6, 7][c.diff - 1];
      var answer = c.rng.int(3, maxN);

      /* 置き場所は升目から取る。以前は乱数で置いて重ならないか確かめていたが、
       * 数が増えると置き場所が見つからず、端に寄った窮屈な並びになっていた。
       * 8 つの升からランダムに選べば、間隔は必ず保たれる。 */
      var slots = [];
      for (var sy = 0; sy < 2; sy++) {
        for (var sx = 0; sx < 4; sx++) slots.push({ x: 178 + sx * 200, y: 190 + sy * 130 });
      }
      slots = c.rng.shuffle(slots);

      /* レベル2から動く。
       *
       * 止まっているモノを数えるのは、指で押さえて数えるのと同じで、
       * 一度見れば終わってしまう。動いていれば、目で追いながら数える必要がある。
       *
       * ただし「重なって見えなくなる」動きにはしない。全員が同じ向きに同じだけ
       * 流れるので、互いの間隔は最初のまま変わらない。数えられなくなるのは
       * 難しさではなく、ただの不親切になる。 */
      var DRIFT = [[0, 0], [58, 24], [76, 32]][c.diff - 1];

      var items = [];
      for (var i = 0; i < answer; i++) {
        items.push({
          hx: slots[i].x, hy: slots[i].y, x: slots[i].x, y: slots[i].y,
          r: 30, ph: c.rng.range(0, 6.28), wob: c.rng.range(0.8, 1.3),
          // 背景が緑なので、緑のモノは置かない（数える前に見つからない）
          delay: i * 0.09, col: c.rng.pick([GG.PAL.yamabuki, GG.PAL.kobai, GG.PAL.mizu, GG.PAL.fuji])
        });
      }

      /* レベル3の茂み。前を横切って、一瞬だけモノを隠す。
       *
       * 隠れっぱなしにはしない。どれも同じ向きに流れ続けるので、
       * どのモノも必ず何度か顔を出す。「見えないまま答えろ」は問題ではなく、
       * ただの当てものになる。 */
      var bushes = [];
      if (c.diff >= 3) {
        for (var bn = 0; bn < 3; bn++) {
          var bh = c.rng.range(150, 210);
          bushes.push({
            x: c.W * (bn / 3) + c.rng.range(0, 120),
            y: c.rng.range(140, 372 - bh),          // ボタンの手前までに収める
            w: 88, h: bh, spd: c.rng.range(190, 250)
          });
        }
      }

      // 選択肢: 2..maxN
      var opts = [];
      for (var v = 2; v <= maxN; v++) opts.push(v);
      var bw = 88, bgap = 15;
      var total = opts.length * bw + (opts.length - 1) * bgap;
      var bx = c.W / 2 - total / 2, by = 386;
      var buttons = opts.map(function (v, j) {
        return { v: v, x: bx + j * (bw + bgap), y: by, w: bw, h: 76, hov: 0, press: 0 };
      });

      return {
        /* QA 用: 正解のボタン。 */
        probe: function () {
          for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].v === answer) {
              return { x: buttons[i].x + buttons[i].w / 2, y: buttons[i].y + buttons[i].h / 2 };
            }
          }
          return null;
        },

        update: function (dt) {
          var dx = Math.sin(c.t * 0.85) * DRIFT[0], dy = Math.sin(c.t * 1.2 + 1.3) * DRIFT[1];
          for (var m = 0; m < items.length; m++) {
            var it = items[m];
            it.x = it.hx + dx + Math.sin(c.t * it.wob + it.ph) * 9;
            it.y = it.hy + dy + Math.cos(c.t * it.wob * 0.8 + it.ph) * 7;
          }
          for (var bi = 0; bi < bushes.length; bi++) {
            var bu = bushes[bi];
            bu.x -= bu.spd * dt;
            if (bu.x < -bu.w) bu.x = c.W + bu.w;
          }
          for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var over = U.pointInRect(c.input.x, c.input.y, b.x, b.y, b.w, b.h);
            b.hov = U.damp(b.hov, over && !c.result ? 1 : 0, 0.06, dt);
            b.press = Math.max(0, b.press - dt * 3);
          }
          if (c.result) return;

          var chosen = null;
          if (c.input.pHit) {
            for (var j = 0; j < buttons.length; j++) {
              if (U.pointInRect(c.input.x, c.input.y, buttons[j].x, buttons[j].y,
                buttons[j].w, buttons[j].h)) { chosen = buttons[j]; break; }
            }
          }
          var d = c.input.dirHit();
          if (d === 'left' || d === 'right') {
            // キーボードでも選べるようにカーソルを動かす
            this.cursor = U.clamp((this.cursor === undefined ? 0 : this.cursor) +
              (d === 'right' ? 1 : -1), 0, buttons.length - 1);
            c.sfx('click');
          }
          for (var n = 1; n <= 7; n++) {
            if (c.input.hit('Digit' + n)) {
              for (var q = 0; q < buttons.length; q++) if (buttons[q].v === n) chosen = buttons[q];
            }
          }
          if (!chosen && c.input.actHit && !c.input.pHit) {
            chosen = buttons[this.cursor === undefined ? 0 : this.cursor];
          }

          if (chosen) {
            chosen.press = 1;
            if (chosen.v === answer) {
              c.sfx('coin');
              c.fx.burst(chosen.x + chosen.w / 2, chosen.y + 20, {
                n: 20, color: [GG.PAL.yamabuki, '#ffffff'], speed: 300, size: 8, shape: 'star'
              });
              c.win();
            } else {
              c.sfx('hit'); c.shake(12, 0.3);
              c.lose();
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;
          ctx.save(); ctx.globalAlpha = 0.13;
          for (var s = 0; s < 10; s++) {
            var sx = U.wrap(s * 110 + c.t * 30, c.W + 220) - 110;
            g.circlePath(sx, 120 + (s % 3) * 90, 46).fill(GG.PAL.paper);
          }
          ctx.restore();

          // 数えるモノ
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var k = U.sat((c.t - it.delay) / 0.3);
            if (k <= 0) continue;
            var sc = U.easeOutBack(k);
            ctx.save();
            ctx.translate(it.x, it.y);
            ctx.scale(sc, sc);
            A.blob(g, {
              x: 0, y: 0, r: it.r, color: it.col, feet: false,
              lookX: Math.sin(c.t * 2 + it.ph) * 0.5, mouth: 'smile'
            });
            ctx.restore();
          }

          /* 手前を横切る板塀。
           * 最初は茂みにしていたが、草の緑・背景の緑・キャラの緑が
           * 重なって、手前なのか奥なのかも分からない絵になった。
           * 隠すものは、隠されるものとはっきり違う色でなければいけない。 */
          for (var bi = 0; bi < bushes.length; bi++) {
            var bu = bushes[bi];
            ctx.save();
            g.dropShadow(bu.x + bu.w / 2, bu.y + bu.h + 6, bu.w * 0.55, 13, 0.3);
            g.rr(bu.x, bu.y, bu.w, bu.h, 10).ink('#8a5a2b', 4);
            ctx.save();
            g.rr(bu.x, bu.y, bu.w, bu.h, 10); ctx.clip();
            for (var pl = 0; pl < 3; pl++) {
              g.rr(bu.x + 8 + pl * 26, bu.y + 8, 18, bu.h - 16, 7).fill('rgba(255,255,255,0.18)');
            }
            g.rr(bu.x - 6, bu.y + bu.h * 0.28, bu.w + 12, 13, 4).fill('rgba(60,36,14,0.45)');
            g.rr(bu.x - 6, bu.y + bu.h * 0.68, bu.w + 12, 13, 4).fill('rgba(60,36,14,0.45)');
            ctx.restore();
            ctx.restore();
          }

          // ボタン
          for (var j = 0; j < buttons.length; j++) {
            var b = buttons[j];
            var sel = (this.cursor === j);
            var lift = b.hov * 6 + (sel ? 5 : 0) - b.press * 8;
            var col = (b.hov > 0.3 || sel) ? GG.PAL.yamabuki : GG.PAL.paper;
            g.block(b.x, b.y - lift, b.w, b.h, col, { r: 12, lw: 3 });
            g.text(String(b.v), b.x + b.w / 2, b.y + b.h / 2 - lift, { size: 40, fill: GG.PAL.ink });
          }
        }
      };
    }
  });
})(window.GG);
