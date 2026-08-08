/* MICRO MANIA — core/fx.js
 * パーティクル・画面シェイク・フラッシュ・フローティングテキスト。
 * 「入力に対する手応え」を担当する層。ミニゲームは c.fx から触る。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  function Fx(rng) {
    this.rng = rng || new U.RNG(1);
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.shakeDur = 0.001;
    this.flashA = 0;
    this.flashColor = '#fff';
    this.zoom = 0;          // 一瞬のズームパンチ
    this._t = 0;
  }
  var P = Fx.prototype;

  P.clear = function () {
    this.parts.length = 0; this.texts.length = 0; this.rings.length = 0;
    this.shakeAmp = 0; this.flashA = 0; this.zoom = 0;
  };

  P.shake = function (amp, dur) {
    if (amp >= this.shakeAmp * 0.6) {
      this.shakeAmp = Math.max(this.shakeAmp, amp);
      this.shakeDur = dur || 0.3; this.shakeT = 0;
    }
  };
  P.flash = function (a, color) {
    this.flashA = Math.max(this.flashA, a);
    this.flashColor = color || '#ffffff';
  };
  P.punch = function (z) { this.zoom = Math.max(this.zoom, z); };

  /** 粒。opt: {n, color, speed, spread, dir, size, gravity, life, drag, shape, spin} */
  P.burst = function (x, y, opt) {
    opt = opt || {};
    var n = opt.n === undefined ? 12 : opt.n;
    var colors = Array.isArray(opt.color) ? opt.color : [opt.color || GG.PAL.yamabuki];
    for (var i = 0; i < n; i++) {
      var dir = (opt.dir === undefined ? this.rng.range(0, U.TAU)
        : opt.dir + this.rng.range(-1, 1) * (opt.spread === undefined ? 0.6 : opt.spread));
      var sp = (opt.speed === undefined ? 260 : opt.speed) * this.rng.range(0.45, 1.15);
      this.parts.push({
        x: x, y: y,
        vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
        g: opt.gravity === undefined ? 900 : opt.gravity,
        drag: opt.drag === undefined ? 1.6 : opt.drag,
        r: (opt.size === undefined ? 7 : opt.size) * this.rng.range(0.6, 1.4),
        life: (opt.life === undefined ? 0.6 : opt.life) * this.rng.range(0.75, 1.3),
        t: 0,
        col: this.rng.pick(colors),
        shape: opt.shape || 'circle',
        rot: this.rng.range(0, U.TAU),
        spin: this.rng.range(-1, 1) * (opt.spin === undefined ? 12 : opt.spin)
      });
    }
    return this;
  };

  P.confetti = function (x, y, n, colors) {
    return this.burst(x, y, {
      n: n || 26, color: colors || [GG.PAL.shu, GG.PAL.yamabuki, GG.PAL.asagi, GG.PAL.fuji, GG.PAL.wakaba],
      speed: 420, size: 9, life: 1.1, gravity: 780, shape: 'rect', spin: 16
    });
  };

  /** 広がるリング（衝撃波） */
  P.ring = function (x, y, opt) {
    opt = opt || {};
    this.rings.push({
      x: x, y: y, t: 0,
      life: opt.life || 0.4,
      r0: opt.r0 || 6, r1: opt.r1 || 90,
      col: opt.color || GG.PAL.paper,
      lw: opt.lw || 8
    });
    return this;
  };

  P.floatText = function (x, y, str, opt) {
    opt = opt || {};
    this.texts.push({
      x: x, y: y, str: str, t: 0,
      life: opt.life || 0.85,
      col: opt.color || GG.PAL.paper,
      size: opt.size || 34,
      vy: opt.vy === undefined ? -110 : opt.vy,
      stroke: opt.stroke
    });
    return this;
  };

  P.update = function (dt) {
    this._t += dt;
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      var d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      p = this.texts[i]; p.t += dt;
      if (p.t >= p.life) { this.texts.splice(i, 1); continue; }
      p.y += p.vy * dt; p.vy *= Math.exp(-2.5 * dt);
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      p = this.rings[i]; p.t += dt;
      if (p.t >= p.life) this.rings.splice(i, 1);
    }
    if (this.shakeAmp > 0) {
      this.shakeT += dt;
      if (this.shakeT >= this.shakeDur) this.shakeAmp = 0;
    }
    this.flashA = Math.max(0, this.flashA - dt * 3.4);
    this.zoom = Math.max(0, this.zoom - dt * 3.0);
  };

  /** 現在のシェイクオフセット */
  P.shakeOffset = function () {
    if (this.shakeAmp <= 0) return { x: 0, y: 0 };
    var k = 1 - this.shakeT / this.shakeDur;
    var a = this.shakeAmp * k * k;
    var ph = this.shakeT * 62;
    return { x: Math.sin(ph * 1.7) * a, y: Math.cos(ph * 2.3) * a };
  };

  P.draw = function (g) {
    var c = g.c, i, p, k;
    for (i = 0; i < this.rings.length; i++) {
      p = this.rings[i]; k = p.t / p.life;
      c.save();
      c.globalAlpha = (1 - k) * 0.9;
      g.circlePath(p.x, p.y, U.lerp(p.r0, p.r1, U.easeOutCubic(k)))
        .stroke(p.col, p.lw * (1 - k * 0.75));
      c.restore();
    }
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i]; k = p.t / p.life;
      c.save();
      c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      var s = p.r * (1 - k * 0.45);
      if (p.shape === 'rect') {
        c.fillStyle = p.col; c.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
      } else if (p.shape === 'star') {
        g.starPath(0, 0, s * 1.5, s * 0.65, 5, 0).fill(p.col);
      } else {
        g.circlePath(0, 0, s).fill(p.col);
      }
      c.restore();
    }
    for (i = 0; i < this.texts.length; i++) {
      p = this.texts[i]; k = p.t / p.life;
      c.save();
      c.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      var sc = U.easeOutBack(U.sat(k * 5)) * (1 + k * 0.12);
      c.translate(p.x, p.y); c.scale(sc, sc);
      g.text(p.str, 0, 0, { size: p.size, fill: p.col, stroke: p.stroke, lw: p.size * 0.18 });
      c.restore();
    }
    return this;
  };

  /** 画面全体のフラッシュ（最後に重ねる） */
  P.drawOverlay = function (g) {
    if (this.flashA > 0.003) {
      g.c.save();
      g.c.globalAlpha = Math.min(1, this.flashA);
      g.clear(this.flashColor);
      g.c.restore();
    }
    return this;
  };

  GG.Fx = Fx;
})(window.GG = window.GG || {});
