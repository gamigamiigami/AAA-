/**
 * FX — particles, screen shake, hit-stop and flashes.
 *
 * Feedback is the difference between "the game registered my input" and "the
 * game reacted to me". Every success and failure in the collection routes
 * through here so the punch is consistent, and so the intensity budget is
 * enforced in one place rather than per game.
 */

import { INK } from '../design/tokens.js';
import { alpha, lighten } from '../design/color.js';

const TAU = Math.PI * 2;
const MAX_PARTICLES = 420; // hard ceiling: mid-range phones must hold 60fps

export function createFx(rng) {
  let particles = [];
  let pops = [];

  let shake = 0;
  let shakeSeed = 0;
  let flashAmt = 0;
  let flashColor = '#ffffff';
  let hitStop = 0;

  const spawn = (p) => {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  };

  const fx = {
    get particleCount() {
      return particles.length;
    },

    /** Confetti/spark burst. `power` scales speed and count together. */
    burst(x, y, o = {}) {
      const count = Math.round((o.count ?? 16) * (o.power ?? 1));
      const speed = (o.speed ?? 700) * (o.power ?? 1);
      const colors = o.colors ?? ['#ffd23f', '#ff7a6b', '#3df0e0', '#ffffff'];
      const kind = o.kind ?? 'chip';
      const spread = o.spread ?? TAU;
      const dir = o.dir ?? 0;
      for (let i = 0; i < count; i++) {
        const a = dir - spread / 2 + rng.next() * spread;
        const s = speed * (0.45 + rng.next() * 0.75);
        const life = (o.life ?? 0.55) * (0.7 + rng.next() * 0.7);
        spawn({
          x: x + rng.range(-8, 8),
          y: y + rng.range(-8, 8),
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life,
          maxLife: life,
          size: (o.size ?? 16) * (0.6 + rng.next() * 0.8),
          color: colors[Math.floor(rng.next() * colors.length)],
          spin: rng.range(-14, 14),
          rot: rng.range(0, TAU),
          gravity: o.gravity ?? 1900,
          drag: o.drag ?? 1.6,
          kind,
        });
      }
      return fx;
    },

    /** Expanding ring — impacts, "you hit it" confirmation. */
    ring(x, y, o = {}) {
      const life = o.life ?? 0.34;
      spawn({
        x,
        y,
        vx: 0,
        vy: 0,
        life,
        maxLife: life,
        size: o.size ?? 40,
        color: o.color ?? '#ffffff',
        spin: o.grow ?? 700,
        rot: 0,
        gravity: 0,
        drag: 0,
        kind: 'ring',
      });
      return fx;
    },

    /** Soft rising puff — dust, landing, spawn-in. */
    puff(x, y, o = {}) {
      const count = o.count ?? 6;
      for (let i = 0; i < count; i++) {
        const life = (o.life ?? 0.5) * (0.7 + rng.next() * 0.6);
        spawn({
          x: x + rng.range(-24, 24),
          y: y + rng.range(-10, 10),
          vx: rng.range(-140, 140),
          vy: rng.range(-260, -60),
          life,
          maxLife: life,
          size: (o.size ?? 34) * (0.7 + rng.next() * 0.7),
          color: o.color ?? '#ffffff',
          spin: 0,
          rot: 0,
          gravity: o.gravity ?? -60,
          drag: 2.4,
          kind: 'puff',
        });
      }
      return fx;
    },

    /** Floating score/label text. */
    pop(x, y, text, o = {}) {
      pops.push({
        x,
        y,
        text,
        life: o.life ?? 0.75,
        maxLife: o.life ?? 0.75,
        color: o.color ?? '#ffffff',
        size: o.size ?? 64,
      });
      return fx;
    },

    /** @param {number} amount virtual units of displacement */
    shake(amount) {
      shake = Math.max(shake, amount);
      return fx;
    },

    flash(color = '#ffffff', amount = 0.5) {
      flashColor = color;
      flashAmt = Math.max(flashAmt, amount);
      return fx;
    },

    /** Freeze the simulation briefly. The cheapest way to add impact. */
    freeze(beats = 0.06) {
      hitStop = Math.max(hitStop, beats);
      return fx;
    },

    get frozen() {
      return hitStop > 0;
    },

    clear() {
      particles = [];
      pops = [];
      shake = 0;
      flashAmt = 0;
      hitStop = 0;
      return fx;
    },

    /**
     * @param {number} dtSec real seconds (particles are physical, not musical)
     * @param {number} dtBeats
     */
    update(dtSec, dtBeats) {
      if (hitStop > 0) {
        hitStop -= dtBeats;
        if (hitStop < 0) hitStop = 0;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dtSec;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        if (p.kind === 'ring') {
          p.size += p.spin * dtSec;
          continue;
        }
        p.vy += p.gravity * dtSec;
        const d = Math.max(0, 1 - p.drag * dtSec);
        p.vx *= d;
        p.vy *= d;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.rot += p.spin * dtSec;
      }

      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.life -= dtSec;
        p.y -= 190 * dtSec;
        if (p.life <= 0) pops.splice(i, 1);
      }

      shake *= Math.max(0, 1 - 9 * dtSec);
      if (shake < 0.4) shake = 0;
      flashAmt *= Math.max(0, 1 - 7 * dtSec);
      if (flashAmt < 0.01) flashAmt = 0;
      shakeSeed += dtSec * 60;
    },

    /** Current shake offset — the renderer applies this before drawing. */
    shakeOffset(out = { x: 0, y: 0 }) {
      if (shake <= 0) {
        out.x = 0;
        out.y = 0;
        return out;
      }
      out.x = Math.sin(shakeSeed * 41.3) * shake;
      out.y = Math.cos(shakeSeed * 37.7) * shake;
      return out;
    },

    /** @param {import('../gfx/gfx.js').Gfx} g */
    draw(g) {
      const c = g.c;
      c.save();
      for (const p of particles) {
        const t = p.life / p.maxLife;
        switch (p.kind) {
          case 'ring': {
            c.globalAlpha = t * 0.9;
            c.beginPath();
            c.arc(p.x, p.y, p.size, 0, TAU);
            c.lineWidth = 10 * t + 3;
            c.strokeStyle = p.color;
            c.stroke();
            break;
          }
          case 'puff': {
            c.globalAlpha = t * 0.45;
            c.beginPath();
            c.arc(p.x, p.y, p.size * (1.5 - t * 0.5), 0, TAU);
            c.fillStyle = p.color;
            c.fill();
            break;
          }
          default: {
            // Chips: rotating rounded rectangles read as confetti at any size.
            c.globalAlpha = Math.min(1, t * 2.2);
            c.save();
            c.translate(p.x, p.y);
            c.rotate(p.rot);
            const w = p.size;
            const h = p.size * 0.62;
            c.fillStyle = p.color;
            c.beginPath();
            c.roundRect(-w / 2, -h / 2, w, h, 4);
            c.fill();
            c.lineWidth = 3;
            c.strokeStyle = alpha(INK, 0.5);
            c.stroke();
            c.restore();
          }
        }
      }
      c.restore();

      for (const p of pops) {
        const t = p.life / p.maxLife;
        const k = 1 + (1 - t) * 0.25;
        c.save();
        c.globalAlpha = Math.min(1, t * 2.5);
        g.text(p.text, p.x, p.y, { size: p.size * k, color: p.color, outline: INK, weight: 900 });
        c.restore();
      }
    },

    /** Full-viewport colour flash. Drawn last, above everything. */
    drawFlash(g) {
      if (flashAmt <= 0.005) return;
      const f = g.stage.full;
      const c = g.c;
      c.save();
      c.globalAlpha = flashAmt;
      c.fillStyle = flashColor;
      c.fillRect(f.x0, f.y0, f.w, f.h);
      c.restore();
    },

    /* Preset reactions — used by the host so win/lose punch is identical
       everywhere, and by games that want the same vocabulary. */

    celebrate(x, y, palette) {
      fx.burst(x, y, {
        count: 26,
        power: 1.15,
        colors: [palette.accent, palette.accent2, palette.accent3, '#ffffff'],
      });
      fx.ring(x, y, { color: lighten(palette.accent2, 0.4), size: 30, grow: 900 });
      fx.shake(9);
      fx.freeze(0.05);
    },

    fail(x, y) {
      fx.burst(x, y, { count: 14, power: 0.8, colors: ['#6b5f7d', '#8f83a3', '#4a3f5c'] });
      fx.shake(20);
      fx.freeze(0.09);
    },
  };

  return fx;
}
