/**
 * かわせ！ — flick between lanes to dodge the lasers.
 *
 * Everything hangs on the telegraph. A player who loses here must always be
 * able to say "I saw it and moved too late", never "that was unfair", so the
 * warning is a colour change, a growing beam and a rising hum at once.
 */

import { byLevel } from '../types.js';
import { INK, PAPER, STROKE, LAYOUT, SEMANTIC, ease, tween } from '../../design/tokens.js';
import { alpha, darken, lighten } from '../../design/color.js';
import { createBackdrop } from '../../gfx/scene.js';

const GROUND_Y = 1660;
const PLAYER_Y = GROUND_Y - 110;
const EMITTER_Y = 380;

/** @type {import('../types.js').MicrogameDef} */
export default {
  id: 'laser',
  command: 'かわせ！',
  input: 'swipe',
  stage: 'neon',
  lengthBeats: 8,
  timeoutResult: 'win',

  create(ctx) {
    const { rng, level, palette, fx, audio } = ctx;

    const cfg = byLevel(level, [
      // L1 teaches the verb: 3 lanes, one fires, long warning.
      { lanes: 3, volleys: 3, danger: 1, warn: 1.1 },
      // L2 adds a decision: two of three fire, so only one lane is safe.
      { lanes: 3, volleys: 4, danger: 2, warn: 0.85 },
      // L3 adds pressure: 5 lanes, two fire, short warning.
      { lanes: 5, volleys: 6, danger: 2, warn: 0.6 },
    ]);

    const backdrop = createBackdrop(rng.derive('scene'), palette, { horizon: GROUND_Y });
    const laneX = (i) => LAYOUT.cx + (i - (cfg.lanes - 1) / 2) * (760 / cfg.lanes);

    /** @type {{beat:number, lanes:number[], fired:boolean, warned:boolean}[]} */
    const volleys = [];
    {
      const window = ctx.lengthBeats - 1.2;
      for (let i = 0; i < cfg.volleys; i++) {
        const all = rng.shuffle([...Array(cfg.lanes).keys()]);
        volleys.push({
          beat: cfg.warn + 0.3 + (i / cfg.volleys) * (window - cfg.warn),
          lanes: all.slice(0, cfg.danger),
          fired: false,
          warned: false,
        });
      }
    }

    let lane = Math.floor(cfg.lanes / 2);
    let visualLane = lane;
    let hit = false;
    let won = false;
    let elapsed = -2;
    /** Beat at which each lane's beam stops being lethal/visible. */
    const beamUntil = new Array(cfg.lanes).fill(-1);

    return {
      update(dt, input, elapsedBeats) {
        elapsed = elapsedBeats;
        if (dt <= 0) return hit ? 'lose' : 'playing';

        visualLane += (lane - visualLane) * (1 - Math.pow(0.0002, dt));

        for (const s of input.swipes) {
          if (Math.abs(s.dx) < Math.abs(s.dy)) continue;
          const next = Math.max(0, Math.min(cfg.lanes - 1, lane + (s.dx > 0 ? 1 : -1)));
          if (next !== lane) {
            lane = next;
            fx.puff(laneX(lane), PLAYER_Y + 60, { count: 4, color: alpha(PAPER, 0.7), size: 24 });
            audio.sfx('swipe');
          }
        }

        for (const v of volleys) {
          if (!v.warned && elapsedBeats >= v.beat - cfg.warn) {
            v.warned = true;
            audio.sfx('blip');
          }
          if (!v.fired && elapsedBeats >= v.beat) {
            v.fired = true;
            for (const l of v.lanes) beamUntil[l] = elapsedBeats + 0.45;
            fx.shake(14);
            fx.flash(palette.accent, 0.18);
            audio.sfx('hit');
            if (v.lanes.includes(lane)) {
              hit = true;
              fx.burst(laneX(lane), PLAYER_Y, {
                count: 24,
                colors: [palette.accent, PAPER],
                power: 1.3,
              });
              return 'lose';
            }
          }
        }

        return 'playing';
      },

      onResult(w) {
        won = w;
        if (w) {
          fx.burst(laneX(lane), PLAYER_Y - 40, {
            count: 18,
            colors: [palette.accent2, PAPER],
            power: 1,
          });
        }
      },

      debugHint() {
        // Find the next volley still to fire and step out of its lanes.
        const next = volleys.find((v) => !v.fired);
        if (!next) return null;
        if (!next.lanes.includes(lane)) return null;
        for (let l = 0; l < cfg.lanes; l++) {
          if (!next.lanes.includes(l)) {
            return {
              type: 'swipe',
              x: LAYOUT.cx,
              y: PLAYER_Y,
              dx: l > lane ? 420 : -420,
              dy: 0,
            };
          }
        }
        return null;
      },

      draw(g) {
        const c = g.c;
        const beat = ctx.conductor.beat;
        backdrop.draw(g, beat);

        /* ----------------------------------------------------- emitters */
        for (let l = 0; l < cfg.lanes; l++) {
          const x = laneX(l);
          // How close is the next volley that includes this lane?
          let warn = 0;
          for (const v of volleys) {
            if (v.fired || !v.lanes.includes(l)) continue;
            const lead = v.beat - elapsed;
            if (lead >= 0 && lead <= cfg.warn) warn = Math.max(warn, 1 - lead / cfg.warn);
          }
          const firing = beamUntil[l] > elapsed;

          // Charging beam: a widening column that reaches the floor exactly as
          // the shot lands, so the timing is visible rather than memorised.
          if (warn > 0 || firing) {
            const w = firing ? 96 : 10 + warn * 46;
            const reach = firing ? GROUND_Y : EMITTER_Y + (GROUND_Y - EMITTER_Y) * warn;
            c.save();
            c.globalAlpha = firing ? 0.95 : 0.3 + warn * 0.5;
            const gr = c.createLinearGradient(0, EMITTER_Y, 0, reach);
            gr.addColorStop(0, firing ? PAPER : palette.accent);
            gr.addColorStop(1, alpha(firing ? palette.accent : palette.accent, firing ? 0.9 : 0.2));
            c.fillStyle = gr;
            c.fillRect(x - w / 2, EMITTER_Y, w, reach - EMITTER_Y);
            c.restore();
          }

          // The emitter head, glowing red as it charges.
          const head = warn > 0 || firing ? lighten(SEMANTIC.danger, warn * 0.4) : palette.accent3;
          g.body((gg) => gg.rrect(x - 74, EMITTER_Y - 96, 148, 96, 18), {
            fill: head,
            extrude: 12,
            shade: 0.26,
            gloss: 0.34,
            lw: STROKE.base,
          });
          g.body((gg) => gg.circle(x, EMITTER_Y - 12, 22), {
            fill: warn > 0 || firing ? PAPER : darken(head, 0.4),
            extrude: 0,
            shade: 0,
            gloss: 0.5,
            lw: 5,
          });
        }

        /* ------------------------------------------------- lane markers */
        for (let l = 0; l < cfg.lanes; l++) {
          const x = laneX(l);
          c.save();
          c.globalAlpha = 0.22;
          g.begin().rrect(x - 66, GROUND_Y - 40, 132, 34, 17);
          c.fillStyle = PAPER;
          c.fill();
          c.restore();
        }

        /* ---------------------------------------------------- player */
        const px = laneX(visualLane);
        const lean = (lane - visualLane) * 0.5;
        g.ground(px, GROUND_Y - 14, 78, 22, 0.26);
        c.save();
        c.translate(px, PLAYER_Y);
        c.rotate(-lean);
        g.body((gg) => gg.circle(0, 0, 74), {
          fill: hit ? '#9aa0b5' : palette.accent2,
          extrude: 14,
          shade: 0.24,
          gloss: 0.4,
          lw: STROKE.base,
        });
        g.face(0, -8, {
          scale: 1.3,
          lookX: -lean * 2,
          lookY: -0.3,
          blink: hit ? 1 : 0,
          mouth: hit ? 'sad' : won ? 'open' : 'flat',
        });
        c.restore();
      },
    };
  },
};
