/**
 * Fixed-timestep game loop.
 *
 * Simulation runs at a fixed 120 Hz regardless of display refresh, so a 60 Hz
 * phone and a 120 Hz tablet play identically — and so the scripted QA runs
 * ("does every microgame remain winnable?") are deterministic instead of
 * frame-rate dependent.
 */

const STEP = 1 / 120;
const MAX_STEPS = 6; // beyond ~50ms of backlog we drop time rather than spiral

/**
 * @param {{ tick: (dt:number, nowMs:number) => void, render: (nowMs:number) => void }} handlers
 */
export function createLoop({ tick, render }) {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;

  const stats = {
    fps: 0,
    /** Worst frame time (ms) seen in the current sampling window. */
    worstMs: 0,
    frames: 0,
    _windowStart: 0,
    _windowFrames: 0,
    _windowWorst: 0,
  };

  const onFrame = (nowMs) => {
    if (!running) return;
    raf = requestAnimationFrame(onFrame);

    const dt = Math.min((nowMs - last) / 1000, 0.25);
    last = nowMs;
    acc += dt;

    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      tick(STEP, nowMs);
      acc -= STEP;
      steps++;
    }
    if (steps >= MAX_STEPS) acc = 0; // give up on the backlog, stay responsive

    render(nowMs);

    stats.frames++;
    stats._windowFrames++;
    stats._windowWorst = Math.max(stats._windowWorst, dt * 1000);
    if (nowMs - stats._windowStart >= 1000) {
      stats.fps = (stats._windowFrames * 1000) / (nowMs - stats._windowStart);
      stats.worstMs = stats._windowWorst;
      stats._windowStart = nowMs;
      stats._windowFrames = 0;
      stats._windowWorst = 0;
    }
  };

  return {
    stats,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      stats._windowStart = last;
      raf = requestAnimationFrame(onFrame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
