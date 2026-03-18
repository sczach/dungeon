/**
 * @file src/systems/cueSystem.js
 * Rhythm cue system — timed note prompts that reward musical precision.
 *
 * HOW IT WORKS
 * ────────────
 *   The system generates a "cue" — a specific note to play — at regular
 *   beat-aligned intervals.  The player has a 2-beat window to press the
 *   matching key.
 *
 *   On every note press (regardless of summon/attack mode) the system:
 *     • CUE HIT  — note matches the active cue within its window → +10 resources
 *     • FREE PLAY — no active cue (or cue already resolved) → +3 resources
 *     • WRONG    — active cue exists but wrong note → no resource reward, no penalty
 *
 *   Missed cues expire silently (no punishment).
 *
 * TIMING
 * ──────
 *   Default tempo: 120 BPM (configurable via state.currentLevel.bpm)
 *   Cue interval: 4 beats  (2 000 ms at 120 BPM)
 *   Hit window:   2 beats  (1 000 ms at 120 BPM)
 *
 * STATE SHAPE
 * ───────────
 *   state.currentCue — {note, startTime, deadline, status} | null
 *     note      : string   — e.g. 'D3'
 *     startTime : number   — performance.now() when cue was created
 *     deadline  : number   — performance.now() when window closes
 *     status    : 'active' | 'hit' | 'missed'
 */

/** White keys available for cue generation (C3–B3). */
const CUE_NOTE_POOL = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];

/** QWERTY label for each note (for display in the cue card). */
const NOTE_TO_KEY = {
  'C3': 'H', 'D3': 'J', 'E3': 'K', 'F3': 'L',
  'G3': ';', 'A3': "'", 'B3': '↵',
};

/** Cue repeats every N beats. */
const CUE_INTERVAL_BEATS = 4;
/** Player has N beats to hit the cue (at the current BPM). */
const CUE_WINDOW_BEATS   = 2;
/** How long to show resolved (hit/missed) cue before clearing it (ms). */
const CUE_CLEAR_DELAY_MS = 700;

/**
 * Per-difficulty multiplier applied to the cue hit window.
 * Easy players get 2.5× more time; Hard players get the raw 2-beat window.
 */
const CUE_WINDOW_DIFFICULTY = Object.freeze({ easy: 2.5, medium: 1.5, hard: 1.0 });

/** Resource award on a successful cue hit. */
const CUE_HIT_REWARD     = 10;
/** Score award on a successful cue hit (ensures non-zero victory score). */
const CUE_HIT_SCORE      = 10;
/** Resource award for any note press when no active cue exists. */
const FREE_PLAY_REWARD   = 3;
/** Resource cap (same as game.js). */
const RESOURCE_CAP       = 999;

export class CueSystem {
  constructor() {
    /** performance.now() when the next cue should be generated. */
    this._nextCueTime = 0;
    /** Cached beat duration in ms (derived from BPM each update). */
    this._beatMs      = 500;  // 120 BPM default
  }

  /**
   * Initialise cue state for a new game round.
   * @param {object} state
   */
  reset(state) {
    state.currentCue   = null;
    const bpm          = state.currentLevel?.bpm ?? 120;
    this._beatMs       = 60000 / bpm;
    // First cue after a short grace period (4 beats)
    this._nextCueTime  = performance.now() + this._beatMs * CUE_INTERVAL_BEATS;
  }

  /**
   * Per-frame update — expire active cues, clear resolved cues, generate next cue.
   * @param {number} _dt  — delta time in seconds (unused; uses performance.now internally)
   * @param {object} state
   */
  update(_dt, state) {
    const bpm      = state.currentLevel?.bpm ?? 120;
    this._beatMs   = 60000 / bpm;
    const now      = performance.now();
    const cue      = state.currentCue;

    if (cue) {
      // Expire active cue that wasn't hit in time
      if (cue.status === 'active' && now > cue.deadline) {
        cue.status = 'missed';
        // FIX C: record the miss so noteAccuracy reflects real performance
        if (state.tablature) {
          state.tablature.totalMisses = (state.tablature.totalMisses || 0) + 1;
        }
        console.log(`[cue] missed: ${cue.note}`);
      }
      // Clear resolved cues after showing briefly
      if (cue.status !== 'active' && now > cue.deadline + CUE_CLEAR_DELAY_MS) {
        state.currentCue = null;
      }
    }

    // Generate the next cue when interval has elapsed and no active cue is showing
    if (!state.currentCue && now >= this._nextCueTime) {
      // FIX A: scale hit window by difficulty — Easy players get far more time
      const diffMult = CUE_WINDOW_DIFFICULTY[state.difficulty] ?? 1.0;
      const windowMs = this._beatMs * CUE_WINDOW_BEATS * diffMult;
      // Task 3: use per-level note pool if defined, otherwise fall back to full pool
      const pool = state.currentLevel?.cueNotePool ?? CUE_NOTE_POOL;
      const note = pool[Math.floor(Math.random() * pool.length)];
      state.currentCue = {
        note,
        startTime: now,
        deadline:  now + windowMs,
        status:    'active',
      };
      this._nextCueTime = now + this._beatMs * CUE_INTERVAL_BEATS;
      console.log(`[cue] new: ${note} (${NOTE_TO_KEY[note] ?? note}) window=${windowMs.toFixed(0)}ms diff=${state.difficulty}`);
    }
  }

  /**
   * Called on every note press (regardless of summon/attack mode).
   * Awards resources for cue hits or free-play presses.
   * @param {string} note
   * @param {object} state
   */
  onNote(note, state) {
    const cue = state.currentCue;
    const now = performance.now();

    if (cue && cue.status === 'active' && now <= cue.deadline) {
      if (note === cue.note) {
        // ── Cue hit ──────────────────────────────────────────────────────
        cue.status       = 'hit';
        state.resources  = Math.min(RESOURCE_CAP, (state.resources || 0) + CUE_HIT_REWARD);
        // FIX B: award score so victory screen shows a non-zero value
        state.score      = Math.min(99999, (state.score || 0) + CUE_HIT_SCORE);
        // Schedule next cue sooner (reward flows better after a hit)
        this._nextCueTime = now + this._beatMs * CUE_INTERVAL_BEATS * 0.75;
        console.log(`[cue] HIT ${note} → +${CUE_HIT_REWARD} resources +${CUE_HIT_SCORE} score`);
        return;
      }
      // Active cue exists but wrong note — no reward, no penalty
      return;
    }

    // ── Free play — no blocking active cue ───────────────────────────────
    state.resources = Math.min(RESOURCE_CAP, (state.resources || 0) + FREE_PLAY_REWARD);
  }
}
