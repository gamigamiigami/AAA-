/**
 * Title screen. First impression, so it does three jobs at once: state the
 * name, prove the game has rhythm (everything bounces on the beat), and make
 * the single required interaction unmissable.
 */

import { TYPE, INK, PAPER, LAYOUT, PALETTES } from '../design/tokens.js';
import { alpha } from '../design/color.js';
import { drawDecorBackground, makeDecorShapes, drawChip, drawMuteButton, hit } from './widgets.js';
import { drawVerbIcon } from './promptCard.js';

/**
 * Per-character bounce. Letters land one after another on successive beats,
 * which reads as choreography rather than a static logo.
 * @param {import('../gfx/gfx.js').Gfx} g
 */
function bouncyText(g, str, x, y, beat, o = {}) {
  const size = o.size ?? TYPE.title;
  const chars = [...str];
  const widths = chars.map((ch) => g.measure(ch, size, 900));
  const spacing = o.spacing ?? 6;
  const total = widths.reduce((a, b) => a + b, 0) + (chars.length - 1) * spacing;
  let cx = x - total / 2;
  chars.forEach((ch, i) => {
    const w = widths[i];
    const phase = (beat * 2 - i * 0.22) % 4;
    const bounce = phase > 0 && phase < 0.8 ? Math.sin((phase / 0.8) * Math.PI) : 0;
    const c = g.c;
    c.save();
    c.translate(cx + w / 2, y - bounce * (o.amp ?? 26));
    c.rotate(Math.sin(beat * 1.4 + i) * 0.045);
    c.scale(1 + bounce * 0.06, 1 + bounce * 0.1);
    g.text(ch, 0, 0, {
      size,
      color: o.color ?? PAPER,
      outline: INK,
      lw: size * 0.17,
      weight: 900,
      shadow: { x: 0, y: 10, color: alpha(INK, 0.4) },
    });
    c.restore();
    cx += w + spacing;
  });
}

export function createTitleScreen(services, { onStart, onToggleMute }) {
  const { conductor, save, rng, audio } = services;
  const palette = PALETTES.town;
  const decor = makeDecorShapes(rng.derive('title'), palette, 16);
  const muteRect = { x: 892, y: 96, w: 100, h: 100 };

  const bestOverall = () => Math.max(save.best('town'), save.best('neon'), save.best('forest'));

  return {
    palette,

    /** @param {import('../engine/input.js').InputFrame} input */
    update(input) {
      for (const t of input.taps) {
        if (hit(muteRect, t)) {
          onToggleMute();
          return;
        }
        onStart();
        return;
      }
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      const beat = conductor.beat;
      const c = g.c;
      drawDecorBackground(g, palette, beat, decor);
      g.sunburst(LAYOUT.cx, 720, 1200, PAPER, 16, beat * 0.12, 0.1);

      c.save();
      c.translate(LAYOUT.cx, 560);
      c.rotate(-0.035);
      bouncyText(g, 'ミニゲーム', 0, 0, beat, {
        size: 104,
        color: palette.accent2,
        amp: 16,
        spacing: 8,
      });
      c.restore();

      c.save();
      c.translate(LAYOUT.cx, 760);
      c.rotate(0.02);
      bouncyText(g, 'ラッシュ', 0, 0, beat + 0.5, {
        size: 196,
        color: palette.accent,
        amp: 30,
        spacing: 4,
      });
      c.restore();

      g.text('ゆびさき ひとつの ミニゲームあつめ', LAYOUT.cx, 930, {
        size: TYPE.small,
        color: PAPER,
        outline: INK,
        lw: 8,
        weight: 800,
        spacing: 2,
        maxWidth: 940,
      });

      // Call to action: icon above the words so neither can cover the other.
      const pulse = 1 + Math.max(0, Math.sin(beat * Math.PI)) * 0.07;
      drawVerbIcon(g, 'tap', LAYOUT.cx, 1200, 1.05, (beat * 0.5) % 1, PAPER);
      c.save();
      c.translate(LAYOUT.cx, 1370);
      c.scale(pulse, pulse);
      g.text('タップして スタート', 0, 0, {
        size: TYPE.h2,
        color: PAPER,
        outline: INK,
        lw: 12,
        weight: 900,
        maxWidth: 900,
      });
      c.restore();

      const best = bestOverall();
      if (best > 0) drawChip(g, LAYOUT.cx, 1600, 'ベスト', best, { valueColor: '#ffd23f' });

      drawMuteButton(g, muteRect, audio.muted);
    },
  };
}
