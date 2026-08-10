/**
 * よけろ！ — the reference microgame.
 *
 * This one exists to prove the contract end to end: seeded RNG, beat-relative
 * motion, drag input, three genuinely different levels, house-style drawing,
 * and a deliberate timeout verdict (surviving the clock is a WIN here).
 * Copy this file's shape when writing a new game.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT } from '../../design/tokens.js';
import { alpha, darken } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1660;
const PLAYER_R = 78;
const LEFT = 150;
const RIGHT = 930;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'dodge',
  command: 'よけろ！',
  input: 'drag',
  stage: 'town',
  lengthBeats: 8,
  // Surviving the clock is the win condition — the host must not fail us out.
  timeoutResult: 'win',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: few rocks, generous telegraph, wide gaps.
      { count: 5, fall: 720, radius: 58, telegraph: 1.0, aimed: 0, spin: 3 },
      // L2 adds a decision: some rocks are aimed where you already are.
      { count: 8, fall: 880, radius: 54, telegraph: 0.75, aimed: 0.45, spin: 5 },
      // L3 adds pressure: dense, fast, and mostly aimed.
      { count: 12, fall: 1040, radius: 50, telegraph: 0.5, aimed: 0.75, spin: 8 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    /** @type {{beat:number, x:number, aimed:boolean, spawned:boolean}[]} */
    const schedule = [];
    {
      // Spread spawns across the playable window, jittered off the grid so the
      // pattern never feels like a metronome.
      const window = ctx.lengthBeats - 1.4;
      for (let i = 0; i < cfg.count; i++) {
        schedule.push({
          beat: 0.25 + (i / cfg.count) * window + rng.range(-0.12, 0.12),
          x: rng.range(LEFT + 40, RIGHT - 40),
          aimed: rng.chance(cfg.aimed),
          spawned: false,
        });
      }
      schedule.sort((a, b) => a.beat - b.beat);
    }

    /** @type {{x:number,y:number,vy:number,r:number,rot:number,spin:number,color:string}[]} */
    const rocks = [];

    let playerX = LAYOUT.cx;
    let targetX = LAYOUT.cx;
    let tilt = 0;
    let squash = 0;
    let hopPhase = rng.range(0, Math.PI * 2);
    let hit = false;
    let won = false;
    let elapsed = 0;

    const rockColors = [palette.accent, palette.accent3, palette.props[5] ?? palette.accent2];

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return hit ? 'lose' : 'playing';

        // ---- input: drag anywhere, the character follows your finger's x ----
        if (input.primary) targetX = input.primary.x;
        else if (input.taps.length) targetX = input.taps[input.taps.length - 1].x;
        targetX = Math.max(LEFT, Math.min(RIGHT, targetX));

        const prevX = playerX;
        // Frame-rate independent smoothing, in beats so it tightens with tempo.
        playerX += (targetX - playerX) * (1 - Math.pow(0.0006, dt));
        const dx = playerX - prevX;
        tilt += (Math.max(-0.42, Math.min(0.42, dx * 0.02)) - tilt) * Math.min(1, dt * 9);
        hopPhase += dt * Math.PI * 2;
        squash *= Math.max(0, 1 - dt * 7);

        // ---- spawning ----
        if (elapsedBeats >= 0) {
          for (const s of schedule) {
            if (s.spawned || elapsedBeats < s.beat) continue;
            s.spawned = true;
            rocks.push({
              x: s.aimed ? Math.max(LEFT, Math.min(RIGHT, playerX + rng.range(-70, 70))) : s.x,
              y: -70,
              vy: cfg.fall * rng.range(0.92, 1.12),
              r: cfg.radius * rng.range(0.9, 1.15),
              rot: rng.range(0, Math.PI * 2),
              spin: rng.range(-cfg.spin, cfg.spin),
              color: rng.pick(rockColors),
            });
            audio.sfx('whoosh');
          }
        }

        // ---- rocks ----
        for (let i = rocks.length - 1; i >= 0; i--) {
          const r = rocks[i];
          r.y += r.vy * dt;
          r.rot += r.spin * dt;

          if (!hit && !won) {
            const d = Math.hypot(r.x - playerX, r.y - (GROUND_Y - PLAYER_R));
            if (d < r.r + PLAYER_R * 0.82) {
              hit = true;
              fx.burst(r.x, r.y, { count: 18, colors: [r.color, PAPER], power: 1.1 });
              audio.sfx('thud');
              return 'lose';
            }
          }

          if (r.y - r.r > GROUND_Y + 20) {
            fx.puff(r.x, GROUND_Y, { count: 4, color: alpha(PAPER, 0.9), size: 26 });
            fx.shake(4);
            audio.sfx('tick');
            rocks.splice(i, 1);
          }
        }

        return 'playing';
      },

      /**
       * QA hook: where should the player be right now? Sampling the lane and
       * scoring by distance to incoming rocks is exactly the reasoning a human
       * does, so if this cannot survive the level, neither can a player.
       */
      debugHint() {
        let bestX = playerX;
        let bestScore = -Infinity;
        for (let x = LEFT; x <= RIGHT; x += 30) {
          let score = 0;
          for (const r of rocks) {
            const beatsToImpact = Math.max(0.001, (GROUND_Y - PLAYER_R - r.y) / r.vy);
            score -= (1 / (0.25 + beatsToImpact)) * Math.max(0, 260 - Math.abs(r.x - x));
          }
          score -= Math.abs(x - playerX) * 0.06; // prefer not to sprint
          if (score > bestScore) {
            bestScore = score;
            bestX = x;
          }
        }
        return { type: 'drag', x: bestX, y: GROUND_Y - PLAYER_R };
      },

      onResult(w) {
        won = w;
        if (w) {
          squash = 1;
          fx.burst(playerX, GROUND_Y - PLAYER_R * 2, {
            count: 14,
            colors: [palette.accent2, PAPER],
            power: 0.9,
          });
        }
      },

      draw(g) {
        const c = g.c;
        // Scenery comes from the shared scene kit, so this game's world matches
        // every other game on the same stage.
        backdrop.draw(g, ctx.conductor.beat);

        /* -------------------------------------------------- telegraphs */
        // A marker shows where the next rock lands, so a miss is always the
        // player's fault rather than the game's.
        for (const s of schedule) {
          if (s.spawned || s.aimed) continue;
          const lead = s.beat - elapsed;
          if (lead > cfg.telegraph || lead < 0) continue;
          const p = 1 - lead / cfg.telegraph;
          c.save();
          c.globalAlpha = 0.25 + p * 0.5;
          g.begin().ellipse(s.x, GROUND_Y - 6, 46 + p * 26, 14 + p * 6, 0);
          c.fillStyle = palette.accent;
          c.fill();
          c.lineWidth = 5;
          c.strokeStyle = alpha(INK, 0.5);
          c.stroke();
          c.restore();
        }

        /* ------------------------------------------------------ player */
        const py = GROUND_Y - PLAYER_R;
        const hop = Math.abs(Math.sin(hopPhase)) * 10;
        const sq = 1 + squash * 0.25;
        c.save();
        g.ground(playerX, GROUND_Y + 6, PLAYER_R * 0.9, PLAYER_R * 0.26, 0.24);
        c.translate(playerX, py - hop);
        c.rotate(tilt);
        c.scale(1 / sq, sq);

        const bodyColor = hit ? '#9aa0b5' : palette.accent2;
        // Little feet, drawn first so the body overlaps their tops.
        for (const sx of [-1, 1]) {
          g.body((gg) => gg.ellipse(sx * 30, PLAYER_R * 0.86, 24, 15, 0), {
            fill: darken(bodyColor, 0.28),
            extrude: 0,
            shade: 0.12,
            gloss: 0.2,
            lw: STROKE.thin,
          });
        }
        g.body((gg) => gg.circle(0, 0, PLAYER_R), {
          fill: bodyColor,
          extrude: 14,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -8, {
          scale: 1.35,
          lookX: Math.max(-1, Math.min(1, (targetX - playerX) / 120)),
          lookY: 0.4,
          blink: hit ? 1 : Math.sin(hopPhase * 0.7) > 0.96 ? 1 : 0,
          mouth: hit ? 'sad' : won ? 'open' : 'smile',
        });
        c.restore();

        /* ------------------------------------------------------- rocks */
        for (const r of rocks) {
          // Shadow on the ground grows as the rock approaches: cheap, readable
          // depth cue that tells you exactly where it will land.
          const prox = Math.max(0, Math.min(1, (r.y + r.r) / GROUND_Y));
          g.ground(r.x, GROUND_Y + 4, r.r * (0.35 + prox * 0.7), r.r * 0.2, 0.1 + prox * 0.18);

          c.save();
          c.translate(r.x, r.y);
          c.rotate(r.rot);
          g.body((gg) => gg.star(0, 0, r.r, r.r * 0.62, 7, 0), {
            fill: r.color,
            extrude: 10,
            shade: 0.26,
            gloss: 0.3,
            lw: STROKE.base,
          });
          c.restore();
        }
      },
    };
  },
};
