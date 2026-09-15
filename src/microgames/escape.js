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
      var SPD = 400;
      var HITR = 16;          // 体の半径 20 より小さく取る。めり込んでから死ぬ
      var TH = 18;            // レーザーの太さ
      var GAP = 116;          // 縦バーの通り穴（体が通れる高さ）

      var box = { x: area.x + 20, y: area.y + 20, w: area.w - 40, h: area.h - 40 };

      function laserPos(l, t) {
        return l.p + Math.sin(t * l.spd + l.ph) * l.amp;
      }

      /* 縦のバーには必ず穴を開ける。
       *
       * これが「ぜったいに Exit に行けない」の正体だった。
       * 部屋の天井から床まで通った縦の棒は、動いていようがいまいが壁である。
       * 上からも下からも回り込めないので、棒の向こう側へは原理的に行けない。
       * 棒とドアのあいだに立ってしまえば、残り時間を眺めるだけになる。
       * 難易度でも運でもなく、ゲームの形が間違っていた。
       *
       * 穴を開ければ、縦の棒は壁ではなく門になる。
       * 「横に逃げて、穴の高さに合わせて、抜ける」——避ける動作が生まれる。 */
      var FIRE_X0 = area.x + area.w + 40, FIRE_R = 17;
      function fireX(l, t) { return FIRE_X0 - (t - l.t0) * l.spd; }

      function hits(ls, x, y, t, pad) {
        for (var i = 0; i < ls.length; i++) {
          var l = ls[i];
          if (l.f) {
            if (t < l.t0) continue;
            var fx = fireX(l, t);
            if (fx < area.x - 60) continue;
            if (U.dist(x, y, fx, l.y) < FIRE_R + HITR + pad) return true;
            continue;
          }
          var p = laserPos(l, t), rad = TH / 2 + HITR + pad;
          if (l.v) {
            if (Math.abs(x - p) >= rad) continue;
            if (Math.abs(y - l.gapY) < GAP / 2 - HITR - pad) continue;   // 穴の中
            return true;
          } else if (Math.abs(y - p) < rad) return true;
        }
        return false;
      }

      /* ------------------------------------------------------------------
       * 盤面は「作ってから、解けるか確かめる」。
       *
       * 門にしただけでは、まだ配られた盤面が解ける保証はない。穴の高さが
       * 横バーの真下にあれば、やはり通れない。そこで配る前に、時間つきの
       * 迷路として実際に解いてみる。解けなければ捨てて引き直す。
       * 解くときの駒は本人より遅く（0.92 倍）、棒も本物より太く（+10px）
       * 扱う。ギリギリ一本道だけが残った盤面を「解けた」と言わないため。
       * ---------------------------------------------------------------- */
      var SIM_DT = 1 / 30, SIM_SPD = SPD * 0.92, PAD = 10;
      var step = SIM_SPD * SIM_DT;
      var NX = Math.floor(box.w / step) + 1, NY = Math.floor(box.h / step) + 1;
      var STEPS = Math.ceil(c.duration * 0.88 / SIM_DT);
      var N = NX * NY;

      function cellX(i) { return box.x + i * step; }
      function cellY(j) { return box.y + j * step; }

      var goalCells = [];
      for (var gj = 0; gj < NY; gj++) {
        for (var gi = 0; gi < NX; gi++) {
          if (U.dist(cellX(gi), cellY(gj), goal.x, goal.y) < goal.r - 8) goalCells.push(gj * NX + gi);
        }
      }

      function solve(ls) {
        if (!goalCells.length) return null;
        var cur = new Uint8Array(N), nxt = new Uint8Array(N), safe = new Uint8Array(N);
        var trail = [];
        var i, j, k;

        // その時刻に立てる升を塗る
        function mark(t) {
          safe.fill(1);
          for (k = 0; k < ls.length; k++) {
            var l = ls[k];
            if (l.f) {
              if (t < l.t0) continue;
              var fx = fireX(l, t);
              if (fx < box.x - 60 || fx > box.x + box.w + 60) continue;
              var fr = FIRE_R + HITR + PAD;
              for (i = 0; i < NX; i++) {
                if (Math.abs(cellX(i) - fx) >= fr) continue;
                for (j = 0; j < NY; j++) {
                  if (U.dist(cellX(i), cellY(j), fx, l.y) < fr) safe[j * NX + i] = 0;
                }
              }
              continue;
            }
            var p = laserPos(l, t), rad = TH / 2 + HITR + PAD;
            if (l.v) {
              for (i = 0; i < NX; i++) {
                if (Math.abs(cellX(i) - p) >= rad) continue;
                for (j = 0; j < NY; j++) {
                  if (Math.abs(cellY(j) - l.gapY) < GAP / 2 - HITR - PAD) continue;
                  safe[j * NX + i] = 0;
                }
              }
            } else {
              for (j = 0; j < NY; j++) {
                if (Math.abs(cellY(j) - p) >= rad) continue;
                for (i = 0; i < NX; i++) safe[j * NX + i] = 0;
              }
            }
          }
        }

        var si = U.clamp(Math.round((hero.x - box.x) / step), 0, NX - 1);
        var sj = U.clamp(Math.round((hero.y - box.y) / step), 0, NY - 1);
        var sIdx = sj * NX + si;
        /* 出だしの一瞬は必ず安全にしておく。棒がスタート地点を通過中の盤面は、
         * 解けるかどうか以前に、何が起きたか分からないまま負ける。 */
        for (var w = 0; w <= 12; w++) {
          mark(w * SIM_DT);
          if (!safe[sIdx]) return null;
        }
        cur[sIdx] = 1;
        var z0 = new Int32Array(N); z0.fill(-1);
        trail.push(z0);

        /* 斜めも許す。遊ぶ人はカーソルを好きな向きへ引くので、縦と横を
         * 同時に詰められる。斜めを禁じると、部屋を横断するだけで持ち時間を
         * 使い切ってしまう。 */
        var DI = [0, 1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 0, 1, -1, 1, -1, 1, -1];
        for (var s = 0; s < STEPS; s++) {
          mark((s + 1) * SIM_DT);
          var prev = new Int32Array(N); prev.fill(-1);
          nxt.fill(0);
          var alive = 0;
          for (j = 0; j < NY; j++) {
            for (i = 0; i < NX; i++) {
              if (!cur[j * NX + i]) continue;
              for (var m = 0; m < 9; m++) {            // その場 + 8 方向
                var ni = i + DI[m], nj = j + DJ[m];
                if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
                var nIdx = nj * NX + ni;
                if (nxt[nIdx] || !safe[nIdx]) continue;
                nxt[nIdx] = 1; prev[nIdx] = j * NX + i; alive++;
              }
            }
          }
          trail.push(prev);
          var tmp = cur; cur = nxt; nxt = tmp;
          if (!alive) return null;
          for (k = 0; k < goalCells.length; k++) {
            if (!cur[goalCells[k]]) continue;
            // 道をほどく。QA の自動プレイが辿る道しるべになる
            var path = [], q = trail.length - 1, node = goalCells[k];
            while (q >= 1) {
              path.push({ x: cellX(node % NX), y: cellY((node / NX) | 0), t: q * SIM_DT });
              node = trail[q][node];
              if (node < 0) return null;
              q--;
            }
            path.reverse();
            return path;
          }
        }
        return null;
      }

      function build(n, mul) {
        /* 何を何本置くかを先に決める。
         *
         * 縦の門ばかり 4 枚になると、部屋は「門・門・門・門」の一本道になり、
         * 遊びが「4 回くぐる」だけの作業になる。しかも門は幅を取るので、
         * 横に逃げる余地が消えて、ただ窮屈なだけの部屋になっていた。
         * 縦はレベルごとに本数の上限を決め、残りは別の種類の危険で埋める。
         *
         * 火の玉は奥（右）から飛んでくる。棒と違って向きが違うので、
         * 「横に動く」だけでは避けられない。同じ部屋に別の避け方を持ち込む。 */
        var maxV = [1, 2, 3][c.diff - 1];
        var types = ['v'];                       // 1 本目は必ず縦の門
        if (c.diff >= 2) types.push('f');        // 火の玉も必ず 1 つ
        while (types.length < n) {
          var vN = 0;
          for (var q = 0; q < types.length; q++) if (types[q] === 'v') vN++;
          var pool = ['h', 'f'];
          if (vN < maxV) pool.push('v');
          types.push(c.rng.pick(pool));
        }

        var ls = [];
        for (var i = 0; i < types.length; i++) {
          var kind = types[i];
          if (kind === 'f') {
            ls.push({
              f: true,
              y: c.rng.range(area.y + 40, area.y + area.h - 40),
              t0: c.rng.range(0.55, Math.max(0.8, c.duration * 0.72)),
              spd: c.rng.range(300, 420) * mul
            });
            continue;
          }
          var amp = c.rng.range(50, 100), p;
          if (kind === 'v') {
            // ドアの真上で門を閉じない。棒が行き来する範囲ごと外す
            var lo = area.x + 150, hi = goal.x - 80 - amp;
            if (hi <= lo) continue;
            p = c.rng.range(lo, hi);
          } else {
            p = c.rng.range(area.y + 60, area.y + area.h - 60);
          }
          ls.push({
            v: kind === 'v', p: p, amp: amp,
            spd: c.rng.range(1.6, 2.6) * mul,
            ph: c.rng.range(0, 6.28), th: TH,
            // 門の高さ。部屋の上下に寄せすぎると穴が壁に埋まる
            gapY: c.rng.range(area.y + GAP / 2 + 14, area.y + area.h - GAP / 2 - 14)
          });
        }
        return ls;
      }

      var want = [2, 3, 4][c.diff - 1];
      var mul = [1, 1.22, 1.4][c.diff - 1];
      var lasers = null, path = null;
      for (var tryN = 0; tryN < 60 && !path; tryN++) {
        // 何度も外したら本数を落とす。解けない盤面を配るくらいなら易しくする
        var cand = build(tryN < 40 ? want : Math.max(1, want - 1), mul);
        var pr = solve(cand);
        if (pr) { lasers = cand; path = pr; }
      }
      if (!path) {                       // 保険。ここに来ることはまずない
        lasers = [{ v: true, p: area.x + 320, amp: 80, spd: 1.8, ph: 0, th: TH,
          gapY: area.y + area.h / 2 }];
      }

      return {
        /* QA 用: いま目指すべき通過点。create のときに解いた道をなぞるだけで、
         * ゲーム進行には一切影響しない。 */
        probe: function () {
          if (!path) return null;
          var la = c.t + 0.03, w = { x: goal.x, y: goal.y };
          for (var i = 0; i < path.length; i++) {
            if (path[i].t >= la) { w = path[i]; break; }
          }
          return { x: w.x, y: w.y, hx: hero.x, hy: hero.y };
        },

        update: function (dt) {
          if (c.result) return;
          c.input.steer2D(hero, box, SPD, dt);
          if (hits(lasers, hero.x, hero.y, c.t, 0)) {
            c.sfx('hit'); c.shake(15, 0.35); c.flash(0.3, GG.PAL.shu);
            c.fx.burst(hero.x, hero.y, { n: 22, color: [GG.PAL.shu, '#fff'], speed: 340, size: 8 });
            c.lose(); return;
          }
          if (U.dist(hero.x, hero.y, goal.x, goal.y) < goal.r) {
            c.sfx('levelup');
            c.fx.confetti(goal.x, goal.y, 30);
            c.win();
          }
        },

        draw: function (g) {
          var ctx = g.c, i;
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

          /* 棒が行き来する幅をうっすら敷く。どこまで来るのかが見えていれば、
           * 待つか抜けるかを決められる。見えなければ、当たってから学ぶしかない。 */
          ctx.save();
          ctx.globalAlpha = 0.10;
          for (i = 0; i < lasers.length; i++) {
            var lq = lasers[i];
            if (lq.f) continue;
            if (lq.v) g.rr(lq.p - lq.amp - 6, area.y, lq.amp * 2 + 12, area.h, 8).fill(GG.PAL.ai);
            else g.rr(area.x, lq.p - lq.amp - 6, area.w, lq.amp * 2 + 12, 8).fill(GG.PAL.ai);
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
          for (i = 0; i < lasers.length; i++) {
            var l = lasers[i];
            if (l.f) {
              ctx.save();
              /* 来るとわかる時間を先に渡す。奥から飛んでくる物は、
               * 画面に入った時にはもう目の前にいる。 */
              var lead = c.t - l.t0;
              if (lead < 0) {
                if (lead > -0.75) {
                  ctx.globalAlpha = 0.3 + 0.45 * Math.abs(Math.sin(c.t * 12));
                  A.arrow(g, area.x + area.w - 22, l.y, 'left', 34, GG.PAL.kuchiba);
                }
                ctx.restore(); continue;
              }
              var fx = fireX(l, c.t);
              if (fx < area.x - 70) { ctx.restore(); continue; }
              // 尾
              ctx.globalAlpha = 0.5;
              for (var tI = 1; tI <= 4; tI++) {
                var tx = fx + tI * 17, tr = FIRE_R * (1 - tI * 0.18);
                ctx.globalAlpha = 0.42 - tI * 0.08;
                g.circlePath(tx, l.y + Math.sin(c.t * 22 + tI) * 3, tr)
                  .fill(tI < 3 ? GG.PAL.kuchiba : GG.PAL.shu);
              }
              ctx.globalAlpha = 1;
              g.circlePath(fx, l.y, FIRE_R + 4).fill(GG.PAL.shu);
              g.circlePath(fx, l.y, FIRE_R).ink(GG.PAL.kuchiba, 3);
              g.circlePath(fx - 3, l.y - 3, FIRE_R * 0.46).fill(GG.PAL.yamabuki);
              g.circlePath(fx - 4, l.y - 4, FIRE_R * 0.2).fill('#fffbe0');
              ctx.restore();
              continue;
            }
            var p = laserPos(l, c.t);
            ctx.save();
            if (l.v) {
              // 上下 2 本 + そのあいだの門
              var y1 = l.gapY - GAP / 2, y2 = l.gapY + GAP / 2;
              var segs = [[area.y, y1 - area.y], [y2, area.y + area.h - y2]];
              for (var sI = 0; sI < 2; sI++) {
                var sy = segs[sI][0], sh = segs[sI][1];
                if (sh <= 0) continue;
                ctx.globalAlpha = 0.22;
                g.rr(p - l.th, sy, l.th * 2, sh, 8).fill(GG.PAL.shu);
                ctx.globalAlpha = 1;
                g.rr(p - l.th / 2, sy, l.th, sh, 6).fill(GG.PAL.shu);
                g.rr(p - 2.5, sy, 5, sh, 3).fill(GG.PAL.paper);
              }
              // 門の縁。ここが通れる場所だとひと目で分かるように光らせる
              ctx.globalAlpha = 0.85;
              g.circlePath(p, y1, 12).ink(GG.PAL.yamabuki, 3);
              g.circlePath(p, y2, 12).ink(GG.PAL.yamabuki, 3);
              ctx.globalAlpha = 0.18 + 0.1 * Math.sin(c.t * 7);
              g.rr(p - 9, y1 + 4, 18, GAP - 8, 9).fill(GG.PAL.yamabuki);
            } else {
              ctx.globalAlpha = 0.22;
              g.rr(area.x, p - l.th, area.w, l.th * 2, 8).fill(GG.PAL.shu);
              ctx.globalAlpha = 1;
              g.rr(area.x, p - l.th / 2, area.w, l.th, 6).fill(GG.PAL.shu);
              g.rr(area.x, p - 2.5, area.w, 5, 3).fill(GG.PAL.paper);
              g.circlePath(area.x, p, 11).ink(GG.PAL.shu, 2.4);
              g.circlePath(area.x + area.w, p, 11).ink(GG.PAL.shu, 2.4);
            }
            ctx.restore();
          }

          A.blob(g, {
            x: hero.x, y: hero.y, r: 20, color: GG.PAL.yamabuki, feet: false,
            lookX: U.clamp((goal.x - hero.x) / 200, -1, 1),
            mouth: c.result === 'lose' ? 'sad' : 'o'
          });

        }
      };
    }
  });
})(window.GG);
