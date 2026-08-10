/**
 * Scene kit — shared backdrops and ground.
 *
 * A microgame with a bare gradient behind it looks unfinished, but eighteen
 * hand-rolled backdrops would look like eighteen different games. So scenery
 * lives here: each stage gets a distinct, layered world, and a game gets it in
 * two lines.
 *
 *   const back = createBackdrop(ctx.rng, ctx.palette);   // once, in create()
 *   back.draw(g, ctx.conductor.beat);                    // first line of draw()
 *
 * PERFORMANCE: the static layers (sun, terrain, ground) are rendered once into
 * an offscreen canvas and blitted, because re-running a dozen shaded `body()`
 * calls every frame costs more than the entire rest of the game put together.
 * Only genuinely moving things — clouds, twinkling stars — are drawn live.
 */

import { INK, PAPER, STROKE } from '../design/tokens.js';
import { alpha, darken, lighten, mix } from '../design/color.js';
import { Gfx } from './gfx.js';

const TAU = Math.PI * 2;

/* ------------------------------------------------------------ layer cache */

/**
 * One shared offscreen canvas: only a single backdrop is ever on screen, so a
 * per-instance cache would just burn memory as microgames come and go.
 */
let cacheCanvas = null;
let cacheCtx = null;
let cacheGfx = null;
let cacheOwner = null;
let cacheKey = '';

function ensureCache(g, owner, render) {
  const cw = g.stage.canvas.width;
  const ch = g.stage.canvas.height;
  const key = `${cw}x${ch}`;
  if (cacheOwner === owner && cacheKey === key) return;

  if (!cacheCanvas) cacheCanvas = document.createElement('canvas');
  if (cacheCanvas.width !== cw || cacheCanvas.height !== ch || !cacheCtx) {
    cacheCanvas.width = cw;
    cacheCanvas.height = ch;
    cacheCtx = cacheCanvas.getContext('2d');
    cacheGfx = new Gfx(cacheCtx, g.stage);
  }

  cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
  cacheCtx.clearRect(0, 0, cw, ch);
  const s = g.stage.scale * g.stage.dpr;
  cacheCtx.setTransform(s, 0, 0, s, g.stage.offX * g.stage.dpr, g.stage.offY * g.stage.dpr);
  render(cacheGfx);

  cacheOwner = owner;
  cacheKey = key;
}

/** Drop the cache — call on resize so the next draw re-renders at the new size. */
export function invalidateSceneCache() {
  cacheOwner = null;
  cacheKey = '';
}

/* ---------------------------------------------------------------- ground */

/**
 * The ground slab. Always use this rather than filling a rectangle: the edge
 * highlight, the tufts and the depth banding are what stop the floor reading as
 * a flat coloured stripe.
 *
 * @param {import('./gfx.js').Gfx} g
 * @param {import('../design/tokens.js').Palette} palette
 * @param {number} y surface height
 * @param {{tufts?:boolean, color?:string}} [o]
 */
export function drawGround(g, palette, y, o = {}) {
  const c = g.c;
  const f = g.full;
  const base = o.color ?? palette.ground;

  const gr = c.createLinearGradient(0, y, 0, f.y1);
  gr.addColorStop(0, lighten(base, 0.12));
  gr.addColorStop(0.25, base);
  gr.addColorStop(1, darken(base, 0.3));
  c.fillStyle = gr;
  c.fillRect(f.x0 - 10, y, f.w + 20, f.y1 - y + 20);

  // Surface line: thick ink edge with a bright lip just beneath it.
  c.beginPath();
  c.moveTo(f.x0 - 10, y);
  c.lineTo(f.x1 + 10, y);
  c.lineWidth = STROKE.bold;
  c.strokeStyle = INK;
  c.lineCap = 'butt';
  c.stroke();
  c.beginPath();
  c.moveTo(f.x0 - 10, y + 14);
  c.lineTo(f.x1 + 10, y + 14);
  c.lineWidth = 8;
  c.strokeStyle = alpha(lighten(base, 0.5), 0.55);
  c.stroke();

  if (o.tufts !== false) {
    c.save();
    c.fillStyle = darken(base, 0.18);
    const step = 96;
    const start = Math.floor(f.x0 / step) * step;
    for (let x = start; x < f.x1 + step; x += step) {
      const h = 20 + ((Math.sin(x * 0.021) + 1) / 2) * 22;
      c.beginPath();
      c.moveTo(x - 20, y);
      c.quadraticCurveTo(x - 6, y - h, x + 4, y - h * 0.5);
      c.quadraticCurveTo(x + 8, y - h * 0.2, x + 22, y);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  // Very light depth banding. Anything stronger reads as a rendering artifact.
  c.save();
  c.globalAlpha = 0.055;
  c.fillStyle = INK;
  for (let i = 0; i < 5; i++) {
    const by = y + 96 + i * 90;
    if (by > f.y1) break;
    c.fillRect(f.x0 - 10, by, f.w + 20, 8 + i * 2);
  }
  c.restore();
}

/* -------------------------------------------------------------- backdrop */

/**
 * @param {import('../engine/rng.js').Rng} rng
 * @param {import('../design/tokens.js').Palette} palette
 * @param {{horizon?:number, density?:number, ground?:boolean}} [opts]
 */
export function createBackdrop(rng, palette, opts = {}) {
  const horizon = opts.horizon ?? 1660;
  const density = opts.density ?? 1;
  const withGround = opts.ground !== false;
  const kind = palette.id;

  const sun = { x: rng.range(180, 900), y: rng.range(280, 520), r: rng.range(110, 150) };

  const clouds = [];
  const cloudCount = Math.round((kind === 'neon' ? 3 : 6) * density);
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({
      x: rng.range(-300, 1400),
      y: rng.range(220, Math.max(320, horizon - 700)),
      s: rng.range(0.65, 1.5),
      speed: rng.range(6, 18),
      lobes: rng.int(3, 5),
      phase: rng.range(0, TAU),
    });
  }

  const stars = [];
  if (kind !== 'town') {
    for (let i = 0; i < Math.round(34 * density); i++) {
      stars.push({
        x: rng.range(-400, 1500),
        y: rng.range(80, Math.max(200, horizon - 480)),
        r: rng.range(3, 9),
        tw: rng.range(0, TAU),
        speed: rng.range(1.2, 3.4),
      });
    }
  }

  const makeLayer = (count, baseY, spread, scale, depth) => {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        x: -400 + (i / count) * 2200 + rng.range(-70, 70),
        y: baseY + rng.range(-spread, spread),
        w: rng.range(160, 420) * scale,
        h: rng.range(120, 340) * scale,
        seed: rng.range(0, TAU),
      });
    }
    return { items, depth };
  };

  const far = makeLayer(Math.round(7 * density), horizon - 250, 40, 1.25, 0.35);
  const near = makeLayer(Math.round(6 * density), horizon - 130, 26, 1.0, 0.7);

  const drawHill = (g, it, color) =>
    g.body((gg) => gg.ellipse(it.x, it.y + it.h * 0.55, it.w * 0.62, it.h * 0.85, 0), {
      fill: color,
      extrude: 0,
      shade: 0.18,
      gloss: 0.16,
      lw: 0,
    });

  const drawBuilding = (g, it, color) => {
    const c = g.c;
    const h = it.h * 1.9;
    const y = it.y - h * 0.35;
    g.body((gg) => gg.rrect(it.x - it.w / 2, y, it.w, h + 300, 12), {
      fill: color,
      extrude: 0,
      shade: 0.24,
      gloss: 0.1,
      lw: 0,
    });
    const cols = Math.max(2, Math.floor(it.w / 46));
    const rows = Math.max(2, Math.floor(h / 62));
    c.save();
    c.globalAlpha = 0.5;
    c.fillStyle = palette.accent2;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        if (Math.sin(it.seed + r * 2.1 + k * 3.7) <= 0.35) continue;
        c.fillRect(it.x - it.w / 2 + 14 + k * (it.w / cols), y + 18 + r * 62, 20, 26);
      }
    }
    c.restore();
  };

  const drawTree = (g, it, color) => {
    const c = g.c;
    c.save();
    c.translate(it.x, it.y + it.h * 0.6);
    g.body((gg) => gg.rrect(-it.w * 0.07, -it.h * 0.5, it.w * 0.14, it.h * 1.4, 8), {
      fill: darken(color, 0.35),
      extrude: 0,
      shade: 0.2,
      gloss: 0,
      lw: 0,
    });
    for (let i = 0; i < 3; i++) {
      g.body(
        (gg) =>
          gg.blob(0, -it.h * (0.55 + i * 0.22), it.w * (0.62 - i * 0.12), 0.16, 7, it.seed + i),
        {
          fill: i === 0 ? color : lighten(color, 0.08 * i),
          extrude: 0,
          shade: 0.22,
          gloss: 0.14,
          lw: 0,
        },
      );
    }
    c.restore();
  };

  /** Everything that never moves — rendered once into the offscreen canvas. */
  const renderStatic = (g) => {
    const c = g.c;
    if (kind === 'town') {
      c.save();
      c.globalAlpha = 0.5;
      g.body((gg) => gg.circle(sun.x, sun.y, sun.r), {
        fill: '#fff3c4',
        extrude: 0,
        shade: 0,
        gloss: 0.5,
        lw: 0,
      });
      c.restore();
      g.sunburst(sun.x, sun.y, 1500, PAPER, 18, 0, 0.05);
    } else {
      c.save();
      c.globalAlpha = 0.55;
      g.body((gg) => gg.circle(sun.x, sun.y, sun.r * 0.7), {
        fill: kind === 'neon' ? '#ffe9a8' : '#e8dcff',
        extrude: 0,
        shade: 0,
        gloss: 0.4,
        lw: 0,
      });
      c.restore();
    }

    const layerColor = (depth) => mix(palette.ground, palette.skyBot, 0.5 - depth * 0.45);
    for (const layer of [far, near]) {
      const col = layerColor(layer.depth);
      for (const it of layer.items) {
        if (kind === 'neon') drawBuilding(g, it, col);
        else if (kind === 'forest') drawTree(g, it, col);
        else drawHill(g, it, col);
      }
    }

    if (withGround) drawGround(g, palette, horizon);
  };

  const self = {
    horizon,

    /**
     * @param {import('./gfx.js').Gfx} g
     * @param {number} beat
     */
    draw(g, beat) {
      ensureCache(g, self, renderStatic);
      const c = g.c;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(cacheCanvas, 0, 0);
      c.restore();

      const f = g.full;

      if (stars.length) {
        c.save();
        c.fillStyle = kind === 'neon' ? palette.accent2 : PAPER;
        for (const s of stars) {
          c.globalAlpha = (0.45 + 0.55 * Math.abs(Math.sin(beat * s.speed + s.tw))) * 0.85;
          c.beginPath();
          c.arc(s.x, s.y, s.r, 0, TAU);
          c.fill();
        }
        c.restore();
      }

      for (const cl of clouds) {
        const span = f.w + 900;
        const x = f.x0 + ((((cl.x + beat * cl.speed - f.x0) % span) + span) % span) - 450;
        c.save();
        c.globalAlpha = kind === 'forest' ? 0.22 : 0.6;
        c.fillStyle = kind === 'forest' ? lighten(palette.skyBot, 0.3) : PAPER;
        // One path, one fill: filling each lobe separately would darken every
        // overlap and turn the cloud into a visible row of circles.
        c.beginPath();
        for (let i = 0; i < cl.lobes; i++) {
          const ox = (i - (cl.lobes - 1) / 2) * 70 * cl.s;
          const oy = Math.sin(cl.phase + i) * 16 * cl.s;
          const r = 58 * cl.s * (1 - Math.abs(i - (cl.lobes - 1) / 2) * 0.14);
          c.moveTo(x + ox + r, cl.y + oy);
          c.arc(x + ox, cl.y + oy, r, 0, TAU);
        }
        c.fill();
        c.restore();
      }
    },
  };

  return self;
}
