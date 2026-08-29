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
  Snd.musicGain = ctx.createGain(); Snd.musicGain.gain.value = 0;
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
  /* 曲の残響は必ず曲のバスを通す。1音ずつ直接 rev へ送ると、
   * 曲を黙らせても残響だけが鳴り続け、無音の場面が作れない。 */
  Snd.musicGain.connect(rev);

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
/* 曲がループしているだけでは音楽になっていない。必要なのは3つ。
 *   1. 口ずさめる旋律があること
 *   2. 場面でテンポと厚みが変わること（待ち受けと本番が同じ温度では困る）
 *   3. いちばん大事な瞬間に、音が止まること
 * 3が最重要。無音はいちばん強い緊張装置で、しかも一銭もかからない。 */

/* A ドリアン。i - IV - i - VII。短調の中に長調のIVが来るので、
 * Am-F-G-C という手垢のついた響きにならない。夜の屋上には少し明るすぎる
 * くらいがちょうどいい。 */
const PROG = [
  [45, [57, 60, 64]],   // Am
  [50, [57, 62, 66]],   // D   ← ドリアンの明るいIV。この曲の性格はここで決まる
  [45, [57, 60, 64]],   // Am
  [43, [55, 59, 62]]    // G
];

/* 動機。「い・っ・せ・い」の4音。5→6→1→5 と上がって主音に落ちる。
 * 2小節目でドリアンの6度（F#）を必ず踏む。ここがこの曲の指紋になる。
 * s = 8分音符いくつ目か（1小節=8）、n = MIDI、d = 長さ（8分いくつ分） */
const MOTIF = [
  { s:  0, n: 64, d: 1.0 },   // E
  { s:  2, n: 66, d: 0.5 },   // F#
  { s:  3, n: 69, d: 1.5 },   // A
  { s:  6, n: 64, d: 1.0 },   // E
  { s: 16, n: 64, d: 1.0 },
  { s: 18, n: 69, d: 0.5 },   // A
  { s: 19, n: 71, d: 1.5 },   // B
  { s: 22, n: 69, d: 2.0 }    // A
];

/* 場面ごとの層。全部を常に鳴らすと、静かな場面が作れない。 */
const MOOD = {
  lobby: { bpm:  96, drums: false, lead: true,  chord: .05, bass: .22, level: .26 },
  play:  { bpm: 132, drums: true,  lead: true,  chord: .07, bass: .30, level: .34 },
  tense: { bpm: 132, drums: true,  lead: false, chord: .04, bass: .30, level: .30 }
};
Snd.MOOD = MOOD; Snd.MOTIF = MOTIF; Snd.PROG = PROG;

/* 主旋律の声。ベースや和音と同じ音色だと旋律が埋もれる。
 * 少し歪んだ鋸波にローパスを当てて、上に浮かせる。 */
function lead(o) {
  const ctx = Snd.ctx, t = o.at;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 6;
  f.frequency.setValueAtTime(1500, t);
  f.frequency.exponentialRampToValueAtTime(2900, t + .05);
  f.frequency.exponentialRampToValueAtTime(1100, t + o.dur);
  for (const d of [-9, 9]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(N(o.n), t);
    osc.detune.value = d;
    osc.connect(f); osc.start(t); osc.stop(t + o.dur + .1);
  }
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + .012);
  g.gain.setValueAtTime(o.gain, t + o.dur * .7);
  g.gain.exponentialRampToValueAtTime(.0001, t + o.dur);
  f.connect(g); g.connect(Snd.musicGain);
}

Snd._mood = null;
Snd.music = function (on, bpm) {          // 旧名。呼び出し側が残っている間だけ
  Snd.mood(on ? 'play' : 'off');
};

Snd.mood = function (name) {
  if (!Snd.ctx) return;
  if (name === 'off') {
    if (Snd._music) { clearInterval(Snd._music.timer); Snd._music = null; }
    Snd._mood = null;
    Snd.musicGain.gain.setTargetAtTime(0, now(), .2);
    return;
  }
  const M = MOOD[name] || MOOD.play;
  if (Snd._mood === name) return;
  Snd._mood = name;
  Snd.musicGain.gain.cancelScheduledValues(now());
  Snd.musicGain.gain.setTargetAtTime(M.level, now(), .3);

  if (Snd._music) { Snd._music.M = M; return; }   // 走っている拍は切らさない

  const st = { next: now() + .1, step: 0, M: M };
  const schedule = () => {
    const m = st.M;
    const beat = 60 / m.bpm;
    while (st.next < now() + .4) {
      const t = st.next, s = st.step, inBar = s % 8;
      const bar = (s >> 3) % PROG.length;
      const [bass, chord] = PROG[bar];

      if (inBar === 0 || inBar === 3 || inBar === 6) {
        tone({ at: t, f0: N(bass - 12), dur: .34, gain: m.bass, type: 'triangle',
               cutoff: 700, bus: Snd.musicGain, wet: false, thick: false });
      }
      if (m.drums) {
        if (inBar === 0) noise({ at: t, type: 'lowpass', f0: 220, f1: 60, dur: .16, gain: .5, bus: Snd.musicGain });
        if (inBar === 4) noise({ at: t, f0: 2000, dur: .13, gain: .22, q: .6, bus: Snd.musicGain });
        if (s % 2 === 1) noise({ at: t, f0: 9000, dur: .035, gain: .09, q: .5, bus: Snd.musicGain });
      }
      tone({ at: t, f0: N(chord[s % chord.length] + 12), dur: .2, gain: m.chord,
             type: 'square', cutoff: 2600, bus: Snd.musicGain, thick: false });

      if (m.lead) {
        const pos = s % 32;
        for (const nt of MOTIF) {
          if (nt.s === pos) lead({ at: t, n: nt.n, dur: beat * nt.d * .92, gain: .18 });
        }
      }
      st.next += beat / 2;
      st.step++;
    }
  };
  schedule();
  st.timer = setInterval(schedule, 120);
  Snd._music = st;
};

/* 完全に黙らせる。「せーの！」の直前はここを呼ぶ。
 * 音を小さくするのでは足りない。ゼロにしないと客は息を止めない。 */
Snd.hush = function (sec) {
  if (!Snd.ctx) return;
  const g = Snd.musicGain.gain;
  g.cancelScheduledValues(now());
  g.setTargetAtTime(0, now(), .05);
  Snd._hushUntil = now() + (sec || 1.2);
  clearTimeout(Snd._hushT);
  Snd._hushT = setTimeout(() => {
    const M = MOOD[Snd._mood] || MOOD.play;
    if (Snd._mood) Snd.musicGain.gain.setTargetAtTime(M.level, now(), .25);
  }, (sec || 1.2) * 1000);
};

Snd.duck = function (amount, sec) {
  if (!Snd.ctx) return;
  const M = MOOD[Snd._mood] || MOOD.play;
  const g = Snd.musicGain.gain;
  g.cancelScheduledValues(now());
  g.setTargetAtTime(M.level * (1 - amount), now(), .03);
  g.setTargetAtTime(M.level, now() + (sec || .5), .25);
};

window.Snd = Snd;
