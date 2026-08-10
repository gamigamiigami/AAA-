/**
 * われ！ — pop only the bubbles matching the target colour.
 *
 * A colour-matching test with no words in it: the target is shown as a big
 * sample jar rather than a label, so the rule is understood before it is read.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, RADIUS, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1740;
const HIT_PAD = 34; // forgiving touch radius on top of the bubble's own

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'pop',
  command: 'われ！',
  input: 'tap',
  stage: 'forest',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: few bubbles, slow, obviously different colours.
      { total: 5, targets: 2, rise: 150, palette: [0, 2], switchAt: Infinity },
      // L2 adds a decision: more bubbles, closer colours, faster.
      { total: 8, targets: 3, rise: 230, palette: [0, 1, 2, 4], switchAt: Infinity },
      // L3 changes the rule mid-round: the target colour switches.
      { total: 12, targets: 4, rise: 300, palette: [0, 1, 2, 3, 4], switchAt: 3.6 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });
    const choices = cfg.palette.map((i) => palette.props[i % palette.props.length]);

    let targetColor = choices[0];
    const otherColors = () => choices.filter((c) => c !== targetColor);

    /** @type {{x:number,y:number,r:number,color:string,vx:number,vy:number,
     *   wob:number,popped:number}[]} */
    const bubbles = [];
    for (let i = 0; i < cfg.total; i++) {
      const isTarget = i < cfg.targets;
      bubbles.push({
        x: rng.range(200, 880),
        y: rng.range(700, 1620),
        r: rng.range(72, 104),
        color: isTarget ? choices[0] : rng.pick(choices.slice(1)),
        vx: rng.range(-40, 40),
        vy: -cfg.rise * rng.range(0.8, 1.25),
        wob: rng.range(0, Math.PI * 2),
        popped: 0,
      });
    }

    const countTargets = () =>
      bubbles.filter((b) => b.popped === 0 && b.color === targetColor).length;
    let remaining = countTargets();
    let lost = false;
    let won = false;
    let elapsed = -2;
    let switched = false;
    let switchFlash = 0;

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return lost ? 'lose' : 'playing';
        switchFlash = Math.max(0, switchFlash - dt * 2);

        if (!switched && elapsedBeats >= cfg.switchAt) {
          switched = true;
          switchFlash = 1;
          // Switch to a colour that still has bubbles left to pop.
          const live = bubbles.filter((b) => b.popped === 0 && b.color !== targetColor);
          if (live.length) {
            targetColor = rng.pick(live).color;
            remaining = countTargets();
            fx.shake(14);
            fx.flash(PAPER, 0.25);
            fx.ring(LAYOUT.cx, 380, { color: targetColor, size: 60, grow: 900 });
            audio.sfx('speedUp');
          }
        }

        for (const b of bubbles) {
          if (b.popped > 0) {
            b.popped = Math.max(0, b.popped - dt * 4);
            continue;
          }
          b.wob += dt * 3;
          b.y += b.vy * dt;
          b.x += (b.vx + Math.sin(b.wob) * 40) * dt;
          if (b.x < 160 || b.x > 920) b.vx *= -1;
          // Wrap around the bottom so the field never empties by accident.
          if (b.y < 340) b.y = 1700;
        }

        for (const t of input.taps) {
          let best = null;
          let bestD = Infinity;
          for (const b of bubbles) {
            if (b.popped > 0) continue;
            const d = Math.hypot(b.x - t.x, b.y - t.y);
            if (d < b.r + HIT_PAD && d < bestD) {
              bestD = d;
              best = b;
            }
          }
          if (!best) {
            fx.ring(t.x, t.y, { color: alpha(PAPER, 0.5), size: 18, grow: 460 });
            audio.sfx('tick');
            continue;
          }
          if (best.color !== targetColor) {
            lost = true;
            best.popped = 1;
            fx.burst(best.x, best.y, {
              count: 20,
              colors: [best.color, SEMANTIC.danger],
              power: 1.2,
            });
            fx.shake(24);
            fx.flash(SEMANTIC.danger, 0.3);
            audio.sfx('wrong');
            return 'lose';
          }
          best.popped = 1;
          remaining--;
          fx.burst(best.x, best.y, { count: 14, colors: [best.color, PAPER], power: 1 });
          fx.ring(best.x, best.y, { color: lighten(best.color, 0.4), size: 26, grow: 760 });
          fx.freeze(0.04);
          audio.sfx('pop');
          if (remaining <= 0) return 'win';
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
      },

      debugHint() {
        const b = bubbles.find((x) => x.popped === 0 && x.color === targetColor);
        return b ? { type: 'tap', x: b.x, y: b.y } : null;
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* -------------------------------------------------- target jar */
        // The rule, stated as an object rather than a sentence.
        const jarY = 340;
        const jarPulse = 1 + switchFlash * 0.16 + Math.sin(beat * Math.PI) * 0.02;
        c.save();
        c.translate(LAYOUT.cx, jarY);
        c.scale(jarPulse, jarPulse);
        g.body((gg) => gg.rrect(-150, -78, 300, 156, RADIUS.lg), {
          fill: alpha(INK, 0.4),
          extrude: 0,
          shade: 0,
          gloss: 0.1,
          lw: 6,
          outline: alpha(PAPER, 0.5),
        });
        g.body((gg) => gg.circle(0, 0, 56), {
          fill: targetColor,
          extrude: 8,
          shade: 0.22,
          gloss: 0.5,
          lw: STROKE.base,
        });
        // Arrows either side, pointing at the sample: "this one".
        for (const sx of [-1, 1]) {
          c.save();
          c.translate(sx * 108, 0);
          c.scale(-sx, 1);
          g.body(
            (gg) =>
              gg.poly([
                [0, -22],
                [30, 0],
                [0, 22],
              ]),
            {
              fill: PAPER,
              extrude: 0,
              shade: 0,
              gloss: 0.3,
              lw: 5,
            },
          );
          c.restore();
        }
        c.restore();

        /* ---------------------------------------------------- bubbles */
        for (const b of bubbles) {
          const pop = b.popped;
          if (pop > 0.98) continue;
          c.save();
          c.translate(b.x, b.y);
          if (pop > 0) {
            c.globalAlpha = pop;
            c.scale(1 + (1 - pop) * 0.6, 1 + (1 - pop) * 0.6);
          } else {
            const s = 1 + Math.sin(b.wob * 1.6) * 0.04;
            c.scale(s, 1 / s);
          }
          const isTarget = b.color === targetColor;
          g.body((gg) => gg.circle(0, 0, b.r), {
            fill: b.color,
            extrude: 0,
            shade: 0.2,
            gloss: 0.55,
            lw: isTarget ? STROKE.bold : STROKE.thin,
            outline: isTarget ? INK : alpha(INK, 0.55),
          });
          // Specular dot sells "bubble" rather than "circle".
          c.beginPath();
          c.arc(-b.r * 0.32, -b.r * 0.36, b.r * 0.18, 0, Math.PI * 2);
          c.fillStyle = alpha(PAPER, 0.75);
          c.fill();
          c.restore();
        }

        /* --------------------------------------------------- remaining */
        for (let i = 0; i < cfg.targets; i++) {
          const x = LAYOUT.cx - ((cfg.targets - 1) * 50) / 2 + i * 50;
          const alive = i < remaining;
          g.body((gg) => gg.circle(x, 520, 16), {
            fill: alive ? targetColor : alpha(PAPER, 0.2),
            extrude: 0,
            shade: 0.1,
            gloss: alive ? 0.45 : 0,
            lw: 5,
            outline: alive ? INK : alpha(INK, 0.4),
          });
        }
      },
    };
  },
};
