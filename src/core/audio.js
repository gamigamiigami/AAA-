/* MICRO MANIA — core/audio.js
 * WebAudio による完全手続き生成のサウンド。外部音源ファイルは一切使わない。
 *
 * 重要: ビートクロックもここが持つ。演出とゲーム進行を全て同じビートに乗せることで
 * 「リズムに合っている」手触りを作る（音が鳴らない環境では実時間にフォールバック）。 */
(function (GG) {
  'use strict';
  var U = GG.U;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 1 小節 = 16 ステップ。4 小節ループ。
  var BARS = [
    { bass: 45, arp: [69, 72, 76, 72], pad: [57, 60, 64] },
    { bass: 41, arp: [65, 69, 72, 69], pad: [53, 57, 60] },
    { bass: 48, arp: [67, 72, 76, 72], pad: [55, 60, 64] },
    { bass: 43, arp: [67, 71, 74, 71], pad: [55, 59, 62] }
  ];
  var KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  var SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
  var HAT = [2, 0, 1, 0, 2, 0, 1, 1, 2, 0, 1, 0, 2, 0, 1, 1];
  var BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];

  function Audio() {
    this.ctx = null;
    this.ok = false;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.bpm = 132;
    this.beat = 0;
    this._lastT = null;
    this._src = 'perf';
    this._noise = null;
    this._musicOn = false;
    this._step = 0;          // 次に鳴らす 16分ステップの通し番号
    this._stepBeat = 0;      // そのステップのビート位置
    this.intensity = 1;
    this.muted = false;
  }
  var P = Audio.prototype;

  P.init = function () {
    if (this.ctx) { this.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      var c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      var comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 24;
      comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);

      this.musicGain = c.createGain(); this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);
      this.sfxGain = c.createGain(); this.sfxGain.gain.value = 0.75;
      this.sfxGain.connect(this.master);

      // 再利用するノイズバッファ
      var len = c.sampleRate * 1.2, buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0), rng = new U.RNG(20240808);
      for (var i = 0; i < len; i++) d[i] = rng.f() * 2 - 1;
      this._noise = buf;
      this.ok = true;
    } catch (e) { this.ok = false; }
    this.resume();
  };

  P.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };
  P.setMuted = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  };

  P._now = function () {
    if (this.ctx && this.ctx.state === 'running') {
      if (this._src !== 'ctx') { this._src = 'ctx'; this._lastT = null; }
      return this.ctx.currentTime;
    }
    if (this._src !== 'perf') { this._src = 'perf'; this._lastT = null; }
    return performance.now() / 1000;
  };

  /** 毎フレーム 1 回呼ぶ。ビートを進め、先読みで音符をスケジュールする。 */
  P.tick = function () {
    var t = this._now();
    if (this._lastT === null) this._lastT = t;
    var dt = t - this._lastT;
    if (dt < 0 || dt > 0.5) dt = 0;      // タブ復帰などの飛びを無視
    this._lastT = t;
    this.beat += dt * this.bpm / 60;
    if (this._musicOn && this.ok) this._schedule();
  };

  P.setBpm = function (b) { this.bpm = b; };
  P.startMusic = function () {
    if (!this.ok) { this._musicOn = true; return; }
    this._musicOn = true;
    this._stepBeat = Math.ceil(this.beat * 4) / 4;
    this._step = Math.round(this._stepBeat * 4);
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.15);
  };
  P.stopMusic = function () {
    this._musicOn = false;
    if (this.ok) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  };
  P.duck = function (amount, time) {
    if (!this.ok || !this._musicOn) return;
    var g = this.musicGain.gain, n = this.ctx.currentTime;
    g.cancelScheduledValues(n);
    g.setValueAtTime(0.3 * (1 - amount), n);
    g.setTargetAtTime(0.3, n + (time || 0.25), 0.2);
  };

  P._schedule = function () {
    var look = 0.5; // ビート単位の先読み
    var guard = 0;
    while (this._stepBeat < this.beat + look && guard++ < 64) {
      var when = this.ctx.currentTime + (this._stepBeat - this.beat) * 60 / this.bpm;
      if (when > this.ctx.currentTime) this._playStep(this._step, when);
      this._step++;
      this._stepBeat += 0.25;
    }
  };

  P._playStep = function (step, t) {
    var s = step % 16, bar = BARS[Math.floor(step / 16) % 4];
    var I = this.intensity;
    if (KICK[s]) this._kick(t);
    if (SNARE[s] && I > 0.3) this._snare(t, SNARE[s] === 1 ? 1 : 0.6);
    if (HAT[s] && I > 0.15) this._hat(t, HAT[s] === 2 ? 0.5 : 0.26);
    if (BASS[s]) {
      var oct = (s === 6 || s === 13) ? 12 : 0;
      this._bass(t, mtof(bar.bass + oct));
    }
    if (I > 0.6 && s % 2 === 0) {
      var n = bar.arp[(s / 2) % 4];
      this._arp(t, mtof(n + (Math.floor(s / 8) === 1 ? 12 : 0)), 0.09 * (I - 0.6) / 0.4);
    }
  };

  // --- 音色 -----------------------------------------------------------
  P._osc = function (type, freq, t, dur, vol, dest, detune) {
    var c = this.ctx;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    g.gain.setValueAtTime(0, t);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
    return { o: o, g: g };
  };

  P._kick = function (t) {
    var c = this.ctx, n = this._osc('sine', 130, t, 0.3, 1, this.musicGain);
    n.o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    n.g.gain.linearRampToValueAtTime(0.9, t + 0.004);
    n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  };
  P._snare = function (t, v) {
    var c = this.ctx;
    var s = c.createBufferSource(); s.buffer = this._noise;
    s.playbackRate.value = 1.6;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    var g = c.createGain();
    g.gain.setValueAtTime(0.5 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t, 0.3); s.stop(t + 0.2);
    var tn = this._osc('triangle', 210, t, 0.1, 1, this.musicGain);
    tn.g.gain.setValueAtTime(0.22 * v, t);
    tn.g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  };
  P._hat = function (t, v) {
    var c = this.ctx;
    var s = c.createBufferSource(); s.buffer = this._noise; s.playbackRate.value = 3.2;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8200;
    var g = c.createGain();
    g.gain.setValueAtTime(0.14 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.musicGain);
    s.start(t, 0.5); s.stop(t + 0.08);
  };
  P._bass = function (t, f) {
    var c = this.ctx;
    var n = this._osc('sawtooth', f, t, 0.2, 1, null);
    var flt = c.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(340, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + 0.16);
    flt.Q.value = 6;
    n.g.disconnect(); n.g.connect(flt); flt.connect(this.musicGain);
    n.g.gain.linearRampToValueAtTime(0.34, t + 0.008);
    n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
  };
  P._arp = function (t, f, v) {
    var n = this._osc('square', f, t, 0.14, 1, this.musicGain);
    n.g.gain.linearRampToValueAtTime(v, t + 0.006);
    n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  };

  /** 汎用トーン（SFX 用） */
  P.tone = function (o) {
    if (!this.ok) return;
    this.resume();
    var c = this.ctx, t = c.currentTime + (o.delay || 0);
    var dur = o.dur || 0.15;
    var n = this._osc(o.type || 'square', o.f || 440, t, dur, 1, o.dest || this.sfxGain);
    if (o.f2) n.o.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur * (o.slide || 1));
    var v = (o.v === undefined ? 0.3 : o.v);
    n.g.gain.linearRampToValueAtTime(v, t + (o.atk || 0.006));
    n.g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  };
  P.noise = function (o) {
    if (!this.ok) return;
    this.resume();
    var c = this.ctx, t = c.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    var s = c.createBufferSource(); s.buffer = this._noise;
    s.playbackRate.value = o.rate || 1;
    var f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1200, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.f2), t + dur);
    f.Q.value = o.q === undefined ? 1 : o.q;
    var g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.v === undefined ? 0.3 : o.v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t, 0.1); s.stop(t + dur + 0.05);
  };

  // --- 効果音 ---------------------------------------------------------
  var SFX = {
    click: function (a) { a.tone({ type: 'square', f: 900, f2: 1500, dur: 0.06, v: 0.2 }); },
    select: function (a) {
      a.tone({ type: 'square', f: 660, dur: 0.07, v: 0.22 });
      a.tone({ type: 'square', f: 990, dur: 0.1, v: 0.2, delay: 0.06 });
    },
    pop: function (a) { a.tone({ type: 'sine', f: 500, f2: 1400, dur: 0.09, v: 0.32 }); },
    blip: function (a) { a.tone({ type: 'triangle', f: 1200, f2: 800, dur: 0.07, v: 0.22 }); },
    coin: function (a) {
      a.tone({ type: 'square', f: 988, dur: 0.06, v: 0.2 });
      a.tone({ type: 'square', f: 1319, dur: 0.16, v: 0.2, delay: 0.055 });
    },
    jump: function (a) { a.tone({ type: 'triangle', f: 320, f2: 760, dur: 0.15, v: 0.3 }); },
    land: function (a) { a.noise({ f: 300, f2: 120, dur: 0.12, v: 0.24, filter: 'lowpass', rate: 0.7 }); },
    hit: function (a) {
      a.noise({ f: 900, f2: 200, dur: 0.16, v: 0.34, rate: 1.4, q: 0.7 });
      a.tone({ type: 'square', f: 180, f2: 60, dur: 0.14, v: 0.24 });
    },
    thud: function (a) { a.tone({ type: 'sine', f: 160, f2: 50, dur: 0.2, v: 0.4 }); },
    whoosh: function (a) { a.noise({ f: 400, f2: 3000, dur: 0.25, v: 0.16, q: 0.6, rate: 1.2 }); },
    slice: function (a) { a.noise({ f: 3000, f2: 700, dur: 0.14, v: 0.3, q: 1.6, rate: 2 }); },
    charge: function (a) { a.tone({ type: 'sawtooth', f: 200, f2: 700, dur: 0.5, v: 0.12 }); },
    tick: function (a) { a.tone({ type: 'square', f: 1600, dur: 0.035, v: 0.3 }); },
    tock: function (a) { a.tone({ type: 'square', f: 1100, dur: 0.05, v: 0.32 }); },
    win: function (a) {
      [0, 4, 7, 12].forEach(function (n, i) {
        a.tone({ type: 'square', f: 440 * Math.pow(2, n / 12), dur: 0.16, v: 0.24, delay: i * 0.055 });
      });
    },
    lose: function (a) {
      a.tone({ type: 'sawtooth', f: 320, f2: 90, dur: 0.42, v: 0.26 });
      a.tone({ type: 'square', f: 160, f2: 50, dur: 0.42, v: 0.16, delay: 0.02 });
    },
    life: function (a) {
      a.tone({ type: 'triangle', f: 700, f2: 120, dur: 0.5, v: 0.3 });
      a.noise({ f: 2000, f2: 300, dur: 0.3, v: 0.2 });
    },
    levelup: function (a) {
      [0, 5, 9, 12, 16].forEach(function (n, i) {
        a.tone({ type: 'square', f: 523.25 * Math.pow(2, n / 12), dur: 0.2, v: 0.24, delay: i * 0.075 });
      });
    },
    boss: function (a) {
      a.tone({ type: 'sawtooth', f: 110, dur: 0.7, v: 0.3 });
      a.tone({ type: 'sawtooth', f: 164.8, dur: 0.7, v: 0.22, delay: 0.005 });
      a.noise({ f: 200, f2: 1800, dur: 0.6, v: 0.14, q: 0.5 });
    },
    gameover: function (a) {
      [0, -2, -4, -9].forEach(function (n, i) {
        a.tone({ type: 'square', f: 392 * Math.pow(2, n / 12), dur: 0.34, v: 0.24, delay: i * 0.19 });
      });
    },
    speedup: function (a) {
      a.tone({ type: 'square', f: 300, f2: 1500, dur: 0.45, v: 0.2, slide: 0.8 });
      a.noise({ f: 600, f2: 4000, dur: 0.45, v: 0.14 });
    }
  };

  P.sfx = function (name) {
    var f = SFX[name];
    if (f && this.ok) { this.resume(); f(this); }
  };

  GG.Audio = Audio;
})(window.GG = window.GG || {});
