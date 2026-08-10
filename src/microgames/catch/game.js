/**
 * キャッチ！ — drag a basket, catch everything that falls.
 *
 * The counterpart to よけろ！: same verb, opposite instinct. Putting the two in
 * the same rotation is deliberate — after a few rounds of dodging, being told to
 * catch is genuinely disorienting, which is exactly the joke WarioWare runs on.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1660;
const BASKET_Y = GROUND_Y - 120;
const BASKET_W = 210;
const LEFT = 150;
const RIGHT = 930;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'catch',
  command: 'キャッチ！',
  input: 'drag',
  stage: 'town',
  lengthBeats: 8,
  // Catching everything means surviving the clock, so a timeout is a win.
  timeoutResult: 'win',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: three slow fruit, straight down, well spaced.
      { count: 3, fall: 560, drift: 0, bombs: 0, r: 52 },
      // L2 adds a decision: they drift sideways, so you must lead the catch.
      { count: 5, fall: 720, drift: 190, bombs: 0, r: 48 },
      // L3 adds a hazard: one bomb you must deliberately NOT catch.
      { count: 7, fall: 880, drift: 260, bombs: 1, r: 44 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    /** @type {{beat:number,x:number,bomb:boolean,spawned:boolean}[]} */
    const schedule = [];
    {
      const window = ctx.lengthBeats - 2.4;
      const bombAt = cfg.bombs ? rng.int(1, cfg.count - 1) : -1;
      for (let i = 0; i < cfg.count; i++) {
        schedule.push({
          beat: 0.3 + (i / cfg.count) * window + rng.range(-0.1, 0.1),
          x: rng.range(LEFT + 60, RIGHT - 60),
          bomb: i === bombAt,
          spawned: false,
        });
      }
      schedule.sort((a, b) => a.beat - b.beat);
    }

    /** @type {{x:number,y:number,vx:number,vy:number,r:number,bomb:boolean,color:string,rot:number,spin:number}[]} */
    const items = [];

    let basketX = LAYOUT.cx;
    let targetX = LAYOUT.cx;
    let tilt = 0;
    let bounce = 0;
    let caught = 0;
    let failed = false;
    let won = false;
    let elapsed = -2;

    const fruitColors = [palette.accent, palette.accent2, palette.props[5] ?? palette.accent3];

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return failed ? 'lose' : 'playing';

        if (input.primary) targetX = input.primary.x;
        else if (input.taps.length) targetX = input.taps[input.taps.length - 1].x;
        targetX = Math.max(LEFT, Math.min(RIGHT, targetX));

        const prev = basketX;
        basketX += (targetX - basketX) * (1 - Math.pow(0.0006, dt));
        tilt +=
          (Math.max(-0.35, Math.min(0.35, (basketX - prev) * 0.02)) - tilt) * Math.min(1, dt * 10);
        bounce = Math.max(0, bounce - dt * 3.5);

        if (elapsedBeats >= 0) {
          for (const s of schedule) {
            if (s.spawned || elapsedBeats < s.beat) continue;
            s.spawned = true;
            items.push({
              x: s.x,
              y: -80,
              vx: s.bomb ? 0 : rng.range(-cfg.drift, cfg.drift),
              vy: cfg.fall * rng.range(0.94, 1.08),
              r: cfg.r * (s.bomb ? 1.05 : rng.range(0.92, 1.1)),
              bomb: s.bomb,
              color: s.bomb ? '#4a4560' : rng.pick(fruitColors),
              rot: rng.range(0, Math.PI * 2),
              spin: rng.range(-3, 3),
            });
            audio.sfx(s.bomb ? 'wrong' : 'whoosh');
          }
        }

        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          it.y += it.vy * dt;
          it.x += it.vx * dt;
          it.rot += it.spin * dt;
          // Bounce off the play-field walls rather than drifting off screen.
          if (it.x < LEFT || it.x > RIGHT) {
            it.vx *= -1;
            it.x = Math.max(LEFT, Math.min(RIGHT, it.x));
          }

          const overBasket = Math.abs(it.x - basketX) < BASKET_W / 2 + it.r * 0.35;
          if (!failed && it.y + it.r >= BASKET_Y && it.y < BASKET_Y + 70 && overBasket) {
            items.splice(i, 1);
            if (it.bomb) {
              failed = true;
              fx.burst(it.x, BASKET_Y, {
                count: 22,
                colors: ['#4a4560', SEMANTIC.danger],
                power: 1.2,
              });
              fx.shake(22);
              audio.sfx('wrong');
              return 'lose';
            }
            caught++;
            bounce = 1;
            fx.burst(it.x, BASKET_Y - 20, { count: 10, colors: [it.color, PAPER], power: 0.8 });
            fx.ring(it.x, BASKET_Y - 20, { color: lighten(it.color, 0.4), size: 26, grow: 700 });
            fx.freeze(0.04);
            audio.sfx('coin');
            continue;
          }

          if (it.y - it.r > GROUND_Y + 30) {
            items.splice(i, 1);
            if (it.bomb) {
              // The bomb is SUPPOSED to hit the floor. Reward the restraint.
              fx.puff(it.x, GROUND_Y, { count: 6, color: alpha(PAPER, 0.8), size: 30 });
              audio.sfx('tick');
              continue;
            }
            failed = true;
            fx.burst(it.x, GROUND_Y, { count: 16, colors: [it.color, '#8f83a3'], power: 1 });
            fx.shake(18);
            audio.sfx('thud');
            return 'lose';
          }
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        if (w) {
          bounce = 1;
          fx.burst(basketX, BASKET_Y - 60, {
            count: 16,
            colors: [palette.accent2, PAPER],
            power: 1,
          });
        }
      },

      debugHint() {
        // Track the lowest fruit; steer clear of a falling bomb.
        let target = null;
        let lowest = -Infinity;
        for (const it of items) {
          if (it.bomb) continue;
          if (it.y > lowest) {
            lowest = it.y;
            target = it;
          }
        }
        if (!target) {
          // Nothing to catch: park away from any bomb still in the air.
          const bomb = items.find((i) => i.bomb);
          const safe = bomb ? (bomb.x > LAYOUT.cx ? LEFT + 120 : RIGHT - 120) : LAYOUT.cx;
          return { type: 'drag', x: safe, y: BASKET_Y };
        }
        // Lead the drift so the basket is where the fruit WILL be.
        const lead = Math.max(0, (BASKET_Y - target.y) / target.vy);
        return { type: 'drag', x: target.x + target.vx * lead, y: BASKET_Y };
      },

      draw(g) {
        const c = g.c;
        backdrop.draw(g, ctx.conductor.beat);

        /* ------------------------------------------------------- items */
        for (const it of items) {
          const prox = Math.max(0, Math.min(1, (it.y + it.r) / GROUND_Y));
          g.ground(it.x, GROUND_Y + 4, it.r * (0.35 + prox * 0.7), it.r * 0.2, 0.1 + prox * 0.16);
          c.save();
          c.translate(it.x, it.y);
          c.rotate(it.rot);
          if (it.bomb) {
            g.body((gg) => gg.circle(0, 0, it.r), {
              fill: '#4a4560',
              extrude: 10,
              shade: 0.3,
              gloss: 0.45,
              lw: STROKE.base,
            });
            // Fuse + spark: the one thing on screen that must read as "no".
            c.beginPath();
            c.moveTo(0, -it.r);
            c.quadraticCurveTo(it.r * 0.5, -it.r * 1.5, it.r * 0.9, -it.r * 1.2);
            c.lineWidth = 9;
            c.strokeStyle = INK;
            c.lineCap = 'round';
            c.stroke();
            g.body((gg) => gg.star(it.r * 0.95, -it.r * 1.25, 22, 10, 5, ctx.conductor.beat * 6), {
              fill: SEMANTIC.warn,
              extrude: 0,
              shade: 0,
              gloss: 0.4,
              lw: 4,
            });
          } else {
            g.body((gg) => gg.circle(0, 0, it.r), {
              fill: it.color,
              extrude: 10,
              shade: 0.26,
              gloss: 0.42,
              lw: STROKE.base,
            });
            // Leaf, so fruit reads as fruit rather than as a ball.
            g.body((gg) => gg.ellipse(it.r * 0.35, -it.r * 0.95, 26, 13, -0.5), {
              fill: palette.ground,
              extrude: 0,
              shade: 0.2,
              gloss: 0.3,
              lw: STROKE.thin,
            });
          }
          c.restore();
        }

        /* ------------------------------------------------------ basket */
        const sq = 1 + bounce * 0.22;
        c.save();
        g.ground(basketX, GROUND_Y + 6, BASKET_W * 0.46, 24, 0.24);
        c.translate(basketX, BASKET_Y + 60);
        c.rotate(tilt);
        c.scale(sq, 1 / sq);

        // Carrier: two legs then the bowl, so the basket has something to sit on.
        for (const sx of [-1, 1]) {
          g.body((gg) => gg.capsule(sx * 40, 0, sx * 46, 62, 17), {
            fill: darken(palette.accent3, 0.15),
            extrude: 0,
            shade: 0.16,
            gloss: 0.24,
            lw: STROKE.thin,
          });
        }
        g.body(
          (gg) => {
            gg.moveTo(-BASKET_W / 2, -60);
            gg.lineTo(BASKET_W / 2, -60);
            gg.lineTo(BASKET_W / 2 - 34, 20);
            gg.lineTo(-BASKET_W / 2 + 34, 20);
            gg.close();
          },
          {
            fill: failed ? '#9aa0b5' : palette.accent3,
            extrude: 12,
            shade: 0.26,
            gloss: 0.34,
            lw: STROKE.base,
          },
        );
        // Rim highlight — reads as the opening you are aiming things into.
        g.body((gg) => gg.ellipse(0, -60, BASKET_W / 2, 22, 0), {
          fill: lighten(failed ? '#9aa0b5' : palette.accent3, 0.35),
          extrude: 0,
          shade: 0.1,
          gloss: 0.5,
          lw: STROKE.thin,
        });
        g.face(0, -104, {
          scale: 1.1,
          lookX: Math.max(-1, Math.min(1, (targetX - basketX) / 120)),
          lookY: -0.4,
          blink: failed ? 1 : 0,
          mouth: failed ? 'sad' : won ? 'open' : 'smile',
        });
        c.restore();

        /* ------------------------------------------------ caught tally */
        // A tiny running count so progress is legible without a HUD element.
        for (let i = 0; i < caught; i++) {
          const x = LAYOUT.cx - ((caught - 1) * 46) / 2 + i * 46;
          g.body((gg) => gg.circle(x, 1780, 15), {
            fill: palette.accent2,
            extrude: 0,
            shade: 0.1,
            gloss: 0.4,
            lw: 5,
          });
        }
      },
    };
  },
};
