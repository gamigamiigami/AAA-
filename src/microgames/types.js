/**
 * THE MICROGAME CONTRACT.
 *
 * Read this before writing a game. It is the entire interface between a
 * microgame and the rest of the project, and it is deliberately tiny: a game
 * receives a context, gets ticked, draws itself, and reports win or lose.
 *
 * ── Rules every microgame must follow ──────────────────────────────────────
 *
 * 1. THE DESIGN SPACE IS PORTRAIT: (0,0)-(1080,1920), always fully visible.
 *    Keep anything the player must see or touch inside it, and clear of the HUD
 *    bands (above y=190 and below y=1730). Scenery — sky, ground, backdrops —
 *    may extend into `g.full`, the rectangle covering the whole viewport, so a
 *    wide screen shows more background instead of empty bars.
 *
 * 2. NEVER call Math.random(). Use `ctx.rng`. Two plays of the same seed must
 *    be identical, or the QA harness cannot verify the game is winnable.
 *
 * 3. TIME IS MEASURED IN BEATS. `update(dtBeats, ...)` receives beats, not
 *    seconds. Anything tuned in seconds will fall out of sync the moment the
 *    tempo ramps at level 2.
 *
 * 4. IMPLEMENT ALL THREE LEVELS, and make them feel different — not merely
 *    faster. Level 1 teaches the verb, level 2 adds a decision, level 3 adds
 *    pressure. "Same game with a bigger speed multiplier" is a rejected game.
 *
 * 5. TOUCH ONLY. tap / swipe / drag / hold. No keyboard, no hover, no
 *    right-click, and nothing that needs a second hand.
 *
 * 6. BE READABLE IN ONE SECOND. The player has never seen your game before and
 *    has about four seconds total. What to touch must be obvious without text.
 *
 * 7. RESOLVE, OR TIME OUT DELIBERATELY. Either return 'win'/'lose' from
 *    update(), or set `timeoutResult` so running out the clock means something.
 */

/**
 * @typedef {'tap'|'swipe'|'drag'|'hold'} InputVerb
 *   tap   — touch anywhere / on a target
 *   swipe — flick in a direction
 *   drag  — hold and move something
 *   hold  — press and keep pressing
 */

/**
 * @typedef {Object} MicrogameCtx
 * @property {import('../engine/rng.js').Rng} rng   seeded per play
 * @property {1|2|3} level
 * @property {import('../design/tokens.js').Palette} palette  stage colours
 * @property {import('../gfx/gfx.js').Gfx} gfx
 * @property {any} audio  sfx bus: audio.sfx(name)
 * @property {any} fx     particles / shake / flash, scoped to this play
 * @property {any} conductor  read `.beat` for the running song position — use
 *   it to land animations and spawns on the music rather than on wall time
 * @property {number} lengthBeats  the budget this play was given
 */

/**
 * @typedef {Object} MicrogameInstance
 * @property {(dtBeats: number, input: import('../engine/input.js').InputFrame,
 *   elapsedBeats: number) => 'playing'|'win'|'lose'} update
 *   Called at a fixed 120Hz. Return a verdict the moment one exists. During the
 *   order card `elapsedBeats` is NEGATIVE, no input arrives, and the return
 *   value is ignored — use those beats for an entry animation. After the first
 *   verdict the host keeps ticking you so animations continue, but ignores the
 *   return value.
 * @property {(g: import('../gfx/gfx.js').Gfx) => void} draw
 * @property {(won: boolean) => void} [onResult]  fired once, when resolved
 * @property {() => any} [debugHint]  QA: the correct action right now
 * @property {() => void} [dispose]
 */

/**
 * @typedef {Object} MicrogameDef
 * @property {string} id            unique, matches the folder name
 * @property {string} command       the order card text, e.g. 「よけろ！」
 *                                  Keep to 6 characters or fewer — it is set at
 *                                  168px and must never wrap.
 * @property {InputVerb} input      drives the control hint on the order card
 * @property {string} stage         'town' | 'neon' | 'forest' | 'any'
 * @property {number} [lengthBeats] defaults to 8 (about 3.6s at 133bpm)
 * @property {'win'|'lose'} [timeoutResult]  what running out of time means.
 *                                  Default 'lose'. Survival games set 'win'.
 * @property {boolean} [boss]
 * @property {(ctx: MicrogameCtx) => MicrogameInstance} create
 */

/** Default beat budget, so games only declare a length when they differ. */
export const DEFAULT_LENGTH_BEATS = 8;

/**
 * Difficulty helper: pick one of three values by level. Using this instead of
 * `1 + level * 0.3` keeps each level a designed number rather than a curve, and
 * makes it obvious in review whether a game really varies across levels.
 * @template T
 * @param {1|2|3} level
 * @param {[T,T,T]} values
 * @returns {T}
 */
export function byLevel(level, values) {
  return values[Math.min(Math.max(level, 1), 3) - 1];
}
