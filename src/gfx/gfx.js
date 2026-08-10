/**
 * Gfx — the house drawing kit.
 *
 * The single most important function here is `body()`. Every solid object in
 * every microgame goes through it, which applies the five-part treatment that
 * defines the look:
 *
 *   1. contact shadow      2. extruded dark base (the "chunk")
 *   3. flat base colour    4. lower shade band    5. top gloss  (+ ink outline)
 *
 * Authors pick one colour; the shading is derived. That is what makes eighteen
 * independently-written games look like one product instead of a sampler.
 */

import { FONT_STACK, INK, PAPER, TYPE, STROKE, RADIUS } from '../design/tokens.js';
import { darken, lighten, alpha } from '../design/color.js';
import { BOX_W, BOX_H } from '../engine/stage.js';

const TAU = Math.PI * 2;
const NOOP = () => {};

const SUNBURST_SIZE = 512;
/** @type {Map<string, HTMLCanvasElement>} */
const sunburstCache = new Map();

function getSunburstBitmap(rays, color) {
  const key = `${rays}|${color}`;
  const hit = sunburstCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = SUNBURST_SIZE;
  cv.height = SUNBURST_SIZE;
  const c = cv.getContext('2d');
  const r = SUNBURST_SIZE / 2;
  c.translate(r, r);
  c.fillStyle = color;
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * TAU;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, r, a0, a0 + TAU / (rays * 2));
    c.closePath();
    c.fill();
  }
  sunburstCache.set(key, cv);
  return cv;
}

export class Gfx {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../engine/stage.js').Stage} stage
   */
  constructor(ctx, stage) {
    this.c = ctx;
    this.stage = stage;
    /** Bounds of the path currently being built (virtual space). */
    this._b = { x0: 0, y0: 0, x1: 0, y1: 0 };
    this._hasBounds = false;
    this._supportsLetterSpacing = 'letterSpacing' in ctx;
  }

  /* ------------------------------------------------------------- state */

  save() {
    this.c.save();
    return this;
  }
  restore() {
    this.c.restore();
    return this;
  }
  translate(x, y) {
    this.c.translate(x, y);
    return this;
  }
  rotate(a) {
    this.c.rotate(a);
    return this;
  }
  scale(sx, sy = sx) {
    this.c.scale(sx, sy);
    return this;
  }

  /** Clip to the guaranteed action box. */
  clipBox() {
    this.c.beginPath();
    this.c.rect(0, 0, BOX_W, BOX_H);
    this.c.clip();
    return this;
  }

  /** Clip to the whole viewport — what microgames get, so their scenery can
   *  reach the screen edges on aspect ratios wider or taller than 9:16. */
  clipFull() {
    const f = this.stage.full;
    this.c.beginPath();
    this.c.rect(f.x0, f.y0, f.w, f.h);
    this.c.clip();
    return this;
  }

  /** The full viewport rectangle in virtual units. Background fills use this. */
  get full() {
    return this.stage.full;
  }

  /* ------------------------------------------------------------- paths */

  _bound(x0, y0, x1, y1) {
    const b = this._b;
    if (!this._hasBounds) {
      b.x0 = x0;
      b.y0 = y0;
      b.x1 = x1;
      b.y1 = y1;
      this._hasBounds = true;
    } else {
      if (x0 < b.x0) b.x0 = x0;
      if (y0 < b.y0) b.y0 = y0;
      if (x1 > b.x1) b.x1 = x1;
      if (y1 > b.y1) b.y1 = y1;
    }
  }

  begin() {
    this.c.beginPath();
    this._hasBounds = false;
    return this;
  }

  moveTo(x, y) {
    this.c.moveTo(x, y);
    this._bound(x, y, x, y);
    return this;
  }
  lineTo(x, y) {
    this.c.lineTo(x, y);
    this._bound(x, y, x, y);
    return this;
  }
  quadTo(cx, cy, x, y) {
    this.c.quadraticCurveTo(cx, cy, x, y);
    this._bound(Math.min(cx, x), Math.min(cy, y), Math.max(cx, x), Math.max(cy, y));
    return this;
  }
  close() {
    this.c.closePath();
    return this;
  }

  rect(x, y, w, h) {
    this.c.rect(x, y, w, h);
    this._bound(x, y, x + w, y + h);
    return this;
  }

  /** Rounded rectangle, clamped so r can never exceed half the shorter side. */
  rrect(x, y, w, h, r = RADIUS.md) {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.c.moveTo(x + rr, y);
    this.c.arcTo(x + w, y, x + w, y + h, rr);
    this.c.arcTo(x + w, y + h, x, y + h, rr);
    this.c.arcTo(x, y + h, x, y, rr);
    this.c.arcTo(x, y, x + w, y, rr);
    this.c.closePath();
    this._bound(x, y, x + w, y + h);
    return this;
  }

  circle(x, y, r) {
    this.c.moveTo(x + r, y);
    this.c.arc(x, y, r, 0, TAU);
    this._bound(x - r, y - r, x + r, y + r);
    return this;
  }

  ellipse(x, y, rx, ry, rot = 0) {
    this.c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
    const m = Math.max(Math.abs(rx), Math.abs(ry));
    this._bound(x - m, y - m, x + m, y + m);
    return this;
  }

  /** Stadium shape between two points — limbs, bars, pipes. */
  capsule(x0, y0, x1, y1, r) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const p = a + Math.PI / 2;
    this.c.moveTo(x0 + Math.cos(p) * r, y0 + Math.sin(p) * r);
    this.c.arc(x0, y0, r, p, p + Math.PI);
    this.c.arc(x1, y1, r, p + Math.PI, p + TAU);
    this.c.closePath();
    this._bound(
      Math.min(x0, x1) - r,
      Math.min(y0, y1) - r,
      Math.max(x0, x1) + r,
      Math.max(y0, y1) + r,
    );
    return this;
  }

  /** @param {number[][]|{x:number,y:number}[]} pts */
  poly(pts, close = true) {
    if (!pts.length) return this;
    const px = (p) => (Array.isArray(p) ? p[0] : p.x);
    const py = (p) => (Array.isArray(p) ? p[1] : p.y);
    this.c.moveTo(px(pts[0]), py(pts[0]));
    this._bound(px(pts[0]), py(pts[0]), px(pts[0]), py(pts[0]));
    for (let i = 1; i < pts.length; i++) {
      this.c.lineTo(px(pts[i]), py(pts[i]));
      this._bound(px(pts[i]), py(pts[i]), px(pts[i]), py(pts[i]));
    }
    if (close) this.c.closePath();
    return this;
  }

  star(x, y, rOuter, rInner, points = 5, rot = -Math.PI / 2) {
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = rot + (i * Math.PI) / points;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) this.c.moveTo(px, py);
      else this.c.lineTo(px, py);
    }
    this.c.closePath();
    this._bound(x - rOuter, y - rOuter, x + rOuter, y + rOuter);
    return this;
  }

  /** Organic wobbling circle — clouds, blobs, splats, slime. */
  blob(x, y, r, wobble = 0.14, lobes = 7, phase = 0) {
    const step = TAU / lobes;
    /** @type {number[][]} */
    const pts = [];
    for (let i = 0; i < lobes; i++) {
      const a = i * step + phase;
      const rr = r * (1 + Math.sin(a * 3 + phase * 2) * wobble);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    const mid = (i) => [
      (pts[i][0] + pts[(i + 1) % lobes][0]) / 2,
      (pts[i][1] + pts[(i + 1) % lobes][1]) / 2,
    ];
    let m = mid(lobes - 1);
    this.c.moveTo(m[0], m[1]);
    for (let i = 0; i < lobes; i++) {
      const n = mid(i);
      this.c.quadraticCurveTo(pts[i][0], pts[i][1], n[0], n[1]);
    }
    this.c.closePath();
    const rmax = r * (1 + wobble);
    this._bound(x - rmax, y - rmax, x + rmax, y + rmax);
    return this;
  }

  /* ------------------------------------------------------------- paint */

  fill(color) {
    this.c.fillStyle = color;
    this.c.fill();
    return this;
  }

  stroke(color = INK, w = STROKE.base) {
    this.c.lineWidth = w;
    this.c.lineJoin = 'round';
    this.c.lineCap = 'round';
    this.c.strokeStyle = color;
    this.c.stroke();
    return this;
  }

  /**
   * THE house style. Draw any solid object through this.
   *
   * @param {(g: Gfx) => void} path  builds the shape (called ONCE)
   * @param {Object} [o]
   * @param {string} [o.fill]     base colour — the only one an author picks
   * @param {string} [o.outline] @param {number} [o.lw]
   * @param {number} [o.extrude]  depth of the dark chunk below (0 = flat)
   * @param {number} [o.shade]    strength of the lower shade band
   * @param {number} [o.gloss]    strength of the top highlight
   * @param {number} [o.shadow]   contact-shadow opacity (0 = none)
   * @param {number} [o.shadowY]  gap between object base and its shadow
   * @param {number} [o.shadowSquash]
   */
  body(path, o = {}) {
    const c = this.c;
    const fill = o.fill ?? PAPER;
    const outline = o.outline ?? INK;
    const lw = o.lw ?? STROKE.base;
    const extrude = o.extrude ?? 12;
    const shade = o.shade ?? 0.22;
    const gloss = o.gloss ?? 0.3;
    const shadow = o.shadow ?? 0;

    // Build the shape ONCE into a Path2D and reuse it for the extrude, fill,
    // two clips and the outline. Re-running the author's path callback five
    // times per object was the single biggest cost in the renderer.
    const p = new Path2D();
    // The path builders write through `this.c`; Path2D exposes the same
    // geometry methods, and a no-op beginPath keeps `begin()` harmless.
    /** @type {any} */ (p).beginPath = NOOP;
    this.c = /** @type {any} */ (p);
    this._hasBounds = false;
    path(this);
    this.c = c;

    const b = { ...this._b };
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;

    if (shadow > 0 && w > 0) {
      const cx = (b.x0 + b.x1) / 2;
      const cy = b.y1 + (o.shadowY ?? 8);
      c.save();
      c.beginPath();
      c.ellipse(cx, cy, w * 0.46, Math.max(6, h * (o.shadowSquash ?? 0.1)), 0, 0, TAU);
      c.fillStyle = alpha(INK, shadow);
      c.fill();
      c.restore();
    }

    if (extrude > 0) {
      c.save();
      c.translate(0, extrude);
      c.fillStyle = darken(fill, 0.45);
      c.fill(p);
      c.lineWidth = lw;
      c.lineJoin = 'round';
      c.strokeStyle = outline;
      c.stroke(p);
      c.restore();
    }

    c.fillStyle = fill;
    c.fill(p);

    if (shade > 0 && h > 0) {
      c.save();
      c.clip(p);
      const gr = c.createLinearGradient(0, b.y0 + h * 0.3, 0, b.y1);
      gr.addColorStop(0, alpha(darken(fill, 0.9), 0));
      gr.addColorStop(1, alpha(darken(fill, 0.9), shade));
      c.fillStyle = gr;
      c.fillRect(b.x0 - 4, b.y0 - 4, w + 8, h + 8);
      c.restore();
    }

    if (gloss > 0 && h > 0) {
      c.save();
      c.clip(p);
      const gr = c.createLinearGradient(0, b.y0, 0, b.y0 + h * 0.55);
      gr.addColorStop(0, alpha(lighten(fill, 0.95), gloss));
      gr.addColorStop(1, alpha(lighten(fill, 0.95), 0));
      c.fillStyle = gr;
      c.fillRect(b.x0 - 4, b.y0 - 4, w + 8, h + 8);
      c.restore();
    }

    if (lw > 0) {
      c.lineWidth = lw;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.strokeStyle = outline;
      c.stroke(p);
    }
    return this;
  }

  /** Standalone contact shadow for objects that manage their own drawing. */
  ground(x, y, rx, ry = rx * 0.28, a = 0.22) {
    const c = this.c;
    c.beginPath();
    c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, TAU);
    c.fillStyle = alpha(INK, a);
    c.fill();
    return this;
  }

  /* -------------------------------------------------------------- text */

  _setFont(size, weight) {
    this.c.font = `${weight} ${size}px ${FONT_STACK}`;
  }

  /**
   * Chunky game text. Japanese system fonts rarely ship a 900 weight, so the
   * heft comes from a thick ink outline drawn under the fill — which also keeps
   * the text legible over any background a microgame throws behind it.
   *
   * @param {string} str
   * @param {Object} [o]
   * @param {number} [o.size] @param {string} [o.color] @param {string} [o.outline]
   * @param {number} [o.lw] @param {CanvasTextAlign} [o.align]
   * @param {CanvasTextBaseline} [o.baseline] @param {number} [o.weight]
   * @param {{x:number,y:number,color:string}|null} [o.shadow]
   * @param {number|null} [o.maxWidth] @param {number} [o.spacing]
   */
  text(str, x, y, o = {}) {
    const c = this.c;
    const size = o.size ?? TYPE.body;
    const weight = o.weight ?? 800;
    const color = o.color ?? PAPER;
    const outline = o.outline === null ? null : (o.outline ?? INK);
    const lw = o.lw ?? size * 0.17;

    c.save();
    this._setFont(size, weight);
    c.textAlign = o.align ?? 'center';
    c.textBaseline = o.baseline ?? 'middle';
    if (o.spacing !== undefined && this._supportsLetterSpacing) {
      // @ts-ignore — Chromium-only, guarded above
      c.letterSpacing = `${o.spacing}px`;
    }

    let k = 1;
    if (o.maxWidth) {
      const wpx = c.measureText(str).width;
      if (wpx > o.maxWidth) k = o.maxWidth / wpx;
    }
    c.translate(x, y);
    if (k !== 1) c.scale(k, k);

    if (o.shadow) {
      c.fillStyle = o.shadow.color;
      c.fillText(str, o.shadow.x / k, o.shadow.y / k);
    }
    if (outline) {
      c.lineWidth = lw;
      c.lineJoin = 'round';
      c.miterLimit = 2;
      c.strokeStyle = outline;
      c.strokeText(str, 0, 0);
    }
    c.fillStyle = color;
    c.fillText(str, 0, 0);
    c.restore();
    return this;
  }

  /** Width of `str` in virtual units at the given size. */
  measure(str, size = TYPE.body, weight = 800) {
    this.c.save();
    this._setFont(size, weight);
    const w = this.c.measureText(str).width;
    this.c.restore();
    return w;
  }

  /* ------------------------------------------------------- house props */

  /**
   * A face. Shared so every character across the collection blinks and emotes
   * with the same vocabulary instead of eighteen different eye styles.
   *
   * @param {number} x @param {number} y
   * @param {Object} [o]
   * @param {number} [o.scale] @param {number} [o.lookX] @param {number} [o.lookY]
   * @param {number} [o.blink] 0 open, 1 shut
   * @param {'smile'|'open'|'flat'|'sad'|'shock'} [o.mouth]
   * @param {number} [o.spread] eye separation
   */
  face(x, y, o = {}) {
    const c = this.c;
    const s = o.scale ?? 1;
    const blink = o.blink ?? 0;
    const lookX = (o.lookX ?? 0) * 6 * s;
    const lookY = (o.lookY ?? 0) * 5 * s;
    const spread = (o.spread ?? 34) * s;
    const eyeR = 15 * s;

    for (const sx of [-1, 1]) {
      const ex = x + sx * spread;
      c.save();
      if (blink > 0.75) {
        // Closed: a happy arc reads much friendlier than a flat line.
        c.lineWidth = 6 * s;
        c.lineCap = 'round';
        c.strokeStyle = INK;
        c.beginPath();
        c.arc(ex, y, eyeR, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
      } else {
        const sq = 1 - blink * 0.9;
        c.beginPath();
        c.ellipse(ex, y, eyeR, eyeR * sq, 0, 0, TAU);
        c.fillStyle = INK;
        c.fill();
        c.beginPath();
        c.ellipse(ex + lookX + 4 * s, y + lookY - 4 * s, eyeR * 0.34, eyeR * 0.34 * sq, 0, 0, TAU);
        c.fillStyle = PAPER;
        c.fill();
      }
      c.restore();
    }

    const my = y + 34 * s;
    c.save();
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = 6 * s;
    c.lineCap = 'round';
    c.beginPath();
    switch (o.mouth ?? 'smile') {
      case 'open':
        c.ellipse(x, my + 4 * s, 17 * s, 20 * s, 0, 0, TAU);
        c.fill();
        break;
      case 'shock':
        c.ellipse(x, my + 4 * s, 13 * s, 22 * s, 0, 0, TAU);
        c.fill();
        break;
      case 'flat':
        c.moveTo(x - 16 * s, my);
        c.lineTo(x + 16 * s, my);
        c.stroke();
        break;
      case 'sad':
        c.arc(x, my + 18 * s, 18 * s, Math.PI * 1.2, Math.PI * 1.8);
        c.stroke();
        break;
      default:
        c.arc(x, my - 8 * s, 20 * s, Math.PI * 0.18, Math.PI * 0.82);
        c.stroke();
    }
    c.restore();
    return this;
  }

  /* ------------------------------------------------------- backgrounds */

  /** Vertical gradient across the whole viewport (not just the action box). */
  skyGradient(top, bottom) {
    const f = this.stage.full;
    const gr = this.c.createLinearGradient(0, f.y0, 0, f.y1);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    this.c.fillStyle = gr;
    this.c.fillRect(f.x0, f.y0, f.w, f.h);
    return this;
  }

  /**
   * Rotating sunburst behind celebratory moments.
   *
   * Rendered from a cached bitmap: filling a dozen wedges the size of the whole
   * screen every frame is one of the most expensive things this game can do,
   * and a rotated blit is free by comparison.
   */
  sunburst(x, y, radius, color, rays = 12, rot = 0, a = 0.18) {
    const img = getSunburstBitmap(rays, color);
    const c = this.c;
    c.save();
    c.globalAlpha *= a;
    c.translate(x, y);
    c.rotate(rot);
    const s = radius / (SUNBURST_SIZE / 2);
    c.scale(s, s);
    c.drawImage(img, -SUNBURST_SIZE / 2, -SUNBURST_SIZE / 2);
    c.restore();
    return this;
  }
}

export { BOX_W, BOX_H };
