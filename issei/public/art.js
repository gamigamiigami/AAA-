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
Art.bounceColor = Art.PAL.wood;
Art.vinyl = function (c, path, o) {
  const col = o.color, x = o.x, y = o.y, rx = o.rx, ry = o.ry;
  c.save();
  path();
  const g = c.createLinearGradient(x - rx * .45, y - ry, x + rx * .35, y + ry);
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
    c.beginPath();
    c.ellipse(x, y - ry * .06, rx * .97, ry * .97, 0, 0, TAU);
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
  const ox = x + rx * Art.LIGHT.sx * .5, oy = y + rx * Art.LIGHT.sy * .18;
  c.save();
  const g = c.createRadialGradient(ox, oy, 0, ox, oy, rx * k);
  g.addColorStop(0, 'rgba(8,3,22,' + st + ')');
  g.addColorStop(.5, 'rgba(8,3,22,' + st * .5 + ')');
  g.addColorStop(1, 'rgba(8,3,22,0)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(ox, oy, rx * k, rx * k * .3, 0, 0, TAU); c.fill();
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

  // 走ってきた勢いを示す尾。装飾ではなく「一斉＝同時」の説明。
  c.globalAlpha = .5;
  for (let i = 0; i < 3; i++) {
    Art.roundRect(c, -w * (1.12 + i * .12), barY + barH * (.2 + i * .2),
      w * .2, barH * .2, barH * .1);
    c.fillStyle = gold; c.fill();
  }
  c.globalAlpha = 1;

  Art.title(c, '斉', w * .34, 0, size, { fill: gold, extrude: size * .1 });
  c.restore();
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
/* 数値専用。等幅（タビュラー）にしないと桁が揃わず、比較画面として読めない。 */
Art.num = function (c, text, x, y, size, color, opt) {
  opt = opt || {};
  c.save();
  c.font = '600 ' + size + 'px "Roboto Mono", ui-monospace, monospace';
  c.textAlign = opt.align || 'center'; c.textBaseline = 'middle';
  if (opt.outline !== false) {
    c.lineJoin = 'round'; c.strokeStyle = opt.outlineColor || Art.PAL.ink;
    c.lineWidth = size * (opt.ow || .3); c.strokeText(text, x, y);
  }
  c.fillStyle = color; c.fillText(text, x, y);
  c.restore();
};

Art.measure = function (c, text, size, opt) {
  opt = opt || {};
  c.save();
  c.font = (opt.weight || 700) + ' ' + size + 'px ' +
    (opt.face || '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif');
  const w = c.measureText(text).width;
  c.restore(); return w;
};

// ---------------------------------------------------------------- キャラクター
/* 一座の6人。全員が体型・頭部・顔つきの三重で分かれる。
 * 遠目20pxのシルエットだけで判別できることが条件。色は補助でしかない。 */
const CAST = {
  circle:   { rx: 1.00, ry: 1.00, crest: 'scarf',   eye: 'round',  brow: false },
  triangle: { rx: 1.00, ry: 1.02, crest: 'ears',    eye: 'droop',  brow: true  },
  square:   { rx: 1.18, ry: .82,  crest: 'brow',    eye: 'narrow', brow: true  },
  star:     { rx: .86,  ry: 1.18, crest: 'tuft',    eye: 'sparkle',brow: false },
  heart:    { rx: 1.12, ry: .90,  crest: 'floppy',  eye: 'round',  brow: false },
  diamond:  { rx: .82,  ry: 1.20, crest: 'horn',    eye: 'sharp',  brow: true  },
  pentagon: { rx: 1.06, ry: .96,  crest: 'crown',   eye: 'round',  brow: true  },
  hexagon:  { rx: .94,  ry: 1.06, crest: 'antenna', eye: 'sparkle',brow: false },
  crown:    { rx: 1.20, ry: .84,  crest: 'trio',    eye: 'narrow', brow: true  },
  moon:     { rx: .90,  ry: 1.10, crest: 'hood',    eye: 'droop',  brow: false }
};
Art.CAST = CAST;

Art.chara = function (c, o) {
  const cast = CAST[o.shape] || CAST.circle;
  const r = o.r, col = o.color;
  const sq = o.squash === undefined ? 1 : o.squash;
  const rx = r * cast.rx / Math.sqrt(sq), ry = r * cast.ry * sq;
  const line = Art.outlineOf(col);
  const lw = Math.max(1.7, r * .12);

  if (o.shadowY !== undefined) Art.contact(c, o.x, o.shadowY, rx * .95, o.shadowK);

  c.save();
  c.translate(o.x, o.y + (o.bob || 0));
  if (o.rot) c.rotate(o.rot);
  if (o.lean) c.transform(1, 0, o.lean, 1, 0, 0);

  // 重なったとき分離させる縁。人が密集する画面では必須。
  if (o.sticker) {
    c.save();
    Art.eggPath(c, 0, 0, rx * 1.13, ry * 1.11, .13);
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

  if (o.arms !== false) {
    const sw = o.armUp ? -1.5
      : (o.walk ? Math.sin(o.walk + Math.PI) : Math.sin((o.armT || 0) + (o.seed || 0)) * .35);
    [-1, 1].forEach(sd => {
      const draw = () => { c.beginPath();
        c.moveTo(sd * rx * .8, ry * .02);
        c.quadraticCurveTo(sd * rx * 1.18, ry * (.32 + sw * sd * .22),
                           sd * rx * (o.armUp ? .86 : 1.04), ry * (.58 + sw * sd * .3)); };
      draw(); Art.stroke(c, line, r * .23);
      draw(); Art.stroke(c, Art.shade(col, -.06), r * .12);
    });
  }

  crest(c, cast.crest, rx, ry, r, col, line, lw, o);

  Art.vinyl(c, () => Art.eggPath(c, 0, 0, rx, ry, .14), { x: 0, y: 0, rx, ry, color: col, lw });

  // ほっぺ。体色によって見え方が変わるので、明るい色ほど濃く入れる。
  c.save();
  Art.eggPath(c, 0, 0, rx, ry, .14); c.clip();
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
    case 'tuft': { c.save(); c.rotate(sway * 2);
      const p = () => { c.beginPath();
        c.moveTo(-rx * .12, -ry * .94);
        c.quadraticCurveTo(rx * .72, -ry * 1.5, rx * .04, -ry * 2.02); };
      p(); Art.stroke(c, line, r * .2);
      p(); Art.stroke(c, Art.shade(col, .2), r * .1);
      c.restore(); break; }
    case 'floppy':
      [-1, 1].forEach(sd => { c.save(); c.rotate(sway * sd * 1.6);
        Art.vinyl(c, () => { c.beginPath();
          c.ellipse(sd * rx * .86, -ry * .26, rx * .25, ry * .52, sd * .32, 0, TAU); },
          { x: sd * rx * .86, y: -ry * .26, rx: rx * .25, ry: ry * .52,
            color: dark, lw: lw * .85, spec: false, bounce: 0 });
        c.restore(); }); break;
    case 'horn':
      Art.vinyl(c, () => { c.beginPath();
        c.moveTo(-rx * .18, -ry * .96);
        c.quadraticCurveTo(-rx * .04, -ry * 1.78, rx * .12, -ry * 1.86);
        c.quadraticCurveTo(rx * .2, -ry * 1.34, rx * .2, -ry * .94);
        c.closePath(); },
        { x: 0, y: -ry * 1.34, rx: rx * .2, ry: ry * .46,
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
Art.stage = function (c, W, H, t) {
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

  // 舞台照明。光源は上、消失点も上に揃える。
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * .3 + Math.sin(t * .35 + i * 1.9) * .08;
    c.save(); c.translate(W * (.18 + i * .21), -34); c.rotate(a);
    const lg = c.createLinearGradient(0, 0, 0, H * 1.2);
    lg.addColorStop(0, i % 2 ? 'rgba(255,214,150,.12)' : 'rgba(190,200,255,.09)');
    lg.addColorStop(1, 'rgba(255,214,150,0)');
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(-14, 0);
    c.lineTo(-W * .16, H * 1.2); c.lineTo(W * .16, H * 1.2); c.lineTo(14, 0);
    c.closePath(); c.fill(); c.restore();
  }
  c.restore();

  const v = c.createRadialGradient(W / 2, H * .46, H * .3, W / 2, H * .46, H);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(4,0,14,.55)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
};

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

/* 舞台の奥。トラスと吊り照明。スピーカーより舞台らしさに効く。 */
Art.backdrop = function (c, W, H, y, t) {
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
  // 吊り照明
  for (let i = 0; i < 5; i++) {
    const x = W * (.14 + i * .18);
    c.beginPath(); c.moveTo(x, ty + 14); c.lineTo(x, ty + 30);
    Art.stroke(c, '#2A2140', 4);
    Art.roundRect(c, x - 13, ty + 28, 26, 20, 5);
    c.fillStyle = '#2E2444'; c.fill(); Art.stroke(c, '#1C1530', 2);
    const on = .5 + Math.abs(Math.sin(t * 1.1 + i * 1.4)) * .5;
    c.save(); c.globalCompositeOperation = 'lighter';
    const gg = c.createRadialGradient(x, ty + 50, 0, x, ty + 50, 30);
    gg.addColorStop(0, 'rgba(255,220,160,' + (.3 * on) + ')');
    gg.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(x, ty + 50, 30, 0, TAU); c.fill();
    c.restore();
    c.beginPath(); c.arc(x, ty + 48, 6, 0, TAU);
    c.fillStyle = 'rgba(255,225,170,' + (.5 + on * .5) + ')'; c.fill();
  }
  c.restore();
};

window.Art = Art;
