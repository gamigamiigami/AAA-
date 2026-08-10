/**
 * The microgame registry.
 *
 * A microgame author creates `src/microgames/<id>/game.js` and nothing else;
 * this file is the one place that knows the roster.
 */

import dodge from './dodge/game.js';
import catchGame from './catch/game.js';
import swat from './swat/game.js';
import sort from './sort/game.js';
import charge from './charge/game.js';
import laser from './laser/game.js';
import beat from './beat/game.js';
import pop from './pop/game.js';
import guide from './guide/game.js';
import bossChase from './bossChase/game.js';
import bossPunch from './bossPunch/game.js';

/** @type {import('./types.js').MicrogameDef[]} */
export const MICROGAMES = [dodge, catchGame, swat, sort, charge, laser, beat, pop, guide];

/** @type {import('./types.js').MicrogameDef[]} */
export const BOSSES = [bossChase, bossPunch];

/**
 * Games available on a stage. Falls back to the whole pool while the roster is
 * still filling up, so a half-populated stage is never unplayable.
 * @param {string} stageId
 */
export function gamesForStage(stageId) {
  const owned = MICROGAMES.filter((m) => m.stage === stageId);
  return owned.length >= 4 ? owned : MICROGAMES;
}

/** Bosses declare `stage: 'any'` and take on whichever world they appear in. */
export function bossesForStage(_stageId) {
  return BOSSES;
}
