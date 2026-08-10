/**
 * Stage — the single owner of the coordinate system.
 *
 * PORTRAIT FIRST. The design space is 1080x1920 (9:16), because this game is
 * played with one thumb on a phone. On a typical handset that box fills the
 * screen edge to edge with only a little vertical slack; a 4:3 box was tried
 * first and confined the whole game to the middle third of the display.
 *
 * The contract every module obeys:
 *   - The 1080x1920 "action box" is ALWAYS fully visible, centred.
 *   - Gameplay-critical content lives inside it. Backgrounds may spill into
 *     `full`, the virtual rectangle that maps to the entire viewport, so wide
 *     screens show more scenery rather than empty bars.
 */

export const BOX_W = 1080;
export const BOX_H = 1920;

/** Device pixel ratio is capped: phones report 3-4 and burn fill rate for nothing. */
const MAX_DPR = 2;

/** @typedef {ReturnType<typeof createStage>} Stage */

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createStage(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { alpha: false, desynchronized: true })
  );

  const stage = {
    canvas,
    ctx,
    cssW: 0,
    cssH: 0,
    dpr: 1,
    scale: 1,
    offX: 0,
    offY: 0,
    portrait: false,
    /** Virtual-space rectangle that maps to the whole viewport. */
    full: { x0: 0, y0: 0, x1: BOX_W, y1: BOX_H, w: BOX_W, h: BOX_H },
    /** The guaranteed-visible action box. */
    box: { x: 0, y: 0, w: BOX_W, h: BOX_H, cx: BOX_W / 2, cy: BOX_H / 2 },

    resize() {
      const cssW = Math.max(1, window.innerWidth);
      const cssH = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      stage.cssW = cssW;
      stage.cssH = cssH;
      stage.dpr = dpr;
      stage.portrait = cssH > cssW;

      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';

      // Fit the whole action box; never crop it.
      const scale = Math.min(cssW / BOX_W, cssH / BOX_H);
      stage.scale = scale;
      stage.offX = (cssW - BOX_W * scale) / 2;
      stage.offY = (cssH - BOX_H * scale) / 2;

      const f = stage.full;
      f.x0 = -stage.offX / scale;
      f.y0 = -stage.offY / scale;
      f.x1 = BOX_W - f.x0;
      f.y1 = BOX_H - f.y0;
      f.w = f.x1 - f.x0;
      f.h = f.y1 - f.y0;
      return stage;
    },

    /** Set the virtual-space transform for a frame of drawing. */
    applyTransform() {
      const s = stage.scale * stage.dpr;
      ctx.setTransform(s, 0, 0, s, stage.offX * stage.dpr, stage.offY * stage.dpr);
    },

    /** Convert a client (event) coordinate into virtual space. */
    toVirtual(clientX, clientY, out = { x: 0, y: 0 }) {
      out.x = (clientX - stage.offX) / stage.scale;
      out.y = (clientY - stage.offY) / stage.scale;
      return out;
    },
  };

  stage.resize();
  return stage;
}
