/* MICRO MANIA — core/actors.js
 * 全ミニゲームで共有する「描けるモノ」のライブラリ。
 * ここに集約することで、ゲームが変わっても世界観（キャラの顔・地面・道具）が一貫する。
 * 画像ファイルは使わず、全て Canvas プリミティブで組む。 */
(function (GG) {
  'use strict';
  var U = GG.U;
  var A = {};

  /**
   * マスコット。o = {x,y,r,color,squash,lookX,lookY,blink,mouth,rot,shadowY}
   * squash: 1 で通常、>1 で縦伸び、<1 で潰れ
   */
  A.blob = function (g, o) {
    var c = g.c;
    var r = o.r, col = o.color || '#ffd93d';
    var sq = o.squash === undefined ? 1 : o.squash;
    var rx = r / Math.sqrt(sq), ry = r * sq;

    if (o.shadowY !== undefined) {
      g.dropShadow(o.x, o.shadowY, r * 0.85, r * 0.24,
        0.28 * U.clamp(1 - (o.shadowY - o.y) / (r * 8), 0.25, 1));
    }
    c.save();
    c.translate(o.x, o.y);
    if (o.rot) c.rotate(o.rot);

    // 足
    if (o.feet !== false) {
      var fy = ry * 0.86, fs = r * 0.3;
      g.ellipsePath(-rx * 0.46, fy, fs, fs * 0.66).ink(U.shade(col, -0.3), 3.4);
      g.ellipsePath(rx * 0.46, fy, fs, fs * 0.66).ink(U.shade(col, -0.3), 3.4);
    }
    // 体: ベタ + 影の面 + ハイライトの面（グラデは使わない）
    g.ellipsePath(0, 0, rx, ry).ink(col, 4.6);
    c.save();
    g.ellipsePath(0, 0, rx, ry); c.clip();
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, U.TAU);
    c.ellipse(-rx * 0.4, -ry * 0.4, rx * 1.02, ry * 1.02, 0, 0, U.TAU, true);
    c.fillStyle = U.shade(col, -0.24);
    c.fill('evenodd');
    g.ellipsePath(-rx * 0.38, -ry * 0.44, rx * 0.26, ry * 0.17, -0.6)
      .fill('rgba(255,255,255,0.85)');
    c.restore();

    // ほっぺ
    g.ellipsePath(-rx * 0.58, ry * 0.2, rx * 0.18, ry * 0.12).fill('rgba(232,17,45,0.3)');
    g.ellipsePath(rx * 0.58, ry * 0.2, rx * 0.18, ry * 0.12).fill('rgba(232,17,45,0.3)');

    // 顔
    g.eyes(0, -ry * 0.16, rx * 0.35, r * 0.17, o.lookX, o.lookY, o.blink);
    var m = o.mouth || 'smile';
    c.strokeStyle = GG.PAL.ink; c.lineWidth = r * 0.11; c.lineCap = 'round';
    c.beginPath();
    if (m === 'smile') {
      c.arc(0, ry * 0.12, r * 0.2, 0.25, Math.PI - 0.25);
    } else if (m === 'o') {
      g.ellipsePath(0, ry * 0.2, r * 0.14, r * 0.17).ink('#8c5460', 1.8);
      c.beginPath();
    } else if (m === 'flat') {
      c.moveTo(-r * 0.16, ry * 0.2); c.lineTo(r * 0.16, ry * 0.2);
    } else if (m === 'sad') {
      c.arc(0, ry * 0.32, r * 0.2, Math.PI + 0.25, -0.25);
    }
    c.stroke();
    c.restore();
    return A;
  };

  /** トゲ玉（危険物の統一表現） */
  A.spike = function (g, x, y, r, color, rot) {
    var c = g.c;
    color = color || GG.PAL.shu;
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    var n = 9;
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = i / (n * 2) * U.TAU, rr = (i % 2 === 0) ? r : r * 0.62;
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    g.ink(color, 4.4);
    g.circlePath(0, 0, r * 0.46).fill(GG.PAL.paper);
    g.circlePath(0, 0, r * 0.2).fill(color);
    c.restore();
    return A;
  };

  /** ごほうび系の星 */
  A.star = function (g, x, y, r, color, rot) {
    var c = g.c;
    color = color || GG.PAL.yamabuki;
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    g.starPath(0, 0, r, r * 0.46, 5, 0).ink(color, 4.4);
    g.starPath(0, 0, r * 0.52, r * 0.24, 5, 0).fill(U.shade(color, 0.5));
    c.restore();
    return A;
  };

  A.bomb = function (g, x, y, r, fuseT) {
    var c = g.c;
    c.save(); c.translate(x, y);
    g.circlePath(0, 0, r).ink('#3a3a42', 4.4);
    g.circlePath(-r * 0.3, -r * 0.32, r * 0.2).fill('rgba(255,255,255,0.4)');
    g.rr(-r * 0.2, -r * 1.18, r * 0.4, r * 0.3, 3).ink('#8b8496', 2.4);
    c.strokeStyle = '#ffb03a'; c.lineWidth = r * 0.13; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -r * 1.15);
    c.quadraticCurveTo(r * 0.5, -r * 1.5, r * 0.32, -r * 1.85);
    c.stroke();
    var fl = 0.7 + 0.3 * Math.sin((fuseT || 0) * 24);
    g.circlePath(r * 0.32, -r * 1.9, r * 0.2 * fl).fill('#ffd93d');
    g.circlePath(r * 0.32, -r * 1.9, r * 0.12 * fl).fill('#fff6c9');
    c.restore();
    return A;
  };

  /** 地面のプリセット。和の中間色でまとめ、暗く沈ませない。 */
  A.GROUND = {
    tsuchi: { top: '#e0a860', body: '#c07f38', deep: '#8f5a22' },  // 土
    kusa:   { top: '#5fd14a', body: '#22b14c', deep: '#158035' },  // 草
    mizu:   { top: '#5fd0f0', body: '#00a0e0', deep: '#0070b0' },  // 水
    ishi:   { top: '#c9ced6', body: '#9aa2ae', deep: '#6e7683' },  // 石
    ita:    { top: '#e0b070', body: '#c08840', deep: '#8f6020' },  // 板
    tatami: { top: '#dcd48a', body: '#bdb45c', deep: '#8f8836' }   // 畳
  };

  /** 地面。波打つ稜線 + 表土の帯 + 墨の細線 */
  A.ground = function (g, y, opt) {
    opt = opt || {};
    var c = g.c, W = GG.VIEW_W, H = GG.VIEW_H;
    var top = opt.top || '#7bed9f', body = opt.body || '#2f9e5f', deep = opt.deep || '#1c6b40';
    var amp = opt.wave === undefined ? 5 : opt.wave, per = 96, x;

    // ゆるやかな波打つ稜線
    function edge(off) {
      c.beginPath();
      c.moveTo(0, y + off + amp);
      for (x = 0; x <= W; x += 6) {
        c.lineTo(x, y + off + Math.sin(x / per * U.TAU) * amp);
      }
    }
    edge(0);
    c.lineTo(W, H); c.lineTo(0, H); c.closePath();
    c.fillStyle = body;      // グラデで暗く落とさず、平らな一色で置く
    c.fill();

    // 表土の帯
    c.save();
    edge(0);
    c.lineTo(W, y + 22); c.lineTo(0, y + 22); c.closePath();
    c.fillStyle = top; c.fill();
    c.restore();
    // 稜線のハイライト
    c.save();
    edge(0);
    c.strokeStyle = GG.PAL.ink; c.lineWidth = 5; c.lineCap = 'round';
    c.stroke();
    c.restore();
    // 表土と土の境界（墨の細線で締める）
    c.save();
    c.globalAlpha = 1;
    edge(22);
    c.strokeStyle = deep; c.lineWidth = 3;
    c.stroke();
    c.restore();

    return A;
  };

  /** 方向矢印（統一アイコン） */
  A.arrow = function (g, x, y, dir, size, color) {
    var c = g.c;
    var rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    c.save(); c.translate(x, y); c.rotate(rot);
    var s = size;
    g.polyPath([
      [-s * 0.75, -s * 0.3], [s * 0.05, -s * 0.3], [s * 0.05, -s * 0.62],
      [s * 0.82, 0], [s * 0.05, s * 0.62], [s * 0.05, s * 0.3], [-s * 0.75, s * 0.3]
    ]).ink(color || GG.PAL.yamabuki, 4.4);
    c.restore();
    return A;
  };

  /** 進捗バー（共通ゲージ） */
  A.gauge = function (g, x, y, w, h, k, color, label) {
    g.block(x, y, w, h, GG.PAL.paper, { r: h / 2, lw: 3.4 });
    var iw = Math.max(0, (w - 10) * U.sat(k));
    if (iw > 2) {
      g.rr(x + 5, y + 5, iw, h - 10, (h - 10) / 2).fill(color || GG.PAL.yamabuki);
    }
    if (label) g.text(label, x + w / 2, y + h / 2, { size: h * 0.5, fill: GG.PAL.ink });
    return A;
  };

  /** 進捗の数字。濃い背景でも読めるよう、白フチの黒太字で統一する。 */
  A.count = function (g, x, y, str, size) {
    g.text(str, x, y, {
      size: size || 34, fill: GG.PAL.ink, stroke: GG.PAL.paper, lw: (size || 34) * 0.22
    });
    return A;
  };

  /** 吹き出しつきの一言（ゲーム内の補助説明） */
  /** 木札ふうの一言。縁日の立て札の見立て。 */
  A.tip = function (g, x, y, str, size, color, textColor) {
    size = size || 20;
    var w = g.measure(str, size) + 40, h = size * 2;
    var c = g.c;
    c.save();
    g.rr(x - w / 2, y - h / 2, w, h, 10).ink(color || GG.PAL.paper, 3.4);
    c.restore();
    g.text(str, x, y, { size: size, fill: textColor || GG.PAL.ink });
    return A;
  };

  GG.A = A;
})(window.GG = window.GG || {});
