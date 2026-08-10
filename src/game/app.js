/**
 * App — screen router.
 *
 * Title -> stage select -> session -> results, with every change hidden behind
 * a beat-timed wipe so the music carries straight through the cut.
 */

import { PALETTES } from '../design/tokens.js';
import { createSession } from './session.js';
import { createTitleScreen } from '../ui/title.js';
import { createStageSelect } from '../ui/stageSelect.js';
import { createResults } from '../ui/results.js';
import { createTransition } from '../ui/transition.js';
import { gamesForStage, bossesForStage } from '../microgames/registry.js';

const MENU_BPM = 124;

export function createApp(services) {
  const { conductor, audio, fx, save, rng } = services;
  const transition = createTransition(conductor);

  let screen = /** @type {'title'|'select'|'session'|'results'} */ ('title');
  /** @type {ReturnType<typeof createSession>|null} */
  let session = null;
  let currentStage = 'town';
  /** Bumped on every new session so the QA harness can tell runs apart. */
  let sessionSerial = 0;
  let finishing = false;

  const title = createTitleScreen(services, {
    onStart: () => go('select'),
    onToggleMute: () => {
      const next = !audio.muted;
      audio.setMuted(next);
      save.setMuted(next);
    },
  });

  const select = createStageSelect(services, {
    onPick: (id) => startSession(id),
    onBack: () => go('title'),
  });

  const results = createResults(services, {
    onRetry: () => startSession(currentStage),
    onSelect: () => go('select'),
  });

  function menuMusic() {
    conductor.setBpm(MENU_BPM);
    audio.setSong('town');
    audio.setIntensity(0.4);
    audio.startMusic(conductor);
  }

  /**
   * @param {'title'|'select'|'session'|'results'} next
   * @param {(() => void)} [onSwap] runs while the wipe fully covers the screen
   */
  function go(next, onSwap) {
    audio.sfx(next === 'title' ? 'back' : 'select');
    transition.play({
      kind: next === 'session' ? 'panels' : 'iris',
      beats: 0.9,
      onMid: () => {
        if (session && next !== 'session') {
          session.dispose();
          session = null;
        }
        screen = next;
        fx.clear();
        if (next === 'title' || next === 'select') menuMusic();
        if (onSwap) onSwap();
      },
    });
  }

  /**
   * @param {string} stageId
   * @param {{def?: any, level?: 1|2|3}} [forced] debug: lock to one microgame
   */
  function startSession(stageId, forced) {
    currentStage = stageId;
    finishing = false;
    go('session', () => {
      session = createSession(services, {
        stageId,
        palette: PALETTES[stageId],
        games: gamesForStage(stageId),
        bosses: bossesForStage(stageId),
        rng: rng.derive(`session:${stageId}:${sessionSerial}:${Date.now() & 0xffff}`),
        forcedDef: forced?.def ?? null,
        forcedLevel: forced?.level ?? null,
      });
      session.start();
      sessionSerial++;
    });
  }

  function finishSession() {
    // The session keeps reporting `finished` every frame, so without this guard
    // we would restart the results wipe forever and the run would never end.
    if (finishing) return;
    finishing = true;
    const score = session ? session.state.score : 0;
    const prevBest = save.best(currentStage);
    const isRecord = save.submit(currentStage, score);
    results.show({ palette: PALETTES[currentStage], score, best: prevBest, isRecord });
    go('results');
  }

  const app = {
    get screen() {
      return screen;
    },
    get session() {
      return session;
    },
    get currentStage() {
      return currentStage;
    },
    get sessionSerial() {
      return sessionSerial;
    },

    /** Palette of whatever is on screen — used for the page background colour. */
    get palette() {
      if (screen === 'session') return PALETTES[currentStage];
      if (screen === 'results') return results.palette ?? PALETTES.town;
      return PALETTES.town;
    },

    startSession,
    go,
    startMenuMusic: menuMusic,

    update(dtBeats, dtSec, input) {
      transition.update();
      // Input is swallowed while a wipe covers the screen, so a stray tap
      // during a transition cannot activate the screen underneath.
      const usable = transition.covered ? { ...input, taps: [], presses: [], swipes: [] } : input;

      switch (screen) {
        case 'title':
          fx.update(dtSec, dtBeats);
          title.update(usable);
          break;
        case 'select':
          fx.update(dtSec, dtBeats);
          select.update(usable, dtSec);
          break;
        case 'session':
          if (session) {
            session.update(dtBeats, dtSec, usable);
            if (session.finished) finishSession();
          }
          break;
        case 'results':
          fx.update(dtSec, dtBeats);
          results.update(usable, dtSec);
          break;
      }
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      switch (screen) {
        case 'title':
          title.draw(g);
          fx.draw(g);
          break;
        case 'select':
          select.draw(g);
          fx.draw(g);
          break;
        case 'session':
          if (session) session.draw(g);
          break;
        case 'results':
          results.draw(g);
          fx.draw(g);
          break;
      }
      fx.drawFlash(g);
      transition.draw(g);
    },
  };

  return app;
}
