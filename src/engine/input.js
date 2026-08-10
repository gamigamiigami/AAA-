/**
 * Input — touch-first, expressed in virtual (action-box) coordinates.
 *
 * Every microgame in this collection is playable with fingers alone: tap,
 * swipe, drag, hold. Mouse falls out for free because we speak Pointer Events.
 *
 * Recognition thresholds are in milliseconds and virtual units, deliberately
 * NOT in beats: a human's flick is the same speed at 108 BPM and at 156 BPM, so
 * tying gesture recognition to tempo would make late-game input feel broken.
 */

const TAP_MAX_MS = 350;
const TAP_MAX_DIST = 46;
const SWIPE_MIN_DIST = 110;
const SWIPE_MAX_MS = 500;

/**
 * @typedef {Object} Pointer
 * @property {number} id
 * @property {number} x  current position, virtual space
 * @property {number} y
 * @property {number} sx start position
 * @property {number} sy
 * @property {number} dx movement since press
 * @property {number} dy
 * @property {number} vx per-frame velocity (virtual units / sec)
 * @property {number} vy
 * @property {number} downT  ms timestamp of press
 * @property {number} maxDist furthest it has strayed from the press point
 * @property {boolean} swiped a swipe has already been emitted for this pointer
 * @property {number} [_lx] previous-frame position, for velocity
 * @property {number} [_ly]
 *
 * @typedef {Object} Swipe
 * @property {number} x @property {number} y
 * @property {number} dx @property {number} dy
 * @property {'up'|'down'|'left'|'right'} dir
 * @property {number} dist
 *
 * @typedef {Object} InputFrame
 * @property {Pointer[]} pointers   currently held pointers
 * @property {Pointer|null} primary oldest held pointer
 * @property {{x:number,y:number,id:number}[]} presses  went down this frame
 * @property {{x:number,y:number,id:number,dx:number,dy:number,heldMs:number}[]} releases
 * @property {{x:number,y:number}[]} taps  short, still press+release
 * @property {Swipe[]} swipes
 * @property {boolean} down    at least one pointer held
 * @property {number} holdMs   longest current hold
 */

/**
 * @param {import('./stage.js').Stage} stage
 */
export function createInput(stage) {
  /** @type {Map<number, Pointer>} */
  const active = new Map();
  const tmp = { x: 0, y: 0 };

  /** @type {InputFrame} */
  const frame = {
    pointers: [],
    primary: null,
    presses: [],
    releases: [],
    taps: [],
    swipes: [],
    down: false,
    holdMs: 0,
  };

  const pendingPresses = [];
  const pendingReleases = [];
  const pendingTaps = [];
  const pendingSwipes = [];

  const emitSwipe = (p, x, y, dx, dy) => {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    pendingSwipes.push({ x, y, dx, dy, dir, dist: Math.hypot(dx, dy) });
    p.swiped = true;
  };

  const onDown = (e) => {
    stage.toVirtual(e.clientX, e.clientY, tmp);
    const p = {
      id: e.pointerId,
      x: tmp.x,
      y: tmp.y,
      sx: tmp.x,
      sy: tmp.y,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      downT: e.timeStamp,
      maxDist: 0,
      swiped: false,
    };
    active.set(e.pointerId, p);
    pendingPresses.push({ x: p.x, y: p.y, id: p.id });
    try {
      stage.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety, not a requirement */
    }
    e.preventDefault();
  };

  const onMove = (e) => {
    const p = active.get(e.pointerId);
    if (!p) return;
    stage.toVirtual(e.clientX, e.clientY, tmp);
    p.x = tmp.x;
    p.y = tmp.y;
    p.dx = p.x - p.sx;
    p.dy = p.y - p.sy;
    p.maxDist = Math.max(p.maxDist, Math.hypot(p.dx, p.dy));

    // Fire swipes mid-gesture rather than on release: waiting for the finger to
    // lift makes a flick feel a frame-and-a-half late, which is fatal at tempo.
    if (!p.swiped && p.maxDist >= SWIPE_MIN_DIST && e.timeStamp - p.downT <= SWIPE_MAX_MS) {
      emitSwipe(p, p.x, p.y, p.dx, p.dy);
    }
    e.preventDefault();
  };

  const onUp = (e) => {
    const p = active.get(e.pointerId);
    if (!p) return;
    active.delete(e.pointerId);
    const heldMs = e.timeStamp - p.downT;
    pendingReleases.push({ x: p.x, y: p.y, id: p.id, dx: p.dx, dy: p.dy, heldMs });
    if (heldMs <= TAP_MAX_MS && p.maxDist <= TAP_MAX_DIST) {
      pendingTaps.push({ x: p.x, y: p.y });
    }
    try {
      stage.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    e.preventDefault();
  };

  const onCancel = (e) => {
    const p = active.get(e.pointerId);
    if (!p) return;
    active.delete(e.pointerId);
    pendingReleases.push({
      x: p.x,
      y: p.y,
      id: p.id,
      dx: p.dx,
      dy: p.dy,
      heldMs: e.timeStamp - p.downT,
    });
  };

  const preventDefault = (e) => e.preventDefault();

  const input = {
    frame,

    attach() {
      const c = stage.canvas;
      c.addEventListener('pointerdown', onDown, { passive: false });
      c.addEventListener('pointermove', onMove, { passive: false });
      c.addEventListener('pointerup', onUp, { passive: false });
      c.addEventListener('pointercancel', onCancel, { passive: false });
      // Belt and braces against mobile browser gestures stealing input.
      c.addEventListener('touchstart', preventDefault, { passive: false });
      c.addEventListener('touchmove', preventDefault, { passive: false });
      c.addEventListener('contextmenu', preventDefault);
      window.addEventListener('blur', input.releaseAll);
      return input;
    },

    /** Drop all held pointers (tab switch, pause) so nothing sticks down. */
    releaseAll() {
      for (const p of active.values()) {
        pendingReleases.push({ x: p.x, y: p.y, id: p.id, dx: p.dx, dy: p.dy, heldMs: 0 });
      }
      active.clear();
    },

    /** Build this frame's snapshot. Call once per frame, before update. */
    beginFrame(nowMs, dtSec) {
      frame.presses = pendingPresses.splice(0);
      frame.releases = pendingReleases.splice(0);
      frame.taps = pendingTaps.splice(0);
      frame.swipes = pendingSwipes.splice(0);

      frame.pointers = [...active.values()];
      frame.primary = frame.pointers.length ? frame.pointers[0] : null;
      frame.down = frame.pointers.length > 0;
      frame.holdMs = 0;
      for (const p of frame.pointers) {
        frame.holdMs = Math.max(frame.holdMs, nowMs - p.downT);
        if (dtSec > 0) {
          p.vx = (p.x - (p._lx ?? p.x)) / dtSec;
          p.vy = (p.y - (p._ly ?? p.y)) / dtSec;
        }
        p._lx = p.x;
        p._ly = p.y;
      }
      return frame;
    },
  };

  return input;
}

/**
 * Empty frame — microgames can rely on the shape existing even when the host
 * withholds input (during prompt cards and resolve beats).
 * @returns {InputFrame}
 */
export function emptyInputFrame() {
  return {
    pointers: [],
    primary: null,
    presses: [],
    releases: [],
    taps: [],
    swipes: [],
    down: false,
    holdMs: 0,
  };
}
