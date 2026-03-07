/**
 * @file src/systems/combat.js
 * Drives all defender-unit logic each frame.
 *
 * Responsibilities
 * ────────────────
 *   • Calls unit.update(dt, enemies, units) for every live unit.
 *   • Removes dead units from state.units using backwards splice
 *     (identical pattern to enemy removal in game.js — no array allocation).
 *
 * Does NOT remove dead enemies — that remains game.js's responsibility
 * so that the `reachedCastle` flag is read before the enemy is discarded.
 *
 * @param {object} state — canonical game state (mutates state.units only)
 * @param {number} dt    — delta time in seconds
 */
export function updateCombat(state, dt) {
  const enemies = state.enemies;
  const units   = state.units;

  // Backwards iteration: splice is safe and does not skip entries
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    u.update(dt, enemies, units);
    if (!u.alive) {
      units.splice(i, 1);
    }
  }
}
