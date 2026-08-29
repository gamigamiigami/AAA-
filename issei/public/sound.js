/* 一斉 — 音。
 *
 * 単発のサイン波は「音が鳴る」の確認であって効果音ではない。
 * 実際の効果音は必ず層でできている ——
 *   立ち上がりのノイズ（アタック） + 音程のある胴体 + ピッチの動き。
 * ここでは全部その形で組む。素材ファイルは使わず、その場で合成する。
 */
'use strict';

const Snd = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  noiseBuf: null, started: false, _music: null
};

Snd.init = function () {
  if (Snd.ctx) { Snd.ctx.resume(); return Snd.ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = Snd.ctx = new AC();

  Snd.master = ctx.createGain();
  Snd.master.gain.value = 0.9;
  // 全体を軽く潰す。パーティ用途では音量差が激しいと聞き取れない。
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24;
  comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .18;
  Snd.master.connect(comp); comp.connect(ctx.destination);

  Snd.sfxGain = ctx.createGain(); Snd.sfxGain.gain.value = 1;
  Snd.musicGain = ctx.createGain(); Snd.musicGain.gain.value = .34;
  Snd.sfxGain.connect(Snd.master); Snd.musicGain.connect(Snd.master);

  // 短い残響。乾いた音のままだと安っぽく聞こえる。
  const len = Math.floor(ctx.sampleRate * 1.1);
  const imp = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = imp.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  const rev = ctx.createConvolver(); rev.buffer = imp;
  const revGain = ctx.createGain(); revGain.gain.value = .18;
  rev.connect(revGain); revGain.connect(Snd.master);
  Snd.rev = rev;

  // ノイズ源（打楽器用）
  const nlen = ctx.sampleRate * 2;
  const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  Snd.noiseBuf = nb;

  return ctx;
};

function now() { return Snd.ctx.currentTime; }

/* 音程のある層。detune した2本を重ねると、1本より格段に厚くなる。 */
function tone(o) {
  const ctx = Snd.ctx, t = o.at || now();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(o.cutoff || 5200, t);
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);

  const oscs = [];
  const det = o.detune === undefined ? 7 : o.detune;
  for (const d of (o.thick === false ? [0] : [-det, det])) {
    const osc = ctx.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur * (o.bendIn || 1));
    osc.detune.value = d;
    osc.connect(f); osc.start(t); osc.stop(t + o.dur + .12);
    oscs.push(osc);
  }
  const peak = o.gain === undefined ? .3 : o.gain;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack || .006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  f.connect(g);
  g.connect(o.bus || Snd.sfxGain);
  if (Snd.rev && o.wet !== false) g.connect(Snd.rev);
  return g;
}

/* 打楽器層。帯域を絞ったノイズの立ち上がり。 */
function noise(o) {
  const ctx = Snd.ctx, t = o.at || now();
  const src = ctx.createBufferSource();
  src.buffer = Snd.noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.f0 || 2400, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  f.Q.value = o.q === undefined ? 1.2 : o.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain === undefined ? .3 : o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(o.bus || Snd.sfxGain);
  src.start(t); src.stop(t + o.dur + .05);
}

// ---------------------------------------------------------------- 効果音
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 番号 → Hz
Snd.note = N;

Snd.sfx = function (name, at) {
  if (!Snd.ctx) return;
  const t = at || now();
  switch (name) {
    case 'tick':        // 予告の拍
      noise({ at: t, f0: 3000, f1: 1400, dur: .05, gain: .18, q: .8 });
      tone({ at: t, f0: N(76), dur: .09, gain: .1, type: 'square', thick: false });
      break;
    case 'beat':        // 目標の瞬間。拍より重く
      noise({ at: t, f0: 5200, f1: 1800, dur: .09, gain: .3, q: .7 });
      tone({ at: t, f0: N(88), f1: N(83), dur: .22, gain: .24, type: 'triangle' });
      tone({ at: t, f0: N(64), dur: .3, gain: .18, type: 'sine', thick: false });
      break;
    case 'tap':         // 押した手応え
      noise({ at: t, f0: 4200, f1: 2000, dur: .04, gain: .22 });
      tone({ at: t, f0: N(81), f1: N(88), dur: .1, gain: .2, type: 'square', bendIn: .5 });
      break;
    case 'chant':       // だるまさんの掛け声
      tone({ at: t, f0: N(62), f1: N(64), dur: .3, gain: .16, type: 'sawtooth', cutoff: 1400 });
      noise({ at: t, f0: 1200, dur: .12, gain: .07, q: .6 });
      break;
    case 'turn':        // 振り向いた
      noise({ at: t, f0: 900, f1: 200, dur: .3, gain: .3, q: .5 });
      tone({ at: t, f0: N(55), f1: N(43), dur: .45, gain: .3, type: 'sawtooth', cutoff: 2200, sweepTo: 300 });
      break;
    case 'step':        // 一歩進む
      noise({ at: t, f0: 700, f1: 300, dur: .07, gain: .12, q: 1.5 });
      break;
    case 'win': {       // 成功のジングル。分散和音で上がる
      const seq = [64, 68, 71, 76, 83];
      seq.forEach((n, i) => {
        tone({ at: t + i * .07, f0: N(n), dur: .5 - i * .05, gain: .26, type: 'triangle' });
        if (i === seq.length - 1)
          tone({ at: t + i * .07, f0: N(n - 12), dur: .7, gain: .18, type: 'sine', thick: false });
      });
      noise({ at: t, f0: 6000, f1: 2500, dur: .5, gain: .1, q: .4 });
      break;
    }
    case 'lose': {      // 失敗。半音下げて落とす
      [64, 63, 62, 57].forEach((n, i) =>
        tone({ at: t + i * .1, f0: N(n), dur: .34, gain: .24, type: 'sawtooth', cutoff: 1800 }));
      break;
    }
    case 'join':
      tone({ at: t, f0: N(72), f1: N(79), dur: .18, gain: .2, type: 'triangle', bendIn: .6 });
      break;
    case 'countdown':
      tone({ at: t, f0: N(69), dur: .14, gain: .2, type: 'square', thick: false });
      break;
  }
};

// ---------------------------------------------------------------- 音楽
/* 待ち受け〜プレイ中に薄く流す。ベース + 和音 + 裏拍のハット。
 * 拍が画面と揃うので、リズムの手掛かりにもなる。 */
const PROG = [
  [45, [57, 60, 64]],   // Am
  [41, [53, 57, 60]],   // F
  [43, [55, 59, 62]],   // G
  [40, [52, 55, 60]]    // C/E
];

Snd.music = function (on, bpm) {
  if (!Snd.ctx) return;
  if (!on) {
    if (Snd._music) { clearInterval(Snd._music.timer); Snd._music = null; }
    Snd.musicGain.gain.setTargetAtTime(0, now(), .2);
    return;
  }
  if (Snd._music) return;
  Snd.musicGain.gain.setTargetAtTime(.34, now(), .3);

  const beat = 60 / (bpm || 120);
  const st = { next: now() + .1, step: 0 };
  const schedule = () => {
    while (st.next < now() + .4) {
      const t = st.next, s = st.step;
      const bar = (s >> 3) % PROG.length;
      const [bass, chord] = PROG[bar];

      if (s % 8 === 0 || s % 8 === 3 || s % 8 === 6) {
        tone({ at: t, f0: N(bass - 12), dur: .34, gain: .3, type: 'triangle',
               cutoff: 700, bus: Snd.musicGain, wet: false, thick: false });
      }
      if (s % 8 === 0) {  // キック
        noise({ at: t, type: 'lowpass', f0: 220, f1: 60, dur: .16, gain: .5, bus: Snd.musicGain });
      }
      if (s % 8 === 4) {  // スネア
        noise({ at: t, f0: 2000, dur: .13, gain: .22, q: .6, bus: Snd.musicGain });
      }
      if (s % 2 === 1) {  // 裏拍のハット
        noise({ at: t, f0: 9000, dur: .035, gain: .09, q: .5, bus: Snd.musicGain });
      }
      // 和音を分散で
      const n = chord[s % chord.length];
      tone({ at: t, f0: N(n + 12), dur: .2, gain: .07, type: 'square',
             cutoff: 2600, bus: Snd.musicGain, thick: false });

      st.next += beat / 2;
      st.step++;
    }
  };
  schedule();
  st.timer = setInterval(schedule, 120);
  Snd._music = st;
};

Snd.duck = function (amount, sec) {
  if (!Snd.ctx) return;
  const g = Snd.musicGain.gain;
  g.cancelScheduledValues(now());
  g.setTargetAtTime(.34 * (1 - amount), now(), .03);
  g.setTargetAtTime(.34, now() + (sec || .5), .25);
};

window.Snd = Snd;
