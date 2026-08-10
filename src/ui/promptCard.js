/**
 * The order card — 「よけろ！」.
 *
 * This is the most important second in the game: the player has never seen the
 * microgame behind it and gets one beat to understand what to do. So the card
 * carries the verb AND a drawn control hint, because a player who understands
 * the word but not the gesture still loses.
 */

import { TYPE, INK, PAPER, STROKE, RADIUS, LAYOUT, ease, tween } from '../design/tokens.js';
import { alpha, darken } from '../design/color.js';

const TAU = Math.PI * 2;

/** Japanese label under the control icon. */
const VERB_LABEL = {
  tap: 'タップ',
  swipe: 'フリック',
  drag: 'ドラッグ',
  hold: 'おしっぱなし',
};

/**
 * Draw the touch-gesture icon. These are drawn rather than written because a
 * shape is read faster than a word, and the word is there to disambiguate.
 * @param {import('../gfx/gfx.js').Gfx} g
 */
export function drawVerbIcon(g, verb, x, y, scale, phase, color = PAPER) {
  const c = g.c;
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const dot = (dx, dy, r = 26) => {
    c.beginPath();
    c.arc(dx, dy, r, 0, TAU);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = INK;
    c.stroke();
  };

  switch (verb) {
    case 'tap': {
      for (let i = 0; i < 2; i++) {
        const p = (phase + i * 0.5) % 1;
        c.globalAlpha = 1 - p;
        c.beginPath();
        c.arc(0, 0, 26 + p * 46, 0, TAU);
        c.lineWidth = 8;
        c.strokeStyle = color;
        c.stroke();
      }
      c.globalAlpha = 1;
      dot(0, 0);
      break;
    }
    case 'swipe': {
      const p = ease.inOutCubic(phase < 0.5 ? phase * 2 : 1);
      const x0 = -58;
      const x1 = 58;
      const px = x0 + (x1 - x0) * p;
      c.globalAlpha = 0.55;
      c.beginPath();
      c.moveTo(x0, 0);
      c.lineTo(px, 0);
      c.lineWidth = 12;
      c.strokeStyle = color;
      c.stroke();
      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(x1 + 6, 0);
      c.lineTo(x1 - 22, -20);
      c.lineTo(x1 - 22, 20);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      c.lineWidth = 6;
      c.strokeStyle = INK;
      c.stroke();
      dot(px, 0, 22);
      break;
    }
    case 'drag': {
      const px = Math.cos(phase * TAU) * 52;
      const py = Math.sin(phase * TAU) * 26;
      c.globalAlpha = 0.5;
      c.beginPath();
      c.setLineDash([12, 14]);
      c.ellipse(0, 0, 52, 26, 0, 0, TAU);
      c.lineWidth = 8;
      c.strokeStyle = color;
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
      dot(px, py, 24);
      break;
    }
    case 'hold': {
      c.beginPath();
      c.arc(0, 0, 50, -Math.PI / 2, -Math.PI / 2 + TAU * phase);
      c.lineWidth = 12;
      c.strokeStyle = color;
      c.stroke();
      c.globalAlpha = 0.35;
      c.beginPath();
      c.arc(0, 0, 50, 0, TAU);
      c.lineWidth = 12;
      c.strokeStyle = color;
      c.stroke();
      c.globalAlpha = 1;
      dot(0, 0, 24);
      break;
    }
  }
  c.restore();
}

export function createPromptCard() {
  let command = '';
  let verb = 'tap';
  let accent = '#ff7a6b';
  let t0 = 0;
  let length = 2;
  let visible = false;

  return {
    show(o) {
      command = o.command;
      verb = o.verb;
      accent = o.accent;
      t0 = o.startBeat;
      length = o.beats;
      visible = true;
    },
    hide() {
      visible = false;
    },
    get visible() {
      return visible;
    },

    /**
     * @param {import('../gfx/gfx.js').Gfx} g
     * @param {number} beat
     */
    draw(g, beat) {
      if (!visible) return;
      const p = (beat - t0) / length;
      if (p < 0 || p > 1.05) return;

      const c = g.c;
      const f = g.stage.full;
      const cx = LAYOUT.cx;
      const cy = LAYOUT.announceY;

      // Slam in (0-0.22), hold, then punch out (0.82-1).
      let scale;
      let alphaK = 1;
      if (p < 0.22) {
        const k = tween(p / 0.22, ease.outBack);
        scale = 2.6 - 1.6 * k;
        alphaK = Math.min(1, p / 0.08);
      } else if (p > 0.82) {
        const k = tween((p - 0.82) / 0.18, ease.inCubic);
        scale = 1 + k * 0.55;
        alphaK = 1 - k;
      } else {
        // Gentle breathing on the beat so the card feels alive while it holds.
        scale = 1 + Math.sin((beat % 1) * Math.PI) * 0.018;
      }

      c.save();
      c.globalAlpha = alphaK;

      // Dim the scene behind so the verb wins the eye.
      c.fillStyle = alpha(INK, 0.42 * Math.min(1, p * 6));
      c.fillRect(f.x0, f.y0, f.w, f.h);

      c.translate(cx, cy);
      c.scale(scale, scale);

      // Angled ribbon behind the word: gives the text a shape to sit on so it
      // stays legible over any microgame art.
      c.save();
      c.rotate(-0.035);
      const bw = Math.min(1030, Math.max(760, g.measure(command, TYPE.command, 900) + 170));
      g.body((gg) => gg.rrect(-bw / 2, -118, bw, 236, RADIUS.lg), {
        fill: accent,
        extrude: 16,
        shade: 0.26,
        gloss: 0.34,
        lw: STROKE.bold,
        shadow: 0.3,
        shadowY: 24,
      });
      // Inner keyline — a small detail that reads as "designed" rather than
      // "a rounded rectangle".
      g.begin().rrect(-bw / 2 + 20, -98, bw - 40, 196, RADIUS.md);
      c.lineWidth = 4;
      c.strokeStyle = alpha(PAPER, 0.45);
      c.stroke();
      c.restore();

      g.text(command, 0, 4, {
        size: TYPE.command,
        color: PAPER,
        outline: darken(accent, 0.75),
        lw: 20,
        weight: 900,
        maxWidth: bw - 90,
        shadow: { x: 0, y: 9, color: alpha(INK, 0.5) },
      });

      c.restore();

      // Control hint sits below the card and does not scale with the slam, so
      // it stays readable during the whole beat.
      if (p > 0.16 && p < 0.9) {
        const hintA = Math.min(1, (p - 0.16) / 0.12) * (p > 0.8 ? (0.9 - p) / 0.1 : 1);
        c.save();
        c.globalAlpha = Math.max(0, hintA);
        drawVerbIcon(g, verb, cx, cy + 250, 1, (beat * 0.6) % 1, PAPER);
        g.text(VERB_LABEL[verb] ?? '', cx, cy + 348, {
          size: TYPE.small,
          color: PAPER,
          outline: INK,
          lw: 7,
          weight: 800,
          spacing: 2,
        });
        c.restore();
      }
    },
  };
}
