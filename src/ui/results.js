/**
 * Results. A run ends here, so the screen has one job beyond reporting the
 * number: make the player want to press もういちど. The score counts up, the
 * medal lands with a stamp, and a new record gets its own celebration.
 */

import {
  TYPE,
  INK,
  PAPER,
  STROKE,
  RADIUS,
  SEMANTIC,
  LAYOUT,
  ease,
  tween,
} from '../design/tokens.js';
import { alpha, darken, lighten } from '../design/color.js';
import { drawDecorBackground, makeDecorShapes, drawButton, hit, drawChip } from './widgets.js';

const MEDALS = [
  { min: 30, color: SEMANTIC.gold, label: 'きんメダル' },
  { min: 18, color: SEMANTIC.silver, label: 'ぎんメダル' },
  { min: 8, color: SEMANTIC.bronze, label: 'どうメダル' },
];

const medalFor = (score) => MEDALS.find((m) => score >= m.min) ?? null;

export function createResults(services, { onRetry, onSelect }) {
  const { conductor, rng, fx, audio } = services;
  const retryRect = { x: LAYOUT.cx - 450, y: 1420, w: 430, h: 150 };
  const selectRect = { x: LAYOUT.cx + 20, y: 1420, w: 430, h: 150 };

  let palette = null;
  let score = 0;
  let best = 0;
  let isRecord = false;
  let startBeat = 0;
  let decor = [];
  let celebrated = false;
  let retryPress = 0;
  let selectPress = 0;

  return {
    get palette() {
      return palette;
    },

    show(o) {
      palette = o.palette;
      score = o.score;
      best = o.best;
      isRecord = o.isRecord;
      startBeat = conductor.beat;
      celebrated = false;
      decor = makeDecorShapes(rng.derive('results'), o.palette, 12);
      retryPress = 0;
      selectPress = 0;
    },

    update(input, dtSec) {
      retryPress = Math.max(0, retryPress - dtSec * 4);
      selectPress = Math.max(0, selectPress - dtSec * 4);

      const age = conductor.beat - startBeat;
      if (!celebrated && age > 1.6) {
        celebrated = true;
        const m = medalFor(score);
        if (m) {
          fx.burst(LAYOUT.cx, 700, {
            count: 30,
            power: 1.3,
            colors: [m.color, PAPER, palette.accent2],
          });
          fx.shake(10);
          audio.sfx(isRecord ? 'fanfare' : 'win');
        } else if (isRecord) {
          audio.sfx('fanfare');
        }
      }

      // Buttons stay inert for a beat so a mashed input cannot skip the result.
      if (age < 1.0) return;
      for (const t of input.taps) {
        if (hit(retryRect, t)) {
          retryPress = 1;
          onRetry();
          return;
        }
        if (hit(selectRect, t)) {
          selectPress = 1;
          onSelect();
          return;
        }
      }
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      if (!palette) return;
      const c = g.c;
      const beat = conductor.beat;
      const age = beat - startBeat;
      drawDecorBackground(g, palette, beat, decor);

      const titleK = tween(Math.min(1, age / 0.5), ease.outBack);
      c.save();
      c.translate(LAYOUT.cx, 320);
      c.scale(titleK, titleK);
      g.text('けっか', 0, 0, {
        size: TYPE.h1,
        color: PAPER,
        outline: INK,
        lw: 15,
        weight: 900,
        shadow: { x: 0, y: 10, color: alpha(INK, 0.4) },
      });
      c.restore();

      // Score counts up over the first beat — a still number feels dead.
      const countK = tween(Math.min(1, Math.max(0, (age - 0.35) / 1.1)), ease.outQuint);
      const shown = Math.round(score * countK);
      const bump =
        age > 1.4 && age < 1.75 ? 1 + Math.sin(((age - 1.4) / 0.35) * Math.PI) * 0.12 : 1;

      g.text('クリアした ミニゲーム', LAYOUT.cx, 500, {
        size: TYPE.small,
        color: alpha(PAPER, 0.9),
        outline: INK,
        lw: 7,
        weight: 800,
        spacing: 2,
      });

      c.save();
      c.translate(LAYOUT.cx - 60, 700);
      c.scale(bump, bump);
      g.text(String(shown), 0, 0, {
        size: 220,
        color: SEMANTIC.gold,
        outline: INK,
        lw: 26,
        weight: 900,
        shadow: { x: 0, y: 14, color: alpha(INK, 0.45) },
      });
      c.restore();

      const medal = medalFor(score);
      if (medal && age > 1.55) {
        const mk = tween(Math.min(1, (age - 1.55) / 0.35), ease.outBack);
        c.save();
        c.translate(LAYOUT.cx + 250, 690);
        c.scale(mk, mk);
        c.rotate(-0.12);
        g.body((gg) => gg.circle(0, 0, 92), {
          fill: medal.color,
          extrude: 14,
          shade: 0.26,
          gloss: 0.45,
          lw: STROKE.bold,
          shadow: 0.26,
          shadowY: 18,
        });
        g.body((gg) => gg.star(0, -4, 56, 26, 5, -Math.PI / 2), {
          fill: lighten(medal.color, 0.45),
          extrude: 0,
          shade: 0.12,
          gloss: 0.3,
          lw: STROKE.thin,
        });
        c.restore();
        c.save();
        c.globalAlpha = mk;
        g.text(medal.label, LAYOUT.cx + 250, 830, {
          size: TYPE.small,
          color: PAPER,
          outline: INK,
          lw: 7,
          weight: 800,
        });
        c.restore();
      }

      if (age > 0.9) {
        drawChip(g, LAYOUT.cx, 980, 'ベスト', Math.max(best, score), { valueColor: '#ffd23f' });
      }

      if (isRecord && age > 1.3) {
        const rk = 1 + Math.max(0, Math.sin(beat * Math.PI * 2)) * 0.06;
        c.save();
        c.translate(LAYOUT.cx, 1130);
        c.scale(rk, rk);
        c.rotate(-0.03);
        const w = g.measure('しんきろく！', TYPE.h2, 900) + 130;
        g.body((gg) => gg.rrect(-w / 2, -52, w, 104, RADIUS.pill), {
          fill: SEMANTIC.danger,
          extrude: 10,
          shade: 0.22,
          gloss: 0.35,
          lw: STROKE.base,
        });
        g.text('しんきろく！', 0, 0, {
          size: TYPE.h2,
          color: PAPER,
          outline: darken(SEMANTIC.danger, 0.7),
          lw: 11,
          weight: 900,
        });
        c.restore();
      }

      if (age > 1.0) {
        const bk = tween(Math.min(1, (age - 1.0) / 0.4), ease.outBack);
        c.save();
        c.translate(LAYOUT.cx, 1495);
        c.scale(1, bk);
        c.translate(-LAYOUT.cx, -1495);
        drawButton(g, retryRect, 'もういちど', {
          fill: palette.accent2,
          size: TYPE.h2 * 0.8,
          press: retryPress,
        });
        drawButton(g, selectRect, 'ステージ', {
          fill: PAPER,
          size: TYPE.h2 * 0.8,
          press: selectPress,
        });
        c.restore();
      }
    },
  };
}
