/**
 * たたけ！ — tap every bug before the clock runs out.
 *
 * The pure-tap entry in the collection. Its whole design problem is making
 * "which of these do I touch?" answerable in a glance, so the decoys are a
 * different silhouette, not just a different colour.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1700;
const FIELD = { x0: 190, x1: 890, y0: 330, y1: 1560 };
const HIT_R = 118; // generous: fingers are not mouse pointers

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'swat',
  command: 'たたけ！',
  input: 'tap',
  stage: 'town',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: they sit still and there is nothing to avoid.
      { bugs: 3, decoys: 0, speed: 0, hop: 0 },
      // L2 adds a decision: a ladybug you must NOT hit, and they crawl.
      { bugs: 5, decoys: 1, speed: 90, hop: 0 },
      // L3 adds pressure: faster, two decoys, and they teleport-hop.
      { bugs: 7, decoys: 2, speed: 190, hop: 1.6 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    const spot = () => ({
      x: rng.range(FIELD.x0, FIELD.x1),
      y: rng.range(FIELD.y0, FIELD.y1),
    });

    /** @type {{x:number,y:number,tx:number,ty:number,decoy:boolean,dead:boolean,
     *   wobble:number,hopAt:number,squash:number,legPhase:number,color:string}[]} */
    const bugs = [];
    for (let i = 0; i < cfg.bugs + cfg.decoys; i++) {
      const decoy = i >= cfg.bugs;
      const p = spot();
      bugs.push({
        ...p,
        tx: p.x,
        ty: p.y,
        decoy,
        dead: false,
        wobble: rng.range(0, Math.PI * 2),
        hopAt: cfg.hop ? rng.range(1, 5) : Infinity,
        squash: 0,
        legPhase: rng.range(0, Math.PI * 2),
        color: decoy ? SEMANTIC.danger : palette.props[rng.int(0, 2)],
      });
    }

    let remaining = cfg.bugs;
    let lost = false;
    let won = false;
    let elapsed = -2;

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return lost ? 'lose' : 'playing';

        for (const b of bugs) {
          if (b.dead) continue;
          b.wobble += dt * 4;
          b.legPhase += dt * 14;
          b.squash = Math.max(0, b.squash - dt * 5);

          if (elapsedBeats >= b.hopAt) {
            const p = spot();
            b.tx = p.x;
            b.ty = p.y;
            b.hopAt = elapsedBeats + rng.range(1.2, 2.4);
            fx.puff(b.x, b.y, { count: 3, color: alpha(PAPER, 0.7), size: 22 });
          }
          if (cfg.speed > 0) {
            const dx = b.tx - b.x;
            const dy = b.ty - b.y;
            const d = Math.hypot(dx, dy);
            if (d < 12) {
              const p = spot();
              b.tx = p.x;
              b.ty = p.y;
            } else {
              const step = Math.min(d, cfg.speed * dt);
              b.x += (dx / d) * step;
              b.y += (dy / d) * step;
            }
          }
        }

        for (const t of input.taps) {
          let best = null;
          let bestD = HIT_R;
          for (const b of bugs) {
            if (b.dead) continue;
            const d = Math.hypot(b.x - t.x, b.y - t.y);
            if (d < bestD) {
              bestD = d;
              best = b;
            }
          }
          if (!best) {
            // A whiff still gets feedback, or the game feels unresponsive.
            fx.ring(t.x, t.y, { color: alpha(PAPER, 0.6), size: 20, grow: 480 });
            audio.sfx('tick');
            continue;
          }
          if (best.decoy) {
            lost = true;
            best.squash = 1;
            fx.burst(best.x, best.y, { count: 20, colors: [SEMANTIC.danger, PAPER], power: 1.2 });
            fx.shake(24);
            fx.flash(SEMANTIC.danger, 0.3);
            audio.sfx('wrong');
            return 'lose';
          }
          best.dead = true;
          best.squash = 1;
          remaining--;
          fx.burst(best.x, best.y, { count: 12, colors: [best.color, PAPER], power: 0.9 });
          fx.ring(best.x, best.y, { color: PAPER, size: 24, grow: 780 });
          fx.shake(8);
          fx.freeze(0.05);
          audio.sfx('hit');
          if (remaining <= 0) return 'win';
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
      },

      debugHint() {
        const live = bugs.find((b) => !b.dead && !b.decoy);
        return live ? { type: 'tap', x: live.x, y: live.y } : null;
      },

      draw(g) {
        const c = g.c;
        backdrop.draw(g, ctx.conductor.beat);

        for (const b of bugs) {
          const squash = b.squash;
          if (b.dead && squash <= 0) continue;

          c.save();
          c.translate(b.x, b.y);
          if (b.dead) {
            // Flattened: unmistakably done, and funny.
            c.scale(1 + squash * 0.5, Math.max(0.15, 1 - squash * 0.85));
            c.globalAlpha = squash;
          } else {
            const bob = Math.sin(b.wobble) * 0.05;
            c.scale(1 + bob, 1 - bob);
          }

          g.ground(0, 46, 46, 14, 0.2);

          // Legs first so the body overlaps them.
          for (const sx of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              const a = -0.5 + i * 0.5 + Math.sin(b.legPhase + i) * 0.25;
              g.body(
                (gg) =>
                  gg.capsule(sx * 26, -6 + i * 10, sx * (60 + i * 4), -6 + i * 10 + a * 26, 7),
                { fill: INK, extrude: 0, shade: 0, gloss: 0, lw: 0 },
              );
            }
          }

          if (b.decoy) {
            // Ladybug: round, red, spotted — a different silhouette from the
            // targets, so "do not hit this" is readable without reading.
            g.body((gg) => gg.circle(0, 0, 52), {
              fill: b.color,
              extrude: 10,
              shade: 0.24,
              gloss: 0.45,
              lw: STROKE.base,
            });
            c.beginPath();
            c.moveTo(0, -52);
            c.lineTo(0, 52);
            c.lineWidth = 7;
            c.strokeStyle = INK;
            c.stroke();
            for (const [sx, sy] of [
              [-24, -14],
              [24, -14],
              [-20, 22],
              [20, 22],
            ]) {
              c.beginPath();
              c.arc(sx, sy, 10, 0, Math.PI * 2);
              c.fillStyle = INK;
              c.fill();
            }
          } else {
            g.body((gg) => gg.ellipse(0, 0, 48, 40, 0), {
              fill: b.color,
              extrude: 10,
              shade: 0.26,
              gloss: 0.4,
              lw: STROKE.base,
            });
            // Wings suggest it could leave — a reason to hurry.
            g.body((gg) => gg.ellipse(0, -12, 34, 22, 0), {
              fill: alpha(PAPER, 0.55),
              extrude: 0,
              shade: 0,
              gloss: 0.4,
              lw: 4,
            });
          }

          g.face(0, -6, {
            scale: 0.85,
            blink: b.dead ? 1 : 0,
            mouth: b.dead ? 'flat' : b.decoy ? 'smile' : 'open',
          });
          c.restore();
        }

        /* --------------------------------------------------- remaining */
        // Dots showing how many are left, so the goal is always visible.
        for (let i = 0; i < cfg.bugs; i++) {
          const x = LAYOUT.cx - ((cfg.bugs - 1) * 50) / 2 + i * 50;
          const alive = i < remaining;
          g.body((gg) => gg.circle(x, 258, 16), {
            fill: alive ? palette.accent2 : alpha(PAPER, 0.2),
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
