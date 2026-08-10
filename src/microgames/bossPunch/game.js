/**
 * たたきかえせ！ — boss game.
 *
 * The other boss is about evasion, so this one is about offence: everything the
 * boss throws can be swatted straight back at it. Sixteen beats is long enough
 * for the fight to develop a rhythm — throw, return, throw, return — and for the
 * health bar to visibly tell the player they are winning.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, RADIUS, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1740;
const PLAYER_Y = GROUND_Y - 150;
const BOSS_Y = 380;
const HIT_R = 120; // generous tap radius: fingers are not mouse pointers

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'bossPunch',
  command: 'たたきかえせ！',
  input: 'tap',
  stage: 'any',
  boss: true,
  lengthBeats: 16,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1: one at a time, slow, no armour — learn the swat.
      { hp: 6, speed: 430, interval: 1.9, pairChance: 0, armorChance: 0 },
      // L2: pairs arrive together, so you must prioritise.
      { hp: 9, speed: 540, interval: 1.45, pairChance: 0.45, armorChance: 0 },
      // L3: armoured shots need two hits, which breaks your rhythm.
      { hp: 12, speed: 660, interval: 1.15, pairChance: 0.55, armorChance: 0.4 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    /** @type {{beat:number, lanes:number[], armored:boolean[], done:boolean}[]} */
    const script = [];
    for (let b = 0.7; b < 14.4; b += cfg.interval) {
      const pair = rng.chance(cfg.pairChance);
      const lanes = pair ? rng.shuffle([0, 1, 2]).slice(0, 2) : [rng.int(0, 2)];
      script.push({
        beat: b,
        lanes,
        armored: lanes.map(() => rng.chance(cfg.armorChance)),
        done: false,
      });
    }

    const laneX = (i) => 280 + i * 260;

    /** @type {{x:number,y:number,hp:number,armored:boolean,spin:number,rot:number}[]} */
    const shots = [];
    /** @type {{x:number,y:number,rot:number}[]} */
    const returns = [];

    let bossHp = cfg.hp;
    const bossHpMax = cfg.hp;
    let bossFlash = 0;
    let bossLean = 0;
    let swing = 0;
    let lost = false;
    let won = false;

    return {
      update(dt, input, elapsedBeats) {
        if (dt <= 0) return lost ? 'lose' : 'playing';

        bossFlash = Math.max(0, bossFlash - dt * 3);
        swing = Math.max(0, swing - dt * 4);
        bossLean += (0 - bossLean) * Math.min(1, dt * 6);

        if (elapsedBeats >= 0) {
          for (const s of script) {
            if (s.done || elapsedBeats < s.beat) continue;
            s.done = true;
            s.lanes.forEach((ln, k) => {
              shots.push({
                x: laneX(ln),
                y: BOSS_Y + 210,
                hp: s.armored[k] ? 2 : 1,
                armored: s.armored[k],
                spin: rng.range(-4, 4),
                rot: 0,
              });
            });
            bossLean = 0.16;
            audio.sfx('whoosh');
          }
        }

        for (const t of input.taps) {
          let best = -1;
          let bestD = HIT_R;
          for (let i = 0; i < shots.length; i++) {
            const d = Math.hypot(shots[i].x - t.x, shots[i].y - t.y);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          if (best < 0) {
            // A whiff still gets feedback, or the game feels broken.
            fx.ring(t.x, t.y, { color: alpha(PAPER, 0.7), size: 24, grow: 500 });
            audio.sfx('tick');
            continue;
          }
          const s = shots[best];
          swing = 1;
          s.hp--;
          if (s.hp > 0) {
            fx.burst(s.x, s.y, { count: 8, colors: ['#d8dce8', PAPER], power: 0.7 });
            fx.shake(6);
            audio.sfx('thud');
          } else {
            shots.splice(best, 1);
            returns.push({ x: s.x, y: s.y, rot: 0 });
            fx.burst(s.x, s.y, { count: 14, colors: [palette.accent2, PAPER], power: 1 });
            fx.ring(s.x, s.y, { color: PAPER, size: 30, grow: 850 });
            fx.shake(10);
            fx.freeze(0.05);
            audio.sfx('hit');
          }
        }

        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i];
          s.y += cfg.speed * dt;
          s.rot += s.spin * dt;
          if (s.y >= PLAYER_Y - 40) {
            lost = true;
            fx.burst(s.x, PLAYER_Y, { count: 20, colors: [SEMANTIC.danger, PAPER], power: 1.2 });
            fx.shake(24);
            audio.sfx('thud');
            return 'lose';
          }
        }

        for (let i = returns.length - 1; i >= 0; i--) {
          const r = returns[i];
          r.y -= 1250 * dt;
          r.rot += 9 * dt;
          if (r.y <= BOSS_Y + 140) {
            returns.splice(i, 1);
            bossHp--;
            bossFlash = 1;
            bossLean = -0.22;
            fx.burst(r.x, BOSS_Y + 150, {
              count: 16,
              colors: [palette.accent3, PAPER],
              power: 1.1,
            });
            fx.shake(14);
            audio.sfx('hit');
            if (bossHp <= 0) return 'win';
          }
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        if (w) {
          fx.burst(LAYOUT.cx, BOSS_Y, {
            count: 40,
            colors: [palette.accent, palette.accent2, palette.accent3, PAPER],
            power: 1.6,
          });
          fx.flash(PAPER, 0.5);
          fx.shake(26);
          audio.sfx('fanfare');
        }
      },

      debugHint() {
        // Always swat whichever shot is closest to landing.
        let target = null;
        let lowest = -Infinity;
        for (const s of shots) {
          if (s.y > lowest) {
            lowest = s.y;
            target = s;
          }
        }
        return target ? { type: 'tap', x: target.x, y: target.y } : null;
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* ------------------------------------------------------- boss */
        const flash = tween(bossFlash, ease.outCubic);
        c.save();
        c.translate(LAYOUT.cx, BOSS_Y);
        c.rotate(bossLean);
        const pulse = 1 + Math.sin(beat * Math.PI) * 0.035 + flash * 0.08;
        c.scale(pulse, pulse);
        // Spikes in a single body() call — one shaded pass instead of seven.
        g.body(
          (gg) => {
            for (let i = 0; i < 7; i++) {
              const a = (i / 7) * Math.PI * 2 + beat * 0.35;
              const cx = Math.cos(a) * 200;
              const cy = Math.sin(a) * 200;
              const ux = Math.cos(a + Math.PI / 2);
              const uy = Math.sin(a + Math.PI / 2);
              const pt = (lx, ly) => [cx + lx * ux - ly * uy, cy + lx * uy + ly * ux];
              gg.poly([pt(-34, 0), pt(0, -58), pt(34, 0)]);
            }
          },
          {
            fill: darken(palette.accent, 0.3),
            extrude: 0,
            shade: 0.2,
            gloss: 0.2,
            lw: STROKE.thin,
          },
        );
        g.body((gg) => gg.blob(0, 0, 210, 0.12, 8, beat * 0.35), {
          fill: flash > 0.1 ? lighten(palette.accent, 0.55) : palette.accent,
          extrude: 18,
          shade: 0.26,
          gloss: 0.3,
          lw: STROKE.bold,
        });
        g.face(0, 0, {
          scale: 2.1,
          lookY: 0.7,
          blink: flash > 0.4 ? 1 : 0,
          mouth: bossHp <= bossHpMax * 0.34 ? 'sad' : 'open',
        });
        c.restore();

        /* --------------------------------------------------- boss hp */
        const barW = 700;
        const barH = 38;
        const bx = LAYOUT.cx - barW / 2;
        const by = 660;
        g.body((gg) => gg.rrect(bx - 8, by - 8, barW + 16, barH + 16, RADIUS.pill), {
          fill: alpha(INK, 0.45),
          extrude: 0,
          shade: 0,
          gloss: 0,
          lw: 0,
        });
        const frac = Math.max(0, bossHp / bossHpMax);
        if (frac > 0) {
          c.save();
          g.begin().rrect(bx, by, Math.max(barH, barW * frac), barH, RADIUS.pill);
          c.fillStyle = frac > 0.34 ? SEMANTIC.danger : SEMANTIC.warn;
          c.fill();
          c.lineWidth = 4;
          c.strokeStyle = alpha(INK, 0.55);
          c.stroke();
          c.restore();
        }

        /* ------------------------------------------------------ shots */
        for (const s of shots) {
          // Shadow grows as it closes: read the danger without doing maths.
          const prox = Math.max(0, Math.min(1, s.y / PLAYER_Y));
          g.ground(s.x, GROUND_Y - 16, 44 * (0.4 + prox * 0.8), 14, 0.1 + prox * 0.18);
          c.save();
          c.translate(s.x, s.y);
          c.rotate(s.rot);
          if (s.armored) {
            g.body((gg) => gg.star(0, 0, 62, 44, 8, 0), {
              fill: s.hp > 1 ? '#c3cad8' : palette.props[0],
              extrude: 10,
              shade: 0.28,
              gloss: 0.42,
              lw: STROKE.base,
            });
            if (s.hp <= 1) {
              // Cracked: tells the player one more hit will do it.
              c.beginPath();
              c.moveTo(-26, -20);
              c.lineTo(4, 2);
              c.lineTo(-10, 26);
              c.lineWidth = 6;
              c.strokeStyle = INK;
              c.stroke();
            }
          } else {
            g.body((gg) => gg.circle(0, 0, 54), {
              fill: palette.props[2] ?? palette.accent3,
              extrude: 10,
              shade: 0.26,
              gloss: 0.4,
              lw: STROKE.base,
            });
          }
          c.restore();
        }

        for (const r of returns) {
          c.save();
          c.translate(r.x, r.y);
          c.rotate(r.rot);
          g.body((gg) => gg.star(0, 0, 50, 24, 5, 0), {
            fill: palette.accent2,
            extrude: 0,
            shade: 0.2,
            gloss: 0.5,
            lw: STROKE.thin,
          });
          c.restore();
        }

        /* ----------------------------------------------------- player */
        const sw = tween(swing, ease.outCubic);
        g.ground(LAYOUT.cx, GROUND_Y - 18, 92, 26, 0.24);
        c.save();
        c.translate(LAYOUT.cx, PLAYER_Y + 40);
        c.rotate(-sw * 0.22);
        // Bat, raised on each swat.
        c.save();
        c.translate(56, -30);
        c.rotate(-0.7 + sw * 1.5);
        g.body((gg) => gg.capsule(0, 0, 0, -150, 22), {
          fill: palette.props[4] ?? PAPER,
          extrude: 0,
          shade: 0.2,
          gloss: 0.35,
          lw: STROKE.thin,
        });
        c.restore();
        g.body((gg) => gg.circle(0, 0, 76), {
          fill: lost ? '#9aa0b5' : palette.accent2,
          extrude: 16,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -8, {
          scale: 1.4,
          lookY: -0.5,
          blink: lost ? 1 : 0,
          mouth: lost ? 'sad' : won ? 'open' : 'flat',
        });
        c.restore();
      },
    };
  },
};
