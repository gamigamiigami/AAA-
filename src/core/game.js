/* MICRO MANIA — core/game.js
 * ディレクタ。ミニゲームの選択・命令語の提示・制限時間・ライフ・スピードアップを統括する。
 *
 * 設計の芯: 全ての進行はビート単位。BPM を上げると、演出も BGM も
 * ミニゲーム内の時間もまとめて速くなる（this.speed 一本で制御）。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  var BASE_BPM = 132;
  var MAX_BPM = 208;
  var GAMES_PER_SPEEDUP = 4;
  var BOSS_EVERY = 6;
  var MAX_LIVES = 4;

  var W = GG.VIEW_W, H = GG.VIEW_H;
  GG.SAFE = { x: 30, y: 74, w: W - 60, h: H - 74 - 66 };

  var HEART_COL = ['#ff5e7d', '#ff3d6e'];

  function Game(canvas, audio, input, opts) {
    this.canvas = canvas;
    this.audio = audio;
    this.input = input;
    this.g = new GG.G(canvas.getContext('2d'));
    this.fx = new GG.Fx(new U.RNG(1));
    this.uiFx = new GG.Fx(new U.RNG(2));
    this.seed = (opts && opts.seed) || (Date.now() >>> 0);
    this.rng = new U.RNG(this.seed);

    this.state = 'title';
    this.phaseBeat = 0;
    this.stateT = 0;
    this.globalT = 0;

    this.lives = MAX_LIVES;
    this.score = 0;
    this.best = 0;
    try { this.best = parseInt(localStorage.getItem('micromania.best') || '0', 10) || 0; } catch (e) {}

    this.speedLevel = 0;
    this.speed = 1;
    this.gameIndex = 0;
    this.bag = [];
    this.lastId = null;

    this.cur = null;         // { def, inst, ctx }
    this.result = null;      // 'win' | 'lose'
    this.resultTimer = 0;
    this.hitStop = 0;
    this.wipeT = 99;
    this.wipeDur = 0.42;
    this.pendingInterlude = null;
    this.interlude = null;
    this.paused = false;
    this.heartPop = [0, 0, 0, 0];
    this.lastBeatIdx = -1;
    this.titleT = 0;
    this.newBest = false;
    this.demoBg = ['#5b3fa8', '#2a1c4d'];
    this.dpr = 1;
  }
  var P = Game.prototype;

  // =====================================================================
  // 進行
  // =====================================================================
  P.beatsIn = function () { return this.audio.beat - this.phaseBeat; };
  P.setState = function (s) {
    this.state = s;
    this.phaseBeat = this.audio.beat;
    this.stateT = 0;
  };

  P.startRun = function () {
    this.lives = MAX_LIVES;
    this.score = 0;
    this.speedLevel = 0;
    this.gameIndex = 0;
    this.bag = [];
    this.cur = null;
    this.lastId = null;
    this.newBest = false;
    this.heartPop = [0, 0, 0, 0];
    this.seed = (Date.now() >>> 0);
    this.rng.reset(this.seed);
    this.fx.clear(); this.uiFx.clear();
    this._applySpeed();
    this.audio.intensity = 0.8;
    this.audio.startMusic();
    this.showInterlude('STAGE 1', 'いくぞ！', '#4ecdc4', 4);
  };

  P._applySpeed = function () {
    var bpm = Math.min(MAX_BPM, BASE_BPM * Math.pow(1.07, this.speedLevel));
    this.audio.setBpm(bpm);
    this.speed = bpm / BASE_BPM;
  };

  P.difficulty = function () {
    if (this._forceDiff) return this._forceDiff;
    if (this.gameIndex >= 14 || this.speedLevel >= 4) return 3;
    if (this.gameIndex >= 6 || this.speedLevel >= 2) return 2;
    return 1;
  };

  P.showInterlude = function (title, sub, color, beats) {
    this.interlude = { title: title, sub: sub, color: color, beats: beats || 3 };
    this.setState('interlude');
  };

  P.pickDef = function () {
    if (this._forceDef) return this._forceDef;
    var isBoss = (this.gameIndex + 1) % BOSS_EVERY === 0;
    var pool = GG.MICROGAMES.filter(function (d) { return d.boss === isBoss; });
    if (!pool.length) pool = GG.MICROGAMES.filter(function (d) { return !d.boss; });
    if (isBoss) return pool[this.rng.int(0, pool.length - 1)];

    if (!this.bag.length) {
      this.bag = pool.slice();
      this.rng.shuffle(this.bag);
      if (this.bag.length > 1 && this.bag[0].id === this.lastId) {
        var t = this.bag[0]; this.bag[0] = this.bag[1]; this.bag[1] = t;
      }
    }
    return this.bag.pop();
  };

  P.nextMicrogame = function () {
    var def = this.pickDef();
    this.lastId = def.id;
    var self = this;
    var seed = (this.rng.int(1, 0x7ffffffe)) >>> 0;

    var ctx = {
      def: def,
      rng: new U.RNG(seed),
      seed: seed,
      diff: this.difficulty(),
      t: 0,
      duration: def.beats * 60 / BASE_BPM,   // 体感秒（speed で実時間は縮む）
      timeLeft: def.beats * 60 / BASE_BPM,
      progress: 0,
      beats: def.beats,
      input: this.input,
      fx: this.fx,
      W: W, H: H, SAFE: GG.SAFE,
      result: null,
      sfx: function (n) { self.audio.sfx(n); },
      shake: function (a, d) { self.fx.shake(a, d); },
      flash: function (a, c) { self.fx.flash(a, c); },
      stop: function (s) { self.hitStop = Math.max(self.hitStop, s || 0.08); },
      win: function () { self._setResult('win'); },
      lose: function () { self._setResult('lose'); }
    };
    this.cur = { def: def, ctx: ctx, inst: def.create(ctx) };
    this.result = null;
    this.resultTimer = 0;
    this.fx.clear();
    this.wipeT = 0;
    this.lastBeatIdx = -1;
    this.audio.intensity = def.boss ? 1 : 0.85;
    this.setState('prompt');
    this.audio.sfx(def.boss ? 'boss' : 'whoosh');
  };

  P._setResult = function (r) {
    if (this.result) return;
    this.result = r;
    this.cur.ctx.result = r;
    this.resultTimer = 0;
    if (r === 'win') {
      this.audio.sfx('win');
      this.fx.flash(0.28, '#ffffff');
      this.fx.punch(0.05);
    } else {
      this.audio.sfx('lose');
      this.fx.shake(16, 0.4);
      this.fx.flash(0.3, '#ff3b5c');
      this.hitStop = 0.14;
    }
  };

  P._finishMicrogame = function () {
    var won = this.result === 'win';
    this.gameIndex++;
    if (won) {
      this.score++;
      if (this.score > this.best) { this.best = this.score; this.newBest = true; }
    } else {
      this.lives--;
      if (this.lives >= 0 && this.lives < MAX_LIVES) this.heartPop[this.lives] = 1;
      this.audio.sfx('life');
    }

    if (this.lives <= 0) {
      try { localStorage.setItem('micromania.best', String(this.best)); } catch (e) {}
      this.audio.stopMusic();
      this.audio.sfx('gameover');
      this.setState('gameover');
      return;
    }

    if (this.gameIndex % GAMES_PER_SPEEDUP === 0 && this.audio.bpm < MAX_BPM) {
      this.speedLevel++;
      this._applySpeed();
      this.audio.sfx('speedup');
      this.showInterlude('SPEED UP!', 'はやくなるぞ', '#ffd93d', 3);
      return;
    }
    if ((this.gameIndex + 1) % BOSS_EVERY === 0) {
      this.showInterlude('BOSS STAGE', 'きあいを いれろ', '#ff5e7d', 3);
      return;
    }
    this.nextMicrogame();
  };

  // =====================================================================
  // 更新
  // =====================================================================
  P.update = function (dtReal) {
    this.audio.tick();
    this.globalT += dtReal;
    this.input.beginFrame(dtReal);

    if (this.input.hit('KeyM')) this.audio.setMuted(!this.audio.muted);
    if (this.input.hit('Escape') && (this.state === 'play' || this.state === 'prompt')) {
      this.paused = !this.paused;
      if (this.paused) this.audio.stopMusic(); else this.audio.startMusic();
    }
    if (this.paused) { this.input.endFrame(); return; }

    var dt = dtReal * this.speed;
    if (this.hitStop > 0) { this.hitStop -= dtReal; dt = 0; }

    this.stateT += dtReal;
    this.wipeT += dtReal;
    this.uiFx.update(dtReal);
    for (var i = 0; i < this.heartPop.length; i++) {
      this.heartPop[i] = Math.max(0, this.heartPop[i] - dtReal * 1.6);
    }

    switch (this.state) {
      case 'title': this._updTitle(dtReal); break;
      case 'interlude': this._updInterlude(); break;
      case 'prompt': this._updPrompt(dt); break;
      case 'play': this._updPlay(dt); break;
      case 'result': this._updResult(dt); break;
      case 'gameover': this._updGameover(dtReal); break;
    }
    this.input.endFrame();
  };

  P._updTitle = function (dt) {
    this.titleT += dt;
    this.fx.update(dt);
    if (this.rng.chance(dt * 2.2)) {
      this.fx.burst(this.rng.range(0, W), H + 20, {
        n: 1, color: ['#ff5e7d', '#ffd93d', '#4ecdc4', '#8367ff'],
        speed: 260, dir: -Math.PI / 2, spread: 0.35, gravity: 120,
        life: 3.2, size: 8, shape: 'star', drag: 0.4
      });
    }
    if (this.input.actHit || this.input.anyHit) {
      this.audio.init();
      this.audio.sfx('select');
      this.startRun();
    }
  };

  P._updInterlude = function () {
    this.fx.update(1 / 60);
    if (this.beatsIn() >= this.interlude.beats) this.nextMicrogame();
  };

  P._updPrompt = function (dt) {
    this.fx.update(dt);
    if (this.beatsIn() >= 2) {
      this.setState('play');
      this.audio.sfx('blip');
      this.lastBeatIdx = -1;
    }
  };

  P._updPlay = function (dt) {
    var c = this.cur.ctx;
    var beats = this.beatsIn();
    var left = this.cur.def.beats - beats;

    if (!this.result) {
      var bi = Math.floor(beats);
      if (bi !== this.lastBeatIdx) {
        this.lastBeatIdx = bi;
        if (left <= 2.5 && left > 0) this.audio.sfx(left <= 1.2 ? 'tock' : 'tick');
      }
    }

    c.t += dt;
    c.progress = U.sat(beats / this.cur.def.beats);
    c.timeLeft = Math.max(0, left) * 60 / BASE_BPM;
    this.cur.inst.update(dt);
    this.fx.update(dt);

    if (this.result) {
      this.resultTimer += dt;
      if (this.resultTimer > 0.45) {
        this.setState('result');
        this.fx.flash(0, '#fff');
        if (this.result === 'win') {
          this.uiFx.confetti(W / 2, H * 0.42, 40);
        }
      }
      return;
    }
    if (left <= 0) {
      this._setResult(this.cur.def.defaultResult);
    }
  };

  P._updResult = function (dt) {
    this.fx.update(dt);
    if (this.cur.inst.updateResult) this.cur.inst.updateResult(dt);
    if (this.beatsIn() >= 2) this._finishMicrogame();
  };

  P._updGameover = function (dt) {
    this.fx.update(dt);
    if (this.stateT > 1.0 && (this.input.actHit || this.input.anyHit)) {
      this.audio.sfx('select');
      this.startRun();
    }
  };

  // =====================================================================
  // 描画
  // =====================================================================
  P.draw = function () {
    var g = this.g, c = g.c;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    if (this.state === 'title') { this._drawTitle(g); this._drawVignette(g); return; }
    if (this.state === 'gameover') { this._drawGameover(g); this._drawVignette(g); return; }

    var sh = this.fx.shakeOffset();
    var z = 1 + this.fx.zoom;
    c.save();
    c.translate(W / 2 + sh.x, H / 2 + sh.y);
    c.scale(z, z);
    c.translate(-W / 2, -H / 2);

    if (this.state === 'interlude') {
      this._drawInterludeBg(g);
    } else if (this.cur) {
      this.drawBackdrop(g, this.cur.def);
      this.cur.inst.draw(g);
      this.fx.draw(g);
    }
    c.restore();

    if (this.state === 'play' || this.state === 'prompt' || this.state === 'result') this._drawHud(g);
    if (this.state === 'prompt') this._drawPrompt(g);
    if (this.state === 'result') this._drawStamp(g);
    if (this.state === 'interlude') this._drawInterlude(g);

    this.uiFx.draw(g);
    this._drawWipe(g);
    this.fx.drawOverlay(g);
    this._drawVignette(g);
    if (this.paused) this._drawPause(g);
    this._drawMuted(g);
  };

  /** ミニゲーム共通の背景。全ゲームで統一された「世界観の額縁」を作る。 */
  P.drawBackdrop = function (g, def) {
    var c = g.c, t = this.globalT;
    c.fillStyle = g.grad(0, 0, 0, H, [[0, def.bg[0]], [1, def.bg[1]]]);
    c.fillRect(0, 0, W, H);

    // 上からの柔らかい光
    c.save();
    c.fillStyle = g.rgrad(W * 0.5, -80, 40, 560,
      [[0, 'rgba(255,255,255,0.20)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, W, H);
    c.restore();

    // 斜めストライプ（面を締める。ぼんやりした玉ボケより情報密度が上がる）
    c.save();
    c.globalAlpha = 0.045;
    c.translate(-t * 16 % 132, 0);
    for (var s = -2; s < 12; s++) {
      c.save();
      c.translate(s * 132, 0); c.rotate(0.32);
      c.fillStyle = '#ffffff';
      c.fillRect(0, -260, 46, H + 520);
      c.restore();
    }
    c.restore();

    // 漂う小さな粒（IDから決まる固定配置なので毎回同じ絵になる）
    var seed = 0;
    for (var i = 0; i < def.id.length; i++) seed = (seed * 31 + def.id.charCodeAt(i)) >>> 0;
    var r = new U.RNG(seed || 7);
    c.save();
    for (var k = 0; k < 26; k++) {
      var ph = r.range(0, 6.28);
      var x = r.range(0, W), y = U.wrap(r.range(0, H) - t * r.range(6, 20), H + 60) - 30;
      c.globalAlpha = 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.4 + ph));
      g.circlePath(x + Math.sin(t * 0.7 + ph) * 14, y, r.range(2.5, 7)).fill('#ffffff');
    }
    c.restore();

    // 上下の帯（HUDの座り場所を作り、画面を締める）
    c.save();
    c.globalAlpha = 0.16;
    c.fillStyle = g.grad(0, 0, 0, 70, [[0, '#000'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, 0, W, 70);
    c.fillStyle = g.grad(0, H, 0, H - 64, [[0, '#000'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, H - 64, W, 64);
    c.restore();
  };

  P._drawVignette = function (g) {
    var c = g.c;
    c.save();
    c.fillStyle = g.rgrad(W / 2, H / 2, H * 0.45, H * 1.05,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(8,4,20,0.5)']]);
    c.fillRect(0, 0, W, H);
    c.restore();
  };

  // --- HUD ------------------------------------------------------------
  P._drawHud = function (g) {
    var c = g.c, i;

    // ライフ
    for (i = 0; i < MAX_LIVES; i++) {
      var alive = i < this.lives;
      var x = 44 + i * 42, y = 38;
      var pop = this.heartPop[i] || 0;
      var s = 15 * (1 + pop * 0.9);
      c.save();
      if (!alive) c.globalAlpha = 0.28;
      if (pop > 0) c.globalAlpha = 0.28 + U.pulse(pop) * 0.7;
      g.heartPath(x, y, s).ink(alive ? HEART_COL[0] : '#20182f', 3.2);
      if (alive) {
        g.circlePath(x - s * 0.35, y - s * 0.25, s * 0.22).fill('rgba(255,255,255,0.75)');
      }
      c.restore();
    }

    // スコア
    var label = String(this.score);
    var lw = g.measure('CLEAR', 15), nw = g.measure(label, 27);
    var pw = 20 + lw + 14 + nw + 20;
    var px = W - 24 - pw;
    g.block(px, 18, pw, 40, '#1d1633', { r: 20, lw: 3, gloss: 0.1 });
    g.text('CLEAR', px + 20, 39, {
      size: 15, fill: '#9d92c4', align: 'left', stroke: false, shadow: false
    });
    g.text(label, px + pw - 20, 38, { size: 27, fill: '#ffd93d', align: 'right', lw: 4 });

    // タイマー（ビートのビーズ）
    if (this.state === 'play' || this.state === 'prompt') {
      var total = this.cur.def.beats;
      var used = this.state === 'play' ? this.beatsIn() : 0;
      var leftB = U.clamp(total - used, 0, total);
      var n = Math.min(total, 16);
      var stepBeats = total / n;
      var bw = 15, gap = 7, tw = n * bw + (n - 1) * gap;
      var bx = W / 2 - tw / 2, by = H - 34;
      var urgent = leftB <= 2.5;
      for (i = 0; i < n; i++) {
        var full = (i + 1) * stepBeats <= leftB;
        var partial = !full && i * stepBeats < leftB;
        var col = urgent ? '#ff4d6d' : '#7bffd4';
        c.save();
        var sc = 1;
        if (partial) sc = 0.55 + 0.45 * U.sat((leftB - i * stepBeats) / stepBeats);
        if (urgent && full) sc = 1 + 0.16 * Math.max(0, Math.sin(this.audio.beat * Math.PI * 2));
        g.circlePath(bx + i * (bw + gap) + bw / 2, by, (bw / 2) * (full || partial ? sc : 0.72));
        if (full || partial) {
          c.globalAlpha = partial ? 0.55 + 0.45 * sc : 1;
          g.ink(col, 2.6);
        } else {
          c.globalAlpha = 0.32; g.fill('#0e0a1a');
        }
        c.restore();
      }
    }
  };

  // --- 命令語 ----------------------------------------------------------
  P._drawPrompt = function (g) {
    var c = g.c, def = this.cur.def;
    var b = U.sat(this.beatsIn() / 2);
    var appear = U.sat(this.beatsIn() / 0.55);
    var out = U.sat((this.beatsIn() - 1.5) / 0.5);

    c.save();
    c.globalAlpha = 1 - out * 0.15;

    // 背後のリボン
    var ribbonW = W * U.easeOutQuint(appear);
    c.save();
    c.translate(W / 2, H * 0.42);
    c.rotate(-0.028);
    c.globalAlpha = (1 - out) * 0.95;
    g.rr(-ribbonW / 2, -66, ribbonW, 132, 6).fill('rgba(14,9,26,0.62)');
    g.rr(-ribbonW / 2, -66, ribbonW, 8, 4).fill(U.alpha(def.boss ? '#ff5e7d' : '#ffd93d', 0.9));
    g.rr(-ribbonW / 2, 58, ribbonW, 8, 4).fill(U.alpha(def.boss ? '#ff5e7d' : '#ffd93d', 0.9));
    c.restore();

    // 命令語（1文字ずつ弾む）
    var self = this;
    c.save();
    c.translate(W / 2, H * 0.42);
    c.rotate(-0.028);
    c.globalAlpha = 1 - out;
    g.textEach(def.verb, 0, -8, {
      size: 82, fill: '#ffffff', lw: 13, letter: 4,
      shadowY: 7, shadowA: 0.45
    }, function (i, n) {
      var k = U.sat((self.beatsIn() - i * 0.055) / 0.42);
      return {
        scale: 0.2 + U.easeOutBack(k) * 0.8,
        dy: (1 - U.easeOutBack(k)) * -26,
        rot: (1 - k) * (i % 2 ? 0.3 : -0.3),
        alpha: U.sat(k * 3)
      };
    });
    if (def.verbEn) {
      c.globalAlpha = (1 - out) * U.sat((this.beatsIn() - 0.35) / 0.3) * 0.85;
      g.text(def.verbEn, 0, 48, { size: 22, fill: '#ffe89b', lw: 4, letter: 2 });
    }
    c.restore();

    // 操作ヒント
    var hint = GG.CONTROL_HINT[def.control];
    var ha = U.sat((this.beatsIn() - 0.5) / 0.4) * (1 - out);
    c.globalAlpha = ha;
    var hy = H * 0.60 + (1 - ha) * 20;   // リボンのすぐ下。キャラに被らせない
    var label = hint.label;
    var hw = g.measure(label, 21) + 92;
    g.block(W / 2 - hw / 2, hy - 26, hw, 52, '#1a1330', { r: 26, lw: 3, gloss: 0.08 });
    this._drawControlIcon(g, W / 2 - hw / 2 + 34, hy, hint.icon);
    g.text(label, W / 2 - hw / 2 + 62, hy + 1, {
      size: 21, fill: '#ffffff', align: 'left', lw: 3.5, shadow: false
    });
    c.restore();
  };

  P._drawControlIcon = function (g, x, y, icon) {
    var c = g.c, pulse = 0.5 + 0.5 * Math.sin(this.globalT * 7);
    c.save();
    c.translate(x, y);
    if (icon === 'btn' || icon === 'mash' || icon === 'hold') {
      var press = icon === 'mash' ? pulse * 3 : (icon === 'hold' ? 2.5 : pulse * 2);
      g.rr(-15, -13 + press, 30, 22, 8).fill('#0d0918');
      g.rr(-15, -15, 30, 22, 8).ink('#ffd93d', 2.6);
      if (icon === 'mash') {
        g.text('!', 0, -4, { size: 17, fill: '#1a1330', stroke: false, shadow: false });
      }
    } else if (icon === 'pad' || icon === 'pad4') {
      var arm = 8, th = 9;
      g.rr(-arm - th, -th / 2 - 1, (arm + th) * 2, th, 4).ink('#4ecdc4', 2.4);
      if (icon === 'pad4') g.rr(-th / 2, -arm - th, th, (arm + th) * 2, 4).ink('#4ecdc4', 2.4);
    } else if (icon === 'aim') {
      g.circlePath(0, 0, 13).stroke('#ff8ba7', 3.5);
      g.circlePath(0, 0, 4).fill('#ff8ba7');
      c.strokeStyle = '#ff8ba7'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-19, 0); c.lineTo(-15, 0); c.moveTo(19, 0); c.lineTo(15, 0);
      c.moveTo(0, -19); c.lineTo(0, -15); c.moveTo(0, 19); c.lineTo(0, 15);
      c.stroke();
    }
    c.restore();
  };

  // --- 結果スタンプ ----------------------------------------------------
  P._drawStamp = function (g) {
    var c = g.c;
    var win = this.result === 'win';
    var k = U.sat(this.beatsIn() / 0.35);
    var s = win ? U.lerp(2.4, 1, U.easeOutQuint(k)) : U.lerp(0.3, 1, U.easeOutElastic(k));
    var rot = win ? (1 - k) * 0.5 - 0.05 : U.lerp(-0.5, -0.08, U.easeOutBack(k));

    c.save();
    c.globalAlpha = 0.42 * U.sat(k * 3);
    g.clear(win ? 'rgba(20,60,40,0.5)' : 'rgba(70,10,25,0.6)');
    c.restore();

    c.save();
    c.translate(W / 2, H * 0.46);
    c.rotate(rot);
    c.scale(s, s);

    var col = win ? '#7bed9f' : '#ff5e7d';
    var txt = win ? 'クリア！' : 'ミス！';
    var en = win ? 'CLEAR' : 'MISS';

    // 放射
    c.save();
    c.globalAlpha = 0.3 * U.sat(k * 2);
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * U.TAU + this.globalT * (win ? 0.5 : -0.3);
      c.save(); c.rotate(a);
      g.polyPath([[0, 0], [520, -34], [520, 34]]).fill(U.alpha(win ? '#ffffff' : '#ff2d55', 0.5));
      c.restore();
    }
    c.restore();

    var tw = g.measure(txt, 96) + 110;
    g.block(-tw / 2, -74, tw, 148, '#16112a', { r: 32, lw: 6, gloss: 0.12 });
    g.rr(-tw / 2 + 12, -62, tw - 24, 8, 4).fill(U.alpha(win ? '#7bed9f' : '#ff5e7d', 0.55));
    g.text(txt, 0, -14, { size: 96, fill: col, lw: 14, shadowY: 8 });
    g.text(en, 0, 46, { size: 22, fill: U.alpha(win ? '#7bed9f' : '#ff5e7d', 0.9), lw: 3.5, letter: 6 });
    c.restore();
  };

  // --- インタールード --------------------------------------------------
  P._drawInterludeBg = function (g) {
    var c = g.c, t = this.globalT, il = this.interlude;
    c.fillStyle = g.grad(0, 0, 0, H, [[0, '#2a1c4d'], [1, '#150e29']]);
    c.fillRect(0, 0, W, H);
    // 走るストライプ
    c.save();
    c.globalAlpha = 0.13;
    c.translate(0, 0);
    for (var i = -12; i < 26; i++) {
      var x = U.wrap(i * 70 - t * 210, W + 900) - 200;
      c.save(); c.translate(x, 0); c.rotate(0.22);
      c.fillStyle = i % 2 ? il.color : '#ffffff';
      c.fillRect(0, -200, 34, H + 400);
      c.restore();
    }
    c.restore();
  };

  P._drawInterlude = function (g) {
    var c = g.c, il = this.interlude;
    var b = this.beatsIn();
    var k = U.sat(b / 0.5);
    var out = U.sat((b - (il.beats - 0.5)) / 0.5);

    c.save();
    c.translate(W / 2, H / 2 - 10);
    c.globalAlpha = 1 - out;
    var s = U.lerp(0.4, 1, U.easeOutBack(k)) * (1 + out * 0.25);
    c.scale(s, s);
    c.rotate((1 - U.easeOutBack(k)) * 0.25);

    var tw = g.measure(il.title, 72) + 100;
    c.save();
    c.rotate(-0.03);
    g.block(-tw / 2, -60, tw, 118, '#1c1338', { r: 26, lw: 5, gloss: 0.12 });
    g.text(il.title, 0, -18, { size: 72, fill: il.color, lw: 10, shadowY: 6 });
    g.text(il.sub, 0, 32, { size: 24, fill: '#ffffff', lw: 4 });
    c.restore();
    c.restore();

    // 拍に合わせて弾む三角
    for (var i = -1; i <= 1; i += 2) {
      var bp = U.sat(1 - (this.audio.beat % 1)) ;
      c.save();
      c.globalAlpha = (1 - out) * 0.9;
      c.translate(W / 2 + i * (250 + bp * 22), H / 2 - 10);
      c.scale(i, 1);
      g.polyPath([[0, -22], [26, 0], [0, 22]]).ink(il.color, 3);
      c.restore();
    }
  };

  // --- 画面転換 --------------------------------------------------------
  P._drawWipe = function (g) {
    if (this.wipeT >= this.wipeDur) return;
    var c = g.c, k = this.wipeT / this.wipeDur;
    var bands = 7, bh = H / bands;
    var cols = ['#ff5e7d', '#ffd93d', '#4ecdc4', '#8367ff', '#7bed9f', '#ff9f43', '#f368e0'];
    for (var i = 0; i < bands; i++) {
      var d = U.sat((k - i * 0.045) / (1 - 0.045 * bands));
      var x = U.easeInOutCubic(d) * (W + 260);
      c.save();
      c.translate(x, 0);
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.moveTo(-W - 60, i * bh);
      c.lineTo(0, i * bh);
      c.lineTo(60, (i + 1) * bh);
      c.lineTo(-W, (i + 1) * bh);
      c.closePath();
      c.fill();
      c.restore();
    }
  };

  // --- タイトル --------------------------------------------------------
  P._drawTitle = function (g) {
    var c = g.c, t = this.titleT;
    c.fillStyle = g.grad(0, 0, W, H, [[0, '#6b3fd4'], [0.55, '#c0399f'], [1, '#ff6b6b']]);
    c.fillRect(0, 0, W, H);

    // 回転するサンバースト
    c.save();
    c.translate(W / 2, H * 0.44);
    c.rotate(t * 0.16);
    c.globalAlpha = 0.11;
    for (var i = 0; i < 18; i++) {
      c.save(); c.rotate(i / 18 * U.TAU);
      g.polyPath([[0, 0], [900, -60], [900, 60]]).fill('#ffffff');
      c.restore();
    }
    c.restore();

    this.fx.draw(g);

    // 下段のマスコットたち（何のゲームか一目で伝える顔ぶれ）
    var mascots = [
      { x: 0.07, col: '#ffd93d', r: 46, ph: 0 },
      { x: 0.20, col: '#4ecdc4', r: 34, ph: 1.1 },
      { x: 0.81, col: '#ff8fa3', r: 38, ph: 2.2 },
      { x: 0.94, col: '#8be9fd', r: 50, ph: 3.4 }
    ];
    for (var mi = 0; mi < mascots.length; mi++) {
      var m = mascots[mi];
      var hop = Math.abs(Math.sin(t * 2.6 + m.ph));
      var by = H * 0.94 - hop * 42;
      GG.A.blob(g, {
        x: W * m.x, y: by, r: m.r, color: m.col,
        squash: 1 + (1 - hop) * 0.12 - hop * 0.06,
        shadowY: H * 0.94 + m.r * 0.9,
        lookX: Math.sin(t * 1.4 + m.ph) * 0.6, lookY: -0.2,
        rot: Math.sin(t * 2.6 + m.ph) * 0.12,
        mouth: 'smile'
      });
    }

    // ロゴ
    c.save();
    c.translate(W / 2, H * 0.36);
    var bob = Math.sin(t * 2.2) * 6;
    c.save();
    c.translate(0, bob);
    c.rotate(Math.sin(t * 1.3) * 0.02);
    var self = this;
    g.textEach('MICRO', 0, -46, {
      size: 96, fill: '#ffd93d', lw: 15, letter: 6, shadowY: 9, shadowA: 0.4
    }, function (i, n) {
      return { dy: Math.sin(t * 4 - i * 0.5) * 7, rot: Math.sin(t * 2 - i * 0.4) * 0.045 };
    });
    g.textEach('MANIA', 0, 44, {
      size: 96, fill: '#ffffff', lw: 15, letter: 6, shadowY: 9, shadowA: 0.4
    }, function (i, n) {
      return { dy: Math.sin(t * 4 - i * 0.5 - 1.4) * 7, rot: Math.sin(t * 2 - i * 0.4 - 1) * 0.045 };
    });
    c.restore();
    c.restore();

    g.text('ミニゲーム ' + GG.MICROGAMES.length + ' しゅるい ノンストップ', W / 2, H * 0.605,
      { size: 23, fill: '#ffffff', lw: 4.5 });

    // スタート案内
    var pulse = 0.55 + 0.45 * Math.sin(t * 4.4);
    c.save();
    c.globalAlpha = 0.55 + pulse * 0.45;
    var sw = 420;
    g.block(W / 2 - sw / 2, H * 0.71, sw, 62, '#20143d',
      { r: 31, lw: 4, gloss: 0.12, sy: 8 });
    g.text('スペース / クリック で スタート', W / 2, H * 0.71 + 32,
      { size: 24, fill: '#ffd93d', lw: 4 });
    c.restore();

    g.text('BEST  ' + this.best, W / 2, H * 0.885, { size: 21, fill: '#ffe0f0', lw: 4 });
    g.text('M: ミュート   ESC: ポーズ', W / 2, H - 24,
      { size: 14, fill: 'rgba(255,255,255,0.65)', stroke: false, shadow: false });
  };

  // --- ゲームオーバー --------------------------------------------------
  P._drawGameover = function (g) {
    var c = g.c, t = this.stateT;
    c.fillStyle = g.grad(0, 0, 0, H, [[0, '#2b1030'], [1, '#120716']]);
    c.fillRect(0, 0, W, H);
    c.save();
    c.globalAlpha = 0.08;
    c.translate(W / 2, H / 2); c.rotate(this.globalT * 0.1);
    for (var i = 0; i < 12; i++) {
      c.save(); c.rotate(i / 12 * U.TAU);
      g.polyPath([[0, 0], [900, -70], [900, 70]]).fill('#ff5e7d');
      c.restore();
    }
    c.restore();
    this.fx.draw(g);

    var k = U.sat(t / 0.6);
    c.save();
    c.translate(W / 2, H * 0.3);
    c.scale(U.lerp(1.6, 1, U.easeOutQuint(k)), U.lerp(1.6, 1, U.easeOutQuint(k)));
    c.globalAlpha = U.sat(t / 0.3);
    g.text('GAME OVER', 0, 0, { size: 78, fill: '#ff5e7d', lw: 12, shadowY: 8 });
    c.restore();

    if (t > 0.45) {
      var a = U.sat((t - 0.45) / 0.4);
      c.save(); c.globalAlpha = a;
      c.translate(W / 2, H * 0.55 + (1 - a) * 18);
      var pw = 430;
      g.block(-pw / 2, -62, pw, 124, '#1d1233', { r: 24, lw: 4, gloss: 0.1 });
      g.text('クリアした ミニゲーム', 0, -34, { size: 18, fill: '#b9a9e0', stroke: false, shadow: false });
      g.text(String(this.score), 0, 6, { size: 62, fill: '#ffd93d', lw: 9 });
      g.text((this.newBest ? '★ NEW BEST ★' : 'BEST  ' + this.best), 0, 44,
        { size: 19, fill: this.newBest ? '#7bed9f' : '#ffffff', lw: 3.5 });
      c.restore();
    }
    if (t > 1.0) {
      var p = 0.5 + 0.5 * Math.sin(this.globalT * 4.5);
      c.save(); c.globalAlpha = 0.5 + p * 0.5;
      g.text('スペース / クリック で もういちど', W / 2, H * 0.83,
        { size: 24, fill: '#ffffff', lw: 4 });
      c.restore();
    }
  };

  P._drawPause = function (g) {
    var c = g.c;
    c.save();
    c.globalAlpha = 0.72; g.clear('#0b0718'); c.restore();
    g.text('PAUSE', W / 2, H / 2 - 16, { size: 64, fill: '#ffd93d', lw: 10 });
    g.text('ESC で さいかい', W / 2, H / 2 + 42, { size: 22, fill: '#fff', lw: 4 });
  };

  P._drawMuted = function (g) {
    if (!this.audio.muted) return;
    g.text('🔇 MUTE (M)', W - 16, H - 18,
      { size: 15, fill: 'rgba(255,255,255,0.8)', align: 'right', stroke: false, shadow: false });
  };

  GG.Game = Game;
})(window.GG = window.GG || {});
