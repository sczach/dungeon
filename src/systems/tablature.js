/**
 * @file src/systems/tablature.js
 * Fixed 3-note sequence summon bar — the primary unit-summon mechanic.
 *
 * HOW IT WORKS
 * ────────────
 *   A horizontal strip shows a fixed 3-note sequence.
 *   tab.activeIndex (0/1/2) tracks which note the player must press next.
 *   Correct note → pill flashes green, activeIndex advances.
 *   Wrong note   → active pill flashes red briefly, then reverts to pending.
 *                  Sequence does NOT reset; activeIndex does NOT change.
 *   All 3 correct → pendingSpawn = 1, cooldown starts, new sequence queued.
 *
 * SPAWNING (costs resources — see game.js SUMMON_COST table)
 * ──────────────────────────────────────────────────────────
 *   Each completed 3-note sequence → state.tablature.pendingSpawn = 1 (tier 1).
 *   game.js checks resources; if sufficient deducts cost and spawns the unit.
 *   If insufficient → tab.blocked = true → red-flash overlay for 600 ms.
 *
 * ANTI-MASHING
 * ────────────
 *   Summon cooldown: 2000 ms after any successful sequence completion.
 *   During cooldown the bar is dimmed; pendingSpawn is not set.
 *   Screen unit cap: max 8 player units — same rule.
 *
 * UPDATE MODEL
 * ────────────
 *   Slot state transitions driven by wall-clock timestamps — no setTimeouts.
 *   onNote() is called event-driven from keyboard input.
 */

/** White keys available for sequence generation (right-hand layout, C3–B3). */
const WHITE_NOTES = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];
/** Matching display key labels (uppercase, mirrors KEY_TO_NOTE in keyboard.js). */
const WHITE_KEYS  = ['H',  'J',  'K',  'L',  ';',  "'",  '↵'];

/** Combo milestone values that grant a resource bonus. */
const COMBO_MILESTONES = new Set([5, 10, 20]);

/**
 * Determine which unit type to summon based on the first note's pitch.
 * Low notes (C3/D3) → Mage; Mid (E3/F3/G3) → Knight; High (A3/B3) → Archer.
 * @param {string} note
 * @returns {'archer'|'knight'|'mage'}
 */
function noteToUnitType(note) {
  if (note === 'C3' || note === 'D3') return 'mage';
  if (note === 'E3' || note === 'F3' || note === 'G3') return 'knight';
  return 'archer';
}

/** How long a correct (green) flash stays before the next note becomes active. */
const HIT_FLASH_MS      = 250;
/** How long a wrong (red) flash stays before reverting to pending. */
const MISS_FLASH_MS     = 350;
/** Delay after all 3 notes hit before generating the next sequence. */
const SEQUENCE_DONE_MS  = 600;
/** Cooldown between successful spawns (ms). Anti-mashing mechanic. */
const SUMMON_COOLDOWN_MS = 500;
/** Maximum simultaneous player units. Spawn blocked (but combo continues) at cap. */
const MAX_PLAYER_UNITS  = 8;
/** How long the "not enough resources" red-flash stays visible (ms). */
const BLOCKED_FLASH_MS  = 600;
/** Auto-refresh if player ignores the current sequence for this long (ms). */
const PROMPT_REFRESH_MS = 15000;

export class TablatureSystem {
  /**
   * Initialise / reinitialise tablature state.
   * Must be called once after state.tablature has been created.
   * @param {object} state
   */
  reset(state) {
    const tab             = state.tablature;
    tab.queue             = [];
    tab.combo             = 0;
    tab.activeIndex       = 0;
    tab.pendingSpawn      = null;
    tab.summonCooldownEnd = 0;
    tab.nextRefreshTime   = 0;
    tab.blocked           = false;
    tab.blockedTime       = 0;
    tab.sequenceDoneTime  = 0;  // performance.now() when all 3 were hit; 0 = not done
    tab.unitType          = 'archer';  // set by _fillQueue from first note of sequence
    // Musical performance counters — reset each run, read at VICTORY
    tab.totalHits         = 0;
    tab.totalMisses       = 0;
    this._fillQueue(tab);
  }

  /**
   * Per-frame update — advance slot transitions by wall-clock time.
   * @param {number} _dt  — delta time in seconds (unused; transitions use performance.now)
   * @param {object} state
   */
  update(_dt, state) {
    const tab = state.tablature;
    const now = performance.now();

    if (!tab.queue.length) { this._fillQueue(tab); return; }

    // Revert any 'miss' slots back to 'pending' after flash duration
    for (let i = 0; i < tab.queue.length; i++) {
      const slot = tab.queue[i];
      if (slot.status === 'miss' && (now - slot.statusTime) >= MISS_FLASH_MS) {
        slot.status = 'pending';
      }
    }

    // After sequence-done delay, generate a fresh sequence
    if (tab.sequenceDoneTime > 0 && (now - tab.sequenceDoneTime) >= SEQUENCE_DONE_MS) {
      tab.queue            = [];
      tab.activeIndex      = 0;
      tab.sequenceDoneTime = 0;
      this._fillQueue(tab);
    }

    // Auto-refresh if player ignores the sequence for too long
    if (tab.nextRefreshTime > 0 && now >= tab.nextRefreshTime && tab.sequenceDoneTime === 0) {
      tab.queue            = [];
      tab.activeIndex      = 0;
      tab.combo            = 0;
      this._fillQueue(tab);
      console.log('[summon] prompt auto-refreshed (15s timer)');
    }

    // Clear resource-blocked red flash after BLOCKED_FLASH_MS
    if (tab.blocked && (now - tab.blockedTime) >= BLOCKED_FLASH_MS) {
      tab.blocked = false;
    }
  }

  /**
   * Called by keyboard input on each note press in SUMMON mode.
   * Advances activeIndex on correct note; flashes red on wrong note (no reset).
   *
   * @param {string} note  — pressed note name e.g. "C3"
   * @param {object} state
   */
  onNote(note, state) {
    const tab = state.tablature;
    if (!tab.queue.length) return;
    if (tab.sequenceDoneTime > 0) return;  // waiting for new sequence generation

    const now = performance.now();
    const idx = tab.activeIndex;
    if (idx >= tab.queue.length) return;

    const slot = tab.queue[idx];
    if (slot.status === 'miss') return;  // still showing red flash — ignore input

    if (note === slot.note) {
      // Correct note — advance
      slot.status     = 'hit';
      slot.statusTime = now;
      tab.activeIndex++;
      tab.totalHits = (tab.totalHits || 0) + 1;

      // Update global combo
      state.combo = (state.combo || 0) + 1;
      state.comboLastInputTime = now;
      if (COMBO_MILESTONES.has(state.combo)) {
        state.resources    = Math.min(999, (state.resources || 0) + 25);
        state.comboBonusTime = now;
        console.log(`[combo] milestone ${state.combo} → +25 resources`);
      }

      if (tab.activeIndex >= tab.queue.length) {
        // All 3 notes completed — try to trigger a summon
        tab.combo++;
        const cooldownActive = now < (tab.summonCooldownEnd || 0);

        let playerCount = 0;
        const units = state.units;
        for (let i = 0; i < units.length; i++) {
          if (units[i].team === 'player') playerCount++;
        }
        const atCap = playerCount >= MAX_PLAYER_UNITS;

        if (!cooldownActive && !atCap) {
          tab.pendingSpawn      = 1;  // always tier 1 per 3-note sequence
          tab.summonCooldownEnd = now + SUMMON_COOLDOWN_MS;
        }

        tab.sequenceDoneTime = now;
        tab.nextRefreshTime  = 0;  // will be reset when new sequence fills
        console.log(`[summon] sequence complete combo=${tab.combo} pendingSpawn=${tab.pendingSpawn}`);
      }
    } else {
      // Wrong note — flash the active pill red; DO NOT reset sequence
      slot.status     = 'miss';
      slot.statusTime = now;
      tab.totalMisses = (tab.totalMisses || 0) + 1;
      // Miss resets the global combo
      state.combo = 0;
      state.comboLastInputTime = now;
    }
  }

  /**
   * Discard the current prompt and generate a fresh sequence immediately.
   * Called on mode toggle (Space bar) to give the player a clean slate.
   * @param {object} state
   */
  refresh(state) {
    const tab            = state.tablature;
    tab.queue            = [];
    tab.activeIndex      = 0;
    tab.blocked          = false;
    tab.sequenceDoneTime = 0;
    tab.combo            = 0;
    this._fillQueue(tab);
    console.log('[summon] prompt refreshed (mode toggle)');
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Generate exactly 3 random note slots and set the auto-refresh timer.
   * @param {object} tab — state.tablature
   */
  _fillQueue(tab) {
    while (tab.queue.length < 3) {
      const i = Math.floor(Math.random() * WHITE_NOTES.length);
      tab.queue.push({
        note:       WHITE_NOTES[i],
        key:        WHITE_KEYS[i],
        status:     'pending',   // 'pending' | 'hit' | 'miss'
        statusTime: 0,
      });
    }
    // Unit type is determined by the first note of each new sequence
    tab.unitType        = noteToUnitType(tab.queue[0].note);
    tab.nextRefreshTime = performance.now() + PROMPT_REFRESH_MS;
    console.log('[summon prompt] new: ' + tab.queue.map(s => s.note).join(' ') + ' → ' + tab.unitType);
  }
}
