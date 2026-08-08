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
    // ミニゲームは一旦ここへ描き、画風に応じて加工してから本画面へ転送する
    this.scene = new GG.TEX.Scene(W, H);
    this.gFull = new GG.G(this.scene.fullCtx);
    this.gSmall = new GG.G(this.scene.smallCtx);
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
    this.showInterlude('ステージ 1', 'いくぞー！', PAL.ai, 4);
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
      this.showInterlude('スピードアップ', 'はやくなるぞ！', PAL.kuchiba, 3);
      return;
    }
    if ((this.gameIndex + 1) % BOSS_EVERY === 0) {
      this.showInterlude('ボスステージ', 'きあいを いれろ！', PAL.shu, 3);
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
      var def = this.cur.def;
      var sg = def.style === 'pixel' ? this.gSmall : this.gFull;
      this.scene.begin(def.style);
      this.drawBackdrop(sg, def);
      this.cur.inst.draw(sg);
      this.fx.draw(sg);
      this.scene.present(c);
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
  /**
   * ミニゲーム共通の背景。
   * ベタ塗りを基本に、動きの手がかりになる単純な図形だけを置く。
   * 「画面がにぎやかで、しかし主役が一目で分かる」状態を狙う。
   */
  P.drawBackdrop = function (g, def) {
    var c = g.c, t = this.globalT;
    c.fillStyle = def.bg[0];
    c.fillRect(0, 0, W, H);


    var seed = 0;
    for (var i = 0; i < def.id.length; i++) seed = (seed * 31 + def.id.charCodeAt(i)) >>> 0;
    var kind = seed % 3;
    c.save();
    c.globalAlpha = 0.085;
    c.fillStyle = '#ffffff';
    if (kind === 0) {
      // 太い斜めストライプ
      c.translate(-((t * 26) % 180), 0);
      for (var k = -2; k < 10; k++) {
        c.save(); c.translate(k * 180, 0); c.rotate(0.3);
        c.fillRect(0, -260, 72, H + 520);
        c.restore();
      }
    } else if (kind === 1) {
      // 大きな水玉
      for (var j = -1; j < 5; j++) {
        for (var i2 = -1; i2 < 8; i2++) {
          var px = i2 * 150 + (j % 2 ? 75 : 0) - ((t * 18) % 300);
          g.circlePath(px, j * 140 + 40, 46).fill('#ffffff');
        }
      }
    } else {
      // 同心円
      for (var r = 0; r < 7; r++) {
        g.circlePath(W / 2, H * 0.45, 90 + r * 90 - ((t * 22) % 90)).stroke('#ffffff', 20);
      }
    }
    c.restore();
  };
  /** 額縁は置かない。画面の隅までゲームの絵で埋める。 */
  P._drawVignette = function () { return this; };
  P._drawHud = function (g) {
    var c = g.c, i;

    // 残機: 顔アイコンを 4 つ。失うと灰色になって傾く。
    for (i = 0; i < MAX_LIVES; i++) {
      var alive = i < this.lives;
      var x = 40 + i * 44, y = 40;
      var pop = this.heartPop[i] || 0;
      c.save();
      c.translate(x, y);
      c.scale(1 + pop * 0.5, 1 + pop * 0.5);
      if (!alive) { c.rotate(0.45); c.globalAlpha = 0.4; }
      g.circlePath(0, 0, 17).ink(alive ? PAL.yamabuki : '#b8b8b8', 4);
      if (alive) {
        g.eyes(0, -2, 6, 4.2, 0, 0, false);
        c.strokeStyle = PAL.ink; c.lineWidth = 2.4; c.lineCap = 'round';
        c.beginPath(); c.arc(0, 4, 5, 0.3, Math.PI - 0.3); c.stroke();
      } else {
        c.strokeStyle = PAL.ink; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-7, -5); c.lineTo(-1, 1); c.moveTo(-1, -5); c.lineTo(-7, 1);
        c.moveTo(1, -5); c.lineTo(7, 1); c.moveTo(7, -5); c.lineTo(1, 1);
        c.moveTo(-5, 8); c.lineTo(5, 8);
        c.stroke();
      }
      c.restore();
    }

    // スコア
    var label = String(this.score);
    g.text('×' + label, W - 26, 40, {
      size: 30, fill: PAL.ink, align: 'right', stroke: PAL.paper, lw: 6
    });

    // 制限時間: 導火線つきの爆弾。このジャンルの象徴なので必ず画面に出す。
    if (this.state === 'play' || this.state === 'prompt') {
      var total = this.cur.def.beats;
      var used = this.state === 'play' ? this.beatsIn() : 0;
      var left = U.clamp(1 - used / total, 0, 1);
      var fuseW = 250;
      var bx = W / 2 + fuseW / 2 + 26, by = H - 52;
      var sparkX = W / 2 - fuseW / 2 + fuseW * (1 - left);
      var urgent = (total - used) <= 2.5;

      c.save();
      // 残っている導火線
      c.strokeStyle = '#d8c8a0'; c.lineWidth = 8; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(sparkX, by);
      for (var fx = sparkX; fx <= bx - 20; fx += 8) {
        c.lineTo(fx, by + Math.sin(fx * 0.09) * 5);
      }
      c.stroke();
      c.strokeStyle = PAL.ink; c.lineWidth = 2;
      c.stroke();

      // 火花
      var fl = 0.75 + 0.25 * Math.sin(this.globalT * 40);
      c.globalAlpha = 0.9;
      g.circlePath(sparkX, by, 13 * fl).fill(PAL.kuchiba);
      g.circlePath(sparkX, by, 8 * fl).fill(PAL.yamabuki);
      g.circlePath(sparkX, by, 4 * fl).fill('#fffbe0');
      c.globalAlpha = 1;

      // 爆弾（残りわずかで震える）
      var shake = urgent ? Math.sin(this.globalT * 44) * 3 : 0;
      c.translate(bx + shake, by + 2);
      var bs = urgent ? 1 + 0.08 * Math.max(0, Math.sin(this.audio.beat * Math.PI * 2)) : 1;
      c.scale(bs, bs);
      g.circlePath(0, 0, 22).ink(urgent ? PAL.shu : '#3a3a42', 4);
      g.ellipsePath(-7, -8, 6, 4, -0.6).fill('rgba(255,255,255,0.8)');
      g.rr(-6, -30, 12, 10, 3).ink('#8b8496', 3);
      c.restore();
    }
  };
  /**
   * 命令語。背景を隠さず、ゲーム画面の上に太字を直接置く。
   * プレイヤーは「言葉」と「今の画面」を同時に見て、何をすべきか 1 秒で決める。
   */
  P._drawPrompt = function (g) {
    var c = g.c, def = this.cur.def, self = this;
    var b = this.beatsIn();
    var out = U.sat((b - 1.5) / 0.5);

    c.save();

    // ごく薄く白を敷いて文字を読ませる（暗転はしない）
    c.globalAlpha = (1 - out) * 0.26;
    g.clear(PAL.paper);
    c.globalAlpha = 1;

    // 命令語
    c.save();
    c.translate(W / 2, H * 0.42);
    c.globalAlpha = 1 - out;
    c.scale(1 + out * 0.18, 1 + out * 0.18);
    g.textEach(def.verb, 0, 0, {
      size: 96, fill: PAL.ink, stroke: PAL.paper, lw: 16, letter: 6
    }, function (i) {
      var k = U.sat((self.beatsIn() - i * 0.045) / 0.3);
      return {
        scale: 0.45 + U.easeOutBack(k) * 0.55,
        dy: (1 - U.easeOutBack(k)) * -14,
        alpha: U.sat(k * 4)
      };
    });
    c.restore();

    // 操作ヒント（小さく、控えめに）
    var hint = GG.CONTROL_HINT[def.control];
    var ha = U.sat((b - 0.55) / 0.35) * (1 - out);
    c.globalAlpha = ha * 0.95;
    var hy = H * 0.72;
    var hw = g.measure(hint.label, 19) + 88;
    g.block(W / 2 - hw / 2, hy - 22, hw, 44, PAL.paper, { r: 22, lw: 3.4 });
    this._drawControlIcon(g, W / 2 - hw / 2 + 30, hy, hint.icon);
    g.text(hint.label, W / 2 - hw / 2 + 54, hy + 1, {
      size: 19, fill: PAL.ink, align: 'left'
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
  /** 結果。太字を画面いっぱいに出し、背後に色の放射を回す。 */
  P._drawStamp = function (g) {
    var c = g.c;
    var win = this.result === 'win';
    var k = U.sat(this.beatsIn() / 0.3);
    var col = win ? PAL.yamabuki : PAL.shu;
    var txt = win ? 'クリア！' : 'ざんねん！';

    // 背後の放射（ゲーム画面は薄く残す）
    c.save();
    c.globalAlpha = 0.55 * U.sat(k * 3);
    c.translate(W / 2, H * 0.46);
    c.rotate(this.globalT * (win ? 0.8 : -0.5));
    for (var i = 0; i < 16; i++) {
      c.save(); c.rotate(i / 16 * U.TAU);
      g.polyPath([[0, 0], [900, -70], [900, 70]]).fill(i % 2 ? col : PAL.paper);
      c.restore();
    }
    c.restore();

    c.save();
    c.translate(W / 2, H * 0.46);
    var sc = win ? U.lerp(1.8, 1, U.easeOutQuint(k)) : U.lerp(0.4, 1, U.easeOutBack(k));
    c.rotate(U.lerp(win ? 0.2 : -0.28, win ? 0.02 : -0.05, U.easeOutQuint(k)));
    c.scale(sc, sc);
    g.text(txt, 0, 0, { size: 104, fill: col, stroke: PAL.ink, lw: 18 });
    g.text(txt, 0, 0, { size: 104, fill: col, stroke: PAL.paper, lw: 5 });
    c.restore();
  };
  P._drawInterludeBg = function (g) {
    var c = g.c, t = this.globalT, il = this.interlude;
    c.fillStyle = il.color;
    c.fillRect(0, 0, W, H);
    // 回る放射
    c.save();
    c.globalAlpha = 0.16;
    c.translate(W / 2, H / 2);
    c.rotate(t * 0.5);
    for (var i = 0; i < 20; i++) {
      c.save(); c.rotate(i / 20 * U.TAU);
      g.polyPath([[0, 0], [900, -58], [900, 58]]).fill('#ffffff');
      c.restore();
    }
    c.restore();
  };
  P._drawInterlude = function (g) {
    var c = g.c, il = this.interlude;
    var b = this.beatsIn();
    var k = U.sat(b / 0.4);
    var out = U.sat((b - (il.beats - 0.5)) / 0.5);

    c.save();
    c.translate(W / 2, H / 2 - 8);
    c.globalAlpha = 1 - out;
    var s = U.lerp(0.5, 1, U.easeOutBack(k)) * (1 + out * 0.2);
    c.scale(s, s);
    c.rotate(-0.03);
    g.text(il.title, 0, -26, { size: 78, fill: PAL.yamabuki, stroke: PAL.ink, lw: 16 });
    g.text(il.title, 0, -26, { size: 78, fill: PAL.yamabuki, stroke: PAL.paper, lw: 4 });
    g.text(il.sub, 0, 40, { size: 26, fill: PAL.paper, stroke: PAL.ink, lw: 7 });
    c.restore();

    // 拍で弾むマスコット
    for (var i = -1; i <= 1; i += 2) {
      var hop = Math.abs(Math.sin(this.audio.beat * Math.PI));
      c.save();
      c.globalAlpha = 1 - out;
      GG.A.blob(g, {
        x: W / 2 + i * 300, y: H / 2 + 30 - hop * 30, r: 42,
        color: i < 0 ? PAL.asagi : PAL.kobai,
        squash: 1 + (1 - hop) * 0.12, lookX: -i * 0.6, mouth: 'smile'
      });
      c.restore();
    }
  };
  /** 原色のブロックが回転しながら縮んで消える転換。 */
  P._drawWipe = function (g) {
    if (this.wipeT >= this.wipeDur) return;
    var c = g.c, k = this.wipeT / this.wipeDur;
    var cols = [PAL.shu, PAL.yamabuki, PAL.asagi, PAL.wakaba, PAL.kobai, PAL.ai];
    var cell = 60, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
    var span = 0.5;
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var delay = (i / nx) * (1 - span);
        var sc = 1 - U.sat((k - delay) / span);
        if (sc <= 0.001) continue;
        c.save();
        c.translate(i * cell + cell / 2, j * cell + cell / 2);
        c.rotate((1 - sc) * 1.2);
        c.scale(sc, sc);
        c.fillStyle = cols[(i + j) % cols.length];
        c.fillRect(-cell / 2 - 1, -cell / 2 - 1, cell + 2, cell + 2);
        c.restore();
      }
    }
  };
  P._drawTitle = function (g) {
    var c = g.c, t = this.titleT;

    c.fillStyle = PAL.yamabuki;
    c.fillRect(0, 0, W, H);
    // 回る放射
    c.save();
    c.globalAlpha = 0.2;
    c.translate(W / 2, H * 0.42);
    c.rotate(t * 0.22);
    for (var i = 0; i < 22; i++) {
      c.save(); c.rotate(i / 22 * U.TAU);
      g.polyPath([[0, 0], [1000, -62], [1000, 62]]).fill('#ffffff');
      c.restore();
    }
    c.restore();

    this.fx.draw(g);

    // マスコット
    var mascots = [
      { x: 0.09, col: PAL.shu, r: 46, ph: 0 },
      { x: 0.225, col: PAL.asagi, r: 35, ph: 1.1 },
      { x: 0.78, col: PAL.kobai, r: 38, ph: 2.2 },
      { x: 0.915, col: PAL.wakaba, r: 48, ph: 3.4 }
    ];
    for (var mi = 0; mi < mascots.length; mi++) {
      var m = mascots[mi];
      var hop = Math.abs(Math.sin(t * 2.6 + m.ph));
      GG.A.blob(g, {
        x: W * m.x, y: H * 0.88 - hop * 40, r: m.r, color: m.col,
        squash: 1 + (1 - hop) * 0.1 - hop * 0.05,
        shadowY: H * 0.88 + m.r * 0.85,
        lookX: Math.sin(t * 1.4 + m.ph) * 0.6, lookY: -0.2,
        rot: Math.sin(t * 2.6 + m.ph) * 0.1,
        mouth: 'smile'
      });
    }

    // ロゴ: 太字を黒フチ + 白フチで二重に縁取る
    c.save();
    c.translate(W / 2, H * 0.33);
    c.rotate(Math.sin(t * 1.1) * 0.018);
    var self = this;
    function logo(y, str, size, fill) {
      g.textEach(str, 0, y, { size: size, fill: fill, stroke: PAL.ink, lw: size * 0.23, letter: 3 },
        function (i) { return { dy: Math.sin(t * 3.6 - i * 0.4) * 7, rot: Math.sin(t * 2 - i * 0.35) * 0.05 }; });
      g.textEach(str, 0, y, { size: size, fill: fill, stroke: PAL.paper, lw: size * 0.06, letter: 3 },
        function (i) { return { dy: Math.sin(t * 3.6 - i * 0.4) * 7, rot: Math.sin(t * 2 - i * 0.35) * 0.05 }; });
    }
    logo(-42, 'ミニゲーム', 86, PAL.shu);
    logo(48, 'まつり', 86, PAL.ai);
    c.restore();

    // 副題
    c.save();
    c.translate(W / 2, H * 0.585);
    c.rotate(-0.02);
    var sw = 430;
    g.rr(-sw / 2, -20, sw, 40, 20).ink(PAL.ink, 0);
    g.text('ぜんぶで ' + GG.MICROGAMES.length + ' しゅるい ノンストップ', 0, 1,
      { size: 20, fill: PAL.paper });
    c.restore();

    // スタート案内
    var pulse = 0.5 + 0.5 * Math.sin(t * 4.4);
    c.save();
    c.translate(W / 2, H * 0.70);
    c.scale(1 + pulse * 0.05, 1 + pulse * 0.05);
    var bw2 = 440;
    g.rr(-bw2 / 2, -28, bw2, 56, 28).ink(PAL.shu, 5);
    g.text('スペース / クリック で スタート', 0, 1,
      { size: 24, fill: PAL.paper });
    c.restore();

    g.text('さいこう記録  ' + this.best, W / 2, H * 0.775,
      { size: 20, fill: PAL.ink, stroke: PAL.paper, lw: 5 });
    g.text('M: ミュート   ESC: ポーズ', W / 2, H - 16,
      { size: 13, fill: PAL.ink, stroke: PAL.paper, lw: 4 });
  };
  P._drawGameover = function (g) {
    var c = g.c, t = this.stateT;
    c.fillStyle = PAL.ai;
    c.fillRect(0, 0, W, H);
    c.save();
    c.globalAlpha = 0.14;
    c.translate(W / 2, H / 2); c.rotate(this.globalT * 0.2);
    for (var i = 0; i < 18; i++) {
      c.save(); c.rotate(i / 18 * U.TAU);
      g.polyPath([[0, 0], [1000, -66], [1000, 66]]).fill('#ffffff');
      c.restore();
    }
    c.restore();
    this.fx.draw(g);

    var k = U.sat(t / 0.5);
    c.save();
    c.translate(W / 2, H * 0.3);
    var sc = U.lerp(1.5, 1, U.easeOutQuint(k));
    c.scale(sc, sc);
    c.globalAlpha = U.sat(t / 0.3);
    c.rotate(-0.03);
    g.text('おしまい', 0, 0, { size: 84, fill: PAL.shu, stroke: PAL.ink, lw: 18 });
    g.text('おしまい', 0, 0, { size: 84, fill: PAL.shu, stroke: PAL.paper, lw: 5 });
    c.restore();

    if (t > 0.42) {
      var a = U.sat((t - 0.42) / 0.4);
      c.save(); c.globalAlpha = a;
      c.translate(W / 2, H * 0.57 + (1 - a) * 16);
      g.text('クリアした ミニゲーム', 0, -42, { size: 18, fill: PAL.paper, stroke: PAL.ink, lw: 6 });
      g.text(String(this.score), 0, 6, { size: 76, fill: PAL.yamabuki, stroke: PAL.ink, lw: 14 });
      g.text(this.newBest ? '★ さいこう記録 こうしん ★' : 'さいこう記録  ' + this.best, 0, 56,
        { size: 19, fill: this.newBest ? PAL.yamabuki : PAL.paper, stroke: PAL.ink, lw: 6 });
      c.restore();
    }
    if (t > 0.95) {
      var pl = 0.5 + 0.5 * Math.sin(this.globalT * 4.5);
      c.save(); c.globalAlpha = 0.55 + pl * 0.45;
      g.text('スペース / クリック で もういちど', W / 2, H * 0.85,
        { size: 22, fill: PAL.paper, stroke: PAL.ink, lw: 7 });
      c.restore();
    }
  };
  P._drawPause = function (g) {
    var c = g.c;
    c.save();
    c.globalAlpha = 0.82; g.clear(PAL.ai); c.restore();
    g.text('やすみ', W / 2, H / 2 - 14, { size: 64, fill: PAL.yamabuki, stroke: PAL.ink, lw: 14 });
    g.text('ESC で さいかい', W / 2, H / 2 + 44, { size: 22, fill: PAL.paper, stroke: PAL.ink, lw: 7 });
  };
  P._drawMuted = function (g) {
    if (!this.audio.muted) return;
    g.text('MUTE (M)', W - 16, H - 14,
      { size: 14, fill: PAL.paper, stroke: PAL.ink, lw: 4, align: 'right' });
  };
  GG.Game = Game;
})(window.GG = window.GG || {});
