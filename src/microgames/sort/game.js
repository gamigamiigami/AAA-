/**
 * わけろ！ — flick each item into the matching bin.
 *
 * The swipe entry. Level 3 switches the sorting rule from colour to shape while
 * leaving the colours in place as a deliberate lie: the player has to notice
 * that the thing they were reading is no longer the thing that matters.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, RADIUS, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1700;
const ITEM_Y = 900;
const BIN_Y = 1380;
const BIN_W = 300;
const BIN_H = 260;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'sort',
  command: 'わけろ！',
  input: 'swipe',
  stage: 'town',
  lengthBeats: 8,
  timeoutResult: 'lose',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: sort by colour, bins never move.
      { count: 3, byShape: false, swapAt: Infinity },
      // L2 adds a decision: the bins trade places halfway through.
      { count: 4, byShape: false, swapAt: 3.2 },
      // L3 changes the rule: sort by SHAPE, colour is a red herring.
      { count: 5, byShape: true, swapAt: Infinity },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });

    // Two categories. Colour and shape are independent so level 3 can make the
    // colours actively misleading.
    const colors = [palette.accent, palette.accent3];
    const shapes = ['round', 'star'];

    /** @type {{color:0|1, shape:0|1}[]} */
    const queue = [];
    for (let i = 0; i < cfg.count; i++) {
      queue.push({
        color: /** @type {0|1} */ (rng.int(0, 1)),
        shape: /** @type {0|1} */ (rng.int(0, 1)),
      });
    }
    // In colour mode shape is irrelevant, so mirror it to avoid nonsense art.
    if (!cfg.byShape) for (const q of queue) q.shape = q.color;

    /** Which category each item belongs to under the active rule. */
    const categoryOf = (q) => (cfg.byShape ? q.shape : q.color);

    let index = 0;
    let swapped = false;
    let itemX = LAYOUT.cx;
    let itemY = ITEM_Y;
    let itemScale = 0;
    let flying = null; // {dir, t}
    let lost = false;
    let won = false;
    let elapsed = -2;
    let swapFlash = 0;

    /** Left bin holds category 0 unless the bins have swapped. */
    const binCategory = (side) => (swapped ? 1 - side : side);
    const binX = (side) => (side === 0 ? LAYOUT.cx - 250 : LAYOUT.cx + 250);

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return lost ? 'lose' : 'playing';

        // Entry pop for each new item.
        itemScale = Math.min(1, itemScale + dt * 5);
        swapFlash = Math.max(0, swapFlash - dt * 2);

        if (!swapped && elapsedBeats >= cfg.swapAt) {
          swapped = true;
          swapFlash = 1;
          fx.shake(12);
          fx.ring(LAYOUT.cx, BIN_Y, { color: PAPER, size: 60, grow: 900 });
          audio.sfx('speedUp');
        }

        if (flying) {
          flying.t += dt * 3.4;
          const k = tween(Math.min(1, flying.t), ease.inCubic);
          itemX = LAYOUT.cx + flying.dir * 250 * k;
          itemY = ITEM_Y + (BIN_Y - ITEM_Y - 40) * k;
          if (flying.t >= 1) {
            flying = null;
            index++;
            itemScale = 0;
            itemX = LAYOUT.cx;
            itemY = ITEM_Y;
            if (index >= queue.length) return 'win';
          }
          return 'playing';
        }

        if (index >= queue.length) return 'win';

        for (const s of input.swipes) {
          if (Math.abs(s.dx) < Math.abs(s.dy)) continue; // only left/right count
          const side = s.dx > 0 ? 1 : 0;
          const want = categoryOf(queue[index]);
          if (binCategory(side) === want) {
            flying = { dir: side === 0 ? -1 : 1, t: 0 };
            fx.burst(itemX, itemY, {
              count: 10,
              colors: [colors[queue[index].color], PAPER],
              power: 0.8,
              dir: side === 0 ? Math.PI : 0,
              spread: 1.4,
            });
            fx.freeze(0.04);
            audio.sfx('swipe');
            audio.sfx('coin', { delay: 0.08 });
          } else {
            lost = true;
            fx.burst(itemX, itemY, { count: 20, colors: [SEMANTIC.danger, PAPER], power: 1.2 });
            fx.shake(22);
            fx.flash(SEMANTIC.danger, 0.3);
            audio.sfx('wrong');
            return 'lose';
          }
          break;
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        if (w)
          fx.burst(LAYOUT.cx, ITEM_Y, { count: 18, colors: [palette.accent2, PAPER], power: 1 });
      },

      debugHint() {
        if (flying || index >= queue.length) return null;
        const want = categoryOf(queue[index]);
        const side = binCategory(0) === want ? 0 : 1;
        return {
          type: 'swipe',
          x: LAYOUT.cx,
          y: ITEM_Y,
          dx: side === 0 ? -420 : 420,
          dy: 0,
        };
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* -------------------------------------------------------- bins */
        for (const side of [0, 1]) {
          const cat = binCategory(side);
          const x = binX(side);
          const glow = swapFlash > 0 ? 1 + swapFlash * 0.08 : 1;
          c.save();
          c.translate(x, BIN_Y);
          c.scale(glow, glow);
          g.body((gg) => gg.rrect(-BIN_W / 2, -BIN_H / 2, BIN_W, BIN_H, RADIUS.lg), {
            fill: colors[cat],
            extrude: 16,
            shade: 0.26,
            gloss: 0.3,
            lw: STROKE.bold,
            shadow: 0.24,
            shadowY: 22,
          });
          // The bin wears the thing it accepts, so the rule needs no words.
          if (cfg.byShape) {
            drawShape(g, 0, -14, 62, shapes[cat], PAPER, beat);
          } else {
            g.body((gg) => gg.circle(0, -14, 56), {
              fill: lighten(colors[cat], 0.45),
              extrude: 0,
              shade: 0.14,
              gloss: 0.4,
              lw: STROKE.thin,
            });
          }
          c.restore();
        }

        // Direction arrows so "flick sideways" is unmistakable.
        for (const side of [0, 1]) {
          const dir = side === 0 ? -1 : 1;
          const pulse = (Math.sin(beat * Math.PI * 2 + side) + 1) / 2;
          c.save();
          c.globalAlpha = 0.35 + pulse * 0.4;
          c.translate(LAYOUT.cx + dir * (200 + pulse * 26), ITEM_Y);
          c.scale(dir, 1);
          g.body(
            (gg) =>
              gg.poly([
                [0, -34],
                [46, 0],
                [0, 34],
              ]),
            {
              fill: PAPER,
              extrude: 0,
              shade: 0,
              gloss: 0.4,
              lw: 6,
            },
          );
          c.restore();
        }

        /* ------------------------------------------------- queued item */
        if (index + 1 < queue.length && !flying) {
          // The next item peeks in behind, so the player can plan ahead.
          const nq = queue[index + 1];
          c.save();
          c.globalAlpha = 0.45;
          c.translate(LAYOUT.cx, ITEM_Y - 210);
          c.scale(0.6, 0.6);
          drawShape(g, 0, 0, 84, shapes[nq.shape], colors[nq.color], beat);
          c.restore();
        }

        if (index < queue.length) {
          const q = queue[index];
          const k = tween(itemScale, ease.outBack);
          c.save();
          c.translate(itemX, itemY);
          c.scale(k, k);
          c.rotate(Math.sin(beat * 2) * 0.06);
          drawShape(g, 0, 0, 96, shapes[q.shape], colors[q.color], beat);
          c.restore();
        }

        /* ------------------------------------------------------ tally */
        for (let i = 0; i < queue.length; i++) {
          const x = LAYOUT.cx - ((queue.length - 1) * 50) / 2 + i * 50;
          const done = i < index;
          g.body((gg) => gg.circle(x, 300, 16), {
            fill: done ? palette.accent2 : alpha(PAPER, 0.2),
            extrude: 0,
            shade: 0.1,
            gloss: done ? 0.45 : 0,
            lw: 5,
            outline: done ? INK : alpha(INK, 0.4),
          });
        }
      },
    };
  },
};

/** @param {import('../../gfx/gfx.js').Gfx} g */
function drawShape(g, x, y, r, shape, color, beat) {
  if (shape === 'star') {
    g.body((gg) => gg.star(x, y, r, r * 0.5, 5, -Math.PI / 2), {
      fill: color,
      extrude: 12,
      shade: 0.26,
      gloss: 0.4,
      lw: STROKE.base,
    });
  } else {
    g.body((gg) => gg.circle(x, y, r * 0.9), {
      fill: color,
      extrude: 12,
      shade: 0.26,
      gloss: 0.42,
      lw: STROKE.base,
    });
  }
}
