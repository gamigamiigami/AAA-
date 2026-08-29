/* 一斉 — 描画の土台（デザインシステム）
 *
 * アートディレクション: 「夜のルーフトップ・パーティ」
 *   冷たい藍色の空、暖色の電球、木の舞台。
 *   寒色の背景に暖色の床を敷くと、その上のキャラクターが前へ出る。
 *   この寒暖の対比が、この作品の画面をひと目で見分けさせる骨格。
 *
 * 線は精密に引く。市販ゲームの線は震えていない。
 * 人の手を感じさせるのは線の乱れではなく、形の決め方と細部の量である。
 *
 * 色の役割は必ず分ける（混ぜると画面の指示が読めなくなる）:
 *   金  = ブランド。ロゴだけに使う
 *   白  = 機能。「いま操作する場所」だけに使う
 *   体色 = 個人。金と白は体色に使わない
 *
 * 立体は必ず4点を持つ: 上からの光 / 下からの照り返し / 硬いハイライト / 接地影。
 * 光源は画面左上に固定。
 */
'use strict';

const Art = {};
const TAU = Math.PI * 2;
Art.TAU = TAU;
Art.VP = .455;   // 床の消失点。画面中央からわずかに左

// ---------------------------------------------------------------- 補間
/* 動きを全部同じカーブにしない。感情ごとに使い分ける。 */
Art.ease = {
  outCubic:  t => 1 - Math.pow(1 - t, 3),
  inCubic:   t => t * t * t,
  outQuint:  t => 1 - Math.pow(1 - t, 5),
  outBack:   (t, s) => { s = s === undefined ? 2.2 : s;
    return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  outElastic: t => t === 0 || t === 1 ? t
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1,
  outBounce: t => { const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375; },
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
};
/* バネ。目標へ向かうが行き過ぎて戻る。イージングと違い、
 * 途中で目標が変わっても破綻しないので、操作への反応に向く。 */
Art.Spring = function (v, stiff, damp) {
  this.v = 0; this.x = v; this.t = v;   // 目標は初期値。未設定で0へ引かれる事故を防ぐ
  this.k = stiff || 210; this.d = damp || 14;
};
Art.Spring.prototype.to = function (t) { this.t = t; return this; };
Art.Spring.prototype.kick = function (amount) { this.v += amount; return this; };
Art.Spring.prototype.step = function (dt) {
  const tgt = this.t;
  // 大きい dt で発散しないよう刻む
  let left = dt;
  while (left > 0) {
    const h = Math.min(1 / 120, left); left -= h;
    this.v += (-this.k * (this.x - tgt) - this.d * this.v) * h;
    this.x += this.v * h;
  }
  return this.x;
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
Art.clamp = clamp;
Art.lerp = (a, b, t) => a + (b - a) * t;
Art.sat = t => clamp(t, 0, 1);

function hash(n) {
  n = (n << 13) ^ n;
  return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}
Art.hash = hash;
Art.tick = function () {};

// ---------------------------------------------------------------- 色
Art.PAL = {
  ink:      '#1A1030',
  sky0:     '#2C1B5A',
  sky1:     '#150B2E',
  wood:     '#C98B4B',
  cream:    '#FFF7E8',
  gold:     '#FFC531',   // ブランド専用
  focus:    '#FFFFFF',   // 機能専用（いま操作する場所）
  focusGlow:'#7FE9FF',
  pink:     '#FF74B4',
  danger:   '#FF3B4E'
};

/* 個人の色。金と白は含めない。6人でも重複しないよう色相を離す。 */
Art.CAST_COLORS = ['#FF4D5E', '#3E8CFF', '#39C96A', '#A96BEE', '#FF8A2B', '#2FC6C0',
                   '#F45BA0', '#7FD13B', '#5B6BFF', '#FF6B6B'];

function rgb(hex) {
  // rgb()/rgba() で渡されても壊れないようにする。
  // 16進前提のまま rgba を渡すと NaN になり、文字が真っ黒に潰れる事故が起きる。
  if (hex[0] !== '#') {
    const m = hex.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
  }
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
Art.shade = function (hex, k) {
  let [r, g, b] = rgb(hex);
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
};
Art.alpha = function (hex, a) { const [r, g, b] = rgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
/* 輪郭は真っ黒にしない。その色を深く沈めた色にすると締まりつつ濁らない。 */
Art.outlineOf = function (hex) {
  const [r, g, b] = rgb(hex);
  return 'rgb(' + (r * .2 + 14 | 0) + ',' + (g * .16 + 8 | 0) + ',' + (b * .28 + 22 | 0) + ')';
};

// ---------------------------------------------------------------- 形
Art.roundRect = function (c, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

/* 完全な円ではなく卵型。重心を下げると生き物になる。 */
Art.eggPath = function (c, x, y, rx, ry, bias) {
  bias = bias === undefined ? .13 : bias;
  const k = .5523;
  c.beginPath();
  c.moveTo(x, y - ry);
  c.bezierCurveTo(x + rx * k * (1 - bias), y - ry, x + rx, y - ry * k * (1 - bias * 1.6), x + rx, y);
  c.bezierCurveTo(x + rx, y + ry * k * (1 + bias), x + rx * k * (1 + bias * .6), y + ry, x, y + ry);
  c.bezierCurveTo(x - rx * k * (1 + bias * .6), y + ry, x - rx, y + ry * k * (1 + bias), x - rx, y);
  c.bezierCurveTo(x - rx, y - ry * k * (1 - bias * 1.6), x - rx * k * (1 - bias), y - ry, x, y - ry);
  c.closePath();
};

Art.stroke = function (c, color, lw) {
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = lw; c.strokeStyle = color; c.stroke();
};

/* 光源はひとつ。画面の左上手前。
 * ハイライトの位置・落ち影の向き・床の光だまり、全部ここから導く。
 * 「なぜここが明るいのか」に答えがある画面は、それだけで作り物に見えなくなる。 */
Art.LIGHT = { x: -.42, y: -.86, sx: .34, sy: .16 };   // sx,sy = 影のずれ方向

/* 吊り物の位置。等間隔に並べた瞬間、それだけで「for文が置いた画面」になる。
 * 役者が立つ中央を密に、端を疎に。器具・ビーム・床の光だまりを全部ここから引く。
 * 光っている物と、照らされている物が無関係な画面は、必ず書き割りに見える。 */
Art.RIG = [
  { x: .105, aim: -.13, warm: true  },
  { x: .305, aim: -.05, warm: false },
  { x: .470, aim:  .02, warm: true  },
  { x: .625, aim:  .07, warm: false },
  { x: .865, aim:  .15, warm: true  }
];
Art.bounceColor = Art.PAL.wood;
/* 影の色は床ごとに変える。固定の暗色にすると、赤い床では影が床に溶けて
 * キャラが宙に貼られたステッカーになる。床を敷くときに必ず更新する。 */
Art.shadowColor = '8,3,22';
Art.vinyl = function (c, path, o) {
  const col = o.color, x = o.x, y = o.y, rx = o.rx, ry = o.ry;
  c.save();
  path();
  // 明暗の軸は光源から引く。ここを決め打ちにすると、ハイライトと胴の陰と
  // 落ち影が別々の太陽を持つことになり、床に置かれて見えなくなる。
  const LL = Art.LIGHT;
  const g = c.createLinearGradient(x + rx * LL.x, y + ry * LL.y,
                                   x - rx * LL.x * .8, y - ry * LL.y * .8);
  g.addColorStop(0, Art.shade(col, .36));
  g.addColorStop(.44, col);
  g.addColorStop(1, Art.shade(col, -.32));
  c.fillStyle = g; c.fill();

  c.save(); path(); c.clip();
  // 床からの照り返し
  const b = c.createLinearGradient(0, y + ry * .1, 0, y + ry);
  b.addColorStop(0, Art.alpha(Art.bounceColor, 0));
  b.addColorStop(1, Art.alpha(Art.bounceColor, o.bounce === undefined ? .5 : o.bounce));
  c.fillStyle = b; c.fillRect(x - rx * 1.3, y, rx * 2.6, ry * 1.3);
  // 上縁のリムライト
  if (o.rim !== false) {
    c.globalAlpha = .5;
    c.beginPath();   // リムは光の側へ寄せる。真ん中に置くと光の向きが消える
    c.ellipse(x + rx * LL.x * .1, y + ry * LL.y * .09, rx * .97, ry * .97, 0, 0, TAU);
    Art.stroke(c, Art.shade(col, .75), Math.max(1.2, rx * .07));
    c.globalAlpha = 1;
  }
  c.restore();

  if (o.outline !== false) {
    path();
    Art.stroke(c, o.outlineColor || Art.outlineOf(col), o.lw === undefined ? rx * .12 : o.lw);
  }
  if (o.spec !== false) {
    const L = Art.LIGHT;
    c.save(); path(); c.clip();
    c.globalAlpha = .82;
    c.beginPath();
    c.ellipse(x + rx * L.x * .9, y + ry * L.y * .54, rx * .3, ry * .17,
      Math.atan2(L.y, L.x) + Math.PI / 2, 0, TAU);
    c.fillStyle = '#fff'; c.fill();
    c.globalAlpha = .32;
    c.beginPath();
    c.ellipse(x + rx * L.x * .44, y + ry * L.y * .74, rx * .13, ry * .06, -.4, 0, TAU); c.fill();
    c.restore();
  }
  c.restore();
};

/* 接地影。光源の反対側へずらす。線は付けない（付けると床の上の黒い物体に見える）。
 * depth は 0=奥 1=手前。奥のものほど影を小さく薄くしないと空間が壊れる。 */
Art.contact = function (c, x, y, rx, strength, depth) {
  const d = depth === undefined ? 1 : depth;
  const k = .62 + d * .38;
  const st = (strength === undefined ? .55 : strength) * (.55 + d * .45);
  const ox = x + rx * Art.LIGHT.sx * .9, oy = y + rx * Art.LIGHT.sy * .3;
  const S = Art.shadowColor;
  c.save();
  const g = c.createRadialGradient(ox, oy, 0, ox, oy, rx * k);
  g.addColorStop(0, 'rgba(' + S + ',' + st + ')');
  g.addColorStop(.5, 'rgba(' + S + ',' + st * .5 + ')');
  g.addColorStop(1, 'rgba(' + S + ',0)');
  c.fillStyle = g;
  // 光と反対の向きへ伸ばす。真円の影は「真上からの光」であって、この舞台の光ではない
  c.beginPath();
  c.ellipse(ox, oy, rx * k * 1.16, rx * k * .3, Art.LIGHT.sy * .5, 0, TAU); c.fill();
  // 接地点の芯。これが無いと、ぼけた影だけでは床に着いて見えない。
  c.globalAlpha = st * .9;
  c.fillStyle = 'rgb(' + S + ')';
  c.beginPath(); c.ellipse(ox, oy, rx * k * .42, rx * k * .13, 0, 0, TAU); c.fill();
  c.restore();
};

/* 床に落ちる光だまり。上のスポットと床を繋ぐ。
 * これが無いと、光が地平線でぷつりと切れて背景と床が別の絵になる。 */
Art.lightPool = function (c, x, y, rx, ry, tint, a) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, Art.alpha(tint || '#FFD79B', a === undefined ? .18 : a));
  g.addColorStop(1, Art.alpha(tint || '#FFD79B', 0));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  c.restore();
};

// ---------------------------------------------------------------- 板
Art.slab = function (c, x, y, w, h, color, opt) {
  opt = opt || {};
  const depth = opt.depth === undefined ? 9 : opt.depth;
  const r = opt.r === undefined ? 14 : opt.r;
  c.save();
  if (opt.shadow !== false) {
    c.save(); c.globalAlpha = .34; c.filter = 'blur(7px)';
    c.fillStyle = '#08031A';
    Art.roundRect(c, x + 2, y + depth + 6, w, h, r); c.fill(); c.restore();
  }
  Art.roundRect(c, x, y + depth, w, h, r);
  c.fillStyle = Art.shade(color, -.44); c.fill();
  Art.roundRect(c, x, y, w, h, r);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, Art.shade(color, .18));
  g.addColorStop(.55, color);
  g.addColorStop(1, Art.shade(color, -.18));
  c.fillStyle = g; c.fill();
  if (opt.outline !== false)
    Art.stroke(c, opt.outlineColor || Art.outlineOf(color), opt.lw === undefined ? 3.5 : opt.lw);
  c.restore();
};

/* 床と同じ消失点を向く立体の台。床の上に置く物は必ずこれを使う。
 * 正面からの角丸長方形を床に載せると、投影法が違うので絶対に馴染まない。 */
Art.podium = function (c, cx, topY, baseY, topW, color, vpx) {
  const persp = .22;
  const botW = topW * (1 + persp);
  const depth = (baseY - topY) * .18 + 14;
  const skew = ((cx - vpx) / vpx) * depth * .5;
  const line = Art.outlineOf(color);

  // 前面
  c.beginPath();
  c.moveTo(cx - topW / 2, topY);
  c.lineTo(cx + topW / 2, topY);
  c.lineTo(cx + botW / 2, baseY);
  c.lineTo(cx - botW / 2, baseY);
  c.closePath();
  const g = c.createLinearGradient(0, topY, 0, baseY);
  g.addColorStop(0, Art.shade(color, .05));
  g.addColorStop(1, Art.shade(color, -.34));
  c.fillStyle = g; c.fill();
  Art.stroke(c, line, 3.5);

  // 天面（奥へ向かう）。ここにキャラの影が落ちる。
  c.beginPath();
  c.moveTo(cx - topW / 2, topY);
  c.lineTo(cx - topW / 2 + skew, topY - depth);
  c.lineTo(cx + topW / 2 + skew, topY - depth);
  c.lineTo(cx + topW / 2, topY);
  c.closePath();
  c.fillStyle = Art.shade(color, .28); c.fill();
  Art.stroke(c, line, 3);

  return { top: topY - depth * .5, skew, depth };
};

// ---------------------------------------------------------------- 文字
Art.title = function (c, text, x, y, size, opt) {
  opt = opt || {};
  const fill = opt.fill || Art.PAL.gold;
  c.save();
  c.translate(x, y);
  if (opt.rot) c.rotate(opt.rot);
  if (opt.scaleY || opt.scaleX) c.scale(opt.scaleX || 1, opt.scaleY || 1);
  c.font = size + 'px ' + (opt.face || '"Dela Gothic One", "Hiragino Maru Gothic ProN", sans-serif');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineCap = 'round';

  c.save(); c.globalAlpha = .5; c.filter = 'blur(6px)';
  c.fillStyle = '#06021A'; c.fillText(text, size * .03, size * .1); c.restore();

  // 押し出し。字面から離れないよう1pxずつ積む。
  const ex = opt.extrude === undefined ? size * .1 : opt.extrude;
  c.fillStyle = Art.shade(fill, -.62);
  for (let d = ex; d > 0; d -= 1) c.fillText(text, 0, d);

  c.strokeStyle = Art.PAL.ink;           c.lineWidth = size * .26; c.strokeText(text, 0, 0);
  c.strokeStyle = Art.shade(fill, -.5);  c.lineWidth = size * .11; c.strokeText(text, 0, 0);

  const g = c.createLinearGradient(0, -size * .58, 0, size * .58);
  g.addColorStop(0, Art.shade(fill, .55));
  g.addColorStop(.46, fill);
  g.addColorStop(.54, Art.shade(fill, -.12));
  g.addColorStop(1, Art.shade(fill, -.3));
  c.fillStyle = g; c.fillText(text, 0, 0);

  c.save();
  c.beginPath(); c.rect(-size * text.length, -size, size * text.length * 2, size * .36);
  c.clip(); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillText(text, 0, 0);
  c.restore();
  c.restore();
};

/* ロゴ。全画面で必ずこれを使う（CSSの影で組んだ別版を作らない）。
 * 「一」を一本の走る線として「斉」に食い込ませ、"同時に" を字面で表す。 */
Art.logo = function (c, x, y, size, opt) {
  opt = opt || {};
  const gold = Art.PAL.gold;
  const w = size * .92, barH = size * .17;
  c.save();
  c.translate(x, y);
  c.rotate(opt.rot === undefined ? -.03 : opt.rot);

  // 影
  c.save(); c.globalAlpha = .5; c.filter = 'blur(' + (size * .06) + 'px)';
  c.fillStyle = '#06021A';
  Art.roundRect(c, -w * .96, size * .04, w * 1.28, barH, barH * .5); c.fill();
  c.font = size + 'px "Dela Gothic One", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('斉', w * .34, size * .06);
  c.restore();

  // 「一」= 走る線。右端は「斉」の下へ潜り込ませる
  const barY = -size * .12;
  const bar = () => Art.roundRect(c, -w * .96, barY, w * 1.3, barH, barH * .5);
  bar(); c.fillStyle = Art.shade(gold, -.6);
  c.save(); c.translate(0, size * .07); bar(); c.fill(); c.restore();
  bar();
  const bg = c.createLinearGradient(0, barY, 0, barY + barH);
  bg.addColorStop(0, Art.shade(gold, .55));
  bg.addColorStop(.5, gold);
  bg.addColorStop(1, Art.shade(gold, -.24));
  c.fillStyle = bg; c.fill();
  Art.stroke(c, Art.PAL.ink, size * .045);

  /* 走ってきた尾。長さはばらばらでも、右端は全部そろえて切る。
   * 「ばらばらに来たものが一斉にそろう」という、この名前の意味そのもの。
   * 板を階段状にずらして置くと、意味が消えて描画の残骸に見える。 */
  const tipX = -w * .96;
  for (const [ky, len] of [[.16, 1.00], [.40, .58], [.63, 1.36], [.86, .38]]) {
    const tY = barY + barH * ky, th = barH * .12;
    const x0 = tipX - w * .36 * len;
    const tg = c.createLinearGradient(x0, 0, tipX, 0);
    tg.addColorStop(0, Art.alpha(gold, 0));
    tg.addColorStop(1, Art.alpha(gold, .6));
    c.fillStyle = tg;
    Art.roundRect(c, x0, tY - th / 2, tipX - x0, th, th * .5); c.fill();
  }

  Art.title(c, '斉', w * .34, 0, size, { fill: gold, extrude: size * .1 });
  c.restore();
};

/* ミニゲーム名。ロゴと同じ立体構造で、色相だけ変える。
 * グローだけ・フチだけ、と系統がばらけると別ゲームの素材に見える。 */
Art.gameTitle = function (c, text, x, y, size, hue, opt) {
  opt = opt || {};
  Art.title(c, text, x, y, size,
    { fill: hue, rot: opt.rot || 0, extrude: size * .095 });
};

/* 命令カード。ワリオ系の核。文字を出すのではなく「札」を叩きつける。
 * 傾き・厚み・落ち影・画面外へのはみ出しが無いと札に見えない。 */
Art.card = function (c, W, H, text, hue, prog, opt) {
  opt = opt || {};
  const t = prog;
  let sc, rot, alpha = 1;
  if (t < .15)      { const k = t / .15; sc = 1.55 - .4 * Art.ease.outCubic(k); rot = -.19 + .05 * k; }
  else if (t < .38) { const k = (t - .15) / .23;
                      sc = Art.lerp(1.18, 1, Art.ease.outBack(k, 3.6));
                      rot = Art.lerp(-.14, -.045, Art.ease.outCubic(k)); }
  else if (t < .8)  { sc = 1 + Math.sin((t - .38) * 30) * .009; rot = -.045; }
  else              { const k = (t - .8) / .2;
                      sc = 1 + Art.ease.inCubic(k) * .55; rot = -.045 + k * .12;
                      alpha = 1 - Art.ease.inCubic(k); }

  const cw = W * 1.06, ch = 236, depth = 17;   // 画面外へはみ出させる
  c.save();
  c.globalAlpha = alpha * .74; c.fillStyle = '#08021C'; c.fillRect(0, 0, W, H);
  c.globalAlpha = alpha;
  c.translate(W / 2, H * .44); c.rotate(rot); c.scale(sc, sc);

  // 集中線は叩きつけの間だけ
  const conc = t < .4 ? 1 : Math.max(0, 1 - (t - .4) * 5);
  if (conc > .02) {
    c.save(); c.globalAlpha = alpha * conc * .28;
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * TAU + (opt.t || 0) * .5;
      const r0 = 260 + hash(i * 7) * 70;
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * .6);
      c.lineTo(Math.cos(a) * 1100, Math.sin(a) * 700);
      Art.stroke(c, Art.PAL.cream, 2 + hash(i * 13) * 5);
    }
    c.restore();
  }

  // 落ち影 → 厚みの側面 → 天面。札は必ず画面の外へはみ出させる。
  c.save(); c.globalAlpha = alpha * .5; c.filter = 'blur(14px)';
  c.fillStyle = '#000';
  Art.roundRect(c, -cw / 2 + 10, -ch / 2 + depth + 16, cw, ch, 18); c.fill();
  c.restore();
  Art.roundRect(c, -cw / 2, -ch / 2 + depth, cw, ch, 18);
  c.fillStyle = Art.shade(hue, -.55); c.fill();
  Art.roundRect(c, -cw / 2, -ch / 2, cw, ch, 18);
  const g = c.createLinearGradient(0, -ch / 2, 0, ch / 2);
  g.addColorStop(0, Art.shade(hue, .3));
  g.addColorStop(.5, hue);
  g.addColorStop(1, Art.shade(hue, -.24));
  c.fillStyle = g; c.fill();
  Art.stroke(c, Art.PAL.ink, 7);
  // 地の斜め縞。ベタ1色だと札が紙に見えず、ただの矩形になる。
  c.save();
  Art.roundRect(c, -cw / 2, -ch / 2, cw, ch, 18); c.clip();
  c.globalAlpha = .1; c.fillStyle = '#fff';
  for (let x = -cw; x < cw; x += 46) {
    c.beginPath();
    c.moveTo(x, -ch); c.lineTo(x + 22, -ch);
    c.lineTo(x + 22 + ch * .5, ch); c.lineTo(x + ch * .5, ch);
    c.closePath(); c.fill();
  }
  c.restore();
  // 内枠。札らしさはここで出る。
  Art.roundRect(c, -cw / 2 + 18, -ch / 2 + 16, cw - 36, ch - 32, 10);
  Art.stroke(c, 'rgba(255,255,255,.55)', 3.5);
  Art.roundRect(c, -cw / 2 + 24, -ch / 2 + 22, cw - 48, ch - 44, 7);
  Art.stroke(c, 'rgba(0,0,0,.2)', 2);

  Art.title(c, text, 0, 4, 118, { fill: Art.PAL.cream, extrude: 11 });
  c.restore();
  return { alpha, sc };
};

Art.label = function (c, text, x, y, size, color, opt) {
  opt = opt || {};
  c.save();
  c.font = (opt.weight || 700) + ' ' + size + 'px ' +
    (opt.face || '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif');
  c.textAlign = opt.align || 'center'; c.textBaseline = opt.baseline || 'middle';
  if (opt.outline !== false) {
    c.lineJoin = 'round';
    c.strokeStyle = opt.outlineColor || Art.PAL.ink;
    c.lineWidth = size * (opt.ow || .32);
    c.strokeText(text, x, y);
  }
  c.fillStyle = color; c.fillText(text, x, y);
  c.restore();
};
/* 数値専用。桁送りを自前で固定する。
 * 等幅フォントに逃げると、読み込みに失敗した瞬間 OS のプログラマ用書体に落ち、
 * 斜線入りのゼロがそのまま客の画面に出る。書体はブランドのまま、
 * 数字の送り幅だけを一番広い字に揃えれば、桁は必ず揃う。 */
Art.num = function (c, text, x, y, size, color, opt) {
  opt = opt || {};
  const str = String(text);
  c.save();
  c.font = '900 ' + size + 'px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const isNum = (ch) => ch >= '0' && ch <= '9';
  let cell = 0;
  for (let d = 0; d < 10; d++) cell = Math.max(cell, c.measureText(String(d)).width);
  const cells = [];
  let total = 0;
  for (const ch of str) {
    const w = isNum(ch) ? cell : c.measureText(ch).width;
    cells.push(w); total += w;
  }
  const x0 = opt.align === 'left' ? x : opt.align === 'right' ? x - total : x - total / 2;
  // フチは全字ぶんを先に引く。1字ずつ引くと隣の字の塗りを上書きする。
  if (opt.outline !== false) {
    c.lineJoin = 'round'; c.strokeStyle = opt.outlineColor || Art.PAL.ink;
    c.lineWidth = size * (opt.ow || .3);
    let px = x0;
    [...str].forEach((ch, i) => { c.strokeText(ch, px + cells[i] / 2, y); px += cells[i]; });
  }
  c.fillStyle = color;
  let px = x0;
  [...str].forEach((ch, i) => { c.fillText(ch, px + cells[i] / 2, y); px += cells[i]; });
  c.restore();
};
Art.numWidth = function (c, text, size) {
  c.save();
  c.font = '900 ' + size + 'px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
  let cell = 0;
  for (let d = 0; d < 10; d++) cell = Math.max(cell, c.measureText(String(d)).width);
  let t = 0;
  for (const ch of String(text)) t += (ch >= '0' && ch <= '9') ? cell : c.measureText(ch).width;
  c.restore(); return t;
};

Art.measure = function (c, text, size, opt) {
  opt = opt || {};
  c.save();
  c.font = (opt.weight || 700) + ' ' + size + 'px ' +
    (opt.face || '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif');
  const w = c.measureText(text).width;
  c.restore(); return w;
};

// ---------------------------------------------------------------- 体型
/* 体の輪郭。ここが全員同じだと、角や耳をいくら足しても
 * シルエットは「同じ卵に小物を載せたもの」にしかならない。
 * 遠目20pxの黒い塊だけで誰か分かることが条件なので、
 * 縦横比ではなく輪郭そのものを作り分ける。 */
Art.bodyPath = function (c, kind, x, y, rx, ry) {
  const k = .5523;
  const B = (x1, y1, x2, y2, x3, y3) => c.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  c.beginPath();
  switch (kind) {

    case 'pear':      // 肩が狭く腰が重い
      c.moveTo(x, y - ry);
      B(x + rx * .30, y - ry,      x + rx * .52, y - ry * .66,  x + rx * .55, y - ry * .20);
      B(x + rx * .60, y + ry * .30, x + rx,      y + ry * .50,  x + rx * .94, y + ry * .78);
      B(x + rx * .86, y + ry,      x - rx * .86, y + ry,        x - rx * .94, y + ry * .78);
      B(x - rx,      y + ry * .50, x - rx * .60, y + ry * .30,  x - rx * .55, y - ry * .20);
      B(x - rx * .52, y - ry * .66, x - rx * .30, y - ry,       x, y - ry);
      break;

    case 'bell': {    // 底が平らでどっしり。据わっている
      const rr = ry * .22;
      c.moveTo(x - rx, y + ry - rr);
      c.lineTo(x - rx, y + ry * .1);
      B(x - rx, y - ry * .52, x - rx * .88, y - ry, x, y - ry);
      B(x + rx * .88, y - ry, x + rx, y - ry * .52, x + rx, y + ry * .1);
      c.lineTo(x + rx, y + ry - rr);
      c.quadraticCurveTo(x + rx, y + ry, x + rx - rr, y + ry);
      c.lineTo(x - rx + rr, y + ry);
      c.quadraticCurveTo(x - rx, y + ry, x - rx, y + ry - rr);
      break;
    }

    case 'tall': {    // 細長いカプセル
      const w = rx * .88, rr = Math.min(w, ry * .46);
      c.moveTo(x - w, y + ry - rr);
      c.lineTo(x - w, y - ry + rr);
      B(x - w, y - ry + rr * (1 - k), x - w * k, y - ry, x, y - ry);
      B(x + w * k, y - ry, x + w, y - ry + rr * (1 - k), x + w, y - ry + rr);
      c.lineTo(x + w, y + ry - rr);
      B(x + w, y + ry - rr * (1 - k), x + w * k, y + ry, x, y + ry);
      B(x - w * k, y + ry, x - w, y + ry - rr * (1 - k), x - w, y + ry - rr);
      break;
    }

    case 'wide': {    // 上が狭く底が広い座布団。低く構えている
      const rr = Math.min(rx, ry) * .34, tw = rx * .68;
      c.moveTo(x - tw + rr, y - ry);
      c.lineTo(x + tw - rr, y - ry);
      c.quadraticCurveTo(x + tw, y - ry, x + tw + (rx - tw) * .5, y - ry + rr);
      c.lineTo(x + rx, y + ry - rr);
      c.quadraticCurveTo(x + rx, y + ry, x + rx - rr, y + ry);
      c.lineTo(x - rx + rr, y + ry);
      c.quadraticCurveTo(x - rx, y + ry, x - rx, y + ry - rr);
      c.lineTo(x - tw - (rx - tw) * .5, y - ry + rr);
      c.quadraticCurveTo(x - tw, y - ry, x - tw + rr, y - ry);
      break;
    }

    case 'block': {   // 肩のある丸四角。角ばりが遠目でも効く
      const rr = Math.min(rx, ry) * .46;
      c.moveTo(x - rx + rr, y - ry);
      c.lineTo(x + rx - rr, y - ry);
      c.quadraticCurveTo(x + rx, y - ry, x + rx, y - ry + rr);
      c.lineTo(x + rx, y + ry - rr);
      c.quadraticCurveTo(x + rx, y + ry, x + rx - rr, y + ry);
      c.lineTo(x - rx + rr, y + ry);
      c.quadraticCurveTo(x - rx, y + ry, x - rx, y + ry - rr);
      c.lineTo(x - rx, y - ry + rr);
      c.quadraticCurveTo(x - rx, y - ry, x - rx + rr, y - ry);
      break;
    }

    case 'drop':      // 頭が尖ったしずく
      c.moveTo(x, y - ry);
      B(x + rx * .22, y - ry * .74, x + rx, y - ry * .22, x + rx, y + ry * .30);
      B(x + rx, y + ry * .80, x + rx * .58, y + ry, x, y + ry);
      B(x - rx * .58, y + ry, x - rx, y + ry * .80, x - rx, y + ry * .30);
      B(x - rx, y - ry * .22, x - rx * .22, y - ry * .74, x, y - ry);
      break;

    case 'spin':      // 上下が尖った紡錘
      c.moveTo(x, y - ry);
      B(x + rx * .18, y - ry * .70, x + rx, y - ry * .30, x + rx, y + ry * .06);
      B(x + rx, y + ry * .52, x + rx * .30, y + ry * .78, x, y + ry);
      B(x - rx * .30, y + ry * .78, x - rx, y + ry * .52, x - rx, y + ry * .06);
      B(x - rx, y - ry * .30, x - rx * .18, y - ry * .70, x, y - ry);
      break;

    case 'gem':       // 角のある六角形。丸ばかりの中に直線を1体入れる
      c.moveTo(x, y - ry);
      c.lineTo(x + rx * .90, y - ry * .40);
      c.lineTo(x + rx, y + ry * .36);
      c.lineTo(x + rx * .46, y + ry);
      c.lineTo(x - rx * .46, y + ry);
      c.lineTo(x - rx, y + ry * .36);
      c.lineTo(x - rx * .90, y - ry * .40);
      break;

    case 'dome': {    // 上は半円、下は角のある平ら
      const rr = ry * .16;
      c.moveTo(x - rx, y + ry - rr);
      c.lineTo(x - rx, y - ry * .06);
      B(x - rx, y - ry * .68, x - rx * .58, y - ry, x, y - ry);
      B(x + rx * .58, y - ry, x + rx, y - ry * .68, x + rx, y - ry * .06);
      c.lineTo(x + rx, y + ry - rr);
      c.quadraticCurveTo(x + rx, y + ry, x + rx - rr, y + ry);
      c.lineTo(x - rx + rr, y + ry);
      c.quadraticCurveTo(x - rx, y + ry, x - rx, y + ry - rr);
      break;
    }

    case 'peanut':    // くびれのある瓢箪
      c.moveTo(x, y - ry);
      B(x + rx * .80, y - ry, x + rx, y - ry * .48, x + rx * .54, y - ry * .04);
      B(x + rx * .30, y + ry * .18, x + rx, y + ry * .34, x + rx * .90, y + ry * .70);
      B(x + rx * .78, y + ry, x - rx * .78, y + ry, x - rx * .90, y + ry * .70);
      B(x - rx, y + ry * .34, x - rx * .30, y + ry * .18, x - rx * .54, y - ry * .04);
      B(x - rx, y - ry * .48, x - rx * .80, y - ry, x, y - ry);
      break;

    default:
      Art.eggPath(c, x, y, rx, ry, .14);
      return;
  }
  c.closePath();
};

// ---------------------------------------------------------------- キャラクター
/* 一座の6人。全員が体型・頭部・顔つきの三重で分かれる。
 * 遠目20pxのシルエットだけで判別できることが条件。色は補助でしかない。 */
const CAST = {
  circle:   { body: 'egg',    rx: 1.00, ry: 1.00, crest: 'scarf',   eye: 'round',  brow: false },
  triangle: { body: 'drop',   rx:  .92, ry: 1.10, crest: 'ears',    eye: 'droop',  brow: true  },
  square:   { body: 'block',  rx: 1.22, ry:  .80, crest: 'brow',    eye: 'narrow', brow: true  },
  star:     { body: 'spin',   rx:  .80, ry: 1.26, crest: 'tuft',    eye: 'sparkle',brow: false },
  heart:    { body: 'bell',   rx: 1.14, ry:  .88, crest: 'floppy',  eye: 'round',  brow: false },
  diamond:  { body: 'tall',   rx:  .70, ry: 1.34, crest: 'horn',    eye: 'sharp',  brow: true  },
  pentagon: { body: 'pear',   rx: 1.02, ry: 1.00, crest: 'crown',   eye: 'round',  brow: true  },
  hexagon:  { body: 'gem',    rx: 1.00, ry: 1.04, crest: 'antenna', eye: 'sparkle',brow: false },
  crown:    { body: 'wide',   rx: 1.30, ry:  .74, crest: 'trio',    eye: 'narrow', brow: true  },
  moon:     { body: 'peanut', rx:  .86, ry: 1.16, crest: 'hood',    eye: 'droop',  brow: false }
};
Art.CAST = CAST;

/* 状態別ポーズ。キャラは「立っているだけ」では感情を持たない。
 * 待機／溜め／歓喜／落胆／驚き／歩行の6つを用意し、間は必ず補間する。
 * 縦の跳ねはここに入れない ——「持ち上がったまま止まる」と浮いて見えるので、
 * 跳躍は Stage 側の重力つきホップが受け持つ。 */
Art.POSE = {
  idle:  { arm:  .50, spread:  .02, lean:  0,   tilt:  0,   lift: 0, squash: 1    },
  ready: { arm:  .62, spread: -.30, lean:  .16, tilt:  .07, lift: 2, squash:  .91 },
  cheer: { arm:-1.90, spread:  .30, lean:  0,   tilt: -.06, lift: 0, squash: 1.06 },
  flop:  { arm:  .95, spread:  .02, lean:  .18, tilt:  .2,  lift: 5, squash:  .93 },
  shock: { arm:-1.05, spread:  .55, lean: -.12, tilt: -.03, lift: 0, squash: 1.09 },
  walk:  { arm:  .45, spread:  .04, lean:  .06, tilt:  0,   lift: 0, squash: 1    }
};
const POSE_KEYS = ['arm', 'spread', 'lean', 'tilt', 'lift', 'squash'];
Art.poseLerp = function (a, b, t) {
  const o = {};
  for (const k of POSE_KEYS) {
    const av = a && a[k] !== undefined ? a[k] : (k === 'squash' ? 1 : 0);
    const bv = b && b[k] !== undefined ? b[k] : (k === 'squash' ? 1 : 0);
    o[k] = av + (bv - av) * t;
  }
  return o;
};

Art.chara = function (c, o) {
  const cast = CAST[o.shape] || CAST.circle;
  const r = o.r, col = o.color;
  const P = o.pose || Art.POSE.idle;
  // 呼び出し側がバネを渡してくる。0以下だと平方根が NaN になり描画全体が落ちる。
  const sq = clamp((o.squash === undefined ? 1 : o.squash) * (P.squash || 1), .3, 2);
  const rx = r * cast.rx / Math.sqrt(sq), ry = r * cast.ry * sq;
  const line = Art.outlineOf(col);
  const lw = Math.max(1.7, r * .12);

  if (o.shadowY !== undefined) Art.contact(c, o.x, o.shadowY, rx * .95, o.shadowK);

  c.save();
  c.translate(o.x, o.y + (o.bob || 0) + (P.lift || 0) * (r / 44));
  if (o.rot || P.tilt) c.rotate((o.rot || 0) + (P.tilt || 0));
  const lean = (o.lean || 0) + (P.lean || 0);
  if (lean) c.transform(1, 0, -lean * .5, 1, 0, 0);

  // 重なったとき分離させる縁。人が密集する画面では必須。
  if (o.sticker) {
    c.save();
    Art.bodyPath(c, cast.body, 0, 0, rx * 1.13, ry * 1.11);
    c.fillStyle = o.sticker; c.fill();
    c.restore();
  }

  const step = o.walk ? Math.sin(o.walk) : 0;

  if (o.feet !== false) {
    [-1, 1].forEach(sd => {
      const off = step * sd * r * .26;
      const fx = sd * rx * .44 + off, fy = ry * .95 - Math.abs(off) * .45;
      Art.vinyl(c, () => { c.beginPath();
        c.ellipse(fx, fy, r * .25, r * .17, sd * .12, 0, TAU); },
        { x: fx, y: fy, rx: r * .25, ry: r * .17,
          color: Art.shade(col, -.3), lw: lw * .7, spec: false, rim: false, bounce: .35 });
    });
  }

  /* 二次モーション。頭の飾りは体より遅れて動く。
   * 全部が同時に動くと、人形ではなく図形に見える。 */
  c.save();
  if (o.crestLag) { c.translate(o.crestLag * rx * .1, 0); c.rotate(o.crestLag * .12); }
  crest(c, cast.crest, rx, ry, r, col, line, lw, o);
  c.restore();

  Art.vinyl(c, () => Art.bodyPath(c, cast.body, 0, 0, rx, ry), { x: 0, y: 0, rx, ry, color: col, lw });

  /* 腕は胴の「あと」に描く。前に描くと胴に隠れて、どのポーズでも
   * 体の外に出た指先しか見えず、ポーズが読めない。 */
  if (o.arms !== false) {
    const swing = o.walk ? Math.sin(o.walk + Math.PI) * .5 : 0;
    const sp = (P.spread || 0);
    /* 腕の長さ。上げるポーズほど伸ばす。バンザイで手が頭より下だと
     * 「上げた」に見えないし、極端な姿勢での伸びはアニメーションの基本。 */
    const AL = r * .70 + Math.max(0, -(P.arm || 0)) * r * .23;
    [-1, 1].forEach(sd => {
      const a = (P.arm || 0) + swing * sd
        + Math.sin((o.armT || 0) * 1.3 + (o.seed || 0) + sd) * .05;
      // a を仰角に変換する。a が負ほど上、正ほど下。
      const el = -a * .9 - .35;
      /* 肩は胴の輪郭上に置く。中に置くと腕が顔の上を横切ってしまう。
       * 腕を上げるほど付け根も上へ移す。 */
      const ph = clamp(el * .35 - .18, -.55, .2);
      const sx = sd * rx * Math.cos(ph) * .93, sy = -ry * Math.sin(ph) * .93;
      const ow = 1 + sp;
      const hx = sx + sd * AL * Math.cos(el) * ow;
      const hy = sy - AL * Math.sin(el);
      // 肘。腕の中点を進行方向の外側へ逃がすと、棒ではなく腕に見える。
      const mx = (sx + hx) / 2 + sd * AL * .17, my = (sy + hy) / 2 + AL * .1;
      const draw = () => { c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, hx, hy); };
      c.lineCap = 'round';
      /* 腕は胴より暗く、手先は明るく。同色同幅だと、上げた腕が
       * 頭の飾り（耳・角）と見分けられず、突起が4本あるように見える。 */
      draw(); Art.stroke(c, line, r * .27);
      draw(); Art.stroke(c, Art.shade(col, -.24), r * .145);
      // 手先。丸を置くと腕が「終わって」見える
      c.beginPath(); c.arc(hx, hy, r * .135, 0, TAU);
      c.fillStyle = Art.shade(col, .12); c.fill();
      Art.stroke(c, line, r * .075);
    });
  }

  // ほっぺ。体色によって見え方が変わるので、明るい色ほど濃く入れる。
  c.save();
  Art.bodyPath(c, cast.body, 0, 0, rx, ry); c.clip();
  const [pr, pg, pb] = rgb(col);
  const lumi = (pr * .3 + pg * .59 + pb * .11) / 255;
  c.globalAlpha = .28 + lumi * .34;
  [-1, 1].forEach(sd => {
    const g = c.createRadialGradient(sd * rx * .56, ry * .2, 0, sd * rx * .56, ry * .2, rx * .32);
    g.addColorStop(0, lumi > .5 ? '#E8446E' : Art.PAL.pink);
    g.addColorStop(1, Art.alpha(lumi > .5 ? '#E8446E' : Art.PAL.pink, 0));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(sd * rx * .56, ry * .2, rx * .32, ry * .21, 0, 0, TAU); c.fill();
  });
  c.restore();

  face(c, o, cast, rx, ry, r);
  c.restore();
};

function crest(c, kind, rx, ry, r, col, line, lw, o) {
  const dark = Art.shade(col, -.26);
  const sway = Math.sin((o.armT || 0) * 1.3 + (o.seed || 0)) * .06;
  switch (kind) {
    case 'scarf':   // 首巻き。丸い体でも遠目に分かる唯一の輪郭になる
      Art.vinyl(c, () => { c.beginPath();
        c.moveTo(-rx * .78, ry * .34);
        c.quadraticCurveTo(0, ry * .68, rx * .78, ry * .34);
        c.quadraticCurveTo(rx * .84, ry * .58, rx * .72, ry * .62);
        c.quadraticCurveTo(0, ry * .92, -rx * .72, ry * .62);
        c.quadraticCurveTo(-rx * .84, ry * .58, -rx * .78, ry * .34);
        c.closePath(); },
        { x: 0, y: ry * .58, rx: rx * .8, ry: ry * .2, color: Art.PAL.cream, lw: lw * .9, spec: false });
      c.save(); c.rotate(sway);
      Art.vinyl(c, () => { c.beginPath();
        c.moveTo(rx * .5, ry * .6);
        c.quadraticCurveTo(rx * .96, ry * .96, rx * .74, ry * 1.24);
        c.quadraticCurveTo(rx * .5, ry * 1.0, rx * .34, ry * .74);
        c.closePath(); },
        { x: rx * .64, y: ry * .92, rx: rx * .3, ry: ry * .32,
          color: Art.PAL.cream, lw: lw * .8, spec: false });
      c.restore(); break;
    case 'ears':
      [-1, 1].forEach(sd => { c.save(); c.rotate(sway * sd);
        Art.vinyl(c, () => { c.beginPath();
          c.moveTo(sd * rx * .44, -ry * .78);
          c.quadraticCurveTo(sd * rx * 1.04, -ry * 1.54, sd * rx * .86, -ry * 1.84);
          c.quadraticCurveTo(sd * rx * .42, -ry * 1.44, sd * rx * .08, -ry * .98);
          c.closePath(); },
          { x: sd * rx * .5, y: -ry * 1.22, rx: rx * .4, ry: ry * .5,
            color: col, lw, spec: false, bounce: 0 });
        c.restore(); }); break;
    case 'brow':
      Art.vinyl(c, () => Art.roundRect(c, -rx * .8, -ry * 1.2, rx * 1.6, ry * .36, ry * .17),
        { x: 0, y: -ry * 1.02, rx: rx * .8, ry: ry * .18, color: dark, lw, spec: false, bounce: 0 });
      break;
    /* 一本の長い線は、頭の飾りではなく描画の残骸に見える。
     * 短い房を3本、根元から扇形に散らす。 */
    case 'tuft': { c.save(); c.rotate(sway * 2);
      [[-.34, .62], [-.02, .80], [.30, .58]].forEach(([lean, len], i) => {
        const p = () => { c.beginPath();
          c.moveTo(rx * lean * .5, -ry * .92);
          c.quadraticCurveTo(rx * (lean * 1.5 + .1), -ry * (.92 + len * .6),
                             rx * (lean * 2.1), -ry * (.92 + len)); };
        p(); Art.stroke(c, line, r * .19);
        p(); Art.stroke(c, Art.shade(col, .18 + i * .06), r * .095);
      });
      c.restore(); break; }
    case 'floppy':
      [-1, 1].forEach(sd => { c.save(); c.rotate(sway * sd * 1.6);
        Art.vinyl(c, () => { c.beginPath();
          c.ellipse(sd * rx * .86, -ry * .26, rx * .25, ry * .52, sd * .32, 0, TAU); },
          { x: sd * rx * .86, y: -ry * .26, rx: rx * .25, ry: ry * .52,
            color: dark, lw: lw * .85, spec: false, bounce: 0 });
        c.restore(); }); break;
    /* 角は体の高さの3割まで。長すぎると角ではなくアンテナに見えるし、
     * 縦長の体につけると画面の上に飛び出して構図を割る。 */
    case 'horn':
      Art.vinyl(c, () => { c.beginPath();
        c.moveTo(-rx * .22, -ry * .96);
        c.quadraticCurveTo(-rx * .06, -ry * 1.30, rx * .14, -ry * 1.36);
        c.quadraticCurveTo(rx * .26, -ry * 1.16, rx * .26, -ry * .94);
        c.closePath(); },
        { x: 0, y: -ry * 1.14, rx: rx * .24, ry: ry * .22,
          color: Art.PAL.cream, lw, spec: false, bounce: 0 }); break;
    case 'crown':
      Art.vinyl(c, () => { c.beginPath();
        c.moveTo(-rx * .58, -ry * .92); c.lineTo(-rx * .6, -ry * 1.44);
        c.lineTo(-rx * .2, -ry * 1.12);  c.lineTo(0, -ry * 1.64);
        c.lineTo(rx * .2, -ry * 1.12);   c.lineTo(rx * .6, -ry * 1.44);
        c.lineTo(rx * .58, -ry * .92);   c.closePath(); },
        { x: 0, y: -ry * 1.24, rx: rx * .6, ry: ry * .36,
          color: Art.shade(col, .45), lw, spec: false, bounce: 0 }); break;
    case 'antenna':
      [-1, 1].forEach(sd => { c.save(); c.rotate(sway * sd * 2.2);
        c.beginPath();
        c.moveTo(sd * rx * .22, -ry * .94);
        c.quadraticCurveTo(sd * rx * .8, -ry * 1.52, sd * rx * .62, -ry * 1.86);
        Art.stroke(c, line, r * .1);
        Art.vinyl(c, () => { c.beginPath(); c.arc(sd * rx * .62, -ry * 1.92, r * .15, 0, TAU); },
          { x: sd * rx * .62, y: -ry * 1.92, rx: r * .15, ry: r * .15,
            color: Art.shade(col, .5), lw: lw * .75, bounce: 0 });
        c.restore(); }); break;
    case 'trio':
      [-1, 0, 1].forEach(sd => { const h = sd === 0 ? 1.66 : 1.36;
        Art.vinyl(c, () => { c.beginPath();
          c.moveTo(sd * rx * .4 - rx * .15, -ry * .92);
          c.lineTo(sd * rx * .4, -ry * h);
          c.lineTo(sd * rx * .4 + rx * .15, -ry * .92); c.closePath(); },
          { x: sd * rx * .4, y: -ry * (h * .62), rx: rx * .15, ry: ry * .32,
            color: Art.shade(col, -.2), lw: lw * .8, spec: false, bounce: 0 }); }); break;
    case 'hood':
      Art.vinyl(c, () => { c.beginPath();
        c.arc(0, -ry * .06, rx * 1.1, Math.PI * 1.02, Math.PI * 1.98);
        c.quadraticCurveTo(rx * .62, -ry * .48, rx * .48, -ry * .5);
        c.lineTo(-rx * .48, -ry * .5);
        c.quadraticCurveTo(-rx * .62, -ry * .48, -rx * 1.08, -ry * .16);
        c.closePath(); },
        { x: 0, y: -ry * .72, rx: rx * 1.06, ry: ry * .5,
          color: dark, lw, spec: false, bounce: 0 }); break;
  }
}

/* 顔つきも個体で変える。目の形が4種あるだけで、同じ色でも別人に見える。 */
function face(c, o, cast, rx, ry, r) {
  const f = o.face || 'smile';
  const kind = cast.eye;
  const gap = kind === 'narrow' ? .38 : kind === 'sharp' ? .3 : .33;
  const ex = rx * gap, ey = -ry * .1;
  let er = r * (kind === 'sparkle' ? .25 : kind === 'narrow' ? .19 : .215);
  const lx = clamp(o.look ? o.look[0] : 0, -1, 1) * er * .36;
  const ly = clamp(o.look ? o.look[1] : 0, -1, 1) * er * .36;

  if (o.blink) {
    [-1, 1].forEach(sd => { c.beginPath();
      c.moveTo(sd * ex - er * .62, ey);
      c.quadraticCurveTo(sd * ex, ey + er * .34, sd * ex + er * .62, ey);
      Art.stroke(c, Art.PAL.ink, r * .075); });
  } else {
    [-1, 1].forEach(sd => {
      const wide = f === 'shock' ? 1.18 : 1;
      c.save();
      if (kind === 'sharp') c.transform(1, 0, sd * -.22, 1, 0, 0);
      c.beginPath();
      const ry2 = er * (kind === 'narrow' ? .62 : kind === 'droop' ? 1.0 : 1.08) * wide;
      c.ellipse(sd * ex, ey + (kind === 'droop' ? er * .16 : 0), er * wide, ry2, 0, 0, TAU);
      c.fillStyle = Art.PAL.cream; c.fill();
      Art.stroke(c, Art.PAL.ink, r * .055);
      const prr = er * (f === 'shock' ? .32 : kind === 'narrow' ? .62 : .56);
      c.beginPath(); c.arc(sd * ex + lx, ey + ly + (kind === 'droop' ? er * .2 : 0), prr, 0, TAU);
      c.fillStyle = '#241733'; c.fill();
      c.beginPath();
      c.arc(sd * ex + lx - prr * .34, ey + ly - prr * .42, prr * .38, 0, TAU);
      c.fillStyle = '#fff'; c.fill();
      if (kind === 'sparkle') {
        c.globalAlpha = .75;
        c.beginPath();
        c.arc(sd * ex + lx + prr * .34, ey + ly + prr * .36, prr * .22, 0, TAU); c.fill();
      }
      c.restore();
    });
  }

  const BROW = { smile: null, joy: [-.34, -.12], flat: [0, 0],
                 sad: [.32, .24], shock: [-.22, -.32], mad: [-.55, .38] }[f];
  if (BROW && (cast.brow || f !== 'flat')) {
    [-1, 1].forEach(sd => {
      c.beginPath();
      c.moveTo(sd * (ex - er * .8), ey - er * 1.4 + BROW[0] * er);
      c.quadraticCurveTo(sd * ex, ey - er * (1.56 + BROW[1] * .6),
                         sd * (ex + er * .8), ey - er * 1.4 + BROW[1] * er * sd);
      Art.stroke(c, Art.PAL.ink, r * .085);
    });
  }

  const my = ry * .3;
  c.beginPath();
  if (f === 'smile') {
    c.moveTo(-r * .2, my - r * .04);
    c.quadraticCurveTo(0, my + r * .18, r * .2, my - r * .04);
    Art.stroke(c, Art.PAL.ink, r * .085);
  } else if (f === 'joy') {
    c.moveTo(-r * .25, my - r * .07);
    c.quadraticCurveTo(0, my + r * .32, r * .25, my - r * .07);
    c.closePath(); c.fillStyle = '#6E2038'; c.fill();
    Art.stroke(c, Art.PAL.ink, r * .07);
    c.beginPath();
    c.moveTo(-r * .11, my + r * .13);
    c.quadraticCurveTo(0, my + r * .28, r * .11, my + r * .13);
    c.fillStyle = Art.PAL.pink; c.fill();
  } else if (f === 'flat') {
    c.moveTo(-r * .15, my); c.lineTo(r * .15, my);
    Art.stroke(c, Art.PAL.ink, r * .085);
  } else if (f === 'sad') {
    c.moveTo(-r * .19, my + r * .13);
    c.quadraticCurveTo(0, my - r * .1, r * .19, my + r * .13);
    Art.stroke(c, Art.PAL.ink, r * .085);
  } else if (f === 'shock') {
    c.ellipse(0, my + r * .03, r * .13, r * .19, 0, 0, TAU);
    c.fillStyle = '#6E2038'; c.fill();
    Art.stroke(c, Art.PAL.ink, r * .07);
  } else if (f === 'mad') {
    c.moveTo(-r * .21, my + r * .09);
    c.lineTo(0, my - r * .05); c.lineTo(r * .21, my + r * .09);
    Art.stroke(c, Art.PAL.ink, r * .085);
  }
}

// ---------------------------------------------------------------- 粒子
Art.FX = function () { this.list = []; };
Art.FX.prototype.burst = function (x, y, o) {
  o = o || {}; const n = o.n || 18;
  for (let i = 0; i < n; i++) {
    const a = o.dir === undefined ? Math.random() * TAU
      : o.dir + (Math.random() - .5) * (o.spread || TAU);
    const sp = (o.speed || 300) * (.4 + Math.random() * .8);
    this.list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0),
      life: (o.life || .8) * (.75 + Math.random() * .5), t: 0,
      size: (o.size || 9) * (.6 + Math.random() * .8),
      color: (o.color || [Art.PAL.gold])[(Math.random() * (o.color || [1]).length) | 0],
      spin: (Math.random() - .5) * 16, rot: Math.random() * TAU,
      kind: o.kind || 'confetti', grav: o.grav === undefined ? 950 : o.grav });
  }
};
Art.FX.prototype.ring = function (x, y, o) {
  o = o || {};
  this.list.push({ x, y, ring: true, t: 0, life: o.life || .45,
    r0: o.r0 || 10, r1: o.r1 || 130, color: o.color || '#fff', lw: o.lw || 8 });
};
Art.FX.prototype.update = function (dt) {
  for (let i = this.list.length - 1; i >= 0; i--) {
    const p = this.list[i]; p.t += dt;
    if (p.t >= p.life) { this.list.splice(i, 1); continue; }
    if (p.ring) continue;
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 1.5 * dt; p.rot += p.spin * dt;
  }
};
Art.FX.prototype.draw = function (c) {
  for (const p of this.list) {
    const k = p.t / p.life;
    c.save();
    if (p.ring) {
      c.globalAlpha = (1 - k) * .9;
      c.beginPath();
      c.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * Art.ease.outQuint(k), 0, TAU);
      Art.stroke(c, p.color, p.lw * (1 - k * .7));
      c.restore(); continue;
    }
    c.globalAlpha = Art.sat((1 - k) * 2.4);
    c.translate(p.x, p.y); c.rotate(p.rot);
    c.fillStyle = p.color;
    if (p.kind === 'star') {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i / 10 * TAU, rr = i % 2 ? p.size * .42 : p.size;
        i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
          : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
    } else if (p.kind === 'dot') {
      c.beginPath(); c.arc(0, 0, p.size * .5, 0, TAU); c.fill();
    } else {
      const s = Math.cos(p.rot * 1.9);
      if (s < 0) c.fillStyle = Art.shade(p.color, -.42);
      c.fillRect(-p.size * .5, -p.size * .38 * Math.abs(s) - p.size * .06,
                 p.size, p.size * .76 * Math.abs(s) + p.size * .12);
    }
    c.restore();
  }
};

// ---------------------------------------------------------------- 舞台
/* 舞台の地。空と遠景だけ。トラスと灯りは backdrop が持つ。 */
Art.sky = function (c, W, H, t) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, Art.PAL.sky0); g.addColorStop(1, Art.PAL.sky1);
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // 遠くの街明かり。会場が「どこか」にあることを示す最小限の情報。
  c.save();
  for (let i = 0; i < 44; i++) {
    const x = (hash(i * 13) * .5 + .5) * W;
    const y = 140 + (hash(i * 41) * .5 + .5) * 110;
    c.globalAlpha = (.35 + Math.abs(Math.sin(t * .8 + i * 1.7)) * .45) * .5;
    c.fillStyle = i % 4 === 0 ? Art.PAL.gold : '#C8D8FF';
    c.fillRect(x, y, 2.5, 2.5);
  }
  c.restore();
};
Art.stage = Art.sky;   // 旧名。呼び出し側が残っている間だけ

/* 電球の紐。夜のパーティに合う。装飾は必ず見出しより奥に描く。 */
Art.lights = function (c, W, t, y) {
  const n = 15, sag = 46;
  const py = i => y + Math.sin(i / n * Math.PI) * sag
    + Math.sin(t * .9 + i * .55) * 3 + Math.sin(t * 1.7 + i * .3) * 1.4;
  c.save();
  c.beginPath();
  for (let i = 0; i <= n; i++) { const x = i / n * W; i ? c.lineTo(x, py(i)) : c.moveTo(x, py(i)); }
  Art.stroke(c, 'rgba(255,240,210,.3)', 2.2);
  for (let i = 0; i <= n; i++) {
    const x = i / n * W, yy = py(i) + 11;
    const warm = i % 3 === 0 ? '#FFD98A' : i % 3 === 1 ? '#FFB0C8' : '#FFF2CE';
    const pulse = .72 + Math.abs(Math.sin(t * 1.6 + i * .9)) * .28;
    c.save(); c.globalCompositeOperation = 'lighter';
    const gg = c.createRadialGradient(x, yy, 0, x, yy, 24 * pulse);
    gg.addColorStop(0, Art.alpha(warm, .5 * pulse)); gg.addColorStop(1, Art.alpha(warm, 0));
    c.fillStyle = gg; c.beginPath(); c.arc(x, yy, 24 * pulse, 0, TAU); c.fill();
    c.restore();
    c.beginPath(); c.arc(x, yy, 5, 0, TAU); c.fillStyle = warm; c.fill();
    Art.stroke(c, 'rgba(60,40,20,.55)', 1.3);
  }
  c.restore();
};

/* 木の舞台。板ごとに幅と明度を変える。等幅に割ると床が図面に見える。 */
Art.floor = function (c, W, H, y, tint) {
  const base = tint || Art.PAL.wood;
  Art.bounceColor = base;
  // 影はその床を深く沈めた色にする。床が変われば影の色も変わる。
  const sc = rgb(Art.shade(base, -.82));
  Art.shadowColor = (sc[0] | 0) + ',' + (sc[1] | 0) + ',' + (sc[2] | 0);
  const g = c.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, Art.shade(base, -.3));
  g.addColorStop(.32, base);
  g.addColorStop(1, Art.shade(base, .14));
  c.fillStyle = g; c.fillRect(0, y, W, H - y);

  c.save(); c.beginPath(); c.rect(0, y, W, H - y); c.clip();
  const vp = W * Art.VP;   // 中央から外す。完全な左右対称は人が作った絵にならない
  for (let i = -9; i < 9; i++) {
    c.globalAlpha = .05 + (hash(i * 31) * .5 + .5) * .06;
    c.fillStyle = (i % 2) ? '#fff' : '#2A1400';
    c.beginPath();
    c.moveTo(vp + i * W * .052, y); c.lineTo(vp + (i + 1) * W * .052, y);
    c.lineTo(vp + (i + 1) * W * .33, H); c.lineTo(vp + i * W * .33, H);
    c.closePath(); c.fill();
  }
  c.globalAlpha = .2;
  for (let i = -9; i <= 9; i++) {
    c.beginPath(); c.moveTo(vp + i * W * .052, y); c.lineTo(vp + i * W * .33, H);
    Art.stroke(c, 'rgba(50,24,0,.7)', 1.3);
  }
  c.globalAlpha = .16;
  let yy = y + 7, k = 0;
  while (yy < H) {
    c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy);
    Art.stroke(c, 'rgba(50,24,0,.8)', 1.3);
    yy += 15 + k * 12; k++;
  }
  c.restore();

  /* 壁と床の取り合い。ここを1本の線で済ませると、画面で最も
   * 「作り込まれていない」場所になる。幅木・接地の暗がり・縁の照りを入れる。 */
  c.save();
  const ao = c.createLinearGradient(0, y - 34, 0, y + 3);
  ao.addColorStop(0, 'rgba(6,2,18,0)');
  ao.addColorStop(1, 'rgba(6,2,18,.6)');
  c.fillStyle = ao; c.fillRect(0, y - 34, W, 37);
  Art.slab(c, -4, y - 12, W + 8, 14, Art.shade(base, -.42),
    { depth: 0, r: 3, shadow: false, lw: 2.5 });
  c.beginPath(); c.moveTo(0, y + 1.5); c.lineTo(W, y + 1.5);
  Art.stroke(c, 'rgba(255,214,150,.42)', 2.4);
  c.restore();
};

/* 夜の通路。だるまさん専用の空間。
 * 屋上の舞台を色替えして使い回すと、一目で流用と分かる。
 * ここは光が「奥から」来る。鬼が逆光のシルエットになり、
 * 影が手前へ長く伸びるので、追われている感じが構図から出る。 */
Art.corridor = function (c, W, H, y, t, danger) {
  const wall = danger ? '#3A1220' : '#1D1436';
  const g = c.createLinearGradient(0, 0, 0, y);
  g.addColorStop(0, Art.shade(wall, -.3));
  g.addColorStop(1, wall);
  c.fillStyle = g; c.fillRect(0, 0, W, y);

  const vx = W * .84, vy = y - 26;          // 消失点は右奥（鬼のいる方）
  // 側壁。奥へ収束する帯で通路を作る。
  c.save();
  for (let i = 0; i < 9; i++) {
    const k = i / 9;
    c.globalAlpha = .1 + k * .12;
    c.fillStyle = i % 2 ? '#000' : '#fff';
    const x0 = Art.lerp(-W * .3, vx, k), x1 = Art.lerp(-W * .3, vx, k + .11);
    c.beginPath();
    c.moveTo(x0, Art.lerp(-60, vy, k));   c.lineTo(x1, Art.lerp(-60, vy, k + .11));
    c.lineTo(x1, Art.lerp(H, vy, k + .11)); c.lineTo(x0, Art.lerp(H, vy, k));
    c.closePath(); c.fill();
  }
  c.restore();

  // 奥の出口。ここが光源。
  c.save(); c.globalCompositeOperation = 'lighter';
  const gg = c.createRadialGradient(vx, vy, 0, vx, vy, W * .5);
  const warm = danger ? 'rgba(255,90,90,' : 'rgba(255,214,160,';
  gg.addColorStop(0, warm + '.55)');
  gg.addColorStop(.35, warm + '.16)');
  gg.addColorStop(1, warm + '0)');
  c.fillStyle = gg; c.beginPath(); c.arc(vx, vy, W * .5, 0, TAU); c.fill();
  c.restore();

  // 天井の蛍光灯。奥へ小さくなる。
  for (let i = 0; i < 5; i++) {
    const k = .16 + i * .17;
    const lx = Art.lerp(W * .1, vx, k), ly = Art.lerp(-10, vy - 40, k);
    const lw = Art.lerp(190, 24, k);
    c.save();
    c.globalAlpha = .85 - k * .3;
    Art.roundRect(c, lx - lw / 2, ly, lw, Math.max(4, 16 * (1 - k)), 4);
    c.fillStyle = danger ? '#FFB9B9' : '#FFF0CE'; c.fill();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = .3;
    const q = c.createRadialGradient(lx, ly, 0, lx, ly, lw * .8);
    q.addColorStop(0, danger ? 'rgba(255,120,120,.6)' : 'rgba(255,224,170,.6)');
    q.addColorStop(1, 'rgba(255,224,170,0)');
    c.fillStyle = q; c.beginPath(); c.arc(lx, ly, lw * .8, 0, TAU); c.fill();
    c.restore();
  }

  // 壁と床の取り合い
  const ao = c.createLinearGradient(0, y - 40, 0, y + 2);
  ao.addColorStop(0, 'rgba(4,1,12,0)'); ao.addColorStop(1, 'rgba(4,1,12,.7)');
  c.fillStyle = ao; c.fillRect(0, y - 40, W, 42);
};

/* 逆光の長い影。奥から光が来る空間で、手前に伸ばす。 */
Art.longShadow = function (c, x, y, rx, len, strength) {
  c.save();
  const g = c.createLinearGradient(x, y, x - len * .5, y + len);
  g.addColorStop(0, 'rgba(6,2,16,' + (strength || .5) + ')');
  g.addColorStop(1, 'rgba(6,2,16,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - rx, y); c.lineTo(x + rx, y);
  c.lineTo(x - len * .3 + rx * 1.8, y + len);
  c.lineTo(x - len * .3 - rx * 1.8, y + len);
  c.closePath(); c.fill();
  c.restore();
};

/* 舞台の奥。トラスと吊り照明。スピーカーより舞台らしさに効く。 */
/* 舞台まわり一式。空 → トラス → 器具 → ビーム → 床の光だまり。
 * 順番も含めてここに閉じる。ビームだけ別の関数にすると、器具のない位置から
 * 光が降り、床は誰にも照らされないまま、という画面になる。 */
Art.backdrop = function (c, W, H, y, t) {
  Art.sky(c, W, H, t);
  c.save();
  const ty = y - 232;
  // トラス
  c.globalAlpha = .55;
  Art.roundRect(c, 40, ty, W - 80, 16, 4);
  c.fillStyle = '#3A2D52'; c.fill(); Art.stroke(c, '#221A36', 2);
  c.beginPath();
  for (let x = 46; x < W - 46; x += 26) {
    c.moveTo(x, ty + 15); c.lineTo(x + 13, ty + 1); c.lineTo(x + 26, ty + 15);
  }
  Art.stroke(c, '#4C3D6B', 2);
  c.globalAlpha = 1;

  const lamps = Art.RIG.map((r, i) => {
    const x = W * r.x;
    const on = .5 + Math.abs(Math.sin(t * 1.1 + i * 1.4)) * .5;
    // 吊り棒と器具
    c.beginPath(); c.moveTo(x, ty + 14); c.lineTo(x, ty + 30);
    Art.stroke(c, '#2A2140', 4);
    c.save(); c.translate(x, ty + 38); c.rotate(r.aim * .5);
    Art.roundRect(c, -13, -10, 26, 20, 5);
    c.fillStyle = '#2E2444'; c.fill(); Art.stroke(c, '#1C1530', 2);
    c.restore();
    return { x, y: ty + 50, on, aim: r.aim, warm: r.warm };
  });

  // ビームは器具から出す。器具と別の位置から降る光は、光ではなく模様。
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const L of lamps) {
    const reach = (H - L.y) * 1.05;
    c.save(); c.translate(L.x, L.y); c.rotate(L.aim + Math.sin(t * .35 + L.x) * .015);
    const lg = c.createLinearGradient(0, 0, 0, reach);
    const tint = L.warm ? '255,214,150' : '190,200,255';
    lg.addColorStop(0, 'rgba(' + tint + ',' + (.11 * L.on).toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(' + tint + ',0)');
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(-11, 0);
    c.lineTo(-W * .13, reach); c.lineTo(W * .13, reach); c.lineTo(11, 0);
    c.closePath(); c.fill(); c.restore();
    // 電球そのもの
    const gg = c.createRadialGradient(L.x, L.y - 2, 0, L.x, L.y - 2, 30);
    gg.addColorStop(0, 'rgba(255,220,160,' + (.34 * L.on) + ')');
    gg.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(L.x, L.y - 2, 30, 0, TAU); c.fill();
  }
  c.restore();
  for (const L of lamps) {
    c.beginPath(); c.arc(L.x, L.y - 2, 6, 0, TAU);
    c.fillStyle = 'rgba(255,225,170,' + (.5 + L.on * .5) + ')'; c.fill();
  }
  c.restore();
  Art.lamps = lamps;   // 床が光だまりを落とすために使う
};

/* ビームが床に当たった跡。光っている物と照らされている物をつなぐ最後の一手。
 * 床を敷いたあとに呼ぶ。 */
Art.rigPools = function (c, W, H, y) {
  if (!Art.lamps) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.beginPath(); c.rect(0, y, W, H - y); c.clip();
  for (const L of Art.lamps) {
    // 傾いた分だけ着地点がずれる
    const fx = L.x + (y + 80 - L.y) * Math.tan(L.aim);
    const fy = y + 96;
    const g = c.createRadialGradient(fx, fy, 0, fx, fy, W * .10);
    const tint = L.warm ? '255,206,140' : '176,190,255';
    // 弱く。5つ重なるので、1つを強くすると床の木の色が飛ぶ
    g.addColorStop(0, 'rgba(' + tint + ',' + (.034 * L.on).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + tint + ',0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(fx, fy, W * .10, (H - y) * .26, 0, 0, TAU); c.fill();
  }
  c.restore();
};


window.Art = Art;
