/**
 * リズム！ — tap each marker as it reaches the line.
 *
 * The one game that is literally the music. Marker times are whole and half
 * beats read straight off `ctx.conductor.beat`, so a player who taps along with
 * the song is correct by construction — which is the entire promise of putting
 * a beat clock at the centre of this engine.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1700;
const LINE_X = 300;
const LINE_Y = 1080;
const APPROACH_BEATS = 2; // how long a marker is visible before it lands
const TRAVEL = 700; // virtual units a marker covers in that time

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'beat',
  command: 'リズム！',
  input: 'tap',
  stage: 'neon',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: four notes, straight on the beat, wide window.
      // The window is in beats, so it tightens on its own as the tempo climbs.
      { pattern: [0, 1, 2, 3], window: 0.42, rests: 0 },
      // L2 adds a decision: off-beat eighths join in, tighter window.
      { pattern: [0, 1, 1.5, 2, 3, 3.5], window: 0.32, rests: 0 },
      // L3 adds a trap: a syncopated line with one rest that must NOT be hit.
      { pattern: [0, 0.5, 1.5, 2, 2.5, 3.5, 4, 4.5], window: 0.24, rests: 1 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    // Offset so the first marker lands after it has had time to travel.
    const START = APPROACH_BEATS + 0.4;
    const restIndex = cfg.rests ? rng.int(1, cfg.pattern.length - 2) : -1;

    /** @type {{at:number, rest:boolean, hit:boolean, missed:boolean, judged:number}[]} */
    const notes = cfg.pattern.map((t, i) => ({
      at: START + t,
      rest: i === restIndex,
      hit: false,
      missed: false,
      judged: 0,
    }));

    const needed = notes.filter((n) => !n.rest).length;
    let scored = 0;
    let lost = false;
    let won = false;
    let elapsed = -2;
    let flash = 0;
    let lastJudge = '';

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return lost ? 'lose' : 'playing';
        flash = Math.max(0, flash - dt * 3);

        for (const n of notes) {
          n.judged = Math.max(0, n.judged - dt * 2);
          // A live note that sails past the window is a miss.
          if (!n.rest && !n.hit && !n.missed && elapsedBeats > n.at + cfg.window) {
            n.missed = true;
            lost = true;
            fx.shake(22);
            fx.flash(SEMANTIC.danger, 0.3);
            audio.sfx('wrong');
            return 'lose';
          }
        }

        for (const _t of input.taps) {
          // Judge against the nearest un-hit marker, live or rest.
          let best = null;
          let bestD = Infinity;
          for (const n of notes) {
            if (n.hit || n.missed) continue;
            const d = Math.abs(elapsedBeats - n.at);
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
          if (!best || bestD > cfg.window) {
            lost = true;
            fx.shake(20);
            fx.flash(SEMANTIC.danger, 0.28);
            audio.sfx('wrong');
            return 'lose';
          }
          if (best.rest) {
            // Tapping the rest is the level-3 trap.
            best.hit = true;
            lost = true;
            fx.burst(LINE_X, LINE_Y, { count: 20, colors: [SEMANTIC.danger, PAPER], power: 1.2 });
            fx.shake(24);
            audio.sfx('wrong');
            return 'lose';
          }
          best.hit = true;
          best.judged = 1;
          lastJudge = bestD < cfg.window * 0.45 ? 'PERFECT' : 'GOOD';
          scored++;
          flash = 1;
          fx.burst(LINE_X, LINE_Y, {
            count: lastJudge === 'PERFECT' ? 16 : 9,
            colors: [palette.accent2, palette.accent3, PAPER],
            power: lastJudge === 'PERFECT' ? 1.1 : 0.7,
          });
          fx.ring(LINE_X, LINE_Y, { color: PAPER, size: 30, grow: 820 });
          fx.pop(LINE_X, LINE_Y - 130, lastJudge === 'PERFECT' ? 'パーフェクト' : 'グッド', {
            color: lastJudge === 'PERFECT' ? SEMANTIC.gold : PAPER,
            size: 52,
          });
          fx.freeze(0.04);
          audio.sfx(lastJudge === 'PERFECT' ? 'sparkle' : 'hit');
          if (scored >= needed) return 'win';
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
      },

      debugHint() {
        // Ask for a tap anywhere inside a live note's window. Restricting this
        // to the inner half made the window narrower than the harness's own
        // round-trip time, so a perfectly winnable game looked unwinnable.
        for (const n of notes) {
          if (n.hit || n.missed || n.rest) continue;
          if (Math.abs(elapsed - n.at) <= cfg.window * 0.9) {
            return { type: 'tap', x: LAYOUT.cx, y: LAYOUT.cy };
          }
        }
        return null;
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* ------------------------------------------------- approach lane */
        c.save();
        c.globalAlpha = 0.22;
        g.begin().rrect(LINE_X - 120, LINE_Y - 90, 1100, 180, 90);
        c.fillStyle = INK;
        c.fill();
        c.restore();

        /* ------------------------------------------------ judgement line */
        const lineGlow = tween(flash, ease.outCubic);
        c.save();
        c.translate(LINE_X, LINE_Y);
        c.scale(1 + lineGlow * 0.18, 1 + lineGlow * 0.18);
        g.body((gg) => gg.circle(0, 0, 92), {
          fill: alpha(PAPER, 0.14),
          extrude: 0,
          shade: 0,
          gloss: 0,
          lw: 10,
          outline: lineGlow > 0.05 ? PAPER : alpha(PAPER, 0.7),
        });
        c.restore();

        /* -------------------------------------------------------- notes */
        for (const n of notes) {
          if (n.hit || n.missed) continue;
          const lead = n.at - elapsed;
          if (lead > APPROACH_BEATS || lead < -cfg.window * 1.5) continue;
          const x = LINE_X + (lead / APPROACH_BEATS) * TRAVEL;
          const near = 1 - Math.min(1, Math.abs(lead) / APPROACH_BEATS);
          c.save();
          c.translate(x, LINE_Y);
          c.scale(0.8 + near * 0.3, 0.8 + near * 0.3);
          if (n.rest) {
            // Rests are hollow and grey: visibly not a thing to hit.
            g.body((gg) => gg.circle(0, 0, 56), {
              fill: alpha(INK, 0.45),
              extrude: 0,
              shade: 0,
              gloss: 0.1,
              lw: 9,
              outline: alpha(PAPER, 0.55),
            });
            c.beginPath();
            c.moveTo(-26, -26);
            c.lineTo(26, 26);
            c.moveTo(26, -26);
            c.lineTo(-26, 26);
            c.lineWidth = 10;
            c.lineCap = 'round';
            c.strokeStyle = alpha(PAPER, 0.7);
            c.stroke();
          } else {
            g.body((gg) => gg.circle(0, 0, 62), {
              fill: palette.accent2,
              extrude: 10,
              shade: 0.24,
              gloss: 0.45,
              lw: STROKE.base,
            });
            g.body((gg) => gg.star(0, 0, 30, 14, 4, 0), {
              fill: PAPER,
              extrude: 0,
              shade: 0,
              gloss: 0.3,
              lw: 4,
            });
          }
          c.restore();
        }

        /* -------------------------------------------------- note tally */
        // Sits just under the judgement line on its own plate: over the city
        // silhouette these dots were unreadable.
        const tallyY = 1270;
        const tallyW = needed * 48 + 40;
        g.body((gg) => gg.rrect(LAYOUT.cx - tallyW / 2, tallyY - 30, tallyW, 60, 30), {
          fill: alpha(INK, 0.4),
          extrude: 0,
          shade: 0,
          gloss: 0,
          lw: 0,
        });
        for (let i = 0; i < needed; i++) {
          const x = LAYOUT.cx - ((needed - 1) * 48) / 2 + i * 48;
          const done = i < scored;
          g.body((gg) => gg.circle(x, tallyY, 16), {
            fill: done ? palette.accent2 : alpha(PAPER, 0.2),
            extrude: 0,
            shade: 0.1,
            gloss: done ? 0.45 : 0,
            lw: 5,
            outline: done ? INK : alpha(INK, 0.4),
          });
        }

        /* ----------------------------------------------------- dancer */
        // Bounces on every beat, so the tempo is visible even while the lane is
        // empty. This is the game's metronome.
        const bounce = Math.abs(Math.sin(beat * Math.PI));
        const dx = LAYOUT.cx + 260;
        const dy = 1420;
        g.ground(dx, dy + 128, 92, 26, 0.24);
        c.save();
        c.translate(dx, dy - bounce * 46);
        c.rotate(Math.sin(beat * Math.PI * 2) * 0.08);
        c.scale(1 + bounce * 0.06, 1 - bounce * 0.06);
        g.body((gg) => gg.circle(0, 0, 96), {
          fill: lost ? '#9aa0b5' : palette.accent,
          extrude: 16,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -6, {
          scale: 1.5,
          lookY: -0.3,
          blink: lost ? 1 : bounce > 0.96 ? 1 : 0,
          mouth: lost ? 'sad' : won ? 'open' : bounce > 0.5 ? 'open' : 'smile',
        });
        c.restore();
      },
    };
  },
};
