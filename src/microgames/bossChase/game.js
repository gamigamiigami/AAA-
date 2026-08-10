/**
 * にげきれ！ — boss game.
 *
 * Bosses run for 16 beats instead of 8, so unlike a microgame they need an arc
 * rather than a single idea. This one moves through three scripted phases —
 * learn the walls, learn the orbs, survive both — while a giant looms overhead
 * and slams each wall into existence, so the escalation has a visible cause
 * instead of just a rising number.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1700;
const PLAYER_Y = GROUND_Y - 110;
const PLAYER_R = 62;
const LEFT = 130;
const RIGHT = 950;
const WALL_H = 62;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'bossChase',
  command: 'にげきれ！',
  input: 'drag',
  stage: 'any',
  boss: true,
  lengthBeats: 16,
  timeoutResult: 'win',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      { wallSpeed: 620, gap: 340, orbSpeed: 700, orbHoming: 0.15, waveGap: 1.5 },
      { wallSpeed: 740, gap: 290, orbSpeed: 840, orbHoming: 0.3, waveGap: 1.25 },
      { wallSpeed: 880, gap: 250, orbSpeed: 980, orbHoming: 0.45, waveGap: 1.0 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    /** @type {{beat:number, kind:'wall'|'orb', x:number, gapX:number, done:boolean}[]} */
    const script = [];
    const addWall = (b, pad) =>
      script.push({
        beat: b,
        kind: 'wall',
        x: 0,
        gapX: rng.range(LEFT + pad, RIGHT - pad),
        done: false,
      });
    const addOrb = (b) =>
      script.push({ beat: b, kind: 'orb', x: rng.range(LEFT, RIGHT), gapX: 0, done: false });

    for (let b = 0.8; b < 5.2; b += cfg.waveGap) addWall(b, 140);
    for (let b = 5.6; b < 10; b += cfg.waveGap * 0.62) addOrb(b);
    for (let b = 10.4; b < 15.2; b += cfg.waveGap * 0.8) {
      addWall(b, 130);
      addOrb(b + cfg.waveGap * 0.4);
    }
    script.sort((a, b) => a.beat - b.beat);

    /** @type {{y:number, gapX:number, passed:boolean}[]} */
    const walls = [];
    /** @type {{x:number, y:number, vx:number}[]} */
    const orbs = [];

    let playerX = LAYOUT.cx;
    let targetX = LAYOUT.cx;
    let tilt = 0;
    let runPhase = rng.range(0, 6);
    let hit = false;
    let won = false;
    let slam = 0;
    let phase = 0;

    return {
      update(dt, input, elapsedBeats) {
        if (dt <= 0) return hit ? 'lose' : 'playing';

        phase = elapsedBeats < 5.4 ? 0 : elapsedBeats < 10.2 ? 1 : 2;

        if (input.primary) targetX = input.primary.x;
        targetX = Math.max(LEFT, Math.min(RIGHT, targetX));
        const prev = playerX;
        playerX += (targetX - playerX) * (1 - Math.pow(0.0005, dt));
        tilt +=
          (Math.max(-0.4, Math.min(0.4, (playerX - prev) * 0.022)) - tilt) * Math.min(1, dt * 10);
        runPhase += dt * Math.PI * 3.4;
        slam = Math.max(0, slam - dt * 3.2);

        if (elapsedBeats >= 0) {
          for (const s of script) {
            if (s.done || elapsedBeats < s.beat) continue;
            s.done = true;
            if (s.kind === 'wall') {
              walls.push({ y: 560, gapX: s.gapX, passed: false });
              slam = 1;
              fx.shake(14);
              audio.sfx('thud');
            } else {
              orbs.push({ x: s.x, y: 540, vx: 0 });
              audio.sfx('whoosh');
            }
          }
        }

        for (let i = walls.length - 1; i >= 0; i--) {
          const w = walls[i];
          w.y += cfg.wallSpeed * dt;
          if (!hit && Math.abs(w.y - PLAYER_Y) < WALL_H / 2 + PLAYER_R * 0.7) {
            const inGap = Math.abs(playerX - w.gapX) < cfg.gap / 2 - PLAYER_R * 0.55;
            if (!inGap) {
              hit = true;
              fx.burst(playerX, PLAYER_Y, {
                count: 22,
                colors: [palette.accent, PAPER],
                power: 1.2,
              });
              audio.sfx('thud');
              return 'lose';
            }
          }
          if (!w.passed && w.y > PLAYER_Y + 60) {
            w.passed = true;
            fx.pop(playerX, PLAYER_Y - 150, 'ナイス', { color: SEMANTIC.success, size: 54 });
            audio.sfx('coin');
          }
          if (w.y > GROUND_Y + 160) walls.splice(i, 1);
        }

        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i];
          // Gentle homing: enough to force a decision, not enough to be unfair.
          o.vx += (playerX - o.x) * cfg.orbHoming * dt;
          o.vx *= Math.max(0, 1 - dt * 1.4);
          o.x += o.vx * dt;
          o.y += cfg.orbSpeed * dt;
          if (!hit && Math.hypot(o.x - playerX, o.y - PLAYER_Y) < PLAYER_R + 44) {
            hit = true;
            fx.burst(o.x, o.y, { count: 20, colors: [palette.accent3, PAPER], power: 1.1 });
            audio.sfx('thud');
            return 'lose';
          }
          if (o.y > GROUND_Y + 120) {
            fx.puff(o.x, GROUND_Y, { count: 4, color: alpha(PAPER, 0.85), size: 28 });
            orbs.splice(i, 1);
          }
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        if (w) {
          fx.burst(playerX, PLAYER_Y - 60, {
            count: 26,
            colors: [palette.accent2, palette.accent3, PAPER],
            power: 1.3,
          });
          audio.sfx('fanfare');
        }
      },

      debugHint() {
        // Score every lane by how dangerous it is right now, then run to the
        // safest one — the same reasoning a player does.
        let bestX = playerX;
        let bestScore = -Infinity;
        for (let x = LEFT; x <= RIGHT; x += 24) {
          let score = 0;
          for (const w of walls) {
            const lead = Math.max(0.001, (PLAYER_Y - w.y) / cfg.wallSpeed);
            const urgency = 1 / (0.2 + lead);
            const inGap = Math.abs(x - w.gapX) < cfg.gap / 2 - PLAYER_R * 0.8;
            score += inGap ? urgency * 40 : -urgency * 260;
          }
          for (const o of orbs) {
            const lead = Math.max(0.001, (PLAYER_Y - o.y) / cfg.orbSpeed);
            score -= (1 / (0.2 + lead)) * Math.max(0, 220 - Math.abs(o.x - x));
          }
          score -= Math.abs(x - playerX) * 0.05;
          if (score > bestScore) {
            bestScore = score;
            bestX = x;
          }
        }
        return { type: 'drag', x: bestX, y: PLAYER_Y };
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* ------------------------------------------------------- boss */
        // Looms above the play field, breathing on the beat, slamming when a
        // wall spawns so the hazard has an author.
        const slamK = tween(slam, ease.outCubic);
        c.save();
        c.translate(LAYOUT.cx, 300 + slamK * 26);
        for (const sx of [-1, 1]) {
          c.save();
          c.translate(sx * 250, 60);
          c.rotate(sx * (0.5 - slamK * 0.75));
          g.body((gg) => gg.capsule(0, 0, 0, 190, 44), {
            fill: darken(palette.accent, 0.18),
            extrude: 0,
            shade: 0.24,
            gloss: 0.24,
            lw: STROKE.base,
          });
          c.restore();
        }
        const breathe = 1 + Math.sin(beat * Math.PI) * 0.03;
        c.scale(breathe, breathe);
        g.body((gg) => gg.blob(0, 0, 215, 0.1, 8, beat * 0.4), {
          fill: palette.accent,
          extrude: 18,
          shade: 0.26,
          gloss: 0.3,
          lw: STROKE.bold,
        });
        g.face(0, 10, {
          scale: 2.3,
          lookX: (playerX - LAYOUT.cx) / 500,
          lookY: 0.6,
          mouth: phase === 2 ? 'shock' : 'open',
        });
        c.restore();

        /* ------------------------------------------------------ walls */
        for (const w of walls) {
          const halfGap = cfg.gap / 2;
          const f = g.full;
          for (const seg of [
            { x0: f.x0 - 40, x1: w.gapX - halfGap },
            { x0: w.gapX + halfGap, x1: f.x1 + 40 },
          ]) {
            const width = seg.x1 - seg.x0;
            if (width <= 0) continue;
            g.body((gg) => gg.rrect(seg.x0, w.y - WALL_H / 2, width, WALL_H, 16), {
              fill: palette.accent3,
              extrude: 10,
              shade: 0.24,
              gloss: 0.3,
              lw: STROKE.base,
            });
          }
          // Gap markers: the safe route must be the brightest thing on screen.
          for (const sx of [-1, 1]) {
            g.body((gg) => gg.circle(w.gapX + sx * halfGap, w.y, 17), {
              fill: palette.accent2,
              extrude: 0,
              shade: 0.1,
              gloss: 0.5,
              lw: 5,
            });
          }
        }

        /* ------------------------------------------------------- orbs */
        for (const o of orbs) {
          g.ground(o.x, GROUND_Y - 10, 40 * (0.4 + o.y / GROUND_Y), 12, 0.16);
          c.save();
          c.translate(o.x, o.y);
          c.rotate(beat * 2);
          g.body((gg) => gg.star(0, 0, 46, 26, 6, 0), {
            fill: SEMANTIC.danger,
            extrude: 8,
            shade: 0.26,
            gloss: 0.34,
            lw: STROKE.base,
          });
          c.restore();
        }

        /* ----------------------------------------------------- player */
        const bob = Math.abs(Math.sin(runPhase)) * 14;
        g.ground(playerX, GROUND_Y - 24, PLAYER_R * 0.85, PLAYER_R * 0.24, 0.24);
        c.save();
        c.translate(playerX, PLAYER_Y - bob);
        c.rotate(tilt);
        const bodyColor = hit ? '#9aa0b5' : palette.accent2;
        // Legs pump while running; drawn first so the body overlaps their tops.
        for (const sx of [-1, 1]) {
          const swing = Math.sin(runPhase + (sx > 0 ? Math.PI : 0)) * 26;
          g.body(
            (gg) =>
              gg.capsule(sx * 24, PLAYER_R * 0.6, sx * 24 + swing * 0.4, PLAYER_R * 0.6 + 52, 16),
            { fill: darken(bodyColor, 0.28), extrude: 0, shade: 0.14, gloss: 0.2, lw: STROKE.thin },
          );
        }
        g.body((gg) => gg.circle(0, 0, PLAYER_R), {
          fill: bodyColor,
          extrude: 14,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -6, {
          scale: 1.2,
          lookX: Math.max(-1, Math.min(1, (targetX - playerX) / 130)),
          lookY: -0.2,
          blink: hit ? 1 : 0,
          mouth: hit ? 'sad' : won ? 'open' : 'flat',
        });
        c.restore();
      },
    };
  },
};
