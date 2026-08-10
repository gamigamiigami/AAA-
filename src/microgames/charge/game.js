/**
 * ためろ！ — hold to charge, let go inside the target band.
 *
 * The hold entry, and the only game in the set where the winning action is
 * stopping rather than starting. Level 3 makes the gauge bounce off the top so
 * the timing becomes two-sided instead of a single "release soon" instinct.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, RADIUS, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1660;
const GAUGE_X = LAYOUT.cx + 210;
const GAUGE_TOP = 420;
const GAUGE_BOT = 1440;
const GAUGE_W = 130;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'charge',
  command: 'ためろ！',
  input: 'hold',
  stage: 'neon',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: a wide band, steady fill, no way to overshoot.
      { rate: 0.42, band: 0.26, zone: 0.72, bounce: false },
      // L2 adds a decision: narrower, and its position is different every play.
      { rate: 0.6, band: 0.16, zone: rng.range(0.45, 0.85), bounce: false },
      // L3 adds pressure: overfilling sends the gauge back down.
      { rate: 0.85, band: 0.12, zone: rng.range(0.5, 0.88), bounce: true },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    const zoneLo = Math.max(0.08, cfg.zone - cfg.band / 2);
    const zoneHi = Math.min(0.99, cfg.zone + cfg.band / 2);

    let charge = 0;
    let dir = 1; // 1 filling, -1 falling back after a bounce
    let holding = false;
    let released = false;
    let result = null;
    let strain = 0;
    let elapsed = -2;
    let bounced = false;

    const gaugeY = (t) => GAUGE_BOT - (GAUGE_BOT - GAUGE_TOP) * t;

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0 || released) return result ?? 'playing';

        const wasHolding = holding;
        holding = input.down;

        if (holding) {
          if (!wasHolding) audio.sfx('blip');
          charge += cfg.rate * dir * dt;
          strain = Math.min(1, strain + dt * 2);
          if (charge >= 1) {
            if (cfg.bounce) {
              charge = 1;
              dir = -1;
              if (!bounced) {
                bounced = true;
                fx.shake(10);
                audio.sfx('bounce');
              }
            } else {
              // No bounce: overfilling is simply a loss.
              charge = 1;
            }
          }
          if (charge <= 0) {
            charge = 0;
            dir = 1;
          }
          // A rising tick keeps the ear informed as well as the eye.
          if (Math.floor(charge * 20) !== Math.floor((charge - cfg.rate * dir * dt) * 20)) {
            audio.sfx('tick');
          }
        } else {
          strain = Math.max(0, strain - dt * 3);
          if (wasHolding && charge > 0.02) {
            released = true;
            const good = charge >= zoneLo && charge <= zoneHi;
            result = good ? 'win' : 'lose';
            const y = gaugeY(charge);
            if (good) {
              fx.burst(GAUGE_X, y, {
                count: 24,
                colors: [palette.accent2, palette.accent3, PAPER],
                power: 1.3,
              });
              fx.ring(GAUGE_X, y, { color: PAPER, size: 40, grow: 900 });
              fx.freeze(0.06);
              audio.sfx('sparkle');
            } else {
              fx.burst(GAUGE_X, y, { count: 14, colors: [SEMANTIC.danger, '#8f83a3'], power: 0.9 });
              fx.shake(20);
              audio.sfx('wrong');
            }
            return result;
          }
        }

        // Never holding at all is also a loss, handled by timeoutResult.
        return 'playing';
      },

      debugHint() {
        if (released) return null;
        // Hold until the needle is inside the band, then let go.
        const target = (zoneLo + zoneHi) / 2;
        if (dir > 0 && charge < target - 0.02) return { type: 'hold', x: LAYOUT.cx, y: 1000 };
        if (dir < 0 && charge > target + 0.02) return { type: 'hold', x: LAYOUT.cx, y: 1000 };
        return { type: 'release' };
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        const inZone = charge >= zoneLo && charge <= zoneHi;

        /* ------------------------------------------------------ gauge */
        const h = GAUGE_BOT - GAUGE_TOP;
        // Tube
        g.body((gg) => gg.rrect(GAUGE_X - GAUGE_W / 2, GAUGE_TOP, GAUGE_W, h, RADIUS.pill), {
          fill: darken(palette.skyBot, 0.35),
          extrude: 12,
          shade: 0.3,
          gloss: 0.18,
          lw: STROKE.bold,
          shadow: 0.22,
          shadowY: 20,
        });

        // Target band, drawn under the fill so the fill reads as covering it.
        const bandTop = gaugeY(zoneHi);
        const bandBot = gaugeY(zoneLo);
        c.save();
        const bandPulse = inZone ? 1 : 0.55 + 0.25 * ((Math.sin(beat * Math.PI * 2) + 1) / 2);
        c.globalAlpha = bandPulse;
        g.body(
          (gg) =>
            gg.rrect(GAUGE_X - GAUGE_W / 2 - 16, bandTop, GAUGE_W + 32, bandBot - bandTop, 18),
          {
            fill: inZone ? SEMANTIC.success : palette.accent3,
            extrude: 0,
            shade: 0.1,
            gloss: 0.4,
            lw: STROKE.thin,
          },
        );
        c.restore();

        // Fill
        if (charge > 0.005) {
          const top = gaugeY(charge);
          c.save();
          g.begin().rrect(
            GAUGE_X - GAUGE_W / 2 + 10,
            GAUGE_TOP + 10,
            GAUGE_W - 20,
            h - 20,
            RADIUS.pill,
          );
          c.clip();
          const gr = c.createLinearGradient(0, GAUGE_BOT, 0, GAUGE_TOP);
          gr.addColorStop(0, palette.accent);
          gr.addColorStop(1, palette.accent2);
          c.fillStyle = gr;
          c.fillRect(GAUGE_X - GAUGE_W / 2, top, GAUGE_W, GAUGE_BOT - top);
          c.restore();
          // Meniscus: a bright cap that makes the level easy to read exactly.
          g.body((gg) => gg.ellipse(GAUGE_X, top, GAUGE_W / 2 - 10, 14, 0), {
            fill: lighten(palette.accent2, 0.5),
            extrude: 0,
            shade: 0,
            gloss: 0.5,
            lw: 5,
          });
        }

        // Tick marks up the side.
        c.save();
        c.globalAlpha = 0.3;
        c.strokeStyle = PAPER;
        c.lineWidth = 5;
        for (let i = 1; i < 10; i++) {
          const y = gaugeY(i / 10);
          c.beginPath();
          c.moveTo(GAUGE_X + GAUGE_W / 2 + 12, y);
          c.lineTo(GAUGE_X + GAUGE_W / 2 + (i % 5 === 0 ? 44 : 26), y);
          c.stroke();
        }
        c.restore();

        /* --------------------------------------------------- character */
        // Straining harder as the charge rises: the effort must be visible on a
        // body, not only on a bar.
        const cx = LAYOUT.cx - 250;
        const cy = 1180;
        const shakeX = strain > 0.2 ? Math.sin(beat * 40) * strain * 7 : 0;
        const squat = 1 + charge * 0.16;
        c.save();
        g.ground(cx, cy + 150, 110, 30, 0.24);
        c.translate(cx + shakeX, cy);
        c.scale(squat, 1 / squat);
        for (const sx of [-1, 1]) {
          g.body((gg) => gg.capsule(sx * 60, 10, sx * (80 + charge * 26), -60 - charge * 60, 24), {
            fill: darken(palette.accent2, 0.2),
            extrude: 0,
            shade: 0.18,
            gloss: 0.24,
            lw: STROKE.thin,
          });
        }
        g.body((gg) => gg.circle(0, 0, 118), {
          fill: released && result === 'lose' ? '#9aa0b5' : palette.accent2,
          extrude: 16,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -8, {
          scale: 1.7,
          lookX: 0.6,
          lookY: -0.2,
          blink: strain > 0.6 ? 1 : 0,
          mouth: released ? (result === 'win' ? 'open' : 'sad') : strain > 0.4 ? 'flat' : 'smile',
        });
        c.restore();

        /* ------------------------------------------------- hold prompt */
        if (!holding && !released) {
          const pulse = (Math.sin(beat * Math.PI * 2) + 1) / 2;
          c.save();
          c.globalAlpha = 0.5 + pulse * 0.5;
          g.body((gg) => gg.circle(LAYOUT.cx, 1620, 54 + pulse * 8), {
            fill: alpha(PAPER, 0.85),
            extrude: 0,
            shade: 0,
            gloss: 0.4,
            lw: 7,
          });
          c.restore();
        }
      },
    };
  },
};
