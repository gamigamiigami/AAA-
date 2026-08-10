/**
 * Seeded RNG. Direct use of Math.random() is forbidden across this project —
 * every random decision must flow through here so any session can be
 * reproduced exactly from its seed (bug reports, screenshot diffs, QA runs).
 */

/** Hash an arbitrary string into a well-mixed 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * @typedef {Object} Rng
 * @property {() => number} next     Float in [0,1)
 * @property {(a:number,b:number)=>number} range  Float in [a,b)
 * @property {(a:number,b:number)=>number} int    Integer in [a,b] inclusive
 * @property {(p?:number)=>boolean} chance
 * @property {()=>number} sign       -1 or 1
 * @property {<T>(arr:T[])=>T} pick
 * @property {<T>(arr:T[])=>T[]} shuffle  Returns a new shuffled array
 * @property {(label:string)=>Rng} derive Independent child stream
 * @property {number} seed
 */

/**
 * mulberry32 — small, fast, statistically fine for gameplay.
 * @param {number|string} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  const seed32 = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  let a = seed32;

  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed: seed32,
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p = 0.5) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    /** Child stream that will not perturb this one. */
    derive: (label) => createRng((seed32 ^ hashSeed(String(label))) >>> 0),
  };
}

/**
 * Read the seed for this session: `?seed=123` pins it, otherwise a fresh one.
 * Kept here so the whole app agrees on one source of truth.
 */
export function readSessionSeed() {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get('seed');
    if (raw !== null && raw !== '') return hashSeed(raw);
  } catch {
    /* location unavailable — fall through */
  }
  return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}
