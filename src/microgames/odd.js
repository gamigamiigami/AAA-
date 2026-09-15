/* さがせ！ — ならんだ中から1つだけちがうヤツを見つけて選ぶ。 */
(function (GG) {
  'use strict';
  var U = GG.U, A = GG.A;

  GG.reg({
    id: 'odd',
    verb: 'さがせ！',
    verbEn: 'FIND IT!',
    control: 'pick',
    beats: 8,
    defaultResult: 'lose',
    bg: ['#ffd400', '#f0c600'],
    style: 'sketch',

    create: function (c) {
      /* 人数で難しくするのはやめた。
       *
       * 8 人が 12 人になっても、やることは「1 人ずつ見比べる」のままで、
       * ただ時間が足りなくなるだけ。増えたぶん 1 人あたりの絵も小さくなり、
       * 見えにくさで難しくしているのと変わらなくなる。
       *
       * レベル3 は逆に 6 人まで減らして、代わりに並ばせない。
       * ゆっくり漂っているので、さっき見た顔がどれだったか分からなくなる。
       * 見比べる相手を自分で覚えておく、という難しさに変える。 */
      var grid = [[3, 2], [4, 2], [3, 2]][c.diff - 1];
      var COLS = grid[0], ROWS = grid[1];
      var free = c.diff === 3;                     // 並べずに漂わせる
      var cw = free ? 236 : 152, ch = free ? 168 : 122;
      var ox = c.W / 2 - (COLS - 1) * cw / 2;
      var oy = free ? 212 : 232;
      var DRIFT = free ? 34 : 0;                   // 漂う幅
      var oddIdx = c.rng.int(0, COLS * ROWS - 1);

      /* ちがうのは、ぜんぶで 1 つ。ちがい方も 1 種類だけ。
       *
       * 以前は「1 つだけ色を薄くする」だったが、色の濃淡は並べた瞬間に
       * 見つかってしまう。探している気にならない。顔のつくりに変えた。
       * 口、目、ほっぺ、おでこの印 —— どれも「同じ顔が並んでいる」中で
       * 1 箇所だけ違う、という見え方になる。
       *
       * 差はレベルで薄めない。見えない差を探させるのは難しさではなく、
       * 当てずっぽうにすること。難しさは、数と、動きで作る。 */
      var mode = c.rng.pick(['mouth', 'eyes', 'cheek', 'mark']);

      /* 体の色は、ちがい方を決めてから選ぶ。
       *
       * ほっぺは薄い赤なので、体が赤いと塗ってあるのか無いのか分からない。
       * 「見えない差を探させない」と決めている以上、これは難しさではなく
       * ただ見えていないだけ。ほっぺで差をつける回は、赤い体を使わない。 */
      var COLS_ALL = [GG.PAL.shu, GG.PAL.ai, GG.PAL.murasaki, GG.PAL.wakaba];
      var baseCol = c.rng.pick(mode === 'cheek'
        ? [GG.PAL.ai, GG.PAL.murasaki, GG.PAL.wakaba]
        : COLS_ALL);

      /* 目のちがいは「閉じている」だけではない。
       * 閉じ目しか使わないと、遊ぶ側は数回で「寝てるヤツを探すゲーム」と
       * 覚えてしまい、顔を見比べる必要がなくなる。形をいくつも用意すれば、
       * 毎回どこが違うのかを見つけ直すことになる。 */
      var oddEye = c.rng.pick(['closed', 'happy', 'wink', 'sleepy', 'big', 'angry']);

      /* 印のちがいは「印の有無」ではなく「印の形」。
       * 1 人だけ印が付いている状態は、他の 7 人を見る必要がない。
       * 全員に付けて 1 人だけ形を変えれば、ひとつずつ見比べることになる。 */
      var MARKS = ['star', 'heart', 'moon', 'clover', 'drop'];
      var mk = c.rng.shuffle(MARKS.slice());
      var baseMark = mk[0], oddMark = mk[1];
      /* 印の色は山吹で固定。体の色は 4 色から選ばれるので、
       * 印まで色を振ると、印が体に溶ける回と浮く回ができてしまう。
       * 探すのは形であって、色ではない。 */
      var markCol = GG.PAL.yamabuki;

      function drawMark(g, kind, x, y, r, col, t) {
        var ctx = g.c;
        if (kind === 'star') { A.star(g, x, y, r, col, t * 1.2); return; }
        ctx.save();
        ctx.translate(x, y);
        if (kind === 'heart') {
          ctx.beginPath();
          ctx.moveTo(0, r * 0.95);
          ctx.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.5, -r * 1.15, 0, -r * 0.35);
          ctx.bezierCurveTo(r * 0.5, -r * 1.15, r * 1.4, -r * 0.2, 0, r * 0.95);
          ctx.closePath();
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 2.6; ctx.stroke();
        } else if (kind === 'moon') {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, U.TAU);
          ctx.arc(r * 0.55, -r * 0.2, r * 0.92, 0, U.TAU, true);
          ctx.fillStyle = col; ctx.fill('evenodd');
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 2.6; ctx.stroke();
        } else if (kind === 'clover') {
          for (var q = 0; q < 3; q++) {
            var an = -Math.PI / 2 + q * U.TAU / 3;
            g.circlePath(Math.cos(an) * r * 0.5, Math.sin(an) * r * 0.5, r * 0.52)
              .ink(col, 2.6);
          }
        } else {                       // drop（しずく）
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.1);
          ctx.quadraticCurveTo(r, r * 0.15, 0, r);
          ctx.quadraticCurveTo(-r, r * 0.15, 0, -r * 1.1);
          ctx.closePath();
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = GG.PAL.ink; ctx.lineWidth = 2.6; ctx.stroke();
        }
        ctx.restore();
      }
      /* レベル3は全員の目が別々の間で左右に動く。動きは手がかりにならない
       * （見比べれば同じ動きをしている）が、視線が揺れているぶん、
       * 顔の一箇所だけの違いは格段に見つけにくくなる。 */
      var liveEyes = c.diff === 3;

      var cells = [];
      for (var r = 0; r < ROWS; r++) {
        for (var i = 0; i < COLS; i++) {
          var idx = r * COLS + i;
          cells.push({
            hx: ox + i * cw, hy: oy + r * ch,
            x: ox + i * cw, y: oy + r * ch,
            odd: idx === oddIdx,
            ph: c.rng.range(0, 6.28),
            /* 漂う速さも向きも 1 人ずつ違う。そろっていると、
             * 並びが崩れても「さっきの隣」が分かってしまう。 */
            sx: c.rng.range(0.32, 0.52), sy: c.rng.range(0.28, 0.46),
            px: c.rng.range(0, 6.28), py: c.rng.range(0, 6.28),
            delay: (i + r) * 0.045,
            pop: 0
          });
        }
      }

      return {
        /* QA 用: ちがう 1 つの場所。ゲーム進行には影響しない。 */
        probe: function () {
          for (var i = 0; i < cells.length; i++) if (cells[i].odd) return cells[i];
          return null;
        },

        update: function (dt) {
          /* 位置は update で決める。draw の中で揺らすと、絵は動いているのに
           * 当たり判定だけ元の場所に残り、押したのに反応しないことが起きる。 */
          for (var m = 0; m < cells.length; m++) {
            var ce2 = cells[m];
            ce2.x = ce2.hx + Math.sin(c.t * ce2.sx + ce2.px) * DRIFT;
            ce2.y = ce2.hy + Math.cos(c.t * ce2.sy + ce2.py) * DRIFT * 0.62
              + Math.sin(c.t * 2.6 + ce2.ph) * 5;
          }
          for (var i = 0; i < cells.length; i++) cells[i].pop = Math.max(0, cells[i].pop - dt * 3);
          if (c.result) return;
          if (c.input.pHit) {
            for (var k = 0; k < cells.length; k++) {
              var ce = cells[k];
              if (U.dist(c.input.x, c.input.y, ce.x, ce.y) < 52) {
                ce.pop = 1;
                if (ce.odd) {
                  c.sfx('coin'); c.stop(0.05);
                  c.fx.burst(ce.x, ce.y, {
                    n: 22, color: [GG.PAL.yamabuki, '#fff'], speed: 320, size: 8, shape: 'star'
                  });
                  c.fx.ring(ce.x, ce.y, { r1: 140, color: GG.PAL.yamabuki, lw: 8 });
                  c.win();
                } else {
                  c.sfx('hit'); c.shake(12, 0.3);
                  c.lose();                      // 正解は draw 側で指し示す
                }
                return;
              }
            }
          }
        },

        draw: function (g) {
          var ctx = g.c;


          for (var i = 0; i < cells.length; i++) {
            var ce = cells[i];
            var k = U.sat((c.t - ce.delay) / 0.22);
            if (k <= 0) continue;
            var sc = U.easeOutBack(k) * (1 + ce.pop * 0.25);
            var hover = !c.result &&
              U.dist(c.input.x, c.input.y, ce.x, ce.y) < 52 ? 1 : 0;
            ctx.save();
            ctx.translate(ce.x, ce.y);
            ctx.scale(sc * (1 + hover * 0.07), sc * (1 + hover * 0.07));
            if (hover) {
              ctx.save(); ctx.globalAlpha = 0.28;
              g.circlePath(0, 0, 60).fill('#ffffff');
              ctx.restore();
            }
            var odd = ce.odd;
            A.blob(g, {
              x: 0, y: 0, r: 42, color: baseCol, feet: false,
              /* レベル1・2 は全員そろえる（位相を混ぜると差が 2 種類になる）。
               * レベル3 は全員ばらばら —— ただし違う 1 人も同じ規則で動く。 */
              lookX: (liveEyes ? Math.sin(c.t * 2.1 + ce.ph) : Math.sin(c.t * 1.8)) * 0.62,
              mouth: (odd && mode === 'mouth') ? 'sad' : 'smile',
              cheeks: !(odd && mode === 'cheek'),
              eye: (odd && mode === 'eyes') ? oddEye : null
            });
            // おでこの印。mark のときは全員に付けて、1 人だけ形を変える
            if (mode === 'mark') {
              drawMark(g, odd ? oddMark : baseMark, 0, -33, 12, markCol, c.t);
            }
            ctx.restore();
          }

          /* まちがえたら、正解を指す。
           *
           * 「ちがった」とだけ言われても、どこが違ったのか分からないままだと
           * 次に生きない。答えを見せれば、見るべき場所を覚えて帰れる。 */
          if (c.result === 'lose') {
            var ans = null;
            for (var a = 0; a < cells.length; a++) if (cells[a].odd) ans = cells[a];
            if (ans) {
              /* 矢印で指すのはやめた。顔と顔の間が 104px しかない段では、
               * 矢印も文字も隣の顔の上に乗ってしまい、どれを指しているのか
               * かえって分からない。正解のところだけ穴を空けて暗くする。
               * 明るいのが 1 つだけになれば、指し示すものは要らない。 */
              var pu = 0.5 + 0.5 * Math.sin(c.t * 9);
              var hole = 58 + pu * 5;
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, c.W, c.H);
              ctx.arc(ans.x, ans.y, hole, 0, U.TAU, true);
              ctx.fillStyle = 'rgba(24,18,34,0.62)';
              ctx.fill('evenodd');
              g.circlePath(ans.x, ans.y, hole).stroke(GG.PAL.yamabuki, 5);
              g.text('これが ちがう！', c.W / 2, 92,
                { size: 30, fill: GG.PAL.yamabuki, stroke: GG.PAL.ink, lw: 7 });
              ctx.restore();
            }
          }
        }
      };
    }
  });
})(window.GG);
