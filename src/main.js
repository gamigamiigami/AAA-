/**
 * Boot. Wires the services together, owns the frame, and exposes the debug
 * handle the QA harness drives.
 */

import { createStage } from './engine/stage.js';
import { createConductor } from './engine/conductor.js';
import { createInput } from './engine/input.js';
import { createLoop } from './engine/loop.js';
import { createRng, readSessionSeed } from './engine/rng.js';
import { Gfx } from './gfx/gfx.js';
import { invalidateSceneCache } from './gfx/scene.js';
import { createAudio } from './audio/audio.js';
import { createFx } from './fx/fx.js';
import { createSave } from './game/save.js';
import { createApp } from './game/app.js';
import { MICROGAMES, BOSSES } from './microgames/registry.js';
import { PALETTES } from './design/tokens.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const stage = createStage(canvas);
const audio = createAudio();
const conductor = createConductor(() => audio.now());
const seed = readSessionSeed();
const rng = createRng(seed);
const gfx = new Gfx(stage.ctx, stage);
const fx = createFx(rng.derive('fx'));
const save = createSave();
const input = createInput(stage).attach();

/** Services are passed explicitly rather than imported, so no screen or
 *  microgame reaches into another module's internals. */
const services = { stage, conductor, audio, gfx, fx, save, rng, input };

audio.setMuted(save.data.muted);
const app = createApp(services);

/* ------------------------------------------------------------ audio unlock */

/**
 * Browsers only start audio inside a real user gesture, so this listener runs
 * directly on pointerdown rather than being deferred into the game loop. Once
 * the hardware clock is live, the Conductor rebases onto it without the beat
 * number jumping, and the music starts.
 */
let unlockTried = false;
async function unlockAudio() {
  if (unlockTried) return;
  unlockTried = true;
  const t = await audio.unlock();
  if (t !== null) {
    conductor.rebase(t);
    app.startMenuMusic();
  }
}
for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { passive: true });
}

/* -------------------------------------------------------------------- frame */

let lastNow = performance.now();

const loop = createLoop({
  tick(dtSec, nowMs) {
    // The clock is sampled once per frame; sub-steps share that sample so the
    // whole frame agrees on what beat it is.
    if (nowMs !== lastNow) {
      conductor.update();
      lastNow = nowMs;
    }
    const dtBeats = (dtSec * conductor.bpm) / 60;
    const frame = input.beginFrame(nowMs, dtSec);
    app.update(dtBeats, dtSec, frame);
  },
  render() {
    audio.update(conductor);
    const ctx = stage.ctx;
    // Fill the whole canvas first: the letterbox area outside the action box
    // must never show whatever was in the framebuffer before.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = app.palette.skyBot;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    stage.applyTransform();
    app.draw(gfx);
  },
});

const onResize = () => {
  stage.resize();
  // Cached scenery is rendered at the old pixel size; drop it so the next
  // frame re-renders sharp instead of stretching a stale bitmap.
  invalidateSceneCache();
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

document.addEventListener('visibilitychange', () => {
  // Dropping held pointers on blur stops a finger "sticking" after a tab swap.
  if (document.hidden) input.releaseAll();
});

stage.resize();
loop.start();
document.body.classList.add('ready');

/* --------------------------------------------------------------- debug API */

/**
 * Bosses declare `stage: 'any'` — they take on whichever world they appear in.
 * Previewing one still needs a concrete palette, so fall back to the first.
 */
const stageOf = (def) => (def.stage && PALETTES[def.stage] ? def.stage : 'town');

/** Drive-by handle for tools/qa.mjs and tools/preview.mjs. */
// @ts-ignore
window.__game = {
  get ready() {
    return true;
  },
  seed,
  get screen() {
    return app.screen;
  },
  get sessionSerial() {
    return app.sessionSerial;
  },
  get stats() {
    return loop.stats;
  },
  get audioReady() {
    return audio.ready;
  },
  get beat() {
    return conductor.beat;
  },
  get bpm() {
    return conductor.bpm;
  },
  get particles() {
    return fx.particleCount;
  },
  listGames() {
    return [...MICROGAMES, ...BOSSES].map((m) => ({
      id: m.id,
      command: m.command,
      input: m.input,
      stage: m.stage,
      boss: !!m.boss,
    }));
  },
  setScreen(name) {
    app.go(name);
  },
  startSession(stageId = 'town') {
    app.startSession(stageId);
  },
  /** Lock a session to one registered microgame at one level. */
  practice(gameId, level = 1) {
    const def = [...MICROGAMES, ...BOSSES].find((m) => m.id === gameId);
    if (!def) throw new Error(`unknown microgame: ${gameId}`);
    app.startSession(stageOf(def), { def, level: /** @type {1|2|3} */ (level) });
    return true;
  },
  /**
   * Load a microgame straight from disk without it being in the registry, so a
   * work-in-progress game can be previewed before it is registered.
   * Dev-server only — the bundled build has no module URLs to fetch.
   */
  async tryGame(gameId, level = 1) {
    const mod = await import(`./microgames/${gameId}/game.js`);
    const def = mod.default;
    if (!def || !def.create) throw new Error(`${gameId}/game.js has no default export`);
    app.startSession(stageOf(def), { def, level: /** @type {1|2|3} */ (level) });
    return true;
  },
  session() {
    const s = app.session;
    return s
      ? {
          phase: s.state.phase,
          score: s.state.score,
          lives: s.state.lives,
          level: s.state.level,
          gameIndex: s.state.gameIndex,
          finished: s.state.finished,
        }
      : null;
  },
  setMuted(v) {
    audio.setMuted(v);
  },
  /** Virtual -> CSS pixel, so the harness can aim real pointer events. */
  toScreen(vx, vy) {
    return { x: vx * stage.scale + stage.offX, y: vy * stage.scale + stage.offY };
  },
  /** What should the player do right now? Optional, per microgame. */
  hint() {
    return app.session ? app.session.debugHint() : null;
  },
  /** Whether the running microgame answers hint() at all — see session.js. */
  hasHint() {
    return app.session ? app.session.hasDebugHint() : false;
  },
};
