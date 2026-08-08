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

  var PAL = GG.PAL;
  var WIPE_COLS = null;

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
    this.showInterlude('一日目', 'はじまるよ！', PAL.ai, 4);
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
      this.fx.flash(0.3, PAL.paper);
      this.fx.punch(0.05);
    } else {
      this.audio.sfx('lose');
      this.fx.shake(16, 0.4);
      this.fx.flash(0.26, PAL.shu);
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
      this.showInterlude('はやくなる', 'ついてこられるか？', PAL.kuchiba, 3);
      return;
    }
    if ((this.gameIndex + 1) % BOSS_EVERY === 0) {
      this.showInterlude('大 し ょ う ぶ', 'きあいを いれろ', PAL.shu, 3);
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
  /**
   * ミニゲーム共通の背景。
   * 放射線やネオングラデではなく、和の地紋（青海波・市松・水玉）で情報密度を作る。
   */
  P.drawBackdrop = function (g, def) {
    var c = g.c, t = this.globalT;
    c.fillStyle = g.grad(0, 0, 0, H, [[0, def.bg[0]], [1, def.bg[1]]]);
    c.fillRect(0, 0, W, H);

    // 地紋は ID から決まるので、同じゲームなら毎回同じ絵になる
    var seed = 0;
    for (var i = 0; i < def.id.length; i++) seed = (seed * 31 + def.id.charCodeAt(i)) >>> 0;
    var kind = seed % 3;
    if (kind === 0) g.seigaiha(0, 0, W, H, 44, '#ffffff', 0.16, t * 9);
    else if (kind === 1) g.ichimatsu(0, 0, W, H, 62, '#ffffff', 0.09, t * 7);
    else g.mizutama(0, 0, W, H, 70, 9, '#ffffff', 0.13, t * 7);

    // 上下の縁。HUD の居場所を作りつつ、紙の額装のように画面を締める
    c.save();
    c.globalAlpha = 0.30;
    c.fillStyle = PAL.paper;
    c.fillRect(0, 0, W, 66);
    c.fillRect(0, H - 56, W, 56);
    c.globalAlpha = 0.30;
    c.fillStyle = PAL.ink;
    c.fillRect(0, 66, W, 2);
    c.fillRect(0, H - 58, W, 2);
    c.restore();
  };
  /** 画面の縁。暗く落とすビネットはやめ、朱の細い額縁だけ置く。 */
  P._drawVignette = function (g) {
    var c = g.c;
    c.save();
    c.globalAlpha = 0.5;
    c.strokeStyle = PAL.shu;
    c.lineWidth = 5;
    c.strokeRect(2.5, 2.5, W - 5, H - 5);
    c.restore();
  };
  P._drawHud = function (g) {
    var c = g.c, i;

    // ライフ = 提灯。消えると灯が落ちる。
    var lw0 = 26 + MAX_LIVES * 34;
    g.block(18, 14, lw0, 48, PAL.paper, { r: 12, lw: 2.6 });
    for (i = 0; i < MAX_LIVES; i++) {
      var alive = i < this.lives;
      var x = 44 + i * 34, y = 38;
      var pop = this.heartPop[i] || 0;
      var sz = 1 + pop * 0.5;
      c.save();
      c.translate(x, y);
      c.scale(sz, sz);
      if (!alive) c.globalAlpha = 0.28;
      if (pop > 0) c.globalAlpha = 0.28 + U.pulse(pop) * 0.72;
      g.rr(-6, -18, 12, 5, 2).fill(PAL.ink);
      g.ellipsePath(0, 0, 12, 15).ink(alive ? PAL.shu : PAL.kinari, 2);
      if (alive) {
        c.save();
        g.ellipsePath(0, 0, 12, 15); c.clip();
        c.globalAlpha = c.globalAlpha * 0.4;
        for (var q = -1; q < 3; q++) { c.fillStyle = PAL.paper; c.fillRect(-14, -8 + q * 7, 28, 2); }
        c.restore();
      }
      g.rr(-6, 13, 12, 5, 2).fill(PAL.ink);
      c.restore();
    }

    // スコア
    var label = String(this.score);
    var tw = g.measure('クリア', 14), nw = g.measure(label, 26);
    var pw = 18 + tw + 12 + nw + 18;
    var px = W - 20 - pw;
    g.block(px, 18, pw, 40, PAL.paper, { r: 12, lw: 2.6 });
    g.text('クリア', px + 18, 39, { size: 14, fill: PAL.inkSoft, align: 'left' });
    g.text(label, px + pw - 18, 38, { size: 26, fill: PAL.shu, align: 'right' });

    // 残り時間（拍ごとの珠）
    if (this.state === 'play' || this.state === 'prompt') {
      var total = this.cur.def.beats;
      var used = this.state === 'play' ? this.beatsIn() : 0;
      var leftB = U.clamp(total - used, 0, total);
      var n = Math.min(total, 16);
      var stepBeats = total / n;
      var bw = 14, gap = 8, ww = n * bw + (n - 1) * gap;
      var bx = W / 2 - ww / 2, by = H - 30;
      var urgent = leftB <= 2.5;
      for (i = 0; i < n; i++) {
        var full = (i + 1) * stepBeats <= leftB;
        var partial = !full && i * stepBeats < leftB;
        var col = urgent ? PAL.shu : PAL.ai;
        var sc = 1;
        if (partial) sc = 0.55 + 0.45 * U.sat((leftB - i * stepBeats) / stepBeats);
        if (urgent && full) sc = 1 + 0.14 * Math.max(0, Math.sin(this.audio.beat * Math.PI * 2));
        c.save();
        g.circlePath(bx + i * (bw + gap) + bw / 2, by, (bw / 2) * sc);
        if (full || partial) {
          if (partial) c.globalAlpha = 0.5 + 0.5 * sc;
          g.ink(col, 2);
        } else {
          g.ink(PAL.paper, 2);
        }
        c.restore();
      }
    }
  };
  /** 命令語。朱（ボスは藍）のベタ帯に白抜き文字。祭のポスターの見立て。 */
  P._drawPrompt = function (g) {
    var c = g.c, def = this.cur.def, self = this;
    var b = this.beatsIn();
    var appear = U.sat(b / 0.5);
    var out = U.sat((b - 1.55) / 0.45);
    var band = def.boss ? PAL.ai : PAL.shu;

    c.save();

    // 帯（左右から一気に開く）
    var bwid = W * U.easeOutQuint(appear);
    c.save();
    c.translate(W / 2, H * 0.42);
    c.globalAlpha = 1 - out;
    c.fillStyle = band;
    c.fillRect(-bwid / 2, -62, bwid, 124);
    c.fillStyle = PAL.paper;
    c.fillRect(-bwid / 2, -68, bwid, 5);
    c.fillRect(-bwid / 2, 63, bwid, 5);
    c.restore();

    // 命令語（1文字ずつ弾む）
    c.save();
    c.translate(W / 2, H * 0.42);
    c.globalAlpha = 1 - out;
    g.textEach(def.verb, 0, -6, {
      size: 76, fill: PAL.paper, letter: 8
    }, function (i) {
      var k = U.sat((self.beatsIn() - i * 0.05) / 0.4);
      return {
        scale: 0.35 + U.easeOutBack(k) * 0.65,
        dy: (1 - U.easeOutBack(k)) * -18,
        alpha: U.sat(k * 3)
      };
    });
    if (def.verbEn) {
      c.globalAlpha = (1 - out) * U.sat((b - 0.35) / 0.3) * 0.75;
      g.text(def.verbEn, 0, 44, { size: 17, fill: PAL.paper, letter: 4 });
    }
    c.restore();

    // 操作ヒント（木札）
    var hint = GG.CONTROL_HINT[def.control];
    var ha = U.sat((b - 0.5) / 0.4) * (1 - out);
    c.globalAlpha = ha;
    var hy = H * 0.62 + (1 - ha) * 16;
    var hw = g.measure(hint.label, 20) + 96;
    g.block(W / 2 - hw / 2, hy - 25, hw, 50, PAL.paper, { r: 10, lw: 2.6 });
    this._drawControlIcon(g, W / 2 - hw / 2 + 32, hy, hint.icon);
    g.text(hint.label, W / 2 - hw / 2 + 58, hy + 1, {
      size: 20, fill: PAL.ink, align: 'left'
    });
    c.restore();
  };
  P._drawControlIcon = function (g, x, y, icon) {
    var c = g.c, pulse = 0.5 + 0.5 * Math.sin(this.globalT * 7);
    c.save();
    c.translate(x, y);
    if (icon === 'btn' || icon === 'mash' || icon === 'hold') {
      var press = icon === 'mash' ? pulse * 3 : (icon === 'hold' ? 2.5 : pulse * 2);
      g.rr(-14, -13 + press, 28, 21, 6).fill(PAL.kinari);
      g.rr(-14, -14, 28, 21, 6).ink(PAL.yamabuki, 2.2);
      if (icon === 'mash') g.text('!', 0, -4, { size: 15, fill: PAL.ink });
    } else if (icon === 'pad' || icon === 'pad4') {
      var arm = 8, th = 9;
      g.rr(-arm - th, -th / 2 - 1, (arm + th) * 2, th, 3).ink(PAL.asagi, 2.2);
      if (icon === 'pad4') g.rr(-th / 2, -arm - th, th, (arm + th) * 2, 3).ink(PAL.asagi, 2.2);
    } else if (icon === 'aim') {
      g.circlePath(0, 0, 12).stroke(PAL.shu, 2.6);
      g.circlePath(0, 0, 3.5).fill(PAL.shu);
      c.strokeStyle = PAL.shu; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-18, 0); c.lineTo(-14, 0); c.moveTo(18, 0); c.lineTo(14, 0);
      c.moveTo(0, -18); c.lineTo(0, -14); c.moveTo(0, 18); c.lineTo(0, 14);
      c.stroke();
    }
    c.restore();
  };
  /** 結果。アメコミ的な集中線はやめ、色紙に判子を捺した見立てにする。 */
  P._drawStamp = function (g) {
    var c = g.c;
    var win = this.result === 'win';
    var k = U.sat(this.beatsIn() / 0.32);
    var s = win ? U.lerp(1.9, 1, U.easeOutQuint(k)) : U.lerp(0.4, 1, U.easeOutBack(k));
    var rot = U.lerp(win ? 0.22 : -0.3, win ? 0.02 : -0.045, U.easeOutQuint(k));
    var col = win ? PAL.ai : PAL.shu;

    // 画面を紙で覆う
    c.save();
    c.globalAlpha = 0.40 * U.sat(k * 3);
    g.clear(PAL.paper);
    c.restore();
    c.save();
    c.globalAlpha = 0.3 * U.sat(k * 3);
    g.ichimatsu(0, 0, W, H, 58, col, 0.22, this.globalT * 22);
    c.restore();

    c.save();
    c.translate(W / 2, H * 0.46);
    c.rotate(rot);
    c.scale(s, s);

    var txt = win ? 'クリア！' : 'ざんねん！';
    var en = win ? 'CLEAR' : 'MISS';
    var tw = g.measure(txt, 82) + 96;

    // 色紙
    g.block(-tw / 2, -78, tw, 156, PAL.paper, { r: 6, lw: 3.4 });
    c.fillStyle = col;
    c.fillRect(-tw / 2 + 10, -68, tw - 20, 6);
    c.fillRect(-tw / 2 + 10, 62, tw - 20, 6);
    g.text(txt, 0, -12, { size: 82, fill: col });
    g.text(en, 0, 42, { size: 17, fill: PAL.inkSoft, letter: 6 });

    // 判子
    c.save();
    c.translate(tw / 2 - 24, -52);
    c.rotate(-0.12);
    c.globalAlpha = 0.9;
    g.rr(-19, -19, 38, 38, 5).ink('rgba(0,0,0,0)', 3.4, PAL.shu);
    g.text(win ? '合' : '否', 0, 1, { size: 24, fill: PAL.shu });
    c.restore();

    c.restore();
  };
  P._drawInterludeBg = function (g) {
    var c = g.c, t = this.globalT, il = this.interlude;
    c.fillStyle = PAL.kinari;
    c.fillRect(0, 0, W, H);
    g.seigaiha(0, 0, W, H, 42, il.color, 0.22, t * 26);
    // のれん
    g.noren(0, 34, 9, [il.color, PAL.paper], 0.95);
    g.noren(H - 34, 34, 9, [PAL.paper, il.color], 0.95);
  };
  P._drawInterlude = function (g) {
    var c = g.c, il = this.interlude;
    var b = this.beatsIn();
    var k = U.sat(b / 0.45);
    var out = U.sat((b - (il.beats - 0.5)) / 0.5);

    c.save();
    c.translate(W / 2, H / 2);
    c.globalAlpha = 1 - out;
    var s = U.lerp(0.55, 1, U.easeOutBack(k)) * (1 + out * 0.2);
    c.scale(s, s);

    var tw = Math.max(g.measure(il.title, 64), g.measure(il.sub, 24)) + 120;
    g.block(-tw / 2, -74, tw, 148, PAL.paper, { r: 8, lw: 3.4 });
    c.fillStyle = il.color;
    c.fillRect(-tw / 2 + 12, -64, tw - 24, 6);
    c.fillRect(-tw / 2 + 12, 58, tw - 24, 6);
    g.text(il.title, 0, -20, { size: 64, fill: il.color });
    g.text(il.sub, 0, 30, { size: 24, fill: PAL.ink });
    c.restore();

    // 拍に合わせて開く扇
    for (var i = -1; i <= 1; i += 2) {
      var bp = U.sat(1 - (this.audio.beat % 1));
      c.save();
      c.globalAlpha = (1 - out) * 0.95;
      c.translate(W / 2 + i * (tw / 2 * 0 + 300 + bp * 18), H / 2);
      c.scale(i, 1);
      g.polyPath([[-18, -26], [22, 0], [-18, 26]]).ink(il.color, 2.6);
      c.restore();
    }
  };
  /** 市松のマスが縮んで消えていく転換。虹色シェブロンより和の語彙に合う。 */
  P._drawWipe = function (g) {
    if (this.wipeT >= this.wipeDur) return;
    var c = g.c, k = this.wipeT / this.wipeDur;
    var cell = 60, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    var span = 0.45;
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var delay = (i / cols) * (1 - span) + ((i + j) % 2) * 0.06;
        var sc = 1 - U.sat((k - delay) / span);
        if (sc <= 0.001) continue;
        c.save();
        c.translate(i * cell + cell / 2, j * cell + cell / 2);
        c.rotate((1 - sc) * 0.5);
        c.scale(sc, sc);
        c.fillStyle = (i + j) % 2 ? PAL.shu : PAL.kinari;
        c.fillRect(-cell / 2 - 1, -cell / 2 - 1, cell + 2, cell + 2);
        c.restore();
      }
    }
  };
  P._drawTitle = function (g) {
    var c = g.c, t = this.titleT;

    c.fillStyle = PAL.kinari;
    c.fillRect(0, 0, W, H);
    g.seigaiha(0, 0, W, H, 34, PAL.ai, 0.13, t * 12);

    // 上ののれん
    g.noren(0, 42, 9, [PAL.shu, PAL.paper], 1);

    // 提灯
    for (var i = 0; i < 2; i++) {
      var lx = i === 0 ? 96 : W - 96;
      var sway = Math.sin(t * 1.5 + i * 1.7) * 0.08;
      c.save();
      c.translate(lx, 42);
      c.rotate(sway);
      c.strokeStyle = PAL.ink; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 54); c.stroke();
      c.translate(0, 54);
      g.rr(-13, -8, 26, 10, 3).ink(PAL.ink, 0);
      g.ellipsePath(0, 40, 34, 44).ink(PAL.shu, 3);
      c.save();
      g.ellipsePath(0, 40, 34, 44); c.clip();
      c.globalAlpha = 0.35;
      for (var b = -1; b < 6; b++) {
        c.fillStyle = PAL.paper;
        c.fillRect(-40, -4 + b * 15, 80, 3);
      }
      c.restore();
      g.text('祭', 0, 40, { size: 30, fill: PAL.paper });
      g.rr(-13, 78, 26, 10, 3).ink(PAL.ink, 0);
      c.restore();
    }

    this.fx.draw(g);

    // マスコット
    var mascots = [
      { x: 0.10, col: PAL.yamabuki, r: 44, ph: 0 },
      { x: 0.235, col: PAL.asagi, r: 33, ph: 1.1 },
      { x: 0.775, col: PAL.kobai, r: 37, ph: 2.2 },
      { x: 0.905, col: PAL.wakaba, r: 47, ph: 3.4 }
    ];
    for (var mi = 0; mi < mascots.length; mi++) {
      var m = mascots[mi];
      var hop = Math.abs(Math.sin(t * 2.6 + m.ph));
      GG.A.blob(g, {
        x: W * m.x, y: H * 0.885 - hop * 34, r: m.r * 0.88, color: m.col,
        squash: 1 + (1 - hop) * 0.1 - hop * 0.05,
        shadowY: H * 0.885 + m.r * 0.8,
        lookX: Math.sin(t * 1.4 + m.ph) * 0.6, lookY: -0.2,
        rot: Math.sin(t * 2.6 + m.ph) * 0.1,
        mouth: 'smile'
      });
    }

    // 題字（墨の題字に朱のずらし影 = 和のポスターの手法）
    c.save();
    c.translate(W / 2, H * 0.365 + Math.sin(t * 2.2) * 4);
    var self = this;
    function logo(dx, dy, col) {
      g.textEach('ミニゲームまつり', dx, dy, {
        size: 78, fill: col, letter: 2
      }, function (i) {
        return { dy: Math.sin(t * 3.4 - i * 0.42) * 6, rot: Math.sin(t * 1.8 - i * 0.36) * 0.035 };
      });
    }
    logo(5, 5, PAL.shu);
    logo(0, 0, PAL.ink);
    c.restore();

    // 副題
    c.save();
    c.translate(W / 2, H * 0.545);
    var sw = 430;
    c.fillStyle = PAL.ink;
    c.fillRect(-sw / 2, -17, sw, 34);
    g.text('ミニゲーム ' + GG.MICROGAMES.length + ' しゅるい ノンストップ', 0, 1,
      { size: 20, fill: PAL.paper, letter: 1 });
    c.restore();

    // スタート案内
    var pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
    c.save();
    c.globalAlpha = 0.6 + pulse * 0.4;
    var bw = 400;
    g.block(W / 2 - bw / 2, H * 0.655, bw, 58, PAL.paper, { r: 10, lw: 4 });
    g.text('スペース / クリック で スタート', W / 2, H * 0.655 + 30,
      { size: 22, fill: PAL.shu });
    c.restore();

    GG.A.tip(g, W / 2, H * 0.795, 'さいこう記録  ' + this.best, 18);
    g.text('M: ミュート   ESC: ポーズ', W / 2, H - 18,
      { size: 13, fill: PAL.inkSoft });
  };
  P._drawGameover = function (g) {
    var c = g.c, t = this.stateT;
    c.fillStyle = PAL.kinari;
    c.fillRect(0, 0, W, H);
    g.ichimatsu(0, 0, W, H, 62, PAL.shu, 0.08, this.globalT * 10);
    g.noren(0, 30, 9, [PAL.shu, PAL.paper], 0.95);
    g.noren(H - 30, 30, 9, [PAL.paper, PAL.shu], 0.95);
    this.fx.draw(g);

    var k = U.sat(t / 0.55);
    c.save();
    c.translate(W / 2, H * 0.31);
    var sc = U.lerp(1.45, 1, U.easeOutQuint(k));
    c.scale(sc, sc);
    c.globalAlpha = U.sat(t / 0.3);
    g.text('おしまい', 7, 7, { size: 74, fill: PAL.shu });
    g.text('おしまい', 0, 0, { size: 74, fill: PAL.ink });
    c.restore();

    if (t > 0.42) {
      var a = U.sat((t - 0.42) / 0.4);
      c.save(); c.globalAlpha = a;
      c.translate(W / 2, H * 0.56 + (1 - a) * 16);
      var pw = 420;
      g.block(-pw / 2, -64, pw, 128, PAL.paper, { r: 8, lw: 3.2 });
      c.fillStyle = PAL.ai;
      c.fillRect(-pw / 2 + 12, -54, pw - 24, 5);
      g.text('クリアした ミニゲーム', 0, -32, { size: 17, fill: PAL.inkSoft });
      g.text(String(this.score), 0, 6, { size: 58, fill: PAL.shu });
      g.text(this.newBest ? '★ さいこう記録 こうしん ★' : 'さいこう記録  ' + this.best, 0, 44,
        { size: 18, fill: this.newBest ? PAL.wakaba : PAL.ink });
      c.restore();
    }
    if (t > 0.95) {
      var pl = 0.5 + 0.5 * Math.sin(this.globalT * 4.5);
      c.save(); c.globalAlpha = 0.55 + pl * 0.45;
      g.text('スペース / クリック で もういちど', W / 2, H * 0.83,
        { size: 22, fill: PAL.ink });
      c.restore();
    }
  };
  P._drawPause = function (g) {
    var c = g.c;
    c.save();
    c.globalAlpha = 0.86; g.clear(PAL.kinari); c.restore();
    g.ichimatsu(0, 0, W, H, 60, PAL.ai, 0.12, 0);
    g.text('やすみ', W / 2, H / 2 - 14, { size: 58, fill: PAL.ink });
    g.text('ESC で さいかい', W / 2, H / 2 + 40, { size: 21, fill: PAL.shu });
  };
  P._drawMuted = function (g) {
    if (!this.audio.muted) return;
    g.text('MUTE (M)', W - 16, H - 16,
      { size: 14, fill: PAL.inkSoft, align: 'right' });
  };
  GG.Game = Game;
})(window.GG = window.GG || {});
