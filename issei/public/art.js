/* 一斉 — 絵作りの土台。
 *
 * 方針は3つ。
 *
 *  1. 規則正しさを壊す。手続き生成の絵が「機械が作った」に見える最大の原因は、
 *     円が完全な円で、線が完全に均一なこと。輪郭に seed 付きのゆらぎを入れ、
 *     さらに毎秒8回だけ揺らし直す（手描きアニメの「線が沸く」現象）。
 *     これが入るだけで、同じ形でも手の跡があるように見える。
 *  2. 面ではなく塊を描く。ベタ塗りの矩形ではなく、下に厚みの面を持つ立体。
 *     押せそう・掴めそうに見えることが、パーティゲームの手触りになる。
 *  3. 文字は組む。fillText 一発ではなく、影・縁・本体・ハイライトを重ねて、
 *     ロゴとして成立させる。
 */
'use strict';

const Art = {};

// ---------------------------------------------------------------- 基礎
const TAU = Math.PI * 2;
Art.TAU = TAU;

Art.ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outBack: (t, s) => { s = s === undefined ? 1.9 : s;
    return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  outElastic: t => t === 0 || t === 1 ? t
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1,
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  }
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
Art.clamp = clamp;
Art.lerp = (a, b, t) => a + (b - a) * t;

/* 決定的な擬似乱数。同じ種なら必ず同じ絵になる（Math.random は使わない）。 */
function hash(n) {
  n = (n << 13) ^ n;
  return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}
Art.hash = hash;

// ---------------------------------------------------------------- 色
Art.PAL = {
  ink:     '#241a2e',   // 輪郭。真っ黒より紫寄りの方が絵が締まりつつ硬くならない
  inkSoft: 'rgba(36,26,46,0.28)',
  cream:   '#FFF6E3',
  red:     '#FF4757', redDark:  '#C4212F',
  blue:    '#3D8BFF', blueDark: '#1F55B8',
  yellow:  '#FFC531', yellowDark:'#D18F00',
  green:   '#3FD46B', greenDark:'#1E9B45',
  purple:  '#9B5DE5', purpleDark:'#6A2FB0',
  pink:    '#FF6FB5',
  stageA:  '#4A1E6B',   // 背景の上
  stageB:  '#22103A'    // 背景の下
};

Art.shade = function (hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
};

// ---------------------------------------------------------------- 揺れる輪郭
/* 手描きアニメの線は、静止していても細かく震えている（「線が沸く」）。
 * 完全な円を毎フレーム同じに描くと、それだけで機械が引いた線に見える。
 * 毎秒8回だけ形を引き直すことで、手で描き直している質感を作る。 */
Art.boil = 0;
Art.tick = function (timeSec) { Art.boil = Math.floor(timeSec * 8); };

Art.wobblePath = function (c, x, y, rx, ry, seed, amp, n) {
  n = n || 22; amp = amp === undefined ? 0.035 : amp;
  const s = (seed | 0) * 131 + Art.boil * 7919;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU;
    const w = 1 + hash(s + i * 37) * amp + hash(s + i * 91) * amp * 0.5;
    const px = x + Math.cos(a) * rx * w;
    const py = y + Math.sin(a) * ry * w;
    if (i === 0) c.moveTo(px, py);
    else {
      // 角を丸めて滑らかに繋ぐ（直線で結ぶと多角形に見える）
      const a0 = (i - 1) / n * TAU;
      const w0 = 1 + hash(s + (i - 1) * 37) * amp + hash(s + (i - 1) * 91) * amp * 0.5;
      const mx = x + Math.cos((a + a0) / 2) * rx * (w + w0) / 2 * 1.01;
      const my = y + Math.sin((a + a0) / 2) * ry * (w + w0) / 2 * 1.01;
      c.quadraticCurveTo(mx, my, px, py);
    }
  }
  c.closePath();
};

/* 角丸矩形も、辺をわずかに膨らませて手で描いた感じにする */
Art.wobbleRect = function (c, x, y, w, h, r, seed, amp) {
  amp = amp === undefined ? 1.6 : amp;
  const s = (seed | 0) * 71 + Art.boil * 5171;
  const d = i => hash(s + i * 53) * amp;
  r = Math.min(r, Math.min(w, h) / 2);
  c.beginPath();
  c.moveTo(x + r, y + d(0));
  c.quadraticCurveTo(x + w / 2, y + d(1) - amp, x + w - r, y + d(2));
  c.quadraticCurveTo(x + w, y, x + w + d(3), y + r);
  c.quadraticCurveTo(x + w + d(4) + amp, y + h / 2, x + w + d(5), y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h + d(6));
  c.quadraticCurveTo(x + w / 2, y + h + d(7) + amp, x + r, y + h + d(8));
  c.quadraticCurveTo(x, y + h, x + d(9), y + h - r);
  c.quadraticCurveTo(x + d(10) - amp, y + h / 2, x + d(11), y + r);
  c.quadraticCurveTo(x, y, x + r, y + d(0));
  c.closePath();
};

Art.ink = function (c, fill, lw) {
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = lw === undefined ? 5 : lw;
  c.strokeStyle = Art.PAL.ink;
  c.stroke();
};

// ---------------------------------------------------------------- 立体の板
/* 下に厚みの面を持たせる。押せそうに見えることが手触りになる。 */
Art.slab = function (c, x, y, w, h, color, opt) {
  opt = opt || {};
  const depth = opt.depth === undefined ? 10 : opt.depth;
  const r = opt.r === undefined ? 16 : opt.r;
  const seed = opt.seed || 1;

  c.save();
  if (opt.shadow !== false) {
    c.globalAlpha = .22; c.fillStyle = '#000';
    Art.wobbleRect(c, x + 3, y + depth + 5, w, h, r, seed + 5);
    c.fill(); c.globalAlpha = 1;
  }
  // 厚み
  Art.wobbleRect(c, x, y + depth, w, h, r, seed + 1);
  c.fillStyle = Art.shade(color, -0.34); c.fill();
  // 天面
  Art.wobbleRect(c, x, y, w, h, r, seed);
  Art.ink(c, color, opt.lw === undefined ? 4.5 : opt.lw);
  // 上面のハイライト
  if (opt.gloss !== false) {
    c.save();
    Art.wobbleRect(c, x, y, w, h, r, seed); c.clip();
    c.globalAlpha = .28; c.fillStyle = '#fff';
    Art.wobbleRect(c, x + w * .06, y + h * .08, w * .88, h * .3, r * .7, seed + 2);
    c.fill();
    c.restore();
  }
  c.restore();
};

// ---------------------------------------------------------------- 文字
/* ロゴとして組む。影 → 太い縁 → 本体 → 上部ハイライト。 */
Art.title = function (c, text, x, y, size, opt) {
  opt = opt || {};
  const face = opt.face || '"Dela Gothic One", "Hiragino Maru Gothic ProN", sans-serif';
  const fill = opt.fill || Art.PAL.yellow;
  const rot = opt.rot || 0;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (opt.scale) c.scale(opt.scale, opt.scale);
  c.font = size + 'px ' + face;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineCap = 'round';

  // 落ち影
  c.globalAlpha = .3; c.fillStyle = '#000';
  c.fillText(text, size * .05, size * .09);
  c.globalAlpha = 1;
  // 縁（外→内の二段で締める）
  c.strokeStyle = Art.PAL.ink; c.lineWidth = size * .28;
  c.strokeText(text, 0, 0);
  c.strokeStyle = Art.shade(fill, -0.5); c.lineWidth = size * .13;
  c.strokeText(text, 0, 0);
  // 本体
  c.fillStyle = fill;
  c.fillText(text, 0, 0);
  // 上半分のハイライト
  c.save();
  c.beginPath();
  c.rect(-size * text.length, -size, size * text.length * 2, size * .52);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,.42)';
  c.fillText(text, 0, 0);
  c.restore();
  c.restore();
};

Art.label = function (c, text, x, y, size, color, opt) {
  opt = opt || {};
  c.save();
  c.font = (opt.weight || 700) + ' ' + size + 'px ' +
    (opt.face || '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif');
  c.textAlign = opt.align || 'center'; c.textBaseline = 'middle';
  if (opt.outline !== false) {
    c.lineJoin = 'round'; c.strokeStyle = opt.outlineColor || Art.PAL.ink;
    c.lineWidth = size * (opt.ow || .3);
    c.strokeText(text, x, y);
  }
  c.fillStyle = color;
  c.fillText(text, x, y);
  c.restore();
};

// ---------------------------------------------------------------- キャラクター
/* 参加者は記号ではなく生き物にする。目の大きさと口の形だけで感情が出る。
 * 30人を見分ける必要があるので、体の形は 10 種類のシルエットで分ける。 */
/* 体型も飾りも変える。遠目のシルエットだけで誰か分かることが条件。
 * 同じ丸に飾りを乗せ替えただけだと、離れた席からは全部同じに見える。 */
const SILHOUETTE = {
  circle:   { rx: 1.00, ry: 1.00, ears: 0 },   // 素朴。基準
  triangle: { rx: 1.02, ry: 1.00, ears: 1 },   // 長いとんがり耳
  square:   { rx: 1.14, ry: 0.84, ears: 2 },   // 横に広い。角ばった耳
  star:     { rx: 0.90, ry: 1.14, ears: 3 },   // 縦に細い。アホ毛
  heart:    { rx: 1.10, ry: 0.92, ears: 4 },   // たれ耳
  diamond:  { rx: 0.86, ry: 1.16, ears: 5 },   // 細身。一本角
  pentagon: { rx: 1.06, ry: 0.96, ears: 6 },   // 王冠
  hexagon:  { rx: 0.94, ry: 1.06, ears: 7 },   // 触角
  crown:    { rx: 1.16, ry: 0.86, ears: 8 },   // どっしり。三本角
  moon:     { rx: 0.92, ry: 1.08, ears: 9 }    // フード
};

/* o = {x, y, r, color, shape, seed, face, squash, bob, look, blink, flip} */
Art.chara = function (c, o) {
  const r = o.r, col = o.color, sil = SILHOUETTE[o.shape] || SILHOUETTE.circle;
  const seed = o.seed || 1;
  const sq = o.squash === undefined ? 1 : o.squash;
  const rx = r * sil.rx / Math.sqrt(sq), ry = r * sil.ry * sq;
  const dark = Art.shade(col, -0.3);

  c.save();
  c.translate(o.x, o.y + (o.bob || 0));
  if (o.rot) c.rotate(o.rot);

  // 接地影
  if (o.shadowY !== undefined) {
    c.save(); c.globalAlpha = .2; c.fillStyle = '#000';
    Art.wobblePath(c, 0, o.shadowY - o.y, rx * .8, rx * .22, seed + 3, .05);
    c.fill(); c.restore();
  }

  // 足。接地していないキャラは、どれだけ絵が良くても宙に浮いて見える。
  if (o.feet !== false) {
    const step = o.walk ? Math.sin(o.walk) : 0;
    const fy = ry * 0.92, fs = r * 0.26;
    [-1, 1].forEach(side => {
      const off = step * side * r * 0.3;
      c.save();
      Art.wobblePath(c, side * rx * 0.42 + off, fy - Math.abs(off) * 0.5,
        fs, fs * 0.62, seed + 60 + side, .07);
      Art.ink(c, dark, r * 0.11);
      c.restore();
    });
  }

  // 手。だらんと下げるだけでも生き物らしくなる。
  if (o.arms !== false) {
    const sw = o.walk ? Math.sin(o.walk + Math.PI) : Math.sin((o.seed || 0) + (o.armT || 0)) * .2;
    [-1, 1].forEach(side => {
      c.save();
      c.beginPath();
      c.moveTo(side * rx * 0.86, ry * 0.1);
      c.quadraticCurveTo(side * rx * 1.12, ry * (0.38 + sw * side * .18),
                         side * rx * 1.02, ry * (0.62 + sw * side * .22));
      c.lineWidth = r * 0.26; c.strokeStyle = Art.PAL.ink;
      c.lineCap = 'round'; c.stroke();
      c.lineWidth = r * 0.15; c.strokeStyle = col; c.stroke();
      c.restore();
    });
  }

  // 頭の飾り。ここが個体差の主役。
  drawEars(c, sil.ears, rx, ry, col, dark, seed);

  // 体
  Art.wobblePath(c, 0, 0, rx, ry, seed, .028);
  Art.ink(c, col, r * .16);

  // 下半分の影
  c.save();
  Art.wobblePath(c, 0, 0, rx, ry, seed, .028); c.clip();
  c.globalAlpha = .3; c.fillStyle = dark;
  c.fillRect(-rx, ry * .18, rx * 2, ry);
  c.globalAlpha = 1;
  // 光沢
  c.fillStyle = 'rgba(255,255,255,.5)';
  Art.wobblePath(c, -rx * .36, -ry * .44, rx * .3, ry * .19, seed + 9, .08);
  c.fill();
  c.restore();

  // ほっぺ
  c.globalAlpha = .55; c.fillStyle = Art.PAL.pink;
  Art.wobblePath(c, -rx * .58, ry * .22, rx * .17, ry * .11, seed + 11, .12); c.fill();
  Art.wobblePath(c, rx * .58, ry * .22, rx * .17, ry * .11, seed + 12, .12); c.fill();
  c.globalAlpha = 1;

  drawFace(c, o, rx, ry, r, seed);
  c.restore();
};

function drawEars(c, kind, rx, ry, col, dark, seed) {
  c.save();
  const lw = rx * .16;
  const put = (fn) => { fn(); };
  switch (kind) {
    case 1: // とんがり耳
      [-1, 1].forEach(s => { c.beginPath();
        c.moveTo(s * rx * .5, -ry * .74); c.lineTo(s * rx * .95, -ry * 1.72);
        c.lineTo(s * rx * .12, -ry * .98); c.closePath(); Art.ink(c, col, lw); });
      break;
    case 2: // 角ばった耳
      [-1, 1].forEach(s => { c.beginPath();
        c.rect(s * rx * .58 - rx * .2, -ry * 1.46, rx * .4, ry * .66);
        Art.ink(c, col, lw); });
      break;
    case 3: // アホ毛
      c.beginPath(); c.moveTo(0, -ry * .9);
      c.quadraticCurveTo(rx * .62, -ry * 1.9, -rx * .26, -ry * 2.05);
      c.lineWidth = lw * 1.1; c.strokeStyle = Art.PAL.ink; c.lineCap = 'round'; c.stroke();
      break;
    case 4: // たれ耳
      [-1, 1].forEach(s => {
        Art.wobblePath(c, s * rx * .82, -ry * .35, rx * .26, ry * .46, seed + 20 + s, .06);
        Art.ink(c, dark, lw * .9); });
      break;
    case 5: // 一本角
      c.beginPath(); c.moveTo(-rx * .16, -ry * .92); c.lineTo(0, -ry * 1.62);
      c.lineTo(rx * .16, -ry * .92); c.closePath(); Art.ink(c, Art.PAL.cream, lw); break;
    case 6: // 王冠
      c.beginPath();
      c.moveTo(-rx * .52, -ry * .88); c.lineTo(-rx * .52, -ry * 1.32);
      c.lineTo(-rx * .17, -ry * 1.06); c.lineTo(0, -ry * 1.46);
      c.lineTo(rx * .17, -ry * 1.06); c.lineTo(rx * .52, -ry * 1.32);
      c.lineTo(rx * .52, -ry * .88); c.closePath();
      Art.ink(c, Art.PAL.yellow, lw); break;
    case 7: // 触角
      [-1, 1].forEach(s => {
        c.beginPath(); c.moveTo(s * rx * .2, -ry * .9);
        c.quadraticCurveTo(s * rx * .7, -ry * 1.5, s * rx * .52, -ry * 1.68);
        c.lineWidth = lw * .8; c.strokeStyle = Art.PAL.ink; c.lineCap = 'round'; c.stroke();
        Art.wobblePath(c, s * rx * .52, -ry * 1.72, rx * .13, rx * .13, seed + 30 + s, .1);
        Art.ink(c, col, lw * .7); });
      break;
    case 8: // 三本角
      [-1, 0, 1].forEach(s => { c.beginPath();
        c.moveTo(s * rx * .42 - rx * .13, -ry * .9);
        c.lineTo(s * rx * .42, -ry * (s === 0 ? 1.55 : 1.3));
        c.lineTo(s * rx * .42 + rx * .13, -ry * .9); c.closePath();
        Art.ink(c, dark, lw * .85); });
      break;
    case 9: // フード
      c.beginPath();
      c.arc(0, -ry * .1, rx * 1.06, Math.PI * 1.08, Math.PI * 1.92);
      c.lineTo(rx * .5, -ry * .55); c.lineTo(-rx * .5, -ry * .55); c.closePath();
      Art.ink(c, dark, lw); break;
  }
  c.restore();
}

function drawFace(c, o, rx, ry, r, seed) {
  const ex = rx * .34, ey = -ry * .12, er = r * .21;
  const lx = clamp(o.look ? o.look[0] : 0, -1, 1) * er * .38;
  const ly = clamp(o.look ? o.look[1] : 0, -1, 1) * er * .38;
  const face = o.face || 'smile';

  if (o.blink) {
    c.lineWidth = r * .075; c.strokeStyle = Art.PAL.ink; c.lineCap = 'round';
    [-1, 1].forEach(s => { c.beginPath();
      c.moveTo(s * ex - er * .6, ey); c.lineTo(s * ex + er * .6, ey); c.stroke(); });
  } else {
    [-1, 1].forEach(s => {
      Art.wobblePath(c, s * ex, ey, er, er * 1.06, seed + 40 + s, .05);
      c.fillStyle = Art.PAL.cream; c.fill();
      c.lineWidth = r * .06; c.strokeStyle = Art.PAL.ink; c.stroke();
      // 瞳
      const pr = er * (face === 'shock' ? .38 : .55);
      c.beginPath(); c.arc(s * ex + lx, ey + ly, pr, 0, TAU);
      c.fillStyle = Art.PAL.ink; c.fill();
      c.beginPath(); c.arc(s * ex + lx - pr * .35, ey + ly - pr * .4, pr * .34, 0, TAU);
      c.fillStyle = '#fff'; c.fill();
    });
  }

  // 眉。これがあるだけで表情が一段はっきりする。
  c.lineWidth = r * .09; c.strokeStyle = Art.PAL.ink; c.lineCap = 'round';
  const brow = { smile: 0, flat: 0, sad: -1, shock: -1, joy: .5, mad: 1 }[face] || 0;
  if (brow !== 0) {
    [-1, 1].forEach(s => { c.beginPath();
      c.moveTo(s * ex - er * .7, ey - er * 1.35 + (brow > 0 ? -s * 0 : 0));
      c.lineTo(s * ex + er * .7, ey - er * 1.35 + brow * er * .45 * (brow > 0 ? 1 : -1) * s * s);
      c.stroke(); });
  }

  // 口
  c.lineWidth = r * .1; c.lineCap = 'round';
  c.beginPath();
  const my = ry * .3;
  if (face === 'smile') c.arc(0, my - r * .06, r * .21, .22, Math.PI - .22);
  else if (face === 'joy') {
    Art.wobblePath(c, 0, my, r * .24, r * .2, seed + 50, .08);
    c.fillStyle = '#7a2438'; c.fill();
    c.lineWidth = r * .07; c.strokeStyle = Art.PAL.ink; c.stroke();
    c.beginPath();
  } else if (face === 'flat') { c.moveTo(-r * .16, my); c.lineTo(r * .16, my); }
  else if (face === 'sad') c.arc(0, my + r * .18, r * .2, Math.PI + .25, -.25);
  else if (face === 'shock') {
    Art.wobblePath(c, 0, my, r * .13, r * .18, seed + 51, .1);
    c.fillStyle = '#7a2438'; c.fill();
    c.lineWidth = r * .07; c.strokeStyle = Art.PAL.ink; c.stroke();
    c.beginPath();
  } else if (face === 'mad') { c.moveTo(-r * .18, my + r * .06); c.lineTo(r * .18, my - r * .04); }
  c.strokeStyle = Art.PAL.ink; c.stroke();
}

// ---------------------------------------------------------------- 粒子
Art.FX = function () {
  this.list = [];
};
Art.FX.prototype.burst = function (x, y, o) {
  o = o || {};
  const n = o.n || 18;
  for (let i = 0; i < n; i++) {
    const a = (o.dir === undefined ? Math.random() * TAU
      : o.dir + (Math.random() - .5) * (o.spread || TAU));
    const sp = (o.speed || 300) * (.45 + Math.random() * .75);
    this.list.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.lift || 0),
      life: o.life || .8, t: 0, size: (o.size || 9) * (.6 + Math.random() * .8),
      color: (o.color || [Art.PAL.yellow])[(Math.random() * (o.color || [1]).length) | 0],
      spin: (Math.random() - .5) * 14, rot: Math.random() * TAU,
      kind: o.kind || 'confetti', grav: o.grav === undefined ? 950 : o.grav
    });
  }
};
Art.FX.prototype.ring = function (x, y, o) {
  o = o || {};
  this.list.push({ x, y, ring: true, t: 0, life: o.life || .45,
    r0: o.r0 || 10, r1: o.r1 || 130, color: o.color || '#fff', lw: o.lw || 8 });
};
Art.FX.prototype.update = function (dt) {
  for (let i = this.list.length - 1; i >= 0; i--) {
    const p = this.list[i];
    p.t += dt;
    if (p.t >= p.life) { this.list.splice(i, 1); continue; }
    if (p.ring) continue;
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 1.4 * dt;
    p.rot += p.spin * dt;
  }
};
Art.FX.prototype.draw = function (c) {
  for (const p of this.list) {
    const k = p.t / p.life;
    c.save();
    if (p.ring) {
      c.globalAlpha = (1 - k) * .9;
      c.strokeStyle = p.color; c.lineWidth = p.lw * (1 - k * .7);
      c.beginPath();
      c.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * Art.ease.outCubic(k), 0, TAU);
      c.stroke();
      c.restore(); continue;
    }
    c.globalAlpha = clamp((1 - k) * 2.2, 0, 1);
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
      // 紙吹雪。厚みが出るよう縦に潰して回す
      const s = Math.abs(Math.cos(p.rot * 1.7));
      c.fillRect(-p.size * .5, -p.size * .34 * s - p.size * .1, p.size, p.size * .68 * s + p.size * .2);
    }
    c.restore();
  }
};

// ---------------------------------------------------------------- 舞台
/* 平らな単色ではなく、奥行きのある会場にする。
 * 放射の光・床・浮遊する粒・角の暗がり。 */
Art.stage = function (c, W, H, t, opt) {
  opt = opt || {};
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, opt.top || Art.PAL.stageA);
  g.addColorStop(1, opt.bottom || Art.PAL.stageB);
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // 回るスポットライト
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(W / 2, H * .1);
  for (let i = 0; i < 7; i++) {
    const a = t * .09 + i / 7 * TAU;
    c.save(); c.rotate(a);
    const lg = c.createLinearGradient(0, 0, 0, H * 1.3);
    lg.addColorStop(0, 'rgba(255,220,255,0.10)');
    lg.addColorStop(1, 'rgba(255,220,255,0)');
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(0, 0);
    c.lineTo(-W * .13, H * 1.3); c.lineTo(W * .13, H * 1.3);
    c.closePath(); c.fill();
    c.restore();
  }
  c.restore();

  // 浮遊する粒
  c.save(); c.globalAlpha = .5;
  for (let i = 0; i < 26; i++) {
    const sx = ((hash(i * 17) * .5 + .5) * W + t * (8 + i % 5 * 4)) % (W + 80) - 40;
    const sy = ((hash(i * 29) * .5 + .5) * H + Math.sin(t * .5 + i) * 18) % H;
    const r = 1.5 + (hash(i * 7) * .5 + .5) * 3.5;
    c.fillStyle = i % 3 === 0 ? Art.PAL.yellow : i % 3 === 1 ? Art.PAL.pink : '#fff';
    c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill();
  }
  c.restore();

  // 四隅を落として中央に目を集める
  const v = c.createRadialGradient(W / 2, H * .48, H * .3, W / 2, H * .48, H * .95);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
};

/* 会場の飾り。上部の空洞を埋めると同時に「催し物の場」であることを伝える。
 * 三角旗のガーランドは、風でわずかに揺れる。等間隔にしない。 */
Art.garland = function (c, W, t, y, seed) {
  seed = seed || 3;
  const n = 13, sag = 46;
  const cols = [Art.PAL.red, Art.PAL.yellow, Art.PAL.blue, Art.PAL.green, Art.PAL.pink];
  const py = i => y + Math.sin(i / n * Math.PI) * sag + Math.sin(t * 1.1 + i * .7) * 4;
  c.save();
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = i / n * W;
    if (i === 0) c.moveTo(x, py(i)); else c.lineTo(x, py(i));
  }
  c.strokeStyle = 'rgba(255,246,227,.55)'; c.lineWidth = 3; c.stroke();
  for (let i = 0; i < n; i++) {
    const x0 = i / n * W, x1 = (i + 1) / n * W;
    const mx = (x0 + x1) / 2, my = (py(i) + py(i + 1)) / 2;
    // 一枚ごとにわずかに長さと傾きを変える。揃えると途端に機械的になる。
    const len = 30 + hash(seed + i * 13) * 9;
    const tilt = hash(seed + i * 29) * .16 + Math.sin(t * 1.4 + i) * .05;
    c.save(); c.translate(mx, my); c.rotate(tilt);
    c.beginPath();
    c.moveTo(-(x1 - x0) * .34, 0); c.lineTo((x1 - x0) * .34, 0); c.lineTo(0, len);
    c.closePath();
    c.fillStyle = cols[i % cols.length]; c.fill();
    c.strokeStyle = 'rgba(36,26,46,.5)'; c.lineWidth = 2; c.stroke();
    c.restore();
  }
  c.restore();
};

/* 背後のスピーカーと照明。舞台の奥行きを作る。 */
Art.backdrop = function (c, W, H, y, t) {
  c.save();
  // 奥の壁
  const g = c.createLinearGradient(0, y - 190, 0, y);
  g.addColorStop(0, 'rgba(20,8,38,0)');
  g.addColorStop(1, 'rgba(20,8,38,.55)');
  c.fillStyle = g; c.fillRect(0, y - 190, W, 190);

  // 左右のスピーカー
  [0, 1].forEach(sd => {
    const x = sd ? W - 96 : 30, w = 66, h = 132;
    Art.slab(c, x, y - h, w, h, '#3A2350', { depth: 7, r: 9, seed: 200 + sd, gloss: false });
    [0.3, 0.62].forEach((k, i) => {
      const cy2 = y - h + h * k, r = i ? 17 : 22;
      c.beginPath(); c.arc(x + w / 2, cy2, r, 0, TAU);
      c.fillStyle = '#20132F'; c.fill();
      c.strokeStyle = '#5A3E78'; c.lineWidth = 3; c.stroke();
      // 音に合わせて震えるコーン
      c.beginPath();
      c.arc(x + w / 2, cy2, r * (.45 + Math.abs(Math.sin(t * 6 + i)) * .12), 0, TAU);
      c.fillStyle = '#38234F'; c.fill();
    });
  });
  c.restore();
};

/* 床。奥行きの線を引いて、舞台の上に立っているように見せる。 */
Art.floor = function (c, W, H, y, color) {
  const g = c.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, Art.shade(color, .1));
  g.addColorStop(1, Art.shade(color, -.35));
  c.fillStyle = g; c.fillRect(0, y, W, H - y);
  // 奥行きの板目。等間隔にせず、板ごとに明るさを変える。
  c.save();
  for (let i = -7; i <= 7; i++) {
    const j = i + 7;
    c.globalAlpha = .07 + (hash(j * 19) * .5 + .5) * .07;
    c.fillStyle = j % 2 ? '#fff' : '#000';
    c.beginPath();
    c.moveTo(W / 2 + i * W * .052, y);
    c.lineTo(W / 2 + (i + 1) * W * .052, y);
    c.lineTo(W / 2 + (i + 1) * W * .33, H);
    c.lineTo(W / 2 + i * W * .33, H);
    c.closePath(); c.fill();
  }
  c.globalAlpha = .2; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  for (let i = -7; i <= 7; i++) {
    c.beginPath(); c.moveTo(W / 2 + i * W * .052, y);
    c.lineTo(W / 2 + i * W * .33, H); c.stroke();
  }
  // 横木。手前ほど間隔を広く（遠近）
  c.globalAlpha = .13;
  let yy = y + 6;
  for (let k = 0; yy < H; k++) { 
    c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke();
    yy += 16 + k * 13;
  }
  c.restore();
  c.beginPath(); c.moveTo(0, y); c.lineTo(W, y);
  c.strokeStyle = Art.PAL.ink; c.lineWidth = 5; c.stroke();
};

window.Art = Art;
