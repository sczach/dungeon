/**
 * @file src/constants.js
 * Shared game constants.
 *
 * Extracted from game.js to eliminate a circular ES-module dependency:
 *
 *   Before:  game.js ←→ renderer.js  (circular — renderer imported SCENE from game)
 *   After:   game.js  → constants.js  (acyclic)
 *            renderer.js → constants.js  (acyclic)
 *
 * A circular import of a `const` (which is TDZ-guarded in ES modules) causes
 * the importer to receive an uninitialised binding.  Chrome/V8 silently defers
 * the resolution; Safari/JSC and Vercel's edge runtime reject it outright,
 * producing a blank page with no console output.  Moving SCENE here makes
 * every import acyclic and safe in all environments.
 */

/**
 * Scene state identifiers.
 * game.js writes state.scene and document.body.dataset.scene;
 * renderer.js reads it to dispatch per-scene draw calls;
 * style.css uses [data-scene] attribute selectors to show/hide HTML overlays.
 *
 * Scene flow:
 *   TITLE → INSTRUMENT_SELECT
 *     ├─ (first play) → LEVEL_START(T1) → [CALIBRATION →] PLAYING → … → PLAYING(T4) → WORLD_MAP
 *     ├─ (returning)  → WORLD_MAP → LEVEL_START → [CALIBRATION →] PLAYING → VICTORY|DEFEAT → WORLD_MAP
 *     └─ (minigame)   → WORLD_MAP → LEVEL_START → MINIGAME → VICTORY|DEFEAT → WORLD_MAP
 *
 * @type {Readonly<{TITLE:string, INSTRUMENT_SELECT:string, WORLD_MAP:string, LEVEL_START:string, CALIBRATION:string, PLAYING:string, MINIGAME:string, VICTORY:string, DEFEAT:string, ENDGAME:string}>}
 */
export const SCENE = Object.freeze({
  TITLE:             'TITLE',
  INSTRUMENT_SELECT: 'INSTRUMENT_SELECT',
  WORLD_MAP:         'WORLD_MAP',
  LEVEL_START:       'LEVEL_START',
  CALIBRATION:       'CALIBRATION',
  PLAYING:           'PLAYING',
  MINIGAME:          'MINIGAME',
  VICTORY:           'VICTORY',
  DEFEAT:            'DEFEAT',
  ENDGAME:           'ENDGAME',
});

// ─────────────────────────────────────────────────────────────────────────────
// RTS map layout — all values are fractions of canvas logical dimensions.
// Multiply by W (width) or H (height) to get logical pixels.
// ─────────────────────────────────────────────────────────────────────────────

/** Centre of combat strip as a fraction of canvas height. */
export const LANE_Y      = 0.5;

/** Height of combat strip as a fraction of canvas height. */
export const LANE_HEIGHT = 0.18;

/** Width of each base rectangle as a fraction of canvas width. */
export const BASE_WIDTH  = 0.08;

/** Left edge of player base as a fraction of canvas width. */
export const PLAYER_BASE_X = 0.04;

/** Left edge of enemy base as a fraction of canvas width. */
export const ENEMY_BASE_X  = 0.88;
