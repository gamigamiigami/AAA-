/* 一斉 — 大画面の描画層。
 *
 * デモ（1台完結）と本番（サーバー接続）の両方がここを使う。
 * 描画をここ1つに集めておかないと、2つの画面が別々に育って
 * 「同じ製品に見えない」状態になる。状態は持たず、渡されたものを描くだけ。
 *
 * 画面設計の原則:
 *   - 金はロゴだけ。「いま操作する場所」は白。体色に金と白は使わない
 *   - 装飾は必ず見出しより奥。文字の上に何も乗せない
 *   - 床の上に置く物は床と同じ消失点を持つ
 *   - 結果は数字ではなく芝居で見せる。数字は添え物
 */
'use strict';
(function () {

const PAL = Art.PAL, E = Art.ease;
const W = 1280, H = 720;
const STAGE_Y = 430;
const D_Y = 356, D_X0 = 150, D_X1 = W - 330;

/* 舞台上の立ち位置。等間隔に並べた瞬間、絵は「for文が並べた画面」になる。
 * 奥行き3列、大きさに差、間隔に粗密、全員が違う方を向く。
 *
 * ただし粗密には下限がある。手前の1人が奥の1人の真上に来ると、奥の名前も
 * 頭の飾りも消え、2体が1体の奇形に見える。前後で重なるときは、手前の体の
 * 半径の1.28倍は必ず横にずらす —— 体だけでなく、頭の飾りと足元の名前まで
 * よけないと意味がない。重なりは奥行きのためであって、隠すためではない。
 * どの人数でも成り立つことは機械で確認してある。 */
const SEATS = [
  { x: 628, row: 2, look: [ .1, -.7], tilt: -.02 },   // 自分。最前列の中央
  { x: 300, row: 1, look: [ .5, -.5], tilt: -.06 },
  { x: 978, row: 1, look: [-.7, -.2], tilt:  .03 },
  { x: 108, row: 0, look: [ .7, -.3], tilt: -.04 },
  { x: 486, row: 0, look: [-.2, -.6], tilt: -.03 },
  { x: 860, row: 0, look: [-.6, -.4], tilt:  .05 },
  { x: 186, row: 2, look: [ .6, -.4], tilt:  .04 },
  { x:1092, row: 2, look: [-.5, -.5], tilt: -.05 },
  { x: 762, row: 1, look: [-.2, -.6], tilt:  .02 },
  { x:1160, row: 1, look: [-.8, -.2], tilt:  .06 }
]
/* 立ち位置の列。大きさは手で決めない —— 床と同じ地平線から引く。
 * 手打ちの表にすると、床の消失点とキャラの縮み方がずれて、後列が
 * 「遠い」ではなく「小さいスプライト」に見える。実際 125px ずれていた。
 * 最前列は、足元の名前が参加者一覧の帯にぶつからない高さで止める。 */
const HZ = Art.horizon(STAGE_Y);
const rowAt = (y) => ({ y, s: 1.18 * (y - HZ) / (620 - HZ) });
const ROWS = [rowAt(504), rowAt(560), rowAt(620)];

/* 走者のレーン。大きさは手で決めない —— 廊下と同じ地平線から引く。
 * 手打ちにすると、壁は奥へ収束しているのに走者だけ縮まず、
 * 「遠い」ではなく「小さい」に見える。
 * ただし奥行きの幅は取りすぎない。正しい遠近をそのまま当てると最奥が
 * 豆粒になり、誰が誰か分からなくなる。手前の帯にも重ねない。 */
const D_HZ = D_Y - 26;                     // 廊下の消失点と同じ高さ
const laneAt = (y, dx) => ({ y, dx, scale: 1.24 * (y - D_HZ) / (632 - D_HZ) });
const LANES = [
  laneAt(470, -30), laneAt(500, 24), laneAt(532, -14),
  laneAt(566, 30), laneAt(598, -22), laneAt(632, 10)
];

const Stage = { W, H, STAGE_Y, D_Y, D_X0, D_X1, SEATS, ROWS, LANES, BEAT: 500, COUNT_IN: 4 };

/* 参加者に席を割り当てる。人数が席より多いときは巡回させる。 */
Stage.seat = function (players) {
  players.forEach((p, i) => {
    const s = SEATS[i % SEATS.length];
    p.spot = { x: s.x + (i >= SEATS.length ? (i / SEATS.length | 0) * 26 : 0),
               row: s.row, look: s.look, tilt: s.tilt };
    p.row = ROWS[s.row];
  });
  return players.slice().sort((a, b) => a.spot.row - b.spot.row);
};

// ---------------------------------------------------------------- 部品
function heading(c, text, size, color, y, rot) {
  const w = Art.measure(c, text, size, { face: '"Dela Gothic One", sans-serif' }) + size * .9;
  // 文字の下を沈める。2度重ねるのは、明るい背景でも1枚では抜けてしまうため
  c.save(); c.filter = 'blur(18px)'; c.fillStyle = '#0A0320';
  for (const a of [.34, .30]) {
    c.globalAlpha = a;
    Art.roundRect(c, W / 2 - w / 2, y - size * .82, w, size * 1.64, size * .6);
    c.fill();
  }
  c.restore();
  Art.title(c, text, W / 2, y, size, { fill: color, rot: rot || 0 });
}
Stage.heading = heading;

function hud(c, cap, val) {
  const w = Math.max(150, Art.measure(c, cap, 15) + 60);
  Art.slab(c, 20, 20, w, 54, '#2A1B44', { depth: 4, r: 14, shadow: false, lw: 2.5 });
  Art.label(c, cap, 34, 38, 14, 'rgba(255,247,232,.5)', { align: 'left', ow: .34 });
  Art.num(c, val, 34, 60, 20, PAL.cream, { align: 'left', ow: .32 });
}
Stage.hud = hud;

/* 舞台の一座。奥から描いて手前が重なるようにする。 */
Stage.cast = function (c, st, opt) {
  opt = opt || {};
  for (const p of st.order) {
    const sp = p.spot, row = p.row, depth = sp.row / 2;
    const r = (p.you ? 48 : 43) * row.s;
    Art.lightPool(c, sp.x, row.y, r * 2.2, r * .7, '#FFD79B', .1 + depth * .06);
    Art.chara(c, { x: sp.x, y: row.y - r, r, color: p.color, shape: p.shape, seed: p.seed,
      face: p.face, squash: p.squash, bob: p.bob * row.s, lean: p.lean, pose: p.pose,
      crestLag: p.crestLag, blink: p.blink > 0, shadowY: row.y + 2, shadowK: .55,
      armT: st.tSec * 2, rot: sp.tilt, look: opt.forceLook || sp.look });
    Art.label(c, p.name, sp.x, row.y + 26 * row.s, 21 * row.s,
      p.you ? PAL.cream : 'rgba(255,247,232,.55)', { ow: .34 });
    // ▼は頭の飾りの上へ逃がす。冠や角に刺さると、飾りなのか指標なのか読めない
    if (p.you) marker(c, sp.x, row.y + p.bob - r * 2.75 - 24 + Math.sin(st.tSec * 4) * 4);
  }
};

function marker(c, x, y) {
  c.save();
  c.beginPath(); c.moveTo(x, y + 17); c.lineTo(x - 14, y - 7); c.lineTo(x + 14, y - 7);
  c.closePath(); c.fillStyle = PAL.focus; c.fill();
  Art.stroke(c, PAL.ink, 3.5); c.restore();
}

// ---------------------------------------------------------------- 待ち受け
Stage.idle = function (c, st) {
  Art.backdrop(c, W, H, STAGE_Y, st.tSec);
  Art.lights(c, W, st.tSec, 92);
  Art.floor(c, W, H, STAGE_Y); Art.rigPools(c, W, H, STAGE_Y);
  Art.logo(c, W / 2 + 26, 250, 104);
  if (st.code) {
    Art.label(c, 'ルームコード', W / 2, 330, 20, 'rgba(255,247,232,.55)', { ow: .3 });
    Art.num(c, st.code, W / 2, 378, 56, PAL.cream, { ow: .3 });
    Art.label(c, st.players.length + '人 さんか中　/　スペースキーで かいし',
      W / 2, 424, 20, 'rgba(255,247,232,.5)', { ow: .3 });
  } else {
    Art.label(c, 'ボタンを おすと はじまる', W / 2, 340, 25, PAL.cream, { ow: .26 });
  }
  Stage.cast(c, st, { forceLook: [0, -.3] });
};

// ---------------------------------------------------------------- 命令カード
/* ワリオ系の核。実際に「札」を叩きつける。 */
/* 札の下の舞台。札そのものと分けてあるのは、参加者一覧の帯まで含めて
 * 暗転させるため。暗幕が一部のレイヤーにしか掛かっていない画面は、
 * その瞬間に「重ねただけの絵」だと分かる。 */
Stage.cardScene = function (c, st) {
  Art.backdrop(c, W, H, STAGE_Y, st.tSec);
  Art.lights(c, W, st.tSec, 92);
  Art.floor(c, W, H, STAGE_Y); Art.rigPools(c, W, H, STAGE_Y);
  Stage.cast(c, st, { forceLook: [0, -.9] });
};
Stage.cardOver = function (c, st) {
  Art.card(c, W, H, st.cardWord, st.cardHue || '#C4356B', st.cardT, { t: st.tSec });
};
Stage.card = function (c, st) { Stage.cardScene(c, st); Stage.cardOver(c, st); };

// ---------------------------------------------------------------- せーの
Stage.seino = function (c, st) {
  Art.backdrop(c, W, H, STAGE_Y, st.tSec);
  Art.lights(c, W, st.tSec, 92);
  Art.floor(c, W, H, STAGE_Y); Art.rigPools(c, W, H, STAGE_Y);

  const left = st.left, cx = W / 2, cy = 292, R = 118;
  c.beginPath(); c.arc(cx, cy, R, 0, Art.TAU);
  Art.stroke(c, 'rgba(255,255,255,.22)', 14);
  c.beginPath(); c.arc(cx, cy, R, 0, Art.TAU);
  Art.stroke(c, PAL.focus, 5);

  const k = Math.max(0, Math.min(1.7, left / (Stage.COUNT_IN * Stage.BEAT)));
  const near = Math.abs(left) < 90;
  c.save();
  c.shadowColor = PAL.focusGlow; c.shadowBlur = near ? 40 : 20;
  c.beginPath(); c.arc(cx, cy, Math.max(9, R * k), 0, Art.TAU);
  Art.stroke(c, near ? PAL.focus : PAL.focusGlow, near ? 17 : 10);
  c.restore();

  if (left > 0) {
    const n = Math.ceil(left / Stage.BEAT);
    const pop = 1 - ((left % Stage.BEAT) / Stage.BEAT);
    Art.title(c, String(n), cx, cy, 100 * (1 + E.outBack(Math.min(1, pop * 3)) * .1),
      { fill: PAL.cream, extrude: 8 });
  } else {
    Art.title(c, 'いま！', cx, cy, 74,
      { fill: PAL.focus, rot: Math.sin(st.tSec * 26) * .05, extrude: 8 });
  }

  heading(c, 'せーの！', 74, '#7FE9FF', 92, -.02);
  Art.label(c, 'ぜんいん そろえて おす', W / 2, 160, 27, 'rgba(255,247,232,.85)', { ow: .3 });
  Stage.cast(c, st);
  hud(c, 'おした人', st.sent + ' / ' + st.players.length);
};

Stage.seinoReveal = function (c, st) {
  const L = st.last;
  Art.backdrop(c, W, H, STAGE_Y, st.tSec);
  Art.lights(c, W, st.tSec, 92);
  Art.floor(c, W, H, STAGE_Y); Art.rigPools(c, W, H, STAGE_Y);
  const pop = E.outBack(Math.min(1, st.revealT * 2.6));
  c.save(); c.translate(W / 2, 108); c.scale(pop, pop); c.translate(-W / 2, -108);
  heading(c, L.ok ? 'そろった！' : 'ばらけた…', 82,
    L.ok ? '#7CE8A0' : '#FF9AA8', 108, L.ok ? -.02 : .015);
  c.restore();

  /* 色は「ばらつきの値そのもの」に従わせる。
   * 成功判定（ok）には「全員が押したか」も含まれるので、それで色を決めると
   * 13ms が赤、34ms が緑、という数字と色が矛盾した画面になる。 */
  const sp = L.spread;
  const has = sp !== null && sp !== undefined;
  const tight = has && sp <= 80;
/* ラベルと値を中央で突き合わせると間に穴が空き、別々の断片に読める。
   * 値を中心に置き、ラベルはその肩に小さく添える。 */
  const vw = Art.numWidth(c, (has ? sp : '\u2014') + 'ms', 46);
  Art.label(c, 'ばらつき', W / 2 - vw / 2 - 10, 190, 20, 'rgba(255,247,232,.6)',
    { ow: .3, align: 'right' });
  Art.num(c, (has ? sp : '\u2014') + 'ms', W / 2 + 30, 198, 46,
    tight ? '#39C96A' : PAL.danger, { align: 'center', ow: .34 });
  // 失敗の理由を分けて言う。「揃わなかった」と「押さない人がいた」は別の話。
  const miss = L.entries.filter(e => e.error === null || e.error === undefined).length;
  Art.label(c, L.ok ? 'ぜんいん +1てん'
      : miss ? miss + '人が おさなかった'
      : '80ms 以内で そろう',
    W / 2, 250, 25, 'rgba(255,247,232,.72)', { ow: .3 });

  Stage.cast(c, st, { forceLook: [0, -.15] });
  strip(c, st, L.entries, 190, 356, W - 380);
};

/* ズレの帯。分析グラフではなく「どこに集まったか」を見せる補助。
 *
 * 目盛りは固定する。毎回いちばん外れた人に合わせて伸縮させると、同じ 300ms が
 * ラウンドごとに違う長さに見え、比べるための物差しが比べられなくなる。
 * 外に出た人は端に張り付かせ、振り切れたことを矢印で見せる。
 *
 * 重なった人は縦に積む。6人いて3人しか見えない帯は、この画面の存在意義を失う。 */
const STRIP_RANGE = 400;      // 端は ±0.4秒。ここを超えたら「振り切れ」
const STRIP_OK = 80;          // 成功の幅
const STRIP_H = 162;          // 帯の高さは固定。人数で伸びると舞台を食う

function strip(c, st, entries, x, y, w) {
  const hits = entries.filter(e => e.error !== null && e.error !== undefined);
  if (!hits.length) return;
  const half = w / 2 - 30;
  const px = ms => x + w / 2 + Art.clamp(ms / STRIP_RANGE, -1, 1) * half;
  const sorted = hits.slice().sort((a2, b2) => a2.error - b2.error);

  /* 重なった人は軸の上下へ交互に逃がす。上へ積むだけだと塔になり、
   * 「上にいるほど何かが上」という無い意味を読ませてしまう。
   * 段が増えたら帯を伸ばすのではなく、丸を小さくする。帯が伸びると舞台を隠す。 */
  /* 重なった人の逃がし方。縮めるより先に、横へずらして段を使う。
   * 丸を小さくして解決すると、いちばん見せたい「そろった5人」が
   * 7pxの団子になって誰だか分からなくなる。読めない図に意味はない。 */
  const budget = 56, R = 15, rowH = R * 1.9;
  const NUDGE = [0, .85, -.85, 1.7, -1.7];
  const LEVEL = [0, -1, 1, -2, 2];
  const placed = [];
  for (const e of sorted) {
    const ex = px(e.error);
    let best = null;
    outer:
    for (const lv of LEVEL) for (const nu of NUDGE) {
      const cx2 = ex + nu * R;
      if (!placed.some(q => q.lv === lv && Math.abs(q.x - cx2) < R * 1.95)) {
        best = { lv, x: cx2 }; break outer;
      }
    }
    if (!best) best = { lv: 0, x: ex };
    placed.push({ e, x: best.x, lv: best.lv, over: Math.abs(e.error) > STRIP_RANGE });
  }

  const top = y - STRIP_H / 2;
  Art.slab(c, x - 22, top, w + 44, STRIP_H, '#3A2358', { depth: 6, r: 24 });

  /* 合格の幅。以前はベタの緑＋蛍光緑の縁で、紫と金でできたこの世界の
   * どこにも無い色だった。表計算のセルに見える。
   * 「合格」は色ではなく光で示す —— 舞台の光だまりと同じ暖色を当てる。
   * ここだけ明るいので、視線は自然に「そろうべき場所」へ行く。 */
  const okw = px(STRIP_OK) - px(-STRIP_OK);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const og = c.createLinearGradient(0, y - budget, 0, y + budget);
  og.addColorStop(0, 'rgba(255,206,120,.06)');
  og.addColorStop(.5, 'rgba(255,214,150,.30)');
  og.addColorStop(1, 'rgba(255,206,120,.06)');
  c.fillStyle = og;
  Art.roundRect(c, px(-STRIP_OK), y - budget, okw, budget * 2, 12); c.fill();
  c.restore();
  Art.roundRect(c, px(-STRIP_OK), y - budget, okw, budget * 2, 12);
  Art.stroke(c, 'rgba(255,197,49,.55)', 2);

  /* 目盛り。範囲を固定しただけでは物差しにならない。刻みが無いと
   * 「この位置が何msか」を画面から読む手段がない。 */
  const ly = top + STRIP_H - 16;
  for (const ms of [-400, -200, 0, 200, 400]) {
    const tx = px(ms), zero = ms === 0;
    // 0の線を画面でいちばん明るくしない。情報量ゼロの線に視線を集めない
    c.beginPath(); c.moveTo(tx, y - budget - (zero ? 4 : 0));
    c.lineTo(tx, y + budget + (zero ? 4 : 0));
    Art.stroke(c, zero ? 'rgba(255,197,49,.75)' : 'rgba(255,247,232,.18)', zero ? 2.5 : 2);
    // 単位は ms に統一する。同じ画面に ms と 秒 が混ざると、自分の値が
    // 帯のどこに当たるかを客に暗算させることになる。
    Art.label(c, zero ? 'ぴったり' : (ms > 0 ? '+' : '') + ms + 'ms',
      tx, ly, zero ? 16 : 14,
      zero ? PAL.focus : 'rgba(255,247,232,.45)', { ow: .34 });
  }
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y);
  Art.stroke(c, 'rgba(255,255,255,.18)', 3);
  Art.label(c, 'はやい', x + 26, y - budget - 13, 14, 'rgba(255,247,232,.38)',
    { ow: .34, align: 'left' });
  Art.label(c, 'おそい', x + w - 26, y - budget - 13, 14, 'rgba(255,247,232,.38)',
    { ow: .34, align: 'right' });

  for (const q of placed) {
    const e = q.e, cy = y - q.lv * rowH;
    if (q.over) {
      /* 振り切れた人。三角だけでは「どれだけ外したか」が消えるので、
       * 実際の値を横に直接書く。図と数字が食い違う画面は自動生成に見える。 */
      /* 振り切れた人。矢印も値も帯の内側に置く。外に出すと、
       * 主役が絵の外へ追い出されたように見える。 */
      const sd = e.error > 0 ? 1 : -1;
      c.beginPath();
      c.moveTo(q.x + sd * (R + 13), cy); c.lineTo(q.x + sd * (R + 2), cy - 7);
      c.lineTo(q.x + sd * (R + 2), cy + 7); c.closePath();
      c.fillStyle = PAL.danger; c.fill(); Art.stroke(c, PAL.ink, 3);
      Art.num(c, (e.error > 0 ? '+' : '') + e.error + 'ms',
        q.x - sd * (R + 6), cy - R - 4, 16, PAL.danger,
        { align: sd > 0 ? 'right' : 'left', ow: .38 });
    }
    Art.chara(c, { x: q.x, y: cy, r: R, color: e.color, shape: e.shape,
      seed: e.seed, face: Math.abs(e.error) <= STRIP_OK ? 'joy' : 'flat',
      feet: false, arms: false, sticker: e.you ? PAL.focus : '#6A5093' });
  }
}

// ---------------------------------------------------------------- だるまさん
/* 逆光の乗せ方。奥（出口＝消失点）の側の縁だけを光らせ、
 * 手前側は空気の色で沈める。体そのものは描き直さない。 */
function backlight(c, x, y, r, p, danger) {
  const vx = Art.corridorVP === undefined ? W * .84 : Art.corridorVP;
  const dx = vx - x, dy = (Art.corridorHZ === undefined ? D_Y - 26 : Art.corridorHZ) - y;
  const d = Math.hypot(dx, dy) || 1;
  c.save();
  Art.bodyPath(c, (Art.CAST[p.shape] || Art.CAST.circle).body, x, y, r * .98, r * .98);
  c.clip();
  // 奥の側の縁光
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x + dx / d * r * 1.0, y + dy / d * r * 1.0, 0,
                                   x + dx / d * r * 1.0, y + dy / d * r * 1.0, r * 1.5);
  g.addColorStop(0, danger ? 'rgba(255,120,110,.55)' : 'rgba(224,196,255,.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  // 手前側は沈める
  c.globalCompositeOperation = 'source-over';
  const s2 = c.createLinearGradient(x + dx / d * r, y + dy / d * r,
                                    x - dx / d * r * 1.2, y - dy / d * r * 1.2);
  s2.addColorStop(0, 'rgba(12,4,26,0)');
  s2.addColorStop(1, danger ? 'rgba(40,2,10,.42)' : 'rgba(12,4,26,.42)');
  c.fillStyle = s2; c.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  c.restore();
}

Stage.daruma = function (c, st) {
  const watching = st.watching, cur = st.chant;
  Art.corridor(c, W, H, D_Y, st.tSec, watching);
  /* 床は廊下と同じ消失点「かつ同じ地平線」から引く。x だけ合わせて y を
   * 既定のまま（壁より74px上）にしていたので、壁は奥へ収束しているのに
   * 床の縞だけがほぼ平行に流れ、画面最大面積がパース違反になっていた。 */
  Art.floor(c, W, H, D_Y, watching ? '#6E3038' : '#5C4A72',
            Art.corridorVP, Art.corridorHZ);
  if (watching) { c.fillStyle = 'rgba(120,10,26,.16)'; c.fillRect(0, 0, W, H); }

  const gx = D_X1 + 96;
  Art.contact(c, gx, D_Y + 214, 30, .4);
  c.beginPath(); c.moveTo(gx, D_Y + 214); c.lineTo(gx, D_Y - 44);
  Art.stroke(c, '#2A1F3E', 8);
  c.beginPath(); c.moveTo(gx, D_Y + 214); c.lineTo(gx, D_Y - 44);
  Art.stroke(c, '#7D6A9E', 4);
  const flag = () => { c.beginPath();
    c.moveTo(gx, D_Y - 44);
    c.quadraticCurveTo(gx + 44, D_Y - 30 + Math.sin(st.tSec * 4) * 7, gx + 86, D_Y - 44);
    c.lineTo(gx + 86, D_Y + 10);
    c.quadraticCurveTo(gx + 44, D_Y + 24 + Math.sin(st.tSec * 4) * 7, gx, D_Y + 10);
    c.closePath(); };
  flag(); c.fillStyle = '#F2E7D2'; c.fill();
  c.save(); flag(); c.clip();
  c.fillStyle = '#2A2036';
  for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 6; ix++)
    if ((ix + iy) % 2 === 0) c.fillRect(gx + ix * 15, D_Y - 46 + iy * 16, 15, 16);
  c.restore();
  flag(); Art.stroke(c, PAL.ink, 4);
  Art.label(c, 'ゴール', gx + 43, D_Y - 68, 18, PAL.cream, { ow: .32 });

  // 鬼は専用の描画。プレイヤーと同じ関数で色だけ黒くすると敵に見えない
  const ox = D_X1 + 168, oy = D_Y + 236, or = 66;
  Art.longShadow(c, ox - 30, oy + 2, or * .8, 240, watching ? .6 : .38);
  Art.contact(c, ox, oy + 4, or * .9, .7);
  Art.oni(c, { x: ox, y: oy - or, r: or, watching,
    bob: watching ? Math.sin(st.tSec * 24) * 3 : -Math.abs(Math.sin(st.tSec * 3)) * 5,
    rot: watching ? 0 : .07 });

  st.players.forEach((p, i) => {
    const L = LANES[i % LANES.length];
    const k = Math.min(1, (p.dist || 0) / (st.goal || 240));
    const x = D_X0 + (D_X1 - D_X0) * k + L.dx;
    const r = (p.you ? 34 : 29) * L.scale;
    const moving = p.moving;
    Art.chara(c, { x, y: L.y - r, r, color: p.color, shape: p.shape, seed: p.seed,
      face: watching && moving ? 'shock' : moving ? 'joy' : 'flat',
      look: [1, 0], blink: p.blink > 0, shadowY: L.y, sticker: 'rgba(20,10,40,.5)',
      walk: moving && !watching ? st.tSec * 13 + p.seed : 0,
      pose: p.pose, crestLag: p.crestLag,
      bob: moving && !watching ? -Math.abs(Math.sin(st.tSec * 13 + p.seed)) * r * .16 : 0 });
    /* 走者も逆光にする。影は奥から手前へ伸ばしているのに、体だけ屋上と同じ
     * 左上前からの照りを保ったままだった。同じ空間に光源が2つある状態。
     * 鬼で正しく描けているのだから、走者にも同じ規則を通す。 */
    backlight(c, x, L.y - r, r, p, watching);
    if (p.you) marker(c, x, L.y - r * 2 - 36 + Math.sin(st.tSec * 4) * 4);
  });

  heading(c, watching ? 'ふりむいた！' : 'だるまさんが……', watching ? 76 : 56,
    watching ? '#FFD24A' : '#E8DCFF', 74,
    watching ? Math.sin(st.tSec * 30) * .035 : -.01);

  if (cur && !watching) {
    Art.slab(c, 30, 664, 640, 30, '#3A2358', { depth: 5, r: 15, shadow: false });
    Art.roundRect(c, 37, 669, Math.max(8, 626 * Math.min(1, cur)), 18, 9);
    c.fillStyle = cur > .82 ? PAL.danger : PAL.focus; c.fill();
  }
};

Stage.darumaReveal = function (c, st) {
  const L = st.last;
  Art.backdrop(c, W, H, STAGE_Y, st.tSec);
  Art.lights(c, W, st.tSec, 92);
  Art.floor(c, W, H, STAGE_Y); Art.rigPools(c, W, H, STAGE_Y);
  const w = L.entries.find(e => e.fin !== null && e.fin !== undefined);
  const pop = E.outBack(Math.min(1, st.revealT * 2.6));
  c.save(); c.translate(W / 2, 104); c.scale(pop, pop); c.translate(-W / 2, -104);
  heading(c, w ? w.name + ' の かち！' : 'ぜんいん とどかず', 64, '#FFD24A', 104, -.015);
  c.restore();
  podium(c, st, L.entries.slice(0, 3), e =>
    e.caught ? 'つかまった' : (e.fin !== null && e.fin !== undefined) ? 'ゴール'
      : e.dist + '/' + L.goal);

  const rest = L.entries.slice(3);
  if (rest.length) {
    const step = Math.min(118, (W - 200) / rest.length);
    const x0 = W / 2 - (rest.length - 1) * step / 2;
    rest.forEach((e, i) => {
      const x = x0 + i * step;
      Art.chara(c, { x, y: 664, r: 22, color: e.color, shape: e.shape, seed: e.seed,
        face: e.caught ? 'sad' : 'flat', shadowY: 690, feet: false, arms: false,
        bob: -Math.abs(Math.sin(st.tSec * 3 + i)) * 3 });
      Art.label(c, e.name, x, 702, 19, 'rgba(255,247,232,.72)', { ow: .34 });
    });
  }
};

/* 表彰台。床と同じ消失点を持つ立体で、キャラは天面に立ち、影も天面に落ちる。 */
function podium(c, st, top, label) {
  const slots = [{ rank: 1, x: W / 2 - 220, h: 74, r: 40 },
                 { rank: 0, x: W / 2,       h: 116, r: 50 },
                 { rank: 2, x: W / 2 + 220, h: 54, r: 36 }];
  const baseY = 600;
  for (const s of slots.sort((a, b) => b.h - a.h)) {
    const e = top[s.rank]; if (!e) continue;
    const topY = baseY - s.h;
    const face = Art.podium(c, s.x, topY, baseY, s.rank === 0 ? 176 : 152,
      s.rank === 0 ? '#C9922E' : '#5B4480', W / 2);
    const standY = topY - face.depth * .45;
    Art.contact(c, s.x + face.skew * .4, standY + 4, s.r * .9, .45);
    Art.chara(c, { x: s.x + face.skew * .4, y: standY - s.r, r: s.r,
      color: e.color, shape: e.shape, seed: e.seed,
      face: s.rank === 0 ? 'joy' : e.caught ? 'sad' : 'flat',
      pose: Art.POSE[s.rank === 0 ? 'cheer' : e.caught ? 'flop' : 'idle'], armT: st.tSec * 2,
      bob: -Math.abs(Math.sin(st.tSec * (s.rank === 0 ? 6 : 3) + s.rank)) * (s.rank === 0 ? 9 : 4) });
    Art.title(c, String(s.rank + 1), s.x, topY + s.h * .5, 40,
      { fill: s.rank === 0 ? PAL.cream : 'rgba(255,247,232,.75)', extrude: 4 });
    Art.label(c, e.name, s.x, baseY + 26, 22, PAL.cream, { ow: .3 });
    Art.label(c, label(e), s.x, baseY + 52, 17, 'rgba(255,247,232,.6)', { ow: .3 });
  }
}

/* 常時表示。8人を超えたら上位5人＋自分だけを出す。
 * 6人時の見た目を先に作ると、30人で必ず壊れる。 */
Stage.roster = function (c, st) {
  /* 並び順は舞台の左→右に合わせる。点数順にすると、覚えたアイコンの位置が
   * 毎ラウンド動いて、目で照合できなくなる。この画面の仕事は順位ではなく
   * 「どれが自分か」なので、位置は動かさない。首位は印で示す。
   *
   * 置き場所は画面の最下端いっぱい。前は右下に浮いた角丸の板で、舞台の
   * 絵を切り、名前や耳が板の縁で欠けていた。空間に属さないUIが空間の中に
   * 浮いていると、絵が「背景＋貼ったUI」に分解して見える。
   * 下端に接した棚にすれば、それは額縁の一部になる。 */
  let show = st.players.slice();
  if (st.players.length > 8) {
    const top = st.players.slice().sort((a, b) => b.score - a.score).slice(0, 5);
    const me = st.players.find(p => p.you);
    if (me && top.indexOf(me) < 0) top.push(me);
    show = top;
  }
  show.sort((a, b) => (a.spot ? a.spot.x : 0) - (b.spot ? b.spot.x : 0));
  const best = Math.max(0, ...st.players.map(p => p.score));

  const BH = 48, by = H - BH;
  c.save();
  const g = c.createLinearGradient(0, by, 0, H);
  g.addColorStop(0, '#241338'); g.addColorStop(1, '#160A26');
  c.fillStyle = g; c.fillRect(0, by, W, BH);
  c.beginPath(); c.moveTo(0, by + 1.5); c.lineTo(W, by + 1.5);
  Art.stroke(c, 'rgba(255,214,150,.30)', 3);

  // 棚の中だけに描く。頭の飾りが縁で切れるのを防ぐ
  c.beginPath(); c.rect(0, by, W, BH); c.clip();
  const cw = Math.min(150, (W - 40) / show.length);
  const x0 = W / 2 - (show.length * cw) / 2;
  show.forEach((p, i) => {
    const x = x0 + cw * i + 22;
    Art.chara(c, { x, y: H - 21, r: 15, color: p.color, shape: p.shape, seed: p.seed,
      face: p.face, blink: p.blink > 0, feet: false, arms: false });
    const nm = Art.measure(c, p.name, 17);
    Art.label(c, p.name, x + 23, H - 26, 17,
      p.you ? PAL.cream : 'rgba(255,247,232,.72)', { ow: .34, align: 'left' });
    Art.num(c, String(p.score), x + 23 + nm + 9, H - 25, 19,
      p.you ? PAL.focus : 'rgba(255,247,232,.5)', { ow: .34, align: 'left' });
    if (best > 0 && p.score === best) {
      c.save(); c.translate(x, H - 40); c.scale(.56, .56);
      c.beginPath();
      c.moveTo(-11, 6); c.lineTo(-11, -6); c.lineTo(-5, -1); c.lineTo(0, -9);
      c.lineTo(5, -1); c.lineTo(11, -6); c.lineTo(11, 6); c.closePath();
      c.fillStyle = PAL.gold; c.fill(); Art.stroke(c, PAL.ink, 3);
      c.restore();
    }
  });
  c.restore();
};

/* 参加者1人ぶんのモーション更新。デモも本番も同じ動きにする。
 * ポーズは切り替えではなく補間する。パッと差し替わると人形の付け替えに見える。 */
Stage.stepPlayer = function (p, dt, tSec, opt) {
  opt = opt || {};
  if (!p.sq) {
    p.sq = new Art.Spring(1, 330, 15).to(1);
    p.crestLag = 0; p.bob = 0; p.lean = 0;
    p.blink = 0; p.nextBlink = 1 + Math.random() * 3;
    p.poseName = 'idle';
    p.pose = Object.assign({}, Art.POSE.idle);
    p.hop = 0; p.hopV = 0; p.lastPose = 'idle';
  }

  /* ポーズが変わった瞬間だけ、跳躍の初速を与える。
   * 歓喜は跳ぶ、驚きは軽く浮く、落胆は跳ばない。 */
  if (p.poseName !== p.lastPose) {
    if (p.poseName === 'cheer') p.hopV = -430;
    else if (p.poseName === 'shock') p.hopV = -190;
    p.lastPose = p.poseName;
  }
  // 重力で落として、着地で1回だけ小さく弾ませる。等速で戻すと風船に見える。
  if (p.hopV !== 0 || p.hop < 0) {
    p.hopV += 2600 * dt;
    p.hop += p.hopV * dt;
    if (p.hop >= 0) {
      p.hop = 0;
      p.hopV = p.hopV > 260 ? -p.hopV * .26 : 0;
      if (p.hopV !== 0) { p.sq.x = 1.16; p.sq.v = -2.2; }
    }
  }
  const prevSq = p.squash === undefined ? 1 : p.squash;
  p.squash = Math.max(.4, Math.min(1.6, p.sq.step(dt)));
  p.crestLag += ((prevSq - p.squash) * 26 - p.crestLag) * Math.min(1, dt * 12);

  const tgt = Art.POSE[p.poseName] || Art.POSE.idle;
  // 歓喜と驚きは速く、落胆はゆっくり。感情ごとに追従の速さを変える。
  const rate = p.poseName === 'cheer' || p.poseName === 'shock' ? 15
             : p.poseName === 'flop' ? 6 : 10;
  p.pose = Art.poseLerp(p.pose, tgt, Math.min(1, dt * rate));

  /* 待機は拍ではなく呼吸で上下させる。拍で跳ねるのはプレイ中だけ。
   * 常に拍で動いていると、静かな場面が作れず全部が同じテンションになる。 */
  if (opt.beat) p.bob = -Math.abs(Math.sin(tSec * Math.PI * 1000 / Stage.BEAT + p.seed)) * 7;
  else p.bob = Math.sin(tSec * 1.6 + p.seed) * 2.6;
  p.bob += p.hop;

  p.nextBlink -= dt;
  if (p.nextBlink <= 0) { p.blink = .12; p.nextBlink = 2.2 + Math.random() * 3.4; }
  p.blink = Math.max(0, p.blink - dt);
};

window.Stage = Stage;
})();
