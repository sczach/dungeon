/**
 * @file src/systems/staffQueue.js
 * Unified note queue — replaces per-enemy attack cue pills and the summon tablature bar
 * with a single scrolling musical staff at the top of the screen.
 *
 * Both attack and summon notes appear on the same staff. The player plays notes in
 * order. What each note does depends on its purpose:
 *   - 'attack' notes: completing a group fires a lightning bolt at the targeted enemy
 *   - 'summon' notes: completing a group spawns a player unit
 *
 * The staff queue does NOT mutate game state directly — it returns effect descriptors
 * that game.js applies (kills, spawns, damage). This keeps state ownership in game.js.
 */

// ─── Note pool (white keys, C3 octave) ──────────────────────────────────────

const NOTE_POOL = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];

// ─── Constants ──────────────────────────────────────────────────────────────

/** Sequence lengths by enemy tier for attack groups. */
const ATTACK_SEQ_LENGTHS = [0, 2, 3, 5];  // index 0 unused; T1=2, T2=3, T3=5

/** Notes required to summon one unit, by difficulty. */
const SUMMON_COSTS = { easy: 2, medium: 3, hard: 5 };

/** Charge increment per consecutive correct note. ~7 hits = level 1. */
const CHARGE_PER_HIT = 0.15;

/** Max charge level. */
const MAX_CHARGE = 3.0;

/** How long a 'hit' status lingers for visual feedback (ms). */
const HIT_LINGER_MS = 200;

/** How long a 'miss' status lingers for visual feedback (ms). */
const MISS_LINGER_MS = 300;

/** Maximum notes visible on staff at once. */
const MAX_VISIBLE_NOTES = 14;

/** How many summon groups to pre-generate. */
const SUMMON_LOOKAHEAD = 2;

/** How many attack groups can be queued per enemy. */
const ATTACK_GROUPS_PER_ENEMY = 1;

// ─── Group ID counter ───────────────────────────────────────────────────────

let _nextGroupId = 1;

// ─── Helper: generate a note sequence ───────────────────────────────────────

/**
 * Generate a random note sequence of the given length using stepwise motion.
 * Adjacent notes are 1-3 steps apart (diatonic movement, not random jumps).
 * @param {number} length
 * @returns {string[]}
 */
function generateSequence(length) {
  const seq = [];
  let idx = Math.floor(Math.random() * NOTE_POOL.length);
  for (let i = 0; i < length; i++) {
    seq.push(NOTE_POOL[idx]);
    // Move 1-3 steps in either direction, clamped to pool bounds
    const step = (Math.floor(Math.random() * 3) + 1) * (Math.random() < 0.5 ? -1 : 1);
    idx = Math.max(0, Math.min(NOTE_POOL.length - 1, idx + step));
  }
  return seq;
}

// ─── StaffQueueSystem ───────────────────────────────────────────────────────

export class StaffQueueSystem {
  constructor() {
    this._groupEnemyMap = new Map();  // groupId → unitId (for attack groups)
  }

  // ── State factory ─────────────────────────────────────────────────────────

  /**
   * Create the initial staffQueue state object.
   * @returns {object}
   */
  createState() {
    return {
      notes: [],            // [{note, purpose, groupId, status, statusTime}]
      combo: 0,             // consecutive correct notes
      chargeLevel: 0,       // 0.0 – 3.0
      totalHits: 0,
      totalMisses: 0,
      _pendingEffects: [],  // effects from keyboard input, drained by game.js each frame
    };
  }

  /**
   * Reset for a new game. Call from game.js startGame().
   * @param {object} state
   */
  reset(state) {
    state.staffQueue = this.createState();
    this._groupEnemyMap.clear();
    _nextGroupId = 1;
  }

  // ── Queue management ──────────────────────────────────────────────────────

  /**
   * Enqueue attack notes for a newly spawned enemy unit.
   * Called from game.js spawnEnemyUnit() instead of attackSequenceSystem.assignSequence().
   *
   * @param {import('../entities/unit.js').Unit} unit
   * @param {object} state
   */
  enqueueAttack(unit, state) {
    const sq = state.staffQueue;
    const len = ATTACK_SEQ_LENGTHS[unit.tier] ?? 2;
    const seq = generateSequence(len);
    const gid = _nextGroupId++;

    // Store the mapping so we know which enemy to hit when the group completes
    this._groupEnemyMap.set(gid, unit);

    // Also store on the unit for renderer connector lines
    unit._staffGroupId = gid;

    for (let i = 0; i < seq.length; i++) {
      sq.notes.push({
        note: seq[i],
        purpose: 'attack',
        groupId: gid,
        status: i === 0 && sq.notes.length === 0 ? 'active' : 'pending',
        statusTime: 0,
      });
    }

    // Activate the first pending note if nothing is active
    this._ensureActiveNote(sq);
  }

  /**
   * Enqueue summon notes based on current difficulty.
   * Called when the player is in summon mode and needs more notes on the staff.
   *
   * @param {object} state
   */
  enqueueSummon(state) {
    const sq = state.staffQueue;
    const cost = SUMMON_COSTS[state.difficulty] ?? 3;
    const gid = _nextGroupId++;
    const seq = generateSequence(cost);

    for (let i = 0; i < seq.length; i++) {
      sq.notes.push({
        note: seq[i],
        purpose: 'summon',
        groupId: gid,
        status: 'pending',
        statusTime: 0,
      });
    }

    this._ensureActiveNote(sq);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * Called every frame from game.js update loop.
   * Handles visual state transitions and queue housekeeping.
   *
   * @param {number} dt — delta time in seconds
   * @param {object} state
   * @returns {Array<{type: string, data: object}>} effects to apply
   */
  update(dt, state) {
    const sq = state.staffQueue;
    const now = performance.now();
    const effects = [];

    // Clean up completed/expired notes from the front of the queue
    while (sq.notes.length > 0) {
      const front = sq.notes[0];
      if (front.status === 'hit' && now - front.statusTime > HIT_LINGER_MS) {
        sq.notes.shift();
      } else if (front.status === 'miss' && now - front.statusTime > MISS_LINGER_MS) {
        // Miss lingers then reverts to active (player tries again)
        front.status = 'active';
        front.statusTime = now;
        break;
      } else {
        break;
      }
    }

    // Remove attack groups for dead enemies
    for (let i = sq.notes.length - 1; i >= 0; i--) {
      const n = sq.notes[i];
      if (n.purpose === 'attack') {
        const unit = this._groupEnemyMap.get(n.groupId);
        if (unit && (!unit.alive || unit.hp <= 0)) {
          // Remove all notes in this group
          const gid = n.groupId;
          for (let j = sq.notes.length - 1; j >= 0; j--) {
            if (sq.notes[j].groupId === gid) sq.notes.splice(j, 1);
          }
          this._groupEnemyMap.delete(gid);
          // Don't decrement i — we're going backwards and already removed
        }
      }
    }

    // Ensure summon mode has enough notes queued
    if (state.inputMode === 'summon') {
      const summonNotes = sq.notes.filter(n => n.purpose === 'summon').length;
      if (summonNotes < SUMMON_COSTS[state.difficulty] * SUMMON_LOOKAHEAD) {
        this.enqueueSummon(state);
      }
    }

    // Ensure there's always an active note
    this._ensureActiveNote(sq);

    // Cap visible notes
    if (sq.notes.length > MAX_VISIBLE_NOTES * 2) {
      // Trim excess pending notes from the end (keep active + near-active)
      sq.notes.length = MAX_VISIBLE_NOTES * 2;
    }

    return effects;
  }

  // ── Note input ────────────────────────────────────────────────────────────

  /**
   * Handle a note press from the player.
   * Returns an array of effect descriptors for game.js to apply.
   *
   * @param {string} note — e.g. 'C3'
   * @param {object} state
   * @returns {Array<{type: string, data: object}>}
   */
  onNote(note, state) {
    const sq = state.staffQueue;
    const now = performance.now();
    const effects = [];

    // Find the active note
    const activeIdx = sq.notes.findIndex(n => n.status === 'active');
    if (activeIdx < 0) return effects;

    const active = sq.notes[activeIdx];

    if (active.note === note) {
      // ── HIT ─────────────────────────────────────────────────────────────
      active.status = 'hit';
      active.statusTime = now;
      sq.totalHits++;
      sq.combo++;

      // Charge builds from consecutive correct notes
      sq.chargeLevel = Math.min(MAX_CHARGE, sq.chargeLevel + CHARGE_PER_HIT);

      // Check if this completes a group
      const gid = active.groupId;
      const groupNotes = sq.notes.filter(n => n.groupId === gid);
      const allHit = groupNotes.every(n => n.status === 'hit');

      if (allHit) {
        // Group complete — determine effect
        if (active.purpose === 'attack') {
          const targetUnit = this._groupEnemyMap.get(gid);
          effects.push({
            type: 'kill',
            data: {
              targetUnit,
              groupId: gid,
              tier: targetUnit?.tier ?? 1,
            },
          });
          this._groupEnemyMap.delete(gid);
        } else if (active.purpose === 'summon') {
          // First note of the group determines unit type
          const firstNote = groupNotes[0].note;
          effects.push({
            type: 'summon',
            data: { firstNote, groupId: gid },
          });
        }
      } else {
        // Activate the next note in this group (or next group)
        this._activateNext(sq, activeIdx);
      }
    } else {
      // ── MISS ────────────────────────────────────────────────────────────
      active.status = 'miss';
      active.statusTime = now;
      sq.totalMisses++;
      sq.combo = 0;
      sq.chargeLevel = 0;

      // Direct attack: fire at nearest enemy as fallback
      effects.push({
        type: 'directAttack',
        data: { note, misses: sq.totalMisses },
      });
    }

    return effects;
  }

  // ── Charge ────────────────────────────────────────────────────────────────

  /**
   * Check if charge is available and return the current level.
   * @param {object} state
   * @returns {0|1|2|3}
   */
  getChargeLevel(state) {
    const cl = state.staffQueue.chargeLevel;
    if (cl >= 3.0) return 3;
    if (cl >= 2.0) return 2;
    if (cl >= 1.0) return 1;
    return 0;
  }

  /**
   * Consume charge and return the level that was consumed.
   * @param {object} state
   * @returns {0|1|2|3}
   */
  consumeCharge(state) {
    const level = this.getChargeLevel(state);
    if (level > 0) {
      state.staffQueue.chargeLevel = 0;
    }
    return level;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Ensure exactly one note has status 'active'. If none, activate the first
   * 'pending' note.
   * @param {object} sq — staffQueue state
   */
  _ensureActiveNote(sq) {
    const hasActive = sq.notes.some(n => n.status === 'active');
    if (!hasActive) {
      const first = sq.notes.find(n => n.status === 'pending');
      if (first) {
        first.status = 'active';
        first.statusTime = performance.now();
      }
    }
  }

  /**
   * After a hit, activate the next pending note.
   * @param {object} sq
   * @param {number} hitIdx — index of the note that was just hit
   */
  _activateNext(sq, hitIdx) {
    // Look for the next pending note after the hit
    for (let i = hitIdx + 1; i < sq.notes.length; i++) {
      if (sq.notes[i].status === 'pending') {
        sq.notes[i].status = 'active';
        sq.notes[i].statusTime = performance.now();
        return;
      }
    }
  }

  /**
   * Get the enemy unit targeted by the currently active attack group, if any.
   * Used by the renderer to draw a connector line.
   * @param {object} state
   * @returns {import('../entities/unit.js').Unit|null}
   */
  getActiveTarget(state) {
    const active = state.staffQueue.notes.find(n => n.status === 'active');
    if (!active || active.purpose !== 'attack') return null;
    return this._groupEnemyMap.get(active.groupId) ?? null;
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

export const staffQueueSystem = new StaffQueueSystem();
