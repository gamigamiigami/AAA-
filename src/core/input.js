/* MICRO MANIA — core/input.js
 * キーボード / マウス / タッチを 1 つの語彙に統一する。
 * ミニゲーム側は「押した」「動かした」「狙った」だけを意識すればよい。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  var ACTION_KEYS = {
    Space: 1, Enter: 1, KeyZ: 1, KeyX: 1, KeyJ: 1, KeyK: 1, NumpadEnter: 1
  };
  var BLOCK = {
    Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Tab: 1,
    Digit1: 1, Digit2: 1, Digit3: 1, Digit4: 1
  };

  function Input() {
    this._down = Object.create(null);
    this._hit = Object.create(null);   // このフレームで押された
    this._rel = Object.create(null);   // このフレームで離された
    this.x = GG.VIEW_W / 2;            // ポインタ論理座標
    this.y = GG.VIEW_H / 2;
    this.pDown = false;
    this.pHit = false;
    this.pRel = false;
    this.pointerActive = false;        // 直近にポインタが使われたか
    this.anyHit = false;               // 何かしらの入力があったフレーム
    this.mash = 0;                     // 連打カウンタ（毎フレームの新規押下数）
    this.map = function (cx, cy) { return { x: cx, y: cy }; };
    this._pointerIdleT = 999;
    this._lastKeyT = 0;
  }
  var P = Input.prototype;

  P.attach = function (el) {
    var self = this;

    window.addEventListener('keydown', function (e) {
      if (BLOCK[e.code]) e.preventDefault();
      if (e.repeat) return;
      self._down[e.code] = true;
      self._hit[e.code] = true;
      self.anyHit = true;
      self.pointerActive = false;
      if (ACTION_KEYS[e.code]) self.mash++;
    });
    window.addEventListener('keyup', function (e) {
      self._down[e.code] = false;
      self._rel[e.code] = true;
    });
    window.addEventListener('blur', function () {
      self._down = Object.create(null);
      self.pDown = false;
    });

    function pos(e) {
      var r = el.getBoundingClientRect();
      var p = self.map(e.clientX - r.left, e.clientY - r.top, r);
      self.x = U.clamp(p.x, 0, GG.VIEW_W);
      self.y = U.clamp(p.y, 0, GG.VIEW_H);
      self.pointerActive = true;
      self._pointerIdleT = 0;
    }

    el.addEventListener('pointermove', function (e) { pos(e); });
    el.addEventListener('pointerdown', function (e) {
      pos(e);
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      self.pDown = true; self.pHit = true; self.anyHit = true; self.mash++;
      e.preventDefault();
    });
    window.addEventListener('pointerup', function (e) {
      self.pDown = false; self.pRel = true;
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    return this;
  };

  // --- 問い合わせ -----------------------------------------------------
  P.down = function (code) { return !!this._down[code]; };
  P.hit = function (code) { return !!this._hit[code]; };
  P.released = function (code) { return !!this._rel[code]; };

  P.anyDown = function (list) {
    for (var i = 0; i < list.length; i++) if (this._down[list[i]]) return true;
    return false;
  };
  P.anyHitOf = function (list) {
    for (var i = 0; i < list.length; i++) if (this._hit[list[i]]) return true;
    return false;
  };

  /** 決定/アクションボタン（スペース・Z・クリック・タップ） */
  Object.defineProperty(P, 'act', {
    get: function () {
      for (var k in ACTION_KEYS) if (this._down[k]) return true;
      return this.pDown;
    }
  });
  Object.defineProperty(P, 'actHit', {
    get: function () {
      for (var k in ACTION_KEYS) if (this._hit[k]) return true;
      return this.pHit;
    }
  });
  Object.defineProperty(P, 'actRel', {
    get: function () {
      for (var k in ACTION_KEYS) if (this._rel[k]) return true;
      return this.pRel;
    }
  });

  P.axisX = function () {
    return (this.anyDown(['ArrowRight', 'KeyD']) ? 1 : 0) - (this.anyDown(['ArrowLeft', 'KeyA']) ? 1 : 0);
  };
  P.axisY = function () {
    return (this.anyDown(['ArrowDown', 'KeyS']) ? 1 : 0) - (this.anyDown(['ArrowUp', 'KeyW']) ? 1 : 0);
  };
  /** 方向の単発入力。'left'|'right'|'up'|'down'|null */
  P.dirHit = function () {
    if (this.anyHitOf(['ArrowLeft', 'KeyA'])) return 'left';
    if (this.anyHitOf(['ArrowRight', 'KeyD'])) return 'right';
    if (this.anyHitOf(['ArrowUp', 'KeyW'])) return 'up';
    if (this.anyHitOf(['ArrowDown', 'KeyS'])) return 'down';
    return null;
  };

  /** 横方向の操作。ポインタが使われていればそれを、なければキーを使う。 */
  P.steerX = function (cur, min, max, speed, dt) {
    var v = cur;
    if (this.pointerActive && this._pointerIdleT < 1.5) {
      v = U.approach(v, this.x, speed * 2.2, dt);
    } else {
      v += this.axisX() * speed * dt;
    }
    return U.clamp(v, min, max);
  };
  P.steer2D = function (o, bounds, speed, dt) {
    if (this.pointerActive && this._pointerIdleT < 1.5) {
      o.x = U.approach(o.x, this.x, speed * 2.2, dt);
      o.y = U.approach(o.y, this.y, speed * 2.2, dt);
    } else {
      var ax = this.axisX(), ay = this.axisY();
      var l = Math.hypot(ax, ay) || 1;
      o.x += ax / l * speed * dt;
      o.y += ay / l * speed * dt;
    }
    o.x = U.clamp(o.x, bounds.x, bounds.x + bounds.w);
    o.y = U.clamp(o.y, bounds.y, bounds.y + bounds.h);
    return o;
  };

  P.beginFrame = function (dt) {
    this._pointerIdleT += dt;
  };
  P.endFrame = function () {
    this._hit = Object.create(null);
    this._rel = Object.create(null);
    this.pHit = false; this.pRel = false;
    this.anyHit = false; this.mash = 0;
  };

  GG.Input = Input;
})(window.GG = window.GG || {});
