/**
 * @file src/systems/waves.js
 * Wave configuration table — hand-tuned per-wave enemy count and spawn pacing.
 *
 * Consumed by game.js which owns the actual spawn loop and wave state.
 * Enemy HP and speed come from TIER_STATS in unit.js, scaled by level.difficultyMod.
 * Difficulty setting applies a multiplier to spawnInterval (Easy ×1.5, Hard ×0.7).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Wave table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ten wave configuration objects — hand-tuned for a gentle difficulty ramp.
 * Index 0 = Wave 1, index 9 = Wave 10.
 *
 * Wave 1 gives ~15-20s of breathing room so the player can orient.
 * Difficulty ramps gradually through waves 2-6, then escalates sharply 7-10.
 *
 * enemyCount:    how many enemies spawn this wave
 * spawnInterval: seconds between individual enemy spawns
 *
 * NOTE: Enemy HP and speed come from TIER_STATS in unit.js, scaled by
 * level.difficultyMod. The wave table controls count + pacing only.
 *
 * @type {ReadonlyArray<Readonly<{
 *   enemyCount: number,
 *   spawnInterval: number
 * }>>}
 */
export const WAVES = Object.freeze([
  Object.freeze({ enemyCount:  3, spawnInterval: 4.0 }),  // Wave 1  — gentle intro
  Object.freeze({ enemyCount:  4, spawnInterval: 3.5 }),  // Wave 2
  Object.freeze({ enemyCount:  5, spawnInterval: 3.0 }),  // Wave 3
  Object.freeze({ enemyCount:  6, spawnInterval: 2.5 }),  // Wave 4  — starting to ramp
  Object.freeze({ enemyCount:  8, spawnInterval: 2.0 }),  // Wave 5  — medium challenge
  Object.freeze({ enemyCount: 10, spawnInterval: 1.8 }),  // Wave 6
  Object.freeze({ enemyCount: 12, spawnInterval: 1.5 }),  // Wave 7  — serious
  Object.freeze({ enemyCount: 14, spawnInterval: 1.2 }),  // Wave 8  — hard
  Object.freeze({ enemyCount: 16, spawnInterval: 0.8 }),  // Wave 9  — very hard
  Object.freeze({ enemyCount: 20, spawnInterval: 0.5 }),  // Wave 10 — boss wave
]);

