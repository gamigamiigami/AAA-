/**
 * Shared UI parts. Buttons and menu backgrounds live here so every screen in
 * the game presses, glows and floats identically — inconsistent buttons are one
 * of the fastest ways for a game to read as amateur.
 */

import { TYPE, INK, PAPER, STROKE, RADIUS } from '../design/tokens.js';
import { alpha } from '../design/color.js';

const TAU = Math.PI * 2;

/** @typedef {{x:number,y:number,w:number,h:number}} Rect */

/** @param {Rect} r */
export function hit(r, p) {
  return p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Chunky pressable button.
 * @param {import('../gfx/gfx.js').Gfx} g @param {Rect} r
 */
export function drawButton(g, r, label, o = {}) {
  const c = g.c;
  const press = o.press ?? 0; // 0..1
  const drop = 14 * (1 - press);
  c.save();
  c.translate(0, 14 - drop);
  g.body((gg) => gg.rrect(r.x, r.y, r.w, r.h, o.radius ?? RADIUS.lg), {
    fill: o.fill ?? PAPER,
    extrude: drop,
    shade: 0.2,
    gloss: 0.38,
    lw: STROKE.bold,
    shadow: o.shadow ?? 0.22,
    shadowY: 16,
  });
  g.text(label, r.x + r.w / 2, r.y + r.h / 2 + 2, {
    size: o.size ?? TYPE.h2,
    color: o.textColor ?? INK,
    outline: o.textOutline ?? null,
    lw: 8,
    weight: 900,
    maxWidth: r.w - 60,
  });
  c.restore();
}

/**
 * Menu backdrop: slow drifting shapes that pulse on the beat. Keeps menus
 * feeling like part of the same musical world as the microgames.
 * @param {import('../gfx/gfx.js').Gfx} g
 */
export function drawDecorBackground(g, palette, beat, shapes) {
  const c = g.c;
  const f = g.stage.full;
  g.skyGradient(palette.skyTop, palette.skyBot);

  const pulse = 1 + Math.max(0, Math.sin(beat * Math.PI)) * 0.04;
  c.save();
  for (const s of shapes) {
    const t = beat * s.speed + s.phase;
    const spanX = f.w + 400;
    const spanY = f.h + 400;
    const x = f.x0 + ((((s.x + Math.sin(t * 0.4) * 60 - f.x0) % spanX) + spanX) % spanX) - 100;
    const y = f.y0 + ((((s.y + t * 26 - f.y0) % spanY) + spanY) % spanY) - 200;
    c.save();
    c.globalAlpha = s.alpha;
    c.translate(x, y);
    c.rotate(t * 0.18);
    c.scale(s.scale * pulse, s.scale * pulse);
    c.beginPath();
    if (s.kind === 0) c.arc(0, 0, 60, 0, TAU);
    else if (s.kind === 1) {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 70 : 34;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    } else c.roundRect(-52, -52, 104, 104, 24);
    c.fillStyle = s.color;
    c.fill();
    c.restore();
  }
  c.restore();
}

/** Build the decor shape set once, from the seeded RNG. */
export function makeDecorShapes(rng, palette, count = 14) {
  const shapes = [];
  for (let i = 0; i < count; i++) {
    shapes.push({
      x: rng.range(-200, 1300),
      y: rng.range(-300, 2200),
      scale: rng.range(0.4, 1.3),
      speed: rng.range(0.25, 0.7),
      phase: rng.range(0, 40),
      alpha: rng.range(0.06, 0.16),
      kind: rng.int(0, 2),
      color: rng.pick([palette.accent, palette.accent2, palette.accent3, PAPER]),
    });
  }
  return shapes;
}

/** Small pill chip for scores and labels. */
export function drawChip(g, x, y, label, value, o = {}) {
  const w = o.w ?? 420;
  const h = o.h ?? 84;
  g.body((gg) => gg.rrect(x - w / 2, y - h / 2, w, h, RADIUS.pill), {
    fill: o.fill ?? alpha(INK, 0.34),
    extrude: 0,
    shade: 0,
    gloss: 0.1,
    lw: 5,
    outline: alpha(PAPER, 0.35),
  });
  g.text(label, x - w / 2 + 36, y + 2, {
    size: TYPE.small,
    color: alpha(PAPER, 0.85),
    outline: null,
    align: 'left',
    weight: 800,
    spacing: 2,
  });
  g.text(String(value), x + w / 2 - 36, y + 2, {
    size: TYPE.h2 * 0.78,
    color: o.valueColor ?? PAPER,
    outline: INK,
    lw: 7,
    align: 'right',
    weight: 900,
  });
}

/** Speaker icon toggle, drawn procedurally. */
export function drawMuteButton(g, r, muted) {
  const c = g.c;
  g.body((gg) => gg.circle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2), {
    fill: alpha(INK, 0.35),
    extrude: 0,
    shade: 0,
    gloss: 0.12,
    lw: 5,
    outline: alpha(PAPER, 0.4),
  });
  c.save();
  c.translate(r.x + r.w / 2, r.y + r.h / 2);
  c.fillStyle = PAPER;
  c.strokeStyle = PAPER;
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-16, -9);
  c.lineTo(-6, -9);
  c.lineTo(6, -21);
  c.lineTo(6, 21);
  c.lineTo(-6, 9);
  c.lineTo(-16, 9);
  c.closePath();
  c.fill();
  if (muted) {
    c.beginPath();
    c.moveTo(14, -12);
    c.lineTo(30, 12);
    c.moveTo(30, -12);
    c.lineTo(14, 12);
    c.stroke();
  } else {
    for (let i = 1; i <= 2; i++) {
      c.beginPath();
      c.arc(8, 0, 8 + i * 9, -0.9, 0.9);
      c.stroke();
    }
  }
  c.restore();
}
