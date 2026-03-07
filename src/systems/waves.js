/**
 * @file src/systems/waves.js
 * Wave configuration table and WaveManager class.
 *
 * WAVES
 * ─────
 * Ten waves, linearly interpolated between:
 *   Wave 1:  5 enemies, 30 hp,  80 px/s,  2.0 s spawn interval
 *   Wave 10: 20 enemies, 150 hp, 220 px/s, 0.5 s spawn interval
 *
 * Speed is in logical pixels/second.  Enemy.update() divides by getPathLength()
 * so pathT advances as a normalised fraction regardless of canvas size.
 *
 * WAVEMANAGER
 * ───────────
 * Mutates state.enemies (push) and state.wave (increment) directly.
 * Does NOT use filter/map — enemies are removed by game.js via backwards splice.
 * Exposes .complete = true when all 10 waves are done; game.js triggers VICTORY.
 *
 * Spawn timer uses += (not =) to prevent drift when a frame runs long.
 * First enemy of each wave spawns on the very first update() call for that wave.
 */

import { Enemy } from '../entities/enemy.js';

// ─────────────────────────────────────────────────────────────────────────────
// Wave table
// ─────────────────────────────────────────────────────────────────────────────

/** Linear interpolation helper (no allocation). */
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Ten wave configuration objects.
 * Index 0 = Wave 1, index 9 = Wave 10.
 *
 * @type {ReadonlyArray<Readonly<{
 *   enemyCount: number,
 *   enemyHp: number,
 *   enemySpeed: number,
 *   spawnInterval: number
 * }>>}
 */
export const WAVES = Object.freeze(
  Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;  // 0 at wave 1, 1 at wave 10
    return Object.freeze({
      enemyCount:    Math.round(lerp(5,   20,  t)),  // 5 → 20
      enemyHp:       Math.round(lerp(30,  150, t)),  // 30 → 150
      enemySpeed:    Math.round(lerp(80,  220, t)),  // 80 → 220 px/s
      spawnInterval: +lerp(2.0, 0.5, t).toFixed(3), // 2.0 → 0.5 s
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// WaveManager
// ─────────────────────────────────────────────────────────────────────────────

export class WaveManager {
  constructor() {
    /** @public true after all waves are fully spawned and cleared. */
    this.complete = false;

    /** @private enemies spawned in the current wave. */
    this._spawned = 0;

    /**
     * @private seconds until next spawn.
     * Starts at 0 so the first enemy of each wave spawns on the first tick.
     */
    this._spawnTimer = 0;
  }

  /**
   * Reset all internal state so a replay starts cleanly from Wave 1.
   * Call from game.js startGame() before Object.assign(state, fresh).
   */
  reset() {
    this.complete    = false;
    this._spawned    = 0;
    this._spawnTimer = 0;
  }

  /**
   * Per-frame update — spawn enemies and advance waves.
   *
   * Mutates:
   *   state.enemies  — enemies pushed here (removed by game.js splice)
   *   state.wave     — incremented when a wave clears
   *
   * Sets this.complete = true after Wave 10 is fully cleared.
   *
   * @param {number} dt    — delta time in seconds
   * @param {object} state — canonical game state
   */
  update(dt, state) {
    if (this.complete) return;

    // ── Initialise Wave 1 on the first call ──────────────────────────────────
    if (state.wave === 0) {
      state.wave       = 1;
      this._spawned    = 0;
      this._spawnTimer = 0;  // spawn first enemy this tick
    }

    const waveIdx = state.wave - 1;
    if (waveIdx < 0 || waveIdx >= WAVES.length) return;

    const cfg = WAVES[waveIdx];
    const W   = state.canvas.width;
    const H   = state.canvas.height;

    // ── Spawn phase ──────────────────────────────────────────────────────────
    if (this._spawned < cfg.enemyCount) {
      this._spawnTimer -= dt;

      if (this._spawnTimer <= 0) {
        const e = new Enemy(cfg);
        // Initialise x/y at spawn point (dt=0 → pathT stays 0)
        e.update(0, W, H);
        state.enemies.push(e);

        this._spawned++;
        // += avoids drift: if a frame ran long, we don't skip the next spawn
        this._spawnTimer += cfg.spawnInterval;
      }
    }

    // ── Wave-clear check ─────────────────────────────────────────────────────
    // All enemies for this wave must be spawned AND all must have left
    // state.enemies (killed or breached) before we advance.
    if (this._spawned >= cfg.enemyCount && state.enemies.length === 0) {
      if (state.wave < WAVES.length) {
        // Advance to next wave — first enemy spawns on the very next tick
        state.wave++;
        this._spawned    = 0;
        this._spawnTimer = 0;
      } else {
        // All 10 waves cleared
        this.complete = true;
      }
    }
  }
}
