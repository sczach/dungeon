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
 * @type {Readonly<{TITLE:string, CALIBRATION:string, PLAYING:string, VICTORY:string, DEFEAT:string}>}
 */
export const SCENE = Object.freeze({
  TITLE:       'TITLE',
  CALIBRATION: 'CALIBRATION',
  PLAYING:     'PLAYING',
  VICTORY:     'VICTORY',
  DEFEAT:      'DEFEAT',
});
