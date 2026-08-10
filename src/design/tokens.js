/**
 * DESIGN TOKENS — the single source of truth for how this game looks and moves.
 *
 * Eighteen microgames will read as "a pile of AI-generated stuff" the moment
 * each one invents its own colours, corner radii and easing. So none of them do:
 * colours come from the active stage palette, motion constants come from MOTION,
 * type sizes come from TYPE. If a value is worth tuning it belongs in this file,
 * never as a literal inside a game.
 */

/**
 * Rounded gothic first (iOS/macOS), then the standard CJK families on
 * Android/Windows. No webfont is downloaded: the game must run fully offline,
 * and a CJK webfont would be megabytes. Weight is faked by the double-draw
 * outline in gfx.text(), so this looks chunky even where 900 doesn't exist.
 */
export const FONT_STACK =
  '"Hiragino Maru Gothic ProN", "Hiragino Sans", "YuGothic", "Yu Gothic UI", ' +
  '"Noto Sans JP", "Noto Sans CJK JP", "Meiryo", system-ui, sans-serif';

/** Ink is a deep plum, never #000 — pure black outlines look like clip art. */
export const INK = '#241a33';
export const PAPER = '#fffaf2';

export const SEMANTIC = {
  ink: INK,
  paper: PAPER,
  success: '#3ad98b',
  danger: '#ff4a5c',
  warn: '#ffb03a',
  gold: '#ffd23f',
  silver: '#dfe7ef',
  bronze: '#d08b4d',
};

/** Type scale in virtual units. An ad-hoc `48.5` anywhere is a bug. */
export const TYPE = {
  command: 168, // the WarioWare-style order card: 「よけろ！」
  title: 132,
  h1: 92,
  h2: 62,
  body: 44,
  small: 32,
  tiny: 25,
};

export const STROKE = { hair: 4, thin: 6, base: 9, bold: 13, heavy: 18 };
export const RADIUS = { sm: 10, md: 22, lg: 38, xl: 64, pill: 9999 };

/**
 * LAYOUT — the portrait design space every screen shares.
 * Microgames may paint scenery outside these bounds (see Stage.full) but must
 * keep anything the player has to see or touch between safeTop and safeBottom,
 * where the HUD cannot cover it.
 */
export const LAYOUT = {
  w: 1080,
  h: 1920,
  cx: 540,
  cy: 960,
  safeTop: 190,
  safeBottom: 1730,
  playCy: 960,
  /** Announcements (order card, verdict stamp) always arrive at this height. */
  announceY: 760,
};

/** All durations are in BEATS, so animations retime themselves with tempo. */
export const MOTION = {
  popIn: 0.45,
  popOut: 0.3,
  anticipate: 0.18,
  hitStop: 0.06,
  cardIn: 0.55,
  wipe: 0.7,
};

/** Beat budget for one microgame cycle. 2 + 8 + 2 = 12 beats ≈ 5.5s at 130bpm. */
export const TIMING = {
  introBeats: 2,
  playBeats: 8,
  resolveBeats: 2,
  bossPlayBeats: 16,
};

/* ------------------------------------------------------------------ easing */

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  /** Overshoot — the default for anything entering the screen. */
  outBack: (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/** Clamp then ease — the shape every timed animation uses. */
export function tween(t, fn = ease.outCubic) {
  return fn(t <= 0 ? 0 : t >= 1 ? 1 : t);
}

/* ---------------------------------------------------------------- palettes */

/**
 * @typedef {Object} Palette
 * @property {string} id
 * @property {string} name       Japanese stage name shown in the UI
 * @property {string} skyTop @property {string} skyBot @property {string} ground
 * @property {string} accent @property {string} accent2 @property {string} accent3
 * @property {string[]} props    object colours microgames pick from
 */

/** @type {Record<string, Palette>} */
export const PALETTES = {
  town: {
    id: 'town',
    name: 'あさの まち',
    skyTop: '#63c6f2',
    skyBot: '#c9f2ff',
    ground: '#79cf6a',
    accent: '#ff7a6b',
    accent2: '#ffc93d',
    accent3: '#4aa8e8',
    props: ['#ff7a6b', '#ffc93d', '#4aa8e8', '#79cf6a', '#fff3d6', '#b980e8'],
  },
  neon: {
    id: 'neon',
    name: 'ネオン がい',
    skyTop: '#2a1550',
    skyBot: '#6b2a86',
    ground: '#3b1f63',
    accent: '#ff4fa3',
    accent2: '#3df0e0',
    accent3: '#c6f24a',
    props: ['#ff4fa3', '#3df0e0', '#c6f24a', '#ffb03a', '#8f7bff', '#ffffff'],
  },
  forest: {
    id: 'forest',
    name: 'ふしぎの もり',
    skyTop: '#24406e',
    skyBot: '#7a63b0',
    ground: '#2f7a5c',
    accent: '#8ce65a',
    accent2: '#b57bff',
    accent3: '#ff9b42',
    props: ['#8ce65a', '#b57bff', '#ff9b42', '#37d6c0', '#ffe27a', '#ff6f8d'],
  },
};

export const STAGE_ORDER = ['town', 'neon', 'forest'];

/**
 * Tempo ladder. Difficulty is expressed as tempo first and mechanics second —
 * speeding the music up is what makes a collection feel like it is closing in.
 */
export const TEMPO = { base: 118, perLevel: 16, perSpeedUp: 5, max: 178 };
