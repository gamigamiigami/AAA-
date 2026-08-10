/**
 * Session — the microgame loop itself.
 *
 * One cycle is: order card (2 beats) -> play (8 beats) -> resolve (2 beats),
 * with the wipe to the next game overlapping the tail of the resolve so the cut
 * lands on a beat and never feels like a pause. Difficulty rises as tempo
 * first, mechanics second; the music never stops between games.
 */

import {
  TIMING,
  TEMPO,
  SEMANTIC,
  LAYOUT,
  INK,
  PAPER,
  TYPE,
  STROKE,
  RADIUS,
  ease,
  tween,
} from '../design/tokens.js';
import { darken } from '../design/color.js';
import { emptyInputFrame } from '../engine/input.js';
import { DEFAULT_LENGTH_BEATS } from '../microgames/types.js';
import { createHud, drawBanner } from '../ui/hud.js';
import { createPromptCard } from '../ui/promptCard.js';
import { createTransition } from '../ui/transition.js';
import { createBackdrop } from '../gfx/scene.js';

const MAX_LIVES = 4;
const BANNER_BEATS = 4;
const BOSS_EVERY = 10;
const SPEEDUP_EVERY = 5;
const LEVEL_UP_EVERY = 7;
const INTERSTITIAL_GROUND = 1660;

const EMPTY_INPUT = emptyInputFrame();

/**
 * @param {Object} services
 * @param {Object} opts
 * @param {string} opts.stageId
 * @param {import('../design/tokens.js').Palette} opts.palette
 * @param {import('../microgames/types.js').MicrogameDef[]} opts.games
 * @param {import('../microgames/types.js').MicrogameDef[]} opts.bosses
 * @param {import('../engine/rng.js').Rng} opts.rng
 * @param {import('../microgames/types.js').MicrogameDef|null} [opts.forcedDef]
 *   QA only: lock every round to this microgame.
 * @param {1|2|3|null} [opts.forcedLevel]
 */
export function createSession(services, opts) {
  const { conductor, audio, fx, gfx } = services;
  const hud = createHud();
  const card = createPromptCard();
  const transition = createTransition(conductor);
  // Interstitials (start / speed-up / boss) have no microgame behind them, so
  // the session owns a stage backdrop of its own. Without it those beats show a
  // bare gradient, which reads as the game having lost its scenery.
  const backdrop = createBackdrop(opts.rng.derive('stage-backdrop'), opts.palette, {
    horizon: INTERSTITIAL_GROUND,
  });

  const state = {
    phase: /** @type {'intro'|'play'|'resolve'|'banner'|'over'} */ ('banner'),
    phaseStart: conductor.beat,
    gameIndex: 0,
    score: 0,
    lives: MAX_LIVES,
    level: /** @type {1|2|3} */ (1),
    speedUps: 0,
    finished: false,
    lastResult: /** @type {'win'|'lose'|null} */ (null),
  };

  let bannerText = 'スタート！';
  let bannerSub = '';
  let wipeStarted = false;
  let resultShownAt = 0;

  /** @type {import('../microgames/types.js').MicrogameDef|null} */
  let def = null;
  /** @type {import('../microgames/types.js').MicrogameInstance|null} */
  let inst = null;
  let lengthBeats = DEFAULT_LENGTH_BEATS;
  let timeoutResult = 'lose';

  /** Shuffled bag so the same game cannot appear twice in a row. */
  let bag = [];
  let lastId = '';

  const phaseBeat = () => conductor.beat - state.phaseStart;
  const setPhase = (p) => {
    state.phase = p;
    state.phaseStart = conductor.beat;
  };

  function refillBag() {
    bag = opts.rng.shuffle(opts.games);
    if (bag.length > 1 && bag[bag.length - 1].id === lastId) {
      const swap = bag[0];
      bag[0] = bag[bag.length - 1];
      bag[bag.length - 1] = swap;
    }
  }

  function pickDef() {
    // Debug/QA: a session can be locked to a single microgame so the
    // screenshot matrix can visit every game at every level deterministically.
    if (opts.forcedDef) return opts.forcedDef;
    const isBossSlot = (state.gameIndex + 1) % BOSS_EVERY === 0;
    if (isBossSlot && opts.bosses.length) return opts.rng.pick(opts.bosses);
    if (!bag.length) refillBag();
    return bag.pop() ?? opts.games[0];
  }

  function applyTempo() {
    const bpm = Math.min(
      TEMPO.max,
      TEMPO.base + (state.level - 1) * TEMPO.perLevel + state.speedUps * TEMPO.perSpeedUp,
    );
    conductor.setBpm(bpm);
    audio.setIntensity(Math.min(1, 0.45 + state.gameIndex * 0.05));
  }

  function beginGame() {
    def = pickDef();
    lastId = def.id;
    lengthBeats = def.lengthBeats ?? DEFAULT_LENGTH_BEATS;
    timeoutResult = def.timeoutResult ?? 'lose';

    fx.clear();
    const ctx = {
      rng: opts.rng.derive(`${def.id}:${state.gameIndex}`),
      level: opts.forcedLevel ?? state.level,
      palette: opts.palette,
      gfx,
      audio,
      fx,
      conductor,
      lengthBeats,
    };
    if (inst?.dispose) inst.dispose();
    inst = def.create(ctx);
    state.lastResult = null;

    card.show({
      command: def.command,
      verb: def.input,
      accent: opts.palette.accent,
      startBeat: conductor.beat,
      beats: TIMING.introBeats,
    });
    audio.sfx('card');
    audio.duckMusic(0.55, 0.3);
    setPhase('intro');
    wipeStarted = false;
  }

  /** Decide what happens before the next game: banner, or straight in. */
  function advance() {
    const nextIndex = state.gameIndex + 1;
    const nextLevel = /** @type {1|2|3} */ (
      Math.min(3, 1 + Math.floor(nextIndex / LEVEL_UP_EVERY))
    );
    const isBoss = (nextIndex + 1) % BOSS_EVERY === 0 && opts.bosses.length > 0;
    const levelUp = nextLevel > state.level;
    const speedUp = nextIndex % SPEEDUP_EVERY === 0 && !isBoss && !levelUp;

    state.gameIndex = nextIndex;
    state.level = nextLevel;

    if (isBoss) {
      bannerText = 'ボス！';
      bannerSub = 'きあいを いれろ';
      audio.sfx('boss');
      applyTempo();
      setPhase('banner');
      return;
    }
    if (levelUp) {
      state.speedUps++;
      bannerText = `レベル ${nextLevel}`;
      bannerSub = 'むずかしく なるぞ';
      audio.sfx('speedUp');
      applyTempo();
      setPhase('banner');
      return;
    }
    if (speedUp) {
      state.speedUps++;
      bannerText = 'スピードアップ！';
      bannerSub = '';
      audio.sfx('speedUp');
      applyTempo();
      setPhase('banner');
      return;
    }
    beginGame();
  }

  function resolve(result) {
    state.lastResult = result;
    resultShownAt = conductor.beat;
    card.hide();
    if (result === 'win') {
      state.score++;
      fx.celebrate(LAYOUT.cx, LAYOUT.playCy, opts.palette);
      audio.sfx('win');
    } else {
      state.lives--;
      hud.loseLife(state.lives, conductor.beat);
      fx.fail(LAYOUT.cx, LAYOUT.playCy);
      fx.flash(SEMANTIC.danger, 0.35);
      audio.sfx('lose');
      audio.sfx('lifeLost', { delay: 0.24 });
    }
    if (inst?.onResult) inst.onResult(result === 'win');
    setPhase('resolve');
  }

  const session = {
    state,
    transition,

    get finished() {
      return state.finished;
    },

    start() {
      state.phase = 'banner';
      state.phaseStart = conductor.beat;
      bannerText = 'スタート！';
      bannerSub = opts.palette.name;
      applyTempo();
      audio.setSong(/** @type {any} */ (opts.stageId));
      audio.startMusic(conductor);
      refillBag();
    },

    /**
     * @param {number} dtBeats @param {number} dtSec
     * @param {import('../engine/input.js').InputFrame} input
     */
    update(dtBeats, dtSec, input) {
      transition.update();
      fx.update(dtSec, dtBeats);
      // Hit-stop freezes gameplay but not effects: that is what sells impact.
      const simBeats = fx.frozen ? 0 : dtBeats;
      const pb = phaseBeat();

      switch (state.phase) {
        case 'banner': {
          if (pb >= BANNER_BEATS) beginGame();
          break;
        }

        case 'intro': {
          // Games are ticked during the order card so entry animations play,
          // but they receive no input and cannot resolve yet.
          if (inst) inst.update(simBeats, EMPTY_INPUT, pb - TIMING.introBeats);
          if (pb >= TIMING.introBeats) {
            card.hide();
            setPhase('play');
          }
          break;
        }

        case 'play': {
          if (inst) {
            const verdict = inst.update(simBeats, input, pb);
            if (verdict === 'win' || verdict === 'lose') {
              resolve(verdict);
              break;
            }
          }
          if (pb >= lengthBeats) resolve(timeoutResult);
          break;
        }

        case 'resolve': {
          if (inst) inst.update(simBeats, EMPTY_INPUT, lengthBeats + pb);
          // Start the wipe before the resolve ends so the cut lands on a beat.
          if (!wipeStarted && pb >= TIMING.resolveBeats - 0.7) {
            wipeStarted = true;
            if (state.lives <= 0) {
              audio.sfx('gameOver');
              audio.stopMusic();
              transition.play({
                kind: 'iris',
                beats: 1.2,
                color: INK,
                onMid: () => {
                  state.phase = 'over';
                  state.finished = true;
                },
              });
            } else {
              transition.play({
                kind: state.lastResult === 'win' ? 'panels' : 'sweep',
                beats: 0.95,
                color: state.lastResult === 'win' ? opts.palette.accent3 : INK,
                onMid: advance,
              });
            }
          }
          break;
        }

        case 'over':
          break;
      }
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      const c = g.c;
      const p = opts.palette;

      g.skyGradient(p.skyTop, p.skyBot);

      const shake = fx.shakeOffset();
      c.save();
      c.translate(shake.x, shake.y);

      // Clipped to the viewport, not the action box: scenery should reach the
      // screen edges on any aspect ratio. Keeping gameplay inside the box is
      // the author's job (see the microgame contract); the HUD draws on top.
      c.save();
      g.clipFull();
      if (inst) inst.draw(g);
      else backdrop.draw(g, conductor.beat);
      fx.draw(g);
      c.restore();

      hud.draw(g, {
        lives: state.lives,
        maxLives: MAX_LIVES,
        score: state.score,
        beat: conductor.beat,
        timerLeft: state.phase === 'play' ? lengthBeats - phaseBeat() : 0,
        timerTotal: lengthBeats,
        accent: p.accent2,
      });

      if (state.phase === 'resolve' && state.lastResult) {
        drawVerdict(g, state.lastResult, conductor.beat - resultShownAt);
      }

      card.draw(g, conductor.beat);

      if (state.phase === 'banner') {
        drawBanner(
          g,
          bannerText,
          bannerSub,
          Math.min(1, phaseBeat() / BANNER_BEATS),
          bannerText === 'ボス！' ? SEMANTIC.danger : p.accent,
        );
      }

      c.restore();

      fx.drawFlash(g);
      transition.draw(g);
    },

    /** QA only: ask the running microgame what the correct action is now. */
    debugHint() {
      return inst && typeof inst.debugHint === 'function' ? inst.debugHint() : null;
    },

    dispose() {
      if (inst?.dispose) inst.dispose();
      inst = null;
    },
  };

  return session;
}

/**
 * The セーフ / ミス stamp. Rotated, overshooting, and gone in under a beat —
 * long enough to register, short enough not to slow the run down. It uses the
 * same slot as the order card, so announcements always arrive in one place.
 * @param {import('../gfx/gfx.js').Gfx} g
 */
function drawVerdict(g, result, beatsSince) {
  const p = Math.min(1, beatsSince / 1.5);
  const win = result === 'win';
  const k = tween(Math.min(1, beatsSince / 0.22), ease.outBack);
  const fade = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
  const c = g.c;
  const label = win ? 'セーフ！' : 'ミス！';
  const color = win ? SEMANTIC.success : SEMANTIC.danger;

  c.save();
  c.globalAlpha = fade;
  c.translate(LAYOUT.cx, LAYOUT.announceY);
  c.rotate(win ? -0.09 : 0.09);
  c.scale(k, k);

  const w = g.measure(label, TYPE.h1, 900) + 130;
  g.body((gg) => gg.rrect(-w / 2, -78, w, 156, RADIUS.lg), {
    fill: color,
    extrude: 12,
    shade: 0.24,
    gloss: 0.34,
    lw: STROKE.bold,
    shadow: 0.28,
    shadowY: 18,
  });
  g.text(label, 0, 0, {
    size: TYPE.h1,
    color: PAPER,
    outline: darken(color, 0.7),
    lw: 14,
    weight: 900,
  });
  c.restore();
}
