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
 * ANTI-MASHING
 * ────────────
 *   Global summon cooldown: 2000 ms after any successful summon.
 *   During cooldown pendingSpawn is NOT set (combo still increments).
 *   Screen unit cap: max 8 player units.  Same rule — combo advances but no spawn.
 *   Both limits are tracked in state.tablature.summonCooldownEnd
 *   (performance.now() timestamp; 0 = no active cooldown).
 *
 * UPDATE MODEL
 * ────────────
 *   Slot state transitions are driven by update() via wall-clock timestamps —
 *   no setTimeouts.  onNote() is called event-driven from keyboard input.
 */

/** White keys available for queue generation (right-hand layout, C3–B3). */
const WHITE_NOTES = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];
/** Matching display key labels (uppercase, mirrors KEY_TO_NOTE in keyboard.js). */
const WHITE_KEYS  = ['H',  'J',  'K',  'L',  ';',  "'",  '↵'];

/** How long a hit slot stays visible (green flash) before advancing. */
const HIT_FLASH_MS  = 200;
/** How long a miss slot stays visible (red flash) before queue resets. */
const MISS_RESET_MS = 300;
/** Cooldown between successful spawns (ms). Anti-mashing mechanic. */
const SUMMON_COOLDOWN_MS = 2000;
/** Maximum simultaneous player units. Spawn blocked (but combo continues) at cap. */
const MAX_PLAYER_UNITS = 8;
/** How long the "not enough resources" red-flash stays visible (ms). */
const BLOCKED_FLASH_MS = 600;
/** How often the 3-note prompt auto-refreshes if player doesn't complete it (ms). */
const PROMPT_REFRESH_MS = 10000;

export class TablatureSystem {
  /**
   * Initialise / reinitialise tablature state.
   * Must be called once after state.tablature has been created.
   * @param {object} state
   */
  reset(state) {
    const tab            = state.tablature;
    tab.queue            = [];
    tab.combo            = 0;
    tab.activeIndex      = 0;   // always 0 — leftmost slot is always active
    tab.pendingSpawn     = null;
    tab.summonCooldownEnd = 0;  // performance.now() when cooldown expires; 0 = none
    tab.nextRefreshTime  = 0;   // performance.now() when 3-note prompt auto-refreshes
    tab.blocked          = false; // true = resource check failed; drives red flash
    tab.blockedTime      = 0;   // performance.now() when blocked was set
    this._fillQueue(tab);
  }

  /**
   * Per-frame update — advance slot transitions by wall-clock time.
   * No allocation in steady state; allocates only on slot transition (≤ once / 200 ms).
   * @param {number} _dt  — delta time in seconds (unused; transitions use performance.now)
   * @param {object} state
   */
  update(_dt, state) {
    const tab = state.tablature;
    const now = performance.now();

    if (!tab.queue.length) { this._fillQueue(tab); return; }

    const slot = tab.queue[0];

    if (slot.status === 'hit' && (now - slot.statusTime) >= HIT_FLASH_MS) {
      tab.queue.shift();          // advance (event-driven alloc — fine)
      this._fillQueue(tab);
    } else if (slot.status === 'miss' && (now - slot.statusTime) >= MISS_RESET_MS) {
      tab.queue = [];             // reset (event-driven alloc — fine)
      this._fillQueue(tab);
    }

    // Auto-refresh 3-note prompt every PROMPT_REFRESH_MS even if not completed
    if (tab.nextRefreshTime > 0 && now >= tab.nextRefreshTime) {
      tab.queue = [];
      tab.combo = 0;
      this._fillQueue(tab);
      console.log('[summon] prompt auto-refreshed (10s timer)');
    }

    // Clear resource-blocked red flash after BLOCKED_FLASH_MS
    if (tab.blocked && (now - tab.blockedTime) >= BLOCKED_FLASH_MS) {
      tab.blocked = false;
    }
  }

  /**
   * Called by keyboard input on each note press.
   * Updates combo, flash status, and (when eligible) pendingSpawn.
   *
   * Spawn is blocked — but combo still advances — when:
   *   • summon cooldown is active (< 2 s since last spawn), OR
   *   • player unit count has reached MAX_PLAYER_UNITS.
   *
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

      // Determine target tier (higher wins at shared multiples, e.g. 35 = 5×7 → tier 3)
      let spawnTier = 0;
      if      (tab.combo % 7 === 0) spawnTier = 3;
      else if (tab.combo % 5 === 0) spawnTier = 2;
      else if (tab.combo % 3 === 0) spawnTier = 1;

      if (spawnTier > 0) {
        // Check anti-mashing constraints before setting pendingSpawn
        const cooldownActive = now < tab.summonCooldownEnd;

        // Count live player units (zero-allocation: indexed loop)
        let playerCount = 0;
        const units = state.units;
        for (let i = 0; i < units.length; i++) {
          if (units[i].team === 'player') playerCount++;
        }
        const atCap = playerCount >= MAX_PLAYER_UNITS;

        if (!cooldownActive && !atCap) {
          tab.pendingSpawn      = spawnTier;
          tab.summonCooldownEnd = now + SUMMON_COOLDOWN_MS;
        }
        // If blocked: combo/score still advanced (pendingSpawn just not set)
      }
    } else {
      slot.status     = 'miss';
      slot.statusTime = now;
      tab.combo       = 0;
    }
  }

  /**
   * Discard the current prompt and generate a fresh 3-note sequence immediately.
   * Called on mode toggle (Space bar) to give the player a clean slate.
   * @param {object} state
   */
  refresh(state) {
    const tab = state.tablature;
    tab.queue  = [];
    tab.combo  = 0;
    tab.blocked = false;
    this._fillQueue(tab);
    console.log('[summon] prompt refreshed (mode toggle)');
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Append random slots until the queue has exactly 3 entries.
   * Sets the auto-refresh timer whenever the queue was empty (fresh prompt).
   */
  _fillQueue(tab) {
    const wasEmpty = tab.queue.length === 0;
    while (tab.queue.length < 3) {
      const i = Math.floor(Math.random() * WHITE_NOTES.length);
      tab.queue.push({
        note:       WHITE_NOTES[i],
        key:        WHITE_KEYS[i],
        status:     'pending',   // 'pending' | 'hit' | 'miss'
        statusTime: 0,
      });
    }
    if (wasEmpty) {
      tab.nextRefreshTime = performance.now() + PROMPT_REFRESH_MS;
      console.log('[summon] new 3-note prompt generated:', tab.queue.map(s => s.note).join('-'));
    }
  }
}
