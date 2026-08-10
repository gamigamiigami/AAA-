/**
 * Audio — everything is synthesised at runtime. No audio files ship with this
 * game, so it works offline and starts instantly.
 *
 * Two things keep procedural audio from sounding cheap, and both live here:
 *   - a generated convolution reverb, so notes sit in a space instead of
 *     firing dry out of the speaker;
 *   - a master compressor, so the mix stays glued when a win jingle lands on
 *     top of the music.
 *
 * The AudioContext clock is also the game's master clock (see Conductor): the
 * music and the gameplay must not be able to drift apart.
 */

/** MIDI note -> Hz */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Per-stage musical identity. Each stage gets its own scale, chord loop, drum
 * feel and lead timbre so the three worlds sound as different as they look.
 */
const SONGS = {
  town: {
    root: 60,
    scale: [0, 2, 4, 7, 9], // major pentatonic — sunny, cannot sound wrong
    chords: [
      [0, 4, 7],
      [7, 11, 14],
      [9, 12, 16],
      [5, 9, 12],
    ],
    lead: 'triangle',
    bass: 'sine',
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1],
    arp: [0, 2, 4, 2, 3, 4, 2, 0],
    leadGain: 0.1,
  },
  neon: {
    root: 57,
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor — night city
    chords: [
      [0, 3, 7],
      [8, 12, 15],
      [3, 7, 10],
      [10, 14, 17],
    ],
    lead: 'sawtooth',
    bass: 'square',
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    arp: [0, 4, 6, 4, 7, 6, 4, 2],
    leadGain: 0.075,
  },
  forest: {
    root: 62,
    scale: [0, 2, 3, 5, 7, 9, 10], // dorian — mysterious but still friendly
    chords: [
      [0, 3, 7],
      [5, 9, 12],
      [2, 5, 9],
      [7, 10, 14],
    ],
    lead: 'triangle',
    bass: 'sine',
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
    arp: [0, 3, 5, 7, 5, 3, 5, 2],
    leadGain: 0.085,
  },
};

export function createAudio() {
  /** @type {AudioContext|null} */
  let actx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let reverbSend = null;
  let unlocked = false;
  let muted = false;

  let playing = false;
  let song = SONGS.town;
  let nextStep = 0; // 16th-note index
  let intensity = 1; // 0..1, rises with the difficulty ramp

  const fallbackStart = performance.now() / 1000;

  /** Build a decaying-noise impulse response: a cheap, decent room. */
  function makeImpulse(ctx, seconds = 1.4, decay = 3.2) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let seed = 0x9e3779b9 ^ (ch * 0x85ebca6b);
      for (let i = 0; i < len; i++) {
        // Deterministic LCG: the reverb tail is identical every run.
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = (seed / 4294967296) * 2 - 1;
        data[i] = white * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function ensureContext() {
    if (actx) return actx;
    const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) return null;
    actx = new Ctor();

    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(comp);
    comp.connect(actx.destination);

    musicBus = actx.createGain();
    musicBus.gain.value = 0.62;
    musicBus.connect(master);

    sfxBus = actx.createGain();
    sfxBus.gain.value = 0.95;
    sfxBus.connect(master);

    const convolver = actx.createConvolver();
    convolver.buffer = makeImpulse(actx);
    reverbSend = actx.createGain();
    reverbSend.gain.value = 1;
    const wet = actx.createGain();
    wet.gain.value = 0.3;
    reverbSend.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);

    return actx;
  }

  /* ------------------------------------------------------------- voices */

  /** Pitched voice with an envelope and optional pitch bend. */
  function tone(o) {
    if (!actx || muted) return;
    const t = o.t ?? actx.currentTime;
    const dur = o.dur ?? 0.2;
    const osc = actx.createOscillator();
    osc.type = o.type ?? 'triangle';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.bendTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.bendTo), t + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);

    const g = actx.createGain();
    const peak = o.gain ?? 0.2;
    const atk = o.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let node = /** @type {AudioNode} */ (osc);
    if (o.filter) {
      const f = actx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.filterFreq ?? 1200, t);
      if (o.filterTo) f.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur);
      f.Q.value = o.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest ?? sfxBus);
    if (o.send) {
      const s = actx.createGain();
      s.gain.value = o.send;
      g.connect(s);
      s.connect(reverbSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered noise burst — drums, whooshes, impacts. */
  function noise(o) {
    if (!actx || muted) return;
    const t = o.t ?? actx.currentTime;
    const dur = o.dur ?? 0.12;
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = (o.seed ?? 12345) >>> 0;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    const src = actx.createBufferSource();
    src.buffer = buf;

    const f = actx.createBiquadFilter();
    f.type = o.type ?? 'highpass';
    f.frequency.setValueAtTime(o.freq ?? 1800, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t + dur);
    f.Q.value = o.q ?? 0.8;

    const g = actx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, o.gain ?? 0.2), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f);
    f.connect(g);
    g.connect(o.dest ?? sfxBus);
    if (o.send) {
      const s = actx.createGain();
      s.gain.value = o.send;
      g.connect(s);
      s.connect(reverbSend);
    }
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---------------------------------------------------------------- sfx */

  /** @type {Record<string, (t:number)=>void>} */
  const BANK = {
    tap: (t) => tone({ t, freq: 880, dur: 0.07, type: 'square', gain: 0.11, bendTo: 1180 }),
    cursor: (t) => tone({ t, freq: 620, dur: 0.06, type: 'square', gain: 0.09 }),
    select: (t) => {
      tone({ t, freq: 740, dur: 0.09, type: 'square', gain: 0.13, send: 0.2 });
      tone({ t: t + 0.07, freq: 1110, dur: 0.14, type: 'square', gain: 0.12, send: 0.25 });
    },
    back: (t) => tone({ t, freq: 420, dur: 0.11, type: 'square', gain: 0.1, bendTo: 280 }),
    pop: (t) => tone({ t, freq: 1200, dur: 0.06, type: 'sine', gain: 0.16, bendTo: 2000 }),
    blip: (t) => tone({ t, freq: 1500, dur: 0.05, type: 'square', gain: 0.09 }),
    coin: (t) => {
      tone({ t, freq: mtof(88), dur: 0.06, type: 'square', gain: 0.1 });
      tone({ t: t + 0.05, freq: mtof(95), dur: 0.16, type: 'square', gain: 0.1, send: 0.3 });
    },
    hit: (t) => {
      tone({ t, freq: 420, dur: 0.09, type: 'square', gain: 0.16, bendTo: 180 });
      noise({ t, dur: 0.08, type: 'bandpass', freq: 2200, gain: 0.14, q: 1.2 });
    },
    wrong: (t) => {
      tone({
        t,
        freq: 200,
        dur: 0.22,
        type: 'sawtooth',
        gain: 0.14,
        bendTo: 120,
        filter: 'lowpass',
        filterFreq: 900,
      });
    },
    bounce: (t) => tone({ t, freq: 300, dur: 0.12, type: 'sine', gain: 0.16, bendTo: 700 }),
    sparkle: (t) => {
      [96, 100, 103].forEach((m, i) =>
        tone({ t: t + i * 0.04, freq: mtof(m), dur: 0.14, type: 'sine', gain: 0.08, send: 0.4 }),
      );
    },
    thud: (t) => {
      tone({ t, freq: 150, dur: 0.16, type: 'sine', gain: 0.3, bendTo: 50 });
      noise({ t, dur: 0.1, type: 'lowpass', freq: 700, gain: 0.16 });
    },
    whoosh: (t) =>
      noise({ t, dur: 0.26, type: 'bandpass', freq: 320, freqTo: 2600, gain: 0.12, q: 1.4 }),
    swipe: (t) =>
      noise({ t, dur: 0.18, type: 'bandpass', freq: 900, freqTo: 3400, gain: 0.13, q: 2 }),
    tick: (t) => tone({ t, freq: 1600, dur: 0.035, type: 'square', gain: 0.09 }),

    /** Order card slams in. Percussive: it is the "look up" cue. */
    card: (t) => {
      noise({ t, dur: 0.2, type: 'bandpass', freq: 2400, freqTo: 500, gain: 0.16, q: 1.2 });
      tone({ t, freq: 300, dur: 0.2, type: 'square', gain: 0.16, bendTo: 140, send: 0.25 });
    },

    win: (t) => {
      [72, 76, 79, 84].forEach((m, i) =>
        tone({ t: t + i * 0.055, freq: mtof(m), dur: 0.3, type: 'square', gain: 0.13, send: 0.4 }),
      );
    },

    lose: (t) => {
      tone({
        t,
        freq: mtof(60),
        dur: 0.42,
        type: 'sawtooth',
        gain: 0.13,
        bendTo: mtof(46),
        filter: 'lowpass',
        filterFreq: 1400,
        filterTo: 320,
        send: 0.3,
      });
      noise({ t, dur: 0.3, type: 'lowpass', freq: 900, freqTo: 200, gain: 0.1 });
    },

    lifeLost: (t) => {
      tone({ t, freq: mtof(74), dur: 0.12, type: 'square', gain: 0.14 });
      tone({ t: t + 0.1, freq: mtof(67), dur: 0.26, type: 'square', gain: 0.13, send: 0.35 });
    },

    speedUp: (t) => {
      tone({
        t,
        freq: mtof(60),
        dur: 0.7,
        type: 'sawtooth',
        gain: 0.11,
        bendTo: mtof(84),
        filter: 'lowpass',
        filterFreq: 600,
        filterTo: 5200,
        send: 0.4,
      });
      noise({ t, dur: 0.7, type: 'bandpass', freq: 400, freqTo: 5000, gain: 0.08, q: 2 });
    },

    boss: (t) => {
      [0, 0.14, 0.28].forEach((d, i) => {
        tone({
          t: t + d,
          freq: mtof(41 + i * 3),
          dur: 0.3,
          type: 'sawtooth',
          gain: 0.16,
          filter: 'lowpass',
          filterFreq: 1600,
          send: 0.35,
        });
      });
      noise({ t: t + 0.28, dur: 0.5, type: 'lowpass', freq: 1400, freqTo: 300, gain: 0.14 });
    },

    fanfare: (t) => {
      [67, 72, 76, 79, 84].forEach((m, i) =>
        tone({ t: t + i * 0.09, freq: mtof(m), dur: 0.5, type: 'square', gain: 0.12, send: 0.45 }),
      );
    },

    gameOver: (t) => {
      [72, 68, 65, 60].forEach((m, i) =>
        tone({
          t: t + i * 0.17,
          freq: mtof(m),
          dur: 0.45,
          type: 'triangle',
          gain: 0.15,
          send: 0.4,
        }),
      );
    },
  };

  /* -------------------------------------------------------------- music */

  function playStep(step, t) {
    if (!actx || muted) return;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = song.chords[bar];
    const dest = musicBus;

    if (song.kick[s]) tone({ t, freq: 150, dur: 0.2, type: 'sine', gain: 0.42, bendTo: 45, dest });
    if (song.snare[s]) {
      noise({
        t,
        dur: 0.16,
        type: 'highpass',
        freq: 1400,
        gain: 0.16,
        dest,
        send: 0.18,
        seed: step * 7919,
      });
      tone({ t, freq: 240, dur: 0.1, type: 'triangle', gain: 0.12, bendTo: 160, dest });
    }
    if (song.hat[s] && intensity > 0.25) {
      noise({
        t,
        dur: s % 4 === 0 ? 0.05 : 0.03,
        type: 'highpass',
        freq: 7200,
        gain: 0.05 * intensity,
        dest,
        seed: step * 104729,
      });
    }

    if (s % 2 === 0) {
      tone({
        t,
        freq: mtof(song.root - 24 + chord[0]),
        dur: 0.16,
        type: song.bass,
        gain: 0.2,
        dest,
        filter: 'lowpass',
        filterFreq: 900,
      });
    }

    if (s === 0) {
      chord.forEach((iv, i) => {
        tone({
          t,
          freq: mtof(song.root + iv),
          dur: 1.6,
          type: 'triangle',
          gain: 0.055,
          dest,
          send: 0.5,
          detune: (i - 1) * 5,
        });
      });
    }

    if (intensity > 0.45 && s % 2 === 0) {
      const idx = song.arp[(step / 2) % song.arp.length];
      const deg = song.scale[idx % song.scale.length] + 12 * Math.floor(idx / song.scale.length);
      tone({
        t,
        freq: mtof(song.root + 12 + deg),
        dur: 0.13,
        type: song.lead,
        gain: song.leadGain * intensity,
        dest,
        send: 0.35,
        filter: 'lowpass',
        filterFreq: 3200,
      });
    }
  }

  /* --------------------------------------------------------------- API */

  const audio = {
    /** Master clock. Falls back to wall time until the context exists. */
    now() {
      return actx ? actx.currentTime : performance.now() / 1000 - fallbackStart;
    },

    get ready() {
      return unlocked;
    },
    get context() {
      return actx;
    },

    /**
     * Must be called from a real user gesture (the title screen tap).
     * Returns the new clock value so the Conductor can rebase onto it.
     */
    async unlock() {
      const ctx = ensureContext();
      if (!ctx) return null;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          return null;
        }
      }
      unlocked = ctx.state === 'running';
      return unlocked ? ctx.currentTime : null;
    },

    setMuted(v) {
      muted = v;
      if (master) master.gain.value = v ? 0 : 0.85;
    },
    get muted() {
      return muted;
    },

    /** @param {string} name @param {{delay?:number}} [o] */
    sfx(name, o = {}) {
      if (!actx || muted) return;
      const fn = BANK[name];
      if (fn) fn(actx.currentTime + (o.delay ?? 0));
    },

    /** @param {'town'|'neon'|'forest'} stageId */
    setSong(stageId) {
      song = SONGS[stageId] ?? SONGS.town;
    },

    /** 0..1 — thins the arrangement on menus, fills it in as a run heats up. */
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
    },

    startMusic(conductor) {
      if (!actx) return;
      playing = true;
      nextStep = Math.ceil(conductor.beat * 4);
    },

    stopMusic() {
      playing = false;
    },

    duckMusic(amount = 0.4, seconds = 0.35) {
      if (!musicBus || !actx) return;
      const t = actx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(0.62 * amount, t + 0.04);
      musicBus.gain.linearRampToValueAtTime(0.62, t + seconds);
    },

    /**
     * Lookahead scheduler. Called once per frame; queues every 16th note that
     * falls inside the next ~0.4 beats at its exact audio time, so the groove
     * is sample-accurate even when the render loop stutters.
     */
    update(conductor) {
      if (!playing || !actx) return;
      const horizon = conductor.beat + 0.4;
      let guard = 0;
      while (nextStep / 4 < horizon && guard++ < 64) {
        const t = conductor.timeOfBeat(nextStep / 4);
        if (t > actx.currentTime - 0.02) playStep(nextStep, Math.max(t, actx.currentTime));
        nextStep++;
      }
    },
  };

  return audio;
}
