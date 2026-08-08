/* MICRO MANIA — core/util.js
 * 数学・イージング・シード付きRNG。他モジュールに依存しない最下層。 */
(function (GG) {
  'use strict';

  var U = {};

  U.TAU = Math.PI * 2;
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.unlerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  U.sat = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  U.dist = function (ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); };
  U.wrap = function (v, m) { return ((v % m) + m) % m; };

  /** 一定速度で target に近づける（フレームレート非依存） */
  U.approach = function (v, target, rate, dt) {
    var d = target - v, step = rate * dt;
    return Math.abs(d) <= step ? target : v + U.sign(d) * step;
  };
  /** 指数的追従。half = 半減期(秒) */
  U.damp = function (v, target, half, dt) {
    return target + (v - target) * Math.pow(0.5, dt / half);
  };

  // --- easing ---------------------------------------------------------
  U.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  U.easeInCubic = function (t) { return t * t * t; };
  U.easeInOutCubic = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  U.easeOutQuint = function (t) { return 1 - Math.pow(1 - t, 5); };
  U.smoothstep = function (t) { return t * t * (3 - 2 * t); };
  U.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  U.easeOutElastic = function (t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    var c4 = U.TAU / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };
  U.easeOutBounce = function (t) {
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  };
  /** 0→1→0 の山（ポップ演出用） */
  U.pulse = function (t) { return Math.sin(U.sat(t) * Math.PI); };

  // --- 当たり判定 -----------------------------------------------------
  U.rectHit = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
  U.circHit = function (ax, ay, ar, bx, by, br) {
    var dx = bx - ax, dy = by - ay, r = ar + br;
    return dx * dx + dy * dy <= r * r;
  };
  U.pointInRect = function (px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  };

  // --- 色 -------------------------------------------------------------
  /** '#rrggbb' を明度調整。amt>0 で明るく、<0 で暗く */
  U.shade = function (hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) {
      r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt;
    } else {
      r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt);
    }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  };
  U.alpha = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  U.hsl = function (h, s, l, a) {
    return 'hsla(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%,' + (a === undefined ? 1 : a) + ')';
  };

  // --- シード付き RNG (mulberry32) ------------------------------------
  function RNG(seed) {
    this.seed = (seed >>> 0) || 1;
    this.s = this.seed;
  }
  RNG.prototype.reset = function (seed) {
    this.seed = seed === undefined ? this.seed : (seed >>> 0);
    this.s = this.seed;
    return this;
  };
  /** [0,1) */
  RNG.prototype.f = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + this.f() * (b - a); };
  RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.f() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.f() < p; };
  RNG.prototype.sign = function () { return this.f() < 0.5 ? -1 : 1; };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.f() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  /** 重複しない整数を n 個 */
  RNG.prototype.sample = function (a, b, n) {
    var pool = [];
    for (var i = a; i <= b; i++) pool.push(i);
    this.shuffle(pool);
    return pool.slice(0, n);
  };
  U.RNG = RNG;

  GG.U = U;
})(window.GG = window.GG || {});
