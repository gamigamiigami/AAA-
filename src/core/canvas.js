/* MICRO MANIA — core/canvas.js
 * 描画ヘルパ G。Canvas2D の上に「厚みのあるスタイライズ2D」を作るための語彙を定義する。
 * 太いアウトライン + 内側ハイライト + 落ち影 をワンコールで出せることを目標にしている。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  var FONT_STACK = '"Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic",' +
    '"Noto Sans JP",IPAPGothic,IPAGothic,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

  function G(ctx) {
    this.c = ctx;
    this.W = GG.VIEW_W;
    this.H = GG.VIEW_H;
  }
  var P = G.prototype;

  // --- 状態 -----------------------------------------------------------
  P.save = function () { this.c.save(); return this; };
  P.restore = function () { this.c.restore(); return this; };
  P.translate = function (x, y) { this.c.translate(x, y); return this; };
  P.rotate = function (a) { this.c.rotate(a); return this; };
  P.scale = function (x, y) { this.c.scale(x, y === undefined ? x : y); return this; };
  P.alpha = function (a) { this.c.globalAlpha = a; return this; };
  P.clip = function () { this.c.clip(); return this; };
  P.comp = function (m) { this.c.globalCompositeOperation = m; return this; };

  /** cb を save/restore で包む */
  P.at = function (x, y, cb, rot, sx, sy) {
    var c = this.c;
    c.save(); c.translate(x, y);
    if (rot) c.rotate(rot);
    if (sx !== undefined) c.scale(sx, sy === undefined ? sx : sy);
    cb(this);
    c.restore();
    return this;
  };

  // --- パス -----------------------------------------------------------
  P.rr = function (x, y, w, h, r) {
    var c = this.c;
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.min(r === undefined ? 8 : r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    return this;
  };
  P.circlePath = function (x, y, r) {
    this.c.beginPath(); this.c.arc(x, y, Math.max(0, r), 0, U.TAU); return this;
  };
  P.ellipsePath = function (x, y, rx, ry, rot) {
    this.c.beginPath(); this.c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, U.TAU);
    return this;
  };
  P.polyPath = function (pts) {
    var c = this.c;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    return this;
  };
  P.starPath = function (x, y, rOut, rIn, points, rot) {
    var c = this.c, n = points || 5, a0 = (rot || 0) - Math.PI / 2;
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = a0 + i * Math.PI / n, r = (i % 2 === 0) ? rOut : rIn;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    return this;
  };
  P.heartPath = function (x, y, s) {
    var c = this.c;
    c.beginPath();
    c.moveTo(x, y + s * 0.75);
    c.bezierCurveTo(x - s * 1.45, y - s * 0.2, x - s * 0.55, y - s * 1.15, x, y - s * 0.35);
    c.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 1.45, y - s * 0.2, x, y + s * 0.75);
    c.closePath();
    return this;
  };

  // --- 塗り -----------------------------------------------------------
  P.fill = function (style) { this.c.fillStyle = style; this.c.fill(); return this; };
  P.stroke = function (style, w) {
    this.c.strokeStyle = style; this.c.lineWidth = w === undefined ? 4 : w;
    this.c.lineJoin = 'round'; this.c.lineCap = 'round';
    this.c.stroke(); return this;
  };
  /** アウトライン付きで塗る。ink 省略時は fill を暗くした色 */
  P.ink = function (fillStyle, lw, inkColor) {
    if (lw !== 0) {
      this.c.strokeStyle = inkColor || 'rgba(28,22,44,0.92)';
      this.c.lineWidth = (lw || 5) * 2;
      this.c.lineJoin = 'round'; this.c.lineCap = 'round';
      this.c.stroke();
    }
    this.c.fillStyle = fillStyle; this.c.fill();
    return this;
  };

  P.grad = function (x0, y0, x1, y1, stops) {
    var g = this.c.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  };
  P.rgrad = function (x, y, r0, r1, stops) {
    var g = this.c.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(0.01, r1));
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  };

  P.clear = function (style) {
    this.c.fillStyle = style || '#000';
    this.c.fillRect(0, 0, this.W, this.H);
    return this;
  };
  P.rect = function (x, y, w, h, style) {
    this.c.fillStyle = style; this.c.fillRect(x, y, w, h); return this;
  };

  // --- 高レベルプリミティブ -------------------------------------------
  /** 落ち影付きの角丸ブロック（プラットフォーム・箱・パネル） */
  P.block = function (x, y, w, h, color, opt) {
    opt = opt || {};
    var r = opt.r === undefined ? Math.min(w, h) * 0.22 : opt.r;
    var c = this.c;
    if (opt.shadow !== false) {
      c.save();
      c.globalAlpha = (c.globalAlpha) * 0.22;
      this.rr(x + (opt.sx || 5), y + (opt.sy || 7), w, h, r).fill('#120c22');
      c.restore();
    }
    this.rr(x, y, w, h, r).ink(color, opt.lw === undefined ? 4 : opt.lw, opt.ink);
    if (opt.gloss !== false) {
      c.save();
      this.rr(x, y, w, h, r); c.clip();
      this.rr(x + w * 0.08, y + h * 0.09, w * 0.84, h * 0.3, r * 0.7)
        .fill('rgba(255,255,255,' + (opt.gloss || 0.22) + ')');
      c.restore();
    }
    return this;
  };

  /** キャラや玉に使う球体。ハイライトとリムライト入り */
  P.orb = function (x, y, r, color, opt) {
    opt = opt || {};
    var c = this.c;
    if (opt.shadow !== false) {
      c.save(); c.globalAlpha = c.globalAlpha * 0.2;
      this.ellipsePath(x + 3, y + r * 0.95, r * 0.85, r * 0.28).fill('#120c22');
      c.restore();
    }
    this.circlePath(x, y, r).ink(color, opt.lw === undefined ? 4 : opt.lw, opt.ink);
    c.save();
    this.circlePath(x, y, r); c.clip();
    this.ellipsePath(x - r * 0.3, y - r * 0.38, r * 0.42, r * 0.3, -0.5)
      .fill('rgba(255,255,255,0.55)');
    this.circlePath(x + r * 0.18, y + r * 0.2, r * 0.95)
      .fill(this.rgrad(x + r * 0.2, y + r * 0.25, r * 0.4, r * 1.1,
        [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.28)']]));
    c.restore();
    return this;
  };

  /** 地面に落ちる楕円影 */
  P.dropShadow = function (x, y, rx, ry, a) {
    var c = this.c;
    c.save(); c.globalAlpha = c.globalAlpha * (a === undefined ? 0.25 : a);
    this.ellipsePath(x, y, rx, ry).fill('#120c22');
    c.restore();
    return this;
  };

  /** かわいい目（白目 + 瞳 + ハイライト）。look は視線ベクトル */
  P.eyes = function (x, y, gap, r, lookX, lookY, blink) {
    var c = this.c;
    lookX = lookX || 0; lookY = lookY || 0;
    for (var i = -1; i <= 1; i += 2) {
      var ex = x + i * gap;
      if (blink) {
        c.beginPath();
        c.moveTo(ex - r, y); c.quadraticCurveTo(ex, y + r * 0.5, ex + r, y);
        c.strokeStyle = '#221a33'; c.lineWidth = r * 0.45; c.lineCap = 'round';
        c.stroke();
        continue;
      }
      this.ellipsePath(ex, y, r, r * 1.12).fill('#fff');
      this.ellipsePath(ex, y, r, r * 1.12).stroke('rgba(28,22,44,0.85)', 2.5);
      this.circlePath(ex + lookX * r * 0.35, y + lookY * r * 0.4, r * 0.55).fill('#221a33');
      this.circlePath(ex + lookX * r * 0.35 - r * 0.18, y + lookY * r * 0.4 - r * 0.22, r * 0.2)
        .fill('#fff');
    }
    return this;
  };

  // --- テキスト -------------------------------------------------------
  P.font = function (size, weight) {
    this.c.font = (weight || 900) + ' ' + size + 'px ' + FONT_STACK;
    return this;
  };
  /**
   * o = { size, weight, align, baseline, fill, stroke, lw, shadow, shadowY, letter }
   * 太アウトライン + 下方向の落ち影付き。ゲームUIの基本文字。
   */
  P.text = function (str, x, y, o) {
    o = o || {};
    var c = this.c;
    c.save();
    this.font(o.size || 32, o.weight || 900);
    c.textAlign = o.align || 'center';
    c.textBaseline = o.baseline || 'middle';
    c.lineJoin = 'round'; c.miterLimit = 2;
    if (o.shadow !== false) {
      c.globalAlpha = c.globalAlpha * (o.shadowA || 0.3);
      c.fillStyle = o.shadowC || '#150f26';
      c.fillText(str, x + (o.shadowX || 0), y + (o.shadowY === undefined ? 5 : o.shadowY));
      c.restore(); c.save();
      this.font(o.size || 32, o.weight || 900);
      c.textAlign = o.align || 'center';
      c.textBaseline = o.baseline || 'middle';
      c.lineJoin = 'round'; c.miterLimit = 2;
    }
    if (o.stroke !== false) {
      c.strokeStyle = o.stroke || 'rgba(28,22,44,0.95)';
      c.lineWidth = o.lw === undefined ? Math.max(4, (o.size || 32) * 0.16) : o.lw;
      c.strokeText(str, x, y);
    }
    c.fillStyle = o.fill || '#ffffff';
    c.fillText(str, x, y);
    c.restore();
    return this;
  };

  P.measure = function (str, size, weight) {
    this.c.save(); this.font(size, weight);
    var w = this.c.measureText(str).width;
    this.c.restore();
    return w;
  };

  /** 文字を1字ずつ配置してコールバックで演出できるようにする（命令語のポップ用） */
  P.textEach = function (str, x, y, o, perChar) {
    o = o || {};
    var size = o.size || 32, i, chars = Array.from(str);
    this.c.save(); this.font(size, o.weight || 900);
    var widths = chars.map(function (ch) { return this.c.measureText(ch).width; }, this);
    this.c.restore();
    var track = o.letter || 0;
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + track * (chars.length - 1);
    var cx = x - total / 2;
    for (i = 0; i < chars.length; i++) {
      var cw = widths[i];
      var st = perChar ? perChar(i, chars.length) : null;
      this.c.save();
      this.c.translate(cx + cw / 2, y);
      if (st) {
        if (st.dx || st.dy) this.c.translate(st.dx || 0, st.dy || 0);
        if (st.rot) this.c.rotate(st.rot);
        if (st.scale !== undefined) this.c.scale(st.scale, st.scale);
        if (st.alpha !== undefined) this.c.globalAlpha = this.c.globalAlpha * st.alpha;
      }
      this.text(chars[i], 0, 0, o);
      this.c.restore();
      cx += cw + track;
    }
    return this;
  };

  G.FONT = FONT_STACK;
  GG.G = G;
})(window.GG = window.GG || {});
