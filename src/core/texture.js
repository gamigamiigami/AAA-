/* ミニゲームまつり — core/texture.js
 *
 * 質感（テクスチャ）を手続き生成してキャッシュする層。
 * 画像ファイルを一切使わずに「ドット絵」「粘土」「紙工作」「線画」「レトロCG」の
 * 手触りを出すのが目的。生成は全てシード付き RNG なので毎回同じ絵になる。
 *
 * ここで作るのは素材だけ。どのミニゲームにどれを掛けるかは game.js が決める。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  var TEX = {};
  var cache = Object.create(null);

  function makeCanvas(w, h) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  /** 生成結果を id でキャッシュ（毎フレーム作り直さない） */
  function cached(id, make) {
    if (!cache[id]) cache[id] = make();
    return cache[id];
  }

  /** 微細なノイズ。印刷物や画面の「ざらつき」を出す土台 */
  TEX.grain = function (ctx, strength) {
    var key = 'grain' + strength;
    return cached(key, function () {
      var n = 128, cv = makeCanvas(n, n);
      var c2 = cv.getContext('2d');
      var img = c2.createImageData(n, n);
      var d = img.data, rng = new U.RNG(0x9e37 + Math.round(strength * 1000));
      for (var i = 0; i < d.length; i += 4) {
        var v = rng.f();
        var lum = v < 0.5 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = lum;
        d[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 255 * strength);
      }
      c2.putImageData(img, 0, 0);
      return ctx.createPattern(cv, 'repeat');
    });
  };

  /** 紙の繊維。粗いノイズを縦横に伸ばして紙目にする */
  TEX.paper = function (ctx) {
    return cached('paper', function () {
      var n = 160, cv = makeCanvas(n, n), c2 = cv.getContext('2d');
      var rng = new U.RNG(20240808);
      c2.fillStyle = 'rgba(0,0,0,0)';
      c2.fillRect(0, 0, n, n);
      // 繊維
      for (var i = 0; i < 900; i++) {
        var x = rng.range(0, n), y = rng.range(0, n);
        var len = rng.range(3, 14), ang = rng.range(0, U.TAU);
        var dark = rng.chance(0.5);
        c2.strokeStyle = dark ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
        c2.lineWidth = rng.range(0.6, 1.6);
        c2.beginPath();
        c2.moveTo(x, y);
        c2.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        c2.stroke();
      }
      // 斑
      for (var k = 0; k < 60; k++) {
        c2.fillStyle = 'rgba(0,0,0,0.035)';
        c2.beginPath();
        c2.arc(rng.range(0, n), rng.range(0, n), rng.range(1, 5), 0, U.TAU);
        c2.fill();
      }
      return ctx.createPattern(cv, 'repeat');
    });
  };

  /** 網点（印刷の階調）。線画スタイルで重ねる */
  TEX.halftone = function (ctx, step, r) {
    var key = 'half' + step + '_' + r;
    return cached(key, function () {
      var cv = makeCanvas(step, step), c2 = cv.getContext('2d');
      c2.fillStyle = 'rgba(0,0,0,0.16)';
      c2.beginPath(); c2.arc(step / 2, step / 2, r, 0, U.TAU); c2.fill();
      c2.beginPath(); c2.arc(0, 0, r, 0, U.TAU); c2.fill();
      c2.beginPath(); c2.arc(step, 0, r, 0, U.TAU); c2.fill();
      c2.beginPath(); c2.arc(0, step, r, 0, U.TAU); c2.fill();
      c2.beginPath(); c2.arc(step, step, r, 0, U.TAU); c2.fill();
      return ctx.createPattern(cv, 'repeat');
    });
  };

  /** 走査線。レトロCG スタイル用 */
  TEX.scanline = function (ctx) {
    return cached('scan', function () {
      var cv = makeCanvas(4, 4), c2 = cv.getContext('2d');
      c2.fillStyle = 'rgba(0,0,0,0.13)';
      c2.fillRect(0, 0, 4, 2);
      c2.fillStyle = 'rgba(255,255,255,0.05)';
      c2.fillRect(0, 2, 4, 1);
      return ctx.createPattern(cv, 'repeat');
    });
  };

  /* ------------------------------------------------------------------
   * オフスクリーン合成
   * ミニゲームを一旦ここへ描き、画風に応じて加工してから本画面へ転送する。
   * ドット絵化は「低解像度に描いてニアレスト拡大」で実現するので、
   * ミニゲーム側のコードは一切変えずに絵柄だけ差し替えられる。
   * ---------------------------------------------------------------- */
  function Scene(w, h) {
    this.w = w; this.h = h;
    this.full = makeCanvas(w, h);
    this.fullCtx = this.full.getContext('2d');
    this.pixDiv = 3;   // ドット絵の粗さ。粗すぎると顔が潰れる
    this.small = makeCanvas(Math.ceil(w / this.pixDiv), Math.ceil(h / this.pixDiv));
    this.smallCtx = this.small.getContext('2d');
  }

  /** 描画先のコンテキストを返す。pixel の場合は低解像度側 */
  Scene.prototype.begin = function (style) {
    this.style = style;
    var c;
    if (style === 'pixel') {
      c = this.smallCtx;
      c.setTransform(1 / this.pixDiv, 0, 0, 1 / this.pixDiv, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
    } else {
      c = this.fullCtx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    return c;
  };

  /** dst へ転送し、画風ごとの質感を重ねる */
  Scene.prototype.present = function (dst) {
    var st = this.style, w = this.w, h = this.h;
    dst.save();

    if (st === 'pixel') {
      dst.imageSmoothingEnabled = false;
      dst.drawImage(this.small, 0, 0, w, h);
      dst.imageSmoothingEnabled = true;
    } else {
      dst.drawImage(this.full, 0, 0);
    }

    dst.globalCompositeOperation = 'source-over';
    // 質感は「言われないと気づかないが、無いと物足りない」程度に留める
    if (st === 'clay') {
      dst.globalAlpha = 0.55;
      dst.fillStyle = TEX.grain(dst, 0.14);
      dst.fillRect(0, 0, w, h);
    } else if (st === 'paper') {
      dst.globalAlpha = 0.85;
      dst.fillStyle = TEX.paper(dst);
      dst.fillRect(0, 0, w, h);
    } else if (st === 'sketch') {
      dst.globalAlpha = 0.6;
      dst.fillStyle = TEX.halftone(dst, 7, 1.6);
      dst.fillRect(0, 0, w, h);
    } else if (st === 'retro') {
      dst.globalAlpha = 0.75;
      dst.fillStyle = TEX.scanline(dst);
      dst.fillRect(0, 0, w, h);
    } else if (st === 'toon') {
      dst.globalAlpha = 0.3;
      dst.fillStyle = TEX.grain(dst, 0.09);
      dst.fillRect(0, 0, w, h);
    }
    // pixel は加工なし（ドットのエッジを濁らせない）
    dst.restore();
  };

  TEX.Scene = Scene;
  GG.TEX = TEX;
})(window.GG = window.GG || {});
