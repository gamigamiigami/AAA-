/**
 * Conductor — the master clock, measured in BEATS rather than seconds.
 *
 * This is the spine of the whole game. Microgame length, prompt cards,
 * transitions, character animation and the difficulty ramp are all expressed in
 * beats, so everything on screen lands on the music instead of merely running
 * next to it.
 *
 * The clock source is the audio hardware clock when audio is live (it does not
 * drift against the notes we schedule) and performance.now() before the first
 * user gesture unlocks audio. The handover is continuous: `rebase()` keeps the
 * beat number identical across the switch.
 */

/**
 * @param {() => number} clock  monotonic seconds from the active time source
 */
export function createConductor(clock) {
  // Current tempo segment: at time t0 the song was at beat b0, running at bpm.
  let t0 = clock();
  let b0 = 0;
  let bpm = 120;

  let lastBeat = 0;
  /** @type {{beat:number, fn:() => void}[]} */
  let scheduled = [];

  const beatAt = (t) => b0 + ((t - t0) * bpm) / 60;
  const timeOfBeat = (b) => t0 + ((b - b0) * 60) / bpm;

  const conductor = {
    /** Beat sampled once per frame — read this, never recompute mid-frame. */
    beat: 0,
    /** Beats elapsed since the previous frame. */
    dtBeats: 0,
    get secPerBeat() {
      return 60 / bpm;
    },
    get bpm() {
      return bpm;
    },
    get bar() {
      return Math.floor(conductor.beat / 4);
    },
    /** 0..1 position within the current beat — handy for pulse animations. */
    get beatPhase() {
      return conductor.beat % 1;
    },

    beatAt,
    timeOfBeat,
    now: clock,

    /**
     * Change tempo without the beat number jumping.
     * @param {number} nextBpm
     * @param {number} [at] audio time to switch at; defaults to now
     */
    setBpm(nextBpm, at) {
      const t = at === undefined ? clock() : at;
      b0 = beatAt(t);
      t0 = t;
      bpm = nextBpm;
    },

    /**
     * Re-anchor onto a new clock source while preserving the current beat.
     * Used when the AudioContext unlocks and takes over from performance.now().
     * @param {number} newNow value of the NEW clock, right now
     */
    rebase(newNow) {
      b0 = conductor.beat;
      t0 = newNow;
    },

    /** Run `fn` on the first frame at or after `beat`. */
    at(beat, fn) {
      scheduled.push({ beat, fn });
    },

    /** Sample the clock once per frame and fire due callbacks. */
    update() {
      const b = beatAt(clock());
      conductor.dtBeats = Math.max(0, b - lastBeat);
      conductor.beat = b;
      lastBeat = b;

      if (scheduled.length) {
        const due = scheduled.filter((s) => s.beat <= b);
        if (due.length) {
          scheduled = scheduled.filter((s) => s.beat > b);
          for (const s of due) s.fn();
        }
      }
      return conductor.dtBeats;
    },
  };

  return conductor;
}
