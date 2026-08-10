/**
 * みちびけ！ — drag the firefly along the path without touching the walls.
 *
 * The steadiest-hand game in the set. The path is generated from a seeded spline
 * so every play is a different route, and level 3 turns the lights off so the
 * firefly's own glow is the only thing showing you where the walls are.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1780;
const TOP = 380;
const BOT = 1580;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'guide',
  command: 'みちびけ！',
  input: 'drag',
  stage: 'forest',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: wide, gently curving corridor.
      { width: 190, bends: 2, amp: 190, dark: false },
      // L2 adds a decision: narrower with sharper corners.
      { width: 132, bends: 3, amp: 280, dark: false },
      // L3 adds pressure: narrow, and lit only by the firefly itself.
      { width: 108, bends: 4, amp: 320, dark: true },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    // Centre line of the corridor, sampled top to bottom.
    const NODES = cfg.bends + 2;
    /** @type {{x:number,y:number}[]} */
    const spine = [];
    for (let i = 0; i < NODES; i++) {
      const t = i / (NODES - 1);
      spine.push({
        x: LAYOUT.cx + (i === 0 || i === NODES - 1 ? 0 : rng.range(-cfg.amp, cfg.amp)),
        y: BOT + (TOP - BOT) * t,
      });
    }

    /** Sample the corridor centre at parameter t (0 = start, 1 = goal). */
    const sample = (t) => {
      const u = Math.max(0, Math.min(0.9999, t)) * (NODES - 1);
      const i = Math.floor(u);
      const f = u - i;
      const a = spine[i];
      const b = spine[Math.min(NODES - 1, i + 1)];
      // Smoothstep between nodes keeps the corridor free of hard kinks.
      const k = f * f * (3 - 2 * f);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    };

    let flyX = spine[0].x;
    let flyY = spine[0].y;
    let progress = 0;
    let held = false;
    let lost = false;
    let won = false;
    let elapsed = -2;
    let glow = 0;
    /** @type {{x:number,y:number,a:number}[]} */
    const trail = [];

    /** Distance from the corridor centre, plus the t where that happened. */
    const distanceToPath = (x, y) => {
      let best = Infinity;
      let bestT = 0;
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const p = sample(t);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < best) {
          best = d;
          bestT = t;
        }
      }
      return { d: best, t: bestT };
    };

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return lost ? 'lose' : 'playing';

        glow = Math.max(0, glow - dt * 2);
        trail.unshift({ x: flyX, y: flyY, a: 1 });
        if (trail.length > 18) trail.pop();
        for (const p of trail) p.a *= Math.max(0, 1 - dt * 2.6);

        const p = input.primary;
        held = !!p;
        if (p) {
          // The firefly follows the finger, but with enough lag that a flick
          // across the screen does not teleport it through a wall.
          const k = 1 - Math.pow(0.00002, dt);
          flyX += (p.x - flyX) * k;
          flyY += (p.y - flyY) * k;
        }

        const { d, t } = distanceToPath(flyX, flyY);
        progress = Math.max(progress, t);

        if (elapsedBeats >= 0 && d > cfg.width / 2) {
          lost = true;
          fx.burst(flyX, flyY, {
            count: 20,
            colors: [SEMANTIC.danger, palette.accent2],
            power: 1.2,
          });
          fx.shake(22);
          fx.flash(SEMANTIC.danger, 0.28);
          audio.sfx('wrong');
          return 'lose';
        }

        const goal = sample(1);
        if (elapsedBeats >= 0 && Math.hypot(goal.x - flyX, goal.y - flyY) < 90) {
          fx.burst(goal.x, goal.y, {
            count: 26,
            colors: [palette.accent, palette.accent2, PAPER],
            power: 1.3,
          });
          fx.freeze(0.06);
          audio.sfx('sparkle');
          return 'win';
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        glow = 1;
      },

      debugHint() {
        // Aim a little ahead along the corridor so the firefly keeps moving.
        const target = sample(Math.min(1, progress + 0.09));
        return { type: 'drag', x: target.x, y: target.y };
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* --------------------------------------------------- corridor */
        const drawSpine = (width, style) => {
          c.beginPath();
          const first = sample(0);
          c.moveTo(first.x, first.y);
          for (let i = 1; i <= 60; i++) {
            const p = sample(i / 60);
            c.lineTo(p.x, p.y);
          }
          c.lineWidth = width;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.strokeStyle = style;
          c.stroke();
        };

        // Walls first (a fat dark stroke), then the walkable channel on top.
        drawSpine(cfg.width + 26, INK);
        drawSpine(cfg.width, alpha(lighten(palette.skyBot, 0.35), cfg.dark ? 0.25 : 0.85));

        /* ------------------------------------------------------- goal */
        const goal = sample(1);
        const gp = (Math.sin(beat * Math.PI * 2) + 1) / 2;
        c.save();
        c.globalAlpha = 0.4 + gp * 0.5;
        g.body((gg) => gg.star(goal.x, goal.y, 62 + gp * 10, 30, 6, beat * 0.6), {
          fill: palette.accent2,
          extrude: 0,
          shade: 0.1,
          gloss: 0.5,
          lw: STROKE.thin,
        });
        c.restore();

        /* -------------------------------------------------- darkness */
        if (cfg.dark) {
          // Everything outside the firefly's lantern is dimmed, so the player
          // must move to see. Drawn as a radial hole in an ink wash.
          const f = g.full;
          c.save();
          const gr = c.createRadialGradient(flyX, flyY, 60, flyX, flyY, 480);
          gr.addColorStop(0, alpha(INK, 0));
          gr.addColorStop(1, alpha(INK, 0.88));
          c.fillStyle = gr;
          c.fillRect(f.x0, f.y0, f.w, f.h);
          c.restore();
        }

        /* ------------------------------------------------------ trail */
        for (const p of trail) {
          if (p.a < 0.02) continue;
          c.save();
          c.globalAlpha = p.a * 0.5;
          c.beginPath();
          c.arc(p.x, p.y, 18 * p.a + 6, 0, Math.PI * 2);
          c.fillStyle = palette.accent2;
          c.fill();
          c.restore();
        }

        /* ---------------------------------------------------- firefly */
        const pulse = 1 + Math.sin(beat * Math.PI * 2) * 0.07 + glow * 0.2;
        c.save();
        c.translate(flyX, flyY);
        c.scale(pulse, pulse);
        // Halo
        c.save();
        c.globalAlpha = 0.35;
        c.beginPath();
        c.arc(0, 0, 88, 0, Math.PI * 2);
        c.fillStyle = palette.accent2;
        c.fill();
        c.restore();
        g.body((gg) => gg.circle(0, 0, 42), {
          fill: lost ? '#9aa0b5' : palette.accent2,
          extrude: 8,
          shade: 0.2,
          gloss: 0.5,
          lw: STROKE.base,
        });
        // Wings, beating fast enough to blur into a shape.
        for (const sx of [-1, 1]) {
          c.save();
          c.globalAlpha = 0.5;
          c.rotate(sx * (0.5 + Math.sin(beat * 30) * 0.25));
          g.body((gg) => gg.ellipse(sx * 46, -14, 34, 18, 0), {
            fill: alpha(PAPER, 0.8),
            extrude: 0,
            shade: 0,
            gloss: 0.3,
            lw: 4,
          });
          c.restore();
        }
        g.face(0, -4, {
          scale: 0.7,
          blink: lost ? 1 : 0,
          mouth: lost ? 'sad' : won ? 'open' : 'smile',
        });
        c.restore();

        /* ------------------------------------------------ touch prompt */
        if (!held && !lost && !won) {
          const t = (beat * 0.8) % 1;
          c.save();
          c.globalAlpha = (1 - t) * 0.8;
          c.beginPath();
          c.arc(flyX, flyY, 60 + t * 80, 0, Math.PI * 2);
          c.lineWidth = 9;
          c.strokeStyle = PAPER;
          c.stroke();
          c.restore();
        }
      },
    };
  },
};
