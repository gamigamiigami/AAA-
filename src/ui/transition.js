/**
 * Scene transitions.
 *
 * Cuts between microgames are where a collection either feels snappy or feels
 * like a menu. These wipes are measured in beats and always land on one, so
 * changing games reads as part of the music rather than a loading pause.
 */

import { INK, ease, tween } from '../design/tokens.js';

export function createTransition(conductor) {
  let active = false;
  let kind = 'panels';
  let startBeat = 0;
  let duration = 0.7;
  let color = INK;
  let midFired = false;
  /** @type {null | (() => void)} */
  let onMid = null;

  const t = {
    get active() {
      return active;
    },

    /**
     * @param {Object} o
     * @param {'panels'|'iris'|'sweep'} [o.kind]
     * @param {number} [o.beats]
     * @param {string} [o.color]
     * @param {() => void} [o.onMid]  swap the scene here, while fully covered
     */
    play(o = {}) {
      active = true;
      kind = o.kind ?? 'panels';
      duration = o.beats ?? 0.7;
      color = o.color ?? INK;
      startBeat = conductor.beat;
      midFired = false;
      onMid = o.onMid ?? null;
    },

    update() {
      if (!active) return;
      const p = (conductor.beat - startBeat) / duration;
      if (!midFired && p >= 0.5) {
        midFired = true;
        if (onMid) onMid();
      }
      if (p >= 1) {
        active = false;
        onMid = null;
      }
    },

    /** True while the screen is fully covered — safe to swap scenes. */
    get covered() {
      if (!active) return false;
      const p = (conductor.beat - startBeat) / duration;
      return p > 0.42 && p < 0.58;
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      if (!active) return;
      const p = Math.max(0, Math.min(1, (conductor.beat - startBeat) / duration));
      const closing = p < 0.5;
      // 0 -> fully open, 1 -> fully covered
      const k = closing ? tween(p * 2, ease.outQuint) : tween(1 - (p - 0.5) * 2, ease.inCubic);
      if (k <= 0.001) return;

      const c = g.c;
      const f = g.stage.full;
      c.save();
      c.fillStyle = color;

      if (kind === 'iris') {
        const maxR = Math.hypot(f.w, f.h) * 0.55;
        c.beginPath();
        c.rect(f.x0, f.y0, f.w, f.h);
        c.arc(
          (f.x0 + f.x1) / 2,
          (f.y0 + f.y1) / 2,
          Math.max(0, maxR * (1 - k)),
          0,
          Math.PI * 2,
          true,
        );
        c.fill('evenodd');
      } else if (kind === 'sweep') {
        const w = f.w * k;
        c.beginPath();
        c.moveTo(f.x0, f.y0);
        c.lineTo(f.x0 + w, f.y0);
        c.lineTo(f.x0 + w - 140, f.y1);
        c.lineTo(f.x0, f.y1);
        c.closePath();
        c.fill();
      } else {
        // Panels: alternating bars closing from opposite edges. Reads fast and
        // has more character than a plain fade.
        const rows = 6;
        const h = f.h / rows;
        for (let i = 0; i < rows; i++) {
          const w = f.w * k;
          const x = i % 2 === 0 ? f.x0 : f.x1 - w;
          c.fillRect(x, f.y0 + i * h - 1, w, h + 2);
        }
      }
      c.restore();
    },
  };

  return t;
}
