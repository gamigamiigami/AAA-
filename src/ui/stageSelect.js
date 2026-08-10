/**
 * Stage select. Three worlds, each with its own palette, music and pool of
 * microgames. Cards preview the actual stage colours so the choice is visual
 * rather than a list of names, and they are stacked as full-width rows because
 * a thumb hits a 900x360 target far more reliably than a narrow column.
 */

import {
  TYPE,
  INK,
  PAPER,
  STROKE,
  RADIUS,
  LAYOUT,
  PALETTES,
  STAGE_ORDER,
  ease,
  tween,
} from '../design/tokens.js';
import { alpha } from '../design/color.js';
import { drawDecorBackground, makeDecorShapes, hit, drawButton } from './widgets.js';

const CARD_W = 900;
const CARD_H = 360;
const CARD_X = LAYOUT.cx - CARD_W / 2;
const FIRST_Y = 420;
const GAP = 60;

export function createStageSelect(services, { onPick, onBack }) {
  const { conductor, save, rng } = services;
  const decor = makeDecorShapes(rng.derive('select'), PALETTES.town, 12);
  const backRect = { x: LAYOUT.cx - 210, y: 1690, w: 420, h: 130 };

  const cards = STAGE_ORDER.map((id, i) => ({
    id,
    palette: PALETTES[id],
    rect: { x: CARD_X, y: FIRST_Y + i * (CARD_H + GAP), w: CARD_W, h: CARD_H },
    press: 0,
  }));

  let backPress = 0;

  return {
    palette: PALETTES.town,

    update(input, dtSec) {
      backPress = Math.max(0, backPress - dtSec * 4);
      for (const card of cards) card.press = Math.max(0, card.press - dtSec * 3);
      for (const t of input.taps) {
        if (hit(backRect, t)) {
          backPress = 1;
          onBack();
          return;
        }
        for (const card of cards) {
          if (hit(card.rect, t)) {
            card.press = 1;
            onPick(card.id);
            return;
          }
        }
      }
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      const beat = conductor.beat;
      const c = g.c;
      drawDecorBackground(g, PALETTES.town, beat, decor);

      g.text('ステージを えらぶ', LAYOUT.cx, 250, {
        size: TYPE.h1,
        color: PAPER,
        outline: INK,
        lw: 15,
        weight: 900,
        maxWidth: 960,
        shadow: { x: 0, y: 10, color: alpha(INK, 0.4) },
      });

      cards.forEach((card, i) => {
        const r = card.rect;
        const p = card.palette;
        const bob = Math.sin(beat * Math.PI + i * 0.7) * 7;
        const press = tween(card.press, ease.outCubic);
        c.save();
        c.translate(0, bob - press * 10);

        g.body((gg) => gg.rrect(r.x, r.y, r.w, r.h, RADIUS.xl), {
          fill: p.skyBot,
          extrude: 18,
          shade: 0.2,
          gloss: 0.3,
          lw: STROKE.bold,
          shadow: 0.26,
          shadowY: 26,
        });

        // Preview window: the actual sky, ground and prop colours of the stage.
        const pw = 320;
        const ph = 260;
        const px0 = r.x + 40;
        const py0 = r.y + (r.h - ph) / 2;
        c.save();
        g.begin().rrect(px0, py0, pw, ph, RADIUS.lg);
        c.clip();
        const gr = c.createLinearGradient(0, py0, 0, py0 + ph);
        gr.addColorStop(0, p.skyTop);
        gr.addColorStop(1, p.skyBot);
        c.fillStyle = gr;
        c.fillRect(px0, py0, pw, ph);
        c.fillStyle = p.ground;
        c.fillRect(px0, py0 + ph - 62, pw, 62);
        [0, 1, 2].forEach((k) => {
          const bx = px0 + 70 + k * 92;
          const by = py0 + ph - 96 + Math.sin(beat * 1.6 + k * 1.3) * 10;
          g.body((gg) => gg.circle(bx, by, 30), {
            fill: p.props[k % p.props.length],
            extrude: 8,
            shade: 0.24,
            gloss: 0.35,
            lw: STROKE.thin,
          });
        });
        c.restore();
        g.begin().rrect(px0, py0, pw, ph, RADIUS.lg);
        c.lineWidth = STROKE.base;
        c.strokeStyle = INK;
        c.stroke();

        const tx = px0 + pw + 46;
        g.text(p.name, tx, r.y + 148, {
          size: TYPE.h2,
          color: PAPER,
          outline: INK,
          lw: 11,
          align: 'left',
          weight: 900,
          maxWidth: r.w - (tx - r.x) - 40,
        });

        const best = save.best(card.id);
        g.text(best > 0 ? `ベスト ${best}` : 'はじめて', tx, r.y + 232, {
          size: TYPE.small,
          color: best > 0 ? '#ffd23f' : alpha(PAPER, 0.8),
          outline: INK,
          lw: 7,
          align: 'left',
          weight: 800,
        });
        c.restore();
      });

      drawButton(g, backRect, 'もどる', { fill: PAPER, size: TYPE.h2 * 0.85, press: backPress });
    },
  };
}
