/**
 * @file src/systems/tablature.js
 * Scrolling note-sequence summon bar — the primary unit-summon mechanic.
 *
 * HOW IT WORKS
 * ────────────
 *   A horizontal strip at the top of the screen shows 6 note slots.
 *   The leftmost slot is always the "active" note the player must press.
 *   Correct note → slot flashes green, advances; wrong note → flashes red,
 *   resets the sequence back to a fresh queue.
 *
 * SPAWNING (free — the sequence IS the resource cost)
 * ─────────────────────────────────────────────────────
 *   Every 3 consecutive correct notes → state.tablature.pendingSpawn = 1 (tier 1)
 *   Every 5                           → pendingSpawn = 2 (tier 2)
 *   Every 7                           → pendingSpawn = 3 (tier 3)
 *   (Higher tier takes priority at shared multiples.)
 *
 * UPDATE MODEL
 * ────────────
 *   Slot state transitions are driven by update() via wall-clock timestamps —
 *   no setTimeouts.  onNote() is called event-driven from keyboard input.
 */

/** White keys available for queue generation (base octave C3–C4). */
const WHITE_NOTES = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];
const WHITE_KEYS  = ['a',  's',  'd',  'f',  'g',  'h',  'j',  'k'];

/** How long a hit slot stays visible (green flash) before advancing. */
const HIT_FLASH_MS  = 200;
/** How long a miss slot stays visible (red flash) before queue resets. */
const MISS_RESET_MS = 300;

export class TablatureSystem {
  /**
   * Initialise / reinitialise tablature state.
   * Must be called once after state.tablature has been created.
   * @param {object} state
   */
  reset(state) {
    const tab         = state.tablature;
    tab.queue         = [];
    tab.combo         = 0;
    tab.activeIndex   = 0;   // always 0 — leftmost slot is always active
    tab.pendingSpawn  = null;
    this._fillQueue(tab);
  }

  /**
   * Per-frame update — advance slot transitions by wall-clock time.
   * No allocation in steady state; allocates only on slot transition (≤ once / 200 ms).
   * @param {number} dt   — delta time in seconds (unused; transitions use performance.now)
   * @param {object} state
   */
  update(dt, state) {   // eslint-disable-line no-unused-vars
    const tab = state.tablature;
    if (!tab.queue.length) { this._fillQueue(tab); return; }

    const slot = tab.queue[0];
    const now  = performance.now();

    if (slot.status === 'hit' && (now - slot.statusTime) >= HIT_FLASH_MS) {
      tab.queue.shift();          // advance (event-driven alloc — fine)
      this._fillQueue(tab);
    } else if (slot.status === 'miss' && (now - slot.statusTime) >= MISS_RESET_MS) {
      tab.queue = [];             // reset (event-driven alloc — fine)
      this._fillQueue(tab);
    }
  }

  /**
   * Called by keyboard input on each note press.
   * Checks the active slot and updates combo / pendingSpawn.
   * @param {string} note  — pressed note name e.g. "C3"
   * @param {object} state
   */
  onNote(note, state) {
    const tab  = state.tablature;
    if (!tab.queue.length) return;

    const slot = tab.queue[0];
    if (slot.status !== 'pending') return;   // already transitioning

    const now = performance.now();

    if (note === slot.note) {
      slot.status     = 'hit';
      slot.statusTime = now;
      tab.combo++;

      // Higher tier takes priority at shared multiples (e.g. 35 = 5×7 → tier 3)
      if      (tab.combo % 7 === 0) tab.pendingSpawn = 3;
      else if (tab.combo % 5 === 0) tab.pendingSpawn = 2;
      else if (tab.combo % 3 === 0) tab.pendingSpawn = 1;
    } else {
      slot.status     = 'miss';
      slot.statusTime = now;
      tab.combo       = 0;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** Append random slots until the queue has exactly 6 entries. */
  _fillQueue(tab) {
    while (tab.queue.length < 6) {
      const i = Math.floor(Math.random() * WHITE_NOTES.length);
      tab.queue.push({
        note:       WHITE_NOTES[i],
        key:        WHITE_KEYS[i],
        status:     'pending',   // 'pending' | 'hit' | 'miss'
        statusTime: 0,
      });
    }
  }
}
