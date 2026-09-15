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
      var GAP = 128;          // 縦バーの通り穴（体が通れる高さ）

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
       * 盤面は「作ってから、確かめてから配る」。
       *
       * 確かめることは 3 つある。
       *
       *   1. スタート地点が、始まってしばらく完全に空いていること。
       *      始まった瞬間に棒と重なっていたら、何をする遊びかを読む前に
       *      終わっている。それは難易度ではなく事故。
       *
       *   2. ゴールまでの道が、実際にあること。
       *
       *   3. どこへ逃げても詰まないこと。
       *      道が 1 本あるだけでは足りない。棒と棒のあいだに入ってしまい、
       *      まだ当たってもいないのに、もう何をしても当たるしかない —— という
       *      場所が部屋の中にあってはいけない。遊ぶ側から見ると、それは
       *      「避けたのに死んだ」としか見えない。
       *
       * 3 を確かめるには、逆から数える。最後の瞬間から時間をさかのぼって
       * 「ここから生き残れるか」「ここからゴールへ行けるか」を全部の升に
       * 書き込み、そのうえで「行ける升」を前から広げて、行ける升の中に
       * 生き残れない升が 1 つでもあれば、その盤面は捨てる。
       *
       * 行ける升を数えるときの駒は本人と同じ速さ・同じ太さ（甘く）、
       * 生き残れるかを数えるときの駒は本人より遅く・棒は太め（辛く）にする。
       * 甘く見た「行ける場所」の全部が、辛く見ても助かる —— を条件にすれば、
       * 判定の誤差は安全側にだけ倒れる。
       * ---------------------------------------------------------------- */
      /* 時間の刻みは 1/20 秒。1/30 でも答えは同じだが、升の数が倍になり、
       * 盤面を 1 枚検分するのに 3 倍の手間がかかる。ミニゲームが始まる
       * その瞬間に何十枚も検分するので、ここが重いと画面が一瞬固まる。 */
      var SIM_DT = 1 / 20, SIM_SPD = SPD * 0.96, PAD = 8;
      var step = SIM_SPD * SIM_DT;
      var NX = Math.floor(box.w / step) + 1, NY = Math.floor(box.h / step) + 1;
      var STEPS = Math.ceil(c.duration / SIM_DT);
      var N = NX * NY;
      /* 「ゴールへ間に合わなくなった」までは詰みに数えない。
       * 逆方向へ走り続ければ、どんな部屋でも持ち時間は足りなくなる。
       * それは盤面の罪ではなく、その回の遊び方。ここで捨てているのは
       * 「当たっていないのに、もう当たるしかない」場所だけ。 */

      function cellX(i) { return box.x + i * step; }
      function cellY(j) { return box.y + j * step; }

      var goalCell = new Uint8Array(N), goalAny = 0;
      for (var gj = 0; gj < NY; gj++) {
        for (var gi = 0; gi < NX; gi++) {
          if (U.dist(cellX(gi), cellY(gj), goal.x, goal.y) < goal.r - 8) {
            goalCell[gj * NX + gi] = 1; goalAny = 1;
          }
        }
      }

      // 作業用の板。引き直すたびに作り直すと重いので、一度だけ確保して使い回す
      function planes(n) {
        var a = [];
        for (var k = 0; k <= n; k++) a.push(new Uint8Array(N));
        return a;
      }
      var safeV = planes(STEPS), safeR = planes(STEPS);
      var canLive = planes(STEPS), canGoal = planes(STEPS), reach = planes(STEPS);
      var DI = [0, 1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 0, 1, -1, 1, -1, 1, -1];

      /** その時刻に立てる升を out に塗る。pad が大きいほど辛く見る */
      function mark(out, ls, t, pad) {
        out.fill(1);
        var i, j, k;
        for (k = 0; k < ls.length; k++) {
          var l = ls[k];
          if (l.f) {
            if (t < l.t0) continue;
            var fx = fireX(l, t);
            if (fx < box.x - 60 || fx > box.x + box.w + 60) continue;
            var fr = FIRE_R + HITR + pad;
            for (i = 0; i < NX; i++) {
              if (Math.abs(cellX(i) - fx) >= fr) continue;
              for (j = 0; j < NY; j++) {
                if (U.dist(cellX(i), cellY(j), fx, l.y) < fr) out[j * NX + i] = 0;
              }
            }
            continue;
          }
          var p = laserPos(l, t), rad = TH / 2 + HITR + pad;
          if (l.v) {
            for (i = 0; i < NX; i++) {
              if (Math.abs(cellX(i) - p) >= rad) continue;
              for (j = 0; j < NY; j++) {
                if (Math.abs(cellY(j) - l.gapY) < GAP / 2 - HITR - pad) continue;
                out[j * NX + i] = 0;
              }
            }
          } else {
            for (j = 0; j < NY; j++) {
              if (Math.abs(cellY(j) - p) >= rad) continue;
              for (i = 0; i < NX; i++) out[j * NX + i] = 0;
            }
          }
        }
      }

      /* 立ち位置は、盤面を作ってから決める。
       *
       * 「始まった瞬間に棒と重なっていた」を無くすには、置いた場所が
       * 空くまで盤面を引き直す —— より、空いている場所に立たせるほうが早い。
       * 横棒は部屋を端から端まで塞ぐので、立つ場所を動かせるのは上下だけ。
       * 最初のしばらく棒が来ない高さを探して、そのうち真ん中に一番近い
       * ところに立たせる。部屋のどこにも無ければ、その盤面は捨てる。 */
      function placeHero(ls) {
        var mid = area.y + area.h / 2, best = -1, bestD = Infinity;
        for (var y = box.y; y <= box.y + box.h; y += 5) {
          var ok = true;
          for (var f = 0; f <= 42 && ok; f++) {      // 体感 0.7 秒ぶん
            if (hits(ls, hero.x, y, f / 60, 26)) ok = false;
          }
          if (!ok) continue;
          var d = Math.abs(y - mid);
          if (d < bestD) { bestD = d; best = y; }
        }
        if (best < 0) return false;
        hero.y = best;
        return true;
      }

      var sI, sJ, sIdx;

      /** 盤面を検分する。通れば道しるべを返し、だめなら null */
      function vet(ls) {
        if (!goalAny) return null;
        if (!placeHero(ls)) return null;
        sI = U.clamp(Math.round((hero.x - box.x) / step), 0, NX - 1);
        sJ = U.clamp(Math.round((hero.y - box.y) / step), 0, NY - 1);
        sIdx = sJ * NX + sI;
        var s, i, j, m, idx, nIdx;

        for (s = 0; s <= STEPS; s++) {
          mark(safeV[s], ls, s * SIM_DT, PAD);
          mark(safeR[s], ls, s * SIM_DT, 0);
        }

        // 後ろから: ここから生き残れるか / ここからゴールへ行けるか
        for (idx = 0; idx < N; idx++) {
          canLive[STEPS][idx] = safeV[STEPS][idx];
          canGoal[STEPS][idx] = safeV[STEPS][idx] && goalCell[idx] ? 1 : 0;
        }
        for (s = STEPS - 1; s >= 0; s--) {
          var lv = canLive[s], gl = canGoal[s], pv = canLive[s + 1], pg = canGoal[s + 1];
          for (j = 0; j < NY; j++) {
            for (i = 0; i < NX; i++) {
              idx = j * NX + i;
              lv[idx] = 0; gl[idx] = 0;
              if (!safeV[s][idx]) continue;
              if (goalCell[idx]) { lv[idx] = 1; gl[idx] = 1; continue; }
              for (m = 0; m < 9; m++) {
                var ni = i + DI[m], nj = j + DJ[m];
                if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
                nIdx = nj * NX + ni;
                if (pv[nIdx]) lv[idx] = 1;
                if (pg[nIdx]) gl[idx] = 1;
                if (lv[idx] && gl[idx]) break;
              }
            }
          }
        }
        if (!canGoal[0][sIdx]) return null;
        if (!canLive[0][sIdx]) return null;

        // 前から: 行ける升を広げ、そのどれもが詰んでいないことを確かめる
        reach[0].fill(0); reach[0][sIdx] = 1;
        for (s = 0; s < STEPS; s++) {
          var cur = reach[s], nxt = reach[s + 1];
          nxt.fill(0);
          for (j = 0; j < NY; j++) {
            for (i = 0; i < NX; i++) {
              idx = j * NX + i;
              if (!cur[idx]) continue;
              /* 甘く見た升が、辛く見ると危険域に入っている —— そこは
               * 「かすっている」場所。詰みの判定からは外す（外さないと、
               * どんな盤面もこの余白のせいで捨てられてしまう）。 */
              if (safeV[s][idx] && !canLive[s][idx]) return null;
              if (goalCell[idx]) continue;          // ゴールに着いたらそこで終わり
              for (m = 0; m < 9; m++) {
                var ri = i + DI[m], rj = j + DJ[m];
                if (ri < 0 || rj < 0 || ri >= NX || rj >= NY) continue;
                nIdx = rj * NX + ri;
                if (nxt[nIdx] || !safeR[s + 1][nIdx]) continue;
                nxt[nIdx] = 1;
              }
            }
          }
        }

        /* 道しるべ。canGoal をたどれば必ずゴールに着く（着けるから 1 が
         * 立っている）。ゴールへ近づく手を選びながら降りていく。 */
        var path = [], ci = sI, cj = sJ;
        for (s = 0; s < STEPS; s++) {
          if (goalCell[cj * NX + ci]) break;
          var bi = ci, bj = cj, bd = Infinity;
          for (m = 0; m < 9; m++) {
            var ki = ci + DI[m], kj = cj + DJ[m];
            if (ki < 0 || kj < 0 || ki >= NX || kj >= NY) continue;
            if (!canGoal[s + 1][kj * NX + ki]) continue;
            var d = U.dist(cellX(ki), cellY(kj), goal.x, goal.y);
            if (d < bd) { bd = d; bi = ki; bj = kj; }
          }
          if (bd === Infinity) return null;
          ci = bi; cj = bj;
          path.push({ x: cellX(ci), y: cellY(cj), t: (s + 1) * SIM_DT });
        }
        return path;
      }

      /* 障害物は「レーン」に分けて置く。
       *
       * 詰みは、動く棒どうしが近づいて、あいだの隙間が消えるときに起きる。
       * 棒ごとに持ち場を決めて、持ち場の境目には必ず体 1 つぶんの余白を
       * 残しておけば、隙間が消えること自体が起こらない。
       * 「運が悪いと詰む盤面」を後から捨てるのではなく、
       * 詰む盤面が作られない置き方にする。
       *
       * それでも、そこへ間に合うかどうかは別の話なので、
       * 作ったあとに時間つきで確かめるのは今までどおり。 */
      var CLR = 40;              // 持ち場の境目に残す余白（体 + 棒の太さぶん）

      function lanes(lo, hi, n) {
        var out = [], w = (hi - lo) / n;
        for (var i = 0; i < n; i++) out.push({ lo: lo + i * w, hi: lo + (i + 1) * w });
        return c.rng.shuffle(out);
      }

      function build(comp, mul) {
        var ls = [], i;
        var vLanes = lanes(area.x + 150, goal.x - 70, comp.v);
        var hLanes = lanes(area.y + 52, area.y + area.h - 52, comp.h);

        for (i = 0; i < comp.v; i++) {
          var vl = vLanes[i];
          var vAmp = Math.max(18, Math.min(c.rng.range(30, 70), (vl.hi - vl.lo - CLR * 2) / 2));
          ls.push({
            v: true, p: c.rng.range(vl.lo + CLR + vAmp, vl.hi - CLR - vAmp), amp: vAmp,
            spd: c.rng.range(1.3, 2.1) * mul,
            ph: c.rng.range(0, 6.28), th: TH,
            // 門の高さ。部屋の上下に寄せすぎると穴が壁に埋まる
            gapY: c.rng.range(area.y + GAP / 2 + 14, area.y + area.h - GAP / 2 - 14)
          });
        }
        for (i = 0; i < comp.h; i++) {
          var hl = hLanes[i];
          var hAmp = Math.max(18, Math.min(c.rng.range(30, 62), (hl.hi - hl.lo - CLR * 2) / 2));
          ls.push({
            v: false, p: c.rng.range(hl.lo + CLR + hAmp, hl.hi - CLR - hAmp), amp: hAmp,
            spd: c.rng.range(1.2, 2.0) * mul, ph: c.rng.range(0, 6.28), th: TH
          });
        }
        /* 火の玉は奥（右）から飛んでくる。棒と違って向きが違うので、
         * 「横に動く」だけでは避けられない。通り過ぎるものなので、
         * レーンの隙間を潰すことはない。 */
        for (i = 0; i < comp.f; i++) {
          ls.push({
            f: true,
            y: c.rng.range(area.y + 40, area.y + area.h - 40),
            t0: 0.55 + i * 0.9 + c.rng.range(0, 0.6),
            spd: c.rng.range(300, 420) * mul
          });
        }
        return ls;
      }

      /* レベルごとの構成。横棒を 1 本までにしているのは、
       * 部屋の高さが 300 しかなく、2 本だと上下に逃げ場が残らないから。 */
      var COMP = [{ v: 1, h: 1, f: 0 }, { v: 2, h: 1, f: 1 }, { v: 3, h: 1, f: 1 }];
      var comp0 = COMP[c.diff - 1];
      var mul = [1, 1.22, 1.4][c.diff - 1];
      var lasers = null, path = null;
      for (var tryN = 0; tryN < 60 && !path; tryN++) {
        /* 何度も外したら本数を落とす。
         * 詰む盤面や、そもそも間に合わない盤面を配るくらいなら易しくする。
         * 40 回・52 回と段を作ってあるのは、いきなり最小構成に落として
         * 「レベル3なのに棒が 1 本」になるのを避けるため。 */
        var comp = tryN < 40 ? comp0
          : (tryN < 52 ? { v: Math.max(1, comp0.v - 1), h: comp0.h, f: Math.max(0, comp0.f - 1) }
            : { v: 1, h: comp0.h, f: 0 });
        var cand = build(comp, mul);
        var pr = vet(cand);
        if (pr) { lasers = cand; path = pr; }
      }
      if (!path) {                       // 保険。ここに来ることはまずない
        lasers = [{ v: true, p: area.x + 320, amp: 80, spd: 1.8, ph: 0, th: TH,
          gapY: area.y + area.h / 2 }];
        // 検分の途中で動かした立ち位置を、この盤面で取り直す
        if (!placeHero(lasers)) hero.y = area.y + area.h / 2;
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
