/**
 * HUD — lives, score, and the beat-locked timer.
 *
 * It anchors to the VIEWPORT, not the action box, so on a tall phone or a wide
 * tablet it sits in the letterbox area and never covers gameplay. At exactly
 * 9:16 it hugs the box edge, which is why microgames are told to keep critical
 * content between y=190 and y=1730.
 *
 * The timer is drawn as one pip per beat rather than a smooth bar: it ticks in
 * time with the music, so the player feels the deadline in the rhythm.
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

const PAD = 34;

/** @param {import('../gfx/gfx.js').Gfx} g */
function heartPath(g, x, y, r) {
  const c = g.c;
  c.moveTo(x, y + r * 0.95);
  c.bezierCurveTo(x - r * 1.45, y - r * 0.15, x - r * 0.62, y - r * 1.15, x, y - r * 0.35);
  c.bezierCurveTo(x + r * 0.62, y - r * 1.15, x + r * 1.45, y - r * 0.15, x, y + r * 0.95);
  c.closePath();
  // Feed the bounds tracker so body() can derive its gradients.
  g._bound(x - r * 1.2, y - r * 1.1, x + r * 1.2, y + r);
}

export function createHud() {
  /** Recently-lost heart index, animating out. */
  let breaking = -1;
  let breakStart = 0;

  return {
    loseLife(index, beat) {
      breaking = index;
      breakStart = beat;
    },

    /**
     * @param {import('../gfx/gfx.js').Gfx} g
     * @param {{lives:number,maxLives:number,score:number,beat:number,
     *          timerLeft:number,timerTotal:number,accent:string}} s
     */
    draw(g, s) {
      const c = g.c;
      const f = g.stage.full;

      /* ------------------------------------------------------- lives */
      const hx = f.x0 + PAD + 40;
      const hy = f.y0 + PAD + 46;
      for (let i = 0; i < s.maxLives; i++) {
        const alive = i < s.lives;
        const x = hx + i * 78;
        let scale = 1;
        let a = 1;
        if (i === breaking) {
          const p = Math.min(1, (s.beat - breakStart) / 0.6);
          scale = 1 + tween(p, ease.outCubic) * 0.7;
          a = 1 - p;
          if (p >= 1) breaking = -1;
        } else if (alive) {
          // Alive hearts beat with the music; the last one beats harder.
          const urgency = s.lives === 1 ? 0.14 : 0.06;
          scale = 1 + Math.max(0, Math.sin(s.beat * Math.PI * 2)) * urgency;
        }

        c.save();
        c.globalAlpha = a;
        c.translate(x, hy);
        c.scale(scale, scale);
        if (alive || i === breaking) {
          g.body((gg) => heartPath(gg, 0, 0, 27), {
            fill: SEMANTIC.danger,
            extrude: 7,
            shade: 0.24,
            gloss: 0.42,
            lw: STROKE.thin,
          });
        } else {
          g.begin();
          heartPath(g, 0, 0, 27);
          c.fillStyle = alpha(INK, 0.3);
          c.fill();
          c.lineWidth = STROKE.thin;
          c.strokeStyle = alpha(INK, 0.45);
          c.stroke();
        }
        c.restore();
      }

      /* ------------------------------------------------------- score */
      const sx = f.x1 - PAD;
      const sy = f.y0 + PAD + 46;
      g.text('クリア', sx, sy - 28, {
        size: TYPE.tiny,
        color: PAPER,
        outline: INK,
        lw: 6,
        align: 'right',
        weight: 800,
        spacing: 3,
      });
      g.text(String(s.score), sx, sy + 26, {
        size: TYPE.h2,
        color: SEMANTIC.gold,
        outline: INK,
        lw: 11,
        align: 'right',
        weight: 900,
      });

      /* ------------------------------------------------------- timer */
      if (s.timerLeft > 0 && s.timerTotal > 0) {
        const total = Math.round(s.timerTotal);
        const gap = 12;
        const pipW = Math.min(96, (940 - (total - 1) * gap) / total);
        const w = total * pipW + (total - 1) * gap;
        const x0 = LAYOUT.cx - w / 2;
        const y = f.y1 - PAD - 30;

        // Backing plate keeps the pips legible over bright microgame art.
        g.body((gg) => gg.rrect(x0 - 22, y - 30, w + 44, 60, RADIUS.pill), {
          fill: alpha(INK, 0.34),
          extrude: 0,
          shade: 0,
          gloss: 0,
          lw: 0,
        });

        const left = s.timerLeft;
        const urgent = left <= 2.02;
        for (let i = 0; i < total; i++) {
          // Pips drain right-to-left: the ones still lit are your time left.
          const idx = total - 1 - i;
          const lit = idx < left;
          const isCurrent = idx === Math.ceil(left) - 1;
          const x = x0 + i * (pipW + gap);
          let h = 26;
          let col = lit ? (urgent ? SEMANTIC.danger : s.accent) : alpha(PAPER, 0.16);
          if (lit && isCurrent) {
            const frac = left - Math.floor(left);
            h = 26 * (0.55 + 0.45 * (frac || 1));
            col = urgent ? lighten(SEMANTIC.danger, 0.25) : lighten(s.accent, 0.3);
          }
          c.save();
          g.begin().rrect(x, y - h / 2, pipW, h, h / 2);
          c.fillStyle = col;
          c.fill();
          if (lit) {
            c.lineWidth = 4;
            c.strokeStyle = alpha(INK, 0.55);
            c.stroke();
          }
          c.restore();
        }
      }
    },
  };
}

/**
 * Big centred banner used by the speed-up and boss interstitials.
 * @param {import('../gfx/gfx.js').Gfx} g
 */
export function drawBanner(g, text, sub, p, accent) {
  const c = g.c;
  const f = g.stage.full;
  const inK = tween(Math.min(1, p / 0.2), ease.outBack);
  const outK = p > 0.8 ? tween((p - 0.8) / 0.2, ease.inCubic) : 0;

  c.save();
  c.globalAlpha = 1 - outK;
  c.fillStyle = alpha(INK, 0.5);
  c.fillRect(f.x0, f.y0, f.w, f.h);

  c.translate(LAYOUT.cx, LAYOUT.announceY);
  c.scale(inK, inK);
  c.rotate(-0.04);

  const w = Math.min(1020, Math.max(760, g.measure(text, TYPE.title, 900) + 160));
  g.body((gg) => gg.rrect(-w / 2, -110, w, 220, RADIUS.lg), {
    fill: accent,
    extrude: 16,
    shade: 0.26,
    gloss: 0.32,
    lw: STROKE.bold,
    shadow: 0.3,
    shadowY: 22,
  });
  g.text(text, 0, 0, {
    size: TYPE.title,
    color: PAPER,
    outline: darken(accent, 0.75),
    lw: 18,
    weight: 900,
    maxWidth: w - 110,
  });
  c.restore();

  if (sub) {
    c.save();
    c.globalAlpha = (1 - outK) * Math.min(1, Math.max(0, (p - 0.15) / 0.15));
    g.text(sub, LAYOUT.cx, LAYOUT.announceY + 270, {
      size: TYPE.h2,
      color: PAPER,
      outline: INK,
      lw: 10,
      weight: 800,
    });
    c.restore();
  }
}
