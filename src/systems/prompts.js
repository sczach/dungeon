/**
 * @file src/systems/prompts.js
 * PromptManager — listens for detected chords, spawns defender units,
 * and cycles the on-screen chord prompt.
 *
 * CHORD → UNIT MAPPING
 * ────────────────────
 *   G  → Shield      C  → Archer      D  → Swordsman
 *   Em → Mage        Am → Healer      E  → Lancer
 *
 * PROMPT CYCLE (increasing difficulty order)
 * ──────────────────────────────────────────
 *   Em → Am → E → G → C → D  (repeats)
 *
 * SPAWN CONDITIONS
 * ────────────────
 *   • state.audio.confidence >= 0.6
 *   • Chord is one of the six mapped chords
 *   • At least 500 ms have elapsed since the last spawn of the SAME chord
 *     (per-chord debounce using state.time — monotonic during PLAYING)
 *
 * SPAWN PLACEMENT
 * ───────────────
 *   x = canvas.width  * 0.15
 *   y = canvas.height * 0.2  +  Math.random() * canvas.height * 0.6
 *   (avoids top/bottom 20% of canvas)
 *
 * COMBO
 * ─────
 *   Minor family: Em, Am
 *   Major family: G, C, D, E
 *   Same family as previous spawn → state.combo++
 *   Different family              → state.combo = 0
 *   First chord ever (no previous)→ state.combo = 1
 *
 * NO ALLOCATION in update() hot path — _lastSpawnTime is pre-allocated in
 * the constructor; no objects are created per frame.
 */

import { Unit } from '../entities/unit.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maps each playable chord to the unit type it spawns. */
const CHORD_TO_TYPE = Object.freeze({
  G:  'Shield',
  C:  'Archer',
  D:  'Swordsman',
  Em: 'Mage',
  Am: 'Healer',
  E:  'Lancer',
});

/**
 * Prompt sequence in increasing difficulty order.
 * After each successful spawn the prompt advances to the next chord.
 */
const PROMPT_CYCLE = Object.freeze(['Em', 'Am', 'E', 'G', 'C', 'D']);

/**
 * Minimum seconds between spawns of the same chord.
 * Prevents one sustained chord from flooding the board.
 */
const SPAWN_DEBOUNCE = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (module-private, no allocation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the family string for combo tracking.
 * @param {string} chord
 * @returns {'minor'|'major'}
 */
function chordFamily(chord) {
  return (chord === 'Em' || chord === 'Am') ? 'minor' : 'major';
}

// ─────────────────────────────────────────────────────────────────────────────
// PromptManager
// ─────────────────────────────────────────────────────────────────────────────

export class PromptManager {
  constructor() {
    /** Index into PROMPT_CYCLE for the next chord to display. */
    this._promptIndex = 0;

    /**
     * Per-chord timestamp (state.time) of the most recent spawn.
     * Pre-allocated once; values are overwritten in-place — no object
     * literals created inside update().
     * Initialised to -Infinity so the first detection always passes debounce.
     */
    this._lastSpawnTime = {
      G: -Infinity, C: -Infinity, D: -Infinity,
      Em: -Infinity, Am: -Infinity, E: -Infinity,
    };

    /** Chord family of the most recently spawned chord; null before first spawn. */
    this._lastFamily = null;
  }

  /**
   * Reset all internal state for a clean replay.
   * Call from game.js startGame() alongside waveManager.reset().
   */
  reset() {
    this._promptIndex = 0;
    this._lastFamily  = null;
    // Reset debounce timers without allocating a new object
    for (const chord in this._lastSpawnTime) {
      this._lastSpawnTime[chord] = -Infinity;
    }
  }

  /**
   * Per-frame update. Called by game.js only during PLAYING.
   *
   * Mutates:
   *   state.units        — Unit pushed on successful chord match
   *   state.prompt.chord — advanced to next cycle entry after each spawn
   *   state.prompt.active— set true (prompt is always active during PLAYING)
   *   state.combo        — incremented or reset based on chord family
   *
   * @param {number} dt    — delta time in seconds (unused; kept for consistency)
   * @param {object} state — canonical game state
   */
  update(dt, state) {
    // Ensure prompt is visible and initialised on the first frame
    state.prompt.active = true;
    if (state.prompt.chord === null) {
      state.prompt.chord = PROMPT_CYCLE[this._promptIndex];
    }

    const chord      = state.audio.detectedChord;
    const confidence = state.audio.confidence;

    // Gate: need a recognised chord with sufficient confidence
    if (!chord || confidence < 0.6) return;
    if (!(chord in CHORD_TO_TYPE)) return;

    // Gate: per-chord debounce (500 ms minimum between spawns of the same chord)
    if (state.time - this._lastSpawnTime[chord] < SPAWN_DEBOUNCE) return;

    // ── Spawn unit ───────────────────────────────────────────────────────────
    const type = CHORD_TO_TYPE[chord];
    const W    = state.canvas.width;
    const H    = state.canvas.height;
    const x    = W * 0.15;
    const y    = H * 0.2 + Math.random() * (H * 0.6);

    state.units.push(new Unit(x, y, type));

    // Record debounce timestamp for this chord
    this._lastSpawnTime[chord] = state.time;

    // ── Combo tracking ───────────────────────────────────────────────────────
    const family = chordFamily(chord);
    if (this._lastFamily === null || family === this._lastFamily) {
      state.combo++;        // first ever chord, or same family continues streak
    } else {
      state.combo = 0;      // different family breaks the streak
    }
    this._lastFamily = family;

    // ── Advance prompt cycle ─────────────────────────────────────────────────
    this._promptIndex  = (this._promptIndex + 1) % PROMPT_CYCLE.length;
    state.prompt.chord = PROMPT_CYCLE[this._promptIndex];
  }
}
