/**
 * Small colour toolkit. Everything the renderer needs to derive shade bands,
 * gloss and extrusion faces from a single base colour — so a microgame author
 * picks ONE colour per object and the shading stays consistent across the game.
 */

/** @param {string} hex  #rgb or #rrggbb */
export function parseHex(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function toHex(r, g, b) {
  return (
    '#' + ((1 << 24) | (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)).toString(16).slice(1)
  );
}

/** Blend two hex colours. t=0 -> a, t=1 -> b. */
export function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
}

/**
 * Darken toward a deep blue-purple rather than pure black: neutral-black
 * shadows are what make flat vector art read as cheap.
 */
export function darken(hex, amount = 0.2) {
  return mix(hex, '#2a1c3d', amount);
}

/** Lighten toward a warm white so highlights feel like light, not fog. */
export function lighten(hex, amount = 0.2) {
  return mix(hex, '#fffdf2', amount);
}

/** @param {string} hex @param {number} a */
export function alpha(hex, a) {
  const c = parseHex(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
